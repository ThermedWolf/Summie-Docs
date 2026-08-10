const { dialog, BrowserWindow } = require('electron');
const log = require('electron-log');
const fs = require('fs');
const path = require('path');

const REPO_OWNER = 'ThermedWolf';
const REPO_NAME = 'Summie-Docs';
const GITHUB_API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;

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
        const installerPattern = /^Summie\.Setup\.([\d.]+)\.exe$/;
        
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

function findInstallerAsset(release) {
    if (!release.assets || release.assets.length === 0) return null;
    
    // Look for Windows NSIS installer (.exe)
    const installer = release.assets.find(asset => 
        asset.name.endsWith('.exe') && asset.name.includes('Setup')
    );
    
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
        
        latestReleaseInfo = {
            version: latestVersion,
            releaseNotes: release.body || 'Geen release notes beschikbaar.',
            downloadUrl: installer.browser_download_url,
            fileName: installer.name,
            fileSize: installer.size,
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

async function downloadUpdate() {
    if (!latestReleaseInfo) {
        throw new Error('Geen update beschikbaar om te downloaden');
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
                throw new Error('Download geannuleerd');
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

async function quitAndInstall() {
    if (!latestReleaseInfo || !latestReleaseInfo.downloadedPath) {
        throw new Error('Geen gedownloade update om te installeren');
    }
    
    const { shell } = require('electron');
    const { app } = require('electron');
    
    shell.openPath(latestReleaseInfo.downloadedPath);
    
    // Give the installer time to start
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