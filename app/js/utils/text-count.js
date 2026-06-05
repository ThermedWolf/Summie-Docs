// ==================== TEXT COUNTING ====================
// Shared text extraction for counters and export-adjacent checks.

(function () {
    function normalizeText(text) {
        return (text || '')
            .replace(/\u00a0/g, ' ')
            .replace(/\r\n?/g, '\n')
            .replace(/[ \t\f\v]+/g, ' ')
            .replace(/ *\n+ */g, '\n')
            .trim();
    }

    function getCodeBlockText(wrapper) {
        const textarea = wrapper && wrapper.querySelector && wrapper.querySelector('.code-block');
        return textarea ? textarea.value : (wrapper ? wrapper.innerText || wrapper.textContent || '' : '');
    }

    function isBlockElement(el) {
        return !!(el && /^(address|article|aside|blockquote|div|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tr|ul)$/i.test(el.tagName || ''));
    }

    function textFromNode(node) {
        if (!node) return '';

        if (node.nodeType === Node.TEXT_NODE) {
            return node.textContent || '';
        }

        if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
            return '';
        }

        if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node;
            if (
                el.classList.contains('placeholder-text') ||
                el.classList.contains('begrip-tooltip') ||
                el.classList.contains('ref-select-btn') ||
                el.classList.contains('code-highlighted-overlay')
            ) {
                return '';
            }
            if (el.classList.contains('code-block-wrapper')) {
                return getCodeBlockText(el);
            }
            if (el.tagName === 'BR') return '\n';
        }

        const text = Array.from(node.childNodes).map(textFromNode).join('');
        return node.nodeType === Node.ELEMENT_NODE && isBlockElement(node) ? `${text}\n` : text;
    }

    function getCountableText(root) {
        return normalizeText(textFromNode(root));
    }

    function countText(text) {
        const normalized = normalizeText(text);
        return {
            text: normalized,
            words: normalized ? normalized.split(/\s+/).filter(Boolean).length : 0,
            chars: normalized.length,
        };
    }

    function countNode(root) {
        return countText(getCountableText(root));
    }

    function getSelectionRootedFragment(selection, root) {
        if (!selection || selection.isCollapsed || !root) return null;

        const fragment = document.createDocumentFragment();
        for (let i = 0; i < selection.rangeCount; i++) {
            const range = selection.getRangeAt(i);
            const common = range.commonAncestorContainer;
            if (!root.contains(common.nodeType === Node.ELEMENT_NODE ? common : common.parentNode)) continue;
            fragment.appendChild(range.cloneContents());
        }
        return fragment.childNodes.length > 0 ? fragment : null;
    }

    function countSelection(selection, root) {
        const fragment = getSelectionRootedFragment(selection, root);
        return fragment ? countNode(fragment) : countText('');
    }

    window.SummieTextCount = {
        normalizeText,
        getCountableText,
        countText,
        countNode,
        countSelection,
    };
})();
