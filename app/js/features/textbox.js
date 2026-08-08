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
        const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (m) return '#' + [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
        return '#ffffff';
    }

    // Returns 0-100 opacity from a CSS color string (transparent = 0, solid = 100)
    function opacityFromAny(color) {
        if (!color || color === 'transparent') return 0;
        const m = color.match(/rgba\(\d+,\s*\d+,\s*\d+,\s*([\d.]+)\)/);
        if (m) return Math.round(parseFloat(m[1]) * 100);
        return 100;
    }

    // ── Create textbox ─────────────────────────────────────────────────────
    function insertTextbox() {
        const editor = getEditor();
        if (!editor) return;

        const box = document.createElement('div');
        box.className = 'summie-textbox';
        box.setAttribute('data-textbox', '1');
        box.setAttribute('data-floating', '1'); // default = floating
        box.setAttribute('data-shadow', 'none'); // default = no shadow
        box.style.boxShadow = 'none';
        box.contentEditable = 'false';

        // Inner editable area
        const inner = document.createElement('div');
        inner.className = 'summie-textbox-inner';
        inner.contentEditable = 'true';
        inner.setAttribute('data-placeholder', 'Typ hier...');
        box.appendChild(inner);

        // Word-style resize handles (8 handles around the border)
        _buildHandles(box);

        editor.appendChild(box);
        _setupHandles(box);
        _setupBoxDrag(box);
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

    // ── Word-style resize handles ──────────────────────────────────────────
    // 8 handles: 4 corners (resize both axes) + 4 edges (resize one axis).
    const HANDLE_DIRS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

    // Maximum width an inline textbox may take: the editor's content area
    // (page width minus its own padding), minus the box's right margin —
    // so it can never extend past the document margins.
    function _inlineMaxWidth(box) {
        const editor = getEditor();
        if (!editor) return Infinity;
        const editorCs = getComputedStyle(editor);
        const editorContentWidth = editor.clientWidth
            - (parseFloat(editorCs.paddingLeft) || 0)
            - (parseFloat(editorCs.paddingRight) || 0);
        const boxCs = getComputedStyle(box);
        const boxMargins = (parseFloat(boxCs.marginLeft) || 0) + (parseFloat(boxCs.marginRight) || 0);
        return Math.max(120, editorContentWidth - boxMargins);
    }

    // Clamp a floating box's position so it stays within the document/page
    // bounds (the editor's own box, i.e. .a4-page).
    function _clampToEditor(left, top, width, height) {
        const editor = getEditor();
        if (!editor) return { left, top };
        const maxLeft = Math.max(0, editor.offsetWidth - width);
        const maxTop = Math.max(0, editor.offsetHeight - height);
        return {
            left: Math.min(Math.max(0, left), maxLeft),
            top: Math.min(Math.max(0, top), maxTop)
        };
    }

    function _buildHandles(box) {
        HANDLE_DIRS.forEach(dir => {
            const handle = document.createElement('div');
            handle.className = 'summie-textbox-handle';
            handle.setAttribute('data-handle', dir);
            handle.setAttribute('aria-hidden', 'true');
            box.appendChild(handle);
        });
    }

    function _setupHandles(box) {
        box.querySelectorAll(':scope > .summie-textbox-handle').forEach(handle => {
            if (handle._tbxHandleInit) return;
            handle._tbxHandleInit = true;
            const dir = handle.getAttribute('data-handle');

            handle.addEventListener('mousedown', e => {
                e.preventDefault();
                e.stopPropagation();

                const isFloating = box.getAttribute('data-floating') === '1';
                const startX = e.clientX, startY = e.clientY;
                const startW = box.offsetWidth, startH = box.offsetHeight;
                const startLeft = box.offsetLeft, startTop = box.offsetTop;

                const hasW = dir.includes('w'); // left-adjusting (nw, w, sw)
                const hasE = dir.includes('e'); // right-growing (ne, e, se)
                const hasN = dir.includes('n'); // top-adjusting (nw, n, ne)
                const hasS = dir.includes('s'); // bottom-growing (sw, s, se)

                const editor = getEditor();
                const maxRight = isFloating && editor ? editor.offsetWidth : Infinity;
                const maxBottom = isFloating && editor ? editor.offsetHeight : Infinity;

                const onMove = ev => {
                    const dx = ev.clientX - startX;
                    const dy = ev.clientY - startY;

                    let newW = startW, newH = startH, newLeft = startLeft, newTop = startTop;
                    const maxW = isFloating ? Infinity : _inlineMaxWidth(box);

                    // Horizontal resize
                    if (hasE) {
                        newW = Math.min(maxW, Math.max(120, startW + dx));
                    } else if (hasW) {
                        newW = Math.min(maxW, Math.max(120, startW - dx));
                        if (isFloating) newLeft = startLeft + (startW - newW);
                    }

                    // Vertical resize
                    if (hasS) {
                        newH = Math.max(60, startH + dy);
                    } else if (hasN) {
                        newH = Math.max(60, startH - dy);
                        if (isFloating) newTop = startTop + (startH - newH);
                    }

                    // Keep the box within the document/page bounds when floating
                    if (isFloating) {
                        if (hasW && newLeft < 0) {
                            newW = Math.max(120, newW + newLeft); // shrink width by the overshoot
                            newLeft = 0;
                        }
                        if (hasN && newTop < 0) {
                            newH = Math.max(60, newH + newTop);
                            newTop = 0;
                        }
                        if (hasE && newLeft + newW > maxRight) {
                            newW = Math.max(120, maxRight - newLeft);
                        }
                        if (hasS && newTop + newH > maxBottom) {
                            newH = Math.max(60, maxBottom - newTop);
                        }
                    }

                    box.style.width = newW + 'px';
                    box.style.height = newH + 'px';
                    if (isFloating) {
                        box.style.left = newLeft + 'px';
                        box.style.top = newTop + 'px';
                    }
                };
                const onUp = () => {
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                    window.updateUnsavedIndicator && window.updateUnsavedIndicator();
                };
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
            });
        });
    }

    // ── Drag-to-move via the box border (Word-style) ───────────────────────
    // Mousedown on the box itself (not on the inner text area or a handle)
    // starts a move-drag in floating mode. A plain click (no real movement)
    // is treated as "focus the text" instead, so single-clicking the border
    // still lets you start typing.
    function _setupBoxDrag(box) {
        if (box._tbxDragInit) return;
        box._tbxDragInit = true;
        const inner = box.querySelector('.summie-textbox-inner');

        box.addEventListener('mousedown', e => {
            if (e.target !== box) return; // ignore clicks on inner/handles
            const isFloating = box.getAttribute('data-floating') === '1';

            if (!isFloating) {
                // Inline boxes can't be dragged — clicking the border focuses the text.
                e.preventDefault();
                inner.focus();
                return;
            }

            e.preventDefault();
            const startX = e.clientX - box.offsetLeft;
            const startY = e.clientY - box.offsetTop;
            let moved = false;

            const onMove = ev => {
                if (!moved && (Math.abs(ev.clientX - (startX + box.offsetLeft)) > 3 || Math.abs(ev.clientY - (startY + box.offsetTop)) > 3)) {
                    moved = true;
                }
                const rawLeft = ev.clientX - startX;
                const rawTop = ev.clientY - startY;
                const { left, top } = _clampToEditor(rawLeft, rawTop, box.offsetWidth, box.offsetHeight);
                box.style.left = left + 'px';
                box.style.top = top + 'px';
            };
            const onUp = ev => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                if (moved) {
                    window.updateUnsavedIndicator && window.updateUnsavedIndicator();
                } else {
                    // Plain click without dragging — start editing.
                    inner.focus();
                }
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    }

    // ── Focus / blur ───────────────────────────────────────────────────────

    // If the textbox is visually empty (no real text/images/etc., possibly
    // just a leftover empty <p><br></p> from editing), clear it completely
    // so the CSS `:empty::before` placeholder ("Typ hier...") reappears.
    function _normalizeEmptyInner(inner) {
        if (inner.innerHTML === '') return;
        const isEmpty = inner.textContent.trim() === '' && !inner.querySelector('img, [data-textbox], table, .summie-textbox');
        if (isEmpty) inner.innerHTML = '';
    }

    function _setupFocus(box) {
        const inner = box.querySelector('.summie-textbox-inner');
        inner.addEventListener('focus', () => {
            _setActive(box);
            box.classList.add('summie-textbox--editing');
        });
        inner.addEventListener('blur', () => {
            box.classList.remove('summie-textbox--editing');
            _normalizeEmptyInner(inner);
            setTimeout(() => {
                const ae = document.activeElement;
                if (ae && ae.closest && ae.closest('[data-textbox]')) return;
                if (ae && ae.closest && ae.closest('#contextTabsContainer')) return;
                if (ae && ae.closest && ae.closest('.section-toolbar')) return;
                _clearActive();
            }, 120);
        });
    }

    function _setActive(box) {
        if (_activeBox && _activeBox !== box) {
            _activeBox.classList.remove('summie-textbox--active', 'summie-textbox--editing');
        }
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

        <div class="toolbar-group animate-item" style="animation-delay:0.13s">
            <label class="toolbar-label">Randstijl</label>
            <div class="toolbar-buttons">
                <button class="btn-toolbar tbx-border-style-btn" data-style="none" title="Geen rand">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="2 2"/></svg>
                    <span>Geen</span>
                </button>
                <button class="btn-toolbar tbx-border-style-btn" data-style="solid" title="Doorgetrokken">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="2"/></svg>
                    <span>Lijn</span>
                </button>
                <button class="btn-toolbar tbx-border-style-btn" data-style="dashed" title="Gestreept">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="2" stroke-dasharray="5 3"/></svg>
                    <span>Streep</span>
                </button>
                <button class="btn-toolbar tbx-border-style-btn" data-style="dotted" title="Gestippeld">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="2" stroke-dasharray="2 3"/></svg>
                    <span>Stippel</span>
                </button>
                <button class="btn-toolbar tbx-border-style-btn" data-style="double" title="Dubbel">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <rect x="2" y="2" width="20" height="20" rx="3" stroke="currentColor" stroke-width="1.5"/>
                        <rect x="5" y="5" width="14" height="14" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
                    </svg>
                    <span>Dubbel</span>
                </button>
            </div>
        </div>

        <div class="toolbar-separator animate-item" style="animation-delay:0.25s"></div>

        <div class="toolbar-group animate-item" style="animation-delay:0.27s">
            <label class="toolbar-label">Hoekradius</label>
            <div class="toolbar-buttons">
                <div class="tbx-opacity-wrap" title="Hoekradius">
                    <input type="range" id="tbxRadius" class="tbx-opacity-slider" min="0" max="40" value="6">
                    <span id="tbxRadiusVal" class="tbx-opacity-val">6px</span>
                </div>
            </div>
        </div>

        <div class="toolbar-separator animate-item" style="animation-delay:0.23s"></div>

        <div class="toolbar-group animate-item" style="animation-delay:0.27s">
            <label class="toolbar-label">Kleuren</label>
            <div class="toolbar-buttons">
                <div class="color-picker-group tbx-bg-picker-group">
                    <label class="color-picker-label">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
                        Achtergrond
                    </label>
                    <div class="tbx-bg-controls">
                        <div class="tbx-color-swatch-wrap">
                            <div class="tbx-color-swatch" id="tbxBgSwatch"></div>
                            <input type="color" id="tbxBgColor" class="tbx-hidden-color-input" value="#ffffff" title="Kies kleur">
                        </div>
                        <input type="text" id="tbxBgHex" class="tbx-hex-input" value="#ffffff" maxlength="7" spellcheck="false" placeholder="#ffffff">
                        <div class="tbx-opacity-wrap" title="Doorzichtigheid">
                            <input type="range" id="tbxBgOpacity" class="tbx-opacity-slider" min="0" max="100" value="100">
                            <span id="tbxBgOpacityVal" class="tbx-opacity-val">100%</span>
                        </div>
                    </div>
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

        <div class="toolbar-separator animate-item" style="animation-delay:0.32s"></div>

        <div class="toolbar-group animate-item" style="animation-delay:0.37s">
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

        <div class="toolbar-separator animate-item" style="animation-delay:0.42s"></div>

        <div class="toolbar-group animate-item" style="animation-delay:0.47s">
            <label class="toolbar-label">Schaduw</label>
            <div class="toolbar-buttons">
                <button class="btn-toolbar tbx-shadow-btn" data-shadow="none" title="Geen schaduw">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="4" y="4" width="14" height="14" rx="2"/></svg>
                    <span>Geen</span>
                </button>
                <button class="btn-toolbar tbx-shadow-btn" data-shadow="sm" title="Kleine schaduw">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke-linecap="round">
                        <rect x="4" y="4" width="13" height="13" rx="2" stroke="currentColor" stroke-width="1.5"/>
                        <rect x="6" y="6" width="13" height="13" rx="2" fill="#e2e8f0" stroke="none"/>
                    </svg>
                    <span>Klein</span>
                </button>
                <button class="btn-toolbar tbx-shadow-btn" data-shadow="md" title="Normale schaduw">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke-linecap="round">
                        <rect x="3" y="3" width="13" height="13" rx="2" stroke="currentColor" stroke-width="1.5"/>
                        <rect x="7" y="7" width="13" height="13" rx="2" fill="#cbd5e1" stroke="none"/>
                    </svg>
                    <span>Normaal</span>
                </button>
                <button class="btn-toolbar tbx-shadow-btn" data-shadow="lg" title="Grote schaduw">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke-linecap="round">
                        <rect x="2" y="2" width="13" height="13" rx="2" stroke="currentColor" stroke-width="1.5"/>
                        <rect x="8" y="8" width="13" height="13" rx="2" fill="#94a3b8" stroke="none"/>
                    </svg>
                    <span>Groot</span>
                </button>
            </div>
        </div>

        <div class="toolbar-separator animate-item" style="animation-delay:0.52s"></div>

        <div class="toolbar-group animate-item" style="animation-delay:0.57s">
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
        window.wrapToolbarContentForScroll && window.wrapToolbarContentForScroll(panel);
        _wirePanel(panel);
    }

    function _wirePanel(panel) {
        // Schaduw
        const SHADOW_MAP = {
            none: 'none',
            sm: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)',
            md: '0 4px 12px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08)',
            lg: '0 10px 30px rgba(0,0,0,0.15), 0 4px 12px rgba(0,0,0,0.10)',
        };
        panel.querySelectorAll('.tbx-shadow-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!_activeBox) return;
                const key = btn.dataset.shadow;
                _activeBox.style.boxShadow = SHADOW_MAP[key];
                _activeBox.setAttribute('data-shadow', key);
                _syncShadowButtons(_activeBox);
                window.updateUnsavedIndicator && window.updateUnsavedIndicator();
            });
        });

        // Randstijl
        panel.querySelectorAll('.tbx-border-style-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!_activeBox) return;
                const style = btn.dataset.style;
                if (style === 'none') {
                    _activeBox.style.borderStyle = 'none';
                    _activeBox.setAttribute('data-border-style', 'none');
                } else {
                    // Make sure border is visible when switching from 'none'
                    if (_activeBox.style.borderStyle === 'none' || !_activeBox.style.borderStyle) {
                        _activeBox.style.borderWidth = _activeBox.getAttribute('data-border-width') || '1.5px';
                        _activeBox.style.borderColor = _activeBox.getAttribute('data-border-color-saved') || '#cbd5e1';
                    }
                    _activeBox.style.borderStyle = style;
                    _activeBox.setAttribute('data-border-style', style);
                }
                _syncBorderStyleButtons(_activeBox);
                window.updateUnsavedIndicator && window.updateUnsavedIndicator();
            });
        });

        // Randdikte
        panel.querySelectorAll('.tbx-border-width-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!_activeBox) return;
                const w = btn.dataset.width;
                const widthMap = { '1': '1px', '2': '1.5px', '3': '3px' };
                _activeBox.style.borderWidth = widthMap[w] || '1.5px';
                _activeBox.setAttribute('data-border-width', widthMap[w] || '1.5px');
                // Ensure border is visible
                if (_activeBox.style.borderStyle === 'none' || !_activeBox.style.borderStyle) {
                    _activeBox.style.borderStyle = 'solid';
                    _activeBox.setAttribute('data-border-style', 'solid');
                }
                _syncBorderStyleButtons(_activeBox);
                _syncBorderWidthButtons(_activeBox);
                window.updateUnsavedIndicator && window.updateUnsavedIndicator();
            });
        });

        // Positie toggle
        panel.querySelector('#tbxModeFloating').addEventListener('click', () => _setMode('floating'));
        panel.querySelector('#tbxModeInline').addEventListener('click', () => _setMode('inline'));

        // Kleuren
        // Achtergrond: kleur + opacity + transparant
        const bgColorInput = panel.querySelector('#tbxBgColor');
        const bgHexInput = panel.querySelector('#tbxBgHex');
        const bgOpacity = panel.querySelector('#tbxBgOpacity');
        const bgOpacityVal = panel.querySelector('#tbxBgOpacityVal');
        const bgSwatch = panel.querySelector('#tbxBgSwatch');

        function _applyBg() {
            if (!_activeBox) return;
            const hex = bgColorInput.value;
            const opacity = parseInt(bgOpacity.value) / 100;
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            _activeBox.style.background = opacity === 0
                ? 'transparent'
                : `rgba(${r},${g},${b},${opacity})`;
            bgSwatch.style.background = opacity === 0 ? 'transparent' : hex;
            bgHexInput.value = hex;
            bgOpacityVal.textContent = bgOpacity.value + '%';
            _activeBox.setAttribute('data-bg-hex', hex);
            _activeBox.setAttribute('data-bg-opacity', bgOpacity.value);
            window.updateUnsavedIndicator && window.updateUnsavedIndicator();
        }

        bgColorInput.addEventListener('input', e => {
            bgHexInput.value = e.target.value;
            _applyBg();
        });

        bgHexInput.addEventListener('input', e => {
            const val = e.target.value;
            if (/^#[0-9a-fA-F]{6}$/.test(val)) {
                bgColorInput.value = val;
                _applyBg();
            }
        });
        bgHexInput.addEventListener('blur', e => {
            // Normalise on blur
            let val = e.target.value.trim();
            if (!val.startsWith('#')) val = '#' + val;
            if (/^#[0-9a-fA-F]{6}$/.test(val)) {
                bgColorInput.value = val;
                bgHexInput.value = val;
                _applyBg();
            } else {
                bgHexInput.value = bgColorInput.value;
            }
        });

        bgOpacity.addEventListener('input', () => _applyBg());

        // Hoekradius
        const radiusSlider = panel.querySelector('#tbxRadius');
        const radiusVal = panel.querySelector('#tbxRadiusVal');
        radiusSlider.addEventListener('input', () => {
            if (!_activeBox) return;
            const val = parseInt(radiusSlider.value, 10);
            _activeBox.style.borderRadius = val + 'px';
            _activeBox.setAttribute('data-radius', val);
            const inner = _activeBox.querySelector('.summie-textbox-inner');
            if (inner) inner.style.borderRadius = Math.max(0, val - 4) + 'px';
            radiusVal.textContent = val + 'px';
            window.updateUnsavedIndicator && window.updateUnsavedIndicator();
        });

        // Swatch click → open colour picker
        bgSwatch.addEventListener('click', () => bgColorInput.click());
        panel.querySelector('#tbxTextColor').addEventListener('input', e => {
            if (_activeBox) { _activeBox.querySelector('.summie-textbox-inner').style.color = e.target.value; window.updateUnsavedIndicator && window.updateUnsavedIndicator(); }
        });
        panel.querySelector('#tbxBorderColor').addEventListener('input', e => {
            if (_activeBox) {
                _activeBox.style.borderColor = e.target.value;
                _activeBox.setAttribute('data-border-color-saved', e.target.value);
                // Ensure border is visible when a color is picked
                if (_activeBox.style.borderStyle === 'none' || !_activeBox.style.borderStyle) {
                    _activeBox.style.borderStyle = 'solid';
                    _activeBox.setAttribute('data-border-style', 'solid');
                    _syncBorderStyleButtons(_activeBox);
                }
                window.updateUnsavedIndicator && window.updateUnsavedIndicator();
            }
        });

        // Lettergrootte
        panel.querySelector('#tbxFontSize').addEventListener('change', e => {
            if (_activeBox) { _activeBox.querySelector('.summie-textbox-inner').style.fontSize = e.target.value + 'pt'; window.updateUnsavedIndicator && window.updateUnsavedIndicator(); }
        });

        // Verwijderen
        panel.querySelector('#tbxDelete').addEventListener('click', () => {
            if (_activeBox) {
                _activeBox.remove();
                _clearActive();
                window.updateUnsavedIndicator && window.updateUnsavedIndicator();
            }
        });
    }

    function _syncShadowButtons(box) {
        const current = box.getAttribute('data-shadow') || 'none';
        document.querySelectorAll('.tbx-shadow-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.shadow === current);
        });
    }

    function _syncBorderStyleButtons(box) {
        const current = box.getAttribute('data-border-style') || box.style.borderStyle || 'solid';
        document.querySelectorAll('.tbx-border-style-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.style === current);
        });
    }

    function _syncBorderWidthButtons(box) {
        const current = box.getAttribute('data-border-width') || box.style.borderWidth || '1.5px';
        const widthMap = { '1px': '1', '1.5px': '2', '3px': '3' };
        const key = widthMap[current] || '2';
        document.querySelectorAll('.tbx-border-width-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.width === key);
        });
    }

    function _syncRadiusSlider(box) {
        const slider = document.getElementById('tbxRadius');
        const val = document.getElementById('tbxRadiusVal');
        if (!slider) return;
        const current = parseInt(box.style.borderRadius) || parseInt(box.getAttribute('data-radius')) || 6;
        slider.value = current;
        if (val) val.textContent = current + 'px';
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

        const bgColor = box.getAttribute('data-bg-hex') || hexFromAny(box.style.background || '#ffffff');
        const bgOp = box.hasAttribute('data-bg-opacity')
            ? parseInt(box.getAttribute('data-bg-opacity'))
            : opacityFromAny(box.style.background);

        const bgInput2 = document.getElementById('tbxBgColor');
        const bgHex2 = document.getElementById('tbxBgHex');
        const bgOp2 = document.getElementById('tbxBgOpacity');
        const bgOpVal2 = document.getElementById('tbxBgOpacityVal');
        const bgSwatch2 = document.getElementById('tbxBgSwatch');

        if (bgInput2) {
            bgInput2.value = bgColor;
            bgHex2.value = bgColor;
            bgOp2.value = bgOp;
            bgOpVal2.textContent = bgOp + '%';
            bgSwatch2.style.background = bgOp === 0 ? 'transparent' : bgColor;
        }

        bgInput.value = bgColor;
        textInput.value = hexFromAny(inner ? inner.style.color || '#1e293b' : '#1e293b');
        borderInput.value = hexFromAny(box.style.borderColor || '#cbd5e1');

        const fs = inner ? parseFloat(inner.style.fontSize) : 14;
        if (sizeSelect) sizeSelect.value = fs || 14;

        floatingBtn && floatingBtn.classList.toggle('active', isFloating);
        inlineBtn && inlineBtn.classList.toggle('active', !isFloating);

        _syncBorderStyleButtons(box);
        _syncBorderWidthButtons(box);
        _syncShadowButtons(box);
        _syncRadiusSlider(box);
    }

    function _setMode(mode) {
        if (!_activeBox) return;
        const box = _activeBox;
        const isFloating = mode === 'floating';
        const wasFloating = box.getAttribute('data-floating') === '1';

        let pendingPos = null;

        if (isFloating && !wasFloating) {
            // Switching to floating: capture the box's current on-screen
            // position (relative to the editor) BEFORE changing layout mode,
            // so it ends up exactly where it visually was — no jump.
            const editor = getEditor();
            if (editor) {
                const editorRect = editor.getBoundingClientRect();
                const boxRect = box.getBoundingClientRect();
                const raw = { left: boxRect.left - editorRect.left, top: boxRect.top - editorRect.top };
                pendingPos = _clampToEditor(raw.left, raw.top, boxRect.width, boxRect.height);
            }
        } else if (!isFloating && wasFloating) {
            // Switching to inline: clear the inline top/left/right/bottom
            // offsets. Without this, leftover `top`/`left` values (set while
            // dragging the floating box) are applied as an offset on top of
            // `position: relative`, pushing the box far outside the visible
            // page — making it appear to "disappear".
            box.style.top = '';
            box.style.left = '';
            box.style.right = '';
            box.style.bottom = '';
            box.style.height = '';
        }

        box.setAttribute('data-floating', isFloating ? '1' : '0');
        box.classList.toggle('summie-textbox--inline', !isFloating);

        if (isFloating && pendingPos) {
            box.style.left = pendingPos.left + 'px';
            box.style.top = pendingPos.top + 'px';
        }

        if (!isFloating) {
            // Inline mode: make sure there's always a place right after the
            // box where the cursor can go. The box itself has
            // contentEditable="false", so it's an atomic unit — without a
            // text node / paragraph directly after it (e.g. when it's the
            // last child of the editor), there's nowhere for the caret to
            // land "behind" the textbox.
            _ensureCursorSpaceAfter(box);
        } else {
            // Floating mode: clean up a spacer paragraph we may have added,
            // as long as it's still empty and unused.
            _removeCursorSpaceAfter(box);
        }

        _syncPanelToBox(box);
        window.updateUnsavedIndicator && window.updateUnsavedIndicator();
    }

    // Ensure there's a valid caret position immediately after `box`.
    function _ensureCursorSpaceAfter(box) {
        const next = box.nextSibling;
        const isUsable = next && (
            next.nodeType === Node.TEXT_NODE ||
            (next.nodeType === Node.ELEMENT_NODE && !next.hasAttribute('data-textbox'))
        );
        if (!isUsable) {
            const p = document.createElement('p');
            p.innerHTML = '<br>';
            p.setAttribute('data-textbox-spacer', '1');
            box.parentNode.insertBefore(p, box.nextSibling);
        }
    }

    // Remove a spacer paragraph we added after `box`, if it's still empty.
    function _removeCursorSpaceAfter(box) {
        const next = box.nextSibling;
        if (next && next.nodeType === Node.ELEMENT_NODE && next.getAttribute('data-textbox-spacer') === '1') {
            if (next.textContent.trim() === '' && !next.querySelector('[data-textbox]')) {
                next.remove();
            } else {
                next.removeAttribute('data-textbox-spacer');
            }
        }
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

        // Ctrl+A inside a textbox: select only the textbox's content, not the
        // whole document. Nested contenteditable regions don't always scope
        // "select all" correctly on their own.
        document.addEventListener('keydown', e => {
            if (!(e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'a' || e.key === 'A'))) return;
            const inner = document.activeElement && document.activeElement.closest && document.activeElement.closest('.summie-textbox-inner');
            if (!inner) return;
            e.preventDefault();
            const range = document.createRange();
            range.selectNodeContents(inner);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        });

        // Focus delegation for existing textboxes (e.g. loaded from file)
        document.addEventListener('focusin', e => {
            const box = e.target.closest && e.target.closest('[data-textbox]');
            if (box && box !== _activeBox) {
                _setupFocusIfNeeded(box);
                _setActive(box);
            }
        });

        // Mousedown delegation — ensures drag/resize handlers are attached even
        // when the user clicks a handle or the border before the inner div has
        // received focus. Uses capture phase so this runs before those handlers fire.
        document.addEventListener('mousedown', e => {
            const box = e.target.closest && e.target.closest('[data-textbox]');
            if (box) _setupFocusIfNeeded(box);
        }, true);
    }

    function _setupFocusIfNeeded(box) {
        if (box._tbxInitialized) return;
        box._tbxInitialized = true;

        // Migrate boxes saved by an older version: remove the old single
        // drag/resize handles and replace them with the new 8-handle set.
        const oldDrag = box.querySelector(':scope > .summie-textbox-drag');
        const oldResize = box.querySelector(':scope > .summie-textbox-resize');
        if (oldDrag) oldDrag.remove();
        if (oldResize) oldResize.remove();
        if (!box.querySelector(':scope > .summie-textbox-handle')) {
            _buildHandles(box);
        }

        _setupHandles(box);
        _setupBoxDrag(box);
        _setupFocus(box);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else setTimeout(init, 0);

    // Repair any inline textboxes (e.g. loaded from a file saved with an
    // older version) that don't have a valid caret position after them.
    function repairInlineTextboxes(root) {
        const editor = root || getEditor();
        if (!editor) return;
        editor.querySelectorAll('.summie-textbox--inline[data-textbox]').forEach(box => {
            _ensureCursorSpaceAfter(box);
        });
    }

    return { insertTextbox, insertInlineCode, repairInlineTextboxes };
})();