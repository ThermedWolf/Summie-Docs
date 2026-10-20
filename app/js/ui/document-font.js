// ==================== DOCUMENT FONT ====================
// Applies the document font before first paint (this script must be loaded
// synchronously in <head>, right after theme.js). The app-wide preference
// ('default' | a font id from DOCUMENT_FONTS) is injected into each window by
// the main process via appInfo, exactly like the theme. Changes made in the
// settings panel propagate to every open window via the 'font-changed' IPC
// event.
//
// On top of the app-wide default, a document may carry its own optional
// `fontFamily` field in the .sumd payload (see fileio.js). While such a
// document is open its font overrides the app default; the override is
// cleared by newSummary() / the next applyLoadedData().
//
// The font reaches the CSS through the --font-document custom property,
// consumed by .a4-page in styles.css and by document-preview.js iframes.

(function () {
    'use strict';

    // Same stack styles.css uses for the UI — the "Systeemstandaard" look.
    var DEFAULT_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif";

    // Curated font list for the settings panel. `stack` is the CSS value
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

    // App-wide preference, resolved to a concrete stack in apply().
    var appFontId = 'default';
    // Per-document override (font id or null while no font-carrying document is open).
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

    function applyAppFont(id) {
        if (!isValidFontId(id)) id = 'default';
        appFontId = id;
        if (!documentFontId) applyStack(fontById(appFontId).stack);
    }

    // Per-document font from a .sumd payload. Missing/invalid/'default' falls
    // back to the app-wide default, so older files load unchanged.
    function applyDocumentFont(id) {
        if (id === 'default') {
            documentFontId = null;
        } else if (isValidFontId(id)) {
            documentFontId = id;
        } else {
            documentFontId = null;
        }
        applyStack(fontById(documentFontId || appFontId).stack);
    }

    // Active font id — the value persisted in the payload/fingerprint.
    function getActiveFontId() {
        return documentFontId || appFontId;
    }

    function getActiveStack() {
        return fontById(getActiveFontId()).stack;
    }

    // Word font name for docx export, or null for the system default
    // (export omits the font so Word keeps its own document default).
    function getExportFont() {
        return fontById(getActiveFontId()).docx;
    }

    // Stack for a payload font id — falls back to the active font for
    // missing/invalid/'default' ids (backward compatible with older files).
    function stackForFontId(id) {
        const font = (id && id !== 'default' && isValidFontId(id)) ? fontById(id) : null;
        return font ? font.stack : getActiveStack();
    }

    window.DocumentFont = {
        DOCUMENT_FONTS: DOCUMENT_FONTS,
        isValidFontId: isValidFontId,
        applyAppFont: applyAppFont,
        applyDocumentFont: applyDocumentFont,
        resetDocumentFont: function () { applyDocumentFont(null); },
        getAppFontId: function () { return appFontId; },
        getActiveFontId: getActiveFontId,
        getActiveStack: getActiveStack,
        stackForFontId: stackForFontId,
        getExportFont: getExportFont
    };

    // Apply before first paint using the setting injected by the main process.
    // Falls back to the stylesheet default when running outside of Electron.
    applyAppFont(window.appInfo && window.appInfo.documentFont ? window.appInfo.documentFont : 'default');

    document.addEventListener('DOMContentLoaded', function () {
        // Re-sync with the persisted setting — covers navigating between pages
        // in one window, where the injected value may be stale, and
        // non-Electron environments where it is unavailable.
        if (window.electron && window.electron.settingsGet) {
            window.electron.settingsGet().then(function (settings) {
                if (settings) applyAppFont(settings.documentFont);
            });
        }
        // Keep this window in sync when another window changes the setting.
        // A per-document override stays in charge while its document is open.
        if (window.electron && window.electron.onFontChanged) {
            window.electron.onFontChanged(function (fontId) {
                applyAppFont(fontId);
            });
        }
    });
})();
