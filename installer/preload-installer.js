const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('installerAPI', {
    getInfo: () => ipcRenderer.invoke('installer:get-info'),
    pickDirectory: (current) => ipcRenderer.invoke('installer:pick-directory', current),
    startInstall: (opts) => ipcRenderer.invoke('installer:start-install', opts),
    repair: () => ipcRenderer.invoke('installer:repair'),
    uninstall: () => ipcRenderer.invoke('installer:uninstall'),
    openPath: (p) => ipcRenderer.invoke('installer:open-path', p),
    onProgress: (cb) => {
        const handler = (_e, data) => cb(data);
        ipcRenderer.on('installer:progress', handler);
        return () => ipcRenderer.removeListener('installer:progress', handler);
    },
    minimize: () => ipcRenderer.send('installer:window-minimize'),
    close: () => ipcRenderer.send('installer:window-close'),
});
