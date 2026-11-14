const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const githubApiCache = new Map();
const thunderstoreCommunity = 'bloons-td-6';

function cachedGithubValue(key) {
  const entry = githubApiCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) { githubApiCache.delete(key); return null; }
  return entry.value;
}

function cacheGithubValue(key, value, ttl = 5 * 60 * 1000) {
  if (githubApiCache.size > 150) {
    for (const [cacheKey, entry] of githubApiCache) if (entry.expiresAt <= Date.now()) githubApiCache.delete(cacheKey);
    while (githubApiCache.size > 120) githubApiCache.delete(githubApiCache.keys().next().value);
  }
  githubApiCache.set(key, { value, expiresAt: Date.now() + ttl });
}

function githubResponseError(response, action, body = '') {
  if ((response.status === 403 || response.status === 429) &&
      (response.status === 429 || response.headers.get('x-ratelimit-remaining') === '0' || /api rate limit exceeded|secondary rate limit/i.test(body))) {
    const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000;
    const wait = Number.isFinite(reset) && reset > Date.now() ? ` Try again in about ${Math.ceil((reset - Date.now()) / 60000)} minutes.` : '';
    return new Error(`GitHub API rate limit reached while ${action}.${wait}`);
  }
  return new Error(`GitHub returned HTTP ${response.status} while ${action}.`);
}

function separateRoots(source, target) {
  const canonical = (value) => {
    const absolute = path.resolve(value);
    if (fs.existsSync(absolute)) return fs.realpathSync(absolute).toLowerCase();
    const parent = path.dirname(absolute);
    return path.join(fs.existsSync(parent) ? fs.realpathSync(parent) : parent, path.basename(absolute)).toLowerCase();
  };
  const a = canonical(source), b = canonical(target);
  if (a === b || a.startsWith(b + path.sep) || b.startsWith(a + path.sep)) {
    throw new Error('Choose a managed copy outside the original game folder.');
  }
}

async function copyManagedGame(source, target, signal, progress = () => {}) {
  separateRoots(source, target);
  if (fs.existsSync(path.join(target, 'BloonsTD6.exe'))) {
    return { target, existing: true, copied: 0 };
  }
  if (fs.existsSync(target) && (await fs.promises.readdir(target)).length) {
    throw new Error('The destination contains files but is not a BTD6 copy. Choose an empty folder.');
  }
  const files = [];
  let total = 0;
  const excluded = new Set(['mods', 'plugins', 'melonloader', 'userdata']);
  async function walk(folder, relative = '') {
    signal?.throwIfAborted();
    for (const entry of await fs.promises.readdir(folder, { withFileTypes: true })) {
      if (!relative && excluded.has(entry.name.toLowerCase())) continue;
      const name = path.join(relative, entry.name);
      if (entry.isDirectory()) await walk(path.join(source, name), name);
      else if (entry.isFile()) {
        const stat = await fs.promises.stat(path.join(source, name));
        files.push({ name, size: stat.size });
        total += stat.size;
      }
    }
  }
  await walk(source);
  if (!files.some((entry) => entry.name.toLowerCase() === 'bloonstd6.exe')) throw new Error('Source is missing BloonsTD6.exe.');
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  const disk = await fs.promises.statfs(path.dirname(target));
  if (disk.bavail * disk.bsize < total + 32 * 1024 * 1024) throw new Error('Not enough disk space for the managed copy.');
  const staging = `${target}.bananaforge-${crypto.randomUUID()}.copying`;
  let completed = 0, lastProgress = 0;
  try {
    await fs.promises.mkdir(staging);
    for (const file of files) {
      signal?.throwIfAborted();
      const destination = path.join(staging, file.name);
      await fs.promises.mkdir(path.dirname(destination), { recursive: true });
      await fs.promises.copyFile(path.join(source, file.name), destination);
      const sourceStat = await fs.promises.stat(path.join(source, file.name));
      await fs.promises.utimes(destination, sourceStat.atime, sourceStat.mtime);
      completed += file.size;
      if (Date.now() - lastProgress > 100 || completed === total) {
        progress({ received: completed, total, file: file.name }); lastProgress = Date.now();
      }
    }
    signal?.throwIfAborted();
    if (fs.existsSync(target)) await fs.promises.rmdir(target);
    await fs.promises.rename(staging, target);
    return { target, existing: false, copied: files.length };
  } finally {
    await fs.promises.rm(staging, { recursive: true, force: true });
  }
}

// Refreshes a managed game copy from the original installation only. Files are
// replaced only when the source is newer; size differences alone are not an
// update signal because the managed copy may contain a newer game build.
async function syncNewerGameFiles(source, target, progress = () => {}) {
  separateRoots(source, target);
  const excluded = new Set(['mods', 'plugins', 'melonloader', 'userdata']);
  let copied = 0;
  let lastProgress = 0;
  async function walk(sourceDir, targetDir, topLevel = false) {
    await fs.promises.mkdir(targetDir, { recursive: true });
    for (const entry of await fs.promises.readdir(sourceDir, { withFileTypes: true })) {
      if (topLevel && entry.isDirectory() && excluded.has(entry.name.toLowerCase())) continue;
      const from = path.join(sourceDir, entry.name);
      const to = path.join(targetDir, entry.name);
      if (entry.isDirectory()) {
        await walk(from, to);
      } else if (entry.isFile()) {
        const sourceStat = await fs.promises.stat(from);
        let targetStat;
        try { targetStat = await fs.promises.stat(to); } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
        if (targetStat && sourceStat.mtimeMs <= targetStat.mtimeMs) continue;
        const staged = `${to}.bananaforge-${crypto.randomUUID()}.new`;
        try {
          await fs.promises.copyFile(from, staged, fs.constants.COPYFILE_EXCL);
          await fs.promises.utimes(staged, sourceStat.atime, sourceStat.mtime);
          await fs.promises.rename(staged, to);
          copied += 1;
          if (Date.now() - lastProgress >= 120) {
            progress({ copied, total: null, file: entry.name });
            lastProgress = Date.now();
          }
        } catch (error) {
          if (['EBUSY', 'EPERM', 'EACCES', 'EEXIST'].includes(error.code)) {
            throw new Error(`Could not update ${entry.name} because the managed game file is in use. Close BloonsTD6 and try again.`);
          }
          throw error;
        } finally {
          await fs.promises.rm(staged, { force: true }).catch(() => {});
        }
      }
    }
  }
  await walk(source, target, true);
  return { copied, skipped: false };
}

// Called only after the Steam appmanifest build ID changes. Steam is the
// authority for the source files; never copy anything from target to source.
// Keep managed-only folders (mods, MelonLoader, and user data) intact and do
// not remove files, since some may belong to the mod loader.
async function syncSteamBuild(source, target, signal, progress = () => {}) {
  separateRoots(source, target);
  const excluded = new Set(['mods', 'plugins', 'melonloader', 'userdata']);
  const changed = [];
  async function walk(fromDir, toDir, topLevel = false) {
    signal?.throwIfAborted();
    await fs.promises.mkdir(toDir, { recursive: true });
    for (const entry of await fs.promises.readdir(fromDir, { withFileTypes: true })) {
      if (topLevel && entry.isDirectory() && excluded.has(entry.name.toLowerCase())) continue;
      const from = path.join(fromDir, entry.name), to = path.join(toDir, entry.name);
      if (entry.isDirectory()) await walk(from, to);
      else if (entry.isFile()) {
        const sourceStat = await fs.promises.stat(from);
        let targetStat;
        try { targetStat = await fs.promises.stat(to); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        if (!targetStat || sourceStat.size !== targetStat.size || Math.abs(sourceStat.mtimeMs - targetStat.mtimeMs) > 1000) {
          changed.push({ from, to, size: sourceStat.size, mtime: sourceStat.mtime });
        }
      }
    }
  }
  await walk(source, target, true);
  let copied = 0;
  let copiedBytes = 0;
  const totalBytes = changed.reduce((total, file) => total + file.size, 0);
  let lastProgress = 0;
  progress({ copied, total: changed.length, copiedBytes, totalBytes });
  for (const file of changed) {
    signal?.throwIfAborted();
    const staged = `${file.to}.bananaforge-${crypto.randomUUID()}.new`;
    try {
      await fs.promises.copyFile(file.from, staged, fs.constants.COPYFILE_EXCL);
      await fs.promises.utimes(staged, file.mtime, file.mtime);
      await fs.promises.rename(staged, file.to);
      copied += 1;
      copiedBytes += file.size;
      if (Date.now() - lastProgress >= 120 || copied === changed.length) {
        progress({ copied, total: changed.length, copiedBytes, totalBytes, file: path.basename(file.to) });
        lastProgress = Date.now();
      }
    } catch (error) {
      if (['EBUSY', 'EPERM', 'EACCES', 'EEXIST'].includes(error.code)) {
        throw new Error(`Could not sync ${path.basename(file.to)} from Steam because the managed game file is in use. Close BloonsTD6 and try again.`);
      }
      throw error;
    } finally { await fs.promises.rm(staged, { force: true }).catch(() => {}); }
  }
  return { copied, changed: changed.length };
}

// Existing copies made by older BananaForge versions inherited the copy time
// instead of the Steam file time. Align their metadata once so future build
// updates can identify changed Steam files without re-copying the entire game.
async function alignManagedGameTimestamps(source, target) {
  separateRoots(source, target);
  const excluded = new Set(['mods', 'plugins', 'melonloader', 'userdata']);
  let aligned = 0;
  async function walk(fromDir, toDir, topLevel = false) {
    for (const entry of await fs.promises.readdir(fromDir, { withFileTypes: true })) {
      if (topLevel && entry.isDirectory() && excluded.has(entry.name.toLowerCase())) continue;
      const from = path.join(fromDir, entry.name), to = path.join(toDir, entry.name);
      if (entry.isDirectory()) {
        try { if ((await fs.promises.stat(to)).isDirectory()) await walk(from, to); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      } else if (entry.isFile()) {
        try {
          const [sourceStat, targetStat] = await Promise.all([fs.promises.stat(from), fs.promises.stat(to)]);
          if (sourceStat.size === targetStat.size && Math.abs(sourceStat.mtimeMs - targetStat.mtimeMs) > 1000) {
            await fs.promises.utimes(to, sourceStat.atime, sourceStat.mtime);
            aligned += 1;
          }
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
    }
  }
  await walk(source, target, true);
  return aligned;
}

async function readLogTail(file, limit = 512 * 1024) {
  const handle = await fs.promises.open(file, 'r');
  try {
    const stat = await handle.stat();
    const start = Math.max(0, stat.size - limit);
    const buffer = Buffer.alloc(Math.min(limit, stat.size));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, start);
    let content = buffer.subarray(0, bytesRead).toString('utf8');
    if (start) content = content.slice(content.indexOf('\n') + 1);
    const lines = content.replace(/\r\n/g, '\n').split('\n');
    return { content: lines.slice(-1500).join('\n'), truncated: start > 0 || lines.length > 1500,
      signature: `${stat.size}:${stat.mtimeMs}`, size: stat.size, updatedAt: stat.mtime.toISOString() };
  } finally { await handle.close(); }
}

const packageSources = {
  melonloader: { repo: 'LavaGang/MelonLoader.Installer', file: 'MelonLoader.Installer.exe', label: 'MelonLoader installer' },
  modhelper: { repo: 'gurrenm3/BTD-Mod-Helper', file: 'Btd6ModHelper.dll', label: 'BTD Mod Helper' }
};

function githubReleaseReference(value) {
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com') return null;
  let parts;
  try { parts = url.pathname.split('/').filter(Boolean).map((part) => decodeURIComponent(part)); }
  catch { return null; }
  if (parts.length !== 6 || parts[2] !== 'releases' || parts[3] !== 'download') return null;
  const [owner, repo, , , tag, asset] = parts;
  if (!/^[\w.-]{1,100}$/.test(owner) || !/^[\w.-]{1,100}$/.test(repo) || !tag || tag === '.' || tag === '..' || !asset || asset === '.' || asset === '..' || path.basename(asset) !== asset || !/\.dll$/i.test(asset)) return null;
  return { owner, repo, tag, asset, repository: `${owner}/${repo}` };
}

function githubModSourceReference(value, expectedAsset) {
  const release = githubReleaseReference(value);
  if (release) return release;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com') return null;
  let parts;
  try { parts = url.pathname.split('/').filter(Boolean).map((part) => decodeURIComponent(part)); }
  catch { return null; }
  let tag = '';
  if ((parts.length === 3 && parts[2] === 'releases') || (parts.length === 4 && parts[2] === 'releases' && parts[3] === 'latest')) parts = parts.slice(0, 2);
  else if (parts.length === 5 && parts[2] === 'releases' && parts[3] === 'tag') {
    tag = parts[4]; parts = parts.slice(0, 2);
  }
  if (parts.length !== 2) return null;
  const [owner, repo] = parts;
  if (!/^[\w.-]{1,100}$/.test(owner) || !/^[\w.-]{1,100}$/.test(repo) || !expectedAsset || path.basename(expectedAsset) !== expectedAsset || !/\.dll$/i.test(expectedAsset)) return null;
  return { owner, repo, tag, asset: expectedAsset, repository: `${owner}/${repo}` };
}

function githubBranchModSourceReference(value, expectedAsset) {
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || !['github.com', 'www.github.com'].includes(url.hostname.toLowerCase())) return null;
  let parts;
  try { parts = url.pathname.split('/').filter(Boolean).map((part) => decodeURIComponent(part)); }
  catch { return null; }
  if (parts.length < 4 || !/^[\w.-]{1,100}$/.test(parts[0]) || !/^[\w.-]{1,100}$/.test(parts[1]) || !['tree', 'blob'].includes(parts[2])) return null;
  const [owner, repo, mode, branch, ...pathParts] = parts;
  if (!/^[\w.-]{1,100}$/.test(branch) || pathParts.some((part) => !part || part === '.' || part === '..' || part.includes('\\') || /[\u0000-\u001f]/.test(part))) return null;
  const repoPath = pathParts.join('/');
  if (mode === 'blob' && (!repoPath || path.posix.basename(repoPath).toLowerCase() !== String(expectedAsset || '').toLowerCase())) return null;
  if (repoPath && /\.dll$/i.test(path.posix.basename(repoPath)) && path.posix.basename(repoPath).toLowerCase() !== String(expectedAsset || '').toLowerCase()) return null;
  return { repository: `${owner}/${repo}`, branch, repoPath, asset: expectedAsset };
}

async function resolveGitHubBranchModAsset(reference, expectedName, signal) {
  if (!reference || !/^[\w.-]{1,100}\/[\w.-]{1,100}$/.test(reference.repository) || !/^[\w.-]{1,100}$/.test(reference.branch)) throw new Error('The GitHub branch source is invalid.');
  const requestedPath = String(reference.repoPath || '');
  if (requestedPath.split('/').some((part) => part === '.' || part === '..' || part.includes('\\') || /[\u0000-\u001f]/.test(part))) throw new Error('The GitHub source path is invalid.');
  if (path.basename(expectedName) !== expectedName || !/\.dll$/i.test(expectedName)) throw new Error('The branch source must identify a DLL file.');
  const repoPath = /\.dll$/i.test(path.posix.basename(requestedPath)) ? requestedPath : [requestedPath, expectedName].filter(Boolean).join('/');
  if (path.posix.basename(repoPath).toLowerCase() !== expectedName.toLowerCase()) throw new Error(`The selected branch path must contain ${expectedName}.`);
  const encodedPath = repoPath.split('/').map(encodeURIComponent).join('/');
  const downloadUrl = `https://raw.githubusercontent.com/${reference.repository}/${encodeURIComponent(reference.branch)}/${encodedPath}`;
  return { repository: reference.repository, branch: reference.branch, asset: expectedName, repoPath, downloadUrl,
    url: `https://github.com/${reference.repository}/blob/${encodeURIComponent(reference.branch)}/${encodedPath}` };
}

async function findGitHubBranchModAsset(reference, names, signal) {
  const accepted = [...new Set(names.filter((name) => typeof name === 'string' && path.basename(name) === name && /\.dll$/i.test(name)).map((name) => name.toLowerCase()))];
  if (!reference || !accepted.length) return null;
  const url = `https://api.github.com/repos/${reference.repository}/git/trees/${encodeURIComponent(reference.branch)}?recursive=1`;
  const response = await fetch(url, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'BananaForge/0.3.33' }, signal: AbortSignal.any([signal, AbortSignal.timeout(25000)]) });
  if (!response.ok) throw githubResponseError(response, `searching ${reference.repository}'s branch for a mod DLL`);
  const tree = await response.json();
  const files = (Array.isArray(tree.tree) ? tree.tree : []).filter((entry) => entry.type === 'blob' && accepted.includes(path.posix.basename(entry.path || '').toLowerCase()));
  files.sort((a, b) => {
    const aExact = path.posix.basename(a.path).toLowerCase() === accepted[0] ? 0 : 1;
    const bExact = path.posix.basename(b.path).toLowerCase() === accepted[0] ? 0 : 1;
    return aExact - bExact || a.path.length - b.path.length;
  });
  for (const file of files) {
    const expectedName = path.posix.basename(file.path);
    try { return await resolveGitHubBranchModAsset({ ...reference, repoPath: file.path }, expectedName, signal); }
    catch (error) { if (/rate limit/i.test(error.message || String(error))) throw error; }
  }
  return null;
}

async function verifyGitHubBranchModAsset(asset, signal) {
  const response = await fetch(asset.downloadUrl, {
    headers: { 'User-Agent': 'BananaForge/0.3.36' },
    signal: AbortSignal.any([signal, AbortSignal.timeout(30000)])
  });
  const finalUrl = new URL(response.url);
  if (!response.ok || finalUrl.protocol !== 'https:' || finalUrl.hostname.toLowerCase() !== 'raw.githubusercontent.com' || !response.body) throw new Error(`Could not verify ${asset.asset} from the GitHub branch (HTTP ${response.status}).`);
  const reader = response.body.getReader();
  let prefix = Buffer.alloc(0);
  let size = 0;
  const hash = crypto.createHash('sha256');
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      size += chunk.length;
      if (size > 256 * 1024 * 1024) throw new Error(`The branch file ${asset.repoPath} exceeds the 256 MB limit.`);
      hash.update(chunk);
      if (prefix.length < 2) prefix = Buffer.concat([prefix, chunk.subarray(0, 2 - prefix.length)]);
    }
  } finally { await reader.cancel().catch(() => {}); }
  if (prefix.subarray(0, 2).toString('ascii') !== 'MZ') throw new Error(`The branch file ${asset.repoPath} is not a Windows DLL.`);
  const digest = hash.digest('hex');
  return { ...asset, size, contentSha256: digest, version: `${asset.branch} · ${digest.slice(0, 7)}` };
}

async function findBtdModHelperCatalogAsset(searchTerm, expectedName, signal) {
  const repository = 'Timotheeee/btd6_mods', branch = 'master';
  const catalogUrl = `https://raw.githubusercontent.com/${repository}/${branch}/ModHelperMods.json`;
  const response = await fetch(catalogUrl, { headers: { 'User-Agent': 'BananaForge/0.3.33' }, signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]) });
  if (!response.ok) throw new Error(`BTD Mod Helper's project catalog returned HTTP ${response.status}.`);
  const entries = await response.json();
  if (!Array.isArray(entries)) throw new Error('BTD Mod Helper returned an invalid project catalog.');
  const normalized = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const match = entries.find((entry) => normalized(entry) === normalized(searchTerm));
  if (!match) return null;
  const source = githubBranchModSourceReference(`https://github.com/${repository}/tree/${branch}/${encodeURIComponent(match)}`, expectedName);
  const asset = await resolveGitHubBranchModAsset(source, expectedName, signal);
  const verified = await verifyGitHubBranchModAsset(asset, signal);
  return { repository, title: `${repository} · ${match}`, description: 'Listed in the BTD Mod Helper project catalog. The branch DLL was verified before it was offered.',
    source: 'BTD Mod Helper catalog', sourceType: 'github-branch-file', branch, sourcePath: asset.repoPath, url: asset.url,
    version: verified.version, asset: asset.asset, downloadUrl: asset.downloadUrl, verified: true };
}

async function downloadGitHubBranchModAsset(asset, root, signal, onProgress = () => {}) {
  const response = await fetch(asset.downloadUrl, { signal: AbortSignal.any([signal, AbortSignal.timeout(10 * 60 * 1000)]) });
  const finalUrl = new URL(response.url);
  if (!response.ok || !response.body || finalUrl.protocol !== 'https:' || finalUrl.hostname.toLowerCase() !== 'raw.githubusercontent.com') throw new Error(`The GitHub branch DLL download failed (HTTP ${response.status}).`);
  const destination = path.join(root, crypto.randomUUID(), asset.asset);
  await fs.promises.mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.part`;
  const handle = await fs.promises.open(temporary, 'wx');
  const hash = crypto.createHash('sha256');
  let received = 0, lastUpdate = 0;
  const total = Number(response.headers.get('content-length')) || asset.size || 0;
  try {
    for await (const chunk of response.body) {
      signal.throwIfAborted();
      received += chunk.length;
      if (received > 256 * 1024 * 1024) throw new Error('The GitHub branch DLL exceeds the 256 MB limit.');
      hash.update(chunk);
      let offset = 0;
      while (offset < chunk.length) { const result = await handle.write(chunk, offset, chunk.length - offset); offset += result.bytesWritten; }
      if (Date.now() - lastUpdate > 100) { onProgress({ received, total }); lastUpdate = Date.now(); }
    }
    await handle.close();
    const digest = hash.digest('hex');
    const file = await fs.promises.open(temporary, 'r');
    const magic = Buffer.alloc(2);
    try { await file.read(magic, 0, 2, 0); } finally { await file.close(); }
    if (magic.toString('ascii') !== 'MZ') throw new Error(`The downloaded ${asset.asset} is not a Windows DLL.`);
    signal.throwIfAborted();
    await fs.promises.rename(temporary, destination);
    onProgress({ received, total: received });
    return { path: destination, name: asset.asset, version: `${asset.branch} · ${digest.slice(0, 7)}`, sha256: digest, url: asset.url,
      repository: asset.repository, sourceType: 'github-branch-file', branch: asset.branch, sourcePath: asset.repoPath, upstreamSha256: digest };
  } finally { await handle.close().catch(() => {}); await fs.promises.rm(temporary, { force: true }); }
}

async function latestRelease(repository, signal, { forceRefresh = false } = {}) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('The tracked mod release source is invalid.');
  const cacheKey = `release:${repository.toLowerCase()}`;
  if (forceRefresh) githubApiCache.delete(cacheKey);
  const cached = forceRefresh ? null : cachedGithubValue(cacheKey);
  if (cached) return cached;
  try {
    const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'BananaForge/0.3.14' },
      signal: AbortSignal.any([signal, AbortSignal.timeout(30000)])
    });
    if (!response.ok) {
      const body = await response.text();
      throw githubResponseError(response, `checking ${repository}`, body);
    }
    const release = await response.json();
    cacheGithubValue(cacheKey, release);
    return release;
  } catch (error) {
    if (!/rate limit/i.test(error?.message || String(error))) throw error;
    // Public GitHub release feeds do not consume the REST API quota. Keep a
    // short cache so a profile with many mods does not fetch the same feed
    // repeatedly after the REST limit is exhausted.
    const fallback = await latestReleaseFromFeed(repository, signal);
    cacheGithubValue(cacheKey, fallback, 10 * 60 * 1000);
    return fallback;
  }
}

async function latestReleaseFromFeed(repository, signal) {
  const response = await fetch(`https://github.com/${repository}/releases.atom`, {
    headers: { Accept: 'application/atom+xml, application/xml, text/xml', 'User-Agent': 'BananaForge/0.3.14' },
    signal: AbortSignal.any([signal, AbortSignal.timeout(30000)])
  });
  if (!response.ok) throw new Error(`GitHub API rate limit reached, and the public release feed returned HTTP ${response.status} for ${repository}.`);
  const xml = await response.text();
  // Read an actual releases/tag link rather than the human-readable title;
  // tag names can differ from release names.
  const linkPattern = /<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = linkPattern.exec(xml))) {
    let link;
    try { link = new URL(match[1].replace(/&amp;/g, '&')); } catch { continue; }
    const prefix = `/${repository}/releases/tag/`;
    if (link.protocol !== 'https:' || link.hostname !== 'github.com' || !link.pathname.startsWith(prefix)) continue;
    const encodedTag = link.pathname.slice(prefix.length);
    if (!encodedTag || encodedTag.includes('/')) continue;
    let tag;
    try { tag = decodeURIComponent(encodedTag); } catch { continue; }
    if (!/^[\w.+-]{1,120}$/.test(tag)) continue;
    return { tag_name: tag, assets: [], atomFallback: true };
  }
  throw new Error(`GitHub API rate limit reached, and no latest release could be read from ${repository}'s public release feed.`);
}

async function releaseAsset(repository, release, name, signal) {
  const asset = release.assets?.find((item) => item.name.toLowerCase() === name.toLowerCase());
  if (asset) return asset;
  if (!release.atomFallback || path.basename(name) !== name) return null;
  const url = new URL(`https://github.com/${repository}/releases/download/${encodeURIComponent(release.tag_name)}/${encodeURIComponent(name)}`);
  // Confirm the exact release asset exists before treating a feed result as a
  // valid update source. Range keeps this check cheap even for large DLLs.
  const response = await fetch(url, {
    headers: { Range: 'bytes=0-0', 'User-Agent': 'BananaForge/0.3.14' },
    signal: AbortSignal.any([signal, AbortSignal.timeout(30000)])
  });
  const finalUrl = new URL(response.url);
  const exists = response.ok && finalUrl.protocol === 'https:' &&
    ['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(finalUrl.hostname);
  const rangeTotal = response.headers.get('content-range')?.match(/\/(\d+)$/)?.[1];
  const size = Number(rangeTotal || (response.status === 200 ? response.headers.get('content-length') : 0)) || 0;
  await response.body?.cancel().catch(() => {});
  if (!exists) return null;
  return { name, size, browser_download_url: url.href, digest: null };
}

async function latestReleaseAsset(repository, name, signal) {
  const release = await latestRelease(repository, signal);
  const asset = await releaseAsset(repository, release, name, signal);
  if (!asset) throw new Error(`Latest release ${release.tag_name || ''} from ${repository} has no ${name} asset.`);
  const url = new URL(asset.browser_download_url);
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || !url.pathname.startsWith(`/${repository}/releases/download/`)) throw new Error('The official release returned an unexpected download URL.');
  return { tag: release.tag_name, url: url.href, asset };
}

async function latestReleaseAssetMatching(repository, names, signal) {
  const release = await latestRelease(repository, signal);
  const acceptedNames = new Set(names.filter((name) => typeof name === 'string' && path.basename(name) === name && /\.dll$/i.test(name)).map((name) => name.toLowerCase()));
  let asset = release.assets?.find((item) => acceptedNames.has(item.name.toLowerCase()));
  if (!asset && release.atomFallback) {
    for (const name of names.filter((item) => typeof item === 'string' && acceptedNames.has(item.toLowerCase()))) {
      asset = await releaseAsset(repository, release, name, signal);
      if (asset) break;
    }
  }
  if (!asset) throw new Error(`Latest release ${release.tag_name || ''} from ${repository} has no matching DLL asset (${[...acceptedNames].join(', ')}).`);
  const url = new URL(asset.browser_download_url);
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || !url.pathname.startsWith(`/${repository}/releases/download/`)) throw new Error('The official release returned an unexpected download URL.');
  return { tag: release.tag_name, url: url.href, asset };
}

async function modHelperDllName(repository, branch, signal) {
  const cacheKey = `mod-data:${repository.toLowerCase()}`;
  const cached = cachedGithubValue(cacheKey);
  if (cached !== null) return cached;
  let dllName = '';
  const branches = /^[\w./-]{1,120}$/.test(branch || '') ? [branch] : ['main', 'master'];
  for (const currentBranch of branches) {
    for (const file of ['ModHelperData.cs', 'ModHelperData.json', 'ModHelperData.txt']) {
      try {
        const url = `https://raw.githubusercontent.com/${repository}/${encodeURIComponent(currentBranch)}/${file}`;
        const response = await fetch(url, { headers: { 'User-Agent': 'BananaForge/0.3.14' }, signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) });
        if (!response.ok) continue;
        const text = await response.text();
        if (file.endsWith('.json')) {
          try { const data = JSON.parse(text); dllName = data.DllName || data.dllName || ''; } catch { /* Ignore malformed project metadata. */ }
        } else {
          dllName = text.match(/\bDllName\s*=\s*["']([^"']+\.dll)["']/i)?.[1] || '';
        }
        if (dllName && path.basename(dllName) === dllName && /\.dll$/i.test(dllName)) break;
        dllName = '';
      } catch { /* Repositories without optional ModHelperData keep filename matching. */ }
    }
    if (dllName) break;
  }
  cacheGithubValue(cacheKey, dllName || '', 60 * 60 * 1000);
  return dllName;
}

// BTD Mod Helper's browser catalogs GitHub projects. Search repo names first
// (the DLL stem commonly matches the project name), then broaden the query.
// Every hit must still have a latest release with the exact installed DLL.
async function searchModUpdateSources(name, signal, searchTerm = '') {
  if (path.basename(name) !== name || !/^[\w .()\[\]-]{1,120}\.dll$/i.test(name)) throw new Error('Choose an installed DLL to search for.');
  const stem = name.replace(/\.dll$/i, '').trim();
  const queryTerm = String(searchTerm || stem).trim().slice(0, 120);
  if (!queryTerm || /[\r\n]/.test(queryTerm)) throw new Error('Enter a mod name or repository name to search.');
  const compactTerm = queryTerm.replace(/[^\p{L}\p{N}]/gu, '');
  const timeoutSignal = (ms) => AbortSignal.any([signal, AbortSignal.timeout(ms)]);
  const queries = [...new Set([`${compactTerm} in:name`, `"${queryTerm}" btd6-mod`, `"${queryTerm}"`, `${compactTerm} btd6`])];
  const errors = [];
  const releaseErrors = [];
  const attemptedRepositories = new Set();
  let repositoriesSeen = 0;
  const verifiedByRepo = new Map();
  try {
    const catalogResult = await findBtdModHelperCatalogAsset(queryTerm, name, signal);
    if (catalogResult) return { file: name, results: [catalogResult], searched: ['BTD Mod Helper project catalog', 'GitHub releases and branch sources'], note: '' };
  } catch (error) {
    if (/rate limit/i.test(error.message || String(error))) errors.push(error.message || String(error));
    else if (signal.aborted) throw error;
  }
  for (const query of queries) {
    const githubUrl = new URL('https://api.github.com/search/repositories');
    githubUrl.searchParams.set('q', query);
    githubUrl.searchParams.set('per_page', '8');
    const searchCacheKey = `search:${query.toLowerCase()}`;
    try {
      let items = cachedGithubValue(searchCacheKey);
      if (!items) {
        const response = await fetch(githubUrl, {
          headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'BananaForge/0.3.14' },
          signal: timeoutSignal(20000)
        });
        if (!response.ok) throw githubResponseError(response, 'searching mod repositories');
        const data = await response.json();
        items = data.items || [];
        cacheGithubValue(searchCacheKey, items, 10 * 60 * 1000);
      }
      const candidates = items.filter((item) => item.full_name && !attemptedRepositories.has(item.full_name.toLowerCase()));
      const normalizedQuery = queryTerm.toLowerCase().replace(/[^a-z0-9]/g, '');
      candidates.sort((a, b) => {
        const normalize = (item) => String(item.name || item.full_name.split('/').at(-1)).toLowerCase().replace(/[^a-z0-9]/g, '');
        const aExact = normalize(a) === normalizedQuery ? 0 : 1;
        const bExact = normalize(b) === normalizedQuery ? 0 : 1;
        return aExact - bExact || (b.stargazers_count || 0) - (a.stargazers_count || 0);
      });
      // Verify only the most relevant results to avoid exhausting GitHub's
      // small unauthenticated API quota when a DLL name is common.
      const prioritized = candidates.slice(0, 4);
      repositoriesSeen += prioritized.length;
      for (const item of prioritized) attemptedRepositories.add(item.full_name.toLowerCase());
      const verified = await Promise.all(prioritized.map(async (item) => {
        try {
          const declaredDll = await modHelperDllName(item.full_name, item.default_branch, timeoutSignal(12000));
          try {
            const release = await latestReleaseAssetMatching(item.full_name, [name, declaredDll], timeoutSignal(20000));
            return {
              repository: item.full_name, title: item.full_name, description: item.description || '', source: 'GitHub release', sourceType: 'github-release',
              url: release.url, version: release.tag, asset: release.asset.name, downloadUrl: release.url, verified: true
            };
          } catch (releaseError) {
            if (/rate limit/i.test(releaseError.message || String(releaseError))) throw releaseError;
            const branch = /^[\w.-]{1,100}$/.test(item.default_branch || '') ? item.default_branch : 'master';
            const branchSource = githubBranchModSourceReference(`https://github.com/${item.full_name}/tree/${encodeURIComponent(branch)}`, name);
            const branchAsset = await findGitHubBranchModAsset(branchSource, [name, declaredDll], timeoutSignal(20000));
            if (!branchAsset) throw releaseError;
            const checkedAsset = await verifyGitHubBranchModAsset(branchAsset, timeoutSignal(20000));
            return { repository: item.full_name, title: `${item.full_name} · ${branchAsset.repoPath}`, description: item.description || 'Verified DLL found in the repository branch.',
              source: 'GitHub branch', sourceType: 'github-branch-file', branch: branchAsset.branch, sourcePath: branchAsset.repoPath, url: branchAsset.url,
              version: checkedAsset.version, asset: branchAsset.asset, downloadUrl: branchAsset.downloadUrl, verified: true };
          }
        } catch (error) { releaseErrors.push(`${item.full_name}: ${error.message || error}`); return null; }
      }));
      for (const item of verified.filter(Boolean)) verifiedByRepo.set(item.repository.toLowerCase(), item);
      if (verifiedByRepo.size) break;
      if (releaseErrors.some((message) => /rate limit/i.test(message))) break;
    } catch (error) {
      errors.push(error.message || String(error));
      if (/rate limit/i.test(error.message || String(error))) break;
    }
  }
  const results = [...verifiedByRepo.values()];
  if (!results.length && errors.length && !repositoriesSeen) throw new Error(errors.join(' '));
  const rateLimit = releaseErrors.find((message) => /rate limit/i.test(message));
  const reason = rateLimit
    ? rateLimit
    : repositoriesSeen && releaseErrors.length
      ? `Found ${repositoriesSeen} possible repositories, but none exposed a compatible DLL in a release or branch source. ${releaseErrors.slice(0, 2).join(' ')}`
      : `No matching GitHub repository was found for ${name}. Try the mod’s display name or paste its GitHub URL.`;
  return {
    file: name, results, searched: ['GitHub / BTD Mod Helper sources'],
    note: results.length ? '' : `${reason}${errors.length ? ` ${errors.join(' ')}` : ''}`
  };
}

// Lightweight automatic discovery for installed DLLs that do not already
// have a source. Search only the exact project-name query and verify a real
// latest release DLL before returning a source; never trust repository names
// alone as proof that a project publishes the installed mod.
async function discoverGitHubModSource(name, signal) {
  if (path.basename(name) !== name || !/^[\w .()\[\]-]{1,120}\.dll$/i.test(name)) return null;
  const stem = name.replace(/\.dll$/i, '').trim();
  const compact = stem.replace(/[^\p{L}\p{N}]/gu, '');
  if (!compact) return null;
  const cacheKey = `autodiscover:${compact.toLowerCase()}`;
  const cached = cachedGithubValue(cacheKey);
  if (cached) return cached.notFound ? null : cached;
  const url = new URL('https://api.github.com/search/repositories');
  url.searchParams.set('q', `${compact} in:name`);
  url.searchParams.set('per_page', '6');
  const response = await fetch(url, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'BananaForge/0.3.14' },
    signal: AbortSignal.any([signal, AbortSignal.timeout(20000)])
  });
  if (!response.ok) throw githubResponseError(response, `searching for ${name}`);
  const items = (await response.json()).items || [];
  const normalized = stem.toLowerCase().replace(/[^a-z0-9]/g, '');
  items.sort((a, b) => {
    const score = (item) => String(item.name || '').toLowerCase().replace(/[^a-z0-9]/g, '') === normalized ? 0 : 1;
    return score(a) - score(b) || (b.stargazers_count || 0) - (a.stargazers_count || 0);
  });
  for (const item of items.slice(0, 3)) {
    if (!/^[\w.-]{1,100}\/[\w.-]{1,100}$/.test(item.full_name || '')) continue;
    try {
      const declaredDll = await modHelperDllName(item.full_name, item.default_branch, AbortSignal.any([signal, AbortSignal.timeout(12000)]));
      const verified = await latestReleaseAssetMatching(item.full_name, [name, declaredDll], signal);
      const result = { repository: item.full_name, asset: verified.asset.name, url: verified.url };
      cacheGithubValue(cacheKey, result, 60 * 60 * 1000);
      return result;
    } catch (error) {
      if (/rate limit/i.test(error.message || String(error))) break;
    }
  }
  cacheGithubValue(cacheKey, { notFound: true }, 5 * 60 * 1000);
  return null;
}

async function downloadReleaseAsset(asset, expectedName, root, signal, onProgress, version, repository) {
  if (asset.name.toLowerCase() !== expectedName.toLowerCase()) throw new Error('The release asset did not match the tracked mod.');
  const url = new URL(asset.browser_download_url);
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || !url.pathname.startsWith(`/${repository}/releases/download/`)) throw new Error('The official release returned an unexpected download URL.');
  const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(10 * 60 * 1000)]) });
  if (!response.ok || !response.body) throw new Error(`Download failed with HTTP ${response.status}.`);
  const finalUrl = new URL(response.url);
  if (finalUrl.protocol !== 'https:' || !['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(finalUrl.hostname)) throw new Error('Download redirected outside the official GitHub asset hosts.');
  const destination = path.join(root, crypto.randomUUID(), expectedName);
  await fs.promises.mkdir(path.dirname(destination), { recursive: true });
  const temporary = destination + '.part';
  const handle = await fs.promises.open(temporary, 'wx');
  const hash = crypto.createHash('sha256');
  let received = 0, lastUpdate = 0;
  const total = Number(response.headers.get('content-length')) || asset.size || 0;
  try {
    for await (const chunk of response.body) {
      signal.throwIfAborted();
      received += chunk.length;
      if (received > 256 * 1024 * 1024) throw new Error('Package exceeds the 256 MB download limit.');
      hash.update(chunk);
      let offset = 0;
      while (offset < chunk.length) {
        const result = await handle.write(chunk, offset, chunk.length - offset);
        offset += result.bytesWritten;
      }
      if (Date.now() - lastUpdate > 100) { onProgress({ received, total }); lastUpdate = Date.now(); }
    }
    await handle.close();
    const digest = hash.digest('hex');
    if (asset.size && received !== asset.size) throw new Error('The downloaded package is incomplete.');
    if (asset.digest?.startsWith('sha256:') && asset.digest.slice(7).toLowerCase() !== digest) throw new Error('The package checksum does not match GitHub.');
    const pe = await fs.promises.open(temporary, 'r');
    const magic = Buffer.alloc(2);
    try { await pe.read(magic, 0, 2, 0); } finally { await pe.close(); }
    if (magic.toString('ascii') !== 'MZ') throw new Error('The release asset is not a Windows DLL or installer.');
    signal.throwIfAborted();
    await fs.promises.rename(temporary, destination);
    onProgress({ received, total: received });
    return { path: destination, name: expectedName, version, sha256: digest, url: url.href };
  } finally {
    await handle.close().catch(() => {});
    await fs.promises.rm(temporary, { force: true });
  }
}

function compareReleaseVersions(left, right) {
  const parts = (value) => String(value || '').replace(/^v/i, '').split(/[.+-]/).map((item) => /^\d+$/.test(item) ? Number(item) : item.toLowerCase());
  const a = parts(left), b = parts(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const x = a[index] ?? 0, y = b[index] ?? 0;
    if (x === y) continue;
    if (typeof x === 'number' && typeof y === 'number') return x < y ? -1 : 1;
    return String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' });
  }
  return 0;
}

function githubRepositoryFromUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['github.com', 'www.github.com'].includes(url.hostname.toLowerCase())) return '';
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2 || !/^[\w.-]{1,100}$/.test(parts[0]) || !/^[\w.-]{1,100}$/.test(parts[1])) return '';
    return `${parts[0]}/${parts[1]}`;
  } catch { return ''; }
}

async function thunderstoreIndex(signal) {
  const cacheKey = `thunderstore-index:${thunderstoreCommunity}`;
  const cached = cachedGithubValue(cacheKey);
  if (cached) return cached;
  const url = `https://thunderstore.io/c/${thunderstoreCommunity}/api/v1/package/`;
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'BananaForge/0.3.21' },
    signal: AbortSignal.any([signal, AbortSignal.timeout(45000)])
  });
  if (!response.ok) throw new Error(`Thunderstore returned HTTP ${response.status} while checking its BTD6 mod catalog.`);
  const packages = await response.json();
  if (!Array.isArray(packages)) throw new Error('Thunderstore returned an invalid BTD6 mod catalog.');
  cacheGithubValue(cacheKey, packages, 10 * 60 * 1000);
  return packages;
}

async function latestThunderstoreRelease(repository, signal) {
  const cacheKey = `thunderstore-release:${repository.toLowerCase()}`;
  const cached = cachedGithubValue(cacheKey);
  if (cached) return cached;
  const packages = await thunderstoreIndex(signal);
  const matches = [];
  for (const packageData of packages) {
    const versions = Array.isArray(packageData.versions) ? packageData.versions : [];
    for (const version of versions) {
      const linkedRepository = githubRepositoryFromUrl(version.website_url || packageData.website_url || '');
      if (linkedRepository.toLowerCase() !== repository.toLowerCase()) continue;
      if (!/^[\w.+-]{1,100}$/.test(String(version.version_number || '')) || typeof version.download_url !== 'string') continue;
      matches.push({ version, packageData });
    }
  }
  matches.sort((a, b) => compareReleaseVersions(b.version.version_number, a.version.version_number));
  const match = matches[0];
  if (!match) return null;
  const packageVersion = match.version;
  const packageUrl = new URL(packageVersion.download_url);
  const namespace = match.packageData.owner || match.packageData.namespace || packageVersion.namespace;
  const name = match.packageData.name || packageVersion.name;
  const expectedPath = `/package/download/${namespace}/${name}/${packageVersion.version_number}/`;
  if (!namespace || !name || packageUrl.protocol !== 'https:' || packageUrl.hostname !== 'thunderstore.io' || packageUrl.pathname !== expectedPath) throw new Error('Thunderstore returned an unexpected package download URL.');
  const release = { version: String(packageVersion.version_number), downloadUrl: packageUrl.href, fileSize: Number(packageVersion.file_size) || 0, repository, source: 'thunderstore' };
  cacheGithubValue(cacheKey, release, 10 * 60 * 1000);
  return release;
}

async function discoverThunderstoreModSource(fileName, signal) {
  const expected = String(fileName || '').replace(/\.dll$/i, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!expected) return null;
  const packages = await thunderstoreIndex(signal);
  const candidates = [];
  for (const packageData of packages) {
    const packageName = String(packageData.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (packageName !== expected) continue;
    for (const version of packageData.versions || []) {
      const repository = githubRepositoryFromUrl(version.website_url || packageData.website_url || '');
      if (!repository || version.is_active === false) continue;
      candidates.push({ repository, version: version.version_number, packageName: packageData.name });
    }
  }
  candidates.sort((a, b) => compareReleaseVersions(b.version, a.version));
  const source = candidates[0];
  if (!source) return null;
  return { repository: source.repository, asset: fileName, url: `https://github.com/${source.repository}/releases/latest`, packageName: source.packageName };
}

function dllFromZip(archive, expectedName) {
  const eocd = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0 || eocd + 22 > archive.length) throw new Error('Thunderstore returned an invalid mod package archive.');
  const entryCount = archive.readUInt16LE(eocd + 10);
  let cursor = archive.readUInt32LE(eocd + 16);
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > archive.length || archive.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Thunderstore mod package contains an invalid ZIP directory.');
    const method = archive.readUInt16LE(cursor + 10);
    const compressedSize = archive.readUInt32LE(cursor + 20);
    const expandedSize = archive.readUInt32LE(cursor + 24);
    const nameLength = archive.readUInt16LE(cursor + 28);
    const extraLength = archive.readUInt16LE(cursor + 30);
    const commentLength = archive.readUInt16LE(cursor + 32);
    const localOffset = archive.readUInt32LE(cursor + 42);
    const entryName = archive.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8').replace(/\\/g, '/');
    cursor += 46 + nameLength + extraLength + commentLength;
    if (path.posix.basename(entryName).toLowerCase() !== expectedName.toLowerCase()) continue;
    if (expandedSize > 256 * 1024 * 1024 || localOffset + 30 > archive.length || archive.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('The mod DLL in the Thunderstore package is invalid or too large.');
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    if (dataOffset + compressedSize > archive.length) throw new Error('The mod DLL in the Thunderstore package is truncated.');
    const compressed = archive.subarray(dataOffset, dataOffset + compressedSize);
    let dll;
    try {
      if (method === 0) dll = Buffer.from(compressed);
      else if (method === 8) dll = zlib.inflateRawSync(compressed, { maxOutputLength: 256 * 1024 * 1024 });
      else throw new Error('unsupported ZIP compression');
    } catch (error) { throw new Error(`Could not extract ${expectedName} from the Thunderstore package: ${error.message}`); }
    if (dll.length !== expandedSize || dll.subarray(0, 2).toString('ascii') !== 'MZ') throw new Error(`The downloaded ${expectedName} is incomplete or is not a Windows DLL.`);
    return dll;
  }
  throw new Error(`The latest Thunderstore package does not contain ${expectedName}.`);
}

async function downloadThunderstoreMod(release, expectedName, root, signal, onProgress = () => {}) {
  const response = await fetch(release.downloadUrl, { signal: AbortSignal.any([signal, AbortSignal.timeout(10 * 60 * 1000)]) });
  const finalUrl = new URL(response.url);
  const trustedThunderstoreHost = finalUrl.hostname === 'thunderstore.io' || finalUrl.hostname.endsWith('.thunderstore.io');
  if (!response.ok) throw new Error(`Thunderstore package download failed with HTTP ${response.status}.`);
  if (finalUrl.protocol !== 'https:' || !trustedThunderstoreHost) throw new Error(`Thunderstore redirected the package to an untrusted host (${finalUrl.hostname || 'unknown'}).`);
  if (!response.body) throw new Error(`Thunderstore returned HTTP ${response.status} without a downloadable package body.`);
  const total = Number(response.headers.get('content-length')) || release.fileSize || 0;
  if (total > 128 * 1024 * 1024) throw new Error('Thunderstore package exceeds the 128 MB download limit.');
  const chunks = [];
  let received = 0;
  for await (const chunk of response.body) {
    signal.throwIfAborted();
    received += chunk.length;
    if (received > 128 * 1024 * 1024) throw new Error('Thunderstore package exceeds the 128 MB download limit.');
    chunks.push(Buffer.from(chunk));
    onProgress({ received, total });
  }
  const dll = dllFromZip(Buffer.concat(chunks), expectedName);
  const digest = crypto.createHash('sha256').update(dll).digest('hex');
  const destination = path.join(root, crypto.randomUUID(), expectedName);
  await fs.promises.mkdir(path.dirname(destination), { recursive: true });
  await fs.promises.writeFile(destination, dll, { flag: 'wx' });
  onProgress({ received, total: received });
  return { path: destination, name: expectedName, version: release.version, sha256: digest, url: `https://github.com/${release.repository}/releases/latest`, repository: release.repository, provider: release.source };
}

async function downloadPackage(id, root, signal, onProgress = () => {}) {
  const source = packageSources[id];
  if (!source) throw new Error('Unknown setup package.');
  const release = await latestRelease(source.repo, signal);
  const asset = await releaseAsset(source.repo, release, source.file, signal);
  if (!asset) throw new Error(`${source.label} has no Windows ${source.file} asset in its latest release.`);
  return downloadReleaseAsset(asset, source.file, root, signal, onProgress, release.tag_name, source.repo);
}

async function updateTrackedMod(source, root, signal, onProgress = () => {}, releaseCache = new Map(), forceRefresh = false) {
  if (source?.sourceType === 'github-branch-file') {
    const reference = { repository: source.repository, branch: source.branch, repoPath: source.sourcePath || '' };
    const asset = await resolveGitHubBranchModAsset(reference, source.asset, signal);
    const result = await downloadGitHubBranchModAsset(asset, root, signal, onProgress);
    if (source.sha256 && result.sha256 === source.sha256) {
      await fs.promises.rm(result.path, { force: true });
      return { upToDate: true, version: result.version, sha256: result.sha256, upstreamSha256: result.upstreamSha256 };
    }
    return result;
  }
  const reference = githubModSourceReference(source?.url, source?.asset);
  if (!reference) throw new Error('Automatic updates require a direct GitHub release DLL download.');
  if (source.repository && source.repository.toLowerCase() !== reference.repository.toLowerCase()) throw new Error('The tracked mod release source changed.');
  if (source.asset && source.asset.toLowerCase() !== reference.asset.toLowerCase()) throw new Error('The tracked release filename changed.');
  let packageRelease = null;
  // Query Thunderstore only for sources that were actually discovered there.
  // Probing the Thunderstore API for every GitHub release wastes a request and
  // can make unrelated GitHub release metadata look like a Thunderstore package.
  if (source.sourceDiscovery === 'thunderstore') {
    try { packageRelease = await latestThunderstoreRelease(reference.repository, signal); }
    catch (error) { if (signal.aborted) throw error; }
  }
  let release = releaseCache.get(reference.repository.toLowerCase());
  if (!release) {
    try {
      release = await latestRelease(reference.repository, signal, { forceRefresh });
      releaseCache.set(reference.repository.toLowerCase(), release);
    } catch (error) {
      if (!packageRelease || signal.aborted) throw error;
      release = null;
    }
  }
  const packageIsLatest = packageRelease && (!release?.tag_name || compareReleaseVersions(packageRelease.version, release.tag_name) >= 0);
  const latestVersion = packageIsLatest ? packageRelease.version : release?.tag_name;
  if (source.versionVerified === true && latestVersion && compareReleaseVersions(latestVersion, source.version) <= 0) {
    return { upToDate: true, version: source.version };
  }
  if (packageIsLatest && packageRelease) {
    try {
      const result = await downloadThunderstoreMod(packageRelease, reference.asset, root, signal, onProgress);
      if (source.sha256 && result.sha256 === source.sha256) {
        await fs.promises.rm(result.path, { force: true });
        return { upToDate: true, version: packageRelease.version, sha256: result.sha256 };
      }
      return { ...result, upToDate: false };
    } catch (error) {
      // The catalog can be healthy while a community package CDN is unavailable.
      // Fall back only to the exact DLL asset from the verified GitHub repository.
      if (!release || compareReleaseVersions(release.tag_name, packageRelease.version) < 0) throw error;
      const githubAsset = await releaseAsset(reference.repository, release, reference.asset, signal);
      if (!githubAsset) throw error;
      const result = await downloadReleaseAsset(githubAsset, reference.asset, root, signal, onProgress, release.tag_name, reference.repository);
      if (source.sha256 && result.sha256 === source.sha256) {
        await fs.promises.rm(result.path, { force: true });
        return { upToDate: true, version: release.tag_name || packageRelease.version, sha256: result.sha256 };
      }
      return { ...result, repository: reference.repository, upToDate: false };
    }
  }
  if (!release) throw new Error(`No release metadata is available for ${reference.repository}.`);
  const asset = await releaseAsset(reference.repository, release, reference.asset, signal);
  if (!asset) throw new Error(`Latest release ${release.tag_name || ''} no longer contains ${reference.asset}.`);
  if ((source.versionVerified === true && release.tag_name === source.version) || (asset.digest?.startsWith('sha256:') && source.sha256 && asset.digest.slice(7).toLowerCase() === source.sha256.toLowerCase())) return { upToDate: true, version: release.tag_name || source.version, sha256: source.sha256 };
  const result = await downloadReleaseAsset(asset, reference.asset, root, signal, onProgress, release.tag_name, reference.repository);
  if (source.sha256 && result.sha256 === source.sha256) {
    await fs.promises.rm(result.path, { force: true });
    return { upToDate: true, version: release.tag_name || source.version, sha256: result.sha256 };
  }
  return { ...result, repository: reference.repository, upToDate: false };
}

function validateBundle(bundle) {
  if (bundle?.format !== 'bananaforge-profile' || bundle.version !== 1 || !Array.isArray(bundle.mods) || bundle.mods.length > 1000) {
    throw new Error('This is not a supported BananaForge profile package.');
  }
  const names = new Set();
  let total = 0;
  const mods = bundle.mods.map((mod) => {
    if (typeof mod.name !== 'string' || path.basename(mod.name) !== mod.name || /[\\/:]/.test(mod.name) || !/\.dll$/i.test(mod.name) || names.has(mod.name.toLowerCase())) throw new Error('The package contains an unsafe or duplicate mod filename.');
    names.add(mod.name.toLowerCase());
    if (typeof mod.data !== 'string' || mod.data.length > 90 * 1024 * 1024 || !/^[A-Za-z0-9+/]*={0,2}$/.test(mod.data)) throw new Error('Invalid mod data in the profile package.');
    const data = Buffer.from(mod.data, 'base64');
    total += data.length;
    if (total > 128 * 1024 * 1024 || data.subarray(0, 2).toString() !== 'MZ') throw new Error('The profile package is too large or contains an invalid DLL.');
    if (crypto.createHash('sha256').update(data).digest('hex') !== mod.sha256) throw new Error(`Checksum mismatch for ${mod.name}.`);
    return { name: mod.name, data, enabled: mod.enabled !== false };
  });
  return { name: String(bundle.name || 'Imported profile').slice(0, 60), description: String(bundle.description || '').slice(0, 240), accent: bundle.accent, mods };
}

module.exports = { separateRoots, copyManagedGame, syncNewerGameFiles, syncSteamBuild, alignManagedGameTimestamps, readLogTail, downloadPackage, updateTrackedMod, githubReleaseReference, githubModSourceReference, githubBranchModSourceReference, resolveGitHubBranchModAsset, verifyGitHubBranchModAsset, latestReleaseAsset, latestReleaseAssetMatching, modHelperDllName, searchModUpdateSources, discoverThunderstoreModSource, discoverGitHubModSource, packageSources, validateBundle };
