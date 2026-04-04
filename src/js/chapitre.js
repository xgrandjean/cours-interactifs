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

    // Gérer le cas où la réponse est vide (effacement d'une réponse précédente)
    if (answer === '' || answer === null || answer === undefined) {
        const now = new Date().toISOString();
        
        // Sauvegarder l'ancienne réponse dans l'historique si elle existait
        if (question.answered && question.answer !== null) {
            question.attemptHistory.push({
                answer: question.answer,
                isCorrect: question.isCorrect,
                score: question.score,
                answeredAt: question.answeredAt
            });
        }
        
        // Marquer comme non répondue
        question.answered = false;
        question.answer = null;
        question.isCorrect = null;
        question.score = 0;
        question.attempts++;
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
    pm.recordAnswer(currentProgress, currentChapterId, questionId, answer, isCorrect, score);

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

    const chapterConfig = window.chaptersIndex?.chapters?.find(ch => ch.id == currentChapterId);
    if (!chapterConfig) return;

    // =========================
    // Progression globale
    // =========================
    // Utiliser directement les données du JSON
    const totalQuestions = chapterConfig.questionCount || chapterConfig.questions.length;
    const totalValidatableCourses = chapterConfig.courseValidationCount || 0;
    const totalItems = chapterConfig.progressItemCount || (totalQuestions + totalValidatableCourses);
    
    // Compter les questions répondues (exclure les cours)
    const answeredQuestions = Object.values(chapter.questions || {}).filter(q => q.answered && !q.questionHash?.startsWith('course_')).length;
    
    // Compter les cours validés depuis le progressManager (les cours sont stockés avec des IDs course_0, course_1, etc.)
    let answeredCourses = 0;
    if (chapter.questions) {
        Object.keys(chapter.questions).forEach(key => {
            if (key.startsWith('course_') && chapter.questions[key].answered && chapter.questions[key].isCorrect === true) {
                answeredCourses++;
            }
        });
    }

    const completedItems = answeredQuestions + answeredCourses;
    const globalPercentage = totalItems > 0
        ? Math.round((completedItems / totalItems) * 100)
        : 0;

    const progressValue = document.getElementById('chapterProgressValue');
    if (progressValue) {
        progressValue.textContent = globalPercentage;
    }

    // Ajouter un title au cercle de progression
    const progressCircle = document.getElementById('chapterProgressCircle');
    if (progressCircle) {
        // Le total inclut les questions ET les cours validables uniquement
        progressCircle.title = `Avancement dans le chapitre : ${completedItems} éléments complétés sur ${totalItems} au total (${answeredQuestions}/${totalQuestions} questions, ${answeredCourses}/${totalValidatableCourses} cours)`;
    }

    // =========================
    // Questions auto-corrigées
    // =========================
    const autoQuestions = chapterConfig.questions.filter(q => q.correctionType === 'auto');

    let autoTotalPoints = 0;
    let autoEarnedPoints = 0;
    let penaltySum = 0;
    let totalSuccessQuestions = 0;
    let firstAttemptSuccessCount = 0;
    let answeredQuestionsAuto = 0;

    console.log('=== DONNÉES DES QUESTIONS AUTO-CORRIGÉES ===');

    autoQuestions.forEach(q => {
        autoTotalPoints += q.points;

        const qData = chapter.questions[q.id];

        if (!qData || qData.attempts <= 0) {
            penaltySum -= q.points;
            console.log(`Q${q.id}: ${q.points}pts, 0 essais, PAS RÉPONDUE → -${q.points}pts`);
            return;
        }

        answeredQuestionsAuto++;

        if (qData.isCorrect === true) {
            totalSuccessQuestions++;
            autoEarnedPoints += q.points;

            if (qData.attempts === 1) {
                firstAttemptSuccessCount++;
            }

            let pointsAfterPenalty = q.points - ((qData.attempts - 1) * q.points);
            const maxPenalty = q.points * 2;
            pointsAfterPenalty = Math.max(-maxPenalty, pointsAfterPenalty);

            penaltySum += pointsAfterPenalty;

            console.log(`Q${q.id}: ${q.points}pts, ${qData.attempts} essais, points après pénalité=${pointsAfterPenalty}`);
        } else {
            penaltySum -= q.points;
            console.log(`Q${q.id}: ${q.points}pts, ${qData.attempts} essais, NON RÉUSSIE → -${q.points}pts`);
        }
    });

    console.log('==========================================');
    console.log(`Points totaux (auto-corrigés): ${autoTotalPoints}`);
    console.log(`Points obtenus (auto-corrigés): ${autoEarnedPoints}`);
    console.log(`Somme (points - pénalité): ${penaltySum}`);

    const firstAttemptRate = totalSuccessQuestions > 0
        ? Math.round((firstAttemptSuccessCount / totalSuccessQuestions) * 100)
        : 0;

    let reussite = 0;
    if (autoTotalPoints > 0) {
        reussite = (penaltySum / autoTotalPoints) * 100;
        reussite = Math.max(-100, Math.min(100, reussite));
    }

    const noteMax = APP_CONFIG.MAX_NOTE;
    const p = reussite / 100;
    const note = noteMax * (1 + p) / 2;

    const avctBonneReponse = autoTotalPoints > 0
        ? (autoEarnedPoints / autoTotalPoints) * 100
        : 0;

    const avctReponse = autoQuestions.length > 0
        ? (answeredQuestionsAuto / autoQuestions.length) * 100
        : 0;

    console.log(`% de réponses au premier essai (auto-corrigés) = ${firstAttemptRate}% (${firstAttemptSuccessCount}/${totalSuccessQuestions} questions réussies)`);
    console.log(`Avancement (bonnes réponses auto-corrigées) = ${avctBonneReponse.toFixed(1)}%`);
    console.log(`Avancement (réponses données auto-corrigées) = ${avctReponse.toFixed(1)}%`);
    console.log(`reussite = ${reussite.toFixed(1)}% (p = ${p.toFixed(2)})`);
    console.log(`Note = ${noteMax} × (1 + ${p.toFixed(2)}) / 2 = ${note.toFixed(1)}/20`);
    console.log('==========================================');

    const accuracy = Math.round((reussite + 100) / 2);

    // Points obtenus calculés à partir de la note
    const pointsObtenus = autoTotalPoints > 0
        ? Math.round(((note / 20) * autoTotalPoints) * 10) / 10
        : 0;

    const statsDiv = document.getElementById('auto-correct-stats');

    if (statsDiv) {
        const pointsPercentage = autoTotalPoints > 0
            ? (pointsObtenus / autoTotalPoints) * 100
            : 0;

        statsDiv.innerHTML = `
            <div class="stats-card">
                <h3>
                    📊 Exercices auto-corrigés (${autoTotalPoints} points attribuables sur ${chapterConfig.maxPoints})
                    <button class="details-btn" onclick="showDetailsBilanChapter()" title="Bilan des exercices"> ⭐ Voir le bilan</button>
                </h3>
                <div class="stats-grid">
                    <div class="stat-item" title="Pourcentage d'exercices auto-corrigés réussis sur le total.">
                        <span>📈 Avancement</span>
                        <strong>${Math.round(avctBonneReponse)}%</strong>
                    </div>
                    <div class="stat-item" title="Taux de réussite au premier essai.">
                        <span>🥇 1er essai</span>
                        <strong>${firstAttemptRate}%</strong>
                    </div>
                    <div class="stat-item accuracy-item" title="Mesure la qualité des réponses en tenant compte du nombre d'essais.">
                        <span>🎯 Précision</span>
                        <strong>${accuracy}%</strong>
                    </div>
                    <div class="stat-item" title="Points obtenus à partir de la note calculée sur les exercices auto-corrigés.">
                        <span>⭐ Points obtenus</span>
                        <strong>${pointsObtenus}/${autoTotalPoints}</strong>
                    </div>
                </div>
            </div>
        `;
    }

    console.log('[updateAllProgressIndicators]', {
        globalPercentage,
        autoAnswered: autoEarnedPoints,
        autoTotal: autoTotalPoints,
        firstAttemptRate,
        accuracy,
        note,
        pointsObtenus
    });
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

function handleAnswer(elementId, correctionType, correctAnswer, points, answerType, correctAnswersStr = '') {
    let userAnswer;
    let feedback = document.getElementById(`feedback_${elementId}`);
    
    const question = document.querySelector(`.question-section[data-question-id="${elementId}"]`);
    
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
        if (!element) {
            showFeedback(feedback, 'Champ de réponse introuvable.', 'error');
            return false;
        }
        // Pour les questions semi-auto, on permet les réponses vides
        userAnswer = element.value.trim().toLowerCase();
    } else if (answerType === 'open') {
        const element = document.getElementById(`open_${elementId}`);
        if (!element || !element.value.trim()) {
            showFeedback(feedback, 'Veuillez écrire une réponse.', 'error');
            return false;
        }
        userAnswer = element.value.trim();
    } else if (answerType === 'selection') {
        const element = document.getElementById(elementId);

        if (!element || !element.value) {
            showFeedback(feedback, 'Veuillez sélectionner une réponse.', 'error');
            return false;
        }

        userAnswer = parseInt(element.value);
    }
    
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


function handleOpenAnswer(elementId, correctionType, points, minLength) {
    const textarea = document.getElementById(elementId);
    const feedback = document.getElementById(`feedback_${elementId}`);
    const answer = textarea.value.trim();
    
    // Pour les questions ouvertes, on enregistre TOUJOURS la réponse
    // Même si elle est vide ou trop courte (on a le droit de vider une réponse)
    let message = '';
    let etat = null;

    if (!answer) {
        message = `❌ Réponse vide.`;
    } else if (minLength > 0 && answer.length < minLength) {
        message = `❌ Réponse (${answer.length}/${minLength} caractères). Trop courte.`;
        etat = false;
    } else {
        message = `⏳ Réponse enregistrée (${answer.length} caractères). En attente de correction.`;
    }
    
    // Question ouverte : toujours "En attente de correction" (isCorrect = null)
    // Jamais désactivée, l'élève peut modifier sa réponse
    processAnswerResult({
        feedback,
        message: message,
        type: 'info',
        answerId: elementId,
        answerValue: answer,
        isCorrect: etat,
        needsReview: true
    });
    
    syncAnswerToProgress(elementId, answer, etat, 0);
    
    return true;
}

// Fonctions de correction...
function handleAutoCorrection(feedback, userAnswer, correctAnswer, points, answerType, elementId) {
    const question = document.querySelector(`.question-section[data-question-id="${elementId}"]`);
    
    if (question) {
        const result = checkQuestion(question);
        console.log("result vers feedback:", result.isCorrect);
        if (result.isCorrect) {
            console.log('✅ Points à ajouter:', points);
            processAnswerResult({
                feedback, message: `✅ Correct !`, type: 'success',
                points, shouldAwardPoints: true,
                answerId: elementId, answerValue: result.userAnswer, isCorrect: true,
            });
            
            // Désactiver le bouton et la question pour les questions auto-corrigées correctes
            console.log("désactivation de la question !")
            disableAutoCorrectedQuestion(question);
        } else {
            processAnswerResult({
                feedback, message: '❌ Incorrect. Essayez encore !', type: 'error',
                answerId: elementId, answerValue: result.userAnswer, isCorrect: false,
            });
        }
        
        displayIndividualFeedback(question, result.isCorrect, true);
        syncAnswerToProgress(elementId, result.userAnswer, result.isCorrect, result.isCorrect ? points : 0);

        return result.isCorrect;
    }
    
    // Fallback...
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
            feedback, message: `✅ Correct !`, type: 'success',
            points, shouldAwardPoints: true,
            answerId: elementId, answerValue: userAnswer, isCorrect: true,
        });
    } else {
        processAnswerResult({
            feedback, message: '❌ Incorrect. Essayez encore !', type: 'error',
            answerId: elementId, answerValue: userAnswer, isCorrect: false,
        });
    }

    return isCorrect;
}

function handleSemiCorrection(feedback, userAnswer, correctAnswer, points, answerType, correctAnswersStr, elementId) {
    let isCorrect = null;  // Par défaut : "En attente"
    let feedbackMessage = '';
    const question = document.querySelector(`.question-section[data-question-id="${elementId}"]`);

    
    let possibleAnswers = [];
    if (correctAnswersStr) {
        possibleAnswers = correctAnswersStr.split(';').map(s => s.trim().toLowerCase());
    }
    
    if (answerType === 'short') {
        // Pour les réponses courtes semi-auto, on enregistre TOUJOURS
        // Même si la réponse est vide (on a le droit de vider une réponse)
        if (possibleAnswers.length > 0 && possibleAnswers.includes(userAnswer)) {
            // Réponse exacte dans la liste → Correct
            isCorrect = true;
            feedbackMessage = `✅ Bonne réponse !`;
            updateUserPoints(points);
            disableAutoCorrectedQuestion(question);

        } else if (!userAnswer) {
            // Réponse vide → En attente
            // TODO
            feedbackMessage = `❌ Réponse vide`;
            isCorrect = null;
        } else {
            // Réponse donnée mais pas dans la liste → En attente
            feedbackMessage = `⏳ Réponse enregistrée. En attente de correction.`;
            isCorrect = null;
        }
    } else {
        // Question ouverte semi → toujours "En attente"
        feedbackMessage = `⏳ Réponse enregistrée. En attente de correction.`;
        isCorrect = null;
    }
    
    showFeedback(feedback, feedbackMessage, isCorrect === null ? 'warning' : 'success');
    saveAnswer(elementId, userAnswer, isCorrect, isCorrect === null);
    
    syncAnswerToProgress(elementId, userAnswer, isCorrect, isCorrect ? points : 0);
    
    return isCorrect;
}

function handleManualCorrection(feedback, userAnswer, elementId, points) {
    processAnswerResult({
        feedback,
        message: `📝 Réponse enregistrée. +${points} point(s) après validation du professeur.`,
        type: 'info',
        answerId: elementId,
        answerValue: userAnswer,
        needsReview: true
    });
    
    syncAnswerToProgress(elementId, userAnswer, null, 0);
    
    return true;
}

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

// Fonctions utilitaires...
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

function checkQuestion(question) {
    const correctionType = question.dataset.correctionType;
    const points = parseInt(question.dataset.points);
    
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
    
    if (correctionType === 'auto') {
        if (qcmRadio) {
            const button = question.querySelector('.btn-check-answer');
            const onclickAttr = button.getAttribute('onclick');
            const match = onclickAttr.match(/,\s*(\d+),/);
            if (match) {
                const correctAnswer = parseInt(match[1]);
                isCorrect = userAnswer === correctAnswer;
            }
        }
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
        else if (shortInput) {
            let correctAnswers = [];
            const button = question.querySelector('.btn-check-answer');
            const onclickAttr = button.getAttribute('onclick');
            const match = onclickAttr.match(/, '([^']*)'\)$/);
            if (match && match[1]) {
                correctAnswers = match[1].split(';').map(s => s.trim().toLowerCase());
            }
            isCorrect = correctAnswers.includes(userAnswer);
        }
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
            isCorrect = true;
        }
    }
    else if (correctionType === 'manuel') {
        isCorrect = true;
    }
    
    return { hasAnswer: true, isCorrect: isCorrect, points: points, userAnswer: userAnswer };
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
            globalFeedback.className = 'feedback show warning';
            globalFeedback.innerHTML = `
                ⚠️ Validation annulée.<br>
                Veuillez répondre aux questions manquantes avant de valider.
            `;
            return false;
        }
        
        globalFeedback.innerHTML = '';
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
    
    updateChapterProgress();
    
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
    const chapterConfig = window.chaptersIndex?.chapters?.find(ch => ch.id == currentChapterId);
    if (!chapterConfig) return;
    
    // Initialiser le chapitre si nécessaire
    if (pm.ensureChapterInitialized && window.chaptersIndex) {
        pm.ensureChapterInitialized(currentProgress, window.chaptersIndex);
    }
    
    // Créer une entrée pour le cours si elle n'existe pas
    if (!currentProgress.chapters[currentChapterId].questions[courseId]) {
        currentProgress.chapters[currentChapterId].questions[courseId] = {
            questionHash: `course_${courseId}`,
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
 * Restaurer TOUTES les réponses sauvegardées (cours + questions)
 * Centralise la restauration au même endroit que la mise à jour des stats
 */
function restoreAllAnswers() {
    if (!currentProgress || !currentChapterId) return;
    
    const chapter = currentProgress.chapters[currentChapterId];
    if (!chapter || !chapter.questions) return;
    
    // Restaurer les cours lus
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
    
    // Restaurer les réponses aux questions
    Object.entries(chapter.questions).forEach(([questionId, questionData]) => {
        // Skip les cours (déjà traités)
        if (questionId.startsWith('course_')) return;
        
        // Restaurer si la question a été répondue (même si la réponse est vide)
        if (questionData.answered && questionData.answer !== undefined) {
            restoreQuestionAnswer(questionId, questionData);
            
            const question = document.querySelector(`.question-section[data-question-id="${questionId}"]`);
            if (!question) return;
            
            const correctionType = question.dataset.correctionType;
            const hasTextarea = question.querySelector('textarea') !== null;
            
            // 🛡️ ROBUSTESSE : Les questions ouvertes (textarea) ne sont JAMAIS désactivées
            // Même si isCorrect === true par erreur dans les données
            if (hasTextarea) {
                // Réactiver tous les inputs et le bouton si jamais ils étaient désactivés
                const button = question.querySelector('.btn-check-answer');
                if (button && button.disabled) {
                    button.disabled = false;
                    button.textContent = 'Vérifier';
                    button.style.backgroundColor = '';
                    button.style.pointerEvents = '';
                }
                
                const inputs = question.querySelectorAll('input, select, textarea');
                inputs.forEach(input => {
                    if (input.disabled) {
                        input.disabled = false;
                        input.style.pointerEvents = '';
                        input.style.opacity = '';
                    }
                });
                
                question.classList.remove('completed');
                question.style.opacity = '';
                
                // Afficher "En attente" si la réponse a une longueur suffisante
                const minLength = parseInt(question.dataset.minLength || '0');
                const answerLength = (questionData.answer || '').length;
                if (answerLength >= minLength) {
                    updatePendingStatus(question, 'open');
                }
                
                return; // Question ouverte traitée, on passe à la suivante
            }
            
            // Pour les autres types de questions (QCM, short, select)
            // Cas 1 : Question correcte (isCorrect === true) - auto ou semi
            if (questionData.isCorrect === true) {
                if (correctionType === 'auto' || correctionType === 'semi') {
                    disableAutoCorrectedQuestion(question);
                }
            }
            // Cas 2 : Question semi-auto incorrecte - reste modifiable, statut "En attente"
            else if (questionData.isCorrect === false && correctionType === 'semi') {
                // Ne pas désactiver, juste mettre à jour le feedback visuel
                updatePendingStatus(question, 'semi');
            }
        }
    });
}

/**
 * Mettre à jour le statut "En attente" (remplace "Incorrect" dans le feedback)
 */
function updatePendingStatus(question, type) {
    // Mettre à jour le feedback pour afficher "En attente" au lieu de "Incorrect"
    let feedbackDiv = question.querySelector('.question-feedback');
    if (!feedbackDiv) {
        feedbackDiv = document.createElement('div');
        feedbackDiv.className = 'question-feedback';
        question.querySelector('.question-box').appendChild(feedbackDiv);
    }
    
    feedbackDiv.textContent = '⏳ En attente';
    feedbackDiv.className = 'question-feedback pending';
    feedbackDiv.style.cssText = 'position: absolute; right: 1rem; top: 1rem; font-size: 1.2rem; font-weight: bold; color: #f39c12;';
    
    // Les inputs restent activés et modifiables
    question.classList.add('pending');
}

/**
 * Restaurer la réponse d'une question spécifique
 */
function restoreQuestionAnswer(questionId, questionData) {
    const pm = getProgressManager();
    
    // QCM radio - vérifier si c'est un input radio qui existe
    const radio = document.querySelector(`input[type="radio"][name="qcm_${questionId}"]`);
    if (radio) {
        const radioSelected = document.querySelector(`input[name="qcm_${questionId}"][value="${questionData.answer}"]`);
        if (radioSelected) {
            radioSelected.checked = true;
            if (!pm.ALLOW_MULTIPLE_ATTEMPTS && questionData.isCorrect === true) {
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
                if (!pm.ALLOW_MULTIPLE_ATTEMPTS && questionData.isCorrect === true) {
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
        if (!pm.ALLOW_MULTIPLE_ATTEMPTS && questionData.isCorrect === true) {
            select.disabled = true;
        }
        return;
    }
    
    // Réponse courte - input text/number
    const shortInput = document.getElementById(`short_${questionId}`);
    if (shortInput) {
        // Gérer le cas où la réponse est vide ou null
        shortInput.value = questionData.answer || '';
        if (!pm.ALLOW_MULTIPLE_ATTEMPTS && questionData.isCorrect === true) {
            shortInput.disabled = true;
        }
        return;
    }
    
    // Réponse ouverte - textarea
    const textarea = document.getElementById(questionId);
    if (textarea && textarea.tagName === 'TEXTAREA') {
        // Gérer le cas où la réponse est vide ou null
        textarea.value = questionData.answer || '';
        if (!pm.ALLOW_MULTIPLE_ATTEMPTS && questionData.isCorrect === true) {
            textarea.disabled = true;
        }
        return;
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
        console.log('Tous les cours ont été lus');
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
        console.log('❌ Pas d\'ID de chapitre trouvé');
        return;
    }
    
    console.log('📌 Chapitre ID:', chapterId);
    
    const chapterConfig = getChapterConfigById(chapterId);
    console.log('📦 Configuration du chapitre:', chapterConfig);
    
    const globalBtn = document.querySelector('.global-validation');
    const allButtons = $$('.question-actions .btn-check-answer');
    
    if (chapterConfig.examMode === true) {
        console.log('🎯 MODE EXAMEN ACTIVÉ');
        
        allButtons.forEach(btn => {
            btn.style.display = 'none';
        });
        console.log(`🔘 ${allButtons.length} boutons individuels masqués`);
        
        if (globalBtn) {
            globalBtn.classList.remove('hidden');
            console.log('🔘 Bouton global AFFICHÉ');
        } else {
            console.log('❌ Bouton global non trouvé dans le DOM');
        }
    } else {
        console.log('📚 MODE NORMAL (examen désactivé)');
        
        allButtons.forEach(btn => {
            btn.style.display = 'block';
        });
        console.log(`🔘 ${allButtons.length} boutons individuels affichés`);
        
        if (globalBtn) {
            globalBtn.classList.add('hidden');
            console.log('🔘 Bouton global masqué');
        } else {
            console.log('❌ Bouton global non trouvé dans le DOM');
        }
    }
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
                const response = await fetch('../chapters/chapters_index.json');
                if (response.ok) {
                    window.chaptersIndex = await response.json();
                    console.log('[ChaptersIndex] Chargé depuis JSON', window.chaptersIndex);
                }
            }
            
            if (window.chaptersIndex && window.chaptersIndex.chapters) {
                const chapterConfig = window.chaptersIndex.chapters.find(ch => ch.id == chapterId);
                if (chapterConfig) {
                    window.currentChapterConfig = chapterConfig;
                    console.log('[currentChapterConfig] Configuration chargée pour le chapitre', chapterId);
                }
            }
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
            // IMPORTANT : await pour récupérer la progression (fonction asynchrone)
            currentProgress = await pm.getOrCreateStudentProgress(
                currentStudentId,
                'Étudiant',
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
            
            console.log('[progressManager] progress loaded', currentProgress);
            console.log('[progressManager] restoring chapter', currentChapterId);
        }
    }
    
    initializeQCM();
    initializeStats();
    applyChapterMode();
    updateChapterProgress();
    
    // Restaurer TOUTES les réponses (cours + questions) de manière centralisée
    setTimeout(() => {
        restoreAllAnswers();
        updateAllProgressIndicators();
    }, 300);
}

// Initialisation automatique
document.addEventListener('DOMContentLoaded', () => {
    initChapterPage();
});

/**
 * Afficher le modal de détails du bilan du chapitre
 * Affiche : détail par question (toutes), note min et max possibles
 */
function showDetailsBilanChapter() {
    if (!currentProgress || !currentChapterId) return;

    const chapter = currentProgress.chapters[currentChapterId];
    if (!chapter) return;

    const chapterConfig = window.chaptersIndex?.chapters?.find(ch => ch.id == currentChapterId);
    if (!chapterConfig) return;

    // Utiliser directement les questions du JSON
    const allQuestions = chapterConfig.questions;
    const totalPossiblePoints = chapterConfig.maxPoints || allQuestions.reduce((sum, q) => sum + q.points, 0);
    // console.log(allQuestions)
    // Calculer l'état de chaque question
    let currentScore = 0;
    let remainingPoints = 0;
    let totalPointsAcquis = 0; // Total des points acquis (pour affichage)
    const questionDetails = [];

    allQuestions.forEach(q => {
        const qData = chapter.questions[q.id];
        let status = 'unanswered';
        let pointsEarned = 0;
        if (qData && qData.attempts > 0) {
            if (qData.isCorrect === true) {
                status = 'correct';
                // Calculer les points selon le type de correction
                if (q.correctionType === 'auto') {
                    // Auto-corrigé : points avec pénalité (peut être négatif)
                    pointsEarned = q.points - ((qData.attempts - 1) * q.points);
                    const maxPenalty = q.points * 2;
                    pointsEarned = Math.max(-maxPenalty, pointsEarned);
                } else if (q.correctionType === 'semi') {
                    // Semi-auto correct : total des points
                    pointsEarned = q.points;
                } else {
                    // Manuel/Obligatoire correct : total des points
                    pointsEarned = q.points;
                }
                totalPointsAcquis += pointsEarned;
                currentScore += pointsEarned;
            } else if (qData.isCorrect === false) {
                // Incorrect (réponse fausse confirmée)
                status = 'incorrect';
                pointsEarned = -q.points;
                currentScore += pointsEarned;
            } else if (qData.isCorrect === null) {
                // En attente de correction
                if (q.correctionType === 'auto') {
                    // Cas rare: question auto avec isCorrect null mais tentatives > 0
                    status = 'incorrect';
                    pointsEarned = -q.points;
                    currentScore += pointsEarned;
                } else {
                    // Semi-auto ou Manuel en attente : 0 point pour l'instant
                    status = 'pending';
                    pointsEarned = 0;
                    // On ne modifie pas currentScore car c'est en attente
                }
            }
        } else {
            // Non répondue
            status = 'unanswered';
            pointsEarned = 0; // 0 point pour les questions non répondues
            remainingPoints += q.points;
        }

        questionDetails.push({
            id: q.id,
            title: q.title,
            type: q.correctionType,
            points: q.points,
            status: status,
            attempts: qData ? qData.attempts : 0,
            pointsEarned: pointsEarned
        });
    });

    // Calculer la note actuelle
    const noteMax = APP_CONFIG.MAX_NOTE;
    const currentNote = totalPossiblePoints > 0
        ? noteMax * (1 + (currentScore / totalPossiblePoints)) / 2
        : 0;

    // Note min: si toutes les questions restantes sont ratées
    const minScore = currentScore - remainingPoints;
    const minNote = totalPossiblePoints > 0
        ? noteMax * (1 + (minScore / totalPossiblePoints)) / 2
        : 0;

    // Note max: si toutes les questions restantes sont réussies du premier coup
    const maxScore = currentScore + remainingPoints;
    const maxNote = totalPossiblePoints > 0
        ? noteMax * (1 + (maxScore / totalPossiblePoints)) / 2
        : 0;

    // Construire le HTML des questions
    let questionsHtml = '';
    questionDetails.forEach(q => {
        let statusIcon = '';
        let statusText = '';
        let statusClass = '';

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
                    <div class="section-title">📋 Résumé</div>

                    <div class="note-range">
                        <div class="note-item">
                            <span class="note-label">Total des points obtenus</span>
                            <span class="note-value current">${totalPointsAcquis} sur ${totalPossiblePoints}</span>
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

                    <div class="section-title">📝 Détail par question</div>
                    <div class="questions-list">
                        ${questionsHtml}
                    </div>
                </div>
            </div>
        </div>
    `;

    // Ajouter le modal au DOM
    let existingModal = document.getElementById('auto-correct-details-modal');
    if (existingModal) {
        existingModal.remove();
    }

    const modalDiv = document.createElement('div');
    modalDiv.id = 'auto-correct-details-modal';
    modalDiv.innerHTML = modalContent;
    document.body.appendChild(modalDiv);

    // Ajouter le CSS du modal s'il n'existe pas déjà
    if (!document.getElementById('auto-correct-modal-style')) {
        const style = document.createElement('style');
        style.id = 'auto-correct-modal-style';
        style.textContent = `
            .modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 1000;
                padding: 1rem;
            }
            .modal-content {
                background: white;
                border-radius: 12px;
                max-width: 600px;
                width: 100%;
                max-height: 80vh;
                overflow-y: auto;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            }
            .modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 1rem 1.5rem;
                border-bottom: 1px solid #eee;
            }
            .modal-header h3 {
                margin: 0;
                font-size: 1.25rem;
            }
            .modal-close {
                background: none;
                border: none;
                font-size: 1.5rem;
                cursor: pointer;
                color: #666;
                padding: 0;
                line-height: 1;
            }
            .modal-close:hover {
                color: #333;
            }
            .modal-body {
                padding: 1.5rem;
            }
            .section-title {
                font-weight: bold;
                margin: 1.5rem 0 0.75rem;
                font-size: 1rem;
                color: #333;
            }
            .section-title:first-child {
                margin-top: 0;
            }
            .summary-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
                gap: 0.75rem;
                margin-bottom: 1rem;
            }
            .summary-item {
                background: #f8f9fa;
                padding: 0.75rem;
                border-radius: 8px;
                text-align: center;
            }
            .summary-label {
                display: block;
                font-size: 0.8rem;
                color: #666;
                margin-bottom: 0.25rem;
            }
            .summary-value {
                display: block;
                font-weight: bold;
                font-size: 1.1rem;
                color: #2c3e50;
            }
            .questions-list {
                border: 1px solid #eee;
                border-radius: 8px;
                overflow: hidden;
            }
            .detail-row {
                display: grid;
                grid-template-columns: 95px 70px 1fr 130px 50px;
                gap: 0.5rem;
                padding: 0.5rem 0.75rem;
                align-items: center;
                border-bottom: 1px solid #eee;
                font-size: 0.8rem;
            }
            .detail-row:last-child {
                border-bottom: none;
            }
            .detail-qid {
                font-weight: bold;
                font-family: monospace;
                font-size: 0.8rem;
            }
            .detail-type {
                font-size: 0.65rem;
                color: #666;
                text-transform: uppercase;
                background: #f0f0f0;
                padding: 0.1rem 0.3rem;
                border-radius: 3px;
                text-align: center;
            }
            .detail-status {
                display: flex;
                align-items: center;
                gap: 0.2rem;
                font-size: 0.75rem;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .detail-attempts {
                color: #888;
                font-size: 0.7rem;
                text-align: center;
            }
 
            .detail-status.correct {
                color: #27ae60;
            }
            .detail-status.incorrect {
                color: #e74c3c;
            }
            .detail-status.unanswered {
                color: #95a5a6;
            }
            .detail-points {
                text-align: right;
                font-weight: bold;
                font-family: monospace;
                font-size: 0.85rem;
            }
            .note-range {
                background: #f8f9fa;
                padding: 1rem;
                border-radius: 8px;
                margin-top: 1rem;
            }
            .note-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 0.5rem 0;
                border-bottom: 1px solid #eee;
            }
            .note-item:last-child {
                border-bottom: none;
            }
            .note-label {
                color: #666;
            }
            .note-value {
                font-weight: bold;
                font-size: 1.1rem;
            }
            .note-value.current {
                color: #2c3e50;
            }
            .note-value.min {
                color: #e74c3c;
            }
            .note-value.max {
                color: #27ae60;
            }
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

// Exports globaux
window.handleAnswer = handleAnswer;
window.handleOpenAnswer = handleOpenAnswer;
window.validateAllQuestions = validateAllQuestions;
window.validateCourse = validateCourse;
window.toggleHint = toggleHint;
window.updateAllProgressIndicators = updateAllProgressIndicators;
window.showDetailsBilanChapter = showDetailsBilanChapter;
window.closeAutoCorrectDetails = closeAutoCorrectDetails;

console.log('✅ chapitre.js chargé - Fonctionnalités des chapitres actives');
