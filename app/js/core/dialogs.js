// ==================== CUSTOM DIALOGS ====================
// Replaces native window.alert()/window.confirm() with in-page modals.
// Native Electron popups steal focus from the document and (in some
// versions) leave the contenteditable unfocusable afterwards — these
// modals avoid that entirely.
//
// Usage:
//   await window.SummieDialogs.alert('Message', { title: 'Oeps' });
//   const ok = await window.SummieDialogs.confirm('Are you sure?', {
//       title: 'Verwijderen',
//       confirmText: 'Verwijderen',
//       cancelText: 'Annuleren',
//       danger: true
//   });

(function () {
    const STYLE_ID = 'summie-dialog-styles';

    function _injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .summie-dlg-overlay {
                position: fixed;
                inset: 0;
                background: rgba(15, 23, 42, 0.45);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 100000;
                animation: summie-dlg-fade-in 0.15s ease;
            }
            .summie-dlg-box {
                background: #ffffff;
                border-radius: 12px;
                box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
                width: 90%;
                max-width: 420px;
                animation: summie-dlg-slide-up 0.2s ease;
                font-family: inherit;
            }
            .summie-dlg-header {
                padding: 20px 24px 0;
            }
            .summie-dlg-title {
                font-size: 16px;
                font-weight: 600;
                color: #1e293b;
                margin: 0;
            }
            .summie-dlg-body {
                padding: 12px 24px 20px;
                font-size: 14px;
                color: #475569;
                line-height: 1.5;
                white-space: pre-wrap;
            }
            .summie-dlg-footer {
                display: flex;
                justify-content: flex-end;
                gap: 10px;
                padding: 0 24px 20px;
            }
            .summie-dlg-btn {
                padding: 9px 18px;
                border-radius: 7px;
                font-size: 14px;
                font-weight: 500;
                border: 1px solid #e2e8f0;
                background: #ffffff;
                color: #1e293b;
                cursor: pointer;
                transition: background 0.12s ease, border-color 0.12s ease;
            }
            .summie-dlg-btn:hover {
                background: #f1f5f9;
            }
            .summie-dlg-btn-primary {
                background: #3b82f6;
                border-color: #3b82f6;
                color: #ffffff;
            }
            .summie-dlg-btn-primary:hover {
                background: #2563eb;
                border-color: #2563eb;
            }
            .summie-dlg-btn-danger {
                background: #ef4444;
                border-color: #ef4444;
                color: #ffffff;
            }
            .summie-dlg-btn-danger:hover {
                background: #dc2626;
                border-color: #dc2626;
            }
            .summie-dlg-input {
                box-sizing: border-box;
                width: 100%;
                margin-top: 12px;
                padding: 10px 12px;
                border: 1px solid #cbd5e1;
                border-radius: 8px;
                font: inherit;
                font-size: 14px;
                color: #1e293b;
                background: #ffffff;
                outline: none;
            }
            .summie-dlg-input:focus {
                border-color: #3b82f6;
                box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.16);
            }
            .summie-dlg-input-error {
                border-color: #ef4444;
            }
            .summie-dlg-input-error:focus {
                border-color: #ef4444;
                box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.14);
            }
            .summie-dlg-error-text {
                margin-top: 8px;
                font-size: 12px;
                color: #dc2626;
                min-height: 16px;
            }
            .summie-dlg-btn:disabled {
                opacity: 0.48;
                cursor: not-allowed;
            }
            .summie-dlg-btn:disabled:hover {
                background: #3b82f6;
                border-color: #3b82f6;
            }
            /* ==================== DONKERE MODUS ====================
               Explicit palette (not CSS vars) because this dialog is injected
               into pages with different variable names (editor vs landing).
               Matches [data-theme='dark'] in styles.css / landing.css. */
            [data-theme='dark'] .summie-dlg-box {
                background: #12122a;
                box-shadow: 0 12px 40px rgba(0, 0, 0, 0.55);
            }
            [data-theme='dark'] .summie-dlg-title {
                color: #eee8ff;
            }
            [data-theme='dark'] .summie-dlg-body {
                color: #c9c2e8;
            }
            [data-theme='dark'] .summie-dlg-btn {
                background: #12122a;
                border-color: rgba(147, 110, 255, 0.18);
                color: #eee8ff;
            }
            [data-theme='dark'] .summie-dlg-btn:hover {
                background: #08081a;
            }
            [data-theme='dark'] .summie-dlg-input {
                border-color: rgba(147, 110, 255, 0.25);
                color: #eee8ff;
                background: #08081a;
            }
            @keyframes summie-dlg-fade-in {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes summie-dlg-slide-up {
                from { opacity: 0; transform: translateY(24px); }
                to { opacity: 1; transform: translateY(0); }
            }
        `;
        document.head.appendChild(style);
    }

    function _escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // Build the overlay + box, return { overlay, box }
    function _buildBase(message, title) {
        _injectStyles();

        const overlay = document.createElement('div');
        overlay.className = 'summie-dlg-overlay';

        const box = document.createElement('div');
        box.className = 'summie-dlg-box';

        let html = '';
        if (title) {
            html += `<div class="summie-dlg-header"><h3 class="summie-dlg-title">${_escapeHtml(title)}</h3></div>`;
        }
        html += `<div class="summie-dlg-body">${_escapeHtml(message)}</div>`;
        box.innerHTML = html;

        overlay.appendChild(box);
        return { overlay, box };
    }

    // Remember the element that had focus before the dialog opened, so we
    // can restore it afterwards (important for the contenteditable editor).
    function _withFocusRestore(close) {
        const previouslyFocused = document.activeElement;
        return (...args) => {
            close(...args);
            if (previouslyFocused && document.body.contains(previouslyFocused) && previouslyFocused.focus) {
                previouslyFocused.focus();
            }
        };
    }

    function alertDialog(message, options = {}) {
        return new Promise(resolve => {
            const { overlay, box } = _buildBase(message, options.title || null);

            const footer = document.createElement('div');
            footer.className = 'summie-dlg-footer';
            const okBtn = document.createElement('button');
            okBtn.className = 'summie-dlg-btn summie-dlg-btn-primary';
            okBtn.textContent = options.okText || SummieI18n.t('OK');
            footer.appendChild(okBtn);
            box.appendChild(footer);

            document.body.appendChild(overlay);

            const close = _withFocusRestore(() => {
                overlay.remove();
                resolve();
            });

            okBtn.addEventListener('click', () => close());
            overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
            document.addEventListener('keydown', function onKey(e) {
                if (e.key === 'Escape' || e.key === 'Enter') {
                    document.removeEventListener('keydown', onKey);
                    close();
                }
            });

            okBtn.focus();
        });
    }

    function confirmDialog(message, options = {}) {
        return new Promise(resolve => {
            const { overlay, box } = _buildBase(message, options.title || null);

            if (options.detail) {
                const detailEl = document.createElement('div');
                detailEl.className = 'summie-dlg-body';
                detailEl.style.paddingTop = '0';
                detailEl.style.color = '#94a3b8';
                detailEl.style.fontSize = '13px';
                detailEl.textContent = options.detail;
                box.appendChild(detailEl);
            }

            const footer = document.createElement('div');
            footer.className = 'summie-dlg-footer';

            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'summie-dlg-btn';
            cancelBtn.textContent = options.cancelText || SummieI18n.t('Annuleren');

            const confirmBtn = document.createElement('button');
            confirmBtn.className = 'summie-dlg-btn ' + (options.danger ? 'summie-dlg-btn-danger' : 'summie-dlg-btn-primary');
            confirmBtn.textContent = options.confirmText || SummieI18n.t('OK');

            footer.appendChild(cancelBtn);
            footer.appendChild(confirmBtn);
            box.appendChild(footer);

            document.body.appendChild(overlay);

            const close = _withFocusRestore((result) => {
                overlay.remove();
                resolve(result);
            });

            confirmBtn.addEventListener('click', () => close(true));
            cancelBtn.addEventListener('click', () => close(false));
            overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });
            document.addEventListener('keydown', function onKey(e) {
                if (e.key === 'Escape') {
                    document.removeEventListener('keydown', onKey);
                    close(false);
                } else if (e.key === 'Enter') {
                    document.removeEventListener('keydown', onKey);
                    close(true);
                }
            });

            confirmBtn.focus();
        });
    }

    // Multi-button choice dialog (e.g. "Opslaan / Niet opslaan / Annuleren").
    // options.buttons = [{ label, value, primary?, danger? }]
    // Returns the `value` of the clicked button, or options.escValue on Escape.
    function choiceDialog(message, options = {}) {
        return new Promise(resolve => {
            const { overlay, box } = _buildBase(message, options.title || null);

            if (options.detail) {
                const detailEl = document.createElement('div');
                detailEl.className = 'summie-dlg-body';
                detailEl.style.paddingTop = '0';
                detailEl.style.color = '#94a3b8';
                detailEl.style.fontSize = '13px';
                detailEl.textContent = options.detail;
                box.appendChild(detailEl);
            }

            const footer = document.createElement('div');
            footer.className = 'summie-dlg-footer';

            const buttons = options.buttons || [{ label: SummieI18n.t('OK'), value: 'ok', primary: true }];
            const close = _withFocusRestore((value) => {
                overlay.remove();
                resolve(value);
            });

            buttons.forEach(def => {
                const btn = document.createElement('button');
                btn.className = 'summie-dlg-btn'
                    + (def.primary ? ' summie-dlg-btn-primary' : '')
                    + (def.danger ? ' summie-dlg-btn-danger' : '');
                btn.textContent = def.label;
                btn.addEventListener('click', () => close(def.value));
                footer.appendChild(btn);
            });

            box.appendChild(footer);
            document.body.appendChild(overlay);

            overlay.addEventListener('click', e => { if (e.target === overlay) close(options.escValue); });
            document.addEventListener('keydown', function onKey(e) {
                if (e.key === 'Escape') {
                    document.removeEventListener('keydown', onKey);
                    close(options.escValue);
                }
            });

            // Focus the primary button if present, otherwise the last button
            const primaryBtn = footer.querySelector('.summie-dlg-btn-primary') || footer.lastElementChild;
            if (primaryBtn) primaryBtn.focus();
        });
    }

    function promptDialog(message, options = {}) {
        return new Promise(resolve => {
            const { overlay, box } = _buildBase(message, options.title || null);

            const body = box.querySelector('.summie-dlg-body');
            const input = document.createElement('input');
            input.className = 'summie-dlg-input';
            input.type = options.password ? 'password' : 'text';
            input.value = options.value || '';
            input.placeholder = options.placeholder || '';
            input.autocomplete = options.password ? 'new-password' : 'off';
            body.appendChild(input);

            if (options.secondPlaceholder) {
                const input2 = document.createElement('input');
                input2.className = 'summie-dlg-input';
                input2.type = options.password ? 'password' : 'text';
                input2.placeholder = options.secondPlaceholder;
                input2.autocomplete = options.password ? 'new-password' : 'off';
                input2.style.marginTop = '8px';
                body.appendChild(input2);
                input._secondInput = input2;

                const errorText = document.createElement('div');
                errorText.className = 'summie-dlg-error-text';
                body.appendChild(errorText);
                input._errorText = errorText;
            }

            const footer = document.createElement('div');
            footer.className = 'summie-dlg-footer';

            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'summie-dlg-btn';
            cancelBtn.textContent = options.cancelText || SummieI18n.t('Annuleren');

            const okBtn = document.createElement('button');
            okBtn.className = 'summie-dlg-btn summie-dlg-btn-primary';
            okBtn.textContent = options.confirmText || SummieI18n.t('OK');

            footer.appendChild(cancelBtn);
            footer.appendChild(okBtn);
            box.appendChild(footer);
            document.body.appendChild(overlay);

            const close = _withFocusRestore((value) => {
                overlay.remove();
                resolve(value);
            });

            const submit = () => {
                if (okBtn.disabled) return;
                if (input._secondInput) close([input.value, input._secondInput.value]);
                else close(input.value);
            };

            const validate = () => {
                if (!input._secondInput) return;
                const first = input.value;
                const second = input._secondInput.value;
                const empty = !first || !second;
                const mismatch = !!first && !!second && first !== second;
                okBtn.disabled = empty || mismatch;
                input._secondInput.classList.toggle('summie-dlg-input-error', mismatch);
                input._errorText.textContent = mismatch ? SummieI18n.t('De wachtwoorden zijn niet hetzelfde.') : '';
            };

            okBtn.addEventListener('click', submit);
            input.addEventListener('input', validate);
            input._secondInput?.addEventListener('input', validate);
            cancelBtn.addEventListener('click', () => close(null));
            overlay.addEventListener('click', e => { if (e.target === overlay) close(null); });
            document.addEventListener('keydown', function onKey(e) {
                if (!overlay.isConnected) {
                    document.removeEventListener('keydown', onKey);
                    return;
                }
                if (e.key === 'Escape') {
                    document.removeEventListener('keydown', onKey);
                    close(null);
                } else if (e.key === 'Enter' && (document.activeElement === input || document.activeElement === input._secondInput)) {
                    document.removeEventListener('keydown', onKey);
                    submit();
                }
            });

            input.focus();
            validate();
        });
    }

    window.SummieDialogs = {
        alert: alertDialog,
        confirm: confirmDialog,
        choice: choiceDialog,
        prompt: promptDialog,
    };
})();
