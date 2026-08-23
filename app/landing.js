// ==================== SUMMIE LANDING SCREEN ====================
// Manages recent documents, favourites, current document preview, and navigation

const CURRENT_DATA_KEY = 'summaryData';

let contextTargetId = null; // ID of the doc the context menu is for
let _cachedRecents = null;
let _cachedFavourites = null;
let _favouritePreviews = [];
let _allDocsCache = null;
let _searchFuse = null;
let _searchTimer = null;

// Pop-up shown when a document in the list can no longer be found on disk.
function _showMissingDocDialog(doc) {
    const existing = document.getElementById('missingDocOverlay');
    if (existing) existing.remove();

    const displayName = doc.name || (doc.path ? doc.path.split(/[\\/]/).pop().replace(/\.sumd$/i, '') : SummieI18n.t('Naamloos'));
    const displayPath = doc.path || '';

    const overlay = document.createElement('div');
    overlay.id = 'missingDocOverlay';
    overlay.style.cssText = [
        'position:fixed;inset:0;z-index:9999;',
        'background:rgba(15,23,42,0.4);',
        'backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);',
        'display:flex;align-items:center;justify-content:center;',
        'animation:mdFadeIn 0.15s ease;'
    ].join('');

    if (!document.getElementById('mdDialogStyles')) {
        const s = document.createElement('style');
        s.id = 'mdDialogStyles';
        s.textContent = [
            '@keyframes mdFadeIn{from{opacity:0}to{opacity:1}}',
            '@keyframes mdSlideUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}',
            '#mdDialog{animation:mdSlideUp 0.18s ease}',
            '.md-btn{transition:background 0.12s,box-shadow 0.12s,transform 0.08s}',
            '.md-btn:hover{transform:translateY(-1px)}',
            '.md-btn:active{transform:translateY(0)}',
            '.md-btn-primary:hover{background:var(--primary-hover)!important;box-shadow:0 4px 12px rgba(59,130,246,0.35)!important}',
            '.md-btn-ghost:hover{background:var(--border-light)!important}',
            '.md-btn-danger:hover{background:var(--danger-light)!important;color:var(--danger)!important}',
            '.md-btn-danger:hover svg{stroke:var(--danger)!important}'
        ].join('');
        document.head.appendChild(s);
    }

    const nameSafe = _landingEscapeHtml(displayName);
    const pathSafe = _landingEscapeHtml(displayPath);

    const dialog = document.createElement('div');
    dialog.id = 'mdDialog';
    dialog.style.cssText = [
        'background:var(--surface);',
        'border:1px solid var(--border);',
        'border-radius:16px;',
        'width:420px;max-width:calc(100vw - 32px);',
        'box-shadow:var(--shadow-lg),0 0 0 1px rgba(0,0,0,0.04);',
        'font-family:inherit;overflow:hidden;'
    ].join('');

    dialog.innerHTML = `
        <div style="display:flex;align-items:flex-start;gap:14px;padding:24px 24px 0;">
            <div style="width:40px;height:40px;border-radius:10px;flex-shrink:0;background:#fff7ed;border:1px solid #fed7aa;display:flex;align-items:center;justify-content:center;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
            </div>
            <div style="flex:1;min-width:0;">
                <div style="font-size:15px;font-weight:650;color:var(--text);margin-bottom:4px;letter-spacing:-0.2px;">Bestand niet gevonden</div>
                <div style="font-size:13px;color:var(--text-secondary);line-height:1.5;">
                    <span style="font-weight:600;color:var(--text);" title="${pathSafe}">${nameSafe}</span>
                    is verplaatst, hernoemd of verwijderd.
                </div>
            </div>
            <button id="mdCancel" class="md-btn md-btn-ghost" style="width:28px;height:28px;border-radius:7px;border:none;background:transparent;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:var(--text-tertiary);padding:0;margin-top:-2px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        </div>

        <div style="height:1px;background:var(--border-light);margin:20px 0 0;"></div>

        <div style="padding:12px 12px 12px;display:flex;flex-direction:column;gap:6px;">
            <button id="mdNewPath" class="md-btn md-btn-primary" style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:10px;border:none;cursor:pointer;background:var(--primary);color:#fff;text-align:left;width:100%;">
                <div style="width:32px;height:32px;border-radius:8px;flex-shrink:0;background:rgba(255,255,255,0.18);display:flex;align-items:center;justify-content:center;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                        <line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/>
                    </svg>
                </div>
                <div>
                    <div style="font-size:13px;font-weight:600;line-height:1.3;">Nieuw pad opgeven</div>
                    <div style="font-size:11px;opacity:0.8;margin-top:1px;">Zoek het bestand op en update de verwijzing</div>
                </div>
            </button>

            <button id="mdRemove" class="md-btn md-btn-danger" style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:10px;cursor:pointer;background:transparent;color:var(--text-secondary);border:1px solid var(--border);text-align:left;width:100%;">
                <div style="width:32px;height:32px;border-radius:8px;flex-shrink:0;background:var(--border-light);display:flex;align-items:center;justify-content:center;">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                    </svg>
                </div>
                <div>
                    <div style="font-size:13px;font-weight:600;line-height:1.3;">Verwijderen uit lijst</div>
                    <div style="font-size:11px;opacity:0.75;margin-top:1px;">Verwijdert ook uit favorieten</div>
                </div>
            </button>
        </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    const close = () => overlay.remove();

    overlay.querySelector('#mdNewPath').addEventListener('click', async () => {
        close();
        if (!window.electron) return;
        // Open dialog starting in the directory where the file was last seen
        const lastDir = doc.path ? doc.path.replace(/[\\/][^\\/]+$/, '') : null;
        const result = await (window.electron.openSumdFileAt
            ? window.electron.openSumdFileAt(lastDir)
            : window.electron.openSumdFile());
        if (!result.success) return;
        // Update the entry with the new path
        const newPath = result.path;
        const newName = newPath.split(/[\\/]/).pop().replace(/\.sumd$/i, '');
        const updatedDoc = { ...doc, path: newPath, name: newName, lastOpened: new Date().toISOString() };
        // Remove old entry, add updated one
        if (window.electron.recentsRemove) await window.electron.recentsRemove(doc.id);
        if (window.electron.recentsAdd) await window.electron.recentsAdd(updatedDoc);
        // Also fix in favourites if present
        const favs = await getFavourites();
        const favIdx = favs.findIndex(f => f.path === doc.path);
        if (favIdx !== -1) {
            favs[favIdx] = { ...favs[favIdx], path: newPath, name: newName };
            if (window.electron.favouritesSave) await window.electron.favouritesSave(favs);
        }
        // Now open the document
        localStorage.setItem('summie_current_file_path', newPath);
        navigateToEditor(result.data, false, newPath, newName);
    });

    overlay.querySelector('#mdRemove').addEventListener('click', async () => {
        close();
        // Remove from recents
        if (window.electron && window.electron.recentsRemove) {
            await window.electron.recentsRemove(doc.id);
        } else {
            // Fallback: localStorage
            const RECENT_KEY = 'summie_recent_docs';
            let docs = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
            docs = docs.filter(d => d.id !== doc.id);
            localStorage.setItem(RECENT_KEY, JSON.stringify(docs));
        }
        // Also remove from favourites
        await removeFavourite(doc.path);
        // Refresh the landing page lists
        await renderRecentDocs();
        await renderFavourites();
    });

    overlay.querySelector('#mdCancel').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
}

function _landingEscapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
let _searchState = {
    query: '',
    active: false,
    results: null,
    filters: {
        hasCodeblock: false,
        hasTable: false,
        hasImage: false,
        dateFrom: '',
        dateTo: '',
        minSize: '',
        maxSize: ''
    }
};

// ==================== UTILITIES ====================

function formatDate(date) {
    if (!date || isNaN(date)) return '';
    const now = new Date(), diff = now - date, day = 86400000;
    if (diff < 60000) return SummieI18n.t('Zojuist');
    if (diff < 3600000) return `${Math.floor(diff / 60000)} min geleden`;
    if (diff < day) return `${Math.floor(diff / 3600000)} uur geleden`;
    if (diff < 2 * day) return SummieI18n.t('Gisteren');
    if (diff < 7 * day) return `${Math.floor(diff / day)} dagen geleden`;
    return date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ==================== RECENT DOCS STORAGE (file-based) ====================

async function getRecentDocs() {
    if (window.electron && window.electron.recentsGet) {
        _cachedRecents = await window.electron.recentsGet();
        return _cachedRecents;
    }
    try { return JSON.parse(localStorage.getItem('summie_recent_docs') || '[]'); }
    catch { return []; }
}

async function saveRecentDocs(docs) {
    _cachedRecents = docs;
    _allDocsCache = null;
    _searchFuse = null;
    if (window.electron && window.electron.recentsSave) {
        await window.electron.recentsSave(docs);
    } else {
        localStorage.setItem('summie_recent_docs', JSON.stringify(docs));
    }
}

async function removeRecentDoc(id) {
    if (window.electron && window.electron.recentsRemove) {
        _cachedRecents = await window.electron.recentsRemove(id);
        _allDocsCache = null;
        _searchFuse = null;
    } else {
        const docs = (await getRecentDocs()).filter(d => d.id !== id);
        await saveRecentDocs(docs);
    }
}

async function renameRecentDoc(id, newName) {
    const docs = (await getRecentDocs()).map(d => d.id === id ? { ...d, name: newName } : d);
    await saveRecentDocs(docs);
}

// ==================== FAVOURITES STORAGE (file-based) ====================

async function getFavourites() {
    if (window.electron && window.electron.favouritesGet) {
        _cachedFavourites = await window.electron.favouritesGet();
        return _cachedFavourites;
    }
    return [];
}

async function saveFavourites(favs) {
    _cachedFavourites = favs;
    if (window.electron && window.electron.favouritesSave) {
        await window.electron.favouritesSave(favs);
    }
}

async function addFavourite(doc) {
    const favs = await getFavourites();
    if (favs.find(f => f.path === doc.path)) return; // already favourite
    favs.push({ id: doc.id, name: doc.name, path: doc.path });
    await saveFavourites(favs);
}

async function removeFavourite(path) {
    const favs = (await getFavourites()).filter(f => f.path !== path);
    await saveFavourites(favs);
}

async function getFavouritePathSet() {
    const favs = await getFavourites();
    return new Set(favs.map(f => f.path).filter(Boolean));
}

// ==================== MIGRATION: localStorage → file ====================
// Runs on every landing page load. Picks up any docs in localStorage that
// aren't in the file-based store yet (covers old installs and any code that
// still accidentally writes to localStorage).

async function migrateLocalStorageRecents() {
    if (!window.electron || !window.electron.recentsGet) return;

    let lsDocs = [];
    try {
        lsDocs = JSON.parse(localStorage.getItem('summie_recent_docs') || '[]');
    } catch { lsDocs = []; }

    if (lsDocs.length === 0) return;

    // Get what's already on disk
    const fileDocs = await window.electron.recentsGet();
    const filePaths = new Set(fileDocs.map(d => d.path).filter(Boolean));

    // Find docs in localStorage that aren't on disk yet
    const newDocs = lsDocs.filter(d => d.path && !filePaths.has(d.path));
    if (newDocs.length === 0) return;

    // Merge: file docs take priority (they're newer), append missing LS docs at the end
    const merged = [...fileDocs, ...newDocs]
        .sort((a, b) => new Date(b.lastOpened) - new Date(a.lastOpened))
        .slice(0, 10);

    await window.electron.recentsSave(merged);

    // Clear localStorage so this migration only runs once per doc
    localStorage.setItem('summie_recent_docs', '[]');
}

// ==================== CURRENT DOCUMENT PREVIEW ====================

async function loadCurrentDocPreview() {
    const section = document.getElementById('currentDocSection');
    const currentDocName = document.getElementById('currentDocName');
    const currentDocDate = document.getElementById('currentDocDate');

    const raw = localStorage.getItem(CURRENT_DATA_KEY);
    if (!raw) {
        section.style.display = 'none';
        const qs = document.getElementById('quickActionsSection');
        if (qs) qs.style.display = 'block';
        return;
    }

    try {
        const data = JSON.parse(raw);
        const content = data.content || '';

        // Extract document name
        const currentPath = localStorage.getItem('summie_current_file_path') || '';
        let docName = '';
        if (currentPath) {
            docName = currentPath.split('\\').pop().split('/').pop().replace(/\.sumd$/i, '');
        }
        const recents = await getRecentDocs();
        const matchingRecent = recents.find(d => d.path === currentPath);
        if (matchingRecent && matchingRecent.name) docName = matchingRecent.name;
        if (!docName) {
            const tmp = document.createElement('div');
            tmp.innerHTML = window.sanitizeSumdContent(content);
            const h = tmp.querySelector('.style-title, h1, h2, h3');
            docName = h ? h.textContent.trim() : SummieI18n.t('Naamloos Document');
        }

        currentDocName.textContent = docName;

        // Date / unsaved indicator
        const savedContent = localStorage.getItem('summie_saved_content');
        const hasUnsaved = savedContent !== null && content !== savedContent;
        if (hasUnsaved) {
            currentDocDate.innerHTML = '<span style="color:#f59e0b;font-weight:500;">Niet opgeslagen wijzigingen</span>';
        } else if (data.timestamp) {
            currentDocDate.textContent = 'Bewerkt: ' + formatDate(new Date(data.timestamp));
        } else {
            currentDocDate.textContent = '';
        }

        // Render preview using DocumentPreview
        const container = document.getElementById('docPreviewContainer');
        if (container && window.DocumentPreview) {
            // Reuse existing preview instance or create one
            if (!window._currentDocPreview) {
                window._currentDocPreview = new DocumentPreview(container);
            }
            window._currentDocPreview.loadFromData(data);
        }

        section.style.display = 'block';
        const qs = document.getElementById('quickActionsSection');
        if (qs) qs.style.display = 'none';

        document.getElementById('currentDocPreview').onclick = () => navigateToEditor(null);
        document.getElementById('openCurrentBtn').onclick = () => navigateToEditor(null);

    } catch (e) {
        section.style.display = 'none';
        const qs = document.getElementById('quickActionsSection');
        if (qs) qs.style.display = 'block';
    }
}


async function loadAllDocsForSearch() {
    const docs = await getRecentDocs();
    if (!docs.length) return [];

    // Read metadata from each .sumd file
    const enriched = await Promise.all(docs.map(async doc => {
        let description = '', tags = [], hasCodeblock = false, hasTable = false, hasImage = false, fileSize = 0;
        if (doc.path && window.electron) {
            try {
                const meta = await window.electron.readSumdMeta(doc.path);
                if (meta) { description = meta.description || ''; tags = meta.tags || []; }
                const scanResult = await window.electron.scanSumdElements(doc.path);
                if (scanResult) {
                    hasCodeblock = !!scanResult.hasCodeblock;
                    hasTable = !!scanResult.hasTable;
                    hasImage = !!scanResult.hasImage;
                    fileSize = scanResult.fileSize || 0;
                }
            } catch (e) { }
        }
        return { ...doc, description, tags, hasCodeblock, hasTable, hasImage, fileSize };
    }));

    _allDocsCache = enriched;

    if (window.Fuse) {
        _searchFuse = new window.Fuse(enriched, {
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

    return enriched;
}

function applyFilters(docs) {
    const f = _searchState.filters;
    return docs.filter(doc => {
        if (f.hasCodeblock && !doc.hasCodeblock) return false;
        if (f.hasTable && !doc.hasTable) return false;
        if (f.hasImage && !doc.hasImage) return false;
        if (f.dateFrom) {
            const from = new Date(f.dateFrom);
            if (new Date(doc.lastOpened) < from) return false;
        }
        if (f.dateTo) {
            const to = new Date(f.dateTo);
            to.setHours(23, 59, 59, 999);
            if (new Date(doc.lastOpened) > to) return false;
        }
        if (f.minSize && doc.fileSize < parseInt(f.minSize) * 1024) return false;
        if (f.maxSize && doc.fileSize > parseInt(f.maxSize) * 1024) return false;
        return true;
    });
}

async function doLandingSearch() {
    const q = _searchState.query.trim();
    const hasFilters = Object.values(_searchState.filters).some(v => v === true || (typeof v === 'string' && v !== ''));
    _searchState.active = !!(q || hasFilters);

    const favSection = document.getElementById('favouritesSection');

    if (!_searchState.active) {
        // Clear search — restore normal view
        _searchState.results = null;
        if (favSection) favSection.style.display = 'block';
        document.querySelector('.recent-docs-section h2').innerHTML = `
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            Recente documenten
            <span class="section-hint-inline">· sleep naar favorieten om vast te zetten</span>
        `;
        renderRecentDocs();
        return;
    }

    // Hide favourites while searching
    if (favSection) favSection.style.display = 'none';
    document.querySelector('.recent-docs-section h2').innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        Zoekresultaten
    `;

    // Show loader if scanning takes >0.5s
    let loaderTimer = null;
    const list = document.getElementById('recentDocsList');
    loaderTimer = setTimeout(() => {
        Array.from(list.children).forEach(c => { if (c.id !== 'emptyRecent') c.remove(); });
        if (!list.querySelector('.search-loader')) {
            const loader = document.createElement('div');
            loader.className = 'search-loader';
            loader.id = 'searchLoader';
            loader.innerHTML = `
                <div class="search-loader-spinner"></div>
                <span>Documenten doorzoeken...</span>
            `;
            list.prepend(loader);
        }
    }, 500);

    // Load+scan docs (cached after first run)
    let docs = _allDocsCache || await loadAllDocsForSearch();
    clearTimeout(loaderTimer);
    document.getElementById('searchLoader')?.remove();

    // Apply text search
    if (q && _searchFuse) {
        docs = _searchFuse.search(q).map(r => r.item);
    } else if (q) {
        const ql = q.toLowerCase();
        docs = docs.filter(d =>
            (d.name || '').toLowerCase().includes(ql) ||
            (d.description || '').toLowerCase().includes(ql) ||
            (d.tags || []).some(t => t.toLowerCase().includes(ql))
        );
    }

    // Apply element/date/size filters
    docs = applyFilters(docs);
    _searchState.results = docs;

    renderSearchResults(docs);
}

function renderSearchResults(docs) {
    const list = document.getElementById('recentDocsList');
    const emptyMsg = document.getElementById('emptyRecent');
    Array.from(list.children).forEach(c => { if (c.id !== 'emptyRecent' && c.id !== 'searchLoader') c.remove(); });

    if (docs.length === 0) {
        emptyMsg.style.display = 'flex';
        emptyMsg.querySelector('p').textContent = SummieI18n.t('Geen documenten gevonden');
        emptyMsg.querySelector('span').textContent = SummieI18n.t('Probeer een andere zoekterm of pas de filters aan.');
        return;
    }
    emptyMsg.style.display = 'none';

    docs.forEach(doc => {
        const item = document.createElement('div');
        item.className = 'recent-doc-item';
        item.dataset.id = doc.id;

        const displayName = doc.name || (doc.path ? doc.path.split(/[\\/]/).pop().replace(/\.sumd$/i, '') : SummieI18n.t('Naamloos'));
        const tagsHtml = (doc.tags || []).slice(0, 3).map(t => `<span class="rdi-tag">${escapeHtml(t)}</span>`).join('');

        item.innerHTML = `
            <div class="rdi-thumb"><img src="icon.png" width="24" height="24"></div>
            <div class="rdi-body">
                <div class="rdi-top">
                    <span class="rdi-name">${escapeHtml(displayName)}</span>
                    <span class="rdi-date">${escapeHtml(formatDate(new Date(doc.lastOpened)))}</span>
                </div>
                ${doc.description ? `<div class="rdi-desc">${escapeHtml(doc.description)}</div>` : ''}
                <div class="rdi-bottom">
                    <span class="rdi-path">${escapeHtml(doc.path || '')}</span>
                    ${tagsHtml ? `<div class="rdi-tags">${tagsHtml}</div>` : ''}
                </div>
            </div>
            <button class="recent-doc-menu" title="Opties" data-id="${escapeHtml(doc.id)}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
            </button>
        `;

        item.addEventListener('click', e => {
            if (e.target.closest('.recent-doc-menu')) return;
            openRecentDoc(doc);
        });

        item.querySelector('.recent-doc-menu').addEventListener('click', e => {
            e.stopPropagation();
            // showContextMenu expects the event (for positioning) + doc id —
            // passing raw coordinates here crashed every search-result menu.
            showContextMenu(e, doc.id);
        });

        list.appendChild(item);
    });
}

async function renderFavourites() {
    const section = document.getElementById('favouritesSection');
    const list = document.getElementById('favouritesList');
    if (!section || !list) return;

    const favs = await getFavourites();
    _favouritePreviews.forEach(preview => preview.destroy());
    _favouritePreviews = [];
    list.innerHTML = '';

    // Always show the section so it acts as a drop target
    section.style.display = 'block';

    if (favs.length === 0) {
        // Show a subtle empty drop zone
        const empty = document.createElement('div');
        empty.className = 'fav-empty-zone';
        empty.id = 'favEmptyZone';
        empty.textContent = SummieI18n.t('Sleep een document hiernaartoe om het toe te voegen aan favorieten');
        list.appendChild(empty);
        updateFavouriteScrollButton();
        return;
    }

    favs.forEach((fav, idx) => {
        const chip = document.createElement('div');
        chip.className = 'fav-doc-card';
        chip.dataset.path = fav.path;
        chip.dataset.idx = idx;
        chip.draggable = true;
        chip.title = fav.path || fav.name;

        chip.innerHTML = `
            <div class="fav-doc-preview" aria-hidden="true"></div>
            <div class="fav-doc-footer">
                <img src="icon.png" width="16" height="16" alt="" class="fav-doc-icon">
                <span class="fav-chip-name">${escapeHtml(fav.name || SummieI18n.t('Naamloos'))}</span>
                <button class="fav-chip-remove" title="Verwijder uit favorieten">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
        `;

        const previewContainer = chip.querySelector('.fav-doc-preview');
        if (previewContainer && fav.path && window.DocumentPreview) {
            const preview = new DocumentPreview(previewContainer);
            _favouritePreviews.push(preview);
            preview.loadFromFile(fav.path);
        }

        // Click to open
        chip.addEventListener('click', async e => {
            if (e.target.closest('.fav-chip-remove')) return;
            // Check if file still exists before trying to open it
            if (window.electron && window.electron.fileExists) {
                const exists = await window.electron.fileExists(fav.path);
                if (!exists) {
                    _showMissingDocDialog({ path: fav.path, name: fav.name, id: fav.id });
                    return;
                }
            }
            const docs = _cachedRecents || [];
            const doc = docs.find(d => d.path === fav.path);
            if (doc) openRecentDoc(doc);
            else openRecentDoc({ path: fav.path, name: fav.name, id: fav.id });
        });

        // Remove from favourites
        chip.querySelector('.fav-chip-remove').addEventListener('click', async e => {
            e.stopPropagation();
            await removeFavourite(fav.path);
            renderFavourites();
            if (!_searchState.active) renderRecentDocs();
        });

        // Drag to reorder within favourites
        chip.addEventListener('dragstart', e => {
            e.dataTransfer.setData('fav-idx', idx);
            e.dataTransfer.setData('type', 'fav-reorder');
            chip.classList.add('dragging');
        });
        chip.addEventListener('dragend', () => chip.classList.remove('dragging'));
        chip.addEventListener('dragover', e => {
            if (e.dataTransfer.types.includes('type')) e.preventDefault();
            chip.classList.add('drag-over');
        });
        chip.addEventListener('dragleave', () => chip.classList.remove('drag-over'));
        chip.addEventListener('drop', async e => {
            e.preventDefault();
            chip.classList.remove('drag-over');
            const type = e.dataTransfer.getData('type');
            if (type === 'fav-reorder') {
                const fromIdx = parseInt(e.dataTransfer.getData('fav-idx'));
                const toIdx = idx;
                if (fromIdx === toIdx) return;
                const favs = await getFavourites();
                const [moved] = favs.splice(fromIdx, 1);
                favs.splice(toIdx, 0, moved);
                await saveFavourites(favs);
                renderFavourites();
            } else if (type === 'recent-to-fav') {
                const docId = e.dataTransfer.getData('doc-id');
                const docs = await getRecentDocs();
                const doc = docs.find(d => d.id === docId);
                if (doc) {
                    await addFavourite(doc);
                    renderFavourites();
                    if (!_searchState.active) renderRecentDocs();
                }
            }
        });

        list.appendChild(chip);
    });

    // Drop zone hint at the end of the list
    const dropHint = document.createElement('div');
    dropHint.className = 'fav-drop-hint';
    dropHint.textContent = SummieI18n.t('+ Zet hier neer');
    dropHint.addEventListener('dragover', e => { e.preventDefault(); dropHint.classList.add('drag-over'); });
    dropHint.addEventListener('dragleave', () => dropHint.classList.remove('drag-over'));
    dropHint.addEventListener('drop', async e => {
        e.preventDefault();
        dropHint.classList.remove('drag-over');
        const type = e.dataTransfer.getData('type');
        if (type === 'recent-to-fav') {
            const docId = e.dataTransfer.getData('doc-id');
            const docs = await getRecentDocs();
            const doc = docs.find(d => d.id === docId);
            if (doc) {
                await addFavourite(doc);
                renderFavourites();
                if (!_searchState.active) renderRecentDocs();
            }
        }
    });
    list.appendChild(dropHint);
    updateFavouriteScrollButton();
}

function scrollFavouritesToNextSection() {
    const list = document.getElementById('favouritesList');
    if (!list) return;

    const firstCard = list.querySelector('.fav-doc-card');
    const cardWidth = firstCard ? firstCard.getBoundingClientRect().width : 220;
    const gap = parseFloat(getComputedStyle(list).columnGap || getComputedStyle(list).gap) || 12;
    const step = Math.max(cardWidth + gap, list.clientWidth - 32);

    list.scrollBy({ left: step, behavior: 'smooth' });
}

function updateFavouriteScrollButton() {
    const section = document.getElementById('favouritesSection');
    const list = document.getElementById('favouritesList');
    if (!section || !list) return;

    let button = section.querySelector('.fav-scroll-next');
    const canScroll = list.scrollWidth > list.clientWidth + 4;
    const canScrollNext = list.scrollLeft < list.scrollWidth - list.clientWidth - 4;

    if (!canScroll || !canScrollNext) {
        button?.remove();
        return;
    }

    if (!button) {
        button = document.createElement('button');
        button.className = 'fav-scroll-next';
        button.type = 'button';
        button.title = SummieI18n.t('Ga naar de volgende favorieten');
        button.setAttribute('aria-label', SummieI18n.t('Ga naar de volgende favorieten'));
        button.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 18l6-6-6-6"/>
            </svg>
        `;
        button.addEventListener('click', scrollFavouritesToNextSection);
        section.appendChild(button);
    }
}

// Also show favourites drop zone even when section is hidden
function initFavouritesDropZone() {
    const section = document.getElementById('favouritesSection');
    if (!section) return;

    section.addEventListener('dragover', e => {
        e.preventDefault();
        section.classList.add('drag-target');
        const emptyZone = document.getElementById('favEmptyZone');
        if (emptyZone) emptyZone.classList.add('drag-over');
    });
    section.addEventListener('dragleave', e => {
        // Only remove if leaving the section entirely
        if (!section.contains(e.relatedTarget)) {
            section.classList.remove('drag-target');
            const emptyZone = document.getElementById('favEmptyZone');
            if (emptyZone) emptyZone.classList.remove('drag-over');
        }
    });
    section.addEventListener('drop', async e => {
        e.preventDefault();
        section.classList.remove('drag-target');
        const emptyZone = document.getElementById('favEmptyZone');
        if (emptyZone) emptyZone.classList.remove('drag-over');
        const type = e.dataTransfer.getData('type');
        if (type === 'recent-to-fav') {
            const docId = e.dataTransfer.getData('doc-id');
            const docs = await getRecentDocs();
            const doc = docs.find(d => d.id === docId);
            if (doc) {
                await addFavourite(doc);
                renderFavourites();
                if (!_searchState.active) renderRecentDocs();
            }
        }
    });
}

async function renderRecentDocs() {
    const list = document.getElementById('recentDocsList');
    const emptyMsg = document.getElementById('emptyRecent');
    let docs = await getRecentDocs();

    // Remove existing items (keep emptyRecent)
    Array.from(list.children).forEach(c => {
        if (c.id !== 'emptyRecent') c.remove();
    });

    // In Electron: hide docs whose file no longer exists on disk — display
    // only. Never persist the filtered list: a temporarily unavailable drive
    // (USB/network share) would otherwise delete those recents permanently.
    if (window.electron) {
        const existenceChecks = await Promise.all(
            docs.map(doc => doc.path ? window.electron.fileExists(doc.path) : Promise.resolve(true))
        );
        docs = docs.filter((_, i) => existenceChecks[i]);
    }

    // Favourite documents should also show up in the recent documents list,
    // not only in the favourites strip. Merge in any favourites that aren't
    // already part of the recents list (display only — doesn't touch the
    // stored recents list itself).
    const favsForMerge = await getFavourites();
    const recentPaths = new Set(docs.map(d => d.path).filter(Boolean));
    const favOnlyDocs = favsForMerge
        .filter(f => f.path && !recentPaths.has(f.path))
        .map(f => ({
            id: f.id || ('fav-' + f.path),
            name: f.name,
            path: f.path,
            lastOpened: f.lastOpened || undefined
        }));

    // In Electron: filter out favourite-only docs whose file no longer exists
    let visibleFavOnlyDocs = favOnlyDocs;
    if (window.electron && favOnlyDocs.length > 0) {
        const favExistenceChecks = await Promise.all(
            favOnlyDocs.map(doc => window.electron.fileExists(doc.path))
        );
        visibleFavOnlyDocs = favOnlyDocs.filter((_, i) => favExistenceChecks[i]);
    }

    const visibleDocs = [...docs, ...visibleFavOnlyDocs];
    const favouritePaths = await getFavouritePathSet();

    if (visibleDocs.length === 0) {
        emptyMsg.style.display = 'flex';
        return;
    }

    emptyMsg.style.display = 'none';

    await Promise.all(visibleDocs.map(async doc => {
        const item = document.createElement('div');
        item.className = 'recent-doc-item';
        item.dataset.id = doc.id;
        item.draggable = true;

        item.addEventListener('dragstart', e => {
            e.dataTransfer.setData('type', 'recent-to-fav');
            e.dataTransfer.setData('doc-id', doc.id);
            item.classList.add('dragging');
        });
        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
        });

        // Determine file type for icon and display name
        const filePath = doc.path || '';
        const ext = filePath.split('.').pop().toLowerCase();

        // Strip known extensions for display, keep full name for others
        let displayName;
        if (ext === 'sumd' || ext === 'json' || ext === 'docx') {
            const filename = filePath.split('\\').pop().split('/').pop();
            const stripped = filename.replace(/\.[^.]+$/, '');
            displayName = doc.name || stripped || SummieI18n.t('Naamloos Document');
        } else {
            displayName = filePath ? filePath.split('\\').pop().split('/').pop() : (doc.name || SummieI18n.t('Naamloos Document'));
        }

        // Document-shaped icon with folded top-right corner
        function makeDocIcon(label, bgColor, borderColor, textColor) {
            const fold = 6, w = 22, h = 26;
            return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2 0 H${w - fold} L${w} ${fold} V${h - 2} Q${w} ${h} ${w - 2} ${h} H2 Q0 ${h} 0 ${h - 2} V2 Q0 0 2 0Z" fill="${bgColor}" stroke="${borderColor}" stroke-width="1"/>
                <path d="M${w - fold} 0 L${w - fold} ${fold} L${w} ${fold}" fill="none" stroke="${borderColor}" stroke-width="1"/>
                <text x="${w / 2}" y="17" text-anchor="middle" font-size="6" font-weight="700" fill="${textColor}" font-family="sans-serif">${label}</text>
            </svg>`;
        }

        let iconHtml;
        if (ext === 'sumd') {
            iconHtml = `<img src="icon.png" width="22" height="22" style="object-fit:contain;display:block;border-radius:4px;" alt="Summie">`;
        } else if (ext === 'json') {
            iconHtml = makeDocIcon('JSON', '#f0fdf4', '#86efac', '#16a34a');
        } else if (ext === 'docx') {
            iconHtml = makeDocIcon('DOCX', '#eff6ff', '#93c5fd', '#2563eb');
        } else {
            iconHtml = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>`;
        }

        // Read description and tags from .sumd if available
        let description = doc.description || '';
        let tags = doc.tags || [];
        if (!description && doc.path && window.electron && window.electron.readSumdMeta) {
            try {
                const meta = await window.electron.readSumdMeta(doc.path);
                if (meta) { description = meta.description || ''; tags = meta.tags || []; }
            } catch (e) { }
        }

        const tagsHtml = tags.slice(0, 3).map(t =>
            `<span class="rdi-tag">${escapeHtml(t)}</span>`
        ).join('');

        const isFav = doc.path && favouritePaths.has(doc.path);

        item.innerHTML = `
            <div class="rdi-thumb">
                ${iconHtml}
            </div>
            <div class="rdi-body">
                <div class="rdi-top">
                    <span class="rdi-name">${escapeHtml(displayName)}</span>
                    <span class="rdi-date">${escapeHtml(formatDate(new Date(doc.lastOpened)))}</span>
                </div>
                ${description ? `<div class="rdi-desc">${escapeHtml(description)}</div>` : ''}
                <div class="rdi-bottom">
                    <span class="rdi-path">${escapeHtml(doc.path || '')}</span>
                    ${tagsHtml ? `<div class="rdi-tags">${tagsHtml}</div>` : ''}
                </div>
            </div>
            ${isFav ? `<span class="rdi-fav-badge" title="Favoriet">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
            </span>` : ''}
            <button class="recent-doc-menu" title="Opties" data-id="${escapeHtml(doc.id)}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>
                </svg>
            </button>
        `;

        item.addEventListener('click', (e) => {
            if (e.target.closest('.recent-doc-menu')) return;
            openRecentDoc(doc);
        });

        item.querySelector('.recent-doc-menu').addEventListener('click', (e) => {
            e.stopPropagation();
            showContextMenu(e, doc.id);
        });

        list.appendChild(item);
    }));
}

// ==================== OPEN DOCUMENT ====================

async function openRecentDoc(doc) {
    if (doc.path && window.electron) {
        // Load from file
        const result = await window.electron.loadSpecificFile(doc.path);
        if (result.success) {
            // Update recent
            await window.electron.recentsAdd({ ...doc, lastOpened: new Date().toISOString() });
            localStorage.setItem('summie_current_file_path', doc.path);
            navigateToEditor(result.data, false, result.path, doc.name);
        } else {
            _showMissingDocDialog(doc);
        }
    } else {
        // localStorage-only doc (no file path) - just open editor with current data
        navigateToEditor(null);
    }
}

async function openNewDocument(paginated = false) {
    // Clear pending loads, navigate to editor with fresh state
    localStorage.removeItem('summie_pending_load');
    localStorage.removeItem('summie_current_file_path');
    // Signal new doc and pagination preference
    localStorage.setItem('summie_new_document', '1');
    localStorage.setItem('summie_pagination_mode', paginated ? '1' : '0');
    navigateToEditor(null, true);
}

async function openNewDocumentPaginated() {
    return openNewDocument(true);
}

async function openFromFile() {
    if (!window.electron) return;

    const result = await window.electron.openSumdFile();
    if (!result.success) return;

    const data = result.data;
    const path = result.path;
    const name = path.split('\\').pop().split('/').pop().replace('.sumd', '');

    // Save to recent
    if (window.electron && window.electron.recentsAdd) window.electron.recentsAdd({
        id: generateId(),
        name: name,
        path: path,
        lastOpened: new Date().toISOString()
    });

    localStorage.setItem('summie_current_file_path', path);
    navigateToEditor(data, false, path, name);
}

function navigateToEditor(data, isNew = false, path = null, name = null) {
    if (data) {
        const pending = { data };
        if (path) pending.path = path;
        if (name) pending.name = name;
        localStorage.setItem('summie_pending_load', JSON.stringify(pending));
    }
    if (isNew) {
        localStorage.setItem('summie_new_document', '1');
    }
    window.location.href = 'index.html';
}

// ==================== CONTEXT MENU ====================

function showContextMenu(e, docId) {
    e.preventDefault();
    contextTargetId = docId;
    const menu = document.getElementById('contextMenu');
    menu.style.display = 'block';

    // Position
    const x = Math.min(e.clientX, window.innerWidth - 180);
    const y = Math.min(e.clientY, window.innerHeight - 160);
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
}

function hideContextMenu() {
    document.getElementById('contextMenu').style.display = 'none';
    contextTargetId = null;
}

// ==================== RENAME MODAL ====================

async function showRenameModal(docId) {
    const docs = await getRecentDocs();
    const doc = docs.find(d => d.id === docId);
    if (!doc) return;

    const modal = document.getElementById('renameModal');
    const input = document.getElementById('renameInput');
    const ext = doc.path ? '.' + doc.path.split('.').pop() : '';
    const baseName = doc.name || (doc.path ? doc.path.split('\\').pop().split('/').pop().replace(/\.[^.]+$/, '') : '');
    input.value = baseName;
    modal.style.display = 'flex';
    setTimeout(() => input.select(), 50);

    document.getElementById('confirmRename').onclick = async () => {
        const newName = input.value.trim();
        if (!newName) { closeRenameModal(); return; }

        if (doc.path && window.electron) {
            const sep = doc.path.includes('\\') ? '\\' : '/';
            const dir = doc.path.substring(0, doc.path.lastIndexOf(sep) + 1);
            const newPath = dir + newName + ext;

            // Warn before overwriting an existing target
            try {
                if (newPath !== doc.path && await window.electron.fileExists(newPath)) {
                    const ok = await window.SummieDialogs.confirm(
                        SummieI18n.t('Er bestaat al een bestand met deze naam. Overschrijven?'),
                        { title: SummieI18n.t('Overschrijven'), confirmText: SummieI18n.t('Overschrijven'), cancelText: SummieI18n.t('Annuleren'), danger: true }
                    );
                    if (!ok) { closeRenameModal(); return; }
                }
            } catch (e) { /* dialog unavailable — proceed without the extra guard */ }

            const result = await window.electron.renameFile(doc.path, newPath);
            if (!result.success) {
                await window.SummieDialogs.alert(SummieI18n.t('Kon bestand niet hernoemen:') + '\n' + (result.error || SummieI18n.t('Onbekende fout')), { title: SummieI18n.t('Hernoemen mislukt') });
                closeRenameModal();
                return;
            }
            // update-doc-path keeps recents, known docs AND favourites in sync
            // in one atomic step (hand-rolled recents rewriting left stale
            // favourite chips pointing at the old path).
            try { await window.electron.updateDocPath(doc.path, newPath, newName); } catch (e) { /* non-fatal */ }
            if (localStorage.getItem('summie_current_file_path') === doc.path) {
                localStorage.setItem('summie_current_file_path', newPath);
            }
        } else {
            await renameRecentDoc(docId, newName);
        }

        renderRecentDocs();
        loadCurrentDocPreview();
        closeRenameModal();
    };
}

function closeRenameModal() {
    document.getElementById('renameModal').style.display = 'none';
}

// ==================== HELPERS ====================

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ==================== INIT ====================

// Fills in every on-screen version display from window.appInfo.version, which
// itself comes from package.json (see preload.js) — one place to update.
function applyAppVersionToUI() {
    const version = window.appInfo && window.appInfo.version;
    if (!version) return;
    const badge = document.getElementById('appVersionBadge');
    if (badge) badge.textContent = `v${version}`;
    const settingsVersion = document.getElementById('settingsVersion');
    if (settingsVersion) settingsVersion.textContent = `v${version}`;
}

// ==================== UPDATER ====================

function initUpdater() {
    if (!window.electron) return;

    const modal = document.getElementById('updateModal');
    const currentVersionEl = document.getElementById('updateCurrentVersion');
    const latestVersionEl = document.getElementById('updateLatestVersion');
    const versionCompare = document.getElementById('updateVersionCompare');
    const progressContainer = document.getElementById('updateProgress');
    const progressText = document.getElementById('updateProgressText');
    const progressPercent = document.getElementById('updateProgressPercent');
    const progressTrack = document.getElementById('updateProgressTrack');
    const progressBar = document.getElementById('updateProgressBar');
    const downloadBtn = document.getElementById('updateDownloadBtn');
    const downloadBtnText = document.getElementById('updateDownloadBtnText');
    const installBtn = document.getElementById('updateInstallBtn');
    const dismissBtn = document.getElementById('updateDismissBtn');
    const changelogBtn = document.getElementById('updateChangelogBtn');
    const dismissOption = document.getElementById('updateDismissOption');
    const dismissCheckbox = document.getElementById('updateDismissCheckbox');

    if (!modal) return;

    let updateInfo = null;

    function showModal(info) {
        updateInfo = info;
        currentVersionEl.textContent = `v${window.appInfo?.version || '?'}`;
        latestVersionEl.textContent = `v${info.version}`;
        versionCompare.style.display = 'flex';
        progressContainer.style.display = 'none';
        progressTrack.classList.remove('is-indeterminate');
        progressPercent.textContent = '';
        progressBar.style.width = '0%';
        downloadBtn.style.display = 'inline-flex';
        downloadBtn.disabled = false;
        downloadBtnText.textContent = t('Downloaden');
        installBtn.style.display = 'none';
        dismissBtn.textContent = t('Later');
        dismissBtn.disabled = false;
        changelogBtn.style.display = 'inline-flex';
        if (dismissCheckbox) dismissCheckbox.checked = false;
        if (dismissOption) dismissOption.style.display = '';
        modal.style.display = 'flex';
    }

    function hideModal() {
        modal.style.display = 'none';
        updateInfo = null;
    }

    // When the "don't ask again for this update" box is ticked, remember the
    // dismissed version so the updater can skip it on future checks.
    function persistDismissIfRequested() {
        if (dismissCheckbox && dismissCheckbox.checked && updateInfo && updateInfo.version) {
            window.electron.settingsSet({ dismissedUpdateVersion: updateInfo.version }).catch(() => {});
        }
    }

    // Shows the progress card in place of the version-compare row. These are
    // siblings inside #updateModalContent, so only the version-compare row
    // gets hidden here — the progress card (and its loader bar) stays visible.
    function showProgress(message, indeterminate = false) {
        versionCompare.style.display = 'none';
        if (dismissOption) dismissOption.style.display = 'none';
        progressContainer.style.display = 'block';
        progressText.textContent = message;
        if (indeterminate) {
            progressTrack.classList.add('is-indeterminate');
            progressPercent.textContent = '';
            progressBar.style.width = '0%';
        } else {
            progressTrack.classList.remove('is-indeterminate');
        }
    }

    function updateProgress(percent) {
        progressTrack.classList.remove('is-indeterminate');
        const rounded = Math.round(percent);
        progressBar.style.width = `${rounded}%`;
        progressPercent.textContent = `${rounded}%`;
    }

    // Fallback screen — only used if the automatic install (after download
    // completes) fails, so the person still has a way to trigger it manually.
    function showInstallButton() {
        showProgress(t('Update gedownload'), false);
        progressTrack.classList.remove('is-indeterminate');
        downloadBtn.style.display = 'none';
        installBtn.style.display = 'inline-flex';
        installBtn.disabled = false;
        installBtn.querySelector('span').textContent = t('Installeren en herstarten');
        dismissBtn.textContent = t('Annuleren');
        dismissBtn.disabled = false;
        changelogBtn.style.display = 'none';
    }

    window.electron.onUpdateAvailable((info) => {
        if (!modal.style.display || modal.style.display === 'none') {
            showModal(info);
        }
    });

    window.electron.onDownloadProgress((progress) => {
        if (progress && typeof progress.percent === 'number') {
            showProgress(t('Downloaden van update...'));
            updateProgress(progress.percent);
        }
    });

    // Download finished: no extra confirmation screen — move straight to
    // installing so the person doesn't have to click through it twice.
    window.electron.onUpdateDownloaded((info) => {
        changelogBtn.style.display = 'none';
        downloadBtn.style.display = 'none';
        dismissBtn.disabled = true;
        showProgress(t('Update gedownload — Summie herstart zo...'), false);
        updateProgress(100);

        setTimeout(async () => {
            try {
                await window.electron.quitAndInstall();
            } catch (err) {
                showInstallButton();
            }
        }, 900);
    });

    window.electron.onUpdaterError((info) => {
        if (info && info.error) {
            alert(t('Update-fout: ' + info.error));
        }
    });

    downloadBtn.addEventListener('click', async () => {
        downloadBtn.disabled = true;
        downloadBtnText.textContent = t('Downloaden...');
        changelogBtn.style.display = 'none';
        showProgress(t('Update voorbereiden...'), true);
        await window.electron.downloadUpdate();
    });

    installBtn.addEventListener('click', async () => {
        installBtn.disabled = true;
        installBtn.querySelector('span').textContent = t('Installeren...');
        await window.electron.quitAndInstall();
    });

    dismissBtn.addEventListener('click', () => {
        if (dismissBtn.disabled) return;
        persistDismissIfRequested();
        hideModal();
    });

    changelogBtn.addEventListener('click', () => {
        if (updateInfo && updateInfo.html_url) {
            window.electron.shell.openExternal(updateInfo.html_url);
        } else if (updateInfo) {
            // Fallback to repo releases page
            window.electron.shell.openExternal('https://github.com/ThermedWolf/Summie-Docs/releases');
        }
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            persistDismissIfRequested();
            hideModal();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.style.display === 'flex') {
            persistDismissIfRequested();
            hideModal();
        }
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    applyAppVersionToUI();

    // Initialize updater listeners
    initUpdater();

    // Animate the loading bar while content loads
    const loaderBar = document.getElementById('summieLoaderBar');
    if (loaderBar) {
        loaderBar.style.width = '30%';
        setTimeout(() => { loaderBar.style.width = '65%'; }, 200);
    }

    await loadCurrentDocPreview();
    await migrateLocalStorageRecents();
    await renderRecentDocs();
    await renderFavourites();
    initFavouritesDropZone();

    const favouritesList = document.getElementById('favouritesList');
    if (favouritesList) {
        favouritesList.addEventListener('scroll', updateFavouriteScrollButton, { passive: true });
        window.addEventListener('resize', updateFavouriteScrollButton);
    }

    // Hide loader with a short fade after content is ready
    if (loaderBar) loaderBar.style.width = '100%';
    setTimeout(() => {
        const loader = document.getElementById('summieLoader');
        if (loader) {
            loader.classList.add('summie-loader-done');
            setTimeout(() => loader.remove(), 400);
        }
    }, 150);

    // Action card buttons (inside current-doc section)
    document.getElementById('newDocBtn').addEventListener('click', () => openNewDocument(false));
    document.getElementById('openDocBtn').addEventListener('click', openFromFile);
    const newDocPaginatedBtn = document.getElementById('newDocPaginatedBtn');
    if (newDocPaginatedBtn) newDocPaginatedBtn.addEventListener('click', () => openNewDocument(true));

    // Action card buttons (quick-actions section, shown when no current doc)
    const newDocBtnAlt = document.getElementById('newDocBtnAlt');
    const openDocBtnAlt = document.getElementById('openDocBtnAlt');
    if (newDocBtnAlt) newDocBtnAlt.addEventListener('click', () => openNewDocument(false));
    if (openDocBtnAlt) openDocBtnAlt.addEventListener('click', openFromFile);
    const newDocPaginatedBtnAlt = document.getElementById('newDocPaginatedBtnAlt');
    if (newDocPaginatedBtnAlt) newDocPaginatedBtnAlt.addEventListener('click', () => openNewDocument(true));

    // Window controls
    const winMinimize = document.getElementById('winMinimize');
    const winMaximize = document.getElementById('winMaximize');
    const winClose = document.getElementById('winClose');
    if (winMinimize && window.electron) winMinimize.addEventListener('click', () => window.electron.windowMinimize());
    if (winMaximize && window.electron) winMaximize.addEventListener('click', () => window.electron.windowMaximize());
    if (winClose && window.electron) winClose.addEventListener('click', () => window.electron.windowClose());

    // Maximize/restore icon + title sync
    const setMaximizeState = (isMaximized) => {
        if (!winMaximize) return;
        const iconMax = winMaximize.querySelector('.icon-maximize');
        const iconRestore = winMaximize.querySelector('.icon-restore');
        if (iconMax) iconMax.style.display = isMaximized ? 'none' : '';
        if (iconRestore) iconRestore.style.display = isMaximized ? '' : 'none';
        winMaximize.title = isMaximized ? SummieI18n.t('Terugzetten') : SummieI18n.t('Maximaliseren');
    };

    if (window.electron) {
        // Sync initial state
        window.electron.windowIsMaximized().then(setMaximizeState);
        // Listen for state changes
        window.electron.onWindowStateChanged(state => {
            if (state.maximized !== undefined) setMaximizeState(state.maximized);
        });
        // Report maximize button rect for Windows snap layouts flyout
        if (winMaximize) {
            const reportRect = () => {
                const r = winMaximize.getBoundingClientRect();
                window.electron.setMaximizeBtnRect({
                    left: Math.round(r.left), top: Math.round(r.top),
                    right: Math.round(r.right), bottom: Math.round(r.bottom),
                });
            };
            requestAnimationFrame(() => requestAnimationFrame(reportRect));
            window.addEventListener('resize', reportRect);
        }
    }

    // Context menu actions
    document.getElementById('ctxRename').addEventListener('click', () => {
        const id = contextTargetId;
        hideContextMenu();
        showRenameModal(id);
    });

    document.getElementById('ctxOpen').addEventListener('click', async () => {
        const id = contextTargetId;
        hideContextMenu();
        const docs = await getRecentDocs();
        const doc = docs.find(d => d.id === id);
        if (doc) openRecentDoc(doc);
    });

    document.getElementById('ctxShowInExplorer').addEventListener('click', async () => {
        const id = contextTargetId;
        hideContextMenu();
        const docs = await getRecentDocs();
        const doc = docs.find(d => d.id === id);
        if (doc && doc.path && window.electron) {
            window.electron.showInExplorer(doc.path);
        }
    });

    document.getElementById('ctxRemoveFromList').addEventListener('click', async () => {
        const id = contextTargetId;
        hideContextMenu();
        const ok = await window.SummieDialogs.confirm(SummieI18n.t('Wil je dit document uit de lijst verwijderen?'), {
            title: SummieI18n.t('Document verwijderen uit lijst'),
            confirmText: SummieI18n.t('Verwijderen'),
            cancelText: SummieI18n.t('Annuleren'),
            danger: true
        });
        if (ok) {
            await removeRecentDoc(id);
            renderRecentDocs();
            loadCurrentDocPreview();
        }
    });

    document.getElementById('ctxDelete').addEventListener('click', async () => {
        const id = contextTargetId;
        hideContextMenu();
        const docs = await getRecentDocs();
        const doc = docs.find(d => d.id === id);
        if (!doc) return;
        const ok = await window.SummieDialogs.confirm(
            SummieI18n.t('Dit verwijdert het bestand van de schijf en kan niet ongedaan worden gemaakt.'),
            {
                title: `"${doc.name || SummieI18n.t('dit document')}" permanent verwijderen?`,
                confirmText: SummieI18n.t('Verwijderen'),
                cancelText: SummieI18n.t('Annuleren'),
                danger: true
            }
        );
        if (ok) {
            if (doc.path && window.electron) {
                const result = await window.electron.deleteFile(doc.path);
                if (!result || !result.success) {
                    await window.SummieDialogs.alert(`Verwijderen mislukt: ${result?.error || SummieI18n.t('Onbekende fout')}`, { title: SummieI18n.t('Fout') });
                    return;
                }
            }
            await removeRecentDoc(id);
            renderRecentDocs();
            loadCurrentDocPreview();
        }
    });

    // Close rename modal
    document.getElementById('closeRenameModal').addEventListener('click', closeRenameModal);
    document.getElementById('cancelRename').addEventListener('click', closeRenameModal);

    // Close modal on overlay click
    document.getElementById('renameModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeRenameModal();
    });

    // Close context menu on outside click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.context-menu') && !e.target.closest('.recent-doc-menu')) {
            hideContextMenu();
        }
    });

    // Keyboard
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideContextMenu();
            closeRenameModal();
        }
        if (e.key === 'Enter' && document.getElementById('renameModal').style.display !== 'none') {
            document.getElementById('confirmRename').click();
        }
    });

    // Manage documents button
    const manageBtn = document.getElementById('manageDocsBtnMain');
    if (manageBtn) {
        manageBtn.addEventListener('click', () => {
            if (window.electron && window.electron.navigateToManage) {
                window.electron.navigateToManage();
            }
        });
    }

    // ── Search bar ─────────────────────────────────────────────────────────
    const landingSearch = document.getElementById('landingSearchInput');
    const landingClear = document.getElementById('landingSearchClear');

    if (landingSearch) {
        landingSearch.addEventListener('input', () => {
            _searchState.query = landingSearch.value;
            landingClear.style.display = landingSearch.value ? 'flex' : 'none';
            clearTimeout(_searchTimer);
            _searchTimer = setTimeout(doLandingSearch, 250);
        });

        landingClear.addEventListener('click', () => {
            landingSearch.value = '';
            landingClear.style.display = 'none';
            _searchState.query = '';
            doLandingSearch();
        });
    }

    // Filter toggle button
    const filterToggleBtn = document.getElementById('landingFilterToggle');
    const filtersBar = document.getElementById('landingFilters');
    if (filterToggleBtn && filtersBar) {
        filterToggleBtn.addEventListener('click', () => {
            const open = filtersBar.style.display !== 'none';
            filtersBar.style.display = open ? 'none' : 'flex';
            filterToggleBtn.classList.toggle('active', !open);
        });
    }

    // Filter toggles
    ['filterCodeblock', 'filterTable', 'filterImage'].forEach(id => {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.addEventListener('click', () => {
            const key = { filterCodeblock: 'hasCodeblock', filterTable: 'hasTable', filterImage: 'hasImage' }[id];
            _searchState.filters[key] = !_searchState.filters[key];
            btn.classList.toggle('active', _searchState.filters[key]);
            clearTimeout(_searchTimer);
            _searchTimer = setTimeout(doLandingSearch, 100);
        });
    });

    ['filterDateFrom', 'filterDateTo'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('change', () => {
            const key = id === 'filterDateFrom' ? 'dateFrom' : 'dateTo';
            _searchState.filters[key] = el.value;
            clearTimeout(_searchTimer);
            _searchTimer = setTimeout(doLandingSearch, 100);
        });
    });

    ['filterSizeMin', 'filterSizeMax'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', () => {
            const key = id === 'filterSizeMin' ? 'minSize' : 'maxSize';
            _searchState.filters[key] = el.value;
            clearTimeout(_searchTimer);
            _searchTimer = setTimeout(doLandingSearch, 400);
        });
    });

    const clearFiltersBtn = document.getElementById('clearFiltersBtn');
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', () => {
            _searchState.filters = { hasCodeblock: false, hasTable: false, hasImage: false, dateFrom: '', dateTo: '', minSize: '', maxSize: '' };
            ['filterCodeblock', 'filterTable', 'filterImage'].forEach(id => document.getElementById(id)?.classList.remove('active'));
            ['filterDateFrom', 'filterDateTo', 'filterSizeMin', 'filterSizeMax'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
            clearTimeout(_searchTimer);
            doLandingSearch();
        });
    }

    // ── Settings ──────────────────────────────────────────────────────────
    await initSettings();
});

async function initSettings() {
    if (!window.electron) return;

    const settings = await window.electron.settingsGet();

    const langSelect = document.getElementById('settingLanguage');
    const autoSaveNew = document.getElementById('settingAutoSaveNew');
    const dirRow = document.getElementById('settingDirRow');
    const dirPath = document.getElementById('settingDirPath');
    const pickDirBtn = document.getElementById('settingPickDir');
    const closeToHome = document.getElementById('settingCloseToHome');
    const numberLocale = document.getElementById('settingNumberLocale');
    const themeSelect = document.getElementById('settingTheme');
    const overlay = document.getElementById('settingsOverlay');
    const gearBtn = document.getElementById('landingSettingsBtn');
    const closeBtn = document.getElementById('settingsCloseBtn');

    if (!langSelect || !overlay) return;

    // Populate UI from saved settings
    langSelect.value = settings.language || 'nl';
    autoSaveNew.checked = !!settings.autoSaveNewFiles;
    dirPath.textContent = settings.newFilesDirectory || '/Documents';
    dirRow.style.display = settings.autoSaveNewFiles ? '' : 'none';
    if (closeToHome) closeToHome.checked = settings.closeToHome !== false;
    if (numberLocale) numberLocale.value = settings.numberLocale || 'eu';
    if (themeSelect) themeSelect.value = settings.theme || 'system';

    // Gear spin on hover — always finishes, 1s cooldown after
    let _gearCooling = false;
    gearBtn.addEventListener('mouseenter', () => {
        if (_gearCooling || gearBtn.classList.contains('spinning')) return;
        gearBtn.classList.add('spinning');
        gearBtn.addEventListener('animationend', function onEnd() {
            gearBtn.classList.remove('spinning');
            gearBtn.removeEventListener('animationend', onEnd);
            _gearCooling = true;
            setTimeout(() => { _gearCooling = false; }, 1000);
        }, { once: true });
    });

    // Open / close overlay
    function openSettings() {
        overlay.classList.add('settings-overlay--open');
    }
    function closeSettings() {
        overlay.classList.remove('settings-overlay--open');
    }

    gearBtn.addEventListener('click', openSettings);
    closeBtn.addEventListener('click', closeSettings);

    // Close on backdrop click
    overlay.addEventListener('click', e => {
        if (e.target === overlay) closeSettings();
    });

    // Close on Escape
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && overlay.classList.contains('settings-overlay--open')) {
            closeSettings();
        }
    });

    // Number locale
    if (numberLocale) {
        numberLocale.addEventListener('change', async () => {
            await window.electron.settingsSet({ numberLocale: numberLocale.value });
        });
    }

    // Theme
    if (themeSelect) {
        themeSelect.addEventListener('change', async () => {
            const theme = themeSelect.value;
            if (window.SummieTheme) window.SummieTheme.setPreference(theme);
            await window.electron.settingsSet({ theme });
        });
    }

    // Close to home
    if (closeToHome) {
        closeToHome.addEventListener('change', async () => {
            await window.electron.settingsSet({ closeToHome: closeToHome.checked });
        });
    }

    // Language — the settings overlay is rendered once at page load, so a
    // change needs a reload to re-render JS-generated strings (recents, etc.)
    langSelect.addEventListener('change', async () => {
        await window.electron.settingsSet({ language: langSelect.value });
        if (window.SummieI18n) window.SummieI18n.setLang(langSelect.value);
        location.reload();
    });

    // Auto-save new files toggle
    autoSaveNew.addEventListener('change', async () => {
        const enabled = autoSaveNew.checked;
        await window.electron.settingsSet({ autoSaveNewFiles: enabled });
        dirRow.style.display = enabled ? '' : 'none';
    });

    // Directory picker
    pickDirBtn.addEventListener('click', async () => {
        const chosen = await window.electron.settingsPickDirectory();
        if (chosen) {
            dirPath.textContent = chosen;
            await window.electron.settingsSet({ newFilesDirectory: chosen });
        }
    });
}