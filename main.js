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

// Fix Wayland+Vulkan + GPU zygote bug on Linux (Electron 41-43 / Chromium 146):
// Hyprland/Omarchy sets ELECTRON_OZONE_PLATFORM_HINT=wayland -> Chromium
// auto-selects '--ozone-platform=wayland' but the GPU zygote is spawned
// without ozone flags, causing (a) the cosmetic error
//   "'--ozone-platform=wayland' is not compatible with Vulkan"
// and (b) a 5x CPU overhead + GPU segfaults (exit_code=139) on Intel Arc.
// Native Wayland fix (electron#50455/#50462): disable the zygote so the
// GPU process is spawned fresh with the full flag set, plus disable Vulkan
// (still incompatible with Wayland ozone). The Vulkan ERROR will still log
// but is harmless — GPU acceleration now works. Forcing XWayland
// (--ozone-platform=x11) hides the ERROR but crashes on this Intel iGPU
// (XGetWindowAttributes / command_buffer_proxy_impl), so we keep native
// Wayland here.
if (process.platform === 'linux') {
    app.commandLine.appendSwitch('disable-vulkan');
    app.commandLine.appendSwitch('no-zygote');
    // Enable Chromium's speech-dispatcher TTS backend (Linux uses speech-dispatcher + espeak-ng)
    // Without this flag speechSynthesis.speak fails with synthesis-failed even when the
    // daemon is installed; with it, speak uses the espeak-ng default voice even if
    // getVoices() is still empty.
    app.commandLine.appendSwitch('enable-speech-dispatcher');
}

let mainWindow;
let fileToOpen = null;
let openNewDocumentOnStart = false;
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
    if (arg.startsWith('file://')) {
        try {
            let p = decodeURIComponent(new URL(arg).pathname);
            // Windows file:///C:/… yields "/C:/…" — drop the leading slash so
            // the result is a valid drive path instead of "<cwd>:\C:\…".
            if (/^\/[A-Za-z]:[\\/]/.test(p)) p = p.slice(1);
            return p;
        } catch {
            /* malformed URI — fall through and treat as plain path */
        }
    }
    return arg;
}

// Handle file opening on Windows/Linux (double-click .sumd file) and
// taskbar "New document" launch (--new-document). macOS delivers opened
// files via the 'open-file' event instead, so we skip argv scanning there
// to avoid double-handling the path.
if (process.platform !== 'darwin' && process.argv.length >= 2) {
    if (process.argv.includes('--new-document')) {
        openNewDocumentOnStart = true;
    } else {
        fileToOpen = findSumdPath(process.argv);
    }
}

// Allow multiple instances (needed for taskbar Jumplist entries).
// --new-document opens a fresh blank document directly,
// --new-window opens the landing/home screen.
app.on('second-instance', (event, argv) => {
    const secondInstanceFile = findSumdPath(argv);
    if (argv.includes('--new-document')) {
        createWindow(null, { newDocument: true });
    } else if (argv.includes('--new-window')) {
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

// ── Piper neural TTS registry ───────────────────────────────────────────────
// Bundled: English voice ships inside app resources. On-demand: Dutch voices
// downloaded to userData/piper-voices/ on first use.
// Note: nl_NL/mls is multi-speaker (52). Default speaker 0 is male, so for
// female we use the dedicated Flemish single-speaker nathalie (clear female)
// rather than guessing a speaker_id in the multi-speaker model.
const PIPER_REGISTRY = {
    'en_US-libritts_r-medium':   { lang: 'en', prefix: 'en', gender: 'female', bundled: true,  quality: 'medium', label: 'English (neural)', hfPath: 'en/en_US/libritts_r/medium', speakerId: 0 },
    'en_US-libritts-high':       { lang: 'en', prefix: 'en', gender: 'female', bundled: false, quality: 'high',   label: 'English high (krachtiger)', hfPath: 'en/en_US/libritts/high', speakerId: 0 },
    'en_US-ryan-medium':         { lang: 'en', prefix: 'en', gender: 'male',   bundled: false, quality: 'medium', label: 'English male (neural)', hfPath: 'en/en_US/ryan/medium', speakerId: 0 },
    'en_US-ryan-high':           { lang: 'en', prefix: 'en', gender: 'male',   bundled: false, quality: 'high',   label: 'English male high (krachtiger)', hfPath: 'en/en_US/ryan/high', speakerId: 0 },
    'nl_BE-nathalie-medium':     { lang: 'nl', prefix: 'nl', gender: 'female', bundled: false, quality: 'medium', label: 'Nederlands vrouw (neuraal)', hfPath: 'nl/nl_BE/nathalie/medium', speakerId: 0 },
    'nl_NL-ronnie-medium':       { lang: 'nl', prefix: 'nl', gender: 'male',   bundled: false, quality: 'medium', label: 'Nederlands man (neuraal)',   hfPath: 'nl/nl_NL/ronnie/medium', speakerId: 0 },
    // high-power Dutch (OpenVoiceOS dii, 28-32M) — more natural, now default for nl vrouw
    'nl_NL-dii-high':            { lang: 'nl', prefix: 'nl', gender: 'female', bundled: false, quality: 'high', label: 'Nederlands vrouw high (krachtiger)', hfRepo: 'OpenVoiceOS/pipertts_nl-NL_dii', hfFiles: { onnx: 'dii_nl-NL.onnx', json: 'dii_nl-NL.onnx.json' }, speakerId: 0 },
};
const PIPER_GENDER_MAP = {
    nl: { female: 'nl_NL-dii-high', male: 'nl_NL-ronnie-medium', system: 'nl_NL-dii-high' },
    en: { female: 'en_US-libritts-high', male: 'en_US-ryan-high', system: 'en_US-libritts-high' },
};

const DEFAULT_APP_SETTINGS = {
    language: detectDefaultLanguage(),  // 'nl' | 'en'
    autoSaveNewFiles: false,            // automatically save new documents
    newFilesDirectory: path.join(app.getPath('home'), 'Documents'),
    closeToHome: true,                  // close button → landing page instead of quitting
    numberLocale: 'eu',                 // 'eu' = komma decimaal | 'us' = punt decimaal
    theme: 'system',                    // 'system' = volg OS | 'dark' | 'light'
    dismissedUpdateVersion: null,       // update version whose reminder the user dismissed
    citationAuthorDelimiter: 'semicolon', // 'semicolon' (;) | 'newline' (\n) — scheidingsteken tussen auteurs in invoerveld
    ttsRate: 1.0,                       // voorlees-snelheid 0.5–2.0
    ttsGender: 'female',                // 'female' | 'male' | 'system'
    ttsPauses: { codeBlock: 2, table: 3, image: 2, shape: 2, default: 1 }, // stilte na overgeslagen elementen (sec) — shorter for neural
    ttsEngine: 'piper',                 // 'piper' | 'webSpeech' | 'auto'
    ttsPiperVoice: 'en_US-libritts_r-medium',
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
    if (merged.citationAuthorDelimiter !== 'semicolon' && merged.citationAuthorDelimiter !== 'newline') {
        merged.citationAuthorDelimiter = 'semicolon';
    }
    // TTS settings — validate and clamp
    if (typeof merged.ttsRate !== 'number' || merged.ttsRate < 0.5 || merged.ttsRate > 2) merged.ttsRate = DEFAULT_APP_SETTINGS.ttsRate;
    if (!['female', 'male', 'system'].includes(merged.ttsGender)) merged.ttsGender = DEFAULT_APP_SETTINGS.ttsGender;
    if (!merged.ttsPauses || typeof merged.ttsPauses !== 'object') {
        merged.ttsPauses = { ...DEFAULT_APP_SETTINGS.ttsPauses };
    } else {
        const def = DEFAULT_APP_SETTINGS.ttsPauses;
        for (const k of Object.keys(def)) {
            const v = merged.ttsPauses[k];
            merged.ttsPauses[k] = (typeof v === 'number' && v >= 0 && v <= 30) ? v : def[k];
        }
    }
    if (!['piper', 'webSpeech', 'auto'].includes(merged.ttsEngine)) merged.ttsEngine = DEFAULT_APP_SETTINGS.ttsEngine;
    if (typeof merged.ttsPiperVoice !== 'string' || !PIPER_REGISTRY[merged.ttsPiperVoice]) merged.ttsPiperVoice = DEFAULT_APP_SETTINGS.ttsPiperVoice;
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

function createWindow(filePathToOpen = null, options = {}) {
    // Support createWindow({ newDocument: true }) shorthand
    if (filePathToOpen && typeof filePathToOpen === 'object' && !Array.isArray(filePathToOpen)) {
        options = filePathToOpen;
        filePathToOpen = null;
    }
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

    if (options.newDocument) {
        // Jump-list / Dock "Nieuw document": straight into a blank editor.
        // Each window already has an isolated localStorage partition, so
        // loading index.html empty is a fresh document without extra flags.
        win.loadFile(path.join(__dirname, 'app', 'index.html'));
    } else if (filePathToOpen) {
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

    // Lock Chromium's built-in page zoom — Summie has its own
    // document-only zoom (ZoomManager) so the whole window must stay at 1×.
    try { win.webContents.setVisualZoomLevelLimits(1, 1); } catch (_) { /* older Electron */ }
    try { win.webContents.setZoomFactor(1); } catch (_) {}

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
            return;
        }
        // Prevent Chromium's native zoom (Ctrl/Cmd + Plus/Minus/0 / wheel).
        // Those combos are handled by ZoomManager in the renderer — if we let
        // them through the whole window would zoom, not just the document.
        if (input.type === 'keyDown' && (input.control || input.meta) && !input.alt) {
            const k = (input.key || '').toLowerCase();
            if (k === '=' || k === '+' || k === '-' || k === '_' || k === '0' ||
                input.code === 'Equal' || input.code === 'Minus' || input.code === 'Digit0' ||
                input.code === 'NumpadAdd' || input.code === 'NumpadSubtract' || input.code === 'Numpad0') {
                event.preventDefault();
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

        // Flush any pending auto-save before checking for unsaved changes.
        // AutoSave.flush() now returns the save promise, so this await waits
        // until the write actually landed — otherwise the check below races
        // the flush and "Niet opslaan" could still let it hit disk.
        try {
            await win.webContents.executeJavaScript(`
                (async function() {
                    if (window.AutoSave) return window.AutoSave.flush();
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
function refreshUserTasks() {
    if (process.platform === 'win32') {
        app.setUserTasks([
            {
                program: process.execPath,
                arguments: '--new-document',
                iconPath: process.execPath,
                iconIndex: 0,
                title: tMain('Nieuw document'),
                description: tMain('Open een nieuw Summie document')
            },
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
    if (process.platform === 'darwin' && app.dock) {
        const { Menu } = require('electron');
        const dockMenu = Menu.buildFromTemplate([
            { label: tMain('Nieuw document'), click() { createWindow(null, { newDocument: true }); } },
            { label: tMain('Nieuw venster'), click() { createWindow(); } }
        ]);
        app.dock.setMenu(dockMenu);
    }
}

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
        refreshUserTasks();
        if (process.platform === 'darwin' && app.dock) {
            // dock menu already refreshed above
        }
    }
    // Notify all windows about any settings patch (for author delimiter live update)
    if (patch) {
        BrowserWindow.getAllWindows().forEach(win => {
            win.webContents.send('settings-changed', patch);
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
// Key = resolved absolute file path, value = true. Absent = off (default).
safeHandle('autosave-get', (event, filePath) => {
    const resolved = resolvePathArg(filePath);
    if (!resolved || !isDocPath(resolved)) return false;
    const settings = readAutoSaveSettings();
    // Read under both the resolved key and the raw key (pre-normalisation data)
    return !!(settings[resolved] || settings[filePath]);
});

safeHandle('autosave-set', (event, filePath, enabled) => {
    const resolved = resolvePathArg(filePath);
    if (!resolved || !isDocPath(resolved)) return false;
    const settings = readAutoSaveSettings();
    // Always write the resolved key; clear any legacy raw-string duplicate.
    delete settings[filePath];
    if (enabled) {
        settings[resolved] = true;
    } else {
        delete settings[resolved];
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

// Source files loadable into code blocks. The dialog offers these extensions;
// both handlers enforce the same allowlist + size cap so a compromised
// renderer can't use them as an arbitrary-file-read primitive.
const CODE_FILE_EXTENSIONS = [
    'txt', 'md', 'markdown', 'csv', 'log', 'json', 'xml', 'yml', 'yaml', 'ini',
    'cfg', 'conf', 'toml', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'css',
    'html', 'htm', 'svg', 'vue', 'svelte', 'py', 'java', 'c', 'h', 'cpp',
    'hpp', 'cs', 'php', 'rb', 'go', 'rs', 'swift', 'kt', 'sh', 'bat', 'ps1', 'sql'
];
const CODE_FILE_MAX_BYTES = 2 * 1024 * 1024;

function isReadableCodeFile(filePath) {
    const ext = path.extname(filePath).replace(/^\./, '').toLowerCase();
    if (!CODE_FILE_EXTENSIONS.includes(ext)) return false;
    try {
        return fs.statSync(filePath).size <= CODE_FILE_MAX_BYTES && fs.statSync(filePath).isFile();
    } catch {
        return false;
    }
}

// Open a source code file via dialog and return path + content
safeHandle('open-code-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: tMain('Bestand Laden in Codeblok'),
        properties: ['openFile'],
        filters: [{ name: tMain('Code bestanden'), extensions: CODE_FILE_EXTENSIONS }]
    });
    if (!result.canceled && result.filePaths.length > 0) {
        try {
            const filePath = result.filePaths[0];
            if (!isReadableCodeFile(filePath)) {
                return { success: false, error: tMain('Dit bestand kan niet als code worden geladen.') };
            }
            const content = fs.readFileSync(filePath, 'utf8');
            return { success: true, path: filePath, content };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    return { success: false, canceled: true };
});

// Re-read a source code file by path (for refresh). The path originates from
// the dialog in open-code-file — require an existing, allowlisted, size-capped
// regular file so a renderer compromise can't read arbitrary paths.
safeHandle('read-code-file', async (event, filePath) => {
    const resolved = resolvePathArg(filePath);
    if (!resolved || !isExistingRegularFile(resolved) || !isReadableCodeFile(resolved)) {
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

// ── TTS dependencies (Linux speech-dispatcher) ────────────────────────────
// Chromium's Web Speech API on Linux talks to speech-dispatcher + espeak-ng.
// On Omarchy/Arch this stack is often not pre-installed. When the renderer
// detects zero voices it calls this handler, which offers to install the
// missing packages via the system's package manager (pkexec for auth).
safeHandle('tts-check-deps', async () => {
    if (process.platform !== 'linux') return { platform: process.platform, needsInstall: false };
    const { execSync } = require('child_process');
    try { execSync('which spd-say', { stdio: 'ignore' }); return { platform: 'linux', needsInstall: false }; } catch {}
    return { platform: 'linux', needsInstall: true, detail: 'speech-dispatcher/espeak-ng ontbreekt' };
});

safeHandle('tts-install-deps', async (event) => {
    if (process.platform !== 'linux') return { success: true, skipped: true, platform: process.platform };
    const { execSync, spawn } = require('child_process');
    // Already installed? (re-check — user may have installed since the check)
    try { execSync('which spd-say', { stdio: 'ignore' }); return { success: true, alreadyInstalled: true }; } catch {}

    const hasPacman = fs.existsSync('/usr/bin/pacman');
    const hasApt = fs.existsSync('/usr/bin/apt-get');
    const hasDnf = fs.existsSync('/usr/bin/dnf');
    const hasZypper = fs.existsSync('/usr/bin/zypper');

    let cmd, args, label;
    if (hasPacman) {
        cmd = 'pkexec'; args = ['pacman', '-S', '--noconfirm', 'speech-dispatcher', 'espeak-ng'];
        label = 'pacman';
    } else if (hasApt) {
        cmd = 'pkexec'; args = ['bash', '-c', 'apt-get update && apt-get install -y speech-dispatcher espeak-ng espeak-ng-data'];
        label = 'apt';
    } else if (hasDnf) {
        cmd = 'pkexec'; args = ['dnf', 'install', '-y', 'speech-dispatcher', 'espeak-ng'];
        label = 'dnf';
    } else if (hasZypper) {
        cmd = 'pkexec'; args = ['zypper', '--non-interactive', 'install', 'speech-dispatcher', 'espeak-ng'];
        label = 'zypper';
    } else {
        return { success: false, error: 'Geen ondersteunde pakketbeheerder gevonden (pacman/apt/dnf/zypper). Installeer handmatig: speech-dispatcher espeak-ng' };
    }

    // Spawn pkexec — it shows the system auth dialog. Use spawn so we don't
    // need a timeout (per AGENTS.md: do not wrap pkexec with timeout).
    return await new Promise((resolve) => {
        let proc;
        try { proc = spawn(cmd, args, { stdio: 'ignore' }); }
        catch (err) { resolve({ success: false, error: err.message }); return; }
        proc.on('error', (err) => resolve({ success: false, error: err.message }));
        proc.on('close', (code) => {
            // pkexec: 126 = dismissed/cancelled, 127 = auth failed / not authorized
            if (code === 126 || code === 127) {
                resolve({ success: false, canceled: true, error: 'Installatie geannuleerd' });
                return;
            }
            if (code !== 0) {
                resolve({ success: false, error: `Installatie mislukt (code ${code}, ${label})` });
                return;
            }
            // Verify it actually landed
            try { execSync('which spd-say', { stdio: 'ignore' }); resolve({ success: true }); }
            catch { resolve({ success: false, error: 'Installatie leek te slagen maar spd-say is nog niet gevonden' }); }
        });
    });
});

// ── Piper neural TTS (bundled English, on-demand Dutch) ─────────────────────
function getPiperVoiceDir() {
    return path.join(app.getPath('userData'), 'piper-voices');
}
function getPiperBundledDir() {
    // In dev: app/piper-voices/, in packaged: resources/piper-voices/ (extraResources)
    const devPath = path.join(__dirname, 'piper-voices');
    if (fs.existsSync(devPath)) return devPath;
    const resPath = path.join(process.resourcesPath, 'piper-voices');
    if (fs.existsSync(resPath)) return resPath;
    return devPath;
}
function isPiperVoiceInstalled(voiceId) {
    const info = PIPER_REGISTRY[voiceId];
    if (!info) return false;
    const onnxName = info.hfFiles ? info.hfFiles.onnx : `${voiceId}.onnx`;
    const jsonName = info.hfFiles ? info.hfFiles.json : `${voiceId}.onnx.json`;
    if (info.bundled) {
        const bundledFile = path.join(getPiperBundledDir(), voiceId, onnxName);
        const bundledJson = path.join(getPiperBundledDir(), voiceId, jsonName);
        if (fs.existsSync(bundledFile) && fs.existsSync(bundledJson)) return true;
        // fallback to legacy naming
        const legacyOnnx = path.join(getPiperBundledDir(), voiceId, `${voiceId}.onnx`);
        const legacyJson = path.join(getPiperBundledDir(), voiceId, `${voiceId}.onnx.json`);
        if (fs.existsSync(legacyOnnx) && fs.existsSync(legacyJson)) return true;
    }
    const userFile = path.join(getPiperVoiceDir(), voiceId, onnxName);
    const userJson = path.join(getPiperVoiceDir(), voiceId, jsonName);
    if (fs.existsSync(userFile) && fs.existsSync(userJson)) return true;
    // legacy
    const legacyUserOnnx = path.join(getPiperVoiceDir(), voiceId, `${voiceId}.onnx`);
    const legacyUserJson = path.join(getPiperVoiceDir(), voiceId, `${voiceId}.onnx.json`);
    return fs.existsSync(legacyUserOnnx) && fs.existsSync(legacyUserJson);
}
function getPiperVoicePaths(voiceId) {
    const info = PIPER_REGISTRY[voiceId];
    if (!info) return null;
    const onnxName = info.hfFiles ? info.hfFiles.onnx : `${voiceId}.onnx`;
    const jsonName = info.hfFiles ? info.hfFiles.json : `${voiceId}.onnx.json`;
    const bundledOnnx = path.join(getPiperBundledDir(), voiceId, onnxName);
    const bundledJson = path.join(getPiperBundledDir(), voiceId, jsonName);
    if (info.bundled && fs.existsSync(bundledOnnx) && fs.existsSync(bundledJson)) {
        return { onnx: bundledOnnx, json: bundledJson, bundled: true };
    }
    const legacyBundledOnnx = path.join(getPiperBundledDir(), voiceId, `${voiceId}.onnx`);
    const legacyBundledJson = path.join(getPiperBundledDir(), voiceId, `${voiceId}.onnx.json`);
    if (info.bundled && fs.existsSync(legacyBundledOnnx) && fs.existsSync(legacyBundledJson)) {
        return { onnx: legacyBundledOnnx, json: legacyBundledJson, bundled: true };
    }
    const userOnnx = path.join(getPiperVoiceDir(), voiceId, onnxName);
    const userJson = path.join(getPiperVoiceDir(), voiceId, jsonName);
    if (fs.existsSync(userOnnx) && fs.existsSync(userJson)) {
        return { onnx: userOnnx, json: userJson, bundled: false };
    }
    const legacyUserOnnx = path.join(getPiperVoiceDir(), voiceId, `${voiceId}.onnx`);
    const legacyUserJson = path.join(getPiperVoiceDir(), voiceId, `${voiceId}.onnx.json`);
    if (fs.existsSync(legacyUserOnnx) && fs.existsSync(legacyUserJson)) {
        return { onnx: legacyUserOnnx, json: legacyUserJson, bundled: false };
    }
    return null;
}
safeHandle('piper-get-status', async () => {
    const installed = {};
    const available = {};
    for (const [id, info] of Object.entries(PIPER_REGISTRY)) {
        available[id] = { ...info, installed: isPiperVoiceInstalled(id) };
        installed[id] = isPiperVoiceInstalled(id);
    }
    return { installed, available, registry: PIPER_REGISTRY, bundledDir: getPiperBundledDir(), userDir: getPiperVoiceDir() };
});
safeHandle('piper-get-voice-paths', async (event, voiceId) => {
    const vid = voiceId || readAppSettings().ttsPiperVoice;
    const p = getPiperVoicePaths(vid);
    if (!p) return { success: false, error: 'Stem niet geïnstalleerd', voiceId: vid };
    return { success: true, voiceId: vid, ...p };
});
safeHandle('piper-download-voice', async (event, voiceId) => {
    const vid = voiceId || PIPER_GENDER_MAP.nl.female;
    const info = PIPER_REGISTRY[vid];
    if (!info) return { success: false, error: 'Onbekende stem: ' + vid };
    if (isPiperVoiceInstalled(vid)) return { success: true, alreadyInstalled: true, voiceId: vid };
    const sender = event.sender;
    const destDir = path.join(getPiperVoiceDir(), vid);
    fs.mkdirSync(destDir, { recursive: true });
    // Support custom hfRepo (e.g. OpenVoiceOS) vs default rhasspy/piper-voices
    let baseUrl, files;
    if (info.hfRepo && info.hfFiles) {
        baseUrl = `https://huggingface.co/${info.hfRepo}/resolve/main`;
        files = [info.hfFiles.onnx, info.hfFiles.json];
    } else {
        baseUrl = `https://huggingface.co/rhasspy/piper-voices/resolve/main/${info.hfPath}`;
        files = [`${vid}.onnx`, `${vid}.onnx.json`];
    }
    const https = require('https');
    const http = require('http');
    function downloadFile(url, dest) {
        return new Promise((resolve, reject) => {
            const mod = url.startsWith('https:') ? https : http;
            const req = mod.get(url, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    // Follow redirect — resolve relative locations against original URL
                    let nextUrl = res.headers.location;
                    try {
                        // If location is relative (e.g. "/api/..."), resolve against current url
                        if (!nextUrl.startsWith('http://') && !nextUrl.startsWith('https://')) {
                            nextUrl = new URL(nextUrl, url).href;
                        }
                    } catch {}
                    downloadFile(nextUrl, dest).then(resolve).catch(reject);
                    return;
                }
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                    res.resume();
                    return;
                }
                const total = parseInt(res.headers['content-length'] || '0', 10);
                let received = 0;
                const file = fs.createWriteStream(dest);
                res.on('data', (chunk) => {
                    received += chunk.length;
                    if (total && sender && !sender.isDestroyed()) {
                        const pct = Math.round((received / total) * 100);
                        try { sender.send('piper-download-progress', { voiceId: vid, file: path.basename(dest), percent: pct, received, total }); } catch {}
                    }
                });
                res.pipe(file);
                file.on('finish', () => file.close(() => resolve()));
                file.on('error', (err) => { try { fs.unlinkSync(dest); } catch {} reject(err); });
            });
            req.on('error', reject);
            req.setTimeout(30000, () => { req.destroy(new Error('Timeout')); });
        });
    }
    try {
        for (const f of files) {
            const url = `${baseUrl}/${f}`;
            const dest = path.join(destDir, f);
            // Skip if already exists (partial previous success)
            if (fs.existsSync(dest) && fs.statSync(dest).size > 1024) continue;
            if (sender && !sender.isDestroyed()) sender.send('piper-download-progress', { voiceId: vid, file: f, percent: 0 });
            await downloadFile(url, dest);
        }
        // Verify
        if (!isPiperVoiceInstalled(vid)) throw new Error('Download voltooid maar bestanden niet gevonden');
        return { success: true, voiceId: vid };
    } catch (err) {
        // Cleanup partial
        try { fs.rmSync(destDir, { recursive: true, force: true }); } catch {}
        return { success: false, error: err.message || String(err) };
    }
});
safeHandle('piper-delete-voice', async (event, voiceId) => {
    const info = PIPER_REGISTRY[voiceId];
    if (!info) return { success: false, error: 'Onbekende stem' };
    if (info.bundled) return { success: false, error: 'Gebundelde stem kan niet worden verwijderd' };
    const dir = path.join(getPiperVoiceDir(), voiceId);
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    return { success: true };
});
function getPiperBinaryPath() {
    const bundled = path.join(getPiperBundledDir(), '..', 'piper-bin', 'piper');
    // getPiperBundledDir returns piper-voices dir; piper-bin is sibling in resources
    const altBundled = path.join(process.resourcesPath || '', 'piper-bin', 'piper');
    const dev = path.join(__dirname, 'piper-bin', 'piper');
    for (const p of [dev, altBundled, bundled]) {
        try { if (fs.existsSync(p)) return p; } catch {}
    }
    // Fallback to system piper
    return 'piper';
}
safeHandle('piper-synthesize', async (event, payload) => {
    const text = payload && payload.text ? String(payload.text) : '';
    const voiceId = payload && payload.voiceId ? String(payload.voiceId) : PIPER_GENDER_MAP.nl.female;
    const rate = payload && payload.rate ? parseFloat(payload.rate) : 1.0;
    if (!text.trim()) return { success: false, error: 'Geen tekst' };
    const voicePaths = getPiperVoicePaths(voiceId);
    if (!voicePaths) return { success: false, error: 'Stem niet geïnstalleerd: ' + voiceId };
    const bin = getPiperBinaryPath();
    // Piper length_scale: >1 slower, <1 faster. Map rate (0.5-2) to length_scale
    let lengthScale = 1.0;
    if (rate < 1) lengthScale = 1.0 + (1 - rate) * 0.8;
    else if (rate > 1) lengthScale = 1.0 / rate;
    lengthScale = Math.max(0.5, Math.min(2, lengthScale));
    const piperBinDir = path.dirname(bin);
    const espeakData = path.join(piperBinDir, 'espeak-ng-data');
    const speakerId = (PIPER_REGISTRY[voiceId] && PIPER_REGISTRY[voiceId].speakerId) || 0;
    // Reduce weird pauses: piper sentence_silence 0.15 instead of default 0.2, and less length noise
    const args = ['--model', voicePaths.onnx, '--output_file', '-', '--length_scale', String(lengthScale), '--speaker', String(speakerId), '--sentence_silence', '0.12'];
    if (fs.existsSync(espeakData)) args.push('--espeak_data', espeakData);
    const { spawn } = require('child_process');
    return await new Promise((resolve) => {
        let wavBuffer = Buffer.alloc(0);
        let errBuf = '';
        const env = { ...process.env, LD_LIBRARY_PATH: [piperBinDir, process.env.LD_LIBRARY_PATH || ''].filter(Boolean).join(':') };
        let proc;
        try { proc = spawn(bin, args, { env }); } catch (e) { resolve({ success: false, error: String(e.message || e) }); return; }
        proc.stdout.on('data', (c) => { wavBuffer = Buffer.concat([wavBuffer, c]); });
        proc.stderr.on('data', (c) => { errBuf += c.toString(); });
        proc.on('error', (e) => resolve({ success: false, error: String(e.message || e) }));
        proc.on('close', (code) => {
            if (code !== 0) {
                resolve({ success: false, error: errBuf || `piper exit ${code}` });
                return;
            }
            if (!wavBuffer.length) {
                resolve({ success: false, error: 'Geen audio gegenereerd' });
                return;
            }
            // Return as base64 for IPC
            resolve({ success: true, wavBase64: wavBuffer.toString('base64'), mime: 'audio/wav' });
        });
        // Feed text via stdin
        try { proc.stdin.write(text); proc.stdin.end(); } catch (e) { resolve({ success: false, error: String(e) }); }
        setTimeout(() => { try { proc.kill('SIGTERM'); } catch {} resolve({ success: false, error: 'Timeout' }); }, 20000);
    });
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

// ==================== CITATION LOOKUP (BIBLIOGRAPHY) ====================
// Fetches publication metadata from the internet so the renderer can format
// APA 7 references automatically. Runs in the main process to avoid CORS
// restrictions on file:// pages. Sources:
//   - DOI   → Crossref works API (exact match)
//   - title → Crossref works API (bibliographic query, returns a result list)
//   - URL   → inline DOI detection first; otherwise the page's own metadata
//             (OpenGraph / citation_* / schema.org) is parsed, and when the
//             page declares a DOI (citation_doi) the Crossref record is used.
//
// Renderer-supplied URLs are user-driven fetches (the user pastes the URL),
// so like a browser it is allowed to reach any http(s) host; bounds are still
// placed on timeout and response size.

const CROSSREF_API = 'https://api.crossref.org';
const CITATION_FETCH_LIMIT_BYTES = 2 * 1024 * 1024;
const CITATION_FETCH_TIMEOUT_MS = 15000;
const CROSSREF_MAILTO = 'summie@example.invalid'; // polite pool; tells Crossref who we are

function citationNormalizeUrl(value) {
    if (typeof value !== 'string') return null;
    let url;
    try { url = new URL(value.trim()); }
    catch { return null; }
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.href;
}

// Looks for a DOI anywhere inside a string (doi.org links, "doi: 10.x", raw DOI).
function citationFindDoi(value) {
    if (typeof value !== 'string') return null;
    const cleaned = value
        .replace(/\s/g, '')
        .replace(/^doi:\s*/i, '')
        .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '');
    const m = cleaned.match(/^10\.\d{4,9}\/[^\s]+$/i);
    if (!m) return null;
    const doi = m[0].replace(/[),.;]+$/, '');
    return /^10\.\d{4,9}\/\S$/.test(doi) || doi.split('/').length > 1 ? doi : null;
}

async function citationFetchJson(url) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CITATION_FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            signal: ctrl.signal,
            redirect: 'follow',
            headers: {
                'User-Agent': 'Summie/4.2 CitationLookup (mailto:' + CROSSREF_MAILTO + ')',
                'Accept': 'application/json'
            }
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const declaredLen = parseInt(res.headers.get('content-length') || '0', 10);
        if (declaredLen > CITATION_FETCH_LIMIT_BYTES) throw new Error('Response te groot');
        const text = await res.text();
        if (text.length > CITATION_FETCH_LIMIT_BYTES) throw new Error('Response te groot');
        return JSON.parse(text);
    } finally {
        clearTimeout(timer);
    }
}

function citationGivenInitials(given) {
    if (!given) return '';
    const parts = String(given).split(/[\s\-]+/).filter(Boolean);
    return parts.map(p => (p[0] || '').toUpperCase() + '.').join(' ');
}

function citationFormatAuthor(a) {
    if (!a) return null;
    if (a.family && a.given) return a.family.trim() + ', ' + citationGivenInitials(a.given);
    if (a.family) return a.family.trim();
    if (a.name) return a.name.trim();
    return null;
}

function citationWorkYear(w) {
    const slots = [w && w.issued, w && w['published-print'], w && w['published-online'], w && w.published];
    for (const slot of slots) {
        const dp = slot && slot['date-parts'];
        if (dp && dp.length && dp[0] && dp[0][0]) return String(dp[0][0]);
    }
    if (w && w['published-print']) {
        const dp = w['published-print']['date-parts'];
        if (dp && dp.length && dp[0] && dp[0][0]) return String(dp[0][0]);
    }
    return '';
}

function citationWorkMonthDay(w) {
    const slots = [w && w.issued, w && w['published-print'], w && w['published-online']];
    for (const slot of slots) {
        const dp = slot && slot['date-parts'];
        if (dp && dp.length && dp[0] && dp[0][1]) {
            const month = String(dp[0][1]).padStart(2, '0');
            const day = dp[0][2] ? String(dp[0][2]).padStart(2, '0') : '';
            return { year: String(dp[0][0]), month, day };
        }
    }
    return null;
}

// Crossref "work" → compact, neutral citation object the renderer formats to APA.
function citationNormalizeCrossrefWork(w, sourceType, source) {
    const authors = ((w && w.author) || []).map(citationFormatAuthor).filter(Boolean);
    const editors = ((w && w.editor) || []).map(citationFormatAuthor).filter(Boolean);
    const doi = (w && w.DOI) || '';
    const title = ((w && w.title) && w.title[0]) || ((w && w.subtitle) && w.subtitle[0]) || '';
    const container = (w && w['container-title'] && w['container-title'][0]) || '';
    const yearObj = citationWorkMonthDay(w);
    return {
        kind: 'single',
        sourceType,
        source,
        crossrefType: (w && w.type) || 'other',
        title,
        authors,
        editors,
        year: yearObj ? yearObj.year : citationWorkYear(w),
        publishedDate: yearObj,
        journal: container,
        volume: (w && w.volume) || '',
        issue: (w && w.issue) || '',
        pages: (w && w.page) || (w && w['article-number']) || '',
        articleNumber: (w && w['article-number']) || '',
        publisher: (w && w.publisher) || '',
        doi,
        url: doi ? 'https://doi.org/' + doi : (w && w.URL) || '',
        website: '',
        issn: ((w && w.ISSN) || [])[0] || ''
    };
}

// Decode the common HTML entities found in page metadata (main process has no
// DOM, so DOMParser is unavailable and we resolve entities by hand).
function citationDecodeEntities(str) {
    if (!str) return '';
    const map = {
        '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
        '&apos;': "'", '&nbsp;': ' ', '&ndash;': '–', '&mdash;': '—',
        '&rsquo;': '’', '&lsquo;': '‘', '&ldquo;': '“', '&rdquo;': '”', '&hellip;': '…'
    };
    return String(str).replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos|nbsp|ndash|mdash|rsquo|lsquo|ldquo|rdquo|hellip);/gi, (m) => {
        const lower = m.toLowerCase();
        if (lower.startsWith('&#x')) return String.fromCodePoint(parseInt(lower.slice(3, -1), 16)) || m;
        if (lower.startsWith('&#')) return String.fromCodePoint(parseInt(lower.slice(2, -1), 10)) || m;
        return map[lower] !== undefined ? map[lower] : m;
    });
}

function citationCleanText(str) {
    return citationDecodeEntities(String(str || ''))
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// Read a single <meta name/property="..." content="..."> value from raw HTML.
function citationReadMeta(html, key) {
    const re = /<meta\b[^>]*>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        const tag = m[0];
        const attr = tag.match(/(?:name|property)\s*=\s*["']([^"']+)["']/i);
        if (!attr) continue;
        if (attr[1].trim().toLowerCase() !== key.toLowerCase()) continue;
        const content = tag.match(/content\s*=\s*["']([^"']*)["']/i) || tag.match(/content\s*=\s*([^\s>'"]+)/i);
        if (content) return citationCleanText(content[1]);
    }
    return null;
}

function citationReadAllMeta(html, key) {
    const out = [];
    const re = /<meta\b[^>]*>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        const tag = m[0];
        const attr = tag.match(/(?:name|property)\s*=\s*["']([^"']+)["']/i);
        if (!attr) continue;
        if (attr[1].trim().toLowerCase() !== key.toLowerCase()) continue;
        const content = tag.match(/content\s*=\s*["']([^"']*)["']/i) || tag.match(/content\s*=\s*([^\s>'"]+)/i);
        if (content) out.push(citationCleanText(content[1]));
    }
    return out;
}

// Parse an ISO-ish date ("2023-05-04", "2023", "May 4, 2023") into parts.
function citationParseDate(str) {
    if (!str) return null;
    const iso = String(str).match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
    if (iso) {
        return { year: iso[1], month: iso[2].padStart(2, '0'), day: iso[3] ? iso[3].padStart(2, '0') : '' };
    }
    const m = String(str).match(/(\d{4})/);
    return m ? { year: m[1], month: '', day: '' } : null;
}

// Human-friendly host name (no www/leading path) for "Site Name" fallback.
function citationHostname(url) {
    try { return new URL(url).hostname.replace(/^www\./i, ''); }
    catch { return ''; }
}

// The main handler — accepts { mode: 'doi'|'title'|'url', query }.
async function citationLookupHandler(payload) {
    const p = payload || {};
    const mode = p.mode;
    const query = typeof p.query === 'string' ? p.query.trim() : '';

    if (mode === 'doi') {
        const doi = citationFindDoi(query) || query;
        if (!/^10\.\d{4,9}\/\S+$/.test(doi)) {
            return { ok: false, error: 'Ongeldige DOI' };
        }
        try {
            const data = await awaitFETCH('works/' + encodeURIComponent(doi));
            const w = data && data.message;
            if (!w) return { ok: false, error: 'Niet gevonden' };
            return { ok: true, result: citationNormalizeCrossrefWork(w, 'doi', query) };
        } catch (err) {
            return { ok: false, error: err && err.message ? err.message : 'Ongeldige DOI' };
        }
    }

    if (mode === 'title') {
        try {
            const data = await awaitFETCH('works?query.bibliographic=' + encodeURIComponent(query) + '&rows=6&select=DOI,title,subtitle,author,editor,type,issued,published-print,published-online,published,container-title,volume,issue,page,article-number,publisher,URL,ISSN');
            const items = ((data && data.message && data.message.items) || [])
                .map(w => citationNormalizeCrossrefWork(w, 'title', query))
                .filter(c => c.title || c.year);
            return { ok: true, list: items };
        } catch (err) {
            return { ok: false, error: err && err.message ? err.message : 'Zoeken mislukt' };
        }
    }

    if (mode === 'url') {
        const url = citationNormalizeUrl(query);
        if (!url) return { ok: false, error: 'Ongeldige URL' };

        const inlineDoi = citationFindDoi(query);
        if (inlineDoi) {
            try {
                const data = await awaitFETCH('works/' + encodeURIComponent(inlineDoi));
                const w = data && data.message;
                if (w) return { ok: true, result: citationNormalizeCrossrefWork(w, 'url', url) };
            } catch (err) { /* fall through to page fetch */ }
        }

        try {
            const html = await fetchText(url);
            const meta = {
                title: citationReadMeta(html, 'og:title') || citationReadMeta(html, 'twitter:title') || citationPageTitle(html),
                site: citationReadMeta(html, 'og:site_name') || citationHostname(url),
                url: citationReadMeta(html, 'og:url') || url,
                doi: citationReadMeta(html, 'citation_doi') || citationReadMeta(html, 'dc.identifier') || null,
                date: citationReadMeta(html, 'citation_publication_date') ||
                    citationReadMeta(html, 'citation_date') ||
                    citationReadMeta(html, 'article:published_time') ||
                    citationReadMeta(html, 'article:modified_time') ||
                    citationReadMeta(html, 'date') || null,
                authors: citationReadAllMeta(html, 'citation_author'),
                author: citationReadMeta(html, 'author') || citationReadMeta(html, 'og:article:author') || null,
            };
            if (!meta.authors.length && meta.author) meta.authors = [meta.author];

            // A page that declares a DOI gets the full Crossref record.
            if (meta.doi) {
                const d = citationFindDoi(meta.doi);
                if (d) {
                    try {
                        const data = await awaitFETCH('works/' + encodeURIComponent(d));
                        const w = data && data.message;
                        if (w) return { ok: true, result: citationNormalizeCrossrefWork(w, 'url', url) };
                    } catch (err) { /* fall back to page metadata below */ }
                }
            }

            const date = citationParseDate(meta.date);
            return {
                ok: true,
                result: {
                    kind: 'single',
                    sourceType: 'url',
                    source: url,
                    crossrefType: 'webpage',
                    title: meta.title,
                    authors: meta.authors,
                    editors: [],
                    year: date ? date.year : '',
                    publishedDate: date,
                    journal: '',
                    volume: '',
                    issue: '',
                    pages: '',
                    articleNumber: '',
                    publisher: '',
                    doi: meta.doi ? citationFindDoi(meta.doi) || meta.doi : '',
                    url: meta.url,
                    website: meta.site,
                    issn: ''
                }
            };
        } catch (err) {
            return { ok: false, error: err && err.message ? err.message : 'Kan de pagina niet ophalen' };
        }
    }

    return { ok: false, error: 'Onbekende zoekwijze' };
}

async function awaitFETCH(path) {
    return citationFetchJson(CROSSREF_API + '/' + path + (CROSSREF_API.indexOf('?') === -1 && path.indexOf('?') === -1 ? '?mailto=' : '&mailto=') + encodeURIComponent(CROSSREF_MAILTO));
}

function citationPageTitle(html) {
    const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return m ? citationCleanText(m[1]) : '';
}

async function fetchText(url) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CITATION_FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': 'Summie/4.2 CitationLookup (mailto:' + CROSSREF_MAILTO + ')' } });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const type = res.headers.get('content-type') || '';
        if (type.indexOf('text/') === -1 && type.indexOf('html') === -1) {
            // Non-HTML (PDF etc.) → no metadata to parse
            return '';
        }
        const declaredLen = parseInt(res.headers.get('content-length') || '0', 10);
        if (declaredLen > CITATION_FETCH_LIMIT_BYTES) throw new Error('Pagina te groot');
        const text = await res.text();
        if (text.length > CITATION_FETCH_LIMIT_BYTES) throw new Error('Pagina te groot');
        return text;
    } finally {
        clearTimeout(timer);
    }
}

safeHandle('citation-lookup', async (event, payload) => {
    return citationLookupHandler(payload);
});

app.whenReady().then(() => {
    if (openNewDocumentOnStart) {
        createWindow(null, { newDocument: true });
    } else {
        createWindow(fileToOpen);
    }

    // Clean up old installer files from temp directory
    updater.cleanupOldInstallers();

    // Check for updates on startup
    updater.checkForUpdates();

    // Windows taskbar Jumplist: right-click icon → "Nieuw document" / "Nieuw venster"
    // macOS Dock menu does the same via app.dock.setMenu below.
    if (process.platform === 'win32') {
        app.setUserTasks([
            {
                program: process.execPath,
                arguments: '--new-document',
                iconPath: process.execPath,
                iconIndex: 0,
                title: tMain('Nieuw document'),
                description: tMain('Open een nieuw Summie document')
            },
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

    // macOS Dock: right-click / long-press on Dock icon
    if (process.platform === 'darwin' && app.dock) {
        const { Menu } = require('electron');
        const dockMenu = Menu.buildFromTemplate([
            {
                label: tMain('Nieuw document'),
                click() { createWindow(null, { newDocument: true }); }
            },
            {
                label: tMain('Nieuw venster'),
                click() { createWindow(); }
            }
        ]);
        app.dock.setMenu(dockMenu);
    }
});

// ==================== WINDOW CONTROLS ====================
function getFocusedWin() {
    return BrowserWindow.getFocusedWindow() || mainWindow;
}

safeOn('window-minimize', (event) => {
    const w = BrowserWindow.fromWebContents(event.sender) || getFocusedWin();
    if (w) w.minimize();
});
safeOn('window-maximize', (event) => {
    const w = BrowserWindow.fromWebContents(event.sender) || getFocusedWin();
    if (!w) return;
    if (w.isMaximized()) w.unmaximize();
    else w.maximize();
});
safeOn('window-close', (event) => {
    const w = BrowserWindow.fromWebContents(event.sender) || getFocusedWin();
    if (w) w.close();
});
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

safeOn('open-leren', async (event) => {
    const parentWin = BrowserWindow.fromWebContents(event.sender);
    let initialData = { begrippen: [], documentName: null };
    if (parentWin) {
        try {
            const data = await parentWin.webContents.executeJavaScript(`
                (function(){
                    try {
                        const b = (window.AppState && Array.isArray(window.AppState.begrippen)) ? window.AppState.begrippen : [];
                        let name = null;
                        try {
                            if (window.currentFilePath) name = window.currentFilePath.split(/[\\\\/]/).pop().replace(/\\.sumd$/i,'');
                            if (!name && window.AppState && window.AppState.currentFileName) name = window.AppState.currentFileName;
                            if (!name) {
                                const input = document.getElementById('docNameInput');
                                if (input && input.dataset && input.dataset.cleanName) name = input.dataset.cleanName;
                                else if (input && input.value) name = input.value.replace(/\\s*\\*$/,'').trim();
                            }
                            if (!name) name = (document.title || '').replace(/\\s*-\\s*Summie.*/, '').trim() || null;
                            if (name === 'Summie' || (window.appInfo && name === 'Summie v' + window.appInfo.version)) name = null;
                        } catch(e){}
                        return { begrippen: JSON.parse(JSON.stringify(b)), documentName: name };
                    } catch(e){ return { begrippen: [], documentName: null }; }
                })()
            `);
            if (data && Array.isArray(data.begrippen)) initialData = { begrippen: data.begrippen, documentName: data.documentName || null };
        } catch (e) { /* keep empty — leren window will show empty state */ }
    }
    const bounds = parentWin ? parentWin.getBounds() : { x: undefined, y: undefined, width: 1400, height: 900 };
    const lerenWin = new BrowserWindow({
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
        minWidth: 800,
        minHeight: 600,
        title: initialData.documentName ? `${initialData.documentName} — ${tMain('Begrippen Leren')}` : tMain('Begrippen Leren — Summie'),
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
    lerenWin._initialLerenData = initialData;
    lerenWin.loadFile(path.join(__dirname, 'app', 'leren', 'index.html'));
    lerenWin.once('ready-to-show', () => {
        if (parentWin && parentWin.isMaximized()) lerenWin.maximize();
        lerenWin.show();
    });
    lerenWin.setMenu(null);
    // Close handler — no unsaved changes to worry about
    lerenWin.on('close', (e) => { lerenWin.destroy(); });
});

safeHandle('leren-get-initial-data', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && win._initialLerenData) return win._initialLerenData;
    return { begrippen: [], documentName: null };
});

// Query current maximized state (used on load to sync button)
safeHandle('window-is-maximized', () => { const w = getFocusedWin(); return w ? w.isMaximized() : false; });

// Snap layout support: receive the maximize button's bounding rect from the renderer
// and hook WM_NCHITTEST so Windows reports HTMAXBUTTON over that area.
// This enables the Windows 11 snap layouts flyout on hover.
const _maximizeBtnRects = new WeakMap(); // per-window: a global rect would leak across windows
safeOn('set-maximize-btn-rect', (event, rect) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    _maximizeBtnRects.set(win, rect);
    applyNcHitTestHook(win);
});

function applyNcHitTestHook(win) {
    if (!win || process.platform !== 'win32') return;
    const WM_NCHITTEST = 0x0084;
    const HTMAXBUTTON = 9;

    win.hookWindowMessage(WM_NCHITTEST, (wParam, lParam) => {
        // This fires for every mouse move over the window — keep it cheap.
        // Only when the cursor is actually over the maximize button do we
        // force a non-client repaint; otherwise return immediately.
        const r = _maximizeBtnRects.get(win);
        if (!r) return;
        const x = lParam.readInt16LE(0);
        const y = lParam.readInt16LE(2);
        const bounds = win.getBounds();
        const clientX = x - bounds.x;
        const clientY = y - bounds.y;
        if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
            win.setEnabled(false);
            win.setEnabled(true);
            return { result: HTMAXBUTTON };
        }
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