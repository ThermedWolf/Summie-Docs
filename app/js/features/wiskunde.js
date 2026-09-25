// ==================== WISKUNDE ====================
// Breuk invoegen + Grafiek invoegen (lijn, data, staaf, taart)
// Leeft als een sidebar die opent via de 'Wiskunde' topbar tab.

(function () {

    // ── State ─────────────────────────────────────────────────────────────
    let _savedRange = null; // cursor position before sidebar opened

    // ── Helpers ───────────────────────────────────────────────────────────

    function saveRange() {
        const sel = window.getSelection();
        const editor = document.getElementById('editor');
        if (sel && sel.rangeCount > 0 && editor && editor.contains(sel.anchorNode)) {
            _savedRange = sel.getRangeAt(0).cloneRange();
            return;
        }
        // Fallback: use the topbar's saved range (set on any toolbar mousedown)
        if (window.topbarManager && window.topbarManager.savedRange) {
            try { _savedRange = window.topbarManager.savedRange.cloneRange(); } catch {}
        }
    }

    function restoreRange() {
        if (!_savedRange) return false;
        const sel = window.getSelection();
        try {
            sel.removeAllRanges();
            sel.addRange(_savedRange);
            return true;
        } catch { return false; }
    }

    function insertAtCursor(node) {
        const editor = document.getElementById('editor');
        if (!editor) return;

        const restored = restoreRange();
        // If we still have no usable range, ask the topbar manager for its saved one
        if (!restored && window.topbarManager && window.topbarManager.savedRange) {
            try {
                const selTmp = window.getSelection();
                selTmp.removeAllRanges();
                selTmp.addRange(window.topbarManager.savedRange.cloneRange());
            } catch {}
        }

        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) {
            editor.appendChild(node);
            window.saveToLocalStorage?.();
            window.updateUnsavedIndicator?.();
            editor.dispatchEvent(new Event('input', { bubbles: true }));
            return;
        }

        const range = sel.getRangeAt(0);
        // If the range is inside the editor, do an inline insert at the exact caret
        if (editor.contains(range.startContainer) || editor.contains(range.endContainer) || range.startContainer === editor) {
            range.deleteContents();
            range.insertNode(node);
            try {
                range.setStartAfter(node);
                range.setEndAfter(node);
                sel.removeAllRanges();
                sel.addRange(range);
            } catch {}
            window.saveToLocalStorage?.();
            window.updateUnsavedIndicator?.();
            editor.dispatchEvent(new Event('input', { bubbles: true }));
            return;
        }

        // Otherwise treat it as a block insertion after the closest block element
        let refNode = null;
        let n = range.startContainer;
        if (n.nodeType === 3) n = n.parentElement;
        const blockTags = ['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'];
        while (n && n !== editor && !blockTags.includes(n.tagName)) n = n.parentElement;
        if (n && n !== editor && editor.contains(n)) refNode = n;

        const after = document.createElement('p');
        after.innerHTML = '<br>';
        if (refNode) { refNode.after(node); node.after(after); }
        else { editor.appendChild(node); editor.appendChild(after); }

        window.saveToLocalStorage?.();
        window.updateUnsavedIndicator?.();
        editor.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function insertBlockAtCursor(block) {
        const editor = document.getElementById('editor');
        if (!editor) return;

        const restored = restoreRange();
        if (!restored && window.topbarManager && window.topbarManager.savedRange) {
            try {
                const selTmp = window.getSelection();
                selTmp.removeAllRanges();
                selTmp.addRange(window.topbarManager.savedRange.cloneRange());
            } catch {}
        }

        const sel = window.getSelection();
        let refNode = null;

        if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            // Only use the range if it is actually inside the editor
            if (editor.contains(range.startContainer) || range.startContainer === editor) {
                let node = range.startContainer;
                if (node.nodeType === 3) node = node.parentElement;
                // Walk up until we are a direct child of the editor
                while (node && node.parentElement && node.parentElement !== editor) {
                    node = node.parentElement;
                }
                if (node && node !== editor && editor.contains(node)) refNode = node;
            }
        }

        // Fallback: use the last block child if we still have no ref
        if (!refNode) {
            // Try topbarManager's saved range one more time as a direct node lookup
            if (window.topbarManager && window.topbarManager.savedRange) {
                try {
                    let node = window.topbarManager.savedRange.startContainer;
                    if (node.nodeType === 3) node = node.parentElement;
                    while (node && node.parentElement && node.parentElement !== editor) node = node.parentElement;
                    if (node && node !== editor && editor.contains(node)) refNode = node;
                } catch {}
            }
        }

        const after = document.createElement('p');
        after.innerHTML = '<br>';
        // Mark the trailing paragraph so keyboard navigation can find it reliably
        after.setAttribute('data-grafiek-spacer', '1');

        if (refNode) {
            refNode.after(block);
            block.after(after);
            // Place caret inside the spacer so the user can keep typing
            try {
                const newRange = document.createRange();
                newRange.setStart(after, 0);
                newRange.collapse(true);
                sel.removeAllRanges();
                sel.addRange(newRange);
                _savedRange = newRange.cloneRange();
                if (window.topbarManager) window.topbarManager.savedRange = newRange.cloneRange();
            } catch {}
        } else {
            // No reference block at all (empty document) — append to editor
            editor.appendChild(block);
            editor.appendChild(after);
            try {
                const newRange = document.createRange();
                newRange.setStart(after, 0);
                newRange.collapse(true);
                sel.removeAllRanges();
                sel.addRange(newRange);
                _savedRange = newRange.cloneRange();
                if (window.topbarManager) window.topbarManager.savedRange = newRange.cloneRange();
            } catch {}
        }

        // Ensure the new chart is visible
        try { block.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}

        window.saveToLocalStorage?.();
        window.updateUnsavedIndicator?.();
        editor.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // ── BREUKEN ───────────────────────────────────────────────────────────

    function buildBreuk(teller, noemer) {
        const span = document.createElement('span');
        span.className = 'summie-breuk';
        span.contentEditable = 'false';
        span.dataset.breuk = '1';
        span.dataset.teller = String(teller);
        span.dataset.noemer = String(noemer);
        span.title = `${teller}/${noemer} — klik om te bewerken`;

        span.innerHTML = `
            <span class="breuk-top">${escHtml(String(teller))}</span>
            <span class="breuk-bar"></span>
            <span class="breuk-bot">${escHtml(String(noemer))}</span>
        `;

        // Click to edit
        span.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openBreukModal(span);
        });

        return span;
    }

    function openBreukModal(existingBreuk = null) {
        const isEdit = !!existingBreuk;
        const initTeller = isEdit ? existingBreuk.dataset.teller : '1';
        const initNoemer = isEdit ? existingBreuk.dataset.noemer : '2';

        const overlay = document.createElement('div');
        overlay.className = 'wiskunde-modal-overlay';
        overlay.innerHTML = `
            <div class="wiskunde-modal" style="width:320px">
                <div class="wiskunde-modal-header">
                    <h3>${isEdit ? SummieI18n.t('Breuk bewerken') : SummieI18n.t('Breuk invoegen')}</h3>
                    <button class="wiskunde-modal-close">✕</button>
                </div>
                <div class="wiskunde-modal-body">
                    <div style="display:flex;align-items:center;gap:20px;justify-content:center;padding:10px 0">
                        <div class="breuk-input-group">
                            <span class="breuk-label">${escHtml(SummieI18n.t('Teller'))}</span>
                            <input id="wmTeller" type="text" value="${escHtml(initTeller)}" style="width:72px;text-align:center;font-size:18px;font-weight:700;padding:6px">
                            <div class="breuk-divider-line"></div>
                            <input id="wmNoemer" type="text" value="${escHtml(initNoemer)}" style="width:72px;text-align:center;font-size:18px;font-weight:700;padding:6px">
                            <span class="breuk-label">${escHtml(SummieI18n.t('Noemer'))}</span>
                        </div>
                        <div style="display:flex;flex-direction:column;align-items:center;gap:4px">
                            <span style="font-size:11px;color:var(--text-secondary);margin-bottom:4px">${escHtml(SummieI18n.t('Voorbeeld'))}</span>
                            <div class="breuk-preview" id="wmBreukPreview">
                                <span class="breuk-teller">${escHtml(initTeller)}</span>
                                <span class="breuk-lijn"></span>
                                <span class="breuk-noemer">${escHtml(initNoemer)}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="wiskunde-modal-footer">
                    <button class="btn" id="wmBreukCancel">${escHtml(SummieI18n.t('Annuleren'))}</button>
                    <button class="btn btn-primary" id="wmBreukInsert">${isEdit ? SummieI18n.t('Opslaan') : SummieI18n.t('Invoegen')}</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const tellerInput = overlay.querySelector('#wmTeller');
        const noemerInput = overlay.querySelector('#wmNoemer');
        const preview = overlay.querySelector('#wmBreukPreview');

        const updatePreview = () => {
            preview.querySelector('.breuk-teller').textContent = tellerInput.value || '?';
            preview.querySelector('.breuk-noemer').textContent = noemerInput.value || '?';
        };

        tellerInput.addEventListener('input', updatePreview);
        noemerInput.addEventListener('input', updatePreview);

        // Escape closes the modal too (listener removed on close to avoid leaks)
        const onModalKeydown = (e) => {
            if (e.key === 'Escape') { e.stopPropagation(); close(); }
        };
        document.addEventListener('keydown', onModalKeydown);

        const close = () => {
            document.removeEventListener('keydown', onModalKeydown);
            overlay.remove();
        };

        overlay.querySelector('.wiskunde-modal-close').addEventListener('click', close);
        overlay.querySelector('#wmBreukCancel').addEventListener('click', close);
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

        overlay.querySelector('#wmBreukInsert').addEventListener('click', () => {
            const t = tellerInput.value.trim() || '1';
            const n = noemerInput.value.trim() || '2';
            if (isEdit) {
                // Update existing breuk in place
                existingBreuk.dataset.teller = t;
                existingBreuk.dataset.noemer = n;
                existingBreuk.querySelector('.breuk-top').textContent = t;
                existingBreuk.querySelector('.breuk-bot').textContent = n;
                window.saveToLocalStorage?.();
            } else {
                const breuk = buildBreuk(t, n);
                insertAtCursor(breuk);
            }
            close();
        });

        tellerInput.focus();
        tellerInput.select();
    }

    // ── GRAFIEKEN ─────────────────────────────────────────────────────────

    // Chart.js is loaded from CDN in index.html. Wait for it.
    function getChart() {
        return window.Chart;
    }

    const GRAFIEK_TYPES = [
        { id: 'lijn', label: SummieI18n.t('Lijn (formule)'), icon: '📈' },
        { id: 'data', label: SummieI18n.t('Lijn (data)'), icon: '📊' },
        { id: 'staaf', label: SummieI18n.t('Staafdiagram'), icon: '▮▮▮' },
        { id: 'taart', label: SummieI18n.t('Taartdiagram'), icon: '◔' },
    ];

    // Expanded palette — 24 distinct, color-blind-friendly-ish hues for taartdiagram
    // Covers blue, red, green, amber, purple, pink, cyan, lime, orange, teal, etc.
    const CHART_COLORS = [
        '#3b82f6', '#ef4444', '#22c55e', '#f59e0b',
        '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
        '#f97316', '#14b8a6', '#eab308', '#6366f1',
        '#d946ef', '#0ea5e9', '#10b981', '#f43f5e',
        '#a855f7', '#e11d48', '#0d9488', '#ca8a04',
        '#7c3aed', '#be123c', '#0891b2', '#65a30d',
    ];

    // ── Pie percentage plugin (draws % inside each slice) ────────────────
    const piePercentagePlugin = {
        id: 'summiePiePercentages',
        afterDatasetsDraw(chart, _args, opts) {
            if (!opts || !opts.enabled) return;
            if (chart.config.type !== 'pie' && chart.config.type !== 'doughnut') return;
            const ctx = chart.ctx;
            const dataset = chart.data.datasets[0];
            if (!dataset || !dataset.data || dataset.data.length === 0) return;
            const meta = chart.getDatasetMeta(0);
            if (!meta || !meta.data) return;
            const total = dataset.data.reduce((sum, v) => sum + (Number(v) || 0), 0);
            if (!total) return;
            ctx.save();
            meta.data.forEach((element, i) => {
                const value = Number(dataset.data[i]) || 0;
                if (value <= 0) return;
                const pct = (value / total) * 100;
                // Hide label on extremely tiny slices where text would overflow
                if (pct < 2.2) return;
                const label = pct.toFixed(pct >= 10 ? 0 : 1).replace(/\.0$/, '') + '%';
                // getCenterPoint is the visual center of the slice (accounts for offset)
                let x, y;
                try { const p = element.getCenterPoint(); x = p.x; y = p.y; } catch { return; }
                // Also skip if slice is geometrically too narrow (approx via angle)
                if (element.circumference !== undefined && Math.abs(element.circumference) < 0.18) return;
                ctx.font = '700 12px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                // Halo for contrast on any slice color
                ctx.lineWidth = 4;
                ctx.strokeStyle = 'rgba(0,0,0,0.32)';
                ctx.lineJoin = 'round';
                ctx.miterLimit = 2;
                ctx.strokeText(label, x, y);
                ctx.fillStyle = '#ffffff';
                ctx.fillText(label, x, y);
            });
            ctx.restore();
        }
    };

    let _piePluginRegistered = false;
    function ensurePiePluginRegistered() {
        const Chart = getChart();
        if (!Chart || _piePluginRegistered) return;
        try {
            // Chart.js v4 uses Chart.register
            if (Chart.register) Chart.register(piePercentagePlugin);
            _piePluginRegistered = true;
        } catch (e) {
            console.warn('Failed to register pie percentage plugin', e);
        }
    }

    function getPieColors(count, rows) {
        // If rows have explicit colors, prefer those; otherwise cycle the extended palette
        const out = [];
        for (let i = 0; i < count; i++) {
            const custom = rows && rows[i] && rows[i].color;
            if (custom && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(custom)) {
                out.push(custom);
            } else {
                out.push(CHART_COLORS[i % CHART_COLORS.length]);
            }
        }
        return out;
    }

    function normalizeDataRows(rows) {
        if (!Array.isArray(rows)) return [];
        return rows.map((r, i) => ({
            label: r.label != null ? String(r.label) : '',
            value: r.value != null ? r.value : 0,
            color: r.color && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(r.color)
                ? r.color
                : CHART_COLORS[i % CHART_COLORS.length],
        }));
    }

    // Small, dependency-free recursive-descent parser/evaluator for the
    // limited formula grammar this feature supports (numbers, x, + - * / **,
    // parentheses, unary minus). Deliberately avoids new Function()/eval() so
    // the app can run under a strict CSP without 'unsafe-eval'.
    function _compileFormulaExpr(expr) {
        const tokens = [];
        let i = 0;
        while (i < expr.length) {
            const c = expr[i];
            if (/[0-9.]/.test(c)) {
                let j = i + 1;
                while (j < expr.length && /[0-9.]/.test(expr[j])) j++;
                const numStr = expr.slice(i, j);
                if (!/^\d*\.?\d+$/.test(numStr)) return null;
                tokens.push({ type: 'num', value: parseFloat(numStr) });
                i = j;
                continue;
            }
            if (c === 'x') { tokens.push({ type: 'var' }); i++; continue; }
            if (c === '+' || c === '-' || c === '/' || c === '(' || c === ')') {
                tokens.push({ type: c }); i++; continue;
            }
            if (c === '*') {
                if (expr[i + 1] === '*') { tokens.push({ type: '**' }); i += 2; }
                else { tokens.push({ type: '*' }); i++; }
                continue;
            }
            return null; // unsupported character — invalid formula
        }

        let pos = 0;
        const peek = () => tokens[pos];
        const next = () => tokens[pos++];

        function parseExpr() {
            let left = parseTerm();
            if (left === null) return null;
            while (peek() && (peek().type === '+' || peek().type === '-')) {
                const op = next().type;
                const right = parseTerm();
                if (right === null) return null;
                const l = left, r = right;
                left = op === '+' ? (x => l(x) + r(x)) : (x => l(x) - r(x));
            }
            return left;
        }

        function parseTerm() {
            let left = parsePower();
            if (left === null) return null;
            while (peek() && (peek().type === '*' || peek().type === '/')) {
                const op = next().type;
                const right = parsePower();
                if (right === null) return null;
                const l = left, r = right;
                left = op === '*' ? (x => l(x) * r(x)) : (x => l(x) / r(x));
            }
            return left;
        }

        function parsePower() {
            const base = parseUnary();
            if (base === null) return null;
            if (peek() && peek().type === '**') {
                next();
                const exp = parsePower(); // right-associative
                if (exp === null) return null;
                const b = base, e = exp;
                return x => Math.pow(b(x), e(x));
            }
            return base;
        }

        function parseUnary() {
            if (peek() && peek().type === '-') {
                next();
                const operand = parseUnary();
                if (operand === null) return null;
                const o = operand;
                return x => -o(x);
            }
            if (peek() && peek().type === '+') {
                next();
                return parseUnary();
            }
            return parsePrimary();
        }

        function parsePrimary() {
            const t = peek();
            if (!t) return null;
            if (t.type === 'num') { next(); const v = t.value; return () => v; }
            if (t.type === 'var') { next(); return x => x; }
            if (t.type === '(') {
                next();
                const inner = parseExpr();
                if (inner === null) return null;
                if (!peek() || peek().type !== ')') return null;
                next();
                return inner;
            }
            return null;
        }

        const result = parseExpr();
        if (result === null || pos !== tokens.length) return null;
        return result;
    }

    // Parse a formula like "y=2x+1" or "x=y-2" and return f(x) as a JS function
    function parseFormula(input) {
        let expr = input.trim()
            .replace(/\s+/g, '')
            .toLowerCase();

        // Accept forms: y=..., f(x)=..., just the expression
        expr = expr.replace(/^y\s*=\s*/, '').replace(/^f\(x\)\s*=\s*/, '');

        // Replace ^ with ** for exponentiation
        expr = expr.replace(/\^/g, '**');
        // Insert * for implicit multiplication: 2x → 2*x, x2 → x*2, 2(x) → 2*(x)
        expr = expr.replace(/(\d)(x)/g, '$1*$2');
        expr = expr.replace(/(x)(\d)/g, '$1*$2');
        expr = expr.replace(/(\d)\(/g, '$1*(');

        try {
            const fn = _compileFormulaExpr(expr);
            if (!fn) return null;
            // Quick test
            const test = fn(1);
            if (typeof test !== 'number' || !isFinite(test)) return null;
            return fn;
        } catch {
            return null;
        }
    }

    function buildFormulaDatasets(formula, xMin, xMax, steps) {
        const fn = parseFormula(formula);
        if (!fn) return null;
        const labels = [], data = [];
        const step = (xMax - xMin) / steps;
        for (let x = xMin; x <= xMax + 0.0001; x += step) {
            const y = fn(x);
            labels.push(parseFloat(x.toFixed(4)));
            data.push(isFinite(y) ? parseFloat(y.toFixed(6)) : null);
        }
        return { labels, datasets: [{ label: formula, data, borderColor: CHART_COLORS[0], backgroundColor: 'rgba(59,130,246,0.08)', tension: 0.3, fill: true, pointRadius: 0, borderWidth: 2 }] };
    }

    function buildDataDatasets(rows, grafiekType) {
        const labels = rows.map(r => r.label);
        const values = rows.map(r => parseFloat(String(r.value).replace(',', '.')) || 0);

        if (grafiekType === 'taart') {
            return {
                labels,
                datasets: [{
                    data: values,
                    backgroundColor: getPieColors(values.length, rows),
                    borderColor: '#fff',
                    borderWidth: 2,
                }]
            };
        }

        const color = CHART_COLORS[0];
        return {
            labels,
            datasets: [{
                label: SummieI18n.t('Waarde'),
                data: values,
                backgroundColor: grafiekType === 'staaf'
                    ? getPieColors(values.length, rows)
                    : color + '33',
                borderColor: color,
                borderWidth: 2,
                tension: 0.3,
                fill: grafiekType === 'data',
                pointRadius: 4,
            }]
        };
    }

    function chartTypeForGrafiek(grafiekType) {
        if (grafiekType === 'staaf') return 'bar';
        if (grafiekType === 'taart') return 'pie';
        return 'line';
    }

    // Render or update a Chart.js instance inside a wrapper
    function renderChart(wrapper, config) {
        const canvas = wrapper.querySelector('canvas');
        if (!canvas) return;

        const Chart = getChart();
        if (!Chart) { console.warn('Chart.js not loaded'); return; }
        ensurePiePluginRegistered();

        if (wrapper._chartInstance) {
            wrapper._chartInstance.destroy();
        }

        const ctx = canvas.getContext('2d');
        wrapper._chartInstance = new Chart(ctx, config);

        // Store config for later editing
        wrapper.dataset.chartConfig = JSON.stringify(config);
    }

    function deleteGrafiekWrapper(wrapper) {
        if (!wrapper) return;
        try { if (wrapper._chartInstance) wrapper._chartInstance.destroy(); } catch {}
        // Remove trailing spacer if we created one and it is still empty
        const next = wrapper.nextElementSibling;
        if (next && next.getAttribute && next.getAttribute('data-grafiek-spacer') === '1') {
            if (!next.textContent.trim() && !next.querySelector('img, table, .summie-grafiek-wrapper, .summie-textbox, .summie-shape-wrapper')) {
                // Keep at least one block so the editor never becomes completely empty in a weird way,
                // but removing an empty spacer is fine — the editor will still have the chart's former position
                // and we leave the spacer only if it has user content. For a clean delete, remove empty spacer.
                next.remove();
            } else {
                next.removeAttribute('data-grafiek-spacer');
            }
        }
        wrapper.remove();
        const editor = document.getElementById('editor');
        if (editor) editor.dispatchEvent(new Event('input', { bubbles: true }));
        window.saveToLocalStorage?.();
        window.updateUnsavedIndicator?.();
        _savedRange = null;
        if (window.topbarManager) window.topbarManager.savedRange = null;
    }

    function selectGrafiekWrapper(wrapper) {
        document.querySelectorAll('.summie-grafiek-wrapper.selected').forEach(el => {
            if (el !== wrapper) el.classList.remove('selected');
        });
        wrapper.classList.add('selected');
        try { wrapper.focus({ preventScroll: true }); } catch { try { wrapper.focus(); } catch {} }
    }

    function buildGrafiekWrapper(config, title, grafiekData) {
        const wrapper = document.createElement('div');
        wrapper.className = 'summie-grafiek-wrapper';
        wrapper.tabIndex = 0;
        wrapper.dataset.grafiek = '1';
        wrapper.dataset.grafiekData = JSON.stringify(grafiekData);

        wrapper.innerHTML = `
            <div class="summie-grafiek-toolbar">
                <span class="summie-grafiek-title">${escHtml(title)}</span>
                <div class="summie-grafiek-actions">
                    <button class="summie-grafiek-btn" data-action="edit">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        ${escHtml(SummieI18n.t('Bewerken'))}
                    </button>
                    <button class="summie-grafiek-btn summie-grafiek-btn--danger" data-action="delete" title="${escHtml(SummieI18n.t('Verwijderen'))}">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                        ${escHtml(SummieI18n.t('Verwijderen'))}
                    </button>
                </div>
            </div>
            <canvas height="280"></canvas>
        `;

        // Click on wrapper selects it (so Backspace/Delete work and the user sees which chart is active)
        wrapper.addEventListener('mousedown', e => {
            // Don't steal the click if it's on a button inside the toolbar
            if (e.target.closest('button')) return;
            selectGrafiekWrapper(wrapper);
        });
        wrapper.addEventListener('click', e => {
            if (e.target.closest('button')) return;
            selectGrafiekWrapper(wrapper);
        });
        wrapper.addEventListener('focus', () => selectGrafiekWrapper(wrapper));

        // Wire edit button
        wrapper.querySelector('[data-action="edit"]').addEventListener('mousedown', e => {
            e.preventDefault();
            e.stopPropagation();
            const data = JSON.parse(wrapper.dataset.grafiekData || '{}');
            openGrafiekModal(data, wrapper);
        });
        wrapper.querySelector('[data-action="edit"]').addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
        });

        // Wire delete button
        const delBtn = wrapper.querySelector('[data-action="delete"]');
        delBtn.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); });
        delBtn.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            deleteGrafiekWrapper(wrapper);
        });

        // Render chart after insertion (needs to be in DOM)
        setTimeout(() => renderChart(wrapper, config), 60);

        return wrapper;
    }

    // ── Grafiek Modal ─────────────────────────────────────────────────────

    function openGrafiekModal(initData = {}, existingWrapper = null) {
        const isEdit = !!existingWrapper;
        const type = initData.type || 'lijn';

        const overlay = document.createElement('div');
        overlay.className = 'wiskunde-modal-overlay';

        overlay.innerHTML = `
            <div class="wiskunde-modal">
                <div class="wiskunde-modal-header">
                    <h3>${isEdit ? SummieI18n.t('Grafiek bewerken') : SummieI18n.t('Grafiek invoegen')}</h3>
                    <button class="wiskunde-modal-close">✕</button>
                </div>
                <div class="wiskunde-modal-body">
                    <!-- Type selector -->
                    <div class="wm-field">
                        <label>${escHtml(SummieI18n.t('Type grafiek'))}</label>
                        <div class="wm-type-tabs" id="wmTypeTabs">
                            <button class="wm-type-tab ${type === 'lijn' ? 'active' : ''}"  data-type="lijn">📈 ${escHtml(SummieI18n.t('Lijn (formule)'))}</button>
                            <button class="wm-type-tab ${type === 'data' ? 'active' : ''}"  data-type="data">📊 ${escHtml(SummieI18n.t('Lijn (data)'))}</button>
                            <button class="wm-type-tab ${type === 'staaf' ? 'active' : ''}" data-type="staaf">▮ ${escHtml(SummieI18n.t('Staafdiagram'))}</button>
                            <button class="wm-type-tab ${type === 'taart' ? 'active' : ''}" data-type="taart">◔ ${escHtml(SummieI18n.t('Taartdiagram'))}</button>
                        </div>
                    </div>

                    <!-- Title -->
                    <div class="wm-field">
                        <label>${escHtml(SummieI18n.t('Titel (optioneel)'))}</label>
                        <input id="wmGrafiekTitle" type="text" value="${escHtml(initData.title || '')}" placeholder="${escHtml(SummieI18n.t('bijv. Kosten per maand'))}">
                    </div>

                    <!-- Formula fields (lijn only) -->
                    <div id="wmFormulaFields" style="display:${type === 'lijn' ? 'flex' : 'none'};flex-direction:column;gap:10px">
                        <div class="wm-field">
                            <label>${escHtml(SummieI18n.t('Formule (bijv. y = 2x + 1 of x^2 - 3)'))}</label>
                            <input id="wmFormula" type="text" value="${escHtml(initData.formula || 'y = x')}" placeholder="y = 2x + 1">
                        </div>
                        <div class="wm-row">
                            <div class="wm-field">
                                <label>${escHtml(SummieI18n.t('X van'))}</label>
                                <input id="wmXMin" type="number" value="${initData.xMin ?? -10}" step="1">
                            </div>
                            <div class="wm-field">
                                <label>${escHtml(SummieI18n.t('X tot'))}</label>
                                <input id="wmXMax" type="number" value="${initData.xMax ?? 10}" step="1">
                            </div>
                        </div>
                    </div>

                    <!-- Data fields (data, staaf, taart) -->
                    <div id="wmDataFields" style="display:${type !== 'lijn' ? 'flex' : 'none'};flex-direction:column;gap:10px">
                        <div class="wm-data-header" id="wmDataHeader">
                            <span>${escHtml(SummieI18n.t('Label'))}</span><span>${escHtml(SummieI18n.t('Waarde'))}</span><span class="wm-col-color">${escHtml(SummieI18n.t('Kleur'))}</span>
                        </div>
                        <div class="wm-data-rows" id="wmDataRows"></div>
                        <button class="wm-add-row-btn" id="wmAddDataRow">${escHtml(SummieI18n.t('+ Rij toevoegen'))}</button>
                        <div id="wmTaartOptions" class="wm-taart-options" style="display:${type === 'taart' ? 'flex' : 'none'}">
                            <label class="wm-checkbox">
                                <input type="checkbox" id="wmShowPercentages" ${initData.showPercentages !== false ? 'checked' : ''}>
                                <span>${escHtml(SummieI18n.t('Toon percentages in elk stuk'))}</span>
                            </label>
                            <p class="wm-hint">${escHtml(SummieI18n.t('Toont het percentage van elk stuk direct in de taart, naast de legenda en tooltip.'))}</p>
                        </div>
                    </div>

                    <!-- Live preview -->
                    <div class="wm-field">
                        <label>${escHtml(SummieI18n.t('Voorbeeld'))}</label>
                        <canvas id="wmPreviewCanvas" class="wm-preview-canvas" height="180"></canvas>
                    </div>
                </div>
                <div class="wiskunde-modal-footer">
                    <button class="btn" id="wmGrafiekCancel">${escHtml(SummieI18n.t('Annuleren'))}</button>
                    <button class="btn btn-primary" id="wmGrafiekInsert">${isEdit ? SummieI18n.t('Bijwerken') : SummieI18n.t('Invoegen')}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // ── State inside modal ──
        let currentType = type;
        let showPercentages = initData.showPercentages !== false;
        const rawRows = initData.dataRows || [
            { label: SummieI18n.t('Jan'), value: 10 },
            { label: SummieI18n.t('Feb'), value: 20 },
            { label: SummieI18n.t('Mar'), value: 15 },
        ];
        const dataRows = normalizeDataRows(rawRows);
        // Ensure at least one color per row even for non-taart types (harmless)
        dataRows.forEach((r, i) => {
            if (!r.color) r.color = CHART_COLORS[i % CHART_COLORS.length];
        });

        const previewCanvas = overlay.querySelector('#wmPreviewCanvas');
        let previewChart = null;

        // ── Data row management ──
        const rowsContainer = overlay.querySelector('#wmDataRows');
        const dataHeader = overlay.querySelector('#wmDataHeader');
        const taartOptions = overlay.querySelector('#wmTaartOptions');
        const showPctCheckbox = overlay.querySelector('#wmShowPercentages');

        function syncTaartUiVisibility() {
            const isTaart = currentType === 'taart';
            if (taartOptions) taartOptions.style.display = isTaart ? 'flex' : 'none';
            if (dataHeader) dataHeader.classList.toggle('is-taart', isTaart);
            rowsContainer.classList.toggle('is-taart', isTaart);
            // Show/hide color column header handled via CSS .is-taart
        }

        function renderDataRows() {
            const isTaart = currentType === 'taart';
            rowsContainer.innerHTML = '';
            dataRows.forEach((row, i) => {
                const div = document.createElement('div');
                div.className = 'wm-data-row' + (isTaart ? ' has-color' : '');
                const safeColor = row.color || CHART_COLORS[i % CHART_COLORS.length];
                div.innerHTML = `
                    <input type="text" value="${escHtml(String(row.label))}" placeholder="${escHtml(SummieI18n.t('Label'))}" data-idx="${i}" data-field="label">
                    <input type="text" value="${escHtml(String(row.value))}" placeholder="${escHtml(SummieI18n.t('0'))}" data-idx="${i}" data-field="value">
                    ${isTaart ? `<input type="color" value="${escHtml(safeColor)}" data-idx="${i}" data-field="color" title="${escHtml(SummieI18n.t('Kleur voor dit stuk'))}" class="wm-color-input">` : ''}
                    <button class="wm-data-row-del" data-idx="${i}" title="${escHtml(SummieI18n.t('Verwijderen'))}">✕</button>
                `;
                rowsContainer.appendChild(div);
            });

            rowsContainer.querySelectorAll('input[data-field="label"], input[data-field="value"]').forEach(inp => {
                inp.addEventListener('input', () => {
                    const idx = parseInt(inp.dataset.idx);
                    const field = inp.dataset.field;
                    dataRows[idx][field] = inp.value;
                    updatePreview();
                });
            });
            rowsContainer.querySelectorAll('input[data-field="color"]').forEach(inp => {
                inp.addEventListener('input', () => {
                    const idx = parseInt(inp.dataset.idx);
                    dataRows[idx].color = inp.value;
                    updatePreview();
                });
            });
            rowsContainer.querySelectorAll('.wm-data-row-del').forEach(btn => {
                btn.addEventListener('click', () => {
                    const idx = parseInt(btn.dataset.idx);
                    dataRows.splice(idx, 1);
                    renderDataRows();
                    updatePreview();
                });
            });
        }
        renderDataRows();
        syncTaartUiVisibility();

        overlay.querySelector('#wmAddDataRow').addEventListener('click', () => {
            const nextColor = CHART_COLORS[dataRows.length % CHART_COLORS.length];
            dataRows.push({ label: '', value: 0, color: nextColor });
            renderDataRows();
            updatePreview();
        });

        if (showPctCheckbox) {
            showPctCheckbox.addEventListener('change', () => {
                showPercentages = showPctCheckbox.checked;
                updatePreview();
            });
        }

        // ── Type tab switching ──
        overlay.querySelectorAll('.wm-type-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                overlay.querySelectorAll('.wm-type-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentType = btn.dataset.type;
                overlay.querySelector('#wmFormulaFields').style.display = currentType === 'lijn' ? 'flex' : 'none';
                overlay.querySelector('#wmDataFields').style.display = currentType !== 'lijn' ? 'flex' : 'none';
                syncTaartUiVisibility();
                renderDataRows();
                updatePreview();
            });
        });

        // ── Formula live preview ──
        overlay.querySelector('#wmFormula')?.addEventListener('input', updatePreview);
        overlay.querySelector('#wmXMin')?.addEventListener('input', updatePreview);
        overlay.querySelector('#wmXMax')?.addEventListener('input', updatePreview);
        overlay.querySelector('#wmGrafiekTitle')?.addEventListener('input', updatePreview);

        function updatePreview() {
            const Chart = getChart();
            if (!Chart) return;
            ensurePiePluginRegistered();
            if (previewChart) { previewChart.destroy(); previewChart = null; }

            const config = buildChartConfig();
            if (!config) return;

            try {
                previewChart = new Chart(previewCanvas.getContext('2d'), {
                    ...config,
                    options: {
                        ...config.options,
                        animation: false,
                        responsive: false,
                        plugins: { ...config.options?.plugins, legend: { display: false } },
                    }
                });
            } catch (e) { /* ignore parse errors while typing */ }
        }

        function buildChartConfig() {
            const title = overlay.querySelector('#wmGrafiekTitle').value.trim();
            let chartData, chartType;

            if (currentType === 'lijn') {
                const formula = overlay.querySelector('#wmFormula').value.trim();
                const xMin = parseFloat(overlay.querySelector('#wmXMin').value) || -10;
                const xMax = parseFloat(overlay.querySelector('#wmXMax').value) || 10;
                if (xMin >= xMax) return null;
                const result = buildFormulaDatasets(formula, xMin, xMax, 200);
                if (!result) return null;
                chartData = result;
                chartType = 'line';
            } else {
                if (dataRows.length === 0) return null;
                chartData = buildDataDatasets(dataRows, currentType);
                chartType = chartTypeForGrafiek(currentType);
            }

            const isTaart = currentType === 'taart';

            // Tooltip: for taart always show value + percentage
            const tooltipCallbacks = isTaart ? {
                callbacks: {
                    label(ctx) {
                        const val = ctx.parsed;
                        const total = ctx.dataset.data.reduce((a, b) => a + (Number(b) || 0), 0);
                        const pct = total ? ((val / total) * 100).toFixed(1).replace(/\.0$/, '') : '0';
                        const label = ctx.label ? ctx.label + ': ' : '';
                        return `${label}${val} (${pct}%)`;
                    }
                }
            } : {};

            return {
                type: chartType,
                data: chartData,
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    animation: { duration: 400 },
                    plugins: {
                        title: { display: !!title, text: title, font: { size: 14, weight: '700' } },
                        legend: { display: isTaart, position: 'bottom' },
                        tooltip: { ...tooltipCallbacks },
                        summiePiePercentages: { enabled: isTaart && showPercentages },
                    },
                    scales: isTaart ? {} : {
                        x: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 } } },
                        y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 } } },
                    },
                }
            };
        }

        function buildChartConfigForStoredData(grafiekData) {
            const type = grafiekData.type || 'lijn';
            const title = grafiekData.title || '';
            let chartData, chartType;
            if (type === 'lijn') {
                const formula = grafiekData.formula || 'y = x';
                const xMin = grafiekData.xMin ?? -10;
                const xMax = grafiekData.xMax ?? 10;
                const result = buildFormulaDatasets(formula, xMin, xMax, 200);
                if (!result) return null;
                chartData = result;
                chartType = 'line';
            } else {
                const rows = normalizeDataRows(grafiekData.dataRows || []);
                if (rows.length === 0) return null;
                chartData = buildDataDatasets(rows, type);
                chartType = chartTypeForGrafiek(type);
            }
            const isTaart = type === 'taart';
            const shouldShowPct = grafiekData.showPercentages !== false;
            return {
                type: chartType,
                data: chartData,
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    animation: { duration: 400 },
                    plugins: {
                        title: { display: !!title, text: title, font: { size: 14, weight: '700' } },
                        legend: { display: isTaart, position: 'bottom' },
                        tooltip: isTaart ? {
                            callbacks: {
                                label(ctx) {
                                    const val = ctx.parsed;
                                    const total = ctx.dataset.data.reduce((a, b) => a + (Number(b) || 0), 0);
                                    const pct = total ? ((val / total) * 100).toFixed(1).replace(/\.0$/, '') : '0';
                                    const label = ctx.label ? ctx.label + ': ' : '';
                                    return `${label}${val} (${pct}%)`;
                                }
                            }
                        } : {},
                        summiePiePercentages: { enabled: isTaart && shouldShowPct },
                    },
                    scales: isTaart ? {} : {
                        x: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 } } },
                        y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 } } },
                    },
                }
            };
        }

        // Trigger initial preview
        setTimeout(updatePreview, 80);

        // ── Close / cancel ──
        // Escape closes the modal too (listener removed on close to avoid leaks)
        const onModalKeydown = (e) => {
            if (e.key === 'Escape') { e.stopPropagation(); close(); }
        };
        document.addEventListener('keydown', onModalKeydown);

        const close = () => {
            document.removeEventListener('keydown', onModalKeydown);
            if (previewChart) previewChart.destroy();
            overlay.remove();
        };
        overlay.querySelector('.wiskunde-modal-close').addEventListener('click', close);
        overlay.querySelector('#wmGrafiekCancel').addEventListener('click', close);
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

        // ── Insert / update ──
        overlay.querySelector('#wmGrafiekInsert').addEventListener('click', async () => {
            const config = buildChartConfig();
            if (!config) { await window.SummieDialogs.alert(SummieI18n.t('Ongeldige invoer — controleer de formule of gegevens.'), { title: SummieI18n.t('Ongeldige invoer') }); return; }

            const title = overlay.querySelector('#wmGrafiekTitle').value.trim() || SummieI18n.t('Grafiek');
            const grafiekData = {
                type: currentType,
                title,
                formula: overlay.querySelector('#wmFormula')?.value || '',
                xMin: parseFloat(overlay.querySelector('#wmXMin')?.value) || -10,
                xMax: parseFloat(overlay.querySelector('#wmXMax')?.value) || 10,
                dataRows: JSON.parse(JSON.stringify(dataRows)),
                showPercentages: currentType === 'taart' ? showPercentages : false,
            };

            if (isEdit && existingWrapper) {
                existingWrapper.dataset.grafiekData = JSON.stringify(grafiekData);
                existingWrapper.querySelector('.summie-grafiek-title').textContent = title;
                renderChart(existingWrapper, config);
                window.saveToLocalStorage?.();
            } else {
                const wrapper = buildGrafiekWrapper(config, title, grafiekData);
                insertBlockAtCursor(wrapper);
            }

            close();
        });
    }

    // ── Restore charts after document load (e.g. reopen) ────────────────
    function buildConfigFromStoredWrapperData(grafiekData) {
        const type = grafiekData.type || 'lijn';
        const title = grafiekData.title || '';
        let chartData, chartType;
        if (type === 'lijn') {
            const formula = grafiekData.formula || 'y = x';
            const xMin = grafiekData.xMin ?? -10;
            const xMax = grafiekData.xMax ?? 10;
            const result = buildFormulaDatasets(formula, xMin, xMax, 200);
            if (!result) return null;
            chartData = result;
            chartType = 'line';
        } else {
            const rows = normalizeDataRows(grafiekData.dataRows || []);
            if (rows.length === 0) return null;
            chartData = buildDataDatasets(rows, type);
            chartType = chartTypeForGrafiek(type);
        }
        const isTaart = type === 'taart';
        const shouldShowPct = grafiekData.showPercentages !== false;
        return {
            type: chartType,
            data: chartData,
            options: {
                responsive: true,
                maintainAspectRatio: true,
                animation: { duration: 400 },
                plugins: {
                    title: { display: !!title, text: title, font: { size: 14, weight: '700' } },
                    legend: { display: isTaart, position: 'bottom' },
                    tooltip: isTaart ? {
                        callbacks: {
                            label(ctx) {
                                const val = ctx.parsed;
                                const total = ctx.dataset.data.reduce((a, b) => a + (Number(b) || 0), 0);
                                const pct = total ? ((val / total) * 100).toFixed(1).replace(/\.0$/, '') : '0';
                                const label = ctx.label ? ctx.label + ': ' : '';
                                return `${label}${val} (${pct}%)`;
                            }
                        }
                    } : {},
                    summiePiePercentages: { enabled: isTaart && shouldShowPct },
                },
                scales: isTaart ? {} : {
                    x: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 } } },
                    y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 } } },
                },
            }
        };
    }

    function restoreCharts(root) {
        const Chart = getChart();
        if (!Chart) return;
        ensurePiePluginRegistered();
        const container = root || document.getElementById('editor') || document;
        const wrappers = container.querySelectorAll ? container.querySelectorAll('.summie-grafiek-wrapper') : [];
        wrappers.forEach(wrapper => {
            try {
                const raw = wrapper.dataset.grafiekData;
                if (!raw) return;
                const data = JSON.parse(raw);
                // Backfill colors for old documents
                if (Array.isArray(data.dataRows)) {
                    data.dataRows = normalizeDataRows(data.dataRows);
                    wrapper.dataset.grafiekData = JSON.stringify(data);
                }
                const config = buildConfigFromStoredWrapperData(data);
                if (!config) return;

                // Upgrade old wrappers that were saved without the new toolbar/actions
                if (!wrapper.hasAttribute('tabindex')) wrapper.tabIndex = 0;
                let toolbar = wrapper.querySelector('.summie-grafiek-toolbar');
                if (toolbar && !toolbar.querySelector('[data-action="delete"]')) {
                    // Old wrapper only had a single edit button — rebuild the actions container
                    const oldEdit = toolbar.querySelector('[data-action="edit"]');
                    const actions = document.createElement('div');
                    actions.className = 'summie-grafiek-actions';
                    if (oldEdit) actions.appendChild(oldEdit);
                    const delBtn = document.createElement('button');
                    delBtn.className = 'summie-grafiek-btn summie-grafiek-btn--danger';
                    delBtn.dataset.action = 'delete';
                    delBtn.title = SummieI18n.t('Verwijderen');
                    delBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg> ${escHtml(SummieI18n.t('Verwijderen'))}`;
                    actions.appendChild(delBtn);
                    // Remove stray text nodes between toolbar children before appending
                    toolbar.appendChild(actions);
                }
                // Ensure actions wrapper exists for CSS
                if (toolbar && !toolbar.querySelector('.summie-grafiek-actions')) {
                    const actions = document.createElement('div');
                    actions.className = 'summie-grafiek-actions';
                    toolbar.querySelectorAll('[data-action]').forEach(b => actions.appendChild(b));
                    toolbar.appendChild(actions);
                }

                // Wire selection (click / focus on the wrapper itself)
                if (!wrapper._grafiekSelectBound) {
                    wrapper._grafiekSelectBound = true;
                    wrapper.addEventListener('mousedown', e => {
                        if (e.target.closest('button')) return;
                        selectGrafiekWrapper(wrapper);
                    });
                    wrapper.addEventListener('click', e => {
                        if (e.target.closest('button')) return;
                        selectGrafiekWrapper(wrapper);
                    });
                    wrapper.addEventListener('focus', () => selectGrafiekWrapper(wrapper));
                }

                // Re-wire edit button
                const editBtn = wrapper.querySelector('[data-action="edit"]');
                if (editBtn && !editBtn._summieBound) {
                    editBtn._summieBound = true;
                    editBtn.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); });
                    editBtn.addEventListener('click', e => {
                        e.preventDefault(); e.stopPropagation();
                        const d = JSON.parse(wrapper.dataset.grafiekData || '{}');
                        openGrafiekModal(d, wrapper);
                    });
                } else if (editBtn && editBtn._summieBound) {
                    // Ensure the edit handler opens the correct wrapper (closure may be stale after innerHTML restore)
                    // Re-bind to be safe if the dataset changed
                    if (!editBtn._summieEditRewired) {
                        editBtn._summieEditRewired = true;
                        editBtn.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); });
                    }
                }

                // Wire delete button (including old wrappers that just got upgraded)
                const delBtn = wrapper.querySelector('[data-action="delete"]');
                if (delBtn && !delBtn._summieBound) {
                    delBtn._summieBound = true;
                    delBtn.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); });
                    delBtn.addEventListener('click', e => {
                        e.preventDefault(); e.stopPropagation();
                        deleteGrafiekWrapper(wrapper);
                    });
                }

                renderChart(wrapper, config);
            } catch (e) {
                console.warn('Failed to restore grafiek', e);
            }
        });
    }

    // Hook into the canonical load path if available — try multiple timings
    function hookApplyLoadedData() {
        if (window.applyLoadedData && !window.applyLoadedData._summieGrafiekHooked) {
            const orig = window.applyLoadedData;
            window.applyLoadedData = function (...args) {
                const res = orig.apply(this, args);
                setTimeout(() => restoreCharts(), 250);
                setTimeout(() => restoreCharts(), 700);
                return res;
            };
            window.applyLoadedData._summieGrafiekHooked = true;
            return true;
        }
        return false;
    }
    hookApplyLoadedData();
    // Retry hooking for late-loaded editor.js
    let hookRetries = 0;
    const hookInterval = setInterval(() => {
        if (hookApplyLoadedData() || hookRetries++ > 40) clearInterval(hookInterval);
    }, 100);

    // Also restore on DOM ready (covers localStorage draft restore)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(() => restoreCharts(), 400));
    } else {
        setTimeout(() => restoreCharts(), 400);
    }
    // Extra delayed pass for pagination / async content
    setTimeout(() => restoreCharts(), 1200);

    // ── Toolbar integration ───────────────────────────────────────────────

    function initToolbar() {
        // Save cursor when Wiskunde tab is mousedown'd
        const wiskundeTab = document.querySelector('[data-section="wiskunde"]');
        if (wiskundeTab) wiskundeTab.addEventListener('mousedown', () => saveRange());

        // Breuk live preview in toolbar
        const tellerInp = document.getElementById('wsBreukTeller');
        const noemerInp = document.getElementById('wsBreukNoemer');
        const previewTop = document.getElementById('wsBreukPreviewTop');
        const previewBot = document.getElementById('wsBreukPreviewBot');

        if (tellerInp && noemerInp) {
            const updatePreview = () => {
                if (previewTop) previewTop.textContent = tellerInp.value || '?';
                if (previewBot) previewBot.textContent = noemerInp.value || '?';
            };
            tellerInp.addEventListener('input', updatePreview);
            noemerInp.addEventListener('input', updatePreview);
        }

        // Breuk insert button — save range on mousedown so insertAtCursor knows where to put it
        const insertBtn = document.getElementById('wsInsertBreukBtn');
        if (insertBtn) {
            insertBtn.addEventListener('mousedown', e => { e.preventDefault(); saveRange(); });
            insertBtn.addEventListener('click', () => {
                const t = tellerInp?.value.trim() || '1';
                const n = noemerInp?.value.trim() || '2';
                insertAtCursor(buildBreuk(t, n));
            });
        }

        // Grafiek buttons in toolbar — save range on mousedown BEFORE focus is lost
        document.querySelectorAll('[data-content="wiskunde"] [data-grafiek]').forEach(btn => {
            btn.addEventListener('mousedown', e => { e.preventDefault(); saveRange(); });
            btn.addEventListener('click', () => openGrafiekModal({ type: btn.dataset.grafiek }));
        });

        // Keyboard handling for selected grafiek: Backspace/Delete removes it
        // Only acts when the wrapper itself is focused/selected — clicking into
        // normal text deselects the wrapper, so stray Backspaces don't delete it.
        document.addEventListener('keydown', e => {
            if (e.key !== 'Backspace' && e.key !== 'Delete') return;
            const selected = document.querySelector('.summie-grafiek-wrapper.selected');
            if (!selected) return;
            const editor = document.getElementById('editor');
            if (!editor || !editor.contains(selected)) return;

            const ae = document.activeElement;
            const sel = window.getSelection();
            const anchorNode = sel && sel.rangeCount ? sel.getRangeAt(0).startContainer : null;
            const anchorEl = anchorNode ? (anchorNode.nodeType === 3 ? anchorNode.parentElement : anchorNode) : null;
            const anchorInside = !!(anchorEl && selected.contains(anchorEl));
            const focusedInside = !!(ae && (ae === selected || selected.contains(ae)));

            // Don't delete if the user is typing inside a different input/textarea
            if (ae && ae !== selected && !selected.contains(ae)) {
                const tag = ae.tagName;
                const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
                const isEditingText = ae.isContentEditable && !selected.contains(ae);
                if (isInput || isEditingText) {
                    // Check if focus is inside another grafiek — don't steal its key
                    if (ae.closest && ae.closest('.summie-grafiek-wrapper') && ae.closest('.summie-grafiek-wrapper') !== selected) return;
                    // If the chart is selected but the user is typing in a text field, ignore
                    // unless the chart is also focused
                    if (!focusedInside && !anchorInside) return;
                }
            }

            if (focusedInside || anchorInside) {
                e.preventDefault();
                e.stopPropagation();
                deleteGrafiekWrapper(selected);
            }
        }, true);

        // Clicking outside any grafiek deselects the current selection
        const editorEl = document.getElementById('editor');
        if (editorEl) {
            editorEl.addEventListener('mousedown', e => {
                if (!e.target.closest('.summie-grafiek-wrapper')) {
                    document.querySelectorAll('.summie-grafiek-wrapper.selected').forEach(el => el.classList.remove('selected'));
                }
            });
            // Also deselect when focus moves to somewhere else in the editor
            editorEl.addEventListener('click', e => {
                if (!e.target.closest('.summie-grafiek-wrapper')) {
                    // Don't clear if the click was on the toolbar that triggered the grafiek
                    if (e.target.closest('.section-toolbar')) return;
                    document.querySelectorAll('.summie-grafiek-wrapper.selected').forEach(el => el.classList.remove('selected'));
                }
            });
        }
        // Global click deselect when clicking completely outside the editor
        document.addEventListener('click', e => {
            const editorNode = document.getElementById('editor');
            const wrapper = e.target.closest && e.target.closest('.summie-grafiek-wrapper');
            if (wrapper) return;
            if (e.target.closest && (e.target.closest('.section-toolbar') || e.target.closest('.topbar') || e.target.closest('.wiskunde-modal-overlay'))) return;
            if (editorNode && editorNode.contains(e.target)) return;
            document.querySelectorAll('.summie-grafiek-wrapper.selected').forEach(el => el.classList.remove('selected'));
        });

        // Keep isEditorEmpty aware of grafieken — they are content, not empty
        // (editor.js already checks for .summie-grafiek-wrapper via a generic selector,
        // but older versions of isEditorEmpty did not; this patch ensures compatibility)
        try {
            const origIsEmpty = window.isEditorEmpty;
            if (typeof origIsEmpty === 'function' && !origIsEmpty._grafiekPatched) {
                const patched = function () {
                    const editor = document.getElementById('editor');
                    if (editor && editor.querySelector('.summie-grafiek-wrapper')) return false;
                    return origIsEmpty.apply(this, arguments);
                };
                patched._grafiekPatched = true;
                window.isEditorEmpty = patched;
            }
        } catch {}
    }

    function init() {
        initToolbar();
    }

    function escHtml(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // ── Public API ────────────────────────────────────────────────────────

    window.WiskundeModule = { init, openGrafiekModal, openBreukModal, restoreCharts, CHART_COLORS };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 200);
    }

})();
