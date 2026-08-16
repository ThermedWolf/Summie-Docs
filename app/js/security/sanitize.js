// ==================== CONTENT SANITISATION ====================
// Whitelist-based protection for content coming from .sumd files.
//
// .sumd files are untrusted input (opened via dialog, drag-drop, double-click
// or recents). Their `content` field is HTML that gets injected with innerHTML,
// so it must be sanitised before it ever reaches the DOM.
//
// The page CSP (script-src 'self') already blocks inline scripts and event
// handlers, but an active HTML allowlist is a second, structural layer of
// defence (script tags stripped, javascript: URLs dropped, DOM-clobbering
// `id`/`name` attributes removed, <style>/<form>/<object>/etc. forbidden).
//
// Requires js/lib/purify.min.js (DOMPurify) to be loaded first.

(function () {
    'use strict';

    const SUMD_FORBID_TAGS = [
        'style', 'script', 'form', 'input', 'select', 'option', 'optgroup',
        'template', 'video', 'audio', 'source', 'track', 'map', 'area',
        'picture', 'embed', 'object', 'iframe', 'link', 'meta', 'base', 'frame'
    ];

    function sanitizeSumdContent(html) {
        if (html === null || html === undefined) return '';
        if (typeof html !== 'string') return String(html);
        if (!html.trim()) return html;

        if (!window.DOMPurify || typeof window.DOMPurify.sanitize !== 'function') {
            // DOMPurify missing (e.g. page loaded without it) — degrade to fully
            // escaping the input. Regex-based HTML scrubbing is bypassable and
            // unsafe, so we never attempt it; escaped text cannot execute.
            return escapeHtml(html);
        }

        return window.DOMPurify.sanitize(html, {
            ADD_ATTR: ['contenteditable'],
            FORBID_TAGS: SUMD_FORBID_TAGS.slice(),
            ALLOW_UNKNOWN_PROTOCOLS: false,
            WHOLE_DOCUMENT: false
        })
            // Never let file-supplied `id`/`name` attributes land in the DOM —
            // they could clobber window.* globals the app relies on.
            .replace(/\s+(?:id|name)\s*=\s*(?:"[^"]*"|'[^']*')/gi, '');
    }

    function escapeHtml(str) {
        return String(str === null || str === undefined ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    window.sanitizeSumdContent = sanitizeSumdContent;
    window.escapeHtml = escapeHtml;
})();