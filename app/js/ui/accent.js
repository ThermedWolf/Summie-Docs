// ==================== ACCENT COLOUR OVERRIDE ====================
// Applies the user's two accent colours (app-wide settings accentTint /
// accentPrimary, null = factory palette) as inline CSS variables on <html>.
// Inline variables beat the [data-theme] stylesheet blocks, so the override
// always wins while the factory palette stays untouched below. Both colours
// apply to light and dark mode alike; only the derived companion values
// (hover shades, tints, contrast text) adapt to the resolved mode.
// Depends on js/utils/color.js (window.SummieColor) for the derivations and
// follows the theme.js pattern: applied before first paint, re-synced after
// DOMContentLoaded, and propagated across windows via the 'accent-changed'
// IPC event.

(function () {
    'use strict';

    var HEX_RE = /^#[0-9a-fA-F]{6}$/;

    // Variables derived from each colour, grouped so one can be customised
    // without touching the other's overrides.
    var TINT_VARS = ['--cyan-gradient-start', '--document-tint', '--panel-tint'];
    var PRIMARY_VARS = [
        '--primary-color',
        '--primary-hover',
        '--primary',
        '--primary-light',
        '--accent',
        '--accent-light',
        '--primary-contrast',
    ];

    var accents = { accentTint: null, accentPrimary: null };

    function sanitize(hex) {
        return (typeof hex === 'string' && HEX_RE.test(hex)) ? hex.toLowerCase() : null;
    }

    function currentTheme() {
        return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    }

    // Apply one group: set its variables from the derivation, or remove them
    // all when that colour is not customised (factory palette shows through).
    function applyGroup(varNames, derived) {
        var style = document.documentElement.style;
        if (!derived) {
            varNames.forEach(function (name) { style.removeProperty(name); });
            return;
        }
        varNames.forEach(function (name) {
            if (derived[name]) style.setProperty(name, derived[name]);
        });
    }

    // Apply the overrides for one resolved mode ('light' | 'dark').
    function apply(theme) {
        var math = window.SummieColor;
        if (!math) return;
        applyGroup(TINT_VARS, accents.accentTint && math.deriveTintVars(accents.accentTint, theme));
        applyGroup(PRIMARY_VARS, accents.accentPrimary && math.deriveAccentVars(accents.accentPrimary, theme));
    }

    function setAccents(next) {
        accents = {
            accentTint: sanitize(next && next.accentTint),
            accentPrimary: sanitize(next && next.accentPrimary),
        };
        apply(currentTheme());
    }

    window.SummieAccent = {
        apply: apply,
        setAccents: setAccents,
        getAccents: function () {
            return { accentTint: accents.accentTint, accentPrimary: accents.accentPrimary };
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
