// ==================== TABLES ====================

window.TableManager = {
    _savedRange: null,

    init() {
        this._setupTableButton();
        this._setupRatioTableButton();
    },

    _setupTableButton() {
        const btn = document.getElementById('insertTableBtn');
        if (!btn) return;

        const picker = document.getElementById('tableDimensionPicker');
        if (!picker) return;

        // Save the editor selection BEFORE the button steals focus
        btn.addEventListener('mousedown', (e) => {
            e.preventDefault(); // prevent focus change
            this._saveRange();
        });

        // Build dimension grid
        const grid = picker.querySelector('.table-dim-grid');
        const label = picker.querySelector('.table-dim-label');
        const MAX = 8;

        for (let r = 1; r <= MAX; r++) {
            for (let c = 1; c <= MAX; c++) {
                const cell = document.createElement('div');
                cell.className = 'table-dim-cell';
                cell.dataset.row = r;
                cell.dataset.col = c;
                cell.addEventListener('mouseover', () => {
                    label.textContent = `${r} × ${c}`;
                    grid.querySelectorAll('.table-dim-cell').forEach(el => {
                        el.classList.toggle('active',
                            parseInt(el.dataset.row) <= r && parseInt(el.dataset.col) <= c);
                    });
                });
                // Prevent focus loss when hovering/clicking grid cells
                cell.addEventListener('mousedown', (e) => e.preventDefault());
                cell.addEventListener('click', () => {
                    this.insertTable(r, c);
                    picker.classList.remove('active');
                    btn.classList.remove('active');
                });
                grid.appendChild(cell);
            }
        }

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            picker.classList.toggle('active');
            btn.classList.toggle('active');
        });

        // Prevent entire picker from stealing focus
        picker.addEventListener('mousedown', (e) => e.preventDefault());

        document.addEventListener('click', (e) => {
            if (!e.target.closest('#insertTableBtn') && !e.target.closest('#tableDimensionPicker')) {
                picker.classList.remove('active');
                btn.classList.remove('active');
            }
        });
    },

    _saveRange() {
        const sel = window.getSelection();
        const editor = window.AppState.editor;
        if (sel && sel.rangeCount > 0 && editor && editor.contains(sel.anchorNode)) {
            this._savedRange = sel.getRangeAt(0).cloneRange();
            return;
        }
        // Fallback: use topbarManager's saved range
        if (window.topbarManager && window.topbarManager.savedRange) {
            this._savedRange = window.topbarManager.savedRange.cloneRange();
        }
    },

    insertTable(rows, cols) {
        const editor = window.AppState.editor;
        if (!editor) return;

        // Build table element
        const table = document.createElement('table');
        table.className = 'summie-table';
        table.dataset.tabelStijl = 'top'; // default: top row is header
        const tbody = document.createElement('tbody');
        for (let r = 0; r < rows; r++) {
            const tr = document.createElement('tr');
            for (let c = 0; c < cols; c++) {
                const cell = document.createElement(r === 0 ? 'th' : 'td');
                cell.contentEditable = 'true';
                cell.innerHTML = '<br>';
                tr.appendChild(cell);
            }
            tbody.appendChild(tr);
        }
        table.appendChild(tbody);

        // Paragraph after table so cursor can go below
        const after = document.createElement('p');
        after.innerHTML = '<br>';

        // --- Insert at saved cursor position ---
        let inserted = false;
        const range = this._savedRange;

        if (range) {
            let node = range.startContainer;
            if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;

            // Walk up to find direct child of editor
            while (node && node.parentElement && node.parentElement !== editor) {
                node = node.parentElement;
            }

            if (node && node !== editor && editor.contains(node)) {
                node.after(after);
                node.after(table);
                inserted = true;
            }
        }

        if (!inserted) {
            editor.appendChild(table);
            editor.appendChild(after);
        }

        this._savedRange = null;

        // Move cursor into first cell
        const firstCell = table.querySelector('th, td');
        if (firstCell) {
            firstCell.focus();
            const newRange = document.createRange();
            newRange.setStart(firstCell, 0);
            newRange.collapse(true);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(newRange);
        }

        window.saveToLocalStorage && window.saveToLocalStorage();
        window.updateUnsavedIndicator && window.updateUnsavedIndicator();
        window.updateInhoudList && window.updateInhoudList();
        window.showNotification && window.showNotification('Tabel ingevoegd', `${rows}×${cols} tabel toegevoegd.`, 'success');

        // Register table with ReferencesManager so it gets a select button
        if (window.ReferencesManager) {
            window.ReferencesManager._addSelectButtonToElement(table);
        }

        return table;
    },

    _setupRatioTableButton() {
        const btn = document.getElementById('insertRatioTableBtn');
        if (!btn) return;
        btn.addEventListener('mousedown', (e) => { e.preventDefault(); this._saveRange(); });
        btn.addEventListener('click', () => { this.insertRatioTable(); });
    },

    insertRatioTable() {
        const editor = window.AppState?.editor;
        if (!editor) return;

        // Wrapper so we can overlay the SVG arrows
        const wrapper = document.createElement('div');
        wrapper.className = 'ratio-table-wrapper';

        // Table: 2 data rows x 4 cols (1 label + 3 value cols)
        const COLS = 4;
        const table = document.createElement('table');
        table.className = 'summie-table summie-ratio-table';
        const tbody = document.createElement('tbody');

        ['Rode tulpen', 'Gele tulpen'].forEach((label, ri) => {
            const tr = document.createElement('tr');
            for (let c = 0; c < COLS; c++) {
                const td = document.createElement(c === 0 ? 'th' : 'td');
                td.contentEditable = 'true';
                if (c === 0) {
                    td.classList.add('ratio-name-col');
                    td.textContent = label;
                } else {
                    td.textContent = '';
                    td.dataset.ratioCell = '1';
                }
                tr.appendChild(td);
            }
            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        wrapper.appendChild(table);

        // SVG arrow container — rendered after values are known
        const arrowSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        arrowSvg.classList.add('ratio-arrows-svg');
        arrowSvg.setAttribute('aria-hidden', 'true');
        wrapper.appendChild(arrowSvg);

        const after = document.createElement('p');
        after.innerHTML = '<br>';

        let inserted = false;
        const range = this._savedRange;
        if (range) {
            let node = range.startContainer;
            if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
            while (node && node.parentElement && node.parentElement !== editor) node = node.parentElement;
            if (node && node !== editor && editor.contains(node)) {
                node.after(after);
                node.after(wrapper);
                inserted = true;
            }
        }
        if (!inserted) { editor.appendChild(wrapper); editor.appendChild(after); }
        this._savedRange = null;

        setTimeout(() => {
            this._watchRatioTable(wrapper, table, arrowSvg);
            window.TableFormulas?.watchTable(table);
            window.TableFormulas?.stampCellRefs?.(table);
        }, 60);

        // Focus B1 (first real data cell)
        const firstData = tbody.rows[0]?.cells[1];
        if (firstData) { firstData.focus(); }

        window.saveToLocalStorage?.();
        window.updateUnsavedIndicator?.();
        window.showNotification?.('Verhoudingstabel', 'Vul de waarden in — pijlen worden automatisch getekend.', 'success');
        if (window.ReferencesManager) window.ReferencesManager._addSelectButtonToElement(table);
        return wrapper;
    },

    _watchRatioTable(wrapper, table, svg) {
        if (table._ratioWatching) return;
        table._ratioWatching = true;
        this._recalcRatioTable(wrapper, table, svg);

        // Watch all input on the table — catches typing, paste, programmatic changes
        const obs = new MutationObserver(() => {
            clearTimeout(table._ratioTimer);
            table._ratioTimer = setTimeout(() => this._recalcRatioTable(wrapper, table, svg), 350);
        });
        obs.observe(table, { subtree: true, characterData: true, childList: true });
        table._ratioObserver = obs;

        // Also listen to input events (covers IME and contenteditable edge cases)
        table.addEventListener('input', () => {
            clearTimeout(table._ratioTimer);
            table._ratioTimer = setTimeout(() => this._recalcRatioTable(wrapper, table, svg), 350);
        });

        // Re-draw arrows when layout changes (resize, scroll)
        const ro = new ResizeObserver(() => {
            clearTimeout(table._ratioArrowTimer);
            table._ratioArrowTimer = setTimeout(() => this._drawArrows(wrapper, table, svg), 100);
        });
        ro.observe(wrapper);
        table._ratioResizeObserver = ro;
    },

    _parseNum(cell) {
        const raw = (cell.dataset.formulaResult ?? cell.textContent).trim().replace(',', '.');
        const n = parseFloat(raw);
        return isNaN(n) ? null : n;
    },

    _recalcRatioTable(wrapper, table, svg) {
        const rows = Array.from(table.querySelectorAll('tr'));
        if (rows.length < 2) return;

        // Grid of data cells: grid[r][c], excluding the label column
        const grid = rows.map(tr =>
            Array.from(tr.querySelectorAll('th,td')).filter(c => c.dataset.ratioCell)
        );
        const R = grid.length;
        const C = grid[0]?.length ?? 0;
        if (C < 1) return;

        // Read current values — null means empty/unknown
        // A cell is "user typed" if ratioAutoFilled is not 'true'
        const isUserVal = c => c.dataset.ratioAutoFilled !== 'true' && this._parseNum(c) !== null;
        const isEmpty = c => this._parseNum(c) === null;

        // vals[r][c] — always re-read from DOM
        const readGrid = () => grid.map(row => row.map(c => this._parseNum(c)));

        // ── Core rule of verhoudingstabellen ─────────────────────────────
        // The table is a proportional grid: val[r][c] = rowScale[r] * colScale[c]
        // This means: val[r1][c1] / val[r2][c1] == val[r1][c2] / val[r2][c2]  (same row ratio every col)
        //         and: val[r1][c1] / val[r1][c2] == val[r2][c1] / val[r2][c2]  (same col ratio every row)
        //
        // Given ANY two known values we can fill a third if the fourth forms a rectangle:
        //   val[r][c] = val[r][cKnown] * val[rKnown][c] / val[rKnown][cKnown]
        //
        // We iterate to propagate: each pass may unlock new cells that unlock others.

        const MAX_PASSES = 20;
        let changed = true;
        let pass = 0;

        while (changed && pass++ < MAX_PASSES) {
            changed = false;
            const vals = readGrid();

            for (let r = 0; r < R; r++) {
                for (let c = 0; c < C; c++) {
                    if (vals[r][c] !== null) continue; // already known
                    const cell = grid[r][c];
                    if (!isEmpty(cell)) continue;      // has manual value

                    // Try to compute from any pair of known values that share row or column
                    let computed = null;

                    // Method 1: same row, different col — need the row-ratio from another row
                    // val[r][c] = val[r][c2] * (val[r2][c] / val[r2][c2])  for any known r2,c2
                    outer:
                    for (let c2 = 0; c2 < C && computed === null; c2++) {
                        if (c2 === c || vals[r][c2] === null) continue;
                        for (let r2 = 0; r2 < R; r2++) {
                            if (r2 === r || vals[r2][c] === null || vals[r2][c2] === null) continue;
                            // Cross-product: val[r][c] = val[r][c2] * val[r2][c] / val[r2][c2]
                            computed = vals[r][c2] * vals[r2][c] / vals[r2][c2];
                            break outer;
                        }
                    }

                    if (computed !== null && isFinite(computed)) {
                        cell.textContent = this._niceNum(computed);
                        cell.dataset.ratioAutoFilled = 'true';
                        changed = true;
                    }
                }
            }
        }

        this._drawArrows(wrapper, table, svg);
    },

    _niceNum(n) {
        const rounded = parseFloat(n.toFixed(4));
        if (Number.isInteger(rounded)) return String(rounded);
        // Format with comma as decimal separator (Dutch)
        return rounded.toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
    },

    _ratioLabel(from, to) {
        if (from === null || to === null || from === 0) return null;
        const ratio = to / from;
        const inv = from / to;
        const clean = (n) => Math.abs(n - Math.round(n)) < 0.0001 && Math.round(n) >= 2;
        if (Math.abs(ratio - 1) < 0.0001) return null; // equal, skip
        if (clean(ratio)) return '\u00d7' + Math.round(ratio);
        if (clean(inv)) return '\u00f7' + Math.round(inv);
        return '\u00d7' + ratio.toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
    },

    _drawArrows(wrapper, table, svg) {
        const PAD_TOP = 30;
        const PAD_BOTTOM = 30;
        const ARROW_COLOR = '#e53935';
        const FONT_SIZE = 11;

        // Wrapper padding (set in CSS) provides space for arrows — no margin needed on table
        table.style.marginTop = '';
        table.style.marginBottom = '';

        svg.innerHTML = '';

        const rows = Array.from(table.querySelectorAll('tr'));
        if (rows.length < 1) return;

        // Use offsetTop/offsetLeft relative to wrapper — layout-stable, no viewport dependency
        const svgW = wrapper.offsetWidth;
        const svgH = wrapper.offsetHeight;
        if (svgW === 0 || svgH === 0) return;

        svg.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`);
        svg.setAttribute('width', svgW);
        svg.setAttribute('height', svgH);
        svg.style.width = svgW + 'px';
        svg.style.height = svgH + 'px';

        // Helper: get centre of a cell relative to wrapper
        const cellCentre = (cell) => {
            let el = cell, x = 0, y = 0;
            while (el && el !== wrapper) { x += el.offsetLeft; y += el.offsetTop; el = el.offsetParent; }
            return { x: x + cell.offsetWidth / 2, y: y + cell.offsetHeight / 2 };
        };

        rows.forEach((tr, ri) => {
            const cells = Array.from(tr.querySelectorAll('th,td')).filter(c => c.dataset.ratioCell);
            if (cells.length < 2) return;

            const above = ri === 0;

            for (let i = 0; i < cells.length - 1; i++) {
                const fromCell = cells[i];
                const toCell = cells[i + 1];
                const fromVal = this._parseNum(fromCell);
                const toVal = this._parseNum(toCell);
                const label = this._ratioLabel(fromVal, toVal);
                if (!label) continue;

                const c1 = cellCentre(fromCell);
                const c2 = cellCentre(toCell);
                const mx = (c1.x + c2.x) / 2;

                let y1, y2, cy, labelY;
                if (above) {
                    // Find the top edge of this row relative to wrapper
                    let el = tr, rowTop = 0;
                    while (el && el !== wrapper) { rowTop += el.offsetTop; el = el.offsetParent; }
                    y1 = rowTop;
                    y2 = y1;
                    cy = y1 - 16;
                    labelY = cy - 3;
                } else {
                    let el = tr, rowTop = 0;
                    while (el && el !== wrapper) { rowTop += el.offsetTop; el = el.offsetParent; }
                    y1 = rowTop + tr.offsetHeight;
                    y2 = y1;
                    cy = y1 + 16;
                    labelY = cy + FONT_SIZE + 2;
                }

                // Arrow path
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('d', `M ${c1.x} ${y1} Q ${mx} ${cy} ${c2.x} ${y2}`);
                path.setAttribute('fill', 'none');
                path.setAttribute('stroke', ARROW_COLOR);
                path.setAttribute('stroke-width', '1.5');
                path.setAttribute('marker-end', 'url(#ratio-arrow)');
                svg.appendChild(path);

                // Label
                const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                text.setAttribute('x', mx);
                text.setAttribute('y', labelY);
                text.setAttribute('text-anchor', 'middle');
                text.setAttribute('fill', ARROW_COLOR);
                text.setAttribute('font-size', FONT_SIZE);
                text.setAttribute('font-weight', '700');
                text.setAttribute('font-family', 'inherit');
                text.textContent = label;
                svg.appendChild(text);
            }
        });

        // Arrowhead marker (unique id to avoid conflicts with other SVGs)
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        marker.setAttribute('id', 'ratio-arrow');
        marker.setAttribute('markerWidth', '7');
        marker.setAttribute('markerHeight', '5');
        marker.setAttribute('refX', '6');
        marker.setAttribute('refY', '2.5');
        marker.setAttribute('orient', 'auto');
        const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        poly.setAttribute('points', '0 0, 7 2.5, 0 5');
        poly.setAttribute('fill', ARROW_COLOR);
        marker.appendChild(poly);
        defs.appendChild(marker);
        svg.insertBefore(defs, svg.firstChild);
    }
};