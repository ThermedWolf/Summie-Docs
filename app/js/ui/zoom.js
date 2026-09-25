// ==================== ZOOM MANAGER ====================
// Document-only zoom — scales #pagesContainer, leaves topbar / sidebar /
// bottom bar at 1×. Mirrors Google Docs / Word shortcuts:
//
//   Ctrl/Cmd + Plus  → zoom in
//   Ctrl/Cmd + Minus → zoom out
//   Ctrl/Cmd + 0     → reset to 100 %
//   Ctrl/Cmd + wheel → zoom in/out
//
// Zoom is persisted to localStorage so it survives reload / new document.

(function () {
    'use strict';

    const STORAGE_KEY = 'summie_zoom';
    const DEFAULT_LEVEL = 100;
    // Ordered preset levels — matches Google Docs' stepped zoom (50 – 200 %)
    const ZOOM_LEVELS = [50, 75, 90, 100, 110, 125, 150, 175, 200];
    const MIN_LEVEL = ZOOM_LEVELS[0];
    const MAX_LEVEL = ZOOM_LEVELS[ZOOM_LEVELS.length - 1];

    let currentLevel = DEFAULT_LEVEL;
    let containerEl = null;

    // ---------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------
    function clamp(level) {
        return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.round(level)));
    }

    function nearestPresetIndex(level) {
        let best = 0;
        let bestDist = Infinity;
        ZOOM_LEVELS.forEach((v, i) => {
            const d = Math.abs(v - level);
            if (d < bestDist) { bestDist = d; best = i; }
        });
        return best;
    }

    function readStoredLevel() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return DEFAULT_LEVEL;
            const n = parseInt(raw, 10);
            if (Number.isFinite(n)) return clamp(n);
        } catch (_) { /* ignore */ }
        return DEFAULT_LEVEL;
    }

    function persist(level) {
        try { localStorage.setItem(STORAGE_KEY, String(level)); } catch (_) { /* ignore */ }
    }

    function getContainer() {
        if (containerEl && document.contains(containerEl)) return containerEl;
        containerEl = document.getElementById('pagesContainer');
        return containerEl;
    }

    // ---------------------------------------------------------------
    // Core — apply zoom to the DOM
    // ---------------------------------------------------------------
    function applyZoom(level) {
        const c = getContainer();
        if (!c) return;
        const clamped = clamp(level);
        currentLevel = clamped;

        // Chromium's non-standard `zoom` scales layout + rendering without the
        // transform-origin / overflow quirks of `scale()`. Electron is
        // Chromium-only so this is safe; fallback to transform if unavailable.
        const useZoom = 'zoom' in c.style || CSS.supports('zoom', '1');
        if (useZoom) {
            c.style.zoom = clamped === 100 ? '' : `${clamped}%`;
            c.style.transform = '';
            c.style.transformOrigin = '';
        } else {
            // Fallback: transform scale centred at top
            c.style.zoom = '';
            const factor = clamped / 100;
            c.style.transformOrigin = 'top center';
            c.style.transform = clamped === 100 ? '' : `scale(${factor})`;
        }

        // Keep the document-section's scroll height in sync when using transform
        // fallback — zoom already reflows, so this is only needed there.
        updateDisplay(clamped);
        persist(clamped);

        // Announce for other modules / UI
        window.dispatchEvent(new CustomEvent('summie:zoom-changed', { detail: { level: clamped } }));
    }

    function updateDisplay(level) {
        const pct = `${level}%`;
        const els = document.querySelectorAll('[data-zoom-display]');
        els.forEach(el => { el.textContent = pct; });
        // Also sync the select dropdown if present
        const sel = document.getElementById('zoomSelect');
        if (sel) {
            // Pick the closest preset for the <select>; if it's a non-preset step
            // we leave the select on the nearest option but display still shows %.
            const idx = nearestPresetIndex(level);
            sel.value = String(ZOOM_LEVELS[idx]);
        }
        // Toggle disabled state on +/- buttons at the limits
        const outBtns = document.querySelectorAll('[data-zoom-out]');
        const inBtns = document.querySelectorAll('[data-zoom-in]');
        outBtns.forEach(b => { b.disabled = level <= MIN_LEVEL; b.setAttribute('aria-disabled', level <= MIN_LEVEL ? 'true' : 'false'); });
        inBtns.forEach(b => { b.disabled = level >= MAX_LEVEL; b.setAttribute('aria-disabled', level >= MAX_LEVEL ? 'true' : 'false'); });
    }

    // ---------------------------------------------------------------
    // Public API — stepped changes
    // ---------------------------------------------------------------
    function zoomIn() {
        const idx = nearestPresetIndex(currentLevel);
        // If we're exactly on a preset, go to next; otherwise snap to nearest upward
        const nextIdx = ZOOM_LEVELS[idx] === currentLevel ? Math.min(idx + 1, ZOOM_LEVELS.length - 1) : (ZOOM_LEVELS[idx] > currentLevel ? idx : Math.min(idx + 1, ZOOM_LEVELS.length - 1));
        if (nextIdx !== idx || ZOOM_LEVELS[idx] !== currentLevel) applyZoom(ZOOM_LEVELS[nextIdx]);
    }

    function zoomOut() {
        const idx = nearestPresetIndex(currentLevel);
        const prevIdx = ZOOM_LEVELS[idx] === currentLevel ? Math.max(idx - 1, 0) : (ZOOM_LEVELS[idx] < currentLevel ? idx : Math.max(idx - 1, 0));
        if (prevIdx !== idx || ZOOM_LEVELS[idx] !== currentLevel) applyZoom(ZOOM_LEVELS[prevIdx]);
    }

    function resetZoom() { applyZoom(DEFAULT_LEVEL); }

    function setZoom(level) { applyZoom(level); }

    function getZoom() { return currentLevel; }

    // ---------------------------------------------------------------
    // Keyboard & wheel shortcuts
    // ---------------------------------------------------------------
    function isZoomModifier(e) {
        // Ctrl on Win/Linux, Cmd (metaKey) on macOS. Require no Alt (AltGr).
        return (e.ctrlKey || e.metaKey) && !e.altKey;
    }

    function handleKeydown(e) {
        if (!isZoomModifier(e)) return;

        const key = e.key;
        const code = e.code;

        // Ctrl/Cmd + 0 → reset
        if (key === '0' || code === 'Digit0' || code === 'Numpad0') {
            e.preventDefault();
            e.stopPropagation();
            resetZoom();
            return;
        }

        // Ctrl/Cmd + Plus → zoom in
        // Covers: '+' , '=' (US keyboard Ctrl+=), NumpadAdd, Equal with Shift
        const isPlus = key === '+' || key === '=' || code === 'Equal' || code === 'NumpadAdd' || (key === '+' && e.shiftKey);
        // Some browsers report '+' as '=' with ctrl — also accept key '+' explicitly
        if (isPlus) {
            // Distinguish plain '=' without shift? In many locales '=' + Ctrl is plus.
            // We treat '=' with Ctrl as zoom-in to match Chrome/Google Docs behavior
            // where Ctrl+'=' zooms in (without needing Shift).
            // Avoid false positive when key is literally '=' and user doesn't mean plus:
            // Both Docs and Word do this, so we keep it.
            e.preventDefault();
            e.stopPropagation();
            zoomIn();
            return;
        }

        // Ctrl/Cmd + Minus → zoom out
        const isMinus = key === '-' || key === '_' || code === 'Minus' || code === 'NumpadSubtract';
        if (isMinus) {
            e.preventDefault();
            e.stopPropagation();
            zoomOut();
            return;
        }
    }

    function handleWheel(e) {
        if (!isZoomModifier(e)) return;
        // Only hijack wheel when it is over the document area — otherwise
        // Ctrl+wheel over the sidebar / topbar should keep its normal scroll.
        const t = e.target;
        const overDoc = t.closest && (t.closest('.document-section') || t.closest('#pagesContainer'));
        if (!overDoc) return;
        e.preventDefault();
        if (e.deltaY < 0) zoomIn();
        else if (e.deltaY > 0) zoomOut();
    }

    function setupShortcuts() {
        // Capture phase so we win over the browser's native zoom before it fires.
        document.addEventListener('keydown', handleKeydown, true);
        // Single global wheel listener — filtered to the document area inside
        // handleWheel so we don't double-fire.
        document.addEventListener('wheel', handleWheel, { passive: false });
    }

    function setupUI() {
        // Toolbar / bottom-bar +/- buttons (delegated via data attributes)
        document.addEventListener('click', (e) => {
            const outBtn = e.target.closest('[data-zoom-out]');
            if (outBtn && !outBtn.disabled) { zoomOut(); return; }
            const inBtn = e.target.closest('[data-zoom-in]');
            if (inBtn && !inBtn.disabled) { zoomIn(); return; }
            const resetBtn = e.target.closest('[data-zoom-reset]');
            if (resetBtn) { resetZoom(); return; }
        });
        // Keyboard activation for the reset display (role=button)
        document.addEventListener('keydown', (e) => {
            if ((e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('[data-zoom-reset]')) {
                e.preventDefault();
                resetZoom();
            }
        });

        const select = document.getElementById('zoomSelect');
        if (select) {
            select.addEventListener('change', () => {
                const v = parseInt(select.value, 10);
                if (Number.isFinite(v)) setZoom(v);
            });
            // Prevent Ctrl+wheel over the select from also scrolling the page
            select.addEventListener('wheel', (e) => { if (isZoomModifier(e)) e.stopPropagation(); }, { passive: false });
        }
    }

    // ---------------------------------------------------------------
    // Init
    // ---------------------------------------------------------------
    function init() {
        currentLevel = readStoredLevel();
        // Apply once DOM is ready (and again on DOMContentLoaded if needed)
        const apply = () => {
            containerEl = getContainer();
            if (containerEl) applyZoom(currentLevel);
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                apply();
                setupShortcuts();
                setupUI();
            }, { once: true });
        } else {
            apply();
            setupShortcuts();
            setupUI();
        }
        // Re-apply when pages are recreated (e.g. pagination toggle) — a
        // MutationObserver on the container keeps zoom alive without polling.
        const obs = new MutationObserver(() => {
            const c = getContainer();
            if (c && c.style.zoom === '' && currentLevel !== 100) {
                // Style was cleared by pagination rebuilding pages
                applyZoom(currentLevel);
            } else if (c) {
                // Re-sync display (in case container was replaced)
                updateDisplay(currentLevel);
            }
        });
        // Observe after DOM ready
        const startObserve = () => {
            const c = getContainer();
            if (c && c.parentNode) obs.observe(c, { attributes: true, attributeFilter: ['style'] });
            const pc = document.getElementById('pagesContainer');
            if (pc && pc.parentNode) obs.observe(pc.parentNode, { childList: true });
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', startObserve, { once: true });
        } else {
            startObserve();
        }
    }

    // Expose
    window.ZoomManager = {
        init,
        getZoom,
        setZoom,
        zoomIn,
        zoomOut,
        resetZoom,
        get levels() { return [...ZOOM_LEVELS]; },
        get defaultLevel() { return DEFAULT_LEVEL; },
    };

    // Auto-init
    init();
})();
