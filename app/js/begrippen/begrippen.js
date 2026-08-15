// ==================== BEGRIPPEN MANAGEMENT ====================
// openBegripModal, closeBegripModal, saveBegrip, deleteBegrip,
// updateBegrippenList, highlightBegripInList.

// Strip HTML tags and decode HTML entities to prevent code injection
// when user-supplied text is rendered via innerHTML elsewhere.
function _sanitizeBegripText(str) {
    const div = document.createElement('div');
    div.textContent = str;          // sets text, encodes special chars
    return div.textContent;         // read back: plain text, no tags
}

function _escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

let _savedScrollTop = null;
let _savedScrollEl = null;
let _savedCursorOffset = null;

function _saveEditorCursor() {
    const { editor } = window.AppState;

    // Save scroll position of the document container so we can restore it after modal closes
    const scroller = document.querySelector('.document-section') || document.querySelector('.pages-container') || document.documentElement;
    _savedScrollEl = scroller;
    _savedScrollTop = scroller.scrollTop;

    // Save the text cursor (caret) position within the editor — before focus
    // moves to the modal input — so it can be restored afterwards. Without
    // this, the selection ends up outside the editor while highlightBegrippen()
    // rebuilds the DOM, which can reset the caret (and thus the scroll view)
    // back to the top of the document.
    _savedCursorOffset = null;
    if (editor) {
        const selection = window.getSelection();
        if (selection.rangeCount > 0 && editor.contains(selection.anchorNode) && window.getTextOffset) {
            _savedCursorOffset = window.getTextOffset(editor, selection.anchorNode, selection.anchorOffset);
        }
    }
}

function _restoreEditorCursor() {
    const { editor } = window.AppState;

    // Restore the caret position first. Doing this before highlightBegrippen()
    // runs ensures that function's own cursor-preserving DOM rebuild operates
    // on a valid, in-editor selection instead of resetting to the top.
    if (_savedCursorOffset !== null && editor && window.restoreCursorPosition) {
        try {
            editor.focus({ preventScroll: true });
            window.restoreCursorPosition(editor, _savedCursorOffset);
        } catch (e) { /* ignore */ }
    }
    _savedCursorOffset = null;

    if (_savedScrollEl !== null && _savedScrollTop !== null) {
        // Restore immediately and again after any browser-triggered scroll
        _savedScrollEl.scrollTop = _savedScrollTop;
        requestAnimationFrame(() => {
            _savedScrollEl.scrollTop = _savedScrollTop;
            _savedScrollEl = null;
            _savedScrollTop = null;
        });
    }
}

function openBegripModal(begrip) {
    const state = window.AppState;
    _saveEditorCursor();
    state.currentEditingBegrip = begrip || null;

    if (begrip) {
        document.getElementById('modalTitle').textContent = SummieI18n.t('Begrip Bewerken');
        document.getElementById('begripKeyword').value = begrip.keyword;
        document.getElementById('begripDescription').value = begrip.description;
        document.getElementById('begripAliases').value = begrip.aliases ? begrip.aliases.join(', ') : '';
    } else {
        document.getElementById('modalTitle').textContent = SummieI18n.t('Begrip Toevoegen');
        document.getElementById('begripKeyword').value = '';
        document.getElementById('begripDescription').value = '';
        document.getElementById('begripAliases').value = '';
    }

    state.begripModal.classList.add('active');
    document.getElementById('begripKeyword').focus();
}

function closeBegripModal() {
    const state = window.AppState;
    state.begripModal.classList.remove('active');
    state.currentEditingBegrip = null;
    _restoreEditorCursor();
}

function saveBegrip() {
    const keyword = document.getElementById('begripKeyword').value.trim();
    const description = document.getElementById('begripDescription').value.trim();
    const aliasesInput = document.getElementById('begripAliases').value.trim();

    // Sanitize all user input to prevent HTML/script injection
    const safeKeyword = _sanitizeBegripText(keyword);
    const safeDescription = _sanitizeBegripText(description);
    const aliases = aliasesInput
        ? aliasesInput.split(',').map(a => _sanitizeBegripText(a.trim())).filter(a => a.length > 0)
        : [];

    if (!safeKeyword || (!safeDescription && aliases.length === 0)) {
        window.showNotification && window.showNotification(SummieI18n.t('Fout'), SummieI18n.t('Vul een begrip in en vul een beschrijving of minimaal één alias in.'), 'error');
        return;
    }

    const state = window.AppState;

    if (state.currentEditingBegrip) {
        state.currentEditingBegrip.keyword = safeKeyword;
        state.currentEditingBegrip.description = safeDescription;
        state.currentEditingBegrip.aliases = aliases;
        window.showNotification && window.showNotification(SummieI18n.t('Begrip bijgewerkt'), SummieI18n.t(`"${safeKeyword}" is succesvol bijgewerkt.`), 'success');
    } else {
        state.begrippen.push({ keyword: safeKeyword, description: safeDescription, aliases, id: Date.now() });
        window.showNotification && window.showNotification(SummieI18n.t('Begrip toegevoegd'), SummieI18n.t(`"${safeKeyword}" is toegevoegd aan je begrippen.`), 'success');
    }

    updateBegrippenList();
    closeBegripModal();
    window.highlightBegrippen && window.highlightBegrippen();
    window.saveToLocalStorage && window.saveToLocalStorage();
    window.updateUnsavedIndicator && window.updateUnsavedIndicator();
    window.updateBegrippenCounter && window.updateBegrippenCounter();
}

async function deleteBegrip(id) {
    const state = window.AppState;
    const begrip = state.begrippen.find(b => b.id === id);
    if (!begrip) return;

    const ok = await window.SummieDialogs.confirm(SummieI18n.t(`Weet je zeker dat je "${begrip.keyword}" wilt verwijderen?`), {
        title: SummieI18n.t('Begrip verwijderen'),
        confirmText: SummieI18n.t('Verwijderen'),
        cancelText: SummieI18n.t('Annuleren'),
        danger: true
    });
    if (ok) {
        state.begrippen = state.begrippen.filter(b => b.id !== id);
        updateBegrippenList();
        window.highlightBegrippen && window.highlightBegrippen();
        window.saveToLocalStorage && window.saveToLocalStorage();
        window.updateUnsavedIndicator && window.updateUnsavedIndicator();
        window.updateBegrippenCounter && window.updateBegrippenCounter();
        window.showNotification && window.showNotification(SummieI18n.t('Begrip verwijderd'), `"${begrip.keyword}" is verwijderd.`, 'success');
    }
}

function updateBegrippenList() {
    const { begrippenList, begrippen } = window.AppState;
    begrippenList.innerHTML = '';

    if (begrippen.length === 0) {
        begrippenList.innerHTML = '<p class="empty-state">' + SummieI18n.t('Nog geen begrippen toegevoegd.') + '</p>';
        return;
    }

    begrippen.forEach(begrip => {
        const item = document.createElement('div');
        item.className = 'begrip-item collapsed';
        item.dataset.id = begrip.id;

        const aliasesHTML = begrip.aliases && begrip.aliases.length > 0
            ? `<div class="begrip-aliases"><strong>Ook:</strong> ${begrip.aliases.map(_escapeHtml).join(', ')}</div>`
            : '';

        item.innerHTML = `
            <div class="begrip-header">
                <div class="begrip-left">
                    <div class="begrip-toggle">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9"/>
                        </svg>
                    </div>
                    <div class="begrip-keyword">${_escapeHtml(begrip.keyword)}</div>
                </div>
                <div class="begrip-actions">
                    <button class="edit" title="Bewerken">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="delete" title="Verwijderen">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="begrip-description">${_escapeHtml(begrip.description)}</div>
            ${aliasesHTML}
        `;

        item.querySelector('.begrip-header').addEventListener('click', (e) => {
            if (e.target.closest('.begrip-actions')) return;
            item.classList.toggle('collapsed');
        });

        item.querySelector('.edit').addEventListener('click', (e) => {
            e.stopPropagation();
            openBegripModal(begrip);
        });

        item.querySelector('.delete').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteBegrip(begrip.id);
        });

        begrippenList.appendChild(item);
    });
}

function highlightBegripInList(begrip) {
    const { begrippenList } = window.AppState;
    begrippenList.querySelectorAll('.begrip-item').forEach(item => {
        item.classList.remove('highlight-item');
        if (parseInt(item.dataset.id) === begrip.id) {
            item.classList.add('highlight-item');
            item.classList.remove('collapsed');
            item.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    });
}

// Expose
window.openBegripModal = openBegripModal;
window.closeBegripModal = closeBegripModal;
window.saveBegrip = saveBegrip;
window.deleteBegrip = deleteBegrip;
window.updateBegrippenList = updateBegrippenList;
window.highlightBegripInList = highlightBegripInList;