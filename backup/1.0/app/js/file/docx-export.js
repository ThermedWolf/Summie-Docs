// ==================== DOCX EXPORT ====================
// Converts Summie editor HTML to a .docx file using the docx.js library.
// Handles: divs as blocks, font tags, &nbsp;, nested divs with lists,
// multiple style classes, br spacers, begrip-word spans, bold/italic/underline/color.

(function () {

    // ── Utilities ─────────────────────────────────────────────────────────

    function rgbToHex(rgb) {
        const m = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (!m) return null;
        return [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('').toUpperCase();
    }

    function parseInlineStyle(styleStr, props) {
        if (!styleStr) return props;
        const result = { ...props };
        styleStr.split(';').forEach(rule => {
            const colonIdx = rule.indexOf(':');
            if (colonIdx === -1) return;
            const prop = rule.substring(0, colonIdx).trim();
            const val = rule.substring(colonIdx + 1).trim();
            if (!prop || !val) return;
            if (prop === 'font-size') {
                const px = parseFloat(val);
                if (!isNaN(px)) result.size = Math.round(px * 0.75 * 2);
            }
            if (prop === 'font-weight' && (val === 'bold' || parseInt(val) >= 600)) result.bold = true;
            if (prop === 'font-style' && val === 'italic') result.italic = true;
            if (prop === 'text-decoration' && val.includes('underline')) result.underline = true;
            if (prop === 'color') {
                const hex = val.startsWith('#')
                    ? val.replace('#', '').toUpperCase()
                    : (rgbToHex(val) || null);
                if (hex) result.color = hex;
            }
        });
        return result;
    }

    function getHeadingLevel(el, HeadingLevel) {
        if (!el) return null;

        // Determine style key from data-style or style-* class
        let styleKey = el.dataset && el.dataset.style;
        if (!styleKey && el.classList) {
            const cls = [...el.classList].find(c => c.startsWith('style-'));
            if (cls) styleKey = cls.replace('style-', '');
        }

        if (!styleKey || styleKey === 'normal') {
            const tag = el.tagName ? el.tagName.toLowerCase() : '';
            if (tag === 'h1') return HeadingLevel.HEADING_1;
            if (tag === 'h2') return HeadingLevel.HEADING_2;
            if (tag === 'h3' || tag === 'h4') return HeadingLevel.HEADING_3;
            return null;
        }

        // Fixed built-in mappings
        const fixedMap = {
            title: HeadingLevel.HEADING_1,
            kop1: HeadingLevel.HEADING_1,
            subtitle: HeadingLevel.HEADING_2,
            kop2: HeadingLevel.HEADING_2,
            kop3: HeadingLevel.HEADING_3,
        };
        if (fixedMap[styleKey]) return fixedMap[styleKey];

        // Custom style: use font size to determine heading level
        if (window.StyleManager) {
            const def = window.StyleManager.getStyleDef(styleKey);
            if (def && def.fontSize) {
                const pt = parseFloat(def.fontSize);
                if (pt >= 20) return HeadingLevel.HEADING_1;
                if (pt >= 15) return HeadingLevel.HEADING_2;
                if (pt >= 12) return HeadingLevel.HEADING_3;
            }
        }
        return null;
    }

    function isBlockTag(node) {
        if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
        return /^(p|div|h[1-6]|blockquote|pre|ul|ol|hr|li)$/i.test(node.tagName);
    }

    // ── Inline → TextRun ─────────────────────────────────────────────────

    function nodeToRuns(node, docxLib, inheritedProps) {
        const { TextRun } = docxLib;
        const runs = [];

        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent.replace(/\u00a0/g, ' ');
            if (!text) return runs;
            runs.push(new TextRun({
                text,
                bold: inheritedProps.bold || false,
                italics: inheritedProps.italic || false,
                underline: inheritedProps.underline ? {} : undefined,
                color: inheritedProps.color || undefined,
                size: inheritedProps.size || undefined,
                highlight: inheritedProps.highlight ? 'yellow' : undefined,
                font: 'Arial',
            }));
            return runs;
        }

        if (node.nodeType !== Node.ELEMENT_NODE) return runs;

        const tag = node.tagName.toLowerCase();

        if (node.classList.contains('placeholder-text')) return runs;
        if (node.classList.contains('begrip-tooltip')) return runs;
        if (node.classList.contains('code-block-wrapper')) {
            runs.push(new TextRun({ text: node.innerText || '', font: 'Courier New', size: 18 }));
            return runs;
        }

        if (tag === 'br') {
            runs.push(new TextRun({ break: 1 }));
            return runs;
        }

        // Build props for this node
        let props = { ...inheritedProps };

        // Inline style attribute
        const styleAttr = node.getAttribute ? node.getAttribute('style') : null;
        if (styleAttr) props = parseInlineStyle(styleAttr, props);

        if (tag === 'b' || tag === 'strong') props.bold = true;
        if (tag === 'i' || tag === 'em') props.italic = true;
        if (tag === 'u') props.underline = true;
        if (node.classList.contains('highlight')) props.highlight = true;

        // begrip-word → italic indigo
        if (node.classList.contains('begrip-word')) {
            runs.push(new TextRun({
                text: node.textContent.replace(/\u00a0/g, ' '),
                bold: props.bold || false,
                italics: true,
                underline: props.underline ? {} : undefined,
                color: '6366F1',
                size: props.size || undefined,
                font: 'Arial',
            }));
            return runs;
        }

        // reference-word → purple with underline
        if (node.classList.contains('reference-word')) {
            runs.push(new TextRun({
                text: node.textContent.replace(/\u00a0/g, ' '),
                bold: props.bold || false,
                italics: props.italic || false,
                underline: { color: '7C3AED' },
                color: '7C3AED',
                size: props.size || undefined,
                font: 'Arial',
            }));
            return runs;
        }

        // ref-target-selection → render children as normal text
        if (node.classList.contains('ref-target-selection')) {
            node.childNodes.forEach(child => {
                if (!isBlockTag(child)) runs.push(...nodeToRuns(child, docxLib, props));
            });
            return runs;
        }

        node.childNodes.forEach(child => {
            // Don't descend into block children inline (they get their own paragraph)
            if (!isBlockTag(child)) {
                runs.push(...nodeToRuns(child, docxLib, props));
            }
        });

        return runs;
    }

    // ── Flatten DOM to a list of block descriptors ────────────────────────

    function flattenBlocks(root) {
        const blocks = [];

        function visit(node) {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent.replace(/\u00a0/g, ' ').trim();
                if (text) blocks.push({ type: 'para', el: null, nodes: [node] });
                return;
            }
            if (node.nodeType !== Node.ELEMENT_NODE) return;

            const tag = node.tagName.toLowerCase();

            if (node.classList.contains('placeholder-text')) return;
            if (node.classList.contains('begrip-tooltip')) return;
            if (node.classList.contains('code-block-wrapper')) {
                blocks.push({ type: 'code', el: node });
                return;
            }

            if (tag === 'table') { blocks.push({ type: 'table', el: node }); return; }

            // ref-select-btn-wrapper: skip the button child, just visit the content
            if (node.classList.contains('ref-select-btn-wrapper')) {
                Array.from(node.children).forEach(child => {
                    if (!child.classList.contains('ref-select-btn')) visit(child);
                });
                return;
            }

            if (tag === 'hr') { blocks.push({ type: 'hr' }); return; }
            if (tag === 'ul' || tag === 'ol') { blocks.push({ type: 'list', el: node }); return; }

            if (isBlockTag(node)) {
                // Does this block contain block-level children?
                const blockChildren = Array.from(node.childNodes).filter(
                    c => isBlockTag(c)
                );

                if (blockChildren.length === 0) {
                    // Pure leaf — all children are inline
                    const inlineNodes = Array.from(node.childNodes);
                    // Check if it's just whitespace / <br>
                    const allEmpty = inlineNodes.every(n =>
                        (n.nodeType === Node.TEXT_NODE && n.textContent.replace(/\u00a0/g, ' ').trim() === '') ||
                        (n.nodeType === Node.ELEMENT_NODE && n.tagName === 'BR')
                    );
                    if (allEmpty && inlineNodes.length > 0) {
                        blocks.push({ type: 'spacer' });
                    } else if (inlineNodes.length > 0) {
                        blocks.push({ type: 'para', el: node, nodes: inlineNodes });
                    } else {
                        blocks.push({ type: 'spacer' });
                    }
                } else {
                    // Container — visit children, collecting inline runs between blocks
                    // If this is a heading element, remember it so children inherit heading level
                    const headingContainerEl = /^h[1-6]$/i.test(tag) ? node : null;
                    let pendingInline = [];

                    const flushInline = (containerEl) => {
                        if (pendingInline.length === 0) return;
                        const allEmpty = pendingInline.every(n =>
                            (n.nodeType === Node.TEXT_NODE && n.textContent.replace(/\u00a0/g, ' ').trim() === '') ||
                            (n.nodeType === Node.ELEMENT_NODE && n.tagName === 'BR')
                        );
                        if (allEmpty) blocks.push({ type: 'spacer' });
                        else blocks.push({ type: 'para', el: headingContainerEl || containerEl, nodes: [...pendingInline] });
                        pendingInline = [];
                    };

                    node.childNodes.forEach(child => {
                        if (isBlockTag(child)) {
                            flushInline(node);
                            // If child is a plain p/div inside a heading container, wrap it with heading context
                            if (headingContainerEl && !child.dataset.style && !child.classList.contains('style-')) {
                                // visit as if it were a para under the heading container
                                const childInlines = Array.from(child.childNodes);
                                const allEmpty = childInlines.every(n =>
                                    (n.nodeType === Node.TEXT_NODE && n.textContent.replace(/\u00a0/g, ' ').trim() === '') ||
                                    (n.nodeType === Node.ELEMENT_NODE && n.tagName === 'BR')
                                );
                                if (!allEmpty && childInlines.length > 0) {
                                    blocks.push({ type: 'para', el: headingContainerEl, nodes: childInlines });
                                } else if (childInlines.length > 0) {
                                    blocks.push({ type: 'spacer' });
                                }
                            } else {
                                visit(child);
                            }
                        } else {
                            pendingInline.push(child);
                        }
                    });
                    flushInline(node);
                }
                return;
            }

            // Inline element at root — treat as paragraph
            blocks.push({ type: 'para', el: null, nodes: [node] });
        }

        root.childNodes.forEach(visit);
        return blocks;
    }

    // ── List conversion ───────────────────────────────────────────────────

    function listToDocx(listEl, docxLib, depth) {
        const { Paragraph, TextRun } = docxLib;
        const paras = [];
        const ref = listEl.tagName === 'OL' ? 'numbering' : 'bullets';

        listEl.childNodes.forEach(child => {
            if (!child.tagName || child.tagName !== 'LI') return;

            const inlineNodes = Array.from(child.childNodes).filter(n => {
                const t = n.tagName ? n.tagName.toUpperCase() : '';
                return t !== 'UL' && t !== 'OL';
            });

            const runs = [];
            inlineNodes.forEach(n => runs.push(...nodeToRuns(n, docxLib, {})));
            if (runs.length === 0) runs.push(new TextRun({ text: '', font: 'Arial' }));

            paras.push(new Paragraph({
                children: runs,
                numbering: { reference: ref, level: depth },
                spacing: { before: 0, after: 60 },
            }));

            child.childNodes.forEach(n => {
                if (n.tagName === 'UL' || n.tagName === 'OL') {
                    paras.push(...listToDocx(n, docxLib, depth + 1));
                }
            });
        });

        return paras;
    }

    // ── Table conversion ─────────────────────────────────────────────────

    // Recursively collect all runs from a cell, including from block children (p, div, etc.)
    // Each block child becomes a separate Paragraph; inline nodes go into the current paragraph.
    function cellToParas(cellEl, docxLib, baseProps) {
        const { Paragraph, TextRun } = docxLib;
        const paras = [];

        function collectNode(node, props, currentRuns) {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent.replace(/\u00a0/g, ' ');
                if (text) {
                    currentRuns.push(new TextRun({
                        text,
                        bold: props.bold || false,
                        italics: props.italic || false,
                        underline: props.underline ? {} : undefined,
                        color: props.color || undefined,
                        size: props.size || undefined,
                        font: 'Arial',
                    }));
                }
                return;
            }
            if (node.nodeType !== Node.ELEMENT_NODE) return;
            const tag = node.tagName.toLowerCase();
            if (tag === 'br') {
                // br inside a cell = soft line break, push a break run
                currentRuns.push(new TextRun({ break: 1 }));
                return;
            }
            // Build inherited props
            var props2 = Object.assign({}, props);
            const styleAttr = node.getAttribute ? node.getAttribute('style') : null;
            if (styleAttr) props2 = parseInlineStyle(styleAttr, props2);
            if (tag === 'b' || tag === 'strong') props2.bold = true;
            if (tag === 'i' || tag === 'em') props2.italic = true;
            if (tag === 'u') props2.underline = true;
            if (node.classList && node.classList.contains('begrip-word')) props2.color = '6366F1';
            if (node.classList && node.classList.contains('reference-word')) { props2.color = '7C3AED'; props2.underline = true; }

            // Block-level tags: flush current runs as a paragraph, recurse into a new paragraph
            if (/^(p|div|h[1-6]|blockquote|pre)$/i.test(tag)) {
                // Flush any pending runs first
                if (currentRuns.length > 0) {
                    paras.push(new Paragraph({ children: currentRuns.splice(0) }));
                }
                var innerRuns = [];
                node.childNodes.forEach(child => collectNode(child, props2, innerRuns));
                if (innerRuns.length > 0) {
                    paras.push(new Paragraph({ children: innerRuns }));
                }
                return;
            }

            // Inline: recurse into children
            node.childNodes.forEach(child => collectNode(child, props2, currentRuns));
        }

        var rootRuns = [];
        cellEl.childNodes.forEach(child => collectNode(child, baseProps, rootRuns));

        // Flush any remaining inline runs
        if (rootRuns.length > 0) {
            paras.push(new Paragraph({ children: rootRuns }));
        }

        // A cell must have at least one paragraph
        if (paras.length === 0) {
            paras.push(new Paragraph({ children: [new TextRun({ text: '', font: 'Arial' })] }));
        }

        return paras;
    }

    function tableToDocx(tableEl, docxLib) {
        const { Table, TableRow, TableCell, Paragraph, TextRun, WidthType, BorderStyle, ShadingType } = docxLib;
        const b = { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' };
        const borders = { top: b, bottom: b, left: b, right: b };

        const TABLE_WIDTH = 9026; // DXA (A4 with 1" margins)

        const rows = [];
        // Only direct child rows (thead/tbody/tr), not nested table rows
        const trEls = Array.from(tableEl.querySelectorAll('tr')).filter(tr => {
            // Make sure this tr belongs to our table, not a nested one
            let p = tr.parentElement;
            while (p && p !== tableEl) {
                if (p.tagName === 'TABLE') return false;
                p = p.parentElement;
            }
            return true;
        });

        // Determine max column count across all rows
        let maxCols = 0;
        trEls.forEach(trEl => {
            const count = trEl.querySelectorAll('th, td').length;
            if (count > maxCols) maxCols = count;
        });
        if (maxCols === 0) return [];

        // Even column widths
        const colWidth = Math.floor(TABLE_WIDTH / maxCols);
        // Last column gets the remainder to sum exactly to TABLE_WIDTH
        const colWidths = Array.from({ length: maxCols }, (_, i) =>
            i === maxCols - 1 ? TABLE_WIDTH - colWidth * (maxCols - 1) : colWidth
        );

        trEls.forEach(trEl => {
            const cells = [];
            const cellEls = Array.from(trEl.querySelectorAll('th, td'));
            cellEls.forEach((cellEl, idx) => {
                const isHeader = cellEl.tagName === 'TH';
                const baseProps = isHeader ? { bold: true } : {};
                // Read inline font-weight/style from cell (set by Tabelontwerp panel)
                if (cellEl.style.fontWeight === 'bold') baseProps.bold = true;
                if (cellEl.style.fontStyle === 'italic') baseProps.italic = true;
                const cellParas = cellToParas(cellEl, docxLib, baseProps);
                const w = colWidths[idx] || colWidth;

                // Read inline background colour set by the design panel
                function cssColorToHex(cssColor) {
                    if (!cssColor || cssColor === 'transparent') return null;
                    if (cssColor.startsWith('#')) return cssColor.replace('#', '').toUpperCase().padEnd(6, '0').slice(0, 6);
                    const m = cssColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)/);
                    if (m) return [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('').toUpperCase();
                    return null;
                }
                const bgHex = cssColorToHex(cellEl.style.background || cellEl.style.backgroundColor)
                    || (isHeader ? 'EFF6FF' : 'FFFFFF');
                // Border colour
                const borderHex = cssColorToHex(cellEl.style.borderColor) || 'CBD5E1';
                const cb = { style: BorderStyle.SINGLE, size: 4, color: borderHex };
                const cellBorders = { top: cb, bottom: cb, left: cb, right: cb };

                cells.push(new TableCell({
                    borders: cellBorders,
                    width: { size: w, type: WidthType.DXA },
                    shading: { fill: bgHex, type: ShadingType.CLEAR },
                    margins: { top: 100, bottom: 100, left: 150, right: 150 },
                    children: cellParas,
                }));
            });
            // Pad missing cells so row always has maxCols cells
            while (cells.length < maxCols) {
                const w = colWidths[cells.length] || colWidth;
                cells.push(new TableCell({
                    borders,
                    width: { size: w, type: WidthType.DXA },
                    shading: { fill: 'FFFFFF', type: ShadingType.CLEAR },
                    margins: { top: 100, bottom: 100, left: 150, right: 150 },
                    children: [new Paragraph({ children: [new TextRun({ text: '', font: 'Arial' })] })],
                }));
            }
            if (cells.length > 0) {
                rows.push(new TableRow({
                    children: cells,
                    tableHeader: trEl.querySelector('th') !== null,
                }));
            }
        });

        if (rows.length === 0) return [];
        return [new Table({
            width: { size: TABLE_WIDTH, type: WidthType.DXA },
            columnWidths: colWidths,
            rows,
        })];
    }

    // ── Syntax color map (maps CSS class names to hex colors) ────────────
    const SYNTAX_COLORS = {
        'keyword': '569CD6',
        'string': 'CE9178',
        'comment': '6A9955',
        'number': 'B5CEA8',
        'function': 'DCDCAA',
        'boolean': '569CD6',
        'null': '569CD6',
        'type': '4EC9B0',
        'property': '9CDCFE',
        'operator': 'D4D4D4',
        'tag': '569CD6',
        'attribute': '9CDCFE',
        'variable': '9CDCFE',
        'decorator': 'DCDCAA',
        'symbol': 'CE9178',
        'key': '9CDCFE',
        'value': 'CE9178',
        'builtin': '4EC9B0',
        'phptag': '569CD6',
        'class': '4EC9B0',
        'macro': '569CD6',
        'lifetime': 'D7BA7D',
        'namespace': '4EC9B0',
    };
    const CODE_BG = '1E1E1E'; // dark background
    const CODE_FG = 'D4D4D4'; // default text color

    // Parse a syntax-highlighted HTML string and return TextRun array
    function parseSyntaxHTML(html, docxLib) {
        const { TextRun } = docxLib;
        const runs = [];
        // Use a temporary div to parse
        const tmp = document.createElement('div');
        tmp.innerHTML = html;

        function walkNode(node) {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent;
                if (text) runs.push(new TextRun({ text, font: 'Courier New', size: 18, color: CODE_FG }));
                return;
            }
            if (node.nodeType !== Node.ELEMENT_NODE) return;
            const classList = node.classList;
            // Determine color from syntax class
            let color = CODE_FG;
            for (const cls of classList) {
                // class is like syntax-keyword or syntax-javascript-keyword
                const parts = cls.split('-');
                const tokenType = parts[parts.length - 1];
                if (SYNTAX_COLORS[tokenType]) {
                    color = SYNTAX_COLORS[tokenType];
                    break;
                }
            }
            // Check if any child nodes, otherwise use text directly
            if (node.childNodes.length === 0) return;
            const text = node.textContent;
            if (text) runs.push(new TextRun({ text, font: 'Courier New', size: 18, color }));
        }

        tmp.childNodes.forEach(walkNode);
        return runs;
    }

    // Convert code block to DOCX paragraphs with dark background shading
    function codeBlockToDocx(wrapperEl, docxLib) {
        const { Paragraph, TextRun, ShadingType } = docxLib;
        const paras = [];

        const textarea = wrapperEl.querySelector('.code-block');
        const overlay = wrapperEl.querySelector('.code-highlighted-overlay');
        const rawCode = (textarea ? textarea.value : wrapperEl.innerText) || '';

        // ── Filename header (if name mode is on) ─────────────────────────
        if (wrapperEl.dataset.cbNameMode === '1') {
            const LANG_EXT = {
                'javascript': 'js', 'typescript': 'ts', 'python': 'py', 'java': 'java',
                'csharp': 'cs', 'cpp': 'cpp', 'php': 'php', 'ruby': 'rb', 'go': 'go',
                'rust': 'rs', 'swift': 'swift', 'kotlin': 'kt', 'html': 'html', 'css': 'css',
                'sql': 'sql', 'json': 'json', 'bash': 'sh', 'shell': 'sh', 'plaintext': 'txt',
            };
            const lang = (textarea && textarea.getAttribute('data-language')) || 'plaintext';
            const ext = LANG_EXT[lang] || lang;
            const name = (wrapperEl.dataset.cbFilename || 'naamloos') + '.' + ext;
            paras.push(new Paragraph({
                children: [new TextRun({ text: name, font: 'Courier New', size: 18, color: '9CDCFE', bold: true })],
                shading: { fill: '2D2D2D', type: ShadingType.CLEAR },
                spacing: { before: 0, after: 0 },
                indent: { left: 120, right: 120 },
            }));
        }

        const paragraphOpts = {
            spacing: { before: 0, after: 0 },
            shading: { fill: CODE_BG, type: ShadingType.CLEAR },
            indent: { left: 120, right: 120 },
        };

        if (overlay && overlay.innerHTML && overlay.innerHTML.trim()) {
            // Parse line by line from the overlay HTML
            // The overlay has spans inline; split on newlines inside text nodes
            const lines = overlay.innerHTML.split(/\n/);
            lines.forEach((lineHtml, i) => {
                const runs = parseSyntaxHTML(lineHtml, docxLib);
                if (runs.length === 0) runs.push(new TextRun({ text: ' ', font: 'Courier New', size: 18, color: CODE_FG }));
                paras.push(new Paragraph({ ...paragraphOpts, children: runs }));
            });
        } else {
            // Fall back to plain text
            rawCode.split('\n').forEach(line => {
                paras.push(new Paragraph({
                    ...paragraphOpts,
                    children: [new TextRun({ text: line || ' ', font: 'Courier New', size: 18, color: CODE_FG })],
                }));
            });
        }

        // Add a small spacer after the code block
        paras.push(new Paragraph({ children: [new TextRun('')], spacing: { before: 80, after: 80 } }));
        return paras;
    }

    function blocksToDocx(blocks, docxLib) {
        const { Paragraph, TextRun, HeadingLevel } = docxLib;
        const paras = [];

        blocks.forEach(block => {
            if (block.type === 'spacer') {
                paras.push(new Paragraph({ children: [new TextRun('')], spacing: { before: 0, after: 80 } }));
                return;
            }
            if (block.type === 'hr') {
                paras.push(new Paragraph({
                    children: [],
                    border: { bottom: { style: 'single', size: 6, color: '94A3B8', space: 1 } },
                    spacing: { before: 120, after: 120 },
                }));
                return;
            }
            if (block.type === 'list') {
                paras.push(...listToDocx(block.el, docxLib, 0));
                return;
            }
            if (block.type === 'code') {
                codeBlockToDocx(block.el, docxLib).forEach(p => paras.push(p));
                return;
            }
            if (block.type === 'table') {
                tableToDocx(block.el, docxLib).forEach(t => paras.push(t));
                // Add a spacer after the table
                paras.push(new Paragraph({ children: [new TextRun('')], spacing: { before: 0, after: 80 } }));
                return;
            }
            if (block.type === 'para') {
                const hl = getHeadingLevel(block.el, HeadingLevel);
                const runs = [];
                block.nodes.forEach(n => runs.push(...nodeToRuns(n, docxLib, {})));

                if (runs.length === 0) {
                    paras.push(new Paragraph({ children: [new TextRun('')], spacing: { before: 0, after: 80 } }));
                    return;
                }

                const opts = {
                    children: runs,
                    spacing: { before: hl ? 160 : 0, after: hl ? 100 : 80 },
                };
                if (hl) opts.heading = hl;
                paras.push(new Paragraph(opts));
            }
        });

        return paras;
    }

    // ── Begrippen appendix ────────────────────────────────────────────────

    function begrippenToDocx(begrippen, docxLib) {
        const { Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType } = docxLib;
        const out = [];

        out.push(new Paragraph({ children: [new TextRun('')], pageBreakBefore: true }));
        out.push(new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: 'Begrippen', font: 'Arial' })],
            spacing: { before: 0, after: 240 },
        }));

        if (begrippen.length === 0) {
            out.push(new Paragraph({ children: [new TextRun({ text: 'Geen begrippen gedefinieerd.', italics: true, font: 'Arial', size: 24 })] }));
            return out;
        }

        const b = { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' };
        const borders = { top: b, bottom: b, left: b, right: b };

        const mkCell = (children, fill, w) => new TableCell({
            borders,
            width: { size: w, type: WidthType.DXA },
            shading: { fill, type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children,
        });

        const headerRow = new TableRow({
            tableHeader: true, children: [
                mkCell([new Paragraph({ children: [new TextRun({ text: 'Begrip', bold: true, font: 'Arial', size: 22, color: '1E293B' })] })], 'EFF6FF', 2800),
                mkCell([new Paragraph({ children: [new TextRun({ text: 'Omschrijving', bold: true, font: 'Arial', size: 22, color: '1E293B' })] })], 'EFF6FF', 6226),
            ]
        });

        const dataRows = begrippen.map((bg, i) => {
            const fill = i % 2 === 0 ? 'FFFFFF' : 'F8FAFC';
            const descRuns = [new TextRun({ text: bg.description, font: 'Arial', size: 22 })];
            if (bg.aliases && bg.aliases.length > 0) {
                descRuns.push(new TextRun({ text: `  (ook: ${bg.aliases.join(', ')})`, font: 'Arial', size: 20, italics: true, color: '64748B' }));
            }
            return new TableRow({
                children: [
                    mkCell([new Paragraph({ children: [new TextRun({ text: bg.keyword, bold: true, font: 'Arial', size: 22 })] })], fill, 2800),
                    mkCell([new Paragraph({ children: descRuns })], fill, 6226),
                ]
            });
        });

        out.push(new Table({ width: { size: 9026, type: WidthType.DXA }, columnWidths: [2800, 6226], rows: [headerRow, ...dataRows] }));
        return out;
    }

    // ── Public ────────────────────────────────────────────────────────────

    async function exportToDocx() {
        const docxLib = window.docx;
        if (!docxLib) {
            window.showNotification && window.showNotification('Fout', 'DOCX bibliotheek niet geladen.', 'error');
            return;
        }

        const { Document, Packer, LevelFormat, AlignmentType } = docxLib;
        const { editor, begrippen = [] } = window.AppState;

        const currentPath = window.currentFilePath || localStorage.getItem('summie_current_file_path') || '';
        const docName = currentPath
            ? currentPath.split('\\').pop().split('/').pop().replace(/\.[^.]+$/, '')
            : 'samenvatting';

        showDocxLoadingModal();
        try {

            const blocks = flattenBlocks(editor);
            const contentParas = blocksToDocx(blocks, docxLib);
            const begrippenParas = begrippen.length > 0 ? begrippenToDocx(begrippen, docxLib) : [];

            // Build Word paragraph style definitions from current StyleManager values so
            // any user edits to built-in styles (font size, bold, color, etc.) are
            // reflected in the Word heading styles — not just in the inline run properties.
            const _sm = window.StyleManager;
            const _styleDef = (key, fallbackSize, fallbackBold, fallbackColor) => {
                const d = _sm ? _sm.getStyleDef(key) : null;
                const ptToHalfPt = (pt) => Math.round(parseFloat(pt) * 2);
                return {
                    size: d && d.fontSize ? ptToHalfPt(d.fontSize) : fallbackSize,
                    bold: d ? (d.fontWeight === 'bold' || parseInt(d.fontWeight) >= 600) : fallbackBold,
                    italic: d ? d.fontStyle === 'italic' : false,
                    color: d && d.color ? d.color.replace('#', '').toUpperCase() : fallbackColor,
                    spacingBefore: d && d.marginTop ? Math.round(parseFloat(d.marginTop) * 15) : undefined,
                    spacingAfter: d && d.marginBottom ? Math.round(parseFloat(d.marginBottom) * 15) : undefined,
                };
            };
            const h1def = _styleDef('title', 40, true, '1E293B');
            const h2def = _styleDef('subtitle', 32, false, '64748B');
            const h3def = _styleDef('kop1', 28, true, '1E293B');

            const doc = new Document({
                styles: {
                    default: { document: { run: { font: 'Arial', size: 24, color: '1E293B' } } },
                    paragraphStyles: [
                        {
                            id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
                            run: { size: h1def.size, bold: h1def.bold, italics: h1def.italic, font: 'Arial', color: h1def.color },
                            paragraph: { spacing: { before: h1def.spacingBefore ?? 240, after: h1def.spacingAfter ?? 120 }, outlineLevel: 0 }
                        },
                        {
                            id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
                            run: { size: h2def.size, bold: h2def.bold, italics: h2def.italic, font: 'Arial', color: h2def.color },
                            paragraph: { spacing: { before: h2def.spacingBefore ?? 200, after: h2def.spacingAfter ?? 100 }, outlineLevel: 1 }
                        },
                        {
                            id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
                            run: { size: h3def.size, bold: h3def.bold, italics: h3def.italic, font: 'Arial', color: h3def.color },
                            paragraph: { spacing: { before: h3def.spacingBefore ?? 160, after: h3def.spacingAfter ?? 80 }, outlineLevel: 2 }
                        },
                    ],
                },
                numbering: {
                    config: [
                        {
                            reference: 'bullets', levels: [
                                { level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } }, run: { font: 'Arial' } } },
                                { level: 1, format: LevelFormat.BULLET, text: '\u25E6', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1080, hanging: 360 } }, run: { font: 'Arial' } } },
                                { level: 2, format: LevelFormat.BULLET, text: '\u25AA', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1440, hanging: 360 } }, run: { font: 'Arial' } } },
                            ]
                        },
                        {
                            reference: 'numbering', levels: [
                                { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
                                { level: 1, format: LevelFormat.LOWER_LETTER, text: '%2.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1080, hanging: 360 } } } },
                                { level: 2, format: LevelFormat.LOWER_ROMAN, text: '%3.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1440, hanging: 360 } } } },
                            ]
                        },
                    ],
                },
                sections: [{
                    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
                    children: [...contentParas, ...begrippenParas],
                }],
            });

            const blob = await Packer.toBlob(doc);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${docName}.docx`;
            a.click();
            URL.revokeObjectURL(url);

            hideDocxLoadingModal();
            window.showNotification && window.showNotification('Geëxporteerd', `${docName}.docx is opgeslagen.`, 'success');

        } catch (err) {
            hideDocxLoadingModal();
            console.error('DOCX export error:', err);
            window.showNotification && window.showNotification('Fout', `Kon niet exporteren: ${err.message}`, 'error');
        }
    }

    function showDocxLoadingModal() {
        let modal = document.getElementById('docxLoadingModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'docxLoadingModal';
            modal.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;';
            var inner = document.createElement('div');
            inner.style.cssText = 'background:#fff;border-radius:16px;padding:40px 56px;display:flex;flex-direction:column;align-items:center;gap:20px;box-shadow:0 20px 60px rgba(0,0,0,0.2);';
            var loader = document.createElement('div');
            loader.className = 'docx-loader';
            var label = document.createElement('p');
            label.style.cssText = 'margin:0;font-size:14px;color:#64748b;font-family:Arial,sans-serif;';
            label.textContent = 'Word document genereren...';
            inner.appendChild(loader);
            inner.appendChild(label);
            modal.appendChild(inner);
            document.body.appendChild(modal);
        }
        modal.style.display = 'flex';
    }

    function hideDocxLoadingModal() {
        const modal = document.getElementById('docxLoadingModal');
        if (modal) modal.style.display = 'none';
    }

    window.exportToDocx = exportToDocx;
})();