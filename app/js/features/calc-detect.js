// ==================== REKENDETECTIE ====================
// Detecteert wiskundige uitdrukkingen die eindigen op '=' en toont een
// zweefchip met het antwoord + optie om een berekening-kaart in te voegen.

(function () {

    // ── Parser ────────────────────────────────────────────────────────────

    // Normalise the raw text of a line into a computable expression string.
    // Returns { expr, display, hasVariable } or null.
    function parseLine(text) {
        // Strip trailing '=' and whitespace
        let raw = text.trim();
        if (!raw.endsWith('=')) return null;
        raw = raw.slice(0, -1).trim();
        if (!raw) return null;

        // Replace Dutch/typographic operators with JS operators
        let expr = raw
            .replace(/×/g, '*')
            .replace(/÷/g, '/')
            .replace(/\u00d7/g, '*')
            .replace(/\u00f7/g, '/')
            .replace(/,/g, '.')          // Dutch decimal comma → dot
            .replace(/\bx\b/gi, (m, offset, str) => {
                // 'x' is multiplication only if surrounded by numbers/spaces
                // otherwise it's a variable
                const before = str[offset - 1];
                const after = str[offset + 1];
                const numBefore = before && /[\d\s\.\)]/.test(before);
                const numAfter = after && /[\d\s\.\(]/.test(after);
                return (numBefore && numAfter) ? '*' : m;
            });

        // Detect variables (single letters not part of a number)
        const varMatch = expr.match(/\b([a-wyzA-WYZ])\b/g); // exclude 'x' (handled above)
        const hasVariable = !!(varMatch && varMatch.length > 0);

        // If there are variables, we can't evaluate — return for display only
        if (hasVariable) {
            return { expr: null, display: raw, hasVariable: true, original: raw };
        }

        // Security: only allow digits, operators, parens, spaces, dots, %
        const safe = expr.replace(/[\d\s\+\-\*\/\.\(\)\%\^eE]/g, '');
        if (safe.length > 0) return null; // unexpected chars

        return { expr, display: raw, hasVariable: false, original: raw };
    }

    function evaluate(expr) {
        if (!expr) return null;
        try {
            // Handle percentage: treat trailing % as /100
            const e = expr.replace(/(\d+\.?\d*)\s*%/g, '($1/100)');
            // eslint-disable-next-line no-new-func
            const result = Function('"use strict"; return (' + e + ')')();
            if (typeof result !== 'number' || !isFinite(result)) return null;
            // Round to max 10 decimal places to avoid floating point noise
            return parseFloat(result.toFixed(10));
        } catch { return null; }
    }

    function formatResult(n) {
        if (n === null) return '?';
        // Show as integer if whole number, otherwise up to 4 significant decimals
        if (Number.isInteger(n)) return String(n);
        return parseFloat(n.toFixed(4)).toString().replace('.', ',');
    }

    // ── Chip UI ───────────────────────────────────────────────────────────

    let _chip = null;
    let _chipBlock = null;
    let _chipData = null;

    function showChip(block, parsed, result) {
        removeChip();

        const chip = document.createElement('div');
        chip.className = 'calc-chip';
        chip.dataset.calcChip = '1';

        const resultStr = formatResult(result);
        const displayExpr = parsed.display;

        chip.innerHTML = `
            <span class="calc-chip-expr">${escHtml(displayExpr)} <strong>= ${escHtml(resultStr)}</strong></span>
            <button class="calc-chip-btn" title="Zet om naar berekening-kaart">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
                Kaart invoegen
            </button>
            <button class="calc-chip-close" title="Sluiten">✕</button>
        `;

        chip.querySelector('.calc-chip-btn').addEventListener('mousedown', e => {
            e.preventDefault();
            insertCalcCard(block, parsed, result);
            removeChip();
        });
        chip.querySelector('.calc-chip-close').addEventListener('mousedown', e => {
            e.preventDefault();
            removeChip();
        });

        // Position near the block
        document.body.appendChild(chip);
        positionChip(chip, block);

        _chip = chip;
        _chipBlock = block;
        _chipData = { parsed, result };

        // Auto-remove after 8s
        clearTimeout(_chip._autoRemove);
        _chip._autoRemove = setTimeout(removeChip, 8000);
    }

    function positionChip(chip, block) {
        const rect = block.getBoundingClientRect();
        chip.style.position = 'fixed';
        chip.style.left = Math.max(8, rect.left) + 'px';
        chip.style.top = (rect.bottom + 6) + 'px';
        chip.style.zIndex = '9999';
    }

    function removeChip() {
        if (_chip) { clearTimeout(_chip._autoRemove); _chip.remove(); }
        _chip = null; _chipBlock = null; _chipData = null;
    }

    function escHtml(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // ── Calculation Card ──────────────────────────────────────────────────

    // Inserts a clean "calculation card" table replacing the current block.
    // Card layout:
    //   ┌───────────────────────────────┐
    //   │  Berekening                   │  ← header row (th, colspan)
    //   ├─────────────┬─────────────────┤
    //   │  Uitdrukking│  12,7 × 23      │
    //   ├─────────────┼─────────────────┤
    //   │  Antwoord   │  292,1          │
    //   └─────────────┴─────────────────┘

    function insertCalcCard(block, parsed, result) {
        const editor = document.getElementById('editor');
        if (!editor) return;

        const resultStr = formatResult(result);

        const table = document.createElement('table');
        table.className = 'summie-table calc-card-table';
        table.dataset.tabelStijl = 'none';

        const tbody = document.createElement('tbody');

        // Header row
        const trHead = document.createElement('tr');
        const thHead = document.createElement('th');
        thHead.colSpan = 2;
        thHead.contentEditable = 'true';
        thHead.textContent = 'Berekening';
        thHead.className = 'calc-card-header';
        trHead.appendChild(thHead);
        tbody.appendChild(trHead);

        // Expression row
        const trExpr = document.createElement('tr');
        const tdExprLabel = document.createElement('th');
        tdExprLabel.contentEditable = 'true';
        tdExprLabel.textContent = 'Uitdrukking';
        const tdExprVal = document.createElement('td');
        tdExprVal.contentEditable = 'true';
        tdExprVal.textContent = parsed.display;
        trExpr.appendChild(tdExprLabel);
        trExpr.appendChild(tdExprVal);
        tbody.appendChild(trExpr);

        // Answer row
        const trAns = document.createElement('tr');
        const tdAnsLabel = document.createElement('th');
        tdAnsLabel.contentEditable = 'true';
        tdAnsLabel.textContent = 'Antwoord';
        const tdAnsVal = document.createElement('td');
        tdAnsVal.contentEditable = 'true';
        tdAnsVal.textContent = resultStr;
        tdAnsVal.className = 'calc-card-answer';
        trAns.appendChild(tdAnsLabel);
        trAns.appendChild(tdAnsVal);
        tbody.appendChild(trAns);

        table.appendChild(tbody);

        const after = document.createElement('p');
        after.innerHTML = '<br>';

        // Replace the current block
        block.parentNode.insertBefore(table, block);
        block.parentNode.insertBefore(after, block);
        block.remove();

        // Move cursor into the header cell
        thHead.focus();
        const r = document.createRange();
        r.selectNodeContents(thHead);
        r.collapse(false);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(r);

        window.saveToLocalStorage?.();
        window.updateUnsavedIndicator?.();
        window.TableFormulas?.watchTable?.(table);
        window.TableFormulas?.stampCellRefs?.(table);
    }

    // ── Trigger Detection ─────────────────────────────────────────────────

    function getCurrentBlock() {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return null;
        const editor = document.getElementById('editor');
        if (!editor) return null;

        let node = sel.getRangeAt(0).startContainer;
        if (node.nodeType === 3) node = node.parentElement;

        const blockTags = ['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'];
        while (node && node !== editor && !blockTags.includes(node.tagName)) {
            node = node.parentElement;
        }
        if (!node || node === editor) return null;
        return node;
    }

    function checkCalcTrigger(e) {
        // Trigger on '=' key, or Enter/Tab if chip is visible for this block
        const isEquals = e.key === '=';
        const isConfirm = (e.key === 'Enter' || e.key === 'Tab') && _chip;

        if (!isEquals && !isConfirm) return false;

        // Don't trigger inside table cells or code blocks
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return false;
        const anchor = sel.anchorNode;
        if (anchor?.parentElement?.closest('table, .code-block-wrapper')) return false;

        if (isConfirm && _chipData && _chipBlock) {
            // Enter/Tab with chip visible: insert the card
            e.preventDefault();
            e.stopPropagation();
            insertCalcCard(_chipBlock, _chipData.parsed, _chipData.result);
            removeChip();
            return true;
        }

        if (isEquals) {
            // After the '=' is inserted (setTimeout 0), read the line and check
            setTimeout(() => {
                const block = getCurrentBlock();
                if (!block) return;
                const text = block.textContent || '';
                const parsed = parseLine(text.trim());
                if (!parsed) { removeChip(); return; }

                const result = parsed.hasVariable ? null : evaluate(parsed.expr);
                if (result === null && !parsed.hasVariable) { removeChip(); return; }

                showChip(block, parsed, result);
            }, 0);
        }

        return false; // Don't consume the = key itself
    }

    // Close chip when clicking elsewhere
    document.addEventListener('mousedown', e => {
        if (_chip && !_chip.contains(e.target)) removeChip();
    });

    // Reposition chip on scroll/resize
    window.addEventListener('scroll', () => {
        if (_chip && _chipBlock) positionChip(_chip, _chipBlock);
    }, true);
    window.addEventListener('resize', () => {
        if (_chip && _chipBlock) positionChip(_chip, _chipBlock);
    });

    window.CalcDetect = { checkCalcTrigger, removeChip };

})();