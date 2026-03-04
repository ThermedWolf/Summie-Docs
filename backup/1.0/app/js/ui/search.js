// ==================== SEARCH ====================
// handleSearch, searchInDocument, highlightSearchMatches, clearSearchHighlights,
// displaySearchResults, animateSearchCounter, navigateSearchMatches,
// handleSearchKeydown, selectAllSearchText.

function handleSearch(e) {
    const state = window.AppState;
    const query = e.target.value.toLowerCase().trim();

    if (!query) {
        state.searchResults.classList.remove('active');
        state.searchMatches = [];
        clearSearchHighlights();
        state.begrippenList.querySelectorAll('.begrip-item').forEach(item => item.classList.remove('highlight-item'));
        return;
    }

    const matchingBegrippen = state.begrippen.filter(b =>
        b.keyword.toLowerCase().includes(query) ||
        b.description.toLowerCase().includes(query)
    );

    searchInDocument(query);

    if (state.searchMatches.length === 0 && matchingBegrippen.length === 0) {
        state.searchResults.innerHTML = '<div class="search-result-item">Geen resultaten gevonden</div>';
        state.searchResults.classList.add('active');
    } else {
        displaySearchResults(matchingBegrippen, query);
    }

    // Highlight matching begrippen in list
    state.begrippenList.querySelectorAll('.begrip-item').forEach(item => {
        const id = parseInt(item.dataset.id);
        const begrip = state.begrippen.find(b => b.id === id);
        item.classList.toggle('highlight-item', !!(begrip && matchingBegrippen.includes(begrip)));
    });
}

function searchInDocument(query) {
    const { editor } = window.AppState;
    clearSearchHighlights();
    window.AppState.searchMatches = [];
    if (!query) return;

    const walker = document.createTreeWalker(
        editor,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode(node) {
                let parent = node.parentElement;
                while (parent && parent !== editor) {
                    if (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE') return NodeFilter.FILTER_REJECT;
                    parent = parent.parentElement;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        },
        false
    );

    let node;
    while (node = walker.nextNode()) {
        const text = node.textContent;
        const lowerText = text.toLowerCase();
        let index = lowerText.indexOf(query);
        while (index !== -1) {
            window.AppState.searchMatches.push({ node, start: index, length: query.length });
            index = lowerText.indexOf(query, index + 1);
        }
    }

    if (window.AppState.searchMatches.length > 0) {
        highlightSearchMatches();
        window.AppState.currentSearchIndex = 0;
        navigateSearchMatches(0);
    }
}

function highlightSearchMatches() {
    clearSearchHighlights();
    const { searchMatches } = window.AppState;

    const nodeMatches = new Map();
    searchMatches.forEach((match, index) => {
        if (!nodeMatches.has(match.node)) nodeMatches.set(match.node, []);
        nodeMatches.get(match.node).push({ ...match, index });
    });

    nodeMatches.forEach((matches, node) => {
        const text = node.textContent;
        const parent = node.parentElement;
        const fragment = document.createDocumentFragment();

        matches.sort((a, b) => a.start - b.start);
        let lastIndex = 0;

        matches.forEach(match => {
            if (match.start > lastIndex) {
                fragment.appendChild(document.createTextNode(text.substring(lastIndex, match.start)));
            }
            const mark = document.createElement('mark');
            mark.className = 'search-highlight';
            mark.dataset.index = match.index;
            mark.textContent = text.substring(match.start, match.start + match.length);
            fragment.appendChild(mark);
            lastIndex = match.start + match.length;
        });

        if (lastIndex < text.length) fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
        parent.replaceChild(fragment, node);
    });
}

function clearSearchHighlights() {
    const { editor } = window.AppState;
    editor.querySelectorAll('.search-highlight').forEach(highlight => {
        highlight.parentNode.replaceChild(document.createTextNode(highlight.textContent), highlight);
    });
    editor.normalize();
}

function displaySearchResults(begrippen, query) {
    const { searchResults, searchMatches } = window.AppState;
    searchResults.innerHTML = '';

    if (searchMatches.length > 0) {
        const docResult = document.createElement('div');
        docResult.className = 'search-result-item';
        docResult.innerHTML = `
            <div class="search-counter">
                <span class="search-count-number">0 resultaten in document</span>
                <div class="search-nav">
                    <button id="prevMatch">←</button>
                    <button id="nextMatch">→</button>
                </div>
            </div>
        `;
        searchResults.appendChild(docResult);

        animateSearchCounter(docResult.querySelector('.search-count-number'), searchMatches.length);
        document.getElementById('prevMatch').addEventListener('click', () => navigateSearchMatches(-1));
        document.getElementById('nextMatch').addEventListener('click', () => navigateSearchMatches(1));
    }

    begrippen.forEach(begrip => {
        const item = document.createElement('div');
        item.className = 'search-result-item';
        item.innerHTML = `
            <div class="autocomplete-keyword">${begrip.keyword}</div>
            <div class="autocomplete-description">${begrip.description}</div>
        `;
        item.addEventListener('click', () => window.highlightBegripInList && window.highlightBegripInList(begrip));
        searchResults.appendChild(item);
    });

    searchResults.classList.add('active');
}

function animateSearchCounter(element, targetCount) {
    element.classList.add('counting');
    const steps = 20;
    const duration = 500;
    const increment = targetCount / steps;
    let current = 0, step = 0;

    const timer = setInterval(() => {
        step++;
        current = Math.min(Math.round(increment * step), targetCount);
        element.textContent = `${current} ${current === 1 ? 'resultaat' : 'resultaten'} in document`;
        if (step >= steps || current >= targetCount) {
            clearInterval(timer);
            element.textContent = `${targetCount} ${targetCount === 1 ? 'resultaat' : 'resultaten'} in document`;
            setTimeout(() => element.classList.remove('counting'), 100);
        }
    }, duration / steps);
}

function navigateSearchMatches(direction) {
    const state = window.AppState;
    if (state.searchMatches.length === 0) return;

    if (direction === 0) {
        state.currentSearchIndex = 0;
    } else {
        state.currentSearchIndex += direction;
        if (state.currentSearchIndex < 0) state.currentSearchIndex = state.searchMatches.length - 1;
        if (state.currentSearchIndex >= state.searchMatches.length) state.currentSearchIndex = 0;
    }

    const { editor } = state;
    editor.querySelectorAll('.search-highlight').forEach(h => { h.style.backgroundColor = '#fef08a'; });

    const current = editor.querySelector(`.search-highlight[data-index="${state.currentSearchIndex}"]`);
    if (current) {
        current.style.backgroundColor = '#fbbf24';
        current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function handleSearchKeydown(e) {
    if (window.AppState.searchMatches.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); navigateSearchMatches(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); navigateSearchMatches(-1); }
}

function selectAllSearchText() {
    window.AppState.searchBegrippen.select();
}

// Expose
window.handleSearch = handleSearch;
window.searchInDocument = searchInDocument;
window.highlightSearchMatches = highlightSearchMatches;
window.clearSearchHighlights = clearSearchHighlights;
window.displaySearchResults = displaySearchResults;
window.animateSearchCounter = animateSearchCounter;
window.navigateSearchMatches = navigateSearchMatches;
window.handleSearchKeydown = handleSearchKeydown;
window.selectAllSearchText = selectAllSearchText;