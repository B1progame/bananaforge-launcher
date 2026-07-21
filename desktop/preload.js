const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bananaforge", {
  getState: () => ipcRenderer.invoke("state:get"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  chooseGame: () => ipcRenderer.invoke("dialog:game"),
  chooseFolder: (title) => ipcRenderer.invoke("dialog:folder", title),
  chooseMelonLoader: () => ipcRenderer.invoke("dialog:melonloader"),
  createManagedCopy: () => ipcRenderer.invoke("instance:create-copy"),
  launchGame: () => ipcRenderer.invoke("game:launch"),
  updateGame: () => ipcRenderer.invoke("game:update"),
  launchMelonLoader: () => ipcRenderer.invoke("melonloader:launch"),
  downloadMelonLoader: () => ipcRenderer.invoke("melonloader:download"),
  createProfile: (name) => ipcRenderer.invoke("profiles:create", name),
  activateProfile: (id) => ipcRenderer.invoke("profiles:activate", id),
  deleteProfile: (id) => ipcRenderer.invoke("profiles:delete", id),
  profileDetails: (id) => ipcRenderer.invoke("profiles:details", id),
  installMods: () => ipcRenderer.invoke("mods:install"),
  installDownloadedMod: (file) => ipcRenderer.invoke("mods:install-download", file),
  listMods: () => ipcRenderer.invoke("mods:list"),
  removeMod: (name) => ipcRenderer.invoke("mods:remove", name),
  showPath: (target) => ipcRenderer.invoke("path:show", target),
  openExternal: (url) => ipcRenderer.invoke("external:open", url),
  onDownloadsChanged: (callback) => ipcRenderer.on("downloads:changed", (_event, value) => callback(value)),
  onNewTab: (callback) => ipcRenderer.on("browser:new-tab", (_event, value) => callback(value)),
  onInstanceProgress: (callback) => ipcRenderer.on("instance:progress", (_event, value) => callback(value)),
  onMelonLoaderDownloaded: (callback) => ipcRenderer.on("melonloader:downloaded", (_event, value) => callback(value))
});
