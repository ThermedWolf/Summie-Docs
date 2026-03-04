// ==================== SHARED STATE ====================
// Single source of truth for all mutable globals.
// Every module reads/writes through window.AppState.

window.AppState = {
    // Data
    begrippen: [],
    currentEditingBegrip: null,

    // Search / autocomplete
    autocompleteIndex: -1,
    searchMatches: [],
    currentSearchIndex: 0,

    // Word count milestone tracking
    lastMilestone: 0,
    previousWordCount: 0,

    // Unsaved changes tracking (in-memory; localStorage used for cross-page)
    lastSavedContent: null,
    lastSavedBegrippen: null,

    // DOM references (set once on DOMContentLoaded)
    editor: null,
    begrippenList: null,
    inhoudList: null,
    autocompletePopup: null,
    begripTooltip: null,
    begripModal: null,
    searchBegrippen: null,
    searchResults: null,

    // Initialise DOM refs
    initRefs() {
        this.editor = document.getElementById('editor');
        this.begrippenList = document.getElementById('begrippenList');
        this.inhoudList = document.getElementById('inhoudList');
        this.autocompletePopup = document.getElementById('autocompletePopup');
        this.begripTooltip = document.getElementById('begripTooltip');
        this.begripModal = document.getElementById('begripModal');
        this.searchBegrippen = document.getElementById('searchBegrippen');
        this.searchResults = document.getElementById('searchResults');
    }
};