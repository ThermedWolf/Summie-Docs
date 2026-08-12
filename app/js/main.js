// ==================== MAIN BOOTSTRAP ====================
// Initialises all modules in dependency order.
// No logic lives here — only orchestration.

document.addEventListener('DOMContentLoaded', async () => {
    const state = window.AppState;

    // Initialize updater
    initUpdater();

    // 1. Resolve DOM references
    state.initRefs();

    // 1b. Init page manager early so it's ready before data is loaded
    window.PageManager && window.PageManager.init();

    // 2. Decide what to load
    const isNewDoc = localStorage.getItem('summie_new_document');
    if (isNewDoc) {
        localStorage.removeItem('summie_new_document');
        localStorage.removeItem('summaryData');
        localStorage.removeItem('summie_current_file_path');
    }

    const initialOpen = window.electron?.getInitialSumdFile
        ? await window.electron.getInitialSumdFile()
        : null;
    const pendingLoadRaw = initialOpen
        ? JSON.stringify({ data: initialOpen.data, path: initialOpen.path })
        : localStorage.getItem('summie_pending_load');

    if (pendingLoadRaw) {
        localStorage.removeItem('summie_pending_load');
        try {
            const pending = JSON.parse(pendingLoadRaw);
            if (pending.data) {
                // Set the active file path synchronously, right away, so it can never be
                // shadowed by the localStorage fallback below (step 3) or raced by anything
                // else that runs before the deferred load finishes.
                if (pending.path) {
                    window.currentFilePath = pending.path;
                    localStorage.setItem('summie_current_file_path', pending.path);
                }
                setTimeout(async () => {
                    let pendingData = pending.data;
                    if (window.DocumentProtection) {
                        pendingData = await window.DocumentProtection.openData(pendingData);
                        if (!pendingData) return;
                    }
                    applyLoadedData(pendingData);
                    if (pending.path) {
                        window.updateWindowTitle && window.updateWindowTitle(pending.path);
                        window.AutoSave && window.AutoSave.onFileChanged();
                        window.updateFileSize && window.updateFileSize();
                    }
                    const _clean = window.getCleanEditorContent ? window.getCleanEditorContent(state.editor) : state.editor.innerHTML;
                    state.lastSavedContent = _clean;
                    state.lastSavedBegrippen = JSON.stringify(state.begrippen);
                    state.lastSavedProtection = window.DocumentProtection?.isProtected?.() || false;
                    localStorage.setItem('summie_saved_content', _clean);
                    window.updateDocNameInput && window.updateDocNameInput();
                }, 100);
            }
        } catch (e) {
            console.error('Error loading pending file:', e);
            await loadFromLocalStorage();
        }
    } else {
        await loadFromLocalStorage();
    }

    // 3. Restore current file path
    if (!window.currentFilePath) {
        const storedPath = localStorage.getItem('summie_current_file_path');
        if (storedPath) {
            window.currentFilePath = storedPath;
            setTimeout(() => window.updateFileSize && window.updateFileSize(), 150);
        }
    }
    window.updateWindowTitle && window.updateWindowTitle(window.currentFilePath || null);

    // 4. Wire up all event listeners
    setupEventListeners();
    setupPlaceholderBehavior();
    setupScrollTracking();

    // 5. Populate UI
    window.initStyles && window.initStyles();
    updateBegrippenList();
    // Default to 'inhoud' tab; switch to 'begrippen' only if the doc has begrippen
    setTimeout(() => {
        const hasBegrippen = window.AppState.begrippen && window.AppState.begrippen.length > 0;
        window.switchTab && window.switchTab(hasBegrippen ? 'begrippen' : 'inhoud');
    }, 150);
    updateInhoudList();
    updateActiveInhoudItem();
    updateWordCounter();
    window.updateBegrippenCounter && window.updateBegrippenCounter();

    // 6. Start auto-save
    setupAutoSave();

    // 7. Baseline for unsaved-changes detection
    setTimeout(() => {
        state.lastSavedContent = state.editor.innerHTML;
        state.lastSavedBegrippen = JSON.stringify(state.begrippen);
        state.lastSavedProtection = window.DocumentProtection?.isProtected?.() || false;
    }, 500);

    // 8. Init References & Tables
    setTimeout(() => {
        if (window.ReferencesManager) window.ReferencesManager.init();
        if (window.TableManager) window.TableManager.init();
        _initReferenceButton();
        _initViewReferencesBtn();
    }, 200);

    // 9. Init Tab Ruler, Header/Footer, Margin Click
    setTimeout(() => {
        if (window.TabRuler) window.TabRuler.init();
        if (window.HeaderFooter) window.HeaderFooter.init();
        if (window.MarginClick) window.MarginClick.init();
    }, 300);
});

function _initReferenceButton() {
    const btn = document.getElementById('insertReferenceBtn');
    if (btn) {
        btn.addEventListener('click', () => {
            openReferenceModal(null, null);
        });
    }
}

function _initViewReferencesBtn() {
    const btn = document.getElementById('viewReferencesBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
        // Close the bestand sidebar
        if (window.topbarManager) window.topbarManager.switchSection('bewerken');

        // Add references tab to sidebar (if not already)
        _ensureReferencesTab(true);
    });
}

function _ensureReferencesTab(activate) {
    const tabs = document.querySelector('.tabs');
    const tabContent = document.querySelector('.tab-content');
    if (!tabs || !tabContent) return;

    let refTab = tabs.querySelector('[data-tab="references"]');
    if (!refTab) {
        refTab = document.createElement('button');
        refTab.className = 'tab';
        refTab.dataset.tab = 'references';
        refTab.textContent = SummieI18n.t('Verwijzingen');
        tabs.appendChild(refTab);

        refTab.addEventListener('click', () => {
            _switchToTab('references');
        });
    }

    // Show the references panel
    const refPanel = document.getElementById('references-panel');
    if (refPanel) refPanel.style.display = '';

    if (activate) {
        _switchToTab('references');
    }

    // Listen for tab deactivation to remove the tab
    document.querySelectorAll('.tab:not([data-tab="references"])').forEach(t => {
        t.addEventListener('click', _onOtherTabClick);
    });
}

function _onOtherTabClick() {
    // Remove references tab when another tab is made active
    setTimeout(() => {
        const activeTab = document.querySelector('.tab.active');
        if (!activeTab || activeTab.dataset.tab !== 'references') {
            _removeReferencesTab();
        }
    }, 50);
}

function _removeReferencesTab() {
    const tabs = document.querySelector('.tabs');
    const refTab = tabs && tabs.querySelector('[data-tab="references"]');
    if (refTab) refTab.remove();
    const refPanel = document.getElementById('references-panel');
    if (refPanel) refPanel.style.display = 'none';
}

function _switchToTab(tabName) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
    document.querySelectorAll('.tab-panel').forEach(p => {
        if (p.id === 'references-panel') {
            p.classList.toggle('active', tabName === 'references');
        } else {
            p.classList.toggle('active', p.id === tabName + '-panel' && tabName !== 'references');
        }
    });
    if (tabName === 'references' && window.ReferencesManager) {
        const list = document.getElementById('referencesList');
        if (list) window.ReferencesManager.renderReferencesList(list);
    }
}

// ==================== IPC: OPEN FILE VIA DOUBLE-CLICK ====================
// main.js (Electron) sends 'load-sumd-file' when the user double-clicks a
// .sumd file in Explorer. We listen here and load it directly into the editor,
// bypassing localStorage so the correct file is always shown.
if (window.electron && window.electron.onLoadSumdFile) {
    window.electron.onLoadSumdFile(async (data, filePath) => {
        if (!data) return;
        if (window.DocumentProtection) {
            data = await window.DocumentProtection.openData(data);
            if (!data) return;
        }
        applyLoadedData(data);
        if (filePath) {
            window.currentFilePath = filePath;
            localStorage.setItem('summie_current_file_path', filePath);
            window.updateWindowTitle && window.updateWindowTitle(filePath);
            window.AutoSave && window.AutoSave.onFileChanged();
            window.updateFileSize && window.updateFileSize();
        }
        const state = window.AppState;
        state.lastSavedContent = state.editor.innerHTML;
        state.lastSavedBegrippen = JSON.stringify(state.begrippen);
        state.lastSavedProtection = window.DocumentProtection?.isProtected?.() || false;
        localStorage.setItem('summie_saved_content', state.editor.innerHTML);
    });
}

// ==================== UPDATER ====================

function initUpdater() {
    if (!window.electron) return;

    const modal = document.getElementById('updateModal');
    const currentVersionEl = document.getElementById('updateCurrentVersion');
    const latestVersionEl = document.getElementById('updateLatestVersion');
    const versionCompare = document.getElementById('updateVersionCompare');
    const progressContainer = document.getElementById('updateProgress');
    const progressText = document.getElementById('updateProgressText');
    const progressPercent = document.getElementById('updateProgressPercent');
    const progressTrack = document.getElementById('updateProgressTrack');
    const progressBar = document.getElementById('updateProgressBar');
    const downloadBtn = document.getElementById('updateDownloadBtn');
    const downloadBtnText = document.getElementById('updateDownloadBtnText');
    const installBtn = document.getElementById('updateInstallBtn');
    const dismissBtn = document.getElementById('updateDismissBtn');
    const changelogBtn = document.getElementById('updateChangelogBtn');

    if (!modal) return;

    let updateInfo = null;

    function showModal(info) {
        updateInfo = info;
        currentVersionEl.textContent = `v${window.appInfo?.version || '?'}`;
        latestVersionEl.textContent = `v${info.version}`;
        versionCompare.style.display = 'flex';
        progressContainer.style.display = 'none';
        progressTrack.classList.remove('is-indeterminate');
        progressPercent.textContent = '';
        progressBar.style.width = '0%';
        downloadBtn.style.display = 'inline-flex';
        downloadBtn.disabled = false;
        downloadBtnText.textContent = t('Downloaden');
        installBtn.style.display = 'none';
        dismissBtn.textContent = t('Later');
        dismissBtn.disabled = false;
        changelogBtn.style.display = 'inline-flex';
        modal.classList.add('active');
    }

    function hideModal() {
        modal.classList.remove('active');
        updateInfo = null;
    }

    // Shows the progress card in place of the version-compare row. These are
    // siblings inside #updateModalContent, so only the version-compare row
    // gets hidden here — the progress card (and its loader bar) stays visible.
    function showProgress(message, indeterminate = false) {
        versionCompare.style.display = 'none';
        progressContainer.style.display = 'block';
        progressText.textContent = message;
        if (indeterminate) {
            progressTrack.classList.add('is-indeterminate');
            progressPercent.textContent = '';
            progressBar.style.width = '0%';
        } else {
            progressTrack.classList.remove('is-indeterminate');
        }
    }

    function updateProgress(percent) {
        progressTrack.classList.remove('is-indeterminate');
        const rounded = Math.round(percent);
        progressBar.style.width = `${rounded}%`;
        progressPercent.textContent = `${rounded}%`;
    }

    // Fallback screen — only used if the automatic install (after download
    // completes) fails, so the person still has a way to trigger it manually.
    function showInstallButton() {
        showProgress(t('Update gedownload'), false);
        progressTrack.classList.remove('is-indeterminate');
        downloadBtn.style.display = 'none';
        installBtn.style.display = 'inline-flex';
        installBtn.disabled = false;
        installBtn.querySelector('span').textContent = t('Installeren en herstarten');
        dismissBtn.textContent = t('Annuleren');
        dismissBtn.disabled = false;
        changelogBtn.style.display = 'none';
    }

    window.electron.onUpdateAvailable((info) => {
        if (!modal.classList.contains('active')) {
            showModal(info);
        }
    });

    window.electron.onDownloadProgress((progress) => {
        if (progress && typeof progress.percent === 'number') {
            showProgress(t('Downloaden van update...'));
            updateProgress(progress.percent);
        }
    });

    // Download finished: no extra confirmation screen — move straight to
    // installing so the person doesn't have to click through it twice.
    window.electron.onUpdateDownloaded((info) => {
        changelogBtn.style.display = 'none';
        downloadBtn.style.display = 'none';
        dismissBtn.disabled = true;
        showProgress(t('Update gedownload — Summie herstart zo...'), false);
        updateProgress(100);

        setTimeout(async () => {
            try {
                await window.electron.quitAndInstall();
            } catch (err) {
                showInstallButton();
            }
        }, 900);
    });

    window.electron.onUpdaterError((info) => {
        if (info && info.error) {
            alert(t('Update-fout: ' + info.error));
        }
    });

    downloadBtn.addEventListener('click', async () => {
        downloadBtn.disabled = true;
        downloadBtnText.textContent = t('Downloaden...');
        changelogBtn.style.display = 'none';
        showProgress(t('Update voorbereiden...'), true);
        await window.electron.downloadUpdate();
    });

    installBtn.addEventListener('click', async () => {
        installBtn.disabled = true;
        installBtn.querySelector('span').textContent = t('Installeren...');
        await window.electron.quitAndInstall();
    });

    dismissBtn.addEventListener('click', () => {
        if (dismissBtn.disabled) return;
        hideModal();
    });

    changelogBtn.addEventListener('click', () => {
        if (updateInfo && updateInfo.html_url) {
            window.electron.shell.openExternal(updateInfo.html_url);
        } else if (updateInfo) {
            // Fallback to repo releases page
            window.electron.shell.openExternal('https://github.com/ThermedWolf/Summie-Docs/releases');
        }
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) hideModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            hideModal();
        }
    });
}