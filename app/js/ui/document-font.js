// ==================== DOCUMENT FONT ====================
// Holds the document's typeface state (window.DocumentFont). The font is a
// per-document property: chosen in the editor toolbar (js/format/fontfamily.js),
// persisted as the optional fontFamily field in the .sumd payload (fileio.js)
// and restored by applyLoadedData (editor.js). Missing field = system default,
// so older documents load unchanged.
//
// The font reaches the CSS through the --font-document custom property on
// <html>, consumed by .a4-page in styles.css and mirrored into preview
// iframes by document-preview.js.

(function () {
    'use strict';

    var DEFAULT_ID = 'default';

    // Same stack styles.css uses for the UI — the "Systeemstandaard" look.
    var DEFAULT_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif";

    // Curated font list for the toolbar picker. `stack` is the CSS value
    // (system fonts only — offline app, strict CSP), `docx` the Word font
    // name used by docx-export.js (null = leave Word's document default).
    var DOCUMENT_FONTS = [
        { id: 'default', name: 'Systeemstandaard', stack: DEFAULT_STACK, docx: null },
        { id: 'arial', name: 'Arial', stack: "Arial, Helvetica, sans-serif", docx: 'Arial' },
        { id: 'calibri', name: 'Calibri', stack: "Calibri, Carlito, sans-serif", docx: 'Calibri' },
        { id: 'georgia', name: 'Georgia', stack: "Georgia, 'Noto Serif', serif", docx: 'Georgia' },
        { id: 'times', name: 'Times New Roman', stack: "'Times New Roman', Times, 'Liberation Serif', serif", docx: 'Times New Roman' },
        { id: 'verdana', name: 'Verdana', stack: "Verdana, 'DejaVu Sans', sans-serif", docx: 'Verdana' },
        { id: 'trebuchet', name: 'Trebuchet MS', stack: "'Trebuchet MS', Tahoma, sans-serif", docx: 'Trebuchet MS' },
        { id: 'comicsans', name: 'Comic Sans MS', stack: "'Comic Sans MS', 'Comic Neue', cursive", docx: 'Comic Sans MS' },
    ];

    // Per-document override — null while no font-carrying choice is active.
    var documentFontId = null;

    function isValidFontId(id) {
        return !!id && DOCUMENT_FONTS.some(function (f) { return f.id === id; });
    }

    function fontById(id) {
        return DOCUMENT_FONTS.find(function (f) { return f.id === id; }) || null;
    }

    function applyStack(stack) {
        if (stack === DEFAULT_STACK) {
            // Keep the stylesheet's :root value authoritative for the default.
            document.documentElement.style.removeProperty('--font-document');
        } else {
            document.documentElement.style.setProperty('--font-document', stack);
        }
    }

    // Active font id — the value persisted in the payload/fingerprint.
    function getActiveFontId() {
        return documentFontId || DEFAULT_ID;
    }

    function getActiveStack() {
        return fontById(getActiveFontId()).stack;
    }

    // Per-document font from the .sumd payload or the toolbar picker.
    // Missing/invalid/'default' falls back to the system default.
    function applyDocumentFont(id) {
        documentFontId = (id && id !== DEFAULT_ID && isValidFontId(id)) ? id : null;
        applyStack(getActiveStack());
    }

    // Stack for a payload font id — falls back to the active font for
    // missing/invalid/'default' ids (backward compatible with older files).
    function stackForFontId(id) {
        var font = (id && id !== DEFAULT_ID && isValidFontId(id)) ? fontById(id) : null;
        return font ? font.stack : getActiveStack();
    }

    // Word font name for docx export, or null for the system default
    // (export omits the font so Word keeps its own document default).
    function getExportFont() {
        return fontById(getActiveFontId()).docx;
    }

    window.DocumentFont = {
        DOCUMENT_FONTS: DOCUMENT_FONTS,
        DEFAULT_ID: DEFAULT_ID,
        isValidFontId: isValidFontId,
        applyDocumentFont: applyDocumentFont,
        resetDocumentFont: function () { applyDocumentFont(null); },
        getActiveFontId: getActiveFontId,
        getActiveStack: getActiveStack,
        stackForFontId: stackForFontId,
        getExportFont: getExportFont
    };
})();
