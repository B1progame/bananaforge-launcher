const { app, BrowserWindow, dialog, ipcMain, session, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");

let mainWindow;
let statePath;
let state;
const melonLoaderDownloads = new Set();
const registeredDownloadSessions = new Set();

const defaultState = () => ({
  settings: {
    gamePath: "",
    instancePath: "",
    melonLoaderPath: "",
    downloadPath: "",
    launchArguments: "",
    firstRunComplete: false
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
  saveState();
}

function saveState() {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || "" : "";
}

function applyInstallerPaths() {
  const original = argumentValue("--game-path");
  const managed = argumentValue("--instance-path");
  if (original) state.settings.gamePath = original;
  if (managed) state.settings.instancePath = managed;
  if (original || managed) saveState();
}

function profileRoot(profileId = state.activeProfileId) {
  return path.join(app.getPath("userData"), "profiles", profileId, "mods");
}

function downloadRoot() {
  return path.join(app.getPath("downloads"), "BananaForge");
}

function gameRoot() {
  return state.settings.instancePath || state.settings.gamePath;
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
  const configured = btd6Executable(state.settings.gamePath);
  if (configured) return configured;
  const candidates = [
    "C:\\Program Files (x86)\\Steam\\steamapps\\common\\BloonsTD6\\BloonsTD6.exe",
    "C:\\Program Files\\Steam\\steamapps\\common\\BloonsTD6\\BloonsTD6.exe"
  ];
  return candidates.find(fs.existsSync) || "";
}

function originalGameRoot() {
  const configured = state.settings.gamePath;
  if (!configured) return "";
  return configured.toLowerCase().endsWith(".exe") ? path.dirname(configured) : configured;
}

async function syncGameUpdate() {
  const sourceRoot = originalGameRoot();
  const managedRoot = state.settings.instancePath;
  if (!sourceRoot || !managedRoot || !fs.existsSync(sourceRoot)) return { copied: 0, skipped: true };
  if (path.resolve(sourceRoot) === path.resolve(managedRoot)) return { copied: 0, skipped: true };

  const protectedFolders = new Set(["mods", "melonloader", "userdata"]);
  let copied = 0;
  async function copyChanged(source, destination, topLevel = false) {
    await fs.promises.mkdir(destination, { recursive: true });
    for (const entry of await fs.promises.readdir(source, { withFileTypes: true })) {
      if (topLevel && entry.isDirectory() && protectedFolders.has(entry.name.toLowerCase())) continue;
      const from = path.join(source, entry.name);
      const to = path.join(destination, entry.name);
      if (entry.isDirectory()) {
        await copyChanged(from, to, false);
      } else if (entry.isFile()) {
        const sourceStat = await fs.promises.stat(from);
        let targetStat;
        try { targetStat = await fs.promises.stat(to); } catch { targetStat = null; }
        if (!targetStat || targetStat.size !== sourceStat.size || targetStat.mtimeMs < sourceStat.mtimeMs) {
          await fs.promises.copyFile(from, to);
          await fs.promises.utimes(to, sourceStat.atime, sourceStat.mtime);
          copied += 1;
        }
      }
    }
  }
  await copyChanged(sourceRoot, managedRoot, true);
  return { copied, skipped: false };
}

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function safeModName(file) {
  const name = path.basename(file);
  if (!name.toLowerCase().endsWith(".dll")) {
    throw new Error("BananaForge currently installs compiled .dll mods. Archives must be reviewed and extracted first.");
  }
  return name;
}

function syncActiveProfile() {
  const root = state.settings.instancePath;
  const source = profileRoot();
  fs.mkdirSync(source, { recursive: true });
  const files = fs.readdirSync(source).filter((name) => name.toLowerCase().endsWith(".dll"));
  if (!root) return files;
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

function installModFile(file) {
  if (!file || !fs.existsSync(file)) throw new Error("The downloaded mod file is no longer available.");
  const destination = profileRoot();
  const name = safeModName(file);
  fs.mkdirSync(destination, { recursive: true });
  fs.copyFileSync(file, path.join(destination, name));
  syncActiveProfile();
  return fs.readdirSync(destination).filter((entry) => entry.toLowerCase().endsWith(".dll"));
}

function registerDownloadHandler(targetSession) {
  if (registeredDownloadSessions.has(targetSession)) return;
  registeredDownloadSessions.add(targetSession);
  targetSession.on("will-download", (_event, item) => {
    const id = crypto.randomUUID();
    const root = downloadRoot();
    fs.mkdirSync(root, { recursive: true });
    const fileName = path.basename(item.getFilename());
    const savePath = path.join(root, fileName);
    const isMelonLoader = melonLoaderDownloads.has(item.getURL()) || melonLoaderDownloads.has(fileName);
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
    width: 1480,
    height: 920,
    minWidth: 1120,
    minHeight: 700,
    backgroundColor: "#07111f",
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

app.whenReady().then(() => {
  readState();
  applyInstallerPaths();
  createWindow();

  registerDownloadHandler(session.defaultSession);
  registerDownloadHandler(session.fromPartition("persist:bananaforge-browser"));

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("state:get", () => ({
  ...state,
  detectedGame: gameExecutable(),
  configuredGamePath: btd6Executable(state.settings.gamePath),
  configuredInstancePath: btd6Executable(state.settings.instancePath),
  version: app.getVersion(),
  userDataPath: app.getPath("userData")
}));

ipcMain.handle("settings:save", (_event, settings) => {
  if (settings.gamePath && !btd6Executable(settings.gamePath)) {
    throw new Error("Game path must point to the real BloonsTD6.exe file or its containing folder.");
  }
  if (settings.instancePath && !btd6Executable(settings.instancePath)) {
    throw new Error("Managed copy path must contain BloonsTD6.exe.");
  }
  state.settings = { ...state.settings, ...settings };
  saveState();
  return state.settings;
});

ipcMain.handle("dialog:game", async () => {
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

ipcMain.handle("dialog:folder", async (_event, title) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: title || "Choose folder",
    properties: ["openDirectory", "createDirectory"]
  });
  return result.canceled ? "" : result.filePaths[0];
});

ipcMain.handle("dialog:melonloader", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Choose MelonLoader installer",
    properties: ["openFile"],
    filters: [{ name: "Applications", extensions: ["exe"] }]
  });
  return result.canceled ? "" : result.filePaths[0];
});

ipcMain.handle("instance:create-copy", async () => {
  const sourceResult = await dialog.showOpenDialog(mainWindow, {
    title: "Choose your original BTD6 folder",
    properties: ["openDirectory"]
  });
  if (sourceResult.canceled) return { canceled: true };
  const targetResult = await dialog.showOpenDialog(mainWindow, {
    title: "Choose an empty folder for the managed copy",
    properties: ["openDirectory", "createDirectory"]
  });
  if (targetResult.canceled) return { canceled: true };
  const source = path.resolve(sourceResult.filePaths[0]);
  const target = path.resolve(targetResult.filePaths[0]);
  if (!btd6Executable(source)) {
    throw new Error("The original-game folder must contain BloonsTD6.exe.");
  }
  if (source === target || target.startsWith(source + path.sep)) {
    throw new Error("The managed copy must be outside the original BTD6 folder.");
  }
  send("instance:progress", { message: "Copying BTD6 files…", busy: true });
  await fs.promises.cp(source, target, { recursive: true, errorOnExist: false });
  if (!fs.existsSync(path.join(target, "BloonsTD6.exe"))) {
    throw new Error("The selected source did not contain BloonsTD6.exe.");
  }
  state.settings.gamePath = source;
  state.settings.instancePath = target;
  saveState();
  send("instance:progress", { message: "Managed copy is ready.", busy: false });
  return { source, target };
});

ipcMain.handle("game:launch", async () => {
  const executable = gameExecutable();
  if (!executable) throw new Error("BTD6 was not found. Choose it in Settings or create a managed copy.");
  send("instance:progress", { message: "Checking the managed BTD6 copy for Steam updates…", busy: true });
  const update = await syncGameUpdate();
  if (state.settings.instancePath) syncActiveProfile();
  const args = state.settings.launchArguments
    ? state.settings.launchArguments.match(/(?:[^\s\"]+|\"[^\"]*\")+/g) || []
    : [];
  spawn(executable, args.map((value) => value.replace(/^\"|\"$/g, "")), {
    cwd: path.dirname(executable),
    detached: true,
    stdio: "ignore"
  }).unref();
  send("instance:progress", {
    message: update.copied ? `Copied ${update.copied} updated game file(s) to the managed instance.` : "Managed copy is up to date.",
    busy: false
  });
  return { executable, copied: update.copied };
});

ipcMain.handle("game:update", async () => {
  await shell.openExternal("steam://nav/games/details/960090");
  return true;
});

ipcMain.handle("melonloader:launch", () => {
  const installer = state.settings.melonLoaderPath;
  if (!installer || !fs.existsSync(installer)) {
    throw new Error("Choose the official MelonLoader installer in Settings, or download it in the Browser.");
  }
  spawn(installer, [], { detached: true, stdio: "ignore" }).unref();
  return true;
});

ipcMain.handle("melonloader:download", async () => {
  const response = await fetch("https://api.github.com/repos/LavaGang/MelonLoader/releases/latest", {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "BananaForge" }
  });
  if (!response.ok) throw new Error("Could not reach the official MelonLoader release page.");
  const release = await response.json();
  const asset = (release.assets || []).find((candidate) =>
    typeof candidate?.name === "string" &&
    candidate.name.toLowerCase().endsWith(".exe") &&
    candidate.name.toLowerCase().includes("installer") &&
    typeof candidate.browser_download_url === "string"
  );
  if (!asset) throw new Error("The latest official MelonLoader release did not include a Windows installer.");
  melonLoaderDownloads.add(asset.browser_download_url);
  melonLoaderDownloads.add(asset.name);
  session.defaultSession.downloadURL(asset.browser_download_url);
  return { name: asset.name, version: release.tag_name || "latest" };
});

ipcMain.handle("profiles:create", (_event, name) => {
  const cleanName = String(name || "").trim();
  if (!cleanName) throw new Error("Enter a profile name.");
  const profile = { id: crypto.randomUUID(), name: cleanName.slice(0, 60), createdAt: new Date().toISOString() };
  state.profiles.push(profile);
  fs.mkdirSync(profileRoot(profile.id), { recursive: true });
  saveState();
  return state.profiles;
});

ipcMain.handle("profiles:activate", (_event, id) => {
  if (!state.profiles.some((profile) => profile.id === id)) throw new Error("Profile not found.");
  state.activeProfileId = id;
  syncActiveProfile();
  saveState();
  return state;
});

ipcMain.handle("profiles:delete", (_event, id) => {
  if (id === "default") throw new Error("The default profile cannot be deleted.");
  if (state.activeProfileId === id) throw new Error("Activate another profile before deleting this one.");
  state.profiles = state.profiles.filter((profile) => profile.id !== id);
  fs.rmSync(path.dirname(profileRoot(id)), { recursive: true, force: true });
  saveState();
  return state.profiles;
});

ipcMain.handle("mods:install", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Install a downloaded BTD6 mod",
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "BTD6 mod DLL", extensions: ["dll"] }]
  });
  if (result.canceled) return [];
  for (const file of result.filePaths) installModFile(file);
  return fs.readdirSync(profileRoot()).filter((file) => file.toLowerCase().endsWith(".dll"));
});

ipcMain.handle("mods:install-download", (_event, file) => installModFile(file));

ipcMain.handle("mods:list", () => {
  const root = profileRoot();
  fs.mkdirSync(root, { recursive: true });
  return fs.readdirSync(root).filter((file) => file.toLowerCase().endsWith(".dll"));
});

ipcMain.handle("mods:remove", (_event, name) => {
  const safeName = path.basename(name);
  fs.rmSync(path.join(profileRoot(), safeName), { force: true });
  syncActiveProfile();
  return fs.readdirSync(profileRoot()).filter((file) => file.toLowerCase().endsWith(".dll"));
});

ipcMain.handle("path:show", (_event, target) => {
  if (target) shell.showItemInFolder(target);
  return true;
});

ipcMain.handle("external:open", (_event, url) => shell.openExternal(url));
