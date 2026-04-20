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
        }
    }

    function restoreRange() {
        if (!_savedRange) return;
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(_savedRange);
    }

    function insertAtCursor(node) {
        const editor = document.getElementById('editor');
        if (!editor) return;

        restoreRange();
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) {
            // Fallback: append to editor
            editor.appendChild(node);
            return;
        }

        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(node);
        range.setStartAfter(node);
        range.setEndAfter(node);
        sel.removeAllRanges();
        sel.addRange(range);

        window.saveToLocalStorage?.();
        window.updateUnsavedIndicator?.();
    }

    function insertBlockAtCursor(block) {
        const editor = document.getElementById('editor');
        if (!editor) return;

        restoreRange();
        const sel = window.getSelection();
        let refNode = null;

        if (sel && sel.rangeCount > 0) {
            let node = sel.getRangeAt(0).startContainer;
            if (node.nodeType === 3) node = node.parentElement;
            const blockTags = ['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'];
            while (node && node !== editor && !blockTags.includes(node.tagName)) {
                node = node.parentElement;
            }
            if (node && node !== editor && editor.contains(node)) refNode = node;
        }

        const after = document.createElement('p');
        after.innerHTML = '<br>';

        if (refNode) {
            refNode.after(block);
            block.after(after);
        } else {
            editor.appendChild(block);
            editor.appendChild(after);
        }

        window.saveToLocalStorage?.();
        window.updateUnsavedIndicator?.();
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
                    <h3>${isEdit ? 'Breuk bewerken' : 'Breuk invoegen'}</h3>
                    <button class="wiskunde-modal-close">✕</button>
                </div>
                <div class="wiskunde-modal-body">
                    <div style="display:flex;align-items:center;gap:20px;justify-content:center;padding:10px 0">
                        <div class="breuk-input-group">
                            <span class="breuk-label">Teller</span>
                            <input id="wmTeller" type="text" value="${escHtml(initTeller)}" style="width:72px;text-align:center;font-size:18px;font-weight:700;padding:6px">
                            <div class="breuk-divider-line"></div>
                            <input id="wmNoemer" type="text" value="${escHtml(initNoemer)}" style="width:72px;text-align:center;font-size:18px;font-weight:700;padding:6px">
                            <span class="breuk-label">Noemer</span>
                        </div>
                        <div style="display:flex;flex-direction:column;align-items:center;gap:4px">
                            <span style="font-size:11px;color:var(--text-secondary);margin-bottom:4px">Voorbeeld</span>
                            <div class="breuk-preview" id="wmBreukPreview">
                                <span class="breuk-teller">${escHtml(initTeller)}</span>
                                <span class="breuk-lijn"></span>
                                <span class="breuk-noemer">${escHtml(initNoemer)}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="wiskunde-modal-footer">
                    <button class="btn" id="wmBreukCancel">Annuleren</button>
                    <button class="btn btn-primary" id="wmBreukInsert">${isEdit ? 'Opslaan' : 'Invoegen'}</button>
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

        const close = () => overlay.remove();

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
        { id: 'lijn', label: 'Lijn (formule)', icon: '📈' },
        { id: 'data', label: 'Lijn (data)', icon: '📊' },
        { id: 'staaf', label: 'Staafdiagram', icon: '▮▮▮' },
        { id: 'taart', label: 'Taartdiagram', icon: '◔' },
    ];

    const CHART_COLORS = [
        '#3b82f6', '#ef4444', '#22c55e', '#f59e0b',
        '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
    ];

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
            // eslint-disable-next-line no-new-func
            const fn = new Function('x', `"use strict"; return (${expr});`);
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
                    backgroundColor: CHART_COLORS.slice(0, values.length),
                    borderColor: '#fff',
                    borderWidth: 2,
                }]
            };
        }

        const color = CHART_COLORS[0];
        return {
            labels,
            datasets: [{
                label: 'Waarde',
                data: values,
                backgroundColor: grafiekType === 'staaf'
                    ? CHART_COLORS.slice(0, values.length)
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

        if (wrapper._chartInstance) {
            wrapper._chartInstance.destroy();
        }

        const ctx = canvas.getContext('2d');
        wrapper._chartInstance = new Chart(ctx, config);

        // Store config for later editing
        wrapper.dataset.chartConfig = JSON.stringify(config);
    }

    function buildGrafiekWrapper(config, title, grafiekData) {
        const wrapper = document.createElement('div');
        wrapper.className = 'summie-grafiek-wrapper';
        wrapper.dataset.grafiek = '1';
        wrapper.dataset.grafiekData = JSON.stringify(grafiekData);

        wrapper.innerHTML = `
            <div class="summie-grafiek-toolbar">
                <span class="summie-grafiek-title">${escHtml(title)}</span>
                <button class="summie-grafiek-btn" data-action="edit">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Bewerken
                </button>
            </div>
            <canvas height="280"></canvas>
        `;

        // Wire edit button
        wrapper.querySelector('[data-action="edit"]').addEventListener('mousedown', e => {
            e.preventDefault();
            const data = JSON.parse(wrapper.dataset.grafiekData || '{}');
            openGrafiekModal(data, wrapper);
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
                    <h3>${isEdit ? 'Grafiek bewerken' : 'Grafiek invoegen'}</h3>
                    <button class="wiskunde-modal-close">✕</button>
                </div>
                <div class="wiskunde-modal-body">
                    <!-- Type selector -->
                    <div class="wm-field">
                        <label>Type grafiek</label>
                        <div class="wm-type-tabs" id="wmTypeTabs">
                            <button class="wm-type-tab ${type === 'lijn' ? 'active' : ''}"  data-type="lijn">📈 Lijn (formule)</button>
                            <button class="wm-type-tab ${type === 'data' ? 'active' : ''}"  data-type="data">📊 Lijn (data)</button>
                            <button class="wm-type-tab ${type === 'staaf' ? 'active' : ''}" data-type="staaf">▮ Staaf</button>
                            <button class="wm-type-tab ${type === 'taart' ? 'active' : ''}" data-type="taart">◔ Taart</button>
                        </div>
                    </div>

                    <!-- Title -->
                    <div class="wm-field">
                        <label>Titel (optioneel)</label>
                        <input id="wmGrafiekTitle" type="text" value="${escHtml(initData.title || '')}" placeholder="bijv. Kosten per maand">
                    </div>

                    <!-- Formula fields (lijn only) -->
                    <div id="wmFormulaFields" style="display:${type === 'lijn' ? 'flex' : 'none'};flex-direction:column;gap:10px">
                        <div class="wm-field">
                            <label>Formule (bijv. y = 2x + 1 of x^2 - 3)</label>
                            <input id="wmFormula" type="text" value="${escHtml(initData.formula || 'y = x')}" placeholder="y = 2x + 1">
                        </div>
                        <div class="wm-row">
                            <div class="wm-field">
                                <label>X van</label>
                                <input id="wmXMin" type="number" value="${initData.xMin ?? -10}" step="1">
                            </div>
                            <div class="wm-field">
                                <label>X tot</label>
                                <input id="wmXMax" type="number" value="${initData.xMax ?? 10}" step="1">
                            </div>
                        </div>
                    </div>

                    <!-- Data fields (data, staaf, taart) -->
                    <div id="wmDataFields" style="display:${type !== 'lijn' ? 'flex' : 'none'};flex-direction:column;gap:10px">
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px;font-weight:700;color:var(--text-secondary);padding:0 4px">
                            <span>Label</span><span>Waarde</span>
                        </div>
                        <div class="wm-data-rows" id="wmDataRows"></div>
                        <button class="wm-add-row-btn" id="wmAddDataRow">+ Rij toevoegen</button>
                    </div>

                    <!-- Live preview -->
                    <div class="wm-field">
                        <label>Voorbeeld</label>
                        <canvas id="wmPreviewCanvas" class="wm-preview-canvas" height="180"></canvas>
                    </div>
                </div>
                <div class="wiskunde-modal-footer">
                    <button class="btn" id="wmGrafiekCancel">Annuleren</button>
                    <button class="btn btn-primary" id="wmGrafiekInsert">${isEdit ? 'Bijwerken' : 'Invoegen'}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // ── State inside modal ──
        let currentType = type;
        const dataRows = initData.dataRows || [
            { label: 'Jan', value: 10 },
            { label: 'Feb', value: 20 },
            { label: 'Mar', value: 15 },
        ];

        const previewCanvas = overlay.querySelector('#wmPreviewCanvas');
        let previewChart = null;

        // ── Data row management ──
        const rowsContainer = overlay.querySelector('#wmDataRows');

        function renderDataRows() {
            rowsContainer.innerHTML = '';
            dataRows.forEach((row, i) => {
                const div = document.createElement('div');
                div.className = 'wm-data-row';
                div.innerHTML = `
                    <input type="text" value="${escHtml(String(row.label))}" placeholder="Label" data-idx="${i}" data-field="label">
                    <input type="text" value="${escHtml(String(row.value))}" placeholder="0" data-idx="${i}" data-field="value">
                    <button class="wm-data-row-del" data-idx="${i}" title="Verwijderen">✕</button>
                `;
                rowsContainer.appendChild(div);
            });

            rowsContainer.querySelectorAll('input').forEach(inp => {
                inp.addEventListener('input', () => {
                    const idx = parseInt(inp.dataset.idx);
                    const field = inp.dataset.field;
                    dataRows[idx][field] = inp.value;
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

        overlay.querySelector('#wmAddDataRow').addEventListener('click', () => {
            dataRows.push({ label: '', value: 0 });
            renderDataRows();
            updatePreview();
        });

        // ── Type tab switching ──
        overlay.querySelectorAll('.wm-type-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                overlay.querySelectorAll('.wm-type-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentType = btn.dataset.type;
                overlay.querySelector('#wmFormulaFields').style.display = currentType === 'lijn' ? 'flex' : 'none';
                overlay.querySelector('#wmDataFields').style.display = currentType !== 'lijn' ? 'flex' : 'none';
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
        const close = () => { if (previewChart) previewChart.destroy(); overlay.remove(); };
        overlay.querySelector('.wiskunde-modal-close').addEventListener('click', close);
        overlay.querySelector('#wmGrafiekCancel').addEventListener('click', close);
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

        // ── Insert / update ──
        overlay.querySelector('#wmGrafiekInsert').addEventListener('click', () => {
            const config = buildChartConfig();
            if (!config) { alert('Ongeldige invoer — controleer de formule of gegevens.'); return; }

            const title = overlay.querySelector('#wmGrafiekTitle').value.trim() || 'Grafiek';
            const grafiekData = {
                type: currentType,
                title,
                formula: overlay.querySelector('#wmFormula')?.value || '',
                xMin: parseFloat(overlay.querySelector('#wmXMin')?.value) || -10,
                xMax: parseFloat(overlay.querySelector('#wmXMax')?.value) || 10,
                dataRows: JSON.parse(JSON.stringify(dataRows)),
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

        // Breuk insert button
        const insertBtn = document.getElementById('wsInsertBreukBtn');
        if (insertBtn) {
            insertBtn.addEventListener('mousedown', e => e.preventDefault());
            insertBtn.addEventListener('click', () => {
                const t = tellerInp?.value.trim() || '1';
                const n = noemerInp?.value.trim() || '2';
                insertAtCursor(buildBreuk(t, n));
            });
        }

        // Grafiek buttons in toolbar
        document.querySelectorAll('[data-content="wiskunde"] [data-grafiek]').forEach(btn => {
            btn.addEventListener('mousedown', e => e.preventDefault());
            btn.addEventListener('click', () => openGrafiekModal({ type: btn.dataset.grafiek }));
        });
    }

    function init() {
        initToolbar();
    }

    function escHtml(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // ── Public API ────────────────────────────────────────────────────────

    window.WiskundeModule = { init, openGrafiekModal, openBreukModal };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 200);
    }

})();