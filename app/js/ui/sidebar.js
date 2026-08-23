// ==================== SIDEBAR ====================
// updateInhoudList, updateActiveInhoudItem, switchTab, scroll tracking.

// Level priority: lower number = higher in hierarchy
const LEVEL_ORDER = { title: 1, subtitle: 2, kop1: 3, kop2: 4, kop3: 5 };

// Collapsed groups: set of heading-N ids that are collapsed.
// On first load the set is populated with ALL collapsible parents, then
// the path to the active heading is removed so only that branch is open.
const _collapsed = new Set(
    JSON.parse(localStorage.getItem('summie_sidebar_collapsed') || 'null') ?? []
);
let _collapsedInitialized = !!localStorage.getItem('summie_sidebar_collapsed');

function _saveCollapsed() {
    try { localStorage.setItem('summie_sidebar_collapsed', JSON.stringify([..._collapsed])); } catch { }
}

function _styleOf(el) {
    return el.dataset.style ||
        ([...el.classList].find(c => c.startsWith('style-')) || '').replace('style-', '');
}

function _hasChildren(headings, idx) {
    const myLevel = LEVEL_ORDER[_styleOf(headings[idx])] ?? 99;
    for (let i = idx + 1; i < headings.length; i++) {
        const childLevel = LEVEL_ORDER[_styleOf(headings[i])] ?? 99;
        if (childLevel <= myLevel) break;
        if (childLevel > myLevel) return true;
    }
    return false;
}

// Returns the set of heading ids that are ancestors of the given index
function _ancestorIds(headings, activeIdx) {
    if (activeIdx < 0) return new Set();
    const ancestors = new Set();
    const activeLevel = LEVEL_ORDER[_styleOf(headings[activeIdx])] ?? 99;
    for (let i = activeIdx - 1; i >= 0; i--) {
        const level = LEVEL_ORDER[_styleOf(headings[i])] ?? 99;
        if (level < activeLevel) {
            ancestors.add('heading-' + i);
            // Keep walking up to find grandparents
        }
    }
    // Also add the active heading itself if it has children
    if (_hasChildren(headings, activeIdx)) {
        ancestors.add('heading-' + activeIdx);
    }
    return ancestors;
}

// Returns the index of the heading currently in focus: the last one whose top
// has crossed the vertical center of the document viewport, so the highlight
// matches what the user is actually looking at. At the very top the first
// heading is always active; at the very bottom the last one.
function _computeActiveIndex(headings, documentSection) {
    if (!documentSection || headings.length === 0) return -1;

    const tolerance = 4;
    if (documentSection.scrollTop <= tolerance) return 0;
    if (
        documentSection.scrollTop + documentSection.clientHeight >=
        documentSection.scrollHeight - tolerance
    ) {
        return headings.length - 1;
    }

    const rect = documentSection.getBoundingClientRect();
    const focusLine = rect.top + rect.height / 2;

    let activeIndex = -1;
    headings.forEach((heading, index) => {
        if (heading.getBoundingClientRect().top <= focusLine) {
            activeIndex = index;
        }
    });
    return activeIndex;
}

function updateInhoudList() {
    const { editor, inhoudList } = window.AppState;
    inhoudList.innerHTML = '';

    const allStyled = editor.querySelectorAll('[class*="style-"], [data-style]');

    const headings = Array.from(allStyled).filter(el => {
        if (el.closest('.summie-toc')) return false;
        const styleKey = _styleOf(el);
        if (!styleKey || styleKey === 'normal') return false;
        return el.textContent.trim().length > 0;
    });

    if (headings.length === 0) {
inhoudList.innerHTML = '<p class="empty-state">' + SummieI18n.t('Geen koppen gevonden. Gebruik de stijlopties om koppen toe te voegen.') + '</p>';
    return;
    }

    // Stamp stable ids
    headings.forEach((heading, index) => {
        heading.dataset.headingId = 'heading-' + index;
    });

    // Determine active heading index (shared logic with scroll tracking)
    const documentSection = document.querySelector('.document-section');
    const activeIndex = _computeActiveIndex(headings, documentSection);

    // On first load: collapse ALL parents, then open the path to the active heading
    if (!_collapsedInitialized) {
        _collapsedInitialized = true;
        headings.forEach((heading, index) => {
            if (_hasChildren(headings, index)) {
                _collapsed.add('heading-' + index);
            }
        });
        // Open ancestors of active heading
        const ancestors = _ancestorIds(headings, activeIndex);
        ancestors.forEach(id => _collapsed.delete(id));
        _saveCollapsed();
    } else {
        // On subsequent renders: ensure the active heading's ancestors are open
        const ancestors = _ancestorIds(headings, activeIndex);
        let changed = false;
        ancestors.forEach(id => {
            if (_collapsed.has(id)) { _collapsed.delete(id); changed = true; }
        });
        if (changed) _saveCollapsed();
    }

    // Build items
    headings.forEach((heading, index) => {
        const styleKey = _styleOf(heading);
        const id = 'heading-' + index;
        const hasChildren = _hasChildren(headings, index);
        const isCollapsed = _collapsed.has(id);

        const item = document.createElement('div');
        item.className = `inhoud-item level-${styleKey}${hasChildren ? ' has-children' : ''}${isCollapsed ? ' is-collapsed' : ''}`;
        item.dataset.headingId = id;
        item.dataset.level = LEVEL_ORDER[styleKey] ?? 99;

        if (hasChildren) {
            const chevron = document.createElement('span');
            chevron.className = 'inhoud-chevron';
            chevron.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
            chevron.addEventListener('click', e => {
                e.stopPropagation();
                _toggleCollapse(id, item);
            });
            item.appendChild(chevron);
        }

        const label = document.createElement('span');
        label.className = 'inhoud-label';
        label.textContent = heading.textContent;
        item.appendChild(label);

        item.addEventListener('click', () => {
            heading.scrollIntoView({ behavior: 'smooth', block: 'center' });
            heading.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
            setTimeout(() => { heading.style.backgroundColor = ''; }, 1000);
        });

        inhoudList.appendChild(item);
    });

    _applyAllCollapsed();

    if (inhoudList.children.length === 0) {
        inhoudList.innerHTML = '<p class="empty-state">' + SummieI18n.t('Geen koppen gevonden. Gebruik de stijlopties om koppen toe te voegen.') + '</p>';
        return;
    }

    updateActiveInhoudItem();
}

function _toggleCollapse(id, item) {
    const isNowCollapsed = !_collapsed.has(id);
    if (isNowCollapsed) {
        _collapsed.add(id);
        item.classList.add('is-collapsed');
    } else {
        _collapsed.delete(id);
        item.classList.remove('is-collapsed');
    }
    _saveCollapsed();
    _applyAllCollapsed();
}

function _applyAllCollapsed() {
    const { inhoudList } = window.AppState;
    const items = Array.from(inhoudList.querySelectorAll('.inhoud-item'));

    let hideBelow = null;

    items.forEach(item => {
        const level = parseInt(item.dataset.level) || 99;
        const id = item.dataset.headingId;

        if (hideBelow !== null && level > hideBelow) {
            item.style.display = 'none';
            item.style.opacity = '0';
            item.style.pointerEvents = 'none';
        } else {
            hideBelow = null;
            item.style.display = '';
            item.style.opacity = '';
            item.style.pointerEvents = '';
        }

        if (_collapsed.has(id)) {
            hideBelow = level;
        }
    });
}

function updateActiveInhoudItem() {
    const { editor, inhoudList } = window.AppState;

    const headings = Array.from(editor.querySelectorAll('[data-heading-id]'));
    const inhoudItems = Array.from(inhoudList.querySelectorAll('.inhoud-item'));

    if (headings.length === 0 || inhoudItems.length === 0) return;

    const documentSection = document.querySelector('.document-section');
    if (!documentSection) return;

    // The active heading is the last one whose top has passed the vertical
    // center of the document viewport, so the sidebar matches what you're
    // actually looking at. Between headings, the heading above stays active —
    // there is always one active.
    let activeIndex = _computeActiveIndex(headings, documentSection);

    // If no heading has reached the line yet, use the first one
    if (activeIndex === -1 && headings.length > 0) {
        activeIndex = 0;
    }

    inhoudItems.forEach((item, index) => {
        item.classList.toggle('active', index === activeIndex);
    });

    if (activeIndex === -1) {
        inhoudList.style.setProperty('--progress-height', '0px');
        return;
    }

    // Sync collapsed state: open ancestors of active, close everything else
    const allParentIds = new Set(
        Array.from(inhoudList.querySelectorAll('.inhoud-item.has-children'))
            .map(item => item.dataset.headingId)
    );
    const ancestors = _ancestorIds(headings, activeIndex);
    let changed = false;

    allParentIds.forEach(id => {
        const shouldBeOpen = ancestors.has(id);
        const isOpen = !_collapsed.has(id);
        if (shouldBeOpen && !isOpen) {
            _collapsed.delete(id);
            const item = inhoudList.querySelector(`[data-heading-id="${id}"]`);
            if (item) item.classList.remove('is-collapsed');
            changed = true;
        } else if (!shouldBeOpen && isOpen) {
            _collapsed.add(id);
            const item = inhoudList.querySelector(`[data-heading-id="${id}"]`);
            if (item) item.classList.add('is-collapsed');
            changed = true;
        }
    });

    if (changed) {
        _saveCollapsed();
        _applyAllCollapsed();
    }

    const activeItem = inhoudItems[activeIndex];
    if (activeItem) {
        inhoudList.style.setProperty('--progress-height',
            (activeItem.offsetTop + activeItem.offsetHeight / 2) + 'px');

        // Always keep active item centered in the list
        const targetScrollTop = activeItem.offsetTop - (inhoudList.clientHeight / 2) + (activeItem.offsetHeight / 2);
        const currentScrollTop = inhoudList.scrollTop;

        // Only scroll if it's meaningfully off-center (more than 30px drift)
        if (Math.abs(currentScrollTop - targetScrollTop) > 30) {
            inhoudList.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
        }
    }
}

function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === `${tabName}-panel`);
    });
}

// Scroll tracking — set up once after DOM is ready
function setupScrollTracking() {
    let scrollTimeout;
    const documentSection = document.querySelector('.document-section');
    if (documentSection) {
        documentSection.addEventListener('scroll', () => {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(updateActiveInhoudItem, 30);
        });
    }
}

// Expose
window.updateInhoudList = updateInhoudList;
window.updateActiveInhoudItem = updateActiveInhoudItem;
window.switchTab = switchTab;
window.setupScrollTracking = setupScrollTracking;