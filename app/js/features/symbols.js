// ==================== SYMBOLEN INVOEGEN ====================
// Griekse letters, wiskundige tekens, pijlen, valuta en meer.
// Eén toolbar-knop in "Invoegen" opent een doorzoekbare modal met
// categorie-tabs. Klik op een teken om het op de cursor in te voegen.

(function () {
    'use strict';

    // ── Config ──────────────────────────────────────────────────────────────
    const STORAGE_RECENT = 'summie_recent_symbols';
    const MAX_RECENT = 18;

    // ── Symbol data ───────────────────────────────────────────────────────
    // Each entry: { char, name, keywords } — name is shown under the symbol,
    // keywords are used for search (Dutch + English, lowercased).
    const SYMBOL_DATA = {
        greek: [
            { char: 'α', name: 'alfa', keywords: 'alpha alfa klein' },
            { char: 'β', name: 'bèta', keywords: 'beta' },
            { char: 'γ', name: 'gamma', keywords: 'gamma' },
            { char: 'δ', name: 'delta', keywords: 'delta' },
            { char: 'ε', name: 'epsilon', keywords: 'epsilon' },
            { char: 'ζ', name: 'zèta', keywords: 'zeta' },
            { char: 'η', name: 'èta', keywords: 'eta' },
            { char: 'θ', name: 'theta', keywords: 'theta' },
            { char: 'ι', name: 'jota', keywords: 'iota jota' },
            { char: 'κ', name: 'kappa', keywords: 'kappa' },
            { char: 'λ', name: 'lambda', keywords: 'lambda' },
            { char: 'μ', name: 'mu', keywords: 'mu micro' },
            { char: 'ν', name: 'nu', keywords: 'nu' },
            { char: 'ξ', name: 'xi', keywords: 'xi' },
            { char: 'ο', name: 'omicron', keywords: 'omicron' },
            { char: 'π', name: 'pi', keywords: 'pi' },
            { char: 'ρ', name: 'rho', keywords: 'rho' },
            { char: 'σ', name: 'sigma', keywords: 'sigma' },
            { char: 'τ', name: 'tau', keywords: 'tau' },
            { char: 'υ', name: 'upsilon', keywords: 'upsilon' },
            { char: 'φ', name: 'phi', keywords: 'phi' },
            { char: 'χ', name: 'chi', keywords: 'chi' },
            { char: 'ψ', name: 'psi', keywords: 'psi' },
            { char: 'ω', name: 'omega', keywords: 'omega' },
            { char: 'Α', name: 'Alfa', keywords: 'alpha alfa hoofdletter' },
            { char: 'Β', name: 'Bèta', keywords: 'beta hoofdletter' },
            { char: 'Γ', name: 'Gamma', keywords: 'gamma hoofdletter' },
            { char: 'Δ', name: 'Delta', keywords: 'delta hoofdletter' },
            { char: 'Ε', name: 'Epsilon', keywords: 'epsilon hoofdletter' },
            { char: 'Ζ', name: 'Zèta', keywords: 'zeta hoofdletter' },
            { char: 'Η', name: 'Èta', keywords: 'eta hoofdletter' },
            { char: 'Θ', name: 'Theta', keywords: 'theta hoofdletter' },
            { char: 'Ι', name: 'Jota', keywords: 'iota hoofdletter' },
            { char: 'Κ', name: 'Kappa', keywords: 'kappa hoofdletter' },
            { char: 'Λ', name: 'Lambda', keywords: 'lambda hoofdletter' },
            { char: 'Μ', name: 'Mu', keywords: 'mu hoofdletter' },
            { char: 'Ν', name: 'Nu', keywords: 'nu hoofdletter' },
            { char: 'Ξ', name: 'Xi', keywords: 'xi hoofdletter' },
            { char: 'Ο', name: 'Omicron', keywords: 'omicron hoofdletter' },
            { char: 'Π', name: 'Pi', keywords: 'pi hoofdletter' },
            { char: 'Ρ', name: 'Rho', keywords: 'rho hoofdletter' },
            { char: 'Σ', name: 'Sigma', keywords: 'sigma hoofdletter' },
            { char: 'Τ', name: 'Tau', keywords: 'tau hoofdletter' },
            { char: 'Υ', name: 'Upsilon', keywords: 'upsilon hoofdletter' },
            { char: 'Φ', name: 'Phi', keywords: 'phi hoofdletter' },
            { char: 'Χ', name: 'Chi', keywords: 'chi hoofdletter' },
            { char: 'Ψ', name: 'Psi', keywords: 'psi hoofdletter' },
            { char: 'Ω', name: 'Omega', keywords: 'omega hoofdletter ohm' },
        ],
        math: [
            { char: '∞', name: 'oneindig', keywords: 'infinity oneindig oneindigheid' },
            { char: '≠', name: '≠', keywords: 'ongelijk not equal' },
            { char: '≈', name: '≈', keywords: 'ongeveer approximately' },
            { char: '≡', name: '≡', keywords: 'identiek equivalent' },
            { char: '≤', name: '≤', keywords: 'kleiner gelijk less equal' },
            { char: '≥', name: '≥', keywords: 'groter gelijk greater equal' },
            { char: '±', name: '±', keywords: 'plusminus plus minus' },
            { char: '∓', name: '∓', keywords: 'minplus minus plus' },
            { char: '×', name: '×', keywords: 'maal keerteken multiply' },
            { char: '÷', name: '÷', keywords: 'gedeeld delen divide' },
            { char: '·', name: '·', keywords: 'maal punt middot' },
            { char: '√', name: '√', keywords: 'wortel sqrt root' },
            { char: '∛', name: '∛', keywords: 'derdemachtswortel cube root' },
            { char: '∑', name: '∑', keywords: 'som sigma sum' },
            { char: '∏', name: '∏', keywords: 'product pi product' },
            { char: '∫', name: '∫', keywords: 'integraal integral' },
            { char: '∂', name: '∂', keywords: 'partieel partial' },
            { char: '∆', name: '∆', keywords: 'delta increment' },
            { char: '∇', name: '∇', keywords: 'nabla gradient' },
            { char: '∈', name: '∈', keywords: 'element van in' },
            { char: '∉', name: '∉', keywords: 'niet element not in' },
            { char: '⊂', name: '⊂', keywords: 'deelverzameling subset' },
            { char: '⊃', name: '⊃', keywords: 'superset superset' },
            { char: '⊆', name: '⊆', keywords: 'deelverzameling gelijk subset equal' },
            { char: '⊇', name: '⊇', keywords: 'superset gelijk superset equal' },
            { char: '∪', name: '∪', keywords: 'vereniging union' },
            { char: '∩', name: '∩', keywords: 'doorsnede intersect' },
            { char: '∧', name: '∧', keywords: 'en and' },
            { char: '∨', name: '∨', keywords: 'of or' },
            { char: '¬', name: '¬', keywords: 'niet not' },
            { char: '∀', name: '∀', keywords: 'voor alle forall' },
            { char: '∃', name: '∃', keywords: 'er bestaat exists' },
            { char: '∅', name: '∅', keywords: 'lege verzameling empty' },
            { char: '°', name: '°', keywords: 'graad degree' },
            { char: '‰', name: '‰', keywords: 'promille per mille' },
            { char: '½', name: '½', keywords: 'half 1/2 breuk' },
            { char: '¼', name: '¼', keywords: 'kwart 1/4 breuk' },
            { char: '¾', name: '¾', keywords: 'driekwart 3/4 breuk' },
            { char: '⅓', name: '⅓', keywords: 'derde 1/3 breuk' },
            { char: '⅔', name: '⅔', keywords: 'twee derde 2/3 breuk' },
            { char: '¹', name: '¹', keywords: 'superscript 1' },
            { char: '²', name: '²', keywords: 'kwadraat superscript 2' },
            { char: '³', name: '³', keywords: 'kubus superscript 3' },
        ],
        arrows: [
            { char: '→', name: '→', keywords: 'rechts pijl right arrow' },
            { char: '←', name: '←', keywords: 'links pijl left arrow' },
            { char: '↔', name: '↔', keywords: 'heen weer pijl both arrow' },
            { char: '⇒', name: '⇒', keywords: 'implies dubbele pijl' },
            { char: '⇐', name: '⇐', keywords: 'links dubbel arrow' },
            { char: '⇔', name: '⇔', keywords: 'equivalent dubbel arrow' },
            { char: '↑', name: '↑', keywords: 'omhoog up arrow' },
            { char: '↓', name: '↓', keywords: 'omlaag down arrow' },
            { char: '↕', name: '↕', keywords: 'op neer up down arrow' },
            { char: '↖', name: '↖', keywords: 'links boven arrow' },
            { char: '↗', name: '↗', keywords: 'rechts boven arrow' },
            { char: '↘', name: '↘', keywords: 'rechts onder arrow' },
            { char: '↙', name: '↙', keywords: 'links onder arrow' },
            { char: '↵', name: '↵', keywords: 'enter return' },
            { char: '↩', name: '↩', keywords: 'return hook' },
            { char: '↪', name: '↪', keywords: 'hook right' },
        ],
        currency: [
            { char: '€', name: 'euro', keywords: 'euro eur' },
            { char: '£', name: 'pond', keywords: 'pound pond gbp' },
            { char: '$', name: 'dollar', keywords: 'dollar usd' },
            { char: '¥', name: 'yen', keywords: 'yen yuan' },
            { char: '¢', name: 'cent', keywords: 'cent' },
            { char: '₹', name: 'roepie', keywords: 'rupee india' },
            { char: '₽', name: 'roebel', keywords: 'ruble roebel' },
            { char: '₿', name: 'bitcoin', keywords: 'bitcoin btc' },
            { char: '©', name: '©', keywords: 'copyright' },
            { char: '®', name: '®', keywords: 'registered' },
            { char: '™', name: '™', keywords: 'trademark' },
            { char: '§', name: '§', keywords: 'paragraaf section' },
            { char: '¶', name: '¶', keywords: 'alinea pilcrow' },
            { char: '†', name: '†', keywords: 'kruis dagger' },
            { char: '‡', name: '‡', keywords: 'dubbel kruis double dagger' },
        ],
        punct: [
            { char: '•', name: '•', keywords: 'bullet punt' },
            { char: '…', name: '…', keywords: 'ellipsis beletselteken' },
            { char: '–', name: '–', keywords: 'en dash half kastlijntje' },
            { char: '—', name: '—', keywords: 'em dash kastlijntje' },
            { char: '«', name: '«', keywords: 'aanhaling frans guillemet' },
            { char: '»', name: '»', keywords: 'aanhaling frans guillemet' },
            { char: '‘', name: '‘', keywords: 'enkele aanhaling' },
            { char: '’', name: '’', keywords: 'enkele aanhaling apostrof' },
            { char: '“', name: '“', keywords: 'dubbele aanhaling' },
            { char: '”', name: '”', keywords: 'dubbele aanhaling' },
            { char: '‹', name: '‹', keywords: 'enkele guillemet' },
            { char: '›', name: '›', keywords: 'enkele guillemet' },
            { char: '¡', name: '¡', keywords: 'uitroep spaans' },
            { char: '¿', name: '¿', keywords: 'vraag spaans' },
            { char: '·', name: '·', keywords: 'punt midden middle dot' },
            { char: '¸', name: '¸', keywords: 'cedille' },
            { char: '¯', name: '¯', keywords: 'macron' },
            { char: '˘', name: '˘', keywords: 'breve' },
        ],
    };

    const CATEGORY_META = [
        { id: 'recent', label: (typeof SummieI18n !== 'undefined' && SummieI18n.t ? SummieI18n.t('Recent') : 'Recent'), icon: '🕘' },
        { id: 'greek', label: 'Grieks', icon: 'Ω' },
        { id: 'math', label: 'Wiskunde', icon: '∑' },
        { id: 'arrows', label: 'Pijlen', icon: '→' },
        { id: 'currency', label: 'Valuta', icon: '€' },
        { id: 'punct', label: 'Leestekens', icon: '¶' },
    ];

    // ── State ───────────────────────────────────────────────────────────────
    let _savedRange = null;
    let _currentCategory = 'greek';
    let _activeOverlay = null;
    let _searchQuery = '';

    // ── Helpers ─────────────────────────────────────────────────────────────

    function escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function saveRange() {
        const editor = document.getElementById('editor');
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0 && editor && editor.contains(sel.anchorNode)) {
            _savedRange = sel.getRangeAt(0).cloneRange();
            return;
        }
        if (window.topbarManager && window.topbarManager.savedRange) {
            try { _savedRange = window.topbarManager.savedRange.cloneRange(); } catch (_) { /* ignore */ }
        }
    }

    function restoreRange() {
        if (!_savedRange) return false;
        try {
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(_savedRange.cloneRange());
            return true;
        } catch (_) {
            return false;
        }
    }

    function getRecent() {
        try {
            const raw = localStorage.getItem(STORAGE_RECENT);
            if (!raw) return [];
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr : [];
        } catch (_) {
            return [];
        }
    }

    function pushRecent(char) {
        try {
            let arr = getRecent();
            arr = arr.filter(function (c) { return c !== char; });
            arr.unshift(char);
            if (arr.length > MAX_RECENT) arr = arr.slice(0, MAX_RECENT);
            localStorage.setItem(STORAGE_RECENT, JSON.stringify(arr));
        } catch (_) { /* quota / disabled storage — ignore */ }
    }

    function findSymbolMeta(char) {
        for (var cat in SYMBOL_DATA) {
            var list = SYMBOL_DATA[cat];
            for (var i = 0; i < list.length; i++) {
                if (list[i].char === char) return list[i];
            }
        }
        return { char: char, name: char, keywords: char };
    }

    function getAllSymbolsFlat() {
        var all = [];
        var seen = {};
        for (var cat in SYMBOL_DATA) {
            var list = SYMBOL_DATA[cat];
            for (var i = 0; i < list.length; i++) {
                var s = list[i];
                if (!seen[s.char]) { seen[s.char] = true; all.push(s); }
            }
        }
        return all;
    }

    function insertSymbol(char) {
        var editor = document.getElementById('editor');
        if (!editor) return;

        // If the editor is in its placeholder / empty state, ensure we have a
        // real paragraph to type into. The placeholder overlay is purely visual;
        // writing a bare text node directly under #editor would work but breaks
        // the document's block structure and word counting.
        if (window.isEditorEmpty && window.isEditorEmpty()) {
            // Let the editor core create the initial <p> — or do it ourselves if
            // the helper is not yet available (e.g. during early load).
            if (editor.innerHTML.trim() === '' || editor.querySelectorAll('p, div, h1, h2, h3, li').length === 0) {
                editor.innerHTML = '';
                var p = document.createElement('p');
                p.appendChild(document.createElement('br'));
                editor.appendChild(p);
                var r = document.createRange();
                r.setStart(p, 0);
                r.collapse(true);
                var s = window.getSelection();
                s.removeAllRanges();
                s.addRange(r);
                _savedRange = r.cloneRange();
            }
        }

        // Restore the caret that was active before the modal opened.
        var restored = restoreRange();
        var sel = window.getSelection();

        // If we still have no valid range, put the caret at the end.
        if (!restored || !sel || sel.rangeCount === 0 || !editor.contains(sel.anchorNode)) {
            editor.focus();
            var range = document.createRange();
            range.selectNodeContents(editor);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
            _savedRange = range.cloneRange();
        }

        // Prefer execCommand insertText so the insertion is one undo step.
        var inserted = false;
        try {
            inserted = document.execCommand('insertText', false, char);
        } catch (_) { inserted = false; }

        if (!inserted) {
            // Fallback: manual text node insertion.
            var range2 = sel.getRangeAt(0);
            range2.deleteContents();
            var node = document.createTextNode(char);
            range2.insertNode(node);
            range2.setStartAfter(node);
            range2.setEndAfter(node);
            sel.removeAllRanges();
            sel.addRange(range2);
        }

        // Keep the saved range in sync so consecutive inserts land after the last one.
        try {
            sel = window.getSelection();
            if (sel && sel.rangeCount > 0) _savedRange = sel.getRangeAt(0).cloneRange();
        } catch (_) { }

        pushRecent(char);

        window.saveToLocalStorage && window.saveToLocalStorage();
        window.updateUnsavedIndicator && window.updateUnsavedIndicator();
        window.updateWordCounter && window.updateWordCounter();
    }

    // ── Rendering ───────────────────────────────────────────────────────────

    function filterSymbols(query) {
        var q = (query || '').trim().toLowerCase();
        if (!q) return null;
        var all = getAllSymbolsFlat();
        return all.filter(function (s) {
            return s.char.toLowerCase().indexOf(q) !== -1
                || s.name.toLowerCase().indexOf(q) !== -1
                || s.keywords.toLowerCase().indexOf(q) !== -1;
        });
    }

    function renderGrid(container, symbols) {
        container.innerHTML = '';
        if (!symbols || symbols.length === 0) {
            var empty = document.createElement('div');
            empty.className = 'sym-empty';
            if (_searchQuery) {
                empty.innerHTML = '<strong>Geen resultaten</strong>Geen symbolen gevonden voor "' + escHtml(_searchQuery) + '".';
            } else if (_currentCategory === 'recent') {
                empty.innerHTML = '<strong>Nog geen recent gebruikte symbolen</strong>Symbolen die je invoegt verschijnen hier, zodat je ze snel opnieuw kunt gebruiken.';
            } else {
                empty.innerHTML = '<strong>Geen symbolen</strong>';
            }
            container.appendChild(empty);
            return;
        }

        symbols.forEach(function (sym) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'sym-btn';
            btn.setAttribute('data-char', sym.char);
            btn.setAttribute('title', sym.char + ' — ' + sym.name);
            btn.setAttribute('aria-label', 'Voeg ' + sym.name + ' (' + sym.char + ') in');
            btn.innerHTML = '<span class="sym-char">' + escHtml(sym.char) + '</span><span class="sym-name">' + escHtml(sym.name) + '</span>';

            btn.addEventListener('mousedown', function (e) { e.preventDefault(); });

            btn.addEventListener('click', function () {
                var char = sym.char;
                insertSymbol(char);
                pushRecent(char);
                // Update recent tab badge (if visible) without full re-render churn.
                btn.classList.remove('inserted');
                // Trigger reflow then add so animation restarts on rapid clicks.
                void btn.offsetWidth;
                btn.classList.add('inserted');
                setTimeout(function () { btn.classList.remove('inserted'); }, 500);

                // If we are on Recent, re-render so the new symbol jumps to the top.
                // Otherwise keep the current grid so the user can insert multiple.
                if (_currentCategory === 'recent' && !_searchQuery) {
                    // Defer to next frame so the caret restore is not racing the re-render.
                    setTimeout(function () { if (_activeOverlay) refreshGrid(); }, 80);
                } else if (_currentCategory === 'recent') {
                    // Searching on recent — no live update needed.
                }
            });

            container.appendChild(btn);
        });
    }

    function getSymbolsForCurrentCategory() {
        if (_searchQuery) {
            return filterSymbols(_searchQuery);
        }
        if (_currentCategory === 'recent') {
            var recent = getRecent();
            if (recent.length === 0) return [];
            return recent.map(findSymbolMeta);
        }
        return SYMBOL_DATA[_currentCategory] || [];
    }

    function refreshGrid() {
        if (!_activeOverlay) return;
        var grid = _activeOverlay.querySelector('.sym-grid');
        if (!grid) return;
        var symbols = getSymbolsForCurrentCategory();
        renderGrid(grid, symbols);
        var countEl = _activeOverlay.querySelector('#symCount');
        if (countEl) {
            if (_searchQuery) {
                countEl.textContent = symbols.length + ' resultaten';
            } else if (_currentCategory === 'recent') {
                countEl.textContent = symbols.length ? symbols.length + ' recent' : '';
            } else {
                countEl.textContent = symbols.length + ' symbolen';
            }
        }
    }

    function switchCategory(catId) {
        _currentCategory = catId;
        if (!_activeOverlay) return;
        _activeOverlay.querySelectorAll('.sym-tab').forEach(function (b) {
            b.classList.toggle('active', b.dataset.cat === catId);
        });
        refreshGrid();
    }

    // ── Modal ───────────────────────────────────────────────────────────────

    function openModal() {
        if (_activeOverlay) return;
        saveRange();

        var overlay = document.createElement('div');
        overlay.className = 'symbols-modal-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', 'Symbool invoegen');

        // Prefer starting on Recent if the user has history, otherwise Greek.
        var hasRecent = getRecent().length > 0;
        _currentCategory = hasRecent ? 'recent' : 'greek';
        _searchQuery = '';

        overlay.innerHTML =
            '<div class="symbols-modal" role="document">' +
            '  <div class="symbols-modal-header">' +
            '    <h3><span class="sym-header-badge">Ω</span> ' + escHtml((typeof SummieI18n !== 'undefined' && SummieI18n.t ? SummieI18n.t('Symbool invoegen') : 'Symbool invoegen')) + '</h3>' +
            '    <button class="symbols-modal-close" type="button" aria-label="Sluiten">✕</button>' +
            '  </div>' +
            '  <div class="symbols-search-wrap">' +
            '    <span class="sym-search-icon" aria-hidden="true">' +
            '      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20L16 16"/></svg>' +
            '    </span>' +
            '    <input class="sym-search-input" type="text" placeholder="Zoeken — bijv. alfa, pijl, euro, oneindig…" autocomplete="off" spellcheck="false" />' +
            '    <button class="sym-search-clear" type="button" aria-label="Zoeken wissen">✕</button>' +
            '  </div>' +
            '  <div class="sym-tabs" role="tablist"></div>' +
            '  <div class="sym-grid-wrap"><div class="sym-grid"></div></div>' +
            '  <div class="symbols-modal-footer">' +
            '    <span class="sym-footer-hint"><kbd>Esc</kbd> sluiten · klik om in te voegen · <span id="symCount"></span></span>' +
            '    <div class="sym-footer-actions"><button class="btn" data-action="close">Sluiten</button></div>' +
            '  </div>' +
            '</div>';

        document.body.appendChild(overlay);
        _activeOverlay = overlay;

        // Build tabs
        var tabsContainer = overlay.querySelector('.sym-tabs');
        CATEGORY_META.forEach(function (meta) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'sym-tab' + (meta.id === _currentCategory ? ' active' : '');
            btn.dataset.cat = meta.id;
            btn.setAttribute('role', 'tab');
            btn.setAttribute('aria-selected', meta.id === _currentCategory ? 'true' : 'false');
            btn.innerHTML = '<span class="sym-tab-icon">' + escHtml(meta.icon) + '</span> ' + escHtml(meta.label);
            btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
            btn.addEventListener('click', function () {
                _searchQuery = '';
                var inp = overlay.querySelector('.sym-search-input');
                if (inp) inp.value = '';
                updateClearButton();
                // Update aria
                overlay.querySelectorAll('.sym-tab').forEach(function (b) { b.setAttribute('aria-selected', 'false'); });
                btn.setAttribute('aria-selected', 'true');
                switchCategory(meta.id);
            });
            tabsContainer.appendChild(btn);
        });

        var searchInput = overlay.querySelector('.sym-search-input');
        var clearBtn = overlay.querySelector('.sym-search-clear');

        function updateClearButton() {
            if (searchInput.value) clearBtn.classList.add('visible');
            else clearBtn.classList.remove('visible');
        }

        searchInput.addEventListener('input', function () {
            _searchQuery = searchInput.value;
            updateClearButton();
            refreshGrid();
        });

        clearBtn.addEventListener('mousedown', function (e) { e.preventDefault(); });
        clearBtn.addEventListener('click', function () {
            searchInput.value = '';
            _searchQuery = '';
            updateClearButton();
            searchInput.focus();
            refreshGrid();
        });

        function close() {
            if (!_activeOverlay) return;
            document.removeEventListener('keydown', onKeyDown);
            _activeOverlay.remove();
            _activeOverlay = null;
            // Restore caret so typing continues where the symbol was inserted.
            restoreRange();
            var editor = document.getElementById('editor');
            if (editor) editor.focus();
        }

        function onKeyDown(e) {
            if (e.key === 'Escape') {
                e.stopPropagation();
                close();
            }
        }
        document.addEventListener('keydown', onKeyDown);

        overlay.querySelector('.symbols-modal-close').addEventListener('click', close);
        overlay.querySelector('[data-action="close"]').addEventListener('click', close);
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) close();
        });

        refreshGrid();
        // Focus search for quick filtering; keep caret saved separately.
        setTimeout(function () { searchInput.focus(); }, 60);

        // Expose close for outside callers
        overlay._close = close;
    }

    function closeModal() {
        if (_activeOverlay && _activeOverlay._close) _activeOverlay._close();
    }

    // ── Toolbar wiring ─────────────────────────────────────────────────────

    function initToolbar() {
        var btn = document.getElementById('insertSymbolBtn');
        if (!btn) return;

        // Save caret before the button steals focus; open on click.
        btn.addEventListener('mousedown', function (e) {
            e.preventDefault();
            saveRange();
        });
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            openModal();
        });
    }

    function init() {
        initToolbar();
    }

    // ── Public API ─────────────────────────────────────────────────────────
    window.SymbolModule = {
        init: init,
        open: openModal,
        close: closeModal,
        insert: insertSymbol,
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // DOM already parsed (script at end of body) — wire immediately.
        setTimeout(init, 50);
    }
})();
