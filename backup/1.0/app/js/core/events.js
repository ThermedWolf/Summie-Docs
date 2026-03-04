// ==================== EDITOR EVENTS ====================
// handleEditorInput, handleEditorKeydown, handleEditorClick,
// handleEditorDoubleClick, handleGlobalKeydown, setupEventListeners.

function handleEditorInput(e) {
    const state = window.AppState;
    window.updateInhoudList && window.updateInhoudList();
    window.updateActiveInhoudItem && window.updateActiveInhoudItem();
    window.updateWordCounter && window.updateWordCounter();
    window.checkAutocomplete && window.checkAutocomplete();

    if (state.searchMatches.length > 0) {
        window.clearSearchHighlights && window.clearSearchHighlights();
        state.searchMatches = [];
    }

    const skipHighlightEvents = [
        'insertParagraph', 'insertLineBreak',
        'insertUnorderedList', 'insertOrderedList',
        'formatIndent', 'formatOutdent',
        'deleteContentBackward', 'deleteContentForward',
        'deleteByCut', 'insertFromPaste'
    ];

    if (skipHighlightEvents.includes(e.inputType)) {
        window.saveToLocalStorage && window.saveToLocalStorage();
        return;
    }

    clearTimeout(window.highlightTimeout);
    window.highlightTimeout = setTimeout(() => {
        window.highlightBegrippen && window.highlightBegrippen();
        window.ReferencesManager && window.ReferencesManager._highlightReferenceWords();
        window.saveToLocalStorage && window.saveToLocalStorage();
    }, 500);
}

function handleEditorKeydown(e) {
    const state = window.AppState;

    // Enter key: reset style and remove begrip-word on new line
    if (e.key === 'Enter') {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            let element = range.startContainer;
            if (element.nodeType === 3) element = element.parentElement;

            // Walk up to the block element so we detect styles on <p> even if cursor is in a <span>
            const editor = document.getElementById('editor');
            const blockTags = ['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE'];
            let blockEl = element;
            while (blockEl && blockEl !== editor && !blockTags.includes(blockEl.tagName)) {
                blockEl = blockEl.parentElement;
            }
            const styleCheckEl = (blockEl && blockEl !== editor) ? blockEl : element;

            const isInBegripWord = element.classList && element.classList.contains('begrip-word');
            // Detect styled block via StyleManager (supports both data-style and legacy classes)
            const _detectedStyle = window.StyleManager ? window.StyleManager.detectStyleOfBlock(styleCheckEl) : 'normal';
            const isInStyleElement = _detectedStyle !== 'normal';
            const _styleDef = isInStyleElement && window.StyleManager ? window.StyleManager.getStyleDef(_detectedStyle) : null;

            if (isInBegripWord || isInStyleElement) {
                setTimeout(() => {
                    const newSelection = window.getSelection();
                    if (newSelection.rangeCount > 0) {
                        const newRange = newSelection.getRangeAt(0);
                        let newElement = newRange.startContainer;
                        if (newElement.nodeType === 3) newElement = newElement.parentElement;

                        // Walk up to block element
                        const editorEl = document.getElementById('editor');
                        const blockTagsNew = ['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE'];
                        let newBlock = newElement;
                        while (newBlock && newBlock !== editorEl && !blockTagsNew.includes(newBlock.tagName)) {
                            newBlock = newBlock.parentElement;
                        }
                        if (newBlock && newBlock !== editorEl) newElement = newBlock;

                        // Clear style using StyleManager, then apply onEnterTo target if set
                        if (window.StyleManager) {
                            window.StyleManager.clearStyleFromBlock(newElement);
                            // If the style has a non-normal onEnterTo, apply that instead
                            if (_styleDef && _styleDef.onEnterReset && _styleDef.onEnterTo && _styleDef.onEnterTo !== 'normal') {
                                window.StyleManager.applyStyleToBlock(newElement, _styleDef.onEnterTo);
                            }
                        } else if (window._clearStyleFromBlock) {
                            window._clearStyleFromBlock(newElement);
                        }
                        newElement.classList && newElement.classList.remove('begrip-word');

                        if (isInBegripWord && newElement.dataset) {
                            delete newElement.dataset.keyword;
                        }

                        window.updateInhoudList && window.updateInhoudList();
                        window.updateActiveInhoudItem && window.updateActiveInhoudItem();
                    }
                }, 0);
            }
        }
    }

    // Autocomplete navigation (must come before Tab handling)
    const autocompletePopup = state.autocompletePopup;
    if (autocompletePopup.classList.contains('active')) {
        if (e.key === 'ArrowDown') { e.preventDefault(); window.navigateAutocomplete && window.navigateAutocomplete(1); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); window.navigateAutocomplete && window.navigateAutocomplete(-1); return; }
        if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); window.selectAutocomplete && window.selectAutocomplete(); return; }
        if (e.key === 'Escape') { window.hideAutocomplete && window.hideAutocomplete(); return; }
    }

    // Tab: indent / outdent in lists, otherwise insert spaces
    if (e.key === 'Tab') {
        e.preventDefault();
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            let element = range.startContainer;
            if (element.nodeType === 3) element = element.parentElement;
            const listItem = element.closest('li');
            if (listItem) {
                document.execCommand(e.shiftKey ? 'outdent' : 'indent', false, null);
            } else {
                document.execCommand('insertHTML', false, '&nbsp;&nbsp;&nbsp;&nbsp;');
            }
        }
        return;
    }

    // Ctrl+B/I/U formatting shortcuts
    if (e.ctrlKey || e.metaKey) {
        if (e.key === 'b') { e.preventDefault(); window.formatText && window.formatText('bold'); }
        else if (e.key === 'i') { e.preventDefault(); window.formatText && window.formatText('italic'); }
        else if (e.key === 'u') { e.preventDefault(); window.formatText && window.formatText('underline'); }
    }
}

function handleEditorClick(e) {
    if (e.target.closest('.code-block-wrapper')) return;
    if (e.target.classList.contains('begrip-word')) {
        e.preventDefault();
        e.stopPropagation();
        window.showBegripTooltip && window.showBegripTooltip(e.target);
        return;
    }
    if (e.target.classList.contains('reference-word')) {
        e.preventDefault();
        e.stopPropagation();
        window.ReferencesManager && window.ReferencesManager.showReferencePreview(e.target);
        return;
    }
}

function handleEditorDoubleClick(e) {
    if (e.target.classList.contains('begrip-word')) {
        const keyword = e.target.textContent;
        const begrip = window.AppState.begrippen.find(b => b.keyword.toLowerCase() === keyword.toLowerCase());
        if (begrip) {
            window.switchTab && window.switchTab('begrippen');
            setTimeout(() => window.highlightBegripInList && window.highlightBegripInList(begrip), 100);
        }
    }
}

function handleGlobalKeydown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        window.saveToFile && window.saveToFile();
    }
}

function setupEventListeners() {
    const state = window.AppState;
    const { editor, searchBegrippen } = state;

    // Expose file functions globally for topbar.js
    window.newSummary = window.newSummary;
    window.saveToFile = window.saveToFile;
    window.loadFromFile = window.loadFromFile;

    // File sidebar buttons
    const newSummaryBtn = document.getElementById('newSummaryBtn');
    const newWindowBtn = document.getElementById('newWindowBtn');
    const saveAsSumdBtn = document.getElementById('saveAsSumdBtn');
    const quickSaveBtn = document.getElementById('quickSaveBtn');
    const loadFileBtn = document.getElementById('loadFileBtn');
    const fileInput = document.getElementById('fileInput');

    if (newSummaryBtn) newSummaryBtn.addEventListener('click', window.newSummary);
    if (newWindowBtn) newWindowBtn.addEventListener('click', () => {
        if (window.electron && window.electron.windowNew) window.electron.windowNew();
    });

    if (window.appInfo && window.appInfo.isElectron) {
        if (quickSaveBtn) quickSaveBtn.addEventListener('click', () => window.saveToFile(false));
        if (saveAsSumdBtn) saveAsSumdBtn.addEventListener('click', () => window.saveToFile(true));
        if (loadFileBtn) loadFileBtn.addEventListener('click', window.loadFromFile);
    } else {
        if (saveAsSumdBtn) saveAsSumdBtn.addEventListener('click', () => window.saveToFile(false));
        if (quickSaveBtn) quickSaveBtn.addEventListener('click', () => window.saveToFile(false));
        if (loadFileBtn) loadFileBtn.addEventListener('click', () => fileInput && fileInput.click());
    }
    if (fileInput) fileInput.addEventListener('change', window.loadFromFile);

    // DOCX export
    const saveAsDocxBtn = document.getElementById('saveAsDocxBtn');
    if (saveAsDocxBtn) saveAsDocxBtn.addEventListener('click', () => {
        window.exportToDocx && window.exportToDocx();
    });

    // List buttons
    const bulletListBtn = document.getElementById('bulletListBtn');
    const checklistBtn = document.getElementById('checklistBtn');
    if (bulletListBtn) bulletListBtn.addEventListener('click', () => window.createList('ul'));
    if (checklistBtn) checklistBtn.addEventListener('click', window.createChecklist);

    // Expose formatting functions globally for topbar.js
    window.highlightText = window.highlightText;
    window.changeTextColor = window.changeTextColor;
    window.applyStyleFromTopbar = window.applyStyle;
    window.updateActiveInhoudItem = window.updateActiveInhoudItem;

    // Editor events
    editor.addEventListener('input', handleEditorInput);
    editor.addEventListener('input', () => window.updateUnsavedIndicator && window.updateUnsavedIndicator());
    editor.addEventListener('keydown', handleEditorKeydown);
    editor.addEventListener('click', handleEditorClick);
    editor.addEventListener('dblclick', handleEditorDoubleClick);

    // Word counter
    document.addEventListener('selectionchange', () => window.updateWordCounter && window.updateWordCounter());
    editor.addEventListener('mouseup', () => window.updateWordCounter && window.updateWordCounter());
    editor.addEventListener('keyup', () => window.updateWordCounter && window.updateWordCounter());

    // Checklist toggle
    editor.addEventListener('click', (e) => {
        if (e.target.tagName === 'LI' && e.target.closest('.checklist')) {
            e.target.classList.toggle('checked');
            window.saveToLocalStorage && window.saveToLocalStorage();
        }
    });

    // Highlight removal
    editor.addEventListener('click', (e) => {
        if (e.target.classList.contains('highlight')) {
            window.removeHighlight && window.removeHighlight(e.target);
        }
    });

    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => window.switchTab && window.switchTab(tab.dataset.tab));
    });

    // Begrip modal
    const addBegripBtn = document.getElementById('addBegripBtn');
    const addBegripBtnToolbar = document.getElementById('addBegripBtnToolbar');
    if (addBegripBtn) addBegripBtn.addEventListener('click', () => window.openBegripModal && window.openBegripModal());
    if (addBegripBtnToolbar) addBegripBtnToolbar.addEventListener('click', () => window.openBegripModal && window.openBegripModal());
    document.getElementById('closeModal').addEventListener('click', () => window.closeBegripModal && window.closeBegripModal());
    document.getElementById('cancelModal').addEventListener('click', () => window.closeBegripModal && window.closeBegripModal());
    document.getElementById('saveBegrip').addEventListener('click', () => window.saveBegrip && window.saveBegrip());

    // Search
    searchBegrippen.addEventListener('input', window.handleSearch);
    searchBegrippen.addEventListener('keydown', window.handleSearchKeydown);
    searchBegrippen.addEventListener('focus', window.selectAllSearchText);

    // Clear search on begrip/result click
    document.querySelector('.sidebar').addEventListener('click', (e) => {
        if (e.target.closest('.begrip-item') || e.target.closest('.search-result-item')) {
            window.clearSearchHighlights && window.clearSearchHighlights();
            state.searchMatches = [];
            searchBegrippen.value = '';
            state.searchResults.classList.remove('active');
            state.searchResults.innerHTML = '';
        }
    });

    // Global keyboard shortcuts
    document.addEventListener('keydown', handleGlobalKeydown);

    // Sidebar logo
    const sidebarLogoLink = document.getElementById('sidebarLogoLink');
    if (sidebarLogoLink) {
        sidebarLogoLink.addEventListener('click', () => { window.location.href = 'landing.html'; });
    }

    // Document name input
    window.setupDocNameInput && window.setupDocNameInput();
}

// Expose
window.handleEditorInput = handleEditorInput;
window.handleEditorKeydown = handleEditorKeydown;
window.handleEditorClick = handleEditorClick;
window.handleEditorDoubleClick = handleEditorDoubleClick;
window.handleGlobalKeydown = handleGlobalKeydown;
window.setupEventListeners = setupEventListeners;