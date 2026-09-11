// ==================== GLOBAL EDITOR FOCUS PRESERVATION ====================
// Moved out of index.html's inline <script> so the page can run under a
// strict Content-Security-Policy without 'unsafe-inline' for scripts.
//
// Two responsibilities:
//  1. Keep the toolbar / sidebar from stealing the contenteditable focus.
//  2. When ANY modal is open, lock the editor so the caret can never drift
//     into the document — and preserve the caret Range so inserts done from
//     inside the modal land at the original cursor position.
//
// The preservation is opt-in per modal: the modal's open() calls
// window.SummieSelection.save() *before* it moves focus into its own
// inputs. Inserts that need the cursor then call restore() first. The
// global mousedown/focusin guards below guarantee that accidental clicks
// inside the editor while a modal is open are swallowed.
(function () {
    const TEXT_INPUT_SELECTOR = 'input, textarea, [contenteditable="true"]:not(#editor), select';

    // ---- modal detection ----
    function isModalOpen() {
        // .modal is used for begripModal, citationModal, referenceModal,
        // imageUrlModal, styleEditorModal, confirmNewModal, updateModal, etc.
        // .summie-dlg-overlay is used by SummieDialogs (custom confirm/prompt).
        // Some landing modals use .modal-overlay.
        return !!document.querySelector('.modal.active, .summie-dlg-overlay, .modal-overlay.active');
    }

    // ---- saved Range for the modal session ----
    let savedModalRange = null;

    function saveEditorSelection() {
        const editor = document.getElementById('editor');
        if (!editor) return;
        // Prefer a live Selection that is still inside the editor
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            try {
                const r = sel.getRangeAt(0);
                // anchorNode inside editor OR range's commonAncestor inside editor
                const inside = editor.contains(r.commonAncestorContainer) || editor.contains(sel.anchorNode);
                if (inside) {
                    savedModalRange = r.cloneRange();
                    if (window.topbarManager) window.topbarManager.savedRange = savedModalRange.cloneRange();
                    return;
                }
            } catch (e) { /* ignore */ }
        }
        // Fallback: reuse the topbar's already-saved range if it points inside editor
        if (window.topbarManager && window.topbarManager.savedRange) {
            try {
                const r = window.topbarManager.savedRange;
                const n = r.commonAncestorContainer || r.startContainer;
                if (editor.contains(n)) {
                    savedModalRange = r.cloneRange();
                    return;
                }
            } catch (e) { /* ignore */ }
        }
        // If nothing valid, keep previous savedModalRange (may be from earlier save)
    }

    function restoreEditorSelection(opts) {
        const editor = document.getElementById('editor');
        if (!editor || !savedModalRange) return false;
        // If selection is already inside editor, don't clobber it — caller can
        // force-restore by passing { force: true }.
        if (!opts || !opts.force) {
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
                return true; // already valid
            }
        }
        try {
            editor.focus({ preventScroll: true });
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(savedModalRange.cloneRange());
            if (window.topbarManager) window.topbarManager.savedRange = savedModalRange.cloneRange();
            return true;
        } catch (e) { return false; }
    }

    function clearSavedSelection() {
        savedModalRange = null;
    }

    // Expose for modals and for insertion helpers
    window.SummieSelection = {
        save: saveEditorSelection,
        restore: restoreEditorSelection,
        clear: clearSavedSelection,
        isModalOpen: isModalOpen,
        get savedRange() { return savedModalRange; },
        set savedRange(v) { savedModalRange = v; }
    };

    // Auto-clear after a modal finishes closing — if no modal is open a
    // moment after the class change, discard the saved range after a tick
    // (so an insert that explicitly restores right after closing still wins).
    const mo = new MutationObserver(function () {
        if (!isModalOpen()) {
            // keep the range for one tick so immediate restores still work
            setTimeout(function () {
                if (!isModalOpen()) clearSavedSelection();
            }, 400);
        }
    });
    mo.observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ['class', 'style'] });
    // also watch for overlay removal (SummieDialogs removes node entirely)
    const moBody = new MutationObserver(function () {
        if (!isModalOpen()) {
            setTimeout(function () { if (!isModalOpen()) clearSavedSelection(); }, 400);
        }
    });
    if (document.body) moBody.observe(document.body, { childList: true });

    // ---- guard: while a modal is open, never let the caret enter the editor ----
    document.addEventListener('mousedown', function (e) {
        const editor = document.getElementById('editor');
        if (!editor) return;

        // Inputs / textareas *inside* a modal are allowed to receive focus
        const insideModalInput = e.target.closest && e.target.closest('.modal, .summie-dlg-overlay, .modal-overlay');
        if (insideModalInput) {
            // Still save if editor hasn't been saved yet — the user's caret
            // is lost the moment they click the first input.
            if (isModalOpen() && !savedModalRange) saveEditorSelection();
            return;
        }

        // If a modal is open and the mousedown target is inside the editor,
        // swallow it — the editor must stay inert so the saved range remains
        // the true caret.
        if (isModalOpen() && editor.contains(e.target)) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        // Original: text inputs outside the editor (e.g. search box) keep focus
        if (e.target.closest(TEXT_INPUT_SELECTOR)) {
            const input = e.target.closest(TEXT_INPUT_SELECTOR);
            // Don't schedule a blur-restore if a modal is open — we want the
            // modal's saved range to survive, not the sidebar input's.
            if (isModalOpen()) return;
            const onBlur = function () {
                input.removeEventListener('blur', onBlur);
                // Only restore if focus is not already back in the editor
                setTimeout(() => {
                    if (isModalOpen()) return;
                    if (document.activeElement !== editor && !editor.contains(document.activeElement)) {
                        if (window.topbarManager) {
                            window.topbarManager.restoreEditorFocus();
                        } else {
                            editor.focus();
                        }
                    }
                }, 0);
            };
            input.addEventListener('blur', onBlur);
            return; // allow normal focus behaviour for inputs
        }

        // For everything else (buttons, tabs, divs, etc.) prevent focus theft
        if (e.target !== editor && !editor.contains(e.target)) {
            // If modal is open, let the overlay handle it; don't focus editor
            if (isModalOpen()) return;
            e.preventDefault();
        }
    }, true); // capture phase so it runs before any other handlers

    // Extra guard: if something manages to focus the editor (e.g. via
    // keyboard) while a modal is open, immediately blur it.
    document.addEventListener('focusin', function (e) {
        const editor = document.getElementById('editor');
        if (!editor) return;
        if (isModalOpen() && (e.target === editor || editor.contains(e.target))) {
            // Don't loop: blur without refocusing
            try { e.target.blur(); } catch (_) {}
            // Refocus the modal's primary input for convenience
            const fallback = document.querySelector('.modal.active input, .modal.active textarea, .modal.active select, .summie-dlg-overlay input, .summie-dlg-overlay textarea');
            if (fallback) {
                try { fallback.focus(); } catch (_) {}
            }
        }
    }, true);
})();
