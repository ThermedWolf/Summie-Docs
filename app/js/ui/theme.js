// ==================== DONKERE MODUS ====================
// Applies the saved theme before first paint (this script must be loaded
// synchronously in <head>, before any CSS-dependent content renders) and
// wires up the topbar toggle button once the DOM is ready.

(function applyStoredTheme() {
    try {
        var theme = localStorage.getItem('summie_theme');
        if (theme === 'dark' || theme === 'light') {
            document.documentElement.setAttribute('data-theme', theme);
        }
    } catch (e) {
        // localStorage unavailable (e.g. sandboxed) — fall back to light theme
    }
})();

function summieSetTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try {
        localStorage.setItem('summie_theme', theme);
    } catch (e) {
        // ignore — theme just won't persist across restarts
    }
    var btn = document.getElementById('themeToggle');
    if (btn) {
        btn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
        btn.title = theme === 'dark' ? 'Lichte modus' : 'Donkere modus';
    }
}

function summieToggleTheme() {
    var current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    summieSetTheme(current === 'dark' ? 'light' : 'dark');
}

document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('themeToggle');
    if (!btn) return;
    var current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    btn.setAttribute('aria-pressed', current === 'dark' ? 'true' : 'false');
    btn.title = current === 'dark' ? 'Lichte modus' : 'Donkere modus';
    btn.addEventListener('click', summieToggleTheme);
});