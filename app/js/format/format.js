// ==================== TEXT FORMATTING ====================
// formatText, createList, createChecklist, highlightText, removeHighlight,
// changeTextColor, applyStyle, updateStyleSelector, updateColorSelector.
// NOTE: style definitions, application and detection are delegated to StyleManager (styles.js)

function formatText(command) {
    if (window.topbarManager) window.topbarManager._suppressSelectionUpdate = true;
    document.execCommand(command, false, null);
    if (window.topbarManager && window.topbarManager.updateFormatButtonStates) {
        window.topbarManager.updateFormatButtonStates();
    }
    requestAnimationFrame(() => {
        if (window.topbarManager) window.topbarManager._suppressSelectionUpdate = false;
    });
}

function createList(type) {
    document.execCommand('insert' + (type === 'ul' ? 'UnorderedList' : 'OrderedList'), false, null);
    window.AppState.editor.focus();
}

function createChecklist() {
    const { editor } = window.AppState;
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    const ul = document.createElement('ul');
    ul.className = 'checklist';
    const li = document.createElement('li');
    li.textContent = 'Checklist item';
    ul.appendChild(li);
    range.insertNode(ul);
    range.setStartAfter(ul);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    editor.focus();
    window.saveToLocalStorage && window.saveToLocalStorage();
}

function highlightText() {
    const { editor } = window.AppState;
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const span = document.createElement('span');
        span.className = 'highlight';
        try { range.surroundContents(span); }
        catch (e) { const f = range.extractContents(); span.appendChild(f); range.insertNode(span); }
        selection.removeAllRanges();
    }
    editor.focus();
}

function removeHighlight(element) {
    const textNode = document.createTextNode(element.textContent);
    element.parentNode.replaceChild(textNode, element);
    window.saveToLocalStorage && window.saveToLocalStorage();
}

function changeTextColor(e) {
    const color = e.target.value;
    if (color) { document.execCommand('foreColor', false, color); e.target.value = ''; }
    window.AppState.editor.focus();
}

function applyStyle(styleOrEvent) {
    const style = typeof styleOrEvent === 'string' ? styleOrEvent : styleOrEvent.target.value;
    if (!style) return;
    const SM = window.StyleManager;
    if (!SM) return;

    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const blocksToStyle = new Set();

        if (range.collapsed) {
            const block = SM.getBlockElement(range.startContainer);
            if (block) blocksToStyle.add(block);
        } else {
            const startBlock = SM.getBlockElement(range.startContainer);
            const endBlock = SM.getBlockElement(range.endContainer);
            if (startBlock) blocksToStyle.add(startBlock);
            if (endBlock) blocksToStyle.add(endBlock);
            if (startBlock && endBlock && startBlock !== endBlock) {
                const editor = document.getElementById('editor');
                const all = Array.from(editor.querySelectorAll('p, div, li, h1, h2, h3, h4, h5, h6, blockquote'));
                let inside = false;
                for (const b of all) {
                    if (b === startBlock) inside = true;
                    if (inside) blocksToStyle.add(b);
                    if (b === endBlock) break;
                }
            }
        }

        blocksToStyle.forEach(block => SM.applyStyleToBlock(block, style));
        window.updateInhoudList && window.updateInhoudList();
        window.updateActiveInhoudItem && window.updateActiveInhoudItem();
    }

    if (typeof styleOrEvent !== 'string') styleOrEvent.target.value = '';
    window.saveToLocalStorage && window.saveToLocalStorage();
}

function updateStyleSelector() {
    // No-op: topbar calls StyleManager directly via updateStyleFromSelection
}

function updateColorSelector() {
    const selection = window.getSelection();
    const colorSelect = document.getElementById('textColorBtn');
    if (!colorSelect) return;
    if (!selection.rangeCount) { colorSelect.value = ''; return; }
    const range = selection.getRangeAt(0);
    let element = range.startContainer;
    if (element.nodeType === 3) element = element.parentElement;
    if (element.classList && element.classList.contains('begrip-word')) element = element.parentElement;
    const color = window.getComputedStyle(element).color;
    const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (rgbMatch) {
        const hex = '#' + [rgbMatch[1], rgbMatch[2], rgbMatch[3]].map(x => {
            const h = parseInt(x).toString(16);
            return h.length === 1 ? '0' + h : h;
        }).join('');
        const colorMap = { '#0f172a': '#0f172a', '#ef4444': '#ef4444', '#3b82f6': '#3b82f6', '#10b981': '#10b981', '#f59e0b': '#f59e0b', '#8b5cf6': '#8b5cf6' };
        colorSelect.value = colorMap[hex] || '';
    } else { colorSelect.value = ''; }
}

// Shims so old code that references these still works
window._getBlockElement = (node) => window.StyleManager?.getBlockElement(node);
window._clearStyleFromBlock = (block) => window.StyleManager?.clearStyleFromBlock(block);
window._applyStyleToBlock = (block, key) => window.StyleManager?.applyStyleToBlock(block, key);
window._detectStyleOfBlock = (block) => window.StyleManager?.detectStyleOfBlock(block);

window.formatText = formatText;
window.createList = createList;
window.createChecklist = createChecklist;
window.highlightText = highlightText;
window.removeHighlight = removeHighlight;
window.changeTextColor = changeTextColor;
window.applyStyle = applyStyle;
window.updateStyleSelector = updateStyleSelector;
window.updateColorSelector = updateColorSelector;