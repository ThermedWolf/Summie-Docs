// ==================== DOCUMENT PREVIEW ====================
// Renders a .sumd document the same way the editor does, inside a scaled
// iframe so all CSS (styles.css, code-blocks.css, etc.) applies correctly.
//
// Usage:
//   const preview = new DocumentPreview(containerElement);
//   await preview.loadFromLocalStorage();   // uses summaryData in localStorage
//   await preview.loadFromFile(filePath);   // reads file via IPC
//   await preview.loadFromData(sumdData);   // raw parsed .sumd object
//   preview.destroy();

class DocumentPreview {
    /**
     * @param {HTMLElement} container  - Element to render the preview into.
     * @param {object} [options]
     * @param {number} [options.scale] - Override scale (default: auto-fit container width).
     * @param {string} [options.basePath] - Base path for CSS files (default: '../' from app/).
     */
    constructor(container, options = {}) {
        this._container = container;
        this._options = options;
        this._iframe = null;
        this._loader = null;
        this._resizeObserver = null;
        this._ready = false;
        this._pendingData = null;
        this._renderToken = 0;
        this._loadingActive = false;
        this._loaderDelayTimer = null;
        this._revealTimer = null;
        this._build();
    }

    // ── Build iframe ──────────────────────────────────────────────────────
    _build() {
        // Always ensure the container is a positioning context
        this._container.style.position = 'relative';
        this._container.style.overflow = 'hidden';

        if (!document.getElementById('docPreviewLoaderStyles')) {
            const style = document.createElement('style');
            style.id = 'docPreviewLoaderStyles';
            style.textContent = '@keyframes docPreviewSpin { to { transform: rotate(360deg); } }';
            document.head.appendChild(style);
        }

        this._loader = document.createElement('div');
        this._loader.className = 'doc-preview-loader';
        this._loader.innerHTML = `
            <div class="doc-preview-loader-spinner"></div>
            <span>Voorbeeld laden...</span>
        `;
        this._loader.style.cssText = `
            position: absolute;
            inset: 0;
            z-index: 2;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 8px;
            background: linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%);
            color: #64748b;
            font: 500 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            pointer-events: none;
            opacity: 0;
            display: none;
            transition: opacity 0.16s ease;
        `;

        const spinner = this._loader.querySelector('.doc-preview-loader-spinner');
        spinner.style.cssText = `
            width: 22px;
            height: 22px;
            border: 2px solid rgba(100, 116, 139, 0.22);
            border-top-color: #3b82f6;
            border-radius: 999px;
            animation: docPreviewSpin 0.75s linear infinite;
        `;

        this._iframe = document.createElement('iframe');
        this._iframe.className = 'doc-preview-iframe';
        this._iframe.setAttribute('sandbox', 'allow-same-origin');
        this._iframe.style.cssText = `
            width: 100%;
            height: 100%;
            border: none;
            display: block;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.16s ease;
        `;

        // Determine base URL for CSS files
        const base = this._options.basePath ||
            (window.location.href.includes('landing') || window.location.href.includes('manage') ? '' : '');

        const cssFiles = [
            base + 'styles.css',
            base + 'code-blocks.css',
            base + 'textbox.css',
            base + 'syntax-highlighting.css',
            base + 'references.css',
            base + 'tables.css',
            base + 'wiskunde.css',
            base + 'tabruler.css',
        ];

        const cssLinks = cssFiles.map(f =>
            `<link rel="stylesheet" href="${f}">`
        ).join('\n');

        const html = `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
    content="default-src 'self'; script-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none';">
${cssLinks}
<style>
    @keyframes docPreviewSpin { to { transform: rotate(360deg); } }
    *, *::before, *::after { box-sizing: border-box; }
    html, body {
        margin: 0; padding: 0;
        background: #f1f5f9;
        overflow-x: hidden;
    }
    body {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 0;
    }
    .preview-page {
        /* Matches .a4-page but without animation or contenteditable artifacts */
        width: 210mm;
        min-height: 297mm;
        background: white;
        padding: 25mm;
        box-shadow: 0 2px 12px rgba(0,0,0,0.12);
        margin: 0 auto;
        font-size: 12pt;
        line-height: 1.6;
        position: relative;
        overflow: hidden;
    }
    /* Disable interactive elements */
    a { pointer-events: none; }
    .code-copy-btn,
    .summie-textbox-drag,
    .summie-textbox-resize,
    .element-controls,
    .table-controls,
    [contenteditable] { pointer-events: none; outline: none; }
    /* Remove cursor artifacts */
    * { caret-color: transparent; user-select: none; }
</style>
</head>
<body>
<div class="preview-page a4-page" id="previewPage"></div>
</body>
</html>`;

        this._iframe.srcdoc = html;

        // Wait for iframe to load before rendering content
        this._iframe.addEventListener('load', () => {
            this._ready = true;
            if (this._pendingData) {
                this._render(this._pendingData);
                this._pendingData = null;
            }
            this._setupResizeObserver();
            // Force a scale pass after a short delay in case the container
            // has no dimensions yet (e.g. cards off-screen on initial paint)
            setTimeout(() => this._applyScale(), 50);
            setTimeout(() => this._applyScale(), 200);
        });

        this._container.appendChild(this._iframe);
        this._container.appendChild(this._loader);
    }

    // ── Resize scaling ────────────────────────────────────────────────────
    _setupResizeObserver() {
        if (this._resizeObserver) this._resizeObserver.disconnect();
        this._resizeObserver = new ResizeObserver(() => this._applyScale());
        this._resizeObserver.observe(this._container);
        this._applyScale();
    }

    _applyScale() {
        if (!this._iframe || !this._iframe.contentDocument) return;
        const iframeDoc = this._iframe.contentDocument;
        const page = iframeDoc.getElementById('previewPage');
        if (!page) return;

        const containerW = this._container.offsetWidth;
        if (!containerW) return;

        // A4 at 96dpi = 794px wide (210mm)
        const A4_PX = 794;
        const scale = this._options.scale || containerW / A4_PX;

        page.style.transform = `scale(${scale})`;
        page.style.transformOrigin = 'top left';
        page.style.marginLeft = '0';

        // Shrink the body height so the iframe doesn't overflow
        const scaledHeight = page.scrollHeight * scale;
        iframeDoc.body.style.height = scaledHeight + 'px';
        this._iframe.style.height = scaledHeight + 'px';
    }

    // ── Render content ────────────────────────────────────────────────────
    _render(data) {
        if (!this._iframe || !this._iframe.contentDocument) return;
        const renderToken = ++this._renderToken;
        this._startLoadingState();
        const iframeDoc = this._iframe.contentDocument;
        const page = iframeDoc.getElementById('previewPage');
        if (!page) return;

        const content = data.content || data.editor || '';

        // Strip placeholder text
        const cleaned = content
            .replace(/<p[^>]*class="[^"]*placeholder-text[^"]*"[^>]*>.*?<\/p>/gi, '')
            .trim();

        page.innerHTML = window.sanitizeSumdContent(cleaned) || '<p style="color:#9ca3af;font-style:italic;">Leeg document</p>';

        // Apply custom styles if any
        if (data.customStyles) {
            let styleEl = iframeDoc.getElementById('customStyles');
            if (!styleEl) {
                styleEl = iframeDoc.createElement('style');
                styleEl.id = 'customStyles';
                iframeDoc.head.appendChild(styleEl);
            }
            const rules = Object.entries(data.customStyles)
                .map(([cls, props]) => `.${cls} { ${Object.entries(props).map(([k, v]) => `${k}:${v}`).join(';')} }`)
                .join('\n');
            styleEl.textContent = rules;
        }

        this._revealWhenStable(renderToken);
    }

    _startLoadingState() {
        if (this._loadingActive) return;
        this._loadingActive = true;
        if (this._revealTimer) {
            clearTimeout(this._revealTimer);
            this._revealTimer = null;
        }
        if (this._loaderDelayTimer) {
            clearTimeout(this._loaderDelayTimer);
            this._loaderDelayTimer = null;
        }
        if (this._iframe) this._iframe.style.opacity = '0';
        if (this._loader) {
            this._loader.style.opacity = '0';
            this._loader.style.display = 'none';
            this._loaderDelayTimer = setTimeout(() => {
                if (!this._loader || !this._iframe || this._iframe.style.opacity === '1') return;
                this._loader.style.display = 'flex';
                requestAnimationFrame(() => {
                    if (this._loader) this._loader.style.opacity = '1';
                });
                this._loaderDelayTimer = null;
            }, 250);
        }
    }

    _revealPreview() {
        this._loadingActive = false;
        if (this._loaderDelayTimer) {
            clearTimeout(this._loaderDelayTimer);
            this._loaderDelayTimer = null;
        }
        if (!this._iframe || !this._loader) return;
        this._iframe.style.opacity = '1';
        this._loader.style.opacity = '0';
        this._revealTimer = setTimeout(() => {
            if (this._loader) this._loader.style.display = 'none';
            this._revealTimer = null;
        }, 180);
    }

    _nextFrame() {
        return new Promise(resolve => requestAnimationFrame(resolve));
    }

    async _revealWhenStable(renderToken) {
        const iframeDoc = this._iframe?.contentDocument;
        if (!iframeDoc) return;

        await this._nextFrame();
        await this._nextFrame();

        if (iframeDoc.fonts && iframeDoc.fonts.ready) {
            try { await iframeDoc.fonts.ready; } catch { }
        }

        const images = Array.from(iframeDoc.images || []).filter(img => !img.complete);
        if (images.length) {
            await Promise.race([
                Promise.all(images.map(img => new Promise(resolve => {
                    img.addEventListener('load', resolve, { once: true });
                    img.addEventListener('error', resolve, { once: true });
                }))),
                new Promise(resolve => setTimeout(resolve, 500))
            ]);
        }

        if (renderToken !== this._renderToken) return;

        this._applyScale();
        await this._nextFrame();
        this._applyScale();
        await this._nextFrame();
        this._applyScale();

        if (renderToken !== this._renderToken) return;

        // If the container still has no width (card not yet laid out), wait for
        // the ResizeObserver to fire with real dimensions before revealing.
        if (!this._container.offsetWidth) {
            const waitForSize = new Promise(resolve => {
                const obs = new ResizeObserver(entries => {
                    if (entries[0].contentRect.width > 0) {
                        obs.disconnect();
                        resolve();
                    }
                });
                obs.observe(this._container);
                // Fallback: reveal after 500ms regardless
                setTimeout(() => { obs.disconnect(); resolve(); }, 500);
            });
            await waitForSize;
            if (renderToken !== this._renderToken) return;
            this._applyScale();
            await this._nextFrame();
        }

        this._revealPreview();
    }

    // ── Public API ────────────────────────────────────────────────────────

    /** Load preview from localStorage (summaryData) */
    async loadFromLocalStorage() {
        try {
            const raw = localStorage.getItem('summaryData');
            if (!raw) return;
            const data = JSON.parse(raw);
            return this.loadFromData(data);
        } catch (e) {
            console.warn('DocumentPreview: failed to load from localStorage', e);
        }
    }

    /** Load preview from a .sumd file path via Electron IPC */
    async loadFromFile(filePath) {
        this._startLoadingState();
        if (!window.electron || !window.electron.openSumdFileByPath) {
            console.warn('DocumentPreview: openSumdFileByPath not available');
            this._showErrorState();
            return;
        }
        try {
            const data = await window.electron.openSumdFileByPath(filePath);
            if (data) {
                return this.loadFromData(data);
            } else {
                this._showErrorState();
            }
        } catch (e) {
            console.warn('DocumentPreview: failed to load file', filePath, e);
            this._showErrorState();
        }
    }

    /** Show a subtle "not found" state instead of an endless loader */
    _showErrorState() {
        if (this._loaderDelayTimer) {
            clearTimeout(this._loaderDelayTimer);
            this._loaderDelayTimer = null;
        }
        this._loadingActive = false;
        if (!this._loader) return;
        this._loader.style.display = 'flex';
        this._loader.style.opacity = '1';
        this._loader.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.5" style="flex-shrink:0">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span style="color:#94a3b8;font-size:10px;text-align:center;padding:0 8px;">Bestand niet gevonden</span>
        `;
    }

    /** Load preview from a parsed .sumd data object */
    loadFromData(data) {
        if (!data) return;
        this._startLoadingState();
        if (!this._ready) {
            this._pendingData = data;
        } else {
            this._render(data);
        }
    }

    /** Clear the preview */
    clear() {
        this._render({ content: '' });
    }

    /** Clean up */
    destroy() {
        if (this._loaderDelayTimer) clearTimeout(this._loaderDelayTimer);
        if (this._revealTimer) clearTimeout(this._revealTimer);
        if (this._resizeObserver) this._resizeObserver.disconnect();
        if (this._iframe && this._iframe.parentNode) {
            this._iframe.parentNode.removeChild(this._iframe);
        }
        if (this._loader && this._loader.parentNode) {
            this._loader.parentNode.removeChild(this._loader);
        }
        this._iframe = null;
        this._loader = null;
        this._ready = false;
        this._loadingActive = false;
    }
}

// Make available globally
window.DocumentPreview = DocumentPreview;