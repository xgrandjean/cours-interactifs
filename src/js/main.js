// ============================================================================
// CONSTANTES CENTRALISÉES
// ============================================================================

/**
 * Clés utilisées dans localStorage
 */
const STORAGE_KEYS = {
    COURSE_PROGRESS: 'course_progress',
    USER_PROGRESS: 'userProgress',
    USER_ANSWERS: 'userAnswers',
    QUESTION_ATTEMPTS: 'question_attempts',
    CHAPTER_CONFIG: 'chapter_config',
    COURSE_READ_PROGRESS: 'courseProgress'
};

/**
 * Configuration globale de l'application
 */
const APP_CONFIG = {
    PASSING_SCORE: 80,
    SUCCESS_FEEDBACK_DURATION: 3000,
    ERROR_FEEDBACK_DURATION: 5000,
    MAX_NOTE: 20
};

// ============================================================================
// UTILITAIRES DOM
// ============================================================================

/**
 * Raccourci pour document.querySelector
 * @param {string} selector - Sélecteur CSS
 * @returns {Element|null}
 */
const $ = (selector) => document.querySelector(selector);

/**
 * Raccourci pour document.querySelectorAll
 * @param {string} selector - Sélecteur CSS
 * @returns {NodeList}
 */
const $$ = (selector) => document.querySelectorAll(selector);

// ============================================================================
// SERVICE DE STOCKAGE LOCAL
// ============================================================================

/**
 * Service centralisé pour les opérations localStorage
 * Remplace progressivement les appels directs à localStorage
 */
class StorageService {
    static get(key, defaultValue = null) {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : defaultValue;
    }

    static set(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    static remove(key) {
        localStorage.removeItem(key);
    }
}

// ============================================================================
// SYSTÈME DE PROGRESSION
// ============================================================================

// Système de progression avec localStorage
class ProgressionSystem {
    constructor() {
        this.chapters = [
            { id: 1, title: 'Chapitre 1: Introduction', required: null },
            { id: 2, title: 'Chapitre 2: Concepts Avancés', required: 1 },
            { id: 3, title: 'Chapitre 3: Exercices Pratiques', required: 2 }
        ];
        
        this.auth = new LocalStorageAuth();
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.updateProgress();
        this.updateChapterStatus();
        this.updateProgressVisibility();
    }

    // Gestion du localStorage (basée sur l'authentification)
    // Utilise StorageService pour une meilleure maintenabilité
    getProgress() {
        if (this.auth && this.auth.currentStudent) {
            return this.auth.getStudentProgress() || {
                chapters: {},
                scores: {},
                totalCompleted: 0,
                questionAttempts: {}
            };
        } else {
            // Pour la compatibilité avec les anciennes données non authentifiées
            return StorageService.get(STORAGE_KEYS.COURSE_PROGRESS, {
                chapters: {},
                scores: {},
                totalCompleted: 0
            });
        }
    }

    saveProgress(progress) {
        if (this.auth && this.auth.currentStudent) {
            this.auth.saveStudentProgress(progress);
        } else {
            StorageService.set(STORAGE_KEYS.COURSE_PROGRESS, progress);
        }
    }

    // Vérification de la progression
    isChapterUnlocked(chapterId) {
        const progress = this.getProgress();
        const chapter = this.chapters.find(c => c.id === chapterId);
        
        // Vérifier le blocage global par le professeur
        const chapterConfig = this.getChapterConfig(chapterId);
        if (chapterConfig.locked) return false;
        
        // Vérifier la date limite
        if (chapterConfig.endDate) {
            const now = new Date();
            const endDate = new Date(chapterConfig.endDate);
            if (now > endDate) return false;
        }
        
        if (!chapter.required) return true;
        
        return progress.chapters[chapter.required] && progress.chapters[chapter.required].completed;
    }

    // Obtenir la configuration des chapitres (pour le blocage professeur)
    // Utilise StorageService pour une meilleure maintenabilité
    getChapterConfig(chapterId) {
        const config = StorageService.get(STORAGE_KEYS.CHAPTER_CONFIG, {});
        return config[chapterId] || { locked: false, endDate: null };
    }

    isChapterCompleted(chapterId) {
        const progress = this.getProgress();
        return progress.chapters[chapterId] && progress.chapters[chapterId].completed;
    }

    // Mise à jour de l'interface
    updateProgress() {
        const progress = this.getProgress();
        const totalChapters = this.chapters.length;
        const completedChapters = Object.values(progress.chapters).filter(c => c.completed).length;
        const percentage = totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : 0;

        const progressBar = document.getElementById('progress-fill');
        const progressText = document.getElementById('progress-text');

        if (progressBar) {
            progressBar.style.width = percentage + '%';
        }
        
        if (progressText) {
            progressText.textContent = percentage + '% complété';
        }
    }

    updateChapterStatus() {
        this.chapters.forEach(chapter => {
            const card = document.querySelector(`.chapter-card[data-chapter="${chapter.id}"]`);
            const status = document.getElementById(`chapter-${chapter.id}-status`);
            
            if (card && status) {
                const progress = this.getProgress();
                const isUnlocked = this.isChapterUnlocked(chapter.id);
                const isCompleted = this.isChapterCompleted(chapter.id);

                if (isCompleted) {
                    status.textContent = '✅ Validé';
                    status.className = 'chapter-status completed';
                    card.style.opacity = '1';
                } else if (isUnlocked) {
                    status.textContent = '🔓 Débloqué';
                    status.className = 'chapter-status unlocked';
                    card.style.opacity = '1';
                } else {
                    status.textContent = '🔒 Verrouillé';
                    status.className = 'chapter-status locked';
                    card.style.opacity = '0.5';
                }
            }
        });
    }

    // Validation d'un chapitre
    validateChapter(chapterId, score) {
        const progress = this.getProgress();
        
        if (!progress.chapters[chapterId]) {
            progress.chapters[chapterId] = {
                completed: false,
                score: 0,
                timestamp: null
            };
        }

        // Enregistrer le score
        progress.chapters[chapterId].score = score;
        progress.chapters[chapterId].timestamp = new Date().toISOString();

        // Validation si score >= APP_CONFIG.PASSING_SCORE
        if (score >= APP_CONFIG.PASSING_SCORE) {
            progress.chapters[chapterId].completed = true;
        }

        this.saveProgress(progress);
        this.updateProgress();
        this.updateChapterStatus();
        
        return progress.chapters[chapterId].completed;
    }

    // Réinitialisation
    // Utilise StorageService pour une meilleure maintenabilité
    resetProgress() {
        if (confirm('Êtes-vous sûr de vouloir réinitialiser toute votre progression ?')) {
            StorageService.remove(STORAGE_KEYS.COURSE_PROGRESS);
            this.updateProgress();
            this.updateChapterStatus();
        }
    }

    // Affichage des scores
    showScores() {
        const progress = this.getProgress();
        let message = 'Scores des chapitres :\n\n';
        
        this.chapters.forEach(chapter => {
            const data = progress.chapters[chapter.id];
            const score = data ? data.score : 0;
            const status = data && data.completed ? 'Validé' : 'En cours';
            message += `${chapter.title}: ${score}/100 (${status})\n`;
        });

        alert(message);
    }

    setupEventListeners() {
        // Bouton de réinitialisation
        const resetBtn = document.getElementById('reset-progress');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.resetProgress());
        }

        // Bouton d'affichage des scores
        const scoresBtn = document.getElementById('show-scores');
        if (scoresBtn) {
            scoresBtn.addEventListener('click', () => this.showScores());
        }
    }

    // Mettre à jour la visibilité de la progression
    updateProgressVisibility() {
        const progressOverview = document.getElementById('progress-overview');
        if (progressOverview) {
            if (this.auth && this.auth.currentStudent) {
                progressOverview.style.display = 'block';
            } else {
                progressOverview.style.display = 'none';
            }
        }
    }
}

// Système de QCM
class QCMSystem {
    constructor() {
        this.questions = [];
        this.currentScore = 0;
        this.init();
    }

    init() {
        this.setupQCM();
        this.setupEventListeners();
    }

    // Configuration des questions (exemple)
    setupQCM() {
        // Cette méthode sera surchargée dans chaque page de chapitre
        // Exemple de structure :
        this.questions = [
            {
                id: 1,
                question: "Quelle est la capitale de la France ?",
                type: "single", // single ou multiple
                options: [
                    { id: "a", text: "Londres", correct: false },
                    { id: "b", text: "Paris", correct: true },
                    { id: "c", text: "Berlin", correct: false },
                    { id: "d", text: "Madrid", correct: false }
                ],
                explanation: "Paris est la capitale de la France depuis le Moyen Âge."
            }
        ];
    }

    setupEventListeners() {
        const validateBtn = document.getElementById('validate-qcm');
        if (validateBtn) {
            validateBtn.addEventListener('click', () => this.validateAnswers());
        }

        const resetBtn = document.getElementById('reset-qcm');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.resetAnswers());
        }
    }

    validateAnswers() {
        let score = 0;
        let totalQuestions = this.questions.length;
        
        this.questions.forEach(question => {
            const selectedOptions = this.getSelectedOptions(question.id);
            const isCorrect = this.checkQuestion(question, selectedOptions);
            
            this.displayFeedback(question.id, isCorrect);
            
            // Enregistrer la tentative de question
            if (window.location.pathname.includes('chapitre')) {
                const chapterId = this.getChapterIdFromUrl();
                const auth = new LocalStorageAuth();
                auth.recordQuestionAttempt(chapterId, question.id, isCorrect);
            }
            
            if (isCorrect) {
                score++;
            }
        });

        const percentage = Math.round((score / totalQuestions) * 100);
        this.displayFinalScore(percentage);
        
        // Si on est dans une page de chapitre, enregistrer la progression
        if (window.location.pathname.includes('chapitre')) {
            const chapterId = this.getChapterIdFromUrl();
            const progression = new ProgressionSystem();
            const isValidated = progression.validateChapter(chapterId, percentage);
            
            if (isValidated) {
                alert(`Félicitations ! Vous avez validé ce chapitre avec ${percentage}% de bonnes réponses.`);
            } else {
                alert(`Dommage ! Vous avez obtenu ${percentage}% de bonnes réponses. Il faut 80% pour valider.`);
            }
        }
    }

    getSelectedOptions(questionId) {
        const inputs = document.querySelectorAll(`input[name="q${questionId}"]`);
        const selected = [];
        
        inputs.forEach(input => {
            if (input.type === 'radio' && input.checked) {
                selected.push(input.value);
            } else if (input.type === 'checkbox' && input.checked) {
                selected.push(input.value);
            }
        });
        
        return selected;
    }

    checkQuestion(question, selectedOptions) {
        if (question.type === 'single') {
            // Pour les questions à choix unique
            return selectedOptions.length === 1 && 
                   question.options.find(opt => opt.id === selectedOptions[0] && opt.correct);
        } else {
            // Pour les questions à choix multiples
            const correctOptions = question.options.filter(opt => opt.correct).map(opt => opt.id);
            const wrongOptions = question.options.filter(opt => !opt.correct).map(opt => opt.id);
            
            return correctOptions.every(opt => selectedOptions.includes(opt)) &&
                   wrongOptions.every(opt => !selectedOptions.includes(opt));
        }
    }    


    displayFeedback(questionId, isCorrect) {
        const feedback = document.getElementById(`feedback-${questionId}`);
        const options = document.querySelectorAll(`.qcm-option input[name="q${questionId}"]`);
        
        if (feedback) {
            feedback.className = `feedback ${isCorrect ? 'success' : 'error'}`;
            feedback.textContent = isCorrect ? 'Bonne réponse !' : 'Mauvaise réponse.';
            feedback.classList.add('show');
        }

        // Mettre en évidence les bonnes et mauvaises réponses
        options.forEach(input => {
            const optionDiv = input.closest('.qcm-option');
            if (optionDiv) {
                const option = this.questions.find(q => q.id === questionId)
                    .options.find(opt => opt.id === input.value);
                
                if (option.correct) {
                    optionDiv.classList.add('correct');
                } else if (input.checked) {
                    optionDiv.classList.add('wrong');
                }
            }
        });
    }

    displayFinalScore(percentage) {
        const resultDiv = document.getElementById('qcm-result');
        if (resultDiv) {
            const passed = percentage >= APP_CONFIG.PASSING_SCORE;
            resultDiv.innerHTML = `
                <div class="feedback ${passed ? 'success' : 'error'} show">
                    Score final: ${percentage}/100
                    ${passed ? '✅ Validé !' : '❌ À revoir'}
                </div>
            `;
        }
    }

    resetAnswers() {
        // Réinitialiser toutes les réponses
        const inputs = document.querySelectorAll('input[type="radio"], input[type="checkbox"]');
        inputs.forEach(input => input.checked = false);
        
        // Cacher les feedbacks
        const feedbacks = document.querySelectorAll('.feedback');
        feedbacks.forEach(fb => {
            fb.classList.remove('show');
            fb.textContent = '';
        });
        
        // Retirer les classes de correction
        const options = document.querySelectorAll('.qcm-option');
        options.forEach(opt => {
            opt.classList.remove('correct', 'wrong');
        });
        
        // Cacher le résultat final
        const resultDiv = document.getElementById('qcm-result');
        if (resultDiv) {
            resultDiv.innerHTML = '';
        }
    }

    getChapterIdFromUrl() {
        const path = window.location.pathname;
        const match = path.match(/chapitre(\d+)\.html/);
        return match ? parseInt(match[1]) : null;
    }
}

// ============================================================================
// INITIALISATION CENTRALISÉE
// ============================================================================

/**
 * Fonction d'initialisation principale de l'application
 * Fusionne tous les DOMContentLoaded en un seul point d'entrée
 */
function initializeApp() {
    console.log('🚀 Initialisation de l\'application...');
    
    // Initialiser le système de progression sur la page d'accueil
    if (document.body.classList.contains('home') || !document.body.classList.length) {
        initializeProgression();
    }
    
    // Initialiser le système de QCM sur les pages de chapitre
    if (window.location.pathname.includes('chapitre')) {
        initializeQCM();
        initializeStats();
        // Appliquer le mode chapitre (uniquement sur les pages de chapitre)
        applyChapterMode();
    }

    updateChapterProgress();

}

/**
 * Initialise le système de progression
 */
function initializeProgression() {
    new ProgressionSystem();
}

/**
 * Initialise le système de QCM
 */
function initializeQCM() {
    new QCMSystem();
}

/**
 * Initialise l'affichage des statistiques
 */
function initializeStats() {
    setTimeout(() => {
        addStatsDisplay();
    }, 200);
}

// Point d'entrée unique au chargement du DOM
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

// ========== NOUVELLES FONCTIONS DE GESTION DES RÉPONSES ==========

// Fonction principale de gestion des réponses
function handleAnswer(elementId, correctionType, correctAnswer, points, answerType, correctAnswersStr = '') {
    let userAnswer;
    let feedback = document.getElementById(`feedback_${elementId}`);
    
    // Récupérer la question correspondante via data-question-id
    const question = document.querySelector(`.question-section[data-question-id="${elementId}"]`);
    
    // Récupérer la réponse selon le type
    if (answerType === 'qcm') {
        const selected = document.querySelector(`input[name="qcm_${elementId}"]:checked`);
        if (!selected) {
            showFeedback(feedback, 'Veuillez sélectionner une réponse.', 'error');
            return false;
        }
        userAnswer = parseInt(selected.value);
    } else if (answerType === 'selection') {
        const selected = document.querySelectorAll(`input[name="qcm_${elementId}"]:checked`);
        userAnswer = Array.from(selected).map(input => parseInt(input.value)).sort();
    } else if (answerType === 'short') {
        const element = document.getElementById(`short_${elementId}`);
        if (!element || !element.value.trim()) {
            showFeedback(feedback, 'Veuillez saisir une réponse.', 'error');
            return false;
        }
        userAnswer = element.value.trim().toLowerCase();
    } else if (answerType === 'open') {
        const element = document.getElementById(`open_${elementId}`);
        if (!element || !element.value.trim()) {
            showFeedback(feedback, 'Veuillez écrire une réponse.', 'error');
            return false;
        }
        userAnswer = element.value.trim();
    }
    
    // Traitement selon le type de correction
    switch(correctionType) {
        case 'auto':
            return handleAutoCorrection(feedback, userAnswer, correctAnswer, points, answerType, elementId);
            
        case 'semi':
            return handleSemiCorrection(feedback, userAnswer, correctAnswer, points, answerType, correctAnswersStr, elementId);

        case 'manuel':
            return handleManualCorrection(feedback, userAnswer, elementId, points);
            
        case 'obligatoire':
            return handleRequiredCorrection(feedback, userAnswer, points);
            
        default:
            return handleAutoCorrection(feedback, userAnswer, correctAnswer, points, answerType, elementId);
    }
}

/**
 * Fonction utilitaire centralisée pour traiter le résultat d'une réponse
 * Réduit les duplications dans handleSelectAnswer et handleAutoCorrection
 */
function processAnswerResult({
    feedback,
    message,
    type,
    points = 0,
    shouldAwardPoints = false,
    answerId,
    answerValue,
    isCorrect = false,
    needsReview = false,
    trackerId = null,
    trackerPoints = 0,
    trackerSuccess = false
}) {
    showFeedback(feedback, message, type);

    if (shouldAwardPoints) {
        updateUserPoints(points);
    }

    if (answerId !== undefined) {
        saveAnswer(answerId, answerValue, isCorrect, needsReview);
    }

    if (trackerId) {
        attemptTracker.recordAttempt(trackerId, trackerPoints, trackerSuccess);
    }
}

function handleSelectAnswer(selectId, correctionType, correctIndex, points) {
    const select = document.getElementById(selectId);
    const selectedValue = select.value; 
    const questionId = selectId.replace('select_', '');
    const feedback = document.getElementById(`feedback_${questionId}`); 
    const fullQuestionId = `chapter_${attemptTracker.getCurrentChapterId()}_${questionId}`;
    const answerText = select.options[select.selectedIndex]?.text || '';
    
    // Vérifier si déjà validée
    if (attemptTracker.data[fullQuestionId] && attemptTracker.data[fullQuestionId].success) {
        showFeedback(feedback, 'Question déjà validée.', 'info');
        return true;
    }
    
    if (!selectedValue) {
        showFeedback(feedback, 'Veuillez sélectionner une réponse.', 'error');
        return false;
    }
    
    const userAnswer = parseInt(selectedValue);
    const isCorrect = userAnswer === correctIndex;
    
    switch(correctionType) {
        case 'auto':
            if (isCorrect) {
                processAnswerResult({
                    feedback, message: `✅ Correct ! +${points} point(s)`, type: 'success',
                    points, shouldAwardPoints: true,
                    answerId: selectId, answerValue: answerText, isCorrect: true,
                    trackerId: fullQuestionId, trackerPoints: points, trackerSuccess: true
                });
            } else {
                processAnswerResult({
                    feedback, message: '❌ Incorrect. Essayez encore !', type: 'error',
                    answerId: selectId, answerValue: answerText, isCorrect: false,
                    trackerId: fullQuestionId, trackerPoints: points, trackerSuccess: false
                });
            }
            break;
            
        case 'semi':
            if (isCorrect) {
                processAnswerResult({
                    feedback, message: `✅ Bonne réponse ! +${points} point(s)`, type: 'success',
                    points, shouldAwardPoints: true,
                    answerId: selectId, answerValue: answerText, isCorrect: true,
                    trackerId: fullQuestionId, trackerPoints: points, trackerSuccess: true
                });
            } else {
                processAnswerResult({
                    feedback, message: '⚠️ Réponse enregistrée. En attente de validation.', type: 'warning',
                    answerId: selectId, answerValue: answerText, isCorrect: false, needsReview: true,
                    trackerId: fullQuestionId, trackerPoints: points, trackerSuccess: false
                });
            }
            break;
            
        case 'manuel':
            processAnswerResult({
                feedback, message: `📝 Réponse enregistrée. +${points} point(s) après validation.`, type: 'info',
                answerId: selectId, answerValue: answerText, needsReview: true,
                trackerId: fullQuestionId, trackerPoints: points, trackerSuccess: false
            });
            break;
            
        case 'obligatoire':
            processAnswerResult({
                feedback, message: `✅ Réponse enregistrée. +${points} point(s)`, type: 'success',
                points, shouldAwardPoints: true,
                answerId: selectId, answerValue: answerText, isCorrect: true,
                trackerId: fullQuestionId, trackerPoints: points, trackerSuccess: true
            });
            break;
            
        default:
            if (isCorrect) {
                processAnswerResult({
                    feedback, message: `✅ Correct ! +${points} point(s)`, type: 'success',
                    points, shouldAwardPoints: true,
                    trackerId: fullQuestionId, trackerPoints: points, trackerSuccess: true
                });
            } else {
                processAnswerResult({
                    feedback, message: '❌ Incorrect.', type: 'error',
                    trackerId: fullQuestionId, trackerPoints: points, trackerSuccess: false
                });
            }
    }
    
    attemptTracker.displayStats();
    return isCorrect;
}

// Correction manuelle
// Utilise processAnswerResult pour réduire les duplications
function handleManualCorrection(feedback, userAnswer, elementId, points) {
    processAnswerResult({
        feedback,
        message: `📝 Réponse enregistrée. +${points} point(s) après validation du professeur.`,
        type: 'info',
        answerId: elementId,
        answerValue: userAnswer,
        needsReview: true
    });
    return true;
}

// Réponse obligatoire
// Utilise processAnswerResult pour réduire les duplications
function handleRequiredCorrection(feedback, userAnswer, points) {
    processAnswerResult({
        feedback,
        message: `✅ Réponse enregistrée. +${points} point(s) pour participation.`,
        type: 'success',
        points,
        shouldAwardPoints: true
    });
    return true;
}

// Sauvegarde des réponses
// Utilise STORAGE_KEYS et StorageService pour une meilleure maintenabilité
function saveAnswer(questionId, answer, isCorrect = false, needsReview = false) {
    const savedAnswers = StorageService.get(STORAGE_KEYS.USER_ANSWERS, {});
    
    savedAnswers[questionId] = {
        answer: answer,
        isCorrect: isCorrect,
        needsReview: needsReview,
        timestamp: new Date().toISOString(),
        chapter: $('h1')?.textContent || 'Chapitre inconnu'
    };
    
    StorageService.set(STORAGE_KEYS.USER_ANSWERS, savedAnswers);
}

// Mise à jour des points
// Utilise StorageService pour une meilleure maintenabilité
function updateUserPoints(points) {
    console.log('📊 updateUserPoints appelé avec', points, 'points');

    const userProgress = StorageService.get(STORAGE_KEYS.USER_PROGRESS, { totalPoints: 0, completedChapters: [] });
    
    userProgress.totalPoints = (userProgress.totalPoints || 0) + points;
    StorageService.set(STORAGE_KEYS.USER_PROGRESS, userProgress);
    updateProgressBar();
}

// Affichage des feedbacks
function showFeedback(element, message, type) {
    console.log("==>element, message, type: ",element, message, type)
    if (element) {
        element.textContent = message;
        element.className = `feedback show ${type}`;
        
        // Utilise APP_CONFIG pour une meilleure maintenabilité
        const duration = type === 'error'
            ? APP_CONFIG.ERROR_FEEDBACK_DURATION
            : APP_CONFIG.SUCCESS_FEEDBACK_DURATION;
        setTimeout(() => {
            element.classList.remove('show');
        }, duration);
    }
}

// Mise à jour de la barre de progression
// Utilise StorageService pour une meilleure maintenabilité
function updateProgressBar() {
    const progressFill = document.querySelector('.progress-fill');
    const progressText = document.querySelector('.progress-text');
    
    if (progressFill && progressText) {
        const progress = StorageService.get(STORAGE_KEYS.USER_PROGRESS);
        if (progress) {
            const percentage = Math.min((progress.totalPoints / 100) * 100, 100);
            progressFill.style.width = `${percentage}%`;
            progressText.textContent = `${Math.round(percentage)}% complété (${progress.totalPoints} points)`;
        }
    }
}

// Toggle pour les indications
function toggleHint(hintId) {
    const hint = document.getElementById(hintId);
    if (hint.style.display === 'none' || hint.style.display === '') {
        hint.style.display = 'block';
    } else {
        hint.style.display = 'none';
    }
}

/**
 * Utilitaire pour obtenir la configuration d'un chapitre
 * Utilise StorageService pour une meilleure maintenabilité
 */
function getChapterConfigById(chapterId) {
    const config = StorageService.get(STORAGE_KEYS.CHAPTER_CONFIG, {});
    return config[chapterId] || { locked: false, endDate: null, examMode: false };
}

function applyChapterMode() {
    // Récupérer l'ID du chapitre depuis l'URL
    const match = window.location.pathname.match(/chapitre(\d+)\.html/);
    const chapterId = match ? parseInt(match[1]) : null;
    
    if (!chapterId) {
        console.log('❌ Pas d\'ID de chapitre trouvé');
        return;
    }
    
    console.log('📌 Chapitre ID:', chapterId);
    
    // Utilise StorageService pour une meilleure maintenabilité
    const chapterConfig = getChapterConfigById(chapterId);
    console.log('📦 Configuration du chapitre:', chapterConfig);
    
    const globalBtn = document.querySelector('.global-validation');
    const allButtons = $$('.question-actions .btn-check-answer');
    
    // Si mode examen est activé
    if (chapterConfig.examMode === true) {
        console.log('🎯 MODE EXAMEN ACTIVÉ');
        
        // Cacher tous les boutons individuels
        allButtons.forEach(btn => {
            btn.style.display = 'none';
        });
        console.log(`🔘 ${allButtons.length} boutons individuels masqués`);
        
        // Afficher le bouton de validation globale
        if (globalBtn) {
            globalBtn.classList.remove('hidden');
            console.log('🔘 Bouton global AFFICHÉ');
        } else {
            console.log('❌ Bouton global non trouvé dans le DOM');
        }
    } else {
        console.log('📚 MODE NORMAL (examen désactivé)');
        
        // Afficher tous les boutons individuels
        allButtons.forEach(btn => {
            btn.style.display = 'block';
        });
        console.log(`🔘 ${allButtons.length} boutons individuels affichés`);
        
        // Cacher le bouton de validation globale
        if (globalBtn) {
            globalBtn.classList.add('hidden');
            console.log('🔘 Bouton global masqué');
        } else {
            console.log('❌ Bouton global non trouvé dans le DOM');
        }
    }
}

function handleOpenAnswer(elementId, correctionType, points, minLength) {
    const textarea = document.getElementById(elementId);
    const feedback = document.getElementById(`feedback_${elementId}`);
    const answer = textarea.value.trim();
    
    if (!answer) {
        showFeedback(feedback, 'Veuillez écrire une réponse.', 'error');
        return false;
    }
    
    if (minLength > 0 && answer.length < minLength) {
        showFeedback(feedback, `Votre réponse doit contenir au moins ${minLength} caractères. (${answer.length}/${minLength})`, 'error');
        return false;
    }
    
    if (correctionType === 'semi') {
        processAnswerResult({
            feedback,
            message: `✅ Réponse enregistrée (${answer.length} caractères). +${points} point(s)`,
            type: 'success',
            points,
            shouldAwardPoints: true,
            answerId: elementId,
            answerValue: answer,
            isCorrect: true
        });
    } else {
        processAnswerResult({
            feedback,
            message: `📝 Réponse enregistrée. En attente de validation.`,
            type: 'info',
            answerId: elementId,
            answerValue: answer,
            isCorrect: false,
            needsReview: true
        });
    }
    
    return true;
}


// Validation d'un cours (bouton "J'ai lu et compris")
function validateCourse(button) {
    // Désactiver le bouton après validation
    button.disabled = true;
    button.textContent = '✓ Validé';
    button.style.backgroundColor = '#27ae60';
    
    // Ajouter un feedback visuel
    const courseSection = button.closest('.course-content');
    if (courseSection) {
        const feedbackDiv = document.createElement('div');
        feedbackDiv.className = 'feedback success show';
        feedbackDiv.textContent = '✅ Cours marqué comme lu. Vous pouvez continuer.';
        feedbackDiv.style.marginTop = '1rem';
        courseSection.appendChild(feedbackDiv);
        
        // Supprimer le feedback après la durée configurée
        setTimeout(() => {
            feedbackDiv.remove();
        }, APP_CONFIG.SUCCESS_FEEDBACK_DURATION);
    }
    
    // Sauvegarder la progression du cours
    saveCourseProgress();
    
    // Mettre à jour la progression globale
    updateProgressBar();
}

// Sauvegarder la progression des cours
// Utilise StorageService pour une meilleure maintenabilité
function saveCourseProgress() {
    const progress = StorageService.get(STORAGE_KEYS.COURSE_READ_PROGRESS, { courses: {} });
    
    // Récupérer le titre du chapitre
    const chapterTitle = $('h1')?.textContent || 'Chapitre inconnu';
    
    if (!progress.courses[chapterTitle]) {
        progress.courses[chapterTitle] = [];
    }
    
    // Marquer le cours courant comme lu
    const currentCourse = $('.course-content .btn-secondary')?.closest('.course-content');
    if (currentCourse) {
        const courseIndex = Array.from($$('.course-content')).indexOf(currentCourse);
        progress.courses[chapterTitle][courseIndex] = {
            read: true,
            timestamp: new Date().toISOString()
        };
    }
    
    StorageService.set(STORAGE_KEYS.COURSE_READ_PROGRESS, progress);
    
    // Vérifier si tous les cours sont lus
    checkAllCoursesRead();
}

// Vérifier si tous les cours du chapitre sont lus
function checkAllCoursesRead() {
    const courses = document.querySelectorAll('.course-content');
    let allRead = true;
    
    courses.forEach(course => {
        const button = course.querySelector('.btn-secondary');
        if (button && !button.disabled) {
            allRead = false;
        }
    });
    
    if (allRead && courses.length > 0) {
        console.log('Tous les cours ont été lus');
        // Optionnel : afficher un message de félicitations
        const container = document.querySelector('.chapter-content');
        if (container) {
            const msgDiv = document.createElement('div');
            msgDiv.className = 'feedback success show';
            msgDiv.textContent = '🎉 Félicitations ! Vous avez lu tous les cours de ce chapitre.';
            msgDiv.style.margin = '1rem 0';
            msgDiv.style.textAlign = 'center';
            container.insertBefore(msgDiv, container.firstChild);
            
            setTimeout(() => {
                msgDiv.remove();
            }, APP_CONFIG.ERROR_FEEDBACK_DURATION);
        }
    }
}


// Fonction pour afficher le feedback individuel
function displayIndividualFeedback(question, isCorrect, hasAnswer) {
    let feedbackDiv = question.querySelector('.question-feedback');
    if (!feedbackDiv) {
        feedbackDiv = document.createElement('div');
        feedbackDiv.className = 'question-feedback';
        question.querySelector('.question-box').appendChild(feedbackDiv);
    }
    
    if (!hasAnswer) {
        feedbackDiv.textContent = '?';
        feedbackDiv.className = 'question-feedback unanswered';
    } else if (isCorrect) {
        feedbackDiv.textContent = '✓';
        feedbackDiv.className = 'question-feedback correct';
    } else {
        feedbackDiv.textContent = '✗';
        feedbackDiv.className = 'question-feedback incorrect';
    }
    
    feedbackDiv.style.cssText = 'position: absolute; right: 1rem; top: 1rem; font-size: 1.2rem; font-weight: bold;';
}

// Fonction centrale de vérification d'une question
function checkQuestion(question) {
    const correctionType = question.dataset.correctionType;
    const points = parseInt(question.dataset.points);
    
    // Récupérer la réponse
    let userAnswer = null;
    let hasAnswer = false;
    let isCorrect = false;
    
    const qcmRadio = question.querySelector('input[type="radio"]:checked');
    const qcmCheckbox = question.querySelectorAll('input[type="checkbox"]:checked');
    const shortInput = question.querySelector('input[type="text"], input[type="number"]');
    const openTextarea = question.querySelector('textarea');
    const select = question.querySelector('select');
    
    if (qcmRadio) {
        hasAnswer = true;
        userAnswer = parseInt(qcmRadio.value);
    } 
    else if (qcmCheckbox.length > 0) {
        hasAnswer = true;
        userAnswer = Array.from(qcmCheckbox).map(cb => parseInt(cb.value)).sort();
    }
    else if (shortInput && shortInput.value.trim()) {
        hasAnswer = true;
        userAnswer = shortInput.value.trim().toLowerCase();
    }
    else if (select && select.value) {
        hasAnswer = true;
        userAnswer = parseInt(select.value);
    }
    else if (openTextarea && openTextarea.value.trim()) {
        hasAnswer = true;
        userAnswer = openTextarea.value.trim();
    }
    
    if (!hasAnswer) {
        return { hasAnswer: false, isCorrect: false, points: 0, userAnswer: null };
    }
    
    // Vérifier selon le type de question et correction
    if (correctionType === 'auto') {
        // QCM à choix unique
        if (qcmRadio) {
            const button = question.querySelector('.btn-check-answer');
            const onclickAttr = button.getAttribute('onclick');
            const match = onclickAttr.match(/,\s*(\d+),/);
            if (match) {
                const correctAnswer = parseInt(match[1]);
                isCorrect = userAnswer === correctAnswer;
            }
        }
        // QCM à choix multiples
        else if (qcmCheckbox.length > 0) {
            const button = question.querySelector('.btn-check-answer');
            const onclickAttr = button.getAttribute('onclick');
            const match = onclickAttr.match(/\[(.*?)\]/);
            if (match) {
                const correctIndices = JSON.parse('[' + match[1] + ']');
                isCorrect = userAnswer.length === correctIndices.length &&
                           userAnswer.every((v, i) => v === correctIndices[i]);
            }
        }
        // Réponse courte
        else if (shortInput) {
            // Récupérer les bonnes réponses depuis l'attribut data ou depuis le onclick
            let correctAnswers = [];
            const button = question.querySelector('.btn-check-answer');
            const onclickAttr = button.getAttribute('onclick');
            // Chercher le dernier paramètre qui est une chaîne avec les réponses
            const match = onclickAttr.match(/, '([^']*)'\)$/);
            if (match && match[1]) {
                correctAnswers = match[1].split(';').map(s => s.trim().toLowerCase());
            }
            isCorrect = correctAnswers.includes(userAnswer);
        }
        // Liste déroulante
        else if (select) {
            const button = question.querySelector('.btn-check-answer');
            const onclickAttr = button.getAttribute('onclick');
            const match = onclickAttr.match(/,\s*(\d+),/);
            if (match) {
                const correctIndex = parseInt(match[1]);
                isCorrect = userAnswer === correctIndex;
            }
        }
    }
    else if (correctionType === 'semi') {
        if (shortInput) {
            let correctAnswers = [];
            const button = question.querySelector('.btn-check-answer');
            const onclickAttr = button.getAttribute('onclick');
            const match = onclickAttr.match(/, '([^']*)'\)$/);
            if (match && match[1]) {
                correctAnswers = match[1].split(';').map(s => s.trim().toLowerCase());
            }
            isCorrect = correctAnswers.includes(userAnswer);
        } else {
            // Pour les réponses ouvertes, on considère valide si réponse donnée
            isCorrect = true;
        }
    }
    else if (correctionType === 'manuel') {
        isCorrect = true; // Points pour participation
    }
    
    return { hasAnswer: true, isCorrect: isCorrect, points: points, userAnswer: userAnswer };
}

// Fonction unifiée pour la correction automatique d'une question
function autoCorrectQuestion(question, elementId, points, userAnswer, answerType, correctAnswer) {
    const result = checkQuestion(question);
    const feedback = document.getElementById(`feedback_${elementId}`);
    
    if (result.isCorrect) {
        showFeedback(feedback, `✅ Correct ! +${points} point(s)`, 'success');
        updateUserPoints(points);
        saveAnswer(elementId, result.userAnswer, true);
    } else {
        showFeedback(feedback, '❌ Incorrect. Essayez encore !', 'error');
        saveAnswer(elementId, result.userAnswer, false);
    }
    
    displayIndividualFeedback(question, result.isCorrect, true);
    return result.isCorrect;
}


// Correction semi-automatique
function handleSemiCorrection(feedback, userAnswer, correctAnswer, points, answerType, correctAnswersStr, elementId) {
    let isCorrect = false;
    let feedbackMessage = '';
    
    let possibleAnswers = [];
    if (correctAnswersStr) {
        possibleAnswers = correctAnswersStr.split(';').map(s => s.trim().toLowerCase());
    }
    
    if (answerType === 'short') {
        isCorrect = possibleAnswers.length > 0 && possibleAnswers.includes(userAnswer);
        
        if (isCorrect) {
            feedbackMessage = `✅ Bonne réponse ! +${points} point(s)`;
            updateUserPoints(points);
        } else if (possibleAnswers.length > 0) {
            // NE PAS RÉVÉLER LES RÉPONSES POSSIBLES
            feedbackMessage = `⚠️ Réponse incorrecte. Points à valider par le professeur.`;
        } else {
            feedbackMessage = `📝 Réponse enregistrée. En attente de validation par le professeur.`;
        }
    } else {
        feedbackMessage = `📝 Réponse enregistrée. En attente de validation par le professeur.`;
    }
    
    showFeedback(feedback, feedbackMessage, isCorrect ? 'success' : 'warning');
    saveAnswer(elementId, userAnswer, isCorrect, true);
    
    return isCorrect;
}



// Remplacer validateAllQuestions pour utiliser la fonction commune
function validateAllQuestions() {
    const questions = document.querySelectorAll('.question-section');
    let totalPoints = 0;
    let earnedPoints = 0;
    let unansweredQuestions = [];
    
    // Vérifier s'il y a des questions sans réponse
    questions.forEach(question => {
        const result = checkQuestion(question);
        if (!result.hasAnswer) {
            unansweredQuestions.push(question);
        }
    });
    
    const globalFeedback = document.getElementById('global-feedback');
    
    // Cas: Des questions sans réponse - demander confirmation
    if (unansweredQuestions.length > 0) {
        const confirmSubmit = confirm(
            `⚠️ Attention : ${unansweredQuestions.length} question(s) sans réponse.\n\n` +
            `Souhaitez-vous vraiment valider sans y répondre ?\n\n` +
            `Les réponses manquantes seront comptées comme incorrectes.`
        );
        
        if (!confirmSubmit) {
            // L'élève annule, on ne valide pas
            globalFeedback.className = 'feedback show warning';
            globalFeedback.innerHTML = `
                ⚠️ Validation annulée.<br>
                Veuillez répondre aux questions manquantes avant de valider.
            `;
            return false;
        }
        
        // L'élève confirme, on continue avec les réponses manquantes
        globalFeedback.innerHTML = '';
    }
    
    // Calculer le score (pour console.log uniquement)
    questions.forEach(question => {
        const points = parseInt(question.dataset.points);
        totalPoints += points;
        
        const result = checkQuestion(question);
        if (result.isCorrect) {
            earnedPoints += points;
        }
        
        // Sauvegarder la réponse
        saveAnswer(`global_${question.dataset.questionId}`, result.userAnswer || '(non répondue)', result.isCorrect, false);
    });
    
    const percentage = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
    
    // Affichage pour le développeur uniquement
    console.log('=== MODE EXAMEN - RÉSULTATS ===');
    console.log(`Score: ${earnedPoints}/${totalPoints} points (${percentage}%)`);
    console.log(`Questions sans réponse: ${unansweredQuestions.length}`);
    console.log('================================');
    
    // Feedback pour l'élève (ne donne pas le score)
    globalFeedback.className = 'feedback show info';
    if (unansweredQuestions.length > 0) {
        globalFeedback.innerHTML = `
            ✅ Validation terminée !<br>
            ${unansweredQuestions.length} question(s) sont restées sans réponse.<br>
            Vos réponses ont été enregistrées.<br>
            Vous ne pouvez plus modifier vos réponses.
        `;
    } else {
        globalFeedback.innerHTML = `
            ✅ Validation terminée !<br>
            Vos réponses ont été enregistrées.<br>
            Vous ne pouvez plus modifier vos réponses.
        `;
    }
    
    // Bloquer toutes les interactions (sauf les boutons de navigation)
    const allInputs = document.querySelectorAll('input, select, textarea, button');
    allInputs.forEach(input => {
        // Ne pas désactiver les boutons de navigation (retour au menu, chapitre suivant)
        const isNavButton = input.closest('.chapter-nav') || 
                           input.closest('.progress-actions') ||
                           input.classList.contains('btn-secondary') ||
                           (input.tagName === 'BUTTON' && input.textContent.includes('Retour au menu')) ||
                           (input.tagName === 'BUTTON' && input.textContent.includes('Chapitre'));
        
        if (!isNavButton) {
            input.disabled = true;
            input.style.pointerEvents = 'none';
            input.style.opacity = '0.7';
        }
    });
    
    // Sauvegarder la progression
    if (window.location.pathname.includes('chapitre')) {
        const match = window.location.pathname.match(/chapitre(\d+)\.html/);
        const chapterId = match ? parseInt(match[1]) : null;
        if (chapterId) {
            const progress = StorageService.get(STORAGE_KEYS.COURSE_PROGRESS, { chapters: {} });
            if (!progress.chapters) progress.chapters = {};
            
            progress.chapters[chapterId] = {
                completed: true,
                score: percentage,
                examModeValidated: true,
                unansweredCount: unansweredQuestions.length,
                timestamp: new Date().toISOString()
            };
            
            StorageService.set(STORAGE_KEYS.COURSE_PROGRESS, progress);
        }
    }
    
    return true;
}

function updateChapterProgress() {
    const totalQuestions = document.querySelectorAll('.question-section').length;
    const answeredQuestions = document.querySelectorAll('.question-section.completed').length;

    const totalCourses = document.querySelectorAll('.course-content').length;
    const completedCourses = document.querySelectorAll('.course-content.completed').length;

    const totalItems = totalQuestions + totalCourses;
    const completedItems = answeredQuestions + completedCourses;

    const percentage = totalItems > 0
        ? Math.round((completedItems / totalItems) * 100)
        : 0;

    const progressValue = document.getElementById('chapterProgressValue');

    if (progressValue) {
        progressValue.textContent = percentage;
    }
}


// Système de suivi des tentatives pour les questions auto-corrigées
// Système de suivi simplifié
// Système de suivi simplifié
class AttemptTracker {
    constructor() {
        this.data = {}; // { questionId: { points: 0, attempts: 0, success: false } }
        this.load();
    }
    
    // Utilise StorageService pour une meilleure maintenabilité
    load() {
        this.data = StorageService.get(STORAGE_KEYS.QUESTION_ATTEMPTS, {});
    }
    
    save() {
        StorageService.set(STORAGE_KEYS.QUESTION_ATTEMPTS, this.data);
    }
    
    // Initialiser le tracker avec toutes les questions auto-corrigées du chapitre
    initializeQuestions() {
        const questions = document.querySelectorAll('.question-section[data-correction-type="auto"]');
        
        console.log(`📊 Initialisation du tracker: ${questions.length} questions auto-corrigées trouvées`);
        
        questions.forEach(question => {
            const questionId = question.dataset.questionId;
            const points = parseInt(question.dataset.points);
            // UTILISE LE MÊME FORMAT QUE DANS handleAutoCorrection
            const fullQuestionId = `chapter_${this.getCurrentChapterId()}_${questionId}`;
            
            if (!this.data[fullQuestionId]) {
                this.data[fullQuestionId] = {
                    points: points,
                    attempts: 0,
                    success: false
                };
                console.log(`   ✅ Ajout: ${fullQuestionId} (${points} points)`);
            }
        });
        
        this.save();
    }

    recordAttempt(questionId, points, isCorrect) {
        // Ne pas créer automatiquement une entrée si elle n'existe pas
        if (!this.data[questionId]) {
            console.error(`❌ Question inconnue dans le tracker: ${questionId}`);
            console.log('   IDs existants:', Object.keys(this.data));
            return;
        }
        
        const q = this.data[questionId];
        
        if (!q.success) {
            q.attempts++;
            if (isCorrect) {
                q.success = true;
            }
            this.save();
        }
    }


    calculate() {
        let totalPointsAuto = 0;
        let earnedPointsAuto = 0;
        let penaltySum = 0;
        let totalQuestions = 0;
        let totalSuccessQuestions = 0;
        let firstAttemptSuccess = 0;
        let answeredQuestionsAuto = 0; // compteur pour avct_reponse_auto_corrige
        
        console.log('=== DONNÉES DES QUESTIONS AUTO-CORRIGÉES ===');
        
        for (const [id, q] of Object.entries(this.data)) {
            totalPointsAuto += q.points;
            totalQuestions++;

            if (q.attempts > 0) {
                answeredQuestionsAuto++;  // cette question a reçu au moins une réponse
            }
            
            if (q.success) {
                totalSuccessQuestions++;
                
                if (q.attempts === 1) {
                    firstAttemptSuccess++;
                }
                
                earnedPointsAuto += q.points;
                
                let pointsAfterPenalty = q.points - (q.attempts - 1) * q.points;
                let maxPenalty = q.points * 2;
                pointsAfterPenalty = Math.max(-maxPenalty, pointsAfterPenalty);

                penaltySum += pointsAfterPenalty;
                
                console.log(`Q${id}: ${q.points}pts, ${q.attempts} essais, points après pénalité=${pointsAfterPenalty}`);
            } else {
                penaltySum -= q.points;
                console.log(`Q${id}: ${q.points}pts, ${q.attempts} essais, NON RÉUSSIE → -${q.points}pts`);
            }
        }
        
        console.log('==========================================');
        console.log(`Points totaux (auto-corrigés): ${totalPointsAuto}`);
        console.log(`Points obtenus (auto-corrigés): ${earnedPointsAuto}`);
        console.log(`Somme (points - pénalité): ${penaltySum}`);
        
        const firstAttemptRate = totalSuccessQuestions > 0 
            ? Math.round((firstAttemptSuccess / totalSuccessQuestions) * 100) 
            : 0;
        
        let reussite = 0;
        if (totalPointsAuto > 0) {
            reussite = (penaltySum / totalPointsAuto) * 100;
            reussite = Math.max(-100, Math.min(100, reussite));
        }
        
        const noteMax = APP_CONFIG.MAX_NOTE;
        const p = reussite / 100;
        const note = noteMax * (1 + p) / 2;
        
        // % de bonnes réponses auto-corrigées
        const avct_bonne_reponse_auto_corrige = totalPointsAuto > 0 
            ? (earnedPointsAuto / totalPointsAuto) * 100 
            : 0;

        // % de questions auto-corrigées auxquelles on a donné une réponse
        const avct_reponse_auto_corrige = totalQuestions > 0 
            ? (answeredQuestionsAuto / totalQuestions) * 100 
            : 0;
        
        console.log(`% de réponses au premier essai (auto-corrigés) = ${firstAttemptRate}% (${firstAttemptSuccess}/${totalSuccessQuestions} questions réussies)`);
        console.log(`Avancement (bonnes réponses auto-corrigées) = ${avct_bonne_reponse_auto_corrige.toFixed(1)}%`);
        console.log(`Avancement (réponses données auto-corrigées) = ${avct_reponse_auto_corrige.toFixed(1)}%`);
        console.log(`reussite = ${reussite.toFixed(1)}% (p = ${p.toFixed(2)})`);
        console.log(`Note = ${noteMax} × (1 + ${p.toFixed(2)}) / 2 = ${note.toFixed(1)}/20`);
        console.log('==========================================');
        
        return {
            avct_bonne_reponse_auto_corrige: Math.round(avct_bonne_reponse_auto_corrige),
            avct_reponse_auto_corrige: Math.round(avct_reponse_auto_corrige),
            reussite: Math.round(reussite),
            note: note.toFixed(1),
            totalPointsAuto: totalPointsAuto,
            earnedPointsAuto: earnedPointsAuto,
            firstAttemptRate: firstAttemptRate,
            totalSuccessQuestions: totalSuccessQuestions,
            firstAttemptSuccess: firstAttemptSuccess
        };
    }


    displayStats() {
        const stats = this.calculate();
        
        const statsDiv = document.getElementById('auto-correct-stats');
        if (statsDiv) {
            // Utiliser directement firstAttemptRate pour le pourcentage de réussite au premier essai
            const firstAttemptRate = stats.firstAttemptRate || 0;
            
            let firstAttemptClass = '';
            if (firstAttemptRate >= APP_CONFIG.PASSING_SCORE) firstAttemptClass = 'high';
            else if (firstAttemptRate >= 50) firstAttemptClass = 'medium';
            else firstAttemptClass = 'low';
            
            // Calcul de l'accuracy à partir de stats.reussite (entre -100 et 100)
            // Formule: accuracy = (reussite + 100) / 2
            const accuracy = Math.round((stats.reussite + 100) / 2);
            
            let accuracyClass = '';
            if (accuracy > 60) accuracyClass = 'high';
            else if (accuracy >= 30) accuracyClass = 'medium';
            else accuracyClass = 'low';
            
            // Calcul des points obtenus à partir de la note sur 20
            // Note max = 20 correspond à totalPointsAuto (points des auto-corrigés)
            // Donc pointsObtenus = (note / 20) * totalPointsAuto
            const note = parseFloat(stats.note);
            const totalPointsAuto = stats.totalPointsAuto || 0;
            const pointsObtenus = totalPointsAuto > 0 ? Math.round((note / 20) * totalPointsAuto * 10) / 10 : 0;
            
            // Récupérer le total des points de tous les exercices du chapitre
            // On cherche tous les éléments .question-section et on additionne leurs data-points
            const allQuestions = document.querySelectorAll('.question-section');
            let totalChapterPoints = 0;
            allQuestions.forEach(question => {
                const points = parseInt(question.dataset.points);
                if (!isNaN(points)) {
                    totalChapterPoints += points;
                }
            });
            
            // Calcul du pourcentage de points obtenus pour la classe de couleur
            const pointsPercentage = totalChapterPoints > 0 ? (pointsObtenus / totalChapterPoints) * 100 : 0;
            let pointsClass = '';
            if (pointsPercentage >= 80) pointsClass = 'high';
            else if (pointsPercentage >= 50) pointsClass = 'medium';
            else pointsClass = 'low';
            
            statsDiv.innerHTML = `
                <div class="stats-card">
                    <h3>📊 Exercices auto-corrigés (${stats.totalPointsAuto} points attribuables sur ${totalChapterPoints} au total)</h3>
                    <div class="stats-grid">
                        <div class="stat-item" title="Pourcentage d’exercices auto‑corrigés répondus.">
                            <span>📈 Avancement</span>
                            <strong class="${stats.avct_reponse_auto_corrige >= APP_CONFIG.PASSING_SCORE ? 'high' : stats.avct_reponse_auto_corrige >= 50 ? 'medium' : 'low'}">${stats.avct_reponse_auto_corrige}%</strong>
                        </div>
                        <div class="stat-item" title="Taux de réussite au premier essai.">
                            <span>🥇 1er essai</span>
                            <strong class="${firstAttemptClass}">${firstAttemptRate}%</strong>
                        </div>
                        <div class="stat-item accuracy-item" title="Mesure la qualité des réponses en tenant compte du nombre d'essais. 100% signifie que toutes les réponses ont été correctes dès la première tentative; 0% indique un taux d'erreurs élevé, proche d'un comportement aléatoire.">
                            <span>🎯 Précision</span>
                            <strong class="${accuracyClass}">${accuracy}%</strong>
                        </div>
                        <div class="stat-item" title="Points obtenus sur le total des points attribués pour tous les exercices auto-corrigés du chapitre.">
                            <span>⭐ Points obtenus</span>
                            <strong class="${pointsClass}">${pointsObtenus}/${stats.totalPointsAuto}</strong>
                        </div>
                    </div>
                </div>
            `;

        }
    }
    getCurrentChapterId() {
        const match = window.location.pathname.match(/chapitre(\d+)\.html/);
        return match ? match[1] : 'unknown';
    }    
}

// Initialiser le tracker
const attemptTracker = new AttemptTracker();

// Ajouter l'affichage des stats dans la page
function addStatsDisplay() {
    let statsContainer = document.getElementById('auto-correct-stats');
    if (!statsContainer) {
        statsContainer = document.createElement('div');
        statsContainer.id = 'auto-correct-stats';
        statsContainer.className = 'stats-container';
        
        const progressBar = document.querySelector('.progress-overview');
        if (progressBar) {
            progressBar.after(statsContainer);
        } else {
            const mainContent = document.querySelector('.chapter-content');
            if (mainContent) {
                mainContent.before(statsContainer);
            }
        }
    }
    
    // Initialiser les questions auto-corrigées dans le tracker
    attemptTracker.initializeQuestions();
    
    attemptTracker.displayStats();
}

// Modifier handleAutoCorrection pour suivre les tentatives
// Utilise processAnswerResult pour réduire les duplications
function handleAutoCorrection(feedback, userAnswer, correctAnswer, points, answerType, elementId) {
    // Trouver la question via data-question-id
    const question = document.querySelector(`.question-section[data-question-id="${elementId}"]`);
    const fullQuestionId = `chapter_${attemptTracker.getCurrentChapterId()}_${elementId}`;
    
    // Vérifier si déjà validée
    if (attemptTracker.data[fullQuestionId] && attemptTracker.data[fullQuestionId].success) {
        showFeedback(feedback, 'Question déjà validée.', 'info');
        return true;
    }
    
    if (question) {
        const result = checkQuestion(question);
        console.log("result vers feedback:",result.isCorrect)
        if (result.isCorrect) {
            console.log('✅ Points à ajouter:', points);
            processAnswerResult({
                feedback, message: `✅ Correct ! +${points} point(s)`, type: 'success',
                points, shouldAwardPoints: true,
                answerId: elementId, answerValue: result.userAnswer, isCorrect: true,
                trackerId: fullQuestionId, trackerPoints: points, trackerSuccess: true
            });
        } else {
            processAnswerResult({
                feedback, message: '❌ Incorrect. Essayez encore !', type: 'error',
                answerId: elementId, answerValue: result.userAnswer, isCorrect: false,
                trackerId: fullQuestionId, trackerPoints: points, trackerSuccess: false
            });
        }
        
        displayIndividualFeedback(question, result.isCorrect, true);
        attemptTracker.displayStats();

        return result.isCorrect;
    }
    
    // Fallback si question non trouvée
    let isCorrect = false;
    if (answerType === 'qcm') {
        isCorrect = userAnswer === correctAnswer;
    } else if (answerType === 'selection') {
        const expected = [...correctAnswer].sort();
        isCorrect = userAnswer.length === expected.length && 
                    userAnswer.every((val, idx) => val === expected[idx]);
    } else if (answerType === 'short') {
        const correctList = correctAnswer ? String(correctAnswer).split(';').map(s => s.trim().toLowerCase()) : [];
        isCorrect = correctList.length > 0 && correctList.includes(userAnswer);
    }
    
    if (isCorrect) {
        processAnswerResult({
            feedback, message: `✅ Correct ! +${points} point(s)`, type: 'success',
            points, shouldAwardPoints: true,
            answerId: elementId, answerValue: userAnswer, isCorrect: true,
            trackerId: fullQuestionId, trackerPoints: points, trackerSuccess: true
        });
    } else {
        processAnswerResult({
            feedback, message: '❌ Incorrect. Essayez encore !', type: 'error',
            answerId: elementId, answerValue: userAnswer, isCorrect: false,
            trackerId: fullQuestionId, trackerPoints: points, trackerSuccess: false
        });
    }
    
    attemptTracker.displayStats();

    return isCorrect;
}


// Export pour utilisation dans les pages de chapitre
window.ProgressionSystem = ProgressionSystem;
window.QCMSystem = QCMSystem;
window.toggleHint = toggleHint;
window.handleAnswer = handleAnswer;
window.handleSelectAnswer = handleSelectAnswer;
window.updateProgressBar = updateProgressBar;
window.handleOpenAnswer = handleOpenAnswer;
window.validateAllQuestions = validateAllQuestions;
window.validateCourse = validateCourse;