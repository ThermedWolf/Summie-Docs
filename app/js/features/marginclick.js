// ==================== KANTLIJN KLIK ====================
// Klik op de kantlijn (marge) naast een A4-pagina → selecteer de hele regel.

(function () {
    function getLineAtY(page, clientY) {
        // Gebruik document.caretPositionFromPoint of caretRangeFromPoint
        let range = null;
        if (document.caretPositionFromPoint) {
            const pos = document.caretPositionFromPoint(page.getBoundingClientRect().left + 1, clientY);
            if (pos) {
                range = document.createRange();
                range.setStart(pos.offsetNode, pos.offset);
                range.collapse(true);
            }
        } else if (document.caretRangeFromPoint) {
            range = document.caretRangeFromPoint(page.getBoundingClientRect().left + 1, clientY);
        }
        return range;
    }

    function selectWholeLine(page, clientY) {
        // Bereken punt binnen de content van de pagina op die Y
        const pageRect = page.getBoundingClientRect();

        // Gebruik een punt iets rechts van de linker content-rand
        const xInContent = pageRect.left + 100; // goed in de text area

        let range = null;
        if (document.caretRangeFromPoint) {
            range = document.caretRangeFromPoint(xInContent, clientY);
        } else if (document.caretPositionFromPoint) {
            const pos = document.caretPositionFromPoint(xInContent, clientY);
            if (pos) {
                range = document.createRange();
                range.setStart(pos.offsetNode, pos.offset);
                range.collapse(true);
            }
        }

        if (!range) return false;

        // Navigeer naar de block container
        let node = range.startContainer;
        // Ga omhoog tot een block-level element binnen de pagina
        while (node && node !== page) {
            if (node.nodeType === 1) {
                const display = window.getComputedStyle(node).display;
                if (display === 'block' || display === 'list-item' || display === 'table-row') break;
            }
            node = node.parentNode;
        }

        if (!node || node === page) {
            // Fallback: selecteer de volledige tekst in range.startContainer
            node = range.startContainer;
            if (node.nodeType === 3) node = node.parentNode;
        }

        // Selecteer de gehele inhoud van dit block element
        const sel = window.getSelection();
        const lineRange = document.createRange();
        lineRange.selectNodeContents(node);
        sel.removeAllRanges();
        sel.addRange(lineRange);
        return true;
    }

    function isInLeftMargin(page, clientX) {
        const rect = page.getBoundingClientRect();
        // Links van de pagina content (padding = 25mm ≈ 94.5px)
        const contentLeft = rect.left + 20; // kleine marge voor precisie
        return clientX >= rect.left - 60 && clientX < contentLeft;
    }

    function isInRightMargin(page, clientX) {
        const rect = page.getBoundingClientRect();
        const contentRight = rect.right - 20;
        return clientX > contentRight && clientX <= rect.right + 60;
    }

    function setupMarginClick() {
        // Luister op mousedown over het hele document
        document.addEventListener('mousedown', function (e) {
            if (e.button !== 0) return;

            // Zoek de dichtstbijzijnde a4-page
            const pages = Array.from(document.querySelectorAll('.a4-page'));
            const page = pages.find(p => {
                const rect = p.getBoundingClientRect();
                const inVertical = e.clientY >= rect.top && e.clientY <= rect.bottom;
                return inVertical && (isInLeftMargin(p, e.clientX) || isInRightMargin(p, e.clientX));
            });

            if (!page) return;

            // Voorkom dat de klik focus wegneemt van de pagina
            e.preventDefault();
            e.stopPropagation();

            // Focus de pagina eerste
            page.focus();

            // Selecteer de hele regel op die Y-positie
            requestAnimationFrame(() => {
                selectWholeLine(page, e.clientY);
            });
        }, true); // capture phase

        // Cursor aanpassen boven de kantlijn
        document.addEventListener('mousemove', function (e) {
            const pages = Array.from(document.querySelectorAll('.a4-page'));
            const overMargin = pages.some(p => {
                const rect = p.getBoundingClientRect();
                const inVertical = e.clientY >= rect.top && e.clientY <= rect.bottom;
                return inVertical && (isInLeftMargin(p, e.clientX) || isInRightMargin(p, e.clientX));
            });

            // Verander cursor naar text-select wanneer over de kantlijn
            if (overMargin) {
                document.body.style.cursor = 'e-resize';
            } else if (document.body.style.cursor === 'e-resize') {
                document.body.style.cursor = '';
            }
        });
    }

    function init() {
        setupMarginClick();
    }

    window.MarginClick = { init };
})();