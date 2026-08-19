// ==================== LIST HANDLING ====================
// Bullet list improvements + numeric list support

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

    // Auto-detect "- " to create bullet list
    function handleAutoBulletList(e) {
        if (!_autoDetectBulletLists) return;

        const editor = document.getElementById('editor');
        if (!editor) return;

        // Only trigger on space key after dash
        if (e.key !== ' ' && e.key !== 'Space') return;

        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const range = selection.getRangeAt(0);
        if (!range.collapsed) return; // Only when no selection

        const startContainer = range.startContainer;
        const startOffset = range.startOffset;

        // Must be in a text node at the beginning of a paragraph
        if (startContainer.nodeType !== 3) return;
        if (startOffset < 2) return; // Need at least "- " (2 chars)

        const text = startContainer.textContent;
        // Check if text starts with "- " (dash + space)
        if (!text.startsWith('- ')) return;

        // Must be at the start of a block element (p, div, etc.)
        let block = startContainer.parentElement;
        const blockTags = ['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE'];
        while (block && block !== editor && !blockTags.includes(block.tagName)) {
            block = block.parentElement;
        }

        if (!block || block === editor) return;
        // Don't trigger if already in a list
        if (block.closest('ul, ol')) return;

        // Check if this is the only content in the block
        const blockText = (block.textContent || '').trim();
        if (blockText !== '- ') return; // More content than just "- "

        e.preventDefault();

        // Replace the "- " with a bullet list
        // Remove the "- " text
        startContainer.textContent = '';
        // Create unordered list
        document.execCommand('insertUnorderedList', false, null);

        window.updateUnsavedIndicator && window.updateUnsavedIndicator();
    }

    // Create numeric (ordered) list
    function createNumericList() {
        const editor = document.getElementById('editor');
        if (!editor) return;

        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const range = selection.getRangeAt(0);

        // Check if we're already in an ordered list
        let inOrderedList = false;
        let container = range.commonAncestorContainer;
        if (container.nodeType === 3) container = container.parentElement;
        const ol = container.closest('ol');
        if (ol) inOrderedList = true;

        // Use execCommand to toggle ordered list
        document.execCommand('insertOrderedList', false, null);
        editor.focus();

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
        init
    };
})();