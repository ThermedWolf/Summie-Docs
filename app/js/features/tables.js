// ==================== TABLES ====================

window.TableManager = {
    _savedRange: null,

    init() {
        this._setupTableButton();
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
    }
};