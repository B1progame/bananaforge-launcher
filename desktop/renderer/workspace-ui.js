let wsBooted = false;
let wsSetupInitialized = false;
let wsDetail = null;
let wsProfileTab = 'content';
let wsLogPaused = false;
let wsLogBusy = false;
let wsLogText = '';
let wsLogSignature = '';
let wsTrackingMod = null;
let wsLogSources = '';
let wsLastUpdateSummary = null;
const wsLabels = { 'managed-copy': 'Managed game copy', melonloader: 'MelonLoader installer', modhelper: 'BTD Mod Helper' };
const wsKnownModRepositories = {
  'ascendedupgrades.dll': 'doombubbles/AscendedUpgrades',
  'autonudge.dll': 'doombubbles/AutoNudge',
  'btd6modhelper.dll': 'gurrenm3/BTD-Mod-Helper',
  'copypastetowers.dll': 'doombubbles/CopyPasteTowers',
  'fasterforward.dll': 'doombubbles/FasterForward',
  'quickgame.dll': 'Void-n-Null/QuickGame',
  'ultimatecrosspathing.dll': 'doombubbles/UltimateCrosspathing'
};
const wsIcons = {
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3Z"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m8 5 11 7-11 7Z"/></svg>'
};

async function wsBusy(button, action) {
  if (button.disabled) return null;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  try { return await safe(action); }
  finally {
    button.disabled = button.id === 'profileDetailActivate' && wsDetail?.profile.id === appState.activeProfileId;
    button.removeAttribute('aria-busy'); updateLaunchControls();
  }
}

function updateWorkspaceState() {
  if (!appState) return;
  $('#setupOriginalPath').value = appState.configuredGamePath || appState.detectedGame || '';
  $('#setupStoragePath').textContent = `Workspace data: ${appState.userDataPath}`;
  if (!wsSetupInitialized) {
    $('#setupManagedPath').value = appState.configuredInstancePath || appState.defaultManagedPath;
    $('#setupDownloadPath').value = appState.downloadRoot;
    for (const [key, id] of [['managed', 'pkgManaged'], ['melonloader', 'pkgMelon'], ['modhelper', 'pkgHelper']]) {
      if (appState.installOptions[key] !== undefined) $(`#${id}`).checked = appState.installOptions[key] === '1';
    }
    wsSetupInitialized = true;
  }
  const selected = $('#setupProfile').value || appState.activeProfileId;
  $('#setupProfile').innerHTML = appState.profiles.map((profile) => `<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.name)}${profile.id === appState.activeProfileId ? ' · Active' : ''}</option>`).join('');
  $('#setupProfile').value = appState.profiles.some((profile) => profile.id === selected) ? selected : appState.activeProfileId;
  $('#setupOpenMelon').hidden = !appState.settings.melonLoaderPath;
  wsUpdatePackageCount();
  const canCheckMods = Boolean(appState.profiles.find((profile) => profile.id === appState.activeProfileId)?.modCount) && !appState.autoUpdateJob;
  $('#checkModUpdates').disabled = !canCheckMods;
  $('#checkModUpdatesMods').disabled = !canCheckMods;
  const previousResult = wsLastUpdateSummary?.profileId === appState.activeProfileId ? wsLastUpdateSummary.text : '';
  const updateMessage = appState.autoUpdateJob ? 'Checking tracked mods for the active profile…' : previousResult || (appState.settings.autoUpdateMods ? 'Automatic checks are enabled.' : 'Automatic updates are off.');
  $('#autoUpdateStatus').textContent = updateMessage;
  $('#modsUpdateStatus').textContent = updateMessage;
  if (appState.setupJob) wsRenderSetup(appState.setupJob);
  if (!wsBooted) {
    wsBooted = true;
    showPage(appState.settings.firstRunComplete && !appState.setupRequested ? 'profiles' : 'setup');
  }
}

function wsShowModUpdate(job) {
  if (!job) return;
  if (appState) appState.autoUpdateJob = job.status === 'checking' ? { profileId: job.profileId, status: job.status } : null;
  const updateMessage = job.status === 'checking'
    ? job.total === 0 ? 'No mods are installed in this profile yet.' : (() => {
      const current = job.mods?.find((mod) => ['checking', 'discovering'].includes(mod.status));
      const completed = job.mods?.filter((mod) => !['checking', 'discovering'].includes(mod.status)).length || 0;
      if (!current) return `Checking ${job.total} mod${job.total === 1 ? '' : 's'}…`;
      const transfer = current.total ? ` · ${formatBytes(current.received || 0)} / ${formatBytes(current.total)}` : '';
      return `${current.status === 'discovering' ? 'Finding source for' : `Checking ${completed + 1}/${job.total} ·`} ${current.name}${transfer}`;
    })()
    : job.status === 'recent' ? `Last checked ${job.checkedAt ? new Date(job.checkedAt).toLocaleString() : 'recently'}.`
      : job.status === 'disabled' ? 'Automatic updates are off.'
        : `${job.updated || 0} updated · ${job.checked || 0} current · ${job.skipped || 0} skipped · ${job.failed || 0} need attention.${job.syncPending ? ' Updated files will sync after you close the game.' : ''}`;
  if (job.status !== 'checking') wsLastUpdateSummary = { profileId: job.profileId, text: updateMessage };
  $('#autoUpdateStatus').textContent = updateMessage;
  $('#modsUpdateStatus').textContent = updateMessage;
  const hasMods = Boolean(appState?.profiles.find((profile) => profile.id === appState.activeProfileId)?.modCount);
  for (const button of [$('#checkModUpdates'), $('#checkModUpdatesMods')]) {
    if (button) { button.disabled = job.status === 'checking' || !hasMods; button.textContent = job.status === 'checking' ? 'Checking…' : button.id === 'checkModUpdates' ? 'Check active profile now' : 'Check for updates'; }
  }
  updateLaunchControls();
  if (job.profileId === wsDetail?.profile.id && job.status !== 'checking') { refreshState().then(() => showProfileDetails(job.profileId)); }
}

const wsOriginalShowPage = showPage;
showPage = function (page) {
  if (page !== 'browser') activeWebview()?.blur();
  wsOriginalShowPage(page);
  if (page === 'logs') wsPollLogs(true);
  if (page === 'profile-detail') {
    const nav = $('.nav-item[data-page="profiles"]');
    nav.classList.add('active'); nav.setAttribute('aria-current', 'page');
  }
};

renderProfiles = function () {
  if (!appState) return;
  const query = $('#profileSearch').value.trim().toLowerCase();
  const sort = $('#profileSort').value;
  const profiles = appState.profiles.filter((profile) => `${profile.name} ${profile.description || ''}`.toLowerCase().includes(query));
  profiles.sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'mods' ? b.modCount - a.modCount : new Date(b.createdAt) - new Date(a.createdAt));
  $('#profileTotal').textContent = appState.profiles.length;
  $('#profileLibraryMeta').textContent = `${profiles.length} collection${profiles.length === 1 ? '' : 's'}`;
  const root = $('#profileGrid');
  root.innerHTML = '';
  if (!profiles.length) {
    root.innerHTML = '<div class="library-empty"><h2>No matching profiles</h2><p>Try a different search or create a new collection.</p></div>';
    return;
  }
  for (const profile of profiles) {
    const active = profile.id === appState.activeProfileId;
    const card = document.createElement('article');
    card.className = `collection-card accent-${profile.accent || 'amber'}${active ? ' is-active' : ''}`;
    const initials = profile.name.split(/\s+/).slice(0, 2).map((word) => word[0] || '').join('').toUpperCase();
    card.innerHTML = `<div class="collection-cover"><span class="collection-monogram">${escapeHtml(initials)}</span><span class="collection-state">${active ? 'ACTIVE PROFILE' : 'BTD6 COLLECTION'}</span></div><div class="collection-body"><button class="collection-title" type="button">${escapeHtml(profile.name)}</button><p>${escapeHtml(profile.description || 'Your next run starts here. Add mods and build your collection.')}</p><div class="collection-meta"><span>${profile.modCount || 0} mods</span><span>${profile.enabledCount || 0} enabled</span></div><div class="collection-actions"><button class="secondary open-profile">${wsIcons.folder} Open</button><button class="primary play-profile">${wsIcons.play} Play</button><button class="secondary close-game" type="button" hidden title="Ask BTD6 to close normally so you can continue managing this profile.">Close BTD6</button></div></div>`;
    card.querySelector('.collection-title').onclick = () => showProfileDetails(profile.id);
    card.querySelector('.open-profile').onclick = () => showProfileDetails(profile.id);
    const play = card.querySelector('.play-profile');
    play.onclick = () => wsBusy(play, () => wsPlayProfile(profile.id));
    const closeGame = card.querySelector('.close-game');
    closeGame.onclick = () => wsBusy(closeGame, async () => {
      const result = await api.closeGame();
      if (result.closed) toast(result.alreadyClosed ? 'BTD6 is already closed.' : 'BTD6 closed. You can manage or launch your profile now.');
      else toast(result.message);
      await refreshState();
    });
    root.appendChild(card);
  }
  updateLaunchControls();
};

async function wsPlayProfile(id) {
  if (appState.activeProfileId !== id) await api.activateProfile(id);
  await refreshState();
  const active = appState.profiles.find((profile) => profile.id === id);
  if (active?.enabledCount && (!appState.configuredInstancePath || !appState.runtimeInstalled)) {
    showPage('setup'); toast('Finish installing MelonLoader into your managed game to play with mods.'); return;
  }
  const result = await api.launchGame();
  if (result?.blockedByMod) return;
  toast(result.generatedAssemblies ? 'First-run game files are ready. BTD6 is continuing startup.' : 'Game started. Open Game logs to follow startup.');
}

showProfileDetails = async function (id) {
  const detail = await safe(() => api.profileDetails(id));
  if (!detail) return;
  wsDetail = detail;
  openProfileDetail = detail;
  const profile = detail.profile;
  $('#profileDetailName').textContent = profile.name;
  $('#profileDetailMeta').textContent = profile.description || `${detail.manifest.mods.length} mods in this collection. Enable only what you want for your next run.`;
  $('#profileDetailBadge').textContent = profile.id === appState.activeProfileId ? 'ACTIVE PROFILE' : 'BTD6 COLLECTION';
  $('#profileEditName').value = profile.name;
  $('#profileEditDescription').value = profile.description || '';
  $('#profileEditAccent').value = profile.accent || 'amber';
  $('#profileManifestPath').textContent = detail.manifestPath;
  $('#deleteProfile').disabled = profile.id === 'default' || profile.id === appState.activeProfileId;
  $('#deleteProfile').title = profile.id === appState.activeProfileId ? 'Activate a different profile before deleting this one.' : '';
  $('#profileDetailPlay').textContent = profile.id === appState.activeProfileId ? 'Play profile' : 'Activate & play';
  $('#profileDetailActivate').disabled = profile.id === appState.activeProfileId;
  $('#profileDetailActivate').textContent = profile.id === appState.activeProfileId ? 'Active profile' : 'Use profile';
  updateLaunchControls();
  wsRenderProfileMods();
  wsSetProfileTab(wsProfileTab);
  if (!$('#page-profile-detail').classList.contains('active')) showPage('profile-detail');
};

function wsRenderProfileMods() {
  if (!wsDetail) return;
  const query = $('#profileModSearch').value.trim().toLowerCase();
  const mods = wsDetail.manifest.mods.filter((mod) => `${mod.displayName} ${mod.file}`.toLowerCase().includes(query));
  const root = $('#profileDetailMods');
  root.innerHTML = '';
  root.className = 'profile-content-list';
  if (!mods.length) {
    root.innerHTML = `<div class="library-empty"><h2>${query ? 'No matching mods' : 'A fresh start'}</h2><p>${query ? 'Try another search.' : 'Browse mods or add a downloaded DLL to this profile.'}</p></div>`;
    return;
  }
  for (const mod of mods) {
    const row = document.createElement('article');
    row.className = `content-row${mod.enabled ? '' : ' mod-disabled'}`;
    const updateNote = mod.updateStatus === 'current' ? `Up to date · ${escapeHtml(mod.updateVersion)}` : mod.updateStatus === 'updated' ? `Updated to ${escapeHtml(mod.updateVersion)}` : mod.updateStatus === 'failed' ? `Update failed · current file kept${mod.updateError ? ` · ${escapeHtml(mod.updateError)}` : ''}` : mod.updateStatus === 'manual' ? 'Added manually · no release source' : appState.settings.autoUpdateMods ? 'Release tracked · checked on launch' : 'Release tracked · automatic updates off';
    row.innerHTML = `<div class="content-file-icon">${wsIcons.folder}</div><div class="content-name"><strong>${escapeHtml(mod.displayName)}</strong><small>${escapeHtml(mod.file)} · ${formatBytes(mod.size)}</small><small class="mod-update-note${mod.updateStatus === 'failed' ? ' is-error' : ''}" aria-live="polite" title="${mod.updateStatus === 'failed' ? escapeHtml(mod.updateError || 'The current mod file was kept.') : ''}">${updateNote}</small><small class="runtime-evidence${['error', 'error-stale'].includes(mod.runtimeStatus) ? ' is-error' : ''}" title="${escapeHtml(mod.runtimeNote || 'Not checked in the most recent launch.')}">${escapeHtml(mod.runtimeNote || 'Not checked in the most recent launch.')}</small></div><span class="mod-status">${mod.enabled ? 'Enabled' : 'Disabled'}</span><label class="mod-switch"><input type="checkbox" ${mod.enabled ? 'checked' : ''} aria-label="Enable ${escapeHtml(mod.displayName)}"><span aria-hidden="true"></span></label><div class="mod-row-actions"><button class="secondary track-mod-source">${mod.updateStatus === 'manual' ? 'Track updates' : 'Change source'}</button><button class="text-button remove-mod">Remove</button></div>`;
    const checkbox = row.querySelector('input');
    checkbox.onchange = async () => {
      checkbox.disabled = true;
      const result = await safe(() => api.toggleMod(wsDetail.profile.id, mod.file, checkbox.checked));
      if (!result) checkbox.checked = mod.enabled;
      await refreshState(); await showProfileDetails(wsDetail.profile.id);
    };
    const remove = row.querySelector('.remove-mod');
    remove.onclick = () => wsBusy(remove, async () => {
      await api.removeMod(mod.file, wsDetail.profile.id);
      await refreshState(); await showProfileDetails(wsDetail.profile.id);
    });
    const track = row.querySelector('.track-mod-source');
    const knownRepository = wsKnownModRepositories[mod.file.toLowerCase()];
    track.textContent = mod.updateStatus === 'manual' ? knownRepository ? 'Track official source' : 'Find update source' : 'Change source';
    if (knownRepository && mod.updateStatus === 'manual') track.title = `Use ${knownRepository}`;
    track.disabled = Boolean(appState.autoUpdateJob);
    track.onclick = () => {
      if (knownRepository && mod.updateStatus === 'manual') return wsBusy(track, async () => {
        const result = await api.trackKnownModUpdates(wsDetail.profile.id, mod.file);
        const profileId = wsDetail.profile.id;
        await refreshState(); await showProfileDetails(profileId);
        toast(`${result.file} is tracking ${result.repository} (${result.version}).`);
      });
      wsTrackingMod = mod.file;
      $('#modSourceDescription').textContent = `Search BTD Mod Helper’s project catalog and GitHub releases for ${mod.file}. Release assets and DLLs committed to a project branch are checked before tracking.`;
      $('#modSourceSearchName').value = mod.file.replace(/\.dll$/i, '');
      $('#modSourceUrl').value = '';
      $('#sourceSearchStatus').textContent = '';
      $('#sourceSearchResults').replaceChildren();
      $('#searchModSources').disabled = false;
      $('#modSourceDialog').showModal();
      $('#searchModSources').focus();
    };
    root.appendChild(row);
  }
}

function wsSetProfileTab(tab) {
  wsProfileTab = tab;
  $('#profileContentPanel').hidden = tab !== 'content';
  $('#profileSettingsPanel').hidden = tab !== 'settings';
  $$('[data-profile-tab]').forEach((button) => {
    const selected = button.dataset.profileTab === tab;
    button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected));
  });
}

async function wsPollLogs(force = false) {
  if (wsLogBusy || (wsLogPaused && !force)) return;
  wsLogBusy = true;
  try {
    const files = await api.listLogs();
    const signature = files.map((file) => file.id).join(',');
    const source = $('#logSource');
    if (signature !== wsLogSources || !source.value) {
      const previous = source.value;
      source.innerHTML = files.map((file) => `<option value="${file.id}">${escapeHtml(file.label)}</option>`).join('') || '<option value="">No log files yet</option>';
      source.value = files.some((file) => file.id === previous) ? previous : (files.find((file) => file.label.includes('Latest.log')) || files[0])?.id || '';
      wsLogSources = signature;
    }
    const available = Boolean(source.value);
    for (const id of ['copyLogs', 'exportLogs', 'openLogs']) $(`#${id}`).disabled = !available;
    if (!available) { wsLogText = ''; wsRenderLogs(); $('#logStatus').textContent = 'Launch the game to generate a log.'; return; }
    const result = await api.readLog(source.value);
    const next = `${source.value}:${result.signature}`;
    if (force || next !== wsLogSignature) {
      wsLogSignature = next; wsLogText = result.content; wsRenderLogs();
    }
    $('#logFilePath').textContent = result.file;
    $('#logStatus').textContent = `${result.truncated ? 'Showing the last 1,500 lines / 512 KB · ' : ''}Updated ${new Date(result.updatedAt).toLocaleTimeString()}`;
  } catch (error) { $('#logStatus').textContent = friendlyError(error); }
  finally { wsLogBusy = false; }
}

function wsRenderLogs() {
  const query = $('#logSearch').value.toLowerCase();
  const level = $('#logLevel').value;
  const classify = (line) => /error|exception|fatal/i.test(line) ? 'error' : /warn/i.test(line) ? 'warn' : 'info';
  const lines = wsLogText.split('\n').filter((line) => line && (!query || line.toLowerCase().includes(query)) && (level === 'all' || (level === 'error' ? classify(line) === 'error' : classify(line) !== 'info')));
  const root = $('#logConsole');
  root.innerHTML = lines.length ? lines.map((line) => `<div class="log-line level-${classify(line)}">${escapeHtml(line)}</div>`).join('') : '<div class="console-empty">No messages match this view.</div>';
  $('#logLineCount').textContent = `${lines.length} lines`;
  if ($('#logFollow').checked) root.scrollTop = root.scrollHeight;
}

function wsUpdatePackageCount() {
  const count = $$('.package-option input:checked').length;
  $('#setupPackageCount').textContent = `${count} package${count === 1 ? '' : 's'} selected`;
  if (!appState?.setupJob || appState.setupJob.status !== 'running') $('#setupStart').disabled = count === 0;
  $('#setupProfile').disabled = !$('#pkgHelper').checked;
}

function wsRenderSetup(job) {
  if (!job) return;
  if (appState) appState.setupJob = job;
  updateLaunchControls();
  const running = job.status === 'running';
  $('#setupStart').disabled = running || !$$('.package-option input:checked').length;
  $('#setupStart').textContent = running ? 'Installing…' : ['failed', 'cancelled'].includes(job.status) ? 'Retry selected packages' : 'Install selected packages';
  $('#setupCancel').hidden = !running;
  $$('.setup-main input, .setup-main button, .setup-main select').forEach((node) => { node.disabled = running; });
  $('#setupFeedback').textContent = job.status === 'completed' ? 'Selected packages are ready. Finish MelonLoader installation if you downloaded it.' : job.status === 'failed' ? 'Setup stopped. See the failed step below and retry when ready.' : job.status === 'cancelled' ? 'Cancelled. Completed packages were kept.' : 'Working on your selected packages…';
  $('#setupJobs').innerHTML = job.steps.map((step) => {
    const percent = step.status === 'completed' ? 100 : step.total ? Math.min(100, Math.round(step.received * 100 / step.total)) : 0;
    return `<div class="setup-job job-${step.status}"><div><strong>${escapeHtml(wsLabels[step.id])}</strong><span>${step.status === 'running' ? step.total ? `${percent}%` : 'Preparing…' : escapeHtml(step.status)}</span></div><progress max="100" value="${percent}" aria-label="${escapeHtml(wsLabels[step.id])} progress"></progress><small>${escapeHtml(step.note || step.file || (step.total ? `${formatBytes(step.received)} / ${formatBytes(step.total)}` : ''))}</small></div>`;
  }).join('');
  if (!running) $('#setupProfile').disabled = !$('#pkgHelper').checked;
}

document.addEventListener('DOMContentLoaded', () => {
  $('#profileSearch').oninput = renderProfiles;
  $('#profileSort').onchange = renderProfiles;
  $('#profileModSearch').oninput = wsRenderProfileMods;
  $$('[data-profile-tab]').forEach((button) => { button.onclick = () => wsSetProfileTab(button.dataset.profileTab); });
  $('#importProfile').onclick = () => wsBusy($('#importProfile'), async () => { const profile = await api.importProfile(); if (profile) { await refreshState(); await showProfileDetails(profile.id); toast('Profile package imported.'); } });
  $('#duplicateProfile').onclick = () => wsBusy($('#duplicateProfile'), async () => { const profile = await api.duplicateProfile(wsDetail.profile.id); await refreshState(); await showProfileDetails(profile.id); toast('Profile duplicated.'); });
  $('#exportProfile').onclick = () => wsBusy($('#exportProfile'), async () => { if (await api.exportProfile(wsDetail.profile.id)) toast('Profile package saved.'); });
  $('#profileDetailFolder').onclick = () => safe(() => api.openProfileFolder(wsDetail.profile.id));
  $('#profileDetailPlay').onclick = () => wsBusy($('#profileDetailPlay'), () => wsPlayProfile(wsDetail.profile.id));
  $('#profileDetailActivate').onclick = () => wsBusy($('#profileDetailActivate'), async () => { await api.activateProfile(wsDetail.profile.id); await refreshState(); await showProfileDetails(wsDetail.profile.id); toast('Active profile changed.'); });
  $('#profileDetailLogs').onclick = () => showPage('logs');
  $('#profileAddMod').onclick = () => wsBusy($('#profileAddMod'), async () => { await api.installMods(wsDetail.profile.id); await refreshState(); await showProfileDetails(wsDetail.profile.id); });
  $('#profileEditForm').onsubmit = async (event) => {
    event.preventDefault();
    await wsBusy(event.submitter, async () => { await api.updateProfile(wsDetail.profile.id, { name: $('#profileEditName').value, description: $('#profileEditDescription').value, accent: $('#profileEditAccent').value }); await refreshState(); await showProfileDetails(wsDetail.profile.id); toast('Profile saved.'); });
  };
  $('#deleteProfile').onclick = () => wsBusy($('#deleteProfile'), async () => { const result = await api.deleteProfile(wsDetail.profile.id); if (result) { wsDetail = null; await refreshState(); showPage('profiles'); toast('Profile deleted.'); } });
  $('#checkModUpdates').onclick = () => safe(() => api.checkModUpdates(appState.activeProfileId));
  $('#checkModUpdatesMods').onclick = () => wsBusy($('#checkModUpdatesMods'), () => api.checkModUpdates(appState.activeProfileId));
  $('#cancelModSource').onclick = () => $('#modSourceDialog').close();
  $('#searchModSources').onclick = async () => {
    if (!wsTrackingMod || !wsDetail) return;
    const button = $('#searchModSources'), status = $('#sourceSearchStatus'), results = $('#sourceSearchResults');
    button.disabled = true; results.replaceChildren(); status.textContent = `Searching GitHub mod projects for ${wsTrackingMod}…`;
    try {
      const response = await api.searchModUpdateSources(wsDetail.profile.id, wsTrackingMod, $('#modSourceSearchName').value.trim());
      if (response.results.length) {
        status.textContent = `Found ${response.results.length} verified release${response.results.length === 1 ? '' : 's'}. Choose the project you recognize.`;
        for (const candidate of response.results) {
          const card = document.createElement('article'); card.className = 'source-result';
          const details = document.createElement('div'); details.className = 'source-result-copy';
          const title = document.createElement('strong'); title.textContent = candidate.title;
          const sourceFile = candidate.sourceType === 'github-branch-file' ? `branch file ${candidate.sourcePath || candidate.asset}` : `release file ${candidate.asset}`;
          const meta = document.createElement('small'); meta.textContent = `${candidate.source} · ${candidate.repository} · ${candidate.version} · ${sourceFile}`;
          const description = document.createElement('p'); description.textContent = candidate.description || 'No project description provided.';
          details.append(title, meta, description);
          const choose = document.createElement('button'); choose.type = 'button'; choose.className = 'primary'; choose.textContent = 'Track release';
          choose.onclick = async () => {
            choose.disabled = true; status.textContent = `Verifying ${candidate.repository} again…`;
            const result = await safe(() => api.trackDiscoveredModUpdates(wsDetail.profile.id, wsTrackingMod, candidate.repository, candidate.asset, candidate.sourceType, candidate.branch, candidate.sourcePath));
            if (!result) { choose.disabled = false; return; }
            const profileId = wsDetail.profile.id; $('#modSourceDialog').close(); wsTrackingMod = null;
            await refreshState(); await showProfileDetails(profileId);
            toast(`${result.file} is tracking ${result.repository} (${result.version}).`);
          };
          card.append(details, choose); results.append(card);
        }
        if (typeof gsap !== 'undefined' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          gsap.fromTo(results.querySelectorAll('.source-result'), { y: 5, autoAlpha: 0 }, {
            y: 0, autoAlpha: 1, duration: 0.2, stagger: 0.035, ease: 'power2.out', clearProps: 'transform,opacity,visibility'
          });
        }
      } else status.textContent = response.note || `No verified release was found for ${wsTrackingMod}.`;
    } catch (error) { status.textContent = String(error.message || error); }
    finally { button.disabled = false; }
  };
  $('#modSourceForm').onsubmit = async (event) => {
    event.preventDefault();
    if (!wsTrackingMod || !wsDetail) return;
    const url = $('#modSourceUrl').value.trim();
    if (!url) { $('#sourceSearchStatus').textContent = 'Enter a GitHub project URL to verify it.'; $('#modSourceUrl').focus(); return; }
    const result = await safe(() => api.trackModUpdates(wsDetail.profile.id, wsTrackingMod, url));
    if (!result) return;
    const profileId = wsDetail.profile.id;
    $('#modSourceDialog').close();
    wsTrackingMod = null;
    await refreshState(); await showProfileDetails(profileId);
    toast(`${result.file} is tracking ${result.repository} (${result.version}).`);
  };
  $('#logSource').onchange = () => wsPollLogs(true);
  $('#refreshLogs').onclick = () => wsPollLogs(true);
  $('#logSearch').oninput = wsRenderLogs;
  $('#logLevel').onchange = wsRenderLogs;
  $('#pauseLogs').onclick = () => { wsLogPaused = !wsLogPaused; $('#pauseLogs').textContent = wsLogPaused ? 'Resume' : 'Pause'; $('#logLiveBadge').textContent = wsLogPaused ? 'Paused' : 'Live · 2s'; $('#logLiveBadge').classList.toggle('paused', wsLogPaused); if (!wsLogPaused) wsPollLogs(true); };
  $('#copyLogs').onclick = () => safe(() => api.copyLog($('#logSource').value), 'Log tail copied.');
  $('#exportLogs').onclick = () => safe(() => api.exportLog($('#logSource').value));
  $('#openLogs').onclick = () => safe(() => api.showLog($('#logSource').value));
  setInterval(() => { if ($('#page-logs').classList.contains('active')) wsPollLogs(); }, 2000);
  $('#setupChooseGame').onclick = () => safe(async () => { const file = await api.chooseGame(); if (file) { await api.saveSettings({ gamePath: file }); await refreshState(); } });
  const browse = (button, input, title) => { $(button).onclick = () => safe(async () => { const folder = await api.chooseFolder(title); if (folder) { $(input).value = folder; if (input === '#downloadPath') settingsDirty = true; } }); };
  browse('#setupBrowseManaged', '#setupManagedPath', 'Choose managed game location');
  browse('#setupBrowseDownloads', '#setupDownloadPath', 'Choose package download location');
  browse('#chooseDownloadPath', '#downloadPath', 'Choose download folder');
  $$('.package-option input').forEach((input) => { input.onchange = wsUpdatePackageCount; });
  $('#setupStart').onclick = async () => {
    $('#setupFeedback').textContent = '';
    const job = await safe(() => api.startSetup({ packages: $$('.package-option input:checked').map((input) => input.value), managedPath: $('#setupManagedPath').value.trim(), downloadPath: $('#setupDownloadPath').value.trim(), profileId: $('#setupProfile').value }));
    if (!job && !appState.setupJob) $('#setupFeedback').textContent = 'Setup could not start. Check your choices and the error message.';
    await refreshState();
  };
  $('#setupCancel').onclick = () => safe(() => api.cancelSetup());
  $('#setupOpenMelon').onclick = () => safe(() => api.launchMelonLoader());
  $('#setupSkip').onclick = async () => { const settings = await safe(() => api.saveSettings({ firstRunComplete: true })); if (settings) { await refreshState(); showPage('profiles'); } };
  api.onSetupProgress(wsRenderSetup);
  api.onModUpdate(wsShowModUpdate);
  api.onGameChanged((value) => { if (appState) { appState.gameRunning = value.running; appState.gameExternalRunning = Boolean(value.external); appState.gameLaunching = Boolean(value.launching); appState.gameLaunchPhase = value.launchPhase || ''; updateLaunchControls(); } if ($('#page-logs').classList.contains('active')) wsPollLogs(true); });
  api.onModWarning((value) => {
    toastAction(value.message || `${value.file} caused a game compatibility error.`, value.liveGame ? 'Close & disable' : 'Disable mod', async () => {
      if (value.liveGame) {
        const result = await api.closeGame();
        if (!result?.closed) throw new Error('BTD6 is still running. Save and close the game, then disable the mod from its profile.');
      }
      await api.disableIncompatibleMod(value.profileId, value.file);
      await refreshState();
      if ($('#page-profile-detail').classList.contains('active') && wsDetail?.profile.id === value.profileId) await showProfileDetails(value.profileId);
      else if ($('#page-mods').classList.contains('active')) await refreshMods();
      toast(`${value.file} is disabled in this profile. Its original profile file is preserved; click Play to launch again.`);
    });
  });
  api.onGameCrash((value) => {
    toastAction(value.message || 'BTD6 exited unexpectedly. Check Game logs for details.', 'View Game logs', async () => {
      showPage('logs');
      await wsPollLogs(true);
      toast('Opened Game logs. The Windows crash report is available in the log list.');
    });
    if (value.autoDisabledMod) void (async () => {
      await refreshState();
      if ($('#page-profile-detail').classList.contains('active')) await showProfileDetails(appState.activeProfileId);
      else if ($('#page-mods').classList.contains('active')) await refreshMods();
    })().catch((error) => toast(error.message || String(error), true));
  });
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n' && $('#page-profiles').classList.contains('active')) { event.preventDefault(); safe(() => api.openProfileDialog()); }
  });
});
