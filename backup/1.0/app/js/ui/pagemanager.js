// ==================== PAGE MANAGER ====================
// Manages optional multi-page mode for the editor.
// Default: single stretching page (paginationEnabled = false).
// When enabled: multiple A4 pages, each a separate contenteditable div.

(function () {
    let paginationEnabled = false;

    function getContainer() { return document.getElementById('pagesContainer'); }
    function getAllPages() { return Array.from(getContainer().querySelectorAll('.a4-page')); }
    function isPaginationEnabled() { return paginationEnabled; }

    function getActivePage() {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            let node = sel.getRangeAt(0).commonAncestorContainer;
            while (node && node !== document.body) {
                if (node.classList && node.classList.contains('a4-page')) return node;
                node = node.parentNode;
            }
        }
        return getAllPages()[0];
    }

    function getActivePageIndex() { return getAllPages().indexOf(getActivePage()); }

    // ==================== PAGE CREATION ====================
    function createPageElement(index) {
        const page = document.createElement('div');
        page.className = 'page a4-page';
        page.contentEditable = 'true';
        page.spellcheck = false;
        page.dataset.pageIndex = index;
        page.innerHTML = '<p><br></p>';
        addBadge(page, index);
        setupPageEvents(page);
        return page;
    }

    function addBadge(page, index) {
        if (!page.querySelector('.page-number-badge')) {
            const badge = document.createElement('span');
            badge.className = 'page-number-badge';
            badge.textContent = 'Pagina ' + (index + 1);
            page.appendChild(badge);
        }
    }

    function removeBadges() {
        document.querySelectorAll('.page-number-badge').forEach(function (b) { b.remove(); });
    }

    function setupPageEvents(page) {
        page.addEventListener('focus', function () { updatePageList(); });
        page.addEventListener('input', function () { updatePageList(); });
        page.addEventListener('keydown', function (e) {
            if (e.ctrlKey && e.altKey) {
                const all = getAllPages();
                const idx = all.indexOf(page);
                if (e.key === 'PageDown' && idx < all.length - 1) { e.preventDefault(); focusPage(idx + 1); }
                else if (e.key === 'PageUp' && idx > 0) { e.preventDefault(); focusPage(idx - 1); }
            }
        });
    }

    function focusPage(index) {
        const all = getAllPages();
        if (index < 0 || index >= all.length) return;
        const page = all[index];
        page.focus();
        const range = document.createRange();
        range.selectNodeContents(page);
        range.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        page.scrollIntoView({ behavior: 'smooth', block: 'center' });
        updatePageList();
    }

    // ==================== ENABLE / DISABLE ====================
    function enablePagination() {
        paginationEnabled = true;
        const container = getContainer();
        container.classList.add('pages-multi');

        const firstPage = getAllPages()[0];
        if (firstPage) { setupPageEvents(firstPage); addBadge(firstPage, 0); }

        const wrapper = document.getElementById('pageListWrapper');
        if (wrapper) wrapper.style.display = '';

        updateToggleButton();
        updatePageList();
        updateSidebarStatus();
        localStorage.setItem('summie_pagination_mode', '1');
        window.saveToLocalStorage && window.saveToLocalStorage();
    }

    function disablePagination() {
        paginationEnabled = false;
        const container = getContainer();

        // Merge all pages back into the first
        const all = getAllPages();
        if (all.length > 1) {
            const combined = all.map(function (p) {
                const clone = p.cloneNode(true);
                clone.querySelectorAll('.page-number-badge').forEach(function (b) { b.remove(); });
                return clone.innerHTML;
            }).join('\n');
            all[0].innerHTML = combined;
            for (let i = all.length - 1; i >= 1; i--) all[i].remove();
        }

        removeBadges();
        container.classList.remove('pages-multi');

        const wrapper = document.getElementById('pageListWrapper');
        if (wrapper) wrapper.style.display = 'none';
        const listEl = document.getElementById('pageList');
        if (listEl) listEl.innerHTML = '';

        rebuildPageIndices();
        updateToggleButton();
        updateSidebarStatus();
        localStorage.setItem('summie_pagination_mode', '0');
        window.saveToLocalStorage && window.saveToLocalStorage();
    }

    function togglePagination() {
        if (paginationEnabled) disablePagination(); else enablePagination();
    }

    function updateToggleButton() {
        const btn = document.getElementById('togglePaginationBtn');
        const label = document.getElementById('togglePaginationLabel');
        if (!btn || !label) return;
        if (paginationEnabled) {
            label.textContent = 'Paginering uitschakelen';
            btn.classList.add('btn-file-active');
        } else {
            label.textContent = 'Paginering inschakelen';
            btn.classList.remove('btn-file-active');
        }
    }

    function updateSidebarStatus() {
        const statusText = document.getElementById('paginationStatusText');
        if (!statusText) return;
        if (paginationEnabled) {
            const count = getAllPages().length;
            statusText.textContent = count + ' pagina' + (count !== 1 ? "'s" : '');
        } else {
            statusText.textContent = 'Één doorlopende pagina';
        }
    }

    // ==================== PAGE ACTIONS ====================
    function addPage() {
        if (!paginationEnabled) return;
        const container = getContainer();
        const index = getAllPages().length;
        const page = createPageElement(index);
        container.appendChild(page);
        rebuildPageIndices();
        updatePageList();
        updateSidebarStatus();
        focusPage(index);
        window.saveToLocalStorage && window.saveToLocalStorage();
    }

    function removePage(index) {
        if (!paginationEnabled) return;
        const all = getAllPages();
        if (all.length <= 1) {
            window.showNotification && window.showNotification('Kan niet verwijderen', 'Er moet minstens één pagina zijn.', 'warning');
            return;
        }
        if (all[index]) all[index].remove();
        rebuildPageIndices();
        updatePageList();
        updateSidebarStatus();
        focusPage(Math.min(index, getAllPages().length - 1));
        window.saveToLocalStorage && window.saveToLocalStorage();
    }

    function rebuildPageIndices() {
        getAllPages().forEach(function (page, i) {
            page.dataset.pageIndex = i;
            page.id = i === 0 ? 'editor' : '';
            if (paginationEnabled) {
                let badge = page.querySelector('.page-number-badge');
                if (!badge) { badge = document.createElement('span'); badge.className = 'page-number-badge'; page.appendChild(badge); }
                badge.textContent = 'Pagina ' + (i + 1);
            }
        });
        if (window.AppState) window.AppState.editor = document.getElementById('editor');
    }

    function updatePageList() {
        if (!paginationEnabled) return;
        const listEl = document.getElementById('pageList');
        if (!listEl) return;
        const all = getAllPages();
        const activeIdx = getActivePageIndex();
        listEl.innerHTML = '';

        all.forEach(function (page, i) {
            const item = document.createElement('div');
            item.className = 'page-list-item' + (i === activeIdx ? ' active' : '');
            item.innerHTML =
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
                '<polyline points="14 2 14 8 20 8"/></svg>' +
                '<span>Pagina ' + (i + 1) + '</span>' +
                '<button class="page-del-btn" title="Pagina verwijderen" data-index="' + i + '">' +
                '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>';
            item.addEventListener('click', function (e) {
                const delBtn = e.target.closest('.page-del-btn');
                if (delBtn) removePage(parseInt(delBtn.dataset.index));
                else focusPage(i);
            });
            listEl.appendChild(item);
        });

        updateSidebarStatus();
    }

    // ==================== SERIALIZATION ====================
    function getPagesData() {
        if (!paginationEnabled) return null;
        return getAllPages().map(function (page) {
            const clone = page.cloneNode(true);
            clone.querySelectorAll('.page-number-badge').forEach(function (b) { b.remove(); });
            return clone.innerHTML;
        });
    }

    function loadPagesData(pagesArray) {
        if (!pagesArray || !Array.isArray(pagesArray) || pagesArray.length === 0) return;
        if (!paginationEnabled) return;
        const container = getContainer();
        const existing = getAllPages();
        for (let i = existing.length - 1; i >= 1; i--) existing[i].remove();
        getAllPages()[0].innerHTML = pagesArray[0];
        for (let i = 1; i < pagesArray.length; i++) {
            const page = createPageElement(i);
            page.innerHTML = pagesArray[i];
            container.appendChild(page);
        }
        rebuildPageIndices();
        updatePageList();
        updateSidebarStatus();
    }

    // ==================== INIT ====================
    function init() {
        const container = getContainer();
        if (!container) return;

        // Read pagination mode (set by landing page or last session)
        const savedMode = localStorage.getItem('summie_pagination_mode');
        if (savedMode === '1') {
            paginationEnabled = true;
            container.classList.add('pages-multi');
            const firstPage = getAllPages()[0];
            if (firstPage) { setupPageEvents(firstPage); addBadge(firstPage, 0); }
            const wrapper = document.getElementById('pageListWrapper');
            if (wrapper) wrapper.style.display = '';
        }

        const addPageBtn = document.getElementById('addPageBtn');
        if (addPageBtn) addPageBtn.addEventListener('click', addPage);

        const toggleBtn = document.getElementById('togglePaginationBtn');
        if (toggleBtn) toggleBtn.addEventListener('click', togglePagination);

        document.addEventListener('selectionchange', function () { if (paginationEnabled) updatePageList(); });

        updateToggleButton();
        updateSidebarStatus();
        if (paginationEnabled) updatePageList();
    }

    window.PageManager = {
        init, enablePagination, disablePagination, togglePagination, isPaginationEnabled,
        addPage, removePage, focusPage, getAllPages, getPagesData, loadPagesData,
        updatePageList, rebuildPageIndices, updateSidebarStatus
    };
})();