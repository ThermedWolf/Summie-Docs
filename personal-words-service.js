// ==================== PERSONAL WORDS (main process) ====================
// User-added exception words ("Aan woordenboek toevoegen" in the spell
// menu), shared by every window through one JSON file in userData.
// localStorage is partitioned per window, so a file is the only correct
// store. Word correctness itself is decided by the neural context model in
// the renderer (see app/js/ai/spell-checker.js).

const path = require('path');
const fs = require('fs');

const MAX_WORDS = 5000;
let _userDataPath = null;

function init(userDataPath) {
    if (userDataPath) _userDataPath = userDataPath;
}

function getFile() {
    if (!_userDataPath) throw new Error('personal-words-service not initialised');
    return path.join(_userDataPath, 'spell-personal.json');
}

function getPersonalWords() {
    try {
        const parsed = JSON.parse(fs.readFileSync(getFile(), 'utf8'));
        const words = parsed && Array.isArray(parsed.words) ? parsed.words : [];
        return [...new Set(words.filter(w => typeof w === 'string' && w.trim()).map(w => w.toLowerCase()))];
    } catch { return []; }
}

function addPersonalWord(word) {
    const w = String(word || '').toLowerCase().trim();
    if (!w) return getPersonalWords();
    const words = getPersonalWords();
    if (!words.includes(w)) {
        const clean = [...words, w].slice(0, MAX_WORDS);
        fs.writeFileSync(getFile(), JSON.stringify({ words: clean }), 'utf8');
    }
    return getPersonalWords();
}

module.exports = { init, getPersonalWords, addPersonalWord };
