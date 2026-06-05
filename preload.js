const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
    'electron',
    {
        // Listen for file loads (double-click .sumd)
        onLoadSumdFile: (callback) => {
            ipcRenderer.on('load-sumd-file', (event, data, filePath) => callback(data, filePath));
        },

        // Save .sumd file (existingPath = null means Save As, defaultName pre-fills dialog)
        saveSumdFile: (data, existingPath = null, defaultName = null) => ipcRenderer.invoke('save-sumd-file', data, existingPath, defaultName),

        // Open .sumd file via dialog
        openSumdFile: () => ipcRenderer.invoke('open-sumd-file'),

        // Load specific file by path (for recent documents)
        loadSpecificFile: (filePath) => ipcRenderer.invoke('load-specific-file', filePath),
        fileExists: (filePath) => ipcRenderer.invoke('file-exists', filePath),
        renameFile: (oldPath, newPath) => ipcRenderer.invoke('rename-file', oldPath, newPath),
        showInExplorer: (filePath) => ipcRenderer.invoke('show-in-explorer', filePath),
        deleteFile: (filePath) => ipcRenderer.invoke('delete-file', filePath),

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

        // Platform info
        platform: process.platform,

        // App version
        version: '4.0.0'
    }
);

contextBridge.exposeInMainWorld(
    'appInfo',
    {
        version: '4.0.0',
        name: 'Summie',
        isElectron: true
    }
);
