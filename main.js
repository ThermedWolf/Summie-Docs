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
        title: 'Summie v3.2.6',
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
            win.destroy();
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
            win.destroy();
        } else if (choice.response === 1) {
            win.destroy();
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
        win.webContents.send('load-sumd-file', data);
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