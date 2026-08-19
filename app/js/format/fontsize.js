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

        // Helper: get the current target block element within #editor
        const getBlock = (node) => {
            const editor = document.getElementById('editor');
            if (!editor || !node) return null;
            const blockTags = ['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE'];
            let el = node.nodeType === 3 ? node.parentElement : node;
            while (el && el !== editor) {
                if (blockTags.includes(el.tagName)) return el;
                el = el.parentElement;
            }
            return null;
        };

        // ── Apply ──────────────────────────────────────────────────────────
        const applySize = (size) => {
            size = Math.max(6, Math.min(96, parseInt(size)));
            if (isNaN(size)) return;
            input.value = size;
            window._lastExplicitFontSize = size;

            const editor = document.getElementById('editor');
            if (!editor) return;

            // If editor is completely empty, just track the pending size
            if (window.isEditorEmpty && window.isEditorEmpty()) {
                this._markActive(size);
                return;
            }

            if (!this.tb.savedRange) return;

            this.tb._suppressSelectionUpdate = true;

            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(this.tb.savedRange.cloneRange());

            if (!sel.rangeCount) {
                this.tb._suppressSelectionUpdate = false;
                return;
            }

            const range = sel.getRangeAt(0);

            if (range.collapsed) {
                const container = range.startContainer;
                const block = getBlock(container);

                // Case 1: Cursor is in an empty paragraph or line (e.g. <p><br></p> or empty text)
                if (block && (!block.textContent.trim() || block.innerHTML === '<br>')) {
                    block.style.fontSize = size + 'px';
                    while (block.firstChild) block.removeChild(block.firstChild);
                    const br = document.createElement('br');
                    block.appendChild(br);

                    const newRange = document.createRange();
                    newRange.setStart(block, 0);
                    newRange.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                    this.tb.savedRange = newRange.cloneRange();
                    this._markActive(size);
                    requestAnimationFrame(() => {
                        this.tb._suppressSelectionUpdate = false;
                    });
                    window.updateUnsavedIndicator && window.updateUnsavedIndicator();
                    return;
                }

                // Case 2: Cursor is inside an existing empty / ZWS font-size span — update size without nesting
                let parentSpan = container.nodeType === 3 ? container.parentElement : container;
                if (parentSpan && parentSpan.tagName === 'SPAN' && parentSpan.style.fontSize &&
                    (parentSpan.textContent === '' || parentSpan.textContent === '\u200B')) {
                    parentSpan.style.fontSize = size + 'px';
                    this.tb.savedRange = range.cloneRange();
                    this._markActive(size);
                    requestAnimationFrame(() => {
                        this.tb._suppressSelectionUpdate = false;
                    });
                    window.updateUnsavedIndicator && window.updateUnsavedIndicator();
                    return;
                }

                // Case 3: Cursor is in non-empty text — create span with a zero-width space so browser types inside it
                const span = document.createElement('span');
                span.style.fontSize = size + 'px';
                span.style.display = 'inline';
                const zws = document.createTextNode('\u200B');
                span.appendChild(zws);
                range.insertNode(span);

                const newRange = document.createRange();
                newRange.setStart(zws, 1);
                newRange.collapse(true);
                sel.removeAllRanges();
                sel.addRange(newRange);
                this.tb.savedRange = newRange.cloneRange();
                this._markActive(size);
                requestAnimationFrame(() => {
                    this.tb._suppressSelectionUpdate = false;
                });
                window.updateUnsavedIndicator && window.updateUnsavedIndicator();
                return;
            }

            // Case 4: Text IS selected (range not collapsed)
            const startBlock = getBlock(range.startContainer);
            const endBlock = getBlock(range.endContainer);

            // If whole block is selected, set fontSize on block and clean inner spans
            if (startBlock && startBlock === endBlock && range.toString().trim() === startBlock.textContent.trim() && startBlock.textContent.trim().length > 0) {
                startBlock.style.fontSize = size + 'px';
                startBlock.querySelectorAll('span[style*="font-size"]').forEach(sp => {
                    sp.style.fontSize = '';
                    if (!sp.getAttribute('style') || !sp.style.cssText.trim()) {
                        const text = document.createTextNode(sp.textContent);
                        sp.replaceWith(text);
                    }
                });
                this._markActive(size);
                this.tb.savedRange = range.cloneRange();
                requestAnimationFrame(() => {
                    this.tb._suppressSelectionUpdate = false;
                });
                window.updateUnsavedIndicator && window.updateUnsavedIndicator();
                return;
            }

            // Partial selection: wrap selection in a sized <span>, cleaning inner font-size spans
            const fragment = range.extractContents();
            if (fragment.querySelectorAll) {
                fragment.querySelectorAll('span[style*="font-size"]').forEach(sp => {
                    sp.style.fontSize = '';
                    if (!sp.getAttribute('style') || !sp.style.cssText.trim()) {
                        const text = document.createTextNode(sp.textContent);
                        sp.replaceWith(text);
                    }
                });
            }
            const span = document.createElement('span');
            span.style.fontSize = size + 'px';
            span.appendChild(fragment);
            range.insertNode(span);

            // Re-select span contents so the highlight persists
            const newRange = document.createRange();
            newRange.selectNodeContents(span);
            sel.removeAllRanges();
            sel.addRange(newRange);

            this.tb.savedRange = newRange.cloneRange();
            this._markActive(size);

            requestAnimationFrame(() => {
                this.tb._suppressSelectionUpdate = false;
            });
            window.updateUnsavedIndicator && window.updateUnsavedIndicator();
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
            const valToApply = input.value;
            setTimeout(() => {
                dropdown.classList.remove('active');
                applySize(valToApply);
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