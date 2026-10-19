// ==================== GRAFIEK CONTROLS ====================
// Context tab that appears in the topbar when a chart wrapper is selected.
// Registers itself via ElementProtection.registerTab and follows the same
// pattern as image-controls.js.
//
// Controls:
//  - Breedte / Hoogte (px)
//  - Herstel naar standaardgrootte
//  - Verwijderen button
//
// The actual sizing/deletion logic lives in wiskunde.js (WiskundeModule) —
// this panel only reads the current rendered size and delegates changes.

(function () {
    'use strict';

    const TAB_ID = 'grafiek-opmaak';
    const TAB_LABEL = SummieI18n.t('Grafiek');

    let _activeWrapper = null; // the currently selected .summie-grafiek-wrapper

    // ── Helpers ───────────────────────────────────────────────────────────

    function getCanvas() {
        return _activeWrapper ? _activeWrapper.querySelector('canvas') : null;
    }

    // Chart.js applies stored sizes on render, so the rendered canvas size
    // always reflects grafiekData — reading it keeps the panel accurate
    // without duplicating the clamping/parse logic from wiskunde.js
    function syncPanel() {
        requestAnimationFrame(() => {
            const canvas = getCanvas();
            if (!canvas) return;
            const widthInput = document.getElementById('grafiekWidthInput');
            const heightInput = document.getElementById('grafiekHeightInput');
            if (widthInput) widthInput.value = canvas.offsetWidth ? Math.round(canvas.offsetWidth) : '';
            if (heightInput) heightInput.value = canvas.offsetHeight ? Math.round(canvas.offsetHeight) : '';
        });
    }

    function resize(width, height) {
        if (!_activeWrapper || !window.WiskundeModule?.resizeGrafiek) return;
        window.WiskundeModule.resizeGrafiek(_activeWrapper, width, height);
        // Re-render is async — refresh both fields (typing may have been clamped)
        setTimeout(syncPanel, 60);
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
            <!-- Grootte -->
            <div class="toolbar-group animate-item ctx-group">
                <label class="toolbar-label">${escHtml(SummieI18n.t('Grootte'))}</label>
                <div class="toolbar-buttons" style="gap:6px;align-items:center">
                    <div style="display:flex;align-items:center;gap:4px">
                        <span style="font-size:11px;color:var(--text-secondary)">B</span>
                        <input type="number" id="grafiekWidthInput" class="ctx-text-input grafiek-dim-input"
                               min="120" max="900" step="1" placeholder="–" title="${escHtml(SummieI18n.t('Breedte in px'))}">
                        <span style="font-size:11px;color:var(--text-secondary)">px</span>
                    </div>

                    <div style="display:flex;align-items:center;gap:4px">
                        <span style="font-size:11px;color:var(--text-secondary)">H</span>
                        <input type="number" id="grafiekHeightInput" class="ctx-text-input grafiek-dim-input"
                               min="160" max="700" step="1" placeholder="–" title="${escHtml(SummieI18n.t('Hoogte in px'))}">
                        <span style="font-size:11px;color:var(--text-secondary)">px</span>
                    </div>

                    <button id="grafiekResetSizeBtn" class="btn-toolbar ctx-btn" title="${escHtml(SummieI18n.t('Herstel naar standaardgrootte'))}">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="1 4 1 10 7 10"/>
                            <path d="M3.51 15a9 9 0 1 0 .49-4.95"/>
                        </svg>
                        <span>${escHtml(SummieI18n.t('Standaard'))}</span>
                    </button>
                </div>
            </div>

            <div class="toolbar-separator animate-item"></div>

            <!-- Verwijderen -->
            <div class="toolbar-group animate-item ctx-group">
                <label class="toolbar-label ctx-label-danger">${escHtml(SummieI18n.t('Verwijderen'))}</label>
                <div class="toolbar-buttons">
                    <button class="btn-toolbar ctx-btn ctx-btn-danger" id="grafiekDeleteBtn">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                            <path d="M10 11v6M14 11v6"/>
                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                        </svg>
                        <span>${escHtml(SummieI18n.t('Verwijder grafiek'))}</span>
                    </button>
                </div>
            </div>
        `;

        toolbar.appendChild(panel);
        window.wrapToolbarContentForScroll?.(panel);
        _bindPanelEvents(panel);
    }

    // ── Panel event bindings ──────────────────────────────────────────────

    function _bindPanelEvents(panel) {
        // Prevent toolbar interactions from losing editor focus
        panel.addEventListener('mousedown', e => {
            if (!e.target.matches('input, textarea')) e.preventDefault();
        });

        const widthInput = panel.querySelector('#grafiekWidthInput');
        const heightInput = panel.querySelector('#grafiekHeightInput');

        widthInput.addEventListener('change', () => {
            const w = parseInt(widthInput.value, 10);
            const canvas = getCanvas();
            const h = Number.isFinite(w) ? (canvas ? canvas.offsetHeight : null) : null;
            resize(Number.isFinite(w) ? w : null, h);
        });

        heightInput.addEventListener('change', () => {
            const h = parseInt(heightInput.value, 10);
            const canvas = getCanvas();
            const w = Number.isFinite(h) ? (canvas ? canvas.offsetWidth : null) : null;
            resize(w, Number.isFinite(h) ? h : null);
        });

        panel.querySelector('#grafiekResetSizeBtn').addEventListener('click', () => {
            if (!_activeWrapper || !window.WiskundeModule?.resetGrafiekSize) return;
            window.WiskundeModule.resetGrafiekSize(_activeWrapper);
            setTimeout(syncPanel, 60);
        });

        // Delete (delegates to the same path as the chart's own toolbar button)
        panel.querySelector('#grafiekDeleteBtn').addEventListener('click', () => {
            if (!_activeWrapper) return;
            const wrapper = _activeWrapper;
            hide();
            window.WiskundeModule?.deleteGrafiek?.(wrapper);
        });
    }

    // ── Show / Hide ───────────────────────────────────────────────────────

    function show(wrapper) {
        if (!wrapper) return;
        _activeWrapper = wrapper;
        window.ElementProtection?.showContext('grafiek');
        syncPanel();
    }

    function hide() {
        if (!_activeWrapper) return;
        _activeWrapper = null;
        // Another context (image/shape/…) may have taken over in the meantime
        if (window.ElementProtection?.getContext() === 'grafiek') {
            window.ElementProtection?.hideContext(true);
        }
    }

    function escHtml(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // ── Init ──────────────────────────────────────────────────────────────

    function init() {
        window.ElementProtection?.registerTab(TAB_ID, TAB_LABEL);
        buildPanel();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else setTimeout(init, 0);

    window.GrafiekControls = { show, hide };

})();
