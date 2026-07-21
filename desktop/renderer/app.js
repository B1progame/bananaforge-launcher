const api = window.bananaforge;
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

let appState;
let tabs = [];
let activeTabId = null;
let toastTimer;
let openProfileDetail;
const MOD_HOME = "https://gurrenm3.github.io/BTD-Mod-Helper/mod-browser?search=";

function toast(message, error = false) {
  const node = $("#toast");
  node.textContent = message;
  node.className = `toast show${error ? " error" : ""}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (node.className = "toast"), 4200);
}

function bananaBurst(x, y) {
  for (let index = 0; index < 11; index += 1) {
    const particle = document.createElement("span");
    const angle = (Math.PI * 2 * index) / 11 + Math.random() * 0.35;
    const distance = 30 + Math.random() * 72;
    particle.className = "banana-particle";
    particle.textContent = "🍌";
    particle.style.left = `${x}px`;
    particle.style.top = `${y}px`;
    particle.style.setProperty("--banana-x", `${Math.cos(angle) * distance}px`);
    particle.style.setProperty("--banana-y", `${Math.sin(angle) * distance}px`);
    particle.style.setProperty("--banana-r", `${Math.round(Math.random() * 280 - 140)}deg`);
    document.body.appendChild(particle);
    window.setTimeout(() => particle.remove(), 520);
  }
}

function friendlyError(error) {
  return (error?.message || String(error))
    .replace(/^Error invoking remote method '[^']+': Error:\s*/, "")
    .replace(/^Error:\s*/, "");
}

async function safe(action, successMessage) {
  try {
    const value = await action();
    if (successMessage) toast(successMessage);
    return value;
  } catch (error) {
    toast(friendlyError(error), true);
    return null;
  }
}

function showPage(page) {
  $$(".page").forEach((node) => node.classList.toggle("active", node.id === `page-${page}`));
  $$(".nav-item").forEach((node) => node.classList.toggle("active", node.dataset.page === page));
  if (page === "mods") refreshMods();
  if (page === "profiles") renderProfiles();
  if (page === "downloads") renderDownloads(appState.downloads);
}

function normalizeAddress(input) {
  const value = input.trim();
  if (!value) return MOD_HOME;
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value)) return value;
  if (value.includes(".") && !value.includes(" ")) return `https://${value}`;
  return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
}

function isDownloadLink(url) {
  try {
    const decoded = decodeURIComponent(url);
    return /\.(dll|zip|7z|rar|exe)(?:[?#]|$)/i.test(decoded) ||
      /github\.com\/[^/]+\/[^/]+\/releases\/download\//i.test(decoded) ||
      /api\.github\.com\/repos\/[^/]+\/[^/]+\/releases\/assets\/\d+/i.test(decoded) ||
      /githubusercontent\.com\/.*\/(releases|assets)\//i.test(decoded);
  } catch {
    return false;
  }
}

function activeWebview() {
  return tabs.find((tab) => tab.id === activeTabId)?.view;
}

function addTab(url = MOD_HOME) {
  const id = crypto.randomUUID();
  const view = document.createElement("webview");
  view.src = normalizeAddress(url);
  view.setAttribute("partition", "persist:bananaforge-browser");
  view.setAttribute("allowpopups", "true");
  view.dataset.id = id;
  $("#webviewStack").appendChild(view);

  const tab = { id, title: "New tab", url: view.src, view };
  tabs.push(tab);
  bindWebview(tab);
  activateTab(id);
  renderTabs();
}

function bindWebview(tab) {
  const sync = () => {
    tab.url = tab.view.getURL() || tab.url;
    tab.title = tab.view.getTitle() || "New tab";
    if (tab.id === activeTabId) $("#addressBar").value = tab.url;
    renderTabs();
  };
  tab.view.addEventListener("did-navigate", sync);
  tab.view.addEventListener("did-navigate-in-page", sync);
  tab.view.addEventListener("page-title-updated", sync);
  tab.view.addEventListener("did-start-loading", () => {
    if (tab.id === activeTabId) $("#browserReload").textContent = "×";
  });
  tab.view.addEventListener("did-stop-loading", () => {
    if (tab.id === activeTabId) $("#browserReload").textContent = "↻";
    sync();
  });
  tab.view.addEventListener("new-window", (event) => {
    if (isDownloadLink(event.url)) {
      event.preventDefault();
      tab.view.downloadURL(event.url);
      toast("Mod download started. It will appear in Downloads.");
      return;
    }
    addTab(event.url);
  });
}

function activateTab(id) {
  activeTabId = id;
  tabs.forEach((tab) => tab.view.classList.toggle("active", tab.id === id));
  const tab = tabs.find((item) => item.id === id);
  if (tab) $("#addressBar").value = tab.url;
  renderTabs();
}

function closeTab(id) {
  const index = tabs.findIndex((tab) => tab.id === id);
  if (index < 0) return;
  tabs[index].view.remove();
  tabs.splice(index, 1);
  if (!tabs.length) return addTab();
  if (activeTabId === id) activateTab(tabs[Math.max(0, index - 1)].id);
  renderTabs();
}

function renderTabs() {
  const root = $("#browserTabs");
  root.innerHTML = "";
  for (const tab of tabs) {
    const button = document.createElement("button");
    button.className = `browser-tab${tab.id === activeTabId ? " active" : ""}`;
    const label = document.createElement("span");
    label.textContent = tab.title;
    const close = document.createElement("b");
    close.className = "close";
    close.textContent = "×";
    close.onclick = (event) => {
      event.stopPropagation();
      closeTab(tab.id);
    };
    button.append(label, close);
    button.onclick = () => activateTab(tab.id);
    root.appendChild(button);
  }
}

async function refreshState() {
  appState = await api.getState();
  $("#versionLabel").textContent = `BananaForge ${appState.version}`;
  const active = appState.profiles.find((profile) => profile.id === appState.activeProfileId);
  $("#activeProfileName").textContent = active?.name || "Default";
  const mods = await api.listMods();
  $("#activeProfileCount").textContent = `${mods.length} installed mod${mods.length === 1 ? "" : "s"}`;
  const managedGame = appState.configuredInstancePath;
  const originalGame = appState.configuredGamePath || appState.detectedGame;
  const game = managedGame || originalGame;
  $("#gameStatus").textContent = managedGame
    ? "Managed instance ready"
    : game
      ? "Original game detected"
      : "Not configured";
  $("#gamePathText").textContent = managedGame
    ? managedGame
    : game
      ? "Launches clean until you create a managed copy"
      : "Choose BTD6 in Settings";
  const melonReady = Boolean(appState.settings.melonLoaderPath);
  $("#melonStatus").textContent = melonReady ? "Installer ready" : "Ready to download";
  $("#runMelonCard").textContent = melonReady ? "Open MelonLoader →" : "Download MelonLoader →";
  fillSettings();
  renderProfiles();
  renderDownloads(appState.downloads);
  $("#setupGameStatus").textContent = game
    ? `Found: ${game}`
    : "BTD6 was not found automatically. Choose BloonsTD6.exe.";
  $("#firstRunModal").hidden = Boolean(appState.settings.firstRunComplete);
}

function fillSettings() {
  $("#gamePath").value = appState.configuredGamePath || appState.detectedGame || "";
  $("#instancePath").value = appState.configuredInstancePath || "";
  $("#melonLoaderPath").value = appState.settings.melonLoaderPath || "";
  $("#launchArguments").value = appState.settings.launchArguments || "";
}

async function refreshMods() {
  const mods = await safe(() => api.listMods());
  if (!mods) return;
  const root = $("#modsList");
  if (!mods.length) {
    root.className = "list-empty";
    root.textContent = "No mods installed in this profile.";
    return;
  }
  root.className = "";
  root.innerHTML = "";
  const profile = appState.profiles.find((item) => item.id === appState.activeProfileId)?.name || "Default";
  for (const name of mods) {
    const row = document.createElement("div");
    row.className = "mod-row";
    row.innerHTML = `<strong>${escapeHtml(name)}</strong><small>${escapeHtml(profile)}</small><span class="ok">● Enabled</span>`;
    const remove = document.createElement("button");
    remove.textContent = "Remove";
    remove.onclick = async () => {
      await safe(() => api.removeMod(name), `${name} removed`);
      await refreshState();
      await refreshMods();
    };
    row.appendChild(remove);
    root.appendChild(row);
  }
}

function renderProfiles() {
  if (!appState) return;
  const root = $("#profileGrid");
  root.innerHTML = "";
  for (const profile of appState.profiles) {
    const active = profile.id === appState.activeProfileId;
    const card = document.createElement("article");
    card.className = `profile-card${active ? " active" : ""}`;
    card.tabIndex = 0;
    card.title = "Double-click to view this profile's mods";
    card.innerHTML = `<div class="profile-icon">◈</div><h3>${escapeHtml(profile.name)}</h3><p>Created ${new Date(profile.createdAt).toLocaleDateString()}</p><small class="profile-hint">Double-click to view mods</small>`;
    const openDetails = () => showProfileDetails(profile.id);
    card.ondblclick = (event) => {
      if (!event.target.closest("button")) openDetails();
    };
    card.onkeydown = (event) => {
      if ((event.key === "Enter" || event.key === " ") && !event.target.closest("button")) {
        event.preventDefault();
        openDetails();
      }
    };
    const actions = document.createElement("div");
    actions.className = "card-actions";
    if (active) {
      actions.innerHTML = `<span class="active-tag">● ACTIVE PROFILE</span>`;
    } else {
      const activate = document.createElement("button");
      activate.className = "activate";
      activate.textContent = "Activate";
      activate.onclick = async () => {
        const result = await safe(() => api.activateProfile(profile.id), `${profile.name} activated`);
        if (result) await refreshState();
      };
      const remove = document.createElement("button");
      remove.className = "danger";
      remove.textContent = "Delete";
      remove.onclick = async () => {
        const result = await safe(() => api.deleteProfile(profile.id), `${profile.name} deleted`);
        if (result) await refreshState();
      };
      actions.append(activate, remove);
    }
    card.appendChild(actions);
    root.appendChild(card);
  }
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

async function showProfileDetails(id) {
  const detail = await safe(() => api.profileDetails(id));
  if (!detail) return;
  openProfileDetail = detail;
  const { profile, manifest, manifestPath } = detail;
  $("#profileDetailName").textContent = profile.name;
  $("#profileDetailMeta").textContent = `${manifest.mods.length} mod${manifest.mods.length === 1 ? "" : "s"} · Updated ${new Date(manifest.updatedAt).toLocaleString()}`;
  $("#profileManifestPath").textContent = manifestPath;
  const root = $("#profileDetailMods");
  root.innerHTML = "";
  if (!manifest.mods.length) {
    root.className = "profile-detail-mods list-empty";
    root.textContent = "No mods in this profile yet. Download a DLL, then install it into this profile.";
  } else {
    root.className = "profile-detail-mods";
    manifest.mods.forEach((mod, index) => {
      const row = document.createElement("article");
      row.className = "profile-mod-card";
      row.innerHTML = `<div class="mod-file-icon icon-${index % 4}">◈</div><div><strong>${escapeHtml(mod.displayName)}</strong><small>${escapeHtml(mod.file)} · ${formatBytes(mod.size)}</small></div><span>DLL</span>`;
      root.appendChild(row);
    });
  }
  showPage("profile-detail");
}

function renderDownloads(downloads = []) {
  const root = $("#downloadsList");
  const activeCount = downloads.filter((item) => item.state === "progressing").length;
  $("#downloadBadge").hidden = activeCount === 0;
  $("#downloadBadge").textContent = activeCount;
  if (!downloads.length) {
    root.className = "downloads-list list-empty";
    root.textContent = "No downloads yet. Use the Mod Browser to find one.";
    return;
  }
  root.className = "downloads-list";
  root.innerHTML = "";
  for (const item of downloads) {
    const percent = item.total ? Math.min(100, Math.round((item.received / item.total) * 100)) : 0;
    const row = document.createElement("div");
    row.className = "download-row";
    row.innerHTML = `<div class="download-icon">⇩</div><div class="download-meta"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.url)}</small></div><div><div class="progress"><i style="width:${percent}%"></i></div><small>${item.state === "completed" ? "Complete" : `${percent}%`}</small></div>`;
    const show = document.createElement("button");
    show.textContent = "Show";
    show.onclick = () => api.showPath(item.path);
    row.appendChild(show);
    if (item.state === "completed" && item.name.toLowerCase().endsWith(".dll")) {
      const install = document.createElement("button");
      install.className = "secondary";
      install.textContent = "Install mod";
      install.onclick = async () => {
        const result = await safe(() => api.installDownloadedMod(item.path), "Mod installed into the active profile");
        if (result) { await refreshMods(); await refreshState(); }
      };
      row.appendChild(install);
    }
    root.appendChild(row);
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

async function saveSettings() {
  const settings = {
    gamePath: $("#gamePath").value.trim(),
    instancePath: $("#instancePath").value.trim(),
    melonLoaderPath: $("#melonLoaderPath").value.trim(),
    downloadPath: "",
    launchArguments: $("#launchArguments").value.trim()
  };
  await safe(() => api.saveSettings(settings), "Settings saved");
  await refreshState();
}

async function downloadMelonLoader() {
  const result = await safe(
    () => api.downloadMelonLoader(),
    "Official MelonLoader installer download started"
  );
  if (result) toast(`Downloading ${result.name} (${result.version})`);
}

async function completeFirstRun() {
  await safe(
    () => api.saveSettings({ ...appState.settings, firstRunComplete: true }),
    "Setup saved"
  );
  await refreshState();
}

function openInBrowser(url) {
  addTab(url);
  showPage("browser");
}

function focusProfileName() {
  // A Chromium guest can retain the native keyboard focus even when its page is
  // hidden. Blur it first, then give the host document and input a fresh turn.
  activeWebview()?.blur();
  window.focus();
  requestAnimationFrame(() => {
    const input = $("#profileName");
    input.focus({ preventScroll: true });
    input.select();
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  document.addEventListener("click", (event) => {
    if (event.target.closest("button")) bananaBurst(event.clientX, event.clientY);
  }, true);
  $$(".nav-item").forEach((button) => (button.onclick = () => showPage(button.dataset.page)));
  $$("[data-go]").forEach((button) => (button.onclick = () => showPage(button.dataset.go)));
  $("#newTab").onclick = () => addTab("https://www.google.com");
  $("#browserBack").onclick = () => activeWebview()?.canGoBack() && activeWebview().goBack();
  $("#browserForward").onclick = () => activeWebview()?.canGoForward() && activeWebview().goForward();
  $("#browserReload").onclick = () => {
    const view = activeWebview();
    if (!view) return;
    view.isLoading() ? view.stop() : view.reload();
  };
  $("#browserHome").onclick = () => activeWebview()?.loadURL(MOD_HOME);
  $("#browserExternal").onclick = () => activeWebview() && api.openExternal(activeWebview().getURL());
  $("#addressBar").onkeydown = (event) => {
    if (event.key === "Enter") activeWebview()?.loadURL(normalizeAddress(event.target.value));
  };

  const launch = () => safe(() => api.launchGame(), "BTD6 launched with the active profile");
  $("#launchGameTop").onclick = launch;
  $("#launchGameHero").onclick = launch;
  $("#updateGame").onclick = () => safe(() => api.updateGame(), "Opened BTD6 in Steam");
  $("#runMelonCard").onclick = () => appState.settings.melonLoaderPath
    ? safe(() => api.launchMelonLoader(), "MelonLoader installer opened")
    : downloadMelonLoader();
  $("#runMelonSettings").onclick = () => appState.settings.melonLoaderPath
    ? safe(() => api.launchMelonLoader(), "MelonLoader installer opened")
    : downloadMelonLoader();
  $("#createInstance").onclick = async () => {
    const result = await safe(() => api.createManagedCopy(), "Managed BTD6 copy created");
    if (result && !result.canceled) await refreshState();
  };
  $("#setupChooseGame").onclick = async () => {
    const value = await api.chooseGame();
    if (value) {
      $("#gamePath").value = value;
      await safe(() => api.saveSettings({ ...appState.settings, gamePath: value }), "BTD6 path saved");
      await refreshState();
    }
  };
  $("#setupCreateCopy").onclick = async () => {
    const result = await safe(() => api.createManagedCopy(), "Managed BTD6 copy created");
    if (result && !result.canceled) await refreshState();
  };
  $("#setupDownloadMelon").onclick = downloadMelonLoader;
  $("#setupFinish").onclick = completeFirstRun;
  $("#installMod").onclick = async () => {
    const result = await safe(() => api.installMods(), "Selected mods installed into the active profile");
    if (result) {
      await refreshMods();
      await refreshState();
    }
  };

  $("#newProfile").onclick = () => {
    $("#profileModal").hidden = false;
    $("#profileName").value = "";
    focusProfileName();
  };
  $("#cancelProfile").onclick = () => ($("#profileModal").hidden = true);
  $("#confirmProfile").onclick = async () => {
    const result = await safe(() => api.createProfile($("#profileName").value), "Profile created");
    if (result) {
      $("#profileModal").hidden = true;
      await refreshState();
    }
  };
  $("#profileName").onkeydown = (event) => event.key === "Enter" && $("#confirmProfile").click();
  $("#backToProfiles").onclick = () => showPage("profiles");
  $("#openProfileManifest").onclick = () => {
    if (openProfileDetail?.manifestPath) api.showPath(openProfileDetail.manifestPath);
  };

  $("#chooseGame").onclick = async () => {
    const value = await api.chooseGame();
    if (value) $("#gamePath").value = value;
  };
  $("#chooseInstance").onclick = async () => {
    const value = await api.chooseFolder("Choose managed BTD6 folder");
    if (value) $("#instancePath").value = value;
  };
  $("#chooseMelon").onclick = async () => {
    const value = await api.chooseMelonLoader();
    if (value) $("#melonLoaderPath").value = value;
  };
  $("#saveSettings").onclick = saveSettings;
  $("#findMelon").onclick = downloadMelonLoader;
  $("#openDownloadsFolder").onclick = () => {
    const latest = appState.downloads[0];
    if (latest) api.showPath(latest.path);
    else toast("Download a file first. Browser downloads go to AppData\\Local\\BananaForge\\downloads.");
  };

  api.onDownloadsChanged((downloads) => {
    appState.downloads = downloads;
    renderDownloads(downloads);
  });
  api.onNewTab((url) => openInBrowser(url));
  api.onInstanceProgress((value) => toast(value.message));
  api.onMelonLoaderDownloaded(async (value) => {
    toast(`${value.name} downloaded. You can now run its installer.`);
    await refreshState();
  });

  addTab();
  await refreshState();
});
