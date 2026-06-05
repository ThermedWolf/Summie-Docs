// ==================== TEXTBOX ====================
// Floating/inline tekstvakken met resize handles en een context-tab voor opmaak.

window.TextboxManager = (function () {
    'use strict';

    const CTX_ID = 'textbox-opmaak';
    const CTX_LABEL = 'Tekstvak';
    const CTX_KEY = 'textbox';

    let _activeBox = null;

    // ── Helpers ────────────────────────────────────────────────────────────
    function getEditor() { return document.getElementById('editor'); }

    function hexFromAny(color) {
        if (!color || color === 'transparent') return '#ffffff';
        if (color.startsWith('#')) {
            if (color.length === 4) return '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3];
            return color;
        }
        const m = color.match(/rgb[a]?\((\d+),\s*(\d+),\s*(\d+)/);
        if (m) return '#' + [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
        return '#ffffff';
    }

    // ── Create textbox ─────────────────────────────────────────────────────
    function insertTextbox() {
        const editor = getEditor();
        if (!editor) return;

        const box = document.createElement('div');
        box.className = 'summie-textbox';
        box.setAttribute('data-textbox', '1');
        box.setAttribute('data-floating', '1'); // default = floating
        box.contentEditable = 'false';

        // Inner editable area
        const inner = document.createElement('div');
        inner.className = 'summie-textbox-inner';
        inner.contentEditable = 'true';
        inner.setAttribute('data-placeholder', 'Typ hier...');
        inner.innerHTML = '<p>Typ hier...</p>';
        box.appendChild(inner);

        // Resize handle
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'summie-textbox-resize';
        resizeHandle.title = 'Formaat aanpassen';
        box.appendChild(resizeHandle);

        // Drag handle
        const dragHandle = document.createElement('div');
        dragHandle.className = 'summie-textbox-drag';
        dragHandle.title = 'Verslepen';
        dragHandle.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>`;
        box.appendChild(dragHandle);

        editor.appendChild(box);
        _setupDrag(box, dragHandle);
        _setupResize(box, resizeHandle);
        _setupFocus(box);

        // Position floating box near cursor
        const editorRect = editor.getBoundingClientRect();
        box.style.left = '40px';
        box.style.top = '60px';

        // Activate context tab
        _setActive(box);
        inner.focus();

        window.updateUnsavedIndicator && window.updateUnsavedIndicator();
    }

    // ── Drag (floating mode only) ──────────────────────────────────────────
    function _setupDrag(box, handle) {
        handle.addEventListener('mousedown', e => {
            if (box.getAttribute('data-floating') !== '1') return;
            e.preventDefault();
            const startX = e.clientX - box.offsetLeft;
            const startY = e.clientY - box.offsetTop;
            const onMove = ev => {
                box.style.left = (ev.clientX - startX) + 'px';
                box.style.top = (ev.clientY - startY) + 'px';
            };
            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                window.updateUnsavedIndicator && window.updateUnsavedIndicator();
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    }

    // ── Resize ─────────────────────────────────────────────────────────────
    function _setupResize(box, handle) {
        handle.addEventListener('mousedown', e => {
            e.preventDefault();
            const startX = e.clientX, startY = e.clientY;
            const startW = box.offsetWidth, startH = box.offsetHeight;
            const onMove = ev => {
                box.style.width = Math.max(120, startW + ev.clientX - startX) + 'px';
                box.style.height = Math.max(60, startH + ev.clientY - startY) + 'px';
            };
            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                window.updateUnsavedIndicator && window.updateUnsavedIndicator();
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    }

    // ── Focus / blur ───────────────────────────────────────────────────────
    function _setupFocus(box) {
        const inner = box.querySelector('.summie-textbox-inner');
        inner.addEventListener('focus', () => _setActive(box));
        inner.addEventListener('blur', () => {
            setTimeout(() => {
                const ae = document.activeElement;
                if (ae && ae.closest && ae.closest('[data-textbox]')) return;
                if (ae && ae.closest && ae.closest('#contextTabsContainer')) return;
                if (ae && ae.closest && ae.closest('.section-toolbar')) return;
                _clearActive();
            }, 120);
        });
        // Click on box border area
        box.addEventListener('mousedown', e => {
            if (e.target === box) {
                e.preventDefault();
                inner.focus();
            }
        });
    }

    function _setActive(box) {
        _activeBox = box;
        box.classList.add('summie-textbox--active');
        if (window.ElementProtection) {
            window.ElementProtection.showContext(CTX_KEY);
        }
        _syncPanelToBox(box);
    }

    function _clearActive() {
        if (_activeBox) _activeBox.classList.remove('summie-textbox--active');
        _activeBox = null;
        if (window.ElementProtection) {
            window.ElementProtection.hideContext(false);
        }
    }

    // ── Context panel ──────────────────────────────────────────────────────
    function _buildPanel() {
        const toolbar = document.querySelector('.section-toolbar');
        if (!toolbar || document.getElementById('ctx-panel-' + CTX_ID)) return;

        const panel = document.createElement('div');
        panel.className = 'toolbar-content ctx-panel';
        panel.id = 'ctx-panel-' + CTX_ID;
        panel.style.display = 'none';

        panel.innerHTML = `
        <div class="toolbar-group animate-item" style="animation-delay:0.05s">
            <label class="toolbar-label">Positie</label>
            <div class="toolbar-buttons">
                <button class="btn-toolbar" id="tbxModeFloating" title="Zwevend (vrij verplaatsbaar)">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="2" y="7" width="11" height="10" rx="2"/>
                        <line x1="15" y1="5" x2="22" y2="5"/><line x1="15" y1="9" x2="22" y2="9"/>
                        <line x1="15" y1="13" x2="22" y2="13"/><line x1="15" y1="17" x2="22" y2="17"/>
                    </svg>
                    <span>Zwevend</span>
                </button>
                <button class="btn-toolbar" id="tbxModeInline" title="In tekststroom">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="3" y1="5" x2="21" y2="5"/>
                        <rect x="3" y="8" width="11" height="8" rx="2"/>
                        <line x1="3" y1="19" x2="21" y2="19"/>
                    </svg>
                    <span>In tekst</span>
                </button>
            </div>
        </div>

        <div class="toolbar-separator animate-item" style="animation-delay:0.1s"></div>

        <div class="toolbar-group animate-item" style="animation-delay:0.15s">
            <label class="toolbar-label">Kleuren</label>
            <div class="toolbar-buttons">
                <div class="color-picker-group">
                    <label class="color-picker-label" for="tbxBgColor">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
                        Achtergrond
                    </label>
                    <input type="color" id="tbxBgColor" class="toolbar-color-input" value="#ffffff" title="Achtergrondkleur">
                </div>
                <div class="color-picker-group">
                    <label class="color-picker-label" for="tbxTextColor">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h4l10-10-4-4L4 16v4z"/></svg>
                        Tekst
                    </label>
                    <input type="color" id="tbxTextColor" class="toolbar-color-input" value="#1e293b" title="Tekstkleur">
                </div>
                <div class="color-picker-group">
                    <label class="color-picker-label" for="tbxBorderColor">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="4 2"/></svg>
                        Rand
                    </label>
                    <input type="color" id="tbxBorderColor" class="toolbar-color-input" value="#cbd5e1" title="Randkleur">
                </div>
            </div>
        </div>

        <div class="toolbar-separator animate-item" style="animation-delay:0.2s"></div>

        <div class="toolbar-group animate-item" style="animation-delay:0.25s">
            <label class="toolbar-label">Lettergrootte</label>
            <div class="toolbar-buttons">
                <select id="tbxFontSize" class="toolbar-select" title="Lettergrootte">
                    <option value="11">11</option>
                    <option value="12">12</option>
                    <option value="13">13</option>
                    <option value="14" selected>14</option>
                    <option value="16">16</option>
                    <option value="18">18</option>
                    <option value="20">20</option>
                    <option value="24">24</option>
                    <option value="28">28</option>
                    <option value="32">32</option>
                </select>
                <span class="toolbar-unit">pt</span>
            </div>
        </div>

        <div class="toolbar-separator animate-item" style="animation-delay:0.3s"></div>

        <div class="toolbar-group animate-item" style="animation-delay:0.35s">
            <label class="toolbar-label">Acties</label>
            <div class="toolbar-buttons">
                <button class="btn-toolbar btn-toolbar-danger" id="tbxDelete">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                    </svg>
                    <span>Verwijderen</span>
                </button>
            </div>
        </div>
        `;

        toolbar.appendChild(panel);
        _wirePanel(panel);
    }

    function _wirePanel(panel) {
        // Positie toggle
        panel.querySelector('#tbxModeFloating').addEventListener('click', () => _setMode('floating'));
        panel.querySelector('#tbxModeInline').addEventListener('click', () => _setMode('inline'));

        // Kleuren
        panel.querySelector('#tbxBgColor').addEventListener('input', e => {
            if (_activeBox) { _activeBox.style.background = e.target.value; window.updateUnsavedIndicator && window.updateUnsavedIndicator(); }
        });
        panel.querySelector('#tbxTextColor').addEventListener('input', e => {
            if (_activeBox) { _activeBox.querySelector('.summie-textbox-inner').style.color = e.target.value; window.updateUnsavedIndicator && window.updateUnsavedIndicator(); }
        });
        panel.querySelector('#tbxBorderColor').addEventListener('input', e => {
            if (_activeBox) { _activeBox.style.borderColor = e.target.value; window.updateUnsavedIndicator && window.updateUnsavedIndicator(); }
        });

        // Lettergrootte
        panel.querySelector('#tbxFontSize').addEventListener('change', e => {
            if (_activeBox) { _activeBox.querySelector('.summie-textbox-inner').style.fontSize = e.target.value + 'pt'; window.updateUnsavedIndicator && window.updateUnsavedIndicator(); }
        });

        // Verwijderen
        panel.querySelector('#tbxDelete').addEventListener('click', () => {
            if (_activeBox && confirm('Tekstvak verwijderen?')) {
                _activeBox.remove();
                _clearActive();
                window.updateUnsavedIndicator && window.updateUnsavedIndicator();
            }
        });
    }

    function _syncPanelToBox(box) {
        const bgInput = document.getElementById('tbxBgColor');
        const textInput = document.getElementById('tbxTextColor');
        const borderInput = document.getElementById('tbxBorderColor');
        const sizeSelect = document.getElementById('tbxFontSize');
        const floatingBtn = document.getElementById('tbxModeFloating');
        const inlineBtn = document.getElementById('tbxModeInline');
        if (!bgInput) return;

        const inner = box.querySelector('.summie-textbox-inner');
        const isFloating = box.getAttribute('data-floating') === '1';

        bgInput.value = hexFromAny(box.style.background || '#ffffff');
        textInput.value = hexFromAny(inner ? inner.style.color || '#1e293b' : '#1e293b');
        borderInput.value = hexFromAny(box.style.borderColor || '#cbd5e1');

        const fs = inner ? parseFloat(inner.style.fontSize) : 14;
        if (sizeSelect) sizeSelect.value = fs || 14;

        floatingBtn && floatingBtn.classList.toggle('active', isFloating);
        inlineBtn && inlineBtn.classList.toggle('active', !isFloating);
    }

    function _setMode(mode) {
        if (!_activeBox) return;
        const isFloating = mode === 'floating';
        _activeBox.setAttribute('data-floating', isFloating ? '1' : '0');
        _activeBox.classList.toggle('summie-textbox--inline', !isFloating);
        _syncPanelToBox(_activeBox);
        window.updateUnsavedIndicator && window.updateUnsavedIndicator();
    }

    // ── Inline code ────────────────────────────────────────────────────────
    function insertInlineCode() {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;

        const range = sel.getRangeAt(0);
        const anchorNode = sel.anchorNode;

        // Check if cursor/selection is already inside an inline code element
        const existingCode = anchorNode && anchorNode.parentElement &&
            anchorNode.parentElement.closest('.summie-inline-code');

        if (existingCode) {
            // Toggle OFF — unwrap: replace <code> with its text content
            const parent = existingCode.parentNode;
            const text = document.createTextNode(existingCode.textContent);
            parent.replaceChild(text, existingCode);

            // Place cursor at end of the unwrapped text
            const after = document.createRange();
            after.setStartAfter(text);
            after.collapse(true);
            sel.removeAllRanges();
            sel.addRange(after);

            window.updateUnsavedIndicator && window.updateUnsavedIndicator();
            return;
        }

        // Toggle ON — wrap selection in <code>
        const code = document.createElement('code');
        code.className = 'summie-inline-code';
        const selectedText = range.toString();
        code.textContent = selectedText || 'code';

        range.deleteContents();
        range.insertNode(code);

        // Place cursor after the code element
        const after = document.createRange();
        after.setStartAfter(code);
        after.collapse(true);
        sel.removeAllRanges();
        sel.addRange(after);

        window.updateUnsavedIndicator && window.updateUnsavedIndicator();
    }

    // ── Init ───────────────────────────────────────────────────────────────
    function init() {
        // Register context tab
        if (window.ElementProtection) {
            window.ElementProtection.registerTab(CTX_ID, CTX_LABEL);
        }
        _buildPanel();

        // Wire toolbar buttons
        const insertBtn = document.getElementById('insertTextboxBtn');
        if (insertBtn) insertBtn.addEventListener('click', insertTextbox);

        const inlineBtn = document.getElementById('insertInlineCodeBtn');
        if (inlineBtn) inlineBtn.addEventListener('click', insertInlineCode);

        // Shortcut: Ctrl+` → inline code (e.code works on all keyboard layouts)
        document.addEventListener('keydown', e => {
            if (e.ctrlKey && !e.shiftKey && !e.altKey && e.code === 'Backquote') {
                e.preventDefault();
                insertInlineCode();
            }
        });

        // Focus delegation for existing textboxes (e.g. loaded from file)
        document.addEventListener('focusin', e => {
            const box = e.target.closest && e.target.closest('[data-textbox]');
            if (box && box !== _activeBox) {
                _setupFocusIfNeeded(box);
                _setActive(box);
            }
        });
    }

    function _setupFocusIfNeeded(box) {
        if (box._tbxInitialized) return;
        box._tbxInitialized = true;
        const drag = box.querySelector('.summie-textbox-drag');
        const resize = box.querySelector('.summie-textbox-resize');
        if (drag) _setupDrag(box, drag);
        if (resize) _setupResize(box, resize);
        _setupFocus(box);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else setTimeout(init, 0);

    return { insertTextbox, insertInlineCode };
})();