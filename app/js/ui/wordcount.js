// ==================== WORD COUNTER ====================
// updateWordCounter, triggerMilestoneAnimation, showWordChangeIndicator.

// ---- Odometer helper ----
// Each managed container keeps a flat list of "nodes": { type: 'digit'|'static', el, inner, value }
// On update we reconcile in-place so interrupted transitions always animate from their
// current visual position rather than snapping to a stale start value.

const DIGIT_H = '1em'; // must match CSS .odometer-digit height / .digit-char height

function _makeDigitSlot(ch) {
    const slot = document.createElement('span');
    slot.className = 'odometer-digit';
    const inner = document.createElement('span');
    inner.className = 'odometer-digit-inner';
    const cur = document.createElement('span');
    cur.className = 'digit-char';
    cur.textContent = ch;
    inner.appendChild(cur);
    // inner is already at translateY(0) — shows the single char
    slot.appendChild(inner);
    // Store the "logical current value" on the slot for future transitions
    slot.dataset.val = ch;
    return slot;
}

function _makeStaticSpan(ch) {
    const span = document.createElement('span');
    span.className = 'odometer-static';
    span.textContent = ch === ' ' ? '\u00A0' : ch;
    return span;
}

// Tokenise a string into alternating digit-group / static tokens
function _tokenise(text) {
    const tokens = [];
    for (let i = 0; i < text.length; i++) {
        tokens.push({ type: /\d/.test(text[i]) ? 'digit' : 'static', ch: text[i] });
    }
    return tokens;
}

function _animateDigitSlot(slot, newCh) {
    const oldCh = slot.dataset.val;
    if (oldCh === newCh) return;
    slot.dataset.val = newCh;

    const inner = slot.querySelector('.odometer-digit-inner');

    // Read the *current* computed translateY so we start from wherever the animation
    // actually is right now (handles rapid-fire updates correctly).
    const style = window.getComputedStyle(inner);
    const matrix = new DOMMatrix(style.transform);
    const currentY = matrix.m42; // px value of current translateY

    // Disable transition momentarily to snap to real current position
    inner.style.transition = 'none';
    inner.style.transform = `translateY(${currentY}px)`;
    // Force reflow so the browser registers the snap
    inner.getBoundingClientRect();

    const oldNum = parseInt(oldCh, 10);
    const newNum = parseInt(newCh, 10);
    const goingUp = newNum > oldNum || (oldNum === 9 && newNum === 0);

    // Rebuild inner with exactly two chars: the one currently visible + the incoming one
    inner.innerHTML = '';

    const incoming = document.createElement('span');
    incoming.className = 'digit-char';
    incoming.textContent = newCh;

    const existing = document.createElement('span');
    existing.className = 'digit-char';
    existing.textContent = oldCh;

    if (goingUp) {
        // Incoming slides in from top: [incoming, existing], start at -1 slot to show existing
        inner.appendChild(incoming);
        inner.appendChild(existing);
        inner.style.transform = `translateY(-${DIGIT_H})`;
        // Re-enable transition then animate to 0 (shows incoming at top)
        requestAnimationFrame(() => {
            inner.style.transition = '';
            inner.style.transform = 'translateY(0)';
        });
    } else {
        // Incoming slides in from bottom: [existing, incoming], start at 0 to show existing
        inner.appendChild(existing);
        inner.appendChild(incoming);
        inner.style.transform = 'translateY(0)';
        requestAnimationFrame(() => {
            inner.style.transition = '';
            inner.style.transform = `translateY(-${DIGIT_H})`;
        });
    }
}

function applyOdometer(el, newText) {
    if (el.dataset.odometerText === newText) return;
    el.dataset.odometerText = newText;

    const newTokens = _tokenise(newText);

    // Build a flat list of the container's current child nodes with their types
    const existing = Array.from(el.childNodes).map(node => {
        if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains('odometer-digit')) {
            return { type: 'digit', el: node };
        }
        if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains('odometer-static')) {
            return { type: 'static', el: node };
        }
        return { type: 'other', el: node };
    });

    // If structure matches (same length + same types at every position), update in-place
    const structureMatches =
        existing.length === newTokens.length &&
        existing.every((n, i) => n.type === newTokens[i].type);

    if (structureMatches) {
        newTokens.forEach((tok, i) => {
            if (tok.type === 'digit') {
                _animateDigitSlot(existing[i].el, tok.ch);
            } else {
                existing[i].el.textContent = tok.ch === ' ' ? '\u00A0' : tok.ch;
            }
        });
    } else {
        // Structure changed (e.g. "9 woorden" → "10 woorden", digit count differs) — full rebuild
        el.innerHTML = '';
        newTokens.forEach(tok => {
            el.appendChild(tok.type === 'digit' ? _makeDigitSlot(tok.ch) : _makeStaticSpan(tok.ch));
        });
    }
}

// Split helper: keeps a dedicated numeric odometer span + a static label span.
// The label can change (singular/plural) without disrupting the digit structure.
function _applyOdometerSplit(el, number, label) {
    let numEl = el.querySelector('.odometer-num');
    let labelEl = el.querySelector('.odometer-label');

    if (!numEl || !labelEl) {
        // First render — build the two child elements
        el.innerHTML = '';
        numEl = document.createElement('span');
        numEl.className = 'odometer-num';
        labelEl = document.createElement('span');
        labelEl.className = 'odometer-label odometer-static';
        el.appendChild(numEl);
        el.appendChild(labelEl);
    }

    applyOdometer(numEl, String(number));
    labelEl.textContent = label;
}

// ---- File size display (odometer animation) ----
let _lastFileSizeBytes = null;

function _formatBytes(bytes) {
    if (bytes === null || bytes === undefined) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function _odometerUpdate(el, newText) {
    if (!newText) { el.innerHTML = ''; return; }

    const oldChars = Array.from(el.querySelectorAll('.fsz-char')).map(c => c.dataset.char);
    const newChars = newText.split('');

    // Rebuild spans — animate only digits that changed
    el.innerHTML = newChars.map((ch, i) => {
        const changed = ch !== oldChars[i];
        const isDigit = /[0-9]/.test(ch);
        if (changed && isDigit) {
            return `<span class="fsz-char fsz-char-anim" data-char="${ch}">${ch}</span>`;
        }
        return `<span class="fsz-char" data-char="${ch}">${ch}</span>`;
    }).join('');
}

async function updateFileSize() {
    const el = document.getElementById('fileSizeDisplay');
    if (!el) return;

    const path = window.currentFilePath;
    if (!path || !window.electron?.getFileSize) {
        el.innerHTML = '';
        _lastFileSizeBytes = null;
        return;
    }

    const bytes = await window.electron.getFileSize(path);
    if (bytes === _lastFileSizeBytes) return;
    _lastFileSizeBytes = bytes;

    const formatted = _formatBytes(bytes);
    _odometerUpdate(el, formatted);
}

window.updateFileSize = updateFileSize;

function updateWordCounter() {
    const state = window.AppState;
    const { editor } = state;
    const selection = window.getSelection();

    const wordCountEl = document.getElementById('wordCount');
    const charCountEl = document.getElementById('charCount');
    const selectionCountEl = document.getElementById('selectionCount');
    const selectionSepEl = document.getElementById('selectionSep');

    if (!wordCountEl) return;

    const totalCounts = window.SummieTextCount
        ? window.SummieTextCount.countNode(editor)
        : { words: 0, chars: 0 };
    const totalWords = totalCounts.words;
    const totalChars = totalCounts.chars;

    // Milestone celebrations
    const currentMilestone = Math.floor(totalWords / 1000) * 1000;
    if (currentMilestone > state.lastMilestone && currentMilestone > 0 && totalWords >= currentMilestone) {
        state.lastMilestone = currentMilestone;
        triggerMilestoneAnimation();
    }

    // Show word change indicator (keep this)
    if (state.previousWordCount > 0 && totalWords !== state.previousWordCount) {
        const difference = totalWords - state.previousWordCount;
        showWordChangeIndicator(difference);
    }
    state.previousWordCount = totalWords;

    // Odometer-animate only the numeric part; label updates in-place separately.
    // This keeps the token structure stable across singular/plural switches.
    _applyOdometerSplit(wordCountEl, totalWords, totalWords === 1 ? '\u00A0woord' : '\u00A0woorden');
    if (charCountEl) _applyOdometerSplit(charCountEl, totalChars, totalChars === 1 ? '\u00A0teken' : '\u00A0tekens');

    // Selection info
    const selectedCounts = window.SummieTextCount
        ? window.SummieTextCount.countSelection(selection, editor)
        : { words: 0, chars: 0 };

    if (selectedCounts.words > 0 || selectedCounts.chars > 0) {
        const selectedWords = selectedCounts.words;
        const selectedChars = selectedCounts.chars;

        if (selectionCountEl && selectionCountEl.textContent === '') {
            selectionCountEl.classList.add('animate');
            setTimeout(() => selectionCountEl.classList.remove('animate'), 300);
        }
        if (selectionCountEl) selectionCountEl.textContent = `${selectedWords} w / ${selectedChars} t geselecteerd`;
        if (selectionSepEl) selectionSepEl.style.display = '';
    } else {
        if (selectionCountEl) selectionCountEl.textContent = '';
        if (selectionSepEl) selectionSepEl.style.display = 'none';
    }
}

function triggerMilestoneAnimation() {
    const wordCountEl = document.getElementById('wordCount');
    if (!wordCountEl) return;
    wordCountEl.classList.add('milestone-flow');
    setTimeout(() => {
        wordCountEl.classList.remove('milestone-flow');
        wordCountEl.classList.add('milestone-pop');
        setTimeout(() => wordCountEl.classList.remove('milestone-pop'), 600);
    }, 1500);
}

function showWordChangeIndicator(difference) {
    const wordCountEl = document.getElementById('wordCount');
    if (!wordCountEl) return;
    const indicator = document.createElement('span');
    indicator.className = `word-change-indicator ${difference > 0 ? 'added' : 'removed'}`;
    indicator.textContent = difference > 0 ? `+${difference}` : `${difference}`;
    const parent = wordCountEl.closest('.bottom-bar-left') || wordCountEl.parentElement;
    parent.appendChild(indicator);
    setTimeout(() => indicator.remove(), 1500);
}

// Expose
window.updateWordCounter = updateWordCounter;
window.triggerMilestoneAnimation = triggerMilestoneAnimation;
window.showWordChangeIndicator = showWordChangeIndicator;
window.applyOdometer = applyOdometer;
window._applyOdometerSplit = _applyOdometerSplit;