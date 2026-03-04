// ==================== SIDEBAR ====================
// updateInhoudList, updateActiveInhoudItem, switchTab, scroll tracking.

function updateInhoudList() {
    const { editor, inhoudList } = window.AppState;
    inhoudList.innerHTML = '';

    const headings = editor.querySelectorAll('[class*="style-"], [data-style]');

    if (headings.length === 0) {
        inhoudList.innerHTML = '<p class="empty-state">Geen koppen gevonden. Gebruik de stijlopties om koppen toe te voegen.</p>';
        return;
    }

    headings.forEach((heading, index) => {
        // Determine style key from data-style or class
        const styleKey = heading.dataset.style ||
            ([...heading.classList].find(c => c.startsWith('style-')) || '').replace('style-', '') ||
            '';

        // Only show non-normal styles as headings
        if (!styleKey || styleKey === 'normal') return;

        const item = document.createElement('div');
        item.className = `inhoud-item level-${styleKey}`;
        item.textContent = heading.textContent;
        item.dataset.index = index;
        item.dataset.headingId = 'heading-' + index;
        heading.dataset.headingId = 'heading-' + index;

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
    const headings = editor.querySelectorAll('[data-heading-id]');
    const inhoudItems = inhoudList.querySelectorAll('.inhoud-item');

    if (headings.length === 0 || inhoudItems.length === 0) return;

    const documentSection = document.querySelector('.document-section');
    if (!documentSection) return;

    const viewportMiddle = window.innerHeight / 2;
    let activeIndex = 0;

    headings.forEach((heading, index) => {
        if (heading.getBoundingClientRect().top <= viewportMiddle) activeIndex = index;
    });

    inhoudItems.forEach((item, index) => {
        item.classList.toggle('active', index === activeIndex);
    });

    const activeItem = inhoudItems[activeIndex];
    if (activeItem) {
        inhoudList.style.setProperty('--progress-height', (activeItem.offsetTop + activeItem.offsetHeight / 2) + 'px');
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
            scrollTimeout = setTimeout(updateActiveInhoudItem, 50);
        });
    }
}

// Expose
window.updateInhoudList = updateInhoudList;
window.updateActiveInhoudItem = updateActiveInhoudItem;
window.switchTab = switchTab;
window.setupScrollTracking = setupScrollTracking;