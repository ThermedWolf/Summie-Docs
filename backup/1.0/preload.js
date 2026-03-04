const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
    'electron',
    {
        // Listen for file loads (double-click .sumd)
        onLoadSumdFile: (callback) => {
            ipcRenderer.on('load-sumd-file', (event, data) => callback(data));
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
        windowNew: () => ipcRenderer.send('window-new'),
        windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),
        setMaximizeBtnRect: (rect) => ipcRenderer.send('set-maximize-btn-rect', rect),
        onWindowStateChanged: (callback) => ipcRenderer.on('window-state-changed', (_, state) => callback(state)),

        // Platform info
        platform: process.platform,

        // App version
        version: '3.2.5'
    }
);

contextBridge.exposeInMainWorld(
    'appInfo',
    {
        version: '3.2.6',
        name: 'Summie',
        isElectron: true
    }
);