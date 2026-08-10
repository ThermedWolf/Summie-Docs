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
//     does an "inchworm" move toward the new tab, in two sequential
//     phases:
//       Phase 1 — the edge closer to the destination (the leading edge)
//                 stretches out toward the new tab while the other edge
//                 (the trailing edge) stays completely still.
//       Phase 2 — once the leading edge has arrived, it stays put and the
//                 trailing edge catches up to it, closing the gap back
//                 down to the tab's normal resting width.
//     This means the bar only ever stretches toward the side it's
//     actually moving to, never both directions at once, and the width
//     it reaches depends on the real distance between the two tabs
//     rather than a fixed multiplier.
//
// Other modules never touch the indicator's DOM directly; they just call
// TopbarIndicator.onActivate(tabElement) whenever they add the "active"
// class to a .topbar-section (see topbar.js and element-protection.js).

window.TopbarIndicator = (function () {
    'use strict';

    const RATIO_ACTIVE = 0.75;       // resting width under the active tab
    const RATIO_ACTIVE_HOVER = 0.6;  // active tab, also currently hovered

    const DUR_PHASE1 = 280;          // leading edge stretches toward the destination
    const DUR_PHASE2 = 240;          // trailing edge catches up, closing the gap
    const DUR_HOVER = 260;           // in-place shorten/lengthen on hover (active tab only)

    const EASE_HOVER = 'cubic-bezier(0.4, 0, 0.2, 1)';

    let container = null;   // .topbar-sections-left — positioning context
    let indicator = null;
    let activeTab = null;
    let hoveredTab = null;  // whichever tab the mouse is physically over, if any
    let sliding = false;
    let animGen = 0;        // generation counter — lets a new animation cancel a stale one
    let rafHandle = null;

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

    function easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    }

    function easeInCubic(t) {
        return t * t * t;
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

    // Two-phase "inchworm" animation. The edge closer to the destination
    // (the leading edge) stretches out to meet it first while the other
    // edge (the trailing edge) holds still; once the leading edge has
    // arrived, it holds still in turn while the trailing edge catches up,
    // closing the gap back down to the resting width. The target box is
    // recomputed every frame, so if the hover state changes mid-flight the
    // landing spot adapts smoothly.
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

        const totalDuration = DUR_PHASE1 + DUR_PHASE2;
        const startTime = performance.now();

        function frame(now) {
            if (myGen !== animGen) return; // superseded by a newer switch

            const elapsed = now - startTime;

            // Live final box — reflects current hover state even if it
            // changes while the animation is still running.
            const finalBox = boxForTab(newTab, ratioForTab(newTab));
            const finalLeft = finalBox.left;
            const finalRight = finalBox.left + finalBox.width;

            let left, right;

            if (elapsed < DUR_PHASE1) {
                // Phase 1: leading edge stretches toward the destination,
                // trailing edge stays put.
                const e = easeOutCubic(elapsed / DUR_PHASE1);
                if (movingRight) {
                    left = startLeft;
                    right = startRight + (finalRight - startRight) * e;
                } else {
                    right = startRight;
                    left = startLeft + (finalLeft - startLeft) * e;
                }
            } else {
                // Phase 2: leading edge holds at the destination, trailing
                // edge catches up and closes the gap.
                const e = easeInCubic(Math.min(1, (elapsed - DUR_PHASE1) / DUR_PHASE2));
                if (movingRight) {
                    right = finalRight;
                    left = startLeft + (finalLeft - startLeft) * e;
                } else {
                    left = finalLeft;
                    right = startRight + (finalRight - startRight) * e;
                }
            }

            setBox(left, right - left);

            if (elapsed < totalDuration) {
                rafHandle = requestAnimationFrame(frame);
            } else {
                sliding = false;
                rafHandle = null;
                // Snap to the exact resting box (guards against float drift)
                // and hand back to normal CSS-transition-driven hover state.
                settleOn(newTab, { instant: true });
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
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return { onActivate, reposition };
})();