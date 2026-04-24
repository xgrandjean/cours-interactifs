// ============================================================================
// CHAPITRE.JS - Fonctionnalités spécifiques aux pages de chapitre
// ============================================================================
// Ce fichier contient tout le code spécifique à la gestion des chapitres.
// Il est chargé uniquement sur les pages de chapitre (après main.js).
// Source de vérité : chapters_index.json + progressManager
// ============================================================================

// ✅ FALLBACK SECURITE : Embarque getExamContext directement pour ne jamais avoir d'erreur
if (typeof window.getExamContext === 'undefined') {
    window.getExamContext = function(chapter, chapterConfig = null, globalContext = {}) {
        const config = chapterConfig || window.currentChapterConfig;
        const submissionStatus = chapter?.submissionStatus || 'not_submitted';
        const isSubmitted = submissionStatus === 'submitted' || submissionStatus === 'late_submitted';
        const isCorrected = submissionStatus === 'validated';
        const chapterExamMode = Boolean(config?.examMode);
        const globalExamMode = Boolean(globalContext?.examMode);
        
        return {
            isExamMode: chapterExamMode || globalExamMode,
            isSubmitted,
            isCorrected,
            isChapterLocked: isSubmitted || isCorrected,
            _debug: { chapterExamMode, globalExamMode, submissionStatus }
        };
    };
}

// ✅ SINGLETON CONTEXTE EXAMEN : UNE SEULE SOURCE DE VERITE POUR TOUTE LA PAGE
window.initChapterExamContext = function(chapter) {
    const globalContext = window.globalContext || window.APP_CONTEXT || {};
    window.currentExamContext = getExamContext(chapter, window.currentChapterConfig, globalContext);
    return window.currentExamContext;
};

// Helper pour accéder aux fonctions ProgressManager
function getProgressManager() {
    return window.ProgressManager || {};
}

// ============================================================================
// SESSION DU CHAPITRE
// ============================================================================

/**
 * Encapsule les variables d'état du chapitre courant.
 * Accessible depuis l'extérieur via window.ChapterSession.
 */
const ChapterSession = {
    progress: null,
    studentId: null,
    chapterId: null,
};
window.ChapterSession = ChapterSession;

/**
 * Synchroniser une réponse avec progressManager
 * Source de vérité : progressManager uniquement
 */
function syncAnswerToProgress(questionId, answer, isCorrect, score) {
    const pm = getProgressManager();
    if (!pm.recordAnswer || !ChapterSession.progress) {
        return;
    }

    ChapterSession.studentId = pm.getCurrentStudentId ? pm.getCurrentStudentId() : ChapterSession.studentId;
    ChapterSession.chapterId = pm.getCurrentChapterId ? pm.getCurrentChapterId() : ChapterSession.chapterId;

    if (!ChapterSession.chapterId) {
        console.warn('[progressManager] Chapitre ID introuvable');
        return;
    }

    // S'assurer que le chapitre est initialisé avec chaptersIndex
    if (pm.ensureChapterInitialized && window.chaptersIndex) {
        pm.ensureChapterInitialized(ChapterSession.progress, window.chaptersIndex);
    }

    const question = ChapterSession.progress?.chapters?.[ChapterSession.chapterId]?.questions?.[questionId];

    if (!question) {
        console.warn(`[progressManager] Question introuvable: ${questionId}`);
        return;
    }

    // Fonction utilitaire de comparaison (marche aussi pour les tableaux QCM multiples)
    function answersEqual(a, b) {
        if (Array.isArray(a) && Array.isArray(b)) {
            return a.length === b.length && a.every((val, idx) => val === b[idx]);
        }
        return a === b;
    }

    // Gérer le cas où la réponse est vide (effacement d'une réponse précédente)
    if (answer === '' || answer === null || answer === undefined) {
        const now = new Date().toISOString();

        // Si c'est déjà vide, ne pas incrémenter les tentatives
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
            pm.recomputeChapterStats(ChapterSession.progress.chapters[ChapterSession.chapterId]);
        }
        if (pm.recomputeGlobalStats) {
            pm.recomputeGlobalStats(ChapterSession.progress);
        }

        // Sauvegarder
        if (pm.saveProgress && ChapterSession.studentId) {
            pm.saveProgress(ChapterSession.studentId, ChapterSession.progress);
        }

        updateAllProgressIndicators();
        return;
    }

    // Vérifier si les tentatives multiples sont autorisées
    const allowMultiple = pm.ALLOW_MULTIPLE_ATTEMPTS !== false;
    if (!allowMultiple && question.answered && question.isCorrect === true) {
        console.warn(`[progressManager] Question déjà validée: ${questionId}`);
        return;
    }

    // N'incrémenter les tentatives que si la réponse a changé
    if (!answersEqual(question.answer, answer)) {
        pm.recordAnswer(ChapterSession.progress, ChapterSession.chapterId, questionId, answer, isCorrect, score);
    }

    // Recalculer les statistiques
    if (pm.recomputeChapterStats) {
        pm.recomputeChapterStats(ChapterSession.progress.chapters[ChapterSession.chapterId]);
    }
    if (pm.recomputeGlobalStats) {
        pm.recomputeGlobalStats(ChapterSession.progress);
    }

    // Déverrouiller le chapitre suivant si nécessaire
    if (pm.unlockNextChapter && window.chaptersIndex) {
        pm.unlockNextChapter(ChapterSession.progress, ChapterSession.chapterId, window.chaptersIndex);
    }

    // Sauvegarder (async)
    if (pm.saveProgress && ChapterSession.studentId) {
        pm.saveProgress(ChapterSession.studentId, ChapterSession.progress);
    }

    // Mettre à jour TOUS les indicateurs UI
    updateAllProgressIndicators();
}

// ============================================================================
// GESTION DE LA PROGRESSION GLOBALE
// ============================================================================

/**
 * Mettre à jour TOUS les indicateurs de progression.
 * Centralise la mise à jour de :
 * 1. Progression globale (questions + cours)
 * 2. Stats exercices auto-corrigés
 */
function updateAllProgressIndicators() {
    if (!ChapterSession.progress || !ChapterSession.chapterId) return;

    const chapter = ChapterSession.progress.chapters[ChapterSession.chapterId];
    if (!chapter) return;

    const chapterConfig = window.currentChapterConfig;
    if (!chapterConfig) return;

    const pm = window.ProgressManager;
    if (!pm || !pm.computeChapterUIStats) {
        console.warn('[updateAllProgressIndicators] ProgressManager.computeChapterUIStats non disponible');
        return;
    }

    const stats = pm.computeChapterUIStats(chapter, chapterConfig, APP_CONFIG.MAX_NOTE || 20);

    // Progression globale
    const progressValue = document.getElementById('chapterProgressValue');
    if (progressValue) {
        progressValue.textContent = stats.globalPercentage;
    }

    const progressCircle = document.getElementById('chapterProgressCircle');
    if (progressCircle) {
        progressCircle.title = `Avancement dans le chapitre : ${stats.completedItems} éléments complétés sur ${stats.totalItems} au total (${stats.answeredQuestions}/${stats.totalQuestions} questions, ${stats.answeredCourses}/${stats.totalValidatableCourses} cours)`;
    }

    // Questions auto-corrigées
    const statsDiv = document.getElementById('auto-correct-stats');

    if (statsDiv) {
    // Lorsqu'on appelle depuis index.html, on passe chapterConfig explicitement
    // pour éviter la dépendance à window.currentChapterConfig qui n'existe pas sur la page accueil
        const examContext = getExamContext(chapter, chapterConfig, window.globalContext);        
        const submissionStatus = chapter.submissionStatus || 'not_submitted';
    const isDisabled = examContext.isExamMode && submissionStatus === 'not_submitted';

    if (isDisabled) {
        // Mode examen actif et non soumis : masquer complètement la stats-card
        statsDiv.innerHTML = '';
    } else {
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
    }

    // Attacher l'évènement sur le bouton bilan APRÈS création
    const bilanBtn = document.getElementById('bilan-btn');
    if (bilanBtn) {
        bilanBtn.removeEventListener('click', showDetailsBilanChapter);
        // ✅ IMPORTANT: Utiliser une fonction fléchée pour ne pas transmettre l'évènement Click
        // Sinon l'évènement est passé comme premier paramètre et casse complètement la fonction
        bilanBtn.addEventListener('click', () => showDetailsBilanChapter());
    }
}


// ============================================================================
// VALIDATION GLOBALE (MODE EXAMEN)
// ============================================================================

function validateAllQuestions() {
    const questions = document.querySelectorAll('.question-section');
    let totalPoints = 0;
    let earnedPoints = 0;
    let unansweredQuestions = [];

    // 🔍 1. Détection des questions non répondues
    questions.forEach(question => {
        const result = QuestionEngine.evaluate(question);

        if (!result.hasAnswer) {
            unansweredQuestions.push(question);
        }
    });

    const globalFeedback = document.getElementById('global-feedback');

    // ⚠️ 2. Confirmation si incomplet
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

        if (globalFeedback) globalFeedback.innerHTML = '';
    }

    // ✅ 3. Évaluation + sync
    questions.forEach(question => {
        const points = parseInt(question.dataset.points) || 0;
        totalPoints += points;

        const result = QuestionEngine.evaluate(question);

        if (result.isCorrect) {
            earnedPoints += points;
        }

        const answer = result.hasAnswer ? result.userAnswer : null;
        
        syncAnswerToProgress(
            question.dataset.questionId,
            answer,
            result.isCorrect,
            result.isCorrect ? points : 0
        );

    });

    // 🧠 4. Sync exam mode
    const pm = getProgressManager();
    if (pm.saveProgress && ChapterSession.progress && ChapterSession.chapterId) {
        const chapter = ChapterSession.progress.chapters?.[ChapterSession.chapterId];

        if (chapter) {
            chapter.examModeValidated = true;
            chapter.examModeValidatedAt = new Date().toISOString();

            if (pm.recomputeChapterStats) pm.recomputeChapterStats(chapter);
            if (pm.recomputeGlobalStats) pm.recomputeGlobalStats(ChapterSession.progress);
            pm.saveProgress(ChapterSession.studentId, ChapterSession.progress);
        }
    }

    // 🎯 5. Feedback global
    if (globalFeedback) {
        globalFeedback.className = 'feedback show info';

        globalFeedback.innerHTML = unansweredQuestions.length > 0
            ? `✅ Validation terminée !<br>
               ${unansweredQuestions.length} question(s) sans réponse.<br>
               Réponses enregistrées.<br>
               Vous ne pouvez plus modifier vos réponses.`
            : `✅ Validation terminée !<br>
               Réponses enregistrées.<br>
               Vous ne pouvez plus modifier vos réponses.`;
    }

    // 🔒 6. Lock UI
    document.querySelectorAll('input, select, textarea, button').forEach(input => {
        const isNavButton =
            input.closest('.chapter-nav') ||
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
window.validateAllQuestions = validateAllQuestions;

/**
 * Synchroniser la lecture d'un cours avec progressManager
 */
function syncCourseToProgress(courseId) {
    const pm = getProgressManager();
    if (!pm.recordAnswer || !ChapterSession.progress || !ChapterSession.chapterId) {
        return;
    }

    const chapterConfig = window.currentChapterConfig;
    if (!chapterConfig) return;

    if (pm.ensureChapterInitialized && window.chaptersIndex) {
        pm.ensureChapterInitialized(ChapterSession.progress, window.chaptersIndex);
    }

    if (!ChapterSession.progress.chapters[ChapterSession.chapterId].questions[courseId]) {
        ChapterSession.progress.chapters[ChapterSession.chapterId].questions[courseId] = {
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
        const course = ChapterSession.progress.chapters[ChapterSession.chapterId].questions[courseId];
        course.answered = true;
        course.answer = 'read';
        course.isCorrect = true;
        course.updatedAt = new Date().toISOString();
    }

    if (pm.recomputeChapterStats) {
        pm.recomputeChapterStats(ChapterSession.progress.chapters[ChapterSession.chapterId]);
    }
    if (pm.recomputeGlobalStats) {
        pm.recomputeGlobalStats(ChapterSession.progress);
    }

    if (pm.saveProgress && ChapterSession.studentId) {
        pm.saveProgress(ChapterSession.studentId, ChapterSession.progress);
    }
}

/**
 * Restaurer la réponse d'une question spécifique
 */
function restoreQuestionAnswer(questionId, questionData) {
    const pm = getProgressManager();
    const question = document.querySelector(`.question-section[data-question-id="${questionId}"]`);
    const correctionType = question ? question.dataset.correctionType : null;

    // Verrouiller SEULEMENT les questions AUTO et SEMI correctes
    const shouldLock =
        (correctionType === 'auto' || correctionType === 'semi') &&
        !pm.ALLOW_MULTIPLE_ATTEMPTS &&
        questionData.isCorrect === true;

    // QCM radio
    const radio = document.querySelector(`input[type="radio"][name="qcm_${questionId}"]`);
    if (radio) {
        const radioSelected = document.querySelector(`input[name="qcm_${questionId}"][value="${questionData.answer}"]`);
        if (radioSelected) {
            radioSelected.checked = true;
            if (shouldLock) setInputsDisabled(`qcm_${questionId}`, true);
        }
        return;
    }

    // QCM checkbox
    const checkbox = document.querySelector(`input[type="checkbox"][name="qcm_${questionId}"]`);
    if (checkbox && Array.isArray(questionData.answer)) {
        questionData.answer.forEach(value => {
            const checkboxSelected = document.querySelector(`input[name="qcm_${questionId}"][value="${value}"]`);
            if (checkboxSelected) {
                checkboxSelected.checked = true;
                if (shouldLock) checkboxSelected.disabled = true;
            }
        });
        return;
    }

    // Select
    const select = document.querySelector(`select#${questionId}`);
    if (select) {
        select.value = questionData.answer;
        if (shouldLock) select.disabled = true;
        return;
    }

    // Réponse courte
    const shortInput = document.getElementById(`short_${questionId}`);
    if (shortInput) {
        shortInput.value = questionData.answer || '';
        if (shouldLock) shortInput.disabled = true;
        return;
    }

    // Réponse ouverte - textarea (jamais verrouillée automatiquement)
    const textarea = document.getElementById(questionId);
    if (textarea && textarea.tagName === 'TEXTAREA') {
        textarea.value = questionData.answer || '';
    }
}

/**
 * Restaurer TOUTES les réponses sauvegardées (cours + questions)
 */
function restoreAllAnswers() {
    if (!ChapterSession.progress || !ChapterSession.chapterId) return;

    const chapter = ChapterSession.progress.chapters[ChapterSession.chapterId];
    if (!chapter?.questions) return;

    clearAllFeedbacks();

    const context = window.currentExamContext;
    const isChapterCorrected = chapter.submissionStatus === 'validated';

    restoreCourses(chapter);

    Object.entries(chapter.questions).forEach(([questionId, data]) => {
        if (questionId.startsWith('course_')) return;
        if (!data?.answered) return;

        restoreQuestionAnswer(questionId, data);

        const questionEl = document.querySelector(
            `.question-section[data-question-id="${questionId}"]`
        );
        if (!questionEl) return;

        if (context.isExamMode) {
            if (context.isChapterLocked) {
                lockQuestion(questionEl);
                if (isChapterCorrected) {
                    showFeedback(questionId, data);
                }
            }
            return;
        }

        handleNormalMode(questionId, data, questionEl);
    });
}

function restoreCourses(chapter) {
    const courseSections = document.querySelectorAll('.course-content');

    courseSections.forEach((section, index) => {
        const courseId = `course_${index}`;
        const courseData = chapter.questions[courseId];

        if (courseData?.answered && courseData.isCorrect === true) {
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
    const feedback = document.getElementById(`feedback_${questionId}`);

    if (hasTextarea) {
        if (questionData.isCorrect === false) {
            if (feedback) {
                feedback.innerHTML = '❌ Réponse invalide / trop courte';
                feedback.className = 'feedback error show';
                feedback.style.display = 'block';
            }
        } else if (questionData.answered === true) {
            if (feedback) {
                feedback.innerHTML = '⏳ Réponse enregistrée - En attente de vérification';
                feedback.className = 'feedback warning show';
                feedback.style.display = 'block';
            }
        } else {
            if (feedback) {
                feedback.innerHTML = '';
                feedback.className = 'feedback';
                feedback.style.display = 'none';
            }
        }
    } else {
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
            if (feedback) {
                feedback.innerHTML = '';
                feedback.className = 'feedback';
                feedback.style.display = 'none';
            }
        }
    }

    if (
        questionData.isCorrect === true &&
        (correctionType === 'auto' || correctionType === 'semi')
    ) {
        disableAutoCorrectedQuestion(question);
    }

    // Questions ouvertes : jamais verrouillées
    if (hasTextarea) {
        const inputs = question.querySelectorAll('textarea, button');
        inputs.forEach(input => {
            input.disabled = false;
            input.style.pointerEvents = 'auto';
            input.style.opacity = '1';

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



/**
 * Désactiver tous les inputs d'un groupe QCM
 */
function setInputsDisabled(name, disabled) {
    document.querySelectorAll(`input[name="${name}"]`).forEach(input => {
        input.disabled = disabled;
    });
}

/**
 * Désactiver une question auto-corrigée après une réponse correcte
 */
function disableAutoCorrectedQuestion(question) {
    const button = question.querySelector('.btn-check-answer');
    if (button) {
        button.disabled = true;
        button.textContent = '✓ Validé';
        button.style.backgroundColor = '#27ae60';
        button.style.pointerEvents = 'none';
    }

    question.querySelectorAll('input, select, textarea').forEach(input => {
        input.disabled = true;
        input.style.pointerEvents = 'none';
        input.style.opacity = '0.7';
    });

    question.classList.add('completed');
    question.style.opacity = '0.8';
}

// ============================================================================
// MODE EXAMEN
// ============================================================================

function applyChapterMode() {
    const match = window.location.pathname.match(/chapitre(\d+)\.html/);
    const chapterId = match ? parseInt(match[1]) : null;

    if (!chapterId) return;

    const chapterConfig = getChapterConfigById(chapterId);
    const allButtons = $$('.question-actions .btn-check-answer');

    if (chapterConfig?.examMode === true) {
        allButtons.forEach(btn => { btn.style.display = 'none'; });
    } else {
        allButtons.forEach(btn => { btn.style.display = 'block'; });
    }

    let submitBtn = document.getElementById('submit-chapter-btn');

    if (!submitBtn) {
        submitBtn = document.createElement('button');
        submitBtn.id = 'submit-chapter-btn';
        submitBtn.className = 'btn btn-primary';

        const footer = document.querySelector('.chapter-footer');
        if (footer) footer.appendChild(submitBtn);
    }

    submitBtn.style.display = 'block';
    submitBtn.style.marginLeft = 'auto';
    submitBtn.style.padding = '0.75rem 1.5rem';
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
            if (mainContent) mainContent.before(statsContainer);
        }
    }

    updateAllProgressIndicators();
}

function initializeStats() {
    setTimeout(() => { addStatsDisplay(); }, 200);
}

// ============================================================================
// INITIALISATION DE LA PAGE DE CHAPITRE
// ============================================================================

async function initChapterPage() {
    if (!window.location.pathname.includes('chapitre')) return;

    try {
        const chapterId = window.location.pathname.match(/chapitre(\d+)\.html/)?.[1];
        if (chapterId) {
            if (!window.chaptersIndex) {
                const response = await fetch(window.APP_BASE_URL + 'src/chapters/chapters_index.json');
                if (response.ok) {
                    window.chaptersIndex = await response.json();
                } else {
                    console.error('❌ Impossible de charger chapters_index.json.', response.status);
                }
            }

            const staticConfig = window.chaptersIndex.chapters.find(ch => ch.id == chapterId);
            const storageConfig = await storage.get('chapter_config');

            window.currentChapterConfig = {
                ...staticConfig,
                ...(storageConfig?.[chapterId] || {})
            };
        }
    } catch (error) {
        console.warn('[ChaptersIndex] Erreur lors du chargement de la configuration:', error);
    }

    const pm = getProgressManager();
    if (pm.getOrCreateStudentProgress) {
        ChapterSession.studentId = pm.getCurrentStudentId ? pm.getCurrentStudentId() : null;
        ChapterSession.chapterId = pm.getCurrentChapterId ? pm.getCurrentChapterId() : null;

        if (ChapterSession.studentId && ChapterSession.chapterId) {
            ChapterSession.progress = await pm.getOrCreateStudentProgress(
                ChapterSession.studentId,
                'Apprenant',
                window.currentChapterConfig || {}
            );

            if (pm.ensureChapterInitialized && window.chaptersIndex) {
                pm.ensureChapterInitialized(ChapterSession.progress, window.chaptersIndex);
            }

            if (pm.restoreSavedAnswers) {
                pm.restoreSavedAnswers(ChapterSession.progress, ChapterSession.chapterId);
            }

            if (pm.saveProgress) {
                await pm.saveProgress(ChapterSession.studentId, ChapterSession.progress);
            }

            // ✅ INITIALISATION UNIQUE DU CONTEXTE EXAMEN POUR TOUTE LA PAGE
            initChapterExamContext(ChapterSession.progress.chapters[ChapterSession.chapterId]);
        }
    }

    initializeStats();
    applyChapterMode();

    window.studentWorkEditor.options.onAnswerValidated = ({
        questionId,
        answer,
        isCorrect,
        points
    }) => {

        const isEmpty =
            answer === null ||
            answer === undefined ||
            answer === '' ||
            (Array.isArray(answer) && answer.length === 0);

        // 🔥 IMPORTANT : en mode examen on NE bloque PAS
        if (isEmpty && !window.currentChapterConfig?.examMode) return;

        syncAnswerToProgress(
            questionId,
            answer,
            isCorrect,
            isCorrect ? points : 0
        );

        updateAllProgressIndicators();
    };

    // ✅ MAINTENANT LE CONTEXTE EXISTE, on init studentWorkEditor
    window.studentWorkEditor.init();

    setTimeout(() => { updateSubmitButton(); }, 400);
    setTimeout(() => { restoreAllAnswers(); }, 300);
}

document.addEventListener('DOMContentLoaded', () => {
    initChapterPage();
});

// ============================================================================
// BILAN DU CHAPITRE
// ============================================================================

async function showDetailsBilanChapter(chapterIdParam = null, progressDataParam = null) {
    
    let chapterId = chapterIdParam || ChapterSession.chapterId;
    let progress = progressDataParam || ChapterSession.progress;
    
    if (!progress || !chapterId) {
        console.error('showDetailsBilanChapter: manque progress ou chapterId', {
            progress,
            chapterId
        });
        alert('Erreur: Impossible de charger le bilan, données manquantes.');
        return;
    }

    const chapter = progress.chapters[chapterId];
    if (!chapter) return;

    const submissionStatus = chapter.submissionStatus || 'not_submitted';
    const chapterConfig = window.chaptersIndex?.chapters?.find(ch => ch.id == chapterId);
    if (!chapterConfig) return;

    // ✅ Merge la config storage comme PARTOUT ailleurs dans l'application
    const storageConfig = await storage.get('chapter_config') || {};
    const finalConfig = {
        ...chapterConfig,
        ...(storageConfig[chapterId] || {})
    };

    const examContext = getExamContext(chapter, finalConfig, window.globalContext);        
    const isExamMode = examContext.isExamMode;
    console.log(examContext)
    const isAllowed = !isExamMode || submissionStatus === 'validated';

    if (!isAllowed) {
        alert('⚠️ Le bilan n\'est pas disponible tant que le chapitre n\'a pas été corrigé.');
        return;
    }

    const allQuestions = chapterConfig.questions;
    const totalPossiblePoints = chapterConfig.maxPoints || allQuestions.reduce((sum, q) => sum + q.points, 0);

    let autoScore = 0;
    let autoMaxPossible = 0;
    let autoRemainingRisk = 0;
    let manualCurrentScore = 0;
    let manualRemainingMax = 0;

    const questionDetails = [];

    allQuestions.forEach(q => {
        const qData = chapter.questions[q.id];
        let status = 'unanswered';
        let pointsEarned = 0;

        if (q.correctionType === 'auto') autoMaxPossible += q.points;

        const wasAnswered =
            qData &&
            (qData.answered === true ||
            (typeof qData.answer === 'string' && qData.answer.trim() !== '') ||
            (Array.isArray(qData.answer) && qData.answer.length > 0) ||
            (qData.answer !== null && qData.answer !== undefined && qData.answer !== ''));

        let effectiveIsCorrect = qData ? qData.isCorrect : null;
        let effectiveWasAnswered = wasAnswered;

        if (q.correctionType === 'auto' && qData && qData.attempts > 0 && !wasAnswered) {
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
                } else {
                    pointsEarned = 0;
                }
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
                (submissionStatus === 'not_submitted' || submissionStatus === 'returned_for_revision')
            ) {
                autoRemainingRisk += q.points;
            }
        } else {
            status = 'unanswered';
            pointsEarned = 0;
            if (
                q.correctionType === 'auto' &&
                (submissionStatus === 'not_submitted' || submissionStatus === 'returned_for_revision')
            ) {
                autoRemainingRisk += q.points;
            } else if (submissionStatus === 'not_submitted' || submissionStatus === 'returned_for_revision') {
                manualRemainingMax += q.points;
            }
        }

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
    const maxScorePossible = autoProjectedScore + autoRemainingRisk + manualCurrentScore + manualRemainingMax;
    const minNote = totalPossiblePoints > 0 ? (minScore / totalPossiblePoints) * noteMax : 0;
    const maxNote = totalPossiblePoints > 0 ? (maxScorePossible / totalPossiblePoints) * noteMax : 0;

    let coursePenalty = 0;
    const totalCourses = chapterConfig.courseValidationCount;
    const validatedCourses = chapter.answeredCourses || 0;
    if (validatedCourses < totalCourses) coursePenalty = 2;

    let questionsHtml = '';
    questionDetails.forEach(q => {
        let statusIcon = '';
        let statusText = '';
        let statusClass = '';

        if (q.status === 'corrected' || q.manualCorrectionStatus === 'corrected') {
            if (q.pointsEarned >= q.points) {
                statusIcon = '✅'; statusClass = 'correct';
            } else if (q.pointsEarned > 0) {
                statusIcon = '🟠'; statusClass = 'partial';
            } else {
                statusIcon = '❌'; statusClass = 'incorrect';
            }
            statusText = 'Corrigé';
        } else {
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
                    statusIcon = '⚪'; statusText = 'Non répondue'; statusClass = 'unanswered';
                    break;
                case 'pending':
                    statusIcon = '⏳'; statusText = 'En attente'; statusClass = 'pending';
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
                            <span class="note-label">Pénalité appliquée sur la note sur 20</span>
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

function closeAutoCorrectDetails(event) {
    if (event) event.stopPropagation();
    document.getElementById('auto-correct-details-modal')?.remove();
}

// ============================================================================
// GESTION DES RENDUS DE CHAPITRE
// ============================================================================

async function handleSubmitChapter() {
    const chapterConfig = window.currentChapterConfig ||
                          window.chaptersIndex?.chapters?.find(ch => ch.id == ChapterSession.chapterId);

    const chapter = ChapterSession.progress?.chapters?.[ChapterSession.chapterId];
    const submissionStatus = chapter?.submissionStatus || 'not_submitted';

    if (chapterConfig?.examMode === true) {
        validateAllQuestions();

        const pm = getProgressManager();
        if (pm.submitChapter && ChapterSession.progress && ChapterSession.chapterId) {
            const deadline = chapterConfig.submissionDeadline || null;
            pm.submitChapter(ChapterSession.progress, ChapterSession.chapterId, deadline);

            if (pm.saveProgress && ChapterSession.studentId) {
                await pm.saveProgress(ChapterSession.studentId, ChapterSession.progress);
            }

            lockChapterAfterSubmission();
            updateSubmitButton();
            updateAllProgressIndicators();
        }
        return;
    }

    const pm = getProgressManager();
    if (!pm.submitChapter || !ChapterSession.progress || !ChapterSession.chapterId) {
        console.warn('[handleSubmitChapter] ProgressManager non initialisé');
        return;
    }

    if (!chapter) return;

    const config = window.chaptersIndex?.chapters?.find(ch => ch.id == ChapterSession.chapterId);
    if (!config) return;

    if (submissionStatus === 'submitted' || submissionStatus === 'late_submitted') {
        alert('⚠️ Ce chapitre a déjà été rendu et est en attente de correction.');
        return;
    }

    if (submissionStatus === 'validated') {
        alert('✅ Ce chapitre a déjà été validé par votre évaluateur.');
        return;
    }

    const completionPercent = chapter.completionPercent || 0;
    let confirmMessage = '';
    if (completionPercent < 100) {
        confirmMessage = `⚠️ Votre progression est de ${completionPercent}%.\n\n`;
    }
    if (submissionStatus === 'returned_for_revision') {
        confirmMessage += '🔄 Vous êtes sur le point de re-rendre ce chapitre après les retouches demandées.\n\n';
    }
    confirmMessage += 'Êtes-vous sûr de vouloir rendre votre copie ?\n';
    confirmMessage += 'Cette action est irréversible et toutes les réponses seront figées.';

    if (!confirm(confirmMessage)) return;

    const deadline = config.submissionDeadline || null;
    pm.submitChapter(ChapterSession.progress, ChapterSession.chapterId, deadline);

    if (pm.saveProgress && ChapterSession.studentId) {
        await pm.saveProgress(ChapterSession.studentId, ChapterSession.progress);
    }

    lockChapterAfterSubmission();
    updateSubmitButton();
    updateAllProgressIndicators();
    alert('✅ Votre copie a été rendue avec succès !');
}

/**
 * Met à jour l'affichage du bouton de rendu selon le statut
 */
function updateSubmitButton() {
    const btn = document.getElementById('submit-chapter-btn');
    if (!btn || !ChapterSession.progress || !ChapterSession.chapterId) return;

    const chapter = ChapterSession.progress.chapters[ChapterSession.chapterId];
    if (!chapter) return;

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
            btn.onclick = null;
            lockChapterAfterSubmission();
            break;
        case 'late_submitted':
            btn.innerHTML = '⚠️ Rendu - En retard';
            btn.className = 'btn btn-warning';
            btn.disabled = true;
            btn.onclick = null;
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
 * Verrouille le chapitre après soumission.
 * Désactive tous les inputs et boutons, rend le contenu consultable.
 */
function lockChapterAfterSubmission() {
    document.body.classList.add('chapter-locked');

    document.querySelectorAll('input, textarea, select').forEach(input => {
        input.disabled = true;
    });

    document.querySelectorAll('.btn-check-answer').forEach(btn => {
        btn.disabled = true;
    });

    const globalValidation = document.querySelector('.global-validation');
    if (globalValidation) globalValidation.style.display = 'none';

    document.querySelectorAll('.course-validation button').forEach(btn => {
        btn.disabled = true;
    });

    const mainContent = document.querySelector('.chapter-content');
    if (mainContent && !document.getElementById('submission-confirmation-msg')) {
        const msgDiv = document.createElement('div');
        msgDiv.id = 'submission-confirmation-msg';
        msgDiv.className = 'submission-confirmation';
        msgDiv.innerHTML = '📝 <strong>Copie rendue</strong> - Plus de modifications possibles.<br>Votre évaluateur la corrigera prochainement.';
        mainContent.insertBefore(msgDiv, mainContent.firstChild);
    }
}
// ============================================================================
// EXPORTS GLOBAUX
// ============================================================================

window.validateAllQuestions = validateAllQuestions;
window.updateAllProgressIndicators = updateAllProgressIndicators;
window.showDetailsBilanChapter = showDetailsBilanChapter;
window.closeAutoCorrectDetails = closeAutoCorrectDetails;
window.handleSubmitChapter = handleSubmitChapter;
window.updateSubmitButton = updateSubmitButton;
window.syncCourseToProgress = syncCourseToProgress;