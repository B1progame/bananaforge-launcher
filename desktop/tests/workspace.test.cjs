const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { separateRoots, copyManagedGame, syncNewerGameFiles, readLogTail, validateBundle, downloadPackage, updateTrackedMod, githubReleaseReference, githubModSourceReference, latestReleaseAsset } = require('../workspace-service');

async function fixture(run) {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bananaforge-test-'));
  try { return await run(root); }
  finally { assert.ok(path.basename(root).startsWith('bananaforge-test-')); await fs.promises.rm(root, { recursive: true, force: true }); }
}

test('copy rejects the original directory and both nested directions', async () => fixture(async (root) => {
  assert.throws(() => separateRoots(root, root));
  assert.throws(() => separateRoots(root, path.join(root, 'nested')));
  assert.throws(() => separateRoots(path.join(root, 'nested'), root));
}));

test('managed copy publishes complete files and excludes source mods', async () => fixture(async (root) => {
  const source = path.join(root, 'original'), target = path.join(root, 'managed');
  await fs.promises.mkdir(path.join(source, 'Mods'), { recursive: true });
  await fs.promises.mkdir(path.join(source, 'BloonsTD6_Data'));
  await fs.promises.writeFile(path.join(source, 'BloonsTD6.exe'), 'MZgame');
  await fs.promises.writeFile(path.join(source, 'BloonsTD6_Data', 'asset'), 'data');
  await fs.promises.writeFile(path.join(source, 'Mods', 'external.dll'), 'MZmod');
  const result = await copyManagedGame(source, target, new AbortController().signal);
  assert.equal(result.copied, 2);
  assert.equal(fs.readFileSync(path.join(target, 'BloonsTD6_Data', 'asset'), 'utf8'), 'data');
  assert.equal(fs.existsSync(path.join(target, 'Mods')), false);
  assert.equal(fs.readFileSync(path.join(source, 'Mods', 'external.dll'), 'utf8'), 'MZmod');
}));

test('game refresh copies newer Steam files one way and never replaces with older different-size files', async () => fixture(async (root) => {
  const source = path.join(root, 'steam'), target = path.join(root, 'managed');
  await fs.promises.mkdir(source); await fs.promises.mkdir(target);
  const old = new Date('2025-01-01T00:00:00Z'), newer = new Date('2026-01-01T00:00:00Z');
  const newerSource = path.join(source, 'BloonsTD6.exe'), newerTarget = path.join(target, 'BloonsTD6.exe');
  const olderSource = path.join(source, 'asset.dat'), newerTargetFile = path.join(target, 'asset.dat');
  await fs.promises.writeFile(newerSource, 'steam build 2');
  await fs.promises.writeFile(newerTarget, 'steam build 1');
  await fs.promises.utimes(newerSource, newer, newer); await fs.promises.utimes(newerTarget, old, old);
  await fs.promises.writeFile(olderSource, 'short');
  await fs.promises.writeFile(newerTargetFile, 'a much larger newer managed build');
  await fs.promises.utimes(olderSource, old, old); await fs.promises.utimes(newerTargetFile, newer, newer);
  const result = await syncNewerGameFiles(source, target);
  assert.equal(result.copied, 1);
  assert.equal(fs.readFileSync(newerTarget, 'utf8'), 'steam build 2');
  assert.equal(fs.readFileSync(newerTargetFile, 'utf8'), 'a much larger newer managed build');
  assert.equal(fs.readFileSync(newerSource, 'utf8'), 'steam build 2');
  assert.equal(fs.readFileSync(olderSource, 'utf8'), 'short');
}));

test('game refresh rejects identical or nested source and managed roots', async () => fixture(async (root) => {
  await assert.rejects(syncNewerGameFiles(root, root));
  await assert.rejects(syncNewerGameFiles(root, path.join(root, 'managed')));
  await assert.rejects(syncNewerGameFiles(path.join(root, 'steam'), root));
}));

test('cancelled copying leaves no partial destination or staging files', async () => fixture(async (root) => {
  const source = path.join(root, 'original'), target = path.join(root, 'managed');
  fs.mkdirSync(source); fs.writeFileSync(path.join(source, 'BloonsTD6.exe'), 'MZgame');
  const controller = new AbortController();
  await assert.rejects(copyManagedGame(source, target, controller.signal, () => controller.abort()));
  assert.equal(fs.existsSync(target), false);
  assert.deepEqual(fs.readdirSync(root), ['original']);
}));

test('non-game files in a chosen destination are preserved', async () => fixture(async (root) => {
  const source = path.join(root, 'original'), target = path.join(root, 'managed');
  fs.mkdirSync(source); fs.mkdirSync(target);
  fs.writeFileSync(path.join(source, 'BloonsTD6.exe'), 'MZgame');
  fs.writeFileSync(path.join(target, 'important.txt'), 'keep');
  await assert.rejects(copyManagedGame(source, target, new AbortController().signal), /contains files/);
  assert.equal(fs.readFileSync(path.join(target, 'important.txt'), 'utf8'), 'keep');
}));

test('large log files are bounded and retain their newest lines', async () => fixture(async (root) => {
  const file = path.join(root, 'Latest.log');
  fs.writeFileSync(file, Array.from({ length: 5000 }, (_, index) => `line ${index}`).join('\n'));
  const result = await readLogTail(file, 8192);
  assert.ok(result.content.endsWith('line 4999'));
  assert.ok(result.content.length <= 8192);
  assert.equal(result.truncated, true);
}));

test('profile imports verify hashes, reject traversal and duplicate filenames', () => {
  const data = Buffer.from('MZmod');
  const mod = { name: 'Test.dll', data: data.toString('base64'), sha256: crypto.createHash('sha256').update(data).digest('hex'), enabled: false };
  const bundle = { format: 'bananaforge-profile', version: 1, name: 'Collection', mods: [mod] };
  assert.equal(validateBundle(bundle).mods[0].enabled, false);
  assert.throws(() => validateBundle({ ...bundle, mods: [{ ...mod, name: '../Test.dll' }] }), /unsafe/);
  assert.throws(() => validateBundle({ ...bundle, mods: [mod, { ...mod, name: 'test.dll' }] }), /duplicate/);
  assert.throws(() => validateBundle({ ...bundle, mods: [{ ...mod, sha256: 'wrong' }] }), /Checksum/);
});

test('official installer downloader uses its own repository and validates hashes', async () => fixture(async (root) => {
  const originalFetch = global.fetch;
  const data = Buffer.from('MZtest installer');
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  const requests = [];
  global.fetch = async (url) => {
    requests.push(String(url));
    if (String(url).includes('api.github.com')) return new Response(JSON.stringify({ tag_name: 'v-test', assets: [{ name: 'MelonLoader.Installer.exe', size: data.length, digest: `sha256:${hash}`, browser_download_url: 'https://github.com/LavaGang/MelonLoader.Installer/releases/download/v-test/MelonLoader.Installer.exe' }] }));
    const response = new Response(data); Object.defineProperty(response, 'url', { value: String(url) }); return response;
  };
  try {
    const result = await downloadPackage('melonloader', root, new AbortController().signal);
    assert.ok(requests[0].includes('LavaGang/MelonLoader.Installer/releases/latest'));
    assert.equal(result.sha256, hash);
    assert.deepEqual(fs.readFileSync(result.path), data);
  } finally { global.fetch = originalFetch; }
}));

test('a checksum mismatch never publishes a downloaded package', async () => fixture(async (root) => {
  const originalFetch = global.fetch;
  const data = Buffer.from('MZinvalid');
  global.fetch = async (url) => {
    if (String(url).includes('api.github.com')) return new Response(JSON.stringify({ assets: [{ name: 'Btd6ModHelper.dll', size: data.length, digest: 'sha256:wrong', browser_download_url: 'https://github.com/gurrenm3/BTD-Mod-Helper/releases/download/v-test/Btd6ModHelper.dll' }] }));
    const response = new Response(data); Object.defineProperty(response, 'url', { value: String(url) }); return response;
  };
  try {
    await assert.rejects(downloadPackage('modhelper', root, new AbortController().signal), /checksum/);
    for (const directory of fs.readdirSync(root)) assert.deepEqual(fs.readdirSync(path.join(root, directory)), []);
  } finally { global.fetch = originalFetch; }
}));

test('only direct tagged GitHub release DLLs can be tracked', () => {
  assert.deepEqual(githubReleaseReference('https://github.com/owner/repo/releases/download/v1/Mod.dll'), {
    owner: 'owner', repo: 'repo', tag: 'v1', asset: 'Mod.dll', repository: 'owner/repo'
  });
  for (const value of [
    'https://github.com/owner/repo/releases/latest/download/Mod.dll',
    'https://example.com/owner/repo/releases/download/v1/Mod.dll',
    'https://github.com/owner/repo/releases/download/v1/Mod.zip',
    'https://github.com/owner/repo/releases/download/v1/%2Fescape.dll',
    'file:///owner/repo/releases/download/v1/Mod.dll'
  ]) assert.equal(githubReleaseReference(value), null, value);
});

test('existing mods can be tracked from a GitHub project or release page', () => {
  assert.equal(githubModSourceReference('https://github.com/doombubbles/AscendedUpgrades', 'AscendedUpgrades.dll').repository, 'doombubbles/AscendedUpgrades');
  assert.equal(githubModSourceReference('https://github.com/doombubbles/AutoNudge/releases/latest', 'AutoNudge.dll').repository, 'doombubbles/AutoNudge');
  assert.equal(githubModSourceReference('https://github.com/doombubbles/CopyPasteTowers/releases/tag/v1.2', 'CopyPasteTowers.dll').tag, 'v1.2');
  assert.equal(githubModSourceReference('https://github.com/owner/repo', '../Mod.dll'), null);
  assert.equal(githubModSourceReference('https://example.com/owner/repo', 'Mod.dll'), null);
});

test('known project tracking confirms the exact latest-release DLL exists', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({ tag_name: 'v3', assets: [{ name: 'AutoNudge.dll', browser_download_url: 'https://github.com/doombubbles/AutoNudge/releases/download/v3/AutoNudge.dll' }] }));
  try {
    const result = await latestReleaseAsset('doombubbles/AutoNudge', 'AutoNudge.dll', new AbortController().signal);
    assert.equal(result.tag, 'v3');
    assert.equal(result.url, 'https://github.com/doombubbles/AutoNudge/releases/download/v3/AutoNudge.dll');
    await assert.rejects(latestReleaseAsset('doombubbles/AutoNudge', 'Missing.dll', new AbortController().signal), /no Missing.dll asset/);
  } finally { global.fetch = originalFetch; }
});

test('tracked release updates fetch latest DLL, verify its digest, and report current versions', async () => fixture(async (root) => {
  const originalFetch = global.fetch;
  const data = Buffer.from('MZupdated mod');
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  const requests = [];
  global.fetch = async (url) => {
    const text = String(url); requests.push(text);
    if (text.includes('api.github.com')) return new Response(JSON.stringify({ tag_name: 'v2', assets: [{ name: 'Mod.dll', size: data.length, digest: `sha256:${hash}`, browser_download_url: 'https://github.com/owner/repo/releases/download/v2/Mod.dll' }] }));
    const response = new Response(data); Object.defineProperty(response, 'url', { value: text }); return response;
  };
  try {
    const source = { repository: 'owner/repo', asset: 'Mod.dll', url: 'https://github.com/owner/repo/releases/download/v1/Mod.dll', version: 'v1' };
    const result = await updateTrackedMod(source, root, new AbortController().signal);
    assert.equal(result.version, 'v2');
    assert.equal(result.sha256, hash);
    assert.deepEqual(fs.readFileSync(result.path), data);
    assert.equal(requests.length, 2);
    const current = await updateTrackedMod({ ...source, version: 'v2', versionVerified: true }, root, new AbortController().signal);
    assert.equal(current.upToDate, true);
    assert.equal(requests.length, 2, 'A cached current release should not trigger another network request or download.');
  } finally { global.fetch = originalFetch; }
}));

test('a failed update checksum does not publish a replacement DLL', async () => fixture(async (root) => {
  const originalFetch = global.fetch;
  const data = Buffer.from('MZuntrusted');
  global.fetch = async (url) => {
    const text = String(url);
    if (text.includes('api.github.com')) return new Response(JSON.stringify({ tag_name: 'v2', assets: [{ name: 'Mod.dll', size: data.length, digest: 'sha256:wrong', browser_download_url: 'https://github.com/owner/checksumrepo/releases/download/v2/Mod.dll' }] }));
    const response = new Response(data); Object.defineProperty(response, 'url', { value: text }); return response;
  };
  try {
    await assert.rejects(updateTrackedMod({ url: 'https://github.com/owner/checksumrepo/releases/download/v1/Mod.dll', version: 'v1' }, root, new AbortController().signal), /checksum/);
    assert.equal(fs.readdirSync(root).length, 1);
    assert.equal(fs.readdirSync(path.join(root, fs.readdirSync(root)[0])).length, 0);
  } finally { global.fetch = originalFetch; }
}));
