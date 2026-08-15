const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const updater = require('./updater');
const EN_DICT = require('./app/js/i18n/en.js');

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
    return args.map(normalizeSumdArg).find(p => p && p.toLowerCase().endsWith('.sumd')) || null;
}

// File managers on Linux may hand the app a file:// URI (desktop Exec %U)
// instead of a plain path — normalise to a filesystem path so .sumd matching
// and loadFileIntoWindow/readFileSync keep working everywhere.
function normalizeSumdArg(arg) {
    if (typeof arg !== 'string') return null;
    try {
        if (arg.startsWith('file://')) return decodeURIComponent(arg.slice(7));
    } catch {
        /* malformed URI — fall through and treat as plain path */
    }
    return arg;
}

// Handle file opening on Windows/Linux (double-click .sumd file).
// macOS delivers opened files via the 'open-file' event instead, so we skip
// argv scanning there to avoid double-handling the path.
if (process.platform !== 'darwin' && process.argv.length >= 2) {
    fileToOpen = findSumdPath(process.argv);
}

// Allow multiple instances (needed for "New Window" from taskbar)
// When a second instance is launched with --new-window, open a new window
app.on('second-instance', (event, argv) => {
    const secondInstanceFile = findSumdPath(argv);
    if (argv.includes('--new-window')) {
        createWindow();
    } else if (secondInstanceFile) {
        openSumdFileFromOS(secondInstanceFile);
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

// ── IPC hardening ────────────────────────────────────────────────────────
// The preload bridge gives the renderer filesystem reach (read/write/delete,
// dialogs, shell). Every handler that touches the filesystem or another app
// channel must first pass through isTrustedSender(), and every renderer-supplied
// path goes through the path/existence/extension validators below. The renderer
// is only "trusted" when it is one of our own file:// pages — never about:blank,
// never a subframe or a remote URL.
const APP_PAGE_FILENAMES = ['index.html', 'landing.html', 'manage-documents.html'];
const DOC_EXTENSIONS = ['.sumd', '.json'];

function isTrustedSender(event) {
    try {
        const url = event && event.sender ? event.sender.getURL() : '';
        if (!url || !url.startsWith('file://')) return false;
        const pathname = decodeURIComponent(new URL(url).pathname);
        return APP_PAGE_FILENAMES.includes(path.basename(pathname).toLowerCase());
    } catch {
        return false;
    }
}

// Preload fires sendSync for app version/theme/language during first paint,
// when webContents.getURL() may still be empty. These channels only return
// app constants/settings (never user files or paths), so we tolerate the
// still-loading window while still blocking every other origin.
function isLaxTrustedSender(event) {
    try {
        if (isTrustedSender(event)) return true;
        const url = event && event.sender ? event.sender.getURL() : '';
        return url === '' || url === 'about:blank';
    } catch {
        return false;
    }
}

// Renderer-supplied path → resolved absolute path, or null when unusable.
function resolvePathArg(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    if (value.includes('\0')) return null;
    return path.resolve(value);
}

function isExistingRegularFile(filePath) {
    try {
        return fs.statSync(filePath).isFile();
    } catch {
        return false;
    }
}

function isDocPath(filePath) {
    return DOC_EXTENSIONS.includes(path.extname(filePath).toLowerCase());
}

// Handlers only run when the call came from one of our own pages.
function safeHandle(channel, handler) {
    ipcMain.handle(channel, async (event, ...args) => {
        if (!isTrustedSender(event)) return null;
        return handler(event, ...args);
    });
}

function safeOn(channel, handler) {
    ipcMain.on(channel, (event, ...args) => {
        if (!isTrustedSender(event)) return;
        handler(event, ...args);
    });
}

function safeOnLax(channel, handler) {
    ipcMain.on(channel, (event, ...args) => {
        if (!isLaxTrustedSender(event)) return;
        handler(event, ...args);
    });
}

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
// The default language follows the device: Dutch when the OS is Dutch,
// English otherwise (the universal fallback for all other locales).
function detectDefaultLanguage() {
    const locale = (app.getLocale() || '').toLowerCase();
    return locale.startsWith('nl') ? 'nl' : 'en';
}

const DEFAULT_APP_SETTINGS = {
    language: detectDefaultLanguage(),  // 'nl' | 'en'
    autoSaveNewFiles: false,            // automatically save new documents
    newFilesDirectory: path.join(app.getPath('home'), 'Documents'),
    closeToHome: true,                  // close button → landing page instead of quitting
    numberLocale: 'eu',                 // 'eu' = komma decimaal | 'us' = punt decimaal
    theme: 'system',                    // 'system' = volg OS | 'dark' | 'light'
    dismissedUpdateVersion: null,       // update version whose reminder the user dismissed
};

function readAppSettings() {
    let raw = {};
    try {
        raw = JSON.parse(fs.readFileSync(appSettingsPath, 'utf8'));
    } catch { /* corrupt or missing — fall through with defaults */ }
    const merged = { ...DEFAULT_APP_SETTINGS, ...raw };
    if (merged.language !== 'nl' && merged.language !== 'en') {
        merged.language = detectDefaultLanguage();
    }
    return merged;
}

function writeAppSettings(settings) {
    const merged = { ...DEFAULT_APP_SETTINGS, ...settings };
    fs.writeFileSync(appSettingsPath, JSON.stringify(merged, null, 2), 'utf8');
}

// Translate a main-process UI string (native dialogs, taskbar, window titles).
// Dutch is returned as-is; English is looked up in the shared dictionary.
function tMain(str) {
    const lang = readAppSettings().language || detectDefaultLanguage();
    if (lang !== 'en') return str;
    const hit = EN_DICT && EN_DICT[str];
    return hit !== undefined && hit !== null ? hit : str;
}

// Window background color for the moment before the page renders — matches the
// light/dark palette in styles.css / landing.css so there is no flash.
function resolveWindowBackgroundColor() {
    const theme = readAppSettings().theme || 'system';
    if (theme === 'dark') return '#08081a';
    if (theme === 'light') return '#f8fafc';
    return nativeTheme.shouldUseDarkColors ? '#08081a' : '#f8fafc';
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
        backgroundColor: resolveWindowBackgroundColor(),
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
                window.SummieDialogs.choice(${JSON.stringify(tMain('Wil je het huidige document opslaan?'))}, {
                    title: ${JSON.stringify(tMain('Niet opgeslagen wijzigingen'))},
                    detail: ${JSON.stringify(tMain('Het huidige document gaat verloren als je een nieuw bestand laadt.'))},
                    buttons: [
                        { label: ${JSON.stringify(tMain('Opslaan'))}, value: 'save', primary: true },
                        { label: ${JSON.stringify(tMain('Niet opslaan'))}, value: 'dontsave', danger: true },
                        { label: ${JSON.stringify(tMain('Annuleren'))}, value: 'cancel' }
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

// Open a .sumd file "from the OS" (double-click in file explorer / file:// URI).
// If a window sits on the landing page (no document open), load the file there
// so an already-open document in another window is never replaced. Otherwise all
// windows have a document open, so the file opens in a brand new window.
function openSumdFileFromOS(filePath) {
    const windows = BrowserWindow.getAllWindows();
    const landingWin = windows.find(win => {
        const url = win.webContents.getURL();
        return url.includes('landing.html') || url.includes('manage-documents.html');
    });

    if (landingWin) {
        if (landingWin.isMinimized()) landingWin.restore();
        landingWin.focus();
        loadFileIntoWindow(landingWin, filePath);
        return;
    }

    createWindow(filePath);
}

app.on('open-file', (event, filePath) => {
    event.preventDefault();
    const normalized = normalizeSumdArg(filePath);
    if (normalized && normalized.toLowerCase().endsWith('.sumd')) {
        if (mainWindow) {
            openSumdFileFromOS(normalized);
        } else {
            fileToOpen = normalized;
        }
    }
});

// ==================== IPC HANDLERS ====================

safeHandle('save-sumd-file', async (event, data, existingPath = null, defaultName = null, defaultDir = null) => {
    let filePath = existingPath;

    if (filePath) {
        // existingPath comes from the renderer and (on double-saves) is the path
        // of the currently open document. Only ever re-write an existing .sumd/.json
        // document — never an arbitrary path supplied by page code.
        const resolved = resolvePathArg(filePath);
        if (!resolved || !isExistingRegularFile(resolved) || !isDocPath(resolved)) {
            return { success: false, error: 'Ongeldig bestandspad' };
        }
        filePath = resolved;
    } else {
        let defaultPath = defaultName ? `${defaultName}.sumd` : `${tMain('samenvatting')}.sumd`;
        if (defaultDir) {
            defaultPath = path.join(defaultDir, defaultPath);
        }
        const result = await dialog.showSaveDialog(mainWindow, {
            title: tMain('Samenvatting Opslaan'),
            defaultPath,
            filters: [
                { name: tMain('Summie Document'), extensions: ['sumd'] },
                { name: tMain('All Files'), extensions: ['*'] }
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

safeHandle('open-sumd-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: tMain('Document Openen'),
        filters: [
            { name: tMain('Summie Document'), extensions: ['sumd'] },
            { name: tMain('JSON Files'), extensions: ['json'] },
            { name: tMain('All Files'), extensions: ['*'] }
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

safeHandle('open-sumd-file-at', async (event, defaultDir) => {
    const opts = {
        title: tMain('Document Openen'),
        filters: [
            { name: tMain('Summie Document'), extensions: ['sumd'] },
            { name: tMain('JSON Files'), extensions: ['json'] },
            { name: tMain('All Files'), extensions: ['*'] }
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

safeHandle('file-exists', async (event, filePath) => {
    const resolved = resolvePathArg(filePath);
    if (!resolved) return false;
    try {
        fs.accessSync(resolved, fs.constants.F_OK);
        return true;
    } catch {
        return false;
    }
});

safeHandle('load-specific-file', async (event, filePath) => {
    const resolved = resolvePathArg(filePath);
    if (!resolved || !isExistingRegularFile(resolved) || !isDocPath(resolved)) {
        return { success: false, error: 'Ongeldig bestandspad' };
    }
    try {
        const fileContent = fs.readFileSync(resolved, 'utf8');
        const data = JSON.parse(fileContent);
        return { success: true, data: data, path: resolved };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

safeHandle('get-initial-sumd-file', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || !win.initialSumdFile) return null;

    const file = win.initialSumdFile;
    win.initialSumdFile = null;
    return file;
});

safeHandle('rename-file', async (event, oldPath, newPath) => {
    const resolvedOld = resolvePathArg(oldPath);
    const resolvedNew = resolvePathArg(newPath);
    if (!resolvedOld || !resolvedNew || !isExistingRegularFile(resolvedOld) ||
        !isDocPath(resolvedOld) || !isDocPath(resolvedNew)) {
        return { success: false, error: 'Ongeldig bestandspad' };
    }
    try {
        fs.renameSync(resolvedOld, resolvedNew);
        return { success: true, path: resolvedNew };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

safeHandle('print-document', async (event) => {
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

safeHandle('save-as-pdf', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showSaveDialog(win, {
        title: tMain('Opslaan als PDF'),
        defaultPath: 'document.pdf',
        filters: [{ name: tMain('PDF bestanden'), extensions: ['pdf'] }]
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

safeHandle('delete-file', async (event, filePath) => {
    const resolved = resolvePathArg(filePath);
    if (!resolved || !isExistingRegularFile(resolved) || !isDocPath(resolved)) {
        return { success: false, error: 'Ongeldig bestandspad' };
    }
    try {
        fs.unlinkSync(resolved);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

safeHandle('show-in-explorer', async (event, filePath) => {
    const resolved = resolvePathArg(filePath);
    if (!resolved || !isExistingRegularFile(resolved)) {
        return { success: false, error: 'Ongeldig bestandspad' };
    }
    try {
        shell.showItemInFolder(resolved);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Recent docs — file-based storage (replaces localStorage)
safeHandle('recents-get', () => readRecentDocs());
safeHandle('recents-add', (event, entry) => {
    rememberKnownDoc(entry);
    let docs = readRecentDocs();
    docs = docs.filter(d => d.path !== entry.path && d.id !== entry.id);
    docs.unshift(entry);
    if (docs.length > 10) docs = docs.slice(0, 10);
    writeRecentDocs(docs);
    return docs;
});
safeHandle('recents-remove', (event, id) => {
    const docs = readRecentDocs().filter(d => d.id !== id);
    writeRecentDocs(docs);
    return docs;
});
safeHandle('recents-save', (event, docs) => {
    docs.forEach(rememberKnownDoc);
    writeRecentDocs(docs);
    return docs;
});

// Update an existing entry's path/name in recents, known-docs and favourites.
// Used when a document is renamed so the same entry stays in place instead
// of leaving a stale "old" entry alongside a brand new one.
safeHandle('update-doc-path', (event, oldPath, newPath, newName) => {
    const resolvedOld = resolvePathArg(oldPath);
    const resolvedNew = resolvePathArg(newPath);
    if (!resolvedOld || !resolvedNew || !isExistingRegularFile(resolvedOld) || !isDocPath(resolvedNew)) {
        return { success: false, updated: false };
    }

    let updated = false;
    const update = (entry) => {
        if (entry.path === oldPath || entry.path === resolvedOld) {
            entry.path = resolvedNew;
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

safeHandle('known-docs-get', () => {
    const recentDocs = readRecentDocs();
    recentDocs.forEach(rememberKnownDoc);
    return readKnownDocs();
});
safeHandle('known-docs-save', (event, docs) => {
    writeKnownDocs(docs);
    return docs;
});

// Favourites — file-based storage
safeHandle('favourites-get', () => readFavourites());
safeHandle('favourites-save', (event, favs) => {
    writeFavourites(favs);
    return favs;
});

// App-wide settings (language, auto-save new files, default directory, etc.)
safeOnLax('get-theme-sync', (event) => {
    event.returnValue = readAppSettings().theme || 'system';
});
safeHandle('settings-get', () => readAppSettings());
safeHandle('settings-set', (event, patch) => {
    const current = readAppSettings();
    writeAppSettings({ ...current, ...patch });
    const updated = readAppSettings();
    // Keep every open window in sync when the theme changes via settings
    if (patch && patch.theme) {
        BrowserWindow.getAllWindows().forEach(win => {
            win.webContents.send('theme-changed', updated.theme || 'system');
        });
    }
    // Keep every open window in sync when the language changes via settings
    if (patch && patch.language && patch.language !== current.language) {
        BrowserWindow.getAllWindows().forEach(win => {
            win.webContents.send('language-changed', updated.language || 'nl');
        });
    }
    return updated;
});
safeHandle('settings-get-number-locale', () => readAppSettings().numberLocale || 'eu');
safeHandle('settings-pick-directory', async () => {
    const current = readAppSettings();
    const result = await dialog.showOpenDialog({
        title: tMain('Kies standaard map voor nieuwe documenten'),
        defaultPath: current.newFilesDirectory,
        properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
});

// Auto-save settings — persisted to userData/autosave-settings.json
// Key = filePath, value = true. Absent = off (default).
safeHandle('autosave-get', (event, filePath) => {
    const resolved = resolvePathArg(filePath);
    if (!resolved || !isDocPath(resolved)) return false;
    const settings = readAutoSaveSettings();
    return !!settings[filePath];
});

safeHandle('autosave-set', (event, filePath, enabled) => {
    const resolved = resolvePathArg(filePath);
    if (!resolved || !isDocPath(resolved)) return false;
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
safeOnLax('get-app-version-sync', (event) => {
    event.returnValue = APP_VERSION;
});

// Sync IPC for the active language — lets each page resolve translations
// synchronously before anything is painted or rendered.
safeOnLax('get-language-sync', (event) => {
    event.returnValue = readAppSettings().language || detectDefaultLanguage();
});

// Update the window title to show the current document name
safeOn('set-window-title', (event, documentName) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const title = documentName ? `${documentName} - Summie` : 'Summie';
    win.setTitle(title);
});

// Open a source code file via dialog and return path + content
safeHandle('open-code-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: tMain('Bestand Laden in Codeblok'),
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

// Re-read a source code file by path (for refresh). The path originates from
// the dialog in open-code-file — require an existing regular file so a
// renderer compromise can't read arbitrary non-existent/special paths.
safeHandle('read-code-file', async (event, filePath) => {
    const resolved = resolvePathArg(filePath);
    if (!resolved || !isExistingRegularFile(resolved)) {
        return { success: false, error: 'Ongeldig bestandspad' };
    }
    try {
        const content = fs.readFileSync(resolved, 'utf8');
        return { success: true, content };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Updater IPC handlers
safeHandle('updater-download', async () => {
    await updater.downloadUpdate();
    return { success: true };
});

safeHandle('updater-quit-and-install', async () => {
    await updater.quitAndInstall();
    return { success: true };
});

safeHandle('updater-is-downloaded', () => {
    return updater.isUpdateDownloaded();
});

// Only ever open http/https/mailto — never file://, custom URI schemes or
// local executables hiding behind a crafted URL.
safeHandle('shell-open-external', async (event, url) => {
    const { shell } = require('electron');
    let parsed;
    try {
        parsed = new URL(String(url));
    } catch {
        return { success: false, error: 'Ongeldige URL' };
    }
    const allowed = ['http:', 'https:', 'mailto:'];
    if (!allowed.includes(parsed.protocol)) {
        return { success: false, error: 'URL-scheme niet toegestaan' };
    }
    try {
        await shell.openExternal(parsed.href);
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
                title: tMain('Nieuw venster'),
                description: tMain('Open een nieuw Summie venster')
            }
        ]);
    }
});

// ==================== WINDOW CONTROLS ====================
function getFocusedWin() {
    return BrowserWindow.getFocusedWindow() || mainWindow;
}

safeOn('window-minimize', () => { const w = getFocusedWin(); if (w) w.minimize(); });
safeOn('window-maximize', () => {
    const w = getFocusedWin();
    if (!w) return;
    if (w.isMaximized()) w.unmaximize();
    else w.maximize();
});
safeOn('window-close', () => { const w = getFocusedWin(); if (w) w.close(); });
safeOn('window-new', () => { createWindow(); });

// Known tags
safeHandle('known-tags-get', () => {
    try { return JSON.parse(fs.readFileSync(knownTagsPath, 'utf8')); }
    catch { return []; }
});
safeHandle('known-tags-save', (event, tags) => {
    fs.writeFileSync(knownTagsPath, JSON.stringify(tags, null, 2), 'utf8');
    return true;
});

// Read/write description+tags metadata from a .sumd file
// Read raw file content (for preview renderer)
safeHandle('read-file-content', (event, filePath) => {
    const resolved = resolvePathArg(filePath);
    if (!resolved || !isExistingRegularFile(resolved) || !isDocPath(resolved)) return null;
    try { return fs.readFileSync(resolved, 'utf8'); }
    catch { return null; }
});

safeHandle('open-sumd-file-by-path', (event, filePath) => {
    const resolved = resolvePathArg(filePath);
    if (!resolved || !isExistingRegularFile(resolved) || !isDocPath(resolved)) return null;
    try {
        return JSON.parse(fs.readFileSync(resolved, 'utf8'));
    } catch { return null; }
});

safeHandle('scan-sumd-elements', (event, filePath) => {
    const resolved = resolvePathArg(filePath);
    if (!resolved || !isExistingRegularFile(resolved) || !isDocPath(resolved)) return null;
    try {
        const raw = JSON.parse(fs.readFileSync(resolved, 'utf8'));
        if (raw && raw.summieFormat === 'summie-encrypted-v1') {
            const stat = fs.statSync(resolved);
            return {
                hasCodeblock: false,
                hasTable: false,
                hasImage: false,
                protected: true,
                fileSize: stat.size,
            };
        }
        const content = raw.content || '';
        const stat = fs.statSync(resolved);
        return {
            hasCodeblock: /<div[^>]*code-block/i.test(content),
            hasTable: /<table/i.test(content),
            hasImage: /<img/i.test(content),
            fileSize: stat.size,
        };
    } catch { return null; }
});

safeHandle('get-file-size', (event, filePath) => {
    const resolved = resolvePathArg(filePath);
    if (!resolved || !isExistingRegularFile(resolved) || !isDocPath(resolved)) return null;
    try {
        const stat = fs.statSync(resolved);
        return stat.size;
    } catch { return null; }
});

safeHandle('read-sumd-meta', (event, filePath) => {
    const resolved = resolvePathArg(filePath);
    if (!resolved || !isExistingRegularFile(resolved) || !isDocPath(resolved)) return null;
    try {
        const raw = JSON.parse(fs.readFileSync(resolved, 'utf8'));
        if (raw && raw.summieFormat === 'summie-encrypted-v1') {
            return { description: '', tags: [], protected: true };
        }
        return { description: raw.description || '', tags: raw.tags || [] };
    } catch { return null; }
});
safeHandle('write-sumd-meta', (event, filePath, meta) => {
    const resolved = resolvePathArg(filePath);
    if (!resolved || !isExistingRegularFile(resolved) || !isDocPath(resolved)) return false;
    try {
        const raw = JSON.parse(fs.readFileSync(resolved, 'utf8'));
        if (raw && raw.summieFormat === 'summie-encrypted-v1') return false;
        raw.description = meta.description || '';
        raw.tags = meta.tags || [];
        fs.writeFileSync(resolved, JSON.stringify(raw), 'utf8');
        return true;
    } catch { return false; }
});

safeOn('navigate-to-manage', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.loadFile(path.join(__dirname, 'app', 'manage-documents.html'));
});

safeOn('navigate-to-landing', async (event) => {
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
                window.SummieDialogs.choice(${JSON.stringify(tMain('Wil je het huidige document opslaan?'))}, {
                    title: ${JSON.stringify(tMain('Niet opgeslagen wijzigingen'))},
                    detail: ${JSON.stringify(tMain('Het huidige document gaat verloren als je teruggaat naar het startmenu.'))},
                    buttons: [
                        { label: ${JSON.stringify(tMain('Opslaan'))}, value: 'save', primary: true },
                        { label: ${JSON.stringify(tMain('Niet opslaan'))}, value: 'dontsave', danger: true },
                        { label: ${JSON.stringify(tMain('Annuleren'))}, value: 'cancel' }
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

safeOn('open-leren', (event) => {
    const parentWin = BrowserWindow.fromWebContents(event.sender);
    const bounds = parentWin ? parentWin.getBounds() : { x: undefined, y: undefined, width: 1400, height: 900 };
    const lerenWin = new BrowserWindow({
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
        minWidth: 800,
        minHeight: 600,
        title: tMain('Begrippen Leren — Summie'),
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
safeHandle('window-is-maximized', () => { const w = getFocusedWin(); return w ? w.isMaximized() : false; });

// Snap layout support: receive the maximize button's bounding rect from the renderer
// and hook WM_NCHITTEST so Windows reports HTMAXBUTTON over that area.
// This enables the Windows 11 snap layouts flyout on hover.
let _maximizeBtnRect = null;
safeOn('set-maximize-btn-rect', (event, rect) => {
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