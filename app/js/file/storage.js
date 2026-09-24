// ==================== LOCAL STORAGE ====================
// saveToLocalStorage, loadFromLocalStorage, clearLocalStorage, setupAutoSave.

let _lastStoredSummaryData = null;   // serialized payload from the last write
let _quotaWarned = false;            // quota errors must not re-notify every 2s

async function saveToLocalStorage() {
    const { editor, begrippen } = window.AppState;
    const imagesData = window.imageManager ? window.imageManager.getImagesData() : {};
    const codeBlocksData = window.codeBlockManager ? window.codeBlockManager.getCodeBlocksData() : [];
    const pagesData = window.PageManager ? window.PageManager.getPagesData() : null;
    const tabRulerData = window.TabRuler ? window.TabRuler.getTabStopsData() : null;
    const tabRulerIndents = window.TabRuler ? window.TabRuler.getIndentsData() : null;
    const headerFooterData = window.HeaderFooter ? window.HeaderFooter.getData() : null;
    const data = {
        content: editor.innerHTML,
        pages: pagesData,
        begrippen,
        references: window.ReferencesManager ? window.ReferencesManager.getSerialised() : [],
        citations: window.Bibliography ? window.Bibliography.getSerialised() : [],
        citationStyle: window.Bibliography ? window.Bibliography.getCitationStyle() : 'apa',
        vancouverInTextStyle: window.Bibliography ? window.Bibliography.getVancouverInTextStyle() : 'brackets',
        citationSearchMode: window.Bibliography ? window.Bibliography.getCitationSearchMode() : 'url',
        images: imagesData,
        codeBlocks: codeBlocksData,
        customStyles: window.StyleManager ? window.StyleManager.getCustomStyles() : {},
        tabRuler: tabRulerData,
        tabRulerIndents: tabRulerIndents,
        headerFooter: headerFooterData,
        timestamp: new Date().toISOString()
    };

    // The 2s session-save interval runs unconditionally — skip the stringify +
    // write entirely when nothing changed since the last write.
    const serialized = JSON.stringify(data);
    if (serialized === _lastStoredSummaryData) return;

    const dataSize = serialized.length;
    const imageCount = Object.keys(imagesData).length;

    try {
        // Silent: this is a background session draft — a protected document
        // without a known password must skip the write, never prompt.
        const dataToStore = await (window.DocumentProtection
            ? window.DocumentProtection.prepareForSave(data, { silent: true })
            : data);
        if (!dataToStore) return;
        localStorage.setItem('summaryData', JSON.stringify(dataToStore));
        _lastStoredSummaryData = serialized;
    } catch (e) {
        if (e.name === 'QuotaExceededError') {
            console.error('LocalStorage quota exceeded!', (dataSize / 1024 / 1024).toFixed(2) + ' MB');
            if (!_quotaWarned) {
                _quotaWarned = true;
                window.showNotification && window.showNotification(
                    SummieI18n.t('Opslag limiet bereikt'),
                    `Je document is te groot (${imageCount} afbeeldingen, ${(dataSize / 1024 / 1024).toFixed(1)} MB). Auto-opslaan is uitgeschakeld.`,
                    'error'
                );
            }
        } else {
            console.error('Error saving to localStorage:', e);
            window.showNotification && window.showNotification('Fout bij opslaan', SummieI18n.t('Er ging iets mis bij het opslaan.'), 'error');
        }
    }
}

async function loadFromLocalStorage() {
    const state = window.AppState;
    const saved = localStorage.getItem('summaryData');
    if (!saved) return;

    try {
        let data = JSON.parse(saved);
        if (window.DocumentProtection) {
            data = await window.DocumentProtection.openData(data);
            if (!data) return;
        }

        if (window.applyLoadedData) {
            window.applyLoadedData(data);
            return;
        }

        if (!data.content || data.content === '<p>Begin hier met typen...</p>') state.editor.innerHTML = '';
        else {
            state.editor.innerHTML = window.sanitizeSumdContent(data.content);
            state.editor.querySelectorAll('.placeholder-text').forEach(el => el.remove());
        }
        window.updateEditorPlaceholder && window.updateEditorPlaceholder();
        state.begrippen = data.begrippen || [];

        // Restore references
        if (window.ReferencesManager && data.references && data.references.length > 0) {
            window.ReferencesManager.references = data.references;
            window.ReferencesManager.restoreFromEditor();
        }

        // Restore bibliography — ensure Vancouver numbers follow document order
        if (window.Bibliography && Array.isArray(data.citations)) {
            window.Bibliography.setCitations(data.citations);
            setTimeout(function () {
                if (window.Bibliography.renumberNow) window.Bibliography.renumberNow();
                else {
                    window.Bibliography._updateInlineCitationSpans && window.Bibliography._updateInlineCitationSpans();
                    window.Bibliography.renderBibliographyBlock();
                }
            }, 150);
        }

        // Derive pagination mode from the saved draft itself — same logic as applyLoadedData.
        // A paginated draft with a single page (fresh empty paginated doc) must stay paginated.
        if (window.PageManager) {
            const isPaginatedDraft = Array.isArray(data.pages) && data.pages.length > 0;
            if (isPaginatedDraft) {
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

        // Restore tab ruler and header/footer
        if (data.tabRuler && window.TabRuler) {
            setTimeout(() => window.TabRuler.loadTabStopsData(data.tabRuler), 350);
        }
        if (data.tabRulerIndents && window.TabRuler) {
            setTimeout(() => window.TabRuler.loadIndentsData(data.tabRulerIndents), 350);
        }
        if (data.headerFooter && window.HeaderFooter) {
            setTimeout(() => window.HeaderFooter.loadData(data.headerFooter), 350);
        }
    } catch (e) {
        console.error('Error loading from localStorage:', e);
    }
}

function clearLocalStorage() {
    localStorage.removeItem('summaryData');
    _lastStoredSummaryData = null;
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
