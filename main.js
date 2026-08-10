const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const updater = require('./updater');

// Single source of truth for the app version. app.getVersion() reads it
// straight from package.json's "version" field, so bumping that one value
// updates the window title, preload's appInfo, and the landing page UI.
// (Deliberately not using require('./package.json') here — that path breaks
// once the app is packaged/bundled and preload.js no longer sits next to it.)
const APP_VERSION = app.getVersion();

// Fix GPU disk cache errors (access denied when multiple instances share cache)
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-http-cache');

let mainWindow;
let fileToOpen = null;
let windowCounter = 0; // Used to give each window a unique localStorage partition

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
    app.quit();
}

function findSumdPath(args) {
    return args.find(arg => typeof arg === 'string' && arg.toLowerCase().endsWith('.sumd')) || null;
}

// Handle file opening on Windows (double-click .sumd file)
if (process.platform === 'win32' && process.argv.length >= 2) {
    fileToOpen = findSumdPath(process.argv);
}

// Allow multiple instances (needed for "New Window" from taskbar)
// When a second instance is launched with --new-window, open a new window
app.on('second-instance', (event, argv) => {
    const secondInstanceFile = findSumdPath(argv);
    if (argv.includes('--new-window')) {
        createWindow();
    } else if (secondInstanceFile) {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
            loadFileIntoApp(secondInstanceFile);
        } else {
            createWindow(secondInstanceFile);
        }
    } else {
        // Bring existing window to front
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    }
});

// ==================== WINDOW STATE ====================
const windowStatePath = path.join(app.getPath('userData'), 'window-state.json');
const autoSaveSettingsPath = path.join(app.getPath('userData'), 'autosave-settings.json');
const appSettingsPath = path.join(app.getPath('userData'), 'app-settings.json');
const recentDocsPath = path.join(app.getPath('userData'), 'recent-docs.json');
const knownDocsPath = path.join(app.getPath('userData'), 'known-docs.json');
const favouritesPath = path.join(app.getPath('userData'), 'favourites.json');
const knownTagsPath = path.join(app.getPath('userData'), 'known-tags.json');

// ── Recent docs ───────────────────────────────────────────────────────────
function readRecentDocs() {
    try { return JSON.parse(fs.readFileSync(recentDocsPath, 'utf8')); }
    catch { return []; }
}
function writeRecentDocs(docs) {
    fs.writeFileSync(recentDocsPath, JSON.stringify(docs, null, 2), 'utf8');
}

function readKnownDocs() {
    try { return JSON.parse(fs.readFileSync(knownDocsPath, 'utf8')); }
    catch { return []; }
}
function writeKnownDocs(docs) {
    fs.writeFileSync(knownDocsPath, JSON.stringify(docs, null, 2), 'utf8');
}
function rememberKnownDoc(entry) {
    if (!entry || !entry.path) return readKnownDocs();
    let docs = readKnownDocs();
    docs = docs.filter(d => d.path !== entry.path && d.id !== entry.id);
    docs.unshift({
        id: entry.id || Date.now().toString(36),
        name: entry.name || path.basename(entry.path, path.extname(entry.path)),
        path: entry.path,
        lastOpened: entry.lastOpened || new Date().toISOString()
    });
    writeKnownDocs(docs);
    return docs;
}

// ── Favourites ────────────────────────────────────────────────────────────
function readFavourites() {
    try { return JSON.parse(fs.readFileSync(favouritesPath, 'utf8')); }
    catch { return []; }
}
function writeFavourites(favs) {
    fs.writeFileSync(favouritesPath, JSON.stringify(favs, null, 2), 'utf8');
}

// ── App settings ──────────────────────────────────────────────────────────
const DEFAULT_APP_SETTINGS = {
    language: 'nl',                     // 'nl' | 'en'
    autoSaveNewFiles: false,            // automatically save new documents
    newFilesDirectory: path.join(app.getPath('home'), 'Documents'),
    closeToHome: true,                  // close button → landing page instead of quitting
    numberLocale: 'eu',                 // 'eu' = komma decimaal | 'us' = punt decimaal
};

function readAppSettings() {
    try {
        const raw = JSON.parse(fs.readFileSync(appSettingsPath, 'utf8'));
        return { ...DEFAULT_APP_SETTINGS, ...raw };
    } catch { return { ...DEFAULT_APP_SETTINGS }; }
}

function writeAppSettings(settings) {
    const merged = { ...DEFAULT_APP_SETTINGS, ...settings };
    fs.writeFileSync(appSettingsPath, JSON.stringify(merged, null, 2), 'utf8');
}

function readAutoSaveSettings() {
    try {
        return JSON.parse(fs.readFileSync(autoSaveSettingsPath, 'utf8'));
    } catch { return {}; }
}

function writeAutoSaveSettings(settings) {
    fs.writeFileSync(autoSaveSettingsPath, JSON.stringify(settings, null, 2), 'utf8');
}

function loadWindowState() {
    try {
        return JSON.parse(fs.readFileSync(windowStatePath, 'utf8'));
    } catch {
        return null; // First launch or corrupt file
    }
}

function saveWindowState() {
    if (!mainWindow) return;
    const isMaximized = mainWindow.isMaximized();
    const bounds = isMaximized ? mainWindow.getNormalBounds() : mainWindow.getBounds();
    try {
        fs.writeFileSync(windowStatePath, JSON.stringify({ ...bounds, isMaximized }), 'utf8');
    } catch (err) {
        console.error('Could not save window state:', err);
    }
}

function createWindow(filePathToOpen = null) {
    const savedState = loadWindowState();
    const isFirstLaunch = !savedState;
    const isNewWindow = mainWindow !== null && mainWindow !== undefined;

    // Each window gets its own partition so localStorage is isolated
    windowCounter++;
    const partition = `persist:summie-window-${windowCounter}`;

    const win = new BrowserWindow({
        width: savedState ? savedState.width : 1400,
        height: savedState ? savedState.height : 900,
        x: isNewWindow ? undefined : (savedState ? savedState.x : undefined),
        y: isNewWindow ? undefined : (savedState ? savedState.y : undefined),
        minWidth: 1200,
        minHeight: 700,
        title: `Summie v${APP_VERSION}`,
        icon: path.join(__dirname, 'app', 'icon.png'),
        frame: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            partition: partition
        },
        backgroundColor: '#f8fafc',
        show: false
    });

    // Track the first (main) window
    if (!mainWindow) mainWindow = win;

    if (filePathToOpen) {
        try {
            const fileContent = fs.readFileSync(filePathToOpen, 'utf8');
            win.initialSumdFile = { data: JSON.parse(fileContent), path: filePathToOpen };
        } catch (error) {
            console.error('Error preparing initial .sumd file:', error);
        }
        win.loadFile(path.join(__dirname, 'app', 'index.html'));
    } else {
        win.loadFile(path.join(__dirname, 'app', 'landing.html'));
    }

    win.once('ready-to-show', () => {
        if (!isNewWindow && (isFirstLaunch || (savedState && savedState.isMaximized))) {
            win.maximize();
        }
        win.show();
    });

    win.setMenu(null);

    // Hidden devtools shortcut: Ctrl+Shift+I
    win.webContents.on('before-input-event', (event, input) => {
        if (input.type === 'keyDown' &&
            input.control && input.shift && !input.alt &&
            input.key === 'I') {
            if (win.webContents.isDevToolsOpened()) {
                win.webContents.closeDevTools();
            } else {
                win.webContents.openDevTools({ mode: 'detach' });
            }
        }
    });

    win.on('maximize', () => win.webContents.send('window-state-changed', { maximized: true }));
    win.on('unmaximize', () => win.webContents.send('window-state-changed', { maximized: false }));
    win.on('minimize', () => win.webContents.send('window-state-changed', { minimized: true }));
    win.on('restore', () => win.webContents.send('window-state-changed', { minimized: false, maximized: win.isMaximized() }));

    // ==================== CLOSE HANDLER ====================
    win.on('close', async (e) => {
        if (win === mainWindow) saveWindowState();
        e.preventDefault();

        const currentURL = win.webContents.getURL();
        const isLanding = currentURL.includes('landing.html');
        if (isLanding) {
            win.destroy();
            return;
        }

        // Flush any pending auto-save before checking for unsaved changes
        try {
            await win.webContents.executeJavaScript(`
                (function() {
                    if (window.AutoSave) window.AutoSave.flush();
                })();
            `);
        } catch (err) { /* ignore */ }

        let hasChanges = false;
        try {
            const result = await win.webContents.executeJavaScript(`
                (function() {
                    if (window.checkUnsavedChanges) return window.checkUnsavedChanges();
                    return { hasChanges: false };
                })();
            `);
            hasChanges = result && result.hasChanges;
        } catch (err) {
            console.error('Error checking unsaved changes:', err);
        }

        if (!hasChanges) {
            const settings = readAppSettings();
            if (settings.closeToHome) {
                win.loadFile(path.join(__dirname, 'app', 'landing.html'));
            } else {
                win.destroy();
            }
            return;
        }

        let choice;
        try {
            choice = await win.webContents.executeJavaScript(`
                window.SummieDialogs.choice('Wil je het huidige document opslaan?', {
                    title: 'Niet-opgeslagen wijzigingen',
                    detail: 'Het huidige document gaat verloren als je een nieuw bestand laadt.',
                    buttons: [
                        { label: 'Opslaan', value: 'save', primary: true },
                        { label: 'Niet opslaan', value: 'dontsave', danger: true },
                        { label: 'Annuleren', value: 'cancel' }
                    ],
                    escValue: 'cancel'
                })
            `);
        } catch (err) {
            choice = 'cancel';
        }

        if (choice === 'save') {
            try {
                const result = await win.webContents.executeJavaScript('window.saveToFile(false)');
                if (result && result.canceled) return;
            } catch (e) { }
            const settings = readAppSettings();
            if (settings.closeToHome) {
                win.loadFile(path.join(__dirname, 'app', 'landing.html'));
            } else {
                win.destroy();
            }
        } else if (choice === 'dontsave') {
            const settings = readAppSettings();
            if (settings.closeToHome) {
                win.loadFile(path.join(__dirname, 'app', 'landing.html'));
            } else {
                win.destroy();
            }
        }
        // 'cancel' (or escape/click-outside): do nothing, window stays open
    });

    win.on('closed', () => {
        if (win === mainWindow) mainWindow = null;
    });

    return win;
}

function loadFileIntoWindow(win, filePath) {
    if (!win) return;
    try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(fileContent);
        const sendFile = () => win.webContents.send('load-sumd-file', data, filePath);
        const currentURL = win.webContents.getURL();
        if (!currentURL.includes('index.html')) {
            win.initialSumdFile = { data, path: filePath };
            win.loadFile(path.join(__dirname, 'app', 'index.html'));
            return;
        }
        if (win.webContents.isLoading()) {
            win.webContents.once('did-finish-load', sendFile);
        } else {
            sendFile();
        }
    } catch (error) {
        console.error('Error loading .sumd file:', error);
    }
}

// Keep backward compat
function loadFileIntoApp(filePath) {
    loadFileIntoWindow(mainWindow, filePath);
}

app.on('open-file', (event, filePath) => {
    event.preventDefault();
    if (filePath.endsWith('.sumd')) {
        if (mainWindow) {
            loadFileIntoApp(filePath);
        } else {
            fileToOpen = filePath;
        }
    }
});

// ==================== IPC HANDLERS ====================

ipcMain.handle('save-sumd-file', async (event, data, existingPath = null, defaultName = null, defaultDir = null) => {
    let filePath = existingPath;

    if (!filePath) {
        let defaultPath = defaultName ? `${defaultName}.sumd` : 'samenvatting.sumd';
        if (defaultDir) {
            defaultPath = path.join(defaultDir, defaultPath);
        }
        const result = await dialog.showSaveDialog(mainWindow, {
            title: 'Samenvatting Opslaan',
            defaultPath,
            filters: [
                { name: 'Summie Document', extensions: ['sumd'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });
        if (result.canceled) return { success: false, canceled: true };
        filePath = result.filePath;
    }

    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        return { success: true, path: filePath };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('open-sumd-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Document Openen',
        filters: [
            { name: 'Summie Document', extensions: ['sumd'] },
            { name: 'JSON Files', extensions: ['json'] },
            { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
    });

    if (!result.canceled && result.filePaths.length > 0) {
        try {
            const filePath = result.filePaths[0];
            const fileContent = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(fileContent);
            return { success: true, data: data, path: filePath };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    return { success: false, canceled: true };
});

ipcMain.handle('open-sumd-file-at', async (event, defaultDir) => {
    const opts = {
        title: 'Document Openen',
        filters: [
            { name: 'Summie Document', extensions: ['sumd'] },
            { name: 'JSON Files', extensions: ['json'] },
            { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
    };
    if (defaultDir) {
        try {
            // defaultDir may be a file path — use its directory
            const stat = fs.statSync(defaultDir);
            opts.defaultPath = stat.isDirectory() ? defaultDir : path.dirname(defaultDir);
        } catch {
            opts.defaultPath = defaultDir;
        }
    }
    const result = await dialog.showOpenDialog(mainWindow, opts);
    if (!result.canceled && result.filePaths.length > 0) {
        try {
            const filePath = result.filePaths[0];
            const fileContent = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(fileContent);
            return { success: true, data: data, path: filePath };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    return { success: false, canceled: true };
});

ipcMain.handle('file-exists', async (event, filePath) => {
    try {
        fs.accessSync(filePath, fs.constants.F_OK);
        return true;
    } catch {
        return false;
    }
});

ipcMain.handle('load-specific-file', async (event, filePath) => {
    try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(fileContent);
        return { success: true, data: data, path: filePath };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-initial-sumd-file', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || !win.initialSumdFile) return null;

    const file = win.initialSumdFile;
    win.initialSumdFile = null;
    return file;
});

ipcMain.handle('rename-file', async (event, oldPath, newPath) => {
    try {
        fs.renameSync(oldPath, newPath);
        return { success: true, path: newPath };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('print-document', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    // Hide UI, print, then restore
    await win.webContents.executeJavaScript(`
        document.documentElement.classList.add('printing-mode');
    `);
    return new Promise((resolve) => {
        win.webContents.print({ silent: false, printBackground: true }, async (success, errorType) => {
            await win.webContents.executeJavaScript(`
                document.documentElement.classList.remove('printing-mode');
            `);
            resolve({ success, errorType });
        });
    });
});

ipcMain.handle('save-as-pdf', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showSaveDialog(win, {
        title: 'Opslaan als PDF',
        defaultPath: 'document.pdf',
        filters: [{ name: 'PDF bestanden', extensions: ['pdf'] }]
    });
    if (result.canceled || !result.filePath) return { success: false, canceled: true };
    try {
        // Hide UI elements before PDF generation
        await win.webContents.executeJavaScript(`
            document.documentElement.classList.add('printing-mode');
        `);
        const pdfData = await win.webContents.printToPDF({
            printBackground: true,
            pageSize: 'A4',
            margins: { marginType: 'none' }
        });
        // Restore UI
        await win.webContents.executeJavaScript(`
            document.documentElement.classList.remove('printing-mode');
        `);
        fs.writeFileSync(result.filePath, pdfData);
        return { success: true, filePath: result.filePath };
    } catch (error) {
        await win.webContents.executeJavaScript(`
            document.documentElement.classList.remove('printing-mode');
        `).catch(() => { });
        return { success: false, error: error.message };
    }
});

ipcMain.handle('delete-file', async (event, filePath) => {
    try {
        fs.unlinkSync(filePath);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('show-in-explorer', async (event, filePath) => {
    try {
        shell.showItemInFolder(filePath);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Recent docs — file-based storage (replaces localStorage)
ipcMain.handle('recents-get', () => readRecentDocs());
ipcMain.handle('recents-add', (event, entry) => {
    rememberKnownDoc(entry);
    let docs = readRecentDocs();
    docs = docs.filter(d => d.path !== entry.path && d.id !== entry.id);
    docs.unshift(entry);
    if (docs.length > 10) docs = docs.slice(0, 10);
    writeRecentDocs(docs);
    return docs;
});
ipcMain.handle('recents-remove', (event, id) => {
    const docs = readRecentDocs().filter(d => d.id !== id);
    writeRecentDocs(docs);
    return docs;
});
ipcMain.handle('recents-save', (event, docs) => {
    docs.forEach(rememberKnownDoc);
    writeRecentDocs(docs);
    return docs;
});

// Update an existing entry's path/name in recents, known-docs and favourites.
// Used when a document is renamed so the same entry stays in place instead
// of leaving a stale "old" entry alongside a brand new one.
ipcMain.handle('update-doc-path', (event, oldPath, newPath, newName) => {
    if (!oldPath || !newPath) return { success: false, updated: false };

    let updated = false;
    const update = (entry) => {
        if (entry.path === oldPath) {
            entry.path = newPath;
            entry.name = newName || entry.name;
            entry.lastOpened = new Date().toISOString();
            updated = true;
        }
        return entry;
    };

    writeRecentDocs(readRecentDocs().map(update));
    writeKnownDocs(readKnownDocs().map(update));
    writeFavourites(readFavourites().map(update));

    return { success: true, updated };
});

ipcMain.handle('known-docs-get', () => {
    const recentDocs = readRecentDocs();
    recentDocs.forEach(rememberKnownDoc);
    return readKnownDocs();
});
ipcMain.handle('known-docs-save', (event, docs) => {
    writeKnownDocs(docs);
    return docs;
});

// Favourites — file-based storage
ipcMain.handle('favourites-get', () => readFavourites());
ipcMain.handle('favourites-save', (event, favs) => {
    writeFavourites(favs);
    return favs;
});

// App-wide settings (language, auto-save new files, default directory, etc.)
ipcMain.handle('settings-get', () => readAppSettings());
ipcMain.handle('settings-set', (event, patch) => {
    const current = readAppSettings();
    writeAppSettings({ ...current, ...patch });
    return readAppSettings();
});
ipcMain.handle('settings-get-number-locale', () => readAppSettings().numberLocale || 'eu');
ipcMain.handle('settings-pick-directory', async () => {
    const current = readAppSettings();
    const result = await dialog.showOpenDialog({
        title: 'Kies standaard map voor nieuwe documenten',
        defaultPath: current.newFilesDirectory,
        properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
});

// Auto-save settings — persisted to userData/autosave-settings.json
// Key = filePath, value = true. Absent = off (default).
ipcMain.handle('autosave-get', (event, filePath) => {
    const settings = readAutoSaveSettings();
    return !!settings[filePath];
});

ipcMain.handle('autosave-set', (event, filePath, enabled) => {
    const settings = readAutoSaveSettings();
    if (enabled) {
        settings[filePath] = true;
    } else {
        delete settings[filePath];
    }
    writeAutoSaveSettings(settings);
    return true;
});

// Sync IPC so preload.js can read the app version at startup without touching
// the filesystem/require directly (that path breaks once packaged/bundled).
ipcMain.on('get-app-version-sync', (event) => {
    event.returnValue = APP_VERSION;
});

// Update the window title to show the current document name
ipcMain.on('set-window-title', (event, documentName) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const title = documentName ? `${documentName} - Summie` : 'Summie';
    win.setTitle(title);
});

// Open a source code file via dialog and return path + content
ipcMain.handle('open-code-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Bestand Laden in Codeblok',
        properties: ['openFile']
    });
    if (!result.canceled && result.filePaths.length > 0) {
        try {
            const filePath = result.filePaths[0];
            const content = fs.readFileSync(filePath, 'utf8');
            return { success: true, path: filePath, content };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    return { success: false, canceled: true };
});

// Re-read a source code file by path (for refresh)
ipcMain.handle('read-code-file', async (event, filePath) => {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        return { success: true, content };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Updater IPC handlers
ipcMain.handle('updater-download', async () => {
    await updater.downloadUpdate();
    return { success: true };
});

ipcMain.handle('updater-quit-and-install', async () => {
    await updater.quitAndInstall();
    return { success: true };
});

ipcMain.handle('updater-is-downloaded', () => {
    return updater.isUpdateDownloaded();
});

ipcMain.handle('shell-open-external', async (event, url) => {
    const { shell } = require('electron');
    try {
        await shell.openExternal(url);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

app.whenReady().then(() => {
    createWindow(fileToOpen);

    // Clean up old installer files from temp directory
    updater.cleanupOldInstallers();

    // Check for updates on startup
    updater.checkForUpdates();

    // Windows taskbar right-click / Start menu "New Window" option
    if (process.platform === 'win32') {
        app.setUserTasks([
            {
                program: process.execPath,
                arguments: '--new-window',
                iconPath: process.execPath,
                iconIndex: 0,
                title: 'Nieuw venster',
                description: 'Open een nieuw Summie venster'
            }
        ]);
    }
});

// ==================== WINDOW CONTROLS ====================
function getFocusedWin() {
    return BrowserWindow.getFocusedWindow() || mainWindow;
}

ipcMain.on('window-minimize', () => { const w = getFocusedWin(); if (w) w.minimize(); });
ipcMain.on('window-maximize', () => {
    const w = getFocusedWin();
    if (!w) return;
    if (w.isMaximized()) w.unmaximize();
    else w.maximize();
});
ipcMain.on('window-close', () => { const w = getFocusedWin(); if (w) w.close(); });
ipcMain.on('window-new', () => { createWindow(); });

// Known tags
ipcMain.handle('known-tags-get', () => {
    try { return JSON.parse(fs.readFileSync(knownTagsPath, 'utf8')); }
    catch { return []; }
});
ipcMain.handle('known-tags-save', (event, tags) => {
    fs.writeFileSync(knownTagsPath, JSON.stringify(tags, null, 2), 'utf8');
    return true;
});

// Read/write description+tags metadata from a .sumd file
// Read raw file content (for preview renderer)
ipcMain.handle('read-file-content', (event, filePath) => {
    try { return fs.readFileSync(filePath, 'utf8'); }
    catch { return null; }
});

ipcMain.handle('open-sumd-file-by-path', (event, filePath) => {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch { return null; }
});

ipcMain.handle('scan-sumd-elements', (event, filePath) => {
    try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (raw && raw.summieFormat === 'summie-encrypted-v1') {
            const stat = fs.statSync(filePath);
            return {
                hasCodeblock: false,
                hasTable: false,
                hasImage: false,
                protected: true,
                fileSize: stat.size,
            };
        }
        const content = raw.content || '';
        const stat = fs.statSync(filePath);
        return {
            hasCodeblock: /<div[^>]*code-block/i.test(content),
            hasTable: /<table/i.test(content),
            hasImage: /<img/i.test(content),
            fileSize: stat.size,
        };
    } catch { return null; }
});

ipcMain.handle('get-file-size', (event, filePath) => {
    try {
        const stat = fs.statSync(filePath);
        return stat.size;
    } catch { return null; }
});

ipcMain.handle('read-sumd-meta', (event, filePath) => {
    try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (raw && raw.summieFormat === 'summie-encrypted-v1') {
            return { description: '', tags: [], protected: true };
        }
        return { description: raw.description || '', tags: raw.tags || [] };
    } catch { return null; }
});
ipcMain.handle('write-sumd-meta', (event, filePath, meta) => {
    try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (raw && raw.summieFormat === 'summie-encrypted-v1') return false;
        raw.description = meta.description || '';
        raw.tags = meta.tags || [];
        fs.writeFileSync(filePath, JSON.stringify(raw), 'utf8');
        return true;
    } catch { return false; }
});

ipcMain.on('navigate-to-manage', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.loadFile(path.join(__dirname, 'app', 'manage-documents.html'));
});

ipcMain.on('navigate-to-landing', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;

    const settings = readAppSettings();
    const goToLanding = settings.closeToHome;

    let hasChanges = false;
    try {
        const result = await win.webContents.executeJavaScript(`
            (function() {
                if (window.checkUnsavedChanges) return window.checkUnsavedChanges();
                return { hasChanges: false };
            })()
        `);
        hasChanges = result && result.hasChanges;
    } catch (err) { }

    if (hasChanges) {
        let choice;
        try {
            choice = await win.webContents.executeJavaScript(`
                window.SummieDialogs.choice('Wil je het huidige document opslaan?', {
                    title: 'Niet-opgeslagen wijzigingen',
                    detail: 'Het huidige document gaat verloren als je teruggaat naar het startmenu.',
                    buttons: [
                        { label: 'Opslaan', value: 'save', primary: true },
                        { label: 'Niet opslaan', value: 'dontsave', danger: true },
                        { label: 'Annuleren', value: 'cancel' }
                    ],
                    escValue: 'cancel'
                })
            `);
        } catch (err) {
            choice = 'cancel';
        }
        if (choice === 'cancel') return;
        if (choice === 'save') {
            try {
                const saved = await win.webContents.executeJavaScript('window.saveToFile(false)');
                if (saved && saved.canceled) return;
            } catch (e) { }
        }
    }

    if (goToLanding) {
        win.loadFile(path.join(__dirname, 'app', 'landing.html'));
    } else {
        win.destroy();
    }
});

ipcMain.on('open-leren', (event) => {
    const parentWin = BrowserWindow.fromWebContents(event.sender);
    const bounds = parentWin ? parentWin.getBounds() : { x: undefined, y: undefined, width: 1400, height: 900 };
    const lerenWin = new BrowserWindow({
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
        minWidth: 800,
        minHeight: 600,
        title: 'Begrippen Leren — Summie',
        icon: path.join(__dirname, 'app', 'icon.png'),
        frame: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
        },
        backgroundColor: '#f8fafc',
        show: false,
    });
    lerenWin.loadFile(path.join(__dirname, 'app', 'leren', 'index.html'));
    lerenWin.once('ready-to-show', () => {
        if (parentWin && parentWin.isMaximized()) lerenWin.maximize();
        lerenWin.show();
    });
    lerenWin.setMenu(null);
    // Close handler — no unsaved changes to worry about
    lerenWin.on('close', (e) => { lerenWin.destroy(); });
});

// Query current maximized state (used on load to sync button)
ipcMain.handle('window-is-maximized', () => { const w = getFocusedWin(); return w ? w.isMaximized() : false; });

// Snap layout support: receive the maximize button's bounding rect from the renderer
// and hook WM_NCHITTEST so Windows reports HTMAXBUTTON over that area.
// This enables the Windows 11 snap layouts flyout on hover.
let _maximizeBtnRect = null;
ipcMain.on('set-maximize-btn-rect', (event, rect) => {
    _maximizeBtnRect = rect;
    // Apply to the window that sent this message
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) applyNcHitTestHook(win);
});

function applyNcHitTestHook(win) {
    if (!win || process.platform !== 'win32') return;
    const WM_NCHITTEST = 0x0084;
    const HTMAXBUTTON = 9;

    win.hookWindowMessage(WM_NCHITTEST, (wParam, lParam) => {
        if (!_maximizeBtnRect) {
            win.setEnabled(false);
            win.setEnabled(true);
            return;
        }
        const x = lParam.readInt16LE(0);
        const y = lParam.readInt16LE(2);
        const bounds = win.getBounds();
        const clientX = x - bounds.x;
        const clientY = y - bounds.y;
        const r = _maximizeBtnRect;
        if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
            win.setEnabled(false);
            win.setEnabled(true);
            return { result: HTMAXBUTTON };
        }
        win.setEnabled(false);
        win.setEnabled(true);
    });
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});