// ==================== LIST HANDLING ====================
// Bullet list improvements + numeric list support.
// Typing "- ", "* ", "-> ", "=> " or "→ " at the start of an empty line
// auto-converts it to a bullet list (single space triggers). Numbered
// markers ("1. ") are never auto-converted.

window.ListManager = (function () {
    'use strict';

    let _autoDetectBulletLists = true; // Setting: auto-detect "- " to create bullet list

    // Load setting from localStorage
    function loadSettings() {
        try {
            const stored = localStorage.getItem('summie_auto_detect_bullet_lists');
            if (stored !== null) {
                _autoDetectBulletLists = stored === '1';
            }
        } catch (e) { }
    }

    function saveSettings() {
        try {
            localStorage.setItem('summie_auto_detect_bullet_lists', _autoDetectBulletLists ? '1' : '0');
        } catch (e) { }
    }

    // Check if a list item is "empty" (no meaningful text content)
    function isEmptyListItem(li) {
        // Check if li has only a <br> or is completely empty
        const text = (li.textContent || '').trim();
        const hasOnlyBr = li.children.length === 1 && li.firstChild.tagName === 'BR';
        return text === '' || hasOnlyBr;
    }

    // Handle backspace in bullet/numbered lists
    function handleListBackspace(e) {
        const editor = document.getElementById('editor');
        if (!editor) return;

        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const range = selection.getRangeAt(0);
        if (!range.collapsed) return; // Only handle backspace when cursor is collapsed (no selection)

        const startContainer = range.startContainer;
        const startOffset = range.startOffset;

        // Find the parent list item
        let li = startContainer.nodeType === 3 ? startContainer.parentElement : startContainer;
        while (li && li !== editor && li.tagName !== 'LI') {
            li = li.parentElement;
        }

        if (!li || li === editor) return; // Not in a list item

        // Check if cursor is at the very beginning of the list item
        const isAtStart = startOffset === 0 && (
            startContainer === li ||
            (startContainer.nodeType === 3 && range.startOffset === 0 && startContainer === li.firstChild) ||
            (startContainer.nodeType === 1 && range.startOffset === 0 && startContainer === li.firstChild)
        );

        if (!isAtStart) return; // Not at start of list item, let browser handle normally

        // Check if list item is empty
        if (!isEmptyListItem(li)) return; // Has content, let browser handle normally

        e.preventDefault();

        const ul = li.parentElement;
        const prevLi = li.previousElementSibling;
        const parentIsList = ul && (ul.tagName === 'UL' || ul.tagName === 'OL');

        // Remove the empty list item
        li.remove();

        if (prevLi) {
            // Move cursor to end of previous list item
            const newRange = document.createRange();
            newRange.selectNodeContents(prevLi);
            newRange.collapse(false); // End of previous li
            selection.removeAllRanges();
            selection.addRange(newRange);
        } else if (parentIsList) {
            // No previous item, we're at the first item of the list
            // Move cursor to the block before the list
            const beforeList = ul.previousElementSibling;
            if (beforeList && (beforeList.tagName === 'P' || beforeList.tagName === 'DIV')) {
                const newRange = document.createRange();
                newRange.selectNodeContents(beforeList);
                newRange.collapse(false);
                selection.removeAllRanges();
                selection.addRange(newRange);
            } else {
                // No previous block, create a new paragraph before the list
                const p = document.createElement('p');
                p.innerHTML = '<br>';
                ul.parentNode.insertBefore(p, ul);
                const newRange = document.createRange();
                newRange.selectNodeContents(p);
                newRange.collapse(false);
                selection.removeAllRanges();
                selection.addRange(newRange);
            }

            // If list is now empty, remove it
            if (ul.children.length === 0) {
                ul.remove();
            }
        } else {
            // Not in a list (shouldn't happen), just ensure we have a paragraph
            const p = document.createElement('p');
            p.innerHTML = '<br>';
            editor.appendChild(p);
            const newRange = document.createRange();
            newRange.selectNodeContents(p);
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);
        }

        window.updateUnsavedIndicator && window.updateUnsavedIndicator();
    }

    // Markers that convert to a bullet list when followed by a space.
    // Numbered markers ("1. ", "2. ") are intentionally NOT included:
    // typing a number must never auto-create a list (ordered lists are
    // only created via the numericListBtn toolbar button).
    const BULLET_MARKERS = ['-', '*', '->', '=>', '→'];

    function isBulletMarker(text) {
        return BULLET_MARKERS.indexOf(text) !== -1;
    }

    // Auto-detect a bullet marker ("- ", "-> ", etc.) to create a bullet list.
    // Runs on space keydown: the space itself is not in the DOM yet, so the
    // text before the cursor must already be exactly the marker.
    function handleAutoBulletList(e) {
        if (!_autoDetectBulletLists) return;

        const editor = document.getElementById('editor');
        if (!editor) return;

        // Only trigger on space key; ignore IME composition keystrokes
        if (e.key !== ' ' && e.key !== 'Space') return;
        if (e.isComposing || e.key === 'Process') return;

        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const range = selection.getRangeAt(0);
        if (!range.collapsed) return; // Only when no selection

        const startContainer = range.startContainer;
        const startOffset = range.startOffset;

        // Must be a plain text node
        if (startContainer.nodeType !== 3) return;

        // Skip nested editable regions (textboxes, code blocks, etc.)
        const nestedEditable = startContainer.parentElement &&
            startContainer.parentElement.closest('[contenteditable="true"]');
        if (nestedEditable && nestedEditable !== editor) return;

        // Everything before the cursor must be exactly one bullet marker
        // (cursor right after "-", "->", "*", "=>" or "→")
        const textBeforeCursor = startContainer.textContent.slice(0, startOffset);
        if (!isBulletMarker(textBeforeCursor)) return;

        // Must be inside a block element (p, div, etc.)
        let block = startContainer.parentElement;
        const blockTags = ['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE'];
        while (block && block !== editor && !blockTags.includes(block.tagName)) {
            block = block.parentElement;
        }

        if (!block || block === editor) return;
        // Don't trigger if already in a list
        if (block.closest('ul, ol')) return;

        // Only convert while the line contains nothing but the marker so far
        if ((block.textContent || '').trim() !== textBeforeCursor) return;

        e.preventDefault();

        // Remove the marker characters and turn the block into a bullet list
        startContainer.textContent = '';
        document.execCommand('insertUnorderedList', false, null);

        window.updateUnsavedIndicator && window.updateUnsavedIndicator();
    }

    // ==================== BULLET STYLES ====================
    // Selectable marker styles for unordered lists (feature 3). The style rides
    // as a class on the <ul> ("list-style-<id>"); a list with no class at all
    // renders with the browser's default disc/circle/square depth cycle.
    // cycle = marker per nesting depth (levels 1-3): level 1 is the marker the
    // user picks in the menu, deeper levels continue the classic bullet cycle.
    // styles.css (@counter-style + list-style-type rules) and the docx export
    // numbering mirror this table — keep the three in sync.
    const BULLET_STYLES = [
        { id: 'disc', cycle: ['\u2022', '\u25E6', '\u25AA'], label: 'Rond' },
        { id: 'circle', cycle: ['\u25E6', '\u25AA', '\u2022'], label: 'Cirkel' },
        { id: 'square', cycle: ['\u25AA', '\u2022', '\u25E6'], label: 'Vierkant' },
        { id: 'dash', cycle: ['\u2013', '\u25E6', '\u25AA'], label: 'Streep' },
        { id: 'arrow', cycle: ['\u2192', '\u25E6', '\u25AA'], label: 'Pijl' },
    ];
    const BULLET_STYLE_CLASS_PREFIX = 'list-style-';

    function getBulletStyleById(styleId) {
        return BULLET_STYLES.find(style => style.id === styleId) || BULLET_STYLES[0];
    }

    // Read the style of a list element; 'disc' when unstyled or not a UL.
    function getBulletStyleId(listEl) {
        if (!listEl || listEl.tagName !== 'UL') return 'disc';
        const styleClass = Array.from(listEl.classList).find(
            cls => cls.startsWith(BULLET_STYLE_CLASS_PREFIX)
        );
        return styleClass ? styleClass.slice(BULLET_STYLE_CLASS_PREFIX.length) : 'disc';
    }

    // A plain bullet list: a UL that is not a checklist.
    function isPlainBulletList(listEl) {
        return !!listEl && listEl.tagName === 'UL' && !listEl.classList.contains('checklist');
    }

    // Write the style class onto a list. Strip any previous style first; every
    // style — including an explicitly chosen disc — gets its class, so a
    // sublist keeps its own marker even nested inside differently styled lists.
    function setBulletStyleOnList(listEl, styleId) {
        if (!listEl) return;
        clearBulletStyles(listEl);
        listEl.classList.add(BULLET_STYLE_CLASS_PREFIX + getBulletStyleById(styleId).id);
    }

    // Remove every bullet-style class from an element. Used when converting
    // away from bullets so the style never leaks into checklists or numbered
    // lists, and never resurrects when converting back (default • applies).
    function clearBulletStyles(el) {
        if (!el || !el.classList) return;
        Array.from(el.classList)
            .filter(cls => cls.startsWith(BULLET_STYLE_CLASS_PREFIX))
            .forEach(cls => el.classList.remove(cls));
    }

    // All plain bullet lists that intersect the selection (multi-select aware).
    function getPlainBulletListsInRange(range, editor) {
        return Array.from(editor.querySelectorAll('ul')).filter(
            listEl => isPlainBulletList(listEl) && range.intersectsNode(listEl)
        );
    }

    // Apply a bullet style to the list(s) at the selection. Collapsed caret:
    // only the closest plain bullet list. Text selection: every plain bullet
    // list the selection crosses (multi-select aware). When the caret is not
    // in a bullet list at all, one is created first (from plain text or by
    // converting an ordered list). Checklists are left alone — their
    // conversion stays with the checklist/bullet buttons.
    function applyBulletStyle(styleId) {
        const editor = document.getElementById('editor');
        if (!editor) return;

        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        const range = selection.getRangeAt(0);

        let targets;
        if (range.collapsed) {
            let el = range.startContainer;
            if (el.nodeType === 3) el = el.parentElement;
            const closestList = el ? el.closest('ul') : null;
            targets = isPlainBulletList(closestList) ? [closestList] : [];
        } else {
            targets = getPlainBulletListsInRange(range, editor);
        }

        if (targets.length === 0) {
            const inChecklist = node => {
                const el = node.nodeType === 3 ? node.parentElement : node;
                return !!(el && el.closest('ul.checklist'));
            };
            if (inChecklist(range.startContainer) || inChecklist(range.endContainer)) return;

            // execCommand keeps the caret: re-derive the list from the fresh selection
            document.execCommand('insertUnorderedList', false, null);
            const fresh = window.getSelection();
            if (!fresh.rangeCount) return;
            let el = fresh.getRangeAt(0).startContainer;
            if (el.nodeType === 3) el = el.parentElement;
            const created = el ? el.closest('ul') : null;
            if (!isPlainBulletList(created)) return;
            targets = [created];
        }

        targets.forEach(listEl => setBulletStyleOnList(listEl, styleId));

        // Class changes don't fire native input events — notify listeners so
        // the undo snapshot, autosave and unsaved indicator all pick this up.
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        window.saveToLocalStorage && window.saveToLocalStorage();
        window.updateUnsavedIndicator && window.updateUnsavedIndicator();
    }

    // Nearest ancestor <ul> carrying an explicit bullet style, if any.
    function nearestStyledListAncestor(el) {
        let node = el.parentElement;
        while (node) {
            if (node.tagName === 'UL' && getBulletStyleId(node) !== 'disc') return node;
            node = node.parentElement;
        }
        return null;
    }

    // Chromium rebuilds nested lists on Tab indent without copying the parent's
    // style class. Copy the nearest styled ancestor onto the list itself and
    // every plain nested list without a style of its own, so indenting keeps
    // the marker. Accepts any list in the hierarchy (e.g. the fresh nested
    // list that closest('ul') resolves to right after an indent).
    function inheritBulletStyles(rootList) {
        if (!rootList) return;
        if (isPlainBulletList(rootList) && getBulletStyleId(rootList) === 'disc') {
            const styledAncestor = nearestStyledListAncestor(rootList);
            if (styledAncestor) setBulletStyleOnList(rootList, getBulletStyleId(styledAncestor));
        }
        rootList.querySelectorAll('ul').forEach(nested => {
            if (!isPlainBulletList(nested) || getBulletStyleId(nested) !== 'disc') return;
            const styledAncestor = nearestStyledListAncestor(nested);
            if (styledAncestor) setBulletStyleOnList(nested, getBulletStyleId(styledAncestor));
        });
    }

    // ── Toolbar dropdown (bullet style) ──────────────────────────────────────

    function renderBulletStyleMenu() {
        const menu = document.getElementById('bulletStyleMenu');
        if (!menu) return;
        menu.innerHTML = '';
        BULLET_STYLES.forEach(style => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'bullet-style-item';
            item.setAttribute('role', 'menuitem');
            item.dataset.styleId = style.id;

            // textContent everywhere: the glyph and label are code constants,
            // but text nodes need no escaping regardless.
            const glyph = document.createElement('span');
            glyph.className = 'bullet-style-glyph';
            glyph.textContent = style.cycle[0];
            // Raw Dutch label: the i18n walk/observer translates inserted
            // nodes (same pattern as StyleManager's dropdown items).
            const label = document.createElement('span');
            label.textContent = style.label;
            item.append(glyph, label);
            menu.appendChild(item);
        });
    }

    function closeBulletStyleMenu(toggleBtn, menu) {
        toggleBtn.classList.remove('active');
        menu.classList.remove('active');
    }

    function initBulletStyleDropdown() {
        const toggleBtn = document.getElementById('bulletStyleBtn');
        const menu = document.getElementById('bulletStyleMenu');
        if (!toggleBtn || !menu) return;

        renderBulletStyleMenu();

        // Move to body so toolbar overflow can never clip the open menu
        document.body.appendChild(menu);
        menu.style.position = 'fixed';
        menu.style.zIndex = '9999';

        const positionMenu = () => {
            const rect = toggleBtn.getBoundingClientRect();
            menu.style.top = (rect.bottom + 4) + 'px';
            menu.style.left = rect.left + 'px';
        };

        // preventDefault on mousedown keeps the editor selection alive
        toggleBtn.addEventListener('mousedown', e => e.preventDefault());

        toggleBtn.addEventListener('click', e => {
            e.stopPropagation();
            const isOpen = menu.classList.contains('active');
            if (!isOpen) positionMenu();
            toggleBtn.classList.toggle('active', !isOpen);
            menu.classList.toggle('active', !isOpen);
        });

        document.addEventListener('click', e => {
            if (!e.target.closest('#bulletStyleBtn') && !e.target.closest('#bulletStyleMenu')) {
                closeBulletStyleMenu(toggleBtn, menu);
            }
        });

        menu.addEventListener('mousedown', e => e.preventDefault());

        menu.addEventListener('click', e => {
            const item = e.target.closest('.bullet-style-item');
            if (!item) return;
            applyBulletStyle(item.dataset.styleId);
            closeBulletStyleMenu(toggleBtn, menu);
        });
    }

    // Create numeric (ordered) list
    function createNumericList() {
        const editor = document.getElementById('editor');
        if (!editor) return;

        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const range = selection.getRangeAt(0);

        // Use execCommand to toggle ordered list
        document.execCommand('insertOrderedList', false, null);
        editor.focus();

        // Bullet marker styles never carry into numbered lists — strip any
        // leftovers so converting back to bullets starts from the default •.
        Array.from(editor.querySelectorAll('ol'))
            .filter(olEl => range.intersectsNode(olEl))
            .forEach(clearBulletStyles);

        window.updateUnsavedIndicator && window.updateUnsavedIndicator();
    }

    // Toggle auto-detect bullet lists setting
    function setAutoDetectBulletLists(enabled) {
        _autoDetectBulletLists = enabled;
        saveSettings();
    }

    function getAutoDetectBulletLists() {
        return _autoDetectBulletLists;
    }

    // Initialize event listeners
    function init() {
        loadSettings();

        const editor = document.getElementById('editor');
        if (!editor) return;

        // Backspace handling for empty list items
        editor.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace') {
                handleListBackspace(e);
            }
        }, true); // Capture phase to intercept before browser default

        // Auto-detect "- " for bullet lists
        editor.addEventListener('keydown', (e) => {
            handleAutoBulletList(e);
        });

        // Wire up numeric list button
        const numericListBtn = document.getElementById('numericListBtn');
        if (numericListBtn) {
            numericListBtn.addEventListener('click', createNumericList);
        }

        // Wire up the bullet style dropdown (split-button next to bulletListBtn)
        initBulletStyleDropdown();
    }

    // Auto-init
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 0);
    }

    return {
        handleListBackspace,
        handleAutoBulletList,
        createNumericList,
        setAutoDetectBulletLists,
        getAutoDetectBulletLists,
        BULLET_STYLES,
        getBulletStyleId,
        clearBulletStyles,
        applyBulletStyle,
        inheritBulletStyles,
        init
    };
})();