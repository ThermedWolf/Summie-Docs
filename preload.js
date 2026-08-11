const { contextBridge, ipcRenderer } = require('electron');

// Single source of truth for the app version — same value main.js reads for the
// window title (via app.getVersion(), which reads package.json's "version").
// Fetched over sync IPC rather than require('./package.json') here, since that
// relative path breaks once the app is packaged/bundled and preload.js ends up
// in a different folder than package.json.
const APP_VERSION = ipcRenderer.sendSync('get-app-version-sync');

// Theme setting fetched synchronously so the theme can be applied before first
// paint without waiting for async IPC. Always fresh, even when navigating
// between pages within the same window.
const initialTheme = ipcRenderer.sendSync('get-theme-sync');

contextBridge.exposeInMainWorld(
    'electron',
    {
        // Listen for file loads (double-click .sumd)
        onLoadSumdFile: (callback) => {
            ipcRenderer.on('load-sumd-file', (event, data, filePath) => callback(data, filePath));
        },
        getInitialSumdFile: () => ipcRenderer.invoke('get-initial-sumd-file'),

        // Save .sumd file (existingPath = null means Save As, defaultName pre-fills dialog)
        saveSumdFile: (data, existingPath = null, defaultName = null, defaultDir = null) => ipcRenderer.invoke('save-sumd-file', data, existingPath, defaultName, defaultDir),

        // Open .sumd file via dialog
        openSumdFile: () => ipcRenderer.invoke('open-sumd-file'),
        openSumdFileAt: (defaultDir) => ipcRenderer.invoke('open-sumd-file-at', defaultDir),

        // Load specific file by path (for recent documents)
        loadSpecificFile: (filePath) => ipcRenderer.invoke('load-specific-file', filePath),
        fileExists: (filePath) => ipcRenderer.invoke('file-exists', filePath),
        getFileSize: (filePath) => ipcRenderer.invoke('get-file-size', filePath),
        renameFile: (oldPath, newPath) => ipcRenderer.invoke('rename-file', oldPath, newPath),
        showInExplorer: (filePath) => ipcRenderer.invoke('show-in-explorer', filePath),
        deleteFile: (filePath) => ipcRenderer.invoke('delete-file', filePath),
        printDocument: () => ipcRenderer.invoke('print-document'),
        saveAsPDF: () => ipcRenderer.invoke('save-as-pdf'),

        // Load a source code file into a code block (dialog + path storage for refresh)
        openCodeFile: () => ipcRenderer.invoke('open-code-file'),
        readCodeFile: (filePath) => ipcRenderer.invoke('read-code-file', filePath),

        // Window controls (frameless window)
        windowMinimize: () => ipcRenderer.send('window-minimize'),
        windowMaximize: () => ipcRenderer.send('window-maximize'),
        windowClose: () => ipcRenderer.send('window-close'),
        // Known tags
        knownTagsGet: () => ipcRenderer.invoke('known-tags-get'),
        knownTagsSave: (tags) => ipcRenderer.invoke('known-tags-save', tags),

        // .sumd metadata (description + tags)
        readSumdMeta: (filePath) => ipcRenderer.invoke('read-sumd-meta', filePath),
        writeSumdMeta: (filePath, meta) => ipcRenderer.invoke('write-sumd-meta', filePath, meta),
        scanSumdElements: (filePath) => ipcRenderer.invoke('scan-sumd-elements', filePath),
        openSumdFileByPath: (filePath) => ipcRenderer.invoke('open-sumd-file-by-path', filePath),
        readFileContent: (filePath) => ipcRenderer.invoke('read-file-content', filePath),

        navigateToLanding: () => ipcRenderer.send('navigate-to-landing'),
        navigateToManage: () => ipcRenderer.send('navigate-to-manage'),
        windowNew: () => ipcRenderer.send('window-new'),
        openLeren: () => ipcRenderer.send('open-leren'),
        windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),
        setMaximizeBtnRect: (rect) => ipcRenderer.send('set-maximize-btn-rect', rect),
        onWindowStateChanged: (callback) => ipcRenderer.on('window-state-changed', (_, state) => callback(state)),

        // Recent docs (file-based)
        recentsGet: () => ipcRenderer.invoke('recents-get'),
        recentsAdd: (entry) => ipcRenderer.invoke('recents-add', entry),
        recentsRemove: (id) => ipcRenderer.invoke('recents-remove', id),
        updateDocPath: (oldPath, newPath, newName) => ipcRenderer.invoke('update-doc-path', oldPath, newPath, newName),
        recentsSave: (docs) => ipcRenderer.invoke('recents-save', docs),
        knownDocsGet: () => ipcRenderer.invoke('known-docs-get'),
        knownDocsSave: (docs) => ipcRenderer.invoke('known-docs-save', docs),

        // Favourites
        favouritesGet: () => ipcRenderer.invoke('favourites-get'),
        favouritesSave: (favs) => ipcRenderer.invoke('favourites-save', favs),

        setWindowTitle: (documentName) => ipcRenderer.send('set-window-title', documentName),
        autoSaveGet: (filePath) => ipcRenderer.invoke('autosave-get', filePath),
        autoSaveSet: (filePath, enabled) => ipcRenderer.invoke('autosave-set', filePath, enabled),

        // App-wide settings
        settingsGet: () => ipcRenderer.invoke('settings-get'),
        settingsSet: (patch) => ipcRenderer.invoke('settings-set', patch),
        settingsPickDirectory: () => ipcRenderer.invoke('settings-pick-directory'),
        onThemeChanged: (callback) => ipcRenderer.on('theme-changed', (_, theme) => callback(theme)),

        // Platform info
        platform: process.platform,

        // App version
        version: APP_VERSION,

        // Updater
        onUpdateAvailable: (callback) => ipcRenderer.on('updater-update-available', (_, info) => callback(info)),
        onUpdateDownloaded: (callback) => ipcRenderer.on('updater-update-downloaded', (_, info) => callback(info)),
        onDownloadProgress: (callback) => ipcRenderer.on('updater-download-progress', (_, progress) => callback(progress)),
        onUpdaterError: (callback) => ipcRenderer.on('updater-error', (_, info) => callback(info)),
        downloadUpdate: () => ipcRenderer.invoke('updater-download'),
        quitAndInstall: () => ipcRenderer.invoke('updater-quit-and-install'),
        isUpdateDownloaded: () => ipcRenderer.invoke('updater-is-downloaded'),

        // Shell (for opening external links)
        shell: {
            openExternal: (url) => ipcRenderer.invoke('shell-open-external', url),
        },
    }
);

contextBridge.exposeInMainWorld(
    'appInfo',
    {
        version: APP_VERSION,
        name: 'Summie',
        isElectron: true,
        theme: initialTheme
    }
);