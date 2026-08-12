// ==================== SUMMIE I18N CORE ====================
// Provides:
//   - SummieI18n.lang            current language ('nl' | 'en')
//   - SummieI18n.t(str)          translate a JS-generated string
//   - SummieI18n.apply(root)     translate the static HTML of a page
//   - SummieI18n.setLang(lang)   switch language & persist
//
// Dutch is the app's source language and stays unchanged everywhere;
// English is applied on top at runtime. Only {nl, en} are supported,
// with English as the universal fallback when a device language is
// not one of the two.
(function () {
    'use strict';

    const SUPPORTED = ['nl', 'en'];
    const LANG_KEY = 'summie_language';

    const EN = window.SummieI18nEN || {};

    // ── Language resolution ─────────────────────────────────────────────────
    // 1. stored preference (settings IPC / localStorage)
    // 2. device default if it is a supported language
    // 3. otherwise English (the universal fallback)
    function deviceLang() {
        let nav = '';
        try { nav = navigator.language || navigator.languages?.[0] || ''; } catch (e) { }
        const base = (nav || '').toLowerCase().split('-')[0];
        return SUPPORTED.includes(base) ? base : 'en';
    }

    function normalize(lang) {
        return SUPPORTED.includes(lang) ? lang : deviceLang();
    }

    // Synchronous initial value: prefer an explicit sync value exposed by the
    // preload bridge, then localStorage, then the device default.
    function initialLang() {
        const sync = window.appInfo && window.appInfo.language;
        if (sync === 'nl' || sync === 'en') return sync;
        try {
            const v = localStorage.getItem(LANG_KEY);
            if (v === 'nl' || v === 'en') return v;
        } catch (e) { }
        return deviceLang();
    }

    // ── Dictionary lookup ───────────────────────────────────────────────────
    // Plain keys are looked up directly. Template keys ({name}) are compiled
    // to regexes so already-interpolated strings like "5 min geleden" still
    // resolve against "{n} min geleden".
    const exact = new Map();
    const patterns = [];
    let patternsReady = false;

    function buildPatterns() {
        if (patternsReady) return;
        patternsReady = true;
        const keys = Object.keys(EN);
        keys.sort((a, b) => b.length - a.length);
        for (const key of keys) {
            if (key.indexOf('{') === -1) {
                exact.set(key, EN[key]);
                continue;
            }
            const tokens = [];
            const parts = [];
            const re = /\{([a-zA-Z0-9_]+)\}/g;
            let last = 0, m;
            while ((m = re.exec(key)) !== null) {
                parts.push(escapeRe(key.slice(last, m.index)));
                tokens.push(m[1]);
                last = m.index + m[0].length;
            }
            parts.push(escapeRe(key.slice(last)));
            patterns.push({
                re: new RegExp('^' + parts.join('(.+?)') + '$'),
                tokens,
                value: EN[key],
                key
            });
        }
    }

    function escapeRe(str) {
        return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function lookup(str) {
        const hit = exact.get(str);
        if (hit !== undefined) return hit;
        for (let i = 0; i < patterns.length; i++) {
            const p = patterns[i];
            const m = p.re.exec(str);
            if (m) {
                let out = p.value;
                for (let t = 0; t < p.tokens.length; t++) {
                    out = out.replace('{' + p.tokens[t] + '}', m[t + 1]);
                }
                return out;
            }
        }
        return null;
    }

    // ── Public t() ──────────────────────────────────────────────────────────
    function t(str) {
        if (currentLang === 'nl' || typeof str !== 'string' || !str) return str;
        buildPatterns();
        const found = lookup(str);
        return found !== null && found !== undefined ? found : str;
    }

    // ── Static HTML translation ──────────────────────────────────────────────
    // Translates text nodes and title/placeholder attributes whose (whitespace-
    // normalised) value exactly matches a dictionary key. Exact matching keeps
    // user content such as document names safe from accidental translation.
    function foldWs(str) {
        return String(str).replace(/\s+/g, ' ').trim();
    }

    const SKIP_SELECTOR = [
        'script', 'style', 'noscript', 'svg', 'iframe', 'template', 'code', 'pre', 'textarea',
        '[contenteditable="true"]', '.code-block', '.doc-preview-container', '.doc-preview',
        '.rdi-name', '.rdi-desc', '.rdi-path', '.rdi-tag', '.fav-chip-name', '.fav-doc-preview',
        '#docPreviewContainer', '#currentDocName', '.md-row-name', '.md-row-desc', '.md-tags',
        '.begrippen-list', '.references-list', '.inhoud-list', '.term-list',
        '.learning-term', '.learning-def', '.flashcard-term', '.flashcard-def', '.rdi-date',
        '.current-doc-name', '.current-doc-date', '.landing-doc-name', '.recent-doc-item'
    ].join(',');

    function inSkipZone(node) {
        let el = node.nodeType === 1 ? node : node.parentElement;
        while (el && el.nodeType === 1) {
            if (el.isContentEditable) return true;
            if (el.tagName === 'BODY') break;
            if (el.closest && el.closest(SKIP_SELECTOR)) return true;
            el = el.parentElement;
        }
        return false;
    }

    function walk(root) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
            if (!node.nodeValue || inSkipZone(node)) continue;
            const folded = foldWs(node.nodeValue);
            if (!folded) continue;
            const found = lookup(folded);
            if (found !== null && found !== undefined) {
                node.nodeValue = found;
            }
        }
        const els = root.querySelectorAll ? root.querySelectorAll('[title], [placeholder], [aria-label]') : [];
        els.forEach(el => {
            if (inSkipZone(el)) return;
            ['title', 'placeholder', 'aria-label'].forEach(attr => {
                if (!el.hasAttribute(attr)) return;
                const v = foldWs(el.getAttribute(attr));
                if (!v) return;
                const found = lookup(v);
                if (found !== null && found !== undefined) {
                    el.setAttribute(attr, found);
                }
            });
        });
    }

    // ── Language switching ───────────────────────────────────────────────────
    let currentLang = initialLang();

    function applyLang(lang, persist) {
        currentLang = normalize(lang);
        try {
            const el = document.documentElement;
            if (el) el.setAttribute('lang', currentLang);
        } catch (e) { }
        if (persist) {
            try { localStorage.setItem(LANG_KEY, currentLang); } catch (e) { }
            if (window.electron && window.electron.settingsSet) {
                window.electron.settingsSet({ language: currentLang }).catch(() => { });
            }
        }
        return currentLang;
    }

    // Re-resolve from async storage on demand (e.g. after settings change).
    async function resolveStored() {
        try {
            if (window.electron && window.electron.settingsGet) {
                const s = await window.electron.settingsGet();
                if (s && (s.language === 'nl' || s.language === 'en')) return s.language;
            }
        } catch (e) { }
        try {
            const v = localStorage.getItem(LANG_KEY);
            if (v === 'nl' || v === 'en') return v;
        } catch (e) { }
        return deviceLang();
    }

    async function init() {
        const stored = await resolveStored();
        if (currentLang !== stored) applyLang(stored, false);
    }

    function apply(root) {
        if (currentLang === 'nl') return;
        buildPatterns();
        walk(root || document.body);
    }

    // ── Dynamic HTML translation ────────────────────────────────────────────
    // Toolbars, dropdowns and other UI built at runtime as template strings are
    // injected after the initial apply(). A MutationObserver re-runs the same
    // exact-match walk on every inserted subtree, so dynamically-built labels
    // (title/placeholder/aria-label/text nodes) follow the current language.
    // Only childList is observed, so the walk's own text/attribute writes never
    // retrigger the observer.
    function observeDynamic(root) {
        const observer = new MutationObserver((mutations) => {
            if (currentLang === 'nl') return;
            buildPatterns();
            for (let i = 0; i < mutations.length; i++) {
                const added = mutations[i].addedNodes;
                for (let j = 0; j < added.length; j++) {
                    const node = added[j];
                    if (node.nodeType === 1) {
                        walk(node);
                    } else if (node.nodeType === 3) {
                        if (!node.nodeValue || inSkipZone(node)) continue;
                        const folded = foldWs(node.nodeValue);
                        if (!folded) continue;
                        const found = lookup(folded);
                        if (found !== null && found !== undefined) {
                            node.nodeValue = found;
                        }
                    }
                }
            }
        });
        observer.observe(root, { childList: true, subtree: true });
        return observer;
    }

    function setLang(lang) {
        applyLang(lang, true);
        apply();
    }

    const api = {
        get lang() { return currentLang; },
        t,
        init,
        apply,
        setLang,
        resolveStored,
        isEnglish() { return currentLang === 'en'; }
    };

    window.SummieI18n = api;
    // Convenience global alias used by inline dynamic strings.
    window.t = api.t.bind(api);

    // ── Auto-apply on page load ─────────────────────────────────────────────
    // Follows the theme.js pattern: no per-page wiring needed. The dictionary
    // (en.js) must be loaded before this script so window.SummieI18nEN exists.
    document.addEventListener('DOMContentLoaded', async () => {
        await init();
        apply();
        observeDynamic(document.documentElement || document.body);
        // Keep this window in sync when another window changes the language
        if (window.electron && window.electron.onLanguageChanged) {
            window.electron.onLanguageChanged((lang) => {
                applyLang(lang, false);
                apply();
            });
        }
    });
})();