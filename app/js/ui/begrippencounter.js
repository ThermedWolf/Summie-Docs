// ==================== BEGRIPPEN COUNTER ====================
// updateBegrippenCounter — animates the begrip count in the bottom bar.

function updateBegrippenCounter() {
    const el = document.getElementById('begripCount');
    if (!el) return;

    const begrippen = window.AppState.begrippen || [];
    const count = begrippen.length;
    const label = '\u00A0' + SummieI18n.t(count === 1 ? 'begrip' : 'begrippen');

    if (window._applyOdometerSplit) {
        window._applyOdometerSplit(el, count, label);
    } else if (window.applyOdometer) {
        window.applyOdometer(el, `${count}${label}`);
    } else {
        el.textContent = `${count}${label}`;
    }
}

// Expose
window.updateBegrippenCounter = updateBegrippenCounter;