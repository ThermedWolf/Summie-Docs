// ==================== FIND & REPLACE ====================
// Floating VS Code-style panel. Triggered by Ctrl+F (search only)
// or Ctrl+H (open with replace section expanded).
// Supports: case-sensitive, whole-word, regex.
// Replace / Replace All work on the live editor content.

(function () {
    'use strict';

    // ── State ──────────────────────────────────────────────────────────────
    let _matches = [];   // { node, start, length } per match
    let _currentIdx = -1;   // active match index
    let _replaceOpen = false;
    let _caseSensitive = false;
    let _wholeWord = false;
    let _useRegex = false;
    let _panel = null;
    let _findInput = null;
    let _replaceInput = null;
    let _counter = null;
    let _regexError = null;
    let _lastQuery = '';

    // ── Build panel HTML ───────────────────────────────────────────────────
    function _buildPanel() {
        const panel = document.createElement('div');
        panel.id = 'findReplacePanel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', SummieI18n.t('Zoeken en vervangen'));

        panel.innerHTML = `
            <div class="fr-header">
                <span class="fr-title">Zoeken</span>
                <button class="fr-toggle-replace" id="frToggleReplace" title="Vervangen tonen/verbergen">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="9 18 15 12 9 6"/>
                    </svg>
                    Vervangen
                </button>
                <button class="fr-close" id="frClose" title="Sluiten (Esc)">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
            <div class="fr-body">
                <!-- Search row -->
                <div class="fr-row">
                    <div class="fr-input-wrap">
                        <input class="fr-input" id="frFindInput" type="text" placeholder="Zoeken…" autocomplete="off" spellcheck="false"/>
                    </div>
                    <div class="fr-options">
                        <button class="fr-opt-btn" id="frOptCase" title="Hoofdlettergevoelig (Alt+C)">Aa</button>
                        <button class="fr-opt-btn" id="frOptWord" title="Heel woord (Alt+W)">W</button>
                        <button class="fr-opt-btn" id="frOptRegex" title="Reguliere expressie (Alt+R)">.*</button>
                    </div>
                    <div class="fr-nav">
                        <button class="fr-nav-btn" id="frPrev" title="Vorige (Shift+Enter)">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="18 15 12 9 6 15"/></svg>
                        </button>
                        <button class="fr-nav-btn" id="frNext" title="Volgende (Enter)">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
                        </button>
                    </div>
                    <span class="fr-counter" id="frCounter"></span>
                </div>
                <div class="fr-regex-error" id="frRegexError"></div>

                <!-- Replace section (collapsed by default) -->
                <div class="fr-replace-section" id="frReplaceSection">
                    <div class="fr-row">
                        <div class="fr-input-wrap">
                            <input class="fr-input" id="frReplaceInput" type="text" placeholder="Vervangen door…" autocomplete="off" spellcheck="false"/>
                        </div>
                    </div>
                    <div class="fr-replace-actions">
                        <button class="fr-btn" id="frReplaceOne">Vervang</button>
                        <button class="fr-btn fr-btn--primary" id="frReplaceAll">Vervang alles</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(panel);
        return panel;
    }

    // ── Init ───────────────────────────────────────────────────────────────
    function _init() {
        _panel = _buildPanel();
        _findInput = document.getElementById('frFindInput');
        _replaceInput = document.getElementById('frReplaceInput');
        _counter = document.getElementById('frCounter');
        _regexError = document.getElementById('frRegexError');

        // Close
        document.getElementById('frClose').addEventListener('click', close);

        // Toggle replace
        document.getElementById('frToggleReplace').addEventListener('click', () => {
            _toggleReplace(!_replaceOpen);
        });

        // Option toggles
        document.getElementById('frOptCase').addEventListener('click', () => {
            _caseSensitive = !_caseSensitive;
            document.getElementById('frOptCase').classList.toggle('active', _caseSensitive);
            _runSearch();
        });
        document.getElementById('frOptWord').addEventListener('click', () => {
            _wholeWord = !_wholeWord;
            document.getElementById('frOptWord').classList.toggle('active', _wholeWord);
            _runSearch();
        });
        document.getElementById('frOptRegex').addEventListener('click', () => {
            _useRegex = !_useRegex;
            document.getElementById('frOptRegex').classList.toggle('active', _useRegex);
            _runSearch();
        });

        // Nav
        document.getElementById('frPrev').addEventListener('click', () => _navigate(-1));
        document.getElementById('frNext').addEventListener('click', () => _navigate(1));

        // Replace
        document.getElementById('frReplaceOne').addEventListener('click', _replaceOne);
        document.getElementById('frReplaceAll').addEventListener('click', _replaceAll);

        // Find input
        _findInput.addEventListener('input', () => _runSearch());
        _findInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.shiftKey ? _navigate(-1) : _navigate(1);
            }
            if (e.key === 'Escape') { e.preventDefault(); close(); }
        });

        // Replace input
        _replaceInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); _replaceOne(); }
            if (e.key === 'Escape') { e.preventDefault(); close(); }
        });

        // Alt+C / Alt+W / Alt+R shortcuts inside panel
        _panel.addEventListener('keydown', (e) => {
            if (e.altKey && e.key.toLowerCase() === 'c') { document.getElementById('frOptCase').click(); }
            if (e.altKey && e.key.toLowerCase() === 'w') { document.getElementById('frOptWord').click(); }
            if (e.altKey && e.key.toLowerCase() === 'r') { document.getElementById('frOptRegex').click(); }
        });
    }

    // ── Open / Close ───────────────────────────────────────────────────────
    function open(withReplace) {
        if (!_panel) _init();

        _panel.classList.add('active');
        _toggleReplace(!!withReplace);

        // Pre-fill with current selection if any
        const sel = window.getSelection();
        if (sel && sel.toString().trim() && !sel.toString().includes('\n')) {
            _findInput.value = sel.toString();
        }

        _findInput.focus();
        _findInput.select();
        _runSearch();
    }

    function close() {
        if (!_panel) return;
        _panel.classList.remove('active');
        _clearHighlights();
        _matches = [];
        _currentIdx = -1;
        _updateCounter();
        // Return focus to editor
        const editor = document.getElementById('editor');
        if (editor) editor.focus();
    }

    function isOpen() {
        return _panel && _panel.classList.contains('active');
    }

    function _toggleReplace(open) {
        _replaceOpen = open;
        const section = document.getElementById('frReplaceSection');
        const toggleBtn = document.getElementById('frToggleReplace');
        const title = _panel.querySelector('.fr-title');
        section.classList.toggle('open', open);
        toggleBtn.classList.toggle('replace-open', open);
        title.textContent = open ? SummieI18n.t('Zoeken & Vervangen') : SummieI18n.t('Zoeken');
        if (open) _replaceInput.focus();
    }

    // ── Build regex from current options ──────────────────────────────────
    function _buildRegex(query) {
        if (!query) return null;
        _regexError.classList.remove('visible');
        _findInput.classList.remove('fr-input--error');

        let pattern = query;
        if (!_useRegex) {
            // Escape special regex chars
            pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }
        if (_wholeWord) {
            pattern = `\\b${pattern}\\b`;
        }

        const flags = _caseSensitive ? 'g' : 'gi';
        try {
            return new RegExp(pattern, flags);
        } catch (err) {
            _regexError.textContent = `Ongeldige expressie: ${err.message}`;
            _regexError.classList.add('visible');
            _findInput.classList.add('fr-input--error');
            return null;
        }
    }

    // ── Search ─────────────────────────────────────────────────────────────
    function _runSearch() {
        _clearHighlights();
        _matches = [];
        _currentIdx = -1;

        const query = _findInput.value;
        _lastQuery = query;

        if (!query) {
            _updateCounter();
            return;
        }

        const regex = _buildRegex(query);
        if (!regex) { _updateCounter(); return; }

        const editor = document.getElementById('editor');
        if (!editor) return;

        // Collect all text nodes (skip script/style and our own highlights)
        const walker = document.createTreeWalker(
            editor,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode(node) {
                    let p = node.parentElement;
                    while (p && p !== editor) {
                        if (['SCRIPT', 'STYLE'].includes(p.tagName)) return NodeFilter.FILTER_REJECT;
                        p = p.parentElement;
                    }
                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        const textNodes = [];
        let node;
        while ((node = walker.nextNode())) textNodes.push(node);

        // For each text node, find matches and wrap them
        textNodes.forEach(textNode => {
            const text = textNode.textContent;
            regex.lastIndex = 0;
            let match;
            const localMatches = [];
            while ((match = regex.exec(text)) !== null) {
                localMatches.push({ start: match.index, length: match[0].length });
                if (match[0].length === 0) regex.lastIndex++; // avoid infinite loop on zero-width
            }
            if (localMatches.length === 0) return;

            const parent = textNode.parentNode;
            const frag = document.createDocumentFragment();
            let last = 0;
            localMatches.forEach(m => {
                if (m.start > last) frag.appendChild(document.createTextNode(text.slice(last, m.start)));
                const mark = document.createElement('mark');
                mark.className = 'fr-highlight';
                mark.dataset.frIdx = _matches.length;
                mark.textContent = text.slice(m.start, m.start + m.length);
                frag.appendChild(mark);
                _matches.push(mark);
                last = m.start + m.length;
            });
            if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
            parent.replaceChild(frag, textNode);
        });

        if (_matches.length > 0) {
            _currentIdx = 0;
            _activateCurrent();
        }
        _updateCounter();
    }

    // ── Navigate ───────────────────────────────────────────────────────────
    function _navigate(dir) {
        if (_matches.length === 0) return;
        _currentIdx = (_currentIdx + dir + _matches.length) % _matches.length;
        _activateCurrent();
        _updateCounter();
    }

    function _activateCurrent() {
        _matches.forEach((m, i) => {
            m.classList.toggle('fr-highlight--current', i === _currentIdx);
        });
        if (_matches[_currentIdx]) {
            _matches[_currentIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    // ── Counter ────────────────────────────────────────────────────────────
    function _updateCounter() {
        if (!_counter) return;
        if (_matches.length === 0) {
            _counter.textContent = _lastQuery ? SummieI18n.t('Geen') : '';
            _counter.classList.toggle('fr-no-match', !!_lastQuery);
        } else {
            _counter.textContent = `${_currentIdx + 1} / ${_matches.length}`;
            _counter.classList.remove('fr-no-match');
        }
        const hasMatches = _matches.length > 0;
        document.getElementById('frPrev').disabled = !hasMatches;
        document.getElementById('frNext').disabled = !hasMatches;
        document.getElementById('frReplaceOne').disabled = !hasMatches;
        document.getElementById('frReplaceAll').disabled = !hasMatches;
    }

    // ── Clear highlights ───────────────────────────────────────────────────
    function _clearHighlights() {
        const editor = document.getElementById('editor');
        if (!editor) return;
        editor.querySelectorAll('.fr-highlight').forEach(mark => {
            mark.parentNode.replaceChild(document.createTextNode(mark.textContent), mark);
        });
        editor.normalize();
        _matches = [];
    }

    // ── Replace one ────────────────────────────────────────────────────────
    function _replaceOne() {
        if (_matches.length === 0 || _currentIdx < 0) return;
        const mark = _matches[_currentIdx];
        if (!mark || !mark.parentNode) { _runSearch(); return; }

        const replacement = _replaceInput.value;
        mark.parentNode.replaceChild(document.createTextNode(replacement), mark);

        // Re-run search to rebuild matches after DOM change
        const prevIdx = _currentIdx;
        _runSearch();
        // Advance to next (which is now at the same index after removal)
        if (_matches.length > 0) {
            _currentIdx = Math.min(prevIdx, _matches.length - 1);
            _activateCurrent();
            _updateCounter();
        }

        _notifyChange();
    }

    // ── Replace all ────────────────────────────────────────────────────────
    function _replaceAll() {
        if (_matches.length === 0) return;
        const replacement = _replaceInput.value;
        const count = _matches.length;

        // Replace all highlights in one pass
        _matches.forEach(mark => {
            if (mark.parentNode) {
                mark.parentNode.replaceChild(document.createTextNode(replacement), mark);
            }
        });

        const editor = document.getElementById('editor');
        if (editor) editor.normalize();

        _matches = [];
        _currentIdx = -1;
        _lastQuery = _findInput.value;
        _updateCounter();
        _notifyChange();

        // Show brief feedback
        _counter.textContent = SummieI18n.t(`${count} vervangen`);
        setTimeout(() => _runSearch(), 1200);
    }

    // ── Notify the app that content changed (triggers unsaved indicator) ──
    function _notifyChange() {
        const editor = document.getElementById('editor');
        if (editor) {
            editor.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    // ── Global keyboard shortcut ──────────────────────────────────────────
    function handleGlobalKey(e) {
        if (e.key === 'Escape' && isOpen()) {
            e.preventDefault();
            close();
            return;
        }
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'f') {
            e.preventDefault();
            isOpen() ? _findInput.focus() : open(false);
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
            e.preventDefault();
            isOpen() && _replaceOpen ? _findInput.focus() : open(true);
            return;
        }
    }

    document.addEventListener('keydown', handleGlobalKey);

    // ── Public API ─────────────────────────────────────────────────────────
    window.FindReplace = { open, close, isOpen };

})();