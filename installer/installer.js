// Summie Installer — renderer logic
// Flow: welcome → (existing? → update/repair/uninstall) → directory → progress → success
(() => {
    const $ = (s) => document.querySelector(s);
    const $$ = (s) => Array.from(document.querySelectorAll(s));

    let appInfo = null;
    let currentLang = 'en';
    let selectedAction = 'update'; // update | repair | uninstall
    let installDir = '';
    let lastInstallPath = '';

    const VIEWS = ['welcome', 'existing', 'directory', 'progress', 'success'];

    function setView(name) {
        VIEWS.forEach(v => {
            const el = $(`#view-${v}`);
            if (el) el.classList.toggle('active', v === name);
        });
    }

    function t(key) { return getTranslation(currentLang, key); }

    function applyLanguage(lang) {
        currentLang = lang;
        localStorage.setItem('summie-installer-lang', lang);

        // Text bindings
        const map = {
            't-welcomeTitle': 'welcomeTitle',
            't-tagline': 'brandTagline',
            't-existingTitle': 'existingTitle',
            't-existingSub': 'existingSubtitle',
            't-versionCurrent': 'versionCurrent',
            't-versionNew': 'versionNew',
            't-update': 'update',
            't-updateDesc': 'updateDesc',
            't-repair': 'repair',
            't-repairDesc': 'repairDesc',
            't-uninstall': 'uninstall',
            't-uninstallDesc': 'uninstallDesc',
            't-locationLabel': 'locationLabel',
            't-desktopShortcut': 'desktopShortcut',
            't-desktopShortcutHint': 'desktopShortcutHint',
        };
        Object.entries(map).forEach(([id, key]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = t(key);
        });

        const browseBtn = $('#btnBrowse');
        if (browseBtn) browseBtn.textContent = t('browse');
        const btnWelcome = $('#btnWelcomeContinue');
        if (btnWelcome) btnWelcome.textContent = t('continue');
        const btnExistingContinue = $('#btnExistingContinue');
        if (btnExistingContinue) btnExistingContinue.textContent = t('continue');
        const btnExistingBack = $('#btnExistingBack');
        if (btnExistingBack) btnExistingBack.textContent = t('back');
        const btnDirBack = $('#btnDirBack');
        if (btnDirBack) btnDirBack.textContent = t('back');
        const btnInstall = $('#btnInstall');
        if (btnInstall) btnInstall.textContent = t('install');
        const btnOpenFolder = $('#btnOpenFolder');
        if (btnOpenFolder) btnOpenFolder.textContent = t('openFolder');
        const btnLaunch = $('#btnLaunch');
        if (btnLaunch) btnLaunch.textContent = t('launch');
        const btnCloseSuccess = $('#btnCloseSuccess');
        if (btnCloseSuccess) btnCloseSuccess.textContent = t('close');

        // progress is set dynamically via setProgressStatus

        // lang switcher active state
        $$('#langSwitch .lang-btn').forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
    }

    function renderLangSwitcher() {
        const container = $('#langSwitch');
        if (!container) return;
        const langs = ['en', 'nl', 'de', 'fr', 'es'];
        const labels = { en: 'EN', nl: 'NL', de: 'DE', fr: 'FR', es: 'ES' };
        container.innerHTML = '';
        langs.forEach(l => {
            const btn = document.createElement('button');
            btn.className = 'lang-btn';
            btn.dataset.lang = l;
            btn.textContent = labels[l];
            btn.addEventListener('click', () => applyLanguage(l));
            container.appendChild(btn);
        });
    }

    function selectCard(action) {
        selectedAction = action;
        $$('.card--selectable').forEach(c => c.classList.toggle('card--active', c.dataset.action === action));
    }

    function setProgress(pct, statusKey) {
        const bar = $('#progressBar');
        const pctEl = $('#progressPct');
        const textEl = $('#progressText');
        const clamped = Math.max(0, Math.min(100, Math.round(pct)));
        if (bar) bar.style.width = clamped + '%';
        if (pctEl) pctEl.textContent = clamped + '%';
        if (textEl) {
            const keyMap = {
                preparing: 'preparing',
                copying: 'copying',
                registering: 'registering',
                shortcuts: 'shortcuts',
                repairing: 'repairing',
                uninstalling: 'uninstalling',
                done: 'done',
            };
            const k = keyMap[statusKey] || statusKey;
            textEl.textContent = t(k) || statusKey;
        }
    }

    function setSuccessContent(kind) {
        const icon = $('#successIcon');
        const title = $('#successTitle');
        const desc = $('#successDesc');
        if (!icon || !title || !desc) return;
        if (kind === 'repair') {
            icon.textContent = '✓';
            icon.style.background = 'linear-gradient(135deg, #3b82f6, #2563eb)';
            title.textContent = t('repairSuccessTitle');
            desc.textContent = t('repairSuccessDesc');
        } else if (kind === 'uninstall') {
            icon.textContent = '✕';
            icon.style.background = 'linear-gradient(135deg, #64748b, #334155)';
            title.textContent = t('uninstallSuccessTitle');
            desc.textContent = t('uninstallSuccessDesc');
        } else {
            icon.textContent = '✓';
            icon.style.background = 'linear-gradient(135deg, #22c55e, #16a34a)';
            title.textContent = t('installSuccessTitle');
            desc.textContent = t('installSuccessDesc');
        }
        // Toggle folder/launch buttons for uninstall
        const btnOpen = $('#btnOpenFolder');
        const btnLaunchBtn = $('#btnLaunch');
        if (btnOpen) btnOpen.style.display = kind === 'uninstall' ? 'none' : '';
        if (btnLaunchBtn) btnLaunchBtn.style.display = kind === 'uninstall' ? 'none' : '';
    }

    // ——— Init ———

    async function init() {
        try {
            appInfo = await window.installerAPI.getInfo();
        } catch {
            appInfo = { version: '4.3.0', defaultDir: '', existing: null, language: 'en', platform: 'win32' };
        }

        const versionBadge = $('#versionBadge');
        if (versionBadge && appInfo.version) versionBadge.textContent = `v${appInfo.version}`;
        const vcNew = $('#vc-new');
        if (vcNew && appInfo.version) vcNew.textContent = `v${appInfo.version}`;

        installDir = appInfo.defaultDir || '';
        const dirInput = $('#dirInput');
        if (dirInput) dirInput.value = installDir;

        // Existing install UI
        const hasExisting = Boolean(appInfo.existing && appInfo.existing.path);
        const compareEl = $('#versionCompare');
        const existingPathEl = $('#existingPath');
        const vcCurrent = $('#vc-current');
        if (hasExisting) {
            if (compareEl) compareEl.style.display = '';
            if (vcCurrent) vcCurrent.textContent = appInfo.existing.version ? `v${appInfo.existing.version}` : '—';
            if (existingPathEl) existingPathEl.textContent = appInfo.existing.path;
        } else {
            if (compareEl) compareEl.style.display = 'none';
            if (existingPathEl) existingPathEl.textContent = '';
        }

        // Language — prefer stored, else system
        renderLangSwitcher();
        const stored = localStorage.getItem('summie-installer-lang');
        const sysLang = appInfo.language || 'en';
        applyLanguage(stored || sysLang);

        // Progress listener
        window.installerAPI.onProgress(({ pct, status }) => setProgress(pct, status));

        // Card selection
        $$('.card--selectable').forEach(c => c.addEventListener('click', () => selectCard(c.dataset.action)));
        selectCard('update');
    }

    // ——— Navigation handlers ———

    function handleWelcomeContinue() {
        if (appInfo && appInfo.existing && appInfo.existing.path) {
            setView('existing');
        } else {
            setView('directory');
        }
    }

    function handleExistingContinue() {
        if (selectedAction === 'uninstall' || selectedAction === 'repair') {
            // Run that flow directly
            runAction(selectedAction);
        } else {
            // Update → go to directory (prefill existing path)
            if (appInfo.existing && appInfo.existing.path) {
                installDir = appInfo.existing.path;
                const dirInput = $('#dirInput');
                if (dirInput) dirInput.value = installDir;
            }
            setView('directory');
        }
    }

    async function handleBrowse() {
        try {
            const picked = await window.installerAPI.pickDirectory(installDir);
            if (picked) {
                installDir = picked;
                const dirInput = $('#dirInput');
                if (dirInput) dirInput.value = installDir;
            }
        } catch {}
    }

    async function handleInstall() {
        const desktopShortcut = $('#desktopShortcutToggle') ? $('#desktopShortcutToggle').checked : true;
        const dir = ($('#dirInput') ? $('#dirInput').value.trim() : installDir) || installDir;
        installDir = dir;
        runAction('install', { directory: dir, desktopShortcut });
    }

    async function runAction(kind, opts) {
        setView('progress');
        const statusMap = { install: 'installing', repair: 'repairing', uninstall: 'uninstalling' };
        setProgress(0, statusMap[kind] || 'preparing');
        lastInstallPath = (opts && opts.directory) || (appInfo.existing && appInfo.existing.path) || installDir;

        try {
            let result;
            if (kind === 'install') {
                result = await window.installerAPI.startInstall(opts);
            } else if (kind === 'repair') {
                result = await window.installerAPI.repair();
            } else if (kind === 'uninstall') {
                result = await window.installerAPI.uninstall();
            }

            if (result && result.success === false) throw new Error(result.error || 'failed');

            setProgress(100, 'done');
            setTimeout(() => {
                setSuccessContent(kind);
                setView('success');
                // Remember path for open-folder / launch
                if (result && result.path) lastInstallPath = result.path;
            }, 350);
        } catch (err) {
            setProgress(100, 'done');
            const title = $('#successTitle');
            const desc = $('#successDesc');
            const icon = $('#successIcon');
            if (title) title.textContent = t('error');
            if (desc) desc.textContent = (err && err.message) || t('errorDesc');
            if (icon) { icon.textContent = '!'; icon.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)'; }
            const btnOpen = $('#btnOpenFolder'); if (btnOpen) btnOpen.style.display = 'none';
            const btnLaunchBtn = $('#btnLaunch'); if (btnLaunchBtn) btnLaunchBtn.style.display = 'none';
            setTimeout(() => setView('success'), 300);
        }
    }

    // ——— Wire events after DOM ready ———

    document.addEventListener('DOMContentLoaded', () => {
        init();

        $('#btnWelcomeContinue')?.addEventListener('click', handleWelcomeContinue);
        $('#btnExistingBack')?.addEventListener('click', () => setView('welcome'));
        $('#btnExistingContinue')?.addEventListener('click', handleExistingContinue);
        $('#btnDirBack')?.addEventListener('click', () => {
            if (appInfo && appInfo.existing && appInfo.existing.path) setView('existing');
            else setView('welcome');
        });
        $('#btnBrowse')?.addEventListener('click', handleBrowse);
        $('#btnInstall')?.addEventListener('click', handleInstall);

        $('#btnOpenFolder')?.addEventListener('click', () => {
            const p = lastInstallPath || installDir || (appInfo && appInfo.defaultDir) || '';
            if (p) window.installerAPI.openPath(p);
        });
        $('#btnLaunch')?.addEventListener('click', () => {
            const p = lastInstallPath || installDir || '';
            if (p) {
                const exe = p.endsWith('.exe') ? p : (p + '/Summie.exe');
                window.installerAPI.openPath(exe).then(() => {
                    // Give OS a moment then close installer
                    setTimeout(() => window.installerAPI.close(), 600);
                });
            }
        });
        $('#btnCloseSuccess')?.addEventListener('click', () => window.installerAPI.close());

        $('#btnMin')?.addEventListener('click', () => window.installerAPI.minimize());
        $('#btnClose')?.addEventListener('click', () => window.installerAPI.close());
    });
})();
