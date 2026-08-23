const { dialog, BrowserWindow } = require('electron');
const log = require('electron-log');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const crypto = require('crypto');
const execFileAsync = promisify(execFile);

const REPO_OWNER = 'ThermedWolf';
const REPO_NAME = 'Summie-Docs';
const GITHUB_API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;

const EN_DICT = require('./app/js/i18n/en.js');
const { app } = require('electron');
const path2 = require('path');
const fs2 = require('fs');
const appSettingsPath = path2.join(app.getPath('userData'), 'app-settings.json');

// Translate a user-facing string (updater errors/release notes fallback).
function tUpdater(str) {
    let lang = 'nl';
    try {
        const raw = JSON.parse(fs2.readFileSync(appSettingsPath, 'utf8'));
        lang = raw.language || 'nl';
    } catch (e) { /* defaults */ }
    if (lang !== 'en') return str;
    const hit = EN_DICT && EN_DICT[str];
    return hit !== undefined && hit !== null ? hit : str;
}

// Version the user explicitly asked not to be reminded about ("don't ask
// again for this update"). Stored in app-settings.json so it survives
// restarts; it only suppresses this exact update version.
function readDismissedUpdateVersion() {
    try {
        const raw = JSON.parse(fs2.readFileSync(appSettingsPath, 'utf8'));
        const value = raw && raw.dismissedUpdateVersion;
        return typeof value === 'string' && value ? value : null;
    } catch (e) {
        return null;
    }
}

let updateCheckInProgress = false;
let latestReleaseInfo = null;

function getCurrentVersion() {
    const { app } = require('electron');
    return app.getVersion();
}

function cleanupOldInstallers() {
    try {
        const { app } = require('electron');
        const tempDir = app.getPath('temp');
        const currentVersion = getCurrentVersion();
        
        const files = fs.readdirSync(tempDir);
        const installerPattern = /^Summie-windows-x64-([\d.]+)\.exe$/;
        
        for (const file of files) {
            const match = file.match(installerPattern);
            if (match) {
                const fileVersion = match[1];
                if (fileVersion !== currentVersion) {
                    const filePath = path.join(tempDir, file);
                    try {
                        fs.unlinkSync(filePath);
                        log.info(`Cleaned up old installer: ${file}`);
                    } catch (err) {
                        // File might be in use, ignore
                    }
                }
            }
        }
    } catch (err) {
        // Ignore cleanup errors
    }
}

function compareVersions(current, latest) {
    const currentParts = current.split('.').map(Number);
    const latestParts = latest.split('.').map(Number);
    
    for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
        const currentPart = currentParts[i] || 0;
        const latestPart = latestParts[i] || 0;
        if (latestPart > currentPart) return -1;  // latest is newer
        if (latestPart < currentPart) return 1;   // current is newer
    }
    return 0; // equal
}

function showUpdateAvailableDialog(info) {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (!focusedWindow) return;

    focusedWindow.webContents.send('updater-update-available', info);
}

function showUpdateDownloadedDialog(version) {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (!focusedWindow) return;

    focusedWindow.webContents.send('updater-update-downloaded', { version });
}

function showErrorDialog(error) {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (!focusedWindow) return;

    focusedWindow.webContents.send('updater-error', { error: error.message });
}

function showDownloadProgress(progress) {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (!focusedWindow) return;

    focusedWindow.webContents.send('updater-download-progress', progress);
}

async function fetchLatestRelease() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(GITHUB_API_URL, {
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'Summie-Updater'
            },
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (err) {
        log.error('Failed to fetch latest release:', err);
        throw err;
    }
}

function getPlatform() {
    return process.platform;
}

function getArch() {
    return process.arch;
}

function isArm64() {
    return process.arch === 'arm64';
}

function getInstallerPattern() {
    const platform = getPlatform();
    
    if (platform === 'win32') {
        return /^Summie-windows-x64-[\d.]+\.exe$/;
    }
    
    if (platform === 'darwin') {
        const arch = isArm64() ? 'arm64' : 'x64';
        return new RegExp(`^Summie-mac-${arch}-[\\d.]+\\.dmg$`);
    }
    
    if (platform === 'linux') {
        return /^Summie-linux-.*\.(AppImage|deb)$/;
    }
    
    return null;
}

function findInstallerAsset(release) {
    if (!release.assets || release.assets.length === 0) return null;
    
    const pattern = getInstallerPattern();
    if (!pattern) return null;
    
    const installer = release.assets.find(asset => pattern.test(asset.name));
    return installer || null;
}

async function checkForUpdates() {
    if (updateCheckInProgress) return;
    updateCheckInProgress = true;

    try {
        const release = await fetchLatestRelease();
        
        const currentVersion = getCurrentVersion();
        const latestVersion = release.tag_name.replace(/^v/, '');
        
        const comparison = compareVersions(currentVersion, latestVersion);
        
        if (comparison >= 0) {
            return;
        }
        
        const installer = findInstallerAsset(release);
        if (!installer) {
            log.warn('No installer asset found in release');
            return;
        }

        const dismissedVersion = readDismissedUpdateVersion();
        if (dismissedVersion && dismissedVersion === latestVersion) {
            log.info(`Update reminder for v${latestVersion} suppressed (dismissed by user)`);
            return;
        }

        latestReleaseInfo = {
            version: latestVersion,
            releaseNotes: release.body || tUpdater('Geen release notes beschikbaar.'),
            downloadUrl: installer.browser_download_url,
            fileName: installer.name,
            fileSize: installer.size,
            sha256: installer.digest,
            publishedAt: release.published_at,
            html_url: release.html_url
        };
        
        showUpdateAvailableDialog(latestReleaseInfo);
        
    } catch (err) {
        log.error('Failed to check for updates:', err);
        showErrorDialog(err);
    } finally {
        updateCheckInProgress = false;
    }
}

let downloadAborted = false;
let downloadProgress = 0;

function computeSha256Hex(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('error', reject);
        stream.on('data', chunk => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
    });
}

function normalizeExpectedDigest(digest) {
    let value = String(digest || '').trim().toLowerCase();
    const prefix = 'sha256:';
    if (value.startsWith(prefix)) {
        value = value.slice(prefix.length);
    }
    return value;
}

async function verifyInstallerHash(filePath, expectedDigest) {
    // Fail CLOSED: an installer whose integrity cannot be verified must never
    // run. Digest presence depends on how the release was published — treat a
    // missing digest as a hard error, not as "skip the check".
    const expectedHex = normalizeExpectedDigest(expectedDigest);
    if (!expectedHex) {
        log.error('No SHA-256 digest available for installer; refusing to install');
        throw new Error(tUpdater('Hash-verificatie mislukt: de gedownloade installer is gewijzigd of beschadigd. Update geannuleerd.'));
    }

    const computedHex = await computeSha256Hex(filePath);

    if (computedHex !== expectedHex) {
        try {
            fs.unlinkSync(filePath);
        } catch (e) { /* best effort */ }
        log.error(`Installer hash verification failed: expected ${expectedHex}, got ${computedHex}`);
        throw new Error(tUpdater('Hash-verificatie mislukt: de gedownloade installer is gewijzigd of beschadigd. Update geannuleerd.'));
    }

    log.info('Installer SHA-256 hash verified successfully');
}

async function downloadUpdate() {
    if (!latestReleaseInfo) {
        throw new Error(tUpdater('Geen update beschikbaar om te downloaden'));
    }
    
    downloadAborted = false;
    downloadProgress = 0;
    
    try {
        const { shell } = require('electron');
        const { app } = require('electron');
        const fs = require('fs');
        const path = require('path');
        
        const downloadDir = app.getPath('temp');
        const filePath = path.join(downloadDir, latestReleaseInfo.fileName);
        
        const response = await fetch(latestReleaseInfo.downloadUrl);
        
        if (!response.ok) {
            throw new Error(`Download failed: ${response.status}`);
        }
        
        const totalSize = parseInt(response.headers.get('content-length') || '0', 10);
        let downloadedSize = 0;
        
        const fileStream = fs.createWriteStream(filePath);
        
        const reader = response.body.getReader();
        
        while (true) {
            if (downloadAborted) {
                fileStream.close();
                fs.unlinkSync(filePath);
                throw new Error(tUpdater('Download geannuleerd'));
            }
            
            const { done, value } = await reader.read();
            
            if (done) break;
            
            fileStream.write(Buffer.from(value));
            downloadedSize += value.length;
            
            if (totalSize > 0) {
                const percent = (downloadedSize / totalSize) * 100;
                if (Math.abs(percent - downloadProgress) > 0.5) {
                    downloadProgress = percent;
                    showDownloadProgress({ percent, downloadedSize, totalSize });
                }
            }
        }
        
        fileStream.end();
        
        await new Promise((resolve, reject) => {
            fileStream.on('finish', resolve);
            fileStream.on('error', reject);
        });
        
        await verifyInstallerHash(filePath, latestReleaseInfo.sha256);
        
        showDownloadProgress({ percent: 100, downloadedSize: totalSize, totalSize });
        showUpdateDownloadedDialog(latestReleaseInfo.version);
        
        // Store the downloaded file path for installation
        latestReleaseInfo.downloadedPath = filePath;
        
    } catch (err) {
        log.error('Failed to download update:', err);
        showErrorDialog(err);
        throw err;
    }
}

function cancelDownload() {
    downloadAborted = true;
}

async function installMacUpdate(filePath) {
    const mountPoint = fs.mkdtempSync(path.join(os.tmpdir(), 'summie-mount-'));
    try {
        await execFileAsync('hdiutil', ['attach', filePath, '-nobrowse', '-readonly', '-mountpoint', mountPoint]);
        
        const entries = fs.readdirSync(mountPoint);
        const appName = entries.find(name => name.endsWith('.app'));
        if (!appName) {
            throw new Error(tUpdater('Geen .app gevonden in de DMG'));
        }
        
        const sourceApp = path.join(mountPoint, appName);
        const destApp = path.join('/Applications', appName);
        
        if (fs.existsSync(destApp)) {
            await execFileAsync('rm', ['-rf', destApp]);
        }
        await execFileAsync('ditto', [sourceApp, destApp]);
        
        try {
            await execFileAsync('xattr', ['-dr', 'com.apple.quarantine', destApp]);
        } catch (err) {
            log.warn('Could not clear quarantine attribute:', err.message);
        }
        
        return destApp;
    } finally {
        try {
            await execFileAsync('hdiutil', ['detach', mountPoint, '-quiet']);
        } catch (err) {
            log.warn('Could not detach DMG:', err.message);
        }
    }
}

async function installLinuxUpdate(filePath, isDeb) {
    if (isDeb) {
        const pkexec = await execFileAsync('which', ['pkexec']).catch(() => ({ stdout: '' }));
        if (pkexec.stdout.trim()) {
            await execFileAsync('pkexec', ['dpkg', '-i', filePath]);
        } else {
            const sudo = await execFileAsync('which', ['sudo']).catch(() => ({ stdout: '' }));
            if (sudo.stdout.trim()) {
                await execFileAsync('sudo', ['dpkg', '-i', filePath]);
            } else {
                return filePath;
            }
        }
        return null;
    }
    
    try {
        await execFileAsync('chmod', ['+x', filePath]);
    } catch (err) {
        log.warn('Could not set executable bit:', err.message);
    }
    return filePath;
}

async function quitAndInstall() {
    if (!latestReleaseInfo || !latestReleaseInfo.downloadedPath) {
        throw new Error(tUpdater('Geen gedownloade update om te installeren'));
    }
    
    const { shell } = require('electron');
    const { app } = require('electron');
    
    const platform = getPlatform();
    const downloadedPath = latestReleaseInfo.downloadedPath;
    const fileName = latestReleaseInfo.fileName;
    
    if (platform === 'darwin') {
        const installedApp = await installMacUpdate(downloadedPath);
        if (installedApp) {
            shell.openPath(installedApp);
        }
    } else if (platform === 'linux') {
        const runPath = await installLinuxUpdate(downloadedPath, fileName.endsWith('.deb'));
        if (runPath) {
            shell.openPath(runPath);
        }
    } else {
        shell.openPath(downloadedPath);
    }
    
    setTimeout(() => {
        app.quit();
    }, 1000);
}

function isUpdateDownloaded() {
    return latestReleaseInfo && latestReleaseInfo.downloadedPath;
}

function getLatestReleaseInfo() {
    return latestReleaseInfo;
}

module.exports = {
    checkForUpdates,
    downloadUpdate,
    cancelDownload,
    quitAndInstall,
    isUpdateDownloaded,
    getLatestReleaseInfo,
    cleanupOldInstallers,
};