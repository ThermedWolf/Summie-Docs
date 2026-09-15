// ==================== READ ALOUD / VOORLEZEN ====================
// Web Speech API based TTS. Offline, OS voices, no network.
// Queue model: collectBlocks -> segment sentences -> [utterance|pause] queue.
// Highlight sync + floating mini-player driven from here.

(function () {
    'use strict';

    const STATE = { IDLE: 'idle', LOADING: 'loading', PLAYING: 'playing', PAUSED: 'paused', PAUSE_DELAY: 'pause_delay' };
    let state = STATE.IDLE;
    let queue = []; // [{type:'utterance', text, blockEl, paraIdx, sentIdx, lang}, {type:'pause', duration, label}]
    let utteranceIndex = 0;
    let currentUtterance = null;
    let pauseTimer = null;
    let pauseCountdownTimer = null;
    let voices = [];
    let voicesReady = false;
    let settingsCache = null; // {ttsRate, ttsGender, ttsPauses, language}

    // Highlight tracking
    let highlightedEls = [];

    // DOM refs (populated on init)
    let els = {};
    let isInstalling = false;

    function t(str) { return window.SummieI18n ? window.SummieI18n.t(str) : str; }

    function showTtsInstallOverlay(show) {
        let ov = document.getElementById('ttsInstallOverlay');
        if (show) {
            if (ov) return;
            ov = document.createElement('div');
            ov.id = 'ttsInstallOverlay';
            ov.className = 'tts-install-overlay';
            ov.innerHTML = '<div class="tts-install-box">'
                + '<h3 class="tts-install-title">' + t('Spraakondersteuning wordt geïnstalleerd...') + '</h3>'
                + '<p class="tts-install-desc">' + t('Voor voorlezen is speech-dispatcher en espeak-ng nodig. Dit wordt éénmalig geïnstalleerd.') + '</p>'
                + '<div class="tts-install-bar-track"><div class="tts-install-bar"></div></div>'
                + '</div>';
            document.body.appendChild(ov);
        } else {
            if (ov) ov.remove();
        }
    }

    // ── Settings helpers ───────────────────────────────
    async function loadSettings() {
        try {
            if (window.electron && window.electron.settingsGet) {
                const s = await window.electron.settingsGet();
                settingsCache = s;
                return s;
            }
        } catch {}
        // Fallback — try local cache
        return settingsCache || { language: 'nl', ttsRate: 1, ttsGender: 'female', ttsPauses: { codeBlock: 5, table: 10, image: 5, shape: 5, default: 5 } };
    }

    function getLangCode() {
        const lang = (settingsCache && settingsCache.language) || (window.SummieI18n && window.SummieI18n.lang) || 'nl';
        return lang === 'en' ? 'en-US' : 'nl-NL';
    }

    // ── Document language detection (Dutch vs English) ────────────────
    // Lightweight stop-word heuristic — no network, no heavy model.
    // Works well for Summie summaries (fairly formal prose). Falls back to
    // app language when confidence is low / mixed.
    const DUTCH_STOP = new Set(['de','het','een','en','van','dat','die','in','is','op','voor','met','door','zijn','was','niet','wat','ook','aan','bij','om','tot','er','als','dan','maar','omdat','wordt','heeft','hebben','worden','deze','dit','dat','welke','te','naar','uit','over','onder','tussen','nog','al','dus','want','daarom','geen','mijn','jouw','haar','onze','hun','u','uw','we','ze','zij','wij','jij','je','me','mijn','veel','meer','zo','hoe','waar','wanneer','waarom','wie','wel','geen','door','bij','onder','boven','tijdens','sinds','tegen','zonder','binnen','buiten','volgens','tussen','echter','daarnaast','verder','zodat','doordat','hoewel','terwijl','zodra','voordat','nadat','indien','zowel','hierdoor','hiermee','daarmee','waardoor','waarbij','waarin']);
    const ENGLISH_STOP = new Set(['the','be','to','of','and','a','in','that','have','i','it','for','not','on','with','he','as','you','do','at','this','but','his','by','from','they','we','say','her','she','or','an','will','my','one','all','would','there','their','what','so','up','out','if','about','who','get','which','go','me','when','make','can','like','time','no','just','him','know','take','person','into','year','your','good','some','could','them','see','other','than','then','now','look','only','come','its','over','think','also','back','after','use','two','how','our','work','first','well','way','even','new','want','because','any','these','give','day','most','us','is','are','was','were','has','had','been','will','would','should','could']);

    function detectLangForText(text) {
        if (!text || text.trim().length < 20) return null; // too short — let document fallback decide
        const words = text.toLowerCase().split(/[^a-z\u00e4\u00f6\u00fc\u00eb\u00ef\u00e9\u00e8\u00e0\u00e1\u00ed\u00f3\u00fa\u00e2\u00ea\u00ee\u00f4\u00fb\u00e7]+/).filter(Boolean);
        if (words.length < 4) return null;
        let nl = 0, en = 0;
        for (const w of words) {
            if (DUTCH_STOP.has(w)) nl++;
            if (ENGLISH_STOP.has(w)) en++;
        }
        // Bonus signals: very Dutch-specific substrings
        const lower = text.toLowerCase();
        if (lower.includes('ij') || lower.includes(' sch') || lower.includes('lijk ') || lower.includes('heid ') || lower.includes(' ge') && lower.includes('lijk')) {
            // tiny nudge — not decisive alone
        }
        // Character bigram hints
        const dutchHints = (lower.match(/ ij/g)||[]).length + (lower.match(/sch/g)||[]).length;
        const englishHints = (lower.match(/ th/g)||[]).length + (lower.match(/wh/g)||[]).length;
        nl += dutchHints * 0.3;
        en += englishHints * 0.3;

        if (nl === 0 && en === 0) return null;
        if (nl > en * 1.3) return 'nl-NL';
        if (en > nl * 1.3) return 'en-US';
        if (nl > en) return 'nl-NL';
        if (en > nl) return 'en-US';
        return null;
    }

    let docDetectedLang = null; // cached per play() — 'nl-NL' | 'en-US' | null
    function detectDocumentLang(blocks) {
        // Join first ~3000 chars for a representative sample
        let sample = '';
        for (const b of blocks) {
            if (b.text) sample += ' ' + b.text;
            if (sample.length > 3000) break;
        }
        const detected = detectLangForText(sample);
        if (detected) return detected;
        return null;
    }

    function resolveUtteranceLang(text) {
        // Per-sentence detection with document fallback then app setting
        const perSentence = detectLangForText(text);
        if (perSentence) return perSentence;
        if (docDetectedLang) return docDetectedLang;
        return getLangCode();
    }

    function getPauses() {
        const def = { codeBlock: 5, table: 10, image: 5, shape: 5, default: 5 };
        const p = settingsCache && settingsCache.ttsPauses;
        if (!p || typeof p !== 'object') return def;
        const out = {};
        for (const k of Object.keys(def)) out[k] = (typeof p[k] === 'number' && p[k] >= 0 && p[k] <= 30) ? p[k] : def[k];
        return out;
    }

    // ── Voices ────────────────────────────────────────
    function refreshVoices() {
        try {
            voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
            voicesReady = voices.length > 0;
            if (els.voiceSelect) populateVoiceSelect();
        } catch { voices = []; }
    }

    function isFemaleVoice(v) {
        const n = (v.name || '').toLowerCase();
        // Heuristics: Dutch female common: Lotte, Ellen, Claire, Fenna, etc.; English: Samantha, Victoria, Karen
        return /female|vrouw|femme|lotte|ellen|claire|fenna|emma|sophie|anna|samantha|victoria|karen|zira|susan/i.test(n);
    }
    function isMaleVoice(v) {
        const n = (v.name || '').toLowerCase();
        return /male|man|homme|thomas|bart|mark|paul|david|alex|daniel|george|james/i.test(n);
    }

    function pickVoice(langCode) {
        const lc = langCode || getLangCode();
        const langPrefix = lc.split('-')[0];
        const gender = (settingsCache && settingsCache.ttsGender) || 'female';
        if (gender === 'system') {
            return voices.find(v => v.lang && v.lang.toLowerCase().startsWith(langPrefix)) || voices[0] || null;
        }
        const langVoices = voices.filter(v => v.lang && v.lang.toLowerCase().startsWith(langPrefix));
        const pool = langVoices.length ? langVoices : voices;
        if (!pool.length) return null;
        if (gender === 'female') {
            return pool.find(isFemaleVoice) || pool.find(v => !isMaleVoice(v)) || pool[0];
        } else {
            return pool.find(isMaleVoice) || pool.find(v => !isFemaleVoice(v)) || pool[0];
        }
    }

    function populateVoiceSelect() {
        if (!els.voiceSelect) return;
        const langCode = getLangCode();
        const prefix = langCode.split('-')[0];
        // We expose only Male/Female pseudo-options, not raw voice list, per spec.
        // Keep select with 3 options; pick actual SpeechSynthesisVoice internally.
        els.voiceSelect.innerHTML = '';
        const opts = [
            { value: 'female', label: t('Vrouw') },
            { value: 'male', label: t('Man') },
            { value: 'system', label: t('Systeem') }
        ];
        opts.forEach(o => {
            const opt = document.createElement('option');
            opt.value = o.value;
            opt.textContent = o.label;
            els.voiceSelect.appendChild(opt);
        });
        const gender = (settingsCache && settingsCache.ttsGender) || 'female';
        els.voiceSelect.value = ['female','male','system'].includes(gender) ? gender : 'female';
        // Hint if no voices
        const hasLangVoice = voices.some(v => v.lang && v.lang.toLowerCase().startsWith(prefix));
        els.voiceSelect.title = hasLangVoice ? '' : t('Geen stemmen beschikbaar');
    }

    // ── Text extraction ───────────────────────────────
    function isSkippedElement(el) {
        if (!el || !el.classList) return null;
        if (el.classList.contains('code-block-wrapper')) return 'codeBlock';
        if (el.tagName === 'TABLE' || el.closest && el.closest('table')) return 'table';
        if (el.classList.contains('editable-image-wrapper') || el.querySelector && el.querySelector('img')) {
            // But inline images inside p should not skip whole p — check if block itself is image wrapper
            if (el.classList.contains('editable-image-wrapper')) return 'image';
        }
        if (el.classList.contains('summie-shape-wrapper')) return 'shape';
        // Textbox: treat as speakable but could be paused? spec says shape/textbox maybe skip — keep speakable
        return null;
    }

    function getPageRoots() {
        const pagesContainer = document.getElementById('pagesContainer');
        if (window.PageManager && typeof window.PageManager.isPaginationEnabled === 'function' && window.PageManager.isPaginationEnabled()) {
            const pages = document.querySelectorAll('.a4-page');
            if (pages.length) return Array.from(pages);
        }
        // Fallback: #editor is the root (single page)
        const editor = document.getElementById('editor');
        if (editor) return [editor];
        // As last fallback, pagesContainer itself
        if (pagesContainer) return [pagesContainer];
        return [];
    }

    function getSelectionRoot() {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
        const roots = getPageRoots();
        // Check selection is inside editor/pages
        const anchor = sel.anchorNode;
        const el = anchor && anchor.nodeType === 3 ? anchor.parentElement : anchor;
        const inside = roots.some(r => r.contains(el));
        if (!inside) return null;
        // Clone selection contents to a fragment for text extraction, but also keep range for queue building
        return sel;
    }

    function textFromNodeForTTS(node) {
        // Similar to text-count.js but per block
        if (!node) return '';
        if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
        if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return '';
        if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node;
            // Skip transient/UI chrome
            if (el.classList.contains('placeholder-text') || el.classList.contains('begrip-tooltip') ||
                el.classList.contains('ref-select-btn') || el.classList.contains('code-highlighted-overlay') ||
                el.classList.contains('page-number-badge') || el.classList.contains('tts-highlight')) return '';
            if (el.classList.contains('code-block-wrapper')) return ''; // skipped, handled as pause
            if (el.classList.contains('editable-image-wrapper')) return '';
            if (el.classList.contains('summie-shape-wrapper')) return '';
            if (el.tagName === 'BR') return '\n';
            if (el.tagName === 'HR') return '\n';
        }
        let txt = '';
        for (const child of Array.from(node.childNodes)) txt += textFromNodeForTTS(child);
        const isBlock = node.nodeType === Node.ELEMENT_NODE && /^(p|div|h[1-6]|li|blockquote|pre|ul|ol|table|tr|section|article|header|footer|figure|figcaption)$/i.test(node.tagName || '');
        return isBlock ? txt + '\n' : txt;
    }

    function normalizeTextForTTS(text) {
        return (text || '').replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n').replace(/[ \t\f\v]+/g, ' ').replace(/ *\n+ */g, '\n').trim();
    }

    function segmentSentences(text, lang) {
        const t = normalizeTextForTTS(text);
        if (!t) return [];
        // Try Intl.Segmenter
        try {
            if (typeof Intl !== 'undefined' && Intl.Segmenter) {
                const seg = new Intl.Segmenter(lang === 'en-US' ? 'en' : 'nl', { granularity: 'sentence' });
                const parts = Array.from(seg.segment(t), s => s.segment.trim()).filter(Boolean);
                if (parts.length) {
                    // Further split overly long sentences
                    const out = [];
                    for (const p of parts) {
                        if (p.length > 220) {
                            // split on comma/semicolon
                            const sub = p.split(/(?<=[,;])\s+/);
                            sub.forEach(s => { if (s.trim()) out.push(s.trim()); });
                        } else out.push(p);
                    }
                    return out;
                }
            }
        } catch {}
        // Fallback regex
        const sentences = t.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
        // Merge very short fragments (<15 chars) with next
        const merged = [];
        for (let i = 0; i < sentences.length; i++) {
            let s = sentences[i];
            if (s.length < 15 && i + 1 < sentences.length) { s = s + ' ' + sentences[i + 1]; i++; }
            if (s.length > 220) {
                const sub = s.split(/(?<=[,;])\s+/);
                sub.forEach(x => { if (x.trim()) merged.push(x.trim()); });
            } else merged.push(s);
        }
        return merged;
    }

    function collectBlocks(roots) {
        const blocks = []; // [{el, text, blockType, isSkipped, pauseDuration}]
        const pauses = getPauses();
        for (const root of roots) {
            // Iterate direct block children; for nested structures, treat each top-level block
            const children = Array.from(root.children || []);
            // If root itself is editor and has no block children but raw text, treat root as one block
            const toWalk = children.length ? children : [root];
            for (const child of toWalk) {
                if (!child || child.nodeType !== 1) continue;
                // Skip UI chrome
                if (child.classList.contains('editor-placeholder-overlay') || child.classList.contains('page-number-badge')) continue;
                const skippedType = isSkippedElement(child);
                if (skippedType) {
                    const dur = pauses[skippedType] != null ? pauses[skippedType] : pauses.default;
                    if (dur > 0) blocks.push({ el: child, text: '', isSkipped: true, pauseType: skippedType, pauseDuration: dur });
                    continue;
                }
                // For containers like UL/OL, iterate LI
                if (child.tagName === 'UL' || child.tagName === 'OL') {
                    for (const li of Array.from(child.children)) {
                        if (li.tagName !== 'LI') continue;
                        const txt = normalizeTextForTTS(textFromNodeForTTS(li));
                        if (txt) blocks.push({ el: li, text: txt, isSkipped: false });
                    }
                    continue;
                }
                if (child.tagName === 'TABLE') {
                    // Table is skipped with pause (handled above if isSkipped), but nested case
                    const dur = pauses.table != null ? pauses.table : pauses.default;
                    if (dur > 0) blocks.push({ el: child, text: '', isSkipped: true, pauseType: 'table', pauseDuration: dur });
                    continue;
                }
                // Generic block
                const txt = normalizeTextForTTS(textFromNodeForTTS(child));
                if (txt) blocks.push({ el: child, text: txt, isSkipped: false });
            }
        }
        return blocks;
    }

    function collectFromSelection(sel) {
        // Build a fragment of selection's cloneContents and extract blocks similarly
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < sel.rangeCount; i++) fragment.appendChild(sel.getRangeAt(i).cloneContents());
        const tmp = document.createElement('div');
        tmp.appendChild(fragment);
        // Reuse collectBlocks on tmp as root
        return collectBlocks([tmp]);
    }

    function buildQueue() {
        let blocks;
        const sel = getSelectionRoot();
        if (sel) {
            blocks = collectFromSelection(sel);
        } else {
            const roots = getPageRoots();
            blocks = collectBlocks(roots);
        }
        // Detect document language once for fallback
        docDetectedLang = detectDocumentLang(blocks);
        const q = [];
        let paraIdx = 0;
        for (const b of blocks) {
            if (b.isSkipped) {
                q.push({ type: 'pause', duration: b.pauseDuration, label: b.pauseType });
                continue;
            }
            // Use detected doc lang to choose segmenter locale
            const blockLangForSegment = resolveUtteranceLang(b.text);
            const sentences = segmentSentences(b.text, blockLangForSegment);
            sentences.forEach((sent, sIdx) => {
                const sentLang = resolveUtteranceLang(sent);
                q.push({ type: 'utterance', text: sent, blockEl: b.el, paraIdx, sentIdx: sIdx, lang: sentLang });
            });
            paraIdx++;
        }
        return q;
    }

    // ── Highlight ─────────────────────────────────────
    function clearHighlight() {
        highlightedEls.forEach(el => el.classList.remove('tts-highlight', 'tts-active-block'));
        highlightedEls = [];
        // Also unwrap any tts-highlight spans we created
        document.querySelectorAll('span.tts-highlight').forEach(span => {
            const parent = span.parentNode;
            if (!parent) return;
            while (span.firstChild) parent.insertBefore(span.firstChild, span);
            parent.removeChild(span);
        });
    }

    function highlightForIndex(idx) {
        clearHighlight();
        const item = queue[idx];
        if (!item || item.type !== 'utterance') return;
        const el = item.blockEl;
        if (!el || !document.contains(el)) return;
        // For paragraphs/lists, highlight the whole block lightly + try to highlight sentence if we can find it
        el.classList.add('tts-active-block');
        highlightedEls.push(el);
        // Auto-scroll into view (respect reduced motion)
        try {
            const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            el.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'center' });
        } catch {}
    }

    // ── Player UI ─────────────────────────────────────
    function updatePlayerUI() {
        if (!els.player) return;
        const isLoading = state === STATE.LOADING || isInstalling;
        const totalUtterances = queue.filter(q => q.type === 'utterance').length;
        const spokenUtterances = queue.slice(0, utteranceIndex).filter(q => q.type === 'utterance').length;
        const current = queue[utteranceIndex];
        const isPause = current && current.type === 'pause';
        // Progress
        const totalForProgress = totalUtterances || 1;
        let pct = 0;
        if (state === STATE.PLAYING || state === STATE.PAUSED || state === STATE.PAUSE_DELAY) {
            pct = Math.round((spokenUtterances / totalForProgress) * 100);
            if (current && current.type === 'utterance' && state === STATE.PLAYING) {
                pct = Math.min(100, pct);
            }
        } else if (isLoading) {
            pct = 0;
        }
        if (els.progressFill) {
            if (isLoading) {
                els.progressFill.style.width = '100%';
                els.progressFill.classList.add('indeterminate');
            } else {
                els.progressFill.classList.remove('indeterminate');
                els.progressFill.style.width = pct + '%';
            }
        }
        if (els.progressText) {
            if (isLoading) els.progressText.textContent = t('Laden...') || 'Laden...';
            else if (!queue.length) els.progressText.textContent = '';
            else if (isPause) els.progressText.textContent = t('Pauze') + ' ' + current.duration + 's';
            else els.progressText.textContent = (spokenUtterances + 1) + ' / ' + totalUtterances;
        }
        // Buttons
        if (els.playPauseBtn) {
            const isPlaying = state === STATE.PLAYING || state === STATE.PAUSE_DELAY;
            els.playPauseBtn.innerHTML = isPlaying ? pauseIcon() : playIcon();
            els.playPauseBtn.title = isPlaying ? t('Pauzeren') : t('Hervatten');
            els.playPauseBtn.disabled = isLoading;
        }
        if (els.prevBtn) els.prevBtn.disabled = isLoading || utteranceIndex <= 0;
        if (els.nextBtn) {
            let nextU = utteranceIndex + 1;
            while (nextU < queue.length && queue[nextU].type === 'pause') nextU++;
            els.nextBtn.disabled = isLoading || nextU >= queue.length;
        }
        if (els.prevParaBtn) els.prevParaBtn.disabled = isLoading;
        if (els.nextParaBtn) els.nextParaBtn.disabled = isLoading;
        // Player active state — also show when loading (even if queue empty, show with placeholder)
        if (els.player) {
            const show = isLoading || (state !== STATE.IDLE && queue.length > 0);
            els.player.classList.toggle('active', show);
            els.player.classList.toggle('is-paused', state === STATE.PAUSED);
            els.player.classList.toggle('is-loading', isLoading);
        }
        // Speed
        if (els.speedBtns) {
            const rate = (settingsCache && settingsCache.ttsRate) || 1;
            els.speedBtns.forEach(b => b.classList.toggle('active', Math.abs(parseFloat(b.dataset.rate) - rate) < 0.01));
        }
        // Voice
        if (els.voiceSelect) {
            const g = (settingsCache && settingsCache.ttsGender) || 'female';
            els.voiceSelect.value = g;
        }
    }

    function playIcon() {
        return '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v14l11-7z"/></svg>';
    }
    function pauseIcon() {
        return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
    }

    // ── Speech loop ───────────────────────────────────
    function speakCurrent() {
        if (utteranceIndex >= queue.length) { stop(); return; }
        const item = queue[utteranceIndex];
        if (!item) { stop(); return; }
        if (item.type === 'pause') {
            state = STATE.PAUSE_DELAY;
            updatePlayerUI();
            let remaining = item.duration;
            if (els.progressText) els.progressText.textContent = t('Pauze') + ' ' + remaining + 's';
            // Countdown
            if (pauseCountdownTimer) clearInterval(pauseCountdownTimer);
            pauseCountdownTimer = setInterval(() => {
                remaining -= 1;
                if (remaining <= 0) { clearInterval(pauseCountdownTimer); pauseCountdownTimer = null; }
                else if (els.progressText) els.progressText.textContent = t('Pauze') + ' ' + remaining + 's';
            }, 1000);
            pauseTimer = setTimeout(() => {
                pauseTimer = null;
                if (pauseCountdownTimer) { clearInterval(pauseCountdownTimer); pauseCountdownTimer = null; }
                if (state !== STATE.PAUSE_DELAY) return;
                state = STATE.PLAYING;
                utteranceIndex++;
                updatePlayerUI();
                speakCurrent();
            }, item.duration * 1000);
            return;
        }
        // Utterance
        state = STATE.PLAYING;
        highlightForIndex(utteranceIndex);
        updatePlayerUI();
        const u = new SpeechSynthesisUtterance(item.text);
        const utterLang = item.lang || getLangCode();
        const voice = pickVoice(utterLang);
        if (voice) u.voice = voice;
        u.lang = utterLang;
        u.rate = (settingsCache && settingsCache.ttsRate) || 1;
        u.pitch = 1;
        u.onend = () => {
            if (state !== STATE.PLAYING) return;
            utteranceIndex++;
            // Skip any immediate pauses via loop
            updatePlayerUI();
            speakCurrent();
        };
        u.onerror = (e) => {
            const err = (e && e.error) || '';
            console.warn('TTS utterance error', e);
            if (state !== STATE.PLAYING) return;
            // synthesis-failed means speech-dispatcher not ready / needs flag / restart
            if (err === 'synthesis-failed' || err === 'synthesis-unavailable') {
                const alreadyWarned = u._warnedSynthesisFailed;
                if (!alreadyWarned) {
                    u._warnedSynthesisFailed = true;
                    // Try one retry after short delay before giving up
                    setTimeout(() => {
                        if (state !== STATE.PLAYING) return;
                        // If still failing on retry, prompt restart
                        const retry = new SpeechSynthesisUtterance(item.text);
                        const rLang = item.lang || getLangCode();
                        const v = pickVoice(rLang); if (v) retry.voice = v;
                        retry.lang = rLang;
                        retry.rate = (settingsCache && settingsCache.ttsRate) || 1;
                        retry.onend = u.onend;
                        retry.onerror = async (e2) => {
                            const err2 = e2 && e2.error;
                            if (err2 === 'synthesis-failed' || err2 === 'synthesis-unavailable') {
                                stop();
                                const doReload = await window.SummieDialogs.choice(
                                    t('Geen stemmen beschikbaar') + '\n' + t('Installeer speech-dispatcher voor voorlezen op Linux.') + '\n\n' + t('Herstart Summie om de nieuwe stemmen te laden?'),
                                    {
                                        title: t('Geen stemmen beschikbaar'),
                                        buttons: [
                                            { label: t('Herstarten'), value: 'reload', primary: true },
                                            { label: t('Annuleren'), value: 'cancel' }
                                        ],
                                        escValue: 'cancel'
                                    }
                                );
                                if (doReload === 'reload') location.reload();
                                else if (window.showNotification) window.showNotification(t('Geen stemmen beschikbaar'), t('Installeer speech-dispatcher voor voorlezen op Linux.'), 'warning');
                            } else {
                                utteranceIndex++;
                                updatePlayerUI();
                                speakCurrent();
                            }
                        };
                        try { window.speechSynthesis.speak(retry); currentUtterance = retry; } catch {}
                    }, 600);
                    return;
                }
            }
            utteranceIndex++;
            updatePlayerUI();
            speakCurrent();
        };
        currentUtterance = u;
        try {
            window.speechSynthesis.speak(u);
        } catch (e) {
            console.error('speechSynthesis.speak failed', e);
            utteranceIndex++;
            speakCurrent();
        }
    }

    async function ensureDepsThenPlay() {
        refreshVoices();

        // On Linux, speechSynthesis may report 0 voices yet still speak with the
        // default espeak-ng voice once speech-dispatcher is running. So we gate
        // the install prompt on the *binary* missing (tts-check-deps), not on
        // voices.length. Only offer install when the daemon really isn't there.
        if (window.electron && window.electron.ttsCheckDeps && window.electron.ttsInstallDeps) {
            try {
                const chk = await window.electron.ttsCheckDeps();
                if (chk && chk.needsInstall) {
                    const choice = await window.SummieDialogs.choice(
                        t('Voor voorlezen is speech-dispatcher en espeak-ng nodig. Dit wordt éénmalig geïnstalleerd.'),
                        {
                            title: t('Spraakondersteuning installeren?'),
                            buttons: [
                                { label: t('Installeren'), value: 'install', primary: true },
                                { label: t('Annuleren'), value: 'cancel' }
                            ],
                            escValue: 'cancel'
                        }
                    );
                    if (choice !== 'install') { stop(); return; }
                    isInstalling = true;
                    showTtsInstallOverlay(true);
                    let res;
                    try { res = await window.electron.ttsInstallDeps(); }
                    finally { showTtsInstallOverlay(false); isInstalling = false; }
                    if (res && res.canceled) {
                        if (window.showNotification) window.showNotification(t('Installatie geannuleerd'), '', 'info');
                        stop(); return;
                    }
                    if (!res || !res.success) {
                        const msg = (res && res.error) ? res.error : t('Installatie mislukt');
                        if (window.SummieDialogs && window.SummieDialogs.alert) await window.SummieDialogs.alert(msg, { title: t('Installatie mislukt') });
                        else if (window.showNotification) window.showNotification(t('Installatie mislukt'), msg, 'error');
                        stop(); return;
                    }
                    if (window.showNotification) window.showNotification(t('Spraakondersteuning geïnstalleerd — voorlezen start zo.'), '', 'success');
                    // Give speech-dispatcher a moment to register its socket
                    await new Promise(r => setTimeout(r, 800));
                    refreshVoices();
                    // Brief wait for voiceschanged after daemon start
                    await new Promise((resolve) => {
                        let done = false;
                        const timer = setTimeout(() => { if (!done) { done = true; refreshVoices(); resolve(); } }, 1000);
                        const handler = () => { if (done) return; done = true; clearTimeout(timer); window.speechSynthesis.removeEventListener('voiceschanged', handler); refreshVoices(); resolve(); };
                        window.speechSynthesis.addEventListener('voiceschanged', handler);
                    });
                    doPlay();
                    return;
                }
            } catch (e) { console.error('TTS install flow error', e); }
        }

        // No install needed — wait briefly for voiceschanged to improve gender selection,
        // but don't block playback if it never fires (Linux often reports 0 yet speaks fine).
        const hasVoicesNow = voices.length > 0;
        if (!hasVoicesNow) {
            await new Promise((resolve) => {
                let done = false;
                const timer = setTimeout(() => { if (!done) { done = true; window.speechSynthesis.removeEventListener('voiceschanged', h); refreshVoices(); resolve(); } }, 700);
                const h = () => { if (done) return; done = true; clearTimeout(timer); window.speechSynthesis.removeEventListener('voiceschanged', h); refreshVoices(); resolve(); };
                window.speechSynthesis.addEventListener('voiceschanged', h);
            });
        }
        doPlay();
    }

    function doPlay() {
        // Guard empty doc
        if (!queue.length) {
            if (window.showNotification) window.showNotification(t('Geen tekst om voor te lezen'), '', 'info');
            stop();
            return;
        }
        // Cancel any existing speech
        try { window.speechSynthesis.cancel(); } catch {}
        if (pauseTimer) { clearTimeout(pauseTimer); pauseTimer = null; }
        if (pauseCountdownTimer) { clearInterval(pauseCountdownTimer); pauseCountdownTimer = null; }
        state = STATE.PLAYING;
        updatePlayerUI();
        speakCurrent();
    }

    // ── Public API ────────────────────────────────────
    async function play() {
        if (isInstalling) return;
        if (state === STATE.PAUSED) { resume(); return; }
        if (state === STATE.PLAYING || state === STATE.PAUSE_DELAY) return;
        // Show mini-player immediately with loading bar so user sees activity
        state = STATE.LOADING;
        queue = []; // will be rebuilt
        utteranceIndex = 0;
        clearHighlight();
        updatePlayerUI();
        await loadSettings();
        // Build fresh queue
        queue = buildQueue();
        utteranceIndex = 0;
        clearHighlight();
        updatePlayerUI();
        if (!queue.length) {
            state = STATE.IDLE;
            updatePlayerUI();
            if (window.showNotification) window.showNotification(t('Geen tekst om voor te lezen'), '', 'info');
            return;
        }
        if (!window.speechSynthesis) {
            state = STATE.IDLE;
            updatePlayerUI();
            if (window.showNotification) window.showNotification(t('Geen stemmen beschikbaar'), '', 'error');
            return;
        }
        // Resume if suspended (browser autoplay policy)
        try { if (window.speechSynthesis.paused) window.speechSynthesis.resume(); } catch {}
        // keep LOADING visible until ensureDepsThenPlay decides to play or stop
        ensureDepsThenPlay();
    }

    function pause() {
        if (state !== STATE.PLAYING && state !== STATE.PAUSE_DELAY) return;
        state = STATE.PAUSED;
        try { window.speechSynthesis.pause(); } catch {}
        if (pauseTimer) { clearTimeout(pauseTimer); pauseTimer = null; }
        if (pauseCountdownTimer) { clearInterval(pauseCountdownTimer); pauseCountdownTimer = null; }
        updatePlayerUI();
    }

    function resume() {
        if (state !== STATE.PAUSED) return;
        // Chromium bug: if paused > ~15s, resume() freezes. We re-queue instead if long pause.
        // Simple: try resume, but also check paused state after short delay and fallback to cancel+replay
        state = STATE.PLAYING;
        try { window.speechSynthesis.resume(); } catch {}
        // If we were in a pause-delay, restart that pause
        const item = queue[utteranceIndex];
        if (item && item.type === 'pause') {
            state = STATE.PAUSE_DELAY;
            // Re-enter pause handling by re-calling speakCurrent logic for pause
            if (pauseTimer) clearTimeout(pauseTimer);
            speakCurrent();
        }
        updatePlayerUI();
        // Fallback: if still paused after 600ms, cancel and replay current utterance
        setTimeout(() => {
            try {
                if (window.speechSynthesis.paused && state === STATE.PLAYING) {
                    window.speechSynthesis.cancel();
                    speakCurrent();
                }
            } catch {}
        }, 600);
    }

    function stop() {
        state = STATE.IDLE;
        try { window.speechSynthesis.cancel(); } catch {}
        if (pauseTimer) { clearTimeout(pauseTimer); pauseTimer = null; }
        if (pauseCountdownTimer) { clearInterval(pauseCountdownTimer); pauseCountdownTimer = null; }
        currentUtterance = null;
        clearHighlight();
        showTtsInstallOverlay(false);
        isInstalling = false;
        updatePlayerUI();
    }

    function next() {
        if (state === STATE.IDLE) return;
        try { window.speechSynthesis.cancel(); } catch {}
        if (pauseTimer) { clearTimeout(pauseTimer); pauseTimer = null; }
        if (pauseCountdownTimer) { clearInterval(pauseCountdownTimer); pauseCountdownTimer = null; }
        // Advance to next utterance (skip pauses)
        let idx = utteranceIndex + 1;
        while (idx < queue.length && queue[idx].type === 'pause') idx++;
        if (idx >= queue.length) { stop(); return; }
        utteranceIndex = idx;
        state = STATE.PLAYING;
        updatePlayerUI();
        speakCurrent();
    }

    function prev() {
        if (state === STATE.IDLE) return;
        try { window.speechSynthesis.cancel(); } catch {}
        if (pauseTimer) { clearTimeout(pauseTimer); pauseTimer = null; }
        if (pauseCountdownTimer) { clearInterval(pauseCountdownTimer); pauseCountdownTimer = null; }
        // Go to previous utterance (skip pauses backwards)
        let idx = utteranceIndex - 1;
        while (idx > 0 && queue[idx].type === 'pause') idx--;
        if (idx < 0) idx = 0;
        // If utterance had been playing >2s, restart it instead of going further back
        utteranceIndex = idx;
        state = STATE.PLAYING;
        updatePlayerUI();
        speakCurrent();
    }

    function seekToUtterance(utterancePos) {
        // utterancePos is 0..totalUtterances-1
        const utteranceIndices = queue.map((q, i) => q.type === 'utterance' ? i : -1).filter(i => i !== -1);
        const targetQueueIdx = utteranceIndices[utterancePos];
        if (targetQueueIdx == null) return;
        try { window.speechSynthesis.cancel(); } catch {}
        if (pauseTimer) { clearTimeout(pauseTimer); pauseTimer = null; }
        if (pauseCountdownTimer) { clearInterval(pauseCountdownTimer); pauseCountdownTimer = null; }
        utteranceIndex = targetQueueIdx;
        state = STATE.PLAYING;
        updatePlayerUI();
        speakCurrent();
    }

    function nextParagraph() {
        if (state === STATE.IDLE) return;
        const cur = queue[utteranceIndex];
        if (!cur) return;
        const curPara = cur.paraIdx;
        let idx = utteranceIndex + 1;
        while (idx < queue.length) {
            if (queue[idx].type === 'utterance' && queue[idx].paraIdx !== curPara) break;
            idx++;
        }
        while (idx < queue.length && queue[idx].type === 'pause') idx++;
        if (idx >= queue.length) { stop(); return; }
        try { window.speechSynthesis.cancel(); } catch {}
        if (pauseTimer) { clearTimeout(pauseTimer); pauseTimer = null; }
        if (pauseCountdownTimer) { clearInterval(pauseCountdownTimer); pauseCountdownTimer = null; }
        utteranceIndex = idx;
        state = STATE.PLAYING;
        updatePlayerUI();
        speakCurrent();
    }

    function prevParagraph() {
        if (state === STATE.IDLE) return;
        const cur = queue[utteranceIndex];
        if (!cur) return;
        const curPara = cur.paraIdx;
        let idx = utteranceIndex - 1;
        while (idx > 0 && queue[idx].type !== 'utterance') idx--;
        if (idx < 0) return;
        const targetPara = queue[idx].paraIdx;
        // Find first utterance of that paragraph
        while (idx > 0 && queue[idx - 1].type === 'utterance' && queue[idx - 1].paraIdx === targetPara) idx--;
        // If we were already at start of paragraph, go to previous paragraph
        if (targetPara === curPara) {
            // need previous paragraph
            let j = idx - 1;
            while (j >= 0 && queue[j].type === 'pause') j--;
            if (j < 0) return;
            const prevPara = queue[j].paraIdx;
            while (j > 0 && queue[j - 1].type === 'utterance' && queue[j - 1].paraIdx === prevPara) j--;
            idx = j;
        }
        try { window.speechSynthesis.cancel(); } catch {}
        if (pauseTimer) { clearTimeout(pauseTimer); pauseTimer = null; }
        if (pauseCountdownTimer) { clearInterval(pauseCountdownTimer); pauseCountdownTimer = null; }
        utteranceIndex = idx;
        state = STATE.PLAYING;
        updatePlayerUI();
        speakCurrent();
    }

    async function setRate(rate) {
        const r = Math.max(0.5, Math.min(2, parseFloat(rate) || 1));
        settingsCache = settingsCache || await loadSettings();
        settingsCache.ttsRate = r;
        if (window.electron && window.electron.settingsSet) window.electron.settingsSet({ ttsRate: r });
        updatePlayerUI();
        // Rate applies to next utterance; if playing, restart current
        if (state === STATE.PLAYING && queue[utteranceIndex] && queue[utteranceIndex].type === 'utterance') {
            try { window.speechSynthesis.cancel(); } catch {}
            speakCurrent();
        }
    }

    async function setGender(gender) {
        const g = ['female','male','system'].includes(gender) ? gender : 'female';
        settingsCache = settingsCache || await loadSettings();
        settingsCache.ttsGender = g;
        if (window.electron && window.electron.settingsSet) window.electron.settingsSet({ ttsGender: g });
        updatePlayerUI();
        if (state === STATE.PLAYING && queue[utteranceIndex] && queue[utteranceIndex].type === 'utterance') {
            try { window.speechSynthesis.cancel(); } catch {}
            speakCurrent();
        }
    }

    function isPlaying() { return state === STATE.PLAYING || state === STATE.PAUSE_DELAY; }
    function isPaused() { return state === STATE.PAUSED; }
    function isIdle() { return state === STATE.IDLE; }

    // ── Init ──────────────────────────────────────────
    function init() {
        // Cache DOM
        els.player = document.getElementById('ttsPlayer');
        els.playPauseBtn = document.getElementById('ttsPlayPauseBtn');
        els.prevBtn = document.getElementById('ttsPrevBtn');
        els.nextBtn = document.getElementById('ttsNextBtn');
        els.prevParaBtn = document.getElementById('ttsPrevParaBtn');
        els.nextParaBtn = document.getElementById('ttsNextParaBtn');
        els.stopBtn = document.getElementById('ttsStopBtn');
        els.closeBtn = document.getElementById('ttsCloseBtn');
        els.progressTrack = document.getElementById('ttsProgressTrack');
        els.progressFill = document.getElementById('ttsProgressFill');
        els.progressText = document.getElementById('ttsProgressText');
        els.voiceSelect = document.getElementById('ttsVoiceSelect');
        els.speedBtns = Array.from(document.querySelectorAll('[data-rate]'));

        // Toolbar button
        const ttsBtn = document.getElementById('ttsPlayBtn');
        if (ttsBtn) {
            ttsBtn.addEventListener('mousedown', e => { e.preventDefault(); if (window.topbarManager) window.topbarManager.saveCurrentRange(); });
            ttsBtn.addEventListener('click', () => {
                if (state === STATE.IDLE) play();
                else if (state === STATE.PAUSED) resume();
                else pause();
            });
        }

        // Player controls
        if (els.playPauseBtn) els.playPauseBtn.addEventListener('click', () => {
            if (state === STATE.PLAYING || state === STATE.PAUSE_DELAY) pause();
            else if (state === STATE.PAUSED) resume();
            else play();
        });
        if (els.prevBtn) els.prevBtn.addEventListener('click', prev);
        if (els.nextBtn) els.nextBtn.addEventListener('click', next);
        if (els.prevParaBtn) els.prevParaBtn.addEventListener('click', prevParagraph);
        if (els.nextParaBtn) els.nextParaBtn.addEventListener('click', nextParagraph);
        if (els.stopBtn) els.stopBtn.addEventListener('click', stop);
        if (els.closeBtn) els.closeBtn.addEventListener('click', stop);

        // Progress scrub (click or drag)
        if (els.progressTrack) {
            const seekFromEvent = (e) => {
                const rect = els.progressTrack.getBoundingClientRect();
                const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
                const pct = x / rect.width;
                const totalUtterances = queue.filter(q => q.type === 'utterance').length;
                if (!totalUtterances) return;
                const pos = Math.min(totalUtterances - 1, Math.max(0, Math.round(pct * (totalUtterances - 1))));
                if (state !== STATE.IDLE) seekToUtterance(pos);
            };
            els.progressTrack.addEventListener('click', seekFromEvent);
        }

        // Voice gender
        if (els.voiceSelect) els.voiceSelect.addEventListener('change', (e) => setGender(e.target.value));

        // Speed buttons
        els.speedBtns.forEach(btn => btn.addEventListener('click', () => setRate(btn.dataset.rate)));

        // Pause on edit
        const editor = document.getElementById('editor');
        const pagesContainer = document.getElementById('pagesContainer');
        const onEditPause = () => {
            if (state === STATE.PLAYING || state === STATE.PAUSE_DELAY) {
                pause();
                if (window.showNotification) window.showNotification(t('Voorlezen gepauzeerd — bewerken gedetecteerd'), '', 'info');
            }
        };
        if (editor) {
            editor.addEventListener('input', onEditPause);
            editor.addEventListener('paste', onEditPause);
        }
        if (pagesContainer) {
            const mo = new MutationObserver(() => { /* avoid spam — debounce */ });
            // Instead, listen to input events which already cover typing; mutation for structural edits
            // We just use the same onEditPause debounced
            let debounce = null;
            const obs = new MutationObserver(() => {
                if (state !== STATE.PLAYING && state !== STATE.PAUSE_DELAY) return;
                clearTimeout(debounce);
                debounce = setTimeout(onEditPause, 120);
            });
            obs.observe(pagesContainer, { childList: true, subtree: true, characterData: true });
        }

        // Global shortcut Ctrl+Shift+R
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'R' || e.key === 'r')) {
                e.preventDefault();
                if (state === STATE.IDLE) play();
                else if (state === STATE.PAUSED) resume();
                else if (state === STATE.PLAYING || state === STATE.PAUSE_DELAY) pause();
            }
            if (e.key === 'Escape' && state !== STATE.IDLE) {
                // Only stop if player is focused or visible — avoid hijacking other modals
                if (els.player && els.player.classList.contains('active')) {
                    // Let other modals handle Esc first
                    if (document.querySelector('.modal.active') || document.querySelector('.summie-dlg-overlay')) return;
                    stop();
                }
            }
        });

        // Voices
        refreshVoices();
        if (window.speechSynthesis) {
            window.speechSynthesis.onvoiceschanged = refreshVoices;
            // Some Chromium needs polling
            setTimeout(refreshVoices, 500);
        }

        // Settings live updates
        loadSettings().then(() => updatePlayerUI());
        if (window.electron && window.electron.onSettingsChanged) {
            window.electron.onSettingsChanged((patch) => {
                if (!patch) return;
                if (patch.ttsRate != null) { settingsCache.ttsRate = patch.ttsRate; updatePlayerUI(); }
                if (patch.ttsGender != null) { settingsCache.ttsGender = patch.ttsGender; updatePlayerUI(); }
                if (patch.ttsPauses) { settingsCache.ttsPauses = { ...(settingsCache.ttsPauses || {}), ...patch.ttsPauses }; }
                if (patch.language) { settingsCache.language = patch.language; refreshVoices(); }
            });
        }
        if (window.electron && window.electron.onLanguageChanged) {
            window.electron.onLanguageChanged((lang) => {
                if (settingsCache) settingsCache.language = lang;
                refreshVoices();
            });
        }

        // Also keep per-toolbar button label in sync for selection mode hint
        document.addEventListener('selectionchange', () => {
            const btn = document.getElementById('ttsPlayBtn');
            if (!btn || state !== STATE.IDLE) return;
            const sel = window.getSelection();
            const hasSel = sel && !sel.isCollapsed && sel.toString().trim().length > 0;
            // Update title hint
            if (hasSel) btn.title = t('Geselecteerde tekst voorlezen') + ' (Ctrl+Shift+R)';
            else btn.title = t('Hele document voorlezen') + ' (Ctrl+Shift+R)';
        });

        updatePlayerUI();
    }

    window.ReadAloud = {
        init, play, pause, resume, stop, next, prev, nextParagraph, prevParagraph,
        setRate, setGender, isPlaying, isPaused, isIdle,
        getQueue: () => queue, getState: () => state
    };

    // Auto-init on DOM ready
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
