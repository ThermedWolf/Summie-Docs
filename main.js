const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// Fix GPU disk cache errors (access denied when multiple instances share cache)
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-http-cache');

let mainWindow;
let fileToOpen = null;
let windowCounter = 0; // Used to give each window a unique localStorage partition

// Handle file opening on Windows (double-click .sumd file)
if (process.platform === 'win32' && process.argv.length >= 2) {
    fileToOpen = process.argv.find(arg => arg.endsWith('.sumd')) || null;
}

// Allow multiple instances (needed for "New Window" from taskbar)
// When a second instance is launched with --new-window, open a new window
app.on('second-instance', (event, argv) => {
    if (argv.includes('--new-window')) {
        createWindow();
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
        title: 'Summie v4.0.0',
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
        win.loadFile(path.join(__dirname, 'app', 'index.html'));
    } else {
        win.loadFile(path.join(__dirname, 'app', 'landing.html'));
    }

    win.once('ready-to-show', () => {
        if (!isNewWindow && (isFirstLaunch || (savedState && savedState.isMaximized))) {
            win.maximize();
        }
        win.show();
        if (filePathToOpen) {
            loadFileIntoWindow(win, filePathToOpen);
        }
    });

    win.setMenu(null);

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

        const choice = await dialog.showMessageBox(win, {
            type: 'question',
            buttons: ['Opslaan', 'Niet Opslaan', 'Annuleren'],
            defaultId: 0,
            cancelId: 2,
            title: 'Niet-opgeslagen wijzigingen',
            message: 'Wil je het huidige document opslaan?',
            detail: 'Het huidige document gaat verloren als je een nieuw bestand laad'
        });

        if (choice.response === 0) {
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
        } else if (choice.response === 1) {
            const settings = readAppSettings();
            if (settings.closeToHome) {
                win.loadFile(path.join(__dirname, 'app', 'landing.html'));
            } else {
                win.destroy();
            }
        }
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
        win.webContents.send('load-sumd-file', data, filePath);
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

ipcMain.handle('save-sumd-file', async (event, data, existingPath = null, defaultName = null) => {
    let filePath = existingPath;

    if (!filePath) {
        const result = await dialog.showSaveDialog(mainWindow, {
            title: 'Samenvatting Opslaan',
            defaultPath: defaultName ? `${defaultName}.sumd` : 'samenvatting.sumd',
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

ipcMain.handle('rename-file', async (event, oldPath, newPath) => {
    try {
        fs.renameSync(oldPath, newPath);
        return { success: true, path: newPath };
    } catch (error) {
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

app.whenReady().then(() => {
    createWindow(fileToOpen);

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

ipcMain.handle('read-sumd-meta', (event, filePath) => {
    try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return { description: raw.description || '', tags: raw.tags || [] };
    } catch { return null; }
});
ipcMain.handle('write-sumd-meta', (event, filePath, meta) => {
    try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
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
        const choice = await dialog.showMessageBox(win, {
            type: 'question',
            buttons: ['Opslaan', 'Niet Opslaan', 'Annuleren'],
            defaultId: 0,
            cancelId: 2,
            title: 'Niet-opgeslagen wijzigingen',
            message: 'Wil je het huidige document opslaan?',
            detail: 'Het huidige document gaat verloren als je teruggaat naar het startmenu'
        });
        if (choice.response === 2) return;
        if (choice.response === 0) {
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
