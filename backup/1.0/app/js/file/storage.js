// ==================== LOCAL STORAGE ====================
// saveToLocalStorage, loadFromLocalStorage, clearLocalStorage, setupAutoSave.

function saveToLocalStorage() {
    const { editor, begrippen } = window.AppState;
    const imagesData = window.imageManager ? window.imageManager.getImagesData() : {};
    const codeBlocksData = window.codeBlockManager ? window.codeBlockManager.getCodeBlocksData() : [];
    const pagesData = window.PageManager ? window.PageManager.getPagesData() : null;
    const data = {
        content: editor.innerHTML,
        pages: pagesData,
        begrippen,
        images: imagesData,
        codeBlocks: codeBlocksData,
        customStyles: window.StyleManager ? window.StyleManager.getCustomStyles() : {},
        timestamp: new Date().toISOString()
    };

    const dataSize = JSON.stringify(data).length;
    const imageCount = Object.keys(imagesData).length;

    try {
        localStorage.setItem('summaryData', JSON.stringify(data));
    } catch (e) {
        if (e.name === 'QuotaExceededError') {
            console.error('LocalStorage quota exceeded!', (dataSize / 1024 / 1024).toFixed(2) + ' MB');
            window.showNotification && window.showNotification(
                'Opslag limiet bereikt',
                `Je document is te groot (${imageCount} afbeeldingen, ${(dataSize / 1024 / 1024).toFixed(1)} MB). Auto-opslaan is uitgeschakeld.`,
                'error'
            );
        } else {
            console.error('Error saving to localStorage:', e);
            window.showNotification && window.showNotification('Fout bij opslaan', 'Er ging iets mis bij het opslaan.', 'error');
        }
    }
}

function loadFromLocalStorage() {
    const state = window.AppState;
    const saved = localStorage.getItem('summaryData');
    if (!saved) return;

    try {
        const data = JSON.parse(saved);

        if (!data.content || data.content === '<p>Begin hier met typen...</p>') {
            state.editor.innerHTML = '<p class="placeholder-text">Begin hier met typen...</p>';
        } else {
            state.editor.innerHTML = data.content;
        }
        state.begrippen = data.begrippen || [];

        // Derive pagination mode from the saved draft itself — same logic as applyLoadedData.
        // This handles old drafts (no 'pages' field) correctly without checking localStorage.
        if (window.PageManager) {
            const hasMultiplePages = data.pages && data.pages.length > 1;
            if (hasMultiplePages) {
                localStorage.setItem('summie_pagination_mode', '1');
                if (!window.PageManager.isPaginationEnabled()) window.PageManager.enablePagination();
                window.PageManager.loadPagesData(data.pages);
            } else {
                localStorage.setItem('summie_pagination_mode', '0');
                if (window.PageManager.isPaginationEnabled()) window.PageManager.disablePagination();
            }
        }

        // Restore per-document custom styles
        if (window.StyleManager) {
            window.StyleManager.loadCustomStyles(data.customStyles || {});
        }

        if (data.images && Object.keys(data.images).length > 0) {
            const loadImages = () => {
                if (window.imageManager) {
                    window.imageManager.loadImagesData(data.images);
                    setTimeout(() => window.imageManager.restoreImagesInEditor(), 200);
                } else {
                    setTimeout(loadImages, 50);
                }
            };
            loadImages();
        }

        if (window.codeBlockManager) {
            setTimeout(() => {
                window.codeBlockManager.restoreCodeBlocks();
                window.codeBlockManager.resetAllCopyButtons();
                if (data.codeBlocks) window.codeBlockManager.loadCodeBlocksData(data.codeBlocks);
            }, 200);
        }

        window.highlightBegrippen && window.highlightBegrippen();
        window.updateBegrippenCounter && window.updateBegrippenCounter();
        window.updateWordCounter && window.updateWordCounter();
    } catch (e) {
        console.error('Error loading from localStorage:', e);
    }
}

function clearLocalStorage() {
    localStorage.removeItem('summaryData');
    if (window.StyleManager) window.StyleManager.clearCustomStyles();
}

function setupAutoSave() {
    setInterval(saveToLocalStorage, 2000);

    setInterval(() => {
        window.updateStyleSelector && window.updateStyleSelector();
        window.updateColorSelector && window.updateColorSelector();
    }, 2000);
}

// Expose
window.saveToLocalStorage = saveToLocalStorage;
window.loadFromLocalStorage = loadFromLocalStorage;
window.clearLocalStorage = clearLocalStorage;
window.setupAutoSave = setupAutoSave;