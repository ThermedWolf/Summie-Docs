// ==================== BEGRIPPEN HIGHLIGHTING ====================
// highlightBegrippen, getTextOffset, restoreCursorPosition, escapeRegex,
// showBegripTooltip, hideBegripTooltip.

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getTextOffset(container, node, offset) {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
    let totalOffset = 0;
    let currentNode;
    while (currentNode = walker.nextNode()) {
        if (currentNode === node) return totalOffset + offset;
        totalOffset += currentNode.textContent.length;
    }
    return totalOffset;
}

function restoreCursorPosition(container, targetOffset) {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
    let currentOffset = 0;
    let node;
    while (node = walker.nextNode()) {
        const nodeLength = node.textContent.length;
        if (currentOffset + nodeLength >= targetOffset) {
            const offset = targetOffset - currentOffset;
            try {
                const range = document.createRange();
                range.setStart(node, Math.min(offset, nodeLength));
                range.collapse(true);
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(range);
            } catch (e) { /* ignore */ }
            return;
        }
        currentOffset += nodeLength;
    }
}

function highlightBegrippen() {
    const { editor, begrippen } = window.AppState;
    if (begrippen.length === 0) return;

    // Save cursor position as a text offset so we can restore it after DOM changes
    const selection = window.getSelection();
    let cursorOffset = null;
    if (selection.rangeCount > 0 && editor.contains(selection.anchorNode)) {
        cursorOffset = getTextOffset(editor, selection.anchorNode, selection.anchorOffset);
    }

    // Remove all existing begrip highlights
    editor.querySelectorAll('.begrip-word').forEach(highlight => {
        highlight.parentNode.replaceChild(document.createTextNode(highlight.textContent), highlight);
    });
    editor.normalize();

    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null, false);
    const nodesToReplace = [];
    let node;

    while (node = walker.nextNode()) {
        // Skip special elements
        let parent = node.parentElement;
        let shouldSkip = false;
        while (parent && parent !== editor) {
            if (parent.classList && (
                parent.classList.contains('highlight') ||
                parent.classList.contains('code-block-wrapper') ||
                parent.classList.contains('code-block') ||
                parent.tagName === 'STYLE' ||
                parent.tagName === 'SCRIPT' ||
                parent.tagName === 'TEXTAREA'
            )) { shouldSkip = true; break; }
            parent = parent.parentElement;
        }
        if (shouldSkip) continue;

        const text = node.textContent;
        let hasMatch = false;

        begrippen.forEach(begrip => {
            if (new RegExp(`\\b${escapeRegex(begrip.keyword)}\\b`, 'gi').test(text)) hasMatch = true;
            if (!hasMatch && begrip.aliases) {
                begrip.aliases.forEach(alias => {
                    if (new RegExp(`\\b${escapeRegex(alias)}\\b`, 'gi').test(text)) hasMatch = true;
                });
            }
        });

        if (hasMatch) nodesToReplace.push(node);
    }

    nodesToReplace.forEach(node => {
        const text = node.textContent;
        const parent = node.parentElement;
        const fragment = document.createDocumentFragment();

        // Collect all matches (keyword + aliases)
        const matches = [];
        begrippen.forEach(begrip => {
            const keywordRegex = new RegExp(`\\b${escapeRegex(begrip.keyword)}\\b`, 'gi');
            let match;
            while ((match = keywordRegex.exec(text)) !== null) {
                matches.push({ start: match.index, end: match.index + match[0].length, text: match[0], keyword: begrip.keyword, length: match[0].length });
            }
            if (begrip.aliases) {
                begrip.aliases.forEach(alias => {
                    const aliasRegex = new RegExp(`\\b${escapeRegex(alias)}\\b`, 'gi');
                    while ((match = aliasRegex.exec(text)) !== null) {
                        matches.push({ start: match.index, end: match.index + match[0].length, text: match[0], keyword: begrip.keyword, length: match[0].length });
                    }
                });
            }
        });

        // Sort by position; longer matches win on ties
        matches.sort((a, b) => a.start !== b.start ? a.start - b.start : b.length - a.length);

        // Remove overlapping matches
        const filteredMatches = [];
        matches.forEach(m => {
            const overlaps = filteredMatches.some(ex =>
                (m.start >= ex.start && m.start < ex.end) ||
                (m.end > ex.start && m.end <= ex.end) ||
                (m.start <= ex.start && m.end >= ex.end)
            );
            if (!overlaps) filteredMatches.push(m);
        });

        let lastIndex = 0;
        let modified = false;

        filteredMatches.forEach(m => {
            if (m.start > lastIndex) fragment.appendChild(document.createTextNode(text.substring(lastIndex, m.start)));
            const span = document.createElement('span');
            span.className = 'begrip-word';
            span.dataset.keyword = m.keyword;
            span.textContent = m.text;
            fragment.appendChild(span);
            lastIndex = m.end;
            modified = true;
        });

        if (lastIndex < text.length) fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
        if (modified) parent.replaceChild(fragment, node);
    });

    // Restore cursor
    if (cursorOffset !== null) restoreCursorPosition(editor, cursorOffset);
}

function showBegripTooltip(element) {
    const { begrippen, begripTooltip } = window.AppState;
    const keyword = element.dataset.keyword || element.textContent;
    const begrip = begrippen.find(b => b.keyword.toLowerCase() === keyword.toLowerCase());
    if (!begrip) return;

    begripTooltip.innerHTML = `<strong>${begrip.keyword}</strong><br>${begrip.description}`;

    // Show off-screen first so we can measure its size
    begripTooltip.style.visibility = 'hidden';
    begripTooltip.style.left = '0px';
    begripTooltip.style.top = '0px';
    begripTooltip.classList.add('active');

    const wordRect = element.getBoundingClientRect();
    const tipRect = begripTooltip.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 8;

    // Prefer below, flip to above if it would overflow the viewport bottom
    let top, arrowAbove;
    if (wordRect.bottom + gap + tipRect.height <= vh - 8) {
        top = wordRect.bottom + gap;
        arrowAbove = true;   // arrow points up (sits at top of tooltip)
    } else {
        top = wordRect.top - gap - tipRect.height;
        arrowAbove = false;  // arrow points down (sits at bottom of tooltip)
    }

    // Align left edge with word, clamp to viewport
    let left = wordRect.left;
    left = Math.max(8, Math.min(left, vw - tipRect.width - 8));

    // Arrow horizontal offset relative to tooltip left edge
    const arrowLeft = Math.max(12, Math.min(wordRect.left + wordRect.width / 2 - left - 8, tipRect.width - 28));

    begripTooltip.style.left = left + 'px';
    begripTooltip.style.top = top + 'px';
    begripTooltip.style.setProperty('--arrow-left', arrowLeft + 'px');
    begripTooltip.classList.toggle('arrow-above', arrowAbove);
    begripTooltip.classList.toggle('arrow-below', !arrowAbove);
    begripTooltip.style.visibility = '';

    // Close on outside click (registered once per open)
    setTimeout(() => {
        document.addEventListener('click', _begripOutsideClickHandler);
    }, 0);
}

function _begripOutsideClickHandler(e) {
    const tooltip = window.AppState.begripTooltip;
    if (!tooltip.contains(e.target) && !e.target.classList.contains('begrip-word')) {
        hideBegripTooltip();
        document.removeEventListener('click', _begripOutsideClickHandler);
    }
}

function hideBegripTooltip() {
    window.AppState.begripTooltip.classList.remove('active', 'arrow-above', 'arrow-below');
    document.removeEventListener('click', _begripOutsideClickHandler);
}

// Expose
window.escapeRegex = escapeRegex;
window.getTextOffset = getTextOffset;
window.restoreCursorPosition = restoreCursorPosition;
window.highlightBegrippen = highlightBegrippen;
window.showBegripTooltip = showBegripTooltip;
window.hideBegripTooltip = hideBegripTooltip;