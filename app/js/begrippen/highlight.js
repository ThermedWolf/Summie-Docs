// ==================== BEGRIPPEN HIGHLIGHTING ====================
// highlightBegrippen, getTextOffset, restoreCursorPosition, escapeRegex,
// showBegripTooltip, handleBegripHover, hideBegripTooltip.

function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Build a regex for a begrip keyword that handles keywords containing dots or
// other non-word characters.  For plain word characters we can use \b;
// for anything else we fall back to a lookahead/lookbehind on non-word chars
// (or start/end of string) so the keyword still matches as a whole "word".
// Returns null for empty/missing keywords so callers can skip them safely —
// malformed data in a .sumd file shouldn't be able to crash the whole load.
function buildBegripRegex(keyword, flags) {
    if (!keyword || typeof keyword !== 'string') return null;
    const escaped = escapeRegex(keyword);
    // If every character is a word char (\w), \b works perfectly.
    if (/^\w+$/.test(keyword)) {
        return new RegExp(`\\b${escaped}\\b`, flags);
    }
    // Otherwise use lookahead / lookbehind so we don't match partial words.
    // (?<!\w) ensures we're not preceded by a word char.
    // (?!\w)  ensures we're not followed by a word char.
    return new RegExp(`(?<!\\w)${escaped}(?!\\w)`, flags);
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
            const keywordRegex = buildBegripRegex(begrip.keyword, 'i');
            if (keywordRegex && keywordRegex.test(text)) hasMatch = true;
            if (!hasMatch && begrip.aliases) {
                begrip.aliases.forEach(alias => {
                    const aliasRegex = buildBegripRegex(alias, 'i');
                    if (aliasRegex && aliasRegex.test(text)) hasMatch = true;
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
            const keywordRegex = buildBegripRegex(begrip.keyword, 'gi');
            if (keywordRegex) {
                let match;
                while ((match = keywordRegex.exec(text)) !== null) {
                    matches.push({ start: match.index, end: match.index + match[0].length, text: match[0], keyword: begrip.keyword, length: match[0].length });
                }
            }
            if (begrip.aliases) {
                begrip.aliases.forEach(alias => {
                    const aliasRegex = buildBegripRegex(alias, 'gi');
                    if (!aliasRegex) return;
                    let match;
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

    begripTooltip.innerHTML = `<strong>${window.escapeHtml(begrip.keyword)}</strong><br>${window.escapeHtml(begrip.description)}`;

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
}

// ---- Hover behaviour ----
// The tooltip opens on hover instead of on click. A short delay before
// showing prevents flicker while moving the pointer across text; a grace
// delay before hiding lets the pointer cross the gap between the word and
// the tooltip (and onto the tooltip itself) without dismissing it.

const BEGRIP_TOOLTIP_SHOW_DELAY = 150;
const BEGRIP_TOOLTIP_HIDE_DELAY = 150;

let _begripShowTimer = null;
let _begripHideTimer = null;
let _begripHoverEl = null;

function handleBegripHover(e) {
    const tooltip = window.AppState && window.AppState.begripTooltip;
    if (!tooltip) return;

    // Hovering a highlighted word: cancel any pending hide, then schedule a
    // show — also when switching directly from one word to another.
    const word = e.target.closest ? e.target.closest('.begrip-word') : null;
    if (word) {
        clearTimeout(_begripHideTimer);
        _begripHideTimer = null;
        if (!tooltip.classList.contains('active') || _begripHoverEl !== word) {
            clearTimeout(_begripShowTimer);
            _begripShowTimer = setTimeout(() => {
                _begripShowTimer = null;
                showBegripTooltip(word);
            }, BEGRIP_TOOLTIP_SHOW_DELAY);
        }
        _begripHoverEl = word;
        return;
    }

    // Moving onto the tooltip itself: keep it open.
    if (e.target.closest && e.target.closest('.begrip-tooltip')) {
        clearTimeout(_begripHideTimer);
        _begripHideTimer = null;
        return;
    }

    // Pointer left both word and tooltip: drop any pending show and hide
    // after the grace period.
    _begripHoverEl = null;
    clearTimeout(_begripShowTimer);
    _begripShowTimer = null;
    if (tooltip.classList.contains('active')) {
        clearTimeout(_begripHideTimer);
        _begripHideTimer = setTimeout(() => {
            _begripHideTimer = null;
            hideBegripTooltip();
        }, BEGRIP_TOOLTIP_HIDE_DELAY);
    }
}

function hideBegripTooltip() {
    clearTimeout(_begripShowTimer);
    clearTimeout(_begripHideTimer);
    _begripShowTimer = null;
    _begripHideTimer = null;
    _begripHoverEl = null;
    window.AppState.begripTooltip.classList.remove('active', 'arrow-above', 'arrow-below');
}

// Expose
window.escapeRegex = escapeRegex;
window.buildBegripRegex = buildBegripRegex;
window.getTextOffset = getTextOffset;
window.restoreCursorPosition = restoreCursorPosition;
window.highlightBegrippen = highlightBegrippen;
window.showBegripTooltip = showBegripTooltip;
window.handleBegripHover = handleBegripHover;
window.hideBegripTooltip = hideBegripTooltip;