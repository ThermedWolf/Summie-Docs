// ==================== BEGRIPPEN COUNTER ====================
// updateBegrippenCounter — animates the begrip count in the bottom bar.

function updateBegrippenCounter() {
    const el = document.getElementById('begripCount');
    if (!el) return;

    const begrippen = window.AppState.begrippen || [];
    const count = begrippen.length;
    const label = count === 1 ? '\u00A0begrip' : '\u00A0begrippen';

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