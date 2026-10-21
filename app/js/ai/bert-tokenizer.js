// ==================== BERT WORDPIECE TOKENIZER ====================
// Minimal BERT-uncased tokenizer (basic + WordPiece) running off vocab.txt.
// No dependencies; built for masked-LM scoring of single words.

(function () {
    'use strict';

    let vocab = null;      // Array<string>
    let vocabMap = null;   // Map<string, number>

    function loadVocab(text) {
        vocab = text.split('\n').map(s => s.trim()).filter(s => s.length > 0);
        vocabMap = new Map();
        for (let i = 0; i < vocab.length; i++) {
            if (!vocabMap.has(vocab[i])) vocabMap.set(vocab[i], i);
        }
        return vocab.length;
    }

    function isLoaded() {
        return !!(vocab && vocabMap);
    }

    function stripAccents(text) {
        // BERT-uncased: NFD decompose, drop combining marks (Mn).
        try {
            return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        } catch {
            return text;
        }
    }

    // Basic tokenization: lowercase, split punctuation, split whitespace.
    function basicTokenize(text) {
        const lower = stripAccents(String(text).toLowerCase());
        // Separate ASCII punctuation (keep ' as its own token, like BERT).
        const spaced = lower.replace(/([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, ' $1 ');
        return spaced.split(/\s+/).filter(t => t.length > 0);
    }

    // Greedy longest-match WordPiece for one basic token. Returns token list
    // (with ## continuation markers) or ['[UNK]'].
    function wordpieceTokenize(basicToken) {
        if (basicToken.length > 100) return ['[UNK]'];
        const output = [];
        let start = 0;
        while (start < basicToken.length) {
            let end = basicToken.length;
            let found = null;
            while (start < end) {
                let substr = basicToken.slice(start, end);
                if (start > 0) substr = '##' + substr;
                if (vocabMap.has(substr)) {
                    found = substr;
                    break;
                }
                end--;
            }
            if (found === null) return ['[UNK]'];
            output.push(found);
            start = end;
        }
        return output;
    }

    function encode(text, maxLen) {
        // Returns {ids, mask} with [CLS]/[SEP], truncated to maxLen.
        const pieces = [];
        const basics = basicTokenize(text);
        for (const b of basics) {
            const wp = wordpieceTokenize(b);
            for (const p of wp) pieces.push(p);
        }
        const ids = [vocabMap.get('[CLS]')];
        for (const p of pieces) ids.push(vocabMap.get(p));
        ids.push(vocabMap.get('[SEP]'));
        const trimmed = ids.slice(0, maxLen || 128);
        const mask = new Array(trimmed.length).fill(1);
        return { ids: trimmed, mask };
    }

    function tokenId(token) {
        return vocabMap ? (vocabMap.get(token) ?? vocabMap.get('[UNK]')) : 0;
    }

    // Inverse lookup: vocab token string for an id (or null when out of
    // range). Used to turn raw model predictions back into words.
    function tokenAt(id) {
        return (vocab && Number.isInteger(id) && id >= 0 && id < vocab.length) ? vocab[id] : null;
    }

    // Map a single surface word to exactly one vocab id, or -1 when it
    // splits into pieces / is unknown (multi-token candidates are skipped
    // by the scorer — masking one position can only predict one token).
    function singleTokenId(word) {
        if (!isLoaded()) return -1;
        const basics = basicTokenize(word);
        if (basics.length !== 1) return -1;
        const wp = wordpieceTokenize(basics[0]);
        if (wp.length !== 1 || wp[0] === '[UNK]') return -1;
        return vocabMap.get(wp[0]);
    }

    window.BertTokenizer = {
        loadVocab,
        isLoaded,
        basicTokenize,
        wordpieceTokenize,
        encode,
        tokenId,
        tokenAt,
        singleTokenId,
        vocabSize: () => (vocab ? vocab.length : 0),
    };
})();