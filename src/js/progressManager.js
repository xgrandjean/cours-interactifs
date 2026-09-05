/**
 * progressManager.js - Gestion centralisée de la progression des apprenants
 * 
 * Ce fichier fournit une interface unifiée pour stocker et récupérer la progression
 * des apprenants selon la structure standard définie dans PROGRESSION_FORMAT.md
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
    // Source la plus fiable : variable globale définie par chapter_template.html
    if (window.currentChapitreId) return window.currentChapitreId;

    // Nouvelle méthode : depuis les paramètres URL (?chapitre=1)
    const urlParams = new URLSearchParams(window.location.search);
    const chapitreParam = urlParams.get('chapitre');
    if (chapitreParam) return chapitreParam;

    return null;
}


/**
 * Récupère l'ID de l'apprenant courant
 * @returns {string|null} L'ID de l'apprenant ou null
 */
function getCurrentStudentId() {
    const urlParams = new URLSearchParams(window.location.search);

    // Identité portée par l'URL — aperçu formateur ou simulation : le student_id doit
    // primer sur toute session élève restée active dans cet onglet, sinon on
    // afficherait et on écrirait sous le mauvais apprenant.
    const identiteParUrl = urlParams.get('teacher_view') === 'true' ||
                           urlParams.get('simulation') === 'true';
    if (identiteParUrl && urlParams.has('student_id')) {
        return urlParams.get('student_id');
    }

    // Récupérer le token depuis sessionStorage (utilisé par dataStorage.js)
    const SESSION_KEY = 'current_student_token';
    const token = sessionStorage.getItem(SESSION_KEY);
    if (token) {
        return token;
    }

    // Mode vue formateur : vérifier le paramètre student_id dans l'URL
    if (urlParams.has('student_id')) {
        return urlParams.get('student_id');
    }

    // Fallback: vérifier dans l'URL ou un paramètre studentId
    if (urlParams.has('studentId')) {
        return urlParams.get('studentId');
    }

    // Dernier fallback: utiliser un ID par défaut
    return 'anonymous';
}

/**
 * Récupère la progression d'un apprenant depuis le stockage
 * @param {string} studentId - L'ID de l'apprenant
 * @returns {Promise<Object|null>} La progression ou null
 */
async function loadProgress(studentId) {
    try {
        // Utiliser Parcours.scoped.student si disponible
        if (window.Parcours && Parcours.scoped && Parcours.scoped.student) {
            return await Parcours.scoped.student.get(`student_${studentId}_progress`);
        }
        // Fallback pour les pages sans Parcours
        const key = `student_${studentId}_progress`;
        return await storage.get(key);
    } catch (e) {
        console.error('❌ Erreur lors du chargement de la progression:', e);
        return null;
    }
}



/**
 * Sauvegarde la progression d'un apprenant dans le stockage
 * @param {string} studentId - L'ID de l'apprenant
 * @param {Object} progress - La progression à sauvegarder
 */
async function saveProgress(studentId, progress) {
    try {
        progress.lastUpdated = new Date().toISOString();
        
        // Utiliser Parcours.scoped.student si disponible
        if (window.Parcours && Parcours.scoped && Parcours.scoped.student) {
            await Parcours.scoped.student.set(`student_${studentId}_progress`, progress);
        } else {
            // Fallback pour les pages sans Parcours
            const key = `student_${studentId}_progress`;
            await storage.set(key, progress);
        }
    } catch (e) {
        console.error('❌ Erreur lors de la sauvegarde de la progression:', e);
    }
}

/**
 * Initialise une nouvelle progression pour un apprenant
 * @param {string} studentId - L'ID de l'apprenant
 * @param {string} studentName - Le nom de l'apprenant
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
 * @param {Object} chapterConfig - La configuration du chapitre depuis cours.chapters_index.json
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
    //
    // LES DATES FONT FOI, submissionStatus EN DÉCOULE. Il y en a trois, une par
    // transition, et recomputeSubmissionStatus() ne lit qu'elles. Ne jamais écrire
    // submissionStatus directement : passer par setSubmissionStatus().
    //
    // `approvedAt` et `returnedAt` ont été supprimés : c'étaient des doublons de
    // `validatedAt` et `revisionRequestedAt`, porteurs du même instant sous un autre
    // nom. Chacun n'était lu que par une moitié du code, et c'est précisément ce
    // dédoublement qui laissait passer des validations sans date.
    submissionStatus: "not_submitted",
    submittedAt: null,          // l'apprenant a rendu sa copie
    revisionRequestedAt: null,  // le formateur l'a renvoyée pour reprise
    // validatedAt est déclaré plus bas, dans la section Correction : le formateur a validé
    submissionDeadline: chapterConfig.submissionDeadline || null,
    
    // Feedback évaluateur
    teacherComment: "",
    teacherFeedbackSummary: "",
    
    // Nouveaux champs - Correction
    correctionStatus: "not_started",
    pendingCorrectionCount: 0,
    correctedQuestionCount: 0,
    manualCorrectionCount: 0,
    correctedAt: null,
    validatedAt: null,   // <- 3e date de rendu : lue par recomputeSubmissionStatus
    correctedBy: null,
    
    // Scores séparés
    autoScore: 0,
    manualScore: 0,
    finalScore: 0,
    
    // Suivi évaluateur
    teacherMonitoring: {
      lastViewedAt: null,
      lastTeacherActionAt: null,
      teacherId: null,
      priorityLevel: "normal",
      flags: [],
      notes: ""
    },

    // Contexte figé au premier démarrage (mode + date limite) — voir getExamContext.js.
    // Une fois posé, ne change plus pour cet élève même si la config globale du chapitre
    // change ensuite (utile avec plusieurs classes démarrant à des moments différents).
    frozenChapterMode: chapterConfig.chapterMode || (chapterConfig.examMode ? 'exam' : 'normal'),
    frozenDateLimitEnabled: chapterConfig.dateLimitEnabled === true,
    frozenEndDate: chapterConfig.endDate || null,
    frozenAt: now,

    questions
  };
}

/**
 * Initialise une question dans la progression
 * @param {Object} questionConfig - La configuration de la question depuis cours.chapters_index.json
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
 * Obtient ou crée la progression d'un apprenant
 * @param {string} studentId - L'ID de l'apprenant
 * @param {string} studentName - Le nom de l'apprenant
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
        // Migration silencieuse
    }
    
    return progress;
}

/**
 * Enregistre une réponse à une question
 * @param {Object} progress - La progression de l'apprenant
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

    // ===== NOUVEAUX: Indicateurs détaillés pour questions manuelles =====
    // Note: manualQuestionsAutoCorrectedCount inclut :
    // - Questions semi-auto avec réponse exacte (auto-corrigées comme correctes)
    // - Questions ouvertes avec réponse invalide (vide/trop courte, auto-rejetées)
    chapter.manualQuestionsTotalCount = Object.values(chapter.questions)
        .filter(q => q.needsManualCorrection).length;

    chapter.manualQuestionsAutoCorrectedCount = Object.values(chapter.questions)
        .filter(q => q.needsManualCorrection && 
                     q.manualCorrectionStatus === "not_needed" && 
                     q.answered).length;

    chapter.manualQuestionsPendingCount = Object.values(chapter.questions)
        .filter(q => q.needsManualCorrection && 
                     q.manualCorrectionStatus === "pending").length;

    chapter.manualQuestionsCorrectedCount = Object.values(chapter.questions)
        .filter(q => q.needsManualCorrection && 
                     ["corrected", "validated"].includes(q.manualCorrectionStatus)).length;

    chapter.manualQuestionsUnansweredCount = Object.values(chapter.questions)
        .filter(q => q.needsManualCorrection && !q.answered).length;
    
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
/**
 * Change le statut de rendu d'un chapitre. PASSER PAR ICI, TOUJOURS.
 *
 * ------------------------------------------------------------------------
 * LE CONTRAT : les dates font foi, l'étiquette en découle.
 * ------------------------------------------------------------------------
 * `submissionStatus` n'est pas une donnée, c'est un résumé. Il est reconstruit à
 * partir des trois dates par `recomputeSubmissionStatus()`, appelée à la fin de
 * chaque `recomputeChapterStats()` — c'est-à-dire à peu près à chaque action de
 * l'apprenant ou du formateur.
 *
 * Écrire l'étiquette sans poser la date, c'est donc écrire quelque chose que le
 * premier recalcul effacera. C'était le cas de la validation : la modale de
 * correction posait `submissionStatus = 'validated'` sans date. Il suffisait ensuite
 * de corriger une question — depuis Correction en salle, par exemple — pour que le
 * chapitre retombe en « rendu » : l'apprenant perdait l'accès à son corrigé tandis
 * que sa note restait affichée côté formateur, sans que rien ne signale le désaccord.
 *
 * Poser la date ne suffit pas non plus : il faut EFFACER celles qui n'ont plus cours.
 * Rouvrir une copie validée sans effacer `validatedAt` la ramène à « validé » au
 * recalcul suivant. C'est cette symétrie que la fonction centralise.
 *
 * @param {string} statut  not_submitted | submitted | late_submitted |
 *                         returned_for_revision | validated
 * @returns {string|null}  le statut effectif, ou null si le statut est inconnu
 */
function setSubmissionStatus(chapter, statut) {
    if (!chapter) return null;
    const now = new Date().toISOString();

    // Posé d'abord : recomputeSubmissionStatus ne distingue `late_submitted` de
    // `submitted` qu'en relisant l'étiquette courante.
    chapter.submissionStatus = statut;

    switch (statut) {
        case 'validated':
            chapter.validatedAt = chapter.validatedAt || now;
            chapter.revisionRequestedAt = null;
            break;

        case 'returned_for_revision':
            chapter.revisionRequestedAt = now;
            chapter.validatedAt = null;
            break;

        case 'submitted':
        case 'late_submitted':
            chapter.submittedAt = chapter.submittedAt || now;
            chapter.validatedAt = null;
            chapter.revisionRequestedAt = null;
            break;

        case 'not_submitted':
            chapter.submittedAt = null;
            chapter.validatedAt = null;
            chapter.revisionRequestedAt = null;
            break;

        default:
            // L'étiquette a déjà été posée plus haut : on la reconstruit depuis les dates
            // pour ne laisser aucune valeur inconnue derrière soi.
            recomputeSubmissionStatus(chapter);
            console.error(`[progressManager] Statut de rendu inconnu : « ${statut} ». `
                        + `Aucun changement. Statuts admis : not_submitted, submitted, `
                        + `late_submitted, returned_for_revision, validated.`);
            return null;
    }

    // L'étiquette est toujours reconstruite depuis les dates, y compris ici : si les
    // deux divergeaient, ce sont les dates qui auraient raison.
    recomputeSubmissionStatus(chapter);
    return chapter.submissionStatus;
}

/**
 * Reconstruit `submissionStatus` à partir des dates. Ne JAMAIS l'appeler pour
 * CHANGER un statut — elle ne fait que relire ; c'est `setSubmissionStatus()` qui
 * décide. L'ordre des tests est l'ordre de priorité : une validation l'emporte sur
 * une demande de reprise, qui l'emporte sur un rendu.
 */
function recomputeSubmissionStatus(chapter) {
    if (chapter.validatedAt) {
        chapter.submissionStatus = "validated";
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
 * @param {Object} progress - La progression de l'apprenant
 * @param {string|number} currentChapterId - L'ID du chapitre courant
 * @param {Object} chaptersConfig - La configuration des chapitres
 */
function unlockNextChapter(progress, currentChapterId, chaptersConfig) {
    const currentChapter = progress.chapters[currentChapterId];
    if (!currentChapter || currentChapter.status !== 'completed') {
        return; // Chapitre non terminé
    }
    
    // Trouver le chapitre suivant par position dans le tableau
    const currentIndex = chaptersConfig.chapters.findIndex(ch => String(ch.id) === String(currentChapterId));
    if (currentIndex === -1) return; // Chapitre introuvable
    
    const nextChapterConfig = chaptersConfig.chapters[currentIndex + 1];
    if (!nextChapterConfig) {
        return; // Pas de chapitre suivant
    }
    
    const nextId = nextChapterConfig.id;

    // Déverrouiller le chapitre suivant
    if (!progress.chapters[nextId]) {
        progress.chapters[nextId] = initChapter(nextChapterConfig);

        // ⚠️ NE PAS FIGER ICI. nextChapterConfig vient de cours.json STATIQUE : il ignore
        // les réglages du formateur (mode, verrou, date limite) qui ne vivent que dans
        // chapter_config. Figer maintenant enfermerait l'apprenant dans le mode publié
        // alors qu'il n'a même pas ouvert le chapitre. Le gel a lieu à son vrai premier
        // démarrage, dans ensureChapterInitialized(), avec la config effective.
        degelerContexteChapitre(progress.chapters[nextId]);
    }
    progress.chapters[nextId].isLocked = false;
    progress.chapters[nextId].unlockedAt = new Date().toISOString();
}

/**
 * Fige le mode et la date limite d'un chapitre pour cet apprenant, à son premier
 * démarrage. Une fois posés, ces champs ne suivent plus les changements de config —
 * c'est voulu : plusieurs classes peuvent démarrer le même chapitre à des dates
 * différentes sans que le formateur ne casse l'expérience de ceux qui ont commencé.
 *
 * @param {Object} chapter - entrée de progression du chapitre
 * @param {Object} config  - configuration EFFECTIVE (statique + réglages formateur)
 */
function gelerContexteChapitre(chapter, config) {
    if (!chapter || !config) return;
    chapter.frozenChapterMode      = config.chapterMode || (config.examMode ? 'exam' : 'normal');
    chapter.frozenDateLimitEnabled = config.dateLimitEnabled === true;
    chapter.frozenEndDate          = config.endDate || null;
    chapter.frozenAt               = new Date().toISOString();
}

/**
 * Remet un chapitre à l'état « jamais démarré ». getExamContext considère un chapitre
 * comme démarré dès que frozenAt est posé : sans ce dégel, un chapitre créé d'avance
 * par unlockNextChapter passerait pour commencé.
 */
function degelerContexteChapitre(chapter) {
    if (!chapter) return;
    chapter.frozenChapterMode      = null;
    chapter.frozenDateLimitEnabled = false;
    chapter.frozenEndDate          = null;
    chapter.frozenAt               = null;
}

/**
 * Initialise le chapitre courant dans la progression si absent
 * @param {Object} progress - La progression de l'apprenant
 * @param {Object} chaptersConfig - La configuration des chapitres
 */
function ensureChapterInitialized(progress, chaptersConfig) {
    const chapterId = getCurrentChapterId();
    if (!chapterId) return;
    
    // S'assurer que progress.chapters existe
    if (!progress.chapters) {
        progress.chapters = {};
    }
    
    const chapterConfig = chaptersConfig.chapters.find(ch => String(ch.id) === String(chapterId));
    if (!chapterConfig) return;

    if (!progress.chapters[chapterId]) {
        // ⚠️ chapterConfig ici vient de chaptersIndex (cours.json STATIQUE) : il ne contient pas
        // les overrides formateur (mode/verrou/date limite) qui ne vivent que dans chapter_config
        // (storage). window.currentChapterConfig est déjà la fusion statique+storage pour le
        // chapitre courant (voir loadChapterConfig() dans chapitre.js) — on la préfère si dispo,
        // pour que initChapter() fige le bon mode/date limite au premier démarrage.
        const liveConfig = window.currentChapterConfig;
        const effectiveConfig = (liveConfig && String(liveConfig.id) === String(chapterId))
            ? { ...chapterConfig, ...liveConfig }
            : chapterConfig;
        progress.chapters[chapterId] = initChapter(effectiveConfig);
    } else if (progress.chapters[chapterId].frozenAt == null) {
        // Le chapitre existe déjà mais n'a jamais été démarré : c'est unlockNextChapter
        // qui l'a créé quand le chapitre précédent a été terminé, sans le figer.
        // Le gel du mode a lieu ICI, au vrai premier démarrage, et avec la config
        // EFFECTIVE (statique + réglages formateur) — sinon un chapitre déverrouillé
        // d'avance serait figé sur le mode publié, en ignorant celui choisi depuis le
        // tableau de bord.
        const liveConfig = window.currentChapterConfig;
        const effectiveConfig = (liveConfig && String(liveConfig.id) === String(chapterId))
            ? { ...chapterConfig, ...liveConfig }
            : chapterConfig;
        gelerContexteChapitre(progress.chapters[chapterId], effectiveConfig);
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
 * @param {Object} progress - La progression de l'apprenant
 * @param {string|number} chapterId - L'ID du chapitre
 */
function restoreSavedAnswers(progress, chapterId) {
    const chapter = progress.chapters[chapterId];
    if (!chapter) return;
    
    // ✅ Utiliser requestAnimationFrame pour ne pas bloquer le rendu
    requestAnimationFrame(() => {
        Object.entries(chapter.questions).forEach(([questionId, questionData]) => {
            if (questionData.answered) {
                restoreQuestionState(questionId, questionData);
            }
        });
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
 * @param {Object} progress - La progression de l'apprenant
 * @param {string|number} chapterId - L'ID du chapitre
 * @param {string} submissionDeadline - Date limite de rendu (ISO)
 */
function submitChapter(progress, chapterId, submissionDeadline) {
    const chapter = progress.chapters[chapterId];
    if (!chapter) return;
    
    const now = new Date().toISOString();
    const isLate = submissionDeadline && new Date(now) > new Date(submissionDeadline);
    
    // Le rendu efface la demande de reprise et une éventuelle validation antérieure :
    // sans cela la dérivation remettrait aussitôt le chapitre dans son ancien état.
    // setSubmissionStatus s'en charge.
    chapter.submittedAt = now;
    setSubmissionStatus(chapter, isLate ? "late_submitted" : "submitted");
    
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
 * L'évaluateur corrige une question
 * @param {Object} progress - La progression de l'apprenant
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
        question.correctedBy = "teacher"; // À remplacer par l'ID réel de l'évaluateur
        question.correctedAt = now;
    }
    
    recomputeChapterStats(chapter);
}

/**
 * L'évaluateur valide définitivement une question
 * @param {Object} progress - La progression de l'apprenant
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
 * L'évaluateur approuve un chapitre
 * @param {Object} progress - La progression de l'apprenant
 * @param {string|number} chapterId - L'ID du chapitre
 */
function teacherApproveChapter(progress, chapterId) {
    const chapter = progress.chapters[chapterId];
    if (!chapter) return;
    
    chapter.correctedBy = "teacher"; // À remplacer par l'ID réel
    setSubmissionStatus(chapter, "validated");

    recomputeChapterStats(chapter);
}

/**
 * L'évaluateur demande une révision du chapitre
 * @param {Object} progress - La progression de l'apprenant
 * @param {string|number} chapterId - L'ID du chapitre
 * @param {string} teacherComment - Commentaire général
 */
function teacherRequestRevision(progress, chapterId, teacherComment) {
    const chapter = progress.chapters[chapterId];
    if (!chapter) return;
    
    chapter.teacherComment = teacherComment;
    setSubmissionStatus(chapter, "returned_for_revision");

    recomputeChapterStats(chapter);
}

/**
 * Calcule les statistiques globales pour le dashboard évaluateur
 * @param {Object} progress - La progression de l'apprenant
 * @returns {Object} Statistiques globales
 */
function computeGlobalStats(progress) {
    const chapters = Object.values(progress.chapters);
    
    return {
        globalPendingCorrections: chapters.reduce((sum, ch) => sum + ch.pendingCorrectionCount, 0),
        globalSubmittedChapters: chapters.filter(ch => ch.submissionStatus !== "not_submitted").length,
        globalApprovedChapters: chapters.filter(ch => ch.submissionStatus === "validated").length,
        globalLateSubmissions: chapters.filter(ch => ch.submissionStatus === "late_submitted").length,
        globalRevisionRequests: chapters.filter(ch => ch.submissionStatus === "returned_for_revision").length
    };
}

// ============================================================================
// FONCTIONS UTILITAIRES POUR L'INTERFACE UTILISATEUR
// ============================================================================

/**
 * Calcule toutes les statistiques nécessaires à l'affichage UI d'un chapitre
 * Cette fonction centralise les calculs pour éviter la duplication entre
 * 
 * @param {Object} chapter - Les données de progression du chapitre
 * @param {Object} chapterConfig - La configuration du chapitre depuis cours.chapters_index.json
 * @param {number} [maxNote=20] - Note maximale (défaut: 20)
 * @returns {Object} Toutes les statistiques calculées pour l'UI
 */
function computeChapterUIStats(chapter, chapterConfig, maxNote = 20) {
    if (!chapter || !chapterConfig) {
        return {
            globalPercentage: 0,
            answeredQuestions: 0,
            answeredCourses: 0,
            completedItems: 0,
            totalItems: 0,
            // Stats auto-corrigés
            autoScore: 0,
            autoMaxPossible: 0,
            autoRemainingRisk: 0,
            manualCurrentScore: 0,
            manualRemainingMax: 0,
            note: 0,
            accuracy: 0,
            firstAttemptRate: 0,
            pointsObtenus: 0,
            reussite: 0,
            avctBonneReponse: 0,
            avctReponse: 0,
            totalSuccessQuestions: 0,
            answeredQuestionsAuto: 0
        };
    }

    const now = new Date().toISOString();
    
    // =========================
    // Progression globale
    // =========================
    const totalItems = chapter.progressItemCount || chapterConfig.progressItemCount || 0;
    const totalQuestions = chapter.questionCount || chapterConfig.questionCount || 0;
    const totalValidatableCourses = chapter.courseValidationCount || chapterConfig.courseValidationCount || 0;
    
    // Compter les questions répondues (exclure les cours)
    const answeredQuestions = Object.values(chapter.questions || {})
        .filter(q => q.answered && !q.questionHash?.startsWith('course_'))
        .length;
    
    // Compter les cours validés
    let answeredCourses = 0;
    if (chapter.questions) {
        Object.keys(chapter.questions).forEach(key => {
            if (key.startsWith('course_') && chapter.questions[key].answered && 
                chapter.questions[key].isCorrect === true) {
                answeredCourses++;
            }
        });
    }
    
    const completedItems = answeredQuestions + answeredCourses;
    const globalPercentage = totalItems > 0
        ? Math.round((completedItems / totalItems) * 100)
        : 0;

    // =========================
    // Questions auto-corrigées
    // =========================
    const autoQuestions = chapterConfig.questions.filter(q => q.correctionType === 'auto');

    let autoTotalPoints = 0;
    let autoEarnedPoints = 0;
    // penaltySum sert la PRÉCISION : il compte une question jamais tentée comme ratée,
    // parce qu'il mesure la position de l'apprenant sur une échelle de qualité.
    // pointsAcquisAuto sert les POINTS : il la compte à 0, parce qu'elle n'a rien coûté
    // — c'est la règle du bilan, et les deux écrans doivent donner le même nombre.
    let penaltySum = 0;
    let pointsAcquisAuto = 0;
    let totalSuccessQuestions = 0;
    let firstAttemptSuccessCount = 0;
    let answeredQuestionsAuto = 0;

    autoQuestions.forEach(q => {
        autoTotalPoints += q.points;

        const qData = chapter.questions[q.id];

        if (!qData || qData.attempts <= 0) {
            penaltySum -= q.points;
            return;                     // pointsAcquisAuto : rien, la question est intacte
        }

        answeredQuestionsAuto++;

        if (qData.isCorrect === true) {
            totalSuccessQuestions++;
            autoEarnedPoints += q.points;

            if (qData.attempts === 1) {
                firstAttemptSuccessCount++;
            }

            // Barème partagé, voir core/bareme.js
            const acquis = Bareme.pointsAuto(q.points, qData.attempts, Bareme.nbOptions(q));
            penaltySum += acquis;
            pointsAcquisAuto += acquis;
        } else {
            penaltySum -= q.points;
            pointsAcquisAuto -= q.points;
        }
    });

    const firstAttemptRate = totalSuccessQuestions > 0
        ? Math.round((firstAttemptSuccessCount / totalSuccessQuestions) * 100)
        : 0;

    let reussite = 0;
    if (autoTotalPoints > 0) {
        reussite = (penaltySum / autoTotalPoints) * 100;
        reussite = Math.max(-100, Math.min(100, reussite));
    }

    const p = reussite / 100;
    const note = maxNote * (1 + p) / 2;

    const avctBonneReponse = autoTotalPoints > 0
        ? (autoEarnedPoints / autoTotalPoints) * 100
        : 0;

    const avctReponse = autoQuestions.length > 0
        ? (answeredQuestionsAuto / autoQuestions.length) * 100
        : 0;

    const accuracy = Math.round((reussite + 100) / 2);

    // Points obtenus : la somme réelle des points auto, plancher à 0 comme dans le bilan.
    //
    // Auparavant ils dérivaient de `note`, la note centrée sur 10/20 : une question réussie
    // au 2e essai valant 0 point s'affichait « 2,5/5 » au bandeau et « 0 sur 5 » au bilan,
    // à un clic l'un de l'autre. Deux nombres de points sur le même écran doivent être le
    // même nombre. `note` et `reussite` restent l'échelle de qualité, lue par la Précision.
    const pointsObtenus = Math.round(Math.max(0, pointsAcquisAuto) * 100) / 100;

    // =========================
    // Stats pour le bilan détaillé
    // =========================
    const allQuestions = chapterConfig.questions;
    const totalPossiblePoints = chapterConfig.maxPoints || 
        (allQuestions ? allQuestions.reduce((sum, q) => sum + q.points, 0) : 0);

    let autoMaxPossible = 0;
    let autoRemainingRisk = 0;
    let manualCurrentScore = 0;
    let manualRemainingMax = 0;

    if (allQuestions) {
        allQuestions.forEach(q => {
            const qData = chapter.questions[q.id];
            
            if (q.correctionType === 'auto') {
                autoMaxPossible += q.points;
            }

            const wasAnswered = qData && (
                qData.answered === true ||
                (typeof qData.answer === 'string' && qData.answer.trim() !== '') ||
                (Array.isArray(qData.answer) && qData.answer.length > 0) ||
                (qData.answer !== null && qData.answer !== undefined && qData.answer !== '')
            );

            if (qData) {
                if (qData.isCorrect === true) {
                    if (q.correctionType === 'auto') {
                        // Déjà compté dans autoScore
                    } else {
                        manualCurrentScore += q.points;
                    }
                } else if (q.correctionType !== 'auto') {
                    if (wasAnswered) {
                        manualRemainingMax += q.points;
                    } else {
                        if (chapter.submissionStatus === 'not_submitted' || 
                            chapter.submissionStatus === 'returned_for_revision') {
                            manualRemainingMax += q.points;
                        }
                    }
                }
            } else {
                if (q.correctionType === 'auto') {
                    autoRemainingRisk += q.points;
                } else if (chapter.submissionStatus === 'not_submitted' || 
                           chapter.submissionStatus === 'returned_for_revision') {
                    manualRemainingMax += q.points;
                }
            }
        });
    }

    return {
        // Progression globale
        globalPercentage,
        answeredQuestions,
        answeredCourses,
        completedItems,
        totalItems,
        totalQuestions,
        totalValidatableCourses,
        
        // Stats auto-corrigés (pour affichage stats)
        autoScore: autoEarnedPoints,
        autoMaxPossible: autoTotalPoints,
        autoRemainingRisk,
        manualCurrentScore,
        manualRemainingMax,
        note: Math.round(note * 10) / 10,
        accuracy,
        firstAttemptRate,
        pointsObtenus,
        reussite: Math.round(reussite * 100) / 100,
        avctBonneReponse: Math.round(avctBonneReponse * 100) / 100,
        avctReponse: Math.round(avctReponse * 100) / 100,
        totalSuccessQuestions,
        answeredQuestionsAuto,
        penaltySum: Math.round(penaltySum * 10) / 10,
        
        // Pour le bilan détaillé
        totalPossiblePoints,
        autoTotalPoints
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
    setSubmissionStatus,      // le seul écrivain légitime de submissionStatus
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
    restoreQuestionState,
    
    // Fonctions utilitaires pour l'UI
    computeChapterUIStats
};
