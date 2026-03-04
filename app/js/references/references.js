// ==================== REFERENCES ====================
// References point to sections of the document (text, codeblocks, images).
// A reference has a name and a target element in the document.

window.ReferencesManager = {
    references: [],
    pendingRefName: null,
    selectionRange: null,

    init() {
        this._setupSelectionButton();
        this._setupEditorObserver();
    },

    // ---- Data ----

    addReference(name, targetEl) {
        // Assign a unique ID to the target element
        const id = 'ref-target-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
        targetEl.dataset.refId = id;
        targetEl.classList.add('ref-target');

        this.references.push({ id, name, targetEl });
        this._highlightReferenceWords();
        this._updateReferencesPanelIfOpen();
        window.saveToLocalStorage && window.saveToLocalStorage();
        window.updateUnsavedIndicator && window.updateUnsavedIndicator();
        window.showNotification && window.showNotification('Verwijzing toegevoegd', `"${name}" is toegevoegd.`, 'success');
    },

    deleteReference(id) {
        const ref = this.references.find(r => r.id === id);
        if (!ref) return;
        if (!confirm(`Verwijzing "${ref.name}" verwijderen?`)) return;
        // Remove marker from document
        if (ref.targetEl && ref.targetEl.isConnected) {
            ref.targetEl.classList.remove('ref-target');
            delete ref.targetEl.dataset.refId;
        }
        this.references = this.references.filter(r => r.id !== id);
        this._highlightReferenceWords();
        this._updateReferencesPanelIfOpen();
        window.saveToLocalStorage && window.saveToLocalStorage();
        window.showNotification && window.showNotification('Verwijzing verwijderd', `"${ref.name}" is verwijderd.`, 'success');
    },

    // ---- Highlighting keywords in document ----

    _highlightReferenceWords() {
        const editor = window.AppState.editor;
        if (!editor) return;

        // Remove old reference spans
        editor.querySelectorAll('.reference-word').forEach(span => {
            span.parentNode.replaceChild(document.createTextNode(span.textContent), span);
        });
        editor.normalize();

        if (this.references.length === 0) return;

        // Save cursor
        const selection = window.getSelection();
        let cursorOffset = null;
        if (selection.rangeCount > 0 && editor.contains(selection.anchorNode)) {
            cursorOffset = window.getTextOffset && window.getTextOffset(editor, selection.anchorNode, selection.anchorOffset);
        }

        const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null, false);
        const nodesToProcess = [];
        let node;
        while (node = walker.nextNode()) {
            let parent = node.parentElement;
            let skip = false;
            while (parent && parent !== editor) {
                if (parent.classList && (
                    parent.classList.contains('code-block-wrapper') ||
                    parent.classList.contains('code-block') ||
                    parent.tagName === 'STYLE' ||
                    parent.tagName === 'SCRIPT'
                )) { skip = true; break; }
                parent = parent.parentElement;
            }
            if (!skip) nodesToProcess.push(node);
        }

        nodesToProcess.forEach(textNode => {
            const text = textNode.textContent;
            const matches = [];
            this.references.forEach(ref => {
                const regex = new RegExp(`\\b${window.escapeRegex ? window.escapeRegex(ref.name) : ref.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
                let m;
                while ((m = regex.exec(text)) !== null) {
                    matches.push({ start: m.index, end: m.index + m[0].length, text: m[0], refId: ref.id, refName: ref.name });
                }
            });
            if (matches.length === 0) return;
            matches.sort((a, b) => a.start - b.start);

            const fragment = document.createDocumentFragment();
            let lastIndex = 0;
            matches.forEach(m => {
                if (m.start > lastIndex) fragment.appendChild(document.createTextNode(text.substring(lastIndex, m.start)));
                const span = document.createElement('span');
                span.className = 'reference-word';
                span.dataset.refId = m.refId;
                span.textContent = m.text;
                fragment.appendChild(span);
                lastIndex = m.end;
            });
            if (lastIndex < text.length) fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
            textNode.parentNode.replaceChild(fragment, textNode);
        });

        if (cursorOffset !== null && window.restoreCursorPosition) {
            window.restoreCursorPosition(editor, cursorOffset);
        }
    },

    // ---- Tooltip / Preview ----

    showReferencePreview(element) {
        const refId = element.dataset.refId;
        const ref = this.references.find(r => r.id === refId);
        if (!ref) return;

        let tooltip = document.getElementById('referenceTooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'referenceTooltip';
            tooltip.className = 'reference-tooltip';
            document.body.appendChild(tooltip);
        }

        // Render the target element content
        let previewHTML = '';
        if (ref.targetEl && ref.targetEl.isConnected) {
            const clone = ref.targetEl.cloneNode(true);
            // Remove any edit buttons (like code block buttons) from preview
            clone.querySelectorAll('.code-block-actions, .image-actions, .ref-select-btn').forEach(el => el.remove());
            previewHTML = clone.outerHTML;
        } else {
            previewHTML = '<em style="color:var(--text-secondary)">Doel niet gevonden in document.</em>';
        }

        tooltip.innerHTML = `
            <div class="ref-tooltip-header">
                <span class="ref-tooltip-name">${ref.name}</span>
                <button class="ref-tooltip-jump" data-ref-id="${ref.id}" title="Spring naar">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="15 10 20 15 15 20"/>
                        <path d="M4 4v7a4 4 0 0 0 4 4h12"/>
                    </svg>
                    Spring
                </button>
            </div>
            <div class="ref-tooltip-preview">${previewHTML}</div>
        `;

        tooltip.querySelector('.ref-tooltip-jump').addEventListener('click', () => {
            this.hideReferencePreview();
            this.jumpToReference(ref.id);
        });

        // Position
        tooltip.style.visibility = 'hidden';
        tooltip.style.display = 'block';
        tooltip.classList.add('active');

        const rect = element.getBoundingClientRect();
        const tipRect = tooltip.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const gap = 8;

        let top = rect.bottom + gap;
        if (top + tipRect.height > vh - 8) top = rect.top - gap - tipRect.height;
        let left = rect.left;
        left = Math.max(8, Math.min(left, vw - tipRect.width - 8));

        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';
        tooltip.style.visibility = '';

        // Bind with a named bound function so we can remove it later
        if (this._boundOutsideHandler) {
            document.removeEventListener('click', this._boundOutsideHandler);
        }
        this._boundOutsideHandler = (e) => {
            if (!tooltip.contains(e.target) && !e.target.classList.contains('reference-word')) {
                this.hideReferencePreview();
            }
        };
        setTimeout(() => {
            document.addEventListener('click', this._boundOutsideHandler);
        }, 0);
    },

    hideReferencePreview() {
        const tooltip = document.getElementById('referenceTooltip');
        if (tooltip) tooltip.classList.remove('active');
        if (this._boundOutsideHandler) {
            document.removeEventListener('click', this._boundOutsideHandler);
            this._boundOutsideHandler = null;
        }
    },

    jumpToReference(refId) {
        const ref = this.references.find(r => r.id === refId);
        if (!ref || !ref.targetEl || !ref.targetEl.isConnected) return;
        ref.targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        ref.targetEl.classList.add('ref-target-highlight');
        setTimeout(() => ref.targetEl.classList.remove('ref-target-highlight'), 1500);
    },

    // ---- Selection handling (text selection button) ----

    _setupSelectionButton() {
        // Create floating 'Selecteer als verwijzingsdoel' button
        const btn = document.createElement('button');
        btn.id = 'refSelectTextBtn';
        btn.className = 'ref-select-floating-btn';
        btn.innerHTML = `
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
            Selecteer als doel
        `;
        btn.style.display = 'none';
        document.body.appendChild(btn);
        this._floatingSelectBtn = btn;

        btn.addEventListener('mousedown', (e) => e.preventDefault());
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._captureTextSelection();
        });

        // Listen for selections
        document.addEventListener('selectionchange', () => {
            this._onSelectionChange();
        });
    },

    _onSelectionChange() {
        // Only show if we're in "selection mode" (reference modal is open and waiting)
        if (!this._awaitingSelection) return;

        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
            this._floatingSelectBtn.style.display = 'none';
            return;
        }

        const range = sel.getRangeAt(0);
        const editor = window.AppState.editor;
        if (!editor || !editor.contains(range.commonAncestorContainer)) {
            this._floatingSelectBtn.style.display = 'none';
            return;
        }

        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) {
            this._floatingSelectBtn.style.display = 'none';
            return;
        }

        const btn = this._floatingSelectBtn;
        btn.style.display = 'flex';
        // Position above selection
        const btnWidth = 160;
        let left = rect.left + rect.width / 2 - btnWidth / 2;
        left = Math.max(8, Math.min(left, window.innerWidth - btnWidth - 8));
        btn.style.left = left + 'px';
        btn.style.top = (rect.top - 40 + window.scrollY) + 'px';

        this.selectionRange = range.cloneRange();
    },

    _captureTextSelection() {
        if (!this.selectionRange) return;
        // Wrap selection in a span that serves as the reference target
        const span = document.createElement('span');
        span.className = 'ref-target-selection';
        try {
            this.selectionRange.surroundContents(span);
        } catch (e) {
            // If surroundContents fails (partial node selection), use extractContents
            const frag = this.selectionRange.extractContents();
            span.appendChild(frag);
            this.selectionRange.insertNode(span);
        }
        this._floatingSelectBtn.style.display = 'none';
        this._awaitingSelection = false;
        document.body.classList.remove('ref-selecting');
        this._hideSelectModeBanner();

        // Confirm and save
        this._finalizeReference(span);
    },

    _setupEditorObserver() {
        // Add 'Selecteer als doel' buttons on images, code blocks, and tables
        const editor = window.AppState.editor;
        if (!editor) return;

        const addSelectButtons = () => {
            editor.querySelectorAll('img:not([data-ref-btn]), .code-block-wrapper:not([data-ref-btn]), table.summie-table:not([data-ref-btn])').forEach(el => {
                this._addSelectButtonToElement(el);
            });
        };

        // Initial scan after a short delay (so code blocks etc. are rendered)
        setTimeout(addSelectButtons, 500);

        const observer = new MutationObserver(() => {
            setTimeout(addSelectButtons, 200);
        });
        observer.observe(editor, { childList: true, subtree: true });
    },

    _addSelectButtonToElement(el) {
        // Skip if already has a button, or if already wrapped
        if (el.dataset.refBtn) return;
        if (el.parentElement && el.parentElement.classList.contains('ref-select-btn-wrapper')) return;

        el.dataset.refBtn = '1';
        const btn = document.createElement('button');
        btn.className = 'ref-select-btn';
        btn.title = 'Selecteer als verwijzingsdoel';
        btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> Selecteer`;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (this._awaitingSelection) {
                this._finalizeReference(el);
            } else {
                this._targetEl = el;
                openReferenceModal(null, el);
            }
        });

        const wrapper = document.createElement('div');
        wrapper.className = 'ref-select-btn-wrapper';
        el.parentNode.insertBefore(wrapper, el);
        wrapper.appendChild(btn);
        wrapper.appendChild(el);
    },

    _awaitingSelection: false,
    _targetEl: null,

    startSelectionMode(name) {
        this.pendingRefName = name;
        this._awaitingSelection = true;
        this._floatingSelectBtn.style.display = 'none';
        document.body.classList.add('ref-selecting');

        // Show cancel banner
        this._showSelectModeBanner();

        // Allow Escape to cancel selection mode
        const escHandler = (e) => {
            if (e.key === 'Escape' && this._awaitingSelection) {
                this._cancelSelectionMode();
                document.removeEventListener('keydown', escHandler);
            }
        };
        this._escHandler = escHandler;
        document.addEventListener('keydown', escHandler);
    },

    _showSelectModeBanner() {
        let banner = document.getElementById('refSelectBanner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'refSelectBanner';
            banner.className = 'ref-select-banner';
            banner.innerHTML =
                '<span class="ref-select-banner-text">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
                '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>' +
                '<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>' +
                '</svg>' +
                'Selecteer een doel in het document' +
                '</span>' +
                '<button class="ref-select-banner-cancel" id="refSelectBannerCancel">Annuleren</button>';
            document.body.appendChild(banner);
            document.getElementById('refSelectBannerCancel').addEventListener('click', () => {
                this._cancelSelectionMode();
            });
        }
        banner.classList.add('active');
    },

    _hideSelectModeBanner() {
        const banner = document.getElementById('refSelectBanner');
        if (banner) banner.classList.remove('active');
    },

    _cancelSelectionMode() {
        this._awaitingSelection = false;
        this._floatingSelectBtn.style.display = 'none';
        document.body.classList.remove('ref-selecting');
        this.pendingRefName = null;
        this._hideSelectModeBanner();
        if (this._escHandler) {
            document.removeEventListener('keydown', this._escHandler);
            this._escHandler = null;
        }
    },

    _finalizeReference(targetEl) {
        const name = this.pendingRefName;
        if (!name) return;
        this.pendingRefName = null;
        this._awaitingSelection = false;
        this._floatingSelectBtn.style.display = 'none';
        document.body.classList.remove('ref-selecting');
        this._hideSelectModeBanner();
        if (this._escHandler) {
            document.removeEventListener('keydown', this._escHandler);
            this._escHandler = null;
        }
        this.addReference(name, targetEl);
    },

    // ---- References Panel ----

    renderReferencesList(container) {
        container.innerHTML = '';
        if (this.references.length === 0) {
            container.innerHTML = '<p class="empty-state">Nog geen verwijzingen toegevoegd.</p>';
            return;
        }
        this.references.forEach(ref => {
            const item = document.createElement('div');
            item.className = 'reference-item';
            item.innerHTML = `
                <div class="reference-item-header">
                    <span class="reference-item-name">${ref.name}</span>
                    <div class="reference-item-actions">
                        <button class="ref-jump-btn" data-ref-id="${ref.id}" title="Spring naar">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="15 10 20 15 15 20"/>
                                <path d="M4 4v7a4 4 0 0 0 4 4h12"/>
                            </svg>
                        </button>
                        <button class="ref-delete-btn" data-ref-id="${ref.id}" title="Verwijderen">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="reference-item-preview">
                    ${this._getPreviewHTML(ref)}
                </div>
            `;
            item.querySelector('.ref-jump-btn').addEventListener('click', () => this.jumpToReference(ref.id));
            item.querySelector('.ref-delete-btn').addEventListener('click', () => this.deleteReference(ref.id));
            container.appendChild(item);
        });
    },

    _getPreviewHTML(ref) {
        if (!ref.targetEl || !ref.targetEl.isConnected) {
            return '<em style="opacity:.5;font-size:12px">Doel niet meer aanwezig</em>';
        }
        const clone = ref.targetEl.cloneNode(true);
        clone.querySelectorAll('.code-block-actions, .image-actions, .ref-select-btn-wrapper > button, .ref-select-btn').forEach(el => el.remove());
        if (ref.targetEl.tagName === 'TABLE') {
            return '<span style="font-size:12px;opacity:.7">📋 Tabel</span>';
        }
        if (ref.targetEl.tagName === 'IMG') {
            return '<span style="font-size:12px;opacity:.7">📷 Afbeelding</span>';
        }
        if (ref.targetEl.classList && ref.targetEl.classList.contains('code-block-wrapper')) {
            return '<span style="font-size:12px;opacity:.7">💻 Codeblok</span>';
        }
        const text = clone.textContent;
        if (text.length > 80) {
            return `<span style="font-size:12px;opacity:.7">${text.substring(0, 80)}…</span>`;
        }
        return `<span style="font-size:12px;opacity:.7">${clone.innerHTML || text}</span>`;
    },

    _updateReferencesPanelIfOpen() {
        const panel = document.getElementById('references-panel');
        if (panel && panel.classList.contains('active')) {
            const list = panel.querySelector('.references-list');
            if (list) this.renderReferencesList(list);
        }
    },

    // ---- Serialisation ----

    getSerialised() {
        return this.references.map(ref => ({
            id: ref.id,
            name: ref.name,
            // We save the ref by its position in the DOM (data-ref-id attribute)
        }));
    },

    restoreFromEditor() {
        // After loading a document, re-connect references to their DOM targets
        const editor = window.AppState.editor;
        if (!editor) return;
        this.references.forEach(ref => {
            const el = editor.querySelector(`[data-ref-id="${ref.id}"]`);
            if (el) {
                ref.targetEl = el;
                el.classList.add('ref-target');
            }
        });
        this._highlightReferenceWords();
    }
};

// ---- Modal ----

function openReferenceModal(existingRef, preselectedTarget) {
    let modal = document.getElementById('referenceModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'referenceModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:460px">
                <div class="modal-header">
                    <h3>Verwijzing toevoegen</h3>
                    <button class="close-btn" id="closeReferenceModal">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>Naam van de verwijzing</label>
                        <input type="text" id="referenceNameInput" placeholder="Bijv. Figuur 1, Tabel 2..." spellcheck="false">
                        <small style="color:var(--text-secondary);font-size:12px;margin-top:4px;display:block">Dit woord in je document wordt klikbaar als verwijzing.</small>
                    </div>
                    <div class="form-group" id="refTargetGroup">
                        <label>Doel in het document</label>
                        <div id="refTargetStatus" class="ref-target-status">
                            <span id="refTargetStatusText" style="color:var(--text-secondary);font-size:13px">Nog geen doel geselecteerd.</span>
                        </div>
                        <small style="color:var(--text-secondary);font-size:12px;margin-top:4px;display:block">Selecteer tekst, of klik op "Selecteer" boven een afbeelding/codeblok.</small>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn" id="cancelReferenceModal">Annuleren</button>
                    <button class="btn" id="refSelectTargetBtn" style="border-color:var(--primary-color);color:var(--primary-color)">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                        Selecteer doel in document
                    </button>
                    <button class="btn btn-primary" id="saveReferenceBtn">Opslaan</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('closeReferenceModal').addEventListener('click', () => closeReferenceModal());
        document.getElementById('cancelReferenceModal').addEventListener('click', () => closeReferenceModal());

        document.getElementById('refSelectTargetBtn').addEventListener('click', () => {
            const name = document.getElementById('referenceNameInput').value.trim();
            if (!name) {
                window.showNotification && window.showNotification('Fout', 'Voer eerst een naam in.', 'error');
                return;
            }
            window.ReferencesManager.startSelectionMode(name);
            closeReferenceModal(true); // close but keep selection mode active
        });

        document.getElementById('saveReferenceBtn').addEventListener('click', () => {
            const name = document.getElementById('referenceNameInput').value.trim();
            if (!name) {
                window.showNotification && window.showNotification('Fout', 'Vul een naam in.', 'error');
                return;
            }
            const target = window.ReferencesManager._pendingModalTarget;
            if (!target) {
                window.showNotification && window.showNotification('Fout', 'Selecteer eerst een doel.', 'error');
                return;
            }
            window.ReferencesManager._pendingModalTarget = null;
            closeReferenceModal();
            window.ReferencesManager.addReference(name, target);
        });
    }

    // Pre-fill
    document.getElementById('referenceNameInput').value = '';
    document.getElementById('referenceNameInput').focus();

    if (preselectedTarget) {
        window.ReferencesManager._pendingModalTarget = preselectedTarget;
        const statusText = document.getElementById('refTargetStatusText');
        const text = preselectedTarget.tagName === 'IMG' ? '📷 Afbeelding geselecteerd' :
            preselectedTarget.classList.contains('code-block-wrapper') ? '💻 Codeblok geselecteerd' :
                preselectedTarget.tagName === 'TABLE' ? '📋 Tabel geselecteerd' :
                    `"${preselectedTarget.textContent.substring(0, 40)}…" geselecteerd`;
        statusText.textContent = text;
        statusText.style.color = 'var(--success-color)';
    } else {
        window.ReferencesManager._pendingModalTarget = null;
        const statusText = document.getElementById('refTargetStatusText');
        statusText.textContent = 'Nog geen doel geselecteerd.';
        statusText.style.color = 'var(--text-secondary)';
    }

    modal.classList.add('active');
}

function closeReferenceModal(keepSelectionMode) {
    const modal = document.getElementById('referenceModal');
    if (modal) modal.classList.remove('active');
    if (!keepSelectionMode) {
        window.ReferencesManager._awaitingSelection = false;
        window.ReferencesManager._floatingSelectBtn.style.display = 'none';
        document.body.classList.remove('ref-selecting');
    }
}

window.openReferenceModal = openReferenceModal;
window.closeReferenceModal = closeReferenceModal;