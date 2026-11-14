const { app, BrowserWindow, dialog, ipcMain, session, shell, clipboard } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { spawn, execFile } = require("node:child_process");
const crypto = require("node:crypto");
const { pipeline } = require('node:stream/promises');
const workspace = require('./workspace-service');

function installerOptions() {
  try {
    if (!app.isPackaged) return {};
    const text = fs.readFileSync(path.join(path.dirname(process.execPath), 'setup-options.json'), 'utf8');
    return JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch { return {}; }
}
const installOptions = installerOptions();

// Keep app data beside the per-user installation, not in Electron's roaming default.
// BANANAFORGE_STORAGE_ROOT is only used by automated tests.
const storageRoot = process.env.BANANAFORGE_STORAGE_ROOT
  ? path.resolve(process.env.BANANAFORGE_STORAGE_ROOT)
  : installOptions.root || path.join(
    process.env.LOCALAPPDATA || path.join(path.dirname(app.getPath("appData")), "Local"),
    "BananaForge"
  );
app.setPath("userData", storageRoot);

let mainWindow;
let profileDialogWindow;
let statePath;
let state;
let setupController;
let setupJob = null;
let gameProcess = null;
let gameLaunching = false;
let externalGameRunning = false;
let gameProcessPollBusy = false;
let gameProcessPollError = '';
let autoUpdateJob = null;
let lastAppUpdateStatus = null;
let lastGameUpdateStatus = null;
let gameLaunchStartedAt = 0;
let gameLaunchProfileId = null;
let runtimeModWarningToken = '';
let rendererRecoveryAttempts = 0;
const melonLoaderDownloads = new Set();
const registeredDownloadSessions = new Set();
const activeDownloads = new Map();
const verifiedMelonLoader = { version: 'v0.7.3', unityVersion: '6000.3.23f1', note: 'This exact BTD6 Unity build launched successfully with the managed game and mods.' };
let melonLoaderRecommendation = {
  recommendedVersion: verifiedMelonLoader.version,
  latestStableVersion: null,
  gameUnityVersion: null,
  confidence: 'verified',
  status: 'Using the last locally verified version; official sources have not been checked yet.',
  checkedAt: null,
  sources: [
    { label: 'MelonLoader releases', url: 'https://github.com/LavaGang/MelonLoader/releases' },
    { label: 'BTD Mod Helper compatibility data', url: 'https://github.com/gurrenm3/BTD-Mod-Helper/blob/master/messages.json' }
  ]
};
let melonLoaderRecommendationCheckedAt = 0;
let melonLoaderRecommendationRequest = null;
const knownModRepositories = {
  'ascendedupgrades.dll': 'doombubbles/AscendedUpgrades',
  'autonudge.dll': 'doombubbles/AutoNudge',
  'btd6modhelper.dll': 'gurrenm3/BTD-Mod-Helper',
  'copypastetowers.dll': 'doombubbles/CopyPasteTowers',
  'fasterforward.dll': 'doombubbles/FasterForward',
  'quickgame.dll': 'Void-n-Null/QuickGame',
  'ultimatecrosspathing.dll': 'doombubbles/UltimateCrosspathing'
};

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function launchDetached(executable, args = [], cwd = path.dirname(executable), env = process.env) {
  return new Promise((resolve, reject) => {
    // Game and installer executables are graphical apps. Launch them as normal
    // visible desktop processes instead of detaching/hiding their windows.
    const child = spawn(executable, args, { cwd, env, detached: false, stdio: "ignore", windowsHide: false });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve(child);
    });
  });
}

function steamClientRunning() {
  return new Promise((resolve) => {
    if (process.platform !== "win32") return resolve(true);
    const probe = spawn("tasklist", ["/FI", "IMAGENAME eq steam.exe", "/FO", "CSV", "/NH"], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"]
    });
    let output = "";
    probe.stdout.on("data", (chunk) => { output += chunk.toString(); });
    probe.once("error", () => resolve(false));
    probe.once("close", (code) => resolve(code === 0 && /"steam\.exe"/i.test(output)));
  });
}

function steamUserLoggedIn() {
  if (process.platform !== 'win32') return Promise.resolve(null);
  return new Promise((resolve) => {
    execFile('reg.exe', ['query', 'HKCU\\Software\\Valve\\Steam\\ActiveProcess', '/v', 'ActiveUser'], { windowsHide: true }, (error, stdout) => {
      if (error) return resolve(null); // Registry access varies by machine; retain the process check as fallback.
      const match = stdout.match(/ActiveUser\s+REG_DWORD\s+0x([\da-f]+)/i);
      resolve(match ? Number.parseInt(match[1], 16) !== 0 : null);
    });
  });
}

async function ensureSteamClient() {
  if (!(await steamClientRunning())) {
    try { await shell.openExternal("steam://open/main"); } catch {}
    let appeared = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await wait(500);
      if (await steamClientRunning()) { appeared = true; break; }
    }
    if (!appeared) return false;
  }
  const loggedIn = await steamUserLoggedIn();
  if (loggedIn === false) {
    try { await shell.openExternal("steam://open/main"); } catch {}
    return false;
  }
  return true;
}

function latestGameCrashLog(sinceMs = 0) {
  const root = path.join(process.env.USERPROFILE || app.getPath('home'), 'AppData', 'LocalLow', 'Ninja Kiwi', 'BloonsTD6');
  try {
    const latest = fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /^Crash_.*\.log$/i.test(entry.name))
      .map((entry) => ({ file: path.join(root, entry.name), stat: fs.statSync(path.join(root, entry.name)) }))
      .filter((entry) => entry.stat.mtimeMs >= sinceMs)
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)[0];
    return latest ? { file: latest.file, text: fs.readFileSync(latest.file, 'utf8') } : null;
  } catch { return null; }
}

function latestMelonGenerationStatus(sinceMs = 0) {
  try {
    const logRoot = path.join(gameRoot(), 'MelonLoader', 'Logs');
    const latest = fs.readdirSync(logRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.log$/i.test(entry.name))
      .map((entry) => ({ file: path.join(logRoot, entry.name), stat: fs.statSync(path.join(logRoot, entry.name)) }))
      .filter((entry) => entry.stat.mtimeMs >= sinceMs - 15000 && entry.stat.size < 8 * 1024 * 1024)
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)[0];
    if (!latest) return { observed: false, complete: false };
    const text = fs.readFileSync(latest.file, 'utf8');
    const startedAt = text.indexOf('Assembly Generation Needed!');
    if (startedAt < 0) return { observed: false, complete: false };
    return {
      observed: true,
      complete: text.indexOf('Assembly Generation Successful!', startedAt) >= 0,
      logPath: latest.file
    };
  } catch { return { observed: false, complete: false }; }
}

function latestWindowsGameCrash(sinceMs = 0) {
  const executable = gameExecutable();
  if (!executable) return null;
  const expectedPath = path.resolve(executable).toLowerCase();
  const roots = [
    path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft', 'Windows', 'WER', 'ReportArchive'),
    path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft', 'Windows', 'WER', 'ReportQueue')
  ];
  const candidates = [];
  for (const root of roots) {
    try {
      for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory() || !/^AppCrash_BloonsTD6\.exe/i.test(entry.name)) continue;
        const directory = path.join(root, entry.name);
        const report = path.join(directory, 'Report.wer');
        try {
          const stat = fs.statSync(report);
          if (stat.mtimeMs >= sinceMs) candidates.push({ file: report, mtimeMs: stat.mtimeMs });
        } catch {}
      }
    } catch {}
  }
  for (const candidate of candidates.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, 30)) {
    try {
      // WER reports can be UTF-16LE with a BOM, and signature names may be localized.
      const buffer = fs.readFileSync(candidate.file);
      const hasUtf16Bom = buffer.length > 1 && buffer[0] === 0xff && buffer[1] === 0xfe;
      const text = (hasUtf16Bom ? buffer.subarray(2).toString('utf16le') : buffer.length > 1 && buffer[1] === 0 ? buffer.toString('utf16le') : buffer.toString('utf8')).replace(/\0/g, '');
      const fields = new Map([...text.matchAll(/^([^=\r\n]+)=(.*)$/gm)].map((match) => [match[1].trim(), match[2].trim()]));
      const value = (key) => fields.get(key) || '';
      const signatureValues = [...fields.entries()]
        .map(([key, entry]) => ({ match: key.match(/^Sig\[(\d+)\]\.Value$/i), value: entry }))
        .filter((entry) => entry.match)
        .map((entry) => ({ index: Number(entry.match[1]), value: entry.value }))
        .sort((a, b) => a.index - b.index);
      const uiPaths = [...fields.entries()].filter(([key]) => /^UI\[\d+\]$/i.test(key)).map(([, entry]) => entry);
      const appPath = value('AppPath') || uiPaths.find((entry) => /\.exe$/i.test(entry)) || '';
      if (!appPath || path.resolve(appPath).toLowerCase() !== expectedPath) continue;
      const faultIndex = signatureValues.findIndex((entry) => /(?:^|[\\/])version\.dll$/i.test(entry.value));
      return {
        file: candidate.file,
        appPath,
        faultModule: value('Fault Module Name') || (faultIndex >= 0 ? signatureValues[faultIndex].value : ''),
        faultModuleVersion: value('Fault Module Version') || (faultIndex >= 0 ? signatureValues.find((entry) => entry.index === signatureValues[faultIndex].index + 1)?.value || '' : ''),
        exceptionCode: value('Exception Code') || signatureValues.find((entry) => /^(?:0x)?c0000602$/i.test(entry.value))?.value || ''
      };
    } catch {}
  }
  return null;
}

function gameCrashMessage(crash, code, windowsCrash = null) {
  if (crash && /SteamApi_Init failed|ConnectToGlobalUser failed/i.test(crash.text)) {
    return 'BTD6 crashed because Steam could not connect to a signed-in user. Sign in to Steam, leave it open, and launch again. See Game logs for the crash report.';
  }
  if (windowsCrash && /^(?:0x)?c0000602$/i.test(windowsCrash.exceptionCode) && /^(?:version\.dll|version)$/i.test(windowsCrash.faultModule) && /0\.7\.4/i.test(windowsCrash.faultModuleVersion)) {
    return 'BTD6 crashed inside MelonLoader 0.7.4-ci.2623 nightly (VERSION.dll fail-fast). This was a loader-level failure, not a verified mod error. For BTD6 Unity 6000.3.23f1, use MelonLoader v0.7.3 stable; that version launched successfully with your managed game and mods.';
  }
  return `BTD6 exited unexpectedly${code === null ? '' : ` (code ${code})`}. See Game logs for the Unity or MelonLoader crash details.`;
}

function isMelonLoaderLogFile(name) {
  // MelonLoader 0.7.3 emits YY-M-D timestamps (for example 26-10-8_20-44-13.log),
  // while older releases commonly use YYYY-MM-DD. Accept both formats.
  return /^(?:\d{4}-\d{2}-\d{2}|\d{2}-\d{1,2}-\d{1,2})_.*\.log$/i.test(name);
}

function latestIncompatibleModLog(startedAt, profileId) {
  try {
    const logRoot = path.join(gameRoot(), 'MelonLoader', 'Logs');
    const latest = fs.readdirSync(logRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && isMelonLoaderLogFile(entry.name))
      .map((entry) => ({ file: path.join(logRoot, entry.name), stat: fs.statSync(path.join(logRoot, entry.name)) }))
      .filter((entry) => entry.stat.mtimeMs >= startedAt - 15000)
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)[0];
    if (!latest) return null;
    // Some mods can write gigabytes of repeated exceptions in one session.
    // Read only the startup header and recent tail so large logs remain diagnosable.
    const header = readFileWindow(latest.file, 0, 8 * 1024 * 1024);
    const tailOffset = Math.max(0, latest.stat.size - 8 * 1024 * 1024);
    const recent = readFileWindow(latest.file, tailOffset, 8 * 1024 * 1024);
    const loadPattern = /Melon Assembly loaded:\s*['"][^'"\r\n]*[\\/](?:Mods|Plugins)[\\/]([^\\/'"\r\n]+\.dll)['"]/gi;
    const loadMatches = [...header.matchAll(loadPattern)];
    const loadedMods = loadMatches.map((match, index) => {
      const nextLoad = loadMatches[index + 1]?.index ?? header.length;
      const segment = header.slice(match.index, nextLoad);
      return { file: match[1], sha256: segment.match(/SHA256 Hash:\s*['"]([a-f0-9]{64})['"]/i)?.[1]?.toLowerCase() || '' };
    });
    const normalize = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const trackedFiles = new Set(profileMods(profileId).map((name) => name.toLowerCase()));
    // Attribute common mod/runtime compatibility failures to the assembly
    // logger that emitted them. Avoid guessing from generic Unity errors.
    const modError = /^\[[^\]]+\]\s+\[ERROR\]\s+\[([^\]]+)\]\s+System\.(?:MissingMethodException|MissingFieldException|TypeLoadException|FileNotFoundException|FileLoadException|BadImageFormatException|MethodAccessException|TypeInitializationException|ReflectionTypeLoadException):\s*(.*)$/gm;
    for (const match of recent.matchAll(modError)) {
      const modId = normalize(match[1]);
      const loaded = loadedMods.find((mod) => normalize(path.basename(mod.file, '.dll')) === modId);
      if (loaded && trackedFiles.has(loaded.file.toLowerCase())) return { file: loaded.file, sha256: loaded.sha256, detail: match[2], logPath: latest.file };
    }
  } catch {}
  return null;
}

function readFileWindow(file, start, requestedBytes) {
  const descriptor = fs.openSync(file, 'r');
  try {
    const stat = fs.fstatSync(descriptor);
    const length = Math.max(0, Math.min(requestedBytes, stat.size - start));
    const buffer = Buffer.alloc(length);
    let position = 0;
    while (position < length) {
      const read = fs.readSync(descriptor, buffer, position, length - position, start + position);
      if (!read) break;
      position += read;
    }
    return buffer.subarray(0, position).toString('utf8');
  } finally { fs.closeSync(descriptor); }
}

const GAME_LOG_RETENTION_DAYS = 7;
const GAME_LOGS_TO_KEEP_PER_FOLDER = 3;
const GAME_LOG_MAX_FILE_BYTES = 512 * 1024 * 1024;

async function cleanupOldGameLogs() {
  if (gameLaunching || !btd6Executable(state?.settings?.instancePath)) return { removed: 0, bytesFreed: 0 };
  try {
    if (await isBtd6ProcessRunning()) return { removed: 0, bytesFreed: 0, skipped: 'game-running' };
  } catch (error) {
    launcherLog(`Skipped old game log cleanup because game status could not be checked: ${error.message || error}`);
    return { removed: 0, bytesFreed: 0, skipped: 'process-check-failed' };
  }

  const instanceRoot = path.dirname(btd6Executable(state.settings.instancePath));
  const recoveryRoot = path.join(instanceRoot, '.BananaForge-Recovery');
  const logFolders = [path.join(instanceRoot, 'MelonLoader', 'Logs')];
  try {
    for (const entry of await fs.promises.readdir(recoveryRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) logFolders.push(path.join(recoveryRoot, entry.name, 'MelonLoader', 'Logs'));
    }
  } catch { /* Recovery snapshots are optional. */ }

  const cutoff = Date.now() - GAME_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let removed = 0;
  let bytesFreed = 0;
  for (const folder of logFolders) {
    let files;
    try {
      files = (await fs.promises.readdir(folder, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && /^.+\.log$/i.test(entry.name))
        .map((entry) => ({ file: path.join(folder, entry.name) }));
    } catch { continue; }
    const dated = await Promise.all(files.map(async (entry) => {
      try { entry.stat = await fs.promises.stat(entry.file); return entry; }
      catch { return null; }
    }));
    const ordered = dated.filter(Boolean).sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
    for (const [index, entry] of ordered.entries()) {
      const oversized = entry.stat.size > GAME_LOG_MAX_FILE_BYTES;
      const expired = index >= GAME_LOGS_TO_KEEP_PER_FOLDER && entry.stat.mtimeMs < cutoff;
      if (!oversized && !expired) continue;
      try {
        await fs.promises.rm(entry.file);
        removed += 1;
        bytesFreed += entry.stat.size;
      } catch (error) {
        launcherLog(`Could not remove stale game log ${entry.file}: ${error.message || error}`);
      }
    }
  }
  if (removed) launcherLog(`Removed ${removed} stale or oversized managed-game logs; freed ${(bytesFreed / 1024 ** 3).toFixed(2)} GiB. Retention: ${GAME_LOG_RETENTION_DAYS} days, ${GAME_LOGS_TO_KEEP_PER_FOLDER} recent logs per folder, ${Math.round(GAME_LOG_MAX_FILE_BYTES / 1024 ** 2)} MiB maximum per file.`);
  return { removed, bytesFreed };
}

function verifiedModFailure(failure, profileId) {
  if (!failure?.sha256) return null;
  const profile = profileById(profileId);
  if (!profile || (profile.disabledMods || []).includes(failure.file)) return null;
  const file = path.join(profileRoot(profileId), failure.file);
  if (!fs.existsSync(file)) return null;
  const currentHash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (currentHash !== failure.sha256) return null;
  return failure;
}

function previouslyCrashingMod(profileId) {
  return verifiedModFailure(latestIncompatibleModLog(Date.now() - 7 * 24 * 60 * 60 * 1000, profileId), profileId);
}

function modFailureToken(failure, profileId) {
  return failure ? `${profileId}:${failure.file.toLowerCase()}:${failure.sha256 || ''}` : '';
}

function checkLiveModLogForErrors() {
  if (!gameProcess || gameProcess.exitCode !== null || gameLaunching || !gameLaunchProfileId || !gameLaunchStartedAt) return;
  const failure = verifiedModFailure(latestIncompatibleModLog(gameLaunchStartedAt, gameLaunchProfileId), gameLaunchProfileId);
  const token = modFailureToken(failure, gameLaunchProfileId);
  if (!token || token === runtimeModWarningToken) return;
  runtimeModWarningToken = token;
  const message = `${failure.file} is repeatedly logging a compatibility error while BTD6 runs. Save your game and close BTD6 to stop the log growing; then choose Close & disable to turn off this mod for the profile.`;
  launcherLog(`${message} Error: ${failure.detail} Log: ${failure.logPath}`);
  send('game:mod-warning', { ...failure, profileId: gameLaunchProfileId, message, liveGame: true });
}

const defaultState = () => ({
  settings: {
    gamePath: "",
    instancePath: "",
    melonLoaderPath: "",
    downloadPath: "",
    launchArguments: "",
    firstRunComplete: false,
    managedInstallPath: '',
    autoUpdateMods: false,
    autoUpdateApp: true,
    autoUpdateGame: true,
    managedGameBuildId: ''
  },
  profiles: [{ id: "default", name: "Default", createdAt: new Date().toISOString() }],
  activeProfileId: "default",
  managedFiles: [],
  downloads: []
});

function readState() {
  statePath = path.join(app.getPath("userData"), "state.json");
  try {
    state = { ...defaultState(), ...JSON.parse(fs.readFileSync(statePath, "utf8")) };
    state.settings = { ...defaultState().settings, ...state.settings };
  } catch {
    state = defaultState();
  }
  if (!Array.isArray(state.profiles) || !state.profiles.length) state.profiles = defaultState().profiles;
  const validProfiles = state.profiles.filter((profile) => profile && typeof profile.name === 'string' && /^(default|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i.test(profile.id));
  if (validProfiles.length !== state.profiles.length) {
    if (fs.existsSync(statePath)) fs.copyFileSync(statePath, statePath + '.recovery-backup');
    state.profiles = validProfiles.length ? validProfiles : defaultState().profiles;
  }
  state.profiles = state.profiles.filter((profile, index, list) => list.findIndex((entry) => entry.id === profile.id) === index);
  if (!state.profiles.some((profile) => profile.id === state.activeProfileId)) state.activeProfileId = state.profiles[0].id;
  state.downloads = Array.isArray(state.downloads) ? state.downloads.filter((item) => item && typeof item.name === 'string' && typeof item.path === 'string').map((item) => ({ ...item, state: item.state === 'progressing' ? 'interrupted' : item.state })) : [];
  state.managedFiles = Array.isArray(state.managedFiles) ? state.managedFiles.filter((file) => typeof file === 'string' && path.basename(file) === file) : [];
  for (const profile of state.profiles) {
    if (!/^(default|[a-f0-9-]{36})$/i.test(profile.id)) throw new Error('Invalid profile identifier in saved state.');
    profile.disabledMods = Array.isArray(profile.disabledMods) ? profile.disabledMods : [];
    profile.updateSources = profile.updateSources && typeof profile.updateSources === 'object' && !Array.isArray(profile.updateSources) ? profile.updateSources : {};
  }
  ensureProfileManifests();
  saveState();
}

function saveState() {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const temporary = statePath + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(state, null, 2), "utf8");
  fs.renameSync(temporary, statePath);
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || "" : "";
}

function applyInstallerPaths() {
  const original = argumentValue("--game-path");
  const managed = argumentValue("--instance-path");
  if (original) state.settings.gamePath = original;
  if (managed) {
    const executable = btd6Executable(managed);
    state.settings.instancePath = executable ? path.dirname(executable) : managed;
  }
  if (original || managed) saveState();
}

function profileDirectory(profileId = state.activeProfileId) {
  if (!profileById(profileId)) throw new Error('Profile not found.');
  return path.join(app.getPath("userData"), "profiles", profileId);
}

function profileRoot(profileId = state.activeProfileId) {
  return path.join(profileDirectory(profileId), "mods");
}

function profileManifestPath(profileId = state.activeProfileId) {
  return path.join(profileDirectory(profileId), "profile.json");
}

function profileById(profileId = state.activeProfileId) {
  return state.profiles.find((profile) => profile.id === profileId);
}

function profileMods(profileId = state.activeProfileId) {
  const root = profileRoot(profileId);
  fs.mkdirSync(root, { recursive: true });
  return fs.readdirSync(root)
    .filter((name) => name.toLowerCase().endsWith(".dll"))
    .sort((left, right) => left.localeCompare(right));
}

const modRuntimeLogCache = new Map();

function modRuntimeEvidence(profileId) {
  const profile = profileById(profileId);
  const expected = profile?.lastRun;
  if (!profile) return { checkedAt: null, unityVersion: '', complete: false, trackedRun: false, mods: new Map() };
  const trackedRun = Boolean(expected?.startedAt && Array.isArray(expected.mods));
  const startedAt = trackedRun ? Date.parse(expected.startedAt) : NaN;
  if (trackedRun && !Number.isFinite(startedAt)) return { checkedAt: null, unityVersion: '', complete: false, trackedRun: false, mods: new Map() };
  try {
    const logRoot = path.join(gameRoot(), 'MelonLoader', 'Logs');
    const latest = fs.readdirSync(logRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && isMelonLoaderLogFile(entry.name))
      .map((entry) => ({ file: path.join(logRoot, entry.name), stat: fs.statSync(path.join(logRoot, entry.name)) }))
      .filter((entry) => !trackedRun || entry.stat.mtimeMs >= startedAt - 15000)
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)[0];
    if (!latest) return { checkedAt: trackedRun ? expected.startedAt : null, unityVersion: '', complete: false, trackedRun, mods: new Map() };
    const cacheKey = `${profileId}:${expected?.startedAt || 'legacy'}:${latest.file}:${latest.stat.size}:${latest.stat.mtimeMs}`;
    let parsed = modRuntimeLogCache.get(profileId)?.key === cacheKey ? modRuntimeLogCache.get(profileId).parsed : null;
    if (!parsed) {
      const maxFullScanBytes = 64 * 1024 * 1024;
      const header = readFileWindow(latest.file, 0, Math.min(8 * 1024 * 1024, latest.stat.size));
      const complete = latest.stat.size <= maxFullScanBytes;
      const logText = complete
        ? readFileWindow(latest.file, 0, latest.stat.size)
        : `${header}\n${readFileWindow(latest.file, Math.max(0, latest.stat.size - 32 * 1024 * 1024), 32 * 1024 * 1024)}`;
      const loadPattern = /Melon Assembly loaded:\s*['"][^'"\r\n]*[\\/]Mods[\\/]([^\\/'"\r\n]+\.dll)['"]/gi;
      const loadMatches = [...header.matchAll(loadPattern)];
      const loaded = new Map(loadMatches.map((match, index) => {
        const nextLoad = loadMatches[index + 1]?.index ?? header.length;
        const segment = header.slice(match.index, nextLoad);
        return [match[1].toLowerCase(), {
          file: match[1],
          sha256: segment.match(/SHA256 Hash:\s*['"]([a-f0-9]{64})['"]/i)?.[1]?.toLowerCase() || ''
        }];
      }));
      const normalize = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const errors = new Map();
      const errorPattern = /^\[[^\]]+\]\s+\[ERROR\]\s+\[([^\]]+)\]\s+([^\r\n]+)$/gm;
      for (const match of logText.matchAll(errorPattern)) {
        const assembly = [...loaded.values()].find((mod) => normalize(path.basename(mod.file, '.dll')) === normalize(match[1]));
        if (assembly) errors.set(assembly.file.toLowerCase(), match[2].slice(0, 240));
      }
      parsed = {
        complete,
        loaded,
        errors,
        unityVersion: header.match(/Unity Version:\s*([^\r\n]+)/i)?.[1]?.trim() || '',
        checkedAt: latest.stat.mtime.toISOString()
      };
      modRuntimeLogCache.set(profileId, { key: cacheKey, parsed });
    }
    const { complete, loaded, errors, unityVersion } = parsed;
    const mods = new Map();
    const snapshot = new Map((expected?.mods || []).map((item) => [String(item.file).toLowerCase(), item.sha256]));
    for (const name of profileMods(profileId)) {
      const key = name.toLowerCase();
      const enabled = !(profile.disabledMods || []).includes(name);
      const previousHash = snapshot.get(key);
      const currentHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(profileRoot(profileId), name))).digest('hex');
      let status = 'not-verified';
      let note = 'Not checked in the most recent launch.';
      if (!enabled) { status = 'disabled'; note = 'Disabled in this profile; it will not load.'; }
      else if (!trackedRun) {
        const oldLogMod = loaded.get(key);
        if (oldLogMod?.sha256 === currentHash) {
          const error = errors.get(key);
          if (error) { status = 'error-stale'; note = `Error in the last matching game log (${new Date(latest.stat.mtimeMs).toLocaleDateString()}): ${error}. This log is not tied to this profile.`; }
          else { status = 'loaded-stale'; note = `Loaded in the last matching game log (${new Date(latest.stat.mtimeMs).toLocaleDateString()}); this log is not tied to this profile.`; }
        } else if (oldLogMod) { status = 'changed-since-run'; note = 'The last game log loaded a different DLL version.'; }
        else { status = 'not-verified'; note = 'No matching load found in the last game log; profile used for that run is unknown.'; }
      }
      else if (!previousHash) { status = 'added-since-run'; note = 'Added after the most recent launch; not verified yet.'; }
      else if (previousHash !== currentHash) { status = 'changed-since-run'; note = 'File changed after the most recent launch; not verified yet.'; }
      else {
        const loadedMod = loaded.get(key);
        if (loadedMod && loadedMod.sha256 && loadedMod.sha256 !== currentHash) {
          status = 'changed-since-run'; note = 'The last run loaded a different DLL version.';
        } else if (loadedMod) {
          const error = errors.get(key);
          if (error) { status = 'error'; note = `Reported an error last run: ${error}`; }
          else if (complete) { status = 'loaded'; note = `Loaded last run${unityVersion ? ` on Unity ${unityVersion}` : ''}; no mod error was logged.`; }
          else { status = 'loaded-unverified'; note = 'Loaded last run; the oversized log was only checked at the start and end, so earlier errors may be missing.'; }
        } else {
          status = 'not-loaded'; note = 'Enabled for the last run, but no successful load was found in its log.';
        }
      }
      mods.set(name, { status, note, lastRunAt: expected?.startedAt || '', unityVersion });
    }
    return { checkedAt: parsed.checkedAt, unityVersion, complete, trackedRun, mods };
  } catch (error) {
    if (error?.code === 'ENOENT') return { checkedAt: expected?.startedAt || null, unityVersion: '', complete: false, trackedRun, mods: new Map() };
    launcherLog(`Could not inspect mod runtime evidence for profile ${profileId}: ${error.message || error}`);
    return { checkedAt: expected?.startedAt || null, unityVersion: '', complete: false, trackedRun, mods: new Map() };
  }
}

function writeProfileManifest(profileId = state.activeProfileId) {
  const profile = profileById(profileId);
  if (!profile) return null;
  const root = profileRoot(profileId);
  const runtimeEvidence = modRuntimeEvidence(profileId);
  const manifest = {
    schemaVersion: 1,
    id: profile.id,
    name: profile.name,
    createdAt: profile.createdAt,
    updatedAt: new Date().toISOString(),
    mods: profileMods(profileId).map((file) => {
      const stat = fs.statSync(path.join(root, file));
      return {
        file,
        displayName: path.basename(file, path.extname(file)),
        size: stat.size,
        installedAt: stat.birthtime.toISOString(),
        enabled: !(profile.disabledMods || []).includes(file),
        updateStatus: profile.updateSources?.[file]?.status || (profile.updateSources?.[file] ? 'tracked' : 'manual'),
        updateVersion: profile.updateSources?.[file]?.version || '',
        updateError: profile.updateSources?.[file]?.lastError || '',
        runtimeStatus: runtimeEvidence.mods.get(file)?.status || 'not-verified',
        runtimeNote: runtimeEvidence.mods.get(file)?.note || (runtimeEvidence.checkedAt ? 'Not confirmed in the last game log.' : 'Not checked in the most recent launch.'),
        runtimeLastRunAt: runtimeEvidence.mods.get(file)?.lastRunAt || '',
        runtimeUnityVersion: runtimeEvidence.mods.get(file)?.unityVersion || ''
      };
    })
  };
  const enabledMods = manifest.mods.filter((mod) => mod.enabled);
  manifest.runtime = {
    checkedAt: runtimeEvidence.checkedAt,
    lastRunAt: profile.lastRun?.startedAt || null,
    trackedRun: runtimeEvidence.trackedRun,
    unityVersion: runtimeEvidence.unityVersion,
    complete: runtimeEvidence.complete,
    enabledCount: enabledMods.length,
    loadedCount: enabledMods.filter((mod) => ['loaded', 'loaded-unverified'].includes(mod.runtimeStatus)).length,
    errorCount: enabledMods.filter((mod) => ['error', 'error-stale'].includes(mod.runtimeStatus)).length,
    staleEvidence: !runtimeEvidence.trackedRun && Boolean(runtimeEvidence.checkedAt),
    notLoadedCount: enabledMods.filter((mod) => ['not-loaded', 'changed-since-run', 'added-since-run', 'not-verified'].includes(mod.runtimeStatus)).length
  };
  fs.writeFileSync(profileManifestPath(profileId), JSON.stringify(manifest, null, 2), "utf8");
  return manifest;
}

function ensureProfileManifests() {
  for (const profile of state.profiles) writeProfileManifest(profile.id);
}

function downloadRoot() {
  return state?.settings.downloadPath || path.join(storageRoot, "downloads");
}

function melonLoaderRoot() {
  return path.join(storageRoot, "melon-loader");
}

function gameRoot() {
  const configured = state.settings.instancePath || state.settings.gamePath;
  const executable = btd6Executable(configured);
  return executable ? path.dirname(executable) : configured;
}

function btd6Executable(candidate) {
  if (!candidate || typeof candidate !== "string") return "";
  const resolved = path.resolve(candidate);
  const executable = resolved.toLowerCase().endsWith(".exe")
    ? resolved
    : path.join(resolved, "BloonsTD6.exe");
  return path.basename(executable).toLowerCase() === "bloonstd6.exe" && fs.existsSync(executable)
    ? executable
    : "";
}

function gameExecutable() {
  const managed = btd6Executable(state.settings.instancePath);
  if (managed) return managed;
  return originalGameExecutable();
}

function originalGameExecutable() {
  const configured = btd6Executable(state.settings.gamePath);
  if (configured) return configured;
  const candidates = [
    "C:\\Program Files (x86)\\Steam\\steamapps\\common\\BloonsTD6\\BloonsTD6.exe",
    "C:\\Program Files\\Steam\\steamapps\\common\\BloonsTD6\\BloonsTD6.exe"
  ];
  return candidates.find(fs.existsSync) || "";
}

function originalGameRoot() {
  const executable = originalGameExecutable();
  return executable ? path.dirname(executable) : "";
}

function steamBuildId(sourceRoot = originalGameRoot()) {
  if (!sourceRoot) return '';
  let folder = path.resolve(sourceRoot);
  while (path.dirname(folder) !== folder && path.basename(folder).toLowerCase() !== 'steamapps') folder = path.dirname(folder);
  if (path.basename(folder).toLowerCase() !== 'steamapps') return '';
  try {
    const manifest = fs.readFileSync(path.join(folder, 'appmanifest_960090.acf'), 'utf8');
    return manifest.match(/"buildid"\s+"(\d+)"/i)?.[1] || '';
  } catch { return ''; }
}

function assertSeparateGameRoots(sourceRoot, managedRoot) {
  workspace.separateRoots(sourceRoot, managedRoot);
}

async function syncGameUpdate() {
  const sourceRoot = originalGameRoot();
  const managedRoot = btd6Executable(state.settings.instancePath) ? gameRoot() : "";
  if (!sourceRoot || !managedRoot || !fs.existsSync(sourceRoot)) return { copied: 0, skipped: true };
  const buildId = steamBuildId(sourceRoot);
  const previousBuildId = String(state.settings.managedGameBuildId || '');
  let result;
  if (buildId && previousBuildId && buildId !== previousBuildId) {
    result = await workspace.syncSteamBuild(sourceRoot, managedRoot);
    launcherLog(`Steam BTD6 build changed ${previousBuildId} -> ${buildId}; copied ${result.copied} files to the managed game only.`);
  } else {
    // Keep the older safe, timestamp-based refresh for existing installations
    // that predate build tracking, then establish the current Steam baseline.
    result = await workspace.syncNewerGameFiles(sourceRoot, managedRoot);
    if (buildId && !previousBuildId) await workspace.alignManagedGameTimestamps(sourceRoot, managedRoot);
  }
  if (buildId && buildId !== previousBuildId) {
    state.settings.managedGameBuildId = buildId;
    saveState();
  }
  return { ...result, buildId, previousBuildId, buildChanged: Boolean(buildId && previousBuildId && buildId !== previousBuildId) };
}

function compareVersions(left, right) {
  const a = String(left).match(/^(\d+)\.(\d+)\.(\d+)/), b = String(right).match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!a || !b) return 0;
  for (let index = 1; index <= 3; index += 1) {
    const difference = Number(a[index]) - Number(b[index]);
    if (difference) return Math.sign(difference);
  }
  return 0;
}

function updateEvent(value) { lastAppUpdateStatus = value; send('app:update-status', value); }
function gameUpdateEvent(value) { lastGameUpdateStatus = value; send('game:auto-update-status', value); }

function safeGithubAssetUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(url.hostname.toLowerCase()) ? url : null;
  } catch { return null; }
}

async function fetchGithubReleaseAsset(asset, { limit = 1024 * 1024 * 1024 } = {}) {
  const url = safeGithubAssetUrl(asset?.browser_download_url);
  if (!url) throw new Error('The BananaForge release returned an unsafe download URL.');
  const response = await fetch(url, { headers: { 'User-Agent': `BananaForge/${app.getVersion()}` }, signal: AbortSignal.timeout(10 * 60 * 1000) });
  if (!response.ok || !safeGithubAssetUrl(response.url)) throw new Error(`Could not download the official BananaForge update (HTTP ${response.status}).`);
  const length = Number(response.headers.get('content-length')) || 0;
  if (length > limit) throw new Error('The BananaForge update download is larger than expected.');
  return response;
}

async function launchVerifiedBananaForgeUpdate(file, version) {
  if (process.platform !== 'win32' || !app.isPackaged) return false;
  const appExecutable = process.execPath;
  const psQuote = (value) => `'${String(value).replace(/'/g, "''")}'`;
  const setupPath = path.resolve(file), installDir = path.dirname(appExecutable);
  const command = `$ErrorActionPreference='Stop'; Start-Sleep -Seconds 2; $setup=${psQuote(setupPath)}; $app=${psQuote(appExecutable)}; $proc=Start-Process -FilePath $setup -ArgumentList '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /CLOSEAPPLICATIONS /AUTOMATICUPDATE' -Wait -PassThru; if ($proc.ExitCode -eq 0) { Start-Process -FilePath $app -WorkingDirectory ${psQuote(installDir)} };`;
  const runner = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], { detached: true, windowsHide: true, stdio: 'ignore' });
  runner.once('error', (error) => launcherLog(`Could not start the BananaForge installer: ${error.message}`));
  runner.unref();
  updateEvent({ status: 'installing', version, message: `BananaForge ${version} is ready. Restarting to install the update…` });
  launcherLog(`Launching verified BananaForge ${version} installer.`);
  setTimeout(() => app.quit(), 2200);
  return true;
}

let appUpdateCheckPromise = null;
async function checkBananaForgeUpdate({ force = false, install = state.settings.autoUpdateApp !== false } = {}) {
  if (appUpdateCheckPromise) return appUpdateCheckPromise;
  if (state.settings.autoUpdateApp === false && !force) return { status: 'disabled' };
  if (!app.isPackaged || process.platform !== 'win32') return { status: 'unsupported' };
  appUpdateCheckPromise = (async () => {
    updateEvent({ status: 'checking', currentVersion: app.getVersion() });
    const response = await fetch('https://api.github.com/repos/B1progame/bananaforge-launcher/releases?per_page=100', {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': `BananaForge/${app.getVersion()}` },
      signal: AbortSignal.timeout(25000)
    });
    if (!response.ok) throw new Error(`Could not check the BananaForge release (HTTP ${response.status}).`);
    const releases = await response.json();
    const desktopReleases = (Array.isArray(releases) ? releases : [])
      .filter((item) => !item.draft && !item.prerelease && /^desktop-v\d+\.\d+\.\d+$/.test(item.tag_name || ''))
      .sort((a, b) => compareVersions(b.tag_name.slice('desktop-v'.length), a.tag_name.slice('desktop-v'.length)));
    const release = desktopReleases[0];
    if (!release) {
      updateEvent({ status: 'current', currentVersion: app.getVersion(), message: 'No desktop installer release is published yet.' });
      return { status: 'current', version: app.getVersion() };
    }
    const version = release.tag_name.slice('desktop-v'.length);
    if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('The latest BananaForge desktop release has an invalid version tag.');
    if (compareVersions(version, app.getVersion()) <= 0) {
      updateEvent({ status: 'current', currentVersion: app.getVersion(), version });
      return { status: 'current', version };
    }
    if (!install) {
      const message = `BananaForge ${version} is available. Review the release and choose Install update when you’re ready.`;
      updateEvent({ status: 'available', currentVersion: app.getVersion(), version, message, releaseUrl: release.html_url });
      return { status: 'available', version, releaseUrl: release.html_url };
    }
    const filename = `BananaForge-Setup-${version}.exe`;
    const installerAsset = (release.assets || []).find((asset) => asset.name.toLowerCase() === filename.toLowerCase());
    const checksumAsset = (release.assets || []).find((asset) => asset.name.toLowerCase() === `${filename}.sha256`.toLowerCase());
    if (!installerAsset || (!installerAsset.digest && !checksumAsset)) {
      throw new Error(`BananaForge ${version} is published without a verifiable Windows installer/checksum. No update was installed.`);
    }
    updateEvent({ status: 'downloading', version, message: `Downloading BananaForge ${version}…` });
    const fileRoot = path.join(storageRoot, 'updates');
    await fs.promises.mkdir(fileRoot, { recursive: true });
    const file = path.join(fileRoot, filename);
    const temporary = `${file}.download`;
    await fs.promises.rm(temporary, { force: true });
    const installerResponse = await fetchGithubReleaseAsset(installerAsset);
    await pipeline(installerResponse.body, fs.createWriteStream(temporary, { flags: 'wx' }));
    const hash = crypto.createHash('sha256');
    for await (const chunk of fs.createReadStream(temporary)) hash.update(chunk);
    const actualHash = hash.digest('hex');
    let expectedHash = String(installerAsset.digest || '').replace(/^sha256:/i, '').toLowerCase();
    if (!expectedHash && checksumAsset) {
      const checksumResponse = await fetchGithubReleaseAsset(checksumAsset, { limit: 4096 });
      const checksumText = await checksumResponse.text();
      expectedHash = checksumText.match(/\b([a-f0-9]{64})\b/i)?.[1]?.toLowerCase() || '';
    }
    if (!/^[a-f0-9]{64}$/.test(expectedHash) || actualHash !== expectedHash) {
      await fs.promises.rm(temporary, { force: true });
      throw new Error('The BananaForge update checksum did not match. The downloaded installer was discarded.');
    }
    await fs.promises.rename(temporary, file);
    if (!await launchVerifiedBananaForgeUpdate(file, version)) return { status: 'downloaded', version };
    return { status: 'installing', version };
  })().catch((error) => {
    const message = String(error.message || error);
    launcherLog(`BananaForge update check failed: ${message}`);
    updateEvent({ status: 'failed', message: `BananaForge update check failed: ${message}` });
    throw error;
  }).finally(() => { appUpdateCheckPromise = null; });
  return appUpdateCheckPromise;
}

let gameUpdateCheckPromise = null;
async function checkManagedGameUpdate({ force = false } = {}) {
  if (gameUpdateCheckPromise) return gameUpdateCheckPromise;
  if (state.settings.autoUpdateGame === false && !force) return { status: 'disabled' };
  gameUpdateCheckPromise = (async () => {
    const sourceRoot = originalGameRoot();
    const managedRoot = btd6Executable(state.settings.instancePath) ? gameRoot() : '';
    const buildId = steamBuildId(sourceRoot);
    if (!sourceRoot || !managedRoot || !buildId) return { status: 'unavailable' };
    if (gameLaunching || setupController || autoUpdateJob || await isBtd6ProcessRunning()) {
      const busy = { status: 'busy', buildId, message: 'Steam sync waits until BTD6 closes.' };
      gameUpdateEvent(busy);
      return busy;
    }
    const previousBuildId = String(state.settings.managedGameBuildId || '');
    if (previousBuildId === buildId) {
      const current = { status: 'current', buildId, message: `Managed copy matches Steam build ${buildId}.` };
      gameUpdateEvent(current);
      return current;
    }
    if (!previousBuildId) {
      gameUpdateEvent({ status: 'checking', message: 'Checking Steam files against the managed BTD6 copy…' });
      const result = await syncGameUpdate();
      const payload = result.copied
        ? { status: 'updated', buildId, copied: result.copied, baseline: true }
        : { status: 'current', buildId, baseline: true, message: `Steam build ${buildId} recorded. New Steam builds will sync automatically.` };
      gameUpdateEvent(payload);
      return payload;
    }
    gameUpdateEvent({ status: 'checking', message: `Steam BTD6 build ${buildId} is ready; updating the managed copy…` });
    const result = await syncGameUpdate();
    const payload = { status: 'updated', buildId, copied: result.copied || 0 };
    gameUpdateEvent(payload);
    return payload;
  })().catch((error) => {
    const message = String(error.message || error);
    launcherLog(`Automatic BTD6 copy update failed: ${message}`);
    gameUpdateEvent({ status: 'failed', message });
    return { status: 'failed', message };
  }).finally(() => { gameUpdateCheckPromise = null; });
  return gameUpdateCheckPromise;
}

function isBtd6ProcessRunning() {
  if (process.env.BANANAFORGE_TEST_MODE === '1') return Promise.resolve(false);
  if (process.platform !== 'win32') return Promise.resolve(false);
  return new Promise((resolve, reject) => {
    execFile('tasklist.exe', ['/FI', 'IMAGENAME eq BloonsTD6.exe', '/FO', 'CSV', '/NH'], { windowsHide: true }, (error, stdout) => {
      if (error) return reject(new Error(`Could not check whether BloonsTD6 is running: ${error.message}`));
      resolve(/^\s*"BloonsTD6\.exe"/im.test(stdout));
    });
  });
}

async function refreshExternalGameStatus() {
  if (gameProcessPollBusy) return;
  gameProcessPollBusy = true;
  try {
    const listed = await isBtd6ProcessRunning();
    gameProcessPollError = '';
    const external = listed && !(gameProcess && gameProcess.exitCode === null);
    if (external !== externalGameRunning) {
      externalGameRunning = external;
      send('game:changed', { running: Boolean(gameProcess) || external, external });
    }
  } catch (error) {
    const message = String(error.message || error);
    if (message !== gameProcessPollError) launcherLog(message);
    gameProcessPollError = message;
  }
  finally { gameProcessPollBusy = false; }
}

async function ensureBtd6Closed() {
  if (await isBtd6ProcessRunning()) throw new Error('BloonsTD6 is already running. Close the game before switching profiles, changing installed mods, or launching it again.');
}

async function requestBtd6Close() {
  if (process.platform !== 'win32') throw new Error('Closing BTD6 from BananaForge is currently supported on Windows only.');
  if (!(await isBtd6ProcessRunning())) {
    externalGameRunning = false;
    send('game:changed', { running: Boolean(gameProcess), external: false });
    return { closed: true, alreadyClosed: true };
  }

  await new Promise((resolve, reject) => {
    execFile('taskkill.exe', ['/IM', 'BloonsTD6.exe'], { windowsHide: true }, (error, stdout, stderr) => {
      // tasklist can go stale between the check and this request. Recheck below
      // before surfacing an error so a game that just exited counts as closed.
      if (error && error.code !== 128) return reject(new Error((stderr || stdout || error.message || 'Windows could not request BTD6 to close.').trim()));
      resolve();
    });
  });

  for (let attempt = 0; attempt < 16; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (!(await isBtd6ProcessRunning())) {
      externalGameRunning = false;
      const launchedProcessActive = Boolean(gameProcess && gameProcess.exitCode === null);
      send('game:changed', { running: launchedProcessActive, external: false });
      launcherLog('Close request sent to BloonsTD6; process exited.');
      return { closed: true, alreadyClosed: false };
    }
  }

  externalGameRunning = true;
  send('game:changed', { running: true, external: true });
  return { closed: false, message: 'Windows asked BTD6 to close, but it is still running. Save your game and close it from the game window.' };
}

function send(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
  try { mainWindow.webContents.send(channel, payload); }
  catch (error) { launcherLog(`Could not send ${channel} to the renderer: ${error.message || error}`); }
}

ipcMain.on('renderer:error', (_event, message) => {
  const detail = String(message || '').replace(/[\r\n]+/g, ' ').slice(0, 2000);
  if (detail) launcherLog(`Renderer error: ${detail}`);
});

function safeModName(file) {
  const name = path.basename(file);
  if (!name.toLowerCase().endsWith(".dll")) {
    throw new Error("BananaForge currently installs compiled .dll mods. Archives must be reviewed and extracted first.");
  }
  return name;
}

function syncActiveProfile(duringLaunch = false) {
  if (!duringLaunch) ensureGameStopped();
  const root = btd6Executable(state.settings.instancePath) ? gameRoot() : "";
  const source = profileRoot();
  fs.mkdirSync(source, { recursive: true });
  const files = profileMods().filter((name) => !(profileById().disabledMods || []).includes(name));
  if (!root) return files;
  const originalRoot = originalGameRoot();
  if (originalRoot && fs.existsSync(originalRoot)) assertSeparateGameRoots(originalRoot, root);
  const modsFolder = path.join(root, "Mods");
  fs.mkdirSync(modsFolder, { recursive: true });

  for (const oldFile of state.managedFiles || []) {
    const target = path.join(modsFolder, path.basename(oldFile));
    if (fs.existsSync(target)) fs.rmSync(target);
  }

  for (const name of files) fs.copyFileSync(path.join(source, name), path.join(modsFolder, name));
  state.managedFiles = files;
  saveState();
  return files;
}

function installModFile(file, profileId = state.activeProfileId) {
  ensureGameStopped();
  if (!file || !fs.existsSync(file)) throw new Error("The downloaded mod file is no longer available.");
  const destination = profileRoot(profileId);
  const name = safeModName(file);
  fs.mkdirSync(destination, { recursive: true });
  const target = path.join(destination, name);
  const stage = `${target}.bananaforge-${crypto.randomUUID()}.new`;
  fs.copyFileSync(file, stage);
  try { fs.renameSync(stage, target); }
  finally { try { fs.rmSync(stage, { force: true }); } catch {} }
  const profile = profileById(profileId);
  profile.lastAutoUpdateAt = null;
  profile.disabledMods = (profile.disabledMods || []).filter((item) => item !== name);
  profile.updateSources ||= {};
  const record = state.downloads.find((item) => item.state === 'completed' && path.resolve(item.path) === path.resolve(file));
  const release = record && workspace.githubReleaseReference(record.url);
  if (release) {
    const bytes = fs.readFileSync(target);
    profile.updateSources[name] = { repository: release.repository, asset: release.asset, url: record.url, version: '', versionVerified: false, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), status: 'tracked' };
  } else delete profile.updateSources[name];
  profile.updatedAt = new Date().toISOString();
  writeProfileManifest(profileId);
  if (profileId === state.activeProfileId) syncActiveProfile();
  saveState();
  return profileMods(profileId);
}

function ensureGameStopped() {
  if (gameLaunching || autoUpdateJob || (gameProcess && gameProcess.exitCode === null)) throw new Error('Wait for the game and automatic mod updates to finish before changing profiles or game files.');
}

function runtimeInstalled() {
  const root = btd6Executable(state.settings.instancePath) ? gameRoot() : '';
  return Boolean(root && fs.existsSync(path.join(root, 'version.dll')) && fs.existsSync(path.join(root, 'MelonLoader')));
}

function detectedUnityVersion() {
  const local = path.join(process.env.USERPROFILE || app.getPath('home'), 'AppData', 'LocalLow', 'Ninja Kiwi', 'BloonsTD6', 'Player.log');
  const root = gameRoot();
  const candidates = [
    ...(root ? [path.join(root, 'MelonLoader', 'Latest.log'), path.join(root, 'MelonLoader', 'Logs', 'Latest.log')] : []),
    local
  ];
  for (const file of candidates) {
    try {
      const stat = fs.statSync(file);
      if (!stat.isFile() || stat.size > 8 * 1024 * 1024) continue;
      const text = fs.readFileSync(file, 'utf8');
      const match = text.match(/(?:Unity(?:\s+Engine)?\s+Version|UnityVersion)\s*[:=]\s*(\d+\.\d+\.\d+f\d+)/i)
        || text.match(/Initialize engine version:\s*(\d+\.\d+\.\d+f\d+)/i);
      if (match) return match[1];
    } catch { /* A missing log simply means the build has not been identified yet. */ }
  }
  return null;
}

async function refreshMelonLoaderRecommendation(force = false) {
  if (!force && Date.now() - melonLoaderRecommendationCheckedAt < 6 * 60 * 60 * 1000) return melonLoaderRecommendation;
  if (melonLoaderRecommendationRequest) return melonLoaderRecommendationRequest;
  melonLoaderRecommendationRequest = (async () => {
    const unityVersion = detectedUnityVersion();
    const headers = { 'User-Agent': `BananaForge/${app.getVersion()}`, Accept: 'application/vnd.github+json' };
    const timeout = () => AbortSignal.timeout(12000);
    const requests = await Promise.allSettled([
      fetch('https://api.github.com/repos/LavaGang/MelonLoader/releases/latest', { headers, signal: timeout() }),
      fetch('https://raw.githubusercontent.com/gurrenm3/BTD-Mod-Helper/master/messages.json', { headers, signal: timeout() })
    ]);
    let latestStableVersion = null;
    let releaseChecked = false;
    try {
      const response = requests[0].status === 'fulfilled' ? requests[0].value : null;
      if (response?.ok) {
        const release = await response.json();
        if (!release.prerelease && /^v?\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/i.test(release.tag_name || '')) {
          latestStableVersion = release.tag_name.startsWith('v') ? release.tag_name : `v${release.tag_name}`;
          releaseChecked = true;
        }
      }
    } catch { /* Keep the verified local recommendation when release data is unavailable. */ }
    let compatibilityDataChecked = false;
    let compatibilityRuleCount = 0;
    try {
      const response = requests[1].status === 'fulfilled' ? requests[1].value : null;
      if (response?.ok) {
        const rules = await response.json();
        compatibilityDataChecked = Array.isArray(rules);
        compatibilityRuleCount = compatibilityDataChecked ? rules.filter((rule) => rule && (rule.UnityVersionMin || rule.MelonLoaderVersionMax)).length : 0;
      }
    } catch { /* The version choice still uses known-good local launch evidence. */ }

    const isVerifiedBuild = unityVersion === verifiedMelonLoader.unityVersion;
    const buildUndetected = !unityVersion;
    const recommendedVersion = isVerifiedBuild || buildUndetected
      ? verifiedMelonLoader.version
      : latestStableVersion || verifiedMelonLoader.version;
    const status = isVerifiedBuild
      ? `Recommended: ${recommendedVersion} stable. It is the version verified with BTD6 Unity ${verifiedMelonLoader.unityVersion}.${latestStableVersion && latestStableVersion !== recommendedVersion ? ` The newer official stable ${latestStableVersion} has not been verified with this build.` : ''}`
      : unityVersion
        ? `${latestStableVersion ? `Official latest stable is ${recommendedVersion}` : `Official release lookup failed; the fallback is ${recommendedVersion}`}, but this BTD6 Unity build (${unityVersion}) has no local launch verification yet. Nightly builds are not recommended automatically.`
        : `Game build not detected yet. Use the last locally verified ${recommendedVersion} stable for Unity ${verifiedMelonLoader.unityVersion}.${latestStableVersion ? ` The official latest stable is ${latestStableVersion}, but has not been confirmed for your build.` : ' Official release lookup is unavailable right now.'}`;
    const next = {
      recommendedVersion,
      latestStableVersion,
      gameUnityVersion: unityVersion,
      confidence: isVerifiedBuild ? 'verified' : buildUndetected || !latestStableVersion ? 'last-known-good' : 'official-latest-unverified',
      status,
      checkedAt: new Date().toISOString(),
      releaseChecked,
      compatibilityDataChecked,
      compatibilityRuleCount,
      sources: [
        { label: 'MelonLoader official releases', url: 'https://github.com/LavaGang/MelonLoader/releases' },
        { label: 'BTD Mod Helper compatibility rules', url: 'https://github.com/gurrenm3/BTD-Mod-Helper/blob/master/messages.json' }
      ]
    };
    melonLoaderRecommendation = next;
    melonLoaderRecommendationCheckedAt = Date.now();
    launcherLog(`MelonLoader version advice: ${recommendedVersion}; latest stable ${latestStableVersion || 'unavailable'}; Unity ${unityVersion || 'not detected'}; official release source ${releaseChecked ? 'checked' : 'unavailable'}; Mod Helper compatibility source ${compatibilityDataChecked ? 'checked' : 'unavailable'} (${compatibilityRuleCount} rules).`);
    return next;
  })().finally(() => { melonLoaderRecommendationRequest = null; });
  return melonLoaderRecommendationRequest;
}

function publishAutoUpdate(job) {
  send('mods:auto-update', job);
}

async function checkProfileModUpdates(profileId = state.activeProfileId, { force = false, duringLaunch = false } = {}) {
  if (!force && !state.settings.autoUpdateMods) return { status: 'disabled', updated: 0, checked: 0, skipped: 0 };
  if (autoUpdateJob) {
    if (autoUpdateJob.profileId === profileId) return autoUpdateJob.promise;
    throw new Error('Another profile is checking for mod updates.');
  }
  const profile = profileById(profileId);
  if (!profile) throw new Error('Profile not found.');
  const now = Date.now();
  if (!force && !duringLaunch && profile.lastAutoUpdateAt && now - Date.parse(profile.lastAutoUpdateAt) < 6 * 60 * 60 * 1000) {
    return { status: 'recent', updated: 0, checked: 0, skipped: 0, checkedAt: profile.lastAutoUpdateAt };
  }
  if (gameLaunching && !duringLaunch) throw new Error('Wait for the game launch to finish before checking mod updates.');
  const names = profileMods(profileId);
  const job = { profileId, status: 'checking', updated: 0, checked: 0, skipped: 0, failed: 0, total: names.length, checkedAt: new Date().toISOString(), mods: [] };
  const controller = new AbortController();
  const promise = Promise.resolve().then(async () => {
    publishAutoUpdate(job);
    const cache = new Map();
    for (const name of names) {
      let source = profile.updateSources[name];
      const entry = { name, status: source ? 'checking' : 'discovering' };
      job.mods.push(entry); publishAutoUpdate(job);
      try {
        const file = path.join(profileRoot(profileId), name);
        const localHash = crypto.createHash('sha256').update(await fs.promises.readFile(file)).digest('hex');
        if (!source) {
          let thunderstoreSource = null;
          try { thunderstoreSource = await workspace.discoverThunderstoreModSource(name, controller.signal); }
          catch (error) { launcherLog(`Thunderstore source discovery for ${name}: ${error.message || error}`); }
          const knownRepository = knownModRepositories[name.toLowerCase()];
          let githubSource = null;
          if (!thunderstoreSource && !knownRepository) {
            try { githubSource = await workspace.discoverGitHubModSource(name, controller.signal); }
            catch (error) { launcherLog(`GitHub source discovery for ${name}: ${error.message || error}`); }
          }
          const repository = thunderstoreSource?.repository || knownRepository || githubSource?.repository;
          if (!repository) {
            entry.status = 'manual';
            entry.note = 'No verified source was found in the BTD6 Thunderstore catalog or BananaForge’s known sources. Connect the author’s release source to enable updates.';
            job.skipped += 1; publishAutoUpdate(job); continue;
          }
          if (thunderstoreSource) {
            source = profile.updateSources[name] = {
              repository, asset: thunderstoreSource.asset, url: thunderstoreSource.url, version: '', sha256: localHash,
              status: 'tracked', lastCheckedAt: null, versionVerified: false, autoDiscovered: true, sourceDiscovery: 'thunderstore'
            };
          } else if (githubSource) {
            source = profile.updateSources[name] = {
              repository, asset: githubSource.asset, url: githubSource.url, version: '', sha256: localHash,
              status: 'tracked', lastCheckedAt: null, versionVerified: false, autoDiscovered: true, sourceDiscovery: 'github'
            };
          } else {
            const declaredDll = await workspace.modHelperDllName(repository, null, controller.signal);
            const release = await workspace.latestReleaseAssetMatching(repository, [name, declaredDll], controller.signal);
            source = profile.updateSources[name] = {
              repository, asset: release.asset.name, url: release.url, version: '', sha256: localHash,
              status: 'tracked', lastCheckedAt: null, versionVerified: false, autoDiscovered: true
            };
          }
          writeProfileManifest(profileId); saveState();
          entry.status = 'checking'; publishAutoUpdate(job);
        }
        if (source.sha256 && localHash !== source.sha256) throw new Error('The local DLL changed since it was installed; automatic updates were skipped.');
        const result = await workspace.updateTrackedMod(source, path.join(downloadRoot(), 'mod-updates'), controller.signal, (progress) => {
          entry.received = progress.received; entry.total = progress.total; publishAutoUpdate(job);
        }, cache, force || duringLaunch);
        source.lastCheckedAt = new Date().toISOString();
        delete source.lastError;
        if (result.upToDate) {
          source.version = result.version || source.version || '';
          if (result.sha256) source.sha256 = result.sha256;
          source.versionVerified = true;
          source.status = 'current'; entry.status = 'current'; job.checked += 1;
        } else {
          const staged = `${file}.bananaforge-${crypto.randomUUID()}.new`;
          try {
            await fs.promises.copyFile(result.path, staged);
            controller.signal.throwIfAborted();
            await fs.promises.rename(staged, file);
          } finally { await fs.promises.rm(staged, { force: true }); }
          source.url = result.url; source.version = result.version; source.sha256 = result.sha256; source.versionVerified = true; source.status = 'updated';
          state.downloads.unshift({ id: crypto.randomUUID(), ...result, received: fs.statSync(file).size, total: fs.statSync(file).size, state: 'completed', startedAt: new Date().toISOString(), updateFor: profileId });
          entry.status = 'updated'; entry.version = result.version; job.updated += 1;
          send('downloads:changed', state.downloads);
        }
      } catch (error) {
        const failure = String(error.message || error).slice(0, 240);
        if (source) {
          source.status = controller.signal.aborted ? 'cancelled' : 'failed';
          source.lastError = failure;
        }
        entry.status = controller.signal.aborted ? 'cancelled' : 'failed';
        entry.note = failure; job.failed += 1;
        launcherLog(`Auto-update ${name}: ${failure}`);
      }
      writeProfileManifest(profileId); saveState(); publishAutoUpdate(job);
    }
    if (job.updated && profileId === state.activeProfileId) {
      if (await isBtd6ProcessRunning() || (gameProcess && gameProcess.exitCode === null)) {
        job.syncPending = true;
        launcherLog('Updated profile mods are ready; they will sync into the managed game after BloonsTD6 closes.');
      } else syncActiveProfile(true);
    }
    if (!job.failed) profile.lastAutoUpdateAt = new Date().toISOString();
    job.status = job.failed ? job.updated ? 'partial' : 'failed' : 'complete';
    job.checkedAt = profile.lastAutoUpdateAt || new Date().toISOString();
    saveState(); writeProfileManifest(profileId); publishAutoUpdate(job);
    launcherLog(`Mod update check ${profile.name}: ${job.updated} updated, ${job.checked} current, ${job.failed} failed.`);
    return job;
  }).catch((error) => {
    job.status = 'failed'; job.error = String(error.message || error).slice(0, 240);
    launcherLog(`Mod update check failed: ${job.error}`);
    throw error;
  }).finally(() => {
    autoUpdateJob = null;
    publishAutoUpdate({ ...job, status: job.status });
  });
  autoUpdateJob = { profileId, promise, controller, duringLaunch };
  return promise;
}

function scheduleAutoUpdate(profileId, { force = false } = {}) {
  void checkProfileModUpdates(profileId, { force }).catch((error) => {
    launcherLog(`Automatic mod update check failed: ${error.message || error}`);
  });
}

function cleanAccent(value) {
  return ['amber', 'mint', 'blue', 'violet', 'rose'].includes(value) ? value : 'amber';
}

function launcherLog(message) {
  try {
    const root = path.join(storageRoot, 'logs');
    fs.mkdirSync(root, { recursive: true });
    const file = path.join(root, 'launcher.log');
    if (fs.existsSync(file) && fs.statSync(file).size > 2 * 1024 * 1024) fs.renameSync(file, file + '.previous');
    fs.appendFileSync(file, `[${new Date().toISOString()}] ${message}\n`);
  } catch { /* Logging must not prevent the launcher from working. */ }
}

process.on('uncaughtExceptionMonitor', (error, origin) => {
  launcherLog(`Main process fatal error (${origin}): ${error?.stack || error}`);
});
process.on('unhandledRejection', (reason) => {
  launcherLog(`Unhandled main-process rejection: ${reason?.stack || reason}`);
});

function handle(channel, callback) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      if (setupController && /^(settings:save|profiles:(activate|delete)|mods:(install|install-download|remove|toggle|auto-update|track-update|track-known-update))$/.test(channel)) throw new Error('Wait for setup to finish before changing game files or profiles.');
      if (autoUpdateJob && /^(settings:save|profiles:(activate|delete)|mods:(install|install-download|remove|toggle|track-update|track-known-update))$/.test(channel)) throw new Error('Wait for automatic mod updates to finish before changing this profile.');
      if (/^(profiles:activate|mods:(install|install-download|remove|toggle|track-update|track-known-update))$/.test(channel)) await ensureBtd6Closed();
      return await callback(event, ...args);
    }
    catch (error) { launcherLog(`${channel}: ${error.stack || error.message}`); throw error; }
  });
}

function logFiles() {
  const candidates = [{ label: 'BananaForge launcher', file: path.join(storageRoot, 'logs', 'launcher.log') }];
  const root = btd6Executable(state.settings.instancePath) ? gameRoot() : originalGameRoot();
  if (root) {
    candidates.push({ label: 'MelonLoader · Latest.log', file: path.join(root, 'MelonLoader', 'Latest.log') });
    for (const folder of [path.join(root, 'MelonLoader', 'Logs'), path.join(root, 'MelonLoader')]) {
      try {
        const entries = fs.readdirSync(folder, { withFileTypes: true }).filter((entry) => entry.isFile() && /\.log$/i.test(entry.name));
        entries.sort((a, b) => fs.statSync(path.join(folder, b.name)).mtimeMs - fs.statSync(path.join(folder, a.name)).mtimeMs);
        for (const entry of entries.slice(0, 20)) candidates.push({ label: `MelonLoader · ${entry.name}`, file: path.join(folder, entry.name) });
      } catch { /* A game may not have generated logs yet. */ }
    }
  }
  const windowsCrash = latestWindowsGameCrash(0);
  if (windowsCrash?.file) candidates.push({ label: 'Windows · Latest BTD6 crash report', file: windowsCrash.file });
  const local = process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local');
  candidates.push({ label: 'Unity · Player.log', file: path.join(path.dirname(local), 'LocalLow', 'Ninja Kiwi', 'BloonsTD6', 'Player.log') });
  const crashRoot = path.join(process.env.USERPROFILE || app.getPath('home'), 'AppData', 'LocalLow', 'Ninja Kiwi', 'BloonsTD6');
  try {
    const crashes = fs.readdirSync(crashRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /^Crash_.*\.log$/i.test(entry.name))
      .map((entry) => ({ name: entry.name, file: path.join(crashRoot, entry.name) }))
      .sort((a, b) => fs.statSync(b.file).mtimeMs - fs.statSync(a.file).mtimeMs);
    for (const entry of crashes.slice(0, 10)) candidates.push({ label: `Unity · ${entry.name}`, file: entry.file });
  } catch { /* No Unity crash report directory yet. */ }
  const seen = new Set();
  return candidates.filter((item) => {
    if (seen.has(item.file.toLowerCase()) || !fs.existsSync(item.file) || !fs.statSync(item.file).isFile()) return false;
    seen.add(item.file.toLowerCase()); return true;
  }).map((item) => ({ ...item, id: crypto.createHash('sha256').update(item.file).digest('hex').slice(0, 16) }));
}

function selectedLog(id) {
  const item = logFiles().find((entry) => entry.id === id);
  if (!item) throw new Error('This log is no longer available. Refresh the log list.');
  return item;
}

function publishSetup() {
  send('setup:progress', setupJob);
}

async function runSetup(options) {
  ensureGameStopped();
  if (setupController) throw new Error('A setup job is already running.');
  const ids = [...new Set(options.packages || [])];
  if (!ids.length || ids.some((id) => !['managed-copy', 'melonloader', 'modhelper'].includes(id))) throw new Error('Select at least one supported package.');
  const selectedProfile = profileById(options.profileId || state.activeProfileId);
  if (!selectedProfile) throw new Error('Select a valid profile for Mod Helper.');
  const target = path.resolve(options.managedPath || state.settings.managedInstallPath || path.join(storageRoot, 'Instances', 'BTD6'));
  if (/\.exe$/i.test(target)) throw new Error('Choose a folder for the managed game, not an executable.');
  if (options.downloadPath) {
    state.settings.downloadPath = path.resolve(options.downloadPath);
    fs.mkdirSync(state.settings.downloadPath, { recursive: true });
  }
  state.settings.managedInstallPath = target;
  setupController = new AbortController();
  const signal = setupController.signal;
  setupJob = { status: 'running', startedAt: new Date().toISOString(), steps: ids.map((id) => ({ id, status: 'pending', received: 0, total: 0 })) };
  publishSetup();
  try {
    for (const step of setupJob.steps) {
      signal.throwIfAborted();
      step.status = 'running'; publishSetup();
      const progress = (value) => { Object.assign(step, value); publishSetup(); };
      if (step.id === 'managed-copy') {
        const source = originalGameRoot();
        if (!source) throw new Error('Choose your original BloonsTD6.exe before creating a managed copy.');
        const result = await workspace.copyManagedGame(source, target, signal, progress);
        state.settings.gamePath = source;
        state.settings.instancePath = result.target;
        state.settings.managedGameBuildId = result.existing ? '' : steamBuildId(source);
        step.note = result.existing ? 'Using the existing managed copy.' : `Copied ${result.copied} game files.`;
      } else {
        const result = await workspace.downloadPackage(step.id, downloadRoot(), signal, progress);
        state.downloads.unshift({ id: crypto.randomUUID(), ...result, received: step.received, total: step.total, state: 'completed', startedAt: new Date().toISOString() });
        if (step.id === 'melonloader') {
          state.settings.melonLoaderPath = result.path;
          step.note = 'Downloaded. Open the installer and select the managed BloonsTD6.exe to install the runtime.';
        } else {
          installModFile(result.path, selectedProfile.id);
          step.note = `Added ${result.version} to ${selectedProfile.name}.`;
        }
        send('downloads:changed', state.downloads);
      }
      step.status = 'completed'; saveState(); publishSetup();
      launcherLog(`Setup ${step.id} completed.`);
    }
    setupJob.status = 'completed';
    state.settings.firstRunComplete = true; saveState();
    return setupJob;
  } catch (error) {
    setupJob.status = signal.aborted ? 'cancelled' : 'failed';
    const step = setupJob.steps.find((item) => item.status === 'running');
    if (step) { step.status = setupJob.status; step.note = signal.aborted ? 'Cancelled. Completed packages were kept.' : error.message; }
    launcherLog(`Setup ${setupJob.status}: ${error.message}`);
    throw error;
  } finally { setupController = null; saveState(); publishSetup(); }
}

function registerDownloadHandler(targetSession) {
  if (registeredDownloadSessions.has(targetSession)) return;
  registeredDownloadSessions.add(targetSession);
  targetSession.on("will-download", (_event, item) => {
    const id = crypto.randomUUID();
    activeDownloads.set(id, item);
    const fileName = path.basename(item.getFilename());
    const isMelonLoader = melonLoaderDownloads.has(item.getURL()) || melonLoaderDownloads.has(fileName);
    const root = path.join(isMelonLoader ? melonLoaderRoot() : downloadRoot(), id);
    fs.mkdirSync(root, { recursive: true });
    const savePath = path.join(root, fileName);
    item.setSavePath(savePath);
    const record = { id, name: fileName, path: savePath, url: item.getURL(), received: 0, total: item.getTotalBytes(), state: "progressing", startedAt: new Date().toISOString() };
    state.downloads.unshift(record);
    saveState();
    send("downloads:changed", state.downloads);
    item.on("updated", (_updateEvent, downloadState) => {
      record.received = item.getReceivedBytes();
      record.total = item.getTotalBytes();
      record.state = downloadState;
      send("downloads:changed", state.downloads);
    });
    item.once("done", (_doneEvent, downloadState) => {
      activeDownloads.delete(id);
      record.received = item.getReceivedBytes();
      record.total = item.getTotalBytes();
      record.state = downloadState;
      if (isMelonLoader) {
        melonLoaderDownloads.delete(record.url);
        melonLoaderDownloads.delete(record.name);
        if (downloadState === "completed") {
          state.settings.melonLoaderPath = savePath;
          send("melonloader:downloaded", { path: savePath, name: record.name });
        }
      }
      saveState();
      send("downloads:changed", state.downloads);
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    show: process.env.BANANAFORGE_TEST_MODE !== '1',
    width: 1480,
    height: 920,
    minWidth: 1120,
    minHeight: 700,
    backgroundColor: "#191a1d",
    title: "BananaForge",
    icon: path.join(__dirname, "assets", "bananaforge.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true
    }
  });
  // Electron's default application menu creates a native File/Edit/View bar on Windows.
  // This launcher uses its own in-window navigation, so remove the native menu entirely.
  mainWindow.removeMenu();

  mainWindow.on('unresponsive', () => launcherLog('The BananaForge window stopped responding.'));
  mainWindow.on('responsive', () => launcherLog('The BananaForge window is responding again.'));
  mainWindow.webContents.on('console-message', (_event, details) => {
    if (details?.level >= 2) launcherLog(`Renderer console error: ${String(details.message || '').slice(0, 1600)}`);
  });
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (isMainFrame && errorCode !== -3) launcherLog(`Renderer failed to load (${errorCode}): ${errorDescription} ${validatedURL}`);
  });
  mainWindow.webContents.on('did-finish-load', () => { rendererRecoveryAttempts = 0; });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    rendererRecoveryAttempts += 1;
    launcherLog(`Renderer process exited (${details.reason}, code ${details.exitCode}); recovery attempt ${rendererRecoveryAttempts}.`);
    if (rendererRecoveryAttempts > 3) {
      launcherLog('Renderer recovery stopped after three failed reloads. Restart BananaForge to try again.');
      return;
    }
    const window = mainWindow;
    setTimeout(() => {
      if (window && !window.isDestroyed() && window.webContents.isCrashed()) {
        try { window.webContents.reload(); }
        catch (error) { launcherLog(`Renderer recovery failed: ${error.message || error}`); }
      }
    }, Math.min(500 * (2 ** (rendererRecoveryAttempts - 1)), 4000));
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    send("browser:new-tab", url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-attach-webview", (_event, webPreferences) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
  });
}

function openProfileDialog() {
  if (profileDialogWindow && !profileDialogWindow.isDestroyed()) {
    profileDialogWindow.focus();
    return;
  }
  profileDialogWindow = new BrowserWindow({
    width: 520,
    height: 530,
    resizable: false,
    maximizable: false,
    minimizable: false,
    parent: mainWindow,
    modal: true,
    backgroundColor: "#09111d",
    title: "Create BananaForge profile",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  profileDialogWindow.removeMenu();
  profileDialogWindow.loadFile(path.join(__dirname, "renderer", "profile-dialog.html"));
  profileDialogWindow.on("closed", () => { profileDialogWindow = null; });
}

app.whenReady().then(() => {
  readState();
  applyInstallerPaths();
  launcherLog(`BananaForge ${app.getVersion()} started. Workspace: ${storageRoot}`);
  void cleanupOldGameLogs();
  const gameLogCleanupTimer = setInterval(() => { void cleanupOldGameLogs(); }, 6 * 60 * 60 * 1000);
  gameLogCleanupTimer.unref();
  const modLogWatchTimer = setInterval(checkLiveModLogForErrors, 20000);
  modLogWatchTimer.unref();
  createWindow();

  registerDownloadHandler(session.defaultSession);
  registerDownloadHandler(session.fromPartition("persist:bananaforge-browser"));
  void refreshExternalGameStatus();
  setInterval(() => { void refreshExternalGameStatus(); }, 3000);
  if (state.settings.autoUpdateMods) scheduleAutoUpdate(state.activeProfileId);
  if (state.settings.autoUpdateApp !== false) setTimeout(() => { void checkBananaForgeUpdate().catch(() => {}); }, 5000);
  if (state.settings.autoUpdateGame !== false) setTimeout(() => { void checkManagedGameUpdate(); }, 3500);
  const modUpdateTimer = setInterval(() => {
    if (state.settings.autoUpdateMods) scheduleAutoUpdate(state.activeProfileId);
  }, 6 * 60 * 60 * 1000);
  modUpdateTimer.unref();
  const appUpdateTimer = setInterval(() => {
    if (state.settings.autoUpdateApp !== false) void checkBananaForgeUpdate().catch(() => {});
  }, 6 * 60 * 60 * 1000);
  appUpdateTimer.unref();
  const gameUpdateTimer = setInterval(() => {
    if (state.settings.autoUpdateGame !== false) void checkManagedGameUpdate();
  }, 5 * 60 * 1000);
  gameUpdateTimer.unref();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

handle("state:get", async () => {
  externalGameRunning = await isBtd6ProcessRunning() && !(gameProcess && gameProcess.exitCode === null);
  const activeProfileRuntime = writeProfileManifest(state.activeProfileId)?.runtime || null;
  return {
  ...state,
  profiles: state.profiles.map((profile) => ({ ...profile, modCount: profileMods(profile.id).length, enabledCount: profileMods(profile.id).filter((name) => !(profile.disabledMods || []).includes(name)).length })),
  detectedGame: gameExecutable(),
  configuredGamePath: btd6Executable(state.settings.gamePath),
  configuredInstancePath: btd6Executable(state.settings.instancePath) ? gameRoot() : "",
  version: app.getVersion(),
  activeProfileRuntime,
  userDataPath: app.getPath("userData"),
  downloadRoot: downloadRoot(),
  defaultManagedPath: state.settings.managedInstallPath || path.join(storageRoot, 'Instances', 'BTD6'),
  installOptions, setupJob, runtimeInstalled: runtimeInstalled(), recommendedMelonLoaderVersion: `${melonLoaderRecommendation.recommendedVersion} stable`, melonLoaderRecommendation, installerAvailable: Boolean(state.settings.melonLoaderPath && fs.existsSync(state.settings.melonLoaderPath)), gameRunning: Boolean(gameProcess) || externalGameRunning, gameExternalRunning: externalGameRunning, gameLaunching, setupRequested: process.argv.includes('--setup'),
  autoUpdateJob: autoUpdateJob ? { profileId: autoUpdateJob.profileId, status: 'checking' } : null,
  appUpdateStatus: lastAppUpdateStatus,
  gameUpdateStatus: lastGameUpdateStatus
  };
});

handle('loader:recommendation', async (_event, force = false) => refreshMelonLoaderRecommendation(force === true));

handle("profile-dialog:open", () => {
  openProfileDialog();
  return true;
});

handle("profile-dialog:close", () => {
  if (profileDialogWindow && !profileDialogWindow.isDestroyed()) profileDialogWindow.close();
  return true;
});

handle("settings:save", (_event, settings) => {
  if (settings.gamePath && !btd6Executable(settings.gamePath)) {
    throw new Error("Game path must point to the real BloonsTD6.exe file or its containing folder.");
  }
  if (settings.instancePath && !btd6Executable(settings.instancePath)) {
    throw new Error("Managed copy path must contain BloonsTD6.exe.");
  }
  const gamePath = settings.gamePath ?? state.settings.gamePath;
  const instancePath = settings.instancePath ?? state.settings.instancePath;
  const normalizedPath = (value) => value ? path.resolve(value).toLowerCase() : '';
  const managedRootFor = (value) => {
    if (!value) return '';
    const executable = btd6Executable(value);
    return normalizedPath(executable ? path.dirname(executable) : value);
  };
  const gameSourceChanged = settings.gamePath !== undefined && normalizedPath(settings.gamePath) !== normalizedPath(state.settings.gamePath);
  const managedCopyChanged = settings.instancePath !== undefined && managedRootFor(settings.instancePath) !== managedRootFor(state.settings.instancePath);
  const sourceExecutable = btd6Executable(gamePath) || originalGameExecutable();
  if (sourceExecutable && instancePath) {
    assertSeparateGameRoots(
      path.dirname(sourceExecutable),
      path.dirname(btd6Executable(instancePath))
    );
  }
  const enablingAutoUpdates = settings.autoUpdateMods === true && state.settings.autoUpdateMods !== true;
  const enablingAppUpdates = settings.autoUpdateApp === true && state.settings.autoUpdateApp !== true;
  const enablingGameUpdates = settings.autoUpdateGame === true && state.settings.autoUpdateGame !== true;
  state.settings = {
    ...state.settings,
    ...settings,
    managedGameBuildId: gameSourceChanged || managedCopyChanged ? '' : state.settings.managedGameBuildId,
    instancePath: settings.instancePath === undefined
      ? state.settings.instancePath
      : settings.instancePath
        ? path.dirname(btd6Executable(settings.instancePath))
        : ""
  };
  saveState();
  if (enablingAutoUpdates) scheduleAutoUpdate(state.activeProfileId, { force: true });
  if (enablingAppUpdates) void checkBananaForgeUpdate({ force: true }).catch(() => {});
  if (enablingGameUpdates) void checkManagedGameUpdate({ force: true });
  return state.settings;
});

handle("dialog:game", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Choose BloonsTD6.exe",
    properties: ["openFile"],
    filters: [{ name: "Bloons TD 6", extensions: ["exe"] }]
  });
  if (result.canceled) return "";
  const executable = btd6Executable(result.filePaths[0]);
  if (!executable) throw new Error("That is not BloonsTD6.exe. Select the BTD6 executable itself.");
  return executable;
});

handle("dialog:folder", async (_event, title) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: title || "Choose folder",
    properties: ["openDirectory", "createDirectory"]
  });
  return result.canceled ? "" : result.filePaths[0];
});

handle("dialog:melonloader", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Choose MelonLoader installer",
    properties: ["openFile"],
    filters: [{ name: "Applications", extensions: ["exe"] }]
  });
  return result.canceled ? "" : result.filePaths[0];
});

handle("instance:create-copy", () => runSetup({ packages: ["managed-copy"] }));

handle("game:launch", async () => {
  ensureGameStopped();
  await ensureBtd6Closed();
  if (setupController) throw new Error('Wait for setup to finish before launching the game.');
  gameLaunching = true;
  send('game:changed', { running: false, launching: true, launchPhase: 'starting' });
  try {
  if (state.settings.autoUpdateMods) await checkProfileModUpdates(state.activeProfileId, { duringLaunch: true });
  const knownIncompatibleMod = previouslyCrashingMod(state.activeProfileId);
  if (knownIncompatibleMod) {
    const message = `${knownIncompatibleMod.file} reported a compatibility error on the previous launch. Disable it before launching again to avoid another crash.`;
    launcherLog(`${message} MelonLoader log: ${knownIncompatibleMod.logPath}`);
    send('game:mod-warning', { ...knownIncompatibleMod, profileId: state.activeProfileId, message, previousCrash: true });
    return { blockedByMod: knownIncompatibleMod.file };
  }
  const executable = gameExecutable();
  if (!executable) throw new Error("BTD6 was not found. Choose it in Settings or create a managed copy.");
  const managed = Boolean(state.settings.instancePath && btd6Executable(state.settings.instancePath));
  const enabledMods = profileMods().filter((name) => !(profileById().disabledMods || []).includes(name));
  if (enabledMods.length && !managed) throw new Error('Create a managed game copy in Install & setup to play this profile with mods.');
  if (enabledMods.length && !runtimeInstalled()) throw new Error('Install MelonLoader into your managed game first. Open Install & setup, then open the official installer and select the managed BloonsTD6.exe.');
  if (!(await ensureSteamClient())) {
    throw new Error("Steam is not signed in. Sign in to Steam, leave it open, and try launching BTD6 again.");
  }
  let copied = 0;
  let launched = false;
  if (managed && state.settings.autoUpdateGame !== false) send("instance:progress", { message: "Checking the managed BTD6 copy for Steam updates…", busy: true });
  try {
    if (managed) {
      if (state.settings.autoUpdateGame !== false) {
        const update = await syncGameUpdate();
        copied = update.copied;
      }
      // Profile deployment remains separate from the optional Steam-file sync.
      syncActiveProfile(true);
    }
    const launchStartedAt = Date.now();
    const launchProfileId = state.activeProfileId;
    const launchProfile = profileById(launchProfileId);
    launchProfile.lastRun = {
      startedAt: new Date(launchStartedAt).toISOString(),
      mods: enabledMods.map((file) => ({
        file,
        sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(profileRoot(launchProfileId), file))).digest('hex')
      }))
    };
    saveState();
    const args = state.settings.launchArguments
      ? state.settings.launchArguments.match(/(?:[^\s\"]+|\"[^\"]*\")+/g) || []
      : [];
    gameProcess = await launchDetached(
      executable,
      args.map((value) => value.replace(/^\"|\"$/g, "")),
      path.dirname(executable),
      { ...process.env, SteamAppId: '960090', SteamGameId: '960090' }
    );
    const launchedProcess = gameProcess;
    gameLaunchStartedAt = launchStartedAt;
    gameLaunchProfileId = launchProfileId;
    runtimeModWarningToken = '';
    let exitedDuringStartup = false;
    let startupExitCode = null;
    launcherLog(`Game process started: ${executable}, profile: ${profileById().name}, Steam app: 960090`);
    gameProcess.once('exit', (code) => {
      exitedDuringStartup = true;
      startupExitCode = code;
      const crash = latestGameCrashLog(launchStartedAt);
      const windowsCrash = latestWindowsGameCrash(launchStartedAt);
      const incompatibleMod = verifiedModFailure(latestIncompatibleModLog(launchStartedAt, launchProfileId), launchProfileId);
      const incompatibleModToken = modFailureToken(incompatibleMod, launchProfileId);
      if (code !== 0 || crash || windowsCrash) {
        gameProcess = null;
        send('game:changed', { running: false });
        if (incompatibleMod) {
          const message = `BTD6 crashed after ${incompatibleMod.file} reported a mod compatibility error. Disable this mod in the notification to launch with the remaining mods.`;
          launcherLog(`${message} Mod error: ${incompatibleMod.detail} MelonLoader log: ${incompatibleMod.logPath}`);
          if (incompatibleModToken !== runtimeModWarningToken) send('game:mod-warning', { ...incompatibleMod, profileId: launchProfileId, message, previousCrash: false });
        } else {
          const message = gameCrashMessage(crash, code, windowsCrash);
          const logPath = crash?.file || windowsCrash?.file || '';
          launcherLog(`${message}${logPath ? ` Crash report: ${logPath}` : ''}`);
          send('game:crashed', { code, message, logPath });
        }
      } else {
        launcherLog(`Game exited normally with code ${code}.`);
        gameProcess = null;
        send('game:changed', { running: false });
        if (incompatibleMod && incompatibleModToken !== runtimeModWarningToken) {
          const message = `BTD6 closed after ${incompatibleMod.file} repeatedly logged a compatibility error. Disable this mod in the notification before playing again.`;
          launcherLog(`${message} Mod error: ${incompatibleMod.detail} MelonLoader log: ${incompatibleMod.logPath}`);
          send('game:mod-warning', { ...incompatibleMod, profileId: launchProfileId, message, previousCrash: false });
        }
      }
      gameLaunchStartedAt = 0;
      gameLaunchProfileId = null;
      runtimeModWarningToken = '';
      const postGameLogCleanup = setTimeout(() => { void cleanupOldGameLogs(); }, 30000);
      postGameLogCleanup.unref();
    });
    let gameProcessVisible = false;
    let generationObserved = false;
    let generationCompleted = false;
    let generationCompletedAt = 0;
    let phaseSent = '';
    const launchDeadline = Date.now() + 5 * 60 * 1000;
    while (Date.now() < launchDeadline) {
      gameProcessVisible = await isBtd6ProcessRunning();
      const generation = latestMelonGenerationStatus(launchStartedAt);
      if (generation.observed) generationObserved = true;
      if (generation.complete && !generationCompleted) {
        generationCompleted = true;
        generationCompletedAt = Date.now();
      }
      const elapsed = Date.now() - launchStartedAt;
      const phase = generationObserved && !generationCompleted && elapsed >= 5000
        ? 'generating'
        : generationCompleted ? 'launching' : 'starting';
      if (phase !== phaseSent) {
        phaseSent = phase;
        send('game:changed', { running: gameProcessVisible, launching: true, launchPhase: phase });
        if (phase === 'generating') launcherLog(`MelonLoader is building BTD6's first-run IL2CPP assemblies. Waiting for generation to finish. Log: ${generation.logPath || 'MelonLoader logs'}`);
      }
      // Cpp2IL can take a minute or more on the first run. Keep the Play action
      // locked until its successful-completion marker is written, so the user
      // cannot start a second copy while the first one is preparing.
      if (generationObserved) {
        if (generationCompleted && gameProcessVisible) break;
        if (generationCompleted && !gameProcessVisible && Date.now() - generationCompletedAt >= 15000) break;
      } else if (elapsed >= 10000) break;
      if (exitedDuringStartup) break;
      await wait(750);
    }
    if (generationObserved && !generationCompleted && !exitedDuringStartup) {
      throw new Error('MelonLoader is still generating BTD6’s first-run game files. Leave the current game process open and check Game logs; do not launch a second copy.');
    }
    if (!gameProcessVisible) {
      const crash = latestGameCrashLog(launchStartedAt);
      const windowsCrash = latestWindowsGameCrash(launchStartedAt);
      if ((crash && /SteamApi_Init failed|ConnectToGlobalUser failed/i.test(crash.text)) || (windowsCrash && /^(?:0x)?c0000602$/i.test(windowsCrash.exceptionCode) && /^(?:version\.dll|version)$/i.test(windowsCrash.faultModule))) {
        throw new Error(gameCrashMessage(crash, startupExitCode, windowsCrash));
      }
      if (exitedDuringStartup) throw new Error(`BTD6 exited during startup (code ${startupExitCode ?? 'unknown'}). Check Game logs for details.`);
      throw new Error('The launch request was sent, but Windows did not detect the BTD6 process after startup. Check that the selected game executable is valid and try again.');
    }
    send('game:changed', { running: true, launching: true, launchPhase: generationCompleted ? 'launching' : '' });
    launched = true;
    return { executable, copied, generatedAssemblies: generationCompleted };
  } finally {
    if (managed) {
      send("instance:progress", {
        message: !launched ? "" : copied
          ? `Copied ${copied} updated game file(s) to the managed instance.`
          : "Managed copy is up to date.",
        busy: false
      });
    }
  }
  } finally { gameLaunching = false; send('game:changed', { running: Boolean(gameProcess), launching: false, launchPhase: '' }); }
});

handle('game:close', () => requestBtd6Close());

handle("game:update", async () => {
  await shell.openExternal("steam://nav/games/details/960090");
  return true;
});

handle("melonloader:launch", async () => {
  const installer = state.settings.melonLoaderPath;
  if (!installer || !fs.existsSync(installer)) {
    throw new Error("Choose the official MelonLoader installer in Settings, or download it in the Browser.");
  }
  await launchDetached(installer);
  return true;
});

handle("melonloader:download", () => runSetup({ packages: ["melonloader"] }));

handle("profiles:create", (_event, name) => {
  const options = typeof name === 'object' && name ? name : { name };
  const cleanName = String(options.name || "").trim();
  if (!cleanName) throw new Error("Enter a profile name.");
  const profile = { id: crypto.randomUUID(), name: cleanName.slice(0, 60), description: String(options.description || '').slice(0, 240), accent: cleanAccent(options.accent), disabledMods: [], createdAt: new Date().toISOString() };
  state.profiles.push(profile);
  fs.mkdirSync(profileRoot(profile.id), { recursive: true });
  writeProfileManifest(profile.id);
  saveState();
  send("profiles:changed", state.profiles);
  return state.profiles;
});

handle("profiles:activate", (_event, id) => {
  ensureGameStopped();
  if (!state.profiles.some((profile) => profile.id === id)) throw new Error("Profile not found.");
  const previous = state.activeProfileId;
  state.activeProfileId = id;
  try { syncActiveProfile(); } catch (error) { state.activeProfileId = previous; throw error; }
  saveState();
  if (state.settings.autoUpdateMods) scheduleAutoUpdate(id);
  return state;
});

handle("profiles:delete", async (_event, id) => {
  ensureGameStopped();
  const profile = profileById(id);
  if (!profile) throw new Error('Profile not found.');
  if (id === "default") throw new Error("The default profile cannot be deleted.");
  if (state.activeProfileId === id) throw new Error("Activate another profile before deleting this one.");
  const confirmation = await dialog.showMessageBox(mainWindow, { type: 'warning', title: 'Delete profile', message: `Delete “${profile.name}”?`, detail: 'Its local mod files and profile settings will be deleted. The game copy and saves are kept.', buttons: ['Cancel', 'Delete profile'], defaultId: 0, cancelId: 0, noLink: true });
  if (confirmation.response !== 1) return null;
  fs.rmSync(profileDirectory(id), { recursive: true, force: true });
  state.profiles = state.profiles.filter((profile) => profile.id !== id);
  saveState();
  return state.profiles;
});

handle("profiles:details", (_event, id) => {
  const profile = profileById(id);
  if (!profile) throw new Error("Profile not found.");
  const manifest = writeProfileManifest(id);
  return { profile, manifest, manifestPath: profileManifestPath(id) };
});

handle("mods:install", async (_event, profileId = state.activeProfileId) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Install a downloaded BTD6 mod",
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "BTD6 mod DLL", extensions: ["dll"] }]
  });
  if (result.canceled) return [];
  for (const file of result.filePaths) installModFile(file, profileId);
  return profileMods(profileId);
});

handle("mods:install-download", (_event, file, profileId) => installModFile(file, profileId));

async function resolveGithubModDownload(input) {
  let url;
  try { url = new URL(String(input || '').trim()); } catch { throw new Error('Paste a valid GitHub mod link.'); }
  if (url.protocol !== 'https:' || !['github.com', 'raw.githubusercontent.com'].includes(url.hostname.toLowerCase())) {
    throw new Error('For safety, mod links must point to github.com or raw.githubusercontent.com over HTTPS.');
  }
  const headers = { 'User-Agent': `BananaForge/${app.getVersion()}`, Accept: 'application/vnd.github+json' };
  let downloadUrl = '';
  let hintedName = '';
  if (url.hostname.toLowerCase() === 'raw.githubusercontent.com') {
    if (!url.pathname.toLowerCase().endsWith('.dll')) throw new Error('The direct GitHub link must point to a .dll file.');
    downloadUrl = url.href;
    hintedName = path.posix.basename(url.pathname);
  } else {
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2) throw new Error('Paste a repository, folder, release, or DLL link from GitHub.');
    const [owner, repo, section, ...rest] = parts;
    if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) throw new Error('That GitHub URL is not a supported project link.');
    if (section === 'releases' && rest[0] === 'download' && rest.length >= 3) {
      hintedName = rest.at(-1);
      if (!hintedName.toLowerCase().endsWith('.dll')) throw new Error('The GitHub release asset must be a .dll file.');
      downloadUrl = `https://github.com/${owner}/${repo}/releases/download/${rest.slice(1).map(encodeURIComponent).join('/')}`;
    } else {
      let ref = 'HEAD', directory = '';
      if (section === 'tree' || section === 'blob') {
        if (rest.length < 1) throw new Error('The GitHub link is missing its branch or file path.');
        ref = rest[0]; directory = rest.slice(1).join('/');
        if (section === 'blob') {
          if (!directory.toLowerCase().endsWith('.dll')) throw new Error('The GitHub file link must point to a .dll file.');
          hintedName = path.posix.basename(directory);
          downloadUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(ref)}/${directory.split('/').map(encodeURIComponent).join('/')}`;
        }
      } else if (section) throw new Error('Use a GitHub project, folder, release asset, or DLL link.');
      if (!downloadUrl) {
        const apiUrl = new URL(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${directory.split('/').filter(Boolean).map(encodeURIComponent).join('/')}`);
        if (ref !== 'HEAD') apiUrl.searchParams.set('ref', ref);
        const listingResponse = await fetch(apiUrl, { headers, signal: AbortSignal.timeout(25000) });
        if (!listingResponse.ok) throw new Error(`Could not inspect that GitHub folder (HTTP ${listingResponse.status}). Check the link and repository visibility.`);
        const listing = await listingResponse.json();
        const files = Array.isArray(listing) ? listing : [listing];
        const dlls = files.filter((item) => item.type === 'file' && item.name?.toLowerCase().endsWith('.dll') && item.download_url);
        const folderName = path.posix.basename(directory).toLowerCase();
        const matching = dlls.find((item) => path.posix.basename(item.name, '.dll').toLowerCase() === folderName);
        const selected = matching || (dlls.length === 1 ? dlls[0] : null);
        if (!selected) throw new Error(dlls.length ? 'This folder has multiple DLLs. Paste a direct GitHub link to the exact mod DLL.' : 'No .dll mod file was found in that GitHub location.');
        downloadUrl = selected.download_url;
        hintedName = selected.name;
      }
    }
  }
  const safeDownload = new URL(downloadUrl);
  if (safeDownload.protocol !== 'https:' || !['github.com', 'raw.githubusercontent.com'].includes(safeDownload.hostname.toLowerCase()) || !hintedName.toLowerCase().endsWith('.dll')) throw new Error('GitHub returned an unsupported mod file link.');
  const response = await fetch(safeDownload, { headers: { 'User-Agent': `BananaForge/${app.getVersion()}` }, signal: AbortSignal.timeout(120000) });
  if (!response.ok || !['github.com', 'raw.githubusercontent.com'].includes(new URL(response.url).hostname.toLowerCase())) throw new Error(`Could not download the mod DLL (HTTP ${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 128 || bytes.length > 200 * 1024 * 1024 || bytes.toString('ascii', 0, 2) !== 'MZ') throw new Error('The downloaded file is not a valid Windows DLL (or is outside the 200 MB safety limit).');
  return { bytes, name: path.basename(hintedName), source: url.href };
}

handle('mods:install-link', async (_event, url, profileId = state.activeProfileId) => {
  ensureGameStopped();
  const resolved = await resolveGithubModDownload(url);
  const destination = profileRoot(profileId);
  const target = path.join(destination, safeModName(resolved.name));
  if (fs.existsSync(target)) {
    const answer = await dialog.showMessageBox(mainWindow, { type: 'question', title: 'Replace installed mod?', message: `${resolved.name} is already installed in this profile.`, detail: 'Replace the existing DLL with the file from this GitHub link?', buttons: ['Cancel', 'Replace'], defaultId: 0, cancelId: 0, noLink: true });
    if (answer.response !== 1) return { cancelled: true };
  }
  fs.mkdirSync(downloadRoot(), { recursive: true });
  const stagedDownload = path.join(downloadRoot(), `.bananaforge-link-${crypto.randomUUID()}.dll`);
  try {
    fs.writeFileSync(stagedDownload, resolved.bytes, { flag: 'wx' });
    const mods = installModFile(stagedDownload, profileId);
    return { mods, name: resolved.name, source: resolved.source };
  } finally { try { fs.rmSync(stagedDownload, { force: true }); } catch {} }
});

handle("mods:list", () => {
  const mods = profileMods();
  writeProfileManifest();
  return mods;
});

handle("mods:remove", (_event, name, profileId = state.activeProfileId) => {
  ensureGameStopped();
  const safeName = path.basename(name);
  fs.rmSync(path.join(profileRoot(profileId), safeName), { force: true });
  writeProfileManifest(profileId);
  if (profileId === state.activeProfileId) syncActiveProfile();
  return profileMods(profileId);
});

handle('mods:search-update-sources', async (_event, profileId, name, searchTerm) => {
  const profile = profileById(profileId);
  const safeName = safeModName(name);
  if (!profile || !profileMods(profileId).includes(safeName)) throw new Error('That mod is not installed in this profile.');
  if (path.extname(safeName).toLowerCase() !== '.dll') throw new Error('Only installed DLL mods can be searched for update sources.');
  return workspace.searchModUpdateSources(safeName, AbortSignal.timeout(60000), searchTerm);
});

handle('mods:track-discovered-update', async (_event, profileId, name, repository, assetName) => {
  const profile = profileById(profileId);
  const safeName = safeModName(name);
  if (!profile || !profileMods(profileId).includes(safeName)) throw new Error('That mod is not installed in this profile.');
  if (typeof repository !== 'string' || !/^[\w.-]{1,100}\/[\w.-]{1,100}$/.test(repository)) throw new Error('That release source is invalid. Search again and choose a verified result.');
  const verifiedAsset = typeof assetName === 'string' && path.basename(assetName) === assetName && /\.dll$/i.test(assetName) ? assetName : safeName;
  const release = await workspace.latestReleaseAsset(repository, verifiedAsset, AbortSignal.timeout(30000));
  const bytes = await fs.promises.readFile(path.join(profileRoot(profileId), safeName));
  if (bytes.subarray(0, 2).toString() !== 'MZ') throw new Error('The installed file is not a valid Windows DLL.');
  profile.updateSources ||= {};
  profile.updateSources[safeName] = {
    repository, asset: release.asset.name, url: release.url, version: '',
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'), status: 'tracked', lastCheckedAt: null,
    sourceDiscovery: 'website'
  };
  profile.lastAutoUpdateAt = null;
  writeProfileManifest(profileId); saveState();
  if (profileId === state.activeProfileId && state.settings.autoUpdateMods) scheduleAutoUpdate(profileId);
  return { file: safeName, repository, version: release.tag };
});

handle('mods:track-update', async (_event, profileId, name, releaseUrl) => {
  const profile = profileById(profileId);
  const safeName = safeModName(name);
  if (!profile || !profileMods(profileId).includes(safeName)) throw new Error('That mod is not installed in this profile.');
  const release = workspace.githubModSourceReference(releaseUrl, safeName);
  if (!release) throw new Error('Paste a GitHub project, release page, or direct tagged release URL.');
  if (release.asset.toLowerCase() !== safeName.toLowerCase()) throw new Error(`The release asset must be named ${safeName}.`);
  const declaredDll = await workspace.modHelperDllName(release.repository, null, AbortSignal.timeout(30000));
  const latest = await workspace.latestReleaseAssetMatching(release.repository, [safeName, declaredDll], AbortSignal.timeout(30000));
  const file = path.join(profileRoot(profileId), safeName);
  const bytes = fs.readFileSync(file);
  if (bytes.subarray(0, 2).toString() !== 'MZ') throw new Error('The installed file is not a valid Windows DLL.');
  profile.updateSources ||= {};
  profile.updateSources[safeName] = {
    repository: release.repository, asset: latest.asset.name, url: latest.url,
    version: '', versionVerified: false, sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    status: 'tracked', lastCheckedAt: null
  };
  profile.lastAutoUpdateAt = null;
  writeProfileManifest(profileId); saveState();
  if (profileId === state.activeProfileId && state.settings.autoUpdateMods) scheduleAutoUpdate(profileId);
  return { file: safeName, repository: release.repository, version: latest.tag };
});

handle('mods:track-known-update', async (_event, profileId, name) => {
  const profile = profileById(profileId);
  const safeName = safeModName(name);
  if (!profile || !profileMods(profileId).includes(safeName)) throw new Error('That mod is not installed in this profile.');
  const repository = knownModRepositories[safeName.toLowerCase()];
  if (!repository) throw new Error('No verified project source is known for this mod.');
  const declaredDll = await workspace.modHelperDllName(repository, null, AbortSignal.timeout(30000));
  const release = await workspace.latestReleaseAssetMatching(repository, [safeName, declaredDll], AbortSignal.timeout(30000));
  const bytes = fs.readFileSync(path.join(profileRoot(profileId), safeName));
  if (bytes.subarray(0, 2).toString() !== 'MZ') throw new Error('The installed file is not a valid Windows DLL.');
  profile.updateSources ||= {};
  profile.updateSources[safeName] = {
    repository, asset: release.asset.name, url: release.url, version: '', versionVerified: false,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'), status: 'tracked', lastCheckedAt: null
  };
  profile.lastAutoUpdateAt = null;
  writeProfileManifest(profileId); saveState();
  if (profileId === state.activeProfileId && state.settings.autoUpdateMods) scheduleAutoUpdate(profileId);
  return { file: safeName, repository, version: release.tag };
});

handle("path:show", (_event, target) => {
  if (target) shell.showItemInFolder(target);
  return true;
});

handle("external:open", (_event, url) => {
  const parsed = new URL(url);
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Only HTTP and HTTPS links can be opened from the browser.');
  return shell.openExternal(parsed.href);
});

handle('profiles:update', (_event, id, values) => {
  const profile = profileById(id);
  if (!profile) throw new Error('Profile not found.');
  const name = String(values.name || '').trim();
  if (!name) throw new Error('Enter a profile name.');
  Object.assign(profile, { name: name.slice(0, 60), description: String(values.description || '').slice(0, 240), accent: cleanAccent(values.accent), updatedAt: new Date().toISOString() });
  writeProfileManifest(id); saveState(); return profile;
});

handle('profiles:duplicate', async (_event, id) => {
  const source = profileById(id);
  if (!source) throw new Error('Profile not found.');
  const copy = { ...source, id: crypto.randomUUID(), name: `${source.name} copy`.slice(0, 60), createdAt: new Date().toISOString(), disabledMods: [...(source.disabledMods || [])], updateSources: structuredClone(source.updateSources || {}) };
  state.profiles.push(copy);
  try {
    await fs.promises.cp(profileRoot(id), profileRoot(copy.id), { recursive: true });
    writeProfileManifest(copy.id); saveState(); return copy;
  } catch (error) {
    const directory = profileDirectory(copy.id);
    state.profiles = state.profiles.filter((profile) => profile.id !== copy.id);
    await fs.promises.rm(directory, { recursive: true, force: true }); throw error;
  }
});

handle('profiles:folder', async (_event, id) => {
  const error = await shell.openPath(profileDirectory(id));
  if (error) throw new Error(error);
  return true;
});

handle('downloads:folder', async () => {
  fs.mkdirSync(downloadRoot(), { recursive: true });
  const error = await shell.openPath(downloadRoot());
  if (error) throw new Error(error);
  return true;
});

handle('downloads:cancel', (_event, id) => {
  const item = activeDownloads.get(id);
  if (!item) throw new Error('This download is no longer running.');
  item.cancel(); return true;
});

handle('mods:toggle', (_event, id, name, enabled) => {
  ensureGameStopped();
  const profile = profileById(id);
  if (!profile || !profileMods(id).includes(name)) throw new Error('Mod not found.');
  const previous = profile.disabledMods;
  const disabled = new Set(profile.disabledMods || []);
  enabled ? disabled.delete(name) : disabled.add(name);
  profile.disabledMods = [...disabled];
  try { if (id === state.activeProfileId) syncActiveProfile(); }
  catch (error) { profile.disabledMods = previous; throw error; }
  writeProfileManifest(id); saveState(); return true;
});

handle('mods:disable-incompatible', async (_event, id, name) => {
  // A crash notification can arrive a few milliseconds before the launch IPC
  // finishes unwinding. Wait for that transition so the action remains usable.
  for (let attempt = 0; gameLaunching && attempt < 40; attempt += 1) await wait(250);
  ensureGameStopped();
  await ensureBtd6Closed();
  const profile = profileById(id);
  const safeName = safeModName(name);
  if (!profile || !profileMods(id).includes(safeName)) throw new Error('That mod is no longer installed in this profile.');
  const failure = previouslyCrashingMod(id);
  if (!failure || failure.file.toLowerCase() !== safeName.toLowerCase()) throw new Error('The compatibility warning is no longer current. Check Game logs and try again.');
  const previousDisabledMods = profile.disabledMods || [];
  profile.disabledMods = [...new Set([...previousDisabledMods, safeName])];
  try {
    if (id === state.activeProfileId && btd6Executable(state.settings.instancePath)) syncActiveProfile();
    writeProfileManifest(id);
    saveState();
  } catch (error) {
    profile.disabledMods = previousDisabledMods;
    try { writeProfileManifest(id); saveState(); } catch {}
    throw error;
  }
  launcherLog(`${safeName} disabled in profile ${profile.name} by the compatibility notification. Its profile DLL was preserved.`);
  return { file: safeName, profileId: id };
});

handle('profiles:export', async (_event, id) => {
  const profile = profileById(id);
  if (!profile) throw new Error('Profile not found.');
  const result = await dialog.showSaveDialog(mainWindow, { title: 'Export profile package', defaultPath: `${profile.name.replace(/[^a-z0-9 _-]/ig, '_')}.bfpack`, filters: [{ name: 'BananaForge profile', extensions: ['bfpack'] }] });
  if (result.canceled) return null;
  const mods = [];
  let total = 0;
  for (const name of profileMods(id)) {
    const file = path.join(profileRoot(id), name);
    total += fs.statSync(file).size;
    if (total > 128 * 1024 * 1024) throw new Error('Profile packages are limited to 128 MB of DLL files.');
    const data = await fs.promises.readFile(file);
    mods.push({ name, data: data.toString('base64'), sha256: crypto.createHash('sha256').update(data).digest('hex'), enabled: !(profile.disabledMods || []).includes(name) });
  }
  await fs.promises.writeFile(result.filePath, JSON.stringify({ format: 'bananaforge-profile', version: 1, name: profile.name, description: profile.description, accent: profile.accent, mods }));
  return result.filePath;
});

handle('profiles:import', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { title: 'Import profile package', properties: ['openFile'], filters: [{ name: 'BananaForge profile', extensions: ['bfpack'] }] });
  if (result.canceled) return null;
  if ((await fs.promises.stat(result.filePaths[0])).size > 190 * 1024 * 1024) throw new Error('The profile package is too large.');
  const bundle = workspace.validateBundle(JSON.parse(await fs.promises.readFile(result.filePaths[0], 'utf8')));
  const profile = { id: crypto.randomUUID(), name: bundle.name, description: bundle.description, accent: cleanAccent(bundle.accent), disabledMods: bundle.mods.filter((mod) => !mod.enabled).map((mod) => mod.name), createdAt: new Date().toISOString() };
  state.profiles.push(profile);
  try {
    fs.mkdirSync(profileRoot(profile.id), { recursive: true });
    for (const mod of bundle.mods) await fs.promises.writeFile(path.join(profileRoot(profile.id), mod.name), mod.data);
    writeProfileManifest(profile.id); saveState(); return profile;
  } catch (error) {
    const directory = profileDirectory(profile.id);
    state.profiles = state.profiles.filter((entry) => entry.id !== profile.id);
    await fs.promises.rm(directory, { recursive: true, force: true }); throw error;
  }
});

handle('logs:list', () => logFiles());
handle('logs:read', async (_event, id) => ({ ...selectedLog(id), ...await workspace.readLogTail(selectedLog(id).file) }));
handle('logs:copy', async (_event, id) => { clipboard.writeText((await workspace.readLogTail(selectedLog(id).file)).content); return true; });
handle('logs:export', async (_event, id) => {
  const item = selectedLog(id);
  const result = await dialog.showSaveDialog(mainWindow, { title: 'Save game log', defaultPath: path.basename(item.file), filters: [{ name: 'Log file', extensions: ['log', 'txt'] }] });
  if (result.canceled) return null;
  await fs.promises.copyFile(item.file, result.filePath); return result.filePath;
});
handle('logs:folder', (_event, id) => { shell.showItemInFolder(selectedLog(id).file); return true; });
handle('setup:start', (_event, options) => runSetup(options));
handle('setup:cancel', () => { setupController?.abort(new Error('Setup cancelled.')); return true; });
handle('mods:auto-update', (_event, profileId) => checkProfileModUpdates(profileId || state.activeProfileId, { force: true }));
handle('app:update-check', () => checkBananaForgeUpdate({ force: true, install: false }));
handle('app:update-install', () => checkBananaForgeUpdate({ force: true, install: true }));
handle('game:check-update', () => checkManagedGameUpdate({ force: true }));

app.on('before-quit', () => setupController?.abort(new Error('Launcher is closing.')));
