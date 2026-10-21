// ==================== GRAMMAR CHECKER ====================
// Sentence-level grammar checking with explanations and fixes.

(function () {
    'use strict';

    const DEBOUNCE_MS = 800;

    let enabled = true;
    let currentLanguage = 'nl';
    let debounceTimer = null;
    let isProcessing = false;
    let modelLoaded = false; // reserved for future ML grammar models

    // Initialize grammar checker
    async function init() {
        await loadSettings();

        // Preload model
        if (window.AIEngine) {
            try {
                await window.AIEngine.preloadForLanguage(currentLanguage);
                modelLoaded = true;
                console.log('[Grammar Checker] Model loaded for', currentLanguage);
            } catch (err) {
                console.info('[Grammar Checker] ML model pending, idle until models arrive.');
                modelLoaded = false;
            }
        }

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
                if (patch.aiGrammarEnabled !== undefined) enabled = patch.aiGrammarEnabled;
                if (!enabled) clearAllHighlights();
            });
        }

        console.log('[Grammar Checker] Initialized');
    }

    async function loadSettings() {
        if (window.electron && window.electron.settingsGet) {
            try {
                const settings = await window.electron.settingsGet();
                enabled = settings.aiEnabled && settings.aiGrammarEnabled;
            } catch (err) {
                console.warn('[Grammar Checker] Failed to load settings:', err);
            }
        }
    }

    function hookEditor() {
        const editor = document.getElementById('editor');
        if (!editor) {
            setTimeout(hookEditor, 100);
            return;
        }

        const observer = new MutationObserver(debouncedCheck);
        observer.observe(editor, {
            childList: true,
            subtree: true,
            characterData: true,
        });

        // Initial check
        setTimeout(() => checkDocument(), 1500);
    }

    function debouncedCheck() {
        if (!enabled) return;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => checkDocument(), DEBOUNCE_MS);
    }

    async function checkDocument() {
        if (!enabled || isProcessing) return;

        const editor = document.getElementById('editor');
        if (!editor) return;

        isProcessing = true;

        try {
            const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null, false);
            const textNodes = [];
            let node;
            while (node = walker.nextNode()) {
                if (shouldSkipNode(node)) continue;
                if (!node.textContent || !node.textContent.trim()) continue;
                textNodes.push(node);
            }

            for (let i = 0; i < textNodes.length; i++) {
                const n = textNodes[i];
                if (!n.isConnected) continue;
                const blockLang = (window.LangDetect && window.LangDetect.detect(n.textContent)) || currentLanguage;
                applyGrammarToNode(n, blockLang);
                if (i % 20 === 19) await new Promise(r => setTimeout(r, 0));
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

    // ==================== RULE ENGINE ====================
    // Lightweight, deterministic checks that work without ML models:
    // repeated words, missing/extra spaces around punctuation, double spaces.
    // Grammar findings are suggestion-only (hover tooltip) — never auto-applied.

    function nearUrlOrEmail(text, idx) {
        const ctx = text.slice(Math.max(0, idx - 20), idx + 20);
        return ctx.indexOf('://') !== -1 || ctx.indexOf('@') !== -1 || ctx.indexOf('www.') !== -1;
    }

    function findGrammarIssues(text, lang) {
        const issues = [];
        const push = (start, end, kind, explanation, corrected) => {
            if (end > start) issues.push({ start, end, kind, explanation, corrected });
        };
        let m;

        // 1. Repeated word ("de de", "the the")
        const repeatRe = /\b([A-Za-zÀ-ÖØ-öø-ÿ]{2,})\s+\1\b/gi;
        while ((m = repeatRe.exec(text)) !== null) {
            push(m.index, m.index + m[0].length, 'repeat',
                SummieI18n.t('Dubbel woord — tweede exemplaar verwijderen?'), m[1]);
        }

        // 2. Missing space after punctuation ("woord,ander")
        const nospaceRe = /([,;:!?])(?=[A-Za-zÀ-ÖØ-öø-ÿ])/g;
        while ((m = nospaceRe.exec(text)) !== null) {
            const i = m.index;
            const prev = text[i - 1] || '';
            const next = text[i + 2] || '';
            if (/\d/.test(prev)) continue; // decimals (3,5), times (12:30)
            if (prev === '.' || prev === '@' || prev === '/') continue; // ellipsis, e-mail, URL
            if (m[1] === '.' && /[A-ZÀ-Þ]/.test(next)) continue; // initials (U.S.A)
            if (nearUrlOrEmail(text, i)) continue;
            push(i, i + 2, 'nospace',
                SummieI18n.t('Ontbrekende spatie na leesteken.'),
                m[1] + ' ' + text[i + 1]);
        }

        // 3. Space before punctuation ("woord , ander")
        const prespaceRe = / ([,;:!?.])(?!\.)/g;
        while ((m = prespaceRe.exec(text)) !== null) {
            const i = m.index;
            if ((text[i - 1] || '') === '.') continue; // ellipsis fragments
            if (nearUrlOrEmail(text, i)) continue;
            push(i, i + 2, 'prespace',
                SummieI18n.t('Spatie voor leesteken verwijderen?'), m[1]);
        }

        // 4. Double spaces
        const dblRe = /[ \t]{2,}/g;
        while ((m = dblRe.exec(text)) !== null) {
            push(m.index, m.index + m[0].length, 'dblspace',
                SummieI18n.t('Dubbele spatie.'),
                m[0][0] === '\t' ? '\t' : ' ');
        }

        // 5. Dutch d/t verb endings (high-precision classics)
        if ((lang || currentLanguage) === 'nl') {
            // "ik wordt" → "ik word" (first person takes no -t)
            const ikRe = /\bik\s+wordt\b/gi;
            while ((m = ikRe.exec(text)) !== null) {
                push(m.index + 3, m.index + m[0].length, 'dt-ik',
                    SummieI18n.t('Na "ik" hoort "word" (zonder -t).'),
                    m[0].slice(0, 3) + 'word');
            }
            // "hij word" → "hij wordt" (third person takes -t)
            const hijRe = /\b(hij|jij|je|zij|het|men|wie|die|dat|er)\s+word\b/gi;
            while ((m = hijRe.exec(text)) !== null) {
                const pron = m[1];
                push(m.index + pron.length, m.index + m[0].length, 'dt-hij',
                    SummieI18n.t('"wordt" met -t bij hij/zij/het.'),
                    m[0].slice(0, pron.length + 1) + 'wordt');
            }
            // "we word" → "we worden" (plural)
            const weRe = /\b(we|jullie)\s+word\b/gi;
            while ((m = weRe.exec(text)) !== null) {
                const pron = m[1];
                push(m.index + pron.length, m.index + m[0].length, 'dt-we',
                    SummieI18n.t('Meervoud: "worden".'),
                    m[0].slice(0, pron.length + 1) + 'worden');
            }
            // "is gebeurt" → "is gebeurd" (voltooid deelwoord after auxiliary)
            const auxRe = /\b(is|was|waren|zijn|ben|bent|heeft|hebben|had|hadden)\s+gebeurt\b/gi;
            while ((m = auxRe.exec(text)) !== null) {
                const aux = m[1];
                push(m.index + aux.length, m.index + m[0].length, 'dt-aux',
                    SummieI18n.t('Voltooid deelwoord: "gebeurd".'),
                    m[0].slice(0, aux.length + 1) + 'gebeurd');
            }
        }

        // Sort by position; drop overlaps (keep the first)
        issues.sort((a, b) => a.start - b.start);
        const kept = [];
        for (const issue of issues) {
            if (kept.length && issue.start < kept[kept.length - 1].end) continue;
            kept.push(issue);
        }
        return kept;
    }

    // Wrap [start,end) via splitText (prefix node stays stable); right-to-left.
    function applyGrammarToNode(node, lang) {
        const issues = findGrammarIssues(node.textContent, lang || currentLanguage);
        if (!issues.length) return;
        let prefixNode = node;
        for (let i = issues.length - 1; i >= 0; i--) {
            const issue = issues[i];
            if (!prefixNode.isConnected) return;
            if (issue.end > prefixNode.textContent.length) continue;
            const parent = prefixNode.parentNode;
            if (!parent) return;
            const afterNode = prefixNode.splitText(issue.start);
            afterNode.splitText(issue.end - issue.start);
            const span = document.createElement('span');
            span.className = 'grammar-error';
            span.dataset.original = afterNode.textContent;
            span.dataset.corrected = issue.corrected;
            span.dataset.explanation = issue.explanation;
            span.textContent = afterNode.textContent;
            parent.replaceChild(span, afterNode);
            span.addEventListener('mouseenter', showGrammarTooltip);
            span.addEventListener('mouseleave', hideGrammarTooltip);
        }
    }

    function showGrammarTooltip(e) {
        const span = e.target;
        const explanation = span.dataset.explanation;
        const corrected = span.dataset.corrected;

        const tooltip = document.createElement('div');
        tooltip.className = 'grammar-tooltip';
        tooltip.innerHTML = `
            <div class="grammar-tooltip-header">${SummieI18n.t('Grammatica')}</div>
            <div class="grammar-tooltip-explanation">${explanation}</div>
            <div class="grammar-tooltip-suggestion">${SummieI18n.t('Voorstel:')} <strong>${corrected}</strong></div>
            <button class="grammar-tooltip-accept">${SummieI18n.t('Accepteren')}</button>
            <button class="grammar-tooltip-ignore">${SummieI18n.t('Negeren')}</button>
        `;

        tooltip.querySelector('.grammar-tooltip-accept').onclick = () => acceptGrammarFix(span, corrected);
        tooltip.querySelector('.grammar-tooltip-ignore').onclick = () => ignoreGrammarError(span);

        document.body.appendChild(tooltip);

        const rect = span.getBoundingClientRect();
        tooltip.style.left = `${rect.left}px`;
        tooltip.style.top = `${rect.bottom + 5}px`;

        span._grammarTooltip = tooltip;
    }

    function hideGrammarTooltip(e) {
        const span = e.target;
        if (span._grammarTooltip) {
            span._grammarTooltip.remove();
            span._grammarTooltip = null;
        }
    }

    function acceptGrammarFix(span, corrected) {
        const textNode = span.firstChild;
        if (textNode) textNode.textContent = corrected;
        span.classList.remove('grammar-error');
        span.outerHTML = corrected;
        span._grammarTooltip?.remove();

        if (window.updateUnsavedIndicator) window.updateUnsavedIndicator();
        if (window.UndoManager) window.UndoManager.notifyExternalChange();
    }

    function ignoreGrammarError(span) {
        span.classList.remove('grammar-error');
        span.outerHTML = span.textContent;
        span._grammarTooltip?.remove();
    }

    function clearAllHighlights() {
        const editor = document.getElementById('editor');
        if (!editor) return;
        editor.querySelectorAll('.grammar-error').forEach(span => {
            span.parentNode.replaceChild(document.createTextNode(span.textContent), span);
        });
        editor.normalize();
    }

    function recheckDocument() {
        clearAllHighlights();
        checkDocument();
    }

    // Public API
    window.GrammarChecker = {
        init,
        checkDocument,
        recheckDocument,
        setEnabled: (val) => { enabled = val; if (!val) clearAllHighlights(); else checkDocument(); },
        getStats: () => ({
            enabled,
            modelLoaded,
        }),
    };

    // Auto-init
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();