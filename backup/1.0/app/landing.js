// ==================== SUMMIE LANDING SCREEN ====================
// Manages recent documents, current document preview, and navigation

const RECENT_KEY = 'summie_recent_docs';
const CURRENT_DATA_KEY = 'summaryData';
const MAX_RECENT = 20;

let contextTargetId = null; // ID of the doc the context menu is for

// ==================== RECENT DOCS STORAGE ====================

function getRecentDocs() {
    try {
        return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    } catch {
        return [];
    }
}

function saveRecentDocs(docs) {
    localStorage.setItem(RECENT_KEY, JSON.stringify(docs));
}

function addRecentDoc(entry) {
    // entry: { id, name, path, lastOpened, wordCount }
    let docs = getRecentDocs();
    // Remove existing entry with same path
    docs = docs.filter(d => d.path !== entry.path && d.id !== entry.id);
    // Add to front
    docs.unshift(entry);
    // Trim to max
    if (docs.length > MAX_RECENT) docs = docs.slice(0, MAX_RECENT);
    saveRecentDocs(docs);
}

function removeRecentDoc(id) {
    let docs = getRecentDocs().filter(d => d.id !== id);
    saveRecentDocs(docs);
}

function renameRecentDoc(id, newName) {
    let docs = getRecentDocs().map(d => d.id === id ? { ...d, name: newName } : d);
    saveRecentDocs(docs);
}

// ==================== CURRENT DOCUMENT PREVIEW ====================

function loadCurrentDocPreview() {
    const section = document.getElementById('currentDocSection');
    const previewTitle = document.getElementById('previewTitle');
    const previewBody = document.getElementById('previewBody');
    const currentDocName = document.getElementById('currentDocName');
    const currentDocDate = document.getElementById('currentDocDate');

    const raw = localStorage.getItem(CURRENT_DATA_KEY);
    if (!raw) {
        section.style.display = 'none';
        const quickActionsNone = document.getElementById('quickActionsSection');
        if (quickActionsNone) quickActionsNone.style.display = 'block';
        return;
    }

    try {
        const data = JSON.parse(raw);
        const content = data.content || '';

        // Extract title — check Summie's .style-title class first, then semantic headings
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = content;
        const heading = tempDiv.querySelector('.style-title, h1, h2, h3, h4, h5, h6');
        const titleText = heading ? heading.textContent.trim() : '';
        if (heading) heading.remove();
        const bodyHtml = tempDiv.innerHTML;

        previewBody.innerHTML = bodyHtml;

        // Resolve document name from file path (source of truth)
        const currentPath = localStorage.getItem('summie_current_file_path') || '';
        let docName = '';

        if (currentPath) {
            docName = currentPath.split('\\').pop().split('/').pop().replace('.sumd', '');
        }

        // Check recent docs for a custom name
        const recents = getRecentDocs();
        const matchingRecent = recents.find(d => d.path === currentPath);
        if (matchingRecent && matchingRecent.name) {
            docName = matchingRecent.name;
        }

        // Fall back to heading text, then generic label
        if (!docName) docName = titleText || 'Naamloos Document';

        // Both the A4 preview title AND the info panel name use the same resolved name
        previewTitle.textContent = docName;
        currentDocName.textContent = docName;

        // Check for unsaved changes
        const savedContent = localStorage.getItem('summie_saved_content');
        const hasUnsaved = savedContent !== null && content !== savedContent;

        // Format timestamp or show unsaved warning
        if (hasUnsaved) {
            currentDocDate.innerHTML = '<span style="color:#f59e0b;font-weight:500;">Niet opgeslagen wijzigingen</span>';
        } else if (data.timestamp) {
            const date = new Date(data.timestamp);
            currentDocDate.textContent = 'Laatst bewerkt: ' + formatDate(date);
        } else {
            currentDocDate.textContent = '';
        }

        section.style.display = 'block';
        const quickActionsBlock = document.getElementById('quickActionsSection');
        if (quickActionsBlock) quickActionsBlock.style.display = 'none';

        // Click to open
        document.getElementById('currentDocPreview').onclick = openCurrentDocument;
        document.getElementById('openCurrentBtn').onclick = openCurrentDocument;

    } catch (e) {
        section.style.display = 'none';
        const quickActionsCatch = document.getElementById('quickActionsSection');
        if (quickActionsCatch) quickActionsCatch.style.display = 'block';
    }
}

function openCurrentDocument() {
    // Navigate to editor
    navigateToEditor(null);
}

// ==================== RECENT DOCS LIST ==================== 

function formatDate(date) {
    const now = new Date();
    const diff = now - date;
    const day = 86400000;

    if (diff < 60000) return 'Zojuist';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} min geleden`;
    if (diff < day) return `${Math.floor(diff / 3600000)} uur geleden`;
    if (diff < 2 * day) return 'Gisteren';

    return date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
}

async function renderRecentDocs() {
    const list = document.getElementById('recentDocsList');
    const emptyMsg = document.getElementById('emptyRecent');
    let docs = getRecentDocs();

    // Remove existing items (keep emptyRecent)
    Array.from(list.children).forEach(c => {
        if (c.id !== 'emptyRecent') c.remove();
    });

    // In Electron: filter out docs whose file no longer exists on disk
    if (window.electron) {
        const existenceChecks = await Promise.all(
            docs.map(doc => doc.path ? window.electron.fileExists(doc.path) : Promise.resolve(true))
        );
        const missing = docs.filter((_, i) => !existenceChecks[i]);
        if (missing.length > 0) {
            // Remove missing docs from the stored list
            docs = docs.filter((_, i) => existenceChecks[i]);
            saveRecentDocs(docs);
        }
    }

    if (docs.length === 0) {
        emptyMsg.style.display = 'flex';
        return;
    }

    emptyMsg.style.display = 'none';

    docs.forEach(doc => {
        const item = document.createElement('div');
        item.className = 'recent-doc-item';
        item.dataset.id = doc.id;

        // Determine file type for icon and display name
        const filePath = doc.path || '';
        const ext = filePath.split('.').pop().toLowerCase();

        // Strip known extensions for display, keep full name for others
        let displayName;
        if (ext === 'sumd' || ext === 'json' || ext === 'docx') {
            const filename = filePath.split('\\').pop().split('/').pop();
            const stripped = filename.replace(/\.[^.]+$/, '');
            displayName = doc.name || stripped || 'Naamloos Document';
        } else {
            displayName = filePath ? filePath.split('\\').pop().split('/').pop() : (doc.name || 'Naamloos Document');
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

        item.innerHTML = `
            <div class="recent-doc-icon">${iconHtml}</div>
            <div class="recent-doc-info">
                <div class="recent-doc-name">${escapeHtml(displayName)}</div>
                ${doc.path ? `<div class="recent-doc-path">${escapeHtml(doc.path)}</div>` : ''}
            </div>
            <div class="recent-doc-date">${formatDate(new Date(doc.lastOpened))}</div>
            <button class="recent-doc-menu" title="Opties" data-id="${doc.id}">
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
    });
}

function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

// ==================== OPEN DOCUMENT ====================

async function openRecentDoc(doc) {
    if (doc.path && window.electron) {
        // Load from file
        const result = await window.electron.loadSpecificFile(doc.path);
        if (result.success) {
            // Store as current and navigate
            localStorage.setItem('summie_pending_load', JSON.stringify({
                data: result.data,
                path: result.path,
                name: doc.name
            }));
            // Update recent
            addRecentDoc({ ...doc, lastOpened: new Date().toISOString() });
            localStorage.setItem('summie_current_file_path', doc.path);
            navigateToEditor(result.data);
        } else {
            alert(`Kon bestand niet openen:\n${result.error || 'Onbekende fout'}`);
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
    addRecentDoc({
        id: generateId(),
        name: name,
        path: path,
        lastOpened: new Date().toISOString()
    });

    localStorage.setItem('summie_current_file_path', path);
    localStorage.setItem('summie_pending_load', JSON.stringify({ data, path, name }));
    navigateToEditor(data);
}

function navigateToEditor(data, isNew = false) {
    if (data) {
        localStorage.setItem('summie_pending_load', JSON.stringify({ data }));
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

function showRenameModal(docId) {
    const docs = getRecentDocs();
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
            const result = await window.electron.renameFile(doc.path, newPath);
            if (!result.success) {
                alert('Kon bestand niet hernoemen:\n' + (result.error || 'Onbekende fout'));
                closeRenameModal();
                return;
            }
            let allDocs = getRecentDocs().map(d =>
                d.id === docId ? { ...d, name: newName, path: newPath } : d
            );
            saveRecentDocs(allDocs);
            if (localStorage.getItem('summie_current_file_path') === doc.path) {
                localStorage.setItem('summie_current_file_path', newPath);
            }
        } else {
            renameRecentDoc(docId, newName);
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

document.addEventListener('DOMContentLoaded', async () => {
    loadCurrentDocPreview();
    await renderRecentDocs();

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
        winMaximize.title = isMaximized ? 'Terugzetten' : 'Maximaliseren';
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

    document.getElementById('ctxOpen').addEventListener('click', () => {
        const id = contextTargetId;
        hideContextMenu();
        const docs = getRecentDocs();
        const doc = docs.find(d => d.id === id);
        if (doc) openRecentDoc(doc);
    });

    document.getElementById('ctxShowInExplorer').addEventListener('click', () => {
        const id = contextTargetId;
        hideContextMenu();
        const docs = getRecentDocs();
        const doc = docs.find(d => d.id === id);
        if (doc && doc.path && window.electron) {
            window.electron.showInExplorer(doc.path);
        }
    });

    document.getElementById('ctxRemoveFromList').addEventListener('click', () => {
        const id = contextTargetId;
        hideContextMenu();
        if (confirm('Wil je dit document uit de lijst verwijderen?')) {
            removeRecentDoc(id);
            renderRecentDocs();
            loadCurrentDocPreview();
        }
    });

    document.getElementById('ctxDelete').addEventListener('click', async () => {
        const id = contextTargetId;
        hideContextMenu();
        const docs = getRecentDocs();
        const doc = docs.find(d => d.id === id);
        if (!doc) return;
        if (confirm(`Wil je "${doc.name || 'dit document'}" permanent verwijderen van de schijf? Dit kan niet ongedaan worden gemaakt.`)) {
            if (doc.path && window.electron) {
                try {
                    await window.electron.deleteFile(doc.path);
                } catch (e) { }
            }
            removeRecentDoc(id);
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
});