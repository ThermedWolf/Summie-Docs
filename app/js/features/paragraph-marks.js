// ==================== PARAGRAAFTEKENS ====================
// Toont/verbergt ¶-tekens aan het einde van lege en gevulde paragrafen.
// Toggle via de toolbar-knop of Ctrl+Shift+8.

window.ParagraphMarks = (function () {
    'use strict';

    const STORAGE_KEY = 'summie_pilcrow_visible';
    const EDITOR_CLASS = 'show-pilcrow';

    let _visible = false;

    function getEditor() {
        return document.getElementById('editor');
    }

    function setVisible(on) {
        _visible = on;
        const editor = getEditor();
        if (editor) editor.classList.toggle(EDITOR_CLASS, on);

        const btn = document.getElementById('togglePilcrowBtn');
        if (btn) btn.classList.toggle('active', on);

        try { localStorage.setItem(STORAGE_KEY, on ? '1' : '0'); } catch { }
    }

    function toggle() {
        setVisible(!_visible);
    }

    function init() {
        // Restore persisted state
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored === '1') setVisible(true);
        } catch { }

        // Toolbar button
        const btn = document.getElementById('togglePilcrowBtn');
        if (btn) btn.addEventListener('click', toggle);

        // Keyboard shortcut: Ctrl+Shift+8  (¶ on many keyboards)
        document.addEventListener('keydown', e => {
            if (e.ctrlKey && e.shiftKey && !e.altKey && e.key === '8') {
                e.preventDefault();
                toggle();
            }
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else setTimeout(init, 0);

    return { toggle, setVisible };
})();