// ==================== THEMA ====================
// Applies the theme before first paint (this script must be loaded
// synchronously in <head>, before any CSS-dependent content renders).
// The preference lives in the app-wide settings ('system' | 'dark' | 'light')
// and is injected into each window by the main process, so all pages use the
// same setting. Changes made in the settings panel propagate to every open
// window via the 'theme-changed' IPC event.

(function () {
    'use strict';

    var darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

    // Stored preference, resolved to a concrete theme in apply().
    var preference = 'system';

    function resolveTheme(pref) {
        if (pref === 'dark') return 'dark';
        if (pref === 'light') return 'light';
        return darkQuery.matches ? 'dark' : 'light';
    }

    function apply(pref) {
        var theme = resolveTheme(pref);
        document.documentElement.setAttribute('data-theme', theme);
    }

    function setPreference(pref) {
        if (pref !== 'dark' && pref !== 'light' && pref !== 'system') pref = 'system';
        preference = pref;
        apply(pref);
    }

    window.SummieTheme = {
        getPreference: function () { return preference; },
        setPreference: setPreference
    };

    // Apply before first paint using the setting injected by the main process.
    // Falls back to the OS preference when running outside of Electron.
    setPreference(window.appInfo && window.appInfo.theme ? window.appInfo.theme : 'system');

    // Follow OS preference changes when the setting is 'system'
    if (darkQuery.addEventListener) {
        darkQuery.addEventListener('change', function () {
            if (preference === 'system') apply(preference);
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        // Re-sync with the persisted setting — covers navigating between pages
        // in one window, where the injected value may be stale, and non-Electron
        // environments where it is unavailable.
        if (window.electron && window.electron.settingsGet) {
            window.electron.settingsGet().then(function (settings) {
                if (settings && settings.theme) setPreference(settings.theme);
            });
        }
        // Keep this window in sync when another window changes the setting
        if (window.electron && window.electron.onThemeChanged) {
            window.electron.onThemeChanged(function (theme) {
                setPreference(theme);
            });
        }
    });
})();