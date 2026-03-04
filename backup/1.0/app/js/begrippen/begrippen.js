// ==================== BEGRIPPEN MANAGEMENT ====================
// openBegripModal, closeBegripModal, saveBegrip, deleteBegrip,
// updateBegrippenList, highlightBegripInList.

function openBegripModal(begrip) {
    const state = window.AppState;
    state.currentEditingBegrip = begrip || null;

    if (begrip) {
        document.getElementById('modalTitle').textContent = 'Begrip Bewerken';
        document.getElementById('begripKeyword').value = begrip.keyword;
        document.getElementById('begripDescription').value = begrip.description;
        document.getElementById('begripAliases').value = begrip.aliases ? begrip.aliases.join(', ') : '';
    } else {
        document.getElementById('modalTitle').textContent = 'Begrip Toevoegen';
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
}

function saveBegrip() {
    const keyword = document.getElementById('begripKeyword').value.trim();
    const description = document.getElementById('begripDescription').value.trim();
    const aliasesInput = document.getElementById('begripAliases').value.trim();

    if (!keyword || !description) {
        window.showNotification && window.showNotification('Fout', 'Vul beide velden in.', 'error');
        return;
    }

    const aliases = aliasesInput
        ? aliasesInput.split(',').map(a => a.trim()).filter(a => a.length > 0)
        : [];

    const state = window.AppState;

    if (state.currentEditingBegrip) {
        state.currentEditingBegrip.keyword = keyword;
        state.currentEditingBegrip.description = description;
        state.currentEditingBegrip.aliases = aliases;
        window.showNotification && window.showNotification('Begrip bijgewerkt', `"${keyword}" is succesvol bijgewerkt.`, 'success');
    } else {
        state.begrippen.push({ keyword, description, aliases, id: Date.now() });
        window.showNotification && window.showNotification('Begrip toegevoegd', `"${keyword}" is toegevoegd aan je begrippen.`, 'success');
    }

    updateBegrippenList();
    closeBegripModal();
    window.highlightBegrippen && window.highlightBegrippen();
    window.saveToLocalStorage && window.saveToLocalStorage();
    window.updateUnsavedIndicator && window.updateUnsavedIndicator();
    window.updateBegrippenCounter && window.updateBegrippenCounter();
}

function deleteBegrip(id) {
    const state = window.AppState;
    const begrip = state.begrippen.find(b => b.id === id);
    if (!begrip) return;

    if (confirm(`Weet je zeker dat je "${begrip.keyword}" wilt verwijderen?`)) {
        state.begrippen = state.begrippen.filter(b => b.id !== id);
        updateBegrippenList();
        window.highlightBegrippen && window.highlightBegrippen();
        window.saveToLocalStorage && window.saveToLocalStorage();
        window.updateUnsavedIndicator && window.updateUnsavedIndicator();
        window.updateBegrippenCounter && window.updateBegrippenCounter();
        window.showNotification && window.showNotification('Begrip verwijderd', `"${begrip.keyword}" is verwijderd.`, 'success');
    }
}

function updateBegrippenList() {
    const { begrippenList, begrippen } = window.AppState;
    begrippenList.innerHTML = '';

    if (begrippen.length === 0) {
        begrippenList.innerHTML = '<p class="empty-state">Nog geen begrippen toegevoegd.</p>';
        return;
    }

    begrippen.forEach(begrip => {
        const item = document.createElement('div');
        item.className = 'begrip-item collapsed';
        item.dataset.id = begrip.id;

        const aliasesHTML = begrip.aliases && begrip.aliases.length > 0
            ? `<div class="begrip-aliases"><strong>Ook:</strong> ${begrip.aliases.join(', ')}</div>`
            : '';

        item.innerHTML = `
            <div class="begrip-header">
                <div class="begrip-left">
                    <div class="begrip-toggle">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9"/>
                        </svg>
                    </div>
                    <div class="begrip-keyword">${begrip.keyword}</div>
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
            <div class="begrip-description">${begrip.description}</div>
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