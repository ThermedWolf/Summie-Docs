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

    // Current citation style: 'apa' or 'vancouver'
    var _citationStyle = 'apa';

    function getCitationStyle() {
        return _citationStyle;
    }

    function setCitationStyle(style) {
        if (style === 'apa' || style === 'vancouver') {
            _citationStyle = style;
        }
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

    // Format in-text citation
    function formatInText(c, index) {
        var formatter = getFormatter();
        if (_citationStyle === 'vancouver') {
            return formatter.inText(c, index);
        }
        return formatter.inText(c);
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

    var sentenceCase = function (str) { return window.ApaFormat.sentenceCase(str); };

    // ── Manager ──────────────────────────────────────────────────────────

    window.Bibliography = {
        citations: [],
        _initialized: false,
        citationStyle: 'apa', // public property for UI

        init: function () {
            if (this._initialized) return;
            this._initialized = true;

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

            // Restore after a document has been loaded (applyLoadedData runs too
            // early for module initialisation, so the restore call above in
            // applyLoadedData sets the array; re-render any bibliography block).
            setTimeout(function () {
                Bibliography.renderBibliographyBlock();
            }, 600);
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

        addCitation: function (c, opts) {
            opts = opts || {};
            if (!c.id) c.id = this.genId();
            this.citations.push(c);
            this._afterChange();

            if (opts.insert) this.insertReferenceAtCursor(c);
            else if (opts.inline) {
                this.insertInTextAtCursor(c);
            }

            window.showNotification && window.showNotification(
                SummieI18n.t('Bron toegevoegd'),
                opts.insert ? SummieI18n.t('De verwijzing is aan het document toegevoegd.') : SummieI18n.t('De bron is aan de lijst toegevoegd.'),
                'success'
            );
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
                // Also drop any inserted inline entries for that id.
                var editor = window.AppState && window.AppState.editor;
                if (editor && typeof id === 'string') {
                    editor.querySelectorAll('.summie-citation').forEach(function (el) {
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
            this.renderBibliographyBlock();
            this._updatePanelIfOpen();
        },

        // Insert a full reference entry (hanging-indent paragraph) at the cursor.
        insertReferenceAtCursor: function (c) {
            // Find the index of this citation in the array (for Vancouver numbering)
            var index = this.citations.indexOf(c) + 1;
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

        insertInTextAtCursor: function (c) {
            // Find the index of this citation in the array (for Vancouver numbering)
            var index = this.citations.indexOf(c) + 1;
            var txt = e(formatInText(c, index));
            if (!this._insertHtmlAtCursor(txt)) {
                var p = document.createElement('p');
                p.appendChild(document.createTextNode(formatInText(c, index)));
                this._appendToEditor(p);
            }
            this._afterChange();
        },

        // Use the native contenteditable insertHTML so a block-level reminder is
        // split into its own paragraph (raw insertNode would nest <p> inside <p>).
        _insertHtmlAtCursor: function (html) {
            var editor = window.AppState && window.AppState.editor;
            if (!editor) return false;
            editor.focus();
            var sel = window.getSelection();
            if (!sel || !sel.rangeCount) return false;
            if (!editor.contains(sel.anchorNode)) return false;
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
                '<div class="summie-bib-heading">' + e(SummieI18n.t('Bronnen')) + '</div>' +
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
            var itemsEl = block.querySelector('.summie-bib-items');
            if (!itemsEl) return;
            itemsEl.innerHTML = '';

            // For Vancouver, keep original order (citation order)
            // For APA, sort alphabetically
            var sorted = this.citations.slice();
            if (_citationStyle === 'apa') {
                sorted.sort(function (a, b) {
                    return sortKey(a).localeCompare(sortKey(b));
                });
            }

            if (sorted.length === 0) {
                itemsEl.innerHTML = '<div class="summie-bib-empty">' + e(SummieI18n.t('Nog geen bronnen toegevoegd.')) + '</div>';
                return;
            }
            sorted.forEach(function (c, idx) {
                var item = document.createElement('div');
                item.className = 'summie-bib-item';
                if (c.id) item.setAttribute('data-citation-id', c.id);
                // Use index in sorted array + 1 for Vancouver numbering
                var index = _citationStyle === 'vancouver' ? idx + 1 : this.citations.indexOf(c) + 1;
                item.innerHTML = formatReference(c, index);
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
            // For Vancouver, keep original order; for APA, sort alphabetically
            var sorted = this.citations.slice();
            if (_citationStyle === 'apa') {
                sorted.sort(function (a, b) {
                    return sortKey(a).localeCompare(sortKey(b));
                });
            }
            sorted.forEach(function (c, idx) {
                var item = document.createElement('div');
                item.className = 'bron-item';
                // Use index in sorted array + 1 for Vancouver numbering
                var index = _citationStyle === 'vancouver' ? idx + 1 : this.citations.indexOf(c) + 1;
                item.innerHTML =
                    '<div class="bron-item-text">' + formatReference(c, index) + '</div>' +
                    '<div class="bron-item-actions">' +
                    '<button class="bron-btn" data-act="insert" title="' + e(SummieI18n.t('Invoegen in document')) + '">' +
                    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="5 12 12 19 19 12"/></svg></button>' +
                    '<button class="bron-btn" data-act="inline" title="' + e(SummieI18n.t('In-tekstverwijzing invoegen')) + '">' +
                    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg></button>' +
                    (c.url ? '<button class="bron-btn" data-act="open" title="' + e(SummieI18n.t('Openen')) + '">' +
                        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></button>' : '') +
                    '<button class="bron-btn bron-btn-danger" data-act="delete" title="' + e(SummieI18n.t('Verwijderen')) + '">' +
                    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' +
                    '</div>';
                item.querySelector('.bron-item-actions').addEventListener('click', function (ev) {
                    var act = ev.target.closest('.bron-btn');
                    if (!act) return;
                    if (act.dataset.act === 'insert') self.insertReferenceAtCursor(c);
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
            this.renderBibliographyBlock();
            this._updatePanelIfOpen();
            window.saveToLocalStorage && window.saveToLocalStorage();
        },

        getCitationStyle: function () {
            return _citationStyle;
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
                window.Bibliography.renderBibliographyBlock();
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

        searchBtn.addEventListener('click', doSearch);
        queryInput.addEventListener('keydown', function (e2) {
            if (e2.key === 'Enter') doSearch();
        });

        modal.querySelector('#citationAddBtn').addEventListener('click', function () {
            // Auto-search if no citation has been looked up yet
            if (!pendingCitation && !searchPerformed) {
                doSearch();
                return;
            }
            if (!pendingCitation) return;
            var c = collectEditedCitation();
            // Add to sidebar only (not insert full reference in document)
            window.Bibliography.addCitation(c);
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
        var rows = [
            ['authors', SummieI18n.t('Auteurs'), (c.authors || []).join(', ')],
            ['year', SummieI18n.t('Jaar'), c.year],
            ['title', SummieI18n.t('Titel'), c.title],
            ['journal', SummieI18n.t('Tijdschrift'), c.journal],
            ['volume', SummieI18n.t('Volume'), c.volume],
            ['issue', SummieI18n.t('Nummer'), c.issue],
            ['pages', SummieI18n.t('Pagina’s'), c.pages],
            ['publisher', SummieI18n.t('Uitgever'), c.publisher],
            ['website', SummieI18n.t('Website'), c.website],
            ['doi', 'DOI', c.doi],
            ['url', 'URL', c.url]
        ];
        var html = '';
        rows.forEach(function (r) {
            html += '<div class="form-group citation-field-group">' +
                '<label>' + e(r[1]) + '</label>' +
                '<input type="text" data-field="' + r[0] + '" value="' + e(r[2]) + '" spellcheck="false">' +
                '</div>';
        });
        return html;
    }

    function collectEditedCitation() {
        var base = toCitationObject(currentResult);
        if (previewEl) {
            previewEl.querySelectorAll('.citation-edit-fields input[data-field]').forEach(function (input) {
                var f = input.dataset.field;
                if (f === 'authors') {
                    base.authors = input.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
                } else {
                    base[f] = input.value.trim();
                }
            });
        }
        return base;
    }

    function openCitationModal() {
        if (!modal) buildModal();
        modal.classList.add('active');
        currentMode = 'url';
        modeSelect.value = 'url';
        queryInput.value = '';
        queryInput.placeholder = placeholderForMode('url');
        clearResults();
        setTimeout(function () { queryInput.focus(); }, 30);
        // If text is selected in the editor, offer it as a title query.
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
    }

    window.openCitationModal = openCitationModal;
    window.closeCitationModal = closeCitationModal;
})();