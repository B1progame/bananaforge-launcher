const { _electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

(async () => {
  const project = path.resolve(__dirname, '..');
  const root = path.join(project, '.qa-runs', crypto.randomUUID());
  const storage = path.join(root, 'workspace');
  const source = path.join(root, 'original');
  const managed = path.join(root, 'managed');
  const bundleFile = path.join(root, 'collection.bfpack');
  const dll = path.join(root, 'Example.dll');
  fs.mkdirSync(path.join(source, 'BloonsTD6_Data'), { recursive: true });
  fs.writeFileSync(path.join(source, 'BloonsTD6.exe'), 'MZtest game');
  fs.writeFileSync(path.join(source, 'BloonsTD6_Data', 'asset'), 'original game data');
  fs.mkdirSync(path.join(managed, 'MelonLoader'), { recursive: true });
  fs.writeFileSync(path.join(managed, 'BloonsTD6.exe'), 'MZtest game');
  fs.writeFileSync(dll, 'MZtest mod binary');
  const gameLog = path.join(managed, 'MelonLoader', 'Latest.log');
  fs.writeFileSync(gameLog, '[INFO] Game booting\n[WARN] Example warning\n[ERROR] Example exception\n');
  fs.mkdirSync(storage, { recursive: true });
  fs.writeFileSync(path.join(storage, 'state.json'), JSON.stringify({ settings: { gamePath: path.join(source, 'BloonsTD6.exe'), instancePath: path.join(managed, 'BloonsTD6.exe'), firstRunComplete: true }, profiles: [{ id: 'default', name: 'Default', createdAt: new Date().toISOString() }], activeProfileId: 'default', downloads: [], managedFiles: [] }));
  const env = { ...process.env, BANANAFORGE_STORAGE_ROOT: storage, BANANAFORGE_TEST_MODE: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const executablePath = process.env.BANANAFORGE_QA_EXECUTABLE || require('electron');
  const electron = await _electron.launch({ executablePath, args: process.env.BANANAFORGE_QA_EXECUTABLE ? ['--disable-gpu'] : [project, '--disable-gpu'], env });
  let page;
  const errors = [];
  try {
    page = await electron.firstWindow();
    const visibleWindow = await electron.browserWindow(page);
    await visibleWindow.evaluate((window) => window.show());
    page.setDefaultTimeout(15000);
    page.on('pageerror', (error) => errors.push(error.message));
    await page.locator('#page-profiles.active').waitFor();
    await page.locator('.collection-card').first().waitFor();
    const state = await page.evaluate(() => window.bananaforge.getState());
    assert.equal(state.configuredInstancePath, managed, 'Legacy executable paths must normalize to their directory.');

    await page.click('#newProfile');
    let dialog;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      dialog = electron.windows().find((window) => window.url().endsWith('/profile-dialog.html'));
      if (dialog) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(dialog, 'The native profile dialog must open.');
    dialog.setDefaultTimeout(15000);
    await dialog.fill('#profileName', 'Sandbox collection');
    await dialog.fill('#profileDescription', 'A focused test collection');
    await dialog.selectOption('#profileAccent', 'mint');
    await dialog.click('#create');
    await page.locator('.collection-title', { hasText: 'Sandbox collection' }).waitFor();
    await page.locator('.collection-title', { hasText: 'Sandbox collection' }).click();
    await page.locator('#page-profile-detail.active').waitFor();

    await electron.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, dll);
    await page.click('#profileAddMod');
    await page.locator('.content-name strong', { hasText: 'Example' }).waitFor();
    await page.click('#profileDetailActivate');
    await page.waitForFunction(() => document.querySelector('#profileDetailBadge').textContent === 'ACTIVE PROFILE');
    assert.equal(fs.readFileSync(path.join(managed, 'Mods', 'Example.dll'), 'utf8'), 'MZtest mod binary');
    await page.locator('.mod-switch input').uncheck();
    await page.waitForFunction(() => document.querySelector('.mod-status').textContent === 'Disabled');
    assert.equal(fs.existsSync(path.join(managed, 'Mods', 'Example.dll')), false);
    await page.locator('.mod-switch input').check();
    await page.waitForFunction(() => document.querySelector('.mod-status').textContent === 'Enabled');

    assert.equal(await page.locator('#profileDetailActivate').isDisabled(), true);
    await assert.rejects(page.evaluate(() => window.bananaforge.launchGame()), /Install MelonLoader/);
    assert.equal((await page.evaluate(() => window.bananaforge.getState())).gameLaunching, false);
    await page.click('.nav-item[data-page="mods"]');
    await page.locator('#modsList input').uncheck();
    await page.waitForFunction(() => document.querySelector('#modsList .inline-check span').textContent === 'Disabled');
    assert.equal(fs.existsSync(path.join(managed, 'Mods', 'Example.dll')), false);
    await page.locator('#modsList input').check();
    await page.waitForFunction(() => document.querySelector('#modsList .inline-check span').textContent === 'Enabled');
    await page.click('.nav-item[data-page="settings"]');
    await page.fill('#launchArguments', '--qa-unsaved');
    await page.evaluate(() => refreshState());
    assert.equal(await page.inputValue('#launchArguments'), '--qa-unsaved');
    await page.click('#saveSettings');
    await page.waitForFunction(() => document.querySelector('#saveSettings').textContent === 'Save settings');
    await page.click('.nav-item[data-page="dashboard"]');
    await page.screenshot({ path: path.join(root, 'home.png') });
    await page.click('#homeOpenProfile');

    await page.click('[data-profile-tab="settings"]');
    await page.fill('#profileEditName', 'Explorer');
    await page.fill('#profileEditDescription', 'My private mod collection');
    await page.selectOption('#profileEditAccent', 'blue');
    await page.click('#profileEditForm button[type=submit]');
    await page.waitForFunction(() => document.querySelector('#profileDetailName').textContent === 'Explorer');
    await electron.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); }, bundleFile);
    await page.click('#exportProfile');
    await page.waitForFunction(() => document.querySelector('#toast').textContent === 'Profile package saved.');
    assert.equal(JSON.parse(fs.readFileSync(bundleFile, 'utf8')).mods.length, 1);
    await page.click('#duplicateProfile');
    await page.waitForFunction(() => document.querySelector('#profileDetailName').textContent === 'Explorer copy');
    await page.click('#backToProfiles');
    await page.fill('#profileSearch', 'Explorer');
    assert.equal(await page.locator('.collection-card').count(), 2);
    await page.fill('#profileSearch', '');
    await electron.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, bundleFile);
    await page.click('#importProfile');
    await page.waitForFunction(() => document.querySelector('#profileDetailName').textContent === 'Explorer');
    assert.equal((await page.evaluate(() => window.bananaforge.getState())).profiles.length, 4);
    await page.click('[data-profile-tab="settings"]');
    await electron.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1 }); });
    await page.click('#deleteProfile');
    await page.locator('#page-profiles.active').waitFor();
    assert.equal((await page.evaluate(() => window.bananaforge.getState())).profiles.length, 3);
    await page.screenshot({ path: path.join(root, 'profiles.png') });

    await page.click('.nav-item[data-page="logs"]');
    await page.locator('.log-line', { hasText: 'Example exception' }).waitFor();
    await page.selectOption('#logLevel', 'error');
    assert.equal(await page.locator('.log-line').count(), 1);
    await page.selectOption('#logLevel', 'all');
    fs.appendFileSync(gameLog, '[INFO] New live message\n');
    await page.locator('.log-line', { hasText: 'New live message' }).waitFor({ timeout: 8000 });
    await page.click('#pauseLogs');
    assert.equal(await page.locator('#logLiveBadge').textContent(), 'Paused');
    await page.click('#pauseLogs');
    await page.screenshot({ path: path.join(root, 'logs.png') });

    await page.click('.nav-item[data-page="setup"]');
    await page.uncheck('#pkgMelon'); await page.uncheck('#pkgHelper');
    const destination = path.join(root, 'chosen-game');
    await page.fill('#setupManagedPath', destination);
    await page.fill('#setupDownloadPath', path.join(root, 'chosen-downloads'));
    await page.click('#setupStart');
    await page.locator('.job-completed').waitFor();
    assert.equal(fs.readFileSync(path.join(destination, 'BloonsTD6_Data', 'asset'), 'utf8'), 'original game data');
    assert.equal((await page.evaluate(() => window.bananaforge.getState())).configuredInstancePath, destination);

    // Exercise the real downloader and setup queue with deterministic official-source responses.
    await electron.evaluate((_, fixture) => {
      globalThis.__bfTestRelease = { version: 'v-test', payload: fixture.payload, hash: fixture.hash };
      globalThis.fetch = async (url) => {
        const text = String(url);
        const custom = text.includes('/repos/example/mod/');
        const helper = text.includes('BTD-Mod-Helper');
        const repo = custom ? 'example/mod' : helper ? 'gurrenm3/BTD-Mod-Helper' : 'LavaGang/MelonLoader.Installer';
        const name = custom ? 'Example.dll' : helper ? 'Btd6ModHelper.dll' : 'MelonLoader.Installer.exe';
        const data = globalThis.__bfTestRelease.payload;
        if (text.includes('api.github.com')) return new Response(JSON.stringify({ tag_name: globalThis.__bfTestRelease.version, assets: [{ name, size: data.length, digest: `sha256:${globalThis.__bfTestRelease.hash}`, browser_download_url: `https://github.com/${repo}/releases/download/${globalThis.__bfTestRelease.version}/${name}` }] }));
        const response = new Response(data); Object.defineProperty(response, 'url', { value: text }); return response;
      };
    }, { payload: 'MZverified setup fixture', hash: crypto.createHash('sha256').update('MZverified setup fixture').digest('hex') });
    await page.uncheck('#pkgManaged'); await page.check('#pkgMelon'); await page.check('#pkgHelper');
    await page.selectOption('#setupProfile', (await page.evaluate(() => window.bananaforge.getState())).activeProfileId);
    await page.click('#setupStart');
    await page.waitForFunction(() => document.querySelectorAll('.job-completed').length === 2);
    assert.ok(fs.existsSync(path.join(destination, 'Mods', 'Btd6ModHelper.dll')));
    await page.locator('#setupOpenMelon').waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(root, 'setup.png') });

    // Existing manually installed DLLs can be linked to their tagged GitHub release source.
    await page.click('.nav-item[data-page="profiles"]');
    await page.getByRole('button', { name: 'Explorer', exact: true }).click();
    await page.click('[data-profile-tab="content"]');
    await page.locator('.content-name strong', { hasText: 'Example' }).waitFor();
    await page.locator('.content-row').filter({ hasText: 'Example.dll' }).locator('.track-mod-source').click();
    await page.locator('.source-manual-entry summary').click();
    await page.fill('#modSourceUrl', 'https://github.com/example/mod');
    await page.click('#saveModSource');
    await page.waitForFunction(() => document.querySelector('.mod-update-note').textContent.includes('Release tracked'));

    // Enabling automatic updates checks the tracked GitHub release and installs a verified newer DLL.
    const updatedHelper = 'MZautomatically updated mod fixture';
    await electron.evaluate((_, fixture) => { globalThis.__bfTestRelease = { version: 'v-next', payload: fixture.payload, hash: fixture.hash }; }, {
      payload: updatedHelper,
      hash: crypto.createHash('sha256').update(updatedHelper).digest('hex')
    });
    await page.click('.nav-item[data-page="settings"]');
    await page.check('#autoUpdateMods');
    await page.click('#saveSettings');
    await page.waitForFunction(() => document.querySelector('#autoUpdateStatus').textContent.includes('2 updated'), undefined, { timeout: 20000 });
    assert.equal(fs.readFileSync(path.join(destination, 'Mods', 'Btd6ModHelper.dll'), 'utf8'), updatedHelper);
    assert.equal(fs.readFileSync(path.join(destination, 'Mods', 'Example.dll'), 'utf8'), updatedHelper);
    const updatedState = await page.evaluate(() => window.bananaforge.getState());
    assert.equal(updatedState.settings.autoUpdateMods, true);
    const updatedSources = updatedState.profiles.find((profile) => profile.id === updatedState.activeProfileId).updateSources;
    assert.equal(updatedSources['Btd6ModHelper.dll'].version, 'v-next');
    assert.equal(updatedSources['Example.dll'].version, 'v-next');

    const browserPaths = await electron.evaluate(({ session }) => {
      const paths = [];
      for (let index = 0; index < 2; index += 1) {
        const listeners = {};
        const item = {
          getFilename: () => 'same-name.dll', getURL: () => 'https://github.com/example/mod/releases/download/v1/same-name.dll',
          getTotalBytes: () => 100, getReceivedBytes: () => 0,
          setSavePath: (value) => paths.push(value),
          on: (event, callback) => { listeners[event] = callback; },
          once: (event, callback) => { listeners[event] = callback; },
          cancel: () => listeners.done({}, 'cancelled')
        };
        session.defaultSession.emit('will-download', {}, item);
      }
      return paths;
    });
    assert.notEqual(browserPaths[0], browserPaths[1], 'Duplicate download names must never overwrite one another.');
    const pendingDownloads = (await page.evaluate(() => window.bananaforge.getState())).downloads.filter((item) => item.state === 'progressing');
    for (const download of pendingDownloads) await page.evaluate((id) => window.bananaforge.cancelDownload(id), download.id);
    assert.equal((await page.evaluate(() => window.bananaforge.getState())).downloads.filter((item) => item.state === 'progressing').length, 0);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.click('.nav-item[data-page="profiles"]');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    const main = await electron.browserWindow(page); await main.evaluate((window) => window.setSize(1120, 700));
    await page.click('.nav-item[data-page="setup"]');
    assert.equal(await page.locator('#page-setup').evaluate((node) => node.scrollWidth > node.clientWidth), false);
    for (const section of ['dashboard', 'mods', 'profiles', 'downloads', 'settings', 'logs']) {
      await page.click(`.nav-item[data-page="${section}"]`);
      assert.equal(await page.locator(`#page-${section}`).evaluate((node) => node.scrollWidth > node.clientWidth), false, `${section} must fit the minimum window width`);
    }
    assert.deepEqual(errors, [], 'Renderer must not throw runtime errors.');
    console.log(JSON.stringify({ result: 'PASS', checks: ['legacy path regression', 'native profile creation', 'mod install and toggles on both pages', 'launch preflight and lock recovery', 'manual GitHub source tracking and auto update', 'unsaved settings persistence', 'rename and duplicate', 'profile package export/import/delete', 'live logs and filters', 'chosen copy location', 'package downloader and checksum integration', 'duplicate browser downloads and cancellation', 'reduced motion', 'all pages at minimum window size'], screenshots: root }, null, 2));
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(root, 'failure.png') }).catch(() => {});
    console.error('QA files:', root); console.error('Renderer errors:', errors); throw error;
  } finally { await electron.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });

