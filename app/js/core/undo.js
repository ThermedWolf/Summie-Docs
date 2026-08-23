// ==================== UNDO / REDO ====================
// Snapshot-based undo/redo for the whole document.
//
// Every change (typing, formatting, images, tables, code blocks, page breaks,
// begrippen, protection, pagination) is captured as a full document snapshot
// using the same data shape as saveToLocalStorage(), so a snapshot can be
// restored through the canonical load path (applyLoadedData()).
//
// A MutationObserver on #pagesContainer catches all DOM edits; the pages'
// 'input' event additionally catches edits inside <textarea> code blocks,
// which do not mutate the DOM. Begrippen and protection changes do not always
// touch the DOM, so they trigger a capture explicitly (notifyExternalChange).

(function () {
    'use strict';

    const STACK_LIMIT = 100;
    const HEAVY_SNAPSHOT_BYTES = 2 * 1024 * 1024;
    const HEAVY_STACK_LIMIT = 20;
    const CAPTURE_DELAY = 600;   // debounce: continuous typing collapses into one step
    const RESTORE_SETTLE = 550;  // wait for applyLoadedData()'s async restores before
                                 // the history settles again (>= its 400ms baseline)

    let undoStack = [];
    let redoStack = [];
    let currentSnapshot = null;
    let captureTimer = null;
    let dirty = false;
    let restoring = false;

    function getPagesContainer() {
        return document.getElementById('pagesContainer');
    }

    function isPaginationEnabled() {
        return !!(window.PageManager && window.PageManager.isPaginationEnabled());
    }

    // ---- Cursor preservation (best-effort) ----

    // Store the text immediately left and right of the caret. After a full DOM
    // swap the caret is relocated by matching that text, which is robust to the
    // DOM reflows pagination performs between edits.
    function captureCursor() {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return null;
        const range = sel.getRangeAt(0);
        const node = range.startContainer;
        if (!node || node.nodeType !== Node.TEXT_NODE) return null;
        const text = node.textContent || '';
        return {
            prefix: text.substring(0, range.startOffset).slice(-120),
            postfix: text.substring(range.startOffset).slice(0, 120)
        };
    }

    function restoreCursor(descriptor) {
        if (!descriptor || !descriptor.prefix) return false;
        const container = getPagesContainer();
        if (!container) return false;

        let best = null;
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
            const text = node.textContent;
            if (!text || text.trim() === '' || text === '\u200b') continue;
            if (!text.startsWith(descriptor.prefix)) continue;
            const offset = descriptor.prefix.length;
            let score = 0;
            if (descriptor.postfix &&
                text.length >= offset + descriptor.postfix.length &&
                text.startsWith(descriptor.postfix, offset)) {
                score += 3;
            } else if (!descriptor.postfix) {
                score += 1;
            }
            score -= Math.min(Math.abs(text.length - offset), 50);
            if (!best || score > best.score) best = { node, offset };
        }

        if (!best) return false;
        const range = document.createRange();
        range.setStart(best.node, Math.min(best.offset, best.node.length));
        range.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        return true;
    }

    // ---- Snapshot ----

    function deepCopy(value) {
        return JSON.parse(JSON.stringify(value === undefined || value === null ? null : value));
    }

    function captureSnapshot() {
        const state = window.AppState;
        if (!state || !state.editor) return null;

        const paginated = isPaginationEnabled();
        const pagesArr = paginated ? window.PageManager.getPagesData() : null;

        // Collapse the degenerate "paginated but only one page" case into the
        // single-page representation, otherwise applyLoadedData() would neither
        // load pages nor content for it.
        let content = null;
        let pages = null;
        if (pagesArr && pagesArr.length > 1) {
            pages = pagesArr;
        } else {
            content = pagesArr && pagesArr.length === 1 ? pagesArr[0] : state.editor.innerHTML;
        }

        return {
            content,
            pages,
            begrippen: deepCopy(state.begrippen),
            protected: !!(window.DocumentProtection && window.DocumentProtection.isProtected()),
            references: window.ReferencesManager ? deepCopy(window.ReferencesManager.getSerialised()) : [],
            citations: window.Bibliography ? deepCopy(window.Bibliography.getSerialised()) : [],
            images: window.imageManager ? deepCopy(window.imageManager.getImagesData()) : {},
            codeBlocks: window.codeBlockManager ? deepCopy(window.codeBlockManager.getCodeBlocksData()) : [],
            customStyles: window.StyleManager ? deepCopy(window.StyleManager.getCustomStyles()) : {},
            tabRulerIndents: window.TabRuler ? deepCopy(window.TabRuler.getIndentsData()) : null,
            headerFooter: window.HeaderFooter ? deepCopy(window.HeaderFooter.getData()) : null,
            cursor: captureCursor()
        };
    }

    // Cheap equality check on the fields that describe the document; cosmetic
    // mutations (highlight rewraps, page badges, ruler re-renders) never create
    // an undo step on their own.
    function snapshotsEqual(a, b) {
        if (!a || !b) return false;
        // Every captured field must participate: leaving any out meant edits
        // to it never created an undo step AND left stale values inside
        // currentSnapshot — so Ctrl+Z/Ctrl+Y silently resurrected old content.
        return JSON.stringify([a.content, a.pages, a.begrippen, a.protected, a.references, a.citations,
            a.images, a.codeBlocks, a.customStyles, a.tabRulerIndents, a.headerFooter])
            === JSON.stringify([b.content, b.pages, b.begrippen, b.protected, b.references, b.citations,
                b.images, b.codeBlocks, b.customStyles, b.tabRulerIndents, b.headerFooter]);
    }

    function enforceStackLimit() {
        let limit = STACK_LIMIT;
        if (currentSnapshot) {
            const bytes = JSON.stringify(currentSnapshot).length;
            if (bytes > HEAVY_SNAPSHOT_BYTES) limit = HEAVY_STACK_LIMIT;
        }
        while (undoStack.length > limit) undoStack.shift();
    }

    // ---- Capture ----

    function doCapture() {
        dirty = false;
        clearTimeout(captureTimer);
        if (restoring) return;
        if (!window.AppState || !window.AppState.editor) return;

        const snap = captureSnapshot();
        if (!snap) return;

        if (!currentSnapshot) {
            currentSnapshot = snap;
            return;
        }
        if (snapshotsEqual(snap, currentSnapshot)) return;

        undoStack.push(currentSnapshot);
        enforceStackLimit();
        redoStack.length = 0;
        currentSnapshot = snap;
        updateButtons();
    }

    function scheduleCapture(delay) {
        dirty = true;
        clearTimeout(captureTimer);
        if (restoring) return; // mutations caused by our own restore are ignored
        captureTimer = setTimeout(doCapture, delay || CAPTURE_DELAY);
    }

    // Push any pending, not-yet-captured edit before undo runs so that pressing
    // Ctrl+Z right after typing reliably undoes that typing.
    function flushCapture() {
        if (!dirty) return;
        clearTimeout(captureTimer);
        doCapture();
    }

    // ---- Restore ----

    function applySnapshot(snap) {
        const state = window.AppState;

        const leftoverMarker = document.getElementById('summie-pagination-cursor');
        if (leftoverMarker) leftoverMarker.remove();

        const prevSavedContent = state.lastSavedContent;
        const prevSavedBegrippen = state.lastSavedBegrippen;
        const prevSavedProtection = state.lastSavedProtection;
        const prevSavedFingerprint = state.lastSavedFingerprint || null;

        if (window.DocumentProtection) window.DocumentProtection.setProtected(!!snap.protected);

        const data = {
            content: snap.content || '',
            pages: snap.pages || null,
            begrippen: deepCopy(snap.begrippen || []),
            references: (snap.references || []).map(r => ({ id: r.id, name: r.name })),
            citations: deepCopy(snap.citations || []),
            images: snap.images || {},
            codeBlocks: snap.codeBlocks || [],
            customStyles: snap.customStyles || {},
            tabRulerIndents: snap.tabRulerIndents || null,
            headerFooter: snap.headerFooter || null,
            timestamp: new Date().toISOString()
        };

        window.applyLoadedData(data);

        if (window.ReferencesManager && snap.references && snap.references.length > 0) {
            window.ReferencesManager.references = (snap.references || []).map(r => ({ id: r.id, name: r.name }));
            window.ReferencesManager.restoreFromEditor();
        }

        // applyLoadedData() overwrites lastSaved* in a 400ms timer (it assumes a
        // full document load). Undo must restore the pre-undo baseline instead so
        // the unsaved-changes detection stays unchanged by history navigation.
        setTimeout(() => {
            state.lastSavedContent = prevSavedContent;
            state.lastSavedBegrippen = prevSavedBegrippen;
            state.lastSavedProtection = prevSavedProtection;
            // The fingerprint is what dirty-state detection actually consults;
            // pin it back so undoing doesn't mark a saved document as modified
            // (or a modified one as clean). When no baseline existed yet, let
            // the deferred baseline from applyLoadedData stand.
            if (prevSavedFingerprint) {
                state.lastSavedFingerprint = prevSavedFingerprint;
                try { localStorage.setItem('summie_saved_fingerprint', prevSavedFingerprint); } catch (e) { /* ignore */ }
            }
            finalizeRestore(snap);
        }, RESTORE_SETTLE);
    }

    function finalizeRestore(snap) {
        clearTimeout(captureTimer);
        restoring = false;
        dirty = false;

        // Re-read the actual DOM so currentSnapshot always matches what the user
        // sees (this also forbids applying the same step twice in sequence).
        currentSnapshot = captureSnapshot();

        restoreCursor(snap && snap.cursor);
        const editor = window.AppState && window.AppState.editor;
        if (editor && editor.isConnected) {
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) editor.focus();
        }
        window.updateUnsavedIndicator && window.updateUnsavedIndicator();
        updateButtons();
    }

    function undo() {
        if (restoring) return;
        flushCapture();
        if (undoStack.length === 0) return;
        if (!currentSnapshot) currentSnapshot = captureSnapshot();

        const target = undoStack.pop();
        redoStack.push(currentSnapshot);
        restoring = true;
        try {
            applySnapshot(target);
        } catch (err) {
            console.error('Undo failed:', err);
            restoring = false;
        }
        updateButtons();
    }

    function redo() {
        if (restoring) return;
        flushCapture();
        if (redoStack.length === 0) return;

        const target = redoStack.pop();
        undoStack.push(currentSnapshot);
        restoring = true;
        try {
            applySnapshot(target);
        } catch (err) {
            console.error('Redo failed:', err);
            restoring = false;
        }
        updateButtons();
    }

    // Start a fresh history for a newly loaded/created document. The loaded
    // state becomes the undo baseline.
    function resetBaseline() {
        undoStack.length = 0;
        redoStack.length = 0;
        currentSnapshot = captureSnapshot();
        updateButtons();
    }

    function notifyExternalChange() {
        // Begrippen/protection changes may not touch the DOM; capture with a
        // small delay so any accompanying DOM updates settle first.
        scheduleCapture(120);
    }

    // ---- Buttons & shortcuts ----

    function updateButtons() {
        const undoBtn = document.getElementById('undoBtn');
        const redoBtn = document.getElementById('redoBtn');
        if (undoBtn) {
            undoBtn.disabled = undoStack.length === 0;
            undoBtn.title = window.t ? window.t('Ongedaan maken (Ctrl+Z)') : 'Ongedaan maken (Ctrl+Z)';
        }
        if (redoBtn) {
            redoBtn.disabled = redoStack.length === 0;
            redoBtn.title = window.t ? window.t('Opnieuw (Ctrl+Y)') : 'Opnieuw (Ctrl+Y)';
        }
    }

    function handleKeydown(e) {
        if (!(e.ctrlKey || e.metaKey)) return;
        const key = (e.key || '').toLowerCase();
        const isUndo = !e.altKey && !e.shiftKey && key === 'z';
        const isRedo = !e.altKey && ((e.shiftKey && key === 'z') || key === 'y');
        if (!isUndo && !isRedo) return;

        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
            // Native undo/redo already applies in form fields (begrip modal,
            // search box, document name, code-block textarea).
            return;
        }
        e.preventDefault();
        if (isUndo) undo();
        else redo();
    }

    function init() {
        const undoBtn = document.getElementById('undoBtn');
        const redoBtn = document.getElementById('redoBtn');
        if (undoBtn) undoBtn.addEventListener('click', () => undo());
        if (redoBtn) redoBtn.addEventListener('click', () => redo());

        const container = getPagesContainer();
        if (container) {
            if (window.MutationObserver) {
                const observer = new MutationObserver(() => scheduleCapture(CAPTURE_DELAY));
                observer.observe(container, {
                    childList: true,
                    subtree: true,
                    characterData: true,
                    attributes: true,
                    attributeFilter: ['style', 'class', 'data-style', 'src', 'contenteditable', 'data-tabstops', 'data-indent-level']
                });
            }
            container.addEventListener('input', () => scheduleCapture(CAPTURE_DELAY));
        }

        document.addEventListener('keydown', handleKeydown);
        updateButtons();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.UndoManager = {
        undo,
        redo,
        resetBaseline,
        notifyExternalChange,
        canUndo: () => undoStack.length > 0,
        canRedo: () => redoStack.length > 0
    };
})();