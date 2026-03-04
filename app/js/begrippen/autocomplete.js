// ==================== AUTOCOMPLETE ====================
// checkAutocomplete, showAutocomplete, hideAutocomplete,
// navigateAutocomplete, selectAutocomplete,
// insertBegripOrAlias, insertBegrip.

function checkAutocomplete() {
    const { autocompletePopup, begrippen } = window.AppState;
    const selection = window.getSelection();
    if (selection.rangeCount === 0) { hideAutocomplete(); return; }

    const range = selection.getRangeAt(0);
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
    const { editor, autocompletePopup } = window.AppState;
    autocompletePopup.innerHTML = '';
    window.AppState.autocompleteIndex = -1;

    matches.forEach(begrip => {
        const item = document.createElement('div');
        item.className = 'autocomplete-item';

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

    const rect = range.getBoundingClientRect();
    const editorRect = editor.getBoundingClientRect();
    autocompletePopup.style.left = (rect.left - editorRect.left + editor.scrollLeft) + 'px';
    autocompletePopup.style.top = (rect.bottom - editorRect.top + editor.scrollTop + 50) + 'px';
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
    const idx = window.AppState.autocompleteIndex;
    const items = autocompletePopup.querySelectorAll('.autocomplete-item');
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
    const textNode = range.startContainer;
    if (textNode.nodeType !== 3) return;

    const text = textNode.textContent;
    const cursorPos = range.startOffset;

    let wordStart = cursorPos;
    while (wordStart > 0 && /\S/.test(text[wordStart - 1])) wordStart--;

    const typedWord = text.substring(wordStart, cursorPos).toLowerCase();

    let wordToInsert = begrip.keyword;
    if (begrip.aliases) {
        const matchingAlias = begrip.aliases.find(a => a.toLowerCase().startsWith(typedWord));
        if (matchingAlias) wordToInsert = matchingAlias;
    }

    textNode.textContent = text.substring(0, wordStart) + wordToInsert + ' ' + text.substring(cursorPos);
    const newCursorPos = wordStart + wordToInsert.length + 1;

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

// Expose
window.checkAutocomplete = checkAutocomplete;
window.showAutocomplete = showAutocomplete;
window.hideAutocomplete = hideAutocomplete;
window.navigateAutocomplete = navigateAutocomplete;
window.selectAutocomplete = selectAutocomplete;
window.insertBegripOrAlias = insertBegripOrAlias;
window.insertBegrip = insertBegrip;