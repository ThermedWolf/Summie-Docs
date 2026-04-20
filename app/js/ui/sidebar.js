// ==================== SIDEBAR ====================
// updateInhoudList, updateActiveInhoudItem, switchTab, scroll tracking.

function updateInhoudList() {
    const { editor, inhoudList } = window.AppState;
    inhoudList.innerHTML = '';

    const allStyled = editor.querySelectorAll('[class*="style-"], [data-style]');

    // Filter to only headings (non-normal styles)
    const headings = Array.from(allStyled).filter(el => {
        const styleKey = el.dataset.style ||
            ([...el.classList].find(c => c.startsWith('style-')) || '').replace('style-', '');
        return styleKey && styleKey !== 'normal';
    });

    if (headings.length === 0) {
        inhoudList.innerHTML = '<p class="empty-state">Geen koppen gevonden. Gebruik de stijlopties om koppen toe te voegen.</p>';
        return;
    }

    headings.forEach((heading, index) => {
        const styleKey = heading.dataset.style ||
            ([...heading.classList].find(c => c.startsWith('style-')) || '').replace('style-', '');

        // Stamp a stable id directly onto the heading element
        heading.dataset.headingId = 'heading-' + index;

        const item = document.createElement('div');
        item.className = `inhoud-item level-${styleKey}`;
        item.textContent = heading.textContent;
        item.dataset.headingId = 'heading-' + index;

        item.addEventListener('click', () => {
            heading.scrollIntoView({ behavior: 'smooth', block: 'center' });
            heading.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
            setTimeout(() => { heading.style.backgroundColor = ''; }, 1000);
        });

        inhoudList.appendChild(item);
    });

    if (inhoudList.children.length === 0) {
        inhoudList.innerHTML = '<p class="empty-state">Geen koppen gevonden. Gebruik de stijlopties om koppen toe te voegen.</p>';
        return;
    }

    updateActiveInhoudItem();
}

function updateActiveInhoudItem() {
    const { editor, inhoudList } = window.AppState;

    const headings = Array.from(editor.querySelectorAll('[data-heading-id]'));
    const inhoudItems = Array.from(inhoudList.querySelectorAll('.inhoud-item'));

    if (headings.length === 0 || inhoudItems.length === 0) return;

    const documentSection = document.querySelector('.document-section');
    if (!documentSection) return;

    const sectionRect = documentSection.getBoundingClientRect();

    // The "reading position" is the midpoint of the visible document area.
    const midpoint = sectionRect.top + sectionRect.height / 2;

    // Active heading = the last one whose top is above the midpoint.
    // This means: even if the heading scrolled off-screen, it's still your
    // current section until a later heading crosses the midpoint.
    let activeIndex = -1;
    headings.forEach((heading, index) => {
        if (heading.getBoundingClientRect().top <= midpoint) {
            activeIndex = index;
        }
    });

    // If no heading has passed the midpoint yet (user is above all headings),
    // don't highlight anything.
    inhoudItems.forEach((item, index) => {
        item.classList.toggle('active', index === activeIndex);
    });

    if (activeIndex === -1) {
        inhoudList.style.setProperty('--progress-height', '0px');
        return;
    }

    const activeItem = inhoudItems[activeIndex];
    if (activeItem) {
        inhoudList.style.setProperty('--progress-height',
            (activeItem.offsetTop + activeItem.offsetHeight / 2) + 'px');
        // Keep the active item visible in the sidebar list
        const itemTop = activeItem.offsetTop;
        const listHeight = inhoudList.clientHeight;
        const scrollTop = inhoudList.scrollTop;
        if (itemTop < scrollTop + 20 || itemTop > scrollTop + listHeight - 40) {
            inhoudList.scrollTo({ top: itemTop - listHeight / 2, behavior: 'smooth' });
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