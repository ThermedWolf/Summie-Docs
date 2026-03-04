// ==================== FILE I/O ====================
// saveToFile, loadFromFile, newSummary, trackRecentDocument, generateDocId.

function generateDocId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function trackRecentDocument(filePath, name) {
    if (!filePath) return;
    try {
        const RECENT_KEY = 'summie_recent_docs';
        let docs = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
        docs = docs.filter(d => d.path !== filePath);
        docs.unshift({
            id: generateDocId(),
            name: name || filePath.split('\\').pop().split('/').pop().replace('.sumd', ''),
            path: filePath,
            lastOpened: new Date().toISOString()
        });
        if (docs.length > 20) docs = docs.slice(0, 20);
        localStorage.setItem(RECENT_KEY, JSON.stringify(docs));
    } catch (e) {
        console.error('Error tracking recent document:', e);
    }
}

async function saveToFile(saveAs = false) {
    const state = window.AppState;
    const { editor, begrippen } = state;

    const data = {
        content: editor.innerHTML,
        pages: window.PageManager ? window.PageManager.getPagesData() : null,
        begrippen,
        references: window.ReferencesManager ? window.ReferencesManager.getSerialised() : [],
        images: window.imageManager ? window.imageManager.getImagesData() : {},
        codeBlocks: window.codeBlockManager ? window.codeBlockManager.getCodeBlocksData() : [],
        customStyles: window.StyleManager ? window.StyleManager.getCustomStyles() : {},
        timestamp: new Date().toISOString()
    };

    if (window.electron && window.appInfo && window.appInfo.isElectron) {
        // Quick save
        if (window.currentFilePath && !saveAs) {
            const result = await window.electron.saveSumdFile(data, window.currentFilePath);
            if (result.success) {
                state.lastSavedContent = editor.innerHTML;
                state.lastSavedBegrippen = JSON.stringify(begrippen);
                trackRecentDocument(window.currentFilePath);
                localStorage.setItem('summie_current_file_path', window.currentFilePath);
                localStorage.setItem('summie_saved_content', editor.innerHTML);
                localStorage.setItem('summie_saved_begrippen', JSON.stringify(begrippen));
                window.showSaveStatusSuccess && window.showSaveStatusSuccess();
                window.updateDocNameInput && window.updateDocNameInput();
                window.updateUnsavedIndicator && window.updateUnsavedIndicator();
                return;
            }
        }

        // Save As
        const result = await window.electron.saveSumdFile(data, null);
        if (result.success) {
            window.currentFilePath = result.path;
            state.lastSavedContent = editor.innerHTML;
            state.lastSavedBegrippen = JSON.stringify(begrippen);
            const fileName = result.path.split('\\').pop().split('/').pop();
            trackRecentDocument(result.path, fileName.replace('.sumd', ''));
            localStorage.setItem('summie_current_file_path', result.path);
            localStorage.setItem('summie_saved_content', editor.innerHTML);
            localStorage.setItem('summie_saved_begrippen', JSON.stringify(begrippen));
            window.showSaveStatusSuccess && window.showSaveStatusSuccess();
            window.updateDocNameInput && window.updateDocNameInput();
            window.updateUnsavedIndicator && window.updateUnsavedIndicator();
        } else if (!result.canceled) {
            window.showNotification && window.showNotification('Fout', `Kon niet opslaan: ${result.error}`, 'error');
        }
        return;
    }

    // Browser mode
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `samenvatting_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    window.showSaveStatusSuccess && window.showSaveStatusSuccess();
}

async function loadFromFile(e) {
    const state = window.AppState;
    let data, fileName;

    if (window.electron && window.appInfo && window.appInfo.isElectron) {
        const result = await window.electron.openSumdFile();
        if (!result.success) {
            if (!result.canceled) window.showNotification && window.showNotification('Fout', `Kon niet laden: ${result.error}`, 'error');
            return;
        }
        data = result.data;
        window.currentFilePath = result.path;
        fileName = result.path.split('\\').pop().split('/').pop();
    } else {
        const file = e && e.target && e.target.files && e.target.files[0];
        if (!file) return;

        const fileContent = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (ev) => resolve(ev.target.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });

        try {
            data = JSON.parse(fileContent);
            fileName = file.name;
        } catch (error) {
            window.showNotification && window.showNotification('Fout', 'Kon bestand niet lezen', 'error');
            return;
        }
    }

    try {
        state.editor.innerHTML = data.content;
        state.begrippen = data.begrippen || [];

        // Restore references
        if (window.ReferencesManager && data.references && data.references.length > 0) {
            window.ReferencesManager.references = data.references;
            window.ReferencesManager.restoreFromEditor();
        }

        // Load per-document custom styles
        if (window.StyleManager) {
            window.StyleManager.loadCustomStyles(data.customStyles || {});
        }

        if (data.images && Object.keys(data.images).length > 0) {
            const loadImages = () => {
                if (window.imageManager) {
                    window.imageManager.loadImagesData(data.images);
                    setTimeout(() => window.imageManager.restoreImagesInEditor(), 200);
                } else { setTimeout(loadImages, 50); }
            };
            loadImages();
        }

        if (window.codeBlockManager) {
            setTimeout(() => {
                window.codeBlockManager.restoreCodeBlocks();
                window.codeBlockManager.resetAllCopyButtons();
                if (data.codeBlocks) window.codeBlockManager.loadCodeBlocksData(data.codeBlocks);
            }, 100);
        }

        window.updateBegrippenList && window.updateBegrippenList();
        window.updateInhoudList && window.updateInhoudList();
        window.updateActiveInhoudItem && window.updateActiveInhoudItem();
        window.highlightBegrippen && window.highlightBegrippen();
        window.saveToLocalStorage && window.saveToLocalStorage();

        if (window.currentFilePath) {
            trackRecentDocument(window.currentFilePath, fileName ? fileName.replace('.sumd', '') : null);
            localStorage.setItem('summie_current_file_path', window.currentFilePath);
        }
        state.lastSavedContent = state.editor.innerHTML;
        state.lastSavedBegrippen = JSON.stringify(state.begrippen);
        localStorage.setItem('summie_saved_content', state.editor.innerHTML);

        window.showNotification && window.showNotification(
            'Document geladen',
            fileName ? `${fileName} is geladen` : 'Bestand is geladen',
            'success'
        );
    } catch (error) {
        window.showNotification && window.showNotification('Fout', 'Kon bestand niet laden', 'error');
        console.error('Load error:', error);
    }
}

function newSummary() {
    const modal = document.getElementById('confirmNewModal');
    modal.classList.add('active');

    const onConfirm = () => {
        cleanup();
        if (window.topbarManager) window.topbarManager.closeFileSidebar();
        window.setEditorPlaceholder && window.setEditorPlaceholder();
        const state = window.AppState;
        state.begrippen = [];
        window.currentFilePath = null;
        localStorage.removeItem('summie_current_file_path');
        window.clearLocalStorage && window.clearLocalStorage();
        if (window.StyleManager) window.StyleManager.clearCustomStyles();
        window.updateBegrippenList && window.updateBegrippenList();
        window.updateInhoudList && window.updateInhoudList();
        window.updateActiveInhoudItem && window.updateActiveInhoudItem();
        state.lastSavedContent = state.editor.innerHTML;
        state.lastSavedBegrippen = JSON.stringify(state.begrippen);
        window.clearDocNameInput && window.clearDocNameInput();
        window.showNotification && window.showNotification('Nieuw document gestart', '', 'success');
        setTimeout(() => window.focusEditor && window.focusEditor(), 450);
    };

    const onCancel = () => cleanup();

    const cleanup = () => {
        modal.classList.remove('active');
        document.getElementById('confirmNewBtn').removeEventListener('click', onConfirm);
        document.getElementById('cancelNewModal').removeEventListener('click', onCancel);
    };

    document.getElementById('confirmNewBtn').addEventListener('click', onConfirm);
    document.getElementById('cancelNewModal').addEventListener('click', onCancel);
}

// Expose
window.generateDocId = generateDocId;
window.trackRecentDocument = trackRecentDocument;
window.saveToFile = saveToFile;
window.loadFromFile = loadFromFile;
window.newSummary = newSummary;