// ==================== SPELL CHECKER ====================
// Real-time spelling check with auto-correct integration.
// Uses AI Engine for ML-based corrections, falls back to dictionary for common words.

(function () {
    'use strict';

    // Configuration
    const AUTO_CORRECT_THRESHOLD = 70; // Will be overridden by settings
    const DEBOUNCE_MS = 500;

    // State
    let enabled = true;
    let autoCorrectEnabled = true;
    let autoCorrectThreshold = AUTO_CORRECT_THRESHOLD;
    let currentLanguage = 'nl'; // UI fallback; blocks auto-detect (LangDetect)
    let debounceTimer = null;
    let isProcessing = false;
    let modelLoaded = false;
    let hunspellOk = false; // true once a hunspell batch succeeded

    // Cache for corrections
    const correctionCache = new Map();
    const knownWords = new Set(); // User's personal dictionary
    const ignoredWords = new Set(); // Session-only ignores
    const autoFixedWords = new Set(); // Words auto-corrected once — never re-auto (user may have undone)

    // Correctness authority is Hunspell (morphology) + typo overrides below.
    // No bundled wordlist is consulted for correctness.
    //
    // Curated always-accept words: real words Hunspell legitimately misses
    // (covid), accented essentials (één), ubiquitous informal (ok). Checked
    // before everything except typo-overrides; case-insensitive.
    const SUPPLEMENT = new Set(['covid', 'één', 'ok']);

    // Initialize spell checker
    async function init() {
        // Load settings
        await loadSettings();

        // Preload neural model for current language (Hunspell needs no preload)
        if (window.AIEngine) {
            try {
                await window.AIEngine.preloadForLanguage(currentLanguage);
                modelLoaded = true;
                console.log('[Spell Checker] Model loaded for', currentLanguage);
            } catch (err) {
                console.info('[Spell Checker] Hunspell active (no neural spell model bundled).');
                modelLoaded = false;
            }
        }

        // Hook into editor
        hookEditor();

        // Listen for language changes
        if (window.electron && window.electron.onLanguageChanged) {
            window.electron.onLanguageChanged(async (lang) => {
                currentLanguage = lang;
                await loadSettings();
                if (window.AIEngine) {
                    try {
                        await window.AIEngine.preloadForLanguage(lang);
                        modelLoaded = true;
                    } catch (err) {
                        modelLoaded = false;
                    }
                }
                recheckDocument();
            });
        }

        // Listen for settings changes
        if (window.electron && window.electron.onSettingsChanged) {
            window.electron.onSettingsChanged(async (patch) => {
                if (patch.aiSpellingEnabled !== undefined) enabled = patch.aiSpellingEnabled;
                if (patch.aiAutoCorrectEnabled !== undefined) autoCorrectEnabled = patch.aiAutoCorrectEnabled;
                if (patch.aiAutoCorrectThreshold !== undefined) autoCorrectThreshold = patch.aiAutoCorrectThreshold;
                if (patch.aiModelTier !== undefined) {
                    // Model tier change requires reload
                }
                if (!enabled) clearAllHighlights();
            });
        }

        // Warm up the main-process hunspell instances while idle so the
        // first real check pass doesn't pay the one-time load cost.
        const warmHunspell = () => {
            try {
                if (window.electron && window.electron.hunspellCheck) {
                    window.electron.hunspellCheck(['test']).catch(() => {});
                }
            } catch { /* ignore */ }
        };
        if ('requestIdleCallback' in window) requestIdleCallback(warmHunspell);
        else setTimeout(warmHunspell, 3000);

        console.log('[Spell Checker] Initialized');
    }

    async function loadSettings() {
        if (window.electron && window.electron.settingsGet) {
            try {
                const settings = await window.electron.settingsGet();
                enabled = settings.aiEnabled && settings.aiSpellingEnabled;
                autoCorrectEnabled = settings.aiAutoCorrectEnabled !== false;
                autoCorrectThreshold = settings.aiAutoCorrectThreshold || AUTO_CORRECT_THRESHOLD;
            } catch (err) {
                console.warn('[Spell Checker] Failed to load settings:', err);
            }
        }
    }

    // Hook into editor's MutationObserver (like highlightBegrippen)
    function hookEditor() {
        const editor = document.getElementById('editor');
        if (!editor) {
            setTimeout(hookEditor, 100);
            return;
        }

        // Use existing MutationObserver pattern from highlightBegrippen
        const observer = new MutationObserver(debouncedCheck);
        observer.observe(editor, {
            childList: true,
            subtree: true,
            characterData: true,
        });

        // Right-click on a flagged word opens the suggestion menu
        editor.addEventListener('contextmenu', async (e) => {
            if (!enabled) return;
            const errEl = e.target && e.target.closest ? e.target.closest('.spell-error') : null;
            if (!errEl || !editor.contains(errEl)) return;
            e.preventDefault();
            document.getElementById('spellContextMenu')?.remove();
            let sugs = [];
            try { sugs = JSON.parse(errEl.dataset.suggestions || '[]'); } catch { /* recompute below */ }
            if (!sugs.length) {
                const orig = errEl.dataset.original || errEl.textContent || '';
                const lang = errEl.dataset.lang || currentLanguage;
                if (orig && window.electron && window.electron.hunspellCheck) {
                    try {
                        const res = await window.electron.hunspellCheck([orig]);
                        const r = res && res.success && res.results && res.results[0];
                        if (r) {
                            const d = decideHun(orig, orig.toLowerCase(), lang, r);
                            if (d && d.suggestions) sugs = d.suggestions.map(s => s.word);
                        }
                    } catch { /* keep menu without suggestions */ }
                }
            }
            showSpellContextMenu(errEl, { x: e.clientX, y: e.clientY }, sugs);
        });

        // Initial check
        setTimeout(() => checkDocument(), 1000);
    }

    function debouncedCheck() {
        if (!enabled) return;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => checkDocument(), DEBOUNCE_MS);
    }

    // Main check function - processes visible text nodes
    async function checkDocument() {
        if (!enabled || isProcessing) return;

        const editor = document.getElementById('editor');
        if (!editor) return;

        isProcessing = true;

        try {
            const hunBridge = !!(window.electron && window.electron.hunspellCheck);

            // Get all text nodes in editor
            const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null, false);
            const textNodes = [];
            let node;
            while (node = walker.nextNode()) {
                // Skip code blocks, existing error spans, etc.
                if (shouldSkipNode(node)) continue;
                if (!node.textContent || !node.textContent.trim()) continue;
                textNodes.push(node);
            }

            // Caret position once per pass (never touch the word being typed)
            const sel = window.getSelection();
            const caret = sel && sel.rangeCount && sel.isCollapsed ? {
                node: sel.getRangeAt(0).startContainer,
                off: sel.getRangeAt(0).startOffset,
            } : null;

            // Phase 1: fast sync decisions; collect words needing hunspell.
            // Each block auto-detects its language (LangDetect), falling
            // back to the UI language for short/mixed text.
            const jobs = [];
            const needHun = [];
            const seenHun = new Set();
            const langVotes = { nl: 0, en: 0 };
            for (const n of textNodes) {
                if (!n.isConnected) continue;
                const blockLang = (window.LangDetect && window.LangDetect.detect(n.textContent)) || currentLanguage;
                langVotes[blockLang] = (langVotes[blockLang] || 0) + 1;
                const words = collectCheckWords(n, caret);
                const job = { node: n, fullText: n.textContent, lang: blockLang, items: [] };
                for (const w of words) {
                    const lower = w.word.toLowerCase();
                    const key = `${blockLang}:${lower}`;
                    let d = correctionCache.get(key);
                    if (d === undefined) {
                        d = decideFast(w.word, lower, blockLang, hunBridge);
                        if (d && d.needHun) {
                            if (!seenHun.has(blockLang + ':' + lower) && needHun.length < 40) {
                                seenHun.add(blockLang + ':' + lower);
                                needHun.push(w.word);
                            }
                            d = undefined; // deferred to phase 3
                        } else {
                            correctionCache.set(key, d);
                        }
                    }
                    job.items.push({ info: w, lower, key, decision: d });
                }
                if (job.items.length) jobs.push(job);
            }
            updateDocLangStatus(langVotes);

            // Phase 2: a single batched hunspell call for the whole pass
            let hunMap = null;
            if (needHun.length && hunBridge) {
                try {
                    const res = await window.electron.hunspellCheck(needHun);
                    if (res && res.success && Array.isArray(res.results)) {
                        hunMap = new Map();
                        for (const r of res.results) hunMap.set(String(r.word).toLowerCase(), r);
                        hunspellOk = true;
                    }
                } catch { hunspellOk = false; }
            }

            // Phase 3: resolve deferred decisions, apply right-to-left
            for (let i = 0; i < jobs.length; i++) {
                const job = jobs[i];
                if (!job.node.isConnected) continue;
                let prefixNode = job.node;
                for (let k = job.items.length - 1; k >= 0; k--) {
                    const item = job.items[k];
                    const wordInfo = item.info;
                    if (!prefixNode.isConnected) break;
                    if (wordInfo.end > prefixNode.textContent.length) continue; // stale offset
                    let decision = item.decision;
                    if (decision === undefined) {
                        const r = hunMap ? hunMap.get(item.lower) : null;
                        // No hunspell verdict (bridge failed): never flag.
                        decision = r ? decideHun(wordInfo.word, item.lower, job.lang, r) : null;
                        correctionCache.set(item.key, decision);
                    }
                    if (!decision) continue;
                    prefixNode = applyDecision(prefixNode, wordInfo, decision, item.lower, job.fullText, job.lang);
                    if (!prefixNode) break;
                }
                if (i % 10 === 9) await new Promise(r => setTimeout(r, 0));
            }
        } finally {
            isProcessing = false;
        }
    }

    function shouldSkipNode(textNode) {
        let parent = textNode.parentElement;
        while (parent && parent !== document.getElementById('editor')) {
            if (parent.classList && (
                parent.classList.contains('code-block') ||
                parent.classList.contains('code-block-wrapper') ||
                parent.classList.contains('summie-inline-code') ||
                parent.classList.contains('spell-error') ||
                parent.classList.contains('grammar-error') ||
                parent.tagName === 'PRE' ||
                parent.tagName === 'CODE' ||
                parent.isContentEditable === false
            )) return true;
            parent = parent.parentElement;
        }
        return false;
    }

    // Collect checkable words of one node (phase 1). The caret word is left
    // alone — it may still be typed (mid-word auto-correct would otherwise
    // eat characters, e.g. "writ|e").
    function collectCheckWords(node, caret) {
        const text = node.textContent;
        const skipRanges = getSkipRanges(text);
        const caretHere = !!(caret && caret.node === node);
        return extractWords(text).filter(w => {
            if (inSkipRange(w, skipRanges)) return false;
            if (shouldSkipWord(w.word)) return false;
            if (caretHere && w.start <= caret.off && caret.off <= w.end) return false;
            return true;
        });
    }

    // Sentence starts get mechanical capitalization (the app even has an
    // auto-capitalize feature), so it carries no "proper noun" meaning there.
    function isSentenceStart(text, start) {
        let j = start - 1;
        const skip = /[\s\u00a0"'“”‘’«»()\[\]{}]/;
        while (j >= 0 && skip.test(text[j])) j--;
        if (j < 0) return true;
        return /[.!?…]/.test(text[j]);
    }

    function isCapitalized(word) {
        return /^[A-ZÀ-Þ][a-zà-öø-ÿ'’\-]*$/.test(word);
    }

    function getSkipRanges(text) {
        // URLs and e-mail addresses are never spell-checked
        const ranges = [];
        const re = /https?:\/\/\S+|www\.\S+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
        let m;
        while ((m = re.exec(text)) !== null) ranges.push([m.index, m.index + m[0].length]);
        return ranges;
    }

    function inSkipRange(wordInfo, ranges) {
        for (let i = 0; i < ranges.length; i++) {
            if (wordInfo.start < ranges[i][1] && wordInfo.end > ranges[i][0]) return true;
        }
        return false;
    }

    // Replace [start,end) inside prefixNode; returns the stable prefix node.
    function replaceRange(prefixNode, start, end, makeContent) {
        const parent = prefixNode.parentNode;
        if (!parent) return null;
        const len = prefixNode.textContent.length;
        const s = Math.max(0, Math.min(start, len));
        const e = Math.max(s, Math.min(end, len));
        if (e <= s) return prefixNode;
        const afterNode = prefixNode.splitText(s);
        afterNode.splitText(e - s);
        parent.replaceChild(makeContent(), afterNode);
        return prefixNode;
    }

    // Document language indicator in the AI toolbar (majority vote).
    let _lastDocLangShown = null;
    function updateDocLangStatus(votes) {
        const total = (votes.nl || 0) + (votes.en || 0);
        if (!total) return;
        const docLang = votes.en > votes.nl ? 'en' : 'nl';
        window.__docLang = docLang;
        if (docLang === _lastDocLangShown) return;
        _lastDocLangShown = docLang;
        try {
            const el = document.querySelector('#aiStatusIndicator .ai-status-text');
            if (el) el.textContent = `${SummieI18n.t('Gereed')} · ${docLang.toUpperCase()}`;
        } catch { /* status element absent (landing page) */ }
    }

    function applyDecision(prefixNode, wordInfo, decision, lower, fullText, lang) {
        const atBoundary = wordInfo.end >= prefixNode.textContent.length ||
            /[\s.,;:!?)\]}'’"”]/.test(prefixNode.textContent[wordInfo.end] || '');
        // Mid-sentence capitals are likely proper nouns (never auto-touch);
        // sentence starts are mechanically capitalized, so unambiguous typos
        // there auto-correct with case preserved ("Boomm" → "Boom").
        const sentenceStart = isSentenceStart(fullText || '', wordInfo.start);
        const allowAuto = autoCorrectEnabled && decision.correction &&
            decision.confidence >= autoCorrectThreshold &&
            !autoFixedWords.has(lower) && atBoundary &&
            (decision.override || wordInfo.word === lower ||
                (isCapitalized(wordInfo.word) && sentenceStart));

        if (!allowAuto) {
            // Highlight only — suggestions travel in the dataset for the menu
            return replaceRange(prefixNode, wordInfo.start, wordInfo.end, () => {
                const span = document.createElement('span');
                span.className = 'spell-error';
                span.dataset.original = wordInfo.word;
                span.dataset.lang = lang || currentLanguage;
                span.dataset.suggestions = JSON.stringify((decision.suggestions || []).map(s => s.word).slice(0, 5));
                span.textContent = wordInfo.word;
                const frag = document.createDocumentFragment();
                frag.appendChild(span);
                return frag;
            });
        }
        // Auto-correct (high confidence; undoable via UndoManager snapshots)
        autoFixedWords.add(lower);
        const fixed = decision.correction;
        const out = replaceRange(prefixNode, wordInfo.start, wordInfo.end, () => {
            const frag = document.createDocumentFragment();
            frag.appendChild(document.createTextNode(fixed));
            return frag;
        });
        trackCorrection(wordInfo.word, fixed, null, wordInfo.start);
        if (window.updateUnsavedIndicator) window.updateUnsavedIndicator();
        if (window.UndoManager) window.UndoManager.notifyExternalChange();
        return out;
    }

    function extractWords(text) {
        // Split by word boundaries (incl. accented letters), keep positions
        const words = [];
        const regex = /[A-Za-zÀ-ÖØ-öø-ÿ'’\-]+/g;
        let match;
        while ((match = regex.exec(text)) !== null) {
            words.push({
                word: match[0],
                start: match.index,
                end: match.index + match[0].length,
            });
        }
        return words;
    }

    function shouldSkipWord(word) {
        const lower = word.toLowerCase();
        if (lower.length <= 1) return true;
        if (knownWords.has(lower)) return true;
        if (ignoredWords.has(lower)) return true;
        if (/\d/.test(word)) return true; // contains digits (mp3, covid19, …)
        if (/^[A-ZÀ-Þ]{2,}$/.test(word)) return true; // acronyms (NASA, PvdA)
        // mixedCase brand/identifier (iPhone, eBay, PowerPoint) — never touch
        if (/[a-zà-öø-ÿ][A-ZÀ-Þ]/.test(word)) return true;
        return false;
    }

    function matchCase(original, suggestion) {
        if (/[A-ZÀ-Þ]/.test(original) && original === original.toUpperCase()) return suggestion.toUpperCase();
        if (original[0] === original[0].toUpperCase()) return suggestion[0].toUpperCase() + suggestion.slice(1);
        return suggestion;
    }

    // Fast sync decision. Correctness authority is Hunspell (morphology);
    // the only instant passes are curated overrides, the tiny supplement set
    // and capitalized proper nouns ("Jan" — Hunspell rejects names by
    // design). Null = correct.
    function decideFast(word, lower, language, hunBridge) {
        const typoMap = language === 'nl' ? NL_TYPOS : EN_TYPOS;
        if (typoMap[lower]) {
            const corr = matchCase(word, typoMap[lower]);
            return { correction: corr, suggestions: [{ word: corr, dist: 0 }], confidence: 95, override: true };
        }
        if (SUPPLEMENT.has(lower)) return null;
        if (isCapitalized(word) && window.PROPER_NOUNS && window.PROPER_NOUNS.has(lower)) return null;
        if (hunBridge) return { needHun: true };
        return null; // no engine reachable — never flag
    }

    // Hunspell verdict: morphology (inflections, compounds) decides
    // correctness in BOTH languages (mixed-language documents); suggestions
    // come from the block's language in Hunspell's own quality order.
    // Auto-correct only fires on a single unambiguous distance-1 candidate.
    function decideHun(word, lower, language, r) {
        if (r.okNl || r.okEn) return null;
        const raw = (language === 'nl' ? r.sugNl : r.sugEn) || [];
        const seen = new Set();
        const ranked = [];
        for (const s of raw) {
            const sw = String(s);
            const sl = sw.toLowerCase();
            if (!sl || sl === lower || seen.has(sl)) continue;
            seen.add(sl);
            const d = (sl.length <= 32 && lower.length <= 32) ? editDist(lower, sl) : 9;
            ranked.push({ word: matchCase(word, sw), dist: d });
        }
        ranked.sort((a, b) => a.dist - b.dist);
        const list = ranked.slice(0, 5);
        if (!list.length) return { correction: null, suggestions: [], confidence: 0 };
        const d1 = list.filter(s => s.dist === 1).length;
        const conf = (list[0].dist === 1 && d1 === 1) ? 85 : 60;
        return { correction: list[0].word, suggestions: list, confidence: conf };
    }

    // Optimal String Alignment distance (transpositions count as 1).
    function editDist(a, b) {
        const m = a.length, n = b.length;
        if (!m) return n;
        if (!n) return m;
        let prev = new Array(n + 1), cur = new Array(n + 1), prev2 = new Array(n + 1).fill(0);
        for (let j = 0; j <= n; j++) prev[j] = j;
        for (let i = 1; i <= m; i++) {
            cur[0] = i;
            for (let j = 1; j <= n; j++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
                if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
                    v = Math.min(v, prev2[j - 2] + 1);
                }
                cur[j] = v;
            }
            const tmp = prev2; prev2 = prev; prev = cur; cur = tmp;
        }
        return prev[n];
    }

    function trackCorrection(original, corrected, textNode, position) {
        // Store for potential undo
        if (!window._spellCorrections) window._spellCorrections = [];
        window._spellCorrections.push({
            original,
            corrected,
            textNode,
            position,
            timestamp: Date.now(),
        });
    }

    function clearAllHighlights() {
        const editor = document.getElementById('editor');
        if (!editor) return;
        editor.querySelectorAll('.spell-error').forEach(span => {
            span.parentNode.replaceChild(document.createTextNode(span.textContent), span);
        });
        editor.normalize();
    }

    function recheckDocument() {
        clearAllHighlights();
        correctionCache.clear();
        checkDocument();
    }

    // Context menu for spell errors (opened on right-click, see hookEditor)
    function showSpellContextMenu(spellError, pos, suggestions) {
        // Remove existing
        const existing = document.getElementById('spellContextMenu');
        if (existing) existing.remove();

        const menu = document.createElement('div');
        menu.id = 'spellContextMenu';
        menu.className = 'spell-context-menu';

        const original = spellError.dataset.original || spellError.textContent;

        const suggItems = [];
        (suggestions || []).forEach(sugg => {
            const item = document.createElement('button');
            item.className = 'spell-menu-item';
            item.textContent = sugg;
            item.onclick = () => applySuggestion(spellError, sugg);
            menu.appendChild(item);
            suggItems.push(item);
        });

        // Add to dictionary option
        const addItem = document.createElement('button');
        addItem.className = 'spell-menu-item spell-menu-divider';
        addItem.textContent = SummieI18n.t('Aan woordenboek toevoegen');
        addItem.onclick = () => addToDictionary(original);
        menu.appendChild(addItem);

        // Ignore option
        const ignoreItem = document.createElement('button');
        ignoreItem.className = 'spell-menu-item';
        ignoreItem.textContent = SummieI18n.t('Negeren');
        ignoreItem.onclick = () => ignoreError(spellError);
        menu.appendChild(ignoreItem);

        // Position at the right-click, clamped to the viewport
        menu.style.left = Math.max(8, Math.min(pos.x, window.innerWidth - 230)) + 'px';
        menu.style.top = Math.max(8, Math.min(pos.y, window.innerHeight - 200)) + 'px';

        document.body.appendChild(menu);

        // Neural re-rank (English blocks only, and only when the model is
        // already present — a right-click never triggers a download).
        try {
            const blockLang = spellError.dataset.lang ||
                (window.SummieI18n && window.SummieI18n.lang) || 'nl';
            if (suggItems.length > 1 && blockLang === 'en' && window.NeuralCheck) {
                const block = spellError.closest('p,li,h1,h2,h3,h4,div,td,th') || spellError.parentElement;
                const ctx = block && block.textContent ? block.textContent : '';
                const sugWords = suggItems.map(b => b.textContent);
                const anchor = menu.querySelector('.spell-menu-divider') || null;
                window.NeuralCheck.rerankMenu(sugWords, ctx, (original || '').toLowerCase())
                    .then(ordered => {
                        if (!ordered || !menu.isConnected) return;
                        const pos = {};
                        ordered.forEach((w, i) => { if (!(w in pos)) pos[w] = i; });
                        [...suggItems]
                            .sort((a, b) => (pos[a.textContent] ?? 999) - (pos[b.textContent] ?? 999))
                            .forEach(b => menu.insertBefore(b, anchor));
                    })
                    .catch(() => { /* keep frequency order */ });
            }
        } catch { /* keep frequency order */ }

        // Close on click outside
        const closeHandler = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeHandler);
            }
        };
        setTimeout(() => document.addEventListener('click', closeHandler), 0);
    }

    function applySuggestion(spellError, suggestion) {
        const textNode = spellError.firstChild;
        if (textNode) textNode.textContent = suggestion;
        spellError.classList.remove('spell-error');
        spellError.removeAttribute('data-original');
        spellError.outerHTML = suggestion; // Unwrap
        document.getElementById('spellContextMenu')?.remove();

        if (window.updateUnsavedIndicator) window.updateUnsavedIndicator();
        if (window.UndoManager) window.UndoManager.notifyExternalChange();
    }

    function addToDictionary(word) {
        const lower = String(word || '').toLowerCase();
        if (!lower) return;
        knownWords.add(lower);
        // Shared file (all windows + hunspell instances) …
        if (window.electron && window.electron.spellPersonalAdd) {
            window.electron.spellPersonalAdd(lower).catch(() => {});
        }
        // … plus the legacy per-window list as fallback
        try {
            const stored = JSON.parse(localStorage.getItem('summie_spell_dictionary') || '[]');
            if (!stored.includes(lower)) {
                stored.push(lower);
                localStorage.setItem('summie_spell_dictionary', JSON.stringify(stored));
            }
        } catch {}
        document.getElementById('spellContextMenu')?.remove();
        recheckDocument();
    }

    function ignoreError(spellError) {
        const lower = (spellError.dataset.original || spellError.textContent || '').toLowerCase();
        if (lower) ignoredWords.add(lower); // session ignore — survives rechecks
        spellError.classList.remove('spell-error');
        spellError.outerHTML = spellError.textContent;
        document.getElementById('spellContextMenu')?.remove();
    }

    // Curated typo overrides (checked before the frequency list).
    // Every key MUST be a non-word with unambiguous intent — these always
    // auto-correct (confidence 95), even beating dictionary hits. Never add
    // valid words here ('its'→"it's" or 'your'→"you're" would corrupt text).
    const NL_TYPOS = {
        'teh': 'het', 'adn': 'and', 'evn': 'even',
        'mischien': 'misschien', 'mishien': 'misschien', 'misshien': 'misschien', 'michien': 'misschien',
        'zowiezo': 'sowieso', 'sowiso': 'sowieso', 'zoieso': 'sowieso',
        'eigelijk': 'eigenlijk', 'eigelik': 'eigenlijk',
        'entousiast': 'enthousiast',
        'appart': 'apart', 'interresant': 'interessant', 'interesant': 'interessant',
        'definietie': 'definitie', 'defenitie': 'definitie',
        'akoord': 'akkoord',
        'onmiddelijk': 'onmiddellijk', 'onmidellijk': 'onmiddellijk',
        'colllega': 'collega',
        'pannekoek': 'pannenkoek', 'instrukteur': 'instructeur',
        'konstruktie': 'constructie', 'kontakt': 'contact',
        'perse': 'per se', 'teminste': 'tenminste', 'tenmiste': 'tenminste',
        'alsjeblift': 'alsjeblieft',
        'dankjewel': 'dank je wel', 'graaggedaan': 'graag gedaan',
        'waaroor': 'waardoor',
        'moetje': 'moet je',
        'kanje': 'kan je', 'wilje': 'wil je', 'zalje': 'zal je', 'heeftje': 'heeft je',
        'hadje': 'had je', 'isje': 'is je', 'benje': 'ben je', 'wasje': 'was je',
        'wordtje': 'wordt je', 'werdje': 'werd je', 'kannie': 'kan nie', 'moetnie': 'moet nie',
        'wilnie': 'wil nie', 'zalnie': 'zal nie', 'heeftnie': 'heeft nie',
    };

    const EN_TYPOS = {
        'teh': 'the', 'hte': 'the', 'adn': 'and', 'nad': 'and',
        'taht': 'that', 'thta': 'that', 'theese': 'these', 'thsoe': 'those',
        'recieve': 'receive', 'seperate': 'separate',
        'definately': 'definitely', 'definatly': 'definitely',
        'occured': 'occurred', 'occurence': 'occurrence', 'ocurr': 'occur',
        'begining': 'beginning', 'neccessary': 'necessary', 'necesary': 'necessary',
        'accomodate': 'accommodate', 'acommodate': 'accommodate',
        'wich': 'which', 'whcih': 'which', 'hwich': 'which', 'thier': 'their',
        'alot': 'a lot', 'aswell': 'as well', 'incase': 'in case', 'infact': 'in fact',
        'cant': "can't", 'dont': "don't", 'doesnt': "doesn't", 'didnt': "didn't",
        'wont': "won't", 'isnt': "isn't", 'arent': "aren't",
        'wasnt': "wasn't", 'werent': "weren't", 'havent': "haven't",
        'hasnt': "hasn't", 'hadnt': "hadn't",
        'couldnt': "couldn't", 'shouldnt': "shouldn't", 'wouldnt': "wouldn't",
        'im': "I'm", 'ive': "I've",
        'youre': "you're", 'youve': "you've", 'youll': "you'll", 'theyre': "they're",
        'belive': 'believe', 'beleive': 'believe',
        'freind': 'friend', 'freinds': 'friends',
        'perhasp': 'perhaps', 'pherhaps': 'perhaps',
        'tomorow': 'tomorrow', 'tommorow': 'tomorrow', 'yesterady': 'yesterday',
        'buisness': 'business', 'busines': 'business',
        'calender': 'calendar', 'cemetary': 'cemetery', 'changable': 'changeable',
        'collegue': 'colleague', 'comming': 'coming', 'commited': 'committed',
        'congradulations': 'congratulations', 'concious': 'conscious',
        'curtesy': 'courtesy', 'dissapear': 'disappear', 'dissapoint': 'disappoint',
        'embarass': 'embarrass', 'existance': 'existence', 'experiance': 'experience',
        'finaly': 'finally', 'fourty': 'forty', 'goverment': 'government',
        'grammer': 'grammar', 'happyness': 'happiness', 'hypocricy': 'hypocrisy',
        'immediatly': 'immediately', 'independant': 'independent',
        'knowlege': 'knowledge', 'liason': 'liaison', 'libary': 'library',
        'maintanance': 'maintenance', 'managment': 'management',
        'millenium': 'millennium', 'miniscule': 'minuscule', 'mispell': 'misspell',
        'noticable': 'noticeable', 'ocassion': 'occasion',
        'pavillion': 'pavilion', 'peice': 'piece', 'percieve': 'perceive',
        'permanant': 'permanent', 'perseverence': 'perseverance',
        'personell': 'personnel', 'possesion': 'possession', 'prefered': 'preferred',
        'publically': 'publicly', 'realy': 'really', 'refering': 'referring',
        'rember': 'remember', 'rythm': 'rhythm', 'saftey': 'safety',
        'seige': 'siege', 'sieze': 'seize', 'similiar': 'similar',
        'speach': 'speech', 'stoped': 'stopped', 'sucess': 'success',
        'suprise': 'surprise', 'throguh': 'through', 'truely': 'truly',
        'unforseen': 'unforeseen', 'unnecesary': 'unnecessary', 'untill': 'until',
        'vaccum': 'vacuum', 'villian': 'villain', 'wierd': 'weird',
        'writting': 'writing', 'yeild': 'yield',
    };

    // Load personal dictionary: shared file first (all windows), then the
    // legacy per-window localStorage list.
    async function loadPersonalDictionary() {
        const addAll = (arr) => {
            try {
                (arr || []).forEach(w => {
                    if (typeof w === 'string' && w.trim()) knownWords.add(w.toLowerCase());
                });
            } catch { /* ignore */ }
        };
        try { addAll(JSON.parse(localStorage.getItem('summie_spell_dictionary') || '[]')); } catch {}
        if (window.electron && window.electron.spellPersonalGet) {
            try { addAll(await window.electron.spellPersonalGet()); } catch {}
        }
    }

    // Public API
    window.SpellChecker = {
        init,
        checkDocument,
        recheckDocument,
        setEnabled: (val) => { enabled = val; if (!val) clearAllHighlights(); else checkDocument(); },
        setAutoCorrect: (val) => { autoCorrectEnabled = val; },
        setThreshold: (val) => { autoCorrectThreshold = val; },
        addToDictionary,
        getStats: () => ({
            enabled,
            autoCorrectEnabled,
            autoCorrectThreshold,
            modelLoaded,
            docLang: window.__docLang || null,
            hunspellOk,
            cacheSize: correctionCache.size,
            knownWords: knownWords.size,
        }),
    };

    // Auto-init
    loadPersonalDictionary();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();