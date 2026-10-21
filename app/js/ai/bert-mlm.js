// ==================== BERT-MINI MASKED LM ====================
// Neural context scoring over a masked position. Serves two consumers:
//   - neural-check.js: confusion-set detection (their/there…) + spell-menu
//     re-ranking with sentence context
//   - spell-checker.js: the AI-only correctness oracle (checkWordInContext)
// Runs on the vendored onnxruntime-web (no CDN — CSP-safe). The model
// (~11 MB quantized) and vocab download on demand AFTER explicit user
// consent; everything stays local thereafter.

(function () {
    'use strict';

    const MODEL_ID = 'bert-mini-mlm';
    const VOCAB_ID = 'bert-mini-vocab';
    const MAX_SEQ = 64;
    const TOP_ALTERNATIVES = 8; // real-word predictions returned per masked position

    let _ort = null;
    let _session = null;
    let _loading = null;
    let _modelReady = false;

    function vendorDirUrl() {
        try {
            const tag = document.querySelector('script[src*="ort.min.js"], script[src*="ort.all.min.js"]');
            if (tag && tag.src) return tag.src.slice(0, tag.src.lastIndexOf('/') + 1);
        } catch { /* fall through */ }
        return 'js/ai/vendor/';
    }

    async function initOrt() {
        if (_ort) return _ort;
        if (!window.ort || !window.ort.InferenceSession) {
            throw new Error('onnxruntime vendor bundle missing');
        }
        _ort = window.ort;
        try {
            _ort.env.wasm.wasmPaths = vendorDirUrl();
        } catch { /* defaults apply */ }
        return _ort;
    }

    async function modelStatus() {
        try {
            if (window.electron && window.electron.aiGetModelStatus) {
                const st = await window.electron.aiGetModelStatus();
                const m = st && st[MODEL_ID];
                const v = st && st[VOCAB_ID];
                return { model: !!(m && m.installed), vocab: !!(v && v.installed) };
            }
        } catch { /* IPC unavailable */ }
        return { model: false, vocab: false };
    }

    function bufferFromBase64(b64) {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes.buffer;
    }

    async function fetchBuffer(modelId) {
        if (!window.electron || !window.electron.aiGetModelBuffer) {
            throw new Error('model IPC unavailable');
        }
        const res = await window.electron.aiGetModelBuffer(modelId);
        if (!res || !res.success || !res.base64) {
            throw new Error('model not installed: ' + modelId);
        }
        return bufferFromBase64(res.base64);
    }

    // Ensure model + vocab + session. Resolves {ready:true} or
    // {ready:false, needsDownload:true} (caller shows the consent dialog).
    async function ensureLoaded() {
        if (_modelReady && _session) return { ready: true };
        if (_loading) {
            try { await _loading; } catch { /* fall through */ }
            return _modelReady && _session ? { ready: true } : { ready: false, needsDownload: true };
        }
        _loading = (async () => {
            const st = await modelStatus();
            if (!st.model || !st.vocab) throw new Error('needs-download');
            await initOrt();
            if (!window.BertTokenizer || !window.BertTokenizer.isLoaded()) {
                const vbuf = await fetchBuffer(VOCAB_ID);
                window.BertTokenizer.loadVocab(new TextDecoder().decode(vbuf));
            }
            const mbuf = await fetchBuffer(MODEL_ID);
            _session = await _ort.InferenceSession.create(mbuf);
            _modelReady = true;
        })();
        try {
            await _loading;
            return { ready: true };
        } catch (err) {
            if (err && err.message === 'needs-download') return { ready: false, needsDownload: true };
            throw err;
        } finally {
            _loading = null;
        }
    }

    // Consent + download flow (mirrors the Piper voice pattern). Returns
    // true when the model is ready afterwards.
    async function ensureWithConsent() {
        const pre = await ensureLoaded();
        if (pre.ready) return true;
        if (!window.SummieDialogs || !window.SummieDialogs.confirm) return false;
        const ok = await window.SummieDialogs.confirm(
            SummieI18n.t('Voor Engelse contextcontrole (their/there e.d.) is een klein model nodig (~19 MB, éénmalig). Wil je die downloaden?'),
            {
                title: SummieI18n.t('Neuraal contextmodel downloaden?'),
                confirmText: SummieI18n.t('Downloaden'),
                cancelText: SummieI18n.t('Nu niet'),
            }
        );
        if (!ok) return false;
        try {
            if (window.showNotification) {
                window.showNotification(SummieI18n.t('Neuraal model'), SummieI18n.t('Model wordt gedownload...'), 'info');
            }
            if (window.electron && window.electron.aiDownloadModel) {
                await window.electron.aiDownloadModel(MODEL_ID);
                await window.electron.aiDownloadModel(VOCAB_ID);
            }
            const post = await ensureLoaded();
            if (post.ready && window.showNotification) {
                window.showNotification(SummieI18n.t('Neuraal model'), SummieI18n.t('Model gereed — contextcontrole actief.'), 'success');
            } else if (!post.ready && window.showNotification) {
                window.showNotification(SummieI18n.t('Neuraal model'), SummieI18n.t('Download mislukt'), 'error');
            }
            return post.ready;
        } catch (err) {
            console.warn('[BertMLM] Download failed:', err && err.message);
            if (window.showNotification) {
                window.showNotification(SummieI18n.t('Neuraal model'), SummieI18n.t('Download mislukt'), 'error');
            }
            return false;
        }
    }

    function toBigInt64(arr) {
        const out = new BigInt64Array(arr.length);
        for (let i = 0; i < arr.length; i++) out[i] = BigInt(arr[i]);
        return out;
    }

    // Score candidate surface words at the masked position.
    // ids/mask: encoded sentence with maskIdx pointing at [MASK].
    // candidates: array of surface strings (single-token ones are scored).
    // Returns [{word, prob}] sorted desc (prob over the candidate set).
    async function scoreCandidates(ids, mask, maskIdx, candidates) {
        const ensured = await ensureLoaded();
        if (!ensured.ready) throw new Error('model not ready');
        const seqLen = ids.length;
        const feeds = {};
        const names = _session.inputNames || [];
        const need = (n) => names.length === 0 || names.includes(n);
        if (need('input_ids')) feeds['input_ids'] = new _ort.Tensor('int64', toBigInt64(ids), [1, seqLen]);
        if (need('attention_mask')) feeds['attention_mask'] = new _ort.Tensor('int64', toBigInt64(mask), [1, seqLen]);
        if (need('token_type_ids')) feeds['token_type_ids'] = new _ort.Tensor('int64', toBigInt64(new Array(seqLen).fill(0)), [1, seqLen]);

        const out = await _session.run(feeds);
        const outName = _session.outputNames[0];
        const logits = out[outName].data; // Float32Array [1, seq, vocab]
        const vocabSize = Math.round(logits.length / seqLen);
        const base = maskIdx * vocabSize;

        const scored = [];
        for (const word of candidates) {
            const id = window.BertTokenizer.singleTokenId(word);
            if (id < 0 || id >= vocabSize) continue;
            scored.push({ word, logit: logits[base + id] });
        }
        if (!scored.length) return [];
        let max = -Infinity;
        for (const s of scored) if (s.logit > max) max = s.logit;
        let sum = 0;
        for (const s of scored) { s.prob = Math.exp(s.logit - max); sum += s.prob; }
        for (const s of scored) s.prob /= sum;
        scored.sort((a, b) => b.prob - a.prob);
        return scored.map(s => ({ word: s.word, prob: s.prob }));
    }

    // Convenience: mask the word at basic-token index in a raw sentence.
    // Returns null when the target doesn't map to exactly one token.
    function encodeMasked(basicTokens, targetIdx) {
        const MASK = window.BertTokenizer.tokenId('[MASK]');
        const ids = [window.BertTokenizer.tokenId('[CLS]')];
        let maskIdx = -1;
        for (let i = 0; i < basicTokens.length && ids.length < MAX_SEQ - 1; i++) {
            if (i === targetIdx) {
                maskIdx = ids.length;
                ids.push(MASK);
                continue;
            }
            const wp = window.BertTokenizer.wordpieceTokenize(basicTokens[i]);
            for (const p of wp) {
                if (ids.length >= MAX_SEQ - 1) break;
                ids.push(window.BertTokenizer.tokenId(p));
            }
        }
        if (maskIdx < 0) return null;
        ids.push(window.BertTokenizer.tokenId('[SEP]'));
        return { ids, mask: new Array(ids.length).fill(1), maskIdx };
    }

    // Full-vocabulary analysis at the masked position: the written word's
    // own probability plus the top real-word alternatives the model prefers.
    // This is the correctness oracle for the AI-only spell checker.
    //
    // Returns null when the word cannot be scored (not a single vocab token
    // — true for most Dutch compounds — or absent from the text). The caller
    // treats null as "unchecked", never as "wrong".
    async function checkWordInContext(text, word) {
        if (!window.BertTokenizer || !window.BertTokenizer.isLoaded()) return null;
        const targetBasics = window.BertTokenizer.basicTokenize(word);
        if (targetBasics.length !== 1) return null;
        const targetLower = targetBasics[0];

        const basics = window.BertTokenizer.basicTokenize(text);
        const idx = basics.indexOf(targetLower);
        if (idx < 0) return null;

        // Window around the target — the tiny model degrades on long
        // sequences, and encodeMasked truncates from the end.
        const from = Math.max(0, idx - 25);
        const windowed = basics.slice(from, idx + 26);
        // Trailing sentence punctuation destabilises the tiny model — drop it.
        while (windowed.length > 1 && /^[.!?…]+$/.test(windowed[windowed.length - 1])) windowed.pop();
        const enc = encodeMasked(windowed, idx - from);
        if (!enc) return null;

        const ensured = await ensureLoaded();
        if (!ensured.ready) throw new Error('model not ready');
        const seqLen = enc.ids.length;
        const feeds = {};
        const names = _session.inputNames || [];
        const need = (n) => names.length === 0 || names.includes(n);
        if (need('input_ids')) feeds['input_ids'] = new _ort.Tensor('int64', toBigInt64(enc.ids), [1, seqLen]);
        if (need('attention_mask')) feeds['attention_mask'] = new _ort.Tensor('int64', toBigInt64(enc.mask), [1, seqLen]);
        if (need('token_type_ids')) feeds['token_type_ids'] = new _ort.Tensor('int64', toBigInt64(new Array(seqLen).fill(0)), [1, seqLen]);

        const out = await _session.run(feeds);
        const logits = out[_session.outputNames[0]].data; // [1, seq, vocab]
        const vocabSize = Math.round(logits.length / seqLen);
        const base = enc.maskIdx * vocabSize;

        // Full-vocab softmax at the mask position (max-subtracted for stability).
        let maxLogit = -Infinity;
        for (let i = 0; i < vocabSize; i++) {
            const v = logits[base + i];
            if (v > maxLogit) maxLogit = v;
        }
        let sumExp = 0;
        for (let i = 0; i < vocabSize; i++) sumExp += Math.exp(logits[base + i] - maxLogit);

        const origId = window.BertTokenizer.singleTokenId(word);
        if (origId < 0 || origId >= vocabSize) return null;
        const origProb = Math.exp(logits[base + origId] - maxLogit) / sumExp;

        // Top alternatives: real words only — skip subword pieces, special
        // tokens, punctuation/number tokens and single letters.
        const ranked = [];
        for (let i = 0; i < vocabSize; i++) ranked.push({ id: i, logit: logits[base + i] });
        ranked.sort((a, b) => b.logit - a.logit);
        const top = [];
        for (const r of ranked) {
            if (top.length >= TOP_ALTERNATIVES) break;
            const token = window.BertTokenizer.tokenAt(r.id);
            if (!token || token === '[UNK]' || token.startsWith('##') || token.startsWith('[')) continue;
            if (!/[a-z]/.test(token) || token.length < 2) continue;
            if (token === targetLower) continue;
            top.push({ word: token, prob: Math.exp(r.logit - maxLogit) / sumExp });
        }
        return { origProb, top };
    }

    window.BertMLM = {
        ensureLoaded,
        ensureWithConsent,
        scoreCandidates,
        encodeMasked,
        checkWordInContext,
        ready: () => _modelReady && !!_session,
        MODEL_ID,
    };
})();