// ==================== KOP- & VOETTEKST ====================
// Bewerkbare kop- en voettekst per pagina (of gedeeld voor alle pagina's).

(function () {
    // Opties: 'off', 'shared', 'per-page'
    let headerFooterMode = 'off';

    // Gedeelde inhoud
    let sharedHeader = '';
    let sharedFooter = '';

    // Per-pagina inhoud
    const perPageHeaders = new Map();
    const perPageFooters = new Map();

    // ==================== ZONE AANMAKEN ====================
    function createZone(type, pageIndex) {
        const zone = document.createElement('div');
        zone.className = `page-${type}-zone`;
        zone.dataset.type = type;
        zone.dataset.pageIndex = pageIndex;
        zone.contentEditable = 'true';
        zone.spellcheck = false;
        zone.setAttribute('placeholder', type === 'header' ? 'Koptekst...' : 'Voettekst...');

        // Inhoud laden
        zone.innerHTML = getZoneContent(type, pageIndex) || '';

        // Sla op bij verandering
        zone.addEventListener('input', () => {
            const content = zone.innerHTML;
            if (headerFooterMode === 'shared') {
                if (type === 'header') {
                    sharedHeader = content;
                    // Sync naar alle andere header zones
                    document.querySelectorAll('.page-header-zone').forEach(z => {
                        if (z !== zone) z.innerHTML = content;
                    });
                } else {
                    sharedFooter = content;
                    document.querySelectorAll('.page-footer-zone').forEach(z => {
                        if (z !== zone) z.innerHTML = content;
                    });
                }
            } else if (headerFooterMode === 'per-page') {
                if (type === 'header') perPageHeaders.set(pageIndex, content);
                else perPageFooters.set(pageIndex, content);
            }
            window.saveToLocalStorage && window.saveToLocalStorage();
        });

        // Voorkom dat focus verloren gaat in de editor
        zone.addEventListener('mousedown', e => e.stopPropagation());

        return zone;
    }

    function getZoneContent(type, pageIndex) {
        if (headerFooterMode === 'shared') {
            return type === 'header' ? sharedHeader : sharedFooter;
        } else if (headerFooterMode === 'per-page') {
            return type === 'header'
                ? (perPageHeaders.get(pageIndex) || '')
                : (perPageFooters.get(pageIndex) || '');
        }
        return '';
    }

    // ==================== PAGINA BEWERKEN ====================
    function addZonesToPage(page) {
        const pageIndex = parseInt(page.dataset.pageIndex || 0);

        if (!page.querySelector('.page-header-zone')) {
            const header = createZone('header', pageIndex);
            page.insertAdjacentElement('afterbegin', header);
        }
        if (!page.querySelector('.page-footer-zone')) {
            const footer = createZone('footer', pageIndex);
            page.appendChild(footer);
        }
    }

    function removeZonesFromPage(page) {
        page.querySelectorAll('.page-header-zone, .page-footer-zone').forEach(z => z.remove());
    }

    function updateAllPages() {
        document.querySelectorAll('.a4-page').forEach(page => {
            if (headerFooterMode === 'off') {
                removeZonesFromPage(page);
            } else {
                addZonesToPage(page);
            }
        });
    }

    // ==================== MODUS WISSELEN ====================
    function setMode(mode) {
        headerFooterMode = mode;
        updateAllPages();
        updateToolbarButton();
        localStorage.setItem('summie_hf_mode', mode);
        window.saveToLocalStorage && window.saveToLocalStorage();
    }

    function getMode() { return headerFooterMode; }

    // ==================== TOOLBAR BUTTON ====================
    function updateToolbarButton() {
        const btn = document.getElementById('headerFooterBtn');
        if (!btn) return;
        btn.classList.toggle('active', headerFooterMode !== 'off');
    }

    function buildToolbarButton() {
        // Voeg knop toe aan de Invoegen sectie in de toolbar
        const invoegSection = document.querySelector('.toolbar-content[data-content="invoegen"]');
        if (!invoegSection || document.getElementById('headerFooterBtn')) return;

        // Separator
        const sep = document.createElement('div');
        sep.className = 'toolbar-separator animate-item';
        sep.style.animationDelay = '0.5s';

        // Groep
        const group = document.createElement('div');
        group.className = 'toolbar-group animate-item';
        group.style.animationDelay = '0.55s';
        group.innerHTML = `
            <label class="toolbar-label">Kop- & voet</label>
            <div class="toolbar-buttons" style="position:relative">
                <button class="btn-toolbar dropdown-toggle" id="headerFooterBtn" title="Kop- en voettekst">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="3" width="18" height="4" rx="1"/>
                        <rect x="3" y="17" width="18" height="4" rx="1"/>
                        <line x1="3" y1="10" x2="21" y2="10"/>
                        <line x1="3" y1="14" x2="21" y2="14"/>
                    </svg>
                    <span>Kop- & voettekst</span>
                    <svg class="dropdown-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="6 9 12 15 18 9"/>
                    </svg>
                </button>
                <div class="toolbar-dropdown-menu" id="headerFooterMenu">
                    <button class="dropdown-item" data-hf-mode="off">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        Uitgeschakeld
                    </button>
                    <button class="dropdown-item" data-hf-mode="shared">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="4" rx="1"/><rect x="3" y="17" width="18" height="4" rx="1"/></svg>
                        Zelfde op alle pagina's
                    </button>
                    <button class="dropdown-item" data-hf-mode="per-page">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        Per pagina apart
                    </button>
                </div>
            </div>`;

        invoegSection.appendChild(sep);
        invoegSection.appendChild(group);

        // Events
        const btn = document.getElementById('headerFooterBtn');
        const menu = document.getElementById('headerFooterMenu');

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            menu.classList.toggle('open');
        });

        menu.querySelectorAll('[data-hf-mode]').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                setMode(item.dataset.hfMode);
                menu.classList.remove('open');
            });
        });

        document.addEventListener('click', () => menu.classList.remove('open'));
    }

    // ==================== SERIALISATIE ====================
    function getData() {
        return {
            mode: headerFooterMode,
            sharedHeader,
            sharedFooter,
            perPageHeaders: Object.fromEntries(perPageHeaders),
            perPageFooters: Object.fromEntries(perPageFooters)
        };
    }

    function loadData(data) {
        if (!data) return;
        headerFooterMode = data.mode || 'off';
        sharedHeader = data.sharedHeader || '';
        sharedFooter = data.sharedFooter || '';
        perPageHeaders.clear();
        perPageFooters.clear();
        if (data.perPageHeaders) Object.keys(data.perPageHeaders).forEach(k => perPageHeaders.set(parseInt(k), data.perPageHeaders[k]));
        if (data.perPageFooters) Object.keys(data.perPageFooters).forEach(k => perPageFooters.set(parseInt(k), data.perPageFooters[k]));
        updateAllPages();
        updateToolbarButton();
    }

    // ==================== INIT ====================
    function init() {
        const savedMode = localStorage.getItem('summie_hf_mode') || 'off';
        headerFooterMode = savedMode;

        setTimeout(() => {
            buildToolbarButton();
            updateAllPages();

            // Observer voor nieuwe pagina's
            const container = document.getElementById('pagesContainer');
            if (container) {
                const mo = new MutationObserver((mutations) => {
                    mutations.forEach(m => {
                        m.addedNodes.forEach(node => {
                            if (node.nodeType === 1 && node.classList.contains('a4-page') && headerFooterMode !== 'off') {
                                setTimeout(() => addZonesToPage(node), 50);
                            }
                        });
                    });
                });
                mo.observe(container, { childList: true });
            }
        }, 200);
    }

    window.HeaderFooter = { init, getData, loadData, setMode, getMode, updateAllPages };
})();