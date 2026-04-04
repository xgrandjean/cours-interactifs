// ============================================================================
// MAIN.JS - Code générique de l'application
// ============================================================================
// Ce fichier contient le code partagé entre toutes les pages (accueil, 
// chapitres, espace professeur, etc.). Les fonctionnalités spécifiques
// aux chapitres sont dans chapitre.js.
// ============================================================================

// Note: STORAGE_KEYS, APP_CONFIG, storage, et StorageService sont définis dans storage.js
// et doivent être chargés avant main.js

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
        
        this.auth = new DataStorage();
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

// ============================================================================
// SYSTÈME DE QCM
// ============================================================================

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
                const auth = new DataStorage();
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
                <div class="feedback ${passed ? 'success' : 'error' } show">
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
// FONCTIONS PARTAGÉES (utilisées par main.js et chapitre.js)
// ============================================================================

/**
 * Sauvegarde des réponses
 * Utilise StorageService pour une meilleure maintenabilité
 */
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

/**
 * Mise à jour des points
 * Utilise StorageService pour une meilleure maintenabilité
 */
function updateUserPoints(points) {
    console.log('📊 updateUserPoints appelé avec', points, 'points');

    const userProgress = StorageService.get(STORAGE_KEYS.USER_PROGRESS, { totalPoints: 0, completedChapters: [] });
    
    userProgress.totalPoints = (userProgress.totalPoints || 0) + points;
    StorageService.set(STORAGE_KEYS.USER_PROGRESS, userProgress);
    updateProgressBar();
}

/**
 * Affichage des feedbacks
 */
function showFeedback(element, message, type) {
    console.log("==>element, message, type: ", element, message, type);
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

/**
 * Mise à jour de la barre de progression
 * Utilise StorageService pour une meilleure maintenabilité
 */
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

/**
 * Toggle pour les indications
 */
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
    
    // Sur les pages de chapitre, l'initialisation est gérée par chapitre.js
    // qui sera chargé après main.js
}

/**
 * Initialise le système de progression
 */
function initializeProgression() {
    new ProgressionSystem();
}

// Point d'entrée unique au chargement du DOM
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

// ============================================================================
// EXPORTS GLOBAUX
// ============================================================================

window.ProgressionSystem = ProgressionSystem;
window.QCMSystem = QCMSystem;
window.$ = $;
window.$$ = $$;
window.saveAnswer = saveAnswer;
window.updateUserPoints = updateUserPoints;
window.showFeedback = showFeedback;
window.updateProgressBar = updateProgressBar;
window.toggleHint = toggleHint;
window.getChapterConfigById = getChapterConfigById;

// Note: storage, STORAGE_KEYS, APP_CONFIG, et StorageService sont exportés par storage.js

console.log('✅ main.js chargé - Code générique actif');
