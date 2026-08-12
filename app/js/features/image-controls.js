// ==================== IMAGE CONTROLS ====================
// Context tab that appears in the topbar when an image is selected.
// Registers itself via ElementProtection.registerTab, follows the same
// pattern as codeblock-controls.js and table-controls.js.
//
// Controls:
//  - Breedte / Hoogte (px) with aspect-ratio lock
//  - Tekstterugloop / positionering
//  - Verwijderen button

(function () {
    'use strict';

    const TAB_ID = 'afbeelding-opmaak';
    const TAB_LABEL = SummieI18n.t('Afbeelding');

    let _activeWrapper = null; // the currently selected .editable-image-wrapper
    let _aspectLocked = true;
    let _naturalRatio = null; // naturalWidth / naturalHeight

    // ── Helpers ───────────────────────────────────────────────────────────

    function getImg() {
        return _activeWrapper ? _activeWrapper.querySelector('img') : null;
    }

    function notifyChange() {
        const editor = document.getElementById('editor');
        if (editor) editor.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function persistImageSize(img) {
        if (!img || !_activeWrapper || !window.imageManager) return;
        const id = _activeWrapper.dataset.imageId;
        const data = window.imageManager.images?.get(id);
        if (data) {
            data.originalWidth = data.originalWidth || img.offsetWidth || img.naturalWidth || null;
            data.originalHeight = data.originalHeight || img.offsetHeight || img.naturalHeight || null;
            data.width = img.offsetWidth;
            data.height = img.offsetHeight;
            window.imageManager.saveToLocalStorage?.();
        }
    }

    function getImageData() {
        if (!_activeWrapper || !window.imageManager) return null;
        return window.imageManager.images?.get(_activeWrapper.dataset.imageId) || null;
    }

    function ensureOriginalDimensions(img) {
        const data = getImageData();
        if (!data || !img) return null;
        data.originalWidth = data.originalWidth || data.width || img.offsetWidth || img.naturalWidth || null;
        data.originalHeight = data.originalHeight || data.height || img.offsetHeight || img.naturalHeight || null;
        return data;
    }

    function setImageSize(width, height) {
        const img = getImg();
        if (!img) return;
        if (width === null) img.style.width = '';
        else if (width) img.style.width = Math.max(10, Math.round(width)) + 'px';
        if (height === null) img.style.height = '';
        else if (height) img.style.height = Math.max(10, Math.round(height)) + 'px';
        setTimeout(() => {
            syncPanel(_activeWrapper);
            persistImageSize(img);
        }, 50);
        notifyChange();
    }

    function resetImageWidth() {
        const img = getImg();
        if (!img) return;
        const data = ensureOriginalDimensions(img);
        const originalWidth = data?.originalWidth || img.offsetWidth;
        const ratio = data?.originalWidth && data?.originalHeight ? data.originalWidth / data.originalHeight : _naturalRatio;
        const nextHeight = _aspectLocked && ratio ? Math.round(originalWidth / ratio) : img.offsetHeight;
        setImageSize(originalWidth, nextHeight);
    }

    function resetImageHeight() {
        const img = getImg();
        if (!img) return;
        const data = ensureOriginalDimensions(img);
        const originalHeight = data?.originalHeight || img.offsetHeight;
        const ratio = data?.originalWidth && data?.originalHeight ? data.originalWidth / data.originalHeight : _naturalRatio;
        const nextWidth = _aspectLocked && ratio ? Math.round(originalHeight * ratio) : img.offsetWidth;
        setImageSize(nextWidth, originalHeight);
    }

    function resetImageSize() {
        const img = getImg();
        if (!img) return;
        const data = ensureOriginalDimensions(img);
        setImageSize(data?.originalWidth || null, data?.originalHeight || null);
    }

    function getLayout() {
        return _activeWrapper?.dataset.layout || 'inline';
    }

    function layerToLayout(layer) {
        if (layer === 'background') return 'behind';
        if (layer === 'foreground') return 'front';
        return 'floating';
    }

    function layoutToLayer(layout) {
        if (layout === 'behind') return 'background';
        if (layout === 'front') return 'foreground';
        return 'normal';
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
                <label class="toolbar-label">Grootte</label>
                <div class="toolbar-buttons" style="gap:6px;align-items:center">
                    <div style="display:flex;align-items:center;gap:4px">
                        <span style="font-size:11px;color:var(--text-secondary)">B</span>
                        <input type="number" id="imgWidthInput" class="ctx-text-input img-dim-input"
                               min="10" max="2000" step="1" placeholder="–" title="Breedte in px">
                        <span style="font-size:11px;color:var(--text-secondary)">px</span>
                    </div>

                    <button id="imgAspectLockBtn" class="btn-toolbar ctx-btn ctx-btn-active img-aspect-btn" title="Beeldverhouding vergrendelen">
                        <svg id="imgLockIcon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                        </svg>
                    </button>

                    <div style="display:flex;align-items:center;gap:4px">
                        <span style="font-size:11px;color:var(--text-secondary)">H</span>
                        <input type="number" id="imgHeightInput" class="ctx-text-input img-dim-input"
                               min="10" max="2000" step="1" placeholder="–" title="Hoogte in px">
                        <span style="font-size:11px;color:var(--text-secondary)">px</span>
                    </div>

                    <button id="imgResetSizeBtn" class="btn-toolbar ctx-btn" title="Herstel naar oorspronkelijke grootte">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="1 4 1 10 7 10"/>
                            <path d="M3.51 15a9 9 0 1 0 .49-4.95"/>
                        </svg>
                        <span>Origineel</span>
                    </button>
                    <button id="imgResetWidthBtn" class="btn-toolbar ctx-btn" title="Herstel breedte (Alt+W)">
                        <span>Reset B</span>
                    </button>
                    <button id="imgResetHeightBtn" class="btn-toolbar ctx-btn" title="Herstel hoogte (Alt+H)">
                        <span>Reset H</span>
                    </button>
                </div>
            </div>

            <div class="toolbar-separator animate-item"></div>

            <!-- Tekstterugloop -->
            <div class="toolbar-group animate-item ctx-group">
                <label class="toolbar-label">Tekstterugloop</label>
                <div class="toolbar-buttons img-layout-buttons">
                    <button class="btn-toolbar ctx-btn img-layout-btn" data-img-layout="inline" title="In tekstregel">
                        <span>In tekst</span>
                    </button>
                    <button class="btn-toolbar ctx-btn img-layout-btn" data-img-layout="square" data-img-align="left" title="Tekst rondom, links">
                        <span>Rondom L</span>
                    </button>
                    <button class="btn-toolbar ctx-btn img-layout-btn" data-img-layout="square" data-img-align="right" title="Tekst rondom, rechts">
                        <span>Rondom R</span>
                    </button>
                    <button class="btn-toolbar ctx-btn img-layout-btn" data-img-layout="top-bottom" title="Boven en onder tekst">
                        <span>Boven/onder</span>
                    </button>
                    <button class="btn-toolbar ctx-btn img-layout-btn" data-img-layout="floating" title="Zwevend">
                        <span>Zwevend</span>
                    </button>
                    <button class="btn-toolbar ctx-btn img-layout-btn" data-img-layout="front" title="Voor tekst">
                        <span>Voor tekst</span>
                    </button>
                    <button class="btn-toolbar ctx-btn img-layout-btn" data-img-layout="behind" title="Achter tekst">
                        <span>Achter tekst</span>
                    </button>
                </div>
            </div>

            <div class="toolbar-separator animate-item"></div>
            <div class="toolbar-group animate-item ctx-group">
                <label class="toolbar-label">Laag</label>
                <div class="toolbar-buttons">
                    <button class="btn-toolbar ctx-btn img-layer-btn" data-img-layer="background" title="Plaats achter tekst en objecten">
                        <span>Achtergrond</span>
                    </button>
                    <button class="btn-toolbar ctx-btn img-layer-btn" data-img-layer="normal" title="Normale laag">
                        <span>Normaal</span>
                    </button>
                    <button class="btn-toolbar ctx-btn img-layer-btn" data-img-layer="foreground" title="Plaats voor tekst en objecten">
                        <span>Voorgrond</span>
                    </button>
                </div>
            </div>

            <div class="toolbar-separator animate-item"></div>

            <!-- Verwijderen -->
            <div class="toolbar-group animate-item ctx-group">
                <label class="toolbar-label ctx-label-danger">Verwijderen</label>
                <div class="toolbar-buttons">
                    <button class="btn-toolbar ctx-btn ctx-btn-danger" id="imgDeleteBtn">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                            <path d="M10 11v6M14 11v6"/>
                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                        </svg>
                        <span>Verwijder afbeelding</span>
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

        const widthInput = panel.querySelector('#imgWidthInput');
        const heightInput = panel.querySelector('#imgHeightInput');

        widthInput.addEventListener('change', () => {
            const img = getImg();
            if (!img) return;
            const w = Math.max(10, parseInt(widthInput.value) || img.offsetWidth);
            if (_aspectLocked && _naturalRatio) {
                const h = Math.round(w / _naturalRatio);
                img.style.width = w + 'px';
                img.style.height = h + 'px';
                heightInput.value = h;
            } else {
                img.style.width = w + 'px';
            }
            widthInput.value = w;
            persistImageSize(img);
            notifyChange();
        });

        heightInput.addEventListener('change', () => {
            const img = getImg();
            if (!img) return;
            const h = Math.max(10, parseInt(heightInput.value) || img.offsetHeight);
            if (_aspectLocked && _naturalRatio) {
                const w = Math.round(h * _naturalRatio);
                img.style.width = w + 'px';
                img.style.height = h + 'px';
                widthInput.value = w;
            } else {
                img.style.height = h + 'px';
            }
            heightInput.value = h;
            persistImageSize(img);
            notifyChange();
        });

        // Aspect lock toggle
        panel.querySelector('#imgAspectLockBtn').addEventListener('click', () => {
            _aspectLocked = !_aspectLocked;
            _updateLockIcon();
        });

        panel.querySelectorAll('.img-layout-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!_activeWrapper || !window.imageManager) return;
                const layout = btn.dataset.imgLayout || 'inline';
                const align = btn.dataset.imgAlign || _activeWrapper.dataset.align || 'left';
                window.imageManager.selectImage(_activeWrapper.dataset.imageId);
                window.imageManager.setImageLayout(layout, {
                    align,
                    imageId: _activeWrapper.dataset.imageId
                });
                syncPanel(_activeWrapper);
                syncLayoutButtons(_activeWrapper);
            });
        });

        panel.querySelectorAll('.img-layer-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!_activeWrapper || !window.imageManager) return;
                const layout = layerToLayout(btn.dataset.imgLayer);
                window.imageManager.selectImage(_activeWrapper.dataset.imageId);
                window.imageManager.setImageLayout(layout, {
                    align: _activeWrapper.dataset.align || 'left',
                    imageId: _activeWrapper.dataset.imageId
                });
                syncPanel(_activeWrapper);
            });
        });

        // Reset to natural size
        panel.querySelector('#imgResetSizeBtn').addEventListener('click', () => {
            resetImageSize();
        });

        panel.querySelector('#imgResetWidthBtn').addEventListener('click', () => {
            resetImageWidth();
        });

        panel.querySelector('#imgResetHeightBtn').addEventListener('click', () => {
            resetImageHeight();
        });

        // Delete
        panel.querySelector('#imgDeleteBtn').addEventListener('click', () => {
            if (!_activeWrapper) return;
            const wrapper = _activeWrapper;
            hide();
            wrapper.remove();
            notifyChange();
        });
    }

    function _updateLockIcon() {
        const btn = document.getElementById('imgAspectLockBtn');
        const icon = document.getElementById('imgLockIcon');
        if (!btn || !icon) return;

        btn.classList.toggle('ctx-btn-active', _aspectLocked);

        icon.innerHTML = _aspectLocked
            ? `<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
               <path d="M7 11V7a5 5 0 0 1 10 0v4"/>`
            : `<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
               <path d="M7 11V7a5 5 0 0 1 9.9-1"/>`;
    }

    // ── Sync panel values from active image ───────────────────────────────

    function syncPanel(wrapper) {
        if (!wrapper) return;
        const img = wrapper.querySelector('img');
        if (!img) return;

        requestAnimationFrame(() => {
            const w = img.offsetWidth || img.naturalWidth || '';
            const h = img.offsetHeight || img.naturalHeight || '';

            const widthInput = document.getElementById('imgWidthInput');
            const heightInput = document.getElementById('imgHeightInput');

            if (widthInput) widthInput.value = w ? Math.round(w) : '';
            if (heightInput) heightInput.value = h ? Math.round(h) : '';
            syncLayoutButtons(wrapper);
            syncLayerButtons(wrapper);

            const data = ensureOriginalDimensions(img);
            if (data?.originalWidth && data?.originalHeight) {
                _naturalRatio = data.originalWidth / data.originalHeight;
            } else if (img.naturalWidth && img.naturalHeight) {
                _naturalRatio = img.naturalWidth / img.naturalHeight;
            } else if (w && h) {
                _naturalRatio = w / h;
            }

            _updateLockIcon();
        });
    }

    function syncLayoutButtons(wrapper) {
        const layout = getLayout();
        const align = wrapper?.dataset.align || 'left';
        document.querySelectorAll('.img-layout-btn').forEach(btn => {
            const btnLayout = btn.dataset.imgLayout || 'inline';
            const btnAlign = btn.dataset.imgAlign || '';
            const active = btnLayout === layout && (layout !== 'square' || btnAlign === align);
            btn.classList.toggle('ctx-btn-active', active);
        });
    }

    function syncLayerButtons(wrapper) {
        const layer = layoutToLayer(wrapper?.dataset.layout || getLayout());
        document.querySelectorAll('.img-layer-btn').forEach(btn => {
            btn.classList.toggle('ctx-btn-active', btn.dataset.imgLayer === layer);
        });
    }

    // ── Show / Hide ───────────────────────────────────────────────────────

    function show(wrapper) {
        _activeWrapper = wrapper;
        window.ElementProtection?.showContext('image');
        syncPanel(wrapper);
    }

    function hide() {
        _activeWrapper = null;
        window.ElementProtection?.hideContext(true);
    }

    // ── Hook into ImageManager ────────────────────────────────────────────

    function patchImageManager() {
        if (!window.imageManager) {
            setTimeout(patchImageManager, 100);
            return;
        }

        const mgr = window.imageManager;
        const origSelect = mgr.selectImage.bind(mgr);
        const origDeselect = mgr.deselectImage.bind(mgr);

        mgr.selectImage = function (imageId) {
            origSelect(imageId);
            const wrapper = document.querySelector(`[data-image-id="${imageId}"]`);
            if (wrapper) show(wrapper);
        };

        mgr.deselectImage = function () {
            origDeselect();
            if (window.ElementProtection?.getContext() === 'image') {
                hide();
            }
        };

        // ── Keep context tab alive during toolbar interactions ─────────────
        // images.js has a bubble-phase document click listener that calls
        // deselectImage() for any click outside .editable-image-wrapper.
        // We register a CAPTURE-phase listener that runs first: if the click
        // is inside the topbar/toolbar we stop it from bubbling to that listener.
        // The click still reaches the actual target element (button/input)
        // because stopImmediatePropagation only blocks further *document* listeners.
        document.addEventListener('click', e => {
            if (window.ElementProtection?.getContext() !== 'image') return;
            // Only intercept clicks on the toolbar PANEL (controls) and context tab buttons —
            // NOT on the main section tab buttons (.topbar-section), so switching tabs still works.
            const inTopbar = e.target.closest('.topbar');
            const inPanel = e.target.closest('.section-toolbar');
            const inCtxTab = e.target.closest('#contextTabsContainer');
            if (inTopbar || inPanel || inCtxTab) {
                window.ElementProtection?.cancelHide();
            }
        }, true); // capture phase — runs before images.js bubble-phase listener

        // Hide when clicking inside editor but outside any image wrapper
        const editor = document.getElementById('editor');
        if (editor) {
            editor.addEventListener('click', e => {
                if (window.ElementProtection?.getContext() !== 'image') return;
                if (!e.target.closest('.editable-image-wrapper')) {
                    mgr.deselectImage();
                }
            });
        }
    }

    function bindShortcuts() {
        document.addEventListener('keydown', e => {
            if (window.ElementProtection?.getContext() !== 'image') return;
            if (!_activeWrapper) return;
            if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;

            const key = e.key.toLowerCase();
            if (key === 'w') {
                e.preventDefault();
                resetImageWidth();
            } else if (key === 'h') {
                e.preventDefault();
                resetImageHeight();
            }
        });
    }

    // ── Init ──────────────────────────────────────────────────────────────

    function init() {
        window.ElementProtection?.registerTab(TAB_ID, TAB_LABEL);
        buildPanel();
        patchImageManager();
        bindShortcuts();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else setTimeout(init, 0);

})();
