// ==================== EDITOR CORE ====================
// Placeholder behaviour, focus management, loading data into the editor.

const PLACEHOLDER_TEXT = 'Begin hier met typen...';

function isPlaceholderActive() {
    const { editor } = window.AppState;
    const p = editor.querySelector('p');
    return editor.children.length === 1 && p && p.textContent === PLACEHOLDER_TEXT && p.classList.contains('placeholder-text');
}

function setEditorPlaceholder() {
    const { editor } = window.AppState;
    while (editor.firstChild) editor.removeChild(editor.firstChild);
    const p = document.createElement('p');
    p.className = 'placeholder-text';
    p.textContent = PLACEHOLDER_TEXT;
    editor.appendChild(p);
    editor.setAttribute('contenteditable', 'true');
}

function focusEditor() {
    const { editor } = window.AppState;
    editor.setAttribute('contenteditable', 'true');
    editor.focus();
    const p = editor.querySelector('p');
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
        const p = editor.querySelector('p');
        p.classList.remove('placeholder-text');
        p.textContent = '';

        if (e.key === 'Enter') {
            document.execCommand('insertParagraph', false, null);
        } else if (e.key.length === 1) {
            document.execCommand('insertText', false, e.key);
        }
    }, true);

    // Click: force cursor to position 0 while placeholder is active
    editor.addEventListener('mouseup', () => {
        if (!isPlaceholderActive()) return;
        const sel = window.getSelection();
        const range = document.createRange();
        const p = editor.querySelector('p');
        range.setStart(p, 0);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
    });

    // MutationObserver: re-show placeholder when editor becomes empty,
    // and REMOVE it immediately when real content is added alongside it
    const placeholderObserver = new MutationObserver(() => {
        const placeholderEl = editor.querySelector('.placeholder-text');

        // If placeholder is present but there are other children too, remove it
        if (placeholderEl && editor.children.length > 1) {
            placeholderEl.remove();
            return;
        }

        if (isPlaceholderActive()) return;

        // Re-show placeholder only when editor is truly empty
        const hasRealContent = Array.from(editor.children).some(el =>
            !el.classList.contains('placeholder-text') && (
                el.tagName !== 'P' ||
                el.textContent.trim() !== '' ||
                el.querySelector('img, table, .code-block-wrapper')
            )
        );
        const hasRealElements = editor.querySelector('table, img, .code-block-wrapper');

        if (!hasRealContent && !hasRealElements && editor.innerText.trim() === '') {
            setEditorPlaceholder();
            window.updateWordCounter && window.updateWordCounter();
        }
    });
    placeholderObserver.observe(editor, { childList: true, subtree: true, characterData: true });
}

function applyLoadedData(data) {
    const state = window.AppState;

    // Derive pagination mode from the file itself — never rely on localStorage for this.
    // Old docs (v3.2.3 and earlier) have no 'pages' field → always single page mode.
    if (window.PageManager) {
        const hasMultiplePages = data.pages && data.pages.length > 1;
        if (hasMultiplePages) {
            // File was saved with pagination on
            localStorage.setItem('summie_pagination_mode', '1');
            if (!window.PageManager.isPaginationEnabled()) window.PageManager.enablePagination();
            window.PageManager.loadPagesData(data.pages);
            state.editor = document.getElementById('editor');
        } else {
            // Single-page file (old or new) — force pagination off
            localStorage.setItem('summie_pagination_mode', '0');
            if (window.PageManager.isPaginationEnabled()) window.PageManager.disablePagination();
        }
    }

    state.editor.innerHTML = data.content || '';
    if (!data.content || data.content.trim() === '' || data.content === '<p>Begin hier met typen...</p>') {
        setEditorPlaceholder();
    }
    state.begrippen = data.begrippen || [];

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
    window.highlightBegrippen && window.highlightBegrippen();
    window.saveToLocalStorage && window.saveToLocalStorage();
    window.updateWordCounter && window.updateWordCounter();
    window.updateBegrippenCounter && window.updateBegrippenCounter();

    // Wait for images/codeblocks to finish restoring, then lock in the saved baseline
    setTimeout(() => {
        localStorage.setItem('summie_saved_content', state.editor.innerHTML);
        state.lastSavedContent = state.editor.innerHTML;
        window.updateUnsavedIndicator && window.updateUnsavedIndicator();
    }, 400);
}

// Unsaved changes detection (used by preload/electron close handler)
window.checkUnsavedChanges = function () {
    const { editor, begrippen, lastSavedContent, lastSavedBegrippen } = window.AppState;
    const hasChanges = (
        editor.innerHTML !== (lastSavedContent || '') ||
        JSON.stringify(begrippen) !== (lastSavedBegrippen || '[]')
    );
    return { hasChanges };
};

// Expose
window.isPlaceholderActive = isPlaceholderActive;
window.setEditorPlaceholder = setEditorPlaceholder;
window.focusEditor = focusEditor;
window.setupPlaceholderBehavior = setupPlaceholderBehavior;
window.applyLoadedData = applyLoadedData;