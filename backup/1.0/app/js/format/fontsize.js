// ==================== FONT SIZE MANAGER ====================
// Handles all font size UI logic: A-/A+ buttons, number input, dropdown.
// Receives the topbar manager instance so it can share savedRange and
// _suppressSelectionUpdate without duplicating that state.

class FontSizeManager {
    constructor(topbarManager) {
        this.tb = topbarManager; // reference to TopbarManager for shared range/suppress state
    }

    // Called once by topbar.js after the DOM is ready
    init() {
        const input = document.getElementById('fontSizeInput');
        const decBtn = document.getElementById('fontSizeDecBtn');
        const incBtn = document.getElementById('fontSizeIncBtn');
        const dropdown = document.getElementById('fontSizeDropdown');
        if (!input || !decBtn || !incBtn || !dropdown) return;

        // ── Apply ──────────────────────────────────────────────────────────
        const applySize = (size) => {
            size = Math.max(6, Math.min(96, parseInt(size)));
            if (isNaN(size)) return;
            input.value = size;

            if (!this.tb.savedRange) return;

            this.tb._suppressSelectionUpdate = true;

            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(this.tb.savedRange.cloneRange());

            const range = sel.getRangeAt(0);

            if (range.collapsed) {
                this.tb._suppressSelectionUpdate = false;
                this._markActive(size);
                return;
            }

            // Wrap selection in a sized <span> — no execCommand, so the
            // browser never collapses the selection on its own
            const fragment = range.extractContents();
            const span = document.createElement('span');
            span.style.fontSize = size + 'px';
            span.appendChild(fragment);
            range.insertNode(span);

            // Re-select span contents so the highlight persists
            const newRange = document.createRange();
            newRange.selectNodeContents(span);
            sel.removeAllRanges();
            sel.addRange(newRange);

            // Save for consecutive clicks
            this.tb.savedRange = newRange.cloneRange();

            this._markActive(size);

            requestAnimationFrame(() => {
                this.tb._suppressSelectionUpdate = false;
            });
        };

        // ── A- / A+ buttons ───────────────────────────────────────────────
        decBtn.addEventListener('mousedown', e => {
            e.preventDefault();
            if (!this.tb._suppressSelectionUpdate) this.tb.saveCurrentRange();
        });
        decBtn.addEventListener('click', () => applySize((parseInt(input.value) || 16) - 1));

        incBtn.addEventListener('mousedown', e => {
            e.preventDefault();
            if (!this.tb._suppressSelectionUpdate) this.tb.saveCurrentRange();
        });
        incBtn.addEventListener('click', () => applySize((parseInt(input.value) || 16) + 1));

        // ── Number input ──────────────────────────────────────────────────
        input.addEventListener('focus', () => {
            this.tb.saveCurrentRange();
            dropdown.classList.add('active');
        });
        input.addEventListener('blur', () => {
            setTimeout(() => {
                dropdown.classList.remove('active');
                applySize(input.value);
            }, 150);
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
            if (e.key === 'Escape') { dropdown.classList.remove('active'); input.blur(); }
            if (e.key === 'ArrowUp') { e.preventDefault(); applySize((parseInt(input.value) || 16) + 1); }
            if (e.key === 'ArrowDown') { e.preventDefault(); applySize((parseInt(input.value) || 16) - 1); }
        });
        input.addEventListener('input', () => this._markActive(parseInt(input.value)));

        // ── Dropdown options ───────────────────────────────────────────────
        dropdown.querySelectorAll('.font-size-option').forEach(btn => {
            btn.addEventListener('mousedown', e => e.preventDefault());
            btn.addEventListener('click', () => {
                applySize(parseInt(btn.dataset.size));
                dropdown.classList.remove('active');
                document.getElementById('editor')?.focus();
            });
        });

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.font-size-input-wrapper')) {
                dropdown.classList.remove('active');
            }
        });
    }

    // Called by topbar.js on selectionchange to sync the input with the cursor position
    updateFromSelection() {
        const input = document.getElementById('fontSizeInput');
        if (!input || document.activeElement === input) return;

        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;

        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;
        const el = container.nodeType === 3 ? container.parentElement : container;
        if (!el || !document.getElementById('editor')?.contains(el)) return;

        const px = parseFloat(window.getComputedStyle(el).fontSize);
        if (!isNaN(px)) {
            const rounded = Math.round(px);
            input.value = rounded;
            this._markActive(rounded);
        }
    }

    // Highlight the matching preset in the dropdown
    _markActive(size) {
        const dropdown = document.getElementById('fontSizeDropdown');
        if (!dropdown) return;
        dropdown.querySelectorAll('.font-size-option').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.size) === size);
        });
    }
}