// ==================== CODEBLOCK CONTROLS ====================
window.CodeblockControls = (function () {
    'use strict';

    const TAB_ID = 'codeblock-styling';
    const TAB_LABEL = 'CodeBlock Stijl';

    let _activeBlock = null;

    // ── Language → file extension ─────────────────────────────────────────
    const LANG_EXT = {
        'javascript': 'js', 'typescript': 'ts', 'python': 'py',
        'java': 'java', 'csharp': 'cs', 'cpp': 'cpp',
        'php': 'php', 'ruby': 'rb', 'go': 'go',
        'rust': 'rs', 'swift': 'swift', 'kotlin': 'kt',
        'html': 'html', 'css': 'css', 'sql': 'sql',
        'json': 'json', 'bash': 'sh', 'shell': 'sh',
        'plaintext': 'txt',
    };

    // Full labels — mirrors languageLabels in code-blocks.js
    const LANG_LABELS = {
        'javascript': 'JavaScript', 'typescript': 'TypeScript', 'python': 'Python',
        'java': 'Java', 'csharp': 'C#', 'cpp': 'C++', 'php': 'PHP', 'ruby': 'Ruby',
        'go': 'Go', 'rust': 'Rust', 'swift': 'Swift', 'kotlin': 'Kotlin',
        'html': 'HTML', 'css': 'CSS', 'sql': 'SQL', 'json': 'JSON',
        'bash': 'Bash', 'shell': 'Shell', 'plaintext': 'Plain Text',
    };

    function getLang(wrapper) {
        const ta = wrapper && wrapper.querySelector('.code-block');
        return ta ? (ta.getAttribute('data-language') || 'plaintext') : 'plaintext';
    }
    function getExt(wrapper) { return LANG_EXT[getLang(wrapper)] || getLang(wrapper); }

    // ── Utilities ─────────────────────────────────────────────────────────
    function hexFromAny(color) {
        if (!color || color === 'transparent') return '#1e1e1e';
        if (color.startsWith('#')) {
            if (color.length === 4) return '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3];
            return color;
        }
        const m = color.match(/rgb[a]?\((\d+),\s*(\d+),\s*(\d+)/);
        if (m) return '#' + [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
        return '#1e1e1e';
    }
    function positionPopupBelow(popup, anchor) {
        if (!anchor) return;
        const r = anchor.getBoundingClientRect();
        popup.style.top = (r.bottom + 6) + 'px';
        popup.style.left = Math.min(r.left, window.innerWidth - 260) + 'px';
    }
    function closeAllPopups() { document.querySelectorAll('.ctx-popup').forEach(p => p.remove()); }

    // ── Name-mode helpers ─────────────────────────────────────────────────
    // When name mode is on:
    //   The header shows:  [name-input] [.] [ext-via-dropdown-button]
    //   The language-btn shows the extension (.js) instead of the full label
    //   Dropdown options keep their full names unchanged.

    function isNameMode(wrapper) {
        return wrapper && wrapper.dataset.cbNameMode === '1';
    }

    // Inject the name-input span into the header (left of language selector)
    function ensureNameInput(wrapper) {
        const header = wrapper.querySelector('.code-block-header');
        if (!header) return null;
        let grp = header.querySelector('.cb-name-group');
        if (!grp) {
            grp = document.createElement('div');
            grp.className = 'cb-name-group';
            grp.contentEditable = 'false';

            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'cb-name-input';
            input.placeholder = 'naamloos';
            input.spellcheck = false;

            // Stop ALL keyboard events from reaching the editor (capture + bubble)
            const stopAll = e => e.stopPropagation();
            input.addEventListener('keydown', stopAll, true);
            input.addEventListener('keyup', stopAll, true);
            input.addEventListener('keypress', stopAll, true);
            input.addEventListener('mousedown', stopAll);
            input.addEventListener('click', stopAll);

            input.addEventListener('input', () => {
                const clean = input.value.replace(/\./g, '');
                if (input.value !== clean) {
                    const pos = Math.max(0, input.selectionStart - (input.value.length - clean.length));
                    input.value = clean;
                    input.setSelectionRange(pos, pos);
                }
                wrapper.dataset.cbFilename = clean || 'naamloos';
                const panelInput = document.getElementById('cbNameInput');
                if (panelInput) panelInput.value = clean;
                window.saveToLocalStorage?.();
            });

            const dot = document.createElement('span');
            dot.className = 'cb-name-dot';
            dot.textContent = '.';

            grp.appendChild(input);
            grp.appendChild(dot);

            // Wrap name group + language selector in a shared left container
            // so they sit flush-left instead of being spread by justify-content: space-between
            let leftGroup = header.querySelector('.cb-header-left');
            if (!leftGroup) {
                leftGroup = document.createElement('div');
                leftGroup.className = 'cb-header-left';
                leftGroup.contentEditable = 'false';
                const langSel = header.querySelector('.code-language-selector');
                if (langSel) {
                    header.insertBefore(leftGroup, langSel);
                    leftGroup.appendChild(grp);
                    leftGroup.appendChild(langSel);
                } else {
                    header.prepend(leftGroup);
                    leftGroup.appendChild(grp);
                }
            } else {
                leftGroup.insertBefore(grp, leftGroup.firstChild);
            }
        }
        return grp;
    }

    function setNameMode(wrapper, on) {
        const langBtn = wrapper.querySelector('.code-language-btn .language-text');
        if (on) {
            wrapper.dataset.cbNameMode = '1';
            const grp = ensureNameInput(wrapper);
            if (grp) {
                grp.style.display = '';
                const input = grp.querySelector('.cb-name-input');
                if (input) input.value = wrapper.dataset.cbFilename || 'naamloos';
            }
            // Switch dropdown button text to extension
            if (langBtn) langBtn.textContent = getExt(wrapper);
        } else {
            delete wrapper.dataset.cbNameMode;
            const grp = wrapper.querySelector('.cb-name-group');
            if (grp) grp.style.display = 'none';
            // Restore full label
            if (langBtn) langBtn.textContent = LANG_LABELS[getLang(wrapper)] || getLang(wrapper);
        }
    }

    // Called by the patchedchangeLanguage when language changes
    function onLanguageChanged(wrapper, language) {
        if (!isNameMode(wrapper)) return;
        // Update button text to new extension
        const langBtn = wrapper.querySelector('.code-language-btn .language-text');
        if (langBtn) langBtn.textContent = LANG_EXT[language] || language;
        // Sync ext badge in panel
        const extDisplay = document.getElementById('cbExtDisplay');
        if (extDisplay) extDisplay.textContent = LANG_EXT[language] || language;
    }

    // ── Build Panel ───────────────────────────────────────────────────────
    function buildPanel() {
        const toolbar = document.querySelector('.section-toolbar');
        if (!toolbar || document.getElementById('ctx-panel-' + TAB_ID)) return;

        const panel = document.createElement('div');
        panel.className = 'toolbar-content ctx-panel';
        panel.id = 'ctx-panel-' + TAB_ID;
        panel.dataset.content = TAB_ID;
        panel.style.display = 'none';

        panel.innerHTML = `
            <div class="toolbar-group animate-item ctx-group">
                <label class="toolbar-label">Naam</label>
                <div class="toolbar-buttons">
                    <label class="ctx-toggle-label">
                        <input type="checkbox" id="cbNameToggle">
                        <span>Naam weergeven</span>
                    </label>
                    <div class="cb-filename-editor" id="cbFilenameEditor" style="display:none">
                        <input type="text" id="cbNameInput" class="ctx-text-input ctx-filename-input" placeholder="naamloos">
                        <span class="cb-filename-dot">.</span>
                        <span class="cb-filename-ext" id="cbExtDisplay">js</span>
                    </div>
                </div>
            </div>

            <div class="toolbar-separator animate-item"></div>

            <div class="toolbar-group animate-item ctx-group">
                <label class="toolbar-label">Bestand</label>
                <div class="toolbar-buttons">
                    <button class="btn-toolbar ctx-btn" id="cbLoadFileBtn">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                            <line x1="12" y1="18" x2="12" y2="12"/>
                            <line x1="9" y1="15" x2="15" y2="15"/>
                        </svg>
                        <span>Laden uit bestand</span>
                    </button>
                    <input type="file" id="cbFileInput" style="display:none" accept=".txt,.js,.ts,.py,.java,.cs,.cpp,.c,.php,.rb,.go,.rs,.html,.css,.json,.sql,.sh,.md">
                </div>
            </div>

            <div class="toolbar-separator animate-item"></div>

            <div class="toolbar-group animate-item ctx-group">
                <label class="toolbar-label">Kleuren</label>
                <div class="toolbar-buttons">
                    <button class="btn-toolbar ctx-btn" id="cbColorBtn">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>
                        </svg>
                        <span>Achtergrondkleuren…</span>
                        <span class="ctx-color-swatch" id="cbColorSwatch"></span>
                    </button>
                </div>
            </div>

            <div class="toolbar-separator animate-item"></div>

            <div class="toolbar-group animate-item ctx-group">
                <label class="toolbar-label ctx-label-danger">Verwijderen</label>
                <div class="toolbar-buttons">
                    <button class="btn-toolbar ctx-btn ctx-btn-danger" id="cbDeleteBtn">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-1 14H6L5 6"/>
                            <path d="M10 11v6M14 11v6"/>
                            <path d="M9 6V4h6v2"/>
                        </svg>
                        <span>Codeblok verwijderen</span>
                    </button>
                </div>
            </div>
        `;

        toolbar.appendChild(panel);
        bindPanelEvents(panel);
    }

    // ── Panel Events ──────────────────────────────────────────────────────
    function bindPanelEvents(panel) {
        panel.addEventListener('mousedown', e => {
            if (!e.target.matches('input[type="text"], input[type="file"], input[type="color"]')) e.preventDefault();
        });

        const nameToggle = panel.querySelector('#cbNameToggle');
        const filenameEditor = panel.querySelector('#cbFilenameEditor');
        const nameInput = panel.querySelector('#cbNameInput');
        const extDisplay = panel.querySelector('#cbExtDisplay');

        nameToggle.addEventListener('change', () => {
            if (!_activeBlock) return;
            if (nameToggle.checked) {
                filenameEditor.style.display = '';
                nameInput.value = _activeBlock.dataset.cbFilename || 'naamloos';
                extDisplay.textContent = getExt(_activeBlock);
                setNameMode(_activeBlock, true);
            } else {
                filenameEditor.style.display = 'none';
                setNameMode(_activeBlock, false);
            }
            window.saveToLocalStorage?.();
        });

        nameInput.addEventListener('input', () => {
            if (!_activeBlock) return;
            const clean = nameInput.value.replace(/\./g, '');
            if (nameInput.value !== clean) {
                const pos = Math.max(0, nameInput.selectionStart - (nameInput.value.length - clean.length));
                nameInput.value = clean;
                nameInput.setSelectionRange(pos, pos);
            }
            _activeBlock.dataset.cbFilename = clean || 'naamloos';
            // Sync the header inline input
            const headerInput = _activeBlock.querySelector('.cb-name-input');
            if (headerInput) headerInput.value = clean;
            window.saveToLocalStorage?.();
        });

        const loadBtn = panel.querySelector('#cbLoadFileBtn');
        const fileInput = panel.querySelector('#cbFileInput');
        loadBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', () => {
            if (!_activeBlock || !fileInput.files.length) return;
            const reader = new FileReader();
            reader.onload = ev => {
                const ta = _activeBlock.querySelector('.code-block');
                if (ta) { ta.value = ev.target.result; ta.dispatchEvent(new Event('input', { bubbles: true })); }
            };
            reader.readAsText(fileInput.files[0]);
            fileInput.value = '';
        });

        panel.querySelector('#cbColorBtn').addEventListener('click', openColorPopup);

        panel.querySelector('#cbDeleteBtn').addEventListener('click', () => {
            if (!_activeBlock) return;
            if (!confirm('Codeblok verwijderen?')) return;
            _activeBlock.remove();
            _activeBlock = null;
            window.ElementProtection?.hideContext(true);
            window.saveToLocalStorage?.();
        });
    }

    // ── Patch CodeBlockManager.changeLanguage ─────────────────────────────
    function patchCodeBlockManager() {
        const tryPatch = () => {
            if (!window.codeBlockManager) return false;
            const orig = window.codeBlockManager.changeLanguage.bind(window.codeBlockManager);
            window.codeBlockManager.changeLanguage = function (selector, language) {
                orig(selector, language);
                const wrapper = selector.closest && selector.closest('.code-block-wrapper');
                if (wrapper) onLanguageChanged(wrapper, language);
            };
            return true;
        };
        if (!tryPatch()) {
            let t = 0;
            const id = setInterval(() => { if (tryPatch() || ++t > 30) clearInterval(id); }, 100);
        }
    }

    // ── Color Popup ───────────────────────────────────────────────────────
    function openColorPopup() {
        closeAllPopups();
        if (!_activeBlock) return;
        const wrapper = _activeBlock;
        const header = wrapper.querySelector('.code-block-header');
        const content = wrapper.querySelector('.code-block-content');
        const curH = hexFromAny(header ? getComputedStyle(header).backgroundColor : '#2d2d2d');
        const curB = hexFromAny(content ? getComputedStyle(content).backgroundColor : '#1e1e1e');

        const popup = document.createElement('div');
        popup.className = 'ctx-popup';
        popup.innerHTML = `
            <div class="ctx-popup-title">Achtergrondkleuren</div>
            <div class="ctx-popup-row">
                <label class="ctx-popup-label">Koptekstbalk</label>
                <div class="ctx-color-pair">
                    <input type="color" class="ctx-color-input" id="cbHColor" value="${curH}">
                    <span class="ctx-popup-hex">${curH}</span>
                </div>
            </div>
            <div class="ctx-popup-row">
                <label class="ctx-popup-label">Code-inhoud</label>
                <div class="ctx-color-pair">
                    <input type="color" class="ctx-color-input" id="cbBColor" value="${curB}">
                    <span class="ctx-popup-hex">${curB}</span>
                </div>
            </div>
            <div class="ctx-popup-actions">
                <button class="ctx-popup-btn ctx-popup-cancel">Annuleren</button>
                <button class="ctx-popup-btn ctx-popup-confirm">Toepassen</button>
            </div>
        `;
        document.body.appendChild(popup);
        positionPopupBelow(popup, document.getElementById('cbColorBtn'));

        const hIn = popup.querySelector('#cbHColor'), bIn = popup.querySelector('#cbBColor');
        const [hHex, bHex] = popup.querySelectorAll('.ctx-popup-hex');
        hIn.addEventListener('input', () => { hHex.textContent = hIn.value; if (header) header.style.background = hIn.value; });
        bIn.addEventListener('input', () => { bHex.textContent = bIn.value; applyBodyColor(wrapper, bIn.value); });
        popup.querySelector('.ctx-popup-cancel').addEventListener('click', () => { if (header) header.style.background = curH; applyBodyColor(wrapper, curB); popup.remove(); });
        popup.querySelector('.ctx-popup-confirm').addEventListener('click', () => {
            if (header) header.style.background = hIn.value;
            applyBodyColor(wrapper, bIn.value);
            wrapper.dataset.headerColor = hIn.value;
            wrapper.dataset.bodyColor = bIn.value;
            updateSwatch(wrapper);
            window.saveToLocalStorage?.();
            popup.remove();
        });
        setTimeout(() => {
            document.addEventListener('mousedown', function close(ev) {
                if (!popup.contains(ev.target)) { popup.remove(); document.removeEventListener('mousedown', close); }
            });
        }, 50);
    }

    function applyBodyColor(wrapper, color) {
        ['code-block-content', 'code-highlighted-overlay', 'code-block'].forEach(cls => {
            const el = wrapper.querySelector('.' + cls);
            if (el) el.style.background = color;
        });
    }

    function updateSwatch(wrapper) {
        const swatch = document.getElementById('cbColorSwatch');
        if (!swatch) return;
        const content = wrapper.querySelector('.code-block-content');
        swatch.style.background = hexFromAny(content ? getComputedStyle(content).backgroundColor : '#1e1e1e');
    }

    // ── Sync Panel ────────────────────────────────────────────────────────
    function syncPanel(wrapper) {
        const nameToggle = document.getElementById('cbNameToggle');
        const filenameEditor = document.getElementById('cbFilenameEditor');
        const nameInput = document.getElementById('cbNameInput');
        const extDisplay = document.getElementById('cbExtDisplay');
        if (!nameToggle) return;

        const on = isNameMode(wrapper);
        nameToggle.checked = on;
        if (on) {
            filenameEditor.style.display = '';
            nameInput.value = wrapper.dataset.cbFilename || 'naamloos';
            extDisplay.textContent = getExt(wrapper);
        } else {
            filenameEditor.style.display = 'none';
        }

        updateSwatch(wrapper);
        if (wrapper.dataset.headerColor) { const h = wrapper.querySelector('.code-block-header'); if (h) h.style.background = wrapper.dataset.headerColor; }
        if (wrapper.dataset.bodyColor) applyBodyColor(wrapper, wrapper.dataset.bodyColor);
    }

    // ── Focus Detection ───────────────────────────────────────────────────
    function onEditorFocusin(e) {
        const editor = document.getElementById('editor');
        if (!editor) return;
        const wrapper = e.target.closest && e.target.closest('.code-block-wrapper');
        if (wrapper && editor.contains(wrapper)) {
            window.ElementProtection?.cancelHide();
            if (_activeBlock !== wrapper) { _activeBlock = wrapper; window.ElementProtection?.showContext('code'); syncPanel(wrapper); }
        }
    }
    function onEditorClick(e) {
        const editor = document.getElementById('editor');
        if (!editor) return;
        const wrapper = e.target.closest && e.target.closest('.code-block-wrapper');
        if (wrapper && editor.contains(wrapper)) {
            window.ElementProtection?.cancelHide();
            if (_activeBlock !== wrapper) { _activeBlock = wrapper; window.ElementProtection?.showContext('code'); syncPanel(wrapper); }
        }
    }
    function onDocumentFocusin(e) {
        if (e.target.closest && (e.target.closest('.section-toolbar') || e.target.closest('#contextTabsContainer') || e.target.closest('.topbar'))) {
            window.ElementProtection?.cancelHide(); return;
        }
        if (window.ElementProtection?.getContext() !== 'code') return;
        const editor = document.getElementById('editor');
        if (!editor) return;
        const wrapper = e.target.closest && e.target.closest('.code-block-wrapper');
        if (!wrapper || !editor.contains(wrapper)) { _activeBlock = null; window.ElementProtection?.hideContext(false); }
    }

    // ── Init ──────────────────────────────────────────────────────────────
    function init() {
        window.ElementProtection?.registerTab(TAB_ID, TAB_LABEL);
        buildPanel();
        patchCodeBlockManager();
        const editor = document.getElementById('editor');
        if (!editor) return;
        editor.addEventListener('focusin', onEditorFocusin);
        editor.addEventListener('click', onEditorClick);
        document.addEventListener('focusin', onDocumentFocusin);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else setTimeout(init, 50);

    // Called by code-blocks.js after loadCodeBlocksData to restore name mode UI
    function restoreNameMode(wrapper) {
        if (!wrapper || !wrapper.dataset.cbNameMode) return;
        setNameMode(wrapper, true);
        // If this block is currently active in the panel, sync the panel too
        if (_activeBlock === wrapper) syncPanel(wrapper);
    }

    return { getActiveBlock: () => _activeBlock, restoreNameMode };
})();