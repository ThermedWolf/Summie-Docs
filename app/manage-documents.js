// ==================== DOCUMENT MANAGEMENT ====================
// Fuse.js fuzzy search, tag autocomplete, rename, description editing.
// Tags and description are saved INTO the .sumd file.
// Known tags are saved in userData/known-tags.json via IPC.

(async function () {
    'use strict';

    let _allDocs = [];
    let _editingDoc = null;
    let _fuse = null;
    let _searchTimeout = null;
    let _knownTags = [];
    let _tagTooltipIdx = -1;
    let _filters = { hasCodeblock: false, hasTable: false, hasImage: false, dateFrom: '', dateTo: '' };

    await init();

    async function init() {
        await loadKnownTags();
        await loadDocs();
        renderList(_allDocs);
        wireUI();
        wireWindowControls();
    }

    async function loadKnownTags() {
        if (window.electron && window.electron.knownTagsGet) {
            _knownTags = await window.electron.knownTagsGet() || [];
        }
    }

    async function saveKnownTag(tag) {
        if (!tag || _knownTags.includes(tag)) return;
        _knownTags.push(tag);
        if (window.electron && window.electron.knownTagsSave) {
            await window.electron.knownTagsSave(_knownTags);
        }
    }

    // Load docs from remembered file paths, then read each .sumd fresh.
    // Files that no longer exist are hidden from the list but NEVER pruned
    // from storage here — a temporarily unavailable drive must not delete
    // remembered documents permanently.
    async function loadDocs() {
        if (!window.electron) return;
        const storedDocs = window.electron.knownDocsGet
            ? await window.electron.knownDocsGet()
            : await window.electron.recentsGet();

        const liveDocs = [];

        for (const doc of storedDocs) {
            if (!doc.path) continue;

            const exists = window.electron.fileExists ? await window.electron.fileExists(doc.path) : true;
            if (!exists) continue;

            const data = window.electron.openSumdFileByPath
                ? await window.electron.openSumdFileByPath(doc.path)
                : null;
            if (!data) continue;

            const scan = window.electron.scanSumdElements
                ? await window.electron.scanSumdElements(doc.path)
                : null;
            const filename = doc.path.split('\\').pop().split('/').pop();
            const displayName = doc.name || filename.replace(/\.sumd$/i, '') || SummieI18n.t('Naamloos');

            const freshDoc = {
                ...doc,
                id: doc.id || doc.path,
                name: displayName,
                description: data.description || '',
                tags: data.tags || [],
                hasCodeblock: !!scan?.hasCodeblock,
                hasTable: !!scan?.hasTable,
                hasImage: !!scan?.hasImage,
                lastOpened: doc.lastOpened || data.timestamp || ''
            };

            liveDocs.push(freshDoc);
        }

        _allDocs = liveDocs;

        // Build Fuse index
        if (window.Fuse) {
            _fuse = new window.Fuse(_allDocs, {
                keys: [
                    { name: 'name', weight: 0.5 },
                    { name: 'description', weight: 0.25 },
                    { name: 'tags', weight: 0.15 },
                    { name: 'path', weight: 0.1 },
                ],
                threshold: 0.4,
                includeScore: true,
                ignoreLocation: true,
            });
        }

        updateDocCount(_allDocs.length);
    }

    // ── Render list ────────────────────────────────────────────────────────
    function renderList(docs) {
        const list = document.getElementById('mdList');
        const empty = document.getElementById('mdEmpty');

        // Clear existing rows (keep empty msg)
        Array.from(list.children).forEach(c => { if (c.id !== 'mdEmpty') c.remove(); });

        if (docs.length === 0) {
            empty.style.display = 'flex';
            return;
        }
        empty.style.display = 'none';

        docs.forEach(doc => {
            const row = document.createElement('div');
            row.className = 'md-row';
            row.dataset.id = doc.id;

            const tagsHtml = (doc.tags || []).map(t =>
                `<span class="md-tag-chip">${escHtml(t)}</span>`
            ).join('');

            row.innerHTML = `
                <div class="md-row-icon"><img src="icon.png" width="18" height="18" style="object-fit:contain;border-radius:3px;"></div>
                <div class="md-row-info">
                    <div class="md-row-name">${escHtml(doc.name || SummieI18n.t('Naamloos'))}</div>
                    ${doc.description ? `<div class="md-row-desc">${escHtml(doc.description)}</div>` : ''}
                    <div class="md-row-bottom">
                        <span class="md-row-path">${escHtml(doc.path || '')}</span>
                        ${tagsHtml ? `<div class="md-row-tags">${tagsHtml}</div>` : ''}
                    </div>
                </div>
                <div class="md-row-date">${formatDate(new Date(doc.lastOpened))}</div>
                <button class="md-row-edit" title="Bewerken">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                </button>
            `;

            row.querySelector('.md-row-edit').addEventListener('click', e => {
                e.stopPropagation();
                openEditPanel(doc);
            });

            row.addEventListener('click', () => openEditPanel(doc));
            list.appendChild(row);
        });
    }

    function updateDocCount(count) {
        const el = document.getElementById('mdDocCount');
        if (el) el.textContent = `${count} document${count !== 1 ? 'en' : ''}`;
    }

    // ── Search ─────────────────────────────────────────────────────────────
    function applyMdFilters(docs) {
        const f = _filters;
        return docs.filter(doc => {
            if (f.hasCodeblock && !doc.hasCodeblock) return false;
            if (f.hasTable && !doc.hasTable) return false;
            if (f.hasImage && !doc.hasImage) return false;
            if (f.dateFrom) {
                if (new Date(doc.lastOpened) < new Date(f.dateFrom)) return false;
            }
            if (f.dateTo) {
                const to = new Date(f.dateTo); to.setHours(23, 59, 59, 999);
                if (new Date(doc.lastOpened) > to) return false;
            }
            return true;
        });
    }

    function doSearch(query) {
        query = (query || '').trim();
        let results = _allDocs;

        if (query) {
            if (_fuse) {
                results = _fuse.search(query).map(r => r.item);
            } else {
                const q = query.toLowerCase();
                results = results.filter(d =>
                    (d.name || '').toLowerCase().includes(q) ||
                    (d.description || '').toLowerCase().includes(q) ||
                    (d.tags || []).some(t => t.toLowerCase().includes(q))
                );
            }
        }

        results = applyMdFilters(results);
        renderList(results);
        updateDocCount(results.length);
    }

    // ── Edit panel ─────────────────────────────────────────────────────────
    let _isDirty = false;

    function _setDirty(dirty) {
        _isDirty = dirty;
        const saveBtn = document.getElementById('mdSaveBtn');
        if (!saveBtn) return;
        if (dirty) {
            saveBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Opslaan`;
            saveBtn.title = SummieI18n.t('Wijzigingen opslaan');
        } else {
            saveBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg> Openen`;
            saveBtn.title = SummieI18n.t('Document openen in editor');
        }
    }

    function openEditPanel(doc) {
        _editingDoc = { ...doc };
        _isDirty = false;
        const overlay = document.getElementById('mdEditSheet');
        const backdrop = document.getElementById('mdEditBackdrop');
        document.getElementById('mdEditTitle').textContent = doc.name || SummieI18n.t('Naamloos');
        document.getElementById('mdEditDocId').value = doc.id || '';
        document.getElementById('mdEditDocPath').value = doc.path || '';
        document.getElementById('mdEditName').value = doc.name || '';
        document.getElementById('mdEditDesc').value = doc.description || '';
        renderEditTags(doc.tags || []);

        const meta = document.getElementById('mdEditMeta');
        meta.innerHTML = `
            <div>Pad: <span>${escHtml(doc.path || '—')}</span></div>
            <div>Laatst geopend: <span>${formatDate(new Date(doc.lastOpened))}</span></div>
        `;

        overlay.classList.add('open');
        backdrop.classList.add('open');
        _setDirty(false);
        document.getElementById('mdEditName').focus();
    }

    function closeEditPanel() {
        document.getElementById('mdEditSheet').classList.remove('open');
        document.getElementById('mdEditBackdrop').classList.remove('open');
        _editingDoc = null;
        document.getElementById('mdTagSuggestions').style.display = 'none';
    }

    function renderEditTags(tags) {
        const list = document.getElementById('mdTagsList');
        list.innerHTML = '';
        (tags || []).forEach(tag => {
            const chip = document.createElement('span');
            chip.className = 'md-edit-tag-chip';
            chip.innerHTML = `${escHtml(tag)}<button class="md-edit-tag-remove" data-tag="${escHtml(tag)}">×</button>`;
            chip.querySelector('.md-edit-tag-remove').addEventListener('click', () => {
                if (_editingDoc) {
                    _editingDoc.tags = (_editingDoc.tags || []).filter(t => t !== tag);
                    renderEditTags(_editingDoc.tags);
                    _setDirty(true);
                }
            });
            list.appendChild(chip);
        });
    }

    // ── Tag autocomplete ───────────────────────────────────────────────────
    function showTagSuggestions(query) {
        const box = document.getElementById('mdTagSuggestions');
        if (!query) { box.style.display = 'none'; return; }

        const q = query.toLowerCase();
        const existing = _editingDoc ? (_editingDoc.tags || []) : [];
        let matches = _knownTags
            .filter(t => !existing.includes(t) && t.toLowerCase().includes(q))
            .slice(0, 6);

        if (matches.length === 0) { box.style.display = 'none'; return; }

        box.innerHTML = '';
        _tagTooltipIdx = -1;
        matches.forEach((tag, i) => {
            const item = document.createElement('div');
            item.className = 'md-tag-suggestion-item';
            item.dataset.idx = i;

            const label = document.createElement('span');
            label.className = 'md-tag-suggestion-label';
            label.textContent = tag;
            label.addEventListener('mousedown', e => {
                e.preventDefault();
                selectTagSuggestion(tag);
            });

            const del = document.createElement('button');
            del.className = 'md-tag-suggestion-delete';
            del.title = SummieI18n.t('Verwijder onthouden tag');
            del.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
            del.addEventListener('mousedown', async e => {
                e.preventDefault();
                e.stopPropagation();
                _knownTags = _knownTags.filter(t => t !== tag);
                if (window.electron && window.electron.knownTagsSave) {
                    await window.electron.knownTagsSave(_knownTags);
                }
                // Re-render suggestions with updated list
                showTagSuggestions(document.getElementById('mdTagInput').value.trim());
            });

            item.appendChild(label);
            item.appendChild(del);
            box.appendChild(item);
        });
        box.style.display = 'block';
    }

    function selectTagSuggestion(tag) {
        if (!_editingDoc) return;
        if (!(_editingDoc.tags || []).includes(tag)) {
            _editingDoc.tags = [...(_editingDoc.tags || []), tag];
            renderEditTags(_editingDoc.tags);
            _setDirty(true);
        }
        document.getElementById('mdTagInput').value = '';
        document.getElementById('mdTagSuggestions').style.display = 'none';
        _tagTooltipIdx = -1;
    }

    // ── Save metadata to .sumd ─────────────────────────────────────────────
    async function saveDocMeta(doc) {
        if (!doc.path || !window.electron || !window.electron.writeSumdMeta) return false;
        return window.electron.writeSumdMeta(doc.path, {
            description: doc.description || '',
            tags: doc.tags || [],
        });
    }

    // ── Rename file ────────────────────────────────────────────────────────
    async function renameDoc(doc, newName) {
        if (!doc.path || !window.electron || !window.electron.renameFile) return false;

        // Use platform separator
        const sep = doc.path.includes('\\') ? '\\' : '/';
        const parts = doc.path.split(sep);
        parts[parts.length - 1] = newName + '.' + doc.path.split('.').pop();
        const newPathFinal = parts.join(sep);

        if (newPathFinal === doc.path) return doc.path;

        const result = await window.electron.renameFile(doc.path, newPathFinal);
        if (result && result.success) {
            // update-doc-path updates recents, known docs AND favourites in one
            // atomic main-process step (the hand-rolled rewrites here left
            // favourites pointing at the old path).
            try {
                if (window.electron.updateDocPath) {
                    await window.electron.updateDocPath(doc.path, newPathFinal, newName);
                }
            } catch (e) { /* non-fatal */ }
            return newPathFinal;
        }
        return false;
    }

    // ── Wire UI ────────────────────────────────────────────────────────────
    function wireUI() {
        // Filters
        ['mdFilterCodeblock', 'mdFilterTable', 'mdFilterImage'].forEach(id => {
            const btn = document.getElementById(id);
            if (!btn) return;
            btn.addEventListener('click', () => {
                const key = { mdFilterCodeblock: 'hasCodeblock', mdFilterTable: 'hasTable', mdFilterImage: 'hasImage' }[id];
                _filters[key] = !_filters[key];
                btn.classList.toggle('active', _filters[key]);
                doSearch(document.getElementById('mdSearchInput').value);
            });
        });

        ['mdFilterDateFrom', 'mdFilterDateTo'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('change', () => {
                _filters[id === 'mdFilterDateFrom' ? 'dateFrom' : 'dateTo'] = el.value;
                doSearch(document.getElementById('mdSearchInput').value);
            });
        });

        document.getElementById('mdClearFilters')?.addEventListener('click', () => {
            _filters = { hasCodeblock: false, hasTable: false, hasImage: false, dateFrom: '', dateTo: '' };
            ['mdFilterCodeblock', 'mdFilterTable', 'mdFilterImage'].forEach(id => document.getElementById(id)?.classList.remove('active'));
            ['mdFilterDateFrom', 'mdFilterDateTo'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
            doSearch(document.getElementById('mdSearchInput').value);
        });

        // Back button — always navigate to the landing page, independent of the
        // 'close to home' setting (that setting only applies to the window close button).
        document.getElementById('mdBackBtn').addEventListener('click', () => {
            window.location.href = 'landing.html';
        });

        // Search
        const searchInput = document.getElementById('mdSearchInput');
        const clearBtn = document.getElementById('mdSearchClear');

        searchInput.addEventListener('input', () => {
            const q = searchInput.value;
            clearBtn.style.display = q ? 'flex' : 'none';
            clearTimeout(_searchTimeout);
            _searchTimeout = setTimeout(() => doSearch(q), 200);
        });

        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            clearBtn.style.display = 'none';
            doSearch('');
        });

        // Edit panel close
        document.getElementById('mdEditClose').addEventListener('click', closeEditPanel);
        document.getElementById('mdCancelBtn').addEventListener('click', closeEditPanel);
        document.getElementById('mdEditBackdrop').addEventListener('click', closeEditPanel);

        // Rename
        document.getElementById('mdSaveNameBtn').addEventListener('click', async () => {
            if (!_editingDoc) return;
            const newName = document.getElementById('mdEditName').value.trim();
            if (!newName || newName === _editingDoc.name) return;

            const btn = document.getElementById('mdSaveNameBtn');
            btn.disabled = true;
            const newPath = await renameDoc(_editingDoc, newName);
            btn.disabled = false;

            if (newPath) {
                _editingDoc.name = newName;
                _editingDoc.path = newPath;
                document.getElementById('mdEditTitle').textContent = newName;
                document.getElementById('mdEditDocPath').value = newPath;
                // Update in _allDocs
                const idx = _allDocs.findIndex(d => d.id === _editingDoc.id);
                if (idx !== -1) _allDocs[idx] = { ..._allDocs[idx], name: newName, path: newPath };
                // Rebuild fuse index
                if (window.Fuse) {
                    _fuse = new window.Fuse(_allDocs, {
                        keys: [{ name: 'name', weight: 0.5 }, { name: 'description', weight: 0.25 }, { name: 'tags', weight: 0.15 }, { name: 'path', weight: 0.1 }],
                        threshold: 0.4, includeScore: true, ignoreLocation: true,
                    });
                }
                doSearch(document.getElementById('mdSearchInput').value);
            } else {
                await window.SummieDialogs.alert(SummieI18n.t('Hernoemen mislukt. Controleer of het bestand niet in gebruik is.'), { title: SummieI18n.t('Fout') });
            }
        });

        // Enter in name field → save name
        document.getElementById('mdEditName').addEventListener('keydown', e => {
            if (e.key === 'Enter') document.getElementById('mdSaveNameBtn').click();
        });

        // Description auto-save on blur
        document.getElementById('mdEditDesc').addEventListener('blur', async () => {
            if (!_editingDoc) return;
            _editingDoc.description = document.getElementById('mdEditDesc').value;
            await saveDocMeta(_editingDoc);
            const idx = _allDocs.findIndex(d => d.id === _editingDoc.id);
            if (idx !== -1) _allDocs[idx].description = _editingDoc.description;
        });

        // Tag input
        const tagInput = document.getElementById('mdTagInput');
        const suggestions = document.getElementById('mdTagSuggestions');

        tagInput.addEventListener('input', () => showTagSuggestions(tagInput.value.trim()));

        tagInput.addEventListener('keydown', e => {
            const items = suggestions.querySelectorAll('.md-tag-suggestion-item');
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                _tagTooltipIdx = Math.min(_tagTooltipIdx + 1, items.length - 1);
                items.forEach((el, i) => el.classList.toggle('active', i === _tagTooltipIdx));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                _tagTooltipIdx = Math.max(_tagTooltipIdx - 1, -1);
                items.forEach((el, i) => el.classList.toggle('active', i === _tagTooltipIdx));
            } else if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                if (_tagTooltipIdx >= 0 && items[_tagTooltipIdx]) {
                    selectTagSuggestion(items[_tagTooltipIdx].textContent);
                } else {
                    const val = tagInput.value.trim();
                    if (val) {
                        selectTagSuggestion(val);
                        saveKnownTag(val);
                    }
                }
            } else if (e.key === 'Escape') {
                suggestions.style.display = 'none';
                _tagTooltipIdx = -1;
            }
        });

        tagInput.addEventListener('blur', () => {
            setTimeout(() => { suggestions.style.display = 'none'; }, 150);
        });

        document.getElementById('mdAddTagBtn').addEventListener('click', () => {
            const val = tagInput.value.trim();
            if (val && _editingDoc) {
                if (!(_editingDoc.tags || []).includes(val)) {
                    _editingDoc.tags = [...(_editingDoc.tags || []), val];
                    renderEditTags(_editingDoc.tags);
                    saveKnownTag(val);
                    _setDirty(true);
                }
                tagInput.value = '';
                suggestions.style.display = 'none';
            }
        });

        // Track dirty state on any input change
        ['mdEditName', 'mdEditDesc'].forEach(id => {
            document.getElementById(id)?.addEventListener('input', () => _setDirty(true));
        });

        // Save / Open button (dual mode)
        document.getElementById('mdSaveBtn').addEventListener('click', async () => {
            if (!_editingDoc) return;

            if (!_isDirty) {
                // Open mode: load document data, then hand it to the editor.
                if (_editingDoc.path && window.electron) {
                    const result = await window.electron.loadSpecificFile(_editingDoc.path);
                    if (!result || !result.success) {
                        await window.SummieDialogs.alert(`Kon bestand niet openen:\n${result?.error || SummieI18n.t('Onbekende fout')}`, { title: SummieI18n.t('Fout') });
                        return;
                    }

                    if (window.electron.recentsAdd) {
                        await window.electron.recentsAdd({ ..._editingDoc, lastOpened: new Date().toISOString() });
                    }
                    localStorage.setItem('summie_pending_load', JSON.stringify({
                        data: result.data,
                        path: result.path || _editingDoc.path,
                        name: _editingDoc.name
                    }));
                    localStorage.setItem('summie_current_file_path', result.path || _editingDoc.path);
                    window.location.href = 'index.html';
                }
                return;
            }

            // Save mode
            _editingDoc.description = document.getElementById('mdEditDesc').value;
            await saveDocMeta(_editingDoc);
            const idx = _allDocs.findIndex(d => d.id === _editingDoc.id);
            if (idx !== -1) {
                _allDocs[idx].description = _editingDoc.description;
                _allDocs[idx].tags = _editingDoc.tags;
            }
            doSearch(document.getElementById('mdSearchInput').value);
            closeEditPanel();
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') closeEditPanel();
        });
    }

    function wireWindowControls() {
        // Preload exposes windowMinimize/windowMaximize (not windowMin/Max)
        document.getElementById('winMinimize')?.addEventListener('click', () => window.electron?.windowMinimize?.());
        document.getElementById('winMaximize')?.addEventListener('click', () => window.electron?.windowMaximize?.());
        document.getElementById('winClose')?.addEventListener('click', () => {
            if (window.electron?.navigateToLanding) window.electron.navigateToLanding();
        });

        // Preload exposes onWindowStateChanged(state) — query once for the
        // current state too, so the icon is correct right after opening.
        if (window.electron?.onWindowStateChanged) {
            const applyState = (state) => {
                const isMaximized = !!(state && state.maximized);
                const maxIcon = document.querySelector('.icon-maximize');
                const restoreIcon = document.querySelector('.icon-restore');
                if (maxIcon) maxIcon.style.display = isMaximized ? 'none' : 'block';
                if (restoreIcon) restoreIcon.style.display = isMaximized ? 'block' : 'none';
            };
            window.electron.onWindowStateChanged(applyState);
            window.electron.windowIsMaximized?.().then(applyState).catch(() => { });
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────────
    function escHtml(str) {
        // textContent→innerHTML escapes & < > but NOT quotes, which broke out
        // of attribute context (data-tag="…"). Escape quotes explicitly.
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function formatDate(date) {
        if (isNaN(date)) return '';
        const now = new Date(), diff = now - date, day = 86400000;
        if (diff < 60000) return SummieI18n.t('Zojuist');
        if (diff < 3600000) return `${Math.floor(diff / 60000)} min geleden`;
        if (diff < day) return `${Math.floor(diff / 3600000)} uur geleden`;
        if (diff < 2 * day) return SummieI18n.t('Gisteren');
        return date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
    }

})();