// ==================== TAB RULER ====================
// Werkt zoals Word:
//   - Tab-toets voegt een <span class="tab-char"> in (een markering, geen vaste breedte)
//   - Tabstops worden opgeslagen als data-attribuut op de paragraaf: data-tabstops="60,120"
//   - Na elke wijziging (stop toegevoegd/verplaatst/verwijderd, vensterbreedte veranderd)
//     worden alle tab-spans in de paragraaf opnieuw berekend via renderTabsInPara()
//   - Standaard tabstops: elke 12.5mm als er geen custom stops zijn
//   - De ruler toont actieve stops (blauw, versleepbaar) en stops van andere paragrafen (grijs)

(function () {
    const PAGE_WIDTH_MM = 210;
    const MARGIN_MM = 25;
    const CONTENT_MM = PAGE_WIDTH_MM - 2 * MARGIN_MM; // 160mm
    const DEFAULT_TAB_MM = 12.5;

    // ── State ──────────────────────────────────────────────────────────────
    const indents = new Map(); // pageIdx → { firstLine, left, right }
    const lastActivePara = new Map(); // pageIdx → Element

    // ── Coordinate helpers ─────────────────────────────────────────────────
    function mmToPx(mm, rw) { return (mm / PAGE_WIDTH_MM) * rw; }
    function pxToMm(px, rw) { return (px / rw) * PAGE_WIDTH_MM; }
    function getRulerWidth(ruler) { return ruler.getBoundingClientRect().width; }

    // ── Per-paragraph tabstop storage (via data attribute) ─────────────────
    // Stores mm values as "60,120,150" on the element itself — survives DOM moves,
    // serialises automatically with innerHTML, and is per-paragraph by nature.

    function getParaStops(para) {
        if (!para) return [];
        const raw = para.dataset.tabstops;
        if (!raw) return [];
        return raw.split(',').map(Number).filter(n => !isNaN(n) && n > 0);
    }

    function setParaStops(para, stops) {
        if (!para) return;
        if (stops.length === 0) {
            delete para.dataset.tabstops;
        } else {
            para.dataset.tabstops = stops.join(',');
        }
    }

    // Effective stops for a paragraph: custom if set, else default grid
    function effectiveStops(para) {
        const custom = getParaStops(para);
        if (custom.length > 0) return custom;
        // Default: every DEFAULT_TAB_MM from left margin to right margin
        const stops = [];
        for (let mm = MARGIN_MM + DEFAULT_TAB_MM; mm < PAGE_WIDTH_MM - MARGIN_MM; mm += DEFAULT_TAB_MM) {
            stops.push(Math.round(mm * 10) / 10);
        }
        return stops;
    }

    // ── Active paragraph helpers ───────────────────────────────────────────
    function getActiveParagraph(page) {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return null;
        let node = sel.getRangeAt(0).startContainer;
        while (node && node !== page) {
            if (node.nodeType === 1 && node.parentNode === page) return node;
            node = node.parentNode;
        }
        return null;
    }

    function getTargetParagraph(idx) {
        const page = getPageEl(idx);
        if (!page) return null;
        const live = getActiveParagraph(page);
        if (live) { lastActivePara.set(idx, live); return live; }
        const last = lastActivePara.get(idx);
        if (last && page.contains(last)) return last;
        return page.querySelector('p, div, li, h1, h2, h3, h4, h5, h6') || null;
    }

    // Like getTargetParagraph but falls back to the page element itself
    // so tabstops can always be stored even on a completely blank page.
    function getStopTarget(idx) {
        return getTargetParagraph(idx) || getPageEl(idx);
    }

    // ── Helpers ────────────────────────────────────────────────────────────
    let fixedRuler = null;
    let activePageIdx = 0;

    function getRulerForPage(idx) {
        if (fixedRuler && parseInt(fixedRuler.dataset.pageIndex || 0) === idx) return fixedRuler;
        return document.querySelector(`.tab-ruler[data-page-index="${idx}"]`);
    }
    function getPageEl(idx) { return document.querySelectorAll('.a4-page')[idx] || null; }
    function getPageIdx(page) { return parseInt(page.dataset.pageIndex || 0); }
    function save() { window.saveToLocalStorage && window.saveToLocalStorage(); }

    // ── getCursorMm ────────────────────────────────────────────────────────
    function getCursorMm(ruler) {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return null;
        const range = sel.getRangeAt(0).cloneRange();
        range.collapse(true);
        const rects = range.getClientRects();
        let cursorLeft;
        if (rects.length > 0) {
            cursorLeft = rects[0].left;
        } else {
            let node = range.startContainer;
            if (node.nodeType === 3) node = node.parentElement;
            cursorLeft = node.getBoundingClientRect().left;
        }
        const rulerLeft = ruler.getBoundingClientRect().left;
        return pxToMm(cursorLeft - rulerLeft, getRulerWidth(ruler));
    }

    // ── Tab rendering ──────────────────────────────────────────────────────
    // Uses real \t characters + CSS tab-size. No spans — no layout issues.
    //
    // For a SINGLE custom stop at position S (px from paragraph left):
    //   tab-size = S  → first \t on any line jumps to S exactly. ✓
    //
    // For MULTIPLE stops at S1, S2, S3...:
    //   We use the GCD of all stop distances so every stop is a multiple of tab-size.
    //   Example: stops at 55mm and 110mm → GCD = 55mm → tab-size = 55mm → both hit exactly. ✓
    //   Example: stops at 60mm and 100mm → GCD = 20mm → tab-size = 20mm → both hit exactly. ✓
    //   Pathological case (e.g. 53mm, 97mm): GCD = 1mm → tiny tabs, still correct but many steps.
    //
    function renderTabsInPara(para, ruler) {
        if (!para || !ruler) return;
        const stops = effectiveStops(para); // mm from page left
        const rw = getRulerWidth(ruler);
        const rulerLeft = ruler.getBoundingClientRect().left;
        const paraLeft = para.getBoundingClientRect().left;

        // Convert stops to px from paragraph left edge
        const stopsPx = stops
            .map(mm => Math.round(rulerLeft + mmToPx(mm, rw) - paraLeft))
            .filter(px => px > 0);

        if (stopsPx.length === 0) {
            para.style.removeProperty('tab-size');
            return;
        }

        let tabSizePx;
        if (stopsPx.length === 1) {
            // Single stop: tab-size = stop position exactly
            tabSizePx = stopsPx[0];
        } else {
            // Multiple stops: use GCD so all stops are exact multiples
            const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
            tabSizePx = stopsPx.reduce((a, b) => gcd(a, b));
            // Sanity: if GCD is too small (< 4px) fall back to first stop
            if (tabSizePx < 4) tabSizePx = stopsPx[0];
        }

        para.style.tabSize = tabSizePx + 'px';
    }

    // Render tabs on all paragraphs of a page (called on resize/stop change)
    function renderTabsOnPage(idx) {
        const page = getPageEl(idx);
        const ruler = getRulerForPage(idx);
        if (!page || !ruler) return;
        page.querySelectorAll('p, div, li, h1, h2, h3, h4, h5, h6').forEach(para => {
            renderTabsInPara(para, ruler);
        });
    }

    // ── Tab key handler ────────────────────────────────────────────────────
    // Inserts a real \t character. The paragraph renders it via white-space:pre-wrap
    // and tab-size CSS. Cursor navigation, end-of-line, copy/paste all work natively.
    function handleTabKey() {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return false;

        let node = sel.getRangeAt(0).startContainer;
        let page = null;
        while (node && node !== document.body) {
            if (node.nodeType === 1 && node.classList &&
                node.classList.contains('a4-page')) { page = node; break; }
            node = node.parentNode;
        }
        if (!page) return false;

        // Insert real tab — works at end of content, native cursor navigation
        document.execCommand('insertText', false, '\t');

        // Find the paragraph and update its tab-size CSS
        const idx = getPageIdx(page);
        const ruler = getRulerForPage(idx);
        const cur = sel.getRangeAt(0).startContainer;
        let para = cur.nodeType === 3 ? cur.parentElement : cur;
        while (para && para !== page) {
            if (para.parentNode === page) break;
            para = para.parentNode;
        }
        if (para && para !== page) {
            para.classList.add('has-tabstop');
            if (ruler) renderTabsInPara(para, ruler);
        }

        page.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
    }

    // ── Indent helpers ─────────────────────────────────────────────────────
    function getIndent(idx) {
        if (!indents.has(idx)) indents.set(idx, { firstLine: 0, left: 0, right: 0 });
        return indents.get(idx);
    }

    function applyIndentToPage(idx) {
        const ind = getIndent(idx);
        const para = getTargetParagraph(idx);
        if (!para) return;
        para.style.marginLeft = ind.left + 'mm';
        para.style.marginRight = ind.right + 'mm';
        para.style.textIndent = ind.firstLine + 'mm';
    }

    // ── Scale ──────────────────────────────────────────────────────────────
    function buildScale(ruler, scale) {
        scale.innerHTML = '';
        const rw = getRulerWidth(ruler);
        if (rw < 10) { requestAnimationFrame(() => buildScale(ruler, scale)); return; }
        for (let mm = 0; mm <= PAGE_WIDTH_MM; mm++) {
            const x = (mm / PAGE_WIDTH_MM) * rw;
            if (mm % 10 === 0) {
                const tick = document.createElement('div');
                tick.className = 'tab-ruler-tick major';
                tick.style.left = x + 'px';
                scale.appendChild(tick);
                const label = document.createElement('span');
                label.className = 'tab-ruler-label';
                label.textContent = mm;
                label.style.left = x + 'px';
                scale.appendChild(label);
            } else if (mm % 5 === 0) {
                const tick = document.createElement('div');
                tick.className = 'tab-ruler-tick minor';
                tick.style.left = x + 'px';
                scale.appendChild(tick);
            } else {
                const tick = document.createElement('div');
                tick.className = 'tab-ruler-tick micro';
                tick.style.left = x + 'px';
                scale.appendChild(tick);
            }
        }
    }

    // ── Tabstop add / remove / move ────────────────────────────────────────
    // Only ONE tabstop per paragraph is supported (matches CSS tab-size limitation).
    // Clicking the ruler while a stop already exists moves it to the new position.
    function addTabStop(idx, mm) {
        const target = getStopTarget(idx);
        const mmR = Math.round(mm * 2) / 2;
        if (mmR < MARGIN_MM || mmR > PAGE_WIDTH_MM - MARGIN_MM) return;
        const stops = getParaStops(target);

        if (stops.length > 0) {
            // Move the existing stop to the new position instead of adding a second
            stops[0] = mmR;
        } else {
            stops.push(mmR);
        }
        setParaStops(target, stops);
        afterStopChange(idx, target);
    }

    function removeTabStop(idx, mm) {
        const target = getStopTarget(idx);
        const stops = getParaStops(target);
        const i = stops.findIndex(s => Math.abs(s - mm) < 1);
        if (i === -1) return;
        stops.splice(i, 1);
        setParaStops(target, stops);
        afterStopChange(idx, target);
    }

    function moveTabStop(idx, oldMm, newMm) {
        const target = getStopTarget(idx);
        const stops = getParaStops(target);
        const clamped = Math.max(MARGIN_MM, Math.min(PAGE_WIDTH_MM - MARGIN_MM, Math.round(newMm * 2) / 2));
        // Only one stop allowed — always replace index 0
        stops[0] = clamped;
        setParaStops(target, stops);
        afterStopChange(idx, target);
    }

    function afterStopChange(idx, target) {
        const ruler = getRulerForPage(idx);
        renderStops(ruler, idx);
        if (target && ruler) renderTabsInPara(target, ruler);
        save();
    }

    // ── renderStops ────────────────────────────────────────────────────────
    function renderStops(ruler, idx) {
        if (!ruler) return;
        const layer = ruler.querySelector('.tab-ruler-stops');
        if (!layer) return;
        layer.innerHTML = '';
        const rw = getRulerWidth(ruler);
        const activePara = getTargetParagraph(idx);
        const activeStops = activePara ? getParaStops(activePara) : [];

        // Ghost stops from other paragraphs
        const page = getPageEl(idx);
        if (page) {
            const ghostMms = new Set();
            // Include the page element itself (used as fallback when no para exists)
            const candidates = [page, ...page.querySelectorAll('p, div, li, h1, h2, h3, h4, h5, h6')];
            candidates.forEach(el => {
                if (el === activePara) return;
                getParaStops(el).forEach(mm => ghostMms.add(mm));
            });
            ghostMms.forEach(mm => {
                const m = document.createElement('div');
                m.className = 'tab-stop-marker tab-stop-ghost';
                m.style.left = mmToPx(mm, rw) + 'px';
                m.title = Math.round(mm) + ' mm (andere regel)';
                layer.appendChild(m);
            });
        }

        // Active paragraph's stops — blue, draggable
        activeStops.forEach(mm => {
            const m = document.createElement('div');
            m.className = 'tab-stop-marker';
            m.style.left = mmToPx(mm, rw) + 'px';
            m.title = Math.round(mm) + ' mm — sleep of klik om te verwijderen';
            m.dataset.mm = mm;

            m.addEventListener('mousedown', function (e) {
                if (e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                const startX = e.clientX;
                const startMm = mm;
                let moved = false;
                let lastMm = startMm;

                const onMove = (ev) => {
                    const dx = ev.clientX - startX;
                    if (!moved && Math.abs(dx) < 3) return;
                    moved = true;
                    const rw2 = getRulerWidth(ruler);
                    const newMm = Math.max(MARGIN_MM, Math.min(PAGE_WIDTH_MM - MARGIN_MM, startMm + pxToMm(dx, rw2)));
                    m.style.left = mmToPx(newMm, rw2) + 'px';

                    // Update live every 2px of movement
                    const movedPx = Math.abs(mmToPx(newMm - lastMm, rw2));
                    if (movedPx >= 2) {
                        lastMm = newMm;
                        moveTabStop(idx, startMm, newMm);
                    }
                };
                const onUp = (ev) => {
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                    if (!moved) {
                        removeTabStop(idx, startMm);
                    } else {
                        const rw2 = getRulerWidth(ruler);
                        const newMm = startMm + pxToMm(ev.clientX - startX, rw2);
                        moveTabStop(idx, startMm, newMm);
                    }
                };
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
            });
            layer.appendChild(m);
        });
    }

    // ── Indent sliders ─────────────────────────────────────────────────────
    function renderIndents(ruler, idx) {
        const layer = ruler.querySelector('.tab-ruler-indents');
        if (!layer) return;
        layer.innerHTML = '';
        const ind = getIndent(idx);
        const rw = getRulerWidth(ruler);

        const leftX = mmToPx(MARGIN_MM + ind.left, rw);
        const firstLineX = mmToPx(MARGIN_MM + ind.left + ind.firstLine, rw);
        const rightX = mmToPx(PAGE_WIDTH_MM - MARGIN_MM - ind.right, rw);

        const defaultLeftX = mmToPx(MARGIN_MM, rw);
        const defaultRightX = mmToPx(PAGE_WIDTH_MM - MARGIN_MM, rw);
        if (ind.left === 0) addSnapLine(layer, defaultLeftX);
        if (ind.left + ind.firstLine === 0) addSnapLine(layer, defaultLeftX);
        if (ind.right === 0) addSnapLine(layer, defaultRightX);

        const block = makeHandle('indent-block', leftX, 'Linker inspringing');
        const hangTri = makeHandle('indent-hang-tri', leftX, 'Hangende inspringing');
        const firstTri = makeHandle('indent-first-tri', firstLineX, 'Eerste-regel inspringing');
        const rightTri = makeHandle('indent-right-tri', rightX, 'Rechter inspringing');

        layer.appendChild(block);
        layer.appendChild(hangTri);
        layer.appendChild(firstTri);
        layer.appendChild(rightTri);

        setupDrag(ruler, idx, block, 'block');
        setupDrag(ruler, idx, hangTri, 'hang');
        setupDrag(ruler, idx, firstTri, 'firstLine');
        setupDrag(ruler, idx, rightTri, 'right');
    }

    function addSnapLine(layer, x) {
        const line = document.createElement('div');
        line.className = 'indent-snap-line';
        line.style.left = x + 'px';
        layer.appendChild(line);
    }

    function makeHandle(cls, x, title) {
        const h = document.createElement('div');
        h.className = 'indent-handle ' + cls;
        h.style.left = x + 'px';
        h.title = title;
        return h;
    }

    function setupDrag(ruler, idx, handle, type) {
        handle.addEventListener('mousedown', function (e) {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();

            const startX = e.clientX;
            const ind0 = { ...getIndent(idx) };
            const SNAP = 1.5;
            const MIN = -MARGIN_MM;
            const MAX = CONTENT_MM + MARGIN_MM;

            const onMove = (ev) => {
                const rw = getRulerWidth(ruler);
                const dMm = pxToMm(ev.clientX - startX, rw);
                const ind = getIndent(idx);
                let nL, nR, nF;

                if (type === 'block') {
                    nL = Math.max(MIN, Math.min(MAX - ind0.right, ind0.left + dMm));
                    const fa = nL + ind0.firstLine;
                    nF = fa < MIN ? MIN - nL : fa > MAX ? MAX - nL : ind0.firstLine;
                    nR = ind0.right;
                } else if (type === 'hang') {
                    const fa = ind0.left + ind0.firstLine;
                    nL = Math.max(MIN, Math.min(MAX - ind0.right, ind0.left + dMm));
                    nF = fa - nL;
                    nR = ind0.right;
                } else if (type === 'firstLine') {
                    const fa0 = ind0.left + ind0.firstLine;
                    const maxA = CONTENT_MM - ind0.right;
                    const nA = Math.max(MIN, Math.min(maxA, fa0 + dMm));
                    nL = ind.left; nF = nA - ind.left; nR = ind.right;
                } else {
                    const maxR = CONTENT_MM - (ind0.left + ind0.firstLine);
                    nL = ind.left; nF = ind.firstLine;
                    nR = Math.max(MIN, Math.min(maxR, ind0.right - dMm));
                }

                ind.left = Math.abs(nL) <= SNAP ? 0 : nL;
                ind.right = Math.abs(nR) <= SNAP ? 0 : nR;
                ind.firstLine = Math.abs(nL + nF) <= SNAP ? -ind.left : nF;

                renderIndents(ruler, idx);
                applyIndentToPage(idx);
            };

            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                save();
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    }

    // ── Selection sync ─────────────────────────────────────────────────────
    function trackActivePara() {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        let node = sel.getRangeAt(0).startContainer;
        while (node && node !== document.body) {
            if (node.nodeType === 1 && node.classList && node.classList.contains('a4-page')) {
                const idx = getPageIdx(node);
                const para = getActiveParagraph(node);
                if (!para) break;

                const changed = lastActivePara.get(idx) !== para;
                lastActivePara.set(idx, para);

                if (changed) {
                    // Read indent values from the new paragraph's inline styles
                    const ind = getIndent(idx);
                    ind.left = parseFloat(para.style.marginLeft) || 0;
                    ind.right = parseFloat(para.style.marginRight) || 0;
                    ind.firstLine = parseFloat(para.style.textIndent) || 0;
                }

                const ruler = getRulerForPage(idx);
                if (ruler) {
                    renderIndents(ruler, idx);
                    renderStops(ruler, idx);
                }
                break;
            }
            node = node.parentNode;
        }
    }

    function setupSelectionSync() {
        document.addEventListener('selectionchange', trackActivePara);
        // Also track on mouseup so ruler clicks after editor focus have lastActivePara set
        document.addEventListener('mouseup', function (e) {
            if (!e.target.closest || e.target.closest('#fixed-tab-ruler')) return;
            trackActivePara();
        });
        // When Enter creates a new paragraph, the browser copies data-* attributes.
        // Clear data-tabstops from any paragraph that has it but contains no \t.
        document.addEventListener('keyup', function (e) {
            if (e.key !== 'Enter') return;
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) return;
            let node = sel.getRangeAt(0).startContainer;
            while (node && node !== document.body) {
                if (node.nodeType === 1 && node.classList &&
                    node.classList.contains('a4-page')) {
                    const para = getActiveParagraph(node);
                    if (para && para.dataset.tabstops) {
                        // New paragraph from Enter — clear inherited tabstop
                        const hasTab = para.textContent.includes('\t');
                        if (!hasTab) {
                            delete para.dataset.tabstops;
                            para.classList.remove('has-tabstop');
                        }
                        const ruler = getRulerForPage(getPageIdx(node));
                        if (ruler) renderStops(ruler, getPageIdx(node));
                    }
                    break;
                }
                node = node.parentNode;
            }
        });
    }

    // ── Fixed ruler ────────────────────────────────────────────────────────
    function createRuler(pageIndex) {
        const ruler = document.createElement('div');
        ruler.className = 'tab-ruler';
        ruler.dataset.pageIndex = pageIndex;

        const scale = document.createElement('div'); scale.className = 'tab-ruler-scale';
        const stopsLayer = document.createElement('div'); stopsLayer.className = 'tab-ruler-stops';
        const indLayer = document.createElement('div'); indLayer.className = 'tab-ruler-indents';

        ruler.appendChild(scale);
        ruler.appendChild(stopsLayer);
        ruler.appendChild(indLayer);

        ruler.addEventListener('mousedown', function (e) {
            if (e.button !== 0) return;
            if (e.target.closest('.indent-handle')) return;
            if (e.target.closest('.tab-stop-marker')) return;
            e.preventDefault();
            const rw = getRulerWidth(ruler);
            const x = e.clientX - ruler.getBoundingClientRect().left;
            addTabStop(pageIndex, pxToMm(x, rw));
        });

        return ruler;
    }

    function createFixedRuler() {
        if (fixedRuler) return;
        fixedRuler = createRuler(0);
        fixedRuler.id = 'fixed-tab-ruler';
        document.body.appendChild(fixedRuler);

        requestAnimationFrame(() => {
            positionFixedRuler();
            requestAnimationFrame(() => {
                buildScale(fixedRuler, fixedRuler.querySelector('.tab-ruler-scale'));
                renderIndents(fixedRuler, 0);
                renderStops(fixedRuler, 0);
            });
        });
    }

    function positionFixedRuler() {
        if (!fixedRuler) return;
        const page = getPageEl(activePageIdx);
        if (!page) return;

        const topbarH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar-height')) || 133;
        const pageRect = page.getBoundingClientRect();

        fixedRuler.style.top = topbarH + 'px';
        fixedRuler.style.left = Math.round(pageRect.left) + 'px';
        fixedRuler.style.width = Math.round(pageRect.width) + 'px';

        const marginPct = (MARGIN_MM / PAGE_WIDTH_MM * 100).toFixed(4) + '%';
        fixedRuler.style.setProperty('--ruler-margin', marginPct);

        buildScale(fixedRuler, fixedRuler.querySelector('.tab-ruler-scale'));

        // Re-render all tab spans since pixel widths may have changed
        renderTabsOnPage(activePageIdx);
    }

    function switchRulerToPage(idx) {
        if (!fixedRuler || idx === activePageIdx) return;
        activePageIdx = idx;
        fixedRuler.dataset.pageIndex = idx;
        positionFixedRuler();
        renderStops(fixedRuler, idx);
        renderIndents(fixedRuler, idx);
    }

    function updateActivePageFromScroll() {
        let best = 0, bestVis = -1;
        document.querySelectorAll('.a4-page').forEach(page => {
            const r = page.getBoundingClientRect();
            const vis = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
            const idx = getPageIdx(page);
            if (vis > bestVis) { bestVis = vis; best = idx; }
        });
        switchRulerToPage(best);
        positionFixedRuler();
    }

    function attachRulerToPage(page) {
        new ResizeObserver(() => positionFixedRuler()).observe(page);
    }

    function attachRulersToAllPages() {
        document.querySelectorAll('.a4-page').forEach(attachRulerToPage);
        createFixedRuler();
        const docSection = document.querySelector('.document-section');
        if (docSection) docSection.addEventListener('scroll', updateActivePageFromScroll, { passive: true });
        window.addEventListener('resize', positionFixedRuler);
    }

    // ── Serialisation ──────────────────────────────────────────────────────
    // Tabstops live on paragraph data attributes — they're saved with the HTML content
    // automatically. These functions handle indent sliders only.
    function getTabStopsData() { return {}; } // no-op: stored in DOM
    function loadTabStopsData(data) {
        // Tabstops live in data-tabstops attributes on paragraphs (saved with innerHTML).
        // We just need to re-apply tab-size CSS to all paragraphs that have stops.
        setTimeout(() => {
            document.querySelectorAll('.a4-page').forEach(page => {
                const idx = getPageIdx(page);
                const ruler = getRulerForPage(idx);
                if (!ruler) return;
                page.querySelectorAll('[data-tabstops]').forEach(para => {
                    renderTabsInPara(para, ruler);
                });
                renderStops(ruler, idx);
            });
        }, 100);
    }

    function getIndentsData() {
        const r = {}; indents.forEach((v, k) => { r[k] = { ...v }; }); return r;
    }
    function loadIndentsData(data) {
        if (!data) return;
        indents.clear();
        Object.keys(data).forEach(k => indents.set(parseInt(k), data[k]));
        document.querySelectorAll('.a4-page').forEach(page => {
            const idx = getPageIdx(page);
            applyIndentToPage(idx);
            const ruler = getRulerForPage(idx);
            if (ruler) renderIndents(ruler, idx);
        });
    }

    // ── Init ───────────────────────────────────────────────────────────────
    function init() {
        setTimeout(attachRulersToAllPages, 150);
        setupSelectionSync();

        // Re-apply tab-size CSS to any paragraphs with data-tabstops
        // (restored from saved HTML content)
        setTimeout(() => {
            document.querySelectorAll('.a4-page').forEach(page => {
                const idx = getPageIdx(page);
                const ruler = getRulerForPage(idx);
                if (!ruler) return;
                page.querySelectorAll('[data-tabstops]').forEach(para => {
                    renderTabsInPara(para, ruler);
                });
            });
        }, 400);

        const container = document.getElementById('pagesContainer');
        if (container) {
            new MutationObserver(mutations => {
                mutations.forEach(m => m.addedNodes.forEach(node => {
                    if (node.nodeType === 1 && node.classList.contains('a4-page'))
                        setTimeout(() => attachRulerToPage(node), 50);
                }));
            }).observe(container, { childList: true });
        }
    }

    window.TabRuler = {
        init,
        handleTabKey,
        getTabStopsData, loadTabStopsData,
        getIndentsData, loadIndentsData,
        attachRulersToAllPages
    };
})();