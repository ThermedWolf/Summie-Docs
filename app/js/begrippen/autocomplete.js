// ==================== AUTOCOMPLETE ====================
// checkAutocomplete, showAutocomplete, hideAutocomplete,
// navigateAutocomplete, selectAutocomplete,
// insertBegripOrAlias, insertBegrip.

function checkAutocomplete() {
    const { begrippen } = window.AppState;
    const selection = window.getSelection();
    if (selection.rangeCount === 0) { hideAutocomplete(); return; }

    const range = selection.getRangeAt(0);
    if (!range.collapsed) { hideAutocomplete(); return; }
    const activePage = getAutocompletePage(range);
    if (!activePage || !activePage.contains(range.startContainer)) { hideAutocomplete(); return; }

    const textNode = range.startContainer;
    if (textNode.nodeType !== 3) { hideAutocomplete(); return; }

    const text = textNode.textContent;
    const cursorPos = range.startOffset;

    let wordStart = cursorPos;
    while (wordStart > 0 && /\S/.test(text[wordStart - 1])) wordStart--;

    const currentWord = text.substring(wordStart, cursorPos);
    if (currentWord.length === 0) { hideAutocomplete(); return; }

    const matches = begrippen.filter(b => {
        const keywordMatch = b.keyword.toLowerCase().startsWith(currentWord.toLowerCase());
        const aliasMatch = b.aliases && b.aliases.some(a => a.toLowerCase().startsWith(currentWord.toLowerCase()));
        return keywordMatch || aliasMatch;
    });

    if (matches.length > 0) showAutocomplete(matches, range);
    else hideAutocomplete();
}

function showAutocomplete(matches, range) {
    const { autocompletePopup } = window.AppState;
    autocompletePopup.innerHTML = '';
    window.AppState.autocompleteIndex = 0;

    matches.forEach((begrip, index) => {
        const item = document.createElement('div');
        item.className = index === 0 ? 'autocomplete-item selected' : 'autocomplete-item';

        let displayText = begrip.keyword;
        if (begrip.aliases && begrip.aliases.length > 0) displayText += ` (${begrip.aliases.join(', ')})`;

        item.innerHTML = `
            <div class="autocomplete-keyword">${displayText}</div>
            <div class="autocomplete-description">${begrip.description}</div>
        `;
        item.dataset.keyword = begrip.keyword;
        item.dataset.aliases = begrip.aliases ? JSON.stringify(begrip.aliases) : '[]';

        item.addEventListener('mousedown', (e) => {
            e.preventDefault();
            insertBegripOrAlias(begrip);
        });
        autocompletePopup.appendChild(item);
    });

    const rect = getAutocompleteRangeRect(range);
    if (!rect) { hideAutocomplete(); return; }

    const container = autocompletePopup.parentElement;
    const containerRect = container.getBoundingClientRect();
    const left = rect.right - containerRect.left + container.scrollLeft;
    const top = rect.bottom - containerRect.top + container.scrollTop + 4;

    autocompletePopup.style.left = Math.max(0, left) + 'px';
    autocompletePopup.style.top = Math.max(0, top) + 'px';
    autocompletePopup.classList.add('active');
}

function hideAutocomplete() {
    window.AppState.autocompletePopup.classList.remove('active');
    window.AppState.autocompleteIndex = -1;
}

function navigateAutocomplete(direction) {
    const { autocompletePopup } = window.AppState;
    const items = autocompletePopup.querySelectorAll('.autocomplete-item');
    if (items.length === 0) return;

    let idx = window.AppState.autocompleteIndex;
    if (idx >= 0) items[idx].classList.remove('selected');

    idx += direction;
    if (idx < 0) idx = items.length - 1;
    if (idx >= items.length) idx = 0;

    window.AppState.autocompleteIndex = idx;
    items[idx].classList.add('selected');
    items[idx].scrollIntoView({ block: 'nearest' });
}

function selectAutocomplete() {
    const { autocompletePopup, begrippen } = window.AppState;
    const items = autocompletePopup.querySelectorAll('.autocomplete-item');
    const idx = window.AppState.autocompleteIndex >= 0 ? window.AppState.autocompleteIndex : 0;
    if (idx >= 0 && idx < items.length) {
        const keyword = items[idx].dataset.keyword;
        const begrip = begrippen.find(b => b.keyword === keyword);
        if (begrip) insertBegripOrAlias(begrip);
    }
}

function insertBegripOrAlias(begrip) {
    const selection = window.getSelection();
    if (selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (!range.collapsed || !getAutocompletePage(range)) return;
    const textNode = range.startContainer;
    if (textNode.nodeType !== 3) return;

    const text = textNode.textContent;
    const cursorPos = range.startOffset;

    let wordStart = cursorPos;
    while (wordStart > 0 && /\S/.test(text[wordStart - 1])) wordStart--;

    const typedWord = text.substring(wordStart, cursorPos);

    let wordToInsert = begrip.keyword;
    if (begrip.aliases) {
        const matchingAlias = begrip.aliases.find(a => a.toLowerCase().startsWith(typedWord.toLowerCase()));
        if (matchingAlias) wordToInsert = matchingAlias;
    }

    // Keep the already-typed characters as-is; only append what is missing
    const remainder = wordToInsert.slice(typedWord.length);
    const fullWord = typedWord + remainder;

    textNode.textContent = text.substring(0, wordStart) + fullWord + ' ' + text.substring(cursorPos);
    const newCursorPos = wordStart + fullWord.length + 1;

    hideAutocomplete();

    try {
        const newRange = document.createRange();
        newRange.setStart(textNode, newCursorPos);
        newRange.setEnd(textNode, newCursorPos);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(newRange);
    } catch (e) { console.error('Error setting cursor:', e); }

    setTimeout(() => {
        window.highlightBegrippen && window.highlightBegrippen();
        window.saveToLocalStorage && window.saveToLocalStorage();
    }, 100);
}

function insertBegrip(keyword) {
    const selection = window.getSelection();
    if (selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (!range.collapsed || !getAutocompletePage(range)) return;
    const textNode = range.startContainer;
    if (textNode.nodeType !== 3) return;

    const text = textNode.textContent;
    const cursorPos = range.startOffset;

    let wordStart = cursorPos;
    while (wordStart > 0 && /\S/.test(text[wordStart - 1])) wordStart--;

    textNode.textContent = text.substring(0, wordStart) + keyword + ' ' + text.substring(cursorPos);
    const newCursorPos = wordStart + keyword.length + 1;

    hideAutocomplete();

    try {
        const newRange = document.createRange();
        newRange.setStart(textNode, newCursorPos);
        newRange.setEnd(textNode, newCursorPos);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(newRange);
    } catch (e) { console.error('Error setting cursor:', e); }

    setTimeout(() => {
        window.highlightBegrippen && window.highlightBegrippen();
        window.saveToLocalStorage && window.saveToLocalStorage();
    }, 100);
}

function getAutocompletePage(range) {
    const state = window.AppState || {};
    const node = range && range.startContainer;
    const element = node && node.nodeType === 3 ? node.parentElement : node;
    const page = element && element.closest && element.closest('.page[contenteditable="true"]');
    return page || state.editor || null;
}

function getAutocompleteRangeRect(range) {
    const rect = range.getBoundingClientRect();
    if (rect && (rect.width || rect.height)) return rect;

    const markerRange = range.cloneRange();
    const marker = document.createElement('span');
    marker.textContent = '\u200b';
    marker.style.display = 'inline-block';
    marker.style.width = '1px';
    marker.style.height = '1em';
    marker.style.overflow = 'hidden';

    try {
        markerRange.insertNode(marker);
        const markerRect = marker.getBoundingClientRect();
        marker.remove();

        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);

        return markerRect && (markerRect.width || markerRect.height) ? markerRect : null;
    } catch (e) {
        marker.remove();
        console.error('Error measuring autocomplete position:', e);
        return null;
    }
}

// Expose
window.checkAutocomplete = checkAutocomplete;
window.showAutocomplete = showAutocomplete;
window.hideAutocomplete = hideAutocomplete;
window.navigateAutocomplete = navigateAutocomplete;
window.selectAutocomplete = selectAutocomplete;
window.insertBegripOrAlias = insertBegripOrAlias;
window.insertBegrip = insertBegrip;
