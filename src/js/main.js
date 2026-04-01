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
            const data = localStorage.getItem('course_progress');
            if (!data) {
                return {
                    chapters: {},
                    scores: {},
                    totalCompleted: 0
                };
            }
            return JSON.parse(data);
        }
    }

    saveProgress(progress) {
        if (this.auth && this.auth.currentStudent) {
            this.auth.saveStudentProgress(progress);
        } else {
            localStorage.setItem('course_progress', JSON.stringify(progress));
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
    getChapterConfig(chapterId) {
        const config = localStorage.getItem('chapter_config');
        if (!config) {
            return { locked: false, endDate: null };
        }
        const chapterConfig = JSON.parse(config);
        return chapterConfig[chapterId] || { locked: false, endDate: null };
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

        // Validation si score >= 80%
        if (score >= 80) {
            progress.chapters[chapterId].completed = true;
        }

        this.saveProgress(progress);
        this.updateProgress();
        this.updateChapterStatus();
        
        return progress.chapters[chapterId].completed;
    }

    // Réinitialisation
    resetProgress() {
        if (confirm('Êtes-vous sûr de vouloir réinitialiser toute votre progression ?')) {
            localStorage.removeItem('course_progress');
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
            resultDiv.innerHTML = `
                <div class="feedback ${percentage >= 80 ? 'success' : 'error'} show">
                    Score final: ${percentage}/100
                    ${percentage >= 80 ? '✅ Validé !' : '❌ À revoir'}
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

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    // Initialiser le système de progression sur la page d'accueil
    if (document.body.classList.contains('home') || !document.body.classList.length) {
        new ProgressionSystem();
    }
    
    // Initialiser le système de QCM sur les pages de chapitre
    if (window.location.pathname.includes('chapitre')) {
        new QCMSystem();
    }

    // Ajouter l'affichage des stats sur les pages de chapitre
    if (window.location.pathname.includes('chapitre')) {
        setTimeout(() => {
            addStatsDisplay();
        }, 200);
    }
    
    // Appliquer le mode chapitre
    console.log('🚀 DOM chargé, application du mode chapitre...');
    setTimeout(() => {
        applyChapterMode();
    }, 100);
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

function handleSelectAnswer(selectId, correctionType, correctIndex, points) {
    const select = document.getElementById(selectId);
    const selectedValue = select.value; 
    const questionId = selectId.replace('select_', '');
    const feedback = document.getElementById(`feedback_${questionId}`); 
    const fullQuestionId = `chapter_${attemptTracker.getCurrentChapterId()}_${questionId}`;
    
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
                showFeedback(feedback, `✅ Correct ! +${points} point(s)`, 'success');
                updateUserPoints(points);
                saveAnswer(selectId, select.options[select.selectedIndex].text, true);
                attemptTracker.recordAttempt(fullQuestionId, points, true);
            } else {
                showFeedback(feedback, '❌ Incorrect. Essayez encore !', 'error');
                saveAnswer(selectId, select.options[select.selectedIndex].text, false);
                attemptTracker.recordAttempt(fullQuestionId, points, false);
            }
            break;
            
        case 'semi':
            if (isCorrect) {
                showFeedback(feedback, `✅ Bonne réponse ! +${points} point(s)`, 'success');
                updateUserPoints(points);
                saveAnswer(selectId, select.options[select.selectedIndex].text, true);
                attemptTracker.recordAttempt(fullQuestionId, points, true);
            } else {
                showFeedback(feedback, `⚠️ Réponse enregistrée. En attente de validation.`, 'warning');
                saveAnswer(selectId, select.options[select.selectedIndex].text, false, true);
                attemptTracker.recordAttempt(fullQuestionId, points, false);
            }
            break;
            
        case 'manuel':
            showFeedback(feedback, `📝 Réponse enregistrée. +${points} point(s) après validation.`, 'info');
            saveAnswer(selectId, select.options[select.selectedIndex].text, false, true);
            attemptTracker.recordAttempt(fullQuestionId, points, false);
            break;
            
        case 'obligatoire':
            showFeedback(feedback, `✅ Réponse enregistrée. +${points} point(s)`, 'success');
            updateUserPoints(points);
            saveAnswer(selectId, select.options[select.selectedIndex].text, true);
            attemptTracker.recordAttempt(fullQuestionId, points, true);
            break;
            
        default:
            if (isCorrect) {
                showFeedback(feedback, `✅ Correct ! +${points} point(s)`, 'success');
                updateUserPoints(points);
                attemptTracker.recordAttempt(fullQuestionId, points, true);
            } else {
                showFeedback(feedback, '❌ Incorrect.', 'error');
                attemptTracker.recordAttempt(fullQuestionId, points, false);
            }
    }
    
    attemptTracker.displayStats();
    return isCorrect;
}

// Correction manuelle
function handleManualCorrection(feedback, userAnswer, elementId, points) {

    showFeedback(feedback, `📝 Réponse enregistrée. +${points} point(s) après validation du professeur.`, 'info');
    saveAnswer(elementId, userAnswer, false, true);
    return true;
}

// Réponse obligatoire
function handleRequiredCorrection(feedback, userAnswer, points) {
    showFeedback(feedback, `✅ Réponse enregistrée. +${points} point(s) pour participation.`, 'success');
    updateUserPoints(points);
    return true;
}

// Sauvegarde des réponses
function saveAnswer(questionId, answer, isCorrect = false, needsReview = false) {
    let savedAnswers = localStorage.getItem('userAnswers');
    if (!savedAnswers) {
        savedAnswers = {};
    } else {
        savedAnswers = JSON.parse(savedAnswers);
    }
    
    savedAnswers[questionId] = {
        answer: answer,
        isCorrect: isCorrect,
        needsReview: needsReview,
        timestamp: new Date().toISOString(),
        chapter: document.querySelector('h1')?.textContent || 'Chapitre inconnu'
    };
    
    localStorage.setItem('userAnswers', JSON.stringify(savedAnswers));
}

// Mise à jour des points
function updateUserPoints(points) {
    console.log('📊 updateUserPoints appelé avec', points, 'points');

    let userProgress = localStorage.getItem('userProgress');
    if (!userProgress) {
        userProgress = { totalPoints: 0, completedChapters: [] };
    } else {
        userProgress = JSON.parse(userProgress);
    }
    
    userProgress.totalPoints = (userProgress.totalPoints || 0) + points;
    localStorage.setItem('userProgress', JSON.stringify(userProgress));
    updateProgressBar();
}

// Affichage des feedbacks
function showFeedback(element, message, type) {
    console.log("==>element, message, type: ",element, message, type)
    if (element) {
        element.textContent = message;
        element.className = `feedback show ${type}`;
        
        const duration = type === 'error' ? 5000 : 3000;
        setTimeout(() => {
            element.classList.remove('show');
        }, duration);
    }
}

// Mise à jour de la barre de progression
function updateProgressBar() {
    const progressFill = document.querySelector('.progress-fill');
    const progressText = document.querySelector('.progress-text');
    
    if (progressFill && progressText) {
        const progress = localStorage.getItem('userProgress');
        if (progress) {
            const data = JSON.parse(progress);
            const percentage = Math.min((data.totalPoints / 100) * 100, 100);
            progressFill.style.width = `${percentage}%`;
            progressText.textContent = `${Math.round(percentage)}% complété (${data.totalPoints} points)`;
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
function applyChapterMode() {
    // Récupérer l'ID du chapitre depuis l'URL
    const match = window.location.pathname.match(/chapitre(\d+)\.html/);
    const chapterId = match ? parseInt(match[1]) : null;
    
    if (!chapterId) {
        console.log('❌ Pas d\'ID de chapitre trouvé');
        return;
    }
    
    console.log('📌 Chapitre ID:', chapterId);
    
    // Récupérer la configuration du chapitre
    const chapterConfig = localStorage.getItem('chapter_config');
    console.log('📦 Configuration brute:', chapterConfig);
    
    if (!chapterConfig) {
        console.log('⚠️ Pas de configuration trouvée, mode normal par défaut');
        // Mode normal par défaut
        const globalBtn = document.querySelector('.global-validation');
        if (globalBtn) {
            globalBtn.classList.add('hidden');
            console.log('🔘 Bouton global caché (mode normal par défaut)');
        }
        
        const allButtons = document.querySelectorAll('.question-actions .btn-check-answer');
        allButtons.forEach(btn => {
            btn.style.display = 'block';
        });
        console.log(`🔘 ${allButtons.length} boutons individuels affichés`);
        return;
    }
    
    const config = JSON.parse(chapterConfig);
    const chapter = config[chapterId];
    
    console.log('⚙️ Configuration du chapitre:', chapter);
    
    const globalBtn = document.querySelector('.global-validation');
    const allButtons = document.querySelectorAll('.question-actions .btn-check-answer');
    
    // Si mode examen est activé
    if (chapter && chapter.examMode === true) {
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

// Appeler au chargement de la page
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 DOM chargé, application du mode chapitre...');
    setTimeout(() => {
        applyChapterMode();
    }, 100);
});



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
        showFeedback(feedback, `✅ Réponse enregistrée (${answer.length} caractères). +${points} point(s)`, 'success');
        updateUserPoints(points);
        saveAnswer(elementId, answer, true);
    } else {
        showFeedback(feedback, `📝 Réponse enregistrée. En attente de validation.`, 'info');
        saveAnswer(elementId, answer, false, true);
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
        
        // Supprimer le feedback après 3 secondes
        setTimeout(() => {
            feedbackDiv.remove();
        }, 3000);
    }
    
    // Sauvegarder la progression du cours
    saveCourseProgress();
    
    // Mettre à jour la progression globale
    updateProgressBar();
}

// Sauvegarder la progression des cours
function saveCourseProgress() {
    let progress = localStorage.getItem('courseProgress');
    if (!progress) {
        progress = { courses: {} };
    } else {
        progress = JSON.parse(progress);
    }
    
    // Récupérer le titre du chapitre
    const chapterTitle = document.querySelector('h1')?.textContent || 'Chapitre inconnu';
    
    if (!progress.courses[chapterTitle]) {
        progress.courses[chapterTitle] = [];
    }
    
    // Marquer le cours courant comme lu
    const currentCourse = document.querySelector('.course-content .btn-secondary')?.closest('.course-content');
    if (currentCourse) {
        const courseIndex = Array.from(document.querySelectorAll('.course-content')).indexOf(currentCourse);
        progress.courses[chapterTitle][courseIndex] = {
            read: true,
            timestamp: new Date().toISOString()
        };
    }
    
    localStorage.setItem('courseProgress', JSON.stringify(progress));
    
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
            }, 5000);
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
            let progress = localStorage.getItem('course_progress');
            if (!progress) {
                progress = { chapters: {} };
            } else {
                progress = JSON.parse(progress);
            }
            if (!progress.chapters) progress.chapters = {};
            
            progress.chapters[chapterId] = {
                completed: true,
                score: percentage,
                examModeValidated: true,
                unansweredCount: unansweredQuestions.length,
                timestamp: new Date().toISOString()
            };
            
            localStorage.setItem('course_progress', JSON.stringify(progress));
        }
    }
    
    return true;
}


// Système de suivi des tentatives pour les questions auto-corrigées
// Système de suivi simplifié
// Système de suivi simplifié
class AttemptTracker {
    constructor() {
        this.data = {}; // { questionId: { points: 0, attempts: 0, success: false } }
        this.load();
    }
    
    load() {
        const saved = localStorage.getItem('question_attempts');
        if (saved) {
            this.data = JSON.parse(saved);
        }
    }
    
    save() {
        localStorage.setItem('question_attempts', JSON.stringify(this.data));
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
        
        console.log('=== DONNÉES DES QUESTIONS AUTO-CORRIGÉES ===');
        
        for (const [id, q] of Object.entries(this.data)) {
            totalPointsAuto += q.points;
            
            if (q.success) {
                earnedPointsAuto += q.points;
                
                // Pénalité : chaque essai infructueux avant la réussite retire des points
            let pointsAfterPenalty = q.points - (q.attempts - 1) * q.points;
            let maxPenalty = q.points * 2;  // Pénalité max = 2×points
            pointsAfterPenalty = Math.max(-maxPenalty, pointsAfterPenalty);
                
                console.log(`Q${id}: ${q.points}pts, ${q.attempts} essais, points après pénalité=${pointsAfterPenalty}`);
            } else {
                // Question jamais réussie = -points
                penaltySum -= q.points;
                console.log(`Q${id}: ${q.points}pts, ${q.attempts} essais, NON RÉUSSIE → -${q.points}pts`);
            }
        } // ← Cette accolade ferme la boucle for
        
        console.log('==========================================');
        console.log(`Points totaux (auto-corrigés): ${totalPointsAuto}`);
        console.log(`Points obtenus (auto-corrigés): ${earnedPointsAuto}`);
        console.log(`Somme (points - pénalité): ${penaltySum}`);
        
        // Calcul du pourcentage de réussite au premier essai (entre -100% et +100%)
        let reussite = 0;
        if (totalPointsAuto > 0) {
            reussite = (penaltySum / totalPointsAuto) * 100;
            reussite = Math.max(-100, Math.min(100, reussite));
        }
        
        // Formule de la note: N * (1 + p) / 2
        const noteMax = 20;
        const p = reussite / 100;
        const note = noteMax * (1 + p) / 2;
        
        // Calcul de l'avancement (sur les auto-corrigées uniquement)
        const avct = totalPointsAuto > 0 ? (earnedPointsAuto / totalPointsAuto) * 100 : 0;
        
        console.log(`Avancement (auto-corrigés) = ${avct.toFixed(1)}%`);
        console.log(`reussite = ${reussite.toFixed(1)}% (p = ${p.toFixed(2)})`);
        console.log(`Note = ${noteMax} × (1 + ${p.toFixed(2)}) / 2 = ${note.toFixed(1)}/20`);
        console.log('==========================================');
        
        return {
            avct: Math.round(avct),
            reussite: Math.round(reussite),
            note: note.toFixed(1),
            totalPointsAuto: totalPointsAuto,
            earnedPointsAuto: earnedPointsAuto
        };
    }
    
    displayStats() {
        const stats = this.calculate();
        
        const statsDiv = document.getElementById('auto-correct-stats');
        if (statsDiv) {
            // Projeter reussite de [-100,100] vers [0,100]
            const displayedReussite = Math.round((stats.reussite + 100) / 2);
            
            let reussiteClass = '';
            if (displayedReussite >= 80) reussiteClass = 'high';
            else if (displayedReussite >= 50) reussiteClass = 'medium';
            else reussiteClass = 'low';
            
            statsDiv.innerHTML = `
                <div class="stats-card">
                    <h3>📊 Exercices auto-corrigés</h3>
                    <div class="stats-grid">
                        <div class="stat-item">
                            <span>📈 Avancement</span>
                            <strong class="${stats.avct >= 80 ? 'high' : stats.avct >= 50 ? 'medium' : 'low'}">${stats.avct}%</strong>
                        </div>
                        <div class="stat-item">
                            <span>🎯 1er essai</span>
                            <strong class="${reussiteClass}">${displayedReussite}%</strong>
                        </div>
                        <div class="stat-item">
                            <span>⭐ Note</span>
                            <strong class="${stats.note >= 12 ? 'high' : stats.note >= 8 ? 'medium' : 'low'}">${stats.note}/20</strong>
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
            showFeedback(feedback, `✅ Correct ! +${points} point(s)`, 'success');
            updateUserPoints(points);
            saveAnswer(elementId, result.userAnswer, true);
            attemptTracker.recordAttempt(fullQuestionId, points, true);
        } else {
            showFeedback(feedback, '❌ Incorrect. Essayez encore !', 'error');
            saveAnswer(elementId, result.userAnswer, false);
            attemptTracker.recordAttempt(fullQuestionId, points, false);
        }
        
        displayIndividualFeedback(question, result.isCorrect, true);
        // Après attemptTracker.recordAttempt
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
        showFeedback(feedback, `✅ Correct ! +${points} point(s)`, 'success');
        updateUserPoints(points);
        saveAnswer(elementId, userAnswer, true);
        attemptTracker.recordAttempt(fullQuestionId, points, true);
    } else {
        showFeedback(feedback, '❌ Incorrect. Essayez encore !', 'error');
        saveAnswer(elementId, userAnswer, false);
        attemptTracker.recordAttempt(fullQuestionId, points, false);
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