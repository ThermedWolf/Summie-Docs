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
    let _activeCellInfo = { rowIdx: -1, colIdx: -1 }; // last known focused cell

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
        // Fall back to last known cell (focus may be on a toolbar input or color picker)
        if (rowIdx === -1 && _activeCellInfo.rowIdx !== -1) {
            rowIdx = _activeCellInfo.rowIdx;
            colIdx = _activeCellInfo.colIdx;
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
            <!-- ① Tabelstijl presets -->
            <div class="toolbar-group animate-item ctx-group">
                <label class="toolbar-label">Tabelstijl</label>
                <div class="toolbar-buttons" style="gap:4px;flex-wrap:wrap;">
                    <button class="btn-toolbar ctx-btn tbl-style-btn ctx-btn-active" data-style="top"      title="Bovenste rij als kop">
                        <svg width="22" height="18" viewBox="0 0 22 18"><rect x="0" y="0" width="22" height="6" rx="1" fill="currentColor" opacity=".7"/><rect x="0" y="7" width="22" height="5" rx="1" fill="currentColor" opacity=".2"/><rect x="0" y="13" width="22" height="5" rx="1" fill="currentColor" opacity=".2"/></svg>
                        <span>Top rij</span>
                    </button>
                    <button class="btn-toolbar ctx-btn tbl-style-btn" data-style="left" title="Linkerkolom als kop">
                        <svg width="22" height="18" viewBox="0 0 22 18"><rect x="0" y="0" width="6" height="18" rx="1" fill="currentColor" opacity=".7"/><rect x="7" y="0" width="7" height="18" rx="1" fill="currentColor" opacity=".2"/><rect x="15" y="0" width="7" height="18" rx="1" fill="currentColor" opacity=".2"/></svg>
                        <span>Linker rij</span>
                    </button>
                    <button class="btn-toolbar ctx-btn tbl-style-btn" data-style="top-left" title="Bovenste rij en linkerkolom als kop">
                        <svg width="22" height="18" viewBox="0 0 22 18"><rect x="0" y="0" width="22" height="6" rx="1" fill="currentColor" opacity=".7"/><rect x="0" y="7" width="6" height="11" rx="1" fill="currentColor" opacity=".7"/><rect x="7" y="7" width="15" height="11" rx="1" fill="currentColor" opacity=".2"/></svg>
                        <span>Top + links</span>
                    </button>
                    <button class="btn-toolbar ctx-btn tbl-style-btn" data-style="top-right" title="Bovenste rij en rechterkolom als kop">
                        <svg width="22" height="18" viewBox="0 0 22 18"><rect x="0" y="0" width="22" height="6" rx="1" fill="currentColor" opacity=".7"/><rect x="15" y="7" width="7" height="11" rx="1" fill="currentColor" opacity=".7"/><rect x="0" y="7" width="14" height="11" rx="1" fill="currentColor" opacity=".2"/></svg>
                        <span>Top + rechts</span>
                    </button>
                    <button class="btn-toolbar ctx-btn tbl-style-btn" data-style="right" title="Rechterkolom als kop">
                        <svg width="22" height="18" viewBox="0 0 22 18"><rect x="15" y="0" width="7" height="18" rx="1" fill="currentColor" opacity=".7"/><rect x="0" y="0" width="14" height="18" rx="1" fill="currentColor" opacity=".2"/></svg>
                        <span>Rechter rij</span>
                    </button>
                    <button class="btn-toolbar ctx-btn tbl-style-btn" data-style="none" title="Geen kopcellen">
                        <svg width="22" height="18" viewBox="0 0 22 18"><rect x="0" y="0" width="22" height="18" rx="1" fill="currentColor" opacity=".2"/></svg>
                        <span>Leeg</span>
                    </button>
                </div>
            </div>

            <div class="toolbar-separator animate-item"></div>

            <!-- ② Koptijl op huidig rij/kolom -->
            <div class="toolbar-group animate-item ctx-group">
                <label class="toolbar-label">Huidige selectie</label>
                <div class="toolbar-buttons">
                    <button class="btn-toolbar ctx-btn" id="tblMakeHeaderRow" title="Maak huidige rij een koprij (vet + lichtgrijs)">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="7" rx="1"/><rect x="3" y="14" width="18" height="7" rx="1" opacity=".4"/></svg>
                        <span>Koptijl rij</span>
                    </button>
                    <button class="btn-toolbar ctx-btn" id="tblMakeHeaderCol" title="Maak huidige kolom een kopkolom (vet + lichtgrijs)">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="18" rx="1" opacity=".4"/></svg>
                        <span>Koptijl kolom</span>
                    </button>
                </div>
            </div>

            <div class="toolbar-separator animate-item"></div>

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
                        <button class="btn-toolbar ctx-btn tbl-size-reset" id="tblRowHeightReset" title="Standaard hoogte herstellen" style="padding:2px 5px;font-size:11px;">↺</button>
                    </div>
                    <div class="ctx-size-group">
                        <span class="ctx-size-label">Kolombreedte</span>
                        <input type="number" id="tblColWidth" class="ctx-size-input" min="40" max="600" value="100" step="5">
                        <span class="ctx-size-unit">px</span>
                        <button class="btn-toolbar ctx-btn tbl-size-reset" id="tblColWidthReset" title="Standaard breedte herstellen" style="padding:2px 5px;font-size:11px;">↺</button>
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
            const isRatio = _activeTable.classList.contains('summie-ratio-table');
            rows.forEach((tr, trIdx) => {
                const cells = Array.from(tr.querySelectorAll('th,td'));
                const refCell = cells[ci] || cells[cells.length - 1];
                // Ratio tables: all rows use td (no th header row); stamp data-ratio-cell
                // unless it's the label column (ci === 0)
                const tag = (!isRatio && trIdx === 0) ? 'th' : 'td';
                const newCell = makeCell(tag);
                if (isRatio && ci > 0) {
                    newCell.dataset.ratioCell = '1';
                    newCell.textContent = '';
                    newCell.innerHTML = '';
                }
                if (action === 'addColLeft') refCell.parentNode.insertBefore(newCell, refCell);
                else refCell.parentNode.insertBefore(newCell, refCell.nextSibling);
            });
            // Re-trigger ratio recalc + arrow redraw after column added
            if (_activeTable.classList.contains('summie-ratio-table')) {
                const tblRef = _activeTable;
                const wrapper = tblRef.closest('.ratio-table-wrapper');
                const svg = wrapper?.querySelector('.ratio-arrows-svg');
                if (wrapper && svg) {
                    // Two rAFs ensure layout is fully settled before measuring offsets
                    requestAnimationFrame(() => requestAnimationFrame(() => {
                        window.TableManager?._recalcRatioTable(wrapper, tblRef, svg);
                    }));
                }
            }
        }

        if (action === 'delCol') {
            if (cols <= 1) { window.showNotification?.('Tabel', 'Kan de enige kolom niet verwijderen.', 'warning'); return; }
            rows.forEach(tr => {
                const cells = Array.from(tr.querySelectorAll('th,td'));
                cells[ci]?.remove();
            });
        }

        if (action === 'deleteTable') {
            _activeTable.remove();
            _activeTable = null;
            _activeCellInfo = { rowIdx: -1, colIdx: -1 };
            window.ElementProtection?.hideContext(true);
        }

        window.saveToLocalStorage?.();
        // Re-stamp cell refs after structural changes (add/del row/col)
        if (_activeTable) stampCellRefs(_activeTable);
        // Re-trigger ratio recalc + arrow redraw for ratio tables
        if (_activeTable?.classList.contains('summie-ratio-table')) {
            const tblRef = _activeTable;
            const wrapper = tblRef.closest('.ratio-table-wrapper');
            const svg = wrapper?.querySelector('.ratio-arrows-svg');
            if (wrapper && svg) {
                requestAnimationFrame(() => requestAnimationFrame(() => {
                    window.TableManager?._recalcRatioTable(wrapper, tblRef, svg);
                }));
            }
        }
    }

    // ── Ontwerp: apply tabel style preset ───────────────────────────────

    const HEADER_BG = 'rgba(59,130,246,0.06)';
    const HEADER_FW = '600';

    // Swap a cell between th and td, preserving all content, styles and data attributes
    function swapCellTag(cell, toTag) {
        if (cell.tagName.toLowerCase() === toTag) return cell;
        const replacement = document.createElement(toTag);
        // Copy all attributes
        Array.from(cell.attributes).forEach(attr => replacement.setAttribute(attr.name, attr.value));
        // Copy inner content
        replacement.innerHTML = cell.innerHTML;
        cell.parentNode.replaceChild(replacement, cell);
        return replacement;
    }

    function applyTabelStijl(tbl, stijl) {
        if (!tbl) return;
        tbl.dataset.tabelStijl = stijl;
        const rows = allRows(tbl);
        const numCols = Array.from(rows[0]?.querySelectorAll('th,td') || []).length;

        rows.forEach((tr, ri) => {
            // Re-query after potential swaps in previous iterations
            const cells = Array.from(tr.querySelectorAll('th,td'));
            cells.forEach((cell, ci) => {
                const isTopRow = ri === 0;
                const isLeftCol = ci === 0;
                const isRightCol = ci === numCols - 1;

                let isHeader = false;
                if (stijl === 'top') isHeader = isTopRow;
                if (stijl === 'left') isHeader = isLeftCol;
                if (stijl === 'top-left') isHeader = isTopRow || isLeftCol;
                if (stijl === 'top-right') isHeader = isTopRow || isRightCol;
                if (stijl === 'right') isHeader = isRightCol;
                // 'none' leaves isHeader = false

                // Swap tag: th = header, td = normal
                swapCellTag(cell, isHeader ? 'th' : 'td');
            });
        });
        window.saveToLocalStorage?.();
    }

    function syncOntwerpStijlButtons(tbl) {
        const stijl = tbl?.dataset.tabelStijl || 'top';
        document.querySelectorAll('.tbl-style-btn').forEach(btn => {
            btn.classList.toggle('ctx-btn-active', btn.dataset.style === stijl);
        });
    }

    function syncOntwerpSizeInputs(cell, tbl) {
        const rowHeightInput = document.getElementById('tblRowHeight');
        const colWidthInput = document.getElementById('tblColWidth');
        if (!cell || !tbl) return;
        if (rowHeightInput) {
            const h = cell.getBoundingClientRect().height;
            rowHeightInput.value = Math.round(h);
        }
        if (colWidthInput) {
            const w = cell.getBoundingClientRect().width;
            colWidthInput.value = Math.round(w);
        }
    }

    // ── Ontwerp Panel Events ──────────────────────────────────────────────

    function bindOntwerpEvents(panel) {
        panel.addEventListener('mousedown', e => {
            if (!e.target.matches('input[type="number"], input[type="color"]')) e.preventDefault();
        });

        // Tabelstijl preset buttons
        panel.querySelectorAll('.tbl-style-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!_activeTable) return;
                panel.querySelectorAll('.tbl-style-btn').forEach(b => b.classList.remove('ctx-btn-active'));
                btn.classList.add('ctx-btn-active');
                applyTabelStijl(_activeTable, btn.dataset.style);
            });
        });

        // Koptijl rij / kolom buttons
        panel.querySelector('#tblMakeHeaderRow')?.addEventListener('click', () => {
            if (!_activeTable) return;
            const info = getFocusedCellInfo(_activeTable);
            if (info.rowIdx < 0) return;
            const tr = allRows(_activeTable)[info.rowIdx];
            Array.from(tr?.querySelectorAll('th,td') || []).forEach(cell => swapCellTag(cell, 'th'));
            window.saveToLocalStorage?.();
        });

        panel.querySelector('#tblMakeHeaderCol')?.addEventListener('click', () => {
            if (!_activeTable) return;
            const info = getFocusedCellInfo(_activeTable);
            if (info.colIdx < 0) return;
            allRows(_activeTable).forEach(tr => {
                const cells = Array.from(tr.querySelectorAll('th,td'));
                const cell = cells[info.colIdx];
                if (cell) swapCellTag(cell, 'th');
            });
            window.saveToLocalStorage?.();
        });

        // Color buttons — applyFn receives (color, snapshotTable, snapshotInfo)
        bindColorButton(panel, '#tblBorderColorBtn', '#tblBorderSwatch', (color, tbl) => {
            tbl?.querySelectorAll('th,td').forEach(c => c.style.borderColor = color);
        });
        bindColorButton(panel, '#tblBgColorBtn', '#tblBgSwatch', (color, tbl) => {
            tbl?.querySelectorAll('td').forEach(c => c.style.background = color);
        });
        bindColorButton(panel, '#tblRowColorBtn', '#tblRowSwatch', (color, tbl, info) => {
            if (!tbl || info.rowIdx < 0) return;
            allRows(tbl)[info.rowIdx]?.querySelectorAll('th,td').forEach(c => c.style.background = color);
        });
        bindColorButton(panel, '#tblHeaderColorBtn', '#tblHeaderSwatch', (color, tbl) => {
            tbl?.querySelector('tr')?.querySelectorAll('th,td').forEach(c => c.style.background = color);
        });
        bindColorButton(panel, '#tblColColorBtn', '#tblColSwatch', (color, tbl, info) => {
            if (!tbl || info.colIdx < 0) return;
            allRows(tbl).forEach(tr => {
                const cells = Array.from(tr.querySelectorAll('th,td'));
                if (cells[info.colIdx]) cells[info.colIdx].style.background = color;
            });
        });

        // Size inputs — snapshot table + cell info when the input gains focus
        const rowHeightInput = panel.querySelector('#tblRowHeight');
        const colWidthInput = panel.querySelector('#tblColWidth');

        let _sizeSnapshotTable = null, _sizeSnapshotInfo = null;

        const snapshotForSize = () => {
            if (_activeTable) {
                _sizeSnapshotTable = _activeTable;
                _sizeSnapshotInfo = getFocusedCellInfo(_activeTable);
            }
            window.ElementProtection?.cancelHide();
        };

        rowHeightInput?.addEventListener('focus', snapshotForSize);
        rowHeightInput?.addEventListener('mousedown', () => snapshotForSize());
        rowHeightInput?.addEventListener('change', () => {
            const tbl = _sizeSnapshotTable || _activeTable;
            const info = _sizeSnapshotInfo || (tbl ? getFocusedCellInfo(tbl) : null);
            if (!tbl || !info || info.rowIdx < 0) return;
            const h = parseInt(rowHeightInput.value);
            if (isNaN(h)) return;
            allRows(tbl)[info.rowIdx]?.querySelectorAll('th,td').forEach(c => {
                c.style.height = h + 'px';
                c.style.minHeight = h + 'px';
            });
            window.saveToLocalStorage?.();
        });

        colWidthInput?.addEventListener('focus', snapshotForSize);
        colWidthInput?.addEventListener('mousedown', () => snapshotForSize());
        colWidthInput?.addEventListener('change', () => {
            const tbl = _sizeSnapshotTable || _activeTable;
            const info = _sizeSnapshotInfo || (tbl ? getFocusedCellInfo(tbl) : null);
            if (!tbl || !info || info.colIdx < 0) return;
            const w = parseInt(colWidthInput.value);
            if (isNaN(w)) return;
            allRows(tbl).forEach(tr => {
                const cells = Array.from(tr.querySelectorAll('th,td'));
                if (cells[info.colIdx]) { cells[info.colIdx].style.width = w + 'px'; cells[info.colIdx].style.minWidth = w + 'px'; }
            });
            window.saveToLocalStorage?.();
        });

        // Afmetingen reset buttons
        panel.querySelector('#tblRowHeightReset')?.addEventListener('click', () => {
            const tbl = _sizeSnapshotTable || _activeTable;
            const info = _sizeSnapshotInfo || (tbl ? getFocusedCellInfo(tbl) : null);
            if (!tbl || !info || info.rowIdx < 0) return;
            allRows(tbl)[info.rowIdx]?.querySelectorAll('th,td').forEach(c => {
                c.style.height = '';
                c.style.minHeight = '';
            });
            // Sync input back to actual rendered height
            const firstCell = allRows(tbl)[info.rowIdx]?.querySelector('th,td');
            if (firstCell && rowHeightInput) {
                rowHeightInput.value = Math.round(firstCell.getBoundingClientRect().height);
            }
            window.saveToLocalStorage?.();
        });

        panel.querySelector('#tblColWidthReset')?.addEventListener('click', () => {
            const tbl = _sizeSnapshotTable || _activeTable;
            const info = _sizeSnapshotInfo || (tbl ? getFocusedCellInfo(tbl) : null);
            if (!tbl || !info || info.colIdx < 0) return;
            allRows(tbl).forEach(tr => {
                const cells = Array.from(tr.querySelectorAll('th,td'));
                if (cells[info.colIdx]) {
                    cells[info.colIdx].style.width = '';
                    cells[info.colIdx].style.minWidth = '';
                }
            });
            // Sync input back to actual rendered width
            const firstRow = allRows(tbl)[0];
            const firstCell = firstRow ? Array.from(firstRow.querySelectorAll('th,td'))[info.colIdx] : null;
            if (firstCell && colWidthInput) {
                colWidthInput.value = Math.round(firstCell.getBoundingClientRect().width);
            }
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
            _activeTable.remove();
            _activeTable = null;
            _activeCellInfo = { rowIdx: -1, colIdx: -1 };
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
            if (!_activeTable) return;

            // Snapshot table + cell info NOW before any focus change can null them
            const snapshotTable = _activeTable;
            const snapshotInfo = getFocusedCellInfo(_activeTable);

            // Keep context alive while popup is open
            window.ElementProtection?.cancelHide();

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

            // Prevent any mousedown inside the popup from triggering hide logic
            popup.addEventListener('mousedown', e => e.preventDefault());
            // Also keep context alive whenever the popup is interacted with
            popup.addEventListener('mousedown', () => window.ElementProtection?.cancelHide());
            popup.addEventListener('focusin', () => window.ElementProtection?.cancelHide());

            const input = popup.querySelector('#ctxColorIn');
            const hex = popup.querySelector('#ctxColorHex');

            // Use snapshot-based wrapper so applyFn always has valid table/cell refs
            const applyWithSnapshot = (color) => {
                applyFn(color, snapshotTable, snapshotInfo);
            };

            // After popup closes, restore focus to the snapshotted cell so context stays alive
            const restoreFocus = () => {
                if (!snapshotTable) return;
                const rows = allRows(snapshotTable);
                const ri = snapshotInfo.rowIdx >= 0 ? snapshotInfo.rowIdx : 0;
                const ci = snapshotInfo.colIdx >= 0 ? snapshotInfo.colIdx : 0;
                const row = rows[ri];
                const cell = row ? Array.from(row.querySelectorAll('th,td'))[ci] : null;
                if (cell) {
                    // Clear _activeTable so onEditorFocusin treats it as new and calls showContext
                    _activeTable = null;
                    window.ElementProtection?.cancelHide();
                    cell.focus();
                }
            };

            input.addEventListener('input', () => {
                hex.textContent = input.value;
                applyWithSnapshot(input.value); // live preview
            });

            popup.querySelector('.ctx-popup-cancel').addEventListener('click', () => {
                applyWithSnapshot(currentColor); // revert
                popup.remove();
                restoreFocus();
            });
            popup.querySelector('.ctx-popup-confirm').addEventListener('click', () => {
                applyWithSnapshot(input.value);
                if (swatch) swatch.style.background = input.value;
                window.saveToLocalStorage?.();
                popup.remove();
                restoreFocus();
            });

            setTimeout(() => {
                document.addEventListener('mousedown', function close(ev) {
                    if (!popup.contains(ev.target)) { popup.remove(); document.removeEventListener('mousedown', close); restoreFocus(); }
                });
            }, 50);
        });
    }

    // ── Focus / Click Detection ───────────────────────────────────────────

    function setCellFocused(cell) {
        // Remove .cell-focused from all cells in editor, then apply to this one
        document.querySelectorAll('.summie-table .cell-focused').forEach(c => c.classList.remove('cell-focused'));
        if (cell) cell.classList.add('cell-focused');
    }

    function onEditorFocusin(e) {
        const editor = document.getElementById('editor');
        if (!editor) return;

        // Did focus land inside a table cell?
        const cell = e.target.closest && e.target.closest('th, td');
        if (cell) {
            const tbl = cell.closest('table');
            if (tbl && editor.contains(tbl)) {
                setCellFocused(cell);
                // If user focuses a ratio auto-filled cell, mark it as manually edited
                // so the auto-fill won't overwrite it on next recalc
                if (cell.dataset.ratioAutoFilled === 'true') {
                    cell.addEventListener('input', () => {
                        cell.dataset.ratioAutoFilled = 'false';
                    }, { once: true });
                }
                window.ElementProtection?.cancelHide();
                if (_activeTable !== tbl) {
                    _activeTable = tbl;
                    window.ElementProtection?.showContext('table');
                    window.TableFormulas?.watchTable(tbl);
                    // Grey-out add/del row buttons for ratio tables (fixed 2-row structure)
                    _updateRatioRowButtons(tbl);
                }
                // Always update the saved cell position
                const info = getFocusedCellInfo(tbl);
                if (info.rowIdx !== -1) _activeCellInfo = { rowIdx: info.rowIdx, colIdx: info.colIdx };
                // Notify formula tab
                window.TableFormulas?.onCellFocused(cell, tbl);
                // Sync ontwerp panel inputs to current cell
                syncOntwerpSizeInputs(cell, tbl);
                syncOntwerpStijlButtons(tbl);
                return;
            }
        }
        // Focus is in editor but NOT in a table cell - clear all cell highlights
        // Only clear if focus didn't move to the toolbar/formula bar
        if (!e.relatedTarget?.closest || (
            !e.target.closest('.section-toolbar') &&
            !e.target.closest('#contextTabsContainer') &&
            !e.target.closest('.topbar')
        )) {
            setCellFocused(null);
        }
    }

    function onEditorClick(e) {
        const editor = document.getElementById('editor');
        if (!editor) return;

        const cell = e.target.closest && e.target.closest('th, td');
        if (cell) {
            const tbl = cell.closest('table');
            if (tbl && editor.contains(tbl)) {
                setCellFocused(cell);
                // If user focuses a ratio auto-filled cell, mark it as manually edited
                // so the auto-fill won't overwrite it on next recalc
                if (cell.dataset.ratioAutoFilled === 'true') {
                    cell.addEventListener('input', () => {
                        cell.dataset.ratioAutoFilled = 'false';
                    }, { once: true });
                }
                window.ElementProtection?.cancelHide();
                if (_activeTable !== tbl) {
                    _activeTable = tbl;
                    window.ElementProtection?.showContext('table');
                    _updateRatioRowButtons(tbl);
                }
                window.TableFormulas?.watchTable(tbl);
                // Always update the saved cell position
                const info = getFocusedCellInfo(tbl);
                if (info.rowIdx !== -1) _activeCellInfo = { rowIdx: info.rowIdx, colIdx: info.colIdx };
                // Notify formula tab
                window.TableFormulas?.onCellFocused(cell, tbl);
                // Sync ontwerp panel inputs to current cell
                syncOntwerpSizeInputs(cell, tbl);
                syncOntwerpStijlButtons(tbl);
                return;
            }
        }
    }

    function onDocumentFocusin(e) {
        // If focus went to toolbar/topbar/popup, cancel hide and keep cell border
        if (e.target.closest && (
            e.target.closest('.section-toolbar') ||
            e.target.closest('#contextTabsContainer') ||
            e.target.closest('.topbar') ||
            e.target.closest('.ctx-popup')
        )) {
            window.ElementProtection?.cancelHide();
            return;  // Keep .cell-focused intact — user is working in the formula bar
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

        if (_activeTable?._fmlObserver) {
            _activeTable._fmlObserver.disconnect();
            _activeTable._fmlWatching = false;
            _activeTable._fmlObserver = null;
        }
        setCellFocused(null);
        _updateRatioRowButtons(null); // restore row buttons
        _activeTable = null;
        _activeCellInfo = { rowIdx: -1, colIdx: -1 };
        window.TableFormulas?.onTableCleared();
        window.ElementProtection?.hideContext(false);
    }

    // ── Ratio table: grey-out row buttons ────────────────────────────────

    function _updateRatioRowButtons(tbl) {
        const isRatio = tbl?.classList.contains('summie-ratio-table');
        const addRowAbove = document.getElementById('tblAddRowAbove');
        const addRowBelow = document.getElementById('tblAddRowBelow');
        const delRow = document.getElementById('tblDelRow');
        [addRowAbove, addRowBelow, delRow].forEach(btn => {
            if (!btn) return;
            btn.disabled = !!isRatio;
            btn.style.opacity = isRatio ? '0.35' : '';
            btn.title = isRatio
                ? 'Rijen aanpassen niet mogelijk in een verhoudingstabel'
                : btn.dataset.origTitle || btn.title;
            if (!btn.dataset.origTitle && !isRatio) btn.dataset.origTitle = btn.title;
        });
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
                setCellFocused(null);
                _updateRatioRowButtons(null);
                _activeTable = null;
                _activeCellInfo = { rowIdx: -1, colIdx: -1 };
                window.ElementProtection?.hideContext(false);
            }
        });

        // Observe the Formules panel — toggle body.fml-panel-active so CSS can show cell coords
        const coordObserver = new MutationObserver(() => {
            const panel = document.getElementById('ctx-panel-tabel-formules');
            const isActive = panel && panel.classList.contains('active');
            document.body.classList.toggle('fml-panel-active', !!isActive);
            // Re-stamp any active table in case rows were added
            if (isActive && _activeTable) stampCellRefs(_activeTable);
        });
        // Observe the toolbar container for panel class changes
        const toolbar = document.querySelector('.section-toolbar');
        if (toolbar) coordObserver.observe(toolbar, { subtree: true, attributes: true, attributeFilter: ['class'] });

        // Inline formula trigger (Excel-style)
        // Typing '=' as the first char in a cell switches to the Formules tab
        // and pipes input straight into fmlInput — no manual tab click needed.
        editor.addEventListener('keydown', (e) => {
            const cell = document.activeElement && document.activeElement.closest('th, td');
            if (!cell) return;
            const tbl = cell.closest('table');
            if (!tbl || !editor.contains(tbl)) return;

            if (e.key === '=' && (cell.textContent.trim() === '' || window.getSelection()?.toString() === cell.textContent.trim())) {
                e.preventDefault();
                // Make sure this cell is registered as the active output cell
                window.TableFormulas?.onCellFocused(cell, tbl);
                // Switch to Formules context tab
                window.ElementProtection?.switchPanel('tabel-formules');
                // Seed fmlInput with '=' and focus it
                const fmlInput = document.getElementById('fmlInput');
                if (fmlInput) {
                    fmlInput.value = '=';
                    fmlInput.focus();
                    fmlInput.setSelectionRange(1, 1);
                }
                return;
            }
        });

        // When fmlInput is focused: Enter applies, Escape returns focus to cell
        document.addEventListener('keydown', (e) => {
            const fmlInput = document.getElementById('fmlInput');
            if (!fmlInput || document.activeElement !== fmlInput) return;

            if (e.key === 'Enter') {
                e.preventDefault();
                const applyBtn = document.getElementById('fmlApplyBtn');
                if (applyBtn) applyBtn.click();
                // Return focus to the active cell
                setTimeout(() => {
                    const activeCell = window.TableFormulas?.getActiveCell();
                    if (activeCell) activeCell.focus();
                }, 50);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                fmlInput.value = '';
                const activeCell = window.TableFormulas?.getActiveCell();
                if (activeCell) activeCell.focus();
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



// ==================== TABEL FORMULES TAB ====================

(function () {
    'use strict';

    const TAB_ID = 'tabel-formules';
    const TAB_LABEL = 'Formules';

    // ── Cell Reference Helpers ────────────────────────────────────────────

    function colLetter(idx) {
        let s = '';
        idx++;
        while (idx > 0) { idx--; s = String.fromCharCode(65 + (idx % 26)) + s; idx = Math.floor(idx / 26); }
        return s;
    }

    function colIndex(letters) {
        letters = letters.toUpperCase();
        let n = 0;
        for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
        return n - 1;
    }

    function parseRef(ref) {
        const m = String(ref).trim().match(/^([A-Za-z]+)(\d+)$/);
        if (!m) return null;
        return { col: colIndex(m[1]), row: parseInt(m[2]) - 1 };
    }

    function cellNumVal(tbl, ref) {
        const p = parseRef(ref);
        if (!p) return 0;
        const rows = Array.from(tbl.querySelectorAll('tr'));
        const row = rows[p.row]; if (!row) return 0;
        const cells = Array.from(row.querySelectorAll('th,td'));
        const cell = cells[p.col]; if (!cell) return 0;
        const raw = cell.dataset.formulaResult !== undefined ? cell.dataset.formulaResult : cell.textContent.trim();
        return parseFloat(String(raw).replace(/[€%\s\u202f]/g, '').replace(',', '.')) || 0;
    }

    function cellTextVal(tbl, ref) {
        const p = parseRef(ref);
        if (!p) return '';
        const rows = Array.from(tbl.querySelectorAll('tr'));
        const row = rows[p.row]; if (!row) return '';
        const cells = Array.from(row.querySelectorAll('th,td'));
        const cell = cells[p.col]; if (!cell) return '';
        return cell.textContent.trim();
    }

    function expandRange(tbl, rangeStr) {
        const parts = rangeStr.split(':');
        if (parts.length !== 2) return [rangeStr];
        const from = parseRef(parts[0]), to = parseRef(parts[1]);
        if (!from || !to) return [];
        const refs = [];
        for (let r = Math.min(from.row, to.row); r <= Math.max(from.row, to.row); r++)
            for (let c = Math.min(from.col, to.col); c <= Math.max(from.col, to.col); c++)
                refs.push(colLetter(c) + (r + 1));
        return refs;
    }

    function getCellRef(tbl, cell) {
        const rows = Array.from(tbl.querySelectorAll('tr'));
        for (let r = 0; r < rows.length; r++) {
            const cells = Array.from(rows[r].querySelectorAll('th,td'));
            for (let c = 0; c < cells.length; c++)
                if (cells[c] === cell) return colLetter(c) + (r + 1);
        }
        return null;
    }

    function getCellByRef(tbl, ref) {
        const p = parseRef(ref);
        if (!p) return null;
        const rows = Array.from(tbl.querySelectorAll('tr'));
        const row = rows[p.row]; if (!row) return null;
        return Array.from(row.querySelectorAll('th,td'))[p.col] || null;
    }

    // ── Relative formula copy ────────────────────────────────────────────

    // Shift a single cell ref (e.g. "B3") by dRow/dCol, clamped to ≥0
    function shiftRef(ref, dRow, dCol) {
        const p = parseRef(ref);
        if (!p) return ref;
        const newRow = p.row + dRow;
        const newCol = p.col + dCol;
        // Only clamp if the result would be genuinely out of bounds (negative)
        if (newRow < 0 || newCol < 0) return ref; // leave ref unchanged rather than corrupting it
        return colLetter(newCol) + (newRow + 1);
    }

    // Shift a range token like "A1:C3" or a single ref like "B2"
    function shiftToken(token, dRow, dCol) {
        token = token.trim();
        if (token.includes(':')) {
            const parts = token.split(':');
            return shiftRef(parts[0], dRow, dCol) + ':' + shiftRef(parts[1], dRow, dCol);
        }
        if (parseRef(token)) return shiftRef(token, dRow, dCol);
        return token;
    }

    // Rewrite all cell refs / ranges in a formula string by dRow, dCol
    function shiftFormula(formula, dRow, dCol) {
        if (!dRow && !dCol) return formula;
        // Single-pass: ranges (A1:C3) matched before lone refs (B2) so no double-shift
        return formula.replace(/([A-Za-z]+\d+:[A-Za-z]+\d+)|([A-Za-z]+\d+)/g, (m, range, ref) => {
            if (range) return shiftToken(range, dRow, dCol);
            if (ref && parseRef(ref)) return shiftRef(ref, dRow, dCol);
            return m;
        });
    }

    // ── Live recalc on source cell edit ──────────────────────────────────

    // Watch a table for cell edits and recalc dependent formula cells
    function stampCellRefs(tbl) {
        const rows = Array.from(tbl.querySelectorAll('tr'));
        rows.forEach((tr, r) => {
            Array.from(tr.querySelectorAll('th,td')).forEach((cell, c) => {
                cell.dataset.cellRef = colLetter(c) + (r + 1);
            });
        });
    }

    function watchTable(tbl) {
        if (tbl._fmlWatching) return;
        tbl._fmlWatching = true;
        stampCellRefs(tbl);

        // Table cells aren't individually contenteditable — the whole editor div is.
        // MutationObserver catches any text/subtree change inside the table.
        const observer = new MutationObserver(() => {
            // Find which cell the cursor is in right now (the one being edited)
            const sel = window.getSelection();
            let editedCell = null;
            if (sel && sel.rangeCount) {
                let node = sel.getRangeAt(0).startContainer;
                if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
                editedCell = node.closest && node.closest('th,td');
            }

            clearTimeout(tbl._fmlRecalcTimer);
            tbl._fmlRecalcTimer = setTimeout(() => {
                tbl.querySelectorAll('th[data-formula],td[data-formula]').forEach(cell => {
                    if (cell === editedCell) return; // don't overwrite while user is typing
                    applyFormulaToCell(tbl, cell,
                        cell.dataset.formula,
                        cell.dataset.formulaFmt || 'num',
                        cell.dataset.formulaDecimals || '2'
                    );
                });
                // Recalc ratio labels if this is a ratio table
                if (tbl.classList.contains('summie-ratio-table')) {
                    window.TableManager?._recalcRatioLabels(tbl);
                }
            }, 300);
        });

        observer.observe(tbl, { childList: true, subtree: true, characterData: true });
        tbl._fmlObserver = observer;
    }

    // ── Formula Evaluator ─────────────────────────────────────────────────

    function splitArgs(str) {
        const args = []; let depth = 0, cur = '';
        for (const ch of str) {
            if (ch === '(') { depth++; cur += ch; }
            else if (ch === ')') { depth--; cur += ch; }
            else if (ch === ',' && depth === 0) { args.push(cur.trim()); cur = ''; }
            else cur += ch;
        }
        if (cur.trim()) args.push(cur.trim());
        return args;
    }

    function evalArg(tbl, arg) {
        if (arg === undefined || arg === null) return 0;
        arg = String(arg).trim();
        if (/^["'].*["']$/.test(arg)) return arg.slice(1, -1);
        if (/^[A-Za-z]+\d+$/.test(arg)) return cellNumVal(tbl, arg);
        const n = parseFloat(arg);
        if (!isNaN(n)) return n;
        return evalFormula(tbl, arg);
    }

    const FN = {
        // Aggregatie
        SOM: (t, a) => a.flatMap(x => expandRange(t, x)).reduce((s, r) => s + cellNumVal(t, r), 0),
        SUM: (t, a) => a.flatMap(x => expandRange(t, x)).reduce((s, r) => s + cellNumVal(t, r), 0),
        GEMIDDELDE: (t, a) => { const v = a.flatMap(x => expandRange(t, x)).map(r => cellNumVal(t, r)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0; },
        AVERAGE: (t, a) => { const v = a.flatMap(x => expandRange(t, x)).map(r => cellNumVal(t, r)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0; },
        MIN: (t, a) => Math.min(...a.flatMap(x => expandRange(t, x)).map(r => cellNumVal(t, r))),
        MAX: (t, a) => Math.max(...a.flatMap(x => expandRange(t, x)).map(r => cellNumVal(t, r))),
        AANTAL: (t, a) => a.flatMap(x => expandRange(t, x)).length,
        COUNT: (t, a) => a.flatMap(x => expandRange(t, x)).length,
        PRODUCT: (t, a) => a.flatMap(x => expandRange(t, x)).reduce((s, r) => s * cellNumVal(t, r), 1),
        STDEV: (t, a) => { const v = a.flatMap(x => expandRange(t, x)).map(r => cellNumVal(t, r)); if (v.length < 2) return 0; const m = v.reduce((s, x) => s + x, 0) / v.length; return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)); },
        MEDIAN: (t, a) => { const v = [...a.flatMap(x => expandRange(t, x)).map(r => cellNumVal(t, r))].sort((a, b) => a - b); const m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; },
        // Wiskunde
        ABS: (t, a) => Math.abs(evalArg(t, a[0])),
        SQRT: (t, a) => Math.sqrt(evalArg(t, a[0])),
        MACHT: (t, a) => Math.pow(evalArg(t, a[0]), evalArg(t, a[1])),
        POWER: (t, a) => Math.pow(evalArg(t, a[0]), evalArg(t, a[1])),
        MOD: (t, a) => evalArg(t, a[0]) % evalArg(t, a[1]),
        AFRONDEN: (t, a) => parseFloat(evalArg(t, a[0]).toFixed(parseInt(evalArg(t, a[1])) || 0)),
        ROUND: (t, a) => parseFloat(evalArg(t, a[0]).toFixed(parseInt(evalArg(t, a[1])) || 0)),
        CEILING: (t, a) => Math.ceil(evalArg(t, a[0])),
        FLOOR: (t, a) => Math.floor(evalArg(t, a[0])),
        INT: (t, a) => Math.trunc(evalArg(t, a[0])),
        LOG: (t, a) => a[1] ? Math.log(evalArg(t, a[0])) / Math.log(evalArg(t, a[1])) : Math.log10(evalArg(t, a[0])),
        LN: (t, a) => Math.log(evalArg(t, a[0])),
        EXP: (t, a) => Math.exp(evalArg(t, a[0])),
        PI: () => Math.PI,
        SIGN: (t, a) => Math.sign(evalArg(t, a[0])),
        // Logisch
        ALS: (t, a) => evalArg(t, a[0]) ? evalArg(t, a[1]) : evalArg(t, a[2]),
        IF: (t, a) => evalArg(t, a[0]) ? evalArg(t, a[1]) : evalArg(t, a[2]),
        EN: (t, a) => a.every(x => evalArg(t, x)) ? 1 : 0,
        AND: (t, a) => a.every(x => evalArg(t, x)) ? 1 : 0,
        OF: (t, a) => a.some(x => evalArg(t, x)) ? 1 : 0,
        OR: (t, a) => a.some(x => evalArg(t, x)) ? 1 : 0,
        NIET: (t, a) => evalArg(t, a[0]) ? 0 : 1,
        NOT: (t, a) => evalArg(t, a[0]) ? 0 : 1,
        // Tekst
        SAMENVOEGEN: (t, a) => a.map(x => { const p = parseRef(x.trim()); return p ? cellTextVal(t, x.trim()) : x.replace(/^["']|["']$/g, ''); }).join(''),
        CONCAT: (t, a) => a.map(x => { const p = parseRef(x.trim()); return p ? cellTextVal(t, x.trim()) : x.replace(/^["']|["']$/g, ''); }).join(''),
        LENGTE: (t, a) => cellTextVal(t, a[0]).length,
        LEN: (t, a) => cellTextVal(t, a[0]).length,
        HOOFDLETTERS: (t, a) => cellTextVal(t, a[0]).toUpperCase(),
        UPPER: (t, a) => cellTextVal(t, a[0]).toUpperCase(),
        KLEINE_LETTERS: (t, a) => cellTextVal(t, a[0]).toLowerCase(),
        LOWER: (t, a) => cellTextVal(t, a[0]).toLowerCase(),
        TEKST: (t, a) => String(evalArg(t, a[0])),
        TEXT: (t, a) => String(evalArg(t, a[0])),
    };

    function evalFormula(tbl, formula) {
        formula = String(formula).trim();
        if (formula.startsWith('=')) formula = formula.slice(1).trim();

        // If the entire formula is a single function call, handle directly
        const fnMatch = formula.match(/^([A-Za-z_][A-Za-z0-9_]*)\((.*)\)$/s);
        if (fnMatch) {
            const name = fnMatch[1].toUpperCase();
            const fn = FN[name];
            if (fn) {
                const args = fnMatch[2].trim() ? splitArgs(fnMatch[2]) : [];
                try { return fn(tbl, args); } catch (e) { return '#FOUT'; }
            }
            return '#NAAM?';
        }

        // Mixed expression (e.g. CEILING(A1/B1)*C1) —
        // recursively resolve all function calls, then evaluate as arithmetic
        function resolveFunctions(expr) {
            // Find outermost function calls and replace with their result
            return expr.replace(/([A-Za-z_][A-Za-z0-9_]*)\(([^()]*)\)/g, (match, name, argsStr) => {
                const fn = FN[name.toUpperCase()];
                if (!fn) return match; // leave unknown names for #NAAM? below
                const args = argsStr.trim() ? splitArgs(argsStr) : [];
                try {
                    const result = fn(tbl, args);
                    return typeof result === 'number' ? String(result) : JSON.stringify(result);
                } catch (e) { return '0'; }
            });
        }

        // Resolve nested function calls (up to 5 levels deep)
        let expr = formula;
        for (let i = 0; i < 5; i++) {
            const resolved = resolveFunctions(expr);
            if (resolved === expr) break;
            expr = resolved;
        }

        // Check for unresolved function names
        if (/[A-Za-z_][A-Za-z0-9_]*\s*\(/.test(expr)) return '#NAAM?';

        // Arithmetic expression — replace remaining cell refs with values
        const substituted = expr
            .replace(/[^0-9+\-*/.()^A-Za-z\s,<>=!%"']/g, '')
            .replace(/[A-Za-z]+\d+/g, ref => parseRef(ref) ? String(cellNumVal(tbl, ref)) : '0')
            .replace(/\^/g, '**');
        try {
            // eslint-disable-next-line no-new-func
            const r = Function('"use strict";return(' + substituted + ')')();
            return typeof r === 'number' ? (isFinite(r) ? r : '#DIV/0!') : r;
        } catch (e) { return '#FOUT'; }
    }

    // ── Format ────────────────────────────────────────────────────────────

    function formatResult(value, fmt, decimals) {
        if (typeof value === 'string' && value.startsWith('#')) return value;
        const num = typeof value === 'number' ? value : parseFloat(value);
        if (isNaN(num)) return String(value);
        const d = parseInt(decimals) || 0;
        if (fmt === 'pct') return num.toFixed(d) + '\u202f%';
        if (fmt === 'eur') return '€\u202f' + num.toFixed(Math.max(d, 2)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        return parseFloat(num.toFixed(d)).toString();
    }

    // ── Apply / Recalc ────────────────────────────────────────────────────

    function applyFormulaToCell(tbl, targetCell, formula, fmt, decimals) {
        const result = evalFormula(tbl, formula);
        const display = formatResult(result, fmt, decimals);
        targetCell.dataset.formula = formula;
        targetCell.dataset.formulaResult = typeof result === 'number' ? result : String(result);
        targetCell.dataset.formulaFmt = fmt || 'num';
        targetCell.dataset.formulaDecimals = decimals !== undefined ? decimals : '2';
        targetCell.textContent = display;
        window.saveToLocalStorage?.();
    }

    function recalcTable(tbl) {
        tbl.querySelectorAll('th[data-formula],td[data-formula]').forEach(cell => {
            applyFormulaToCell(tbl, cell,
                cell.dataset.formula,
                cell.dataset.formulaFmt || 'num',
                cell.dataset.formulaDecimals || '2'
            );
        });
        // If this is a ratio table, recalc ratio labels too
        if (tbl.classList.contains('summie-ratio-table')) {
            window.TableManager?._recalcRatioLabels(tbl);
        }
    }

    // ── State ─────────────────────────────────────────────────────────────

    let _activeCell = null;  // the output cell (receives the formula)
    let _activeTable = null;
    let _fmt = 'num';
    let _decimals = 2;

    // Clipboard for formula copy/paste
    let _copyBuffer = null; // { formula, fmt, decimals, fromRef } | null

    // Cell-picker mode: user clicks cells to add them to the formula
    let _pickerMode = false;
    let _pickedRefs = [];    // array of ref strings picked so far

    // ── Cell Picker ───────────────────────────────────────────────────────

    function startPicker() {
        _pickerMode = true;
        _pickedRefs = [];
        if (_activeTable) _activeTable.classList.add('fml-pick-mode');
        updatePickerUI();
    }

    function stopPicker() {
        _pickerMode = false;
        if (_activeTable) {
            _activeTable.classList.remove('fml-pick-mode');
            _activeTable.querySelectorAll('.fml-picked,.fml-output-cell').forEach(c => {
                c.classList.remove('fml-picked', 'fml-output-cell');
            });
        }
        updatePickerUI();
    }

    function togglePickedCell(cell) {
        const ref = getCellRef(_activeTable, cell);
        if (!ref) return;
        const idx = _pickedRefs.indexOf(ref);
        if (idx >= 0) {
            _pickedRefs.splice(idx, 1);
            cell.classList.remove('fml-picked');
        } else {
            _pickedRefs.push(ref);
            cell.classList.add('fml-picked');
        }
        updatePickerUI();
    }

    function updatePickerUI() {
        const chip = document.getElementById('fmlPickedChips');
        const applyBar = document.getElementById('fmlPickerApplyBar');
        if (!chip) return;

        chip.innerHTML = '';
        _pickedRefs.forEach(ref => {
            const c = document.createElement('span');
            c.className = 'fml-chip';
            c.textContent = ref;
            c.addEventListener('mousedown', e => e.preventDefault());
            c.addEventListener('click', () => {
                // Un-pick by clicking chip
                _pickedRefs = _pickedRefs.filter(r => r !== ref);
                const cell = getCellByRef(_activeTable, ref);
                if (cell) cell.classList.remove('fml-picked');
                updatePickerUI();
            });
            chip.appendChild(c);
        });

        const hasRef = _pickedRefs.length > 0;
        if (applyBar) applyBar.style.display = hasRef ? '' : 'none';
    }

    // ── Build Panel ───────────────────────────────────────────────────────

    // Quick-pick operations shown when cells are selected
    const QUICK_OPS = [
        { id: 'op-sum', label: 'Σ Som', build: refs => `SOM(${refs.join(',')})` },
        { id: 'op-avg', label: 'Gem.', build: refs => `GEMIDDELDE(${refs.join(',')})` },
        { id: 'op-min', label: 'MIN', build: refs => `MIN(${refs.join(',')})` },
        { id: 'op-max', label: 'MAX', build: refs => `MAX(${refs.join(',')})` },
        { id: 'op-mul', label: '× Verm.', build: refs => `PRODUCT(${refs.join(',')})` },
        { id: 'op-count', label: '# Aantal', build: refs => `AANTAL(${refs.join(',')})` },
        { id: 'op-concat', label: '⊕ Samenvoeg', build: refs => `SAMENVOEGEN(${refs.join(',')})` },
        { id: 'op-diff', label: '− Verschil', build: refs => refs.length >= 2 ? refs.join('-') : refs[0] },
        { id: 'op-div', label: '÷ Deel', build: refs => refs.length >= 2 ? refs.join('/') : refs[0] },
    ];

    const CATEGORIES = {
        'Aggregatie': [
            { label: 'SOM(bereik)', desc: 'Optellen', tmpl: 'SOM(A1:A5)' },
            { label: 'GEMIDDELDE(bereik)', desc: 'Gemiddelde', tmpl: 'GEMIDDELDE(A1:A5)' },
            { label: 'MIN(bereik)', desc: 'Kleinste waarde', tmpl: 'MIN(A1:A5)' },
            { label: 'MAX(bereik)', desc: 'Grootste waarde', tmpl: 'MAX(A1:A5)' },
            { label: 'AANTAL(bereik)', desc: 'Tel cellen', tmpl: 'AANTAL(A1:A5)' },
            { label: 'PRODUCT(bereik)', desc: 'Vermenigvuldigen', tmpl: 'PRODUCT(A1:A5)' },
            { label: 'STDEV(bereik)', desc: 'Standaardafwijking', tmpl: 'STDEV(A1:A5)' },
            { label: 'MEDIAN(bereik)', desc: 'Mediaanwaarde', tmpl: 'MEDIAN(A1:A5)' },
        ],
        'Wiskunde': [
            { label: 'ABS(cel)', desc: 'Absolute waarde', tmpl: 'ABS(A1)' },
            { label: 'SQRT(cel)', desc: 'Vierkantswortel', tmpl: 'SQRT(A1)' },
            { label: 'MACHT(cel,macht)', desc: 'Machtsverheffing', tmpl: 'MACHT(A1,2)' },
            { label: 'MOD(cel,deler)', desc: 'Rest na deling', tmpl: 'MOD(A1,2)' },
            { label: 'AFRONDEN(cel,dec)', desc: 'Afronden', tmpl: 'AFRONDEN(A1,2)' },
            { label: 'CEILING(cel)', desc: 'Naar boven afronden', tmpl: 'CEILING(A1)' },
            { label: 'FLOOR(cel)', desc: 'Naar beneden afronden', tmpl: 'FLOOR(A1)' },
            { label: 'LOG(cel,basis)', desc: 'Logaritme', tmpl: 'LOG(A1,10)' },
            { label: 'LN(cel)', desc: 'Nat. logaritme', tmpl: 'LN(A1)' },
            { label: 'EXP(cel)', desc: 'e tot de macht', tmpl: 'EXP(A1)' },
            { label: 'SIGN(cel)', desc: 'Teken (-1/0/1)', tmpl: 'SIGN(A1)' },
            { label: 'PI()', desc: 'Waarde van π', tmpl: 'PI()' },
        ],
        'Logisch': [
            { label: 'ALS(vw,dan,anders)', desc: 'Als-dan-anders', tmpl: 'ALS(A1>0,A1,0)' },
            { label: 'EN(vw1,vw2)', desc: 'Alles waar?', tmpl: 'EN(A1>0,B1>0)' },
            { label: 'OF(vw1,vw2)', desc: 'Minstens één waar?', tmpl: 'OF(A1>0,B1>0)' },
            { label: 'NIET(voorwaarde)', desc: 'Omgekeerde logica', tmpl: 'NIET(A1>0)' },
        ],
        'Tekst': [
            { label: 'SAMENVOEGEN(c1,c2)', desc: 'Tekst samenvoegen', tmpl: 'SAMENVOEGEN(A1,B1)' },
            { label: 'LENGTE(cel)', desc: 'Aantal tekens', tmpl: 'LENGTE(A1)' },
            { label: 'HOOFDLETTERS(cel)', desc: 'Naar hoofdletters', tmpl: 'HOOFDLETTERS(A1)' },
            { label: 'KLEINE_LETTERS(cel)', desc: 'Naar kleine letters', tmpl: 'KLEINE_LETTERS(A1)' },
            { label: 'TEKST(cel)', desc: 'Omzetten naar tekst', tmpl: 'TEKST(A1)' },
        ],
    };

    function buildPanel() {
        const toolbar = document.querySelector('.section-toolbar');
        if (!toolbar || document.getElementById('ctx-panel-' + TAB_ID)) return;

        const panel = document.createElement('div');
        panel.className = 'toolbar-content ctx-panel';
        panel.id = 'ctx-panel-' + TAB_ID;
        panel.dataset.content = TAB_ID;
        panel.style.display = 'none';

        panel.innerHTML = `
            <!-- ① Output cell indicator + formula bar -->
            <div class="toolbar-group animate-item ctx-group fml-group-bar">
                <label class="toolbar-label">Uitvoercel</label>
                <div class="toolbar-buttons fml-bar-row">
                    <span class="fml-cell-ref" id="fmlCellRef" title="Geselecteerde uitvoercel">—</span>
                    <span class="fml-equals">=</span>
                    <input type="text" id="fmlInput" class="ctx-text-input fml-input"
                           placeholder="bijv. SOM(A1:C1)" spellcheck="false" autocomplete="off">
                    <button class="btn-toolbar ctx-btn fml-apply-btn" id="fmlApplyBtn" title="Toepassen (Enter)">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    </button>
                    <button class="btn-toolbar ctx-btn ctx-btn-warn fml-clear-btn" id="fmlClearBtn" title="Formule wissen">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                    <button class="btn-toolbar ctx-btn fml-copy-btn" id="fmlCopyBtn" title="Kopieer formule (plak in volgende cel)">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    </button>
                </div>
            </div>

            <div class="toolbar-separator animate-item"></div>

            <!-- ② Output format -->
            <div class="toolbar-group animate-item ctx-group">
                <label class="toolbar-label">Opmaak</label>
                <div class="toolbar-buttons">
                    <div class="fml-fmt-group">
                        <button class="btn-toolbar ctx-btn fml-fmt-btn ctx-btn-active" data-fmt="num">123</button>
                        <button class="btn-toolbar ctx-btn fml-fmt-btn" data-fmt="pct">%</button>
                        <button class="btn-toolbar ctx-btn fml-fmt-btn" data-fmt="eur">€</button>
                    </div>
                    <div class="ctx-size-group fml-dec-group">
                        <span class="ctx-size-label">Decimalen</span>
                        <input type="number" id="fmlDecimals" class="ctx-size-input" min="0" max="10" value="2" step="1">
                    </div>
                </div>
            </div>

            <div class="toolbar-separator animate-item"></div>

            <!-- ③ Cell picker -->
            <div class="toolbar-group animate-item ctx-group fml-picker-group">
                <label class="toolbar-label">Cel-kiezer</label>
                <div class="toolbar-buttons" style="flex-direction:column;align-items:flex-start;gap:6px;">
                    <div style="display:flex;gap:5px;align-items:center;">
                        <button class="btn-toolbar ctx-btn fml-pick-toggle" id="fmlPickToggle">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="M13 13l6 6"/></svg>
                            <span id="fmlPickToggleLabel">Cellen selecteren</span>
                        </button>
                        <span class="fml-pick-hint" id="fmlPickHint" style="display:none">Klik cellen in de tabel aan</span>
                    </div>
                    <div class="fml-chips-row" id="fmlPickedChips"></div>
                    <div class="fml-ops-bar" id="fmlPickerApplyBar" style="display:none">
                        ${QUICK_OPS.map(op => `<button class="btn-toolbar ctx-btn fml-op-btn" data-op="${op.id}" title="${op.label}">${op.label}</button>`).join('')}
                    </div>
                </div>
            </div>

            <div class="toolbar-separator animate-item"></div>

            <!-- ④ Quick auto-sum -->
            <div class="toolbar-group animate-item ctx-group">
                <label class="toolbar-label">Snel invoegen</label>
                <div class="toolbar-buttons">
                    <button class="btn-toolbar ctx-btn" id="fmlQuickSumRow" title="Som van cellen links in deze rij">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        <span>Σ Rij</span>
                    </button>
                    <button class="btn-toolbar ctx-btn" id="fmlQuickSumCol" title="Som van cellen boven in deze kolom">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        <span>Σ Kolom</span>
                    </button>
                    <button class="btn-toolbar ctx-btn" id="fmlQuickAvgRow"><span style="font-weight:700;font-size:11px">x̄ Rij</span></button>
                    <button class="btn-toolbar ctx-btn" id="fmlQuickAvgCol"><span style="font-weight:700;font-size:11px">x̄ Kol</span></button>
                </div>
            </div>

        `;

        toolbar.appendChild(panel);
        bindPanelEvents(panel);
    }


    // ── Panel Events ──────────────────────────────────────────────────────

    function bindPanelEvents(panel) {
        // Block mousedown from stealing focus everywhere except text/number inputs
        panel.addEventListener('mousedown', e => {
            if (!e.target.matches('input[type="text"],input[type="number"]')) e.preventDefault();
        });

        const input = panel.querySelector('#fmlInput');
        const applyBtn = panel.querySelector('#fmlApplyBtn');
        const clearBtn = panel.querySelector('#fmlClearBtn');
        const decInput = panel.querySelector('#fmlDecimals');

        // Format buttons
        panel.querySelectorAll('.fml-fmt-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                panel.querySelectorAll('.fml-fmt-btn').forEach(b => b.classList.remove('ctx-btn-active'));
                btn.classList.add('ctx-btn-active');
                _fmt = btn.dataset.fmt;
            });
        });

        decInput.addEventListener('focus', () => window.ElementProtection?.cancelHide());
        decInput.addEventListener('change', () => { _decimals = parseInt(decInput.value) || 0; });

        // Apply
        const doApply = () => {
            if (!_activeTable || !_activeCell) return;
            const formula = input.value.trim();
            if (!formula) return;
            applyFormulaToCell(_activeTable, _activeCell, formula, _fmt, _decimals);
            syncBar(_activeCell);
            _activeCell.focus();
        };

        applyBtn.addEventListener('click', doApply);
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); doApply(); }
            e.stopPropagation();
        });
        input.addEventListener('keyup', e => e.stopPropagation());
        input.addEventListener('keypress', e => e.stopPropagation());

        // Clear
        clearBtn.addEventListener('click', () => {
            if (!_activeCell) return;
            ['formula', 'formulaResult', 'formulaFmt', 'formulaDecimals'].forEach(k => delete _activeCell.dataset[k]);
            _activeCell.textContent = '';
            input.value = '';
            syncBar(_activeCell);
            _activeCell.focus();
            window.saveToLocalStorage?.();
        });

        // Copy formula
        const copyBtn = panel.querySelector('#fmlCopyBtn');
        copyBtn.addEventListener('click', () => {
            if (!_activeCell || !_activeCell.dataset.formula) return;
            _copyBuffer = {
                formula: _activeCell.dataset.formula,
                fmt: _activeCell.dataset.formulaFmt || 'num',
                decimals: _activeCell.dataset.formulaDecimals || '2',
                fromRef: getCellRef(_activeTable, _activeCell),
            };
            // Visual feedback
            copyBtn.classList.add('ctx-btn-active');
            const label = document.createElement('span');
            label.className = 'fml-copy-toast';
            label.textContent = 'Gekopieerd! Klik een cel om te plakken';
            const bar = panel.querySelector('.fml-bar-row');
            bar.appendChild(label);
            setTimeout(() => { label.remove(); copyBtn.classList.remove('ctx-btn-active'); }, 2500);
        });

        // Cell picker toggle
        const pickToggle = panel.querySelector('#fmlPickToggle');
        const pickLabel = panel.querySelector('#fmlPickToggleLabel');
        const pickHint = panel.querySelector('#fmlPickHint');

        pickToggle.addEventListener('click', () => {
            if (_pickerMode) {
                stopPicker();
                pickToggle.classList.remove('ctx-btn-active');
                pickLabel.textContent = 'Cellen selecteren';
                pickHint.style.display = 'none';
            } else {
                startPicker();
                pickToggle.classList.add('ctx-btn-active');
                pickLabel.textContent = 'Stop selecteren';
                pickHint.style.display = '';
            }
        });

        // Quick-op buttons (shown after cells are picked)
        panel.querySelector('#fmlPickerApplyBar').addEventListener('click', e => {
            const btn = e.target.closest('.fml-op-btn');
            if (!btn || !_pickedRefs.length) return;
            const op = QUICK_OPS.find(o => o.id === btn.dataset.op);
            if (!op) return;
            const formula = op.build(_pickedRefs);
            input.value = formula;
            if (_activeTable && _activeCell) {
                applyFormulaToCell(_activeTable, _activeCell, formula, _fmt, _decimals);
                syncBar(_activeCell);
            }
            stopPicker();
            pickToggle.classList.remove('ctx-btn-active');
            pickLabel.textContent = 'Cellen selecteren';
            pickHint.style.display = 'none';
            if (_activeCell) _activeCell.focus();
        });

        // Quick auto-insert
        panel.querySelector('#fmlQuickSumRow').addEventListener('click', () => quickAutoInsert('SOM', 'row'));
        panel.querySelector('#fmlQuickSumCol').addEventListener('click', () => quickAutoInsert('SOM', 'col'));
        panel.querySelector('#fmlQuickAvgRow').addEventListener('click', () => quickAutoInsert('GEMIDDELDE', 'row'));
        panel.querySelector('#fmlQuickAvgCol').addEventListener('click', () => quickAutoInsert('GEMIDDELDE', 'col'));
    }

    // ── Quick auto-insert ─────────────────────────────────────────────────

    function quickAutoInsert(fnName, direction) {
        if (!_activeTable || !_activeCell) return;
        const rows = Array.from(_activeTable.querySelectorAll('tr'));
        let ri = -1, ci = -1;
        rows.forEach((tr, r) => Array.from(tr.querySelectorAll('th,td')).forEach((c, col) => {
            if (c === _activeCell) { ri = r; ci = col; }
        }));
        if (ri < 0) return;

        let range = '';
        if (direction === 'row' && ci > 0)
            range = colLetter(0) + (ri + 1) + ':' + colLetter(ci - 1) + (ri + 1);
        else if (direction === 'col' && ri > 0)
            range = colLetter(ci) + '1' + ':' + colLetter(ci) + ri;
        else return;

        const formula = fnName + '(' + range + ')';
        document.getElementById('fmlInput').value = formula;
        applyFormulaToCell(_activeTable, _activeCell, formula, _fmt, _decimals);
        syncBar(_activeCell);
        _activeCell.focus();
    }

    // ── Formula bar sync ──────────────────────────────────────────────────

    function syncBar(cell) {
        const refEl = document.getElementById('fmlCellRef');
        const input = document.getElementById('fmlInput');
        if (!refEl || !input) return;

        if (!cell || !_activeTable) { refEl.textContent = '—'; input.value = ''; return; }

        const ref = getCellRef(_activeTable, cell);
        refEl.textContent = ref || '—';

        if (cell.dataset.formula) {
            input.value = cell.dataset.formula;
            const fmt = cell.dataset.formulaFmt || 'num';
            _fmt = fmt;
            document.querySelectorAll('.fml-fmt-btn').forEach(b =>
                b.classList.toggle('ctx-btn-active', b.dataset.fmt === fmt));
            const dec = cell.dataset.formulaDecimals || '2';
            _decimals = parseInt(dec);
            const decInput = document.getElementById('fmlDecimals');
            if (decInput) decInput.value = dec;
        } else {
            input.value = '';
        }
    }

    // ── Cell focus hook (called by table-controls) ────────────────────────

    function onCellFocused(cell, tbl) {
        // If picker mode is on and user clicked a different cell than the output cell, toggle pick
        if (_pickerMode && cell !== _activeCell) {
            togglePickedCell(cell);
            if (_activeCell) requestAnimationFrame(() => _activeCell.focus());
            return;
        }

        // If a formula copy is pending, paste it into this new cell with adjusted refs
        if (_copyBuffer && cell !== _activeCell) {
            const toRef = getCellRef(tbl, cell);
            const fromP = parseRef(_copyBuffer.fromRef);
            const toP = parseRef(toRef);
            if (fromP && toP) {
                const dRow = toP.row - fromP.row;
                const dCol = toP.col - fromP.col;
                const shifted = shiftFormula(_copyBuffer.formula, dRow, dCol);
                applyFormulaToCell(tbl, cell, shifted, _copyBuffer.fmt, _copyBuffer.decimals);
                // Update formula bar to show new formula
                const input = document.getElementById('fmlInput');
                if (input) input.value = shifted;
            }
            _copyBuffer = null;
            // Clean up any remaining toast
            document.querySelectorAll('.fml-copy-toast').forEach(el => el.remove());
            document.querySelectorAll('#fmlCopyBtn').forEach(b => b.classList.remove('ctx-btn-active'));
        }

        _activeCell = cell;
        _activeTable = tbl;
        tbl.querySelectorAll('.fml-output-cell').forEach(c => c.classList.remove('fml-output-cell'));
        cell.classList.add('fml-output-cell');

        syncBar(cell);
    }

    function onTableCleared() {
        stopPicker();
        _activeCell = null;
        _activeTable = null;
        syncBar(null);
        // Reset pick toggle UI
        const lbl = document.getElementById('fmlPickToggleLabel');
        const hint = document.getElementById('fmlPickHint');
        const tog = document.getElementById('fmlPickToggle');
        if (lbl) lbl.textContent = 'Cellen selecteren';
        if (hint) hint.style.display = 'none';
        if (tog) tog.classList.remove('ctx-btn-active');
    }

    // ── Ratio table: grey-out row buttons ────────────────────────────────

    function _updateRatioRowButtons(tbl) {
        const isRatio = tbl?.classList.contains('summie-ratio-table');
        const addRowAbove = document.getElementById('tblAddRowAbove');
        const addRowBelow = document.getElementById('tblAddRowBelow');
        const delRow = document.getElementById('tblDelRow');
        [addRowAbove, addRowBelow, delRow].forEach(btn => {
            if (!btn) return;
            btn.disabled = !!isRatio;
            btn.style.opacity = isRatio ? '0.35' : '';
            btn.title = isRatio
                ? 'Rijen aanpassen niet mogelijk in een verhoudingstabel'
                : btn.dataset.origTitle || btn.title;
            if (!btn.dataset.origTitle && !isRatio) btn.dataset.origTitle = btn.title;
        });
    }

    // ── Init ──────────────────────────────────────────────────────────────

    function init() {
        window.ElementProtection?.registerTab(TAB_ID, TAB_LABEL);
        buildPanel();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else setTimeout(init, 150);

    window.TableFormulas = {
        onCellFocused,
        onTableCleared,
        recalcTable,
        watchTable,
        stampCellRefs,
        getActiveCell: () => _activeCell,
        isPickerActive: () => _pickerMode,
    };

})();