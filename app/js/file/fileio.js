// ==================== FILE I/O ====================
// saveToFile, loadFromFile, newSummary, trackRecentDocument, generateDocId.

function updateWindowTitle(filePath) {
    if (!window.electron || !window.electron.setWindowTitle) return;
    const name = filePath
        ? filePath.split('\\').pop().split('/').pop().replace(/\.sumd$/i, '')
        : SummieI18n.t('Nieuw Document');
    window.electron.setWindowTitle(name);
}
window.updateWindowTitle = updateWindowTitle;

function getCleanEditorContent(editor) {
    // Return editor innerHTML with transient highlights stripped out,
    // so neither begrip-word spans nor find-replace marks are persisted.
    const clone = editor.cloneNode(true);
    clone.querySelectorAll('span.begrip-word').forEach(span => {
        span.replaceWith(document.createTextNode(span.textContent));
    });
    clone.querySelectorAll('mark.fr-highlight').forEach(mark => {
        mark.replaceWith(document.createTextNode(mark.textContent));
    });
    // Clean up empty spans and zero-width space spans left by font-size operations
    clone.querySelectorAll('span').forEach(span => {
        if (!span.textContent && !span.children.length) {
            span.remove();
        } else if (span.textContent === '\u200B') {
            span.remove();
        } else if (span.textContent === '' && span.children.length === 0 && !span.getAttribute('style') && !span.className) {
            // Completely empty span with no attributes
            span.remove();
        }
    });
    return clone.innerHTML;
}
window.getCleanEditorContent = getCleanEditorContent;


function generateDocId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function trackRecentDocument(filePath, name) {
    if (!filePath) return;
    try {
        const entry = {
            id: generateDocId(),
            name: name || filePath.split('\\').pop().split('/').pop().replace('.sumd', ''),
            path: filePath,
            lastOpened: new Date().toISOString()
        };
        if (window.electron && window.electron.recentsAdd) {
            window.electron.recentsAdd(entry);
        } else {
            // Fallback: localStorage for non-Electron
            const RECENT_KEY = 'summie_recent_docs';
            let docs = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
            docs = docs.filter(d => d.path !== filePath);
            docs.unshift(entry);
            if (docs.length > 10) docs = docs.slice(0, 10);
            localStorage.setItem(RECENT_KEY, JSON.stringify(docs));
        }
    } catch (e) {
        console.error('Error tracking recent document:', e);
    }
}

// Pop-up shown when Ctrl+S is pressed but the known file path no longer exists.
// Gives the user the choice to recreate the file or pick a new location.
function _showFileMissingDialog(data, missingPath) {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.id = 'fileMissingOverlay';
    overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 9999;
        background: rgba(0,0,0,.45);
        display: flex; align-items: center; justify-content: center;
    `;

    const fileName = missingPath.split(/[\\/]/).pop();

    overlay.innerHTML = `
        <div style="
            background: var(--bg-primary, #1e1e2e);
            border: 1px solid var(--border-color, #444);
            border-radius: 12px;
            padding: 28px 32px;
            max-width: 420px;
            width: 90%;
            box-shadow: 0 8px 32px rgba(0,0,0,.5);
            color: var(--text-primary, #cdd6f4);
            font-family: inherit;
        ">
            <h3 style="margin: 0 0 10px; font-size: 1rem; font-weight: 600;">Bestand niet gevonden</h3>
            <p style="margin: 0 0 20px; font-size: .875rem; color: var(--text-secondary, #a6adc8); line-height: 1.5;">
                Het bestand <strong style="color: var(--text-primary, #cdd6f4);">${_escapeHtml(fileName)}</strong> bestaat niet meer.
                Waarschijnlijk is het verplaatst of verwijderd.<br><br>
                Wat wil je doen?
            </p>
            <div style="display: flex; flex-direction: column; gap: 10px;">
                <button id="fmRecreate" style="
                    padding: 9px 16px; border-radius: 8px; border: none; cursor: pointer;
                    background: var(--accent, #89b4fa); color: var(--bg-primary, #1e1e2e);
                    font-size: .875rem; font-weight: 600; text-align: left;
                ">📄 Bestand opnieuw aanmaken op dezelfde locatie</button>
                <button id="fmNewPath" style="
                    padding: 9px 16px; border-radius: 8px; border: none; cursor: pointer;
                    background: var(--bg-secondary, #313244); color: var(--text-primary, #cdd6f4);
                    font-size: .875rem; font-weight: 500; text-align: left;
                    border: 1px solid var(--border-color, #444);
                ">📁 Pad wijzigen — kies een nieuwe locatie</button>
                <button id="fmCancel" style="
                    padding: 9px 16px; border-radius: 8px; border: none; cursor: pointer;
                    background: transparent; color: var(--text-secondary, #a6adc8);
                    font-size: .875rem; text-align: left;
                ">Annuleren</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();

    overlay.querySelector('#fmRecreate').addEventListener('click', async () => {
        close();
        // Recreate at the same path
        const result = await window.electron.saveSumdFile(data, missingPath);
        if (result.success) {
            const state = window.AppState;
            const { editor, begrippen } = state;
            state.lastSavedContent = getCleanEditorContent(editor);
            state.lastSavedBegrippen = JSON.stringify(begrippen);
            state.lastSavedProtection = window.DocumentProtection?.isProtected?.() || false;
            trackRecentDocument(missingPath);
            localStorage.setItem('summie_current_file_path', missingPath);
            localStorage.setItem('summie_saved_content', getCleanEditorContent(editor));
            localStorage.setItem('summie_saved_begrippen', JSON.stringify(begrippen));
            window.showSaveStatusSuccess && window.showSaveStatusSuccess();
            window.updateDocNameInput && window.updateDocNameInput();
            window.updateUnsavedIndicator && window.updateUnsavedIndicator();
            updateWindowTitle(missingPath);
        } else {
            window.showNotification && window.showNotification(SummieI18n.t('Fout'), `Kon niet opslaan: ${result.error}`, 'error');
        }
    });

    overlay.querySelector('#fmNewPath').addEventListener('click', async () => {
        close();
        // Open Save As dialog, starting in the directory where the file was last saved
        const lastDir = missingPath ? missingPath.replace(/[\\/][^\\/]+$/, '') : null;
        const result = await window.electron.saveSumdFile(data, null, null, lastDir);
        if (result.success) {
            window.currentFilePath = result.path;
            const state = window.AppState;
            const { editor, begrippen } = state;
            state.lastSavedContent = getCleanEditorContent(editor);
            state.lastSavedBegrippen = JSON.stringify(begrippen);
            state.lastSavedProtection = window.DocumentProtection?.isProtected?.() || false;
            const fileName2 = result.path.split(/[\\/]/).pop();
            trackRecentDocument(result.path, fileName2.replace('.sumd', ''));
            localStorage.setItem('summie_current_file_path', result.path);
            localStorage.setItem('summie_saved_content', getCleanEditorContent(editor));
            localStorage.setItem('summie_saved_begrippen', JSON.stringify(begrippen));
            window.showSaveStatusSuccess && window.showSaveStatusSuccess();
            window.updateDocNameInput && window.updateDocNameInput();
            window.updateUnsavedIndicator && window.updateUnsavedIndicator();
            updateWindowTitle(result.path);
            window.AutoSave && window.AutoSave.onFileChanged();
        } else if (!result.canceled) {
            window.showNotification && window.showNotification(SummieI18n.t('Fout'), `Kon niet opslaan: ${result.error}`, 'error');
        }
    });

    overlay.querySelector('#fmCancel').addEventListener('click', close);
    // Click outside dialog = cancel
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
}

function _escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function saveToFile(saveAs = false) {
    const state = window.AppState;
    const { editor, begrippen } = state;

    const data = {
        content: getCleanEditorContent(editor),
        pages: window.PageManager ? window.PageManager.getPagesData() : null,
        begrippen,
        references: window.ReferencesManager ? window.ReferencesManager.getSerialised() : [],
        citations: window.Bibliography ? window.Bibliography.getSerialised() : [],
        citationStyle: window.Bibliography ? window.Bibliography.getCitationStyle() : 'apa',
        images: window.imageManager ? window.imageManager.getImagesData() : {},
        codeBlocks: window.codeBlockManager ? window.codeBlockManager.getCodeBlocksData() : [],
        customStyles: window.StyleManager ? window.StyleManager.getCustomStyles() : {},
        timestamp: new Date().toISOString()
    };

    // Preserve description and tags from the existing file so they aren't
    // wiped when the user saves normally via Ctrl+S or the save button.
    if (window.currentFilePath && window.electron && window.electron.readSumdMeta) {
        try {
            const meta = await window.electron.readSumdMeta(window.currentFilePath);
            if (meta) {
                if (meta.description) data.description = meta.description;
                if (meta.tags && meta.tags.length) data.tags = meta.tags;
            }
        } catch (e) { }
    }

    const dataToWrite = await (window.DocumentProtection
        ? window.DocumentProtection.prepareForSave(data)
        : data);
    if (!dataToWrite) return { canceled: true };

    if (window.electron && window.appInfo && window.appInfo.isElectron) {
        // Quick save
        if (window.currentFilePath && !saveAs) {
            // Check if the file still exists before overwriting
            const exists = await window.electron.fileExists(window.currentFilePath);
            if (!exists) {
                _showFileMissingDialog(dataToWrite, window.currentFilePath);
                return;
            }
            const result = await window.electron.saveSumdFile(dataToWrite, window.currentFilePath);
            if (result.success) {
                state.lastSavedContent = getCleanEditorContent(editor);
                state.lastSavedBegrippen = JSON.stringify(begrippen);
                state.lastSavedProtection = window.DocumentProtection?.isProtected?.() || false;
                trackRecentDocument(window.currentFilePath);
                localStorage.setItem('summie_current_file_path', window.currentFilePath);
                localStorage.setItem('summie_saved_content', getCleanEditorContent(editor));
                localStorage.setItem('summie_saved_begrippen', JSON.stringify(begrippen));
                window.showSaveStatusSuccess && window.showSaveStatusSuccess();
                window.updateDocNameInput && window.updateDocNameInput();
                window.updateUnsavedIndicator && window.updateUnsavedIndicator();
                updateWindowTitle(window.currentFilePath);
                window.AutoSave && window.AutoSave.onFileChanged();
                return;
            }
        }

        // Save As
        const result = await window.electron.saveSumdFile(dataToWrite, null);
        if (result.success) {
            window.currentFilePath = result.path;
            state.lastSavedContent = getCleanEditorContent(editor);
            state.lastSavedBegrippen = JSON.stringify(begrippen);
            state.lastSavedProtection = window.DocumentProtection?.isProtected?.() || false;
            const fileName = result.path.split('\\').pop().split('/').pop();
            trackRecentDocument(result.path, fileName.replace('.sumd', ''));
            localStorage.setItem('summie_current_file_path', result.path);
            localStorage.setItem('summie_saved_content', getCleanEditorContent(editor));
            localStorage.setItem('summie_saved_begrippen', JSON.stringify(begrippen));
            window.showSaveStatusSuccess && window.showSaveStatusSuccess();
            window.updateDocNameInput && window.updateDocNameInput();
            window.updateUnsavedIndicator && window.updateUnsavedIndicator();
            updateWindowTitle(result.path);
            window.AutoSave && window.AutoSave.onFileChanged();
        } else if (!result.canceled) {
            window.showNotification && window.showNotification(SummieI18n.t('Fout'), `Kon niet opslaan: ${result.error}`, 'error');
        }
        return;
    }

    // Browser mode
    const blob = new Blob([JSON.stringify(dataToWrite, null, 2)], { type: 'application/json' });
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
            if (!result.canceled) window.showNotification && window.showNotification(SummieI18n.t('Fout'), `Kon niet laden: ${result.error}`, 'error');
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
            window.showNotification && window.showNotification(SummieI18n.t('Fout'), SummieI18n.t('Kon bestand niet lezen'), 'error');
            return;
        }
    }

    try {
        if (window.DocumentProtection) {
            data = await window.DocumentProtection.openData(data);
            if (!data) return;
        }

        state.editor.innerHTML = window.sanitizeSumdContent(data.content);

        // Strip legacy inline margin-bottom from plain paragraphs (pre-v4.1.0 documents
        // had margin-bottom: 12px baked in; now handled by CSS on .a4-page p)
        state.editor.querySelectorAll('p, div').forEach(el => {
            const style = el.getAttribute('data-style');
            const isNormal = !style || style === 'normal';
            const hasNoClass = !el.className || el.className.trim() === '' ||
                !([...el.classList].some(c => c.startsWith('style-')));
            if (isNormal && hasNoClass) {
                el.style.marginBottom = '';
                el.style.marginTop = '';
                if (el.getAttribute('style') === '') el.removeAttribute('style');
            }
        });

        state.begrippen = data.begrippen || [];

        // Restore references
        if (window.ReferencesManager && data.references && data.references.length > 0) {
            window.ReferencesManager.references = data.references;
            window.ReferencesManager.restoreFromEditor();
        }

        // Restore bibliography
        if (window.Bibliography && Array.isArray(data.citations)) {
            window.Bibliography.setCitations(data.citations);
            // Restore citation style
            if (data.citationStyle && window.Bibliography.setCitationStyle) {
                window.Bibliography.setCitationStyle(data.citationStyle);
            }
            window.Bibliography.renderBibliographyBlock();
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
            updateWindowTitle(window.currentFilePath);
            window.AutoSave && window.AutoSave.onFileChanged();
            window.updateFileSize && window.updateFileSize();
        }
        state.lastSavedContent = state.editor.innerHTML;
        state.lastSavedBegrippen = JSON.stringify(state.begrippen);
        state.lastSavedProtection = window.DocumentProtection?.isProtected?.() || false;
        localStorage.setItem('summie_saved_content', state.editor.innerHTML);
        // Start a fresh undo history, seeded with the loaded document
        setTimeout(() => window.UndoManager && window.UndoManager.resetBaseline(), 550);

        window.showNotification && window.showNotification(
            SummieI18n.t('Document geladen'),
            fileName ? `${fileName} is geladen` : SummieI18n.t('Bestand is geladen'),
            'success'
        );
    } catch (error) {
        window.showNotification && window.showNotification(SummieI18n.t('Fout'), SummieI18n.t('Kon bestand niet laden'), 'error');
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
        window.DocumentProtection?.reset();
        localStorage.removeItem('summie_current_file_path');
        updateWindowTitle(null);
        window.AutoSave && window.AutoSave.onFileChanged();
        window.clearLocalStorage && window.clearLocalStorage();
        if (window.StyleManager) window.StyleManager.clearCustomStyles();
        if (window.Bibliography && window.Bibliography.setCitationStyle) {
            window.Bibliography.setCitationStyle('apa');
        }
        window.updateBegrippenList && window.updateBegrippenList();
        window.updateInhoudList && window.updateInhoudList();
        window.updateActiveInhoudItem && window.updateActiveInhoudItem();
        state.lastSavedContent = state.editor.innerHTML;
        state.lastSavedBegrippen = JSON.stringify(state.begrippen);
        state.lastSavedProtection = window.DocumentProtection?.isProtected?.() || false;
        window.clearDocNameInput && window.clearDocNameInput();
        window.showNotification && window.showNotification(SummieI18n.t('Nieuw document gestart'), '', 'success');
        setTimeout(() => window.focusEditor && window.focusEditor(), 450);
        // Start a fresh undo history, seeded with the (empty) document
        setTimeout(() => window.UndoManager && window.UndoManager.resetBaseline(), 550);
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
