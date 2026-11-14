const api = window.bananaforge;
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

let appState;
let tabs = [];
let activeTabId = null;
let toastTimer;
let openProfileDetail;
let settingsDirty = false;
const MOD_HOME = "https://gurrenm3.github.io/BTD-Mod-Helper/mod-browser?search=";

window.addEventListener('error', (event) => {
  api.reportRendererError(`window error: ${event.message || 'unknown error'} at ${event.filename || 'unknown source'}:${event.lineno || 0}:${event.colno || 0}`);
});
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason?.stack || event.reason?.message || String(event.reason || 'unknown rejection');
  api.reportRendererError(`unhandled promise rejection: ${reason}`);
});

let reduceMotion = false;
const motionPreferences = gsap.matchMedia();
motionPreferences.add({ all: "all", reduceMotion: "(prefers-reduced-motion: reduce)" }, (context) => {
  reduceMotion = context.conditions.reduceMotion;
});

let bootStartedAt = 0;
let bootMotions = [];

function setBootProgress(percent, message) {
  const fill = $('#bootProgressFill');
  const label = $('#bootStatusText');
  if (!fill || !label) return;
  label.textContent = message;
  const progress = Math.max(0.08, Math.min(1, percent / 100));
  if (reduceMotion) gsap.set(fill, { scaleX: progress });
  else gsap.to(fill, { scaleX: progress, duration: 0.38, ease: 'power2.out', overwrite: 'auto' });
}

function startBootMotion() {
  const screen = $('#bootScreen');
  if (!screen) return;
  for (const motion of bootMotions) motion?.kill();
  bootMotions = [];
  bootStartedAt = performance.now();
  const route = $('#bootMapRoute');
  const balloons = $$('.boot-bloon');
  if (reduceMotion) {
    if (route) {
      const length = route.getTotalLength();
      balloons.forEach((balloon, index) => {
        const point = route.getPointAtLength(length * (0.23 + index * 0.13));
        gsap.set(balloon, { x: point.x, y: point.y, yPercent: 0 });
      });
    }
    gsap.set('.boot-shot', { x: 365, y: 273, autoAlpha: 0.85 });
    gsap.set('.boot-impact', { scale: 0.65, autoAlpha: 0.65, transformOrigin: '336px 260px' });
    gsap.set('.boot-content, .boot-scene, .boot-emblem', { autoAlpha: 1, clearProps: 'transform' });
    return;
  }
  const intro = gsap.timeline({ defaults: { ease: 'power3.out' } });
  intro.fromTo('.boot-emblem', { autoAlpha: 0, scale: 0.78, y: 12 }, { autoAlpha: 1, scale: 1, y: 0, duration: 0.5 })
    .fromTo('.boot-brand-row, .boot-content h1, .boot-description, .boot-progress-track, .boot-status-row, .boot-footer',
      { autoAlpha: 0, y: 9 }, { autoAlpha: 1, y: 0, duration: 0.32, stagger: 0.055, clearProps: 'transform,opacity,visibility' }, '-=0.22');
  const sceneIntro = gsap.fromTo('.boot-scene', { autoAlpha: 0, x: 24, scale: 0.97 }, { autoAlpha: 1, x: 0, scale: 1, duration: 0.72, ease: 'power3.out' });
  const orbit = gsap.timeline({ repeat: -1 });
  orbit.to('.boot-orbit-outer', { rotation: 360, duration: 15, ease: 'none' }, 0)
    .to('.boot-orbit-inner', { rotation: -360, duration: 11, ease: 'none' }, 0);
  const glow = gsap.to('.boot-emblem-backdrop', { scale: 1.14, autoAlpha: 0.75, duration: 1.8, repeat: -1, yoyo: true, ease: 'sine.inOut' });
  const dots = gsap.to('.boot-loading-dots i', { autoAlpha: 0.92, stagger: 0.17, duration: 0.34, repeat: -1, yoyo: true, ease: 'sine.inOut' });
  const glint = gsap.fromTo('.boot-progress-glint', { x: -48 }, { x: 430, duration: 1.55, repeat: -1, ease: 'sine.inOut' });
  const scene = gsap.timeline({ repeat: -1, defaults: { ease: 'sine.inOut' } });
  scene.to('.boot-scene-halo', { opacity: 0.2, duration: 1.7, yoyo: true, repeat: 1 })
    .to('.boot-scene-ring-a', { rotation: 360, transformOrigin: '340px 245px', duration: 24, ease: 'none' }, 0)
    .to('.boot-scene-ring-b', { rotation: -360, transformOrigin: '340px 245px', duration: 32, ease: 'none' }, 0)
    .to('.boot-tower-core', { scale: 1.25, transformOrigin: 'center center', duration: 0.75, yoyo: true, repeat: 1 }, 0.8)
    .to('.boot-tower-barrel', { rotation: 18, duration: 0.28, yoyo: true, repeat: 1, transformOrigin: '50% 100%' }, 1.18);
  const routeMotions = balloons.map((balloon, index) => {
    if (!route) return null;
    const length = route.getTotalLength();
    const runner = { distance: length * (index * 0.16) };
    const placeOnRoute = () => {
      const point = route.getPointAtLength(runner.distance % length);
      const bob = Math.sin(runner.distance / length * Math.PI * 18 + index) * 3;
      gsap.set(balloon, { x: point.x, y: point.y + bob });
    };
    placeOnRoute();
    return gsap.to(runner, {
      distance: length * (1 + index * 0.16), duration: 9 + index * 1.1, repeat: -1, ease: 'none', delay: index * 0.42,
      onUpdate: placeOnRoute,
    });
  }).filter(Boolean);
  const firing = gsap.timeline({ repeat: -1, repeatDelay: 0.7, delay: 0.35 });
  firing.set('.boot-shot', { x: 408, y: 286, autoAlpha: 1, scale: 0.6 })
    .to('.boot-shot', { x: 336, y: 260, scale: 1, duration: 0.38, ease: 'power2.in' })
    .fromTo('.boot-impact', { scale: 0.35, autoAlpha: 0.95, transformOrigin: '336px 260px' }, { scale: 1.6, autoAlpha: 0, duration: 0.48, ease: 'power2.out' }, '-=0.05')
    .set('.boot-shot', { autoAlpha: 0 });
  bootMotions = [intro, sceneIntro, orbit, glow, dots, glint, scene, ...routeMotions, firing];
}

function showBootError(error) {
  const screen = $('#bootScreen');
  const description = $('.boot-description');
  if (!screen) return;
  for (const motion of bootMotions) motion?.kill();
  bootMotions = [];
  screen.classList.add('boot-error');
  $('#bootTitle').innerHTML = 'Workspace needs<br><span>another moment.</span>';
  if (description) description.textContent = friendlyError(error).slice(0, 180);
  $('#bootStatusText').textContent = 'BananaForge could not finish loading your local workspace.';
  $('#bootRetry').hidden = false;
  $('#bootRetry').disabled = false;
}

function leaveBootScreen() {
  const screen = $('#bootScreen');
  if (!screen) return Promise.resolve();
  screen.setAttribute('aria-busy', 'false');
  document.body.classList.add('app-ready');
  const appRoot = $('#app');
  appRoot?.removeAttribute('aria-hidden');
  if (appRoot) appRoot.inert = false;
  for (const motion of bootMotions) motion?.kill();
  bootMotions = [];
  if (reduceMotion) {
    gsap.set(screen, { autoAlpha: 0 });
    screen.remove();
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    gsap.timeline({ onComplete: () => { screen.remove(); resolve(); } })
      .to('.boot-content', { y: -8, autoAlpha: 0, duration: 0.19, ease: 'power2.in' })
      .to(screen, { autoAlpha: 0, duration: 0.26, ease: 'power1.out' }, '-=0.04');
  });
}

async function loadInitialWorkspace() {
  const retry = $('#bootRetry');
  if (retry) { retry.hidden = true; retry.disabled = true; }
  $('#bootScreen')?.classList.remove('boot-error');
  setBootProgress(28, 'Reconnecting to your local workspace');
  try {
    setBootProgress(46, 'Restoring profiles and installed mods');
    await refreshState();
    setBootProgress(86, 'Preparing your game and workspace views');
    if (!tabs.length) addTab();
    setBootProgress(100, `Ready when you are${appState?.profiles?.length ? ` · ${appState.profiles.length} profiles` : ''}`);
    const minimumTime = reduceMotion ? 180 : 1800;
    const remaining = Math.max(0, minimumTime - (performance.now() - bootStartedAt));
    if (remaining) await new Promise((resolve) => setTimeout(resolve, remaining));
    await leaveBootScreen();
    return true;
  } catch (error) {
    showBootError(error);
    return false;
  }
}

function animatePage(page) {
  const targets = page.querySelectorAll(
    ".page-header, .home-launch, .status-grid, .quick-row, .table-card, .profile-grid, .downloads-list, .settings-grid, .setup-layout, .log-controls"
  );
  gsap.killTweensOf(targets);
  gsap.set(targets, { clearProps: 'opacity,visibility,transform' });
  if (reduceMotion) return;
  if (targets.length) {
    gsap.fromTo(targets, { y: 6 }, {
      y: 0,
      duration: 0.2,
      stagger: 0.02,
      ease: "power2.out",
      overwrite: "auto",
      clearProps: "opacity,visibility,transform"
    });
  }
}

function toast(message, error = false) {
  const node = $("#toast");
  node.setAttribute('role', 'status');
  node.setAttribute('aria-live', 'polite');
  node.textContent = message;
  node.className = `toast show${error ? " error" : ""}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (node.className = "toast"), 4200);
}

function updateToast(message, error = false) {
  const node = $('#toast');
  node.setAttribute('role', error ? 'alert' : 'status');
  node.setAttribute('aria-live', error ? 'assertive' : 'polite');
  node.textContent = message;
  node.className = `toast show update-toast${error ? ' error' : ''}`;
  clearTimeout(toastTimer);
  if (!reduceMotion) {
    gsap.killTweensOf(node);
    gsap.fromTo(node, { y: -8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.22, ease: 'power2.out', overwrite: 'auto', clearProps: 'transform,opacity' });
  }
  toastTimer = setTimeout(() => { node.className = 'toast'; }, 6500);
}

function toastAction(message, label, action) {
  const node = $('#toast');
  clearTimeout(toastTimer);
  node.replaceChildren();
  node.setAttribute('role', 'alert');
  node.setAttribute('aria-live', 'assertive');
  node.className = 'toast show error actionable';
  const text = document.createElement('span');
  text.textContent = message;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'toast-action-button';
  button.textContent = label;
  button.onclick = async () => {
    button.disabled = true;
    button.textContent = 'Working…';
    try { await action(); }
    catch (error) { toast(friendlyError(error), true); }
  };
  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'toast-dismiss-button';
  dismiss.textContent = 'Dismiss';
  dismiss.onclick = () => { clearTimeout(toastTimer); node.className = 'toast'; node.replaceChildren(); node.setAttribute('role', 'status'); node.setAttribute('aria-live', 'polite'); };
  node.append(text, button, dismiss);
  toastTimer = setTimeout(() => { node.className = 'toast'; node.replaceChildren(); }, 30000);
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
  $$(".nav-item").forEach((node) => {
    const active = node.dataset.page === page;
    node.classList.toggle("active", active);
    if (active) node.setAttribute("aria-current", "page");
    else node.removeAttribute("aria-current");
  });
  const activePage = $(`#page-${page}`);
  if (activePage) animatePage(activePage);
  if (page === "mods") refreshMods();
  if (page === "profiles") renderProfiles();
  if (page === "downloads") renderDownloads(appState.downloads);
}

function normalizeAddress(input) {
  const value = input.trim();
  if (!value) return MOD_HOME;
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value)) {
    if (!/^https?:\/\//i.test(value)) throw new Error('Only HTTP and HTTPS websites can be opened here.');
    return value;
  }
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
    if (tab.id === activeTabId) $('#browserError').hidden = true;
    if (tab.id === activeTabId) $("#browserReload").textContent = "×";
  });
  tab.view.addEventListener("did-stop-loading", () => {
    if (tab.id === activeTabId) $("#browserReload").textContent = "↻";
    sync();
  });
  tab.view.addEventListener('did-fail-load', (event) => {
    if (event.errorCode === -3 || event.isMainFrame === false) return;
    tab.error = event.errorDescription || 'Check your internet connection and try again.';
    if (tab.id === activeTabId) { $('#browserErrorMessage').textContent = tab.error; $('#browserError').hidden = false; }
  });
  tab.view.addEventListener('did-finish-load', () => { tab.error = ''; if (tab.id === activeTabId) $('#browserError').hidden = true; });
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
  $('#browserError').hidden = !tab?.error;
  $('#browserErrorMessage').textContent = tab?.error || '';
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
    const button = document.createElement("div");
    const active = tab.id === activeTabId;
    button.className = `browser-tab${active ? " active" : ""}`;
    const select = document.createElement("button");
    select.type = "button";
    select.className = "tab-select";
    select.setAttribute("aria-pressed", String(active));
    const label = document.createElement("span");
    label.textContent = tab.title;
    select.appendChild(label);
    const close = document.createElement("button");
    close.type = "button";
    close.className = "close";
    close.textContent = "×";
    close.setAttribute("aria-label", `Close ${tab.title}`);
    close.onclick = (event) => {
      event.stopPropagation();
      closeTab(tab.id);
    };
    select.onclick = () => activateTab(tab.id);
    button.append(select, close);
    root.appendChild(button);
  }
}

async function refreshState() {
  appState = await api.getState();
  renderLoaderAdvice();
  $("#versionLabel").textContent = `BananaForge ${appState.version}`;
  const active = appState.profiles.find((profile) => profile.id === appState.activeProfileId);
  $("#activeProfileName").textContent = active?.name || "Default";
  const mods = await api.listMods();
  $("#activeProfileCount").textContent = `${mods.length} installed mod${mods.length === 1 ? "" : "s"}`;
  const managedGame = appState.configuredInstancePath;
  const originalGame = appState.configuredGamePath || appState.detectedGame;
  const game = managedGame || originalGame;
  const ready = Boolean(game);
  const needsRuntime = Boolean(active?.enabledCount && !appState.runtimeInstalled);
  const profileReady = ready && !needsRuntime;
  const runtime = appState.activeProfileRuntime;
  let playStatus = !ready ? 'Choose your game to get started' : needsRuntime ? 'Finish mod setup before playing' : 'Ready to launch';
  if (profileReady && active?.enabledCount) {
    if (!runtime?.checkedAt && !runtime?.lastRunAt) playStatus = 'Ready to launch · mods not verified yet';
    else if (runtime.errorCount && runtime.staleEvidence) playStatus = `Historical log: ${runtime.errorCount} mod error${runtime.errorCount === 1 ? '' : 's'} · verify before playing`;
    else if (runtime.errorCount) playStatus = `${runtime.errorCount} mod${runtime.errorCount === 1 ? '' : 's'} reported errors last run`;
    else if (runtime.loadedCount === runtime.enabledCount && runtime.complete) playStatus = `${runtime.loadedCount} enabled mods loaded last run`;
    else playStatus = `${runtime.loadedCount} of ${runtime.enabledCount} enabled mods loaded last run`;
  }
  $("#workspaceStatus").textContent = playStatus;
  $("#workspaceStatus").classList.toggle("success", profileReady && (!runtime?.errorCount));
  $("#workspaceStatus").classList.toggle("warning", !profileReady || Boolean(runtime?.errorCount) || Boolean(active?.enabledCount && runtime?.notLoadedCount));
  updateLaunchControls();
  $('#homeProfileName').textContent = active?.name || 'Default';
  const runtimeSummary = active?.enabledCount && runtime?.checkedAt
    ? runtime.staleEvidence
      ? `Historical log match only: ${runtime.loadedCount} mod${runtime.loadedCount === 1 ? '' : 's'} loaded${runtime.errorCount ? ` · ${runtime.errorCount} reported errors` : ''}. The previous profile is unknown.`
      : `${runtime.loadedCount} of ${runtime.enabledCount} enabled mods loaded last run${runtime.errorCount ? ` · ${runtime.errorCount} with logged errors` : ''}. This reflects the last log, not a guarantee for the next game update.`
    : `${active?.enabledCount || 0} enabled mods · ${active?.enabledCount ? 'Runtime compatibility has not been verified by a launch yet' : managedGame ? 'No mods enabled' : 'Create a managed copy to use mods'}`;
  $('#homeProfileSummary').textContent = active?.description || runtimeSummary;
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
  const melonReady = appState.installerAvailable;
  $("#melonStatus").textContent = appState.runtimeInstalled ? 'Runtime files detected' : 'Runtime not installed';
  const loaderVersionHelp = appState.melonLoaderRecommendation?.status || `Recommended: ${appState.recommendedMelonLoaderVersion}.`;
  $('#melonStatusHelp').textContent = appState.runtimeInstalled
    ? `${loaderVersionHelp} Recheck compatibility after a BTD6 update.`
    : melonReady
      ? `Installer downloaded. Choose ${appState.recommendedMelonLoaderVersion} and select the managed game. ${loaderVersionHelp}`
      : `Download the official installer and choose ${appState.recommendedMelonLoaderVersion}. ${loaderVersionHelp}`;
  $("#runMelonCard").textContent = melonReady ? "Open installer →" : "Set up MelonLoader →";
  if (!settingsDirty) fillSettings();
  renderProfiles();
  renderDownloads(appState.downloads);
  updateWorkspaceState();
}

function renderLoaderAdvice() {
  if (!appState) return;
  const recommendation = appState.melonLoaderRecommendation;
  if (!recommendation) return;
  const version = recommendation.recommendedVersion || appState.recommendedMelonLoaderVersion || 'v0.7.3';
  const text = $('#loaderAdviceText');
  const meta = $('#loaderAdviceMeta');
  const sources = $('#loaderAdviceSources');
  if (text) text.textContent = recommendation.status || `Choose ${version} stable in the official MelonLoader installer.`;
  if (meta) {
    const checkedAt = recommendation.checkedAt ? new Date(recommendation.checkedAt).toLocaleString() : 'Not checked online yet';
    const unity = recommendation.gameUnityVersion ? `Unity ${recommendation.gameUnityVersion}` : 'Unity version not detected';
    const sourcesChecked = [recommendation.releaseChecked ? 'MelonLoader releases' : '', recommendation.compatibilityDataChecked ? 'Mod Helper rules' : ''].filter(Boolean);
    meta.textContent = `${unity} · Checked ${checkedAt}${sourcesChecked.length ? ` · Sources checked: ${sourcesChecked.join(', ')}` : ''}`;
  }
  if (sources) {
    sources.replaceChildren();
    for (const source of recommendation.sources || []) {
      if (!/^https:\/\//.test(source.url || '')) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = source.label;
      button.onclick = () => api.openExternal(source.url);
      sources.append(button);
    }
  }
  const refresh = $('#refreshLoaderAdvice');
  if (refresh) refresh.textContent = recommendation.checkedAt ? 'Check again' : 'Check sources';
}

function updateLaunchControls() {
  if (!appState) return;
  const busy = appState.gameRunning || appState.gameLaunching || appState.setupJob?.status === 'running' || Boolean(appState.autoUpdateJob);
  const ready = Boolean(appState.configuredInstancePath || appState.configuredGamePath || appState.detectedGame);
  for (const button of $$('#launchGameTop, #launchGameHero, #profileDetailPlay, .play-profile')) {
    button.disabled = !ready || busy;
    if (button.id === 'launchGameTop' || button.id === 'launchGameHero') {
      const active = appState.profiles.find((profile) => profile.id === appState.activeProfileId);
      button.textContent = appState.gameLaunching
        ? appState.gameLaunchPhase === 'generating' ? 'Building game files…' : appState.gameLaunchPhase === 'launching' ? 'Finishing startup…' : 'Starting…'
        : appState.gameExternalRunning ? 'Close game to continue' : appState.gameRunning ? 'Game running' : active?.enabledCount && !appState.runtimeInstalled ? 'Finish mod setup' : 'Launch game';
      button.title = appState.gameExternalRunning ? 'BloonsTD6 is already running. Close it before syncing files or launching again.' : '';
    }
  }
  $$('.close-game').forEach((button) => {
    button.hidden = !appState.gameRunning || appState.gameLaunching;
    button.disabled = appState.gameLaunching;
  });
}

function fillSettings() {
  $("#gamePath").value = appState.configuredGamePath || appState.detectedGame || "";
  $("#instancePath").value = appState.configuredInstancePath || "";
  $("#melonLoaderPath").value = appState.settings.melonLoaderPath || "";
  $("#launchArguments").value = appState.settings.launchArguments || "";
  $("#downloadPath").value = appState.downloadRoot || '';
  $('#autoUpdateMods').checked = appState.settings.autoUpdateMods === true;
  $('#autoUpdateApp').checked = appState.settings.autoUpdateApp !== false;
  $('#autoUpdateGame').checked = appState.settings.autoUpdateGame !== false;
  if (appState.appUpdateStatus) $('#appUpdateStatus').textContent = appState.appUpdateStatus.message || (appState.appUpdateStatus.status === 'current' ? `BananaForge ${appState.version} is up to date.` : 'Checking BananaForge releases…');
  if (appState.gameUpdateStatus) $('#gameUpdateStatus').textContent = appState.gameUpdateStatus.message || (appState.gameUpdateStatus.status === 'updated' ? `BTD6 copy updated from Steam · ${appState.gameUpdateStatus.copied} files.` : 'Steam build check complete.');
}

async function refreshMods() {
  const mods = await safe(() => api.listMods());
  if (!mods) return;
  const detail = await safe(() => api.profileDetails(appState.activeProfileId));
  const manifestMods = new Map((detail?.manifest?.mods || []).map((mod) => [mod.file, mod]));
  const runtime = detail?.manifest?.runtime;
  const summary = $('#modsRuntimeSummary');
  if (summary) {
    if (!runtime?.checkedAt && !runtime?.lastRunAt) summary.textContent = 'No recorded launch yet. Launch through BananaForge to verify which enabled DLLs load.';
    else {
      const checked = runtime.checkedAt ? new Date(runtime.checkedAt).toLocaleString() : 'time unavailable';
      const unity = runtime.unityVersion ? ` · Unity ${runtime.unityVersion}` : '';
      summary.textContent = runtime.staleEvidence
        ? `Historical log only: ${runtime.loadedCount} matching DLLs loaded · ${runtime.errorCount} logged mod errors · checked ${checked}${unity}. The profile used for that run is unknown; launch again to verify this profile.`
        : `${runtime.loadedCount}/${runtime.enabledCount} enabled mods loaded in the last recorded run · ${runtime.errorCount} logged mod errors · checked ${checked}${unity}. This is log evidence, not a guarantee after a game update.`;
    }
  }
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
    const enabled = !(appState.profiles.find((item) => item.id === appState.activeProfileId)?.disabledMods || []).includes(name);
    const runtimeEvidence = manifestMods.get(name);
    row.innerHTML = `<div class="mod-file"><strong>${escapeHtml(name)}</strong><small class="runtime-evidence ${['error', 'error-stale'].includes(runtimeEvidence?.runtimeStatus) ? 'is-error' : ''}">${escapeHtml(runtimeEvidence?.runtimeNote || 'Not checked in the most recent launch.')}</small></div><small>${escapeHtml(profile)}</small><label class="inline-check"><input type="checkbox" ${enabled ? 'checked' : ''} aria-label="Enable ${escapeHtml(name)}"><span class="${enabled ? 'ok' : ''}">${enabled ? 'Enabled' : 'Disabled'}</span></label>`;
    row.querySelector('input').onchange = async (event) => {
      event.target.disabled = true;
      await safe(() => api.toggleMod(appState.activeProfileId, name, event.target.checked));
      await refreshState(); await refreshMods();
    };
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

let renderProfiles;
let showProfileDetails;

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
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
    const status = { completed: 'Complete', interrupted: 'Interrupted', cancelled: 'Cancelled', progressing: item.total ? `${percent}%` : 'Downloading…' }[item.state] || item.state;
    row.innerHTML = `<div class="download-icon">↓</div><div class="download-meta"><strong>${escapeHtml(item.name)}</strong><small title="${escapeHtml(item.url)}">${escapeHtml(item.url)}</small></div><div class="download-progress"><div class="progress"><i style="width:${percent}%"></i></div><small>${escapeHtml(status)} · ${formatBytes(item.received)}</small></div>`;
    const show = document.createElement("button");
    show.textContent = "Show";
    show.onclick = () => api.showPath(item.path);
    row.appendChild(show);
    show.disabled = item.state !== 'completed';
    if (item.state === 'progressing') {
      const cancel = document.createElement('button'); cancel.textContent = 'Cancel';
      cancel.onclick = () => safe(() => api.cancelDownload(item.id)); row.appendChild(cancel);
    }
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
    downloadPath: $("#downloadPath").value.trim(),
    launchArguments: $("#launchArguments").value.trim(),
    autoUpdateMods: $('#autoUpdateMods').checked,
    autoUpdateApp: $('#autoUpdateApp').checked,
    autoUpdateGame: $('#autoUpdateGame').checked
  };
  const result = await safe(() => api.saveSettings(settings), "Settings saved");
  if (result) { settingsDirty = false; $('#saveSettings').textContent = 'Save settings'; }
  await refreshState();
}

async function downloadMelonLoader() {
  showPage('setup');
  $("#pkgMelon").checked = true;
  $("#setupStart").focus();
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

document.addEventListener("DOMContentLoaded", async () => {
  startBootMotion();
  const bootRetry = $('#bootRetry');
  if (bootRetry) bootRetry.onclick = async () => {
    startBootMotion();
    await finishInitialWorkspaceLoad();
  };
  const iconPaths = {
    dashboard: '<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',
    browser: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
    mods: '<path d="m12 3 9 5v8l-9 5-9-5V8Z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
    profiles: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 5V3h8v2M3 11h18"/>',
    downloads: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    logs: '<path d="M7 5h14M7 12h14M7 19h14M3 5h.01M3 12h.01M3 19h.01"/>',
    setup: '<path d="m14 3 7 7-4 4-7-7Z"/><path d="m11 8-8 8v5h5l8-8"/>',
    settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor"/><circle cx="15" cy="17" r="3" fill="currentColor"/>'
  };
  for (const button of $$('.nav-item')) button.querySelector('span').innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[button.dataset.page]}</svg>`;
  $$(".nav-item").forEach((button) => (button.onclick = () => showPage(button.dataset.page)));
  $$("[data-go]").forEach((button) => (button.onclick = () => showPage(button.dataset.go)));
  $("#newTab").onclick = () => addTab();
  $('#browserRetry').onclick = () => activeWebview()?.reload();
  $('#browserErrorExternal').onclick = () => safe(() => api.openExternal(activeWebview()?.getURL()));
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
    if (event.key === "Enter") safe(() => activeWebview()?.loadURL(normalizeAddress(event.target.value)));
  };

  const launch = async () => {
    const active = appState.profiles.find((profile) => profile.id === appState.activeProfileId);
    if (!(appState.configuredInstancePath || appState.detectedGame) || (active?.enabledCount && !appState.runtimeInstalled)) return showPage('setup');
    const result = await safe(() => api.launchGame());
    if (!result || result.blockedByMod) return;
    toast(result.generatedAssemblies ? 'First-run game files are ready. BTD6 is continuing startup.' : 'BTD6 started. Open Game logs to follow startup.');
    await refreshState();
  };
  $('#homeOpenProfile').onclick = () => showProfileDetails(appState.activeProfileId);
  $("#launchGameHero").onclick = launch;
  $("#updateGame").onclick = () => safe(() => api.updateGame(), "Opened BTD6 in Steam");
  $("#runMelonCard").onclick = () => appState.settings.melonLoaderPath
    ? safe(() => api.launchMelonLoader(), "MelonLoader installer opened")
    : downloadMelonLoader();
  $("#runMelonSettings").onclick = () => appState.settings.melonLoaderPath
    ? safe(() => api.launchMelonLoader(), "MelonLoader installer opened")
    : downloadMelonLoader();
  $("#createInstance").onclick = () => showPage('setup');
  $("#installMod").onclick = async () => {
    const result = await safe(() => api.installMods(), "Selected mods installed into the active profile");
    if (result) {
      await refreshMods();
      await refreshState();
    }
  };
  const installLinkDialog = $('#installLinkDialog');
  $('#installModLink').onclick = () => {
    $('#installLinkUrl').value = '';
    $('#installLinkStatus').textContent = '';
    installLinkDialog.showModal();
    $('#installLinkUrl').focus();
  };
  $('#cancelInstallLink').onclick = () => installLinkDialog.close();
  $('#installLinkForm').onsubmit = async (event) => {
    event.preventDefault();
    const button = $('#confirmInstallLink');
    const status = $('#installLinkStatus');
    button.disabled = true;
    button.textContent = 'Inspecting GitHub…';
    status.textContent = 'Checking the repository and validating the mod DLL…';
    try {
      const result = await api.installModFromLink($('#installLinkUrl').value.trim());
      if (result?.cancelled) return;
      installLinkDialog.close();
      toast(`${result.name} installed in the active profile`);
      await refreshMods();
      await refreshState();
    } catch (error) {
      status.textContent = friendlyError(error);
      toast(friendlyError(error), true);
    } finally {
      button.disabled = false;
      button.textContent = 'Find and install DLL';
    }
  };

  $("#newProfile").onclick = () => api.openProfileDialog();
  $("#backToProfiles").onclick = () => showPage("profiles");
  $("#openProfileManifest").onclick = () => {
    if (openProfileDetail?.manifestPath) api.showPath(openProfileDetail.manifestPath);
  };

  $("#chooseGame").onclick = async () => {
    const value = await api.chooseGame();
    if (value) { $("#gamePath").value = value; settingsDirty = true; }
  };
  $("#chooseInstance").onclick = async () => {
    const value = await api.chooseFolder("Choose managed BTD6 folder");
    if (value) { $("#instancePath").value = value; settingsDirty = true; }
  };
  $("#chooseMelon").onclick = async () => {
    const value = await api.chooseMelonLoader();
    if (value) { $("#melonLoaderPath").value = value; settingsDirty = true; }
  };
  $("#saveSettings").onclick = saveSettings;
  $('#checkAppUpdate').onclick = async () => {
    const button = $('#checkAppUpdate');
    button.disabled = true;
    button.classList.add('is-checking');
    $('#appUpdateStatus').textContent = 'Checking GitHub Releases for a verified update…';
    try { await api.checkAppUpdate(); }
    catch (error) { toast(friendlyError(error), true); }
    finally { button.disabled = false; button.classList.remove('is-checking'); }
  };
  $('#checkGameUpdate').onclick = async () => {
    $('#gameUpdateStatus').textContent = 'Checking the Steam build and managed copy…';
    const result = await safe(() => api.checkGameUpdate());
    if (result?.status === 'current') $('#gameUpdateStatus').textContent = `Managed copy matches Steam build ${result.buildId}.`;
    else if (result?.status === 'busy') $('#gameUpdateStatus').textContent = 'Sync waits until BTD6 closes.';
    else if (result?.status === 'unavailable') $('#gameUpdateStatus').textContent = 'Set up the Steam game and managed copy to enable syncing.';
  };
  $("#findMelon").onclick = downloadMelonLoader;
  $("#refreshLoaderAdvice").onclick = async () => {
    const button = $("#refreshLoaderAdvice");
    button.disabled = true;
    button.textContent = "Checking…";
    const status = $("#loaderAdviceText");
    if (status) status.textContent = "Checking official MelonLoader releases and BTD Mod Helper compatibility data…";
    try {
      appState.melonLoaderRecommendation = await api.getMelonLoaderRecommendation(true);
      appState.recommendedMelonLoaderVersion = `${appState.melonLoaderRecommendation.recommendedVersion} stable`;
      renderLoaderAdvice();
      const help = $("#melonStatusHelp");
      if (help) help.textContent = appState.melonLoaderRecommendation.status;
    } catch (error) {
      if (status) status.textContent = `Could not check official sources. Use ${appState.melonLoaderRecommendation?.recommendedVersion || "v0.7.3"} stable, the last locally verified version.`;
      toast(friendlyError(error), true);
    } finally {
      button.disabled = false;
      if (appState) renderLoaderAdvice();
    }
  };
  $("#openDownloadsFolder").onclick = () => safe(() => api.openDownloadsFolder());
  $$('#page-settings input').forEach((input) => input.addEventListener('input', () => { settingsDirty = true; $('#saveSettings').textContent = 'Save changes'; }));

  api.onDownloadsChanged((downloads) => {
    if (!appState) return;
    appState.downloads = downloads;
    renderDownloads(downloads);
  });
  api.onProfilesChanged(async () => {
    await refreshState();
    toast("Profile created");
  });
  api.onNewTab((url) => openInBrowser(url));
  api.onInstanceProgress((value) => { if (value.message) toast(value.message); });
  api.onMelonLoaderDownloaded(async (value) => {
    toast(`${value.name} downloaded. You can now run its installer.`);
    await refreshState();
  });
  api.onAppUpdateStatus((value) => {
    const status = $('#appUpdateStatus');
    if (status) status.textContent = value.message || ({ checking: 'Checking the official release…', current: `BananaForge ${value.currentVersion} is up to date.`, disabled: 'Automatic BananaForge updates are off.', unsupported: 'Automatic installer updates are available in the Windows app.' }[value.status] || '');
    const updateButton = $('#checkAppUpdate');
    if (updateButton) {
      updateButton.disabled = ['checking', 'downloading', 'installing'].includes(value.status);
      updateButton.classList.toggle('is-checking', value.status === 'checking');
      updateButton.innerHTML = value.status === 'checking' ? '<span aria-hidden="true">↻</span> Checking GitHub…' : '<span aria-hidden="true">✦</span> Check for updates';
    }
    if (value.status === 'available') {
      toastAction(value.message || `BananaForge ${value.version} is ready.`, 'Install update', async () => {
        const button = $('#checkAppUpdate');
        if (button) { button.disabled = true; button.classList.add('is-checking'); }
        try { await api.installAppUpdate(); }
        finally { if (button) { button.disabled = false; button.classList.remove('is-checking'); } }
      });
    } else if (value.status === 'downloading' || value.status === 'installing') updateToast(value.message || `BananaForge ${value.version} update is ready.`);
    else if (value.status === 'failed') updateToast(value.message || 'BananaForge could not check for updates.', true);
  });
  api.onGameAutoUpdateStatus((value) => {
    const status = $('#gameUpdateStatus');
    if (value.status === 'checking') {
      if (status) status.textContent = value.message || 'Checking Steam updates…';
    } else if (value.status === 'current' || value.status === 'busy') {
      if (status) status.textContent = value.message || (value.status === 'busy' ? 'Sync waits until BTD6 closes.' : 'Managed copy is current with Steam.');
    } else if (value.status === 'updated') {
      const message = value.copied
        ? `BTD6 copy updated from Steam${value.buildId ? ` build ${value.buildId}` : ''} · ${value.copied} file${value.copied === 1 ? '' : 's'}.`
        : `Steam BTD6 build ${value.buildId} checked; the managed copy is already current.`;
      if (status) status.textContent = message;
      updateToast(message);
    } else if (value.status === 'failed') {
      if (status) status.textContent = value.message;
      updateToast(value.message, true);
    }
  });

  window.addEventListener('focus', () => { if (!$('#bootScreen')) safe(() => refreshState()); });
  await finishInitialWorkspaceLoad();
});

async function finishInitialWorkspaceLoad() {
  const loaded = await loadInitialWorkspace();
  if (!loaded) return;
  void api.getMelonLoaderRecommendation().then((recommendation) => {
    if (!appState) return;
    appState.melonLoaderRecommendation = recommendation;
    appState.recommendedMelonLoaderVersion = `${recommendation.recommendedVersion} stable`;
    renderLoaderAdvice();
    const help = $("#melonStatusHelp");
    if (help) help.textContent = recommendation.status;
  }).catch((error) => api.reportRendererError(`MelonLoader recommendation lookup failed: ${friendlyError(error)}`));
}
