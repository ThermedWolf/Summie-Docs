// ==================== UNIFIED SIDEBAR TAB INDICATOR ====================
// A single sliding underline shared by every tab in the right sidebar
// (.tabs — Begrippen / Inhoud / Bronnen / References). This mirrors the
// topbar indicator (js/topbar/topbar-indicator.js) so both tab rows feel
// identical: the same stretch-while-sliding, the same hover shorten, and
// the same easing curves.
//
// Behaviour (identical to the topbar):
//   - Rests under the active tab at its "base" width (75% of the tab).
//   - Hovering the active tab itself shortens it in place (60%).
//     Hovering any other tab does NOT move the indicator.
//   - On an actual tab switch the indicator does one continuous
//     "inchworm" move toward the new tab: the leading edge races ahead
//     (easeOutQuart) while the trailing edge creeps (easeInCubic) on the
//     same timeline so the stretch, the move and the catch-up read as one
//     unbroken motion.
//
// Other modules never touch the indicator's DOM directly; they just call
// SidebarIndicator.onActivate(tabElement) whenever they add the "active"
// class to a .tab (see js/ui/sidebar.js -> switchTab). A MutationObserver
// also watches for class changes so dynamically-added tabs (References) or
// direct class toggles elsewhere still keep the indicator in sync.

window.SidebarIndicator = (function () {
    'use strict';

    const RATIO_ACTIVE = 0.75;       // resting width under the active tab
    const RATIO_ACTIVE_HOVER = 0.6;  // active tab, also currently hovered

    const DUR_SWITCH = 440;          // total duration of the whole move (ms)
    const DUR_HOVER = 260;           // in-place shorten/lengthen on hover

    const EASE_HOVER = 'cubic-bezier(0.4, 0, 0.2, 1)';

    let container = null;   // .tabs — positioning context
    let indicator = null;
    let activeTab = null;
    let hoveredTab = null;
    let sliding = false;
    let animGen = 0;
    let rafHandle = null;

    let tabRO = null;
    let classMO = null;
    let i18nMO = null;
    let deferredTimer = null;

    function isUsable(tab) {
        return !!tab && tab.offsetParent !== null;
    }

    function rectFor(tab) {
        const tabRect = tab.getBoundingClientRect();
        const contRect = container.getBoundingClientRect();
        return { left: tabRect.left - contRect.left, width: tabRect.width };
    }

    function boxForTab(tab, ratio) {
        const r = rectFor(tab);
        const w = r.width * ratio;
        return { left: r.left + (r.width - w) / 2, width: w };
    }

    function ratioForTab(tab) {
        if (tab === activeTab && tab === hoveredTab) return RATIO_ACTIVE_HOVER;
        return RATIO_ACTIVE;
    }

    function setDuration(ms, ease) {
        indicator.style.setProperty('--sidebar-indicator-duration', ms + 'ms');
        indicator.style.setProperty('--sidebar-indicator-easing', ease);
    }

    function setBox(left, width) {
        indicator.style.transform = `translateX(${left}px)`;
        indicator.style.width = width + 'px';
        indicator.classList.add('visible');
    }

    function leadEase(t) {
        return 1 - Math.pow(1 - t, 4); // easeOutQuart
    }

    function trailEase(t) {
        return t * t * t; // easeInCubic
    }

    function currentTranslateX(transformStr) {
        if (!transformStr || transformStr === 'none') return 0;
        let m = /^matrix\(([^)]+)\)$/.exec(transformStr);
        if (m) {
            const parts = m[1].split(',').map(parseFloat);
            return parts[4] || 0;
        }
        m = /^matrix3d\(([^)]+)\)$/.exec(transformStr);
        if (m) {
            const parts = m[1].split(',').map(parseFloat);
            return parts[12] || 0;
        }
        return 0;
    }

    function applyInstant(box) {
        indicator.classList.add('no-anim');
        setBox(box.left, box.width);
        void indicator.offsetWidth;
        indicator.classList.remove('no-anim');
    }

    function settleOn(tab, { instant, duration, easing } = {}) {
        if (!isUsable(tab)) return;
        const box = boxForTab(tab, ratioForTab(tab));
        if (instant) {
            applyInstant(box);
        } else {
            setDuration(duration != null ? duration : DUR_HOVER, easing || EASE_HOVER);
            setBox(box.left, box.width);
        }
    }

    function cancelSlide() {
        animGen++;
        if (rafHandle) {
            cancelAnimationFrame(rafHandle);
            rafHandle = null;
        }
        sliding = false;
    }

    function slideTo(newTab) {
        const myGen = ++animGen;
        sliding = true;

        const cs = getComputedStyle(indicator);
        const startWidth = parseFloat(cs.width) || indicator.offsetWidth || 0;
        const startLeft = currentTranslateX(cs.transform);
        const startRight = startLeft + startWidth;
        const startCenter = startLeft + startWidth / 2;

        indicator.classList.add('no-anim');

        const destRect = rectFor(newTab);
        const destCenter = destRect.left + destRect.width / 2;
        const movingRight = destCenter >= startCenter;

        const startTime = performance.now();

        function frame(now) {
            if (myGen !== animGen) return;

            const raw = Math.min(1, (now - startTime) / DUR_SWITCH);

            const finalBox = boxForTab(newTab, ratioForTab(newTab));
            const finalLeft = finalBox.left;
            const finalRight = finalBox.left + finalBox.width;

            const lead = leadEase(raw);
            const trail = trailEase(raw);

            let left, right;
            if (movingRight) {
                right = startRight + (finalRight - startRight) * lead;
                left = startLeft + (finalLeft - startLeft) * trail;
            } else {
                left = startLeft + (finalLeft - startLeft) * lead;
                right = startRight + (finalRight - startRight) * trail;
            }

            setBox(left, right - left);

            if (raw < 1) {
                rafHandle = requestAnimationFrame(frame);
            } else {
                sliding = false;
                rafHandle = null;
                settleOn(newTab, { instant: true });
                watchActiveTab(newTab);
            }
        }

        rafHandle = requestAnimationFrame(frame);
    }

    function onActivate(newTab) {
        if (!container) init();
        if (!container || !indicator || !isUsable(newTab)) return;

        const oldTab = activeTab;
        activeTab = newTab;

        if (!oldTab || oldTab === newTab) {
            cancelSlide();
            settleOn(newTab, { instant: !oldTab });
            watchActiveTab(newTab);
            return;
        }

        slideTo(newTab);
    }

    function onMouseOver(tab) {
        if (!isUsable(tab) || tab === hoveredTab) return;
        hoveredTab = tab;
        if (tab !== activeTab || sliding) return;
        settleOn(tab, { duration: DUR_HOVER, easing: EASE_HOVER });
    }

    function onMouseOut(tab) {
        if (hoveredTab !== tab) return;
        hoveredTab = null;
        if (tab !== activeTab || sliding) return;
        settleOn(tab, { duration: DUR_HOVER, easing: EASE_HOVER });
    }

    function reposition() {
        if (!container || !indicator || sliding || !activeTab) return;
        settleOn(activeTab, { instant: true });
    }

    function watchActiveTab(tab) {
        if (!tab || !window.ResizeObserver) return;
        if (!tabRO) {
            tabRO = new ResizeObserver(() => {
                requestAnimationFrame(() => reposition());
            });
        }
        try { tabRO.disconnect(); } catch (e) {}
        try { tabRO.observe(tab); } catch (e) {}
        try { tabRO.observe(container); } catch (e) {}
        container.querySelectorAll('.tab').forEach(t => {
            try { tabRO.observe(t); } catch (e) {}
        });
    }

    function attachEvents() {
        container.addEventListener('mouseover', e => {
            const tab = e.target.closest('.tab');
            if (tab && container.contains(tab)) onMouseOver(tab);
        });
        container.addEventListener('mouseout', e => {
            const tab = e.target.closest('.tab');
            if (!tab) return;
            const to = e.relatedTarget && e.relatedTarget.closest
                ? e.relatedTarget.closest('.tab')
                : null;
            if (to === tab) return;
            onMouseOut(tab);
        });
        window.addEventListener('resize', () => reposition());

        // Keep indicator in sync when tabs are added/removed or when the
        // active class is toggled directly (e.g. References tab injected by
        // js/main.js without going through switchTab).
        try {
            if (window.MutationObserver && !classMO) {
                classMO = new MutationObserver(mutations => {
                    let shouldReposition = false;
                    for (const m of mutations) {
                        if (m.type === 'childList') {
                            shouldReposition = true;
                            // If a new tab became active, slide to it
                            m.addedNodes.forEach(n => {
                                if (n.nodeType === 1 && n.classList.contains('tab') && n.classList.contains('active')) {
                                    // Defer so the new tab has layout
                                    requestAnimationFrame(() => onActivate(n));
                                }
                            });
                        }
                        if (m.type === 'attributes' && m.attributeName === 'class' && m.target.classList.contains('tab')) {
                            if (m.target.classList.contains('active') && m.target !== activeTab) {
                                requestAnimationFrame(() => onActivate(m.target));
                                return;
                            }
                        }
                    }
                    if (shouldReposition) {
                        clearTimeout(deferredTimer);
                        deferredTimer = setTimeout(reposition, 10);
                        // Re-observe new tabs for size changes
                        if (activeTab) watchActiveTab(activeTab);
                    }
                });
                classMO.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
            }
        } catch (e) {}
    }

    function init() {
        if (container) return;
        container = document.querySelector('.tabs');
        if (!container) return;

        indicator = document.createElement('div');
        indicator.className = 'sidebar-indicator';
        indicator.id = 'sidebarIndicator';
        container.appendChild(indicator);

        attachEvents();

        const initial = container.querySelector('.tab.active');
        if (initial) {
            activeTab = initial;
            settleOn(initial, { instant: true });
            watchActiveTab(initial);
        }

        // Deferred repositions catch async i18n translations and font loading
        requestAnimationFrame(() => requestAnimationFrame(reposition));
        setTimeout(reposition, 60);
        setTimeout(reposition, 300);
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(() => reposition()).catch(() => {});
        }

        try {
            if (window.MutationObserver && !i18nMO) {
                i18nMO = new MutationObserver(() => {
                    clearTimeout(deferredTimer);
                    deferredTimer = setTimeout(reposition, 10);
                });
                i18nMO.observe(container, { childList: true, subtree: true, characterData: true });
            }
        } catch (e) {}

        function hookI18n() {
            const api = window.SummieI18n;
            if (!api || api.__sidebarIndicatorHooked) return false;
            api.__sidebarIndicatorHooked = true;
            const origApply = api.apply.bind(api);
            api.apply = function (root) {
                const r = origApply(root);
                requestAnimationFrame(() => reposition());
                setTimeout(reposition, 20);
                return r;
            };
            if (api.setLang) {
                const origSetLang = api.setLang.bind(api);
                api.setLang = function (lang) {
                    const r = origSetLang(lang);
                    setTimeout(reposition, 20);
                    setTimeout(reposition, 150);
                    return r;
                };
            }
            return true;
        }
        if (!hookI18n()) {
            let tries = 0;
            const iv = setInterval(() => {
                if (hookI18n() || ++tries > 20) clearInterval(iv);
            }, 100);
        }

        window.addEventListener('summie:languageChanged', () => {
            setTimeout(reposition, 20);
            setTimeout(reposition, 150);
        });
        if (window.electron && window.electron.onLanguageChanged) {
            try {
                window.electron.onLanguageChanged(() => {
                    setTimeout(reposition, 20);
                    setTimeout(reposition, 150);
                });
            } catch (e) {}
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return { onActivate, reposition };
})();
