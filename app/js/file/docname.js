// ==================== DOC NAME & SAVE STATUS ====================
// showSaveStatusSuccess, updateLastSavedText, updateUnsavedIndicator, setupDocNameInput.

let _saveStatusTimer = null;
let _saveStatusLastSavedTime = null;
let _saveStatusIntervalId = null;
let _saveStatusLocked = false; // true during the 5s "Opgeslagen!" display

// Shared helper: fade out current span, then fade in new one (or just fade in if empty)
function _setStatusText(area, newClass, newText) {
    const current = area.querySelector('.save-status-text');
    const newClassShort = newClass.split(' ')[1];

    // If same type, just update text in place without animation
    if (current && current.classList.contains(newClassShort)) {
        current.textContent = newText;
        return;
    }

    const show = () => {
        area.innerHTML = `<span class="${newClass}">${newText}</span>`;
        const el = area.querySelector('.save-status-text');
        // Use a small timeout so the element is in the DOM before adding the class
        setTimeout(() => el && el.classList.add('visible'), 20);
    };

    if (current) {
        current.classList.remove('visible');
        setTimeout(show, 350);
    } else {
        show();
    }
}

// Variant for "Laatst opgeslagen X min geleden" — uses odometer on the numeric part.
// The transition is between save-last-saved states; if switching FROM a different type,
// it falls back to the normal fade transition.
function _setStatusTextTime(area, newText) {
    const current = area.querySelector('.save-status-text');

    if (current && current.classList.contains('save-last-saved')) {
        // Same type — animate numbers in-place using odometer
        if (current.dataset.fullText === newText) return; // no change
        const oldText = current.dataset.fullText || current.textContent;
        current.dataset.fullText = newText;

        // Split into prefix (non-digit) and animated portion
        // e.g. "Laatst opgeslagen zojuist" → no digits, just swap
        // "Laatst opgeslagen 1 min geleden" → animate the number
        current.innerHTML = '';

        // If transitioning from "zojuist" to "N min geleden", briefly show "0 min geleden" first
        const oldHasDigit = /\d/.test(oldText);
        const newHasDigit = /\d/.test(newText);

        if (!oldHasDigit && newHasDigit) {
            // zojuist → N min: flash "0 min geleden" then animate to N
            const zeroText = newText.replace(/\d+/, '0');
            _renderTimeText(current, zeroText, oldText);
            setTimeout(() => _renderTimeText(current, newText, zeroText), 50);
        } else {
            _renderTimeText(current, newText, oldText);
        }
        return;
    }

    // Different type — use normal fade transition
    const show = () => {
        const el = document.createElement('span');
        el.className = 'save-status-text save-last-saved visible';
        el.dataset.fullText = newText;
        _renderTimeText(el, newText, '');
        area.innerHTML = '';
        area.appendChild(el);
        setTimeout(() => el.classList.add('visible'), 20);
    };

    if (current) {
        current.classList.remove('visible');
        setTimeout(show, 350);
    } else {
        show();
    }
}

function _renderTimeText(el, newText, oldText) {
    const newTokens = [];
    for (let i = 0; i < newText.length; i++) {
        newTokens.push({ type: /\d/.test(newText[i]) ? 'digit' : 'static', ch: newText[i] });
    }

    const existing = Array.from(el.childNodes).map(node => {
        if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains('odometer-digit')) {
            return { type: 'digit', el: node };
        }
        if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains('odometer-static')) {
            return { type: 'static', el: node };
        }
        return { type: 'other', el: node };
    });

    const structureMatches =
        existing.length === newTokens.length &&
        existing.every((n, i) => n.type === newTokens[i].type);

    if (structureMatches) {
        newTokens.forEach((tok, i) => {
            if (tok.type === 'digit') {
                _animateTimeDigit(existing[i].el, tok.ch);
            } else {
                existing[i].el.textContent = tok.ch === ' ' ? '\u00A0' : tok.ch;
            }
        });
    } else {
        el.innerHTML = '';
        newTokens.forEach(tok => {
            if (tok.type === 'digit') {
                const slot = document.createElement('span');
                slot.className = 'odometer-digit';
                const inner = document.createElement('span');
                inner.className = 'odometer-digit-inner';
                const cur = document.createElement('span');
                cur.className = 'digit-char';
                cur.textContent = tok.ch;
                inner.appendChild(cur);
                slot.dataset.val = tok.ch;
                slot.appendChild(inner);
                el.appendChild(slot);
            } else {
                const span = document.createElement('span');
                span.className = 'odometer-static';
                span.textContent = tok.ch === ' ' ? '\u00A0' : tok.ch;
                el.appendChild(span);
            }
        });
    }
}

function _animateTimeDigit(slot, newCh) {
    const oldCh = slot.dataset.val;
    if (oldCh === newCh) return;
    slot.dataset.val = newCh;

    const inner = slot.querySelector('.odometer-digit-inner');

    // Snap to current visual position before starting new animation
    const style = window.getComputedStyle(inner);
    const matrix = new DOMMatrix(style.transform);
    const currentY = matrix.m42;
    inner.style.transition = 'none';
    inner.style.transform = `translateY(${currentY}px)`;
    inner.getBoundingClientRect(); // force reflow

    const oldNum = parseInt(oldCh, 10);
    const newNum = parseInt(newCh, 10);
    const goingUp = newNum > oldNum || (oldNum === 9 && newNum === 0);

    inner.innerHTML = '';
    const incoming = document.createElement('span');
    incoming.className = 'digit-char';
    incoming.textContent = newCh;
    const existing = document.createElement('span');
    existing.className = 'digit-char';
    existing.textContent = oldCh;

    if (goingUp) {
        inner.appendChild(incoming);
        inner.appendChild(existing);
        inner.style.transform = 'translateY(-1em)';
        requestAnimationFrame(() => {
            inner.style.transition = '';
            inner.style.transform = 'translateY(0)';
        });
    } else {
        inner.appendChild(existing);
        inner.appendChild(incoming);
        inner.style.transform = 'translateY(0)';
        requestAnimationFrame(() => {
            inner.style.transition = '';
            inner.style.transform = 'translateY(-1em)';
        });
    }
}

function _hasUnsavedChanges() {
    const savedContent = localStorage.getItem('summie_saved_content');
    const savedBegrippen = localStorage.getItem('summie_saved_begrippen');
    const { editor, begrippen, lastSavedBegrippen } = window.AppState;
    const currentContent = editor ? editor.innerHTML : null;
    const currentBegrippen = JSON.stringify(begrippen || []);

    // Content changed vs last file-save
    const contentChanged = savedContent !== null && currentContent !== null && currentContent !== savedContent;

    // Begrippen changed: compare against localStorage baseline if available, else in-memory baseline
    let begrippenChanged = false;
    if (savedBegrippen !== null) {
        begrippenChanged = currentBegrippen !== savedBegrippen;
    } else if (lastSavedBegrippen !== null) {
        begrippenChanged = currentBegrippen !== lastSavedBegrippen;
    }

    return contentChanged || begrippenChanged;
}

function showSaveStatusSuccess() {
    const area = document.getElementById('saveStatusArea');
    if (!area) return;

    _saveStatusLastSavedTime = new Date();
    _saveStatusLocked = true;

    if (_saveStatusTimer) clearTimeout(_saveStatusTimer);
    if (_saveStatusIntervalId) clearInterval(_saveStatusIntervalId);

    _setStatusText(area, 'save-status-text save-success', 'Opgeslagen!');

    _saveStatusTimer = setTimeout(() => {
        _saveStatusLocked = false;
        updateLastSavedText();
        _saveStatusIntervalId = setInterval(updateLastSavedText, 5000);
    }, 5000);
}

function updateLastSavedText() {
    const area = document.getElementById('saveStatusArea');
    if (!area) return;

    const hasUnsaved = _hasUnsavedChanges();

    if (hasUnsaved) {
        _setStatusText(area, 'save-status-text save-unsaved', 'Niet opgeslagen wijzigingen');
    } else if (_saveStatusLastSavedTime) {
        const diffMs = new Date() - _saveStatusLastSavedTime;
        const diffMin = Math.floor(diffMs / 60000);
        const timeStr = diffMin < 1 ? 'zojuist' : diffMin === 1 ? '1 min geleden' : `${diffMin} min geleden`;
        _setStatusTextTime(area, `Laatst opgeslagen ${timeStr}`);
    }
    // If no prior save and no unsaved changes, show nothing
}

function updateUnsavedIndicator() {
    const input = document.getElementById('docNameInput');
    if (!input) return;
    const hasUnsaved = _hasUnsavedChanges();
    const cleanName = input.dataset.cleanName || input.value.replace(/\s*\*$/, '');
    input.dataset.cleanName = cleanName;
    input.value = cleanName + (hasUnsaved ? ' *' : '');

    // Also update the status area — but never interrupt the "Opgeslagen!" lock
    if (_saveStatusLocked) return;
    const area = document.getElementById('saveStatusArea');
    if (!area) return;
    if (hasUnsaved) {
        _setStatusText(area, 'save-status-text save-unsaved', 'Niet opgeslagen wijzigingen');
    } else if (_saveStatusLastSavedTime) {
        const diffMs = new Date() - _saveStatusLastSavedTime;
        const diffMin = Math.floor(diffMs / 60000);
        const timeStr = diffMin < 1 ? 'zojuist' : diffMin === 1 ? '1 min geleden' : `${diffMin} min geleden`;
        _setStatusTextTime(area, `Laatst opgeslagen ${timeStr}`);
    } else {
        // No prior save and no unsaved changes — clear the area
        const current = area.querySelector('.save-status-text');
        if (current) {
            current.classList.remove('visible');
            setTimeout(() => { area.innerHTML = ''; }, 350);
        }
    }
}

function setupDocNameInput() {
    const input = document.getElementById('docNameInput');
    if (!input) return;

    function loadDocName() {
        const currentPath = window.currentFilePath || localStorage.getItem('summie_current_file_path') || '';
        const name = currentPath ? currentPath.split('\\').pop().split('/').pop().replace('.sumd', '') : '';
        input.dataset.cleanName = name;
        input.value = name;
        setTimeout(updateUnsavedIndicator, 0);
    }
    loadDocName();

    async function commitDocName() {
        const newName = input.value.replace(/\s*\*$/, '').trim();
        if (!newName) { loadDocName(); return; }

        const currentPath = window.currentFilePath || localStorage.getItem('summie_current_file_path') || '';

        if (!window.electron) {
            await window.saveToFile(false);
            return;
        }

        const { editor, begrippen } = window.AppState;

        if (!currentPath) {
            const data = {
                content: editor.innerHTML,
                begrippen,
                images: window.imageManager ? window.imageManager.getImagesData() : {},
                codeBlocks: window.codeBlockManager ? window.codeBlockManager.getCodeBlocksData() : [],
                timestamp: new Date().toISOString()
            };
            const result = await window.electron.saveSumdFile(data, null, newName);
            if (result.success) {
                window.currentFilePath = result.path;
                localStorage.setItem('summie_current_file_path', result.path);
                localStorage.setItem('summie_saved_content', editor.innerHTML);
                localStorage.setItem('summie_saved_begrippen', JSON.stringify(begrippen));
                window.AppState.lastSavedContent = editor.innerHTML;
                window.AppState.lastSavedBegrippen = JSON.stringify(begrippen);
                const savedName = result.path.split('\\').pop().split('/').pop().replace('.sumd', '');
                input.value = savedName;
                showSaveStatusSuccess();
                updateUnsavedIndicator();
                window.trackRecentDocument && window.trackRecentDocument(result.path, savedName);
            } else {
                input.value = '';
            }
            return;
        }

        // Rename existing file
        const sep = currentPath.includes('\\') ? '\\' : '/';
        const parts = currentPath.split(sep);
        parts[parts.length - 1] = newName + '.sumd';
        const newPath = parts.join(sep);

        const data = {
            content: editor.innerHTML,
            begrippen,
            images: window.imageManager ? window.imageManager.getImagesData() : {},
            codeBlocks: window.codeBlockManager ? window.codeBlockManager.getCodeBlocksData() : [],
            timestamp: new Date().toISOString()
        };

        const result = await window.electron.saveSumdFile(data, newPath);
        if (result.success) {
            window.currentFilePath = newPath;
            localStorage.setItem('summie_current_file_path', newPath);
            localStorage.setItem('summie_saved_content', editor.innerHTML);
            localStorage.setItem('summie_saved_begrippen', JSON.stringify(begrippen));
            window.AppState.lastSavedContent = editor.innerHTML;
            window.AppState.lastSavedBegrippen = JSON.stringify(begrippen);
            showSaveStatusSuccess();
            updateUnsavedIndicator();
            window.trackRecentDocument && window.trackRecentDocument(newPath, newName);
        } else {
            window.showNotification && window.showNotification('Fout', `Kon niet hernoemen: ${result.error || ''}`, 'error');
            loadDocName();
        }
    }

    input.addEventListener('blur', commitDocName);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { loadDocName(); input.blur(); }
    });

    window.updateDocNameInput = loadDocName;
    window.clearDocNameInput = () => { input.value = ''; input.dataset.cleanName = ''; };
}

// Expose
window.showSaveStatusSuccess = showSaveStatusSuccess;
window.updateLastSavedText = updateLastSavedText;
window.updateUnsavedIndicator = updateUnsavedIndicator;
window.setupDocNameInput = setupDocNameInput;