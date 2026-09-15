// ==================== UNIFIED TOPBAR TAB INDICATOR ====================
// A single sliding underline shared by every tab in the topbar's left
// group (normal sections like "Bewerken"/"Invoegen" AND the dynamically
// injected context tabs like "Codeblok-opmaak"). This replaces the old
// setup where every .topbar-section had its own independent underline
// element, which meant hover/active states never visually connected.
//
// Behaviour:
//   - Rests under the active tab at its "base" width.
//   - Hovering the active tab itself shortens it in place (no movement —
//     hovering any other tab does nothing to the indicator).
//   - On an actual tab switch (a new tab becomes active), the indicator
//     does one continuous "inchworm" move toward the new tab: the edge
//     closer to the destination (the leading edge) races ahead using a
//     fast, front-loaded easing curve, while the trailing edge follows
//     along the *same* timeline using a slow, back-loaded easing curve —
//     so it's already creeping forward the whole time, just lagging
//     behind, rather than sitting frozen until the leading edge arrives.
//     Both edges are driven by the same elapsed-time value every frame,
//     so the stretch, the move, and the catch-up read as one unbroken
//     motion instead of two separate steps handed off to each other.
//
// Other modules never touch the indicator's DOM directly; they just call
// TopbarIndicator.onActivate(tabElement) whenever they add the "active"
// class to a .topbar-section (see topbar.js and element-protection.js).

window.TopbarIndicator = (function () {
    'use strict';

    const RATIO_ACTIVE = 0.75;       // resting width under the active tab
    const RATIO_ACTIVE_HOVER = 0.6;  // active tab, also currently hovered

    const DUR_SWITCH = 440;          // total duration of the whole move
    const DUR_HOVER = 260;           // in-place shorten/lengthen on hover (active tab only)

    const EASE_HOVER = 'cubic-bezier(0.4, 0, 0.2, 1)';

    let container = null;   // .topbar-sections-left — positioning context
    let indicator = null;
    let activeTab = null;
    let hoveredTab = null;  // whichever tab the mouse is physically over, if any
    let sliding = false;
    let animGen = 0;        // generation counter — lets a new animation cancel a stale one
    let rafHandle = null;

    // Observers that keep the indicator aligned when tab text/width changes
    // (e.g. after i18n translates "Bewerken" -> "Edit" which is shorter).
    let tabRO = null;
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

    // Only the active tab's own hover state affects sizing — hovering some
    // other tab never moves or resizes the indicator.
    function ratioForTab(tab) {
        if (tab === activeTab && tab === hoveredTab) return RATIO_ACTIVE_HOVER;
        return RATIO_ACTIVE;
    }

    function setColor(tab) {
        indicator.classList.toggle('context-color', !!(tab && tab.classList.contains('context-tab')));
    }

    function setDuration(ms, ease) {
        indicator.style.setProperty('--topbar-indicator-duration', ms + 'ms');
        indicator.style.setProperty('--topbar-indicator-easing', ease);
    }

    function setBox(left, width) {
        indicator.style.transform = `translateX(${left}px)`;
        indicator.style.width = width + 'px';
        indicator.classList.add('visible');
    }

    // Fast, front-loaded — used for the leading edge, so it races ahead early.
    function leadEase(t) {
        return 1 - Math.pow(1 - t, 4); // easeOutQuart
    }

    // Slow-starting but not as back-loaded as before — used for the
    // trailing edge, so it's already creeping forward throughout and
    // catches up to the leading edge a bit sooner.
    function trailEase(t) {
        return t * t * t; // easeInCubic
    }

    // Reads the indicator's current on-screen left offset from its computed
    // transform matrix. Using getComputedStyle (rather than re-reading our
    // own last-set inline value) means this is accurate even if we're
    // interrupting a still-running CSS hover transition mid-flight.
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

    // Snap the indicator to a box with no transition at all (initial load,
    // window resize, tab-strip scroll, and the exact final frame of a switch).
    function applyInstant(box) {
        indicator.classList.add('no-anim');
        setBox(box.left, box.width);
        void indicator.offsetWidth; // force reflow so the freeze takes effect
        indicator.classList.remove('no-anim');
    }

    // Recompute & apply the resting box for a tab via a plain CSS transition
    // (used for the active tab's own hover shorten/lengthen — a single
    // simple motion, no stretch involved).
    function settleOn(tab, { instant, duration, easing } = {}) {
        if (!isUsable(tab)) return;
        setColor(tab);
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

    // One continuous "inchworm" animation: both edges are driven by the
    // *same* elapsed-time value every frame, but through different easing
    // curves. The leading edge (closer to the destination) uses a fast,
    // front-loaded curve so it races ahead; the trailing edge uses a slow,
    // back-loaded curve so it's already creeping forward the whole time,
    // just lagging behind, and only really catches up near the end. The
    // target box is recomputed every frame, so if the hover state changes
    // mid-flight the landing spot adapts smoothly.
    function slideTo(newTab) {
        const myGen = ++animGen;
        sliding = true;
        setColor(newTab);

        // Capture the current visual box (even mid hover-transition) before
        // freezing CSS transitions off for the hand-driven animation.
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
            if (myGen !== animGen) return; // superseded by a newer switch

            const raw = Math.min(1, (now - startTime) / DUR_SWITCH);

            // Live final box — reflects current hover state even if it
            // changes while the animation is still running.
            const finalBox = boxForTab(newTab, ratioForTab(newTab));
            const finalLeft = finalBox.left;
            const finalRight = finalBox.left + finalBox.width;

            const lead = leadEase(raw);
            const trail = trailEase(raw);

            let left, right;
            if (movingRight) {
                right = startRight + (finalRight - startRight) * lead;  // leading edge — races ahead
                left = startLeft + (finalLeft - startLeft) * trail;     // trailing edge — creeps, catches up late
            } else {
                left = startLeft + (finalLeft - startLeft) * lead;      // leading edge — races ahead
                right = startRight + (finalRight - startRight) * trail; // trailing edge — creeps, catches up late
            }

            setBox(left, right - left);

            if (raw < 1) {
                rafHandle = requestAnimationFrame(frame);
            } else {
                sliding = false;
                rafHandle = null;
                // Snap to the exact resting box (guards against float drift)
                // and hand back to normal CSS-transition-driven hover state.
                settleOn(newTab, { instant: true });
                // Re-attach size observer to the newly active tab so future
                // text changes (e.g. language switch) keep it aligned.
                watchActiveTab(newTab);
            }
        }

        rafHandle = requestAnimationFrame(frame);
    }

    // Called whenever a tab becomes the active one.
    function onActivate(newTab) {
        if (!container) init();
        if (!container || !indicator || !isUsable(newTab)) return;

        const oldTab = activeTab;
        activeTab = newTab;

        if (!oldTab || oldTab === newTab) {
            // First run, or the already-active tab was "reactivated" —
            // nothing to slide between, just make sure it's resting right.
            cancelSlide();
            settleOn(newTab, { instant: !oldTab });
            watchActiveTab(newTab);
            return;
        }

        slideTo(newTab);
    }

    // Track physical mouse hover across all tabs, but only react (resize
    // the indicator) when the hovered tab is the currently active one.
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

    // Keep the indicator centred when any tab's size changes
    // (e.g. Dutch "Bewerken" vs English "Edit"). A sibling shrinking
    // shifts the active tab's left offset even if its own width didn't
    // change, so we watch every tab plus the container. MutationObserver
    // below is the backstop for the actual text replacement.
    function watchActiveTab(tab) {
        if (!tab || !window.ResizeObserver) return;
        if (!tabRO) {
            tabRO = new ResizeObserver(() => {
                // Defer one frame so the new widths are fully flushed
                // before we measure, and skip if a slide is in progress.
                requestAnimationFrame(() => reposition());
            });
        }
        try { tabRO.disconnect(); } catch (e) { }
        try { tabRO.observe(tab); } catch (e) { }
        try { tabRO.observe(container); } catch (e) { }
        // Sibling tabs changing width (due to translation / fonts) also
        // shift the active tab's left offset, so observe them too.
        container.querySelectorAll('.topbar-section').forEach(t => {
            try { tabRO.observe(t); } catch (e) { }
        });
        const scrollable = document.querySelector('.topbar-sections-scrollable');
        if (scrollable) try { tabRO.observe(scrollable); } catch (e) { }
    }

    function attachEvents() {
        container.addEventListener('mouseover', e => {
            const tab = e.target.closest('.topbar-section');
            if (tab && container.contains(tab)) onMouseOver(tab);
        });
        container.addEventListener('mouseout', e => {
            const tab = e.target.closest('.topbar-section');
            if (!tab) return;
            const to = e.relatedTarget && e.relatedTarget.closest
                ? e.relatedTarget.closest('.topbar-section')
                : null;
            if (to === tab) return;
            onMouseOut(tab);
        });
        window.addEventListener('resize', () => reposition());

        // Keep the indicator glued to its tab while the scrollable tab
        // strip is scrolled (it lives outside that scroll container).
        const scrollable = document.querySelector('.topbar-sections-scrollable');
        if (scrollable) scrollable.addEventListener('scroll', () => reposition());
    }

    function init() {
        if (container) return;
        container = document.querySelector('.topbar-sections-left');
        if (!container) return;

        indicator = document.createElement('div');
        indicator.className = 'topbar-indicator';
        indicator.id = 'topbarIndicator';
        container.appendChild(indicator);

        attachEvents();

        const initial = container.querySelector('.topbar-section.active');
        if (initial) {
            activeTab = initial;
            settleOn(initial, { instant: true });
            watchActiveTab(initial);
        }

        // ── Post-i18n guard ──────────────────────────────────────────────
        // The HTML is authored in Dutch ("Bewerken"). When the app runs in
        // English, SummieI18n translates it to "Edit" *after* DOMContentLoaded
        // — and its init() is async (settings/IPC), so it may still be pending
        // when this indicator's own DOMContentLoaded handler runs. At that
        // moment we measured the Dutch width and the underline ends up too
        // wide/shifted. The ResizeObserver above fixes it reactively, but we
        // also schedule a few deferred repositions and watch for text mutations
        // so the very first paint is already correct even if the observer
        // hasn't fired yet.

        // Deferred repositions catch the async translation window.
        requestAnimationFrame(() => requestAnimationFrame(reposition));
        setTimeout(reposition, 60);
        setTimeout(reposition, 300);
        // After web fonts load the tab metrics can shift again.
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(() => reposition()).catch(() => {});
        }

        // MutationObserver: i18n walks the DOM and replaces text nodes
        // (and also on later language switches). Any characterData / childList
        // change under the tab bar should re-centre the indicator.
        try {
            if (window.MutationObserver && !i18nMO) {
                i18nMO = new MutationObserver(() => {
                    clearTimeout(deferredTimer);
                    deferredTimer = setTimeout(reposition, 10);
                });
                i18nMO.observe(container, { childList: true, subtree: true, characterData: true });
            }
        } catch (e) { }

        // Hook SummieI18n.apply / setLang if already available; otherwise
        // wait for it via a short poll (it loads synchronously in <head>
        // before this script in practice, but be defensive).
        function hookI18n() {
            const api = window.SummieI18n;
            if (!api || api.__indicatorHooked) return false;
            api.__indicatorHooked = true;
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

        // Also listen for explicit language-change events (electron bridge
        // and any custom event the app may fire).
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
            } catch (e) { }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return { onActivate, reposition };
})();
