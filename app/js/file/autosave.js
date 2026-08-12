// ==================== AUTO-SAVE ====================
(function () {
    const DEBOUNCE_MS = 2500;
    let _timer = null;
    let _enabled = false;
    let _autoSaving = false;

    function scheduleAutoSave() {
        if (!_enabled) return;
        if (!window.currentFilePath) return;
        if (!window.electron || !window.saveToFile) return;
        clearTimeout(_timer);
        _timer = setTimeout(() => {
            if (!_enabled || !window.currentFilePath) return;
            // Only save if there are actual unsaved changes
            if (window._hasUnsavedChanges && !window._hasUnsavedChanges()) return;
            _autoSaving = true;
            window.saveToFile(false).finally(() => { _autoSaving = false; });
        }, DEBOUNCE_MS);
    }

    function _updateUI() {
        const checkbox = document.getElementById('autosaveCheckbox');
        const container = document.getElementById('topbarAutosave');
        const label = document.getElementById('autosaveLabel');
        if (!checkbox || !container) return;

        const hasFile = !!window.currentFilePath;
        checkbox.checked = _enabled;
        checkbox.disabled = !hasFile;
        container.classList.toggle('is-disabled', !hasFile);
        container.classList.toggle('is-active', _enabled && hasFile);

        if (label) {
            label.textContent = SummieI18n.t('Automatisch opslaan');
        }
        if (!hasFile) {
            container.title = SummieI18n.t('Sla eerst het document op om autosave te activeren');
        } else if (_enabled) {
            container.title = SummieI18n.t('Automatisch opslaan is ingeschakeld — klik om uit te schakelen');
        } else {
            container.title = SummieI18n.t('Automatisch opslaan is uitgeschakeld — klik om in te schakelen');
        }
    }

    async function _loadSettingForCurrentFile() {
        const filePath = window.currentFilePath;
        if (!filePath || !window.electron || !window.electron.autoSaveGet) {
            _enabled = false;
        } else {
            _enabled = await window.electron.autoSaveGet(filePath);
        }
        _updateUI();
    }

    async function _onToggleChange(checked) {
        const filePath = window.currentFilePath;
        if (!filePath) return;
        _enabled = checked;
        if (window.electron && window.electron.autoSaveSet) {
            await window.electron.autoSaveSet(filePath, checked);
        }
        _updateUI();
        if (!checked) clearTimeout(_timer);
    }

    document.addEventListener('DOMContentLoaded', () => {
        // Patch updateUnsavedIndicator — called on every content change
        const _original = window.updateUnsavedIndicator;
        window.updateUnsavedIndicator = function () {
            if (_original) _original.apply(this, arguments);
            scheduleAutoSave();
        };

        const editor = document.getElementById('editor');
        if (editor) editor.addEventListener('input', scheduleAutoSave);

        const checkbox = document.getElementById('autosaveCheckbox');
        if (checkbox) {
            checkbox.addEventListener('change', () => _onToggleChange(checkbox.checked));
        }

        // Defer loading until after the main bootstrap has restored currentFilePath
        setTimeout(() => _loadSettingForCurrentFile(), 200);
    });

    window.AutoSave = {
        get _autoSaving() { return _autoSaving; },
        async onFileChanged() {
            clearTimeout(_timer);
            await _loadSettingForCurrentFile();
        },
        flush() {
            clearTimeout(_timer);
            if (_enabled && window.currentFilePath && window.saveToFile) {
                window.saveToFile(false);
            }
        }
    };
})();