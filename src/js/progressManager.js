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
    // Récupérer le token depuis sessionStorage (utilisé par dataStorage.js)
    const SESSION_KEY = 'current_student_token';
    const token = sessionStorage.getItem(SESSION_KEY);
    if (token) {
        return token;
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
  const courseValidationCount = chapterConfig.courseValidationCount || 0;
  
  // Initialiser les questions
  if (chapterConfig.questions) {
    chapterConfig.questions.forEach(q => {
      questions[q.id] = initQuestion(q);
    });
  }
  
  // Initialiser les entrées pour les cours à valider (course_0, course_1, etc.)
  for (let i = 0; i < courseValidationCount; i++) {
    const courseId = `course_${i}`;
    questions[courseId] = {
      questionHash: courseId,
      answered: false,
      answer: null,
      isCorrect: null,
      score: 0,
      attempts: 0,
      attemptHistory: [],
      answeredAt: null,
      createdAt: now,
      updatedAt: now,
      needsManualCorrection: false,
      manualCorrectionStatus: 'not_needed',
      correctedBy: null,
      correctedAt: null,
      teacherComment: "",
      teacherFeedback: "",
      teacherScore: null,
      revisionRequested: false,
      revisionRequestedAt: null,
      autoScore: 0,
      manualScore: 0,
      finalScore: 0
    };
  }
  
  return {
    status: "not_started",
    score: 0,
    maxPoints: chapterConfig.maxPoints || 0,
    questionCount,
    courseValidationCount,
    progressItemCount: chapterConfig.progressItemCount || (questionCount + courseValidationCount),
    answeredQuestions: 0,
    answeredCourses: 0,
    completionPercent: 0,
    chapterHash: chapterConfig.chapterHash || null,
    isLocked: false,
    unlockedAt: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    
    // Nouveaux champs - Rendu
    submissionStatus: "not_submitted",
    submittedAt: null,
    approvedAt: null,
    returnedAt: null,
    revisionRequestedAt: null,
    submissionDeadline: chapterConfig.submissionDeadline || null,
    
    // Feedback enseignant
    teacherComment: "",
    teacherFeedbackSummary: "",
    
    // Nouveaux champs - Correction
    correctionStatus: "not_started",
    pendingCorrectionCount: 0,
    correctedQuestionCount: 0,
    manualCorrectionCount: 0,
    correctedAt: null,
    validatedAt: null,
    correctedBy: null,
    
    // Scores séparés
    autoScore: 0,
    manualScore: 0,
    finalScore: 0,
    
    // Suivi enseignant
    teacherMonitoring: {
      lastViewedAt: null,
      lastTeacherActionAt: null,
      teacherId: null,
      priorityLevel: "normal",
      flags: [],
      notes: ""
    },
    
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
    
    // Déterminer si la question nécessite une correction manuelle
    // Types: ouverte, courte, ou correctionType semi
    const needsManual = ['ouverte', 'courte'].includes(questionConfig.type) || 
                        questionConfig.correctionType === 'semi';
    
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
        needsManualCorrection: needsManual,
        manualCorrectionStatus: "not_needed",
        
        // Nouveaux champs - Correction manuelle
        correctedBy: null,
        correctedAt: null,
        teacherComment: "",
        teacherFeedback: "",
        teacherScore: null,
        
        // Révision
        revisionRequested: false,
        revisionRequestedAt: null,
        
        // Scores séparés
        autoScore: 0,
        manualScore: 0,
        finalScore: 0
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
    
    // ========================================================================
    // GESTION DES QUESTIONS SEMI-AUTOMATIQUES
    // ========================================================================
    const questionConfig = window.chaptersIndex?.chapters
        .find(ch => ch.id == chapterId)?.questions
        .find(q => q.id === questionId);
    
    // [TEST] Décommenter pour débogage détaillé
    // console.log(`[TEST] recordAnswer - questionId: ${questionId}, type: ${questionConfig?.type}, correctionType: ${questionConfig?.correctionType}, isCorrect: ${isCorrect}`);
    
    if (questionConfig?.correctionType === "semi") {
        // Pour les questions semi-auto, needsManualCorrection reste true
        // mais manualCorrectionStatus dépend de la réponse
        if (isCorrect) {
            // Réponse exacte détectée → pas besoin de correction manuelle
            question.manualCorrectionStatus = "not_needed";
            // console.log(`[TEST] Semi-auto CORRECT → manualCorrectionStatus = "not_needed"`);
        } else if (!isCorrect && userAnswer) {
            // Réponse non exacte → en attente de correction
            question.manualCorrectionStatus = "pending";
            // console.log(`[TEST] Semi-auto INCORRECT → manualCorrectionStatus = "pending"`);
        }
    } else if (isCorrect) {
        // Pour les autres types, si correct → pas de correction manuelle
        question.needsManualCorrection = false;
        question.manualCorrectionStatus = "not_needed";
        // console.log(`[TEST] Auto-correct → needsManualCorrection = false, manualCorrectionStatus = "not_needed"`);
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
    // Compter les questions répondues (exclure les cours)
    chapter.answeredQuestions = Object.values(chapter.questions)
        .filter(q => q.answered && !q.questionHash?.startsWith('course_')).length;
    
    // Compter les cours validés
    let answeredCourses = 0;
    if (chapter.questions) {
        Object.keys(chapter.questions).forEach(key => {
            if (key.startsWith('course_') && chapter.questions[key].answered && chapter.questions[key].isCorrect === true) {
                answeredCourses++;
            }
        });
    }
    chapter.answeredCourses = answeredCourses;
    
    // Calculer le pourcentage de complétion
    const totalItems = chapter.progressItemCount;
    const completedItems = chapter.answeredQuestions + answeredCourses;
    
    chapter.completionPercent = totalItems > 0
        ? Math.round((completedItems / totalItems) * 100)
        : 0;
    
    // ===== NOUVEAUX: Compteurs de correction =====
    chapter.manualCorrectionCount = Object.values(chapter.questions)
        .filter(q => q.needsManualCorrection).length;
    
    chapter.pendingCorrectionCount = Object.values(chapter.questions)
        .filter(q => q.manualCorrectionStatus === "pending").length;
    
    chapter.correctedQuestionCount = Object.values(chapter.questions)
        .filter(q => ["corrected", "validated"].includes(q.manualCorrectionStatus)).length;
    
    // ===== NOUVEAUX: Scores séparés =====
    chapter.autoScore = Object.values(chapter.questions)
        .filter(q => !q.needsManualCorrection && q.isCorrect === true)
        .reduce((sum, q) => sum + (q.score || 0), 0);
    
    chapter.manualScore = Object.values(chapter.questions)
        .filter(q => q.needsManualCorrection)
        .reduce((sum, q) => sum + (q.teacherScore ?? 0), 0);
    
    chapter.finalScore = chapter.autoScore + chapter.manualScore;
    
    // ===== NOUVEAU: correctionStatus =====
    if (chapter.manualCorrectionCount === 0) {
        // Pas de questions à correction manuelle → validé automatiquement
        chapter.correctionStatus = "validated";
    } else if (chapter.pendingCorrectionCount === chapter.manualCorrectionCount) {
        // Toutes les questions manuelles sont en attente
        chapter.correctionStatus = "pending_review";
    } else if (chapter.pendingCorrectionCount > 0 && chapter.correctedQuestionCount > 0) {
        // Certaines questions corrigées, d'autres en attente
        chapter.correctionStatus = "in_progress";
    } else if (chapter.correctedQuestionCount === chapter.manualCorrectionCount) {
        // Toutes les questions manuelles sont corrigées
        chapter.correctionStatus = "corrected";
    } else {
        chapter.correctionStatus = "not_started";
    }
    
    // [TEST] Décommenter pour voir le résumé des stats
    // console.log(`[TEST] Chapitre ${chapterId}: correctionStatus=${chapter.correctionStatus}, scores(auto=${chapter.autoScore}, manual=${chapter.manualScore}, final=${chapter.finalScore})`);
    
    // Recalculer submissionStatus
    recomputeSubmissionStatus(chapter);
    
    // Calculer le score total (pour rétrocompatibilité)
    chapter.score = chapter.finalScore;
    
    // Mettre à jour le statut de progression
    if (completedItems === totalItems && totalItems > 0) {
        chapter.status = 'completed';
        chapter.completedAt = new Date().toISOString();
    } else if (completedItems > 0) {
        chapter.status = 'in_progress';
    }
    
    chapter.updatedAt = new Date().toISOString();
}

/**
 * Recalcule le statut de soumission d'un chapitre
 * @param {Object} chapter - Le chapitre à recalculer
 */
function recomputeSubmissionStatus(chapter) {
    if (chapter.approvedAt) {
        chapter.submissionStatus = "approved";
    } else if (chapter.revisionRequestedAt) {
        chapter.submissionStatus = "returned_for_revision";
    } else if (chapter.submittedAt) {
        // Conserver late_submitted si c'était le cas
        if (chapter.submissionStatus !== "late_submitted") {
            chapter.submissionStatus = "submitted";
        }
    } else {
        chapter.submissionStatus = "not_submitted";
    }
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
    
    // [TEST] Décommenter pour voir les données du chapitre au chargement
    // console.log(`[TEST] Chapitre ${chapterId}: correctionStatus=${chapter.correctionStatus}, submissionStatus=${chapter.submissionStatus}, finalScore=${chapter.finalScore}`);
    
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
// NOUVELLES FONCTIONS - GESTION DES RENDUS ET CORRECTIONS
// ============================================================================

/**
 * Soumet un chapitre pour correction
 * @param {Object} progress - La progression de l'étudiant
 * @param {string|number} chapterId - L'ID du chapitre
 * @param {string} submissionDeadline - Date limite de rendu (ISO)
 */
function submitChapter(progress, chapterId, submissionDeadline) {
    const chapter = progress.chapters[chapterId];
    if (!chapter) return;
    
    const now = new Date().toISOString();
    const isLate = submissionDeadline && new Date(now) > new Date(submissionDeadline);
    
    chapter.submissionStatus = isLate ? "late_submitted" : "submitted";
    chapter.submittedAt = now;
    
    // Mettre à jour manualCorrectionStatus pour questions nécessitant correction
    Object.values(chapter.questions).forEach(q => {
        if (q.needsManualCorrection && q.isCorrect === true) {
            // Réponse correcte détectée automatiquement (semi-auto avec réponse exacte)
            q.manualCorrectionStatus = "not_needed";
        } else if (q.needsManualCorrection && q.isCorrect === null && q.answered) {
            // Réponse en attente de correction manuelle
            q.manualCorrectionStatus = "pending";
        }
    });
    
    recomputeChapterStats(chapter);
}

/**
 * L'enseignant corrige une question
 * @param {Object} progress - La progression de l'étudiant
 * @param {string|number} chapterId - L'ID du chapitre
 * @param {string} questionId - L'ID de la question
 * @param {number} teacherScore - Score attribué
 * @param {string} teacherComment - Commentaire
 * @param {string} teacherFeedback - Feedback détaillé
 * @param {string} action - "corrected" ou "returned_for_revision"
 */
function teacherCorrectQuestion(progress, chapterId, questionId, teacherScore, teacherComment, teacherFeedback, action) {
    const chapter = progress.chapters[chapterId];
    if (!chapter || !chapter.questions[questionId]) return;
    
    const question = chapter.questions[questionId];
    const now = new Date().toISOString();
    
    if (action === "returned_for_revision") {
        question.manualCorrectionStatus = "returned_for_revision";
        question.revisionRequested = true;
        question.revisionRequestedAt = now;
        question.teacherComment = teacherComment;
        question.teacherFeedback = teacherFeedback;
    } else {
        question.teacherScore = teacherScore;
        question.teacherComment = teacherComment;
        question.teacherFeedback = teacherFeedback;
        question.manualCorrectionStatus = "corrected";
        question.correctedBy = "teacher"; // À remplacer par l'ID réel de l'enseignant
        question.correctedAt = now;
    }
    
    recomputeChapterStats(chapter);
}

/**
 * L'enseignant valide définitivement une question
 * @param {Object} progress - La progression de l'étudiant
 * @param {string|number} chapterId - L'ID du chapitre
 * @param {string} questionId - L'ID de la question
 */
function teacherValidateQuestion(progress, chapterId, questionId) {
    const chapter = progress.chapters[chapterId];
    if (!chapter || !chapter.questions[questionId]) return;
    
    const question = chapter.questions[questionId];
    question.manualCorrectionStatus = "validated";
    question.correctedAt = new Date().toISOString();
    
    recomputeChapterStats(chapter);
}

/**
 * L'enseignant approuve un chapitre
 * @param {Object} progress - La progression de l'étudiant
 * @param {string|number} chapterId - L'ID du chapitre
 */
function teacherApproveChapter(progress, chapterId) {
    const chapter = progress.chapters[chapterId];
    if (!chapter) return;
    
    chapter.approvedAt = new Date().toISOString();
    chapter.validatedAt = chapter.approvedAt;
    chapter.correctedBy = "teacher"; // À remplacer par l'ID réel
    
    recomputeChapterStats(chapter);
}

/**
 * L'enseignant demande une révision du chapitre
 * @param {Object} progress - La progression de l'étudiant
 * @param {string|number} chapterId - L'ID du chapitre
 * @param {string} teacherComment - Commentaire général
 */
function teacherRequestRevision(progress, chapterId, teacherComment) {
    const chapter = progress.chapters[chapterId];
    if (!chapter) return;
    
    chapter.revisionRequestedAt = new Date().toISOString();
    chapter.teacherComment = teacherComment;
    
    recomputeChapterStats(chapter);
}

/**
 * Calcule les statistiques globales pour le dashboard enseignant
 * @param {Object} progress - La progression de l'étudiant
 * @returns {Object} Statistiques globales
 */
function computeGlobalStats(progress) {
    const chapters = Object.values(progress.chapters);
    
    return {
        globalPendingCorrections: chapters.reduce((sum, ch) => sum + ch.pendingCorrectionCount, 0),
        globalSubmittedChapters: chapters.filter(ch => ch.submissionStatus !== "not_submitted").length,
        globalApprovedChapters: chapters.filter(ch => ch.submissionStatus === "approved").length,
        globalLateSubmissions: chapters.filter(ch => ch.submissionStatus === "late_submitted").length,
        globalRevisionRequests: chapters.filter(ch => ch.submissionStatus === "returned_for_revision").length
    };
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
    recomputeSubmissionStatus,
    recomputeGlobalStats,
    computeGlobalStats,
    
    // Nouvelles fonctions - Rendus et corrections
    submitChapter,
    teacherCorrectQuestion,
    teacherValidateQuestion,
    teacherApproveChapter,
    teacherRequestRevision,
    
    // Déverrouillage
    unlockNextChapter,
    
    // Restauration
    restoreSavedAnswers,
    restoreQuestionState
};

console.log('✅ progressManager.js chargé - Gestion de progression active (Version 2.0)');
