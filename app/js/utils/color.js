// ==================== COLOUR UTILITIES ====================
// Pure WCAG-based colour math, shared with js/ui/accent.js. No dependencies
// and no DOM access, so the functions stay unit-testable in plain Node
// (window falls back to globalThis).
(function (root) {
    'use strict';

    var HEX_RE = /^#[0-9a-fA-F]{6}$/;

    // Parse '#rrggbb' (case-insensitive) to { r, g, b } bytes, null if invalid.
    // rgbToHex always emits lowercase, so derived values are normalised.
    function hexToRgb(hex) {
        if (typeof hex !== 'string' || !HEX_RE.test(hex)) return null;
        return {
            r: parseInt(hex.slice(1, 3), 16),
            g: parseInt(hex.slice(3, 5), 16),
            b: parseInt(hex.slice(5, 7), 16),
        };
    }

    function clampByte(value) {
        return Math.max(0, Math.min(255, Math.round(value)));
    }

    function rgbToHex(rgb) {
        var toHex = function (value) { return clampByte(value).toString(16).padStart(2, '0'); };
        return '#' + toHex(rgb.r) + toHex(rgb.g) + toHex(rgb.b);
    }

    // WCAG 2.x relative luminance (0 = black, 1 = white).
    function relativeLuminance(rgb) {
        var channel = function (value) {
            var c = value / 255;
            return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
    }

    // WCAG contrast ratio between two colours (1 to 21).
    function contrastRatio(a, b) {
        var la = relativeLuminance(a);
        var lb = relativeLuminance(b);
        return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    }

    // White or black — whichever reads better as text on the given background.
    // White wins whenever it meets the WCAG 3:1 UI-component threshold (the
    // shipped style is white-on-accent); black only takes over on light
    // accents (yellow, amber, …) where white would fall below it.
    function bestContrast(hex) {
        var bg = hexToRgb(hex);
        if (!bg) return '#ffffff';
        var white = contrastRatio(bg, { r: 255, g: 255, b: 255 });
        return white >= 3 ? '#ffffff' : '#000000';
    }

    // Mix `hexA` toward `hexB`; ratio = amount of B (0 = A unchanged, 1 = B).
    function mix(hexA, hexB, ratio) {
        var a = hexToRgb(hexA);
        var b = hexToRgb(hexB);
        if (!a || !b) return null;
        return rgbToHex({
            r: a.r + (b.r - a.r) * ratio,
            g: a.g + (b.g - a.g) * ratio,
            b: a.b + (b.b - a.b) * ratio,
        });
    }

    // Mix `hex` with white; ratio = amount of white (0 = unchanged, 1 = white).
    function mixWithWhite(hex, ratio) {
        return mix(hex, '#ffffff', ratio);
    }

    // Mix `hex` with black; ratio = amount of black (0 = unchanged, 1 = black).
    function mixWithBlack(hex, ratio) {
        return mix(hex, '#000000', ratio);
    }

    function lighten(hex, ratio) {
        return mixWithWhite(hex, ratio);
    }

    function darken(hex, ratio) {
        return mixWithBlack(hex, ratio);
    }

    // 'rgba(r, g, b, alpha)' string for translucent tint backgrounds.
    function rgbaString(hex, alpha) {
        var rgb = hexToRgb(hex);
        if (!rgb) return null;
        return 'rgba(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ', ' + alpha + ')';
    }

    // CSS custom properties for a user-chosen accent, mirroring how the factory
    // palette relates its variables: light mode darkens on hover and tints
    // toward white, dark mode lightens on hover and uses translucent tints.
    // Returns null when `hex` is not a valid '#rrggbb' colour.
    function deriveAccentVars(hex, mode) {
        var base = hexToRgb(hex);
        if (!base) return null;
        var dark = mode === 'dark';
        var primary = rgbToHex(base);
        return {
            '--primary-color': primary,
            '--primary-hover': dark ? lighten(primary, 0.18) : darken(primary, 0.15),
            '--primary': primary,
            '--primary-light': dark ? rgbaString(primary, 0.18) : mixWithWhite(primary, 0.9),
            '--accent': dark ? lighten(primary, 0.3) : primary,
            '--accent-light': dark ? rgbaString(primary, 0.22) : mixWithWhite(primary, 0.8),
            '--primary-contrast': bestContrast(primary),
        };
    }

    // CSS custom properties driven by the tint colour: the start colour of the
    // active-tab underline gradient and the paper-like backgrounds it tints
    // (document page, sidebar). Light mode mixes toward white; dark mode mixes
    // toward each surface's factory dark base so the tint stays subtle.
    // Returns null on invalid input.
    function deriveTintVars(hex, mode) {
        var base = hexToRgb(hex);
        if (!base) return null;
        var tint = rgbToHex(base);
        var dark = mode === 'dark';
        return {
            '--cyan-gradient-start': tint,
            '--document-tint': dark ? mix(tint, '#16163a', 0.85) : mixWithWhite(tint, 0.9),
            '--panel-tint': dark ? mix(tint, '#12122a', 0.85) : mixWithWhite(tint, 0.94),
        };
    }

    root.SummieColor = {
        hexToRgb: hexToRgb,
        rgbToHex: rgbToHex,
        relativeLuminance: relativeLuminance,
        contrastRatio: contrastRatio,
        bestContrast: bestContrast,
        mix: mix,
        mixWithWhite: mixWithWhite,
        mixWithBlack: mixWithBlack,
        lighten: lighten,
        darken: darken,
        rgbaString: rgbaString,
        deriveAccentVars: deriveAccentVars,
        deriveTintVars: deriveTintVars,
    };
})(typeof window !== 'undefined' ? window : globalThis);
