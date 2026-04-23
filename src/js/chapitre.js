// ============================================================================
// CHAPITRE.JS - Fonctionnalités spécifiques aux pages de chapitre
// ============================================================================
// Ce fichier contient tout le code spécifique à la gestion des chapitres.
// Il est chargé uniquement sur les pages de chapitre (après main.js).
// Source de vérité : chapters_index.json + progressManager
// ============================================================================

// Helper pour accéder aux fonctions ProgressManager
function getProgressManager() {
    return window.ProgressManager || {};
}

// Variables globales pour la progression
let currentProgress = null;
let currentStudentId = null;
let currentChapterId = null;

// Exposition des variables globales pour utilisation depuis index.html
window.getCurrentProgress = () => currentProgress;
window.setCurrentProgress = (p) => { currentProgress = p; };
window.getCurrentChapterId = () => currentChapterId;
window.setCurrentChapterId = (id) => { currentChapterId = id; };
window.getCurrentStudentId = () => currentStudentId;
window.setCurrentStudentId = (id) => { currentStudentId = id; };

/**
 * Synchroniser une réponse avec progressManager
 * Source de vérité : progressManager uniquement
 */
function syncAnswerToProgress(questionId, answer, isCorrect, score) {
    const pm = getProgressManager();
    if (!pm.recordAnswer || !currentProgress) {
        console.log('[progressManager] Non initialisé, synchronisation ignorée');
        return;
    }

    currentStudentId = pm.getCurrentStudentId ? pm.getCurrentStudentId() : currentStudentId;
    currentChapterId = pm.getCurrentChapterId ? pm.getCurrentChapterId() : currentChapterId;

    if (!currentChapterId) {
        console.warn('[progressManager] Chapitre ID introuvable');
        return;
    }

    // S'assurer que le chapitre est initialisé avec chaptersIndex
    if (pm.ensureChapterInitialized && window.chaptersIndex) {
        pm.ensureChapterInitialized(currentProgress, window.chaptersIndex);
    }

    const question = currentProgress?.chapters?.[currentChapterId]?.questions?.[questionId];

    if (!question) {
        console.warn(`[progressManager] Question introuvable: ${questionId}`);
        return;
    }

    // ✅ Fonction utilitaire de comparaison qui marche aussi pour les tableaux (QCM multiples)
    function answersEqual(a, b) {
        if (Array.isArray(a) && Array.isArray(b)) {
            return a.length === b.length && a.every((val, idx) => val === b[idx]);
        }
        return a === b;
    }

    // Gérer le cas où la réponse est vide (effacement d'une réponse précédente)
    if (answer === '' || answer === null || answer === undefined) {
        const now = new Date().toISOString();
        
    // ✅ NOUVELLE REGLE: Si c'est déjà vide, ne pas incrémenter les tentatives
        if (!answersEqual(question.answer, answer)) {
            // Sauvegarder l'ancienne réponse dans l'historique si elle existait
            if (question.answered && question.answer !== null) {
                question.attemptHistory.push({
                    answer: question.answer,
                    isCorrect: question.isCorrect,
                    score: question.score,
                    answeredAt: question.answeredAt
                });
            }

            question.attempts++;
        }
        
        // Marquer comme non répondue
        question.answered = false;
        question.answer = null;
        question.isCorrect = null;
        question.score = 0;
        question.answeredAt = null;
        question.updatedAt = now;
        
        // Recalculer les statistiques
        if (pm.recomputeChapterStats) {
            pm.recomputeChapterStats(currentProgress.chapters[currentChapterId]);
        }
        if (pm.recomputeGlobalStats) {
            pm.recomputeGlobalStats(currentProgress);
        }
        
        // Sauvegarder
        if (pm.saveProgress && currentStudentId) {
            pm.saveProgress(currentStudentId, currentProgress);
        }
        
        updateAllProgressIndicators();
        console.log('[progressManager] answer cleared', { questionId });
        return;
    }

    // Vérifier si les tentatives multiples sont autorisées
    const allowMultiple = pm.ALLOW_MULTIPLE_ATTEMPTS !== false;
    if (!allowMultiple && question.answered && question.isCorrect === true) {
        console.warn(`[progressManager] Question déjà validée: ${questionId}`);
        return;
    }

    // Enregistrer la réponse (non vide)
    // ✅ NOUVELLE REGLE: N'incrémente les tentatives SEULEMENT SI la réponse a changé
    if (!answersEqual(question.answer, answer)) {
        pm.recordAnswer(currentProgress, currentChapterId, questionId, answer, isCorrect, score);
    }

    // Recalculer les statistiques
    if (pm.recomputeChapterStats) {
        pm.recomputeChapterStats(currentProgress.chapters[currentChapterId]);
    }
    if (pm.recomputeGlobalStats) {
        pm.recomputeGlobalStats(currentProgress);
    }

    // Déverrouiller le chapitre suivant si nécessaire
    if (pm.unlockNextChapter && window.chaptersIndex) {
        pm.unlockNextChapter(currentProgress, currentChapterId, window.chaptersIndex);
    }

    // Sauvegarder (async)
    if (pm.saveProgress && currentStudentId) {
        pm.saveProgress(currentStudentId, currentProgress);
    }

    // Mettre à jour TOUS les indicateurs UI
    updateAllProgressIndicators();

    console.log('[progressManager] answer synced', { questionId, answer, isCorrect, score });
}

// ============================================================================
// GESTION DE LA PROGRESSION GLOBALE
// ============================================================================

/**
 * Mettre à jour TOUS les indicateurs de progression
 * Centralise la mise à jour de :
 * 1. Progression globale (questions + cours)
 * 2. Stats exercices auto-corrigés
 */

function updateAllProgressIndicators() {
    if (!currentProgress || !currentChapterId) return;

    const chapter = currentProgress.chapters[currentChapterId];
    if (!chapter) return;

    const chapterConfig = window.currentChapterConfig;
    if (!chapterConfig) return;

    // Utiliser la fonction centralisée de progressManager pour tous les calculs
    const pm = window.ProgressManager;
    if (!pm || !pm.computeChapterUIStats) {
        console.warn('[updateAllProgressIndicators] ProgressManager.computeChapterUIStats non disponible');
        return;
    }

    const stats = pm.computeChapterUIStats(chapter, chapterConfig, APP_CONFIG.MAX_NOTE || 20);

    // =========================
    // Progression globale
    // =========================
    const progressValue = document.getElementById('chapterProgressValue');
    if (progressValue) {
        progressValue.textContent = stats.globalPercentage;
    }

    // Ajouter un title au cercle de progression
    const progressCircle = document.getElementById('chapterProgressCircle');
    if (progressCircle) {
        // Le total inclut les questions ET les cours validables uniquement
        progressCircle.title = `Avancement dans le chapitre : ${stats.completedItems} éléments complétés sur ${stats.totalItems} au total (${stats.answeredQuestions}/${stats.totalQuestions} questions, ${stats.answeredCourses}/${stats.totalValidatableCourses} cours)`;
    }

    // =========================
    // Questions auto-corrigées
    // =========================
    const statsDiv = document.getElementById('auto-correct-stats');

    if (statsDiv) {
        const pointsPercentage = stats.autoMaxPossible > 0
            ? (stats.pointsObtenus / stats.autoMaxPossible) * 100
            : 0;

        // Logique d'activation du bouton bilan
        // ✅ UTILISER LA SOURCE DE VÉRITÉ OFFICIELLE COMME PARTOUT AILLEURS
        const examContext = getExamContext(chapter, chapterConfig);
        const submissionStatus = chapter.submissionStatus || 'not_submitted';
        const isDisabled = examContext.isExamMode && submissionStatus === 'not_submitted';
        const disabledAttr = isDisabled ? 'disabled' : '';

        // [DEBUG] Log pour vérifier la règle
        console.log('🔘 [BILAN BTN]', {
            examContext,
            isExamMode: examContext.isExamMode,
            submissionStatus,
            isDisabled,
            disabledAttr
        });

        statsDiv.innerHTML = `
            <div class="stats-card">
                <h3>
                    📊 Exercices auto-corrigés (${stats.autoMaxPossible} points attribuables sur ${chapterConfig.maxPoints})
                    <button class="details-btn" id="bilan-btn" title="Bilan des exercices"> ⭐ Voir le bilan</button>
                </h3>
                <div class="stats-grid">
                    <div class="stat-item" title="Pourcentage d'exercices auto-corrigés réussis sur le total.">
                        <span>📈 Avancement</span>
                        <strong>${Math.round(stats.avctBonneReponse)}%</strong>
                    </div>
                    <div class="stat-item" title="Taux de réussite au premier essai.">
                        <span>🥇 1er essai</span>
                        <strong>${stats.firstAttemptRate}%</strong>
                    </div>
                    <div class="stat-item accuracy-item" title="Mesure la qualité des réponses en tenant compte du nombre d'essais.">
                        <span>🎯 Précision</span>
                        <strong>${stats.accuracy}%</strong>
                    </div>
                    <div class="stat-item" title="Points obtenus à partir de la note calculée sur les exercices auto-corrigés.">
                        <span>⭐ Points obtenus</span>
                        <strong>${stats.pointsObtenus}/${stats.autoMaxPossible}</strong>
                    </div>
                </div>
            </div>
        `;
    }

    console.log('[updateAllProgressIndicators]', {
        globalPercentage: stats.globalPercentage,
        autoAnswered: stats.autoScore,
        autoTotal: stats.autoMaxPossible,
        firstAttemptRate: stats.firstAttemptRate,
        accuracy: stats.accuracy,
        note: stats.note,
        pointsObtenus: stats.pointsObtenus
    });

    // Attacher l'évènement sur le bouton bilan APRÈS création
    const bilanBtn = document.getElementById('bilan-btn');
    if (bilanBtn) {
        bilanBtn.removeEventListener('click', showDetailsBilanChapter);
        bilanBtn.addEventListener('click', showDetailsBilanChapter);
    }
}
// ============================================================================
// FONCTIONS DE GESTION DES RÉPONSES
// ============================================================================

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

    // Note: syncAnswerToProgress appelle déjà updateAllProgressIndicators
}

// ============================================================================
// BRIDGE VERS StudentWorkEditor (compatibilité ascendante)
// ============================================================================

function handleAnswer(elementId, correctionType, correctAnswer, points, answerType, correctAnswersStr = '') {
    return window.studentWorkEditor?.handleAnswer(elementId, correctionType, correctAnswer, points, answerType, correctAnswersStr);
}

function handleOpenAnswer(elementId, correctionType, points, minLength) {
    return window.studentWorkEditor?.handleOpenAnswer(elementId, correctionType, points, minLength);
}

function checkQuestion(question) {
    return window.studentWorkEditor?.checkQuestion(question);
}

// Validation globale (mode examen)...
function validateAllQuestions() {
    const questions = document.querySelectorAll('.question-section');
    let totalPoints = 0;
    let earnedPoints = 0;
    let unansweredQuestions = [];
    
    questions.forEach(question => {
        const result = checkQuestion(question);
        if (!result.hasAnswer) {
            unansweredQuestions.push(question);
        }
    });
    
    const globalFeedback = document.getElementById('global-feedback');
    
    if (unansweredQuestions.length > 0) {
        const confirmSubmit = confirm(
            `⚠️ Attention : ${unansweredQuestions.length} question(s) sans réponse.\n\n` +
            `Souhaitez-vous vraiment valider sans y répondre ?\n\n` +
            `Les réponses manquantes seront comptées comme incorrectes.`
        );
            
    if (!confirmSubmit) {
        if (globalFeedback) {
            globalFeedback.className = 'feedback show warning';
            globalFeedback.innerHTML = `
                ⚠️ Validation annulée.<br>
                Veuillez répondre aux questions manquantes avant de valider.
            `;
        }
        return false;
    }

    if (globalFeedback) {
        globalFeedback.innerHTML = '';
    }

    }
    
    questions.forEach(question => {
        const points = parseInt(question.dataset.points);
        totalPoints += points;
        
        const result = checkQuestion(question);
        if (result.isCorrect) {
            earnedPoints += points;
        }
        
        saveAnswer(`global_${question.dataset.questionId}`, result.userAnswer || '(non répondue)', result.isCorrect, false);
        
        syncAnswerToProgress(question.dataset.questionId, result.userAnswer || '(non répondue)', result.isCorrect, result.isCorrect ? parseInt(question.dataset.points) : 0);
    });
    
    // Sync exam mode validation with progressManager
    const pm = getProgressManager();
    if (pm.saveProgress && currentProgress && currentChapterId) {
        if (currentProgress.chapters && currentProgress.chapters[currentChapterId]) {
            currentProgress.chapters[currentChapterId].examModeValidated = true;
            currentProgress.chapters[currentChapterId].examModeValidatedAt = new Date().toISOString();
            
            if (pm.recomputeChapterStats) pm.recomputeChapterStats(currentProgress.chapters[currentChapterId]);
            if (pm.recomputeGlobalStats) pm.recomputeGlobalStats(currentProgress);
            if (pm.saveProgress) pm.saveProgress(currentStudentId, currentProgress);
        }
    }
    
    const percentage = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
    
    console.log('=== MODE EXAMEN - RÉSULTATS ===');
    console.log(`Score: ${earnedPoints}/${totalPoints} points (${percentage}%)`);
    console.log(`Questions sans réponse: ${unansweredQuestions.length}`);
    console.log('================================');
    
    if (globalFeedback) { // <-- AJOUTE CETTE LIGNE ET UNE ACCOLADE OUVRANTE
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
    }
    
    const allInputs = document.querySelectorAll('input, select, textarea, button');
    allInputs.forEach(input => {
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
    
    return true;
}

// Validation des cours...
function validateCourse(button) {
    button.disabled = true;
    button.textContent = '✓ Validé';
    button.style.backgroundColor = '#27ae60';
    
    const courseSection = button.closest('.course-content');
    if (courseSection) {
        const feedbackDiv = document.createElement('div');
        feedbackDiv.className = 'feedback success show';
        feedbackDiv.textContent = '✅ Cours marqué comme lu. Vous pouvez continuer.';
        feedbackDiv.style.marginTop = '1rem';
        courseSection.appendChild(feedbackDiv);
        
        setTimeout(() => {
            feedbackDiv.remove();
        }, APP_CONFIG.SUCCESS_FEEDBACK_DURATION);
        
        // Marquer le cours comme complété
        courseSection.classList.add('completed');
    }
    
    // Sauvegarder dans localStorage (rétrocompatibilité)
    saveCourseProgress();
    
    // Sauvegarder dans progressManager pour persistance
    const courseIndex = Array.from(document.querySelectorAll('.course-content')).indexOf(courseSection);
    const courseId = `course_${courseIndex}`;
    syncCourseToProgress(courseId);
        
    // Mettre à jour TOUS les indicateurs
    updateAllProgressIndicators();
}

/**
 * Synchroniser la lecture d'un cours avec progressManager
 */
function syncCourseToProgress(courseId) {
    const pm = getProgressManager();
    if (!pm.recordAnswer || !currentProgress || !currentChapterId) {
        return;
    }
    
    // Vérifier si le cours existe dans la config
    const chapterConfig = window.currentChapterConfig;
    if (!chapterConfig) return;
    
    // Initialiser le chapitre si nécessaire
    if (pm.ensureChapterInitialized && window.chaptersIndex) {
        pm.ensureChapterInitialized(currentProgress, window.chaptersIndex);
    }
    
    // Créer une entrée pour le cours si elle n'existe pas
    if (!currentProgress.chapters[currentChapterId].questions[courseId]) {
        currentProgress.chapters[currentChapterId].questions[courseId] = {
            questionHash: courseId,
            answered: true,
            answer: 'read',
            isCorrect: true,
            score: 0,
            attempts: 1,
            attemptHistory: [],
            answeredAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            needsManualCorrection: false,
            manualCorrectionStatus: 'none'
        };
    } else {
        // Mettre à jour si déjà existant
        const course = currentProgress.chapters[currentChapterId].questions[courseId];
        course.answered = true;
        course.answer = 'read';
        course.isCorrect = true;
        course.updatedAt = new Date().toISOString();
    }
    
    // Recalculer les statistiques
    if (pm.recomputeChapterStats) {
        pm.recomputeChapterStats(currentProgress.chapters[currentChapterId]);
    }
    if (pm.recomputeGlobalStats) {
        pm.recomputeGlobalStats(currentProgress);
    }
    
    // Sauvegarder
    if (pm.saveProgress && currentStudentId) {
        pm.saveProgress(currentStudentId, currentProgress);
    }
}

/**
 * Restaurer la réponse d'une question spécifique
 */
function restoreQuestionAnswer(questionId, questionData) {
    const pm = getProgressManager();
    const question = document.querySelector(`.question-section[data-question-id="${questionId}"]`);
    const correctionType = question ? question.dataset.correctionType : null;

    // ✅ Règle officielle: Verrouiller SEULEMENT les questions AUTO et SEMI correctes
    // ❌ JAMAIS verrouiller automatiquement les questions MANUEL / OUVERT
    const shouldLock = 
        (correctionType === 'auto' || correctionType === 'semi') && 
        !pm.ALLOW_MULTIPLE_ATTEMPTS && 
        questionData.isCorrect === true;
    
    // QCM radio - vérifier si c'est un input radio qui existe
    const radio = document.querySelector(`input[type="radio"][name="qcm_${questionId}"]`);
    if (radio) {
        const radioSelected = document.querySelector(`input[name="qcm_${questionId}"][value="${questionData.answer}"]`);
        if (radioSelected) {
            radioSelected.checked = true;
            if (shouldLock) {
                setInputsDisabled(`qcm_${questionId}`, true);
            }
        }
        return;
    }
    
    // QCM checkbox (selection multiple)
    const checkbox = document.querySelector(`input[type="checkbox"][name="qcm_${questionId}"]`);
    if (checkbox && Array.isArray(questionData.answer)) {
        questionData.answer.forEach(value => {
            const checkboxSelected = document.querySelector(`input[name="qcm_${questionId}"][value="${value}"]`);
            if (checkboxSelected) {
                checkboxSelected.checked = true;
                if (shouldLock) {
                    checkboxSelected.disabled = true;
                }
            }
        });
        return;
    }
    
    // Select - vérifier si c'est un select qui existe (l'ID est directement questionId)
    const select = document.querySelector(`select#${questionId}`);
    if (select) {
        select.value = questionData.answer;
        if (shouldLock) {
            select.disabled = true;
        }
        return;
    }
    
    // Réponse courte - input text/number
    const shortInput = document.getElementById(`short_${questionId}`);
    if (shortInput) {
        // Gérer le cas où la réponse est vide ou null
        shortInput.value = questionData.answer || '';
        if (shouldLock) {
            shortInput.disabled = true;
        }
        return;
    }
    
    // Réponse ouverte - textarea
    const textarea = document.getElementById(questionId);
    if (textarea && textarea.tagName === 'TEXTAREA') {
        // Gérer le cas où la réponse est vide ou null
        textarea.value = questionData.answer || '';
        // ❌ JAMAIS désactiver automatiquement un textarea (question ouverte)
        // On ne désactive QUE si la question a été corrigée par le formateur
    }
}

/**
 * Restaurer TOUTES les réponses sauvegardées (cours + questions)
 * Centralise la restauration au même endroit que la mise à jour des stats
 */
function restoreAllAnswers() {
    console.log('🔍 [restoreAllAnswers] Début');

    if (!currentProgress || !currentChapterId) return;

    const chapter = currentProgress.chapters[currentChapterId];
    if (!chapter?.questions) return;

    clearAllFeedbacks();

    const context = getExamContext(chapter);

    const isChapterCorrected = chapter.submissionStatus === 'validated';

    console.log('📊 Contexte:', context);

    restoreCourses(chapter);

    Object.entries(chapter.questions).forEach(([questionId, data]) => {

        if (questionId.startsWith('course_')) return;
        if (!data?.answered) return;

        restoreQuestionAnswer(questionId, data);

        const questionEl = document.querySelector(
            `.question-section[data-question-id="${questionId}"]`
        );
        if (!questionEl) return;

        // ============================
        // 🔵 MODE EXAMEN
        // ============================
        if (context.isExamMode) {

            if (context.isChapterLocked) {
                lockQuestion(questionEl);

                if (isChapterCorrected) {
                    showFeedback(questionId, data);
                }
            }

            return;
        }

        // ============================
        // 🟢 MODE NORMAL
        // ============================
        handleNormalMode(questionId, data, questionEl);
    });

    console.log('✅ [restoreAllAnswers] Terminé');
}

function restoreCourses(chapter) {
    const courseSections = document.querySelectorAll('.course-content');

    courseSections.forEach((section, index) => {
        const courseId = `course_${index}`;
        const courseData = chapter.questions[courseId];

        if (courseData && courseData.answered && courseData.isCorrect === true) {
            section.classList.add('completed');

            const button = section.querySelector('.btn-secondary');
            if (button) {
                button.disabled = true;
                button.textContent = '✓ Validé';
                button.style.backgroundColor = '#27ae60';
            }
        }
    });
}


function handleNormalMode(questionId, questionData, question) {
    const correctionType = question.dataset.correctionType;
    const hasTextarea = question.querySelector('textarea') !== null;

    // 🔁 Ton comportement actuel
    const feedback = document.getElementById(`feedback_${questionId}`);

    // ✅ TRAITEMENT SPÉCIAL POUR LES QUESTIONS OUVERTES
    if (hasTextarea) {
        // 🚨 TRAITER D'ABORD LES CAS ERREUR pour semi-auto ET manuel
        if (questionData.isCorrect === false) {
            // ❌ Réponse trop courte ou invalide
            if (feedback) {
                feedback.innerHTML = '❌ Réponse invalide / trop courte';
                feedback.className = 'feedback error show';
                feedback.style.display = 'block';
            }
        }
        else if (questionData.answered === true) {
            // ⏳ Réponse valide en attente
            if (feedback) {
                feedback.innerHTML = '⏳ Réponse enregistrée - En attente de vérification';
                feedback.className = 'feedback warning show';
                feedback.style.display = 'block';
            }
        } else {
            // ❌ Réponse vide ou pas encore répondue: AUCUN FEEDBACK
            if (feedback) {
                feedback.innerHTML = '';
                feedback.className = 'feedback';
                feedback.style.display = 'none';
            }
        }
    } 
    // ✅ Comportement normal pour les autres questions
    else {
        if (questionData.isCorrect === true) {
            if (feedback) {
                feedback.innerHTML = '✅ Bonne réponse';
                feedback.className = 'feedback success show';
                feedback.style.display = 'block';
            }
        } else if (questionData.isCorrect === false) {
            if (feedback) {
                feedback.innerHTML = '❌ Mauvaise réponse';
                feedback.className = 'feedback error show';
                feedback.style.display = 'block';
            }
        } else if (questionData.isCorrect === null && questionData.answered === true) {
            if (feedback) {
                feedback.innerHTML = '⏳ Réponse enregistrée - En attente de correction';
                feedback.className = 'feedback warning show';
                feedback.style.display = 'block';
            }
        } else {
            // ❌ Réponse vide ou pas encore répondue: AUCUN FEEDBACK
            if (feedback) {
                feedback.innerHTML = '';
                feedback.className = 'feedback';
                feedback.style.display = 'none';
            }
        }
    }

    // 🛡️ D'ABORD on applique la règle générale de désactivation
    if (
        questionData.isCorrect === true &&
        (correctionType === 'auto' || correctionType === 'semi')
    ) {
        disableAutoCorrectedQuestion(question);
    }

    // 🚨 PUIS on override POUR LES QUESTIONS OUVERTES (toujours active)
    // C'est ça qui manquait !
    if (hasTextarea) {
        // ✅ QUESTION OUVERTE: JAMAIS VERROUILLÉE, quel que soit l'état
        const inputs = question.querySelectorAll('textarea, button');
        inputs.forEach(input => {
            input.disabled = false;
            input.style.pointerEvents = 'auto';
            input.style.opacity = '1';
            
            // ✅ Rétablir aussi le style original du bouton vérifier
            if (input.classList.contains('btn-check-answer')) {
                input.textContent = 'Vérifier';
                input.style.backgroundColor = '';
            }
        });
        question.classList.remove('completed');
        question.style.opacity = '1';
    }
}


function lockQuestion(questionEl) {
    questionEl.querySelectorAll('input, select, textarea, button').forEach(el => {
        el.disabled = true;
        el.style.pointerEvents = 'none';
        el.style.opacity = '0.7';
    });

    questionEl.classList.add('locked');
}

function clearAllFeedbacks() {
    document.querySelectorAll('.feedback, .question-feedback').forEach(el => {
        el.innerHTML = '';
        el.className = 'feedback';
        el.style.display = '';
    });
}

function getExamContext(chapter, chapterConfig = null) {
    let config = window.currentChapterConfig;
    
    console.log('🔍 [getExamContext DEBUG]', {
        chapter: chapter,
        window_currentChapterConfig: window.currentChapterConfig,
        param_chapterConfig: chapterConfig,
        chapter_isExamMode: chapter.isExamMode,
        config_isExamMode: config?.isExamMode,
        config_examMode: config?.examMode
    });
    
    const submissionStatus = chapter.submissionStatus || 'not_submitted';

    const isSubmitted = ['submitted', 'late_submitted'].includes(submissionStatus);
    const isChapterCorrected = chapter.submissionStatus === 'validated';
    
    return {
        isExamMode: chapter.isExamMode === true || config?.isExamMode === true || config?.examMode === true,
        isSubmitted,
        isCorrected: isChapterCorrected,
        isChapterLocked: isSubmitted || isChapterCorrected
    };
}

/**
 * Met à jour l'affichage du bouton de rendu selon le statut
 */
function updateSubmitButton() {
    const btn = document.getElementById('submit-chapter-btn');
    if (!btn || !currentProgress || !currentChapterId) return;

    const chapter = currentProgress.chapters[currentChapterId];
    if (!chapter) return;

    // [DEBUG] Afficher le JSON du chapitre en console pour vérification
    console.log('=== [DEBUG] Chapitre en cours (JSON complet) ===');
    console.log(JSON.stringify(chapter, null, 2));
    console.log('================================================');

    const status = chapter.submissionStatus || 'not_submitted';

    switch (status) {
        case 'not_submitted':
            btn.innerHTML = '📤 Rendre ce travail';
            btn.className = 'btn btn-primary';
            btn.onclick = handleSubmitChapter;
            btn.disabled = false;
            break;
        case 'submitted':
        case 'late_submitted':
            // Chapitre déjà rendu - afficher le statut et verrouiller
            btn.innerHTML = status === 'submitted' 
                ? '📝 Rendu - En attente de correction' 
                : '⚠️ Rendu - En retard';
            btn.className = status === 'submitted' ? 'btn btn-secondary' : 'btn btn-warning';
            btn.disabled = true;
            btn.onclick = null;
            // Verrouiller les champs car déjà rendu
            lockChapterAfterSubmission();
            break;
        case 'returned_for_revision':
            btn.innerHTML = '🔄 Retouches demandées - Re-rendre';
            btn.className = 'btn btn-primary';
            btn.onclick = handleSubmitChapter;
            btn.disabled = false;
            break;
        case 'validated':
            btn.innerHTML = '✅ Validé par votre évaluateur';
            btn.className = 'btn btn-success';
            btn.disabled = true;
            btn.onclick = null;
            // Verrouiller les champs car approuvé
            lockChapterAfterSubmission();
            break;
        default:
            btn.innerHTML = '📤 Rendre ce travail';
            btn.className = 'btn btn-primary';
            btn.onclick = handleSubmitChapter;
            btn.disabled = false;
    }
}

/**
 * Désactiver tous les inputs d'un groupe QCM
 */
function setInputsDisabled(name, disabled) {
    const inputs = document.querySelectorAll(`input[name="${name}"]`);
    inputs.forEach(input => {
        input.disabled = disabled;
    });
}

/**
 * Désactiver une question auto-corrigée après une réponse correcte
 * Désactive le bouton "Vérifier" et tous les inputs de la question
 */
function disableAutoCorrectedQuestion(question) {
    // Désactiver le bouton "Vérifier"
    const button = question.querySelector('.btn-check-answer');
    if (button) {
        button.disabled = true;
        button.textContent = '✓ Validé';
        button.style.backgroundColor = '#27ae60';
        button.style.pointerEvents = 'none';
    }
    
    // Désactiver tous les inputs de la question
    const inputs = question.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
        input.disabled = true;
        input.style.pointerEvents = 'none';
        input.style.opacity = '0.7';
    });
    
    // Ajouter un indicateur visuel
    question.classList.add('completed');
    question.style.opacity = '0.8';
}

function saveCourseProgress() {
    const progress = StorageService.get(STORAGE_KEYS.COURSE_READ_PROGRESS, { courses: {} });
    
    const chapterTitle = $('h1')?.textContent || 'Chapitre inconnu';
    
    if (!progress.courses[chapterTitle]) {
        progress.courses[chapterTitle] = [];
    }
    
    const currentCourse = $('.course-content .btn-secondary')?.closest('.course-content');
    if (currentCourse) {
        const courseIndex = Array.from($$('.course-content')).indexOf(currentCourse);
        progress.courses[chapterTitle][courseIndex] = {
            read: true,
            timestamp: new Date().toISOString()
        };
    }
    
    StorageService.set(STORAGE_KEYS.COURSE_READ_PROGRESS, progress);
    
    checkAllCoursesRead();
}

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
        // console.log('Tous les cours ont été lus');
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

// Mode examen...
function applyChapterMode() {
    const match = window.location.pathname.match(/chapitre(\d+)\.html/);
    const chapterId = match ? parseInt(match[1]) : null;
    
    if (!chapterId) {
        return;
    }
    
    const chapterConfig = getChapterConfigById(chapterId);
    
    // En mode examen, on cache les boutons individuels "Vérifier"
    // Le bouton "Rendre ce travail" dans le footer remplace la validation globale
    const allButtons = $$('.question-actions .btn-check-answer');
    
    if (chapterConfig?.examMode === true) {
        console.log('🎯 MODE EXAMEN ACTIVÉ');
        
        // Cacher les boutons individuels de validation
        allButtons.forEach(btn => {
            btn.style.display = 'none';
        });

        // Activer la mise à jour automatique de la progression en temps réel
        initExamModeAutoProgress(chapterConfig);
    } else {
        // Afficher les boutons individuels de validation
        allButtons.forEach(btn => {
            btn.style.display = 'block';
        });
    }

    // ✅ CRÉER LE BOUTON "Rendre ce travail" DIRECTEMENT SI IL N'EXISTE PAS
    let submitBtn = document.getElementById('submit-chapter-btn');
    
    if (!submitBtn) {
        // Créer le bouton dynamiquement
        submitBtn = document.createElement('button');
        submitBtn.id = 'submit-chapter-btn';
        submitBtn.className = 'btn btn-primary';
        
        // Ajouter dans le footer
        const footer = document.querySelector('.chapter-footer');
        if (footer) {
            footer.appendChild(submitBtn);
        }
    }
    
    // Toujours l'afficher
    submitBtn.style.display = 'block';
    submitBtn.style.marginLeft = 'auto';
    submitBtn.style.padding = '0.75rem 1.5rem';
}

// ============================================================================
// MISE À JOUR PROGRESSION EN TEMPS RÉEL MODE EXAMEN
// ============================================================================

/**
 * Met à jour la progression en temps réel en mode examen SANS feedback
 * Appelée automatiquement à chaque modification d'un champ de réponse
 */
function updateExamModeProgress(questionElement) {
    console.group('🔄 updateExamModeProgress');
    
    // Récupérer l'ID de la question
    const questionId = questionElement.dataset.questionId;
    console.log('Question ID:', questionId);
    
    if (!questionId) {
        console.warn('❌ Question ID introuvable');
        console.groupEnd();
        return;
    }

    // Vérifier l'état de la question SANS afficher de feedback
    const result = checkQuestion(questionElement);
    console.log('Résultat checkQuestion:', result);

    // Mettre à jour TOUS les indicateurs de progression immédiatement
    console.log('📊 Mise à jour indicateurs UI');
    updateAllProgressIndicators();
    
    console.groupEnd();
}

/**
 * Initialise le système de mise à jour automatique en mode examen
 * Ajoute des listeners sur TOUS les champs de réponse
 */
function initExamModeAutoProgress(chapterConfig) {
    if (!chapterConfig?.examMode) return;

    console.log('📊 Mode examen : mise à jour progression en temps réel activée');

    // Ajouter listeners sur toutes les questions
    document.querySelectorAll('.question-section').forEach(question => {
        // Inputs radio / checkbox
        question.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach(input => {
            input.addEventListener('change', () => updateExamModeProgress(question));
        });

        // Select
        question.querySelectorAll('select').forEach(select => {
            select.addEventListener('change', () => updateExamModeProgress(question));
        });

        // Input texte / nombre
        question.querySelectorAll('input[type="text"], input[type="number"]').forEach(input => {
            input.addEventListener('input', () => updateExamModeProgress(question));
            input.addEventListener('blur', () => updateExamModeProgress(question));
        });

        // Textarea (questions ouvertes)
        question.querySelectorAll('textarea').forEach(textarea => {
            textarea.addEventListener('input', () => updateExamModeProgress(question));
            textarea.addEventListener('blur', () => updateExamModeProgress(question));
        });
    });
}


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
    
    // Initialiser l'affichage des stats
    updateAllProgressIndicators();
}

function initializeStats() {
    setTimeout(() => {
        addStatsDisplay();
    }, 200);
}

function initializeQCM() {
    new QCMSystem();
}

/**
 * Initialisation de la page de chapitre
 * Charge chapters_index.json comme source de vérité
 */
async function initChapterPage() {
    if (!window.location.pathname.includes('chapitre')) return;
    
    console.log('📖 Initialisation de la page de chapitre...');
    
    // Charger chapters_index.json (source de vérité)
    try {
        const chapterId = window.location.pathname.match(/chapitre(\d+)\.html/)?.[1];
        if (chapterId) {
            if (!window.chaptersIndex) {
                const response = await fetch(window.APP_BASE_URL + 'src/chapters/chapters_index.json');
                if (response.ok) {
                    window.chaptersIndex = await response.json();
                    console.log('[ChaptersIndex] Chargé depuis JSON', window.chaptersIndex);
                } else {
                    console.error('❌ Impossible de charger chapters_index.json. Vérifiez le chemin.', response.status);
                }
            }
            
            // ✅ Fusion locale pour cette page de chapitre (sécurité)
            const staticConfig = window.chaptersIndex.chapters.find(ch => ch.id == chapterId);
            const storageConfig = await storage.get('chapter_config');
            
            window.currentChapterConfig = {
                ...staticConfig,
                ...(storageConfig && storageConfig[chapterId] ? storageConfig[chapterId] : {})
            };
            
            console.log('✅ [currentChapterConfig] Fusionnée localement', {
                static: staticConfig,
                storage: storageConfig ? storageConfig[chapterId] : null,
                final: window.currentChapterConfig,
                examMode: window.currentChapterConfig.examMode
            });
        }
    } catch (error) {
        console.warn('[ChaptersIndex] Erreur lors du chargement de la configuration:', error);
    }
    
    // Initialiser progressManager
    const pm = getProgressManager();
    if (pm.getOrCreateStudentProgress) {
        currentStudentId = pm.getCurrentStudentId ? pm.getCurrentStudentId() : null;
        currentChapterId = pm.getCurrentChapterId ? pm.getCurrentChapterId() : null;
        
        if (currentStudentId && currentChapterId) {
            currentProgress = await pm.getOrCreateStudentProgress(
                currentStudentId,
                'Apprenant',
                window.currentChapterConfig || {}
            );
            
            if (pm.ensureChapterInitialized && window.chaptersIndex) {
                pm.ensureChapterInitialized(currentProgress, window.chaptersIndex);
            }
            
            if (pm.restoreSavedAnswers) {
                pm.restoreSavedAnswers(currentProgress, currentChapterId);
            }
            
            if (pm.saveProgress) {
                await pm.saveProgress(currentStudentId, currentProgress);
            }
            
            // console.log('[progressManager] progress loaded', currentProgress);
            // console.log('[progressManager] restoring chapter', currentChapterId);
        }
    }
    
    initializeQCM();
    initializeStats();
    applyChapterMode();

    // ✅ Initialiser et écouter les évènements de StudentWorkEditor
    window.studentWorkEditor.options.onAnswerChanged = ({ questionId, result }) => {
        // UI uniquement
        updateAllProgressIndicators();
    };

    window.studentWorkEditor.options.onAnswerValidated = ({ questionId, answer, isCorrect, points, correctionType }) => {
        // ✅ NOUVEAU : filtrage des réponses vides - PATCH PRINCIPAL
        const isEmpty =
            answer === null ||
            answer === undefined ||
            answer === '' ||
            (Array.isArray(answer) && answer.length === 0);

        if (isEmpty) {
            console.log(`[StudentWorkEditor] Réponse vide ignorée pour question ${questionId} - aucun essai compté`);
            return; // 🚫 NE PAS compter l'essai
        }

        // Synchroniser quand une réponse est validée (bouton vérifier cliqué)
        syncAnswerToProgress(questionId, answer, isCorrect, isCorrect ? points : 0);
        updateAllProgressIndicators();
    };

    window.studentWorkEditor.init();
    
    // Mettre à jour le bouton de rendu
    setTimeout(() => {
        updateSubmitButton();
    }, 400);
    
    // Restaurer TOUTES les réponses (cours + questions) de manière centralisée
    // restoreAllAnswers() appelle déjà updateAllProgressIndicators()
    setTimeout(() => {
        restoreAllAnswers();
    }, 300);
}

// Initialisation automatique
document.addEventListener('DOMContentLoaded', () => {
    initChapterPage();
});



/**
 * Calcule la note finale d'un chapitre SANS la pénalité pour cours non validés
 * Cette fonction est exportée pour être utilisée par showDetailsBilanChapter
 * 
 * @param {Object} chapter - Les données de progression du chapitre
 * @param {Object} chapterConfig - La configuration du chapitre depuis chapters_index.json
 * @returns {string|null} La note brute formatée (ex: "17.5") ou null si incertaine
 */
function getChapterFinalNoteBrute(chapter, chapterConfig) {
    if (!chapter || !chapterConfig) return null;

    const allQuestions = chapterConfig.questions;
    const totalPossiblePoints = chapterConfig.maxPoints || 
        (allQuestions ? allQuestions.reduce((sum, q) => sum + q.points, 0) : 0);
    const submissionStatus = chapter.submissionStatus || 'not_submitted';

    // Scores séparés
    let autoScore = 0;
    let autoRemainingRisk = 0;
    let manualCurrentScore = 0;
    let manualRemainingMax = 0;

    if (allQuestions) {
        allQuestions.forEach(q => {
            const qData = chapter.questions[q.id];
            
        let wasAnswered =
            qData &&
            (qData.answered === true ||
            (typeof qData.answer === 'string' && qData.answer.trim() !== '') ||
            (Array.isArray(qData.answer) && qData.answer.length > 0) ||
            (qData.answer !== null && qData.answer !== undefined && qData.answer !== ''));

        // ✅ CORRECTION FINALE: Questions AUTO avec tentatives mais pas de réponse = considéré comme répondue avec pénalité
        // 🔒 IMMUTABILITÉ: On ne touche JAMAIS à l'objet qData original
        let effectiveIsCorrect = qData ? qData.isCorrect : null;
        let effectiveWasAnswered = wasAnswered;

        if (q.correctionType === 'auto' && qData && qData.attempts > 0 && !wasAnswered) {
            // C'est une question qui a été essayée mais jamais validée correctement
            effectiveIsCorrect = false;
            effectiveWasAnswered = true;
        }

        if (qData) {
                if (effectiveIsCorrect === true) {
                    if (q.correctionType === 'auto') {
                        let pointsEarned = q.points - ((qData.attempts - 1) * q.points);
                        const maxPenalty = q.points * 2;
                        pointsEarned = Math.max(-maxPenalty, pointsEarned);
                        autoScore += pointsEarned;
                    } else {
                        manualCurrentScore += q.points;
                    }
                } else if (effectiveIsCorrect === false) {
                    if (q.correctionType === 'auto') {
                        autoScore -= q.points;
                    }
                    // Pour les questions manuelles incorrectes, pas de points
                } else if (effectiveIsCorrect === null && q.correctionType !== 'auto') {
                    // Question en attente de correction manuelle
                    if (effectiveWasAnswered) {
                        manualRemainingMax += q.points;
                    } else if (submissionStatus === 'not_submitted' || submissionStatus === 'returned_for_revision') {
                        manualRemainingMax += q.points;
                    }
                }
            }

            // Calculer les risques restants (questions non répondues)
            if (!effectiveWasAnswered) {
                if (q.correctionType === 'auto') {
                    if (submissionStatus === 'not_submitted' || submissionStatus === 'returned_for_revision') {
                        autoRemainingRisk += q.points;
                    }
                } else {
                    if (submissionStatus === 'not_submitted' || submissionStatus === 'returned_for_revision') {
                        manualRemainingMax += q.points;
                    }
                }
            }
        });
    }

    const noteMax = APP_CONFIG.MAX_NOTE || 20;
    const autoProjectedScore = Math.max(0, autoScore);
    const currentScore = autoProjectedScore + manualCurrentScore;
    
    // Note finale si elle est définitive (approuvée ou toutes les réponses traitées / travail soumis)
    const finalNoteKnown =
        submissionStatus === 'validated' ||
        submissionStatus === 'submitted' ||
        (autoRemainingRisk === 0 && manualRemainingMax === 0);
    
    return finalNoteKnown ? ((currentScore / totalPossiblePoints) * noteMax).toFixed(1) : null;
}

/**
 * Calcule la note finale d'un chapitre AVEC la pénalité pour cours non validés
 * Cette fonction est exportée pour être utilisée par chapterDetector.js
 * 
 * @param {Object} chapter - Les données de progression du chapitre
 * @param {Object} chapterConfig - La configuration du chapitre depuis chapters_index.json
 * @returns {string|null} La note finale avec pénalité (ex: "15.5") ou null si incertaine
 */
function getChapterFinalNote(chapter, chapterConfig) {
    // Obtenir la note brute
    const noteBrute = getChapterFinalNoteBrute(chapter, chapterConfig);
    if (noteBrute === null) return null;
    
    // Appliquer la pénalité pour cours non validés
    if (chapterConfig.courseValidationCount > 0) {
        const totalCourses = chapterConfig.courseValidationCount;
        const validatedCourses = chapter.answeredCourses || 0;
        if (validatedCourses < totalCourses) {
            const noteBruteNum = parseFloat(noteBrute);
            if (noteBruteNum > 2) {
                return Math.max(0, noteBruteNum - 2).toFixed(1);
            }
        }
    }
    
    return noteBrute;
}

function showDetailsBilanChapter() {
    if (!currentProgress || !currentChapterId) return;

    const chapter = currentProgress.chapters[currentChapterId];
    if (!chapter) return;
    
    const submissionStatus = chapter.submissionStatus || 'not_submitted';

    const chapterConfig = window.chaptersIndex?.chapters?.find(ch => ch.id == currentChapterId);
    if (!chapterConfig) return;

    // 🛡️ PROTECTION DOUBLE - UTILISER LA SOURCE DE VÉRITÉ OFFICIELLE
    console.log('🔍 DEBUG BILAN INPUTS : ', {
        currentChapterId,
        chapter,
        chapterConfig,
        chapterConfig_keys: Object.keys(chapterConfig),
        submissionStatus
    });
    
    // ✅ CORRECTION : C'EST chapter.submissionStatus QUI CONTIENT LE STATUS !
    // Tu cherches le mode examen DANS LA PROGRESSION PAS DANS LA CONFIG !
    const examContext = getExamContext(chapter, chapterConfig);
    const isExamMode = examContext.isExamMode;
    const isAllowed = !isExamMode || submissionStatus === 'validated';

    
    console.log('🔘 [CLICK BILAN]', {
        examContext,
        isExamMode,
        submissionStatus,
        isAllowed,
        chapterConfig_examMode: chapterConfig.examMode
    });

    if (!isAllowed) {
        alert('⚠️ Le bilan n\'est pas disponible tant que le chapitre n\'a pas été corrigé.');
        return;
    }

    const allQuestions = chapterConfig.questions;
    const totalPossiblePoints = chapterConfig.maxPoints || allQuestions.reduce((sum, q) => sum + q.points, 0);

    // Scores séparés
    let autoScore = 0;
    let autoMaxPossible = 0;
    let autoRemainingRisk = 0;

    let manualCurrentScore = 0;
    let manualRemainingMax = 0;

    const questionDetails = [];

    allQuestions.forEach(q => {
        const qData = chapter.questions[q.id];
        // console.log("q.id, q.correctionType, q.points:",q.id, q.correctionType, q.points);
        let status = 'unanswered';
        let pointsEarned = 0;

        if (q.correctionType === 'auto') autoMaxPossible += q.points;

        const wasAnswered =
            qData &&
            (qData.answered === true ||
            (typeof qData.answer === 'string' && qData.answer.trim() !== '') ||
            (Array.isArray(qData.answer) && qData.answer.length > 0) ||
            (qData.answer !== null && qData.answer !== undefined && qData.answer !== ''));

        // ✅ CORRECTION: Questions AUTO avec tentatives mais pas de réponse = considéré comme répondue avec pénalité
        // 🔒 IMMUTABILITÉ: On ne touche JAMAIS à l'objet qData original
        let effectiveIsCorrect = qData ? qData.isCorrect : null;
        let effectiveWasAnswered = wasAnswered;

        if (q.correctionType === 'auto' && qData && qData.attempts > 0 && !wasAnswered) {
            // C'est une question qui a été essayée mais jamais validée correctement
            effectiveIsCorrect = false;
            effectiveWasAnswered = true;
        }

        if (qData) {
            if (effectiveIsCorrect === true) {
                status = 'correct';
                pointsEarned = q.points;
                if (q.correctionType === 'auto') {
                    pointsEarned = q.points - ((qData.attempts - 1) * q.points);
                    const maxPenalty = q.points * 2;
                    pointsEarned = Math.max(-maxPenalty, pointsEarned);
                    autoScore += pointsEarned;
                } else {
                    manualCurrentScore += pointsEarned;
                }
            } else if (effectiveIsCorrect === false) {
                status = 'incorrect';
                if (q.correctionType === 'auto') {
                    pointsEarned = -q.points;
                    autoScore += pointsEarned;
                } else pointsEarned = 0;
            } else if (effectiveIsCorrect === null && q.correctionType !== 'auto') {
                if (effectiveWasAnswered) {
                    status = 'pending';
                    manualRemainingMax += q.points;
                } else {
                    status = 'unanswered';
                    if (submissionStatus === 'not_submitted' || submissionStatus === 'returned_for_revision') 
                        manualRemainingMax += q.points;
                }
                pointsEarned = 0;
            } else if (
                q.correctionType === 'auto' &&
                !effectiveWasAnswered &&
                (
                    submissionStatus === 'not_submitted' ||
                    submissionStatus === 'returned_for_revision'
                )
            ) {
                autoRemainingRisk += q.points;
            }
        } else {
            status = 'unanswered';
            pointsEarned = 0;
            if (
                q.correctionType === 'auto' &&
                (
                    submissionStatus === 'not_submitted' ||
                    submissionStatus === 'returned_for_revision'
                )
            ) {
                autoRemainingRisk += q.points;
            }            else if (submissionStatus === 'not_submitted' || submissionStatus === 'returned_for_revision') manualRemainingMax += q.points;
        }

        // console.log("manualRemainingMax:",manualRemainingMax)
        questionDetails.push({
            id: q.id,
            title: q.title,
            type: q.correctionType,
            points: q.points,
            status,
            attempts: qData ? qData.attempts : 0,
            pointsEarned
        });
    });

    const noteMax = APP_CONFIG.MAX_NOTE;

    const minAutoScore = Math.max(0, autoScore - autoRemainingRisk);
    const autoProjectedScore = Math.max(0, autoScore);

    const minScore = minAutoScore + manualCurrentScore;
    const currentScore = autoProjectedScore + manualCurrentScore;
    const maxScorePossible =
        autoProjectedScore +
        autoRemainingRisk +
        manualCurrentScore +
        manualRemainingMax;

    const minNote = totalPossiblePoints > 0 ? (minScore / totalPossiblePoints) * noteMax : 0;
    const maxNote = totalPossiblePoints > 0 ? (maxScorePossible / totalPossiblePoints) * noteMax : 0;
    
    // Utiliser getChapterFinalNoteBrute() pour la note sans pénalité (pour affichage dans le bilan)
    const finalNoteBrute = getChapterFinalNoteBrute(chapter, chapterConfig);
    const finalNoteKnown = finalNoteBrute !== null;
    
    // Calculer la pénalité pour cours non validés (pour affichage dans la section cours)
    let coursePenalty = 0;
    if (finalNoteKnown && chapterConfig.courseValidationCount > 0) {
        const totalCourses = chapterConfig.courseValidationCount;
        const validatedCourses = chapter.answeredCourses || 0;
        if (validatedCourses < totalCourses) {
            const finalNoteBruteNum = parseFloat(finalNoteBrute);
            if (finalNoteBruteNum > 2) {
                coursePenalty = 2;
            }
        }
    }
    
    // La note affichée dans le bilan est la note avec pénalités
    const finalNote = (finalNoteBrute - coursePenalty).toFixed(1);
    
    let questionsHtml = '';
    questionDetails.forEach(q => {
        let statusIcon = '';
        let statusText = '';
        let statusClass = '';

        // Vérifier si c'est une correction manuelle du professeur
        if (q.status === 'corrected' || q.manualCorrectionStatus === 'corrected') {
            // Règle pour corrections manuelles
            if (q.pointsEarned >= q.points) {
                statusIcon = '✅';
                statusClass = 'correct';
            } else if (q.pointsEarned > 0) {
                statusIcon = '🟠';
                statusClass = 'partial';
            } else {
                statusIcon = '❌';
                statusClass = 'incorrect';
            }
            statusText = 'Corrigé';
        } else {
            // Règle classique pour réponses auto / en attente
            switch (q.status) {
                case 'correct':
                    statusIcon = '✅';
                    statusText = q.attempts > 1 ? `${q.attempts} essais` : '1 essai';
                    statusClass = 'correct';
                    break;
                case 'incorrect':
                    statusIcon = '❌';
                    statusText = q.attempts > 0 ? `${q.attempts} essai${q.attempts > 1 ? 's' : ''}` : 'Non réussie';
                    statusClass = 'incorrect';
                    break;
                case 'unanswered':
                    statusIcon = '⚪';
                    statusText = 'Non répondue';
                    statusClass = 'unanswered';
                    break;
                case 'pending':
                    statusIcon = '⏳';
                    statusText = 'En attente';
                    statusClass = 'pending';
                    break;
            }
        }

        questionsHtml += `
            <div class="detail-row">
                <span class="detail-qid">${q.title}</span>
                <span class="detail-type">${q.type}</span>
                <span class="detail-status ${statusClass}">${statusIcon} ${statusText}</span>
                <span class="detail-attempts">Nombre d'essais: ${q.attempts}</span>
                <span class="detail-points">${q.pointsEarned > 0 ? '+' : ''}${q.pointsEarned}/${q.points}</span>
            </div>
        `;
    });

    const modalContent = `
        <div class="modal-overlay" onclick="closeAutoCorrectDetails(event)">
            <div class="modal-content">
                <div class="modal-header">
                    <h3>📊 Bilan du chapitre</h3>
                    <button class="modal-close" onclick="closeAutoCorrectDetails(event)">×</button>
                </div>
                <div class="modal-body">
                    ${submissionStatus === 'validated' && typeof chapter.noteSur20 !== 'undefined' ? `
                        <div class="note-item">
                            <span class="note-label">Note finale</span>
                            <span class="note-value final">${chapter.noteSur20} sur 20</span>
                        </div>
                    ` : ''}
                    <div class="section-title">📋 Résumé</div>
                    <div class="note-range">
                        <div class="note-item">
                            <span class="note-label">Points auto-corrigés</span>
                            <span class="note-value current">${autoProjectedScore} sur ${autoMaxPossible}</span>
                        </div>
                        <div class="note-item">
                            <span class="note-label">Points semi/manuels validés</span>
                            <span class="note-value current">${manualCurrentScore} sur ${totalPossiblePoints - autoMaxPossible}</span>
                        </div>
                        <div class="note-item">
                            <span class="note-label">Total acquis actuellement</span>
                            <span class="note-value current">${currentScore} sur ${totalPossiblePoints}</span>
                        </div>
                        <div class="note-item">
                            <span class="note-label">Total minimal possible</span>
                            <span class="note-value min">${minScore} sur ${totalPossiblePoints}</span>
                        </div>
                        <div class="note-item">
                            <span class="note-label">Note minimale possible</span>
                            <span class="note-value min">${minNote.toFixed(1)} sur 20</span>
                        </div>
                        <div class="note-item">
                            <span class="note-label">Note maximale possible</span>
                            <span class="note-value max">${maxNote.toFixed(1)} sur 20</span>
                        </div>
                    </div>
                    ${chapterConfig.courseValidationCount > 0 ? `
                    <div class="section-title">📚 Cours validés</div>
                    <div class="note-range">
                        <div class="note-item">
                            <span class="note-label">Cours marqués comme lus</span>
                            <span class="note-value current">${chapter.answeredCourses || 0} sur ${chapterConfig.courseValidationCount}</span>
                        </div>
                        ${coursePenalty > 0 ? `
                        <div class="note-item">
                            <span class="note-label">Pénalité appliquée</span>
                            <span class="note-value min">-${coursePenalty}</span>
                        </div>
                        ` : ''}
                    </div>
                    ` : ''}
                    <div class="section-title">📝 Détail par question</div>
                    <div class="questions-list">
                        ${questionsHtml}
                    </div>
                </div>
            </div>
        </div>
    `;

    let existingModal = document.getElementById('auto-correct-details-modal');
    if (existingModal) existingModal.remove();

    const modalDiv = document.createElement('div');
    modalDiv.id = 'auto-correct-details-modal';
    modalDiv.innerHTML = modalContent;
    document.body.appendChild(modalDiv);

    if (!document.getElementById('auto-correct-modal-style')) {
        const style = document.createElement('style');
        style.id = 'auto-correct-modal-style';
        style.textContent = `
            .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 1rem; }
            .modal-content { background: white; border-radius: 12px; max-width: 600px; width: 100%; max-height: 80vh; overflow-y: auto; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
            .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.5rem; border-bottom: 1px solid #eee; }
            .modal-header h3 { margin: 0; font-size: 1.25rem; }
            .modal-close { background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #666; padding: 0; line-height: 1; }
            .modal-close:hover { color: #333; }
            .modal-body { padding: 1.5rem; }
            .section-title { font-weight: bold; margin: 1.5rem 0 0.75rem; font-size: 1rem; color: #333; }
            .note-range { background: #f8f9fa; padding: 1rem; border-radius: 8px; margin-top: 1rem; }
            .note-item { display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid #eee; }
            .note-item:last-child { border-bottom: none; }
            .note-label { color: #666; }
            .note-value { font-weight: bold; font-size: 1.1rem; }
            .note-value.current { color: #2c3e50; }
            .note-value.min { color: #e74c3c; }
            .note-value.max { color: #27ae60; }
            .note-value.final { color: #34495e; font-weight: bold; font-size: 1.2rem; }
            .questions-list { border: 1px solid #eee; border-radius: 8px; overflow: hidden; }
            .detail-row { display: grid; grid-template-columns: 95px 70px 1fr 130px 50px; gap: 0.5rem; padding: 0.5rem 0.75rem; align-items: center; border-bottom: 1px solid #eee; font-size: 0.8rem; }
            .detail-row:last-child { border-bottom: none; }
            .detail-qid { font-weight: bold; font-family: monospace; font-size: 0.8rem; }
            .detail-type { font-size: 0.65rem; color: #666; text-transform: uppercase; background: #f0f0f0; padding: 0.1rem 0.3rem; border-radius: 3px; text-align: center; }
            .detail-status { display: flex; align-items: center; gap: 0.2rem; font-size: 0.75rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .detail-status.correct { color: #27ae60; }
            .detail-status.incorrect { color: #e74c3c; }
            .detail-status.unanswered { color: #95a5a6; }
            .detail-status.pending { color: #f39c12; }
            .detail-status.final { color: #34495e; }
            .detail-status.partial { color: #f39c12; }
            .detail-attempts { color: #888; font-size: 0.7rem; text-align: center; }
            .detail-points { text-align: right; font-weight: bold; font-family: monospace; font-size: 0.85rem; }
        `;
        document.head.appendChild(style);
    }
}



/**
 * Fermer le modal de détails
 */
function closeAutoCorrectDetails(event) {
    if (event) {
        event.stopPropagation();
    }
    const modal = document.getElementById('auto-correct-details-modal');
    if (modal) {
        modal.remove();
    }
}

// ============================================================================
// GESTION DES RENDUS DE CHAPITRE
// ============================================================================

/**
 * Gère la soumission d'un chapitre (rendu par l'apprenant)
 * En mode examen : valide toutes les réponses comme avant
 * En mode normal : soumet via ProgressManager
 */
async function handleSubmitChapter() {
    const chapterConfig = window.currentChapterConfig || 
                          window.chaptersIndex?.chapters?.find(ch => ch.id == currentChapterId);
    
    // MODE EXAMEN : comportement comme l'ancien bouton "Valider toutes les réponses"
    // Corrigé : Déclarer submissionStatus APRÈS avoir récupéré le chapitre
    let submissionStatus = 'not_submitted';
    
    // Récupérer le chapitre AVANT de l'utiliser
    const chapter = currentProgress?.chapters?.[currentChapterId];
    if (chapter) {
        submissionStatus = chapter.submissionStatus || 'not_submitted';
    }

    if (chapterConfig?.examMode === true) {
        validateAllQuestions();
        
        // Après validation en mode examen, on soumet aussi le chapitre
        const pm = getProgressManager();
        if (pm.submitChapter && currentProgress && currentChapterId) {
            const deadline = chapterConfig.submissionDeadline || null;
            pm.submitChapter(currentProgress, currentChapterId, deadline);
            
            if (pm.saveProgress && currentStudentId) {
                await pm.saveProgress(currentStudentId, currentProgress);
            }
            
            // Verrouiller le chapitre
            lockChapterAfterSubmission();
            
            // Mettre à jour le bouton
            updateSubmitButton();
            
            // Mettre à jour tous les indicateurs
            updateAllProgressIndicators();
        }
        return;
    }
    
    // MODE NORMAL : soumission via ProgressManager avec confirmation
    const pm = getProgressManager();
    if (!pm.submitChapter || !currentProgress || !currentChapterId) {
        console.warn('[handleSubmitChapter] ProgressManager non initialisé');
        return;
    }

    // Supprimer cette ligne car chapter est déjà défini plus haut
    // const chapter = currentProgress.chapters[currentChapterId];
    if (!chapter) return;

    const config = window.chaptersIndex?.chapters?.find(ch => ch.id == currentChapterId);
    if (!config) return;

    // Vérifier si déjà rendu (sauf si demandé de re-rendre)
    if (submissionStatus === 'submitted' || submissionStatus === 'late_submitted') {
        alert('⚠️ Ce chapitre a déjà été rendu et est en attente de correction.');
        return;
    }

    if (submissionStatus === 'validated') {
        alert('✅ Ce chapitre a déjà été validé par votre évaluateur.');
        return;
    }

    // Récupérer la progression
    const completionPercent = chapter.completionPercent || 0;

    // Message de confirmation
    let confirmMessage = '';
    if (completionPercent < 100) {
        confirmMessage = `⚠️ Votre progression est de ${completionPercent}%.\n\n`;
    }
    if (submissionStatus === 'returned_for_revision') {
        confirmMessage += '🔄 Vous êtes sur le point de re-rendre ce chapitre après les retouches demandées.\n\n';
    }
    confirmMessage += 'Êtes-vous sûr de vouloir rendre votre copie ?\n';
    confirmMessage += 'Cette action est irréversible et toutes les réponses seront figées.';

    if (!confirm(confirmMessage)) {
        return;
    }

    // Récupérer la deadline
    const deadline = config.submissionDeadline || null;

    // Soumettre via ProgressManager
    pm.submitChapter(currentProgress, currentChapterId, deadline);

    // Sauvegarder
    if (pm.saveProgress && currentStudentId) {
        await pm.saveProgress(currentStudentId, currentProgress);
    }

    // Verrouiller le chapitre
    lockChapterAfterSubmission();

    // Mettre à jour le bouton
    updateSubmitButton();

    // Mettre à jour tous les indicateurs
    updateAllProgressIndicators();

    // Feedback
    alert('✅ Votre copie a été rendue avec succès !');
}

/**
 * Met à jour l'affichage du bouton de rendu selon le statut
 */
function updateSubmitButton() {
    const btn = document.getElementById('submit-chapter-btn');
    if (!btn || !currentProgress || !currentChapterId) return;

    const chapter = currentProgress.chapters[currentChapterId];
    if (!chapter) return;

    // [DEBUG] Afficher le JSON du chapitre en console pour vérification
    console.log('=== [DEBUG] Chapitre en cours (JSON complet) ===');
    console.log(chapter);
    console.log('================================================');

    const submissionStatus = chapter.submissionStatus || 'not_submitted';

    switch (submissionStatus) {
        case 'not_submitted':
            btn.innerHTML = '📤 Rendre ce travail';
            btn.className = 'btn btn-primary';
            btn.onclick = handleSubmitChapter;
            btn.disabled = false;
            break;
        case 'submitted':
            btn.innerHTML = '📝 Rendu - En attente de correction';
            btn.className = 'btn btn-secondary';
            btn.disabled = true;
            // Verrouiller le chapitre car il est soumis
            lockChapterAfterSubmission();
            break;
        case 'late_submitted':
            btn.innerHTML = '⚠️ Rendu - En retard';
            btn.className = 'btn btn-warning';
            btn.disabled = true;
            // Verrouiller le chapitre car il est soumis
            lockChapterAfterSubmission();
            break;
        case 'returned_for_revision':
            btn.innerHTML = '🔄 Retouches demandées - Re-rendre';
            btn.className = 'btn btn-primary';
            btn.onclick = handleSubmitChapter;
            btn.disabled = false;
            break;
        case 'validated':
            btn.innerHTML = '✅ Validé par votre évaluateur';
            btn.className = 'btn btn-success';
            btn.disabled = true;
            break;
        default:
            btn.innerHTML = '📤 Rendre ce travail';
            btn.className = 'btn btn-primary';
            btn.onclick = handleSubmitChapter;
            btn.disabled = false;
    }
}

/**
 * Verrouille le chapitre après soumission (mode examen)
 * Désactive tous les inputs et boutons, rend le contenu consultable
 */
function lockChapterAfterSubmission() {
    // Désactiver tous les inputs (mais garder consultable)
    const inputs = document.querySelectorAll('input, textarea, select');
    inputs.forEach(input => {
        input.disabled = true;
        input.style.pointerEvents = 'none';
        input.style.opacity = '0.7';
    });

    // Désactiver tous les boutons de validation
    const buttons = document.querySelectorAll('.btn-check-answer');
    buttons.forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.pointerEvents = 'none';
    });

    // Désactiver le bouton de validation globale
    const globalValidation = document.querySelector('.global-validation');
    if (globalValidation) {
        globalValidation.style.display = 'none';
    }

    // Désactiver les boutons de validation de cours
    const courseButtons = document.querySelectorAll('.course-validation button');
    courseButtons.forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = '0.5';
    });

    // Afficher un message de confirmation
    const mainContent = document.querySelector('.chapter-content');
    if (mainContent) {
        // Vérifier si le message existe déjà
        const existingMsg = document.getElementById('submission-confirmation-msg');
        if (!existingMsg) {
            const msgDiv = document.createElement('div');
            msgDiv.id = 'submission-confirmation-msg';
            msgDiv.className = 'feedback success show';
            msgDiv.innerHTML = '📝 <strong>Copie rendue</strong> - Plus de modifications possibles.<br>Votre évaluateur la corrigera prochainement.';
            msgDiv.style.textAlign = 'center';
            msgDiv.style.padding = '1rem';
            msgDiv.style.margin = '1rem 0';
            msgDiv.style.borderRadius = '8px';
            msgDiv.style.backgroundColor = '#d4edda';
            msgDiv.style.border = '1px solid #c3e6cb';
            mainContent.insertBefore(msgDiv, mainContent.firstChild);
        }
    }
}

// Exports globaux
window.handleAnswer = handleAnswer;
window.handleOpenAnswer = handleOpenAnswer;
window.validateAllQuestions = validateAllQuestions;
window.validateCourse = validateCourse;
window.toggleHint = toggleHint;
window.updateAllProgressIndicators = updateAllProgressIndicators;
window.showDetailsBilanChapter = showDetailsBilanChapter;
window.closeAutoCorrectDetails = closeAutoCorrectDetails;
window.handleSubmitChapter = handleSubmitChapter;
window.updateSubmitButton = updateSubmitButton;
window.getChapterFinalNote = getChapterFinalNote; // Exporté pour chapterDetector.js (avec pénalité)
window.getChapterFinalNoteBrute = getChapterFinalNoteBrute; // Exporté pour showDetailsBilanChapter (sans pénalité)

console.log('✅ chapitre.js chargé - Fonctionnalités des chapitres actives');
