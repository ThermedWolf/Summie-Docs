// ==================== EDITOR CORE ====================
// Placeholder behaviour, focus management, loading data into the editor.

const PLACEHOLDER_TEXT = SummieI18n.t('Begin hier met typen...');
let _pendingEmptyEditorStyle = 'normal';

function getEditorPlaceholderOverlay() {
    return document.getElementById('editorPlaceholderOverlay');
}

function getEditorPlaceholderContainer() {
    const { editor } = window.AppState;
    return editor ? editor.closest('.pages-container') : null;
}

function isEditorEmpty() {
    const { editor } = window.AppState;
    if (!editor) return true;

    const clone = editor.cloneNode(true);
    clone.querySelectorAll('.placeholder-text').forEach(el => el.remove());
    clone.querySelectorAll('.page-number-badge, .summie-page-break, #summie-pagination-cursor').forEach(el => el.remove());

    if (clone.querySelector('img, table, .code-block-wrapper, .summie-textbox, .summie-shape-wrapper')) return false;

    const text = (clone.innerText || clone.textContent || '')
        .replace(/\u00a0/g, ' ')
        .trim();
    return text === '';
}

function updateEditorPlaceholder() {
    const container = getEditorPlaceholderContainer();
    const overlay = getEditorPlaceholderOverlay();
    if (!container || !overlay) return;

    container.classList.toggle('editor-empty', isEditorEmpty());
}

function setPendingEmptyEditorStyle(styleKey) {
    _pendingEmptyEditorStyle = styleKey || 'normal';
}

function getPendingEmptyEditorStyle() {
    return _pendingEmptyEditorStyle || 'normal';
}

function isPlaceholderActive() {
    return isEditorEmpty();
}

function setEditorPlaceholder() {
    const { editor } = window.AppState;
    while (editor.firstChild) editor.removeChild(editor.firstChild);
    setPendingEmptyEditorStyle('normal');
    editor.setAttribute('contenteditable', 'true');
    updateEditorPlaceholder();
}

function focusEditor() {
    const { editor } = window.AppState;
    editor.setAttribute('contenteditable', 'true');
    editor.focus();
    let p = editor.querySelector('p');
    if (!p && isEditorEmpty()) {
        p = document.createElement('p');
        p.appendChild(document.createElement('br'));
        editor.appendChild(p);
        updateEditorPlaceholder();
    }
    if (p) {
        const sel = window.getSelection();
        const range = document.createRange();
        range.setStart(p, 0);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
    }
}

function setupPlaceholderBehavior() {
    const { editor } = window.AppState;
    updateEditorPlaceholder();

    // Capture phase keydown: handle first keystroke while placeholder is active
    editor.addEventListener('keydown', (e) => {
        if (!isPlaceholderActive()) return;

        const ignoredKeys = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock',
            'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
            'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'];
        if (ignoredKeys.includes(e.key)) return;

        if (e.key === 'Backspace' || e.key === 'Delete') {
            e.preventDefault();
            return;
        }

        e.preventDefault();
        // Clear any stale savedRange from FontSizeManager to prevent
        // applySize from creating spans at old positions
        if (window.topbarManager) {
            window.topbarManager.savedRange = null;
        }
        while (editor.firstChild) editor.removeChild(editor.firstChild);
        const p = document.createElement('p');
        editor.appendChild(p);
        const pendingStyle = getPendingEmptyEditorStyle();
        if (pendingStyle !== 'normal' && window.StyleManager) {
            window.StyleManager.applyStyleToBlock(p, pendingStyle);
        }
        setPendingEmptyEditorStyle('normal');

        // Apply current font size to the new paragraph so all characters inherit it
        // Use window._lastExplicitFontSize which captures the user's choice before
        // selectionchange resets the input value. Fallback to current input value or default 16.
        const fontSizeVal = window._lastExplicitFontSize || (fontSizeInput && fontSizeInput.value ? parseInt(fontSizeInput.value) : 16);
        if (fontSizeVal && fontSizeVal >= 6 && fontSizeVal <= 96 && fontSizeVal !== 16) {
            p.style.fontSize = fontSizeVal + 'px';
        }

        if (e.key === 'Enter') {
            document.execCommand('insertParagraph', false, null);
        } else if (e.key.length === 1) {
            // Insert character manually to apply auto-capitalize
            const char = e.key;
            const textNode = document.createTextNode(char);
            p.appendChild(textNode);

            // Position cursor after the inserted character
            const sel = window.getSelection();
            const range = document.createRange();
            range.setStart(textNode, 1);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);

            // Auto-capitalize: if this is the first char after sentence ending
            if (window.AutoCapitalize && window.AutoCapitalize._checkAndCapitalize) {
                window.AutoCapitalize._checkAndCapitalize(textNode, 1);
            }
        }
        updateEditorPlaceholder();
    }, true);

    // Click: force cursor to position 0 while placeholder is active
    editor.addEventListener('mouseup', () => {
        if (!isPlaceholderActive()) return;
        const sel = window.getSelection();
        const range = document.createRange();
        let p = editor.querySelector('p');
        if (!p) {
            p = document.createElement('p');
            p.appendChild(document.createElement('br'));
            editor.appendChild(p);
        }
        range.setStart(p, 0);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        updateEditorPlaceholder();
    });

    // MutationObserver: fade the external placeholder in/out with editor emptiness.
    const placeholderObserver = new MutationObserver(() => {
        editor.querySelectorAll('.placeholder-text').forEach(el => el.remove());
        updateEditorPlaceholder();
        window.updateWordCounter && window.updateWordCounter();
    });
    placeholderObserver.observe(editor, { childList: true, subtree: true, characterData: true });
}

// Strip legacy inline margin-bottom from plain paragraphs (pre-v4.1.0 documents
// had margin-bottom: 12px baked in; now handled by CSS on .a4-page p).
function stripLegacyParagraphMargins(rootEl) {
    rootEl.querySelectorAll('p, div').forEach(el => {
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
}

function applyLoadedData(data) {
    const state = window.AppState;

    // Derive pagination mode from the file itself — never rely on localStorage for this.
    // Old docs (v3.2.3 and earlier) have no 'pages' field → always single page mode.
    const hasPageData = Array.isArray(data.pages) && data.pages.length > 0;
    const hasMultiplePages = hasPageData && data.pages.length > 1;
    if (window.PageManager) {
        if (hasMultiplePages) {
            // File was saved with pagination on
            localStorage.setItem('summie_pagination_mode', '1');
            if (!window.PageManager.isPaginationEnabled()) window.PageManager.enablePagination();
            window.PageManager.loadPagesData(data.pages);
            state.editor = document.getElementById('editor');
        } else {
            // Single-page file (old or new, including a paginated file that
            // contains exactly one page) — force pagination off
            localStorage.setItem('summie_pagination_mode', '0');
            if (window.PageManager.isPaginationEnabled()) window.PageManager.disablePagination();
        }
    }

    let loadedHtml = '';
    if (!hasMultiplePages) {
        // For a one-page paginated file, pages[0] is the authoritative copy of
        // the content — loading nothing here used to drop the whole document.
        const rawHtml = hasPageData ? data.pages[0] : (data.content || '');
        loadedHtml = String(rawHtml || '');
        state.editor.innerHTML = window.sanitizeSumdContent(loadedHtml);
        stripLegacyParagraphMargins(state.editor);
    }
    setPendingEmptyEditorStyle('normal');
    state.editor.querySelectorAll('.placeholder-text').forEach(el => el.remove());
    if (!hasMultiplePages && (!loadedHtml.trim() || loadedHtml === '<p>Begin hier met typen...</p>')) {
        setEditorPlaceholder();
    } else {
        updateEditorPlaceholder();
    }
    state.begrippen = data.begrippen || [];

    // Restore bibliography citations (the formatted <p class="summie-citation">
    // entries and any .summie-bibliography block are part of the content HTML;
    // this restores the sidebar list and re-renders the block if present).
    if (window.Bibliography && Array.isArray(data.citations)) {
        window.Bibliography.setCitations(data.citations);
        setTimeout(function () {
            window.Bibliography.renderBibliographyBlock();
            window.Bibliography._updatePanelIfOpen && window.Bibliography._updatePanelIfOpen();
        }, 100);
    }

    // Restore per-document citation settings (style + Vancouver in-text
    // notation) so a reopened document keeps exactly what it was saved with.
    if (window.Bibliography && window.Bibliography.applyDocumentSettings) {
        window.Bibliography.applyDocumentSettings(data);
    }

    // Load per-document custom styles (must be after innerHTML is set so reapply can find blocks)
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

    window.updateBegrippenList && window.updateBegrippenList();
    window.updateInhoudList && window.updateInhoudList();
    window.updateActiveInhoudItem && window.updateActiveInhoudItem();
    try {
        window.highlightBegrippen && window.highlightBegrippen();
    } catch (e) {
        // A malformed begrip in the document shouldn't be able to abort the
        // rest of the load (word count, styles, tab ruler, unsaved baseline).
        console.error('highlightBegrippen failed, continuing with the rest of the load:', e);
    }
    window.TextboxManager && window.TextboxManager.repairInlineTextboxes && window.TextboxManager.repairInlineTextboxes(state.editor);
    window.saveToLocalStorage && window.saveToLocalStorage();
    window.updateWordCounter && window.updateWordCounter();
    window.updateBegrippenCounter && window.updateBegrippenCounter();

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

    // Wait for images/codeblocks to finish restoring, then lock in the saved baseline
    setTimeout(() => {
        if (typeof window.setSavedBaseline === 'function') {
            window.setSavedBaseline();
        } else {
            // Fingerprint helpers not loaded yet — keep legacy baseline keys
            state.lastSavedContent = state.editor.innerHTML;
            try { localStorage.setItem('summie_saved_content', state.editor.innerHTML); } catch (e) { /* ignore */ }
        }
        window.updateUnsavedIndicator && window.updateUnsavedIndicator();
    }, 400);
}

// Unsaved changes detection (used by preload/electron close handler)
window.checkUnsavedChanges = function () {
    // The canonical detector is the document fingerprint in fileio.js; fall
    // back to the legacy innerHTML comparison only while modules are loading.
    if (typeof window.hasUnsavedChanges === 'function') {
        return { hasChanges: window.hasUnsavedChanges() };
    }
    const { editor, begrippen, lastSavedContent, lastSavedBegrippen } = window.AppState;
    const hasChanges = (
        editor.innerHTML !== (lastSavedContent || '') ||
        JSON.stringify(begrippen) !== (lastSavedBegrippen || '[]') ||
        (window.DocumentProtection?.isProtected?.() || false) !== (window.AppState.lastSavedProtection || false)
    );
    return { hasChanges };
};

// Expose
window.isPlaceholderActive = isPlaceholderActive;
window.isEditorEmpty = isEditorEmpty;
window.updateEditorPlaceholder = updateEditorPlaceholder;
window.setPendingEmptyEditorStyle = setPendingEmptyEditorStyle;
window.getPendingEmptyEditorStyle = getPendingEmptyEditorStyle;
window.setEditorPlaceholder = setEditorPlaceholder;
window.focusEditor = focusEditor;
window.setupPlaceholderBehavior = setupPlaceholderBehavior;
window.applyLoadedData = applyLoadedData;

// Track last explicitly-set font size to avoid selectionchange overwriting it
document.addEventListener('DOMContentLoaded', () => {
    const fontSizeInput = document.getElementById('fontSizeInput');
    if (fontSizeInput) {
        fontSizeInput.addEventListener('input', () => {
            const val = parseInt(fontSizeInput.value);
            if (!isNaN(val) && val >= 6 && val <= 96) {
                window._lastExplicitFontSize = val;
            }
        });
    }
});