/**
 * progressManager.js - Gestion centralisée de la progression des étudiants
 * 
 * Ce fichier fournit une interface unifiée pour stocker et récupérer la progression
 * des étudiants selon la structure standard définie dans PROGRESSION_FORMAT.md
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const ALLOW_MULTIPLE_ATTEMPTS = true; // Autoriser plusieurs tentatives par question

// ============================================================================
// CONSTANTES DE STOCKAGE
// ============================================================================

const PROGRESS_STORAGE_KEY = 'student_progress';

// ============================================================================
// FONCTIONS UTILITAIRES
// ============================================================================

/**
 * Récupère l'ID du chapitre courant depuis l'URL
 * @returns {string|null} L'ID du chapitre ou null
 */
function getCurrentChapterId() {
    const match = window.location.pathname.match(/chapitre(\d+)\.html/);
    return match ? match[1] : null;
}

/**
 * Récupère l'ID de l'étudiant courant
 * @returns {string|null} L'ID de l'étudiant ou null
 */
function getCurrentStudentId() {
    // Essayer de récupérer depuis dataStorage d'abord
    if (typeof StorageService !== 'undefined') {
        const authData = StorageService.get(STORAGE_KEYS.AUTH_DATA, null);
        if (authData && authData.id) {
            return authData.id;
        }
    }
    
    // Fallback: vérifier dans l'URL ou un paramètre
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('studentId')) {
        return urlParams.get('studentId');
    }
    
    // Dernier fallback: utiliser un ID par défaut
    return 'anonymous';
}

/**
 * Récupère la progression d'un étudiant depuis le stockage
 * @param {string} studentId - L'ID de l'étudiant
 * @returns {Promise<Object|null>} La progression ou null
 */
async function loadProgress(studentId) {
    const key = `student_${studentId}_progress`;
    try {
        const data = await storage.get(key);
        return data || null;
    } catch (e) {
        console.error('❌ Erreur lors du chargement de la progression:', e);
        return null;
    }
}

/**
 * Sauvegarde la progression d'un étudiant dans le stockage
 * @param {string} studentId - L'ID de l'étudiant
 * @param {Object} progress - La progression à sauvegarder
 */
async function saveProgress(studentId, progress) {
    const key = `student_${studentId}_progress`;
    try {
        progress.lastUpdated = new Date().toISOString();
        await storage.set(key, progress);
    } catch (e) {
        console.error('❌ Erreur lors de la sauvegarde de la progression:', e);
    }
}

/**
 * Initialise une nouvelle progression pour un étudiant
 * @param {string} studentId - L'ID de l'étudiant
 * @param {string} studentName - Le nom de l'étudiant
 * @param {string} contentHash - Le hash du contenu des chapitres
 * @returns {Object} La nouvelle progression
 */
function initProgress(studentId, studentName, contentHash) {
    return {
        studentId,
        studentName,
        contentHash,
        startedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        completedChapters: 0,
        totalScore: 0,
        chapters: {}
    };
}

/**
 * Initialise un chapitre dans la progression
 * @param {Object} chapterConfig - La configuration du chapitre depuis chapters_index.json
 * @returns {Object} La structure du chapitre initialisée
 */
function initChapter(chapterConfig) {
    const now = new Date().toISOString();
    const questions = {};
    const questionCount = chapterConfig.questions ? chapterConfig.questions.length : 0;
    
    if (chapterConfig.questions) {
        chapterConfig.questions.forEach(q => {
            questions[q.id] = initQuestion(q);
        });
    }
    
    return {
        status: "not_started",
        score: 0,
        maxScore: chapterConfig.maxPoints || 0,
        questionCount,
        answeredQuestions: 0,
        completionPercent: 0,
        chapterHash: chapterConfig.chapterHash || null,
        isLocked: false,
        unlockedAt: null,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        questions
    };
}

/**
 * Initialise une question dans la progression
 * @param {Object} questionConfig - La configuration de la question depuis chapters_index.json
 * @returns {Object} La structure de la question initialisée
 */
function initQuestion(questionConfig) {
    const now = new Date().toISOString();
    return {
        questionHash: questionConfig.questionHash || null,
        answered: false,
        answer: null,
        isCorrect: null,
        score: 0,
        attempts: 0,
        attemptHistory: [],
        answeredAt: null,
        createdAt: now,
        updatedAt: now,
        needsManualCorrection: questionConfig.type === 'ouverte',
        manualCorrectionStatus: "none"
    };
}

/**
 * Obtient ou crée la progression d'un étudiant
 * @param {string} studentId - L'ID de l'étudiant
 * @param {string} studentName - Le nom de l'étudiant
 * @param {Object} chaptersConfig - La configuration des chapitres
 * @returns {Promise<Object>} La progression
 */
async function getOrCreateStudentProgress(studentId, studentName, chaptersConfig) {
    let progress = await loadProgress(studentId);
    
    if (!progress) {
        progress = initProgress(studentId, studentName, chaptersConfig.contentHash || null);
        await saveProgress(studentId, progress);
    }
    
    // Mettre à jour le contentHash si nécessaire
    if (chaptersConfig.contentHash && progress.contentHash !== chaptersConfig.contentHash) {
        console.log('⚠️ contentHash différent - migration nécessaire');
    }
    
    return progress;
}

/**
 * Enregistre une réponse à une question
 * @param {Object} progress - La progression de l'étudiant
 * @param {string|number} chapterId - L'ID du chapitre
 * @param {string} questionId - L'ID de la question (ex: "ch1_q1")
 * @param {any} userAnswer - La réponse de l'utilisateur
 * @param {boolean} isCorrect - Si la réponse est correcte
 * @param {number} score - Le score obtenu
 * @returns {Object} La progression mise à jour
 */
function recordAnswer(progress, chapterId, questionId, userAnswer, isCorrect, score) {
    const chapter = progress.chapters[chapterId];
    if (!chapter) {
        console.error(`❌ Chapitre ${chapterId} introuvable dans la progression`);
        return progress;
    }
    
    const question = chapter.questions[questionId];
    if (!question) {
        console.error(`❌ Question ${questionId} introuvable dans le chapitre ${chapterId}`);
        return progress;
    }
    
    const now = new Date().toISOString();
    
    // Si on n'autorise pas les tentatives multiples et que la question est déjà correcte
    if (!ALLOW_MULTIPLE_ATTEMPTS && question.isCorrect === true) {
        console.log('ℹ️ Question déjà correcte, tentative ignorée');
        return progress;
    }
    
    // Sauvegarder l'ancienne réponse dans l'historique si la question a déjà été répondue
    if (question.answered) {
        question.attemptHistory.push({
            answer: question.answer,
            isCorrect: question.isCorrect,
            score: question.score,
            answeredAt: question.answeredAt
        });
    }
    
    // Mettre à jour la question
    question.answered = true;
    question.answer = userAnswer;
    question.isCorrect = isCorrect;
    question.score = score;
    question.attempts++;
    question.answeredAt = now;
    question.updatedAt = now;
    
    // Si la question est correcte, marquer comme terminée
    if (isCorrect) {
        question.needsManualCorrection = false;
        question.manualCorrectionStatus = "none";
    }
    
    // Mettre à jour les statistiques du chapitre
    recomputeChapterStats(chapter);
    
    // Mettre à jour les statistiques globales
    recomputeGlobalStats(progress);
    
    return progress;
}

/**
 * Recalcule les statistiques d'un chapitre
 * @param {Object} chapter - Le chapitre à recalculer
 */
function recomputeChapterStats(chapter) {
    // Compter les questions répondues
    chapter.answeredQuestions = Object.values(chapter.questions).filter(q => q.answered).length;
    
    // Calculer le pourcentage de complétion
    chapter.completionPercent = chapter.questionCount > 0
        ? Math.round((chapter.answeredQuestions / chapter.questionCount) * 100)
        : 0;
    
    // Calculer le score total
    chapter.score = Object.values(chapter.questions).reduce((sum, q) => sum + (q.score || 0), 0);
    
    // Mettre à jour le statut
    if (chapter.answeredQuestions === chapter.questionCount && chapter.questionCount > 0) {
        chapter.status = 'completed';
        chapter.completedAt = new Date().toISOString();
    } else if (chapter.answeredQuestions > 0) {
        chapter.status = 'in_progress';
    }
    
    chapter.updatedAt = new Date().toISOString();
}

/**
 * Recalcule les statistiques globales de la progression
 * @param {Object} progress - La progression à recalculer
 */
function recomputeGlobalStats(progress) {
    progress.completedChapters = Object.values(progress.chapters).filter(c => c.status === 'completed').length;
    progress.totalScore = Object.values(progress.chapters).reduce((sum, c) => sum + (c.score || 0), 0);
    progress.lastUpdated = new Date().toISOString();
}

/**
 * Déverrouille le chapitre suivant si le chapitre courant est terminé
 * @param {Object} progress - La progression de l'étudiant
 * @param {string|number} currentChapterId - L'ID du chapitre courant
 * @param {Object} chaptersConfig - La configuration des chapitres
 */
function unlockNextChapter(progress, currentChapterId, chaptersConfig) {
    const currentChapter = progress.chapters[currentChapterId];
    if (!currentChapter || currentChapter.status !== 'completed') {
        return; // Chapitre non terminé
    }
    
    // Trouver le chapitre suivant
    const currentId = parseInt(currentChapterId);
    const nextId = currentId + 1;
    
    // Vérifier si le chapitre suivant existe
    const nextChapterConfig = chaptersConfig.chapters.find(ch => ch.id === nextId);
    if (!nextChapterConfig) {
        return; // Pas de chapitre suivant
    }
    
    // Déverrouiller le chapitre suivant
    if (!progress.chapters[nextId]) {
        progress.chapters[nextId] = initChapter(nextChapterConfig);
    }
    progress.chapters[nextId].isLocked = false;
    progress.chapters[nextId].unlockedAt = new Date().toISOString();
}

/**
 * Initialise le chapitre courant dans la progression si absent
 * @param {Object} progress - La progression de l'étudiant
 * @param {Object} chaptersConfig - La configuration des chapitres
 */
function ensureChapterInitialized(progress, chaptersConfig) {
    const chapterId = getCurrentChapterId();
    if (!chapterId) return;
    
    // S'assurer que progress.chapters existe
    if (!progress.chapters) {
        progress.chapters = {};
    }
    
    const chapterConfig = chaptersConfig.chapters.find(ch => ch.id === parseInt(chapterId));
    if (!chapterConfig) return;
    
    if (!progress.chapters[chapterId]) {
        progress.chapters[chapterId] = initChapter(chapterConfig);
    }
    
    // S'assurer que toutes les questions sont initialisées
    if (chapterConfig.questions) {
        chapterConfig.questions.forEach(q => {
            if (!progress.chapters[chapterId].questions[q.id]) {
                progress.chapters[chapterId].questions[q.id] = initQuestion(q);
            }
        });
    }
}

/**
 * Restaure les réponses sauvegardées au chargement de la page
 * @param {Object} progress - La progression de l'étudiant
 * @param {string|number} chapterId - L'ID du chapitre
 */
function restoreSavedAnswers(progress, chapterId) {
    const chapter = progress.chapters[chapterId];
    if (!chapter) return;
    
    console.log("#####################chapter====>",chapter)
    Object.entries(chapter.questions).forEach(([questionId, questionData]) => {
        if (questionData.answered) {
            restoreQuestionState(questionId, questionData);
        }
    });
}

/**
 * Restaure l'état d'une question spécifique
 * @param {string} questionId - L'ID de la question
 * @param {Object} questionData - Les données de la question
 */
function restoreQuestionState(questionId, questionData) {    
    // Restaurer les inputs QCM
    if (Array.isArray(questionData.answer)) {
        // Réponse multiple (checkboxes)
        questionData.answer.forEach(value => {
            const input = document.querySelector(`input[name="qcm_${questionId}"][value="${value}"]`);
            if (input) {
                input.checked = true;
                input.disabled = !ALLOW_MULTIPLE_ATTEMPTS && questionData.isCorrect === true;
            }
        });
    } else if (typeof questionData.answer === 'number') {
        // Réponse unique (radio ou select)
        const radio = document.querySelector(`input[name="qcm_${questionId}"][value="${questionData.answer}"]`);
        if (radio) {
            radio.checked = true;
            radio.disabled = !ALLOW_MULTIPLE_ATTEMPTS && questionData.isCorrect === true;
        }
        
        const select = document.querySelector(`select#select_${questionId}`);
        if (select) {
            select.value = questionData.answer;
            select.disabled = !ALLOW_MULTIPLE_ATTEMPTS && questionData.isCorrect === true;
        }
    } else if (typeof questionData.answer === 'string') {
        // Réponse texte
        const input = document.getElementById(`short_${questionId}`);
        if (input) {
            input.value = questionData.answer;
            input.disabled = !ALLOW_MULTIPLE_ATTEMPTS && questionData.isCorrect === true;
        }
        
        const textarea = document.getElementById(`open_${questionId}`);
        if (textarea) {
            textarea.value = questionData.answer;
            textarea.disabled = !ALLOW_MULTIPLE_ATTEMPTS && questionData.isCorrect === true;
        }
    }
    
    // Afficher le feedback
    const feedback = document.getElementById(`feedback_${questionId}`);
    if (feedback) {
        if (questionData.isCorrect === true) {
            feedback.innerHTML = `<span class="success">✅ Correct</span>`;
            feedback.className = 'feedback show success';
        } else if (questionData.isCorrect === false) {
            feedback.innerHTML = `<span class="error">❌ Incorrect</span>`;
            feedback.className = 'feedback show error';
        } else  if (questionData.answer){
            feedback.innerHTML = `<span class="warning">⏳ En attente de correction</span>`;
            feedback.className = 'feedback show warning';
        }
    }
    
    // Désactiver le bouton si nécessaire
    if (!ALLOW_MULTIPLE_ATTEMPTS && questionData.isCorrect === true) {
        const button = document.querySelector(`.question-section[data-question-id="${questionId}"] .btn-check-answer`);
        if (button) {
            button.disabled = true;
            button.textContent = '✓ Validé';
        }
    }
}

// ============================================================================
// EXPORTS GLOBAUX
// ============================================================================

window.ProgressManager = {
    // Configuration
    ALLOW_MULTIPLE_ATTEMPTS,
    
    // Fonctions utilitaires
    getCurrentChapterId,
    getCurrentStudentId,
    
    // Chargement / Sauvegarde (async)
    loadProgress,
    saveProgress,
    
    // Initialisation
    initProgress,
    initChapter,
    initQuestion,
    getOrCreateStudentProgress,
    ensureChapterInitialized,
    
    // Enregistrement des réponses
    recordAnswer,
    
    // Recalcul des statistiques
    recomputeChapterStats,
    recomputeGlobalStats,
    
    // Déverrouillage
    unlockNextChapter,
    
    // Restauration
    restoreSavedAnswers,
    restoreQuestionState
};

console.log('✅ progressManager.js chargé - Gestion de progression active');