// ==================== SYNTAX HIGHLIGHTER ====================
// Tokenises source code and returns HTML with syntax-coloured <span> elements.
// Supports: JS, TS, Python, Java, C#, C++, PHP, HTML, CSS, JSON, SQL, Bash.

class SyntaxHighlighter {
    constructor() {
        this.patterns = this.initializePatterns();
    }

    initializePatterns() {
        return {
            javascript: {
                comment: [
                    /\/\/.*$/gm,
                    /\/\*[\s\S]*?\*\//g
                ],
                string: [
                    /"(?:\\.|[^"\\])*"/g,
                    /'(?:\\.|[^'\\])*'/g,
                    /`(?:\\.|[^`\\])*`/g
                ],
                keyword: /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|default|try|catch|finally|throw|new|class|extends|import|export|from|async|await|yield|typeof|instanceof|delete|void|in|of|static|this|super)\b/g,
                boolean: /\b(true|false)\b/g,
                null: /\b(null|undefined)\b/g,
                number: /\b(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\b/g,
                function: /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?=\()/g,
                property: /\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g,
                operator: /[+\-*/%=<>!&|^~?:]+/g
            },
            typescript: {
                comment: [
                    /\/\/.*$/gm,
                    /\/\*[\s\S]*?\*\//g
                ],
                string: [
                    /"(?:\\.|[^"\\])*"/g,
                    /'(?:\\.|[^'\\])*'/g,
                    /`(?:\\.|[^`\\])*`/g
                ],
                keyword: /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|default|try|catch|finally|throw|new|class|extends|import|export|from|async|await|yield|typeof|instanceof|delete|void|in|of|static|this|super|interface|type|enum|namespace|public|private|protected|readonly|abstract|implements)\b/g,
                type: /\b(string|number|boolean|any|void|never|unknown|object|symbol|bigint)\b/g,
                boolean: /\b(true|false)\b/g,
                null: /\b(null|undefined)\b/g,
                number: /\b(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\b/g,
                function: /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?=\()/g,
                property: /\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g,
                operator: /[+\-*/%=<>!&|^~?:]+/g
            },
            python: {
                comment: /#.*$/gm,
                string: [
                    /"""[\s\S]*?"""/g,
                    /'''[\s\S]*?'''/g,
                    /"(?:\\.|[^"\\])*"/g,
                    /'(?:\\.|[^'\\])*'/g
                ],
                keyword: /\b(def|class|return|if|elif|else|for|while|break|continue|pass|try|except|finally|raise|with|as|import|from|lambda|yield|async|await|assert|del|global|nonlocal|in|is|not|and|or)\b/g,
                decorator: /@[a-zA-Z_][a-zA-Z0-9_]*/g,
                boolean: /\b(True|False)\b/g,
                null: /\b(None)\b/g,
                number: /\b(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\b/g,
                function: /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*(?=\()/g,
                builtin: /\b(print|len|range|str|int|float|list|dict|set|tuple|type|isinstance|input|open|abs|all|any|enumerate|zip|map|filter|sorted|sum|max|min)\b/g
            },
            java: {
                comment: [
                    /\/\/.*$/gm,
                    /\/\*[\s\S]*?\*\//g
                ],
                string: /"(?:\\.|[^"\\])*"/g,
                keyword: /\b(public|private|protected|static|final|abstract|class|interface|extends|implements|new|return|if|else|for|while|do|switch|case|break|continue|default|try|catch|finally|throw|throws|void|import|package|this|super|synchronized|volatile|transient|native|strictfp|enum)\b/g,
                type: /\b(int|long|short|byte|float|double|char|boolean|String|Integer|Long|Short|Byte|Float|Double|Character|Boolean|Object|List|Map|Set|ArrayList|HashMap|HashSet)\b/g,
                boolean: /\b(true|false)\b/g,
                null: /\b(null)\b/g,
                number: /\b(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?[lLfFdD]?\b/g,
                function: /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*(?=\()/g,
                operator: /[+\-*/%=<>!&|^~?:]+/g
            },
            csharp: {
                comment: [
                    /\/\/.*$/gm,
                    /\/\*[\s\S]*?\*\//g
                ],
                string: [
                    /@"(?:""|[^"])*"/g,
                    /"(?:\\.|[^"\\])*"/g
                ],
                keyword: /\b(public|private|protected|internal|static|readonly|const|abstract|class|interface|struct|enum|namespace|using|new|return|if|else|for|foreach|while|do|switch|case|break|continue|default|try|catch|finally|throw|void|this|base|virtual|override|async|await|var|in|out|ref|params)\b/g,
                type: /\b(int|long|short|byte|float|double|decimal|char|bool|string|object|dynamic|var|void|List|Dictionary|HashSet|IEnumerable|Task)\b/g,
                boolean: /\b(true|false)\b/g,
                null: /\b(null)\b/g,
                number: /\b(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?[lLfFdDmM]?\b/g,
                function: /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*(?=\()/g,
                operator: /[+\-*/%=<>!&|^~?:]+/g
            },
            cpp: {
                comment: [
                    /\/\/.*$/gm,
                    /\/\*[\s\S]*?\*\//g
                ],
                string: [
                    /"(?:\\.|[^"\\])*"/g,
                    /'(?:\\.|[^'\\])*'/g
                ],
                keyword: /\b(public|private|protected|static|const|virtual|override|class|struct|namespace|using|new|return|if|else|for|while|do|switch|case|break|continue|default|try|catch|throw|void|this|template|typename|auto|decltype|constexpr|nullptr|delete|inline|extern|friend|operator)\b/g,
                type: /\b(int|long|short|char|float|double|bool|void|string|vector|map|set|list|queue|stack|pair|shared_ptr|unique_ptr|weak_ptr)\b/g,
                boolean: /\b(true|false)\b/g,
                null: /\b(nullptr|NULL)\b/g,
                number: /\b(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?[lLfF]?\b/g,
                function: /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*(?=\()/g,
                operator: /[+\-*/%=<>!&|^~?:]+/g
            },
            html: {
                comment: /<!--[\s\S]*?-->/g,
                doctype: /<!DOCTYPE[^>]*>/gi,
                tag: /<\/?[a-zA-Z][a-zA-Z0-9]*(?:\s|>|\/)/g,
                attribute: /\b([a-zA-Z-]+)(?==)/g,
                string: [
                    /"(?:\\.|[^"\\])*"/g,
                    /'(?:\\.|[^'\\])*'/g
                ]
            },
            css: {
                comment: /\/\*[\s\S]*?\*\//g,
                property: /\b([a-z-]+)\s*:/g,
                string: [
                    /"(?:\\.|[^"\\])*"/g,
                    /'(?:\\.|[^'\\])*'/g
                ],
                number: /\b(\d+\.?\d*)(px|em|rem|%|vh|vw|pt|cm|mm|in|pc|ex|ch|vmin|vmax)?\b/g,
                keyword: /\b(important|inherit|initial|unset|auto|none)\b/g
            },
            json: {
                string: /"(?:\\.|[^"\\])*"/g,
                number: /\b(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\b/g,
                boolean: /\b(true|false)\b/g,
                null: /\b(null)\b/g,
                property: /"([^"]+)"\s*:/g
            },
            sql: {
                comment: [
                    /--.*$/gm,
                    /\/\*[\s\S]*?\*\//g
                ],
                string: [
                    /"(?:\\.|[^"\\])*"/g,
                    /'(?:\\.|[^'\\])*'/g
                ],
                keyword: /\b(SELECT|FROM|WHERE|INSERT|INTO|UPDATE|DELETE|CREATE|TABLE|ALTER|DROP|JOIN|LEFT|RIGHT|INNER|OUTER|ON|GROUP|BY|ORDER|HAVING|LIMIT|OFFSET|AS|AND|OR|NOT|IN|LIKE|BETWEEN|IS|NULL|DISTINCT|COUNT|SUM|AVG|MAX|MIN|UNION|ALL|EXISTS|CASE|WHEN|THEN|ELSE|END)\b/gi,
                function: /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*(?=\()/g,
                number: /\b(\d+\.?\d*|\.\d+)\b/g
            },
            php: {
                comment: [
                    /\/\/.*$/gm,
                    /\/\*[\s\S]*?\*\//g,
                    /#.*$/gm
                ],
                string: [
                    /"(?:\\.|[^"\\])*"/g,
                    /'(?:\\.|[^'\\])*'/g
                ],
                phptag: /(<\?php|<\?=|\?>)/g,
                keyword: /\b(function|return|if|else|elseif|for|foreach|while|do|switch|case|break|continue|default|try|catch|finally|throw|new|class|extends|implements|public|private|protected|static|const|var|namespace|use|as|trait|interface|abstract|final|echo|print|require|include|require_once|include_once|isset|empty|unset|array|list|global|this)\b/g,
                variable: /\$[a-zA-Z_][a-zA-Z0-9_]*/g,
                boolean: /\b(true|false)\b/g,
                null: /\b(null)\b/g,
                number: /\b(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\b/g,
                function: /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*(?=\()/g
            },
            bash: {
                comment: /#.*$/gm,
                string: [
                    /"(?:\\.|[^"\\])*"/g,
                    /'(?:\\.|[^'\\])*'/g
                ],
                keyword: /\b(if|then|else|elif|fi|for|while|do|done|case|esac|function|return|in|select|time|until)\b/g,
                variable: /\$[a-zA-Z_][a-zA-Z0-9_]*|\$\{[^}]+\}/g,
                builtin: /\b(echo|printf|read|cd|pwd|ls|cp|mv|rm|mkdir|rmdir|cat|grep|sed|awk|sort|uniq|wc|head|tail|find|chmod|chown|export|source|alias)\b/g
            }
        };
    }

    highlight(code, language) {
        if (!code || !language || language === 'plaintext') {
            return this.escapeHtml(code);
        }

        // Handle embedded languages
        if (language === 'php') {
            return this.highlightPHP(code);
        } else if (language === 'html') {
            return this.highlightHTML(code);
        }

        return this.highlightSingle(code, language);
    }

    highlightPHP(code) {
        const segments = [];
        let lastIndex = 0;

        // Find PHP tags and embedded HTML/JavaScript
        const phpTagRegex = /(<\?php|<\?=)([\s\S]*?)(\?>)/g;
        let match;

        while ((match = phpTagRegex.exec(code)) !== null) {
            const start = match.index;
            const end = start + match[0].length;

            // Add HTML before this PHP block
            if (start > lastIndex) {
                const htmlPart = code.substring(lastIndex, start);
                segments.push({
                    start: lastIndex,
                    end: start,
                    content: this.highlightHTML(htmlPart)
                });
            }

            // Add PHP opening tag
            segments.push({
                start: start,
                end: start + match[1].length,
                content: `<span class="syntax-phptag">${this.escapeHtml(match[1])}</span>`
            });

            // Add PHP code (highlighted)
            const phpCode = match[2];
            segments.push({
                start: start + match[1].length,
                end: end - match[3].length,
                content: this.highlightSingle(phpCode, 'php', true)
            });

            // Add PHP closing tag
            segments.push({
                start: end - match[3].length,
                end: end,
                content: `<span class="syntax-phptag">${this.escapeHtml(match[3])}</span>`
            });

            lastIndex = end;
        }

        // Add remaining HTML
        if (lastIndex < code.length) {
            const htmlPart = code.substring(lastIndex);
            segments.push({
                start: lastIndex,
                end: code.length,
                content: this.highlightHTML(htmlPart)
            });
        }

        return segments.map(s => s.content).join('');
    }

    highlightHTML(code) {
        const segments = [];
        let lastIndex = 0;

        // Find script tags
        const scriptRegex = /(<script[^>]*>)([\s\S]*?)(<\/script>)/gi;
        let match;

        while ((match = scriptRegex.exec(code)) !== null) {
            const start = match.index;
            const end = start + match[0].length;

            // Add HTML before this script block
            if (start > lastIndex) {
                const htmlPart = code.substring(lastIndex, start);
                segments.push({
                    start: lastIndex,
                    end: start,
                    content: this.highlightSingle(htmlPart, 'html')
                });
            }

            // Add opening script tag (as HTML)
            segments.push({
                start: start,
                end: start + match[1].length,
                content: this.highlightSingle(match[1], 'html')
            });

            // Add JavaScript code
            const jsCode = match[2];
            segments.push({
                start: start + match[1].length,
                end: end - match[3].length,
                content: this.highlightSingle(jsCode, 'javascript')
            });

            // Add closing script tag (as HTML)
            segments.push({
                start: end - match[3].length,
                end: end,
                content: this.highlightSingle(match[3], 'html')
            });

            lastIndex = end;
        }

        // Add remaining HTML
        if (lastIndex < code.length) {
            const htmlPart = code.substring(lastIndex);
            segments.push({
                start: lastIndex,
                end: code.length,
                content: this.highlightSingle(htmlPart, 'html')
            });
        }

        return segments.map(s => s.content).join('');
    }

    highlightSingle(code, language, skipPhpTags = false) {
        const patterns = this.patterns[language];
        if (!patterns) {
            return this.escapeHtml(code);
        }

        const tokens = [];

        // Processing order with language-specific additions
        let processingOrder = ['comment', 'string', 'phptag', 'doctype', 'keyword', 'type', 'decorator', 'boolean', 'null', 'number', 'function', 'builtin', 'property', 'attribute', 'variable', 'tag', 'operator'];

        // Skip phptag if we're inside a PHP block
        if (skipPhpTags) {
            processingOrder = processingOrder.filter(t => t !== 'phptag');
        }

        processingOrder.forEach(tokenType => {
            if (!patterns[tokenType]) return;

            const patternList = Array.isArray(patterns[tokenType]) ? patterns[tokenType] : [patterns[tokenType]];

            patternList.forEach(pattern => {
                const regex = new RegExp(pattern.source, pattern.flags);
                let match;

                while ((match = regex.exec(code)) !== null) {
                    const start = match.index;
                    const end = start + match[0].length;

                    // Check if this position is already tokenized
                    const overlaps = tokens.some(t =>
                        (start >= t.start && start < t.end) ||
                        (end > t.start && end <= t.end) ||
                        (start <= t.start && end >= t.end)
                    );

                    if (!overlaps) {
                        tokens.push({
                            start,
                            end,
                            type: tokenType,
                            text: match[0],
                            language: language
                        });
                    }
                }
            });
        });

        // Sort tokens by start position
        tokens.sort((a, b) => a.start - b.start);

        // Build highlighted HTML
        let result = '';
        let lastIndex = 0;

        tokens.forEach(token => {
            // Add plain text before this token
            if (token.start > lastIndex) {
                result += this.escapeHtml(code.substring(lastIndex, token.start));
            }

            // Add highlighted token with language-specific class
            const className = token.language ? `syntax-${token.type} syntax-${token.language}-${token.type}` : `syntax-${token.type}`;
            result += `<span class="${className}">${this.escapeHtml(token.text)}</span>`;
            lastIndex = token.end;
        });

        // Add remaining plain text
        if (lastIndex < code.length) {
            result += this.escapeHtml(code.substring(lastIndex));
        }

        return result;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Expose
window.syntaxHighlighter = new SyntaxHighlighter();