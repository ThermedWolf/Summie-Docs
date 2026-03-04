// ==================== STYLE MANAGER ====================
// Manages built-in and custom paragraph styles.
// Persists custom styles to localStorage under 'summie_custom_styles'.

// ── Built-in defaults ────────────────────────────────────────────────────────
const BUILTIN_STYLES = {
    normal: { label: 'Normaal', fontSize: '', fontWeight: '', fontStyle: '', textDecoration: '', color: '', marginTop: '', marginBottom: '', lineHeight: '', onEnterReset: false, onEnterTo: 'normal' },
    title: { label: 'Titel', fontSize: '24pt', fontWeight: 'bold', fontStyle: '', textDecoration: '', color: '', marginTop: '24px', marginBottom: '16px', lineHeight: '1.3', onEnterReset: true, onEnterTo: 'normal' },
    subtitle: { label: 'Subtitel', fontSize: '18pt', fontWeight: '', fontStyle: '', textDecoration: '', color: '#64748b', marginTop: '16px', marginBottom: '12px', lineHeight: '1.4', onEnterReset: true, onEnterTo: 'normal' },
    kop1: { label: 'Kop 1', fontSize: '16pt', fontWeight: '600', fontStyle: '', textDecoration: '', color: '', marginTop: '16px', marginBottom: '10px', lineHeight: '', onEnterReset: true, onEnterTo: 'normal' },
    kop2: { label: 'Kop 2', fontSize: '14pt', fontWeight: '600', fontStyle: '', textDecoration: '', color: '', marginTop: '12px', marginBottom: '8px', lineHeight: '', onEnterReset: true, onEnterTo: 'normal' },
    kop3: { label: 'Kop 3', fontSize: '13pt', fontWeight: '500', fontStyle: '', textDecoration: '', color: '', marginTop: '10px', marginBottom: '6px', lineHeight: '', onEnterReset: true, onEnterTo: 'normal' },
};

const MANAGED_PROPS = ['fontSize', 'fontWeight', 'fontStyle', 'textDecoration', 'color', 'marginTop', 'marginBottom', 'lineHeight'];

// ── State ────────────────────────────────────────────────────────────────────
let _customStyles = {};   // key → style object (same shape as BUILTIN_STYLES)
let _editingKey = null; // key being edited in modal (null = new)

// Custom styles are stored per-document; no localStorage usage.
// Call loadCustomStyles(obj) when opening a document, getCustomStyles() when saving.

function _saveCustomStyles() {
    // no-op: styles are saved as part of the document file
}

// ── Public API ────────────────────────────────────────────────────────────────
function getAllStyles() {
    return { ...BUILTIN_STYLES, ..._customStyles };
}

function getStyleDef(key) {
    return _customStyles[key] || BUILTIN_STYLES[key] || BUILTIN_STYLES.normal;
}

// Apply a style to a DOM block element
function applyStyleToBlock(block, styleKey) {
    const def = getStyleDef(styleKey);
    // Remove all style-* classes first
    [...block.classList].filter(c => c.startsWith('style-')).forEach(c => block.classList.remove(c));
    // Add the class for this style (needed by inhoud tab to find headings)
    if (styleKey !== 'normal') block.classList.add('style-' + styleKey);
    // Apply inline CSS
    MANAGED_PROPS.forEach(prop => { block.style[prop] = def[prop] || ''; });
    if (styleKey === 'normal') block.removeAttribute('data-style');
    else block.dataset.style = styleKey;
}

// Re-apply a style to all blocks in the editor that use it (called after editing a style)
function reapplyStyleToAllBlocks(styleKey) {
    const editor = document.getElementById('editor');
    if (!editor) return;
    // Find blocks by data-style attribute OR legacy class (for backward compat)
    const blocks = editor.querySelectorAll(`[data-style="${styleKey}"], .style-${styleKey}`);
    blocks.forEach(block => applyStyleToBlock(block, styleKey));
}

// Clear all managed style from a block (used on Enter)
function clearStyleFromBlock(block) {
    if (!block) return;
    [...block.classList].filter(c => c.startsWith('style-')).forEach(c => block.classList.remove(c));
    MANAGED_PROPS.forEach(prop => { block.style[prop] = ''; });
    block.removeAttribute('data-style');
}

// Detect the active style key for a block
function detectStyleOfBlock(block) {
    if (!block) return 'normal';
    if (block.dataset.style) return block.dataset.style;
    // Legacy class fallback (also covers new style-* classes)
    const styleClass = [...block.classList].find(c => c.startsWith('style-'));
    if (styleClass) return styleClass.replace('style-', '');
    return 'normal';
}

// Walk up to find nearest block-level ancestor within #editor
function getBlockElement(node) {
    const editor = document.getElementById('editor');
    const blockTags = ['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE'];
    let el = node.nodeType === 3 ? node.parentElement : node;
    while (el && el !== editor) {
        if (blockTags.includes(el.tagName)) return el;
        el = el.parentElement;
    }
    if (el === editor) {
        let direct = node.nodeType === 3 ? node : node;
        while (direct.parentElement && direct.parentElement !== editor) direct = direct.parentElement;
        if (direct.parentElement === editor) {
            const p = document.createElement('p');
            editor.insertBefore(p, direct);
            p.appendChild(direct);
            return p;
        }
    }
    return null;
}

// ── Dropdown rendering ────────────────────────────────────────────────────────
function renderStyleDropdown() {
    const menu = document.getElementById('styleDropdownMenu');
    if (!menu) return;
    const all = getAllStyles();
    const activeKey = _getActiveStyleKey();

    menu.innerHTML = `
        <div class="sdm-list" id="sdmList"></div>
        <div class="sdm-footer">
            <button class="sdm-add-btn" id="sdmAddBtn">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Nieuwe stijl
            </button>
        </div>
    `;

    const list = menu.querySelector('#sdmList');
    Object.entries(all).forEach(([key, def]) => {
        const item = document.createElement('div');
        item.className = 'sdm-item' + (key === activeKey ? ' active' : '');
        item.dataset.style = key;

        const previewStyle = _defToInlinePreview(def);
        const isBuiltin = !!BUILTIN_STYLES[key];

        item.innerHTML = `
            <div class="sdm-preview" style="${previewStyle}">${def.label}</div>
            <div class="sdm-actions">
                <button class="sdm-edit-btn" data-key="${key}" title="Stijl bewerken">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                ${!isBuiltin ? `<button class="sdm-del-btn" data-key="${key}" title="Stijl verwijderen"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg></button>` : ''}
            </div>
        `;
        list.appendChild(item);
    });

    // Add style click
    list.addEventListener('click', e => {
        const item = e.target.closest('.sdm-item');
        const editBtn = e.target.closest('.sdm-edit-btn');
        const delBtn = e.target.closest('.sdm-del-btn');

        if (delBtn) { e.stopPropagation(); _deleteStyle(delBtn.dataset.key); return; }
        if (editBtn) { e.stopPropagation(); openStyleModal(editBtn.dataset.key); return; }
        if (item) {
            const style = item.dataset.style;
            if (window.topbarManager) {
                window.topbarManager.saveCurrentRange();
                window.topbarManager.applyStyle(style);
            }
            menu.classList.remove('active');
            document.getElementById('styleDropdownToggle')?.classList.remove('active');
        }
    });

    menu.querySelector('#sdmAddBtn').addEventListener('click', e => {
        e.stopPropagation();
        openStyleModal(null);
    });
}

function _defToInlinePreview(def) {
    const parts = [];
    if (def.fontSize) parts.push(`font-size:${_ptToPreviewPx(def.fontSize)}`);
    if (def.fontWeight) parts.push(`font-weight:${def.fontWeight}`);
    if (def.fontStyle) parts.push(`font-style:${def.fontStyle}`);
    if (def.textDecoration) parts.push(`text-decoration:${def.textDecoration}`);
    if (def.color) parts.push(`color:${def.color}`);
    return parts.join(';');
}

// Scale pt sizes down so they look good in the compact dropdown
function _ptToPreviewPx(val) {
    if (!val || !val.endsWith('pt')) return val;
    const pt = parseFloat(val);
    // Map 13pt→13px, 24pt→18px — cap at 18px for dropdown readability
    const px = Math.min(18, Math.round(pt * 0.8));
    return px + 'px';
}

function _getActiveStyleKey() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return 'normal';
    const block = getBlockElement(sel.getRangeAt(0).startContainer);
    return detectStyleOfBlock(block);
}

// ── Topbar preview buttons ────────────────────────────────────────────────────
function renderPreviewButtons(activeKey) {
    const container = document.getElementById('stylePreviewButtons');
    if (!container) return;

    const all = getAllStyles();
    const keys = Object.keys(all);
    const idx = keys.indexOf(activeKey);

    // Show a window of 3 styles centred on the active one
    let start = Math.max(0, idx - 1);
    if (start + 3 > keys.length) start = Math.max(0, keys.length - 3);
    const visible = keys.slice(start, start + 3);

    const oldBtns = Array.from(container.querySelectorAll('.style-preview-btn'));
    const oldKeys = oldBtns.map(b => b.dataset.style);
    const sameSet = visible.length === oldKeys.length && visible.every((k, i) => k === oldKeys[i]);

    if (sameSet) {
        // Update active class AND re-apply button styles in case properties changed
        oldBtns.forEach(b => {
            b.classList.toggle('active', b.dataset.style === activeKey);
            const def = all[b.dataset.style];
            if (def) {
                b.style.cssText = _defToPreviewBtnStyle(def);
                b.textContent = def.label;
                b.title = def.label;
            }
        });
        return;
    }

    // Determine slide direction
    const oldActive = oldKeys.indexOf(activeKey) >= 0 ? activeKey : (oldKeys[0] || '');
    const oldIdx = keys.indexOf(oldActive);
    const slideDir = idx > oldIdx ? 'left' : 'right';

    // Slide out old
    container.classList.add('sliding-' + slideDir);

    setTimeout(() => {
        container.innerHTML = '';
        visible.forEach(key => {
            const def = all[key];
            const btn = document.createElement('button');
            btn.className = 'style-preview-btn' + (key === activeKey ? ' active' : '');
            btn.dataset.style = key;
            btn.title = def.label;
            btn.style.cssText = _defToPreviewBtnStyle(def);
            btn.textContent = def.label;
            btn.addEventListener('mousedown', e => { e.preventDefault(); window.topbarManager?.saveCurrentRange(); });
            btn.addEventListener('click', () => {
                window.topbarManager?.applyStyle(key);
            });
            container.appendChild(btn);
        });
        container.classList.remove('sliding-left', 'sliding-right');
        container.classList.add('sliding-in-' + slideDir);
        setTimeout(() => container.classList.remove('sliding-in-left', 'sliding-in-right'), 300);
    }, 200);
}

function _defToPreviewBtnStyle(def) {
    const parts = [];
    if (def.fontWeight) parts.push(`font-weight:${def.fontWeight}`);
    if (def.fontStyle) parts.push(`font-style:${def.fontStyle}`);
    if (def.textDecoration) parts.push(`text-decoration:${def.textDecoration}`);
    // Don't apply font-size or color to the button itself — keep them readable
    return parts.join(';');
}

// ── Style modal ───────────────────────────────────────────────────────────────
function openStyleModal(keyOrNull) {
    _editingKey = keyOrNull;
    const isNew = keyOrNull === null;
    const def = isNew ? { label: '', fontSize: '13pt', fontWeight: '', fontStyle: '', textDecoration: '', color: '', marginTop: '', marginBottom: '', lineHeight: '', onEnterReset: true, onEnterTo: 'normal' }
        : { ...getStyleDef(keyOrNull) };

    const modal = document.getElementById('styleEditorModal');
    if (!modal) return;

    // Title
    modal.querySelector('#semTitle').textContent = isNew ? 'Nieuwe stijl' : `Stijl bewerken: ${def.label}`;

    // Name field
    const nameInput = modal.querySelector('#semName');
    nameInput.value = def.label || '';
    nameInput.disabled = !isNew && !!BUILTIN_STYLES[keyOrNull];
    if (!isNew && BUILTIN_STYLES[keyOrNull]) {
        nameInput.title = 'Ingebouwde stijlen kunnen niet hernoemd worden';
    } else {
        nameInput.title = '';
    }

    // Font size
    modal.querySelector('#semFontSize').value = def.fontSize ? parseFloat(def.fontSize) : '';

    // Font weight
    modal.querySelector('#semBold').checked = def.fontWeight === 'bold' || parseInt(def.fontWeight) >= 600;

    // Font style
    modal.querySelector('#semItalic').checked = def.fontStyle === 'italic';

    // Text decoration
    modal.querySelector('#semUnderline').checked = def.textDecoration === 'underline';

    // Color
    modal.querySelector('#semColor').value = def.color || '#0f172a';
    modal.querySelector('#semColorNone').checked = !def.color;
    modal.querySelector('#semColorCustom').checked = !!def.color;
    modal.querySelector('#semColor').disabled = !def.color;

    // Margin top/bottom
    modal.querySelector('#semMarginTop').value = def.marginTop ? parseFloat(def.marginTop) : '';
    modal.querySelector('#semMarginBottom').value = def.marginBottom ? parseFloat(def.marginBottom) : '';

    // Line height
    modal.querySelector('#semLineHeight').value = def.lineHeight || '';

    // Enter reset toggle
    modal.querySelector('#semEnterReset').checked = def.onEnterReset !== false;
    modal.querySelector('#semEnterToGroup').style.display = def.onEnterReset !== false ? 'flex' : 'none';

    // Enter reset target
    _populateEnterToSelect(modal.querySelector('#semEnterTo'), def.onEnterTo || 'normal', isNew ? null : keyOrNull);
    modal.querySelector('#semEnterTo').value = def.onEnterTo || 'normal';

    // Update live preview
    _updateModalPreview(modal, def);

    // Show modal
    modal.classList.add('active');
    nameInput.focus();
}

function _populateEnterToSelect(sel, currentVal, excludeKey) {
    sel.innerHTML = '';
    Object.entries(getAllStyles()).forEach(([k, d]) => {
        if (k === excludeKey) return; // Can't reset to itself
        const opt = document.createElement('option');
        opt.value = k;
        opt.textContent = d.label;
        if (k === currentVal) opt.selected = true;
        sel.appendChild(opt);
    });
}

function _updateModalPreview(modal, def) {
    const prev = modal.querySelector('#semPreview');
    if (!prev) return;
    const style = [];
    if (def.fontSize) style.push(`font-size:${def.fontSize}`);
    if (def.fontWeight) style.push(`font-weight:${def.fontWeight}`);
    if (def.fontStyle) style.push(`font-style:${def.fontStyle}`);
    if (def.textDecoration) style.push(`text-decoration:${def.textDecoration}`);
    if (def.color) style.push(`color:${def.color}`);
    prev.style.cssText = style.join(';');
    prev.textContent = def.label || 'Voorbeeld tekst';
}

function _readModalDef(modal) {
    const fontSize = modal.querySelector('#semFontSize').value;
    const bold = modal.querySelector('#semBold').checked;
    const italic = modal.querySelector('#semItalic').checked;
    const underline = modal.querySelector('#semUnderline').checked;
    const colorNone = modal.querySelector('#semColorNone').checked;
    const color = colorNone ? '' : modal.querySelector('#semColor').value;
    const mTop = modal.querySelector('#semMarginTop').value;
    const mBot = modal.querySelector('#semMarginBottom').value;
    const lh = modal.querySelector('#semLineHeight').value;
    const reset = modal.querySelector('#semEnterReset').checked;
    const resetTo = modal.querySelector('#semEnterTo').value;
    return {
        label: modal.querySelector('#semName').value.trim() || 'Naamloos',
        fontSize: fontSize ? fontSize + 'pt' : '',
        fontWeight: bold ? 'bold' : '',
        fontStyle: italic ? 'italic' : '',
        textDecoration: underline ? 'underline' : '',
        color,
        marginTop: mTop ? mTop + 'px' : '',
        marginBottom: mBot ? mBot + 'px' : '',
        lineHeight: lh,
        onEnterReset: reset,
        onEnterTo: resetTo,
    };
}

function _deleteStyle(key) {
    if (BUILTIN_STYLES[key]) return; // Can't delete built-ins
    delete _customStyles[key];
    _saveCustomStyles();
    renderStyleDropdown();
    renderPreviewButtons(_getActiveStyleKey());
}

function initStyleModal() {
    const modal = document.getElementById('styleEditorModal');
    if (!modal) return;

    // Live preview as user types
    const liveUpdate = () => {
        const def = _readModalDef(modal);
        _updateModalPreview(modal, def);
    };
    modal.querySelectorAll('input, select').forEach(el => {
        el.addEventListener('input', liveUpdate);
        el.addEventListener('change', liveUpdate);
    });

    // Color radio toggles color picker
    modal.querySelector('#semColorNone').addEventListener('change', () => {
        modal.querySelector('#semColor').disabled = true;
        liveUpdate();
    });
    modal.querySelector('#semColorCustom').addEventListener('change', () => {
        modal.querySelector('#semColor').disabled = false;
        liveUpdate();
    });

    // Enter reset toggle shows/hides the "reset to" group
    modal.querySelector('#semEnterReset').addEventListener('change', e => {
        modal.querySelector('#semEnterToGroup').style.display = e.target.checked ? 'flex' : 'none';
    });

    // Save
    modal.querySelector('#semSaveBtn').addEventListener('click', () => {
        const def = _readModalDef(modal);
        if (!def.label) { modal.querySelector('#semName').focus(); return; }

        let affectedKey;
        if (_editingKey === null) {
            // New style — generate a unique key from the label
            let key = def.label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
            if (!key) key = 'stijl';
            let finalKey = key, i = 2;
            while (getAllStyles()[finalKey]) { finalKey = key + '-' + i++; }
            _customStyles[finalKey] = def;
            affectedKey = finalKey;
        } else {
            if (BUILTIN_STYLES[_editingKey]) {
                // Editing a built-in — store overrides in custom
                _customStyles[_editingKey] = { ...BUILTIN_STYLES[_editingKey], ...def };
            } else {
                _customStyles[_editingKey] = def;
            }
            affectedKey = _editingKey;
        }

        modal.classList.remove('active');
        reapplyStyleToAllBlocks(affectedKey);
        if (window.updateInhoudList) window.updateInhoudList();
        renderStyleDropdown();
        renderPreviewButtons(_getActiveStyleKey());
    });

    // Cancel / backdrop close
    modal.querySelector('#semCancelBtn').addEventListener('click', () => modal.classList.remove('active'));
    modal.querySelector('#semCancelBtn2').addEventListener('click', () => modal.classList.remove('active'));
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('active'); });
}

// ── Init ──────────────────────────────────────────────────────────────────────
function initStyles() {
    // Migrate: remove old global custom styles from localStorage (now per-document)
    localStorage.removeItem('summie_custom_styles');
    // Custom styles start empty; they are loaded per-document via loadCustomStyles()
    renderStyleDropdown();
    renderPreviewButtons('normal');
    initStyleModal();
}

// Load custom styles from a saved document object and re-apply them to all blocks in the editor
function loadCustomStyles(stylesObj) {
    _customStyles = stylesObj && typeof stylesObj === 'object' ? { ...stylesObj } : {};
    // Re-apply every overridden style so the DOM reflects the loaded definitions
    Object.keys(_customStyles).forEach(key => reapplyStyleToAllBlocks(key));
    renderStyleDropdown();
    renderPreviewButtons(_getActiveStyleKey());
    if (window.updateInhoudList) window.updateInhoudList();
}

// Clear custom styles and reset all blocks that were using overridden built-ins back to defaults
function clearCustomStyles() {
    // Before clearing, reset any overridden built-in style blocks back to built-in defaults
    Object.keys(_customStyles).forEach(key => {
        if (BUILTIN_STYLES[key]) reapplyStyleToAllBlocks(key);
    });
    _customStyles = {};
    renderStyleDropdown();
    renderPreviewButtons('normal');
}

// Get custom styles for saving into a document
function getCustomStyles() {
    return { ..._customStyles };
}

// ── Expose ────────────────────────────────────────────────────────────────────
window.StyleManager = {
    getAllStyles, getStyleDef, applyStyleToBlock, clearStyleFromBlock,
    detectStyleOfBlock, getBlockElement, reapplyStyleToAllBlocks,
    renderStyleDropdown, renderPreviewButtons, openStyleModal,
    getActiveStyleKey: _getActiveStyleKey,
    loadCustomStyles, clearCustomStyles, getCustomStyles,
};
window.initStyles = initStyles;
window.openStyleModal = openStyleModal;