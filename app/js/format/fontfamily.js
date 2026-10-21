// ==================== FONT FAMILY MANAGER ====================
// Toolbar control for the document's typeface, in the "Lettertype" group of
// the Bewerken section. The choice applies to the whole document — not to a
// selection — and is persisted in the .sumd payload via fileio.js (fingerprint-
// tracked) and restored by applyLoadedData → DocumentFont.applyDocumentFont.
// The font catalog and state live in js/ui/document-font.js; this module is
// only the picker UI.

class FontFamilyManager {

    // Called once by topbar.js after the DOM is ready
    init() {
        this.btn = document.getElementById('fontFamilyBtn');
        this.dropdown = document.getElementById('fontFamilyDropdown');
        if (!this.btn || !this.dropdown || !window.DocumentFont) return;

        // The dropdown is detached to <body> and positioned with fixed
        // coordinates — the toolbar's scroll track clips absolutely positioned
        // popups (same reason the colour pickers live at body level).
        document.body.appendChild(this.dropdown);

        this._renderOptions();
        this._wire();
        this.updateUI();
    }

    _renderOptions() {
        window.DocumentFont.DOCUMENT_FONTS.forEach(font => {
            const option = document.createElement('button');
            option.type = 'button';
            option.className = 'font-family-option';
            option.dataset.fontId = font.id;
            // Live preview: every entry renders in its own typeface.
            option.textContent = font.id === window.DocumentFont.DEFAULT_ID
                ? SummieI18n.t('Systeemstandaard')
                : font.name;
            option.style.fontFamily = font.stack;
            option.addEventListener('click', () => this._choose(font.id));
            this.dropdown.appendChild(option);
        });
    }

    _wire() {
        this.btn.addEventListener('mousedown', e => e.preventDefault());

        this.btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = this.dropdown.classList.contains('active');
            if (!isOpen) this._open();
            else this._close();
        });

        // Close on outside click (dropdown lives at body level)
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#fontFamilyBtn') && !e.target.closest('#fontFamilyDropdown')) {
                this._close();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this._close();
        });

        // Keep the popup anchored to its button when the window resizes
        window.addEventListener('resize', () => {
            if (this.dropdown.classList.contains('active')) this._position();
        });
    }

    _open() {
        this._position();
        this.updateUI();
        this.dropdown.classList.add('active');
    }

    _close() {
        this.dropdown.classList.remove('active');
    }

    _position() {
        const rect = this.btn.getBoundingClientRect();
        const width = this.dropdown.offsetWidth || 200;
        let left = rect.left;
        if (left + width > window.innerWidth - 8) {
            left = Math.max(8, window.innerWidth - width - 8);
        }
        this.dropdown.style.left = `${left}px`;
        this.dropdown.style.top = `${rect.bottom + 6}px`;
    }

    _choose(fontId) {
        window.DocumentFont.applyDocumentFont(fontId);
        this.updateUI();
        this._close();
        // The fingerprint includes fontFamily, so this flips the doc to dirty;
        // refresh the status indicator right away.
        window.updateUnsavedIndicator && window.updateUnsavedIndicator();
    }

    // Sync button label + active option with the document's current font.
    // Called on init, after applyLoadedData and after newSummary/reset.
    updateUI() {
        if (!this.btn || !this.dropdown || !window.DocumentFont) return;
        const active = window.DocumentFont.getActiveFontId();
        const font = window.DocumentFont.DOCUMENT_FONTS.find(f => f.id === active);
        if (!font) return;

        const label = this.btn.querySelector('.font-family-label');
        if (label) {
            label.textContent = font.id === window.DocumentFont.DEFAULT_ID
                ? SummieI18n.t('Systeemstandaard')
                : font.name;
            label.style.fontFamily = font.stack;
        }
        this.dropdown.querySelectorAll('.font-family-option').forEach(opt => {
            opt.classList.toggle('active', opt.dataset.fontId === active);
        });
    }
}
