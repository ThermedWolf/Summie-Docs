// ==================== GLOBAL EDITOR FOCUS PRESERVATION ====================
// Moved out of index.html's inline <script> so the page can run under a
// strict Content-Security-Policy without 'unsafe-inline' for scripts.
(function () {
    const TEXT_INPUT_SELECTOR = 'input, textarea, [contenteditable="true"]:not(#editor), select';

    // Prevent any click outside of text inputs from stealing focus from the editor
    document.addEventListener('mousedown', function (e) {
        const editor = document.getElementById('editor');
        if (!editor) return;

        // If the click target is a text input (not the editor), let it focus normally
        // but schedule a focus-restore once that input blurs
        if (e.target.closest(TEXT_INPUT_SELECTOR)) {
            const input = e.target.closest(TEXT_INPUT_SELECTOR);
            const onBlur = function () {
                input.removeEventListener('blur', onBlur);
                // Only restore if focus is not already back in the editor
                setTimeout(() => {
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
            e.preventDefault();
        }
    }, true); // capture phase so it runs before any other handlers
})();