// ==================== TOPBAR FUNCTIONALITY ====================

class TopbarManager {
    constructor() {
        this.currentSection = 'bewerken'; // Default section
        this.currentTextColor = '#000000';
        this.currentHighlightColor = '#ffff00';
        this.init();
    }

    init() {
        this.initSectionSwitching();
        this.initColorPickers();
        this.initFormatButtons();
        this.initFileSidebar();
        this.initFileOperations();
        this.initStyleSelector();
        this.initEditorRangeTracking();
        this.initLogoClick();
        this.initWindowControls();
    }

    initLogoClick() {
        const logo = document.querySelector('.topbar-logo');
        if (logo) {
            logo.style.cursor = 'pointer';
            logo.addEventListener('click', () => {
                window.location.href = 'landing.html';
            });
        }
    }

    initWindowControls() {
        const minimize = document.getElementById('winMinimize');
        const maximize = document.getElementById('winMaximize');
        const close = document.getElementById('winClose');

        if (minimize) minimize.addEventListener('click', () => window.electron && window.electron.windowMinimize());
        if (maximize) maximize.addEventListener('click', () => window.electron && window.electron.windowMaximize());
        if (close) close.addEventListener('click', () => window.electron && window.electron.windowClose());

        if (!window.electron) return;

        // Sync initial maximized state on load
        window.electron.windowIsMaximized().then(isMaximized => {
            this._setMaximizeState(isMaximized);
        });

        // Listen for window state changes from main process
        window.electron.onWindowStateChanged(state => {
            if (state.maximized !== undefined) this._setMaximizeState(state.maximized);
        });

        // Report maximize button rect to main process so Windows snap layouts flyout works.
        // We send it on load and whenever the window resizes (the button may shift).
        if (maximize) {
            const reportRect = () => {
                const r = maximize.getBoundingClientRect();
                window.electron.setMaximizeBtnRect({
                    left: Math.round(r.left),
                    top: Math.round(r.top),
                    right: Math.round(r.right),
                    bottom: Math.round(r.bottom),
                });
            };
            // Send once layout is stable, then on every resize
            requestAnimationFrame(() => requestAnimationFrame(reportRect));
            window.addEventListener('resize', reportRect);
        }
    }

    _setMaximizeState(isMaximized) {
        const maximize = document.getElementById('winMaximize');
        if (!maximize) return;
        const iconMax = maximize.querySelector('.icon-maximize');
        const iconRestore = maximize.querySelector('.icon-restore');
        if (iconMax) iconMax.style.display = isMaximized ? 'none' : '';
        if (iconRestore) iconRestore.style.display = isMaximized ? '' : 'none';
        maximize.title = isMaximized ? 'Terugzetten' : 'Maximaliseren';
    }

    // Track cursor position in editor to preserve it when clicking UI elements
    initEditorRangeTracking() {
        const editor = document.getElementById('editor');
        if (editor) {
            // Save range whenever selection changes in the editor
            editor.addEventListener('mouseup', () => {
                this.saveCurrentRange();
            });
            editor.addEventListener('keyup', () => {
                this.saveCurrentRange();
            });
            // Save when editor loses focus (user clicks away)
            editor.addEventListener('blur', () => {
                this.saveCurrentRange();
            });
        }
    }

    // ==================== SECTION SWITCHING ====================

    initSectionSwitching() {
        const sections = document.querySelectorAll('.topbar-section');

        sections.forEach(section => {
            // Prevent mousedown from stealing focus away from the editor
            section.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.saveCurrentRange();
            });
            section.addEventListener('click', () => {
                const sectionName = section.dataset.section;
                this.switchSection(sectionName);
            });
        });

        // Also listen for tab switches in the sidebar to refresh inhoud line
        const tabs = document.querySelectorAll('.tab');
        tabs.forEach(tab => {
            // Prevent mousedown from stealing focus away from the editor
            tab.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.saveCurrentRange();
            });
            tab.addEventListener('click', () => {
                if (tab.dataset.tab === 'inhoud') {
                    // Refresh the inhoud progress line when switching to inhoud tab
                    setTimeout(() => {
                        if (window.updateActiveInhoudItem) {
                            window.updateActiveInhoudItem();
                        }
                    }, 100);
                }
                // Restore focus to editor after tab switch
                this.restoreEditorFocus();
            });
        });
    }

    switchSection(sectionName) {
        // Update active section in topbar — only touch normal (non-context) tabs
        document.querySelectorAll('.topbar-section:not(.context-tab)').forEach(section => {
            section.classList.remove('active');
        });
        document.querySelector(`[data-section="${sectionName}"]`).classList.add('active');

        // When switching to a normal section, context tabs become inactive
        document.querySelectorAll('.context-tab').forEach(t => t.classList.remove('active'));

        // Handle file sidebar visibility
        const fileSidebar = document.getElementById('fileSidebar');
        const mainContent = document.querySelector('.main-content');
        const toolbar = document.querySelector('.section-toolbar');

        // Calculate and set topbar height for sidebar positioning
        const updateTopbarHeight = () => {
            const topbar = document.querySelector('.topbar');
            const totalHeight = topbar.offsetHeight + toolbar.offsetHeight;
            document.documentElement.style.setProperty('--topbar-height', totalHeight + 'px');
        };

        if (sectionName === 'bestand') {
            // Hide toolbar content FIRST, then measure height without it
            document.querySelectorAll('.toolbar-content').forEach(content => {
                content.classList.remove('active');
            });
            // Collapse the toolbar bar itself so sidebar starts right below the section tabs
            toolbar.classList.add('toolbar-hidden');
            fileSidebar.classList.add('active');
            mainContent.classList.add('sidebar-open');
            // Measure after toolbar is collapsed
            requestAnimationFrame(() => {
                requestAnimationFrame(() => updateTopbarHeight());
            });
        } else {
            fileSidebar.classList.remove('active');
            mainContent.classList.remove('sidebar-open');
            toolbar.classList.remove('toolbar-hidden');

            // Find current and target content
            const currentContent = document.querySelector('.toolbar-content.active');
            const targetContent = document.querySelector(`[data-content="${sectionName}"]`);

            if (targetContent) {
                // If switching between different toolbars
                if (currentContent && currentContent !== targetContent) {
                    // Lock the toolbar height to current height
                    const currentHeight = toolbar.offsetHeight;
                    toolbar.style.height = currentHeight + 'px';
                    toolbar.style.overflow = 'hidden';

                    // Mark old content as transitioning out
                    currentContent.classList.add('transitioning-out');

                    // Wait for old content to fade out
                    setTimeout(() => {
                        // Completely remove old content from DOM flow
                        currentContent.classList.remove('active');
                        currentContent.classList.remove('transitioning-out');
                        currentContent.style.display = 'none';

                        // Add new content
                        targetContent.style.display = '';
                        targetContent.classList.add('active');

                        // Measure new height after content is added
                        requestAnimationFrame(() => {
                            const newHeight = toolbar.scrollHeight;
                            toolbar.style.height = newHeight + 'px';

                            // Remove fixed height and overflow after transition
                            setTimeout(() => {
                                toolbar.style.height = '';
                                toolbar.style.overflow = '';
                                updateTopbarHeight();
                            }, 400);
                        });
                    }, 300);
                } else {
                    // No current active toolbar (e.g. returning from bestand section)
                    // Make sure display is reset in case it was hidden by a prior transition
                    targetContent.style.display = '';
                    targetContent.classList.add('active');
                    // Also reset any stuck toolbar height/overflow from prior transitions
                    toolbar.style.height = '';
                    toolbar.style.overflow = '';
                    setTimeout(updateTopbarHeight, 50);
                }
            }
        }

        this.currentSection = sectionName;

        // Restore editor focus after switching sections (except file sidebar)
        if (sectionName !== 'bestand') {
            setTimeout(() => {
                this.restoreEditorFocus();
                // If a context tab (e.g. codeblock) was active, re-show it
                window.ElementProtection?.restoreContextUI();
            }, 50);
        }
    }

    // ==================== COLOR PICKERS ====================

    initColorPickers() {
        // Store saved range for cursor restoration
        this.savedRange = null;

        // Text Color Picker
        const textColorBtn = document.getElementById('textColorBtn');
        const textColorPicker = document.getElementById('textColorPicker');
        const textColorSwatches = textColorPicker.querySelectorAll('.color-swatch');
        const customTextColor = document.getElementById('customTextColor');

        textColorBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // Save cursor position when opening picker
            this.saveCurrentRange();
            textColorPicker.classList.toggle('active');
            highlightColorPicker.classList.remove('active');
        });

        textColorSwatches.forEach(swatch => {
            swatch.addEventListener('click', () => {
                const color = swatch.dataset.color;
                this.applyTextColor(color);
                this.updateColorIndicator('text', color);
                textColorPicker.classList.remove('active');
                // Restore cursor position after closing picker
                setTimeout(() => {
                    this.restoreSavedRange();
                }, 10);
            });
        });

        customTextColor.addEventListener('change', (e) => {
            const color = e.target.value;
            this.applyTextColor(color);
            this.updateColorIndicator('text', color);
        });

        // Highlight Color Picker
        const highlightBtn = document.getElementById('highlightBtn');
        const highlightColorPicker = document.getElementById('highlightColorPicker');
        const highlightColorSwatches = highlightColorPicker.querySelectorAll('.color-swatch');
        const customHighlightColor = document.getElementById('customHighlightColor');

        highlightBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // Save cursor position when opening picker
            this.saveCurrentRange();
            highlightColorPicker.classList.toggle('active');
            textColorPicker.classList.remove('active');
        });

        highlightColorSwatches.forEach(swatch => {
            swatch.addEventListener('click', () => {
                const color = swatch.dataset.color;
                this.applyHighlight(color);
                this.updateColorIndicator('highlight', color);
                highlightColorPicker.classList.remove('active');
                // Restore cursor position after closing picker
                setTimeout(() => {
                    this.restoreSavedRange();
                }, 10);
            });
        });

        customHighlightColor.addEventListener('change', (e) => {
            const color = e.target.value;
            this.applyHighlight(color);
            this.updateColorIndicator('highlight', color);
        });

        // Close color pickers when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.color-picker-wrapper')) {
                textColorPicker.classList.remove('active');
                highlightColorPicker.classList.remove('active');
            }
        });
    }

    saveCurrentRange() {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            this.savedRange = selection.getRangeAt(0).cloneRange();
        }
    }

    restoreSavedRange() {
        if (this.savedRange) {
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(this.savedRange.cloneRange());
        }
    }

    restoreEditorFocus() {
        const editor = document.getElementById('editor');
        if (!editor) return;

        // If focus is already inside the editor (e.g. in a codeblock textarea),
        // don't steal it — just restore the selection range if applicable.
        if (editor.contains(document.activeElement)) {
            if (this.savedRange && document.activeElement === editor) {
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(this.savedRange.cloneRange());
            }
            return;
        }

        editor.focus();
        if (this.savedRange) {
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(this.savedRange.cloneRange());
        }
    }

    applyTextColor(color) {
        // Use the exposed changeTextColor function from script.js if available
        if (window.changeTextColor) {
            // Restore range first
            this.restoreSavedRange();

            // Create a fake event that matches what changeTextColor expects
            const fakeEvent = {
                target: { value: color }
            };
            window.changeTextColor(fakeEvent);
        } else {
            // Restore range first
            this.restoreSavedRange();
            document.execCommand('foreColor', false, color);
        }
        this.currentTextColor = color;
        this.updateColorIndicator('text', color);

        // Keep focus and selection
        setTimeout(() => {
            this.restoreSavedRange();
        }, 10);
    }

    applyHighlight(color) {
        // Save current scroll position
        const documentSection = document.querySelector('.document-section');
        const scrollTop = documentSection ? documentSection.scrollTop : 0;

        if (color === 'transparent') {
            this.restoreSavedRange();
            document.execCommand('removeFormat', false, 'backColor');
        } else {
            // Use the exposed highlightText function from script.js
            if (window.highlightText) {
                this.restoreSavedRange();
                window.highlightText();
                // Then update the color of the created highlight
                setTimeout(() => {
                    const highlights = document.querySelectorAll('.highlight');
                    if (highlights.length > 0) {
                        const lastHighlight = highlights[highlights.length - 1];
                        lastHighlight.style.backgroundColor = color;
                    }
                }, 10);
            } else {
                this.restoreSavedRange();
                document.execCommand('backColor', false, color);
            }
        }
        this.currentHighlightColor = color;
        this.updateColorIndicator('highlight', color);

        // Restore scroll position and cursor
        setTimeout(() => {
            if (documentSection) {
                documentSection.scrollTop = scrollTop;
            }
            this.restoreSavedRange();
        }, 20);
    }

    updateColorIndicator(type, color) {
        if (type === 'text') {
            // Update the underline bar indicator
            const indicator = document.getElementById('textColorIndicator');
            if (indicator) indicator.setAttribute('fill', color);
            // Update the A letter + brush paths (class fc-color)
            document.querySelectorAll('.fc-color').forEach(el => el.setAttribute('fill', color));
        } else if (type === 'highlight') {
            // highlightColorIndicator id no longer exists — update mt-color paths (marker + underline)
            const c = color === 'transparent' ? '#ffffff' : color;
            document.querySelectorAll('.mt-color').forEach(el => el.setAttribute('fill', c));
        }
    }

    // Update color indicators based on current selection
    updateColorIndicatorsFromSelection() {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const container = range.commonAncestorContainer;
            const element = container.nodeType === 3 ? container.parentElement : container;

            // Get computed styles
            const computedStyle = window.getComputedStyle(element);

            // Update text color indicator
            const textColor = computedStyle.color;
            if (textColor) {
                this.updateColorIndicator('text', this.rgbToHex(textColor));
            }

            // Update highlight color indicator
            const bgColor = computedStyle.backgroundColor;
            if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
                this.updateColorIndicator('highlight', this.rgbToHex(bgColor));
            }
        }
    }

    // Helper function to convert RGB to hex
    rgbToHex(rgb) {
        if (rgb.startsWith('#')) return rgb;
        const match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
        if (!match) return '#000000';

        const r = parseInt(match[1]);
        const g = parseInt(match[2]);
        const b = parseInt(match[3]);

        return '#' + [r, g, b].map(x => {
            const hex = x.toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        }).join('');
    }

    // ==================== FORMAT BUTTONS ====================

    initFormatButtons() {
        const boldBtn = document.getElementById('boldBtn');
        const italicBtn = document.getElementById('italicBtn');
        const underlineBtn = document.getElementById('underlineBtn');

        if (boldBtn) {
            boldBtn.addEventListener('mousedown', (e) => {
                e.preventDefault(); // Prevent focus change
                this.saveCurrentRange();
            });
            boldBtn.addEventListener('click', () => {
                this.preserveCursorAndFormat('bold');
            });
        }

        if (italicBtn) {
            italicBtn.addEventListener('mousedown', (e) => {
                e.preventDefault(); // Prevent focus change
                this.saveCurrentRange();
            });
            italicBtn.addEventListener('click', () => {
                this.preserveCursorAndFormat('italic');
            });
        }

        if (underlineBtn) {
            underlineBtn.addEventListener('mousedown', (e) => {
                e.preventDefault(); // Prevent focus change
                this.saveCurrentRange();
            });
            underlineBtn.addEventListener('click', () => {
                this.preserveCursorAndFormat('underline');
            });
        }

        // Update button states on selection change
        document.addEventListener('selectionchange', () => {
            if (this._suppressSelectionUpdate) return;
            this.updateFormatButtonStates();
            this.updateColorIndicatorsFromSelection();
            this.updateStyleFromSelection();
            this.updateFontSizeFromSelection();
        });

        // Note: Keyboard shortcuts (Ctrl+B/I/U) are handled by script.js
        // We just need to update button states when they're used

        // Font size controls — handled by FontSizeManager (fontsize.js)
        if (window.fontSizeManager) {
            window.fontSizeManager.init();
        }
    }

    // Called from the selectionchange handler below
    updateFontSizeFromSelection() {
        if (window.fontSizeManager) {
            window.fontSizeManager.updateFromSelection();
        }
    }

    preserveCursorAndFormat(command) {
        // Suppress selectionchange during execCommand so the visual selection isn't reset
        this._suppressSelectionUpdate = true;

        // Restore the saved range without calling editor.focus() (mousedown already kept it)
        if (this.savedRange) {
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(this.savedRange.cloneRange());
        }

        document.execCommand(command);

        // Save the resulting range (selection stays highlighted)
        const sel = window.getSelection();
        if (sel.rangeCount > 0) {
            this.savedRange = sel.getRangeAt(0).cloneRange();
        }

        this.updateFormatButtonStates();

        requestAnimationFrame(() => {
            this._suppressSelectionUpdate = false;
        });
    }

    updateFormatButtonStates() {
        const boldBtn = document.getElementById('boldBtn');
        const italicBtn = document.getElementById('italicBtn');
        const underlineBtn = document.getElementById('underlineBtn');

        // Check if commands are active
        if (boldBtn) {
            if (document.queryCommandState('bold')) {
                boldBtn.classList.add('active');
            } else {
                boldBtn.classList.remove('active');
            }
        }

        if (italicBtn) {
            if (document.queryCommandState('italic')) {
                italicBtn.classList.add('active');
            } else {
                italicBtn.classList.remove('active');
            }
        }

        if (underlineBtn) {
            if (document.queryCommandState('underline')) {
                underlineBtn.classList.add('active');
            } else {
                underlineBtn.classList.remove('active');
            }
        }
    }

    // ==================== FILE SIDEBAR ====================

    initFileSidebar() {
        // Dropdown toggle for save menu
        const saveDropdownBtn = document.getElementById('saveDropdownBtn');
        const saveDropdownMenu = document.getElementById('saveDropdownMenu');

        if (saveDropdownBtn && saveDropdownMenu) {
            saveDropdownBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                saveDropdownBtn.classList.toggle('active');
                saveDropdownMenu.classList.toggle('active');
            });

            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.file-dropdown-wrapper')) {
                    saveDropdownBtn.classList.remove('active');
                    saveDropdownMenu.classList.remove('active');
                }
            });
        }

        // Dropdown toggle for image insertion
        const imageDropdownBtn = document.getElementById('imageDropdownBtn');
        const imageDropdownMenu = document.getElementById('imageDropdownMenu');

        if (imageDropdownBtn && imageDropdownMenu) {
            imageDropdownBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                imageDropdownBtn.classList.toggle('active');
                imageDropdownMenu.classList.toggle('active');
            });

            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.toolbar-dropdown-wrapper')) {
                    imageDropdownBtn.classList.remove('active');
                    imageDropdownMenu.classList.remove('active');
                }
            });

            // Close dropdown after selecting an option
            const dropdownItems = imageDropdownMenu.querySelectorAll('.dropdown-item');
            dropdownItems.forEach(item => {
                item.addEventListener('click', () => {
                    imageDropdownBtn.classList.remove('active');
                    imageDropdownMenu.classList.remove('active');
                });
            });
        }
    }

    // ==================== STYLE SELECTOR ====================

    initStyleSelector() {
        const styleDropdownToggle = document.getElementById('styleDropdownToggle');
        const styleDropdownMenu = document.getElementById('styleDropdownMenu');

        if (styleDropdownToggle && styleDropdownMenu) {
            styleDropdownToggle.addEventListener('mousedown', e => { e.preventDefault(); this.saveCurrentRange(); });
            styleDropdownToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                const isOpen = styleDropdownMenu.classList.contains('active');
                if (!isOpen) {
                    this.saveCurrentRange();
                    window.StyleManager?.renderStyleDropdown();
                }
                styleDropdownToggle.classList.toggle('active', !isOpen);
                styleDropdownMenu.classList.toggle('active', !isOpen);
            });

            document.addEventListener('click', (e) => {
                if (!e.target.closest('.style-selector-wrapper') && !e.target.closest('#styleEditorModal')) {
                    styleDropdownToggle.classList.remove('active');
                    styleDropdownMenu.classList.remove('active');
                }
            });

            // Prevent dropdown clicks from stealing focus
            styleDropdownMenu.addEventListener('mousedown', e => {
                if (!e.target.matches('input, select, textarea')) e.preventDefault();
            });
        }
    }

    applyStyle(style) {
        // Suppress selectionchange while we focus + restore range + apply style,
        // otherwise editor.focus() fires selectionchange which resets the style UI
        // before applyStyleFromTopbar even runs.
        this._suppressSelectionUpdate = true;

        const editor = document.getElementById('editor');
        if (editor) editor.focus();
        this.restoreSavedRange();

        if (window.applyStyleFromTopbar) {
            window.applyStyleFromTopbar(style);
        }

        // Re-enable selectionchange and sync the UI to the newly applied style
        requestAnimationFrame(() => {
            this._suppressSelectionUpdate = false;
            this.updateStyleFromSelection();
        });
    }

    updateStyleButtons(activeStyle) {
        window.StyleManager?.renderPreviewButtons(activeStyle);
        // Update active state in dropdown if open
        document.querySelectorAll('.sdm-item').forEach(item => {
            item.classList.toggle('active', item.dataset.style === activeStyle);
        });
    }

    scrollToActiveStyle() { /* legacy no-op */ }

    // Detect current style from selection using StyleManager
    updateStyleFromSelection() {
        if (!window.StyleManager) return;
        const activeKey = window.StyleManager.getActiveStyleKey();
        this.updateStyleButtons(activeKey);
    }

    // ==================== FILE OPERATIONS ====================

    initFileOperations() {
        const saveAsPdfBtn = document.getElementById('saveAsPdfBtn');
        const printBtn = document.getElementById('printBtn');

        // Note: Save and Load buttons are handled by script.js to avoid duplicate listeners
        // newSummaryBtn, saveAsJsonBtn, and loadFileBtn are all handled in script.js

        if (saveAsPdfBtn) {
            saveAsPdfBtn.addEventListener('click', () => {
                this.saveAsPDF();
                document.getElementById('saveDropdownMenu').classList.remove('active');
                document.getElementById('saveDropdownBtn').classList.remove('active');
            });
        }

        if (printBtn) {
            printBtn.addEventListener('click', () => {
                this.printSummary();
            });
        }
    }

    closeFileSidebar() {
        if (this.currentSection === 'bestand') {
            this.switchSection('bewerken');
        }
    }

    createNewSummary() {
        // Call the exposed newSummary function from script.js
        if (window.newSummary) {
            window.newSummary();
        }
    }

    saveAsPDF() {
        // Trigger browser print dialog with PDF option
        window.print();
        this.showNotification('Print dialoog geopend - selecteer "Opslaan als PDF"', 'info');
    }

    printSummary() {
        window.print();
    }

    // ==================== NOTIFICATIONS ====================

    showNotification(message, type = 'info') {
        const container = document.getElementById('notificationContainer');
        if (!container) return;

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;

        notification.innerHTML = `
            <div class="notification-content">
                <div class="notification-message">${message}</div>
            </div>
        `;

        container.appendChild(notification);

        // Auto remove after 3 seconds
        setTimeout(() => {
            notification.style.animation = 'notificationSlideIn 0.3s ease reverse';
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 3000);
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Pre-register a no-op stub so initFormatButtons() calling window.fontSizeManager.init()
    // doesn't throw — the real instance replaces it immediately after TopbarManager is ready.
    window.fontSizeManager = { init() { }, updateFromSelection() { } };

    const topbarManager = new TopbarManager();

    // Replace stub with real FontSizeManager and initialise it
    window.fontSizeManager = new FontSizeManager(topbarManager);
    window.fontSizeManager.init();

    window.topbarManager = topbarManager;
});