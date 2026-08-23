// ==================== SHAPES ====================
// Word-like floating SVG shapes: insert from gallery, select, move, resize, format.

(function () {
    'use strict';

    const CTX_ID = 'vorm-opmaak';
    const CTX_LABEL = SummieI18n.t('Vormindeling');
    const DEFAULT_FILL = '#5B9BD5';
    const DEFAULT_STROKE = '#2F5597';
    const LAYER_Z = {
        background: 1,
        normal: 12,
        foreground: 30
    };

    const SHAPES = {
        line: { label: SummieI18n.t('Lijn'), w: 150, h: 24, path: '<line x1="0" y1="50" x2="100" y2="50" data-line="true"/>' },
        arrow: { label: SummieI18n.t('Pijl'), w: 160, h: 34, path: '<path d="M0 50 H92"/><path d="M76 24 L100 50 L76 76"/>' },
        rect: { label: SummieI18n.t('Rechthoek'), w: 140, h: 90, path: '<rect x="1" y="1" width="98" height="98"/>' },
        roundRect: { label: SummieI18n.t('Afgeronde rechthoek'), w: 150, h: 90, path: '<rect x="1" y="1" width="98" height="98" rx="10" ry="10"/>' },
        circle: { label: SummieI18n.t('Cirkel'), w: 110, h: 110, path: '<circle cx="50" cy="50" r="49"/>' },
        ellipse: { label: SummieI18n.t('Ovaal'), w: 130, h: 90, path: '<ellipse cx="50" cy="50" rx="49" ry="49"/>' },
        triangle: { label: SummieI18n.t('Driehoek'), w: 120, h: 100, path: '<polygon points="50,0 100,100 0,100"/>' },
        diamond: { label: SummieI18n.t('Ruit'), w: 120, h: 100, path: '<polygon points="50,0 100,50 50,100 0,50"/>' },
    };

    let selectedShape = null;
    let pointerData = null;
    let repairTimer = null;
    const shapeCache = new Map();

    function editor() {
        return document.getElementById('editor');
    }

    function createId() {
        return 'shape_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }

    function renderShape(wrapper) {
        const type = wrapper.dataset.shapeType || 'rect';
        const def = SHAPES[type] || SHAPES.rect;
        const fill = wrapper.dataset.fill || DEFAULT_FILL;
        const stroke = wrapper.dataset.stroke || DEFAULT_STROKE;
        const strokeWidth = parseInt(wrapper.dataset.strokeWidth, 10) || 2;
        const isLine = type === 'line' || type === 'arrow';
        const svg = wrapper.querySelector('.summie-shape-svg');
        if (!svg) return;
        // fill/stroke come from data-* attributes in the document (attacker
        // controllable) — set them via the DOM API instead of string-building
        // innerHTML, which an attribute breakout could turn into SVG injection.
        // def.path is a static internal dictionary value and stays as-is.
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('fill', isLine ? 'none' : fill);
        g.setAttribute('stroke', stroke);
        g.setAttribute('stroke-width', String(isLine ? strokeWidth + 2 : strokeWidth));
        g.setAttribute('stroke-linecap', 'round');
        g.setAttribute('stroke-linejoin', 'round');
        svg.innerHTML = '';
        svg.appendChild(g);
        g.innerHTML = def.path;
    }

    function getShapeLayer(wrapper) {
        const layer = wrapper?.dataset.layer;
        if (layer === 'background' || layer === 'foreground' || layer === 'normal') return layer;
        const z = parseInt(wrapper?.style?.zIndex || '', 10);
        if (z <= LAYER_Z.background) return 'background';
        if (z >= LAYER_Z.foreground) return 'foreground';
        return 'normal';
    }

    function applyShapeLayer(wrapper, layer) {
        if (!wrapper) return;
        const nextLayer = layer === 'background' || layer === 'foreground' ? layer : 'normal';
        wrapper.dataset.layer = nextLayer;
        wrapper.style.zIndex = String(LAYER_Z[nextLayer]);
    }

    function makeShape(type) {
        const def = SHAPES[type] || SHAPES.rect;
        const wrapper = document.createElement('div');
        wrapper.className = 'summie-shape-wrapper';
        wrapper.dataset.shapeId = createId();
        wrapper.dataset.shapeType = type;
        wrapper.dataset.fill = DEFAULT_FILL;
        wrapper.dataset.stroke = DEFAULT_STROKE;
        wrapper.dataset.strokeWidth = '2';
        wrapper.dataset.layer = 'normal';
        wrapper.contentEditable = 'false';
        wrapper.style.width = def.w + 'px';
        wrapper.style.height = def.h + 'px';
        wrapper.style.position = 'absolute';
        wrapper.style.left = '90px';
        wrapper.style.top = '90px';
        applyShapeLayer(wrapper, 'normal');
        wrapper.innerHTML = `
            <svg class="summie-shape-svg" viewBox="0 0 100 100" preserveAspectRatio="none"></svg>
            ${['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map(pos => `<div class="shape-resize-handle ${pos}" data-handle="${pos}"></div>`).join('')}
        `;
        renderShape(wrapper);
        bindShape(wrapper);
        return wrapper;
    }

    function insertShape(type) {
        const ed = editor();
        if (!ed) return;
        const wrapper = makeShape(type);
        const rect = ed.getBoundingClientRect();
        wrapper.style.left = Math.max(24, Math.round((ed.clientWidth - parseFloat(wrapper.style.width)) / 2)) + 'px';
        wrapper.style.top = Math.max(24, Math.round(ed.scrollTop + Math.min(220, rect.height / 3))) + 'px';
        ed.appendChild(wrapper);
        cacheShape(wrapper);
        selectShape(wrapper);
        notifyChange();
    }

    function bindShape(wrapper) {
        if (wrapper._shapeBound) return;
        wrapper._shapeBound = true;
        wrapper.addEventListener('mousedown', e => {
            if (e.button !== 0) return;
            const wasSelected = wrapper.classList.contains('selected');
            selectShape(wrapper);
            if (!wasSelected) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            const handle = e.target.closest('.shape-resize-handle')?.dataset.handle;
            pointerData = {
                mode: handle ? 'resize' : 'move',
                handle,
                wrapper,
                startX: e.clientX,
                startY: e.clientY,
                left: parseFloat(wrapper.style.left) || 0,
                top: parseFloat(wrapper.style.top) || 0,
                width: wrapper.offsetWidth,
                height: wrapper.offsetHeight,
                ratio: wrapper.offsetWidth / Math.max(1, wrapper.offsetHeight)
            };
            wrapper.classList.add('dragging');
            e.preventDefault();
            e.stopPropagation();
        });
        wrapper.addEventListener('click', e => {
            e.stopPropagation();
            selectShape(wrapper);
        });
    }

    function ensureShapeDom(wrapper) {
        if (!wrapper.querySelector('.summie-shape-svg')) {
            wrapper.insertAdjacentHTML('afterbegin', '<svg class="summie-shape-svg" viewBox="0 0 100 100" preserveAspectRatio="none"></svg>');
        }

        const existingHandles = wrapper.querySelectorAll('.shape-resize-handle');
        if (existingHandles.length !== 8) {
            existingHandles.forEach(handle => handle.remove());
            wrapper.insertAdjacentHTML(
                'beforeend',
                ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
                    .map(pos => `<div class="shape-resize-handle ${pos}" data-handle="${pos}"></div>`)
                    .join('')
            );
        }

        if (!wrapper.dataset.shapeType) wrapper.dataset.shapeType = 'rect';
        if (!wrapper.dataset.shapeId) wrapper.dataset.shapeId = createId();
        if (!wrapper.dataset.fill) wrapper.dataset.fill = DEFAULT_FILL;
        if (!wrapper.dataset.stroke) wrapper.dataset.stroke = DEFAULT_STROKE;
        if (!wrapper.dataset.strokeWidth) wrapper.dataset.strokeWidth = '2';
        applyShapeLayer(wrapper, getShapeLayer(wrapper));
        if (!wrapper.style.position) wrapper.style.position = 'absolute';
        if (!wrapper.style.left) wrapper.style.left = '90px';
        if (!wrapper.style.top) wrapper.style.top = '90px';
    }

    function repairShapes() {
        const ed = editor();
        if (!ed) return;
        ed.querySelectorAll('.summie-shape-wrapper').forEach(wrapper => {
            ensureShapeDom(wrapper);
            renderShape(wrapper);
            wrapper._shapeRendered = true;
            bindShape(wrapper);
            cacheShape(wrapper);
        });
    }

    function scheduleRepairShapes() {
        clearTimeout(repairTimer);
        repairTimer = setTimeout(() => {
            repairShapes();
            restoreMissingShapes();
        }, 40);
    }

    function cacheShape(wrapper) {
        if (!wrapper || !wrapper.dataset.shapeId) return;
        const clone = wrapper.cloneNode(true);
        clone.classList.remove('selected', 'dragging');
        shapeCache.set(wrapper.dataset.shapeId, clone.outerHTML);
    }

    function cacheAllShapes() {
        const ed = editor();
        if (!ed) return;
        ed.querySelectorAll('.summie-shape-wrapper').forEach(wrapper => {
            ensureShapeDom(wrapper);
            cacheShape(wrapper);
        });
    }

    function restoreMissingShapes() {
        const ed = editor();
        if (!ed || shapeCache.size === 0) return;

        shapeCache.forEach((html, id) => {
            if (ed.querySelector(`.summie-shape-wrapper[data-shape-id="${id}"]`)) return;
            const template = document.createElement('template');
            template.innerHTML = html.trim();
            const restored = template.content.firstElementChild;
            if (!restored) return;
            ed.appendChild(restored);
            ensureShapeDom(restored);
            renderShape(restored);
            bindShape(restored);
        });
    }

    function selectShape(wrapper) {
        if (selectedShape && selectedShape !== wrapper) selectedShape.classList.remove('selected');
        selectedShape = wrapper;
        wrapper.classList.add('selected');
        window.ElementProtection?.showContext('shape');
        syncPanel();
    }

    function deselectShape() {
        if (selectedShape) selectedShape.classList.remove('selected');
        selectedShape = null;
        if (window.ElementProtection?.getContext() === 'shape') window.ElementProtection.hideContext(true);
    }

    function clampToEditor(wrapper, left, top) {
        const ed = editor();
        if (!ed) return { left, top };
        return {
            left: Math.max(0, Math.min(left, ed.clientWidth - wrapper.offsetWidth)),
            top: Math.max(0, Math.min(top, ed.scrollHeight - wrapper.offsetHeight))
        };
    }

    function onPointerMove(e) {
        if (!pointerData) return;
        const dx = e.clientX - pointerData.startX;
        const dy = e.clientY - pointerData.startY;
        const w = pointerData.wrapper;
        if (pointerData.mode === 'move') {
            const pos = clampToEditor(w, pointerData.left + dx, pointerData.top + dy);
            w.style.left = Math.round(pos.left) + 'px';
            w.style.top = Math.round(pos.top) + 'px';
            return;
        }

        let left = pointerData.left;
        let top = pointerData.top;
        let width = pointerData.width;
        let height = pointerData.height;
        if (pointerData.handle.includes('e')) width += dx;
        if (pointerData.handle.includes('s')) height += dy;
        if (pointerData.handle.includes('w')) { width -= dx; left += dx; }
        if (pointerData.handle.includes('n')) { height -= dy; top += dy; }
        width = Math.max(24, width);
        height = Math.max(18, height);

        if (e.shiftKey) {
            const ratio = pointerData.ratio || 1;
            const horizontal = pointerData.handle.includes('e') || pointerData.handle.includes('w');
            const vertical = pointerData.handle.includes('n') || pointerData.handle.includes('s');

            if (horizontal && !vertical) {
                height = width / ratio;
            } else if (vertical && !horizontal) {
                width = height * ratio;
            } else if (Math.abs(dx) >= Math.abs(dy)) {
                height = width / ratio;
            } else {
                width = height * ratio;
            }

            if (pointerData.handle.includes('w')) left = pointerData.left + pointerData.width - width;
            if (pointerData.handle.includes('n')) top = pointerData.top + pointerData.height - height;
        }

        w.style.left = Math.round(left) + 'px';
        w.style.top = Math.round(top) + 'px';
        w.style.width = Math.round(width) + 'px';
        w.style.height = Math.round(height) + 'px';
    }

    function buildPanel() {
        const toolbar = document.querySelector('.section-toolbar');
        if (!toolbar || document.getElementById('ctx-panel-' + CTX_ID)) return;
        const panel = document.createElement('div');
        panel.className = 'toolbar-content ctx-panel';
        panel.id = 'ctx-panel-' + CTX_ID;
        panel.dataset.content = CTX_ID;
        panel.style.display = 'none';
        panel.innerHTML = `
            <div class="toolbar-group animate-item ctx-group">
                <label class="toolbar-label">Vormstijl</label>
                <div class="toolbar-buttons shape-style-presets">
                    <button class="shape-style" data-fill="#5B9BD5" data-stroke="#2F5597" style="--fill:#5B9BD5;--stroke:#2F5597" title="Blauw"></button>
                    <button class="shape-style" data-fill="#70AD47" data-stroke="#548235" style="--fill:#70AD47;--stroke:#548235" title="Groen"></button>
                    <button class="shape-style" data-fill="#ED7D31" data-stroke="#C55A11" style="--fill:#ED7D31;--stroke:#C55A11" title="Oranje"></button>
                    <button class="shape-style" data-fill="#FFFFFF" data-stroke="#404040" style="--fill:#FFFFFF;--stroke:#404040" title="Wit"></button>
                </div>
            </div>
            <div class="toolbar-separator animate-item"></div>
            <div class="toolbar-group animate-item ctx-group">
                <label class="toolbar-label">Opvulling</label>
                <div class="toolbar-buttons"><input type="color" id="shapeFillInput" title="Opvulling"></div>
            </div>
            <div class="toolbar-group animate-item ctx-group">
                <label class="toolbar-label">Omtrek</label>
                <div class="toolbar-buttons" style="gap:6px;align-items:center">
                    <input type="color" id="shapeStrokeInput" title="Omtrek">
                    <input type="number" id="shapeStrokeWidthInput" class="ctx-text-input img-dim-input" min="0" max="20" step="1">
                </div>
            </div>
            <div class="toolbar-separator animate-item"></div>
            <div class="toolbar-group animate-item ctx-group">
                <label class="toolbar-label">Laag</label>
                <div class="toolbar-buttons">
                    <button class="btn-toolbar ctx-btn shape-layer-btn" data-shape-layer="background" title="Plaats achter tekst en objecten"><span>Achtergrond</span></button>
                    <button class="btn-toolbar ctx-btn shape-layer-btn" data-shape-layer="normal" title="Normale laag"><span>Normaal</span></button>
                    <button class="btn-toolbar ctx-btn shape-layer-btn" data-shape-layer="foreground" title="Plaats voor tekst en objecten"><span>Voorgrond</span></button>
                </div>
            </div>
            <div class="toolbar-separator animate-item"></div>
            <div class="toolbar-group animate-item ctx-group">
                <label class="toolbar-label ctx-label-danger">Verwijderen</label>
                <div class="toolbar-buttons"><button class="btn-toolbar ctx-btn ctx-btn-danger" id="shapeDeleteBtn"><span>Verwijder vorm</span></button></div>
            </div>
        `;
        toolbar.appendChild(panel);
        window.wrapToolbarContentForScroll?.(panel);
        panel.addEventListener('mousedown', e => { if (!e.target.matches('input, textarea')) e.preventDefault(); });
        panel.querySelectorAll('.shape-style').forEach(btn => btn.addEventListener('click', () => {
            if (!selectedShape) return;
            selectedShape.dataset.fill = btn.dataset.fill;
            selectedShape.dataset.stroke = btn.dataset.stroke;
            renderShape(selectedShape);
            syncPanel();
            notifyChange();
        }));
        panel.querySelector('#shapeFillInput').addEventListener('input', e => setShapeData('fill', e.target.value));
        panel.querySelector('#shapeStrokeInput').addEventListener('input', e => setShapeData('stroke', e.target.value));
        panel.querySelector('#shapeStrokeWidthInput').addEventListener('change', e => setShapeData('strokeWidth', Math.max(0, parseInt(e.target.value, 10) || 0)));
        panel.querySelectorAll('.shape-layer-btn').forEach(btn => btn.addEventListener('click', () => {
            if (!selectedShape) return;
            applyShapeLayer(selectedShape, btn.dataset.shapeLayer);
            syncPanel();
            notifyChange();
        }));
        panel.querySelector('#shapeDeleteBtn').addEventListener('click', () => {
            if (!selectedShape) return;
            const shape = selectedShape;
            if (shape.dataset.shapeId) shapeCache.delete(shape.dataset.shapeId);
            deselectShape();
            shape.remove();
            notifyChange();
        });
    }

    function setShapeData(key, value) {
        if (!selectedShape) return;
        selectedShape.dataset[key] = value;
        renderShape(selectedShape);
        notifyChange();
    }

    function syncPanel() {
        if (!selectedShape) return;
        const fill = document.getElementById('shapeFillInput');
        const stroke = document.getElementById('shapeStrokeInput');
        const strokeWidth = document.getElementById('shapeStrokeWidthInput');
        if (fill) fill.value = selectedShape.dataset.fill || DEFAULT_FILL;
        if (stroke) stroke.value = selectedShape.dataset.stroke || DEFAULT_STROKE;
        if (strokeWidth) strokeWidth.value = selectedShape.dataset.strokeWidth || '2';
        const layer = getShapeLayer(selectedShape);
        document.querySelectorAll('.shape-layer-btn').forEach(btn => {
            btn.classList.toggle('ctx-btn-active', btn.dataset.shapeLayer === layer);
        });
    }

    function setupGallery() {
        const btn = document.getElementById('shapeDropdownBtn');
        const menu = document.getElementById('shapeDropdownMenu');
        if (!btn || !menu) return;
        Object.keys(SHAPES).forEach(type => {
            const item = menu.querySelector(`[data-shape-type="${type}"]`);
            if (item) item.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none">${SHAPES[type].path}</svg>`;
        });
        document.body.appendChild(menu);
        menu.style.position = 'fixed';
        menu.style.zIndex = '9999';
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const open = menu.classList.contains('active');
            const rect = btn.getBoundingClientRect();
            menu.style.top = (rect.bottom + 4) + 'px';
            menu.style.left = rect.left + 'px';
            menu.classList.toggle('active', !open);
            btn.classList.toggle('active', !open);
        });
        menu.querySelectorAll('.shape-gallery-item').forEach(item => item.addEventListener('click', () => {
            insertShape(item.dataset.shapeType || 'rect');
            menu.classList.remove('active');
            btn.classList.remove('active');
        }));
        document.addEventListener('click', e => {
            if (!e.target.closest('#shapeDropdownBtn') && !e.target.closest('#shapeDropdownMenu')) {
                menu.classList.remove('active');
                btn.classList.remove('active');
            }
        });
    }

    function notifyChange() {
        cacheAllShapes();
        const ed = editor();
        if (ed) ed.dispatchEvent(new Event('input', { bubbles: true }));
        window.saveToLocalStorage?.();
    }

    function init() {
        window.ElementProtection?.registerTab(CTX_ID, CTX_LABEL);
        buildPanel();
        setupGallery();
        repairShapes();
        const ed = editor();
        if (ed) {
            new MutationObserver(scheduleRepairShapes).observe(ed, { childList: true, subtree: true });
            ed.addEventListener('keydown', cacheAllShapes, true);
            ed.addEventListener('beforeinput', cacheAllShapes, true);
            ed.addEventListener('input', () => setTimeout(restoreMissingShapes, 0));
        }
        document.addEventListener('mousemove', onPointerMove);
        document.addEventListener('mouseup', () => {
            if (pointerData) {
                pointerData.wrapper.classList.remove('dragging');
                notifyChange();
            }
            pointerData = null;
        });
        document.addEventListener('click', e => {
            const ed = editor();
            if (!ed || !ed.contains(e.target)) return;
            if (!e.target.closest('.summie-shape-wrapper')) deselectShape();
        });

        window.ShapeManager = {
            repairShapes,
            restoreMissingShapes,
            insertShape
        };
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else setTimeout(init, 0);
})();
