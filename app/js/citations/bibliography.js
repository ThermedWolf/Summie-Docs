// ==================== BIBLIOGRAPHY (BRONNEN) ====================
// Automatically fetches publication metadata from the internet (DOI, title
// search, or URL) and formats it professionally as an APA 7 or Vancouver reference.
//
// The fetched metadata comes from the main process IPC channel
// 'citation-lookup' (see main.js), which talks to Crossref and parses page
// metadata. This module:
//   - formats neutral citation objects into reference entries (APA 7 or Vancouver)
//   - inserts a formatted reference at the cursor
//   - manages the document's citation list (Bronnen sidebar tab)
//   - can render a complete reference list ("Bronnenlijst") in the document
//
// Citation objects are plain data and are persisted in the .sumd file under
// `citations` so they survive save/load and undo/redo.

(function () {
    'use strict';

    // ── Small helpers ────────────────────────────────────────────────────
    // The APA 7 formatter lives in apa-format.js (window.ApaFormat).
    // The Vancouver formatter lives in vancouver-format.js (window.VancouverFormat).

    function e(str) {
        return window.escapeHtml ? window.escapeHtml(str === null || str === undefined ? '' : str) : String(str);
    }

    function clean(str) {
        return String(str === null || str === undefined ? '' : str).trim();
    }

    // ── Duplicate detection helpers ──────────────────────────────────────
    // A re-used source must keep its original Vancouver number, so adding a
    // citation that matches an earlier entry resolves to that entry instead
    // of appending a second one (which would get its own number).

    function normalizeDoi(doi) {
        return clean(doi).toLowerCase()
            .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
            .replace(/^doi:\s*/i, '');
    }

    function normalizeUrl(url) {
        return clean(url).toLowerCase()
            .replace(/^https?:\/\//i, '')
            .replace(/\/+$/, '');
    }

    // Current citation style: 'apa' or 'vancouver'
    var _citationStyle = 'apa';

    // Vancouver in-text notation (only relevant when style = vancouver):
    // 'brackets' [1] | 'parentheses' (1) | 'superscript' ¹
    // Chosen once per document; every in-text citation follows it.
    var _vancouverInTextStyle = 'brackets';

    // Last used citation lookup mode (per document): 'url' | 'doi' | 'title'
    // Remembered until the user picks a different mode.
    var _citationSearchMode = 'url';

    // Author delimiter for the "Auteurs" input field.
    // APA authors are stored as "Achternaam, Voorletters" (contain a comma), so
    // the separator between authors MUST NOT be a comma. Official APA reference
    // lists separate authors with ", " and " & ", but for INPUT the de-facto
    // standard in reference managers is ";" (or newline). The user can choose
    // in Settings; we also tolereer pipe and newline regardless of preference.
    var _citationAuthorDelimiter = 'semicolon'; // 'semicolon' | 'newline'

    // Edit mode state: when the modal is used to edit an existing source
    var _editingId = null;
    var _editMode = false;

    function getAuthorDelimiter() { return _citationAuthorDelimiter; }
    function setAuthorDelimiter(v) {
        if (v === 'newline' || v === 'semicolon') _citationAuthorDelimiter = v;
    }
    function joinAuthorsForInput(authors) {
        if (!authors || !authors.length) return '';
        if (_citationAuthorDelimiter === 'newline') return authors.join('\n');
        return authors.join('; ');
    }
    function parseAuthorsFromInput(raw) {
        if (!raw || !String(raw).trim()) return [];
        var s = String(raw);
        // Robust: always split on semicolon, pipe, or newline regardless of preference
        // This makes copy-paste tolerant even if the user switches the setting.
        var parts = s.split(/[;\n|]+/).map(function (p) { return p.trim(); }).filter(Boolean);
        // If no delimiter was found, try to detect an APA-style list that was pasted
        // with ", & " without semicolons — e.g. "Keten, A., Jansen, B. & Pieterse, C."
        // We only do this fallback when a single part still contains ", & " or " & ".
        if (parts.length === 1 && parts[0].indexOf(',') !== -1) {
            var single = parts[0];
            // Heuristic: contains " & " or " en " between two author-like segments
            // Example: "Keten, A. & Jansen, B." → split on " & " / " en "
            var ampSplit = single.split(/\s+(?:&|en)\s+/);
            if (ampSplit.length > 1 && ampSplit.every(function (p) { return p.indexOf(',') !== -1; })) {
                // Further split left part on ", " that separates authors: look for "., "
                // e.g. "Keten, A., Jansen, B." — split on ", " that is followed by "X, "
                // Use pattern: period-comma-space before next surname
                var expanded = [];
                ampSplit.forEach(function (chunk) {
                    // Split on ", " where next char starts a surname (capital) and chunk contains "., "
                    if (chunk.indexOf('.,') !== -1) {
                        var sub = chunk.split(/,\s+(?=[A-Z][a-z]*,\s)/);
                        // fallback: split on "., " if previous didn't hit
                        if (sub.length === 1) sub = chunk.split(/\.\s*,\s*/).map(function (p, i, a) {
                            return i < a.length - 1 ? p + '.' : p;
                        });
                        sub.forEach(function (p) { if (p.trim()) expanded.push(p.trim().replace(/^,\s*/, '')); });
                    } else {
                        expanded.push(chunk.trim());
                    }
                });
                if (expanded.length > 1) return expanded;
            }
        }
        return parts;
    }

    function getCitationStyle() {
        return _citationStyle;
    }

    function setCitationStyle(style) {
        if (style === 'apa' || style === 'vancouver') {
            _citationStyle = style;
        }
    }

    function getCitationSearchMode() {
        return _citationSearchMode;
    }

    function setCitationSearchMode(mode) {
        if (mode === 'url' || mode === 'doi' || mode === 'title') {
            _citationSearchMode = mode;
            // Keep the modal's working variable in sync when the modal exists
            currentMode = mode;
            if (typeof modeSelect !== 'undefined' && modeSelect) modeSelect.value = mode;
            return true;
        }
        return false;
    }

    function _persistSearchMode() {
        window.saveToLocalStorage && window.saveToLocalStorage();
        window.updateUnsavedIndicator && window.updateUnsavedIndicator();
        if (window.UndoManager && window.UndoManager.notifyExternalChange) window.UndoManager.notifyExternalChange();
    }

    function getVancouverInTextStyle() {
        return _vancouverInTextStyle;
    }

    function setVancouverInTextStyle(style) {
        return window.VancouverFormat && window.VancouverFormat.setInTextStyle(style)
            ? (_vancouverInTextStyle = style, true)
            : false;
    }

    // Get the appropriate formatter for current style
    function getFormatter() {
        if (_citationStyle === 'vancouver') {
            return window.VancouverFormat;
        }
        return window.ApaFormat;
    }

    // Format a reference entry for the bibliography/reference list
    function formatReference(c, index) {
        var formatter = getFormatter();
        if (_citationStyle === 'vancouver') {
            return formatter.formatVancouver(c, index);
        }
        return formatter.formatAPA(c);
    }

    // Format in-text citation. Output is always HTML-safe: the Vancouver
    // notation is generated internally ([1] / (1) / <sup>1</sup>), while the
    // APA form embeds user-editable fields (authors/title) and is escaped here.
    function formatInText(c, index) {
        var formatter = getFormatter();
        if (_citationStyle === 'vancouver') {
            return formatter.inText(c, index);
        }
        return e(formatter.inText(c));
    }

    // Sort key for APA (alphabetical by author)
    function sortKeyAPA(c) {
        return window.ApaFormat.sortKey(c);
    }

    // For Vancouver, sort by citation order (which is the order in the citations array)
    function sortKeyVancouver(c, index) {
        return index;
    }

    function sortKey(c, index) {
        if (_citationStyle === 'vancouver') {
            return sortKeyVancouver(c, index);
        }
        return sortKeyAPA(c);
    }

    // ── Ordering helpers ─────────────────────────────────────────────────
    // Sidebar: insertion order (citations array). Document bibliography:
    // order of first appearance in the text (first occurrence of
    // .summie-citation or .summie-citation-inline). Bibliography block
    // contains only cited sources; uncited sources are omitted until cited.

    function getOrderedCitationIds() {
        var roots = [];
        if (window.PageManager && window.PageManager.isPaginationEnabled && window.PageManager.isPaginationEnabled() && window.PageManager.getAllPages) {
            try { roots = window.PageManager.getAllPages(); } catch (e) { roots = []; }
        }
        if (!roots || !roots.length) {
            var ed = (window.AppState && window.AppState.editor) || document.getElementById('editor');
            if (ed) roots = [ed];
        }
        var seen = {};
        var order = [];
        roots.forEach(function (root) {
            if (!root || !root.querySelectorAll) return;
            var nodes = root.querySelectorAll('.summie-citation[data-citation-id], .summie-citation-inline[data-citation-id]');
            nodes.forEach(function (el) {
                if (el.closest && el.closest('.summie-bibliography')) return;
                var id = el.getAttribute('data-citation-id');
                if (!id || seen[id]) return;
                seen[id] = true;
                order.push(id);
            });
        });
        return order;
    }

    function getCitationIndexMap() {
        var order = getOrderedCitationIds();
        var map = {};
        order.forEach(function (id, i) { map[id] = i + 1; });
        return map;
    }

    function getSortedCitationsForBibliography(citations) {
        var order = getOrderedCitationIds();
        var byId = {};
        (citations || []).forEach(function (c) { if (c && c.id) byId[c.id] = c; });
        var sorted = [];
        order.forEach(function (id) { if (byId[id]) sorted.push(byId[id]); });
        return sorted;
    }

    function getCitationNumber(c, indexMap) {
        if (!c || !c.id) return '—';
        if (indexMap && indexMap[c.id]) return indexMap[c.id];
        return '—';
    }

    var sentenceCase = function (str) { return window.ApaFormat.sentenceCase(str); };

    // ── Live renumbering (Vancouver) ─────────────────────────────────────
    // Vancouver requires the first citation in document order to be [1],
    // the next distinct source [2], etc. Inserting, moving, deleting or
    // pasting a citation above an existing one must therefore renumber every
    // in-text occurrence, every full `.summie-citation` paragraph and the
    // bibliography block, without waiting for the next explicit add/remove.

    var _renumberTimer = null;
    var _isRenumbering = false;
    var _lastOrderedKey = '';
    var _citationObserver = null;

    function _orderedKey() {
        try { return getOrderedCitationIds().join('|'); } catch (e2) { return ''; }
    }

    // Immediate, synchronous renumber — guarded against re-entrance so the
    // DOM writes inside _updateInlineCitationSpans do not re-trigger the
    // observer synchronously.
    function forceRenumberIfOrderChanged() {
        if (_isRenumbering) return false;
        var key = _orderedKey();
        // Also renumber when the key is empty but citations exist but are
        // uncited (shows "—" in sidebar) — don't skip that state.
        if (key === _lastOrderedKey && key !== '') return false;
        _lastOrderedKey = key;
        if (!window.Bibliography || !window.Bibliography.citations) return false;
        _isRenumbering = true;
        try {
            window.Bibliography._updateInlineCitationSpans();
            window.Bibliography.renderBibliographyBlock();
            window.Bibliography._updatePanelIfOpen();
        } finally {
            _isRenumbering = false;
        }
        return true;
    }

    function scheduleRenumber(delay) {
        if (_isRenumbering) return;
        clearTimeout(_renumberTimer);
        _renumberTimer = setTimeout(function () {
            forceRenumberIfOrderChanged();
        }, typeof delay === 'number' ? delay : 200);
    }

    function setupCitationObserver() {
        if (_citationObserver) return;
        var container = document.getElementById('pagesContainer')
            || (window.AppState && window.AppState.editor)
            || document.getElementById('editor');
        if (!container) return;

        _lastOrderedKey = _orderedKey();

        _citationObserver = new MutationObserver(function (mutations) {
            if (_isRenumbering) return;
            var relevant = false;
            for (var i = 0; i < mutations.length; i++) {
                var m = mutations[i];
                if (m.type === 'childList' && (m.addedNodes.length || m.removedNodes.length)) { relevant = true; break; }
                if (m.type === 'characterData') { relevant = true; break; }
                if (m.type === 'attributes' && m.attributeName === 'data-citation-id') { relevant = true; break; }
            }
            if (!relevant) return;
            // Debounce — bulk DOM operations (paste, pagination reflow,
            // undo/redo) fire dozens of mutations in one frame.
            scheduleRenumber(180);
        });

        _citationObserver.observe(container, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['data-citation-id']
        });

        // Complementary listeners for user actions that may not mutate the
        // observed container immediately (e.g. drag-drop between pages).
        ['input', 'paste', 'cut', 'drop'].forEach(function (evt) {
            container.addEventListener(evt, function () { scheduleRenumber(220); });
        });
        // Pagination reflow moves nodes between pages without a user
        // input event — also schedule a check after reflow.
        document.addEventListener('paste', function () { scheduleRenumber(350); });
    }

    // Public debounced refresh — also used by editor load and undo paths.
    function refreshCitationNumbers() {
        scheduleRenumber(80);
    }

    // ── Manager ──────────────────────────────────────────────────────────

    window.Bibliography = {
        citations: [],
        _initialized: false,
        citationStyle: 'apa', // public property for UI

        init: function () {
            if (this._initialized) return;
            this._initialized = true;

            // Load preferred author delimiter from app settings (if available)
            if (window.electron && window.electron.settingsGet) {
                window.electron.settingsGet().then(function (s) {
                    if (s && (s.citationAuthorDelimiter === 'newline' || s.citationAuthorDelimiter === 'semicolon')) {
                        setAuthorDelimiter(s.citationAuthorDelimiter);
                    }
                }).catch(function () { });
                // Listen for live changes from Settings window
                if (window.electron.onSettingsChanged) {
                    window.electron.onSettingsChanged(function (patch) {
                        if (patch && patch.citationAuthorDelimiter) setAuthorDelimiter(patch.citationAuthorDelimiter);
                    });
                }
            }

            var toolbarBtn = document.getElementById('insertCitationBtn');
            if (toolbarBtn) toolbarBtn.addEventListener('click', function () { openCitationModal(); });

            var addBtn = document.getElementById('addCitationBtn');
            if (addBtn) addBtn.addEventListener('click', function () { openCitationModal(); });

            var bibBtn = document.getElementById('insertBibliographyBtn');
            if (bibBtn) bibBtn.addEventListener('click', function () { Bibliography.insertBibliographyAtEnd(); });

            var tab = document.querySelector('.tab[data-tab="bronnen"]');
            if (tab) tab.addEventListener('click', function () {
                Bibliography.renderList(document.getElementById('bronnenList'));
            });

            // Sidebar citation style selector
            var sidebarStyleSelect = document.getElementById('citationStyleSelectSidebar');
            if (sidebarStyleSelect) {
                sidebarStyleSelect.value = _citationStyle;
                sidebarStyleSelect.addEventListener('change', function () {
                    var newStyle = sidebarStyleSelect.value;
                    Bibliography.setCitationStyle(newStyle);
                    // Also update modal selector if open
                    var modalStyleSelect = document.getElementById('citationStyleSelect');
                    if (modalStyleSelect) modalStyleSelect.value = newStyle;
                });
            }

            // Sidebar Vancouver in-text notation selector ([1] / (1) / ¹)
            var sidebarInTextSelect = document.getElementById('vancouverInTextStyleSelectSidebar');
            if (sidebarInTextSelect) {
                sidebarInTextSelect.addEventListener('change', function () {
                    Bibliography.setVancouverInTextStyle(sidebarInTextSelect.value);
                });
            }
            this._syncInTextStyleSelectors();

            // Directe Bewerkbaarheid: de bronnenlijst + losse verwijzingen in het
            // document zijn klik-bewerkbaar. Dubbelklik op een losse verwijzing
            // (APA of Vancouver) opent dezelfde 'Bron bewerken' modal als de lijst.
            var selfInit = this;
            document.addEventListener('dblclick', function (ev) {
                var el = ev.target.closest('.summie-citation, .summie-citation-inline');
                if (!el) return;
                if (el.closest && el.closest('.summie-bibliography')) return; // bibliography items have own click
                var id = el.getAttribute('data-citation-id');
                if (!id) return;
                ev.preventDefault();
                selfInit.editCitation(id);
            });

            // Restore after a document has been loaded (applyLoadedData runs too
            // early for module initialisation, so the restore call above in
            // applyLoadedData sets the array; re-render any bibliography block).
            setTimeout(function () {
                _lastOrderedKey = _orderedKey();
                Bibliography._updateInlineCitationSpans();
                Bibliography.renderBibliographyBlock();
                Bibliography._updatePanelIfOpen();
            }, 600);

            // Live Vancouver renumbering: watch the document for moves/
            // inserts/deletes of citations so the first occurrence is always [1].
            try { setupCitationObserver(); } catch (e3) { /* observer optional */ }
            // If pagination was not ready yet, retry once the pages exist.
            setTimeout(function () { try { setupCitationObserver(); } catch (e4) {} }, 1500);
        },

        genId: function () {
            return 'cit-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 10000);
        },

        getSerialised: function () {
            return this.citations.map(function (c) {
                return {
                    id: c.id,
                    sourceType: c.sourceType || 'doi',
                    source: c.source || '',
                    crossrefType: c.crossrefType || '',
                    title: c.title || '',
                    authors: (c.authors || []).slice(),
                    editors: (c.editors || []).slice(),
                    year: c.year || '',
                    publishedDate: c.publishedDate || null,
                    journal: c.journal || '',
                    volume: c.volume || '',
                    issue: c.issue || '',
                    pages: c.pages || '',
                    articleNumber: c.articleNumber || '',
                    publisher: c.publisher || '',
                    doi: c.doi || '',
                    url: c.url || '',
                    website: c.website || '',
                    issn: c.issn || '',
                    accessedDate: c.accessedDate || null
                };
            });
        },

        setCitations: function (list) {
            this.citations = (Array.isArray(list) ? list : []).map(function (c) {
                return {
                    id: c && c.id ? c.id : 'cit-' + Math.random().toString(36).slice(2),
                    sourceType: (c && c.sourceType) || 'doi',
                    source: (c && c.source) || '',
                    crossrefType: (c && c.crossrefType) || '',
                    title: (c && c.title) || '',
                    authors: (c && Array.isArray(c.authors)) ? c.authors.slice() : [],
                    editors: (c && Array.isArray(c.editors)) ? c.editors.slice() : [],
                    year: (c && c.year) || '',
                    publishedDate: (c && c.publishedDate) || null,
                    journal: (c && c.journal) || '',
                    volume: (c && c.volume) || '',
                    issue: (c && c.issue) || '',
                    pages: (c && c.pages) || '',
                    articleNumber: (c && c.articleNumber) || '',
                    publisher: (c && c.publisher) || '',
                    doi: (c && c.doi) || '',
                    url: (c && c.url) || '',
                    website: (c && c.website) || '',
                    issn: (c && c.issn) || '',
                    accessedDate: (c && c.accessedDate) || null
                };
            });
        },

        // Find an existing citation that is the same source as `c`:
        // 1. same DOI (normalised), else
        // 2. same URL (also compared against the raw lookup source for
        //    url-type entries), else
        // 3. same title + year — only for entries without DOI/URL (manual).
        // Returns the earlier citation or null.
        findDuplicate: function (c) {
            if (!c) return null;
            var doi = normalizeDoi(c.doi);
            var urls = [];
            var u = normalizeUrl(c.url);
            if (u) urls.push(u);
            if (c.sourceType === 'url') {
                u = normalizeUrl(c.source);
                if (u && urls.indexOf(u) === -1) urls.push(u);
            }
            var title = clean(c.title).toLowerCase();
            var year = clean(c.year);

            for (var i = 0; i < this.citations.length; i++) {
                var x = this.citations[i];
                if (doi && normalizeDoi(x.doi) === doi) return x;
                if (urls.length) {
                    var xUrls = [normalizeUrl(x.url)];
                    if (x.sourceType === 'url') xUrls.push(normalizeUrl(x.source));
                    for (var j = 0; j < urls.length; j++) {
                        if (xUrls.indexOf(urls[j]) !== -1) return x;
                    }
                }
                if (!doi && !urls.length && title &&
                    clean(x.title).toLowerCase() === title &&
                    clean(x.year) === year) {
                    return x;
                }
            }
            return null;
        },

        addCitation: function (c, opts) {
            opts = opts || {};
            // Re-adding a source that already exists keeps its original
            // number: resolve to the earlier entry instead of appending.
            var existing = this.findDuplicate(c);
            if (existing) {
                if (opts.insert) this.insertReferenceAtCursor(existing);
                else if (opts.inline) this.insertInTextAtCursor(existing);
                else this._afterChange();
                window.showNotification && window.showNotification(
                    SummieI18n.t('Bron bestaat al'),
                    SummieI18n.t(opts.inline
                        ? 'Deze bron staat al in de lijst; het bestaande nummer is op de cursor geplaatst.'
                        : 'Deze bron staat al in de lijst; het bestaande nummer wordt opnieuw gebruikt.'),
                    'info'
                );
                return existing;
            }
            if (!c.id) c.id = this.genId();
            this.citations.push(c);

            // De bronnenlijst in het document direct bijwerken:
            // - bij in-tekst of volledige verwijzing delegeert de insert-methode
            //   zelf naar _afterChange (zodat de volgorde in het document klopt)
            // - zonder insert (alleen aan de lijst toegevoegd) direct verversen
            if (opts.insert) this.insertReferenceAtCursor(c);
            else if (opts.inline) this.insertInTextAtCursor(c);
            else this._afterChange();

            window.showNotification && window.showNotification(
                SummieI18n.t('Bron toegevoegd'),
                opts.insert
                    ? SummieI18n.t('De verwijzing is aan het document toegevoegd.')
                    : SummieI18n.t(opts.inline
                        ? 'De bron is toegevoegd; de verwijzing is op de cursor geplaatst.'
                        : 'De bron is aan de lijst toegevoegd.'),
                'success'
            );
            return c;
        },

        removeCitation: function (id) {
            var self = this;
            window.SummieDialogs && window.SummieDialogs.confirm(SummieI18n.t('Deze bron uit het document verwijderen?'), {
                title: SummieI18n.t('Bron verwijderen'),
                confirmText: SummieI18n.t('Verwijderen'),
                cancelText: SummieI18n.t('Annuleren'),
                danger: true
            }).then(function (ok) {
                if (!ok) return;
                self.citations = self.citations.filter(function (c) { return c.id !== id; });
                // Also drop any inserted entries for that id (full reference
                // paragraphs and inline citations).
                var editor = window.AppState && window.AppState.editor;
                if (editor && typeof id === 'string') {
                    editor.querySelectorAll('.summie-citation, .summie-citation-inline').forEach(function (el) {
                        if (el.getAttribute('data-citation-id') === id) el.remove();
                    });
                }
                self._afterChange();
                window.showNotification && window.showNotification(SummieI18n.t('Bron verwijderd'), SummieI18n.t('De bron is verwijderd.'), 'success');
            });
        },

        _afterChange: function () {
            window.saveToLocalStorage && window.saveToLocalStorage();
            window.updateUnsavedIndicator && window.updateUnsavedIndicator();
            if (window.UndoManager && window.UndoManager.notifyExternalChange) window.UndoManager.notifyExternalChange();
            _isRenumbering = true;
            try {
                this._updateInlineCitationSpans();
                this.renderBibliographyBlock();
                this._updatePanelIfOpen();
            } finally {
                _isRenumbering = false;
            }
            try { _lastOrderedKey = _orderedKey(); } catch (e5) {}
        },

        // Insert a full reference entry (hanging-indent paragraph) at the cursor.
        insertReferenceAtCursor: function (c) {
            // Vancouver number = occurrence position; use current map as
            // best estimate before DOM mutation — _afterChange will correct it.
            var map = getCitationIndexMap();
            var existing = map[c.id];
            var index = existing || (getOrderedCitationIds().length + 1);
            // For a brand-new citation not yet in the DOM, estimate its
            // position as last+1; the subsequent _updateInlineCitationSpans
            // will fix all numbers to true occurrence order.
            if (!existing) {
                // If citation already cited elsewhere, reuse its number
                // otherwise it will be the next number in occurrence order
                var alreadyCited = getOrderedCitationIds().indexOf(c.id) !== -1;
                if (!alreadyCited) index = getOrderedCitationIds().length + 1;
            }
            var html = '<p class="summie-citation" data-citation-id="' + e(c.id) + '">' + formatReference(c, index) + '</p>';
            if (!this._insertHtmlAtCursor(html)) {
                var p = document.createElement('p');
                p.className = 'summie-citation';
                if (c.id) p.setAttribute('data-citation-id', c.id);
                p.innerHTML = formatReference(c, index);
                this._appendToEditor(p);
            }
            this._afterChange();
        },

        // Insert an in-text citation at the cursor. It is wrapped in a span
        // tagged with data-citation-id so that changing the style or notation
        // can re-render every inline citation document-wide (see
        // _updateInlineCitationSpans). formatInText output is internally
        // generated (digits/delimiters only), so no escaping is needed there.
        insertInTextAtCursor: function (c) {
            var map = getCitationIndexMap();
            var existing = map[c.id];
            var index = existing || (getOrderedCitationIds().length + 1);
            var html = '<span class="summie-citation-inline" data-citation-id="' + e(c.id) + '">' + formatInText(c, index) + '</span>';
            if (!this._insertHtmlAtCursor(html)) {
                var p = document.createElement('p');
                var span = document.createElement('span');
                span.className = 'summie-citation-inline';
                if (c.id) span.setAttribute('data-citation-id', c.id);
                span.innerHTML = formatInText(c, index);
                p.appendChild(span);
                this._appendToEditor(p);
            }
            this._afterChange();
        },

        // Use the native contenteditable insertHTML so a block-level reminder is
        // split into its own paragraph (raw insertNode would nest <p> inside <p>).
        _insertHtmlAtCursor: function (html) {
            var editor = window.AppState && window.AppState.editor;
            if (!editor) return false;
            // If the modal moved focus away, restore the caret that was saved
            // when the modal opened so the insert lands at the original cursor.
            if (window.SummieSelection) window.SummieSelection.restore({ force: true });
            editor.focus({ preventScroll: true });
            var sel = window.getSelection();
            if (!sel || !sel.rangeCount) return false;
            if (!editor.contains(sel.anchorNode)) {
                if (window.SummieSelection && window.SummieSelection.savedRange) {
                    window.SummieSelection.restore({ force: true });
                    sel = window.getSelection();
                    if (!sel || !sel.rangeCount || !editor.contains(sel.anchorNode)) return false;
                } else {
                    return false;
                }
            }
            document.execCommand('insertHTML', false, html);
            return true;
        },

        _appendToEditor: function (node) {
            var editor = window.AppState && window.AppState.editor;
            if (!editor) return;
            var target = editor;
            if (window.PageManager && window.PageManager.isPaginationEnabled && window.PageManager.isPaginationEnabled()) {
                var pages = window.PageManager.getAllPages ? window.PageManager.getAllPages() : [];
                if (pages.length) target = pages[pages.length - 1];
            }
            var isText = node.nodeType === 3;
            var isInline = node.nodeType === 1 &&
                !/^(DIV|P|TABLE|UL|OL|H[1-6]|BLOCKQUOTE)$/i.test(node.tagName);
            if (isText || isInline) {
                var p = document.createElement('p');
                p.appendChild(node);
                node = p;
            }
            target.appendChild(node);
        },

        // ── Reference list block in the document ───────────────────────────

        insertBibliographyAtEnd: function () {
            var editor = window.AppState && window.AppState.editor;
            if (!editor) return;

            var block = editor.querySelector('.summie-bibliography');
            if (block) {
                this.renderBibliographyBlock();
                block.scrollIntoView({ behavior: 'smooth', block: 'center' });
                window.showNotification && window.showNotification(SummieI18n.t('Bronnenlijst'), SummieI18n.t('De bronnenlijst is bijgewerkt.'), 'success');
                return;
            }

            block = document.createElement('div');
            block.className = 'summie-bibliography';
            block.setAttribute('data-bib', '1');
            block.contentEditable = 'false';
            block.innerHTML =
                '<div class="summie-bib-heading" contenteditable="true" data-bib-heading="1">' + e(SummieI18n.t('Bronnen')) + '</div>' +
                '<div class="summie-bib-items"></div>';

            this._appendToEditor(block);
            this.renderBibliographyBlock();
            block.scrollIntoView({ behavior: 'smooth', block: 'center' });
            window.showNotification && window.showNotification(SummieI18n.t('Bronnenlijst'), SummieI18n.t('De bronnenlijst is ingevoegd.'), 'success');
        },

        renderBibliographyBlock: function () {
            var editor = window.AppState && window.AppState.editor;
            if (!editor) return;
            var block = editor.querySelector('.summie-bibliography');
            if (!block) return;
            // Make the heading freely editable — user can rename "Bronnen" to anything
            var heading = block.querySelector('.summie-bib-heading');
            if (heading) {
                heading.contentEditable = 'true';
                heading.setAttribute('data-bib-heading', '1');
                // Plain-text only: block paste of rich HTML, keep it simple
                if (!heading._bibHeadingHandlers) {
                    heading._bibHeadingHandlers = true;
                    heading.addEventListener('keydown', function (ev) {
                        // Enter should not create a new block inside the bibliography wrapper
                        if (ev.key === 'Enter') { ev.preventDefault(); heading.blur(); }
                    });
                    heading.addEventListener('paste', function (ev) {
                        ev.preventDefault();
                        var text = (ev.clipboardData || window.clipboardData).getData('text/plain');
                        document.execCommand('insertText', false, text);
                    });
                    // Don't let empty heading stay empty — restore placeholder on blur
                    heading.addEventListener('blur', function () {
                        if (!heading.textContent.trim()) heading.textContent = SummieI18n.t('Bronnen');
                    });
                }
            }
            var itemsEl = block.querySelector('.summie-bib-items');
            if (!itemsEl) return;
            itemsEl.innerHTML = '';

            // Bibliography: order of first appearance in the text.
            // Only cited sources are shown; uncited stay in sidebar only.
            var sorted = getSortedCitationsForBibliography(this.citations);

            if (sorted.length === 0) {
                itemsEl.innerHTML = '<div class="summie-bib-empty">' + e(SummieI18n.t('Nog geen bronnen toegevoegd.')) + '</div>';
                return;
            }
            var self = this;
            sorted.forEach(function (c, idx) {
                var item = document.createElement('div');
                item.className = 'summie-bib-item';
                if (c.id) item.setAttribute('data-citation-id', c.id);
                // Vancouver number = occurrence position (idx+1).
                // APA keeps author-year but index is still passed for consistency
                var index = idx + 1;
                // Content wrapper + hover actions — clicking the entry edits it
                var content = document.createElement('div');
                content.className = 'summie-bib-item-content';
                content.innerHTML = formatReference(c, index);
                content.title = SummieI18n.t('Klik om te bewerken');
                content.addEventListener('click', function (ev) {
                    // Prevent triggering when a button was clicked
                    if (ev.target.closest('button')) return;
                    self.editCitation(c.id);
                });
                var actions = document.createElement('div');
                actions.className = 'summie-bib-item-actions';
                actions.innerHTML =
                    '<button class="summie-bib-btn" data-act="edit" title="' + e(SummieI18n.t('Bewerken')) + '">' +
                    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>' +
                    '<button class="summie-bib-btn summie-bib-btn-danger" data-act="delete" title="' + e(SummieI18n.t('Verwijderen')) + '">' +
                    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>';
                actions.addEventListener('click', function (ev) {
                    var btn = ev.target.closest('button');
                    if (!btn) return;
                    ev.stopPropagation();
                    if (btn.dataset.act === 'edit') self.editCitation(c.id);
                    else if (btn.dataset.act === 'delete') self.removeCitation(c.id);
                });
                item.appendChild(content);
                item.appendChild(actions);
                itemsEl.appendChild(item);
            }, this);
        },

        // ── Sidebar panel ───────────────────────────────────────────────────

        renderList: function (container) {
            if (!container) return;
            container.innerHTML = '';
            if (this.citations.length === 0) {
                container.innerHTML = '<p class="empty-state">' + e(SummieI18n.t('Nog geen bronnen toegevoegd.')) + '</p>';
                return;
            }
            var self = this;
            // Sidebar: always insertion order (oldest top, newest bottom).
            // Vancouver numbers reflect document occurrence order; uncited show "—".
            var indexMap = getCitationIndexMap();
            var sorted = this.citations.slice();
            sorted.forEach(function (c, idx) {
                var item = document.createElement('div');
                item.className = 'bron-item';
                var index = getCitationNumber(c, indexMap);
                item.innerHTML =
                    '<div class="bron-item-text" title="' + e(SummieI18n.t('Klik om te bewerken')) + '">' + formatReference(c, index) + '</div>' +
                    '<div class="bron-item-actions">' +
                    '<button class="bron-btn" data-act="edit" title="' + e(SummieI18n.t('Bewerken')) + '">' +
                    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>' +
                    '<button class="bron-btn" data-act="insert" title="' + e(SummieI18n.t('Invoegen in document')) + '">' +
                    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="5 12 12 19 19 12"/></svg></button>' +
                    '<button class="bron-btn" data-act="inline" title="' + e(SummieI18n.t('In-tekstverwijzing invoegen')) + '">' +
                    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg></button>' +
                    (c.url ? '<button class="bron-btn" data-act="open" title="' + e(SummieI18n.t('Openen')) + '">' +
                        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></button>' : '') +
                    '<button class="bron-btn bron-btn-danger" data-act="delete" title="' + e(SummieI18n.t('Verwijderen')) + '">' +
                    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' +
                    '</div>';
                // Click on the reference text itself also opens edit
                var textEl = item.querySelector('.bron-item-text');
                if (textEl) textEl.addEventListener('click', function () { self.editCitation(c.id); });
                item.querySelector('.bron-item-actions').addEventListener('click', function (ev) {
                    var act = ev.target.closest('.bron-btn');
                    if (!act) return;
                    if (act.dataset.act === 'edit') self.editCitation(c.id);
                    else if (act.dataset.act === 'insert') self.insertReferenceAtCursor(c);
                    else if (act.dataset.act === 'inline') self.insertInTextAtCursor(c);
                    else if (act.dataset.act === 'open') {
                        var u = clean(c.url || (c.doi ? 'https://doi.org/' + c.doi : ''));
                        if (u && window.electron && window.electron.shell) window.electron.shell.openExternal(u);
                    } else if (act.dataset.act === 'delete') self.removeCitation(c.id);
                });
                container.appendChild(item);
            }, this);
        },

        _updatePanelIfOpen: function () {
            var panel = document.getElementById('bronnen-panel');
            if (panel && panel.classList.contains('active')) {
                this.renderList(document.getElementById('bronnenList'));
            }
        },

        // Set citation style (APA or Vancouver) and re-render
        setCitationStyle: function (style) {
            if (style !== 'apa' && style !== 'vancouver') return;
            setCitationStyle(style);
            this.citationStyle = style;
            this._syncInTextStyleSelectors();
            _isRenumbering = true;
            try {
                this.renderBibliographyBlock();
                this._updateInlineCitationSpans();
                this._updatePanelIfOpen();
            } finally { _isRenumbering = false; }
            try { _lastOrderedKey = _orderedKey(); } catch (e7) {}
            window.saveToLocalStorage && window.saveToLocalStorage();
        },

        getCitationStyle: function () {
            return _citationStyle;
        },

        // Set the Vancouver in-text notation ([1] / (1) / ¹). Applies to the
        // whole document: every existing inline citation span is re-rendered,
        // so the notation stays consistent without manual rework.
        setVancouverInTextStyle: function (style) {
            if (!setVancouverInTextStyle(style)) return;
            this.citationStyle = _citationStyle;
            this._syncInTextStyleSelectors();
            _isRenumbering = true;
            try { this._updateInlineCitationSpans(); } finally { _isRenumbering = false; }
            try { _lastOrderedKey = _orderedKey(); } catch (e8) {}
            window.saveToLocalStorage && window.saveToLocalStorage();
            window.updateUnsavedIndicator && window.updateUnsavedIndicator();
            // Collapse the document-wide span rewrite into one undo step
            if (window.UndoManager && window.UndoManager.notifyExternalChange) window.UndoManager.notifyExternalChange();
        },

        getCitationSearchMode: function () {
            return _citationSearchMode;
        },

        setCitationSearchMode: function (mode) {
            if (!setCitationSearchMode(mode)) return;
            _persistSearchMode();
        },

        getVancouverInTextStyle: function () {
            return _vancouverInTextStyle;
        },

        // Keep both selects (sidebar + modal) in sync and only show the
        // notation selector when Vancouver is active. APA always uses
        // ronde haakjes (Auteur, Jaar) and therefore never shows a choice.
        _syncInTextStyleSelectors: function () {
            var show = _citationStyle === 'vancouver';
            ['vancouverInTextStyleSelectSidebar', 'vancouverInTextStyleSelect'].forEach(function (id) {
                var sel = document.getElementById(id);
                if (!sel) return;
                sel.value = _vancouverInTextStyle;
                var row = sel.closest('.citation-style-toolbar-row') || sel.parentElement;
                if (row) row.style.display = show ? '' : 'none';
            });
        },

        // Re-render every inline citation in the document with the current
        // style/notation (used after loading, after changing the notation and
        // after switching between APA and Vancouver).
        // Vancouver numbers now follow occurrence order in the text.
        _updateInlineCitationSpans: function () {
            if (!window.AppState) return;
            var self = this;
            var indexMap = getCitationIndexMap();
            var order = getOrderedCitationIds();
            document.querySelectorAll('.summie-citation-inline[data-citation-id]').forEach(function (span) {
                var c = null;
                for (var i = 0; i < self.citations.length; i++) {
                    if (self.citations[i].id === span.getAttribute('data-citation-id')) { c = self.citations[i]; break; }
                }
                // Source removed → drop the orphaned inline marker
                if (!c) { span.remove(); return; }
                var idx = indexMap[c.id];
                // Fallback: if for some reason not in map but span exists,
                // use its position in order array; otherwise insertion order
                if (!idx) {
                    var pos = order.indexOf(c.id);
                    idx = pos !== -1 ? pos + 1 : self.citations.indexOf(c) + 1;
                }
                span.innerHTML = formatInText(c, idx);
            });
            // Also re-render full reference paragraphs (.summie-citation) so their
            // Vancouver numbers stay in sync with the bibliography order.
            var fullMap = getCitationIndexMap();
            document.querySelectorAll('.summie-citation[data-citation-id]').forEach(function (p) {
                if (p.closest && p.closest('.summie-bibliography')) return;
                var c2 = null;
                for (var i = 0; i < self.citations.length; i++) {
                    if (self.citations[i].id === p.getAttribute('data-citation-id')) { c2 = self.citations[i]; break; }
                }
                if (!c2) { p.remove(); return; }
                var idx2 = fullMap[c2.id] || (self.citations.indexOf(c2) + 1);
                // Only Vancouver uses the index visibly; APA ignores it
                if (_citationStyle === 'vancouver') {
                    p.innerHTML = formatReference(c2, idx2);
                }
            });
            try { _lastOrderedKey = _orderedKey(); } catch (e6) {}
        },

        // ── Edit existing citation (used by sidebar + bibliography block) ──
        editCitation: function (id) {
            var c = null;
            for (var i = 0; i < this.citations.length; i++) { if (this.citations[i].id === id) { c = this.citations[i]; break; } }
            if (!c) return;
            if (window.SummieSelection) window.SummieSelection.save();
            _editMode = true;
            _editingId = id;
            if (!modal) buildModal();
            this._openEditModal(c);
        },

        _openEditModal: function (orig) {
            if (!modal) return;
            modal.classList.add('active');
            var hdr = modal.querySelector('.modal-header h3');
            if (hdr) hdr.textContent = SummieI18n.t('Bron bewerken');
            var addBtn = modal.querySelector('#citationAddBtn');
            if (addBtn) { addBtn.textContent = SummieI18n.t('Opslaan'); addBtn.disabled = false; }
            var cancelBtn = modal.querySelector('#cancelCitationModal');
            if (cancelBtn) cancelBtn.textContent = SummieI18n.t('Annuleren');
            var hint = modal.querySelector('#citationHint');
            if (hint) hint.style.display = 'none';
            var searchRow = modal.querySelector('.citation-search-row');
            if (searchRow) searchRow.style.display = 'none';
            if (statusEl) { statusEl.style.display = 'none'; statusEl.textContent = ''; statusEl.className = 'citation-status'; }
            if (resultsEl) resultsEl.innerHTML = '';
            // Deep copy original so edits don't mutate until saved
            try { currentResult = JSON.parse(JSON.stringify(orig)); } catch (e) { currentResult = orig; }
            pendingCitation = toCitationObject(currentResult);
            pendingCitation.id = orig.id;
            currentResult.id = orig.id;
            _citationSearchMode = pendingCitation.sourceType || _citationSearchMode;
            currentMode = _citationSearchMode;
            if (modeSelect) modeSelect.value = _citationSearchMode;
            var styleSelectEl = modal.querySelector('#citationStyleSelect');
            if (styleSelectEl) styleSelectEl.value = _citationStyle;
            window.Bibliography._syncInTextStyleSelectors();
            if (previewEl) {
                previewEl.innerHTML = '';
                previewEl.style.display = 'block';
                var card = document.createElement('div');
                card.className = 'citation-preview-card';
                card.innerHTML =
                    '<div class="citation-preview-apa">' + formatReference(pendingCitation) + '</div>' +
                    '<div class="citation-edit-fields" id="citationEditFields" style=""></div>';
                previewEl.appendChild(card);
                var fields = card.querySelector('#citationEditFields');
                fields.innerHTML = buildEditFields(pendingCitation);
                fields.addEventListener('input', function () {
                    pendingCitation = collectEditedCitation();
                    var pre = card.querySelector('.citation-preview-apa');
                    if (pre) pre.innerHTML = formatReference(pendingCitation);
                });
            }
        },

        _closeEditMode: function () {
            _editMode = false;
            _editingId = null;
            if (!modal) return;
            var hdr = modal.querySelector('.modal-header h3');
            if (hdr) hdr.textContent = SummieI18n.t('Bron automatisch toevoegen');
            var addBtn = modal.querySelector('#citationAddBtn');
            if (addBtn) addBtn.textContent = SummieI18n.t('Toevoegen aan bronnen');
            var hint = modal.querySelector('#citationHint');
            if (hint) hint.style.display = '';
            var searchRow = modal.querySelector('.citation-search-row');
            if (searchRow) searchRow.style.display = '';
        },

        // Public refresh used by MutationObserver, load and undo paths.
        // Ensures the first citation in document order is always [1].
        refreshCitationNumbers: function () {
            if (_isRenumbering) return;
            var changed = forceRenumberIfOrderChanged();
            if (!changed) {
                // Even if order is same, sidebar numbers (— vs n) may need a
                // repaint after a citation became cited/uncited.
                this._updatePanelIfOpen();
            }
        },

        // Synchronous renumber — useful for export and explicit user actions.
        renumberNow: function () {
            if (_isRenumbering) return;
            _isRenumbering = true;
            try {
                this._updateInlineCitationSpans();
                this.renderBibliographyBlock();
                this._updatePanelIfOpen();
                _lastOrderedKey = _orderedKey();
            } finally {
                _isRenumbering = false;
            }
        },

        // Exposed for tests / external triggers
        _scheduleRenumber: function (delay) { scheduleRenumber(delay); },
        _forceRenumberIfOrderChanged: function () { return forceRenumberIfOrderChanged(); },

        getAuthorDelimiter: function () { return _citationAuthorDelimiter; },
        setAuthorDelimiter: function (v) { setAuthorDelimiter(v); },
        _parseAuthorsForTest: function (v) { return parseAuthorsFromInput(v); },
        _joinAuthorsForTest: function (a) { return joinAuthorsForInput(a); },

        // Restore per-document settings from a .sumd file / draft payload.
        // Called from applyLoadedData so a reopened document keeps the exact
        // style + notation + search mode it was saved with.
        applyDocumentSettings: function (data) {
            if (!data) return;
            // Missing fields (legacy files) fall back to the defaults instead
            // of inheriting whatever a previously opened document used.
            var style = data.citationStyle === 'vancouver' ? 'vancouver' : 'apa';
            setVancouverInTextStyle(data.vancouverInTextStyle || 'brackets');
            setCitationStyle(style);
            // Restore last used search mode (url/doi/title) per document
            var searchMode = (data.citationSearchMode === 'doi' || data.citationSearchMode === 'title' || data.citationSearchMode === 'url')
                ? data.citationSearchMode : 'url';
            _citationSearchMode = searchMode;
            currentMode = searchMode;
            if (modeSelect) modeSelect.value = searchMode;
            this.citationStyle = _citationStyle;
            this._syncInTextStyleSelectors();
            var sidebarStyleSelect = document.getElementById('citationStyleSelectSidebar');
            if (sidebarStyleSelect) sidebarStyleSelect.value = _citationStyle;
            var modalStyleSelect = document.getElementById('citationStyleSelect');
            if (modalStyleSelect) modalStyleSelect.value = _citationStyle;
            // After restoring style, the loaded HTML already contains citation
            // spans — renumber so Vancouver occurrence order is correct.
            scheduleRenumber(300);
        }
    };

    var Bibliography = window.Bibliography;

    // ── Modal ───────────────────────────────────────────────────────────

    var modal, queryInput, modeSelect, searchBtn, statusEl, resultsEl, previewEl;
    var currentMode = 'url';
    var currentResult = null;    // the neutral object from the lookup
    var pendingCitation = null;  // the editable citation being previewed
var searchPerformed = false; // whether a search has been done in the current modal session

    function buildModal() {
        modal = document.createElement('div');
        modal.id = 'citationModal';
        modal.className = 'modal';
        modal.innerHTML =
            '<div class="modal-content citation-modal-content">' +
            '<div class="modal-header">' +
            '<h3>' + e(SummieI18n.t('Bron automatisch toevoegen')) + '</h3>' +
            '<button class="close-btn" id="closeCitationModal">&times;</button>' +
            '</div>' +
            '<div class="modal-body">' +
            '<p class="citation-hint" id="citationHint">' + e(SummieI18n.t('Voer een DOI, titel of URL in en Summie zoekt de brongegevens automatisch op (APA 7).')) + '</p>' +
            '<div class="citation-style-selector" style="margin-bottom:12px;">' +
                '<label style="font-size:12px;color:var(--text-secondary);margin-right:8px;">' + e(SummieI18n.t('Referentiestijl:')) + '</label>' +
                '<select id="citationStyleSelect" class="citation-style-select" style="padding:4px 8px;border-radius:4px;border:1px solid var(--border-color);background:var(--bg-secondary);color:var(--text-primary);font-size:13px;">' +
                    '<option value="apa">' + e(SummieI18n.t('APA (Auteur, Jaar)')) + '</option>' +
                    '<option value="vancouver">' + e(SummieI18n.t('Vancouver (Genummerd)')) + '</option>' +
                '</select>' +
            '</div>' +
            '<div class="citation-style-selector citation-style-toolbar-row" style="margin:-4px 0 12px;display:none;">' +
                '<label style="font-size:12px;color:var(--text-secondary);margin-right:8px;">' + e(SummieI18n.t('In-tekstnotatie:')) + '</label>' +
                '<select id="vancouverInTextStyleSelect" class="citation-style-select" style="padding:4px 8px;border-radius:4px;border:1px solid var(--border-color);background:var(--bg-secondary);color:var(--text-primary);font-size:13px;">' +
                    '<option value="brackets">' + e(SummieI18n.t('Vierkante haakjes [1]')) + '</option>' +
                    '<option value="parentheses">' + e(SummieI18n.t('Ronde haakjes (1)')) + '</option>' +
                    '<option value="superscript">' + e(SummieI18n.t('Superscript')) + '</option>' +
                '</select>' +
            '</div>' +
            '<div class="citation-search-row">' +
            '<select id="citationMode" class="citation-mode-select">' +
            '<option value="url">URL</option>' +
            '<option value="doi">DOI</option>' +
            '<option value="title">' + e(SummieI18n.t('Titel')) + '</option>' +
            '</select>' +
            '<input type="text" id="citationQuery" placeholder="' + e(SummieI18n.t('Bijv. 10.1023/b:jadd.0000027227.55275.a9')) + '" spellcheck="false">' +
            '<button class="btn" id="citationSearchBtn">' + e(SummieI18n.t('Zoeken')) + '</button>' +
            '</div>' +
            '<div class="citation-status" id="citationStatus"></div>' +
            '<div class="citation-results" id="citationResults"></div>' +
            '<div class="citation-preview" id="citationPreview"></div>' +
            '</div>' +
            '<div class="modal-footer">' +
            '<button class="btn" id="cancelCitationModal">' + e(SummieI18n.t('Annuleren')) + '</button>' +
            '<button class="btn btn-primary" id="citationAddBtn">' + e(SummieI18n.t('Toevoegen aan bronnen')) + '</button>' +
            '</div>' +
            '</div>';
        document.body.appendChild(modal);

        queryInput = modal.querySelector('#citationQuery');
        modeSelect = modal.querySelector('#citationMode');
        searchBtn = modal.querySelector('#citationSearchBtn');
        statusEl = modal.querySelector('#citationStatus');
        resultsEl = modal.querySelector('#citationResults');
        previewEl = modal.querySelector('#citationPreview');

        modal.querySelector('#closeCitationModal').addEventListener('click', closeCitationModal);
        modal.querySelector('#cancelCitationModal').addEventListener('click', closeCitationModal);
        modal.addEventListener('click', function (e2) { if (e2.target === modal) closeCitationModal(); });
        document.addEventListener('keydown', function (e2) {
            if (e2.key === 'Escape' && modal.classList.contains('active')) closeCitationModal();
        });

        modeSelect.addEventListener('change', function () {
            currentMode = modeSelect.value;
            _citationSearchMode = currentMode;
            _persistSearchMode();
            clearResults();
            queryInput.placeholder = placeholderForMode(currentMode);
            queryInput.focus();
        });

        // Citation style selector in modal
        var styleSelect = modal.querySelector('#citationStyleSelect');
        if (styleSelect) {
            styleSelect.value = _citationStyle;
            styleSelect.addEventListener('change', function () {
                var newStyle = styleSelect.value;
                setCitationStyle(newStyle);
                window.Bibliography.citationStyle = newStyle;
                window.Bibliography._syncInTextStyleSelectors();
                window.Bibliography.renderBibliographyBlock();
                window.Bibliography._updateInlineCitationSpans();
                window.Bibliography._updatePanelIfOpen();
                // Update hint text
                var hint = modal.querySelector('#citationHint');
                if (hint) {
                    hint.textContent = newStyle === 'vancouver'
                        ? SummieI18n.t('Voer een DOI, titel of URL in en Summie zoekt de brongegevens automatisch op (Vancouver).')
                        : SummieI18n.t('Voer een DOI, titel of URL in en Summie zoekt de brongegevens automatisch op (APA 7).');
                }
            });
        }

        // Vancouver in-text notation selector in modal
        var inTextSelect = modal.querySelector('#vancouverInTextStyleSelect');
        if (inTextSelect) {
            inTextSelect.addEventListener('change', function () {
                window.Bibliography.setVancouverInTextStyle(inTextSelect.value);
            });
        }

        searchBtn.addEventListener('click', doSearch);
        queryInput.addEventListener('keydown', function (e2) {
            if (e2.key === 'Enter') doSearch();
        });

        modal.querySelector('#citationAddBtn').addEventListener('click', function () {
            // Edit mode: update the existing source instead of adding a new one
            if (_editMode && _editingId) {
                if (!pendingCitation) return;
                var updated = collectEditedCitation();
                updated.id = _editingId;
                // Replace in citations array
                var bib = window.Bibliography;
                for (var i = 0; i < bib.citations.length; i++) {
                    if (bib.citations[i].id === _editingId) { bib.citations[i] = updated; break; }
                }
                // Persist + re-render inline citations + bibliography block + sidebar
                bib._afterChange();
                window.showNotification && window.showNotification(SummieI18n.t('Bron bijgewerkt'), SummieI18n.t('De bron is bijgewerkt.'), 'success');
                bib._closeEditMode();
                closeCitationModal();
                return;
            }
            // Auto-search if no citation has been looked up yet
            if (!pendingCitation && !searchPerformed) {
                doSearch();
                return;
            }
            if (!pendingCitation) return;
            var c = collectEditedCitation();
            // Add to the list AND place the in-text citation at the cursor.
            // A source that already exists keeps its original number and that
            // number is re-inserted at the cursor instead of a duplicate
            // being created (see addCitation → findDuplicate).
            window.Bibliography.addCitation(c, { inline: true });
            closeCitationModal();
        });
    }

    function placeholderForMode(mode) {
        if (mode === 'doi') return SummieI18n.t('Bijv. 10.1023/b:jadd.0000027227.55275.a9');
        if (mode === 'title') return SummieI18n.t('Bijv. De invloed van klimaat op landbouwopbrengst');
        return SummieI18n.t('Bijv. https://www.voorbeeld.nl/artikel');
    }

    function clearResults() {
        statusEl.textContent = '';
        statusEl.className = 'citation-status';
        resultsEl.innerHTML = '';
        previewEl.innerHTML = '';
        currentResult = null;
        pendingCitation = null;
        searchPerformed = false;
        modal.querySelector('#citationAddBtn').disabled = true;
    }

    function setStatus(msg, isError) {
        statusEl.style.display = 'block';
        statusEl.textContent = msg;
        statusEl.className = 'citation-status' + (isError ? ' citation-status-error' : '');
    }

    function doSearch() {
        var q = queryInput.value.trim();
        if (!q) { setStatus(SummieI18n.t('Voer eerst een zoekterm in.'), true); return; }

        if (currentMode === 'doi' && !/^10\.\d{4,9}\/\S+$/.test(q.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, ''))) {
            setStatus(SummieI18n.t('Dit ziet er niet uit als een geldige DOI. Voorbeeld: 10.1000/xyz123'), true);
            return;
        }
        if (currentMode === 'url' && !/^https?:\/\//i.test(q)) {
            setStatus(SummieI18n.t('Voer een geldige URL in (met https://).'), true);
            return;
        }

        if (!window.electron || !window.electron.citationLookup) {
            setStatus(SummieI18n.t('Deze functie is alleen beschikbaar in de Summie-app.'), true);
            return;
        }

        // Remember this lookup mode for the document until the user picks another
        if (_citationSearchMode !== currentMode) {
            _citationSearchMode = currentMode;
            _persistSearchMode();
        }

        clearResults();
        setStatus(SummieI18n.t('Zoeken...'));
        searchBtn.disabled = true;
        searchPerformed = true;

        window.electron.citationLookup({ mode: currentMode, query: q })
            .then(function (res) {
                searchBtn.disabled = false;
                if (!res) {
                    setStatus(SummieI18n.t('Er ging iets mis bij het ophalen.'), true);
                    return;
                }
                if (!res.ok) {
                    setStatus(res.error || SummieI18n.t('Niet gevonden.'), true);
                    return;
                }
                statusEl.style.display = 'none';
                if (res.result) showPreview(res.result);
                else if (res.list) showResultList(res.list);
                else setStatus(SummieI18n.t('Geen resultaten gevonden.'), true);
            })
            .catch(function () {
                searchBtn.disabled = false;
                setStatus(SummieI18n.t('Er ging iets mis bij het ophalen.'), true);
            });
    }

    function showResultList(list) {
        resultsEl.innerHTML = '';
        if (!list || list.length === 0) {
            setStatus(SummieI18n.t('Geen resultaten gevonden.'), true);
            return;
        }
        statusEl.style.display = 'none';
        list.forEach(function (item, i) {
            var row = document.createElement('button');
            row.className = 'citation-result-row';
            row.innerHTML =
                '<span class="citation-result-title">' + e(sentenceCase(item.title) || item.year || '') + '</span>' +
                '<span class="citation-result-meta">' + e((item.authors && item.authors.join(', ')) || '') +
                (item.authors && item.authors.length ? ', ' : '') + e(item.year) +
                (item.journal ? ' — ' + e(item.journal) : '') + '</span>';
            row.addEventListener('click', function () { showPreview(item); });
            resultsEl.appendChild(row);
        });
    }

    function showPreview(item) {
        currentResult = item;
        pendingCitation = toCitationObject(item);
        resultsEl.innerHTML = '';
        previewEl.innerHTML = '';
        previewEl.style.display = 'block';

var card = document.createElement('div');
    card.className = 'citation-preview-card';
    card.innerHTML =
        '<div class="citation-preview-apa">' + formatReference(pendingCitation) + '</div>' +
            '<button class="citation-edit-toggle" id="citationEditToggle">' + e(SummieI18n.t('Velden bewerken')) + '</button>' +
            '<div class="citation-edit-fields" id="citationEditFields" style="display:none"></div>';

        previewEl.appendChild(card);

        var fields = card.querySelector('#citationEditFields');
        fields.innerHTML = buildEditFields(pendingCitation);

        card.querySelector('#citationEditToggle').addEventListener('click', function () {
            var show = fields.style.display === 'none';
            fields.style.display = show ? '' : 'none';
            this.textContent = show ? SummieI18n.t('Velden verbergen') : SummieI18n.t('Velden bewerken');
        });

fields.addEventListener('input', function () {
        pendingCitation = collectEditedCitation();
        card.querySelector('.citation-preview-apa').innerHTML = formatReference(pendingCitation);
    });

        modal.querySelector('#citationAddBtn').disabled = false;
    }

    function toCitationObject(item) {
        return {
            sourceType: item.sourceType || currentMode,
            source: item.source || queryInput.value.trim(),
            crossrefType: item.crossrefType || '',
            title: item.title || '',
            authors: (item.authors || []).slice(),
            editors: (item.editors || []).slice(),
            year: item.year || '',
            publishedDate: item.publishedDate || null,
            journal: item.journal || '',
            volume: item.volume || '',
            issue: item.issue || '',
            pages: item.pages || '',
            articleNumber: item.articleNumber || '',
            publisher: item.publisher || '',
            doi: item.doi || '',
            url: item.url || '',
            website: item.website || '',
            issn: item.issn || '',
            accessedDate: new Date().toISOString().slice(0, 10)
        };
    }

    function buildEditFields(c) {
        var authorHint = _citationAuthorDelimiter === 'newline'
            ? SummieI18n.t('Eén auteur per regel, bv. Jansen, A.')
            : SummieI18n.t('Scheid met ;  bv. Jansen, A.; Bakker, B.');
        var rows = [
            ['authors', SummieI18n.t('Auteurs'), joinAuthorsForInput(c.authors), authorHint],
            ['year', SummieI18n.t('Jaar'), c.year, ''],
            ['title', SummieI18n.t('Titel'), c.title, ''],
            ['journal', SummieI18n.t('Tijdschrift'), c.journal, ''],
            ['volume', SummieI18n.t('Volume'), c.volume, ''],
            ['issue', SummieI18n.t('Nummer'), c.issue, ''],
            ['pages', SummieI18n.t('Pagina’s'), c.pages, ''],
            ['publisher', SummieI18n.t('Uitgever'), c.publisher, ''],
            ['website', SummieI18n.t('Website'), c.website, ''],
            ['doi', 'DOI', c.doi, ''],
            ['url', 'URL', c.url, '']
        ];
        var html = '';
        rows.forEach(function (r) {
            var hint = r[3] ? '<span class="citation-field-hint" style="font-size:11px;color:var(--text-secondary);">' + e(r[3]) + '</span>' : '';
            var inputType = (r[0] === 'authors' && _citationAuthorDelimiter === 'newline') ? 'textarea' : 'input';
            if (inputType === 'textarea') {
                html += '<div class="form-group citation-field-group">' +
                    '<label>' + e(r[1]) + '</label>' + hint +
                    '<textarea data-field="' + r[0] + '" rows="2" style="resize:vertical;padding:6px 8px;border:1px solid var(--border-color);border-radius:4px;font-size:13px;" spellcheck="false">' + e(r[2]) + '</textarea>' +
                    '</div>';
            } else {
                html += '<div class="form-group citation-field-group">' +
                    '<label>' + e(r[1]) + '</label>' + hint +
                    '<input type="text" data-field="' + r[0] + '" value="' + e(r[2]) + '" spellcheck="false">' +
                    '</div>';
            }
        });
        return html;
    }

    function collectEditedCitation() {
        var base = toCitationObject(currentResult);
        if (previewEl) {
            previewEl.querySelectorAll('.citation-edit-fields [data-field]').forEach(function (input) {
                var f = input.dataset.field || input.getAttribute('data-field');
                if (f === 'authors') {
                    base.authors = parseAuthorsFromInput(input.value);
                } else {
                    base[f] = input.value.trim();
                }
            });
        }
        return base;
    }

    function openCitationModal() {
        if (window.SummieSelection) window.SummieSelection.save();
        if (!modal) buildModal();
        // Leaving edit mode if we were in it — normal "toevoegen" flow
        if (_editMode) {
            _editMode = false;
            _editingId = null;
            if (window.Bibliography && window.Bibliography._closeEditMode) window.Bibliography._closeEditMode();
        }
        modal.classList.add('active');
        // Restore default header/button text (in case we came from edit)
        var hdr0 = modal.querySelector('.modal-header h3');
        if (hdr0) hdr0.textContent = SummieI18n.t('Bron automatisch toevoegen');
        var ab0 = modal.querySelector('#citationAddBtn');
        if (ab0) ab0.textContent = SummieI18n.t('Toevoegen aan bronnen');
        var hint0 = modal.querySelector('#citationHint');
        if (hint0) hint0.style.display = '';
        var sr0 = modal.querySelector('.citation-search-row');
        if (sr0) sr0.style.display = '';
        // Keep style + notation selectors in sync with the document's current
        // settings (they may have changed since the modal was built).
        var styleSelectEl = modal.querySelector('#citationStyleSelect');
        if (styleSelectEl) styleSelectEl.value = _citationStyle;
        window.Bibliography._syncInTextStyleSelectors();
        // Restore the last used lookup mode for this document (url/doi/title)
        currentMode = _citationSearchMode;
        modeSelect.value = _citationSearchMode;
        queryInput.value = '';
        queryInput.placeholder = placeholderForMode(_citationSearchMode);
        clearResults();
        setTimeout(function () { queryInput.focus(); }, 30);
        // If text is selected in the editor, offer it as a title query.
        // This is a transient convenience — the stored preference is only
        // updated when the user actually searches or changes the dropdown.
        var sel = window.getSelection();
        if (sel && sel.rangeCount && sel.toString().trim()) {
            queryInput.value = sel.toString().trim().slice(0, 200);
            currentMode = 'title';
            modeSelect.value = 'title';
            queryInput.placeholder = placeholderForMode('title');
        }
        // Keep results/list in sync with panel if the document has citations.
        window.Bibliography._updatePanelIfOpen();
    }

    function closeCitationModal() {
        if (modal) modal.classList.remove('active');
        currentResult = null;
        pendingCitation = null;
        if (_editMode) {
            _editMode = false;
            _editingId = null;
            if (window.Bibliography && window.Bibliography._closeEditMode) window.Bibliography._closeEditMode();
        }
        // Return focus/caret to where it was before the modal opened (cancel
        // path or after a successful insert the caret is already correct).
        if (window.SummieSelection) window.SummieSelection.restore();
    }

    window.openCitationModal = openCitationModal;
    window.closeCitationModal = closeCitationModal;
})();