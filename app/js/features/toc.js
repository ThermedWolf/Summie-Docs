// ==================== INHOUDSOPGAVE ====================
// Inserts/manages a .summie-toc element in the editor.
// Two styles: 'klassiek' (numbered, indented) and 'modern' (lines, bold h1).
// Two modes:  'auto' (rebuilds on editor mutations) and 'handmatig' (frozen).

window.TocManager = (function () {
    'use strict';

    const CTX_ID = 'toc-opmaak';
    const CTX_LABEL = 'Inhoudsopgave';
    const CTX_KEY = 'toc';

    // Heading levels to include, in priority order
    const HEADING_SELECTORS = [
        { selector: '[data-style="title"]', level: 1, cls: 'level-title' },
        { selector: '[data-style="subtitle"]', level: 2, cls: 'level-subtitle' },
        { selector: '[data-style="kop1"]', level: 3, cls: 'level-kop1' },
        { selector: '[data-style="kop2"]', level: 4, cls: 'level-kop2' },
        { selector: '[data-style="kop3"]', level: 5, cls: 'level-kop3' },
    ];

    let _activeToc = null;
    let _observer = null;
    let _rebuildTimer = null;

    function getEditor() { return document.getElementById('editor'); }

    // ── Scan headings ────────────────────────────────────────────────────
    function _scanHeadings() {
        const editor = getEditor();
        if (!editor) return [];

        const items = [];
        // Collect all heading elements in DOM order
        const allHeadings = editor.querySelectorAll(
            HEADING_SELECTORS.map(h => h.selector).join(',')
        );

        allHeadings.forEach(el => {
            // Skip headings that are inside the TOC itself
            if (el.closest('.summie-toc')) return;
            const text = el.textContent.trim();
            if (!text) return;

            const match = HEADING_SELECTORS.find(h =>
                el.matches(h.selector)
            );
            if (match) items.push({ text, level: match.level, cls: match.cls, el });
        });

        return items;
    }

    // ── Render TOC content ───────────────────────────────────────────────
    function _renderContent(toc) {
        const style = toc.getAttribute('data-toc-style') || 'klassiek';
        const body = toc.querySelector('.summie-toc-body');
        if (!body) return;

        const items = _scanHeadings();

        if (!items.length) {
            body.innerHTML = `<div class="toc-empty">Geen koppen gevonden in het document.</div>`;
            return;
        }

        if (style === 'klassiek') {
            _renderKlassiek(body, items);
        } else if (style === 'summie') {
            _renderSummie(body, items);
        } else {
            _renderWord(body, items);
        }
    }

    function _renderKlassiek(body, items) {
        // Numbered per level: 1 / 1.1 / 1.1.1
        const counters = [0, 0, 0, 0, 0, 0]; // index = level (1-based)

        body.innerHTML = items.map(item => {
            // Reset deeper counters
            for (let i = item.level; i < counters.length; i++) counters[i] = 0;
            counters[item.level - 1]++;

            const number = counters
                .slice(0, item.level)
                .filter(n => n > 0)
                .join('.');

            return `<div class="toc-item toc-klassiek-item ${item.cls}">
                <span class="toc-number">${number}</span>
                <span class="toc-text">${_escapeHtml(item.text)}</span>
                <span class="toc-dots"></span>
                <span class="toc-page">—</span>
            </div>`;
        }).join('');
    }

    function _renderSummie(body, items) {
        body.innerHTML = items.map(item => {
            return `<div class="toc-item toc-summie-item ${item.cls}">
                <span class="toc-summie-bar"></span>
                <span class="toc-text">${_escapeHtml(item.text)}</span>
                <span class="toc-page">—</span>
            </div>`;
        }).join('');
    }

    function _renderWord(body, items) {
        // Numbered per level like klassiek but Word-style: no dots, tab-leader look
        const counters = [0, 0, 0, 0, 0, 0];
        body.innerHTML = items.map(item => {
            for (let i = item.level; i < counters.length; i++) counters[i] = 0;
            counters[item.level - 1]++;
            const number = counters.slice(0, item.level).filter(n => n > 0).join('.');
            return `<div class="toc-item toc-word-item ${item.cls}">
                <span class="toc-word-num">${number}</span>
                <span class="toc-text">${_escapeHtml(item.text)}</span>
                <span class="toc-dots"></span>
                <span class="toc-page">—</span>
            </div>`;
        }).join('');
    }

    // ── Style picker modal ───────────────────────────────────────────────
    function _showTocPicker(preSelected, onConfirm) {
        const existing = document.getElementById('tocPickerOverlay');
        if (existing) existing.remove();

        // Inject keyframes once
        if (!document.getElementById('tocPickerStyles')) {
            const s = document.createElement('style');
            s.id = 'tocPickerStyles';
            s.textContent = `
                @keyframes tocFadeIn  { from{opacity:0} to{opacity:1} }
                @keyframes tocSlideUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
                #tocPickerDialog { animation: tocSlideUp 0.18s ease; }
                .toc-picker-card { transition: border-color 0.12s, box-shadow 0.12s, transform 0.1s; cursor: pointer; }
                .toc-picker-card:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.10) !important; }
                .toc-picker-card.selected { border-color: var(--primary-color, #3b82f6) !important; box-shadow: 0 0 0 3px rgba(59,130,246,0.15) !important; }
            `;
            document.head.appendChild(s);
        }

        const overlay = document.createElement('div');
        overlay.id = 'tocPickerOverlay';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,0.4);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;animation:tocFadeIn 0.15s ease;';

        const previewItems = [
            { cls: 'level-title', text: 'Introductie', num: '1' },
            { cls: 'level-kop1', text: 'Achtergrond', num: '1.1' },
            { cls: 'level-kop2', text: 'Context', num: '1.1.1' },
            { cls: 'level-title', text: 'Hoofdstuk 2', num: '2' },
            { cls: 'level-kop1', text: 'Methoden', num: '2.1' },
        ];

        function _klassiekPreview() {
            return previewItems.map(it => `
                <div style="display:flex;align-items:baseline;gap:6px;padding:2px 0;font-size:11px;color:#475569;${it.cls === 'level-title' ? 'font-weight:600;' : ''}${it.cls === 'level-kop1' ? 'padding-left:12px;' : ''}${it.cls === 'level-kop2' ? 'padding-left:22px;font-size:10px;color:#94a3b8;' : ''}">
                    <span style="color:#94a3b8;min-width:26px;font-size:10px;">${it.num}</span>
                    <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${it.text}</span>
                    <span style="flex:1;border-bottom:1.5px dotted #e2e8f0;margin-bottom:2px;"></span>
                    <span style="color:#94a3b8;font-size:10px;">—</span>
                </div>`).join('');
        }

        function _summiePreview() {
            return previewItems.map(it => `
                <div style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:11px;color:#64748b;${it.cls === 'level-title' ? 'font-weight:600;color:#1e293b;' : ''}${it.cls === 'level-kop1' ? 'padding-left:10px;' : ''}${it.cls === 'level-kop2' ? 'padding-left:20px;font-size:10px;color:#94a3b8;' : ''}">
                    <span style="flex-shrink:0;width:2px;height:12px;border-radius:1px;background:${it.cls === 'level-title' ? '#3b82f6' : it.cls === 'level-kop1' ? '#cbd5e1' : '#e2e8f0'};"></span>
                    <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${it.text}</span>
                    <span style="color:#94a3b8;font-size:10px;">—</span>
                </div>`).join('');
        }

        function _wordPreview() {
            return previewItems.map(it => `
                <div style="padding:2px 0;font-size:11px;color:#1e293b;${it.cls === 'level-title' ? 'font-weight:700;font-size:12px;' : ''}${it.cls === 'level-kop1' ? 'padding-left:14px;' : ''}${it.cls === 'level-kop2' ? 'padding-left:26px;font-size:10px;' : ''}">
                    <span style="display:flex;gap:4px;align-items:baseline;">
                        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${it.text}</span>
                        <span style="flex:2;border-bottom:1px dotted #94a3b8;margin-bottom:2px;"></span>
                        <span style="color:#64748b;font-size:10px;">—</span>
                    </span>
                </div>`).join('');
        }

        const cards = [
            { key: 'klassiek', label: 'Klassiek', desc: 'Genummerd met stippellijn', preview: _klassiekPreview() },
            { key: 'summie', label: 'Summie', desc: 'Kleurlijnen, modern', preview: _summiePreview() },
            { key: 'word', label: 'Word', desc: 'Eenvoudig, zwarte tekst', preview: _wordPreview() },
        ];

        const dialog = document.createElement('div');
        dialog.id = 'tocPickerDialog';
        dialog.style.cssText = 'background:var(--surface,#fff);border:1px solid var(--border,#e2e8f0);border-radius:16px;width:680px;max-width:calc(100vw - 32px);box-shadow:0 8px 32px rgba(0,0,0,0.12);font-family:inherit;overflow:hidden;';

        dialog.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:20px 24px 16px;">
                <div>
                    <div style="font-size:15px;font-weight:650;color:var(--text);letter-spacing:-0.2px;">Stijl kiezen</div>
                    <div style="font-size:13px;color:var(--text-secondary);margin-top:2px;">Kies een opmaak voor de inhoudsopgave</div>
                </div>
                <button id="tocPickerClose" style="width:28px;height:28px;border-radius:7px;border:0.5px solid var(--border);background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;color:var(--text-secondary);">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
            <div style="height:0.5px;background:var(--border-light,#f1f5f9);"></div>
            <div style="display:flex;gap:12px;padding:20px 24px;">
                ${cards.map(c => `
                    <div class="toc-picker-card" data-toc-pick="${c.key}" style="flex:1;border:1.5px solid var(--border,#e2e8f0);border-radius:12px;overflow:hidden;background:var(--bg-light,#f8fafc);">
                        <div style="padding:12px 14px;min-height:120px;background:#fff;border-bottom:1px solid var(--border-light,#f1f5f9);">
                            ${c.preview}
                        </div>
                        <div style="padding:10px 14px;">
                            <div style="font-size:13px;font-weight:600;color:var(--text);">${c.label}</div>
                            <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">${c.desc}</div>
                        </div>
                    </div>`).join('')}
            </div>
            <div style="height:0.5px;background:var(--border-light,#f1f5f9);"></div>
            <div style="display:flex;justify-content:flex-end;gap:8px;padding:14px 24px;">
                <button id="tocPickerCancel" style="height:34px;padding:0 16px;border-radius:8px;border:1px solid var(--border);background:transparent;color:var(--text-secondary);font-size:13px;cursor:pointer;">Annuleren</button>
                <button id="tocPickerConfirm" style="height:34px;padding:0 18px;border-radius:8px;border:none;background:var(--primary,#3b82f6);color:#fff;font-size:13px;font-weight:600;cursor:pointer;opacity:0.5;pointer-events:none;">${preSelected ? 'Toepassen' : 'Invoegen'}</button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        let selectedStyle = preSelected || null;

        const confirmBtn = dialog.querySelector('#tocPickerConfirm');

        // Pre-select if editing
        if (preSelected) {
            const preCard = dialog.querySelector(`[data-toc-pick="${preSelected}"]`);
            if (preCard) preCard.classList.add('selected');
            confirmBtn.style.opacity = '1';
            confirmBtn.style.pointerEvents = 'auto';
        }

        dialog.querySelectorAll('.toc-picker-card').forEach(card => {
            card.addEventListener('click', () => {
                dialog.querySelectorAll('.toc-picker-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                selectedStyle = card.dataset.tocPick;
                confirmBtn.style.opacity = '1';
                confirmBtn.style.pointerEvents = 'auto';
            });
        });

        const close = () => overlay.remove();

        dialog.querySelector('#tocPickerClose').addEventListener('click', close);
        dialog.querySelector('#tocPickerCancel').addEventListener('click', close);
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

        confirmBtn.addEventListener('click', () => {
            if (!selectedStyle) return;
            close();
            if (onConfirm) {
                onConfirm(selectedStyle);
            } else {
                _doInsertToc(selectedStyle);
            }
        });
    }

    // ── Insert TOC ───────────────────────────────────────────────────────
    function insertToc() {
        const editor = getEditor();
        if (!editor) return;

        // Only one TOC at a time
        const existing = editor.querySelector('.summie-toc');
        if (existing) {
            _setActive(existing);
            existing.scrollIntoView({ behavior: 'smooth', block: 'center' });
            window.showNotification && window.showNotification('Inhoudsopgave', 'Er is al een inhoudsopgave in het document.', 'info');
            return;
        }

        _showTocPicker(null, null);
    }

    function _doInsertToc(style) {
        const editor = getEditor();
        if (!editor) return;

        const toc = document.createElement('div');
        toc.className = 'summie-toc';
        toc.setAttribute('data-toc', '1');
        toc.setAttribute('data-toc-style', style);
        toc.setAttribute('data-toc-mode', 'auto');
        toc.contentEditable = 'false';

        toc.innerHTML = `
            <div class="summie-toc-header">
                <span class="summie-toc-title">Inhoudsopgave</span>
                <span class="summie-toc-mode-badge">Auto</span>
            </div>
            <div class="summie-toc-body"></div>
        `;

        // Insert at cursor position if possible, else prepend
        const sel = window.getSelection();
        let inserted = false;
        if (sel && sel.rangeCount) {
            const range = sel.getRangeAt(0);
            const node = range.commonAncestorContainer;
            const para = node.nodeType === 3 ? node.parentElement : node;
            const inEditor = para && para.closest && para.closest('#editor');
            if (inEditor && !para.closest('.summie-toc')) {
                para.parentNode.insertBefore(toc, para);
                inserted = true;
            }
        }
        if (!inserted) editor.prepend(toc);

        _setupToc(toc);
        _renderContent(toc);
        _setActive(toc);
        _startObserver();

        window.updateUnsavedIndicator && window.updateUnsavedIndicator();
    }

    // ── Setup (attach events to a toc element) ───────────────────────────
    function _setupToc(toc) {
        if (toc._tocInitialized) return;
        toc._tocInitialized = true;

        // Inject hover action buttons
        const actions = document.createElement('div');
        actions.className = 'summie-toc-actions';
        actions.innerHTML = `
            <button class="summie-toc-action-btn" data-toc-action="edit" title="Stijl wijzigen">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
            </button>
            <button class="summie-toc-action-btn summie-toc-action-delete" data-toc-action="delete" title="Verwijderen">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14H6L5 6"/>
                    <path d="M10 11v6"/><path d="M14 11v6"/>
                    <path d="M9 6V4h6v2"/>
                </svg>
            </button>
        `;
        toc.appendChild(actions);

        actions.querySelector('[data-toc-action="edit"]').addEventListener('click', e => {
            e.stopPropagation();
            const currentStyle = toc.getAttribute('data-toc-style') || 'klassiek';
            _showTocPicker(currentStyle, newStyle => {
                toc.setAttribute('data-toc-style', newStyle);
                _renderContent(toc);
                _syncPanel(toc);
                window.updateUnsavedIndicator && window.updateUnsavedIndicator();
            });
        });

        actions.querySelector('[data-toc-action="delete"]').addEventListener('click', e => {
            e.stopPropagation();
            toc.remove();
            window.updateUnsavedIndicator && window.updateUnsavedIndicator();
        });

        // Delegate clicks on toc items → scroll to heading
        toc.addEventListener('click', e => {
            const item = e.target.closest('.toc-item');
            if (!item) return;
            const idx = Array.from(toc.querySelectorAll('.toc-item')).indexOf(item);
            const headings = _scanHeadings();
            if (headings[idx] && headings[idx].el) {
                headings[idx].el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        });
    }

    // ── Active state ─────────────────────────────────────────────────────
    function _setActive(toc) {
        if (_activeToc && _activeToc !== toc) {
            _activeToc.classList.remove('summie-toc--active');
        }
        _activeToc = toc;
        toc.classList.add('summie-toc--active');
        window.ElementProtection?.showContext(CTX_KEY);
        _syncPanel(toc);
    }

    function _clearActive() {
        if (_activeToc) _activeToc.classList.remove('summie-toc--active');
        _activeToc = null;
        window.ElementProtection?.hideContext(false);
    }

    // ── Context panel ────────────────────────────────────────────────────
    function _buildPanel() {
        const toolbar = document.querySelector('.section-toolbar');
        if (!toolbar || document.getElementById('ctx-panel-' + CTX_ID)) return;

        const panel = document.createElement('div');
        panel.className = 'toolbar-content ctx-panel';
        panel.id = 'ctx-panel-' + CTX_ID;
        panel.style.display = 'none';

        panel.innerHTML = `
        <div class="toolbar-group animate-item" style="animation-delay:0.05s">
            <label class="toolbar-label">Stijl</label>
            <div class="toolbar-buttons">
                <button class="btn-toolbar toc-style-btn" id="tocStyleKlassiek" data-style="klassiek" title="Klassiek (genummerd)">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                        <line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/>
                        <text x="3" y="7" font-size="5" fill="currentColor" stroke="none">1</text>
                        <text x="3" y="13" font-size="5" fill="currentColor" stroke="none">2</text>
                        <text x="3" y="19" font-size="5" fill="currentColor" stroke="none">3</text>
                    </svg>
                    <span>Klassiek</span>
                </button>
                <button class="btn-toolbar toc-style-btn" id="tocStyleSummie" data-style="summie" title="Summie (kleurlijnen)">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                        <line x1="3" y1="6" x2="21" y2="6" stroke-width="2.5" stroke="#3b82f6"/>
                        <line x1="6" y1="11" x2="21" y2="11"/>
                        <line x1="8" y1="16" x2="21" y2="16"/>
                        <line x1="6" y1="21" x2="21" y2="21"/>
                    </svg>
                    <span>Summie</span>
                </button>
                <button class="btn-toolbar toc-style-btn" id="tocStyleWord" data-style="word" title="Word (eenvoudig)">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                        <line x1="3" y1="6" x2="21" y2="6" stroke-width="2.5"/>
                        <line x1="5" y1="11" x2="21" y2="11"/>
                        <line x1="7" y1="16" x2="21" y2="16"/>
                        <line x1="5" y1="21" x2="21" y2="21"/>
                    </svg>
                    <span>Word</span>
                </button>
            </div>
        </div>

        <div class="toolbar-separator animate-item" style="animation-delay:0.1s"></div>

        <div class="toolbar-group animate-item" style="animation-delay:0.15s">
            <label class="toolbar-label">Bijwerken</label>
            <div class="toolbar-buttons">
                <button class="btn-toolbar toc-mode-btn" id="tocModeAuto" data-mode="auto" title="Automatisch bijwerken bij elke wijziging">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="23 4 23 10 17 10"/>
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                    </svg>
                    <span>Automatisch</span>
                </button>
                <button class="btn-toolbar toc-mode-btn" id="tocModeHandmatig" data-mode="handmatig" title="Inhoud bevriezen">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                    <span>Handmatig</span>
                </button>
                <button class="btn-toolbar" id="tocRefreshBtn" title="Nu bijwerken">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="1 4 1 10 7 10"/>
                        <path d="M3.51 15a9 9 0 1 0 .49-4.95"/>
                    </svg>
                    <span>Bijwerken</span>
                </button>
            </div>
        </div>

        <div class="toolbar-separator animate-item" style="animation-delay:0.2s"></div>

        <div class="toolbar-group animate-item" style="animation-delay:0.25s">
            <label class="toolbar-label">Titel</label>
            <div class="toolbar-buttons">
                <input type="text" id="tocTitleInput" class="toc-title-input" value="Inhoudsopgave" maxlength="60" placeholder="Titel...">
            </div>
        </div>

        <div class="toolbar-separator animate-item" style="animation-delay:0.3s"></div>

        <div class="toolbar-group animate-item" style="animation-delay:0.35s">
            <label class="toolbar-label">Acties</label>
            <div class="toolbar-buttons">
                <button class="btn-toolbar btn-toolbar-danger" id="tocDeleteBtn">
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
        // Stijl
        panel.querySelectorAll('.toc-style-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!_activeToc) return;
                _activeToc.setAttribute('data-toc-style', btn.dataset.style);
                _renderContent(_activeToc);
                _syncPanel(_activeToc);
                window.updateUnsavedIndicator && window.updateUnsavedIndicator();
            });
        });

        // Modus
        panel.querySelectorAll('.toc-mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!_activeToc) return;
                const mode = btn.dataset.mode;
                _activeToc.setAttribute('data-toc-mode', mode);
                const badge = _activeToc.querySelector('.summie-toc-mode-badge');
                if (badge) badge.textContent = mode === 'auto' ? 'Auto' : 'Handmatig';
                _syncPanel(_activeToc);
                window.updateUnsavedIndicator && window.updateUnsavedIndicator();
            });
        });

        // Handmatig bijwerken
        panel.querySelector('#tocRefreshBtn').addEventListener('click', () => {
            if (!_activeToc) return;
            _renderContent(_activeToc);
            window.updateUnsavedIndicator && window.updateUnsavedIndicator();
        });

        // Titel
        panel.querySelector('#tocTitleInput').addEventListener('input', e => {
            if (!_activeToc) return;
            const titleEl = _activeToc.querySelector('.summie-toc-title');
            if (titleEl) titleEl.textContent = e.target.value || 'Inhoudsopgave';
            _activeToc.setAttribute('data-toc-title', e.target.value);
            window.updateUnsavedIndicator && window.updateUnsavedIndicator();
        });

        // Verwijderen
        panel.querySelector('#tocDeleteBtn').addEventListener('click', () => {
            if (!_activeToc) return;
            _activeToc.remove();
            _clearActive();
            window.updateUnsavedIndicator && window.updateUnsavedIndicator();
        });
    }

    function _syncPanel(toc) {
        const style = toc.getAttribute('data-toc-style') || 'klassiek';
        const mode = toc.getAttribute('data-toc-mode') || 'auto';
        const title = toc.getAttribute('data-toc-title') || 'Inhoudsopgave';

        document.querySelectorAll('.toc-style-btn').forEach(btn =>
            btn.classList.toggle('active', btn.dataset.style === style)
        );
        document.querySelectorAll('.toc-mode-btn').forEach(btn =>
            btn.classList.toggle('active', btn.dataset.mode === mode)
        );

        const titleInput = document.getElementById('tocTitleInput');
        if (titleInput) titleInput.value = title;
    }

    // ── MutationObserver — auto rebuild ──────────────────────────────────
    function _startObserver() {
        if (_observer) return;
        const editor = getEditor();
        if (!editor) return;

        _observer = new MutationObserver(() => {
            clearTimeout(_rebuildTimer);
            _rebuildTimer = setTimeout(() => {
                const editor = getEditor();
                if (!editor) return;
                editor.querySelectorAll('.summie-toc[data-toc-mode="auto"]').forEach(toc => {
                    _renderContent(toc);
                });
            }, 400);
        });

        _observer.observe(editor, {
            childList: true,
            subtree: true,
            characterData: true,
        });
    }

    // ── Init ──────────────────────────────────────────────────────────────
    function init() {
        if (window.ElementProtection) {
            window.ElementProtection.registerTab(CTX_ID, CTX_LABEL);
        }
        _buildPanel();

        // Toolbar insert button
        const btn = document.getElementById('insertTocBtn');
        if (btn) btn.addEventListener('click', insertToc);

        // Re-attach to any TOC elements loaded from file
        document.addEventListener('focusin', e => {
            const toc = e.target.closest && e.target.closest('[data-toc]');
            if (toc) { _setupToc(toc); _setActive(toc); }
        });

        // Click anywhere outside → deactivate
        document.addEventListener('mousedown', e => {
            if (!e.target.closest('[data-toc]') && !e.target.closest('#contextTabsContainer') && !e.target.closest('.section-toolbar')) {
                if (_activeToc) _clearActive();
            }
            // Setup on click
            const toc = e.target.closest && e.target.closest('[data-toc]');
            if (toc) { _setupToc(toc); }
        });

        // Render all auto TOCs on load + start observer
        setTimeout(() => {
            const editor = getEditor();
            if (!editor) return;
            editor.querySelectorAll('.summie-toc').forEach(toc => {
                _setupToc(toc);
                if (toc.getAttribute('data-toc-mode') !== 'handmatig') {
                    _renderContent(toc);
                }
            });
            _startObserver();
        }, 300);
    }

    function _escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else setTimeout(init, 0);

    return { insertToc };
})();