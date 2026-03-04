// ==================== ELEMENT PROTECTION ====================
// Shared infrastructure:
//  1. Backspace/Delete guard for tables and code-block-wrappers
//  2. Context tab container (slide-in topbar tabs)
//  3. Context panel show/hide/switch API used by codeblock-controls and table-controls

window.ElementProtection = (function () {
    'use strict';

    // ── Deletion Guard ────────────────────────────────────────────────────

    function shouldBlockDeletion(e) {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return false;
        const range = sel.getRangeAt(0);
        const editor = document.getElementById('editor');
        if (!editor) return false;

        function nodeEl(node) {
            return node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
        }
        const anchorEl = nodeEl(range.startContainer);
        const endEl = nodeEl(range.endContainer);

        // ── Inside a code-block-wrapper — never block ────────────────────
        // The textarea and name input handle their own keys.
        // Only block when the cursor in the EDITOR is adjacent to the wrapper.
        const cbWrapper = anchorEl.closest && anchorEl.closest('.code-block-wrapper');
        if (cbWrapper && editor.contains(cbWrapper)) {
            return false; // always allow — let the element inside handle it
        }

        // ── Inside a table cell ──────────────────────────────────────────
        const table = anchorEl.closest && anchorEl.closest('table');
        if (table && editor.contains(table)) {
            const cell = anchorEl.closest('th, td');
            if (cell) {
                // Block if selection crosses out of this cell
                if (!cell.contains(range.endContainer)) return true;

                // Block Backspace at start of cell content
                if (e.key === 'Backspace' && range.collapsed) {
                    let node = range.startContainer;
                    let offset = range.startOffset;
                    // At offset 0 of the cell's first text/child
                    if (offset === 0) {
                        // Check nothing before this node inside the cell
                        if (node === cell || (node.parentElement === cell && !node.previousSibling)) return true;
                        if (node.nodeType === Node.TEXT_NODE && node.parentElement === cell && !node.previousSibling) return true;
                    }
                }

                // Block Delete at end of cell content
                if (e.key === 'Delete' && range.collapsed) {
                    let node = range.startContainer;
                    let offset = range.startOffset;
                    const len = node.nodeType === Node.TEXT_NODE
                        ? node.textContent.length
                        : node.childNodes.length;
                    if (offset === len) {
                        // Check nothing after this node inside the cell
                        if (node === cell) return true;
                        if (node.nodeType === Node.TEXT_NODE && node.parentElement === cell && !node.nextSibling) return true;
                    }
                }

                return false; // normal editing within cell — allow
            }
            return true; // in table but not in a cell — block
        }

        // ── Cursor adjacent to a protected element (Delete / Backspace) ──
        // Walk up the ancestor chain — the cursor may be inside a <p> whose
        // sibling in the editor IS the protected element.

        function isProtected(n) {
            if (!n || n.nodeType !== Node.ELEMENT_NODE) return false;
            if (n.nodeName === 'TABLE' && editor.contains(n)) return true;
            if (n.classList.contains('code-block-wrapper') && editor.contains(n)) return true;
            return false;
        }

        function skipInert(n, dir) {
            // Skip empty text nodes and <br>s in given direction (next/prev)
            while (n && ((n.nodeType === Node.TEXT_NODE && !n.textContent.trim()) || n.nodeName === 'BR')) {
                n = dir === 'next' ? n.nextSibling : n.previousSibling;
            }
            return n;
        }

        if (e.key === 'Delete' && range.collapsed) {
            let cur = range.startContainer, curOffset = range.startOffset;
            while (cur && cur !== editor) {
                let next = null;
                if (cur.nodeType === Node.TEXT_NODE) {
                    if (curOffset === cur.textContent.length) next = skipInert(cur.nextSibling, 'next');
                } else {
                    next = skipInert(cur.childNodes[curOffset] || null, 'next');
                }
                if (isProtected(next)) return true;
                // Only continue walking up if we are at the END of cur
                const len = cur.nodeType === Node.TEXT_NODE ? cur.textContent.length : cur.childNodes.length;
                if (curOffset !== len) break;
                curOffset = Array.from(cur.parentNode.childNodes).indexOf(cur) + 1;
                cur = cur.parentNode;
            }
        }

        if (e.key === 'Backspace' && range.collapsed) {
            let cur = range.startContainer, curOffset = range.startOffset;
            while (cur && cur !== editor) {
                let prev = null;
                if (cur.nodeType === Node.TEXT_NODE) {
                    if (curOffset === 0) prev = skipInert(cur.previousSibling, 'prev');
                } else {
                    prev = skipInert(curOffset > 0 ? cur.childNodes[curOffset - 1] : null, 'prev');
                }
                if (isProtected(prev)) return true;
                // Only continue walking up if we are at the START of cur
                if (curOffset !== 0) break;
                curOffset = Array.from(cur.parentNode.childNodes).indexOf(cur);
                cur = cur.parentNode;
            }
        }

        return false;
    }

    // ── Context Tab State ─────────────────────────────────────────────────

    let _currentContext = null; // 'code' | 'table' | null
    let _currentPanel = null;
    let _hideTimer = null;

    const CONTEXT_TABS = {
        code: ['codeblock-styling'],
        table: ['tabel-indeling', 'tabel-ontwerp'],
    };

    // ── Build Context Tab Container ───────────────────────────────────────

    function buildContainer() {
        if (document.getElementById('contextTabsContainer')) return;

        const topbarLeft = document.querySelector('.topbar-sections-left');
        if (!topbarLeft) return;

        const container = document.createElement('div');
        container.id = 'contextTabsContainer';
        container.className = 'context-tabs-container';
        topbarLeft.appendChild(container);

        // Separator line
        const sep = document.createElement('div');
        sep.className = 'ctx-separator';
        container.appendChild(sep);
    }

    // Register a tab (called by codeblock-controls / table-controls)
    function registerTab(id, label) {
        const container = document.getElementById('contextTabsContainer');
        if (!container) return;
        if (document.getElementById('ctx-tab-' + id)) return; // already registered

        const tab = document.createElement('div');
        // Use exact same structure as .topbar-section
        tab.className = 'topbar-section context-tab';
        tab.id = 'ctx-tab-' + id;
        tab.dataset.ctxPanel = id;
        tab.setAttribute('data-section', id); // makes existing topbar CSS apply
        tab.innerHTML = `<span class="section-text">${label}</span><div class="section-underline"></div>`;
        tab.style.display = 'none'; // hidden until context activates

        // Prevent focus loss on click
        tab.addEventListener('mousedown', e => e.preventDefault());
        tab.addEventListener('click', () => switchPanel(id));

        container.appendChild(tab);
    }

    // ── Show / Hide ───────────────────────────────────────────────────────

    function showContext(context) {
        if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null; }

        const isNew = _currentContext !== context;
        _currentContext = context;

        const container = document.getElementById('contextTabsContainer');
        if (!container) return;

        // Make the tabs for this context visible, hide others
        container.querySelectorAll('.context-tab').forEach(tab => {
            const belongs = (CONTEXT_TABS[context] || []).includes(tab.dataset.ctxPanel);
            tab.style.display = belongs ? '' : 'none';
        });
        container.classList.add('ctx-active');

        if (isNew) {
            // First time entering this context: auto-switch to its first panel
            const firstTab = (CONTEXT_TABS[context] || [])[0];
            if (firstTab) switchPanel(firstTab);
        } else {
            // Re-entering same context (e.g. clicking back into same codeblock):
            // restore active state on whichever tab was last active
            const lastPanel = _currentPanel || (CONTEXT_TABS[context] || [])[0];
            if (lastPanel) {
                document.querySelectorAll('.context-tab').forEach(t => t.classList.remove('active'));
                const tab = document.getElementById('ctx-tab-' + lastPanel);
                if (tab) tab.classList.add('active');
            }
        }
    }

    // Make context tabs visible but NOT active — a normal section panel is showing.
    // Called when switching topbar sections while a codeblock/table is still focused.
    function restoreContextUI() {
        if (!_currentContext) return;
        const container = document.getElementById('contextTabsContainer');
        if (!container) return;
        container.querySelectorAll('.context-tab').forEach(tab => {
            const belongs = (CONTEXT_TABS[_currentContext] || []).includes(tab.dataset.ctxPanel);
            tab.style.display = belongs ? '' : 'none';
            tab.classList.remove('active'); // inactive — a normal section is currently active
        });
        container.classList.add('ctx-active');
    }

    function hideContext(immediate) {
        if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null; }

        const doHide = () => {
            _currentContext = null;

            const container = document.getElementById('contextTabsContainer');
            if (container) {
                container.querySelectorAll('.context-tab').forEach(t => t.style.display = 'none');
                container.classList.remove('ctx-active');
            }

            // Hide all ctx panels and restore the previously active main section
            document.querySelectorAll('.ctx-panel').forEach(p => {
                p.classList.remove('active');
                p.style.display = 'none';
            });

            // Re-activate the matching main section panel (bewerken is always the fallback)
            const topbarSections = document.querySelectorAll('.topbar-section:not(.context-tab)');
            let activeSection = null;
            topbarSections.forEach(s => { if (s.classList.contains('active')) activeSection = s; });
            const sectionName = activeSection ? activeSection.dataset.section : 'bewerken';
            const mainPanel = document.querySelector(`[data-content="${sectionName}"]`);
            if (mainPanel) {
                mainPanel.style.display = '';
                mainPanel.classList.add('active');
            }

            _currentPanel = null;
        };

        if (immediate) { doHide(); }
        else { _hideTimer = setTimeout(doHide, 220); }
    }

    function switchPanel(panelId) {
        if (!panelId) return;
        _currentPanel = panelId;

        // Deactivate all toolbar-content panels
        document.querySelectorAll('.toolbar-content').forEach(p => {
            p.classList.remove('active');
            p.style.display = 'none';
        });

        // Activate target ctx panel
        const panel = document.getElementById('ctx-panel-' + panelId);
        if (panel) {
            panel.style.display = '';
            panel.classList.add('active');
        }

        // Mark context tab as active, clear active from other context tabs
        // but leave normal section tabs alone — user can still navigate freely
        document.querySelectorAll('.context-tab').forEach(t => t.classList.remove('active'));
        const tab = document.getElementById('ctx-tab-' + panelId);
        if (tab) tab.classList.add('active');

        // Also clear active from normal section tabs since a context panel is now showing
        document.querySelectorAll('.topbar-section:not(.context-tab)').forEach(s => s.classList.remove('active'));
    }

    // ── Cancel hide (called from controls when they get focus back) ───────

    function cancelHide() {
        if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null; }
    }

    // ── Init ──────────────────────────────────────────────────────────────

    function init() {
        buildContainer();

        const editor = document.getElementById('editor');
        if (!editor) return;

        // Deletion protection — capture phase, runs before all other keydown handlers
        editor.addEventListener('keydown', e => {
            if (e.key === 'Backspace' || e.key === 'Delete') {
                if (shouldBlockDeletion(e)) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            }
        }, true);

        // Hide when clicking outside editor + toolbar + context container
        document.addEventListener('click', e => {
            if (!_currentContext) return;
            const editorEl = document.getElementById('editor');
            const toolbarEl = document.querySelector('.section-toolbar');
            const ctxEl = document.getElementById('contextTabsContainer');
            const topbarEl = document.querySelector('.topbar');
            if (editorEl && editorEl.contains(e.target)) return;
            if (toolbarEl && toolbarEl.contains(e.target)) return;
            if (ctxEl && ctxEl.contains(e.target)) return;
            if (topbarEl && topbarEl.contains(e.target)) return;
            hideContext(false);
        });

        // Normal section tabs: when context is active, keep context tabs visible but
        // let topbar.js handle switching the toolbar panel to the selected section.
        // Context tabs only disappear when the codeblock/table actually loses focus.
        // (No listener needed here — topbar.js switchSection handles everything)
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else setTimeout(init, 0);

    // Public API
    return {
        registerTab,
        showContext,
        hideContext,
        cancelHide,
        switchPanel,
        restoreContextUI,
        getContext: () => _currentContext,
    };

})();