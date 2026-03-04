// ==================== CODE BLOCK MANAGER ====================

class CodeBlockManager {
    constructor() {
        this.lastSelectedLanguage = 'javascript'; // Default language
        this.saveTimeout = null; // For debouncing saves
        this.languages = [
            'javascript',
            'typescript',
            'python',
            'java',
            'csharp',
            'cpp',
            'php',
            'ruby',
            'go',
            'rust',
            'swift',
            'kotlin',
            'html',
            'css',
            'sql',
            'json',
            'bash',
            'shell',
            'plaintext'
        ];
        this.languageLabels = {
            'javascript': 'JavaScript',
            'typescript': 'TypeScript',
            'python': 'Python',
            'java': 'Java',
            'csharp': 'C#',
            'cpp': 'C++',
            'php': 'PHP',
            'ruby': 'Ruby',
            'go': 'Go',
            'rust': 'Rust',
            'swift': 'Swift',
            'kotlin': 'Kotlin',
            'html': 'HTML',
            'css': 'CSS',
            'sql': 'SQL',
            'json': 'JSON',
            'bash': 'Bash',
            'shell': 'Shell',
            'plaintext': 'Plain Text'
        };
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadLastLanguage();
    }

    loadLastLanguage() {
        const saved = localStorage.getItem('lastCodeLanguage');
        if (saved && this.languages.includes(saved)) {
            this.lastSelectedLanguage = saved;
        }
    }

    saveLastLanguage(language) {
        this.lastSelectedLanguage = language;
        localStorage.setItem('lastCodeLanguage', language);
    }

    debouncedSave() {
        // Clear existing timeout
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }

        // Set new timeout to save after 1 second of no typing
        this.saveTimeout = setTimeout(() => {
            if (window.saveToLocalStorage) {
                window.saveToLocalStorage();
            }
        }, 1000);
    }

    setupEventListeners() {
        // Insert code block button
        const insertBtn = document.getElementById('insertCodeBlockBtn');
        if (insertBtn) {
            insertBtn.addEventListener('click', () => {
                this.insertCodeBlock();
            });
        }

        // Handle clicks outside dropdowns to close them
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.code-language-selector')) {
                this.closeAllLanguageDropdowns();
            }
        });

        // Close dropdowns on scroll (since they use fixed positioning)
        const editor = document.getElementById('editor');
        if (editor) {
            editor.addEventListener('scroll', () => {
                this.closeAllLanguageDropdowns();
            });
        }
        window.addEventListener('scroll', () => {
            this.closeAllLanguageDropdowns();
        });
    }

    insertCodeBlock() {
        const editor = document.getElementById('editor');
        const selection = window.getSelection();
        let range;

        if (selection.rangeCount > 0) {
            range = selection.getRangeAt(0);
        } else {
            range = document.createRange();
            range.selectNodeContents(editor);
            range.collapse(false);
        }

        // Create wrapper with whitespace above and below
        const wrapper = document.createElement('div');
        wrapper.style.marginTop = '20px';
        wrapper.style.marginBottom = '20px';
        wrapper.contentEditable = 'false'; // Prevent editor from making this editable

        // Create code block structure
        const codeBlockWrapper = this.createCodeBlockElement();
        wrapper.appendChild(codeBlockWrapper);

        // Insert at cursor
        range.deleteContents();
        range.insertNode(wrapper);

        // Add a line break after the code block to allow typing after it
        const br = document.createElement('br');
        wrapper.parentNode.insertBefore(br, wrapper.nextSibling);

        // Focus the code textarea
        const textarea = codeBlockWrapper.querySelector('.code-block');
        setTimeout(() => {
            textarea.focus();
        }, 100);

        // Save to localStorage
        if (window.saveToLocalStorage) {
            window.saveToLocalStorage();
        }
    }

    createCodeBlockElement() {
        const wrapper = document.createElement('div');
        wrapper.className = 'code-block-wrapper';
        wrapper.contentEditable = 'false'; // Prevent the wrapper itself from being editable

        const header = document.createElement('div');
        header.className = 'code-block-header';
        header.contentEditable = 'false'; // Prevent header from being editable

        // Language selector
        const languageSelector = this.createLanguageSelector();
        header.appendChild(languageSelector);

        // Copy button + separate "Gekopieerd" label, grouped on the right
        const copyGroup = document.createElement('div');
        copyGroup.className = 'copy-group';
        copyGroup.contentEditable = 'false';
        const copyLabel = document.createElement('span');
        copyLabel.className = 'copy-label';
        copyLabel.textContent = 'Gekopieerd';
        copyLabel.contentEditable = 'false';
        const copyBtn = this.createCopyButton();
        copyGroup.appendChild(copyLabel);
        copyGroup.appendChild(copyBtn);
        header.appendChild(copyGroup);

        wrapper.appendChild(header);

        // Code content area
        const contentDiv = document.createElement('div');
        contentDiv.className = 'code-block-content';
        contentDiv.contentEditable = 'false'; // Prevent content div from being editable

        // Create highlighted overlay (hidden by default)
        const highlightedOverlay = document.createElement('div');
        highlightedOverlay.className = 'code-highlighted-overlay';
        // Don't set display: none - use visibility from CSS

        const textarea = document.createElement('textarea');
        textarea.className = 'code-block';
        textarea.setAttribute('data-language', this.lastSelectedLanguage);
        textarea.placeholder = `Schrijf hier je ${this.languageLabels[this.lastSelectedLanguage]} code...`;
        textarea.spellcheck = false;

        // Prevent focus loss when typing
        textarea.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });

        textarea.addEventListener('focus', (e) => {
            e.stopPropagation();
            // Hide highlighted overlay, show textarea
            highlightedOverlay.style.display = 'none';
        });

        textarea.addEventListener('blur', (e) => {
            // Apply syntax highlighting and show overlay
            this.applyHighlighting(textarea, highlightedOverlay);
        });

        // Prevent input events from bubbling to editor
        textarea.addEventListener('input', (e) => {
            e.stopPropagation(); // Don't let editor handle this input
            this.autoResizeTextarea(textarea);
            this.debouncedSave();
        });

        // Handle tab key and smart backspace
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                e.stopPropagation(); // Prevent editor from also handling this
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                textarea.value = textarea.value.substring(0, start) + '    ' + textarea.value.substring(end);
                textarea.selectionStart = textarea.selectionEnd = start + 4;

                // Trigger input event for auto-resize and save
                textarea.dispatchEvent(new Event('input'));
            } else if (e.key === 'Backspace') {
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;

                // Only handle if nothing is selected and we're not at the start
                if (start === end && start > 0) {
                    const textBefore = textarea.value.substring(0, start);

                    // Check if the last 4 characters are spaces (a tab)
                    if (textBefore.length >= 4 && textBefore.slice(-4) === '    ') {
                        // Check if there's no non-whitespace between start of line and cursor
                        const lineStart = textBefore.lastIndexOf('\n') + 1;
                        const textFromLineStart = textBefore.substring(lineStart);

                        if (/^\s+$/.test(textFromLineStart)) {
                            // Only whitespace from line start - delete the whole tab
                            e.preventDefault();
                            textarea.value = textarea.value.substring(0, start - 4) + textarea.value.substring(end);
                            textarea.selectionStart = textarea.selectionEnd = start - 4;

                            // Trigger input event for auto-resize and save
                            textarea.dispatchEvent(new Event('input'));
                        }
                    }
                }
            } else if (e.key === 'Enter') {
                const start = textarea.selectionStart;
                const charBefore = textarea.value[start - 1];
                const charAfter = textarea.value[start];

                // Check if cursor is between matching brackets
                const bracketPairs = {
                    '(': ')',
                    '{': '}',
                    '[': ']'
                };

                if (charBefore && bracketPairs[charBefore] === charAfter) {
                    e.preventDefault();

                    // Get current line indentation
                    const textBefore = textarea.value.substring(0, start);
                    const lineStart = textBefore.lastIndexOf('\n') + 1;
                    const currentLine = textBefore.substring(lineStart);
                    const indentMatch = currentLine.match(/^(\s*)/);
                    const currentIndent = indentMatch ? indentMatch[1] : '';

                    // Insert new line with extra indent, then closing bracket on its own line
                    const newText = '\n' + currentIndent + '    ' + '\n' + currentIndent;
                    textarea.value = textarea.value.substring(0, start) + newText + textarea.value.substring(start);
                    textarea.selectionStart = textarea.selectionEnd = start + currentIndent.length + 5; // Position after first newline and indent

                    // Trigger input event
                    textarea.dispatchEvent(new Event('input'));
                }
            }
        });

        // Auto-closing brackets
        textarea.addEventListener('keypress', (e) => {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;

            const closingPairs = {
                '(': ')',
                '{': '}',
                '[': ']',
                '"': '"',
                "'": "'",
                '`': '`'
            };

            if (closingPairs[e.key]) {
                // Check if we're closing a quote and there's already a matching quote after cursor
                if ((e.key === '"' || e.key === "'" || e.key === '`') && textarea.value[start] === e.key) {
                    // Just move cursor forward instead of inserting
                    e.preventDefault();
                    textarea.selectionStart = textarea.selectionEnd = start + 1;
                    return;
                }

                e.preventDefault();
                const closing = closingPairs[e.key];

                // If text is selected, wrap it
                if (start !== end) {
                    const selectedText = textarea.value.substring(start, end);
                    textarea.value = textarea.value.substring(0, start) + e.key + selectedText + closing + textarea.value.substring(end);
                    textarea.selectionStart = start + 1;
                    textarea.selectionEnd = end + 1;
                } else {
                    // Insert both opening and closing
                    textarea.value = textarea.value.substring(0, start) + e.key + closing + textarea.value.substring(end);
                    textarea.selectionStart = textarea.selectionEnd = start + 1;
                }

                // Trigger input event
                textarea.dispatchEvent(new Event('input'));
            }
        });

        contentDiv.appendChild(highlightedOverlay);
        contentDiv.appendChild(textarea);
        wrapper.appendChild(contentDiv);

        return wrapper;
    }

    applyHighlighting(textarea, highlightedOverlay) {
        if (!window.syntaxHighlighter) {
            // Highlighter not loaded yet, just hide overlay
            highlightedOverlay.style.display = 'none';
            return;
        }

        const code = textarea.value;
        const language = textarea.getAttribute('data-language') || 'plaintext';

        if (!code.trim()) {
            // No code, hide overlay
            highlightedOverlay.style.display = 'none';
            return;
        }

        // Apply syntax highlighting
        const highlighted = window.syntaxHighlighter.highlight(code, language);
        highlightedOverlay.innerHTML = highlighted;

        // Match textarea height
        const textareaHeight = textarea.scrollHeight;
        highlightedOverlay.style.height = textareaHeight + 'px';

        // Show overlay, hide textarea
        highlightedOverlay.style.display = 'block';

        // Make overlay clickable to focus textarea (if not already attached)
        if (!highlightedOverlay._hasClickHandler) {
            highlightedOverlay.addEventListener('click', () => {
                textarea.focus();
            });
            highlightedOverlay._hasClickHandler = true;
        }
    }

    createLanguageSelector() {
        const selector = document.createElement('div');
        selector.className = 'code-language-selector';

        const button = document.createElement('button');
        button.className = 'code-language-btn';
        button.innerHTML = `
            <span class="language-text">${this.languageLabels[this.lastSelectedLanguage]}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"/>
            </svg>
        `;

        const dropdown = document.createElement('div');
        dropdown.className = 'code-language-dropdown';

        this.languages.forEach(lang => {
            const option = document.createElement('button');
            option.className = 'code-language-option';
            if (lang === this.lastSelectedLanguage) {
                option.classList.add('selected');
            }
            option.textContent = this.languageLabels[lang];
            option.dataset.language = lang;

            option.addEventListener('click', (e) => {
                e.stopPropagation();
                this.changeLanguage(selector, lang);
            });

            dropdown.appendChild(option);
        });

        button.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleLanguageDropdown(selector);
        });

        selector.appendChild(button);
        selector.appendChild(dropdown);

        return selector;
    }

    createCopyButton() {
        const button = document.createElement('button');
        button.className = 'code-copy-btn';
        button.title = 'Kopieër code';
        button.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
            </svg>
        `;

        button.addEventListener('click', (e) => {
            e.stopPropagation();
            this.copyCode(button);
        });

        return button;
    }

    toggleLanguageDropdown(selector) {
        const button = selector.querySelector('.code-language-btn');
        const dropdown = selector.querySelector('.code-language-dropdown');

        // Close all other dropdowns first
        this.closeAllLanguageDropdowns();

        const isActive = button.classList.contains('active');

        if (!isActive) {
            button.classList.add('active');
            dropdown.classList.add('active');

            // Position the dropdown using fixed positioning
            const rect = button.getBoundingClientRect();
            dropdown.style.top = (rect.bottom + 4) + 'px';
            dropdown.style.left = rect.left + 'px';

            // Adjust if dropdown goes off-screen
            setTimeout(() => {
                const dropdownRect = dropdown.getBoundingClientRect();
                if (dropdownRect.right > window.innerWidth) {
                    dropdown.style.left = (window.innerWidth - dropdownRect.width - 10) + 'px';
                }
                if (dropdownRect.bottom > window.innerHeight) {
                    dropdown.style.top = (rect.top - dropdownRect.height - 4) + 'px';
                }
            }, 10);
        } else {
            button.classList.remove('active');
            dropdown.classList.remove('active');
        }
    }

    closeAllLanguageDropdowns() {
        const allDropdowns = document.querySelectorAll('.code-language-dropdown');
        const allButtons = document.querySelectorAll('.code-language-btn');

        allDropdowns.forEach(dropdown => dropdown.classList.remove('active'));
        allButtons.forEach(button => button.classList.remove('active'));
    }

    changeLanguage(selector, language) {
        const wrapper = selector.closest('.code-block-wrapper');
        const textarea = wrapper.querySelector('.code-block');
        const button = selector.querySelector('.code-language-btn');
        const languageText = button.querySelector('.language-text');
        const dropdown = selector.querySelector('.code-language-dropdown');

        // Update language
        textarea.setAttribute('data-language', language);
        textarea.placeholder = `Schrijf hier je ${this.languageLabels[language]} code...`;
        languageText.textContent = this.languageLabels[language];

        // Update selected option in dropdown
        dropdown.querySelectorAll('.code-language-option').forEach(opt => {
            opt.classList.remove('selected');
            if (opt.dataset.language === language) {
                opt.classList.add('selected');
            }
        });

        // Save last selected language
        this.saveLastLanguage(language);

        // Close dropdown
        button.classList.remove('active');
        dropdown.classList.remove('active');

        // Save to localStorage (debounced)
        this.debouncedSave();
    }

    copyCode(button) {
        const wrapper = button.closest('.code-block-wrapper');
        const textarea = wrapper.querySelector('.code-block');
        const code = textarea.value;

        // Copy to clipboard
        navigator.clipboard.writeText(code).then(() => {
            // Change icon to checkmark
            button.classList.add('copying');
            button.classList.add('copied');
            button.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M10.125 2.25h-4.5c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125v-9M10.125 2.25h.375a9 9 0 0 1 9 9v.375M10.125 2.25A3.375 3.375 0 0 1 13.5 5.625v1.5c0 .621.504 1.125 1.125 1.125h1.5a3.375 3.375 0 0 1 3.375 3.375M9 15l2.25 2.25L15 12" />
                </svg>
            `;

            // Show the sibling label
            const label = button.closest('.code-block-header')?.querySelector('.copy-label');
            if (label) label.classList.add('visible');

            // Revert back after 5 seconds
            setTimeout(() => {
                button.classList.add('copying');
                button.classList.remove('copied');
                if (label) label.classList.remove('visible');
                button.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
                    </svg>
                `;
                setTimeout(() => button.classList.remove('copying'), 300);
            }, 5000);
        }).catch(err => {
            console.error('Failed to copy code:', err);
            if (window.showNotification) {
                window.showNotification('Kopiëren mislukt', 'Kon code niet kopiëren.', 'error');
            }
        });
    }

    autoResizeTextarea(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.max(120, textarea.scrollHeight) + 'px';
    }

    getCodeBlocksData() {
        const codeBlocks = document.querySelectorAll('.code-block-wrapper');
        const data = [];

        codeBlocks.forEach((wrapper, index) => {
            const textarea = wrapper.querySelector('.code-block');
            if (textarea) {
                data.push({
                    index: index,
                    language: textarea.getAttribute('data-language') || 'javascript',
                    code: textarea.value,
                    // ── Name / filename ──
                    cbNameMode: wrapper.dataset.cbNameMode || null,
                    cbFilename: wrapper.dataset.cbFilename || null,
                    // ── Linked source file (for refresh) ──
                    cbSourceFile: wrapper.dataset.cbSourceFile || null,
                    // ── Custom colours ──
                    headerColor: wrapper.dataset.headerColor || null,
                    bodyColor: wrapper.dataset.bodyColor || null,
                });
            }
        });

        return data;
    }

    loadCodeBlocksData(codeBlocksData) {
        if (!codeBlocksData || !Array.isArray(codeBlocksData)) return;

        const codeBlocks = document.querySelectorAll('.code-block-wrapper');

        codeBlocksData.forEach((blockData) => {
            if (blockData.index < codeBlocks.length) {
                const wrapper = codeBlocks[blockData.index];
                const textarea = wrapper.querySelector('.code-block');
                const selector = wrapper.querySelector('.code-language-selector');
                const copyBtn = wrapper.querySelector('.code-copy-btn');

                // Reset copy button to default state
                if (copyBtn) {
                    copyBtn.classList.remove('copying', 'copied');
                    copyBtn.innerHTML = `
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
                        </svg>
                    `;
                }

                if (textarea && blockData.code !== undefined) {
                    // Restore code content
                    textarea.value = blockData.code;

                    // Restore language
                    if (blockData.language) {
                        textarea.setAttribute('data-language', blockData.language);

                        // Update language button text
                        const languageBtn = selector?.querySelector('.language-text');
                        if (languageBtn) {
                            languageBtn.textContent = this.languageLabels[blockData.language] || blockData.language;
                        }

                        // Update selected option in dropdown
                        const dropdown = selector?.querySelector('.code-language-dropdown');
                        if (dropdown) {
                            dropdown.querySelectorAll('.code-language-option').forEach(opt => {
                                opt.classList.remove('selected');
                                if (opt.dataset.language === blockData.language) {
                                    opt.classList.add('selected');
                                }
                            });
                        }
                    }

                    // Resize textarea to fit content
                    this.autoResizeTextarea(textarea);

                    // Apply initial highlighting if textarea is not focused
                    if (document.activeElement !== textarea) {
                        const highlightedOverlay = wrapper.querySelector('.code-highlighted-overlay');
                        if (highlightedOverlay) {
                            setTimeout(() => {
                                this.applyHighlighting(textarea, highlightedOverlay);
                            }, 100);
                        }
                    }
                }

                // ── Restore name / filename ──────────────────────────────
                if (blockData.cbFilename) wrapper.dataset.cbFilename = blockData.cbFilename;
                if (blockData.cbNameMode) {
                    wrapper.dataset.cbNameMode = blockData.cbNameMode;
                    // Let CodeblockControls restore the UI once it's ready
                    setTimeout(() => {
                        if (window.CodeblockControls && typeof window.CodeblockControls.restoreNameMode === 'function') {
                            window.CodeblockControls.restoreNameMode(wrapper);
                        }
                    }, 300);
                }

                // ── Restore linked source file + refresh button ──────────
                if (blockData.cbSourceFile) {
                    wrapper.dataset.cbSourceFile = blockData.cbSourceFile;
                    this.addRefreshButton(wrapper);
                }

                // ── Restore custom colours ───────────────────────────────
                if (blockData.headerColor) {
                    const hdr = wrapper.querySelector('.code-block-header');
                    if (hdr) hdr.style.background = blockData.headerColor;
                    wrapper.dataset.headerColor = blockData.headerColor;
                }
                if (blockData.bodyColor) {
                    const applyBg = (cls) => { const el = wrapper.querySelector('.' + cls); if (el) el.style.background = blockData.bodyColor; };
                    ['code-block-content', 'code-highlighted-overlay', 'code-block'].forEach(applyBg);
                    wrapper.dataset.bodyColor = blockData.bodyColor;
                }
            }
        });
    }

    resetAllCopyButtons() {
        const copyButtons = document.querySelectorAll('.code-copy-btn');
        copyButtons.forEach(btn => {
            btn.classList.remove('copying', 'copied');
            btn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
                </svg>
            `;
        });
    }

    // Add (or replace) a refresh button in the copy-group of a code block that has a linked source file.
    addRefreshButton(wrapper) {
        if (!wrapper) return;
        const copyGroup = wrapper.querySelector('.copy-group');
        if (!copyGroup) return;

        // Remove any existing refresh button + error label for this block
        const existing = copyGroup.querySelector('.cb-refresh-btn');
        if (existing) existing.remove();
        const existingErr = copyGroup.querySelector('.cb-refresh-error');
        if (existingErr) existingErr.remove();

        const filePath = wrapper.dataset.cbSourceFile;
        if (!filePath) return;

        // Error label (hidden by default, shown when file not found)
        const errLabel = document.createElement('span');
        errLabel.className = 'cb-refresh-error';
        errLabel.textContent = 'Bestand niet gevonden';

        const btn = document.createElement('button');
        btn.className = 'cb-refresh-btn';
        btn.title = 'Bestand opnieuw laden';
        btn.contentEditable = 'false';
        btn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
        `;

        btn.addEventListener('mousedown', e => e.preventDefault());
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!window.electron || !window.appInfo || !window.appInfo.isElectron) return;

            // Spin animation
            btn.classList.add('spinning');

            const result = await window.electron.readCodeFile(wrapper.dataset.cbSourceFile);

            btn.classList.remove('spinning');

            if (result.success) {
                const ta = wrapper.querySelector('.code-block');
                if (ta) {
                    ta.value = result.content;
                    ta.dispatchEvent(new Event('input', { bubbles: true }));
                }
                window.saveToLocalStorage?.();
            } else {
                // File not found — show error label, remove button
                btn.remove();
                errLabel.classList.add('visible');
                copyGroup.insertBefore(errLabel, copyGroup.querySelector('.copy-label') || copyGroup.firstChild);
                // Clean up stored path
                delete wrapper.dataset.cbSourceFile;
                window.saveToLocalStorage?.();
            }
        });

        // Insert refresh button before the copy button
        const copyBtn = copyGroup.querySelector('.code-copy-btn');
        copyGroup.insertBefore(errLabel, copyBtn || null);
        copyGroup.insertBefore(btn, copyBtn || null);
    }

    restoreCodeBlocks() {
        // Called when loading from localStorage or file
        const codeBlocks = document.querySelectorAll('.code-block-wrapper');

        codeBlocks.forEach(wrapper => {
            // Ensure wrapper is not editable
            wrapper.contentEditable = 'false';

            // Ensure all event listeners are attached
            const selector = wrapper.querySelector('.code-language-selector');
            const copyBtn = wrapper.querySelector('.code-copy-btn');
            const textarea = wrapper.querySelector('.code-block');
            const header = wrapper.querySelector('.code-block-header');
            const contentDiv = wrapper.querySelector('.code-block-content');

            // Make sure header and content div are not editable
            if (header) header.contentEditable = 'false';
            if (contentDiv) contentDiv.contentEditable = 'false';

            if (selector && !selector._hasListeners) {
                const button = selector.querySelector('.code-language-btn');
                const dropdown = selector.querySelector('.code-language-dropdown');

                button.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.toggleLanguageDropdown(selector);
                });

                dropdown.querySelectorAll('.code-language-option').forEach(option => {
                    option.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.changeLanguage(selector, option.dataset.language);
                    });
                });

                selector._hasListeners = true;
            }

            if (copyBtn && !copyBtn._hasListener) {
                copyBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.copyCode(copyBtn);
                });
                copyBtn._hasListener = true;
            }

            if (textarea && !textarea._hasListeners) {
                // Find or create highlighted overlay
                let highlightedOverlay = wrapper.querySelector('.code-highlighted-overlay');
                if (!highlightedOverlay) {
                    highlightedOverlay = document.createElement('div');
                    highlightedOverlay.className = 'code-highlighted-overlay';
                    // Don't set display: none - use visibility from CSS
                    contentDiv.insertBefore(highlightedOverlay, textarea);
                }

                // Prevent focus loss
                textarea.addEventListener('mousedown', (e) => {
                    e.stopPropagation();
                });

                textarea.addEventListener('focus', (e) => {
                    e.stopPropagation();
                    // Hide highlighted overlay, show textarea
                    highlightedOverlay.style.display = 'none';
                });

                textarea.addEventListener('blur', (e) => {
                    // Apply syntax highlighting and show overlay
                    this.applyHighlighting(textarea, highlightedOverlay);
                });

                // Prevent input events from bubbling to editor
                textarea.addEventListener('input', (e) => {
                    e.stopPropagation();
                    this.autoResizeTextarea(textarea);
                    this.debouncedSave();
                });

                // Handle tab key and smart backspace
                textarea.addEventListener('keydown', (e) => {
                    if (e.key === 'Tab') {
                        e.preventDefault();
                        e.stopPropagation(); // Prevent editor from also handling this
                        const start = textarea.selectionStart;
                        const end = textarea.selectionEnd;
                        textarea.value = textarea.value.substring(0, start) + '    ' + textarea.value.substring(end);
                        textarea.selectionStart = textarea.selectionEnd = start + 4;

                        // Trigger input event for auto-resize and save
                        textarea.dispatchEvent(new Event('input'));
                    } else if (e.key === 'Backspace') {
                        const start = textarea.selectionStart;
                        const end = textarea.selectionEnd;

                        // Only handle if nothing is selected and we're not at the start
                        if (start === end && start > 0) {
                            const textBefore = textarea.value.substring(0, start);

                            // Check if the last 4 characters are spaces (a tab)
                            if (textBefore.length >= 4 && textBefore.slice(-4) === '    ') {
                                // Check if there's no non-whitespace between start of line and cursor
                                const lineStart = textBefore.lastIndexOf('\n') + 1;
                                const textFromLineStart = textBefore.substring(lineStart);

                                if (/^\s+$/.test(textFromLineStart)) {
                                    // Only whitespace from line start - delete the whole tab
                                    e.preventDefault();
                                    textarea.value = textarea.value.substring(0, start - 4) + textarea.value.substring(end);
                                    textarea.selectionStart = textarea.selectionEnd = start - 4;

                                    // Trigger input event for auto-resize and save
                                    textarea.dispatchEvent(new Event('input'));
                                }
                            }
                        }
                    } else if (e.key === 'Enter') {
                        const start = textarea.selectionStart;
                        const charBefore = textarea.value[start - 1];
                        const charAfter = textarea.value[start];

                        // Check if cursor is between matching brackets
                        const bracketPairs = {
                            '(': ')',
                            '{': '}',
                            '[': ']'
                        };

                        if (charBefore && bracketPairs[charBefore] === charAfter) {
                            e.preventDefault();

                            // Get current line indentation
                            const textBefore = textarea.value.substring(0, start);
                            const lineStart = textBefore.lastIndexOf('\n') + 1;
                            const currentLine = textBefore.substring(lineStart);
                            const indentMatch = currentLine.match(/^(\s*)/);
                            const currentIndent = indentMatch ? indentMatch[1] : '';

                            // Insert new line with extra indent, then closing bracket on its own line
                            const newText = '\n' + currentIndent + '    ' + '\n' + currentIndent;
                            textarea.value = textarea.value.substring(0, start) + newText + textarea.value.substring(start);
                            textarea.selectionStart = textarea.selectionEnd = start + currentIndent.length + 5; // Position after first newline and indent

                            // Trigger input event
                            textarea.dispatchEvent(new Event('input'));
                        }
                    }
                });

                // Auto-closing brackets
                textarea.addEventListener('keypress', (e) => {
                    const start = textarea.selectionStart;
                    const end = textarea.selectionEnd;

                    const closingPairs = {
                        '(': ')',
                        '{': '}',
                        '[': ']',
                        '"': '"',
                        "'": "'",
                        '`': '`'
                    };

                    if (closingPairs[e.key]) {
                        // Check if we're closing a quote and there's already a matching quote after cursor
                        if ((e.key === '"' || e.key === "'" || e.key === '`') && textarea.value[start] === e.key) {
                            // Just move cursor forward instead of inserting
                            e.preventDefault();
                            textarea.selectionStart = textarea.selectionEnd = start + 1;
                            return;
                        }

                        e.preventDefault();
                        const closing = closingPairs[e.key];

                        // If text is selected, wrap it
                        if (start !== end) {
                            const selectedText = textarea.value.substring(start, end);
                            textarea.value = textarea.value.substring(0, start) + e.key + selectedText + closing + textarea.value.substring(end);
                            textarea.selectionStart = start + 1;
                            textarea.selectionEnd = end + 1;
                        } else {
                            // Insert both opening and closing
                            textarea.value = textarea.value.substring(0, start) + e.key + closing + textarea.value.substring(end);
                            textarea.selectionStart = textarea.selectionEnd = start + 1;
                        }

                        // Trigger input event
                        textarea.dispatchEvent(new Event('input'));
                    }
                });

                // Initial resize
                this.autoResizeTextarea(textarea);

                textarea._hasListeners = true;
            }
        });
    }
}

// Initialize code block manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.codeBlockManager = new CodeBlockManager();
});