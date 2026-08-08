// ==================== PAGE MANAGER ====================
// Word-style pagination, first pass: fixed A4 pages with block-based overflow.

(function () {
    'use strict';

    let paginationEnabled = false;
    let reflowTimer = null;
    let isReflowing = false;
    const CURSOR_MARKER_ID = 'summie-pagination-cursor';
    const PAGE_BREAK_CLASS = 'summie-page-break';

    function getContainer() { return document.getElementById('pagesContainer'); }
    function getAllPages() { return Array.from(getContainer()?.querySelectorAll('.a4-page') || []); }
    function isPaginationEnabled() { return paginationEnabled; }

    function contentNodes(page) {
        return Array.from(page.childNodes).filter(node => {
            return !(node.nodeType === Node.ELEMENT_NODE && node.classList.contains('page-number-badge'));
        });
    }

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

    function getActivePageIndex() { return Math.max(0, getAllPages().indexOf(getActivePage())); }

    function createPageElement(index) {
        const page = document.createElement('div');
        page.className = 'page a4-page';
        page.contentEditable = 'true';
        page.spellcheck = false;
        page.dataset.pageIndex = index;
        setupPageEvents(page);
        addBadge(page, index);
        return page;
    }

    function addBadge(page, index) {
        let badge = page.querySelector(':scope > .page-number-badge');
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'page-number-badge';
            badge.contentEditable = 'false';
            badge.setAttribute('aria-hidden', 'true');
            page.appendChild(badge);
        }
        badge.contentEditable = 'false';
        badge.setAttribute('aria-hidden', 'true');
        const label = 'Pagina ' + (index + 1);
        if (badge.textContent !== label) badge.textContent = label;
    }

    function setupPageEvents(page) {
        if (page._paginationBound) return;
        page._paginationBound = true;
        page.addEventListener('mousedown', e => {
            if (e.target.closest('.page-number-badge')) {
                e.preventDefault();
                placeCursorInPage(page);
                return;
            }
            if (e.target === page && isPageVisuallyEmpty(page)) {
                e.preventDefault();
                placeCursorInPage(page);
            }
        });
        page.addEventListener('focus', () => {
            setTimeout(() => {
                const sel = window.getSelection();
                const node = sel && sel.anchorNode;
                const el = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
                if (el?.closest?.('.page-number-badge')) placeCursorInPage(page);
                updatePageList();
            }, 0);
        });
        page.addEventListener('input', () => scheduleReflow());
        page.addEventListener('keydown', e => {
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                if (!paginationEnabled) {
                    document.execCommand('insertParagraph', false, null);
                    return;
                }
                insertPageBreak();
                return;
            }
            if (e.ctrlKey && e.altKey) {
                const idx = getAllPages().indexOf(page);
                if (e.key === 'PageDown') { e.preventDefault(); focusPage(idx + 1); }
                if (e.key === 'PageUp') { e.preventDefault(); focusPage(idx - 1); }
            }
        });
    }

    function placeCursorInPage(page) {
        appendEmptyParagraph(page);
        const target = contentNodes(page).find(node => {
            return !(node.nodeType === Node.ELEMENT_NODE && node.classList.contains(PAGE_BREAK_CLASS));
        }) || page;
        page.focus();
        const range = document.createRange();
        if (target.nodeType === Node.TEXT_NODE) range.setStart(target, target.textContent.length);
        else range.selectNodeContents(target);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }

    function isPageVisuallyEmpty(page) {
        const clone = page.cloneNode(true);
        clone.querySelectorAll('.page-number-badge, .' + PAGE_BREAK_CLASS + ', #' + CURSOR_MARKER_ID).forEach(el => el.remove());
        return !clone.textContent.replace(/\u00a0/g, ' ').trim()
            && !clone.querySelector('img, table, .code-block-wrapper, .summie-textbox, .summie-shape-wrapper');
    }

    function markCursor() {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return false;
        const range = sel.getRangeAt(0);
        const page = getActivePage();
        if (!page || !page.contains(range.commonAncestorContainer)) return false;
        const marker = document.createElement('span');
        marker.id = CURSOR_MARKER_ID;
        marker.style.display = 'inline-block';
        marker.style.width = '0';
        marker.style.overflow = 'hidden';
        marker.textContent = '\u200b';
        range.insertNode(marker);
        return true;
    }

    function restoreCursor() {
        const marker = document.getElementById(CURSOR_MARKER_ID);
        if (!marker) return;
        const range = document.createRange();
        range.setStartBefore(marker);
        range.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        marker.remove();
    }

    function collectNodes() {
        const nodes = [];
        getAllPages().forEach(page => {
            contentNodes(page).forEach(node => nodes.push(node));
        });
        return nodes.filter(node => {
            if (node.nodeType === Node.TEXT_NODE) return node.textContent !== '';
            return true;
        });
    }

    function clearPagesKeepFirst() {
        const container = getContainer();
        const all = getAllPages();
        all.forEach((page, i) => {
            contentNodes(page).forEach(node => node.remove());
            if (i > 0) page.remove();
        });
        const first = getAllPages()[0] || createPageElement(0);
        if (!first.parentNode) container.appendChild(first);
        return first;
    }

    function clearPageContentKeepPages() {
        const container = getContainer();
        const pages = getAllPages();
        pages.forEach(page => contentNodes(page).forEach(node => node.remove()));
        const first = pages[0] || createPageElement(0);
        if (!first.parentNode) container.appendChild(first);
        return first;
    }

    function getOrCreatePage(index) {
        const pages = getAllPages();
        if (pages[index]) return pages[index];
        const container = getContainer();
        const page = createPageElement(index);
        container.appendChild(page);
        return page;
    }

    function trimUnusedPages(lastUsedIndex) {
        getAllPages().forEach((page, index) => {
            if (index > lastUsedIndex) page.remove();
        });
    }

    function appendEmptyParagraph(page) {
        if (contentNodes(page).length > 0) return;
        const p = document.createElement('p');
        p.appendChild(document.createElement('br'));
        const badge = page.querySelector(':scope > .page-number-badge');
        if (badge) page.insertBefore(p, badge);
        else page.appendChild(p);
    }

    function createNextPage() {
        const container = getContainer();
        const page = createPageElement(getAllPages().length);
        container.appendChild(page);
        return page;
    }

    function isOverflowing(page) {
        return page.scrollHeight > page.clientHeight + 2;
    }

    function reflowNow(preserveCursor = true) {
        if (!paginationEnabled || isReflowing) return;
        isReflowing = true;
        const hadCursor = preserveCursor ? markCursor() : false;
        const nodes = collectNodes();
        let pageIndex = 0;
        let page = clearPageContentKeepPages();

        nodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains(PAGE_BREAK_CLASS)) {
                page.appendChild(node);
                pageIndex += 1;
                page = getOrCreatePage(pageIndex);
                return;
            }

            page.appendChild(node);
            if (isOverflowing(page) && contentNodes(page).length > 1) {
                node.remove();
                pageIndex += 1;
                page = getOrCreatePage(pageIndex);
                page.appendChild(node);
            }
        });

        appendEmptyParagraph(page);
        trimUnusedPages(pageIndex);
        rebuildPageIndices();
        updatePageList();
        updateSidebarStatus();
        if (hadCursor) restoreCursor();
        window.updateInhoudList?.();
        window.updateActiveInhoudItem?.();
        isReflowing = false;
    }

    function scheduleReflow() {
        if (!paginationEnabled || isReflowing) return;
        clearTimeout(reflowTimer);
        reflowTimer = setTimeout(() => {
            reflowNow(true);
            window.updateUnsavedIndicator?.();
        }, 90);
    }

    function getCurrentBlock() {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return null;
        let node = sel.getRangeAt(0).commonAncestorContainer;
        if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
        return node?.closest?.('p, h1, h2, h3, h4, h5, h6, li, table, .code-block-wrapper, .editable-image-wrapper, .summie-textbox, .summie-shape-wrapper');
    }

    function createCursorParagraph() {
        const p = document.createElement('p');
        p.dataset.paginationCursorTarget = 'true';
        const cursor = document.createElement('span');
        cursor.id = CURSOR_MARKER_ID;
        cursor.style.display = 'inline-block';
        cursor.style.width = '0';
        cursor.style.overflow = 'hidden';
        cursor.textContent = '\u200b';
        p.appendChild(cursor);
        p.appendChild(document.createElement('br'));
        return p;
    }

    function gentlyRevealPageBreakTarget() {
        const target = document.querySelector('[data-pagination-cursor-target="true"]');
        if (!target) return;
        target.removeAttribute('data-pagination-cursor-target');
        const scroller = document.querySelector('.document-section');
        if (!scroller) {
            target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return;
        }
        const targetTop = target.getBoundingClientRect().top;
        const scrollerTop = scroller.getBoundingClientRect().top;
        const comfortableOffset = 96;
        const nextTop = scroller.scrollTop + targetTop - scrollerTop - comfortableOffset;
        scroller.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' });
    }

    function insertPageBreak() {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;
        const marker = document.createElement('div');
        marker.className = PAGE_BREAK_CLASS;
        marker.contentEditable = 'false';
        marker.dataset.manual = 'true';
        marker.style.display = 'none';
        const cursorParagraph = createCursorParagraph();
        const block = getCurrentBlock();
        const activePage = getActivePage();
        if (block && block !== activePage && activePage?.contains(block) && !block.classList.contains('page-number-badge')) {
            block.after(marker, cursorParagraph);
        } else {
            const fragment = document.createDocumentFragment();
            fragment.appendChild(marker);
            fragment.appendChild(cursorParagraph);
            const range = sel.getRangeAt(0);
            range.collapse(false);
            range.insertNode(fragment);
        }
        reflowNow(false);
        restoreCursor();
        gentlyRevealPageBreakTarget();
        updatePageList();
        window.updateUnsavedIndicator?.();
        window.saveToLocalStorage?.();
    }

    function updatePageBreakButton() {
        document.querySelectorAll('.page-break-edit-control').forEach(el => {
            if (!paginationEnabled) {
                el.style.display = 'none';
                return;
            }
            el.style.display = el.classList.contains('toolbar-group') ? 'flex' : 'block';
        });
    }

    function insertPageBreakFromButton() {
        if (!paginationEnabled) return;
        const sel = window.getSelection();
        const activePage = getActivePage();
        const node = sel && sel.rangeCount ? sel.getRangeAt(0).commonAncestorContainer : null;
        if (activePage && (!node || !activePage.contains(node))) placeCursorInPage(activePage);
        insertPageBreak();
    }

    function focusPage(index) {
        const all = getAllPages();
        if (index < 0 || index >= all.length) return;
        const page = all[index];
        placeCursorInPage(page);
        page.scrollIntoView({ behavior: 'smooth', block: 'center' });
        updatePageList();
    }

    function enablePagination() {
        paginationEnabled = true;
        const container = getContainer();
        container.classList.add('pages-multi');
        getAllPages().forEach((page, i) => { setupPageEvents(page); addBadge(page, i); });
        getAllPages().forEach(appendEmptyParagraph);
        const wrapper = document.getElementById('pageListWrapper');
        if (wrapper) wrapper.style.display = '';
        localStorage.setItem('summie_pagination_mode', '1');
        updateToggleButton();
        updatePageBreakButton();
        reflowNow(false);
        window.saveToLocalStorage?.();
    }

    function disablePagination() {
        paginationEnabled = false;
        const container = getContainer();
        const nodes = collectNodes().filter(node => !(node.nodeType === Node.ELEMENT_NODE && node.classList.contains(PAGE_BREAK_CLASS)));
        const first = clearPagesKeepFirst();
        nodes.forEach(node => first.appendChild(node));
        appendEmptyParagraph(first);
        getAllPages().forEach(page => page.querySelector(':scope > .page-number-badge')?.remove());
        container.classList.remove('pages-multi');
        document.getElementById('pageListWrapper')?.style && (document.getElementById('pageListWrapper').style.display = 'none');
        const list = document.getElementById('pageList');
        if (list) list.innerHTML = '';
        rebuildPageIndices();
        updateToggleButton();
        updatePageBreakButton();
        updateSidebarStatus();
        localStorage.setItem('summie_pagination_mode', '0');
        window.saveToLocalStorage?.();
    }

    function togglePagination() {
        if (paginationEnabled) disablePagination(); else enablePagination();
    }

    function addPage() {
        if (!paginationEnabled) return;
        insertPageBreak();
    }

    function removePage(index) {
        if (!paginationEnabled || index <= 0) return;
        const pages = getAllPages();
        const page = pages[index];
        const prev = pages[index - 1];
        if (!page || !prev) return;
        const breakBeforePage = Array.from(prev.querySelectorAll(':scope > .' + PAGE_BREAK_CLASS)).pop();
        if (breakBeforePage) breakBeforePage.remove();
        contentNodes(page).forEach(node => prev.appendChild(node));
        page.remove();
        reflowNow(false);
        window.saveToLocalStorage?.();
    }

    function rebuildPageIndices() {
        getAllPages().forEach((page, i) => {
            page.dataset.pageIndex = i;
            page.id = i === 0 ? 'editor' : '';
            if (paginationEnabled) addBadge(page, i);
        });
        if (window.AppState) window.AppState.editor = document.getElementById('editor');
    }

    function updateToggleButton() {
        const btn = document.getElementById('togglePaginationBtn');
        const label = document.getElementById('togglePaginationLabel');
        if (!btn || !label) return;
        label.textContent = paginationEnabled ? 'Paginering uitschakelen' : 'Paginering inschakelen';
        btn.classList.toggle('btn-file-active', paginationEnabled);
        updatePageBreakButton();
    }

    function updateSidebarStatus() {
        const statusText = document.getElementById('paginationStatusText');
        if (!statusText) return;
        if (!paginationEnabled) statusText.textContent = 'Een doorlopende pagina';
        else {
            const count = getAllPages().length;
            statusText.textContent = count + ' pagina' + (count !== 1 ? "'s" : '');
        }
    }

    function updatePageList() {
        const listEl = document.getElementById('pageList');
        if (!listEl) return;
        listEl.innerHTML = '';
        if (!paginationEnabled) return;
        const activeIdx = getActivePageIndex();
        getAllPages().forEach((page, i) => {
            const item = document.createElement('div');
            item.className = 'page-list-item' + (i === activeIdx ? ' active' : '');
            item.innerHTML =
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
                '<polyline points="14 2 14 8 20 8"/></svg>' +
                '<span>Pagina ' + (i + 1) + '</span>' +
                (i > 0 ? '<button class="page-del-btn" title="Pagina-einde verwijderen" data-index="' + i + '">x</button>' : '');
            item.addEventListener('click', e => {
                const del = e.target.closest('.page-del-btn');
                if (del) removePage(parseInt(del.dataset.index, 10));
                else focusPage(i);
            });
            listEl.appendChild(item);
        });
    }

    function getPagesData() {
        if (!paginationEnabled) return null;
        return getAllPages().map(page => {
            const clone = page.cloneNode(true);
            clone.querySelectorAll('.page-number-badge').forEach(b => b.remove());
            return clone.innerHTML;
        });
    }

    function loadPagesData(pagesArray) {
        if (!pagesArray || !Array.isArray(pagesArray) || pagesArray.length === 0) return;
        paginationEnabled = true;
        getContainer().classList.add('pages-multi');
        const first = clearPagesKeepFirst();
        first.innerHTML = pagesArray[0];
        for (let i = 1; i < pagesArray.length; i++) {
            const br = document.createElement('div');
            br.className = PAGE_BREAK_CLASS;
            br.contentEditable = 'false';
            br.style.display = 'none';
            first.appendChild(br);
            const tmp = document.createElement('div');
            tmp.innerHTML = pagesArray[i];
            Array.from(tmp.childNodes).forEach(node => first.appendChild(node));
        }
        reflowNow(false);
    }

    function init() {
        const container = getContainer();
        if (!container) return;
        getAllPages().forEach(setupPageEvents);
        if (localStorage.getItem('summie_pagination_mode') === '1') enablePagination();
        else {
            updateSidebarStatus();
            updatePageBreakButton();
        }
        document.getElementById('addPageBtn')?.addEventListener('click', addPage);
        document.getElementById('togglePaginationBtn')?.addEventListener('click', togglePagination);
        document.getElementById('insertPageBreakBtn')?.addEventListener('click', insertPageBreakFromButton);
        document.addEventListener('selectionchange', () => { if (paginationEnabled) updatePageList(); });
    }

    window.PageManager = {
        init, enablePagination, disablePagination, togglePagination, isPaginationEnabled,
        addPage, removePage, focusPage, getAllPages, getPagesData, loadPagesData,
        updatePageList, rebuildPageIndices, updateSidebarStatus, scheduleReflow, insertPageBreak
    };
})();
