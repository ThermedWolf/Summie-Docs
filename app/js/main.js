// ==================== MAIN BOOTSTRAP ====================
// Initialises all modules in dependency order.
// No logic lives here — only orchestration.

document.addEventListener('DOMContentLoaded', () => {
    const state = window.AppState;

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

    const pendingLoadRaw = localStorage.getItem('summie_pending_load');
    if (pendingLoadRaw) {
        localStorage.removeItem('summie_pending_load');
        try {
            const pending = JSON.parse(pendingLoadRaw);
            if (pending.data) {
                setTimeout(() => {
                    applyLoadedData(pending.data);
                    if (pending.path) {
                        window.currentFilePath = pending.path;
                        localStorage.setItem('summie_current_file_path', pending.path);
                    }
                    state.lastSavedContent = state.editor.innerHTML;
                    state.lastSavedBegrippen = JSON.stringify(state.begrippen);
                    localStorage.setItem('summie_saved_content', state.editor.innerHTML);
                }, 100);
            }
        } catch (e) {
            console.error('Error loading pending file:', e);
            loadFromLocalStorage();
        }
    } else {
        loadFromLocalStorage();
    }

    // 3. Restore current file path
    if (!window.currentFilePath) {
        const storedPath = localStorage.getItem('summie_current_file_path');
        if (storedPath) window.currentFilePath = storedPath;
    }

    // 4. Wire up all event listeners
    setupEventListeners();
    setupPlaceholderBehavior();
    setupScrollTracking();

    // 5. Populate UI
    window.initStyles && window.initStyles();
    updateBegrippenList();
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
    }, 500);

    // 8. Init References & Tables
    setTimeout(() => {
        if (window.ReferencesManager) window.ReferencesManager.init();
        if (window.TableManager) window.TableManager.init();
        _initReferenceButton();
        _initViewReferencesBtn();
    }, 200);
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
        refTab.textContent = 'Verwijzingen';
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