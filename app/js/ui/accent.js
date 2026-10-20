// ==================== ACCENT COLOUR OVERRIDE ====================
// Applies the user's per-mode accent colour (app-wide settings accentLight /
// accentDark, null = factory palette) as inline CSS variables on <html>.
// Inline variables beat the [data-theme] stylesheet blocks, so the resolved
// mode's accent always wins while the factory palette stays untouched below.
// Depends on js/utils/color.js (window.SummieColor) for the derivations and
// follows the theme.js pattern: applied before first paint, re-synced after
// DOMContentLoaded, and propagated across windows via the 'accent-changed'
// IPC event.

(function () {
    'use strict';

    // Every variable the factory themes define from the accent, in both the
    // editor palette (--primary-color/…) and the landing palette (--primary/…).
    var VAR_NAMES = [
        '--primary-color',
        '--primary-hover',
        '--primary',
        '--primary-light',
        '--accent',
        '--accent-light',
        '--primary-contrast',
    ];
    var HEX_RE = /^#[0-9a-fA-F]{6}$/;

    var accents = { accentLight: null, accentDark: null };

    function sanitize(hex) {
        return (typeof hex === 'string' && HEX_RE.test(hex)) ? hex.toLowerCase() : null;
    }

    function currentTheme() {
        return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    }

    function clearOverrides() {
        var style = document.documentElement.style;
        VAR_NAMES.forEach(function (name) { style.removeProperty(name); });
    }

    // Apply the override for one resolved mode ('light' | 'dark').
    function apply(theme) {
        var hex = theme === 'dark' ? accents.accentDark : accents.accentLight;
        var vars = window.SummieColor ? window.SummieColor.deriveAccentVars(hex, theme) : null;
        if (!vars) {
            clearOverrides();
            return;
        }
        var style = document.documentElement.style;
        for (var name in vars) style.setProperty(name, vars[name]);
    }

    function setAccents(next) {
        accents = {
            accentLight: sanitize(next && next.accentLight),
            accentDark: sanitize(next && next.accentDark),
        };
        apply(currentTheme());
    }

    window.SummieAccent = {
        apply: apply,
        setAccents: setAccents,
        getAccents: function () {
            return { accentLight: accents.accentLight, accentDark: accents.accentDark };
        },
    };

    // Apply before first paint from the values injected by the main process.
    setAccents(window.appInfo && window.appInfo.accent);

    document.addEventListener('DOMContentLoaded', function () {
        // Re-sync with the persisted setting — covers navigating between pages
        // in one window, where the injected value may be stale, and
        // non-Electron environments where it is unavailable.
        if (window.electron && window.electron.settingsGet) {
            window.electron.settingsGet().then(function (settings) {
                if (settings) setAccents(settings);
            }).catch(function () { /* settings unavailable — keep injected values */ });
        }
        // Keep this window in sync when any window changes the setting.
        if (window.electron && window.electron.onAccentChanged) {
            window.electron.onAccentChanged(function (next) { setAccents(next); });
        }
    });
})();
