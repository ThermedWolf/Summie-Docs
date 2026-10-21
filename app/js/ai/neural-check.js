// ==================== NEURAL CONTEXT CHECK ====================
// BERT-mini masked-LM over English sentences. Catches what no dictionary
// can: valid-word confusions (their/there, than/then…) and re-ranks spell
// menus with sentence context.
//
// Cost profile is deliberately careful: model downloads only after explicit
// consent, detection runs on demand (AI → Controleren) capped per pass,
// menu rerank runs only on right-click when the model is already present.
// Findings reuse the blue grammar-error spans + hover tooltip UI.

(function () {
    'use strict';

    // Candidate confusions. Members that don't map to a single WordPiece
    // token are dropped at runtime (verified after vocab load).
    const CONFUSION_SETS = [
        ['their', 'there'], ['than', 'then'], ['to', 'too', 'two'],
        ['affect', 'effect'], ['accept', 'except'],
        ['principal', 'principle'], ['weather', 'whether'],
        ['lose', 'loose'], ['choose', 'chose'], ['quiet', 'quite'],
        ['desert', 'dessert'], ['forth', 'fourth'], ['passed', 'past'],
        ['cite', 'sight', 'site'], ['complement', 'compliment'],
        ['council', 'counsel'], ['breath', 'breathe'], ['dairy', 'diary'],
        ['fare', 'fair'], ['hole', 'whole'], ['lead', 'led'],
        ['peace', 'piece'], ['peak', 'peek'], ['plain', 'plane'],
        ['presence', 'presents'], ['stationary', 'stationery'],
        ['straight', 'strait'], ['waist', 'waste'], ['weak', 'week'],
        ['which', 'witch'],
    ];

    const P_ALT_MIN = 0.30;  // alternative must be this probable…
    const RATIO_MIN = 2;     // …and this many times more likely than written
    // (tuned against the bundled bert-mini: "___ going" → there .69/.31)
    const MAX_INFER_PER_PASS = 40;
    const MAX_SEQ_TOKENS = 48;

    let confusionMap = null; // lower -> set array (single-token members only)
    let _settingsCache = null;
    let _settingsCacheAt = 0;

    // Cached settings read (30s) so right-click reranks don't spam IPC.
    async function neuralEnabled() {
        const now = Date.now();
        if (_settingsCache !== null && now - _settingsCacheAt < 30000) return _settingsCache;
        let on = true;
        try {
            if (window.electron && window.electron.settingsGet) {
                const s = await window.electron.settingsGet();
                on = s.aiEnabled !== false && s.aiNeuralEnabled !== false;
            }
        } catch { /* defaults apply */ }
        _settingsCache = on;
        _settingsCacheAt = now;
        return on;
    }

    function buildConfusionMap() {
        confusionMap = new Map();
        for (const set of CONFUSION_SETS) {
            const members = set.filter(w => window.BertTokenizer.singleTokenId(w) >= 0);
            if (members.length < 2) continue;
            for (const m of members) confusionMap.set(m, members);
        }
    }

    // Tokenize mirroring BertTokenizer.basicTokenize exactly (lowercase,
    // accent-strip, ASCII-punct separation) while tracking source offsets.
    // Lengths are stable for Latin text; sentences with other scripts are
    // skipped by the caller.
    function tokenizeWithOffsets(sentence) {
        let norm;
        try {
            norm = sentence.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        } catch {
            norm = sentence.toLowerCase();
        }
        if (norm.length !== sentence.length) return null; // abnormal — bail
        const toks = [];
        const re = /[^\s!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]+|[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/g;
        let m;
        while ((m = re.exec(norm)) !== null) {
            toks.push({ text: m[0], start: m.index, end: m.index + m[0].length });
        }
        return toks;
    }

    function hasNonLatin1(text) {
        return /[^\x00-\xFF]/.test(text);
    }

    function splitSentences(text) {
        const out = [];
        const re = /[^.!?…]+[.!?…]+/g;
        let m, last = 0;
        while ((m = re.exec(text)) !== null) {
            out.push({ text: m[0], start: m.index });
            last = m.index + m[0].length;
        }
        const tail = text.slice(last).trim();
        if (tail.length >= 8) out.push({ text: text.slice(last), start: last });
        return out.filter(s => s.text.trim().length >= 8);
    }

    function shouldSkipNode(textNode) {
        let parent = textNode.parentElement;
        const editor = document.getElementById('editor');
        while (parent && parent !== editor) {
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

    function matchCase(original, suggestion) {
        if (/[A-Z]/.test(original) && original === original.toUpperCase()) return suggestion.toUpperCase();
        if (original[0] === original[0].toUpperCase()) return suggestion[0].toUpperCase() + suggestion.slice(1);
        return suggestion;
    }

    // Score one masked position. Returns {best, origProb} or null.
    async function scorePosition(basicTexts, targetIdx, members, writtenLower) {
        const windowed = basicTexts.slice(Math.max(0, targetIdx - 20), targetIdx + 21);
        // Trailing sentence punctuation destabilises the tiny model — drop it.
        while (windowed.length > 1 && /^[.!?…]+$/.test(windowed[windowed.length - 1])) windowed.pop();
        const relIdx = targetIdx - Math.max(0, targetIdx - 20);
        const enc = window.BertMLM.encodeMasked(windowed, relIdx);
        if (!enc) return null;
        const scored = await window.BertMLM.scoreCandidates(enc.ids, enc.mask, enc.maskIdx, members);
        if (!scored.length) return null;
        const orig = scored.find(s => s.word === writtenLower);
        const best = scored[0];
        return { best, origProb: orig ? orig.prob : 0 };
    }

    // Full on-demand pass over the document. Returns {checked, flagged}.
    async function runDocumentPass() {
        if (!(await neuralEnabled())) return { checked: 0, flagged: 0, disabled: true };
        const editor = document.getElementById('editor');
        if (!editor) return { checked: 0, flagged: 0 };
        const ensured = await window.BertMLM.ensureLoaded();
        if (!ensured.ready) return { checked: 0, flagged: 0, needsDownload: true };
        if (!confusionMap) buildConfusionMap();

        const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null, false);
        const nodes = [];
        let node;
        while (node = walker.nextNode()) {
            if (shouldSkipNode(node)) continue;
            if (!node.textContent || !node.textContent.trim()) continue;
            nodes.push(node);
        }

        let checked = 0, flagged = 0, budget = MAX_INFER_PER_PASS;
        const findings = []; // {node, start, end, suggestion, explanation}
        for (const n of nodes) {
            if (budget <= 0 || !n.isConnected) continue;
            // English confusion sets: skip non-English blocks even when the
            // UI language is English (mixed-language documents).
            if (window.LangDetect && window.LangDetect.detect(n.textContent) === 'nl') continue;
            const text = n.textContent;
            if (hasNonLatin1(text)) continue;
            for (const sent of splitSentences(text)) {
                if (budget <= 0) break;
                if (/:\/\/|@/.test(sent.text)) continue;
                const toks = tokenizeWithOffsets(sent.text);
                if (!toks) continue;
                const basics = toks.map(t => t.text);
                for (let i = 0; i < toks.length && budget > 0; i++) {
                    const lower = toks[i].text; // already lowercased by the tokenizer
                    const members = confusionMap.get(lower);
                    if (!members) continue;
                    // original surface form (for case + span)
                    const origSurface = sent.text.slice(toks[i].start, toks[i].end);
                    if (/[A-Z]/.test(origSurface) && origSurface !== origSurface.toUpperCase()) {
                        // Mid-sentence capital — likely a name; skip (e.g. "Then" as name).
                        // Sentence-initial capitals are fine (mechanical).
                        const before = sent.text.slice(0, toks[i].start).trim();
                        if (before.length > 0 && !/[.!?…]\s*$/.test(before)) continue;
                    }
                    if (/\d/.test(lower)) continue;
                    budget--;
                    checked++;
                    try {
                        const r = await scorePosition(basics, i, members, lower);
                        if (!r) continue;
                        if (r.best.word !== lower && r.best.prob >= P_ALT_MIN && r.best.prob >= RATIO_MIN * r.origProb) {
                            findings.push({
                                node: n,
                                start: sent.start + toks[i].start,
                                end: sent.start + toks[i].end,
                                suggestion: matchCase(origSurface, r.best.word),
                                explanation: SummieI18n.t('Misschien bedoel je "{w}"?').replace('{w}', matchCase(origSurface, r.best.word)),
                            });
                            flagged++;
                        }
                    } catch { /* one bad inference must not stop the pass */ }
                }
            }
        }

        // Apply right-to-left per node (splitText keeps prefixes stable).
        const byNode = new Map();
        for (const f of findings) {
            if (!byNode.has(f.node)) byNode.set(f.node, []);
            byNode.get(f.node).push(f);
        }
        for (const [nd, list] of byNode) {
            if (!nd.isConnected) continue;
            list.sort((a, b) => b.start - a.start);
            for (const f of list) {
                if (f.end > nd.textContent.length) continue;
                const parent = nd.parentNode;
                if (!parent) break;
                const after = nd.splitText(f.start);
                after.splitText(f.end - f.start);
                const span = document.createElement('span');
                span.className = 'grammar-error';
                span.dataset.original = after.textContent;
                span.dataset.corrected = f.suggestion;
                span.dataset.explanation = f.explanation;
                span.textContent = after.textContent;
                parent.replaceChild(span, after);
                span.addEventListener('mouseenter', showTooltip);
                span.addEventListener('mouseleave', hideTooltip);
            }
        }

        if (flagged > 0) {
            if (window.updateUnsavedIndicator) window.updateUnsavedIndicator();
            if (window.UndoManager) window.UndoManager.notifyExternalChange();
        }
        return { checked, flagged };
    }

    function showTooltip(e) {
        const span = e.target;
        const tooltip = document.createElement('div');
        tooltip.className = 'grammar-tooltip';
        const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
        tooltip.innerHTML =
            '<div class="grammar-tooltip-header">' + esc(SummieI18n.t('Grammatica')) + '</div>' +
            '<div class="grammar-tooltip-explanation">' + esc(span.dataset.explanation || '') + '</div>' +
            '<div class="grammar-tooltip-suggestion">' + esc(SummieI18n.t('Voorstel:')) + ' <strong>' + esc(span.dataset.corrected || '') + '</strong></div>' +
            '<button class="grammar-tooltip-accept">' + esc(SummieI18n.t('Accepteren')) + '</button>' +
            '<button class="grammar-tooltip-ignore">' + esc(SummieI18n.t('Negeren')) + '</button>';
        tooltip.querySelector('.grammar-tooltip-accept').onclick = () => {
            span.outerHTML = esc(span.dataset.corrected || span.textContent);
            tooltip.remove();
            if (window.updateUnsavedIndicator) window.updateUnsavedIndicator();
            if (window.UndoManager) window.UndoManager.notifyExternalChange();
        };
        tooltip.querySelector('.grammar-tooltip-ignore').onclick = () => {
            span.outerHTML = esc(span.textContent);
            tooltip.remove();
        };
        document.body.appendChild(tooltip);
        const rect = span.getBoundingClientRect();
        tooltip.style.left = Math.max(8, rect.left) + 'px';
        tooltip.style.top = (rect.bottom + 5) + 'px';
        span._neuralTooltip = tooltip;
    }

    function hideTooltip(e) {
        const span = e.target;
        if (span._neuralTooltip) {
            span._neuralTooltip.remove();
            span._neuralTooltip = null;
        }
    }

    // Re-rank spell-menu suggestions with sentence context. Only runs when
    // the model is already present (never triggers a download prompt).
    // contextText: surrounding sentence; targetLower: the flagged word.
    // Returns ordered word list (falls back to input order).
    async function rerankMenu(suggestionWords, contextText, targetLower) {
        try {
            if (!suggestionWords || suggestionWords.length < 2) return suggestionWords;
            if (!(await neuralEnabled())) return suggestionWords;
            if (!window.BertMLM.ready()) return suggestionWords;
            if (!contextText || hasNonLatin1(contextText)) return suggestionWords;
            const toks = tokenizeWithOffsets(contextText);
            if (!toks) return suggestionWords;
            const idx = toks.findIndex(t => t.text === targetLower);
            if (idx < 0) return suggestionWords;
            const enc = window.BertMLM.encodeMasked(toks.map(t => t.text), idx);
            if (!enc) return suggestionWords;
            const scored = await window.BertMLM.scoreCandidates(enc.ids, enc.mask, enc.maskIdx, suggestionWords);
            if (!scored.length) return suggestionWords;
            const order = new Map(scored.map((s, i) => [s.word.toLowerCase(), i]));
            return [...suggestionWords].sort((a, b) =>
                (order.has(a.toLowerCase()) ? order.get(a.toLowerCase()) : 999) -
                (order.has(b.toLowerCase()) ? order.get(b.toLowerCase()) : 999));
        } catch {
            return suggestionWords;
        }
    }

    window.NeuralCheck = {
        runDocumentPass,
        rerankMenu,
        ready: () => !!(window.BertMLM && window.BertMLM.ready()),
    };
})();