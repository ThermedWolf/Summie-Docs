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
    if (!selection || !selection.rangeCount) return;
    const range = selection.getRangeAt(0);

    // Helper: find the nearest block element for a node
    const getBlock = (node) => {
        if (!node) return null;
        if (node.nodeType === 3) node = node.parentElement;
        const tags = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'LI', 'PRE'];
        let el = node;
        while (el && el !== editor && !tags.includes(el.tagName)) el = el.parentElement;
        return (el && el !== editor) ? el : null;
    };

    // 1) If caret is inside an existing list, toggle/convert that list
    let containerLi = getBlock(range.startContainer);
    if (containerLi && containerLi.tagName === 'LI') {
        const parentList = containerLi.closest('ul, ol');
        if (parentList && parentList.classList.contains('checklist')) {
            // Already a checklist -> unwrap to normal paragraph(s) on this line
            // Collect which checklist items are selected (supports multi-select inside same list)
            let toUnwrap = [];
            if (range.collapsed) {
                toUnwrap = [containerLi];
            } else {
                const startBlock = getBlock(range.startContainer);
                const endBlock = getBlock(range.endContainer);
                if (startBlock && endBlock) {
                    if (startBlock === endBlock && startBlock.tagName === 'LI') {
                        toUnwrap = [startBlock];
                    } else {
                        const allBlocks = Array.from(editor.querySelectorAll('p, div, li, h1, h2, h3, h4, h5, h6, blockquote, pre'));
                        let inside = false;
                        for (const b of allBlocks) {
                            if (b === startBlock) inside = true;
                            if (inside && b.tagName === 'LI' && b.closest('ul.checklist, ol.checklist') === parentList) {
                                toUnwrap.push(b);
                            }
                            if (b === endBlock) break;
                        }
                        if (toUnwrap.length === 0) toUnwrap = [containerLi];
                    }
                } else {
                    toUnwrap = [containerLi];
                }
            }

            const selectedSet = new Set(toUnwrap);
            const originalLis = Array.from(parentList.children);
            const fragment = document.createDocumentFragment();
            let currentUl = null;
            let firstP = null;
            for (const li of originalLis) {
                if (selectedSet.has(li)) {
                    const p = document.createElement('p');
                    while (li.firstChild) p.appendChild(li.firstChild);
                    if (!p.textContent.trim() && !p.querySelector('br')) p.innerHTML = '<br>';
                    p.removeAttribute('data-style');
                    if (currentUl) { fragment.appendChild(currentUl); currentUl = null; }
                    fragment.appendChild(p);
                    if (!firstP) firstP = p;
                } else {
                    if (!currentUl) {
                        currentUl = document.createElement('ul');
                        currentUl.className = 'checklist';
                    }
                    currentUl.appendChild(li);
                }
            }
            if (currentUl) fragment.appendChild(currentUl);
            parentList.replaceWith(fragment);
            if (firstP) {
                const newRange = document.createRange();
                if (firstP.innerHTML === '<br>') { newRange.setStart(firstP, 0); newRange.collapse(true); }
                else { newRange.selectNodeContents(firstP); newRange.collapse(false); }
                selection.removeAllRanges();
                selection.addRange(newRange);
            }
            editor.focus();
            window.saveToLocalStorage && window.saveToLocalStorage();
            window.updateInhoudList && window.updateInhoudList();
            return;
        } else if (parentList) {
            // Plain bullet/numbered list -> convert the whole list to checklist
            parentList.classList.add('checklist');
            if (parentList.tagName === 'OL') {
                const ul = document.createElement('ul');
                ul.className = parentList.className;
                while (parentList.firstChild) ul.appendChild(parentList.firstChild);
                parentList.replaceWith(ul);
            }
            editor.focus();
            window.saveToLocalStorage && window.saveToLocalStorage();
            return;
        }
    }

    // 2) Not in a list: convert the current block(s) that contain the selection
    // Handle empty-editor placeholder case (mirrors applyStyle behaviour)
    if (window.isEditorEmpty && window.isEditorEmpty()) {
        const ed = window.AppState && window.AppState.editor;
        if (ed) {
            while (ed.firstChild) ed.removeChild(ed.firstChild);
            window.updateEditorPlaceholder && window.updateEditorPlaceholder();
        }
        const ul = document.createElement('ul');
        ul.className = 'checklist';
        const li = document.createElement('li');
        li.innerHTML = '<br>';
        ul.appendChild(li);
        ed.appendChild(ul);
        const newRange = document.createRange();
        newRange.setStart(li, 0);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);
        editor.focus();
        window.saveToLocalStorage && window.saveToLocalStorage();
        return;
    }

    let blocks = [];
    if (range.collapsed) {
        const b = getBlock(range.startContainer);
        if (b) blocks = [b];
    } else {
        const startBlock = getBlock(range.startContainer);
        const endBlock = getBlock(range.endContainer);
        if (startBlock && endBlock) {
            if (startBlock === endBlock) {
                blocks = [startBlock];
            } else {
                const allBlocks = Array.from(editor.querySelectorAll('p, div, li, h1, h2, h3, h4, h5, h6, blockquote, pre'));
                let inside = false;
                for (const b of allBlocks) {
                    if (b === startBlock) inside = true;
                    if (inside) blocks.push(b);
                    if (b === endBlock) break;
                }
                if (blocks.length === 0) blocks = [startBlock];
            }
        } else if (startBlock) {
            blocks = [startBlock];
        }
    }
    blocks = blocks.filter(b => b && b.tagName !== 'LI');

    if (blocks.length === 0) {
        // Fallback: insert empty checklist at caret (e.g. caret between blocks)
        const ul = document.createElement('ul');
        ul.className = 'checklist';
        const li = document.createElement('li');
        li.innerHTML = '<br>';
        ul.appendChild(li);
        try { range.insertNode(ul); } catch (e) { editor.appendChild(ul); }
        const newRange = document.createRange();
        newRange.setStart(li, 0);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);
        editor.focus();
        window.saveToLocalStorage && window.saveToLocalStorage();
        return;
    }

    const hasContent = blocks.some(b => b.textContent.trim() !== '' || b.querySelector('img, .code-block-wrapper, .summie-textbox, .summie-shape-wrapper'));

    const ul = document.createElement('ul');
    ul.className = 'checklist';

    if (!hasContent && blocks.length === 1) {
        const li = document.createElement('li');
        li.innerHTML = '<br>';
        ul.appendChild(li);
        blocks[0].replaceWith(ul);
        const newRange = document.createRange();
        newRange.setStart(li, 0);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);
        editor.focus();
        window.saveToLocalStorage && window.saveToLocalStorage();
        window.updateInhoudList && window.updateInhoudList();
        return;
    }

    let firstLi = null;
    for (const block of blocks) {
        const li = document.createElement('li');
        if (!block.textContent.trim() && !block.querySelector('img, br, .code-block-wrapper')) {
            li.innerHTML = '<br>';
        } else {
            while (block.firstChild) li.appendChild(block.firstChild);
            if (!li.textContent.trim() && li.children.length === 0) li.innerHTML = '<br>';
            li.removeAttribute('data-style');
        }
        ul.appendChild(li);
        if (!firstLi) firstLi = li;
    }
    blocks[0].replaceWith(ul);
    for (let i = 1; i < blocks.length; i++) {
        if (blocks[i].parentNode) blocks[i].remove();
    }

    if (firstLi) {
        const newRange = document.createRange();
        if (firstLi.innerHTML === '<br>') {
            newRange.setStart(firstLi, 0);
            newRange.collapse(true);
        } else {
            newRange.selectNodeContents(firstLi);
            newRange.collapse(false);
        }
        selection.removeAllRanges();
        selection.addRange(newRange);
    }
    editor.focus();
    window.saveToLocalStorage && window.saveToLocalStorage();
    window.updateInhoudList && window.updateInhoudList();
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

    if (window.isEditorEmpty && window.isEditorEmpty()) {
        const editor = window.AppState && window.AppState.editor;
        if (editor) {
            while (editor.firstChild) editor.removeChild(editor.firstChild);
            window.updateEditorPlaceholder && window.updateEditorPlaceholder();
        }
        window.setPendingEmptyEditorStyle && window.setPendingEmptyEditorStyle(style);
        window.topbarManager && window.topbarManager.updateStyleButtons(style);
        if (typeof styleOrEvent !== 'string') styleOrEvent.target.value = '';
        return;
    }

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
