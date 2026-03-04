// ==================== TABLE CONTROLS ====================
// Registers "Tabelindeling" and "Tabelontwerp" context tabs.
// Shows when the user clicks into / focuses a table cell.
// Hides when focus leaves the table.

window.TableControls = (function () {
    'use strict';

    const TABS = [
        { id: 'tabel-indeling', label: 'Tabelindeling' },
        { id: 'tabel-ontwerp', label: 'Tabelontwerp' },
    ];

    let _activeTable = null; // currently focused <table>

    // ── Helpers ───────────────────────────────────────────────────────────

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

    function positionPopupBelow(popup, anchorEl) {
        if (!anchorEl) return;
        const rect = anchorEl.getBoundingClientRect();
        popup.style.top = (rect.bottom + 6) + 'px';
        popup.style.left = Math.min(rect.left, window.innerWidth - 240) + 'px';
    }

    function closeAllPopups() {
        document.querySelectorAll('.ctx-popup').forEach(p => p.remove());
    }

    function getFocusedCellInfo(tbl) {
        if (!tbl) return { rowIdx: -1, colIdx: -1, rowCount: 0, colCount: 0 };
        const active = document.activeElement;
        const allRows = Array.from(tbl.querySelectorAll('tr'));
        let rowIdx = -1, colIdx = -1;
        allRows.forEach((tr, ri) => {
            Array.from(tr.querySelectorAll('th, td')).forEach((cell, ci) => {
                if (cell === active || cell.contains(active)) { rowIdx = ri; colIdx = ci; }
            });
        });
        // Fall back to selection
        if (rowIdx === -1) {
            const sel = window.getSelection();
            if (sel && sel.rangeCount) {
                let node = sel.getRangeAt(0).startContainer;
                if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
                const cell = node.closest && node.closest('th, td');
                if (cell && tbl.contains(cell)) {
                    allRows.forEach((tr, ri) => {
                        Array.from(tr.querySelectorAll('th, td')).forEach((c, ci) => {
                            if (c === cell) { rowIdx = ri; colIdx = ci; }
                        });
                    });
                }
            }
        }
        const maxCols = allRows.reduce((m, tr) => Math.max(m, tr.querySelectorAll('th,td').length), 0);
        return { rowIdx, colIdx, rowCount: allRows.length, colCount: maxCols };
    }

    function allRows(tbl) { return tbl ? Array.from(tbl.querySelectorAll('tr')) : []; }
    function maxColCount(tbl) { return allRows(tbl).reduce((m, tr) => Math.max(m, tr.querySelectorAll('th,td').length), 0); }

    // ── Build Panels ──────────────────────────────────────────────────────

    function buildPanels() {
        buildIndelingPanel();
        buildOntwerpPanel();
    }

    function buildIndelingPanel() {
        const toolbar = document.querySelector('.section-toolbar');
        if (!toolbar || document.getElementById('ctx-panel-tabel-indeling')) return;

        const panel = document.createElement('div');
        panel.className = 'toolbar-content ctx-panel';
        panel.id = 'ctx-panel-tabel-indeling';
        panel.dataset.content = 'tabel-indeling';
        panel.style.display = 'none';

        panel.innerHTML = `
            <div class="toolbar-group animate-item ctx-group">
                <label class="toolbar-label">Rij</label>
                <div class="toolbar-buttons">
                    <button class="btn-toolbar ctx-btn tbl-act" id="tblAddRowAbove" data-action="addRowAbove">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="3" y="12" width="18" height="8" rx="1.5"/>
                            <line x1="12" y1="4" x2="12" y2="9"/><line x1="9.5" y1="6.5" x2="14.5" y2="6.5"/>
                        </svg>
                        <span>Rij erboven</span>
                    </button>
                    <button class="btn-toolbar ctx-btn tbl-act" id="tblAddRowBelow" data-action="addRowBelow">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="3" y="4" width="18" height="8" rx="1.5"/>
                            <line x1="12" y1="15" x2="12" y2="20"/><line x1="9.5" y1="17.5" x2="14.5" y2="17.5"/>
                        </svg>
                        <span>Rij eronder</span>
                    </button>
                    <button class="btn-toolbar ctx-btn ctx-btn-warn tbl-act" id="tblDelRow" data-action="delRow">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="3" y="8" width="18" height="8" rx="1.5"/>
                            <line x1="9" y1="12" x2="15" y2="12"/>
                        </svg>
                        <span>Rij verwijderen</span>
                    </button>
                </div>
            </div>

            <div class="toolbar-separator animate-item"></div>

            <div class="toolbar-group animate-item ctx-group">
                <label class="toolbar-label">Kolom</label>
                <div class="toolbar-buttons">
                    <button class="btn-toolbar ctx-btn tbl-act" id="tblAddColLeft" data-action="addColLeft">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="12" y="3" width="8" height="18" rx="1.5"/>
                            <line x1="4" y1="12" x2="9" y2="12"/><line x1="6.5" y1="9.5" x2="6.5" y2="14.5"/>
                        </svg>
                        <span>Kolom links</span>
                    </button>
                    <button class="btn-toolbar ctx-btn tbl-act" id="tblAddColRight" data-action="addColRight">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="4" y="3" width="8" height="18" rx="1.5"/>
                            <line x1="15" y1="12" x2="20" y2="12"/><line x1="17.5" y1="9.5" x2="17.5" y2="14.5"/>
                        </svg>
                        <span>Kolom rechts</span>
                    </button>
                    <button class="btn-toolbar ctx-btn ctx-btn-warn tbl-act" id="tblDelCol" data-action="delCol">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="8" y="3" width="8" height="18" rx="1.5"/>
                            <line x1="12" y1="9" x2="12" y2="15"/>
                        </svg>
                        <span>Kolom verwijderen</span>
                    </button>
                </div>
            </div>

            <div class="toolbar-separator animate-item"></div>

            <div class="toolbar-group animate-item ctx-group">
                <label class="toolbar-label ctx-label-danger">Verwijderen</label>
                <div class="toolbar-buttons">
                    <button class="btn-toolbar ctx-btn ctx-btn-danger tbl-act" id="tblDeleteTable" data-action="deleteTable">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-1 14H6L5 6"/>
                            <path d="M10 11v6M14 11v6"/>
                            <path d="M9 6V4h6v2"/>
                        </svg>
                        <span>Tabel verwijderen</span>
                    </button>
                </div>
            </div>
        `;

        toolbar.appendChild(panel);
        bindIndelingEvents(panel);
    }

    function buildOntwerpPanel() {
        const toolbar = document.querySelector('.section-toolbar');
        if (!toolbar || document.getElementById('ctx-panel-tabel-ontwerp')) return;

        const panel = document.createElement('div');
        panel.className = 'toolbar-content ctx-panel';
        panel.id = 'ctx-panel-tabel-ontwerp';
        panel.dataset.content = 'tabel-ontwerp';
        panel.style.display = 'none';

        panel.innerHTML = `
            <div class="toolbar-group animate-item ctx-group">
                <label class="toolbar-label">Tabelkleuren</label>
                <div class="toolbar-buttons">
                    <button class="btn-toolbar ctx-btn" id="tblBorderColorBtn">
                        <span class="ctx-color-swatch" id="tblBorderSwatch" style="background:#e2e8f0"></span>
                        <span>Randkleur</span>
                    </button>
                    <button class="btn-toolbar ctx-btn" id="tblBgColorBtn">
                        <span class="ctx-color-swatch" id="tblBgSwatch" style="background:#ffffff"></span>
                        <span>Achtergrond cellen</span>
                    </button>
                </div>
            </div>

            <div class="toolbar-separator animate-item"></div>

            <div class="toolbar-group animate-item ctx-group">
                <label class="toolbar-label">Rijkleuren</label>
                <div class="toolbar-buttons">
                    <button class="btn-toolbar ctx-btn" id="tblRowColorBtn">
                        <span class="ctx-color-swatch" id="tblRowSwatch" style="background:#f8fafc"></span>
                        <span>Huidige rij</span>
                    </button>
                    <button class="btn-toolbar ctx-btn" id="tblHeaderColorBtn">
                        <span class="ctx-color-swatch" id="tblHeaderSwatch" style="background:#eff6ff"></span>
                        <span>Koprij</span>
                    </button>
                </div>
            </div>

            <div class="toolbar-separator animate-item"></div>

            <div class="toolbar-group animate-item ctx-group">
                <label class="toolbar-label">Kolomkleur</label>
                <div class="toolbar-buttons">
                    <button class="btn-toolbar ctx-btn" id="tblColColorBtn">
                        <span class="ctx-color-swatch" id="tblColSwatch" style="background:#f8fafc"></span>
                        <span>Huidige kolom</span>
                    </button>
                </div>
            </div>

            <div class="toolbar-separator animate-item"></div>

            <div class="toolbar-group animate-item ctx-group">
                <label class="toolbar-label">Afmetingen</label>
                <div class="toolbar-buttons">
                    <div class="ctx-size-group">
                        <span class="ctx-size-label">Rijhoogte</span>
                        <input type="number" id="tblRowHeight" class="ctx-size-input" min="20" max="300" value="32" step="2">
                        <span class="ctx-size-unit">px</span>
                    </div>
                    <div class="ctx-size-group">
                        <span class="ctx-size-label">Kolombreedte</span>
                        <input type="number" id="tblColWidth" class="ctx-size-input" min="40" max="600" value="100" step="5">
                        <span class="ctx-size-unit">px</span>
                    </div>
                </div>
            </div>

            <div class="toolbar-separator animate-item"></div>

            <div class="toolbar-group animate-item ctx-group">
                <label class="toolbar-label">Lettertypes</label>
                <div class="toolbar-buttons">
                    <button class="btn-toolbar ctx-btn ctx-fmt-btn" id="tblRowBold" data-scope="row" data-fmt="bold">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg>
                        <span>Vet rij</span>
                    </button>
                    <button class="btn-toolbar ctx-btn ctx-fmt-btn" id="tblRowItalic" data-scope="row" data-fmt="italic">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>
                        <span>Cursief rij</span>
                    </button>
                    <button class="btn-toolbar ctx-btn ctx-fmt-btn" id="tblColBold" data-scope="col" data-fmt="bold">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg>
                        <span>Vet kolom</span>
                    </button>
                    <button class="btn-toolbar ctx-btn ctx-fmt-btn" id="tblColItalic" data-scope="col" data-fmt="italic">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>
                        <span>Cursief kolom</span>
                    </button>
                </div>
            </div>

            <div class="toolbar-separator animate-item"></div>

            <div class="toolbar-group animate-item ctx-group">
                <label class="toolbar-label ctx-label-danger">Verwijderen</label>
                <div class="toolbar-buttons">
                    <button class="btn-toolbar ctx-btn ctx-btn-danger" id="tblDeleteTable2">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-1 14H6L5 6"/>
                            <path d="M10 11v6M14 11v6"/>
                            <path d="M9 6V4h6v2"/>
                        </svg>
                        <span>Tabel verwijderen</span>
                    </button>
                </div>
            </div>
        `;

        toolbar.appendChild(panel);
        bindOntwerpEvents(panel);
    }

    // ── Indeling Panel Events ─────────────────────────────────────────────

    function bindIndelingEvents(panel) {
        panel.addEventListener('mousedown', e => e.preventDefault());

        panel.querySelectorAll('.tbl-act').forEach(btn => {
            btn.addEventListener('mouseenter', () => highlightTarget(btn.dataset.action));
            btn.addEventListener('mouseleave', () => clearHighlights());
            btn.addEventListener('click', () => {
                clearHighlights();
                execAction(btn.dataset.action);
            });
        });
    }

    // ── Row/Col Highlight Previews ────────────────────────────────────────

    function highlightTarget(action) {
        if (!_activeTable) return;
        clearHighlights();
        const info = getFocusedCellInfo(_activeTable);
        const rows = allRows(_activeTable);

        switch (action) {
            case 'addRowAbove':
                if (info.rowIdx >= 0) rows[info.rowIdx]?.querySelectorAll('th,td').forEach(c => c.classList.add('tbl-hl-add-above'));
                break;
            case 'addRowBelow':
                if (info.rowIdx >= 0) rows[info.rowIdx]?.querySelectorAll('th,td').forEach(c => c.classList.add('tbl-hl-add-below'));
                break;
            case 'delRow':
                if (info.rowIdx >= 0) rows[info.rowIdx]?.querySelectorAll('th,td').forEach(c => c.classList.add('tbl-hl-del'));
                break;
            case 'addColLeft':
            case 'addColRight':
                if (info.colIdx >= 0) rows.forEach(tr => {
                    const cells = Array.from(tr.querySelectorAll('th,td'));
                    if (cells[info.colIdx]) cells[info.colIdx].classList.add(action === 'addColLeft' ? 'tbl-hl-add-left' : 'tbl-hl-add-right');
                });
                break;
            case 'delCol':
                if (info.colIdx >= 0) rows.forEach(tr => {
                    const cells = Array.from(tr.querySelectorAll('th,td'));
                    if (cells[info.colIdx]) cells[info.colIdx].classList.add('tbl-hl-del');
                });
                break;
        }
    }

    function clearHighlights() {
        document.querySelectorAll('.tbl-hl-del,.tbl-hl-add-above,.tbl-hl-add-below,.tbl-hl-add-left,.tbl-hl-add-right')
            .forEach(c => c.classList.remove('tbl-hl-del', 'tbl-hl-add-above', 'tbl-hl-add-below', 'tbl-hl-add-left', 'tbl-hl-add-right'));
    }

    // ── Table Actions ─────────────────────────────────────────────────────

    function execAction(action) {
        if (!_activeTable) return;
        const info = getFocusedCellInfo(_activeTable);
        const rows = allRows(_activeTable);
        const cols = maxColCount(_activeTable);
        const ri = info.rowIdx >= 0 ? info.rowIdx : rows.length - 1;
        const ci = info.colIdx >= 0 ? info.colIdx : cols - 1;

        function makeCell(tag) {
            const c = document.createElement(tag);
            c.contentEditable = 'true';
            c.innerHTML = '<br>';
            return c;
        }

        if (action === 'addRowAbove' || action === 'addRowBelow') {
            const tr = document.createElement('tr');
            for (let i = 0; i < cols; i++) tr.appendChild(makeCell('td'));
            const refRow = rows[ri];
            if (action === 'addRowAbove') refRow.parentNode.insertBefore(tr, refRow);
            else refRow.parentNode.insertBefore(tr, refRow.nextSibling);
        }

        if (action === 'delRow') {
            if (rows.length <= 1) { window.showNotification?.('Tabel', 'Kan de enige rij niet verwijderen.', 'warning'); return; }
            rows[ri].remove();
        }

        if (action === 'addColLeft' || action === 'addColRight') {
            rows.forEach((tr, trIdx) => {
                const cells = Array.from(tr.querySelectorAll('th,td'));
                const refCell = cells[ci] || cells[cells.length - 1];
                const newCell = makeCell(trIdx === 0 ? 'th' : 'td');
                if (action === 'addColLeft') refCell.parentNode.insertBefore(newCell, refCell);
                else refCell.parentNode.insertBefore(newCell, refCell.nextSibling);
            });
        }

        if (action === 'delCol') {
            if (cols <= 1) { window.showNotification?.('Tabel', 'Kan de enige kolom niet verwijderen.', 'warning'); return; }
            rows.forEach(tr => {
                const cells = Array.from(tr.querySelectorAll('th,td'));
                cells[ci]?.remove();
            });
        }

        if (action === 'deleteTable') {
            if (!confirm('Tabel verwijderen?')) return;
            _activeTable.remove();
            _activeTable = null;
            window.ElementProtection?.hideContext(true);
        }

        window.saveToLocalStorage?.();
    }

    // ── Ontwerp Panel Events ──────────────────────────────────────────────

    function bindOntwerpEvents(panel) {
        panel.addEventListener('mousedown', e => {
            if (!e.target.matches('input[type="number"], input[type="color"]')) e.preventDefault();
        });

        // Color buttons
        bindColorButton(panel, '#tblBorderColorBtn', '#tblBorderSwatch', (color) => {
            _activeTable?.querySelectorAll('th,td').forEach(c => c.style.borderColor = color);
        });
        bindColorButton(panel, '#tblBgColorBtn', '#tblBgSwatch', (color) => {
            _activeTable?.querySelectorAll('td').forEach(c => c.style.background = color);
        });
        bindColorButton(panel, '#tblRowColorBtn', '#tblRowSwatch', (color) => {
            if (!_activeTable) return;
            const ri = getFocusedCellInfo(_activeTable).rowIdx;
            if (ri < 0) return;
            allRows(_activeTable)[ri]?.querySelectorAll('th,td').forEach(c => c.style.background = color);
        });
        bindColorButton(panel, '#tblHeaderColorBtn', '#tblHeaderSwatch', (color) => {
            _activeTable?.querySelector('tr')?.querySelectorAll('th,td').forEach(c => c.style.background = color);
        });
        bindColorButton(panel, '#tblColColorBtn', '#tblColSwatch', (color) => {
            if (!_activeTable) return;
            const ci = getFocusedCellInfo(_activeTable).colIdx;
            if (ci < 0) return;
            allRows(_activeTable).forEach(tr => {
                const cells = Array.from(tr.querySelectorAll('th,td'));
                if (cells[ci]) cells[ci].style.background = color;
            });
        });

        // Size inputs
        const rowHeightInput = panel.querySelector('#tblRowHeight');
        const colWidthInput = panel.querySelector('#tblColWidth');

        rowHeightInput?.addEventListener('change', () => {
            if (!_activeTable) return;
            const h = parseInt(rowHeightInput.value);
            if (isNaN(h)) return;
            const ri = getFocusedCellInfo(_activeTable).rowIdx;
            if (ri < 0) return;
            allRows(_activeTable)[ri]?.querySelectorAll('th,td').forEach(c => {
                c.style.height = h + 'px';
                c.style.minHeight = h + 'px';
            });
            window.saveToLocalStorage?.();
        });

        colWidthInput?.addEventListener('change', () => {
            if (!_activeTable) return;
            const w = parseInt(colWidthInput.value);
            if (isNaN(w)) return;
            const ci = getFocusedCellInfo(_activeTable).colIdx;
            if (ci < 0) return;
            allRows(_activeTable).forEach(tr => {
                const cells = Array.from(tr.querySelectorAll('th,td'));
                if (cells[ci]) { cells[ci].style.width = w + 'px'; cells[ci].style.minWidth = w + 'px'; }
            });
            window.saveToLocalStorage?.();
        });

        // Font style toggles
        panel.querySelectorAll('.ctx-fmt-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!_activeTable) return;
                const scope = btn.dataset.scope; // 'row' | 'col'
                const fmt = btn.dataset.fmt;   // 'bold' | 'italic'
                const info = getFocusedCellInfo(_activeTable);
                let cells = [];

                if (scope === 'row' && info.rowIdx >= 0) {
                    cells = Array.from(allRows(_activeTable)[info.rowIdx]?.querySelectorAll('th,td') || []);
                } else if (scope === 'col' && info.colIdx >= 0) {
                    allRows(_activeTable).forEach(tr => {
                        const c = Array.from(tr.querySelectorAll('th,td'));
                        if (c[info.colIdx]) cells.push(c[info.colIdx]);
                    });
                }

                const isActive = btn.classList.contains('ctx-btn-active');
                cells.forEach(cell => {
                    if (fmt === 'bold') cell.style.fontWeight = isActive ? '' : 'bold';
                    if (fmt === 'italic') cell.style.fontStyle = isActive ? '' : 'italic';
                });
                btn.classList.toggle('ctx-btn-active', !isActive);
                window.saveToLocalStorage?.();
            });
        });

        // Second delete button
        panel.querySelector('#tblDeleteTable2')?.addEventListener('click', () => {
            if (!_activeTable) return;
            if (!confirm('Tabel verwijderen?')) return;
            _activeTable.remove();
            _activeTable = null;
            window.ElementProtection?.hideContext(true);
            window.saveToLocalStorage?.();
        });
    }

    function bindColorButton(panel, btnSelector, swatchSelector, applyFn) {
        const btn = panel.querySelector(btnSelector);
        const swatch = panel.querySelector(swatchSelector);
        if (!btn) return;

        btn.addEventListener('click', () => {
            closeAllPopups();
            const currentColor = hexFromAny(swatch ? swatch.style.background : '#ffffff');

            const popup = document.createElement('div');
            popup.className = 'ctx-popup';
            popup.innerHTML = `
                <div class="ctx-popup-title">Kleur kiezen</div>
                <div class="ctx-popup-row">
                    <input type="color" class="ctx-color-input ctx-color-large" id="ctxColorIn" value="${currentColor}">
                    <span class="ctx-popup-hex" id="ctxColorHex">${currentColor}</span>
                </div>
                <div class="ctx-popup-actions">
                    <button class="ctx-popup-btn ctx-popup-cancel">Annuleren</button>
                    <button class="ctx-popup-btn ctx-popup-confirm">Toepassen</button>
                </div>
            `;
            document.body.appendChild(popup);
            positionPopupBelow(popup, btn);

            const input = popup.querySelector('#ctxColorIn');
            const hex = popup.querySelector('#ctxColorHex');

            input.addEventListener('input', () => {
                hex.textContent = input.value;
                applyFn(input.value); // live preview
            });

            popup.querySelector('.ctx-popup-cancel').addEventListener('click', () => {
                applyFn(currentColor); // revert
                popup.remove();
            });
            popup.querySelector('.ctx-popup-confirm').addEventListener('click', () => {
                applyFn(input.value);
                if (swatch) swatch.style.background = input.value;
                window.saveToLocalStorage?.();
                popup.remove();
            });

            setTimeout(() => {
                document.addEventListener('mousedown', function close(ev) {
                    if (!popup.contains(ev.target)) { popup.remove(); document.removeEventListener('mousedown', close); }
                });
            }, 50);
        });
    }

    // ── Focus / Click Detection ───────────────────────────────────────────

    function onEditorFocusin(e) {
        const editor = document.getElementById('editor');
        if (!editor) return;

        // Did focus land inside a table cell?
        const cell = e.target.closest && e.target.closest('th, td');
        if (cell) {
            const tbl = cell.closest('table');
            if (tbl && editor.contains(tbl)) {
                window.ElementProtection?.cancelHide();
                if (_activeTable !== tbl) {
                    _activeTable = tbl;
                    window.ElementProtection?.showContext('table');
                }
                return;
            }
        }
    }

    function onEditorClick(e) {
        const editor = document.getElementById('editor');
        if (!editor) return;

        const cell = e.target.closest && e.target.closest('th, td');
        if (cell) {
            const tbl = cell.closest('table');
            if (tbl && editor.contains(tbl)) {
                window.ElementProtection?.cancelHide();
                if (_activeTable !== tbl) {
                    _activeTable = tbl;
                    window.ElementProtection?.showContext('table');
                }
                return;
            }
        }
    }

    function onDocumentFocusin(e) {
        // If focus went to toolbar/topbar, cancel hide
        if (e.target.closest && (
            e.target.closest('.section-toolbar') ||
            e.target.closest('#contextTabsContainer') ||
            e.target.closest('.topbar')
        )) {
            window.ElementProtection?.cancelHide();
            return;
        }

        // Focus left the table — hide if we are the active context
        if (window.ElementProtection?.getContext() !== 'table') return;
        const editor = document.getElementById('editor');
        if (!editor) return;

        const cell = e.target.closest && e.target.closest('th, td');
        if (cell) {
            const tbl = cell.closest('table');
            if (tbl && editor.contains(tbl)) return; // still in a table
        }

        _activeTable = null;
        window.ElementProtection?.hideContext(false);
    }

    // ── Init ──────────────────────────────────────────────────────────────

    function init() {
        TABS.forEach(t => window.ElementProtection?.registerTab(t.id, t.label));
        buildPanels();

        const editor = document.getElementById('editor');
        if (!editor) return;

        editor.addEventListener('focusin', onEditorFocusin);
        editor.addEventListener('click', onEditorClick);
        document.addEventListener('focusin', onDocumentFocusin);

        // Also hide context when user clicks in the editor but outside any table cell
        // (focusin doesn't fire if editor was already focused)
        editor.addEventListener('click', (e) => {
            if (window.ElementProtection?.getContext() !== 'table') return;
            const cell = e.target.closest && e.target.closest('th, td');
            if (!cell) {
                _activeTable = null;
                window.ElementProtection?.hideContext(false);
            }
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else setTimeout(init, 100); // load after element-protection

    return {
        getActiveTable: () => _activeTable,
        clearHighlights,
    };

})();