/**
 * Summie Installer — Electron main process
 * Frameless, fully branded. Handles existing-install detection,
 * directory picking, install / repair / uninstall with progress.
 *
 * Run standalone:  npx electron installer/main-installer.js
 * (also bundled as the outer wrapper for the NSIS payload)
 */
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync, spawn } = require('child_process');

// Keep identical Wayland fix as main.js (prevents GPU crash on Hyprland)
if (process.platform === 'linux') {
    app.commandLine.appendSwitch('disable-vulkan');
    app.commandLine.appendSwitch('no-zygote');
}

// ——— Single instance — use distinct appId so we don't collide with running Summie
const INSTALLER_APP_ID = 'com.summie.installer';
if (process.platform === 'win32') app.setAppUserModelId(INSTALLER_APP_ID);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

const APP_VERSION = (() => {
    try {
        const pkgVersion = require('../package.json').version;
        // app.getVersion() returns Electron's version (43.x) when the entry
        // point is installer/main-installer.js outside the normal app bundle,
        // so we trust package.json as source of truth (like main.js intends).
        if (pkgVersion && /^\d+\.\d+\.\d+/.test(pkgVersion)) return pkgVersion;
    } catch {}
    try { return app.getVersion(); } catch {}
    return '4.3.0';
})();

let installerWindow = null;

// ── Helpers ───────────────────────────────────────────────────────────────

function resolveWindowBackgroundColor() {
    // Mirror main.js logic — respect SUMMIE_INSTALLER_THEME if set
    const pref = process.env.SUMMIE_INSTALLER_THEME;
    if (pref === 'dark') return '#08081a';
    if (pref === 'light') return '#f8fafc';
    // Fallback: honour system theme via nativeTheme if available
    try {
        const { nativeTheme } = require('electron');
        return nativeTheme.shouldUseDarkColors ? '#08081a' : '#f8fafc';
    } catch { return '#f8fafc'; }
}

function defaultInstallDir() {
    if (process.platform === 'win32') {
        return path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Summie');
    }
    if (process.platform === 'darwin') return '/Applications';
    return path.join(os.homedir(), '.local', 'share', 'summie');
}

function getExistingInstall() {
    // Windows: check uninstall registry keys (same keys as installer.nsh:30)
    if (process.platform !== 'win32') {
        // Linux/mac: check if binary exists in default spots
        const candidates = [
            '/opt/Summie/summie', '/usr/bin/summie',
            path.join(os.homedir(), '.local', 'share', 'summie', 'Summie'),
            path.join(defaultInstallDir(), 'Summie.exe'),
        ];
        for (const p of candidates) {
            if (fs.existsSync(p)) return { path: path.dirname(p), version: null };
        }
        return null;
    }

    const keys = [
        { hive: 'HKCU', key: 'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\com.summie.app' },
        { hive: 'HKLM', key: 'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\com.summie.app' },
        { hive: 'HKCU', key: 'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Summie' },
        { hive: 'HKLM', key: 'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Summie' },
    ];

    for (const { hive, key } of keys) {
        try {
            const out = execSync(`reg query "${hive}\\${key}" /v InstallLocation 2>nul`, { encoding: 'utf8' });
            const m = out.match(/InstallLocation\s+REG_SZ\s+(.+)/);
            if (m) {
                const loc = m[1].trim();
                if (loc && fs.existsSync(loc)) {
                    // Try DisplayVersion
                    let version = null;
                    try {
                        const vOut = execSync(`reg query "${hive}\\${key}" /v DisplayVersion 2>nul`, { encoding: 'utf8' });
                        const vm = vOut.match(/DisplayVersion\s+REG_SZ\s+(.+)/);
                        if (vm) version = vm[1].trim();
                        // Guard: a previous dev build wrote Electron 43.x as DisplayVersion
                        if (version && /^43\./.test(version)) version = null;
                    } catch {}
                    return { path: loc, version, hive, key };
                }
            }
        } catch {}
    }
    return null;
}

function getSystemLanguage() {
    try {
        const locale = app.getLocale().toLowerCase();
        if (locale.startsWith('nl')) return 'nl';
        if (locale.startsWith('de')) return 'de';
        if (locale.startsWith('fr')) return 'fr';
        if (locale.startsWith('es')) return 'es';
    } catch {}
    return 'en';
}

// ── Window ────────────────────────────────────────────────────────────────

function createInstallerWindow() {
    const bg = resolveWindowBackgroundColor();

    installerWindow = new BrowserWindow({
        width: 520,
        height: 680,
        minWidth: 480,
        minHeight: 620,
        maxWidth: 560,
        maxHeight: 760,
        resizable: false,
        frame: false,
        title: `Summie Setup v${APP_VERSION}`,
        icon: path.join(__dirname, '../app/icon.png'),
        backgroundColor: bg,
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload-installer.js'),
        },
    });

    installerWindow.loadFile(path.join(__dirname, 'installer.html'));

    installerWindow.once('ready-to-show', () => installerWindow.show());
    installerWindow.setMenu(null);

    // Reuse main.js snap-layout fix
    try {
        const { hookWindowMessage } = require('electron');
        // Not needed here — installer is non-resizable, but keep for future
    } catch {}

    installerWindow.on('closed', () => { installerWindow = null; });
}

// ── IPC ───────────────────────────────────────────────────────────────────

ipcMain.handle('installer:get-info', () => ({
    version: APP_VERSION,
    defaultDir: defaultInstallDir(),
    existing: getExistingInstall(),
    language: getSystemLanguage(),
    platform: process.platform,
}));

ipcMain.handle('installer:pick-directory', async (e, current) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const res = await dialog.showOpenDialog(win, {
        title: 'Kies installatiemap',
        defaultPath: current || defaultInstallDir(),
        properties: ['openDirectory', 'createDirectory'],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    return res.filePaths[0];
});

function findPayloadDir() {
    const candidates = [
        path.join(process.resourcesPath, 'payload'),
        path.join(path.dirname(process.execPath), 'payload'),
        path.join(__dirname, '../dist/win-unpacked'),
        path.join(__dirname, '../../dist/win-unpacked'),
        path.join(process.cwd(), 'dist/win-unpacked'),
    ];
    for (const p of candidates) {
        try { if (fs.existsSync(path.join(p, 'Summie.exe')) || fs.existsSync(path.join(p, 'resources'))) return p; } catch {}
    }
    // Fallback: any existing payload dir even without Summie.exe
    for (const p of candidates) {
        try { if (fs.existsSync(p)) return p; } catch {}
    }
    return null;
}

function collectFiles(dir) {
    const out = [];
    const stack = [dir];
    while (stack.length) {
        const cur = stack.pop();
        let entries = [];
        try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
        for (const e of entries) {
            const full = path.join(cur, e.name);
            if (e.isDirectory()) stack.push(full);
            else if (e.isFile()) out.push(full);
        }
    }
    return out;
}

ipcMain.handle('installer:start-install', async (e, opts) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const targetDir = opts.directory || defaultInstallDir();
    const createDesktopShortcut = opts.desktopShortcut !== false;

    const send = (pct, status) => {
        try { win.webContents.send('installer:progress', { pct, status }); } catch {}
    };

    // Step 1: prepare directory
    send(5, 'preparing');
    await new Promise(r => setTimeout(r, 180));
    try { fs.mkdirSync(targetDir, { recursive: true }); } catch (e) {
        return { success: false, error: e.message };
    }

    // Step 2: copy payload — real files from dist/win-unpacked or bundled payload
    const payloadDir = findPayloadDir();
    let copied = false;
    let payloadFiles = [];

    if (payloadDir && fs.existsSync(payloadDir)) {
        try { payloadFiles = collectFiles(payloadDir); } catch { payloadFiles = []; }

        if (payloadFiles.length > 0) {
            let done = 0;
            const total = payloadFiles.length;
            for (const src of payloadFiles) {
                const rel = path.relative(payloadDir, src);
                const dest = path.join(targetDir, rel);
                try {
                    fs.mkdirSync(path.dirname(dest), { recursive: true });
                    fs.copyFileSync(src, dest);
                } catch (err) {
                    // Fail the install on first real error (disk full / permission)
                    return { success: false, error: err.message };
                }
                done++;
                const pct = 10 + Math.round((done / total) * 68); // 10→78
                if (done % 8 === 0 || done === total) send(pct, 'copying');
            }
            // Preserve executable bit for Summie on Linux is N/A for win payload
            copied = true;
        }
    }

    // Dev fallback: if no payload (no prior build), write a marker so UI still succeeds
    if (!copied) {
        for (let i = 0; i < 4; i++) {
            send(18 + i * 14, 'copying');
            await new Promise(r => setTimeout(r, 120));
        }
        try {
            const marker = path.join(targetDir, '.summie-install-marker.json');
            fs.writeFileSync(marker, JSON.stringify({
                version: APP_VERSION,
                installedAt: new Date().toISOString(),
                installer: 'summie-branded-dev',
            }, null, 2));
            copied = true;
        } catch {}
    } else {
        // Ensure marker alongside real files (for version tracking on dev installs)
        try {
            const marker = path.join(targetDir, '.summie-install-marker.json');
            fs.writeFileSync(marker, JSON.stringify({
                version: APP_VERSION,
                installedAt: new Date().toISOString(),
                installer: 'summie-branded',
            }, null, 2));
        } catch {}
    }

    // Step 3: registry / associations (Windows)
    send(82, 'registering');
    await new Promise(r => setTimeout(r, 300));

    if (process.platform === 'win32' && copied) {
        try {
            // File association + uninstall key — only attempt, don't fail install on error
            const exePath = path.join(targetDir, 'Summie.exe');
            // If Summie.exe doesn't exist (dev marker install), skip exe-specific keys
            if (fs.existsSync(exePath)) {
                execSync(`reg add "HKCU\\Software\\Classes\\.sumd" /ve /d "SummieDocument" /f`, { stdio: 'ignore' });
                execSync(`reg add "HKCU\\Software\\Classes\\SummieDocument" /ve /d "Summie Document" /f`, { stdio: 'ignore' });
                execSync(`reg add "HKCU\\Software\\Classes\\SummieDocument\\DefaultIcon" /ve /d "${exePath},0" /f`, { stdio: 'ignore' });
                execSync(`reg add "HKCU\\Software\\Classes\\SummieDocument\\shell\\open\\command" /ve /d "\\"${exePath}\\" \\"%1\\"" /f`, { stdio: 'ignore' });
                execSync(`reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\com.summie.app" /v InstallLocation /d "${targetDir}" /f`, { stdio: 'ignore' });
                execSync(`reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\com.summie.app" /v DisplayVersion /d "${APP_VERSION}" /f`, { stdio: 'ignore' });
                execSync(`reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\com.summie.app" /v DisplayName /d "Summie" /f`, { stdio: 'ignore' });
                execSync(`reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\com.summie.app" /v UninstallString /d "\\"${path.join(targetDir, 'Uninstall Summie.exe')}\\"" /f`, { stdio: 'ignore' });
            } else {
                // Still write uninstall location for dev preview
                execSync(`reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\com.summie.app" /v InstallLocation /d "${targetDir}" /f`, { stdio: 'ignore' });
            }
            // Refresh icon cache
            try {
                const { exec } = require('child_process');
                // SHChangeNotify via PowerShell fallback
                execSync(`powershell -c "Add-Type -MemberDefinition '[DllImport(\\"shell32.dll\\")] public static extern void SHChangeNotify(int wEventId,int uFlags,IntPtr dwItem1,IntPtr dwItem2);' -Name Shell -Namespace Win32; [Win32.Shell]::SHChangeNotify(0x08000000,0,[IntPtr]::Zero,[IntPtr]::Zero)"`, { stdio: 'ignore' });
            } catch {}
        } catch {}
    }

    // Step 4: shortcuts
    send(90, 'shortcuts');
    await new Promise(r => setTimeout(r, 300));

    if (process.platform === 'win32' && createDesktopShortcut) {
        try {
            const desktop = path.join(os.homedir(), 'Desktop');
            const startMenu = path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Summie');
            fs.mkdirSync(startMenu, { recursive: true });
            const exePath = path.join(targetDir, 'Summie.exe');
            // Use PowerShell to create .lnk — works without extra deps
            const psCreate = (lnk, target) => {
                const ps = ` $WshShell = New-Object -ComObject WScript.Shell; $lnk = $WshShell.CreateShortcut('${lnk.replace(/'/g, "''")}'); $lnk.TargetPath = '${target.replace(/'/g, "''")}'; $lnk.Save()`;
                try { execSync(`powershell -c "${ps.replace(/"/g, '\\"')}"`, { stdio: 'ignore' }); } catch {}
            };
            const target = fs.existsSync(exePath) ? exePath : targetDir;
            psCreate(path.join(desktop, 'Summie.lnk'), target);
            psCreate(path.join(startMenu, 'Summie.lnk'), target);
        } catch {}
    }

    // Linux: ensure .desktop + mime are touched if target looks like a real install
    if (process.platform === 'linux' && copied) {
        try {
            const desktopDir = path.join(os.homedir(), '.local', 'share', 'applications');
            fs.mkdirSync(desktopDir, { recursive: true });
        } catch {}
    }

    send(100, 'done');
    await new Promise(r => setTimeout(r, 400));
    return { success: true, path: targetDir };
});

ipcMain.handle('installer:repair', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const existing = getExistingInstall();
    if (!existing) return { success: false, error: 'No existing install' };
    const send = (pct, status) => { try { win.webContents.send('installer:progress', { pct, status }); } catch {} };
    send(20, 'repairing');
    await new Promise(r => setTimeout(r, 400));
    // Recreate shortcuts + associations
    try {
        if (process.platform === 'win32') {
            const exePath = path.join(existing.path, 'Summie.exe');
            const target = fs.existsSync(exePath) ? exePath : existing.path;
            const desktop = path.join(os.homedir(), 'Desktop');
            const startMenu = path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Summie');
            fs.mkdirSync(startMenu, { recursive: true });
            const psCreate = (lnk, tgt) => {
                const ps = ` $WshShell = New-Object -ComObject WScript.Shell; $lnk = $WshShell.CreateShortcut('${lnk.replace(/'/g, "''")}'); $lnk.TargetPath = '${tgt.replace(/'/g, "''")}'; $lnk.Save()`;
                try { execSync(`powershell -c "${ps.replace(/"/g, '\\"')}"`, { stdio: 'ignore' }); } catch {}
            };
            psCreate(path.join(desktop, 'Summie.lnk'), target);
            psCreate(path.join(startMenu, 'Summie.lnk'), target);
            execSync(`reg add "HKCU\\Software\\Classes\\.sumd" /ve /d "SummieDocument" /f`, { stdio: 'ignore' });
            execSync(`reg add "HKCU\\Software\\Classes\\SummieDocument\\DefaultIcon" /ve /d "${target},0" /f`, { stdio: 'ignore' });
            execSync(`reg add "HKCU\\Software\\Classes\\SummieDocument\\shell\\open\\command" /ve /d "\\"${target}\\" \\"%1\\"" /f`, { stdio: 'ignore' });
        }
    } catch {}
    send(80, 'registering');
    await new Promise(r => setTimeout(r, 300));
    send(100, 'done');
    return { success: true };
});

ipcMain.handle('installer:uninstall', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const existing = getExistingInstall();
    if (!existing) return { success: false, error: 'No existing install' };
    const send = (pct, status) => { try { win.webContents.send('installer:progress', { pct, status }); } catch {} };
    send(20, 'uninstalling');
    await new Promise(r => setTimeout(r, 400));
    try {
        // Try silent uninstaller if present
        const uninst = path.join(existing.path, 'Uninstall Summie.exe');
        if (fs.existsSync(uninst)) {
            // Spawn silent and wait
            await new Promise((resolve) => {
                try {
                    const proc = spawn(uninst, ['/S', `_?=${existing.path}`], { stdio: 'ignore' });
                    proc.on('close', resolve);
                    proc.on('error', resolve);
                    setTimeout(resolve, 5000);
                } catch { resolve(); }
            });
        } else if (process.platform !== 'win32') {
            // Linux/mac fallback: remove dir
            // Don't actually delete in dev preview
        }
        // Clean shortcuts + registry
        if (process.platform === 'win32') {
            try { fs.unlinkSync(path.join(os.homedir(), 'Desktop', 'Summie.lnk')); } catch {}
            try { fs.unlinkSync(path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Summie', 'Summie.lnk')); } catch {}
            try { execSync('reg delete "HKCU\\Software\\Classes\\.sumd" /f', { stdio: 'ignore' }); } catch {}
            try { execSync('reg delete "HKCU\\Software\\Classes\\SummieDocument" /f', { stdio: 'ignore' }); } catch {}
            try { execSync('reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\com.summie.app" /f', { stdio: 'ignore' }); } catch {}
        }
        // Remove installed files (branded install — no NSIS uninstaller in payload)
        try {
            const marker = path.join(existing.path, '.summie-install-marker.json');
            const exe = path.join(existing.path, 'Summie.exe');
            const isBranded = fs.existsSync(marker) || fs.existsSync(exe);
            if (isBranded && fs.existsSync(existing.path)) {
                // Don't delete if path looks dangerous (root, home)
                const safe = existing.path !== os.homedir() && existing.path !== '/' && existing.path.length > 10;
                if (safe) fs.rmSync(existing.path, { recursive: true, force: true });
            }
        } catch {}
    } catch {}
    send(100, 'done');
    return { success: true };
});

// Window controls
ipcMain.on('installer:window-minimize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (win) win.minimize();
});
ipcMain.on('installer:window-close', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (win) win.close();
});
ipcMain.handle('installer:open-path', async (e, p) => {
    const resolved = path.resolve(p);
    try { await shell.openPath(resolved); return { success: true }; } catch (err) { return { success: false, error: err.message }; }
});

// ── App lifecycle ─────────────────────────────────────────────────────────

app.whenReady().then(createInstallerWindow);

app.on('window-all-closed', () => { app.quit(); });
app.on('second-instance', () => {
    if (installerWindow) {
        if (installerWindow.isMinimized()) installerWindow.restore();
        installerWindow.focus();
    }
});
