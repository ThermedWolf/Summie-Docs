// ==================== AUTO CAPITALIZE ====================
// Automatically capitalizes the first letter of sentences in the main editor

window.AutoCapitalize = (function () {
    'use strict';

    let _enabled = true; // Setting: auto-capitalize first letter of sentences

    // Track last deleted character position to avoid re-capitalizing on re-type
    let _lastDeleted = null; // { textNode, offset, char, timestamp }

    // Load setting from localStorage
    function loadSettings() {
        try {
            const stored = localStorage.getItem('summie_auto_capitalize');
            if (stored !== null) {
                _enabled = stored === '1';
            }
        } catch (e) { }
    }

    function saveSettings() {
        try {
            localStorage.setItem('summie_auto_capitalize', _enabled ? '1' : '0');
        } catch (e) { }
    }

    // Check if we should capitalize at this position
    function shouldCapitalize(textBeforeCursor) {
        // Start of document or paragraph — always capitalize the first letter
        if (textBeforeCursor === '') return true;
        // Find the last sentence-ending punctuation
        const sentenceEndRegex = /[.!?]\s+$/;
        return sentenceEndRegex.test(textBeforeCursor);
    }

    // Handle keydown to track backspace deletions
    function handleKeyDown(e) {
        if (!_enabled) return;
        if (e.key !== 'Backspace' && e.key !== 'Delete') return;

        const editor = document.getElementById('editor');
        if (!editor) return;

        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const range = selection.getRangeAt(0);
        if (!range.collapsed) return; // Only track when no selection

        const startContainer = range.startContainer;
        const startOffset = range.startOffset;

        // We only care about text nodes
        if (startContainer.nodeType !== 3) return;

        let deletedChar = null;
        if (e.key === 'Backspace') {
            if (startOffset > 0) {
                deletedChar = startContainer.textContent.charAt(startOffset - 1);
            }
        } else if (e.key === 'Delete') {
            if (startOffset < startContainer.textContent.length) {
                deletedChar = startContainer.textContent.charAt(startOffset);
            }
        }

        if (deletedChar && /[a-z]/i.test(deletedChar)) {
            // Track the deleted character position and the character itself
            _lastDeleted = {
                textNode: startContainer,
                offset: startOffset,
                char: deletedChar.toLowerCase(),
                timestamp: Date.now()
            };
        }
    }

    // Handle input event for auto-capitalize
    function handleInput(e) {
        if (!_enabled) return;

        const editor = document.getElementById('editor');
        if (!editor) return;

        // Only apply to main editor, not textboxes, code blocks, etc.
        const target = e.target;
        if (target !== editor && !editor.contains(target)) return;

        // Skip if we're inside a contenteditable that's not the main editor
        if (target.closest('[contenteditable="true"]') && target.closest('[contenteditable="true"]') !== editor) return;

        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const range = selection.getRangeAt(0);
        if (!range.collapsed) return; // Only when no selection

        const startContainer = range.startContainer;
        const startOffset = range.startOffset;

        // We only care about text nodes
        if (startContainer.nodeType !== 3) return;

        // Get the character that was just typed (the one before cursor)
        if (startOffset === 0) return;

        const char = startContainer.textContent.charAt(startOffset - 1);
        // Only capitalize letters
        if (!/[a-z]/.test(char)) return;

        // Check if this is a re-type of a just-deleted character
        // Don't capitalize if:
        // 1. The typed character matches the deleted character (case-insensitive)
        // 2. We're at the same text node and offset
        // 3. It happened recently (within 1 second)
        if (_lastDeleted &&
            _lastDeleted.textNode === startContainer &&
            _lastDeleted.offset === startOffset &&
            _lastDeleted.char === char.toLowerCase() &&
            Date.now() - _lastDeleted.timestamp < 1000) {
            // Clear the tracked deletion so it doesn't affect future typing
            _lastDeleted = null;
            return; // Don't capitalize - user is re-typing what they just deleted
        }

        // Get text before this character to check for sentence ending
        const textBeforeChar = startContainer.textContent.substring(0, startOffset - 1);

        if (shouldCapitalize(textBeforeChar)) {
            // Capitalize the character
            const before = startContainer.textContent.substring(0, startOffset - 1);
            const after = startContainer.textContent.substring(startOffset);
            startContainer.textContent = before + char.toUpperCase() + after;

            // Restore cursor position
            range.setStart(startContainer, startOffset);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);

            window.updateUnsavedIndicator && window.updateUnsavedIndicator();
        }
    }

    function setEnabled(enabled) {
        _enabled = enabled;
        saveSettings();
    }

    function getEnabled() {
        return _enabled;
    }

    function init() {
        loadSettings();

        const editor = document.getElementById('editor');
        if (!editor) return;

        // Listen for keydown to track backspace/delete
        editor.addEventListener('keydown', handleKeyDown, true); // Capture phase

        // Listen for input events on the editor
        editor.addEventListener('input', handleInput);
    }

    // Auto-init
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 0);
    }

    return {
        handleInput,
        setEnabled,
        getEnabled,
        init,
        _checkAndCapitalize: function(textNode, offset) {
            // Check if we should capitalize at this position
            if (!_enabled) return;
            if (!textNode || textNode.nodeType !== 3) return;
            if (offset <= 0) return;

            const char = textNode.textContent.charAt(offset - 1);
            if (!/[a-z]/.test(char)) return;

            const textBeforeChar = textNode.textContent.substring(0, offset - 1);

            if (shouldCapitalize(textBeforeChar)) {
                // Check if this is a re-type of a just-deleted character
                if (_lastDeleted &&
                    _lastDeleted.textNode === textNode &&
                    _lastDeleted.offset === offset &&
                    _lastDeleted.char === char.toLowerCase() &&
                    Date.now() - _lastDeleted.timestamp < 1000) {
                    _lastDeleted = null;
                    return;
                }

                // Capitalize the character
                const before = textNode.textContent.substring(0, offset - 1);
                const after = textNode.textContent.substring(offset);
                textNode.textContent = before + char.toUpperCase() + after;

                // Update cursor position
                const sel = window.getSelection();
                const range = document.createRange();
                range.setStart(textNode, offset);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);

                window.updateUnsavedIndicator && window.updateUnsavedIndicator();
            }
        }
    };
})();