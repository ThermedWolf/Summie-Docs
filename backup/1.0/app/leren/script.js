// State
let allBegrippen = [];
let selectedBegrippen = [];
let currentMode = null;
let currentIndex = 0;
let isFlipped = false;

// Practice mode specific
let practiceRound = 1; // 1 = show answers, 2 = test yourself
let practiceQueue = [];
let practiceAnswered = [];

// Drill mode specific
let drillQueue = [];
let drillWrongAnswers = [];

// DOM Elements
const setupScreen = document.getElementById('setupScreen');
const flashcardsScreen = document.getElementById('flashcardsScreen');
const practiceScreen = document.getElementById('practiceScreen');
const drillScreen = document.getElementById('drillScreen');
const resultsScreen = document.getElementById('resultsScreen');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
});

// Event Listeners
function setupEventListeners() {
    // Navigation
    document.getElementById('backBtn').addEventListener('click', () => {
        window.location.href = '../index.html';
    });

    // File upload
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');

    uploadArea.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileUpload);

    // Drag and drop
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('drag-over');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('drag-over');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file && file.type === 'application/json') {
            loadFile(file);
        }
    });

    // Selection
    document.getElementById('selectAllBtn').addEventListener('click', () => {
        document.querySelectorAll('.begrip-check-item input').forEach(cb => cb.checked = true);
        updateSelectedCount();
    });

    document.getElementById('deselectAllBtn').addEventListener('click', () => {
        document.querySelectorAll('.begrip-check-item input').forEach(cb => cb.checked = false);
        updateSelectedCount();
    });

    // Mode selection
    document.querySelectorAll('.mode-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            currentMode = card.dataset.mode;
            updateStartButton();
        });
    });

    // Start learning
    document.getElementById('startLearningBtn').addEventListener('click', startLearning);

    // Flashcards
    document.getElementById('flashcard').addEventListener('click', flipCard);
    document.getElementById('flashcardFlipBtn').addEventListener('click', flipCard);
    document.getElementById('flashcardPrevBtn').addEventListener('click', () => navigateFlashcard(-1));
    document.getElementById('flashcardNextBtn').addEventListener('click', () => navigateFlashcard(1));
    document.getElementById('flashcardsExitBtn').addEventListener('click', showResults);

    // Flashcard keyboard
    document.addEventListener('keydown', (e) => {
        if (flashcardsScreen.style.display !== 'none') {
            if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                flipCard();
            } else if (e.key === 'ArrowLeft') {
                navigateFlashcard(-1);
            } else if (e.key === 'ArrowRight') {
                navigateFlashcard(1);
            }
        }
    });

    // Practice mode
    document.getElementById('practiceCheckBtn').addEventListener('click', checkPracticeAnswer);
    document.getElementById('practiceNextBtn').addEventListener('click', nextPractice);
    document.getElementById('practiceExitBtn').addEventListener('click', showResults);

    // Drill mode
    document.getElementById('drillCheckBtn').addEventListener('click', checkDrillAnswer);
    document.getElementById('drillNextBtn').addEventListener('click', nextDrill);
    document.getElementById('drillCorrectBtn').addEventListener('click', () => markDrillAnswer(true));
    document.getElementById('drillWrongBtn').addEventListener('click', () => markDrillAnswer(false));
    document.getElementById('drillExitBtn').addEventListener('click', showResults);

    // Results
    document.getElementById('restartBtn').addEventListener('click', restartSession);
    document.getElementById('newSessionBtn').addEventListener('click', newSession);
}

// File handling
function handleFileUpload(e) {
    const file = e.target.files[0];
    if (file) {
        loadFile(file);
    }
}

function loadFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.begrippen || !Array.isArray(data.begrippen)) {
                showNotification('Fout', 'Dit bestand bevat geen begrippen.', 'error');
                return;
            }

            allBegrippen = data.begrippen;
            showBegrippenSelection();
            showNotification('Bestand geladen', `${allBegrippen.length} begrippen gevonden.`, 'success');
        } catch (error) {
            showNotification('Fout', 'Kon bestand niet laden. Zorg dat het een geldig JSON-bestand is.', 'error');
        }
    };
    reader.readAsText(file);
}

// Begrippen selection
function showBegrippenSelection() {
    document.getElementById('begrippenSelection').style.display = 'block';
    const list = document.getElementById('begrippenCheckList');
    list.innerHTML = '';

    allBegrippen.forEach((begrip, index) => {
        const item = document.createElement('div');
        item.className = 'begrip-check-item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = true;
        checkbox.id = `begrip-${index}`;
        checkbox.addEventListener('change', updateSelectedCount);

        const content = document.createElement('div');
        content.className = 'begrip-check-content';

        const keyword = document.createElement('div');
        keyword.className = 'begrip-check-keyword';
        keyword.textContent = begrip.keyword;

        const description = document.createElement('div');
        description.className = 'begrip-check-description';
        description.textContent = begrip.description;

        content.appendChild(keyword);
        content.appendChild(description);

        item.appendChild(checkbox);
        item.appendChild(content);

        // Click on item to toggle checkbox
        item.addEventListener('click', (e) => {
            if (e.target !== checkbox) {
                checkbox.checked = !checkbox.checked;
                updateSelectedCount();
            }
        });

        list.appendChild(item);
    });

    updateSelectedCount();
}

function updateSelectedCount() {
    const checkboxes = document.querySelectorAll('.begrip-check-item input');
    const checked = Array.from(checkboxes).filter(cb => cb.checked).length;
    document.getElementById('selectedCount').textContent = `${checked} geselecteerd`;
    updateStartButton();
}

function updateStartButton() {
    const checkboxes = document.querySelectorAll('.begrip-check-item input');
    const checked = Array.from(checkboxes).filter(cb => cb.checked).length;
    const startBtn = document.getElementById('startLearningBtn');
    startBtn.disabled = checked === 0 || !currentMode;
}

// Start learning
function startLearning() {
    const checkboxes = document.querySelectorAll('.begrip-check-item input');
    selectedBegrippen = Array.from(checkboxes)
        .map((cb, index) => cb.checked ? allBegrippen[index] : null)
        .filter(b => b !== null);

    if (selectedBegrippen.length === 0) {
        showNotification('Fout', 'Selecteer minimaal één begrip.', 'error');
        return;
    }

    // Shuffle begrippen
    selectedBegrippen = shuffle([...selectedBegrippen]);

    // Start appropriate mode
    setupScreen.style.display = 'none';

    switch (currentMode) {
        case 'flashcards':
            startFlashcards();
            break;
        case 'practice':
            startPractice();
            break;
        case 'drill':
            startDrill();
            break;
    }
}

// Flashcards Mode
function startFlashcards() {
    currentIndex = 0;
    isFlipped = false;
    flashcardsScreen.style.display = 'block';
    showFlashcard();
}

function showFlashcard() {
    const begrip = selectedBegrippen[currentIndex];
    document.getElementById('flashcardTerm').textContent = begrip.keyword;
    document.getElementById('flashcardDefinition').textContent = begrip.description;

    // Reset flip
    document.getElementById('flashcard').classList.remove('flipped');
    isFlipped = false;

    // Update progress
    const progress = ((currentIndex + 1) / selectedBegrippen.length) * 100;
    document.getElementById('flashcardsProgress').style.width = progress + '%';
    document.getElementById('flashcardsProgressText').textContent = `${currentIndex + 1} / ${selectedBegrippen.length}`;

    // Update buttons
    document.getElementById('flashcardPrevBtn').disabled = currentIndex === 0;
}

function flipCard() {
    const flashcard = document.getElementById('flashcard');
    flashcard.classList.toggle('flipped');
    isFlipped = !isFlipped;
}

function navigateFlashcard(direction) {
    currentIndex += direction;
    if (currentIndex < 0) currentIndex = 0;
    if (currentIndex >= selectedBegrippen.length) {
        showResults();
        return;
    }
    showFlashcard();
}

// Practice Mode
function startPractice() {
    practiceRound = 1;
    practiceQueue = [...selectedBegrippen];
    practiceAnswered = [];
    currentIndex = 0;
    practiceScreen.style.display = 'block';
    showPracticeQuestion();
}

function showPracticeQuestion() {
    const begrip = practiceQueue[currentIndex];

    // Update round indicator
    const roundText = practiceRound === 1 ? 'Ronde 1: Met antwoorden' : 'Ronde 2: Zelf invullen';
    document.getElementById('practiceRound').textContent = roundText;

    // Show question
    document.getElementById('practiceTerm').textContent = begrip.keyword;
    document.getElementById('practiceAnswer').value = '';

    // Show/hide correct answer for round 1
    if (practiceRound === 1) {
        document.getElementById('practiceCorrectAnswer').style.display = 'block';
        document.getElementById('correctAnswerText').textContent = begrip.description;
        document.getElementById('answerComparison').style.display = 'none';
        document.getElementById('practiceCheckBtn').style.display = 'none';
        document.getElementById('practiceNextBtn').style.display = 'inline-flex';
    } else {
        document.getElementById('practiceCorrectAnswer').style.display = 'none';
        document.getElementById('answerComparison').style.display = 'none';
        document.getElementById('practiceCheckBtn').style.display = 'inline-flex';
        document.getElementById('practiceNextBtn').style.display = 'none';
    }

    // Update progress
    const totalItems = practiceRound === 1 ? selectedBegrippen.length : selectedBegrippen.length * 2;
    const currentItem = practiceRound === 1 ? currentIndex + 1 : selectedBegrippen.length + currentIndex + 1;
    const progress = (currentItem / totalItems) * 100;
    document.getElementById('practiceProgress').style.width = progress + '%';
    document.getElementById('practiceProgressText').textContent = `${currentItem} / ${totalItems}`;

    // Focus on textarea if round 2
    if (practiceRound === 2) {
        document.getElementById('practiceAnswer').focus();
    }
}

function checkPracticeAnswer() {
    const begrip = practiceQueue[currentIndex];
    const userAnswer = document.getElementById('practiceAnswer').value.trim();

    // Show comparison
    document.getElementById('answerComparison').style.display = 'block';
    showAnswerComparison('userAnswerComparison', 'correctAnswerComparison', userAnswer, begrip.description);

    // Hide check button, show next
    document.getElementById('practiceCheckBtn').style.display = 'none';
    document.getElementById('practiceNextBtn').style.display = 'inline-flex';
}

function nextPractice() {
    currentIndex++;

    if (currentIndex >= practiceQueue.length) {
        if (practiceRound === 1) {
            // Start round 2
            practiceRound = 2;
            practiceQueue = shuffle([...selectedBegrippen]);
            currentIndex = 0;
            showPracticeQuestion();
        } else {
            // Finished
            showResults();
        }
    } else {
        showPracticeQuestion();
    }
}

// Drill Mode
function startDrill() {
    drillQueue = [...selectedBegrippen];
    drillWrongAnswers = [];
    currentIndex = 0;
    drillScreen.style.display = 'block';
    showDrillQuestion();
}

function showDrillQuestion() {
    const begrip = drillQueue[currentIndex];

    // Show question
    document.getElementById('drillTerm').textContent = begrip.keyword;
    document.getElementById('drillAnswer').value = '';

    // Hide comparison
    document.getElementById('drillComparison').style.display = 'none';
    document.getElementById('drillCheckBtn').style.display = 'inline-flex';
    document.getElementById('drillNextBtn').style.display = 'none';

    // Update progress
    const totalItems = selectedBegrippen.length + drillWrongAnswers.length;
    const progress = ((currentIndex + 1) / totalItems) * 100;
    document.getElementById('drillProgress').style.width = progress + '%';
    document.getElementById('drillProgressText').textContent = `${currentIndex + 1} / ${totalItems}`;

    // Focus on textarea
    document.getElementById('drillAnswer').focus();
}

function checkDrillAnswer() {
    const begrip = drillQueue[currentIndex];
    const userAnswer = document.getElementById('drillAnswer').value.trim();

    // Show comparison
    document.getElementById('drillComparison').style.display = 'block';
    showAnswerComparison('drillUserAnswer', 'drillCorrectAnswer', userAnswer, begrip.description);

    // Hide check button, show marking buttons
    document.getElementById('drillCheckBtn').style.display = 'none';
}

function markDrillAnswer(isCorrect) {
    const begrip = drillQueue[currentIndex];

    if (!isCorrect) {
        // Add to wrong answers if not already there
        if (!drillWrongAnswers.find(b => b.id === begrip.id)) {
            drillWrongAnswers.push(begrip);
        }
    }

    currentIndex++;

    if (currentIndex >= drillQueue.length) {
        if (drillWrongAnswers.length > 0) {
            // Continue with wrong answers
            drillQueue = [...drillWrongAnswers];
            drillWrongAnswers = [];
            currentIndex = 0;
            showDrillQuestion();
        } else {
            // Finished
            showResults();
        }
    } else {
        showDrillQuestion();
    }
}

function nextDrill() {
    // Not used in drill mode
}

// Answer comparison
function showAnswerComparison(userElementId, correctElementId, userAnswer, correctAnswer) {
    const userWords = userAnswer.toLowerCase().split(/\s+/).filter(w => w.length > 0);
    const correctWords = correctAnswer.toLowerCase().split(/\s+/).filter(w => w.length > 0);

    // Highlight matching words
    const userHTML = userAnswer.split(/\s+/).map(word => {
        const cleanWord = word.toLowerCase().replace(/[.,;:!?]/g, '');
        if (correctWords.includes(cleanWord)) {
            return `<span class="match">${word}</span>`;
        }
        return `<span class="no-match">${word}</span>`;
    }).join(' ');

    const correctHTML = correctAnswer.split(/\s+/).map(word => {
        const cleanWord = word.toLowerCase().replace(/[.,;:!?]/g, '');
        if (userWords.includes(cleanWord)) {
            return `<span class="match">${word}</span>`;
        }
        return word;
    }).join(' ');

    document.getElementById(userElementId).innerHTML = userHTML || '<em>(Geen antwoord gegeven)</em>';
    document.getElementById(correctElementId).innerHTML = correctHTML;
}

// Results
function showResults() {
    flashcardsScreen.style.display = 'none';
    practiceScreen.style.display = 'none';
    drillScreen.style.display = 'none';
    resultsScreen.style.display = 'block';

    const summary = document.getElementById('resultsSummary');
    let message = '';

    switch (currentMode) {
        case 'flashcards':
            message = `<p>Je hebt ${selectedBegrippen.length} begrippen bekeken met flashcards.</p>`;
            break;
        case 'practice':
            message = `<p>Je hebt ${selectedBegrippen.length} begrippen geoefend in 2 rondes.</p>`;
            break;
        case 'drill':
            message = `<p>Je hebt ${selectedBegrippen.length} begrippen gestampt.</p>`;
            break;
    }

    summary.innerHTML = message;
}

function restartSession() {
    resultsScreen.style.display = 'none';

    switch (currentMode) {
        case 'flashcards':
            startFlashcards();
            break;
        case 'practice':
            startPractice();
            break;
        case 'drill':
            startDrill();
            break;
    }
}

function newSession() {
    // Reset everything
    resultsScreen.style.display = 'none';
    setupScreen.style.display = 'block';
    currentMode = null;
    allBegrippen = [];
    selectedBegrippen = [];

    // Reset selection UI
    document.getElementById('begrippenSelection').style.display = 'none';
    document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('selected'));
    document.getElementById('fileInput').value = '';
}

// Utility functions
function shuffle(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// Notification System
function showNotification(title, message, type = 'info') {
    const container = document.getElementById('notificationContainer');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;

    const icons = {
        success: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
        error: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
        info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
    };

    notification.innerHTML = `
        <div class="notification-icon">${icons[type]}</div>
        <div class="notification-content">
            <div class="notification-title">${title}</div>
            ${message ? `<div class="notification-message">${message}</div>` : ''}
        </div>
        <button class="notification-close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
        </button>
    `;

    container.appendChild(notification);

    // Close button
    notification.querySelector('.notification-close').addEventListener('click', () => {
        closeNotification(notification);
    });

    // Auto close after 4 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            closeNotification(notification);
        }
    }, 4000);
}

function closeNotification(notification) {
    notification.classList.add('closing');
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 300);
}