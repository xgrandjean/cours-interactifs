// ============================================================================
// CHAPTER SESSION - Couche glue entre la page chapitre et ProgressManager
// ============================================================================
// Responsabilités :
//   - ChapterSession (state local)
//   - syncAnswerToProgress / syncCourseToProgress
//   - initChapterExamContext
// ============================================================================

const ChapterSession = {
    progress: null,
    studentId: null,
    chapterId: null,
};
window.ChapterSession = ChapterSession;

function getProgressManager() {
    return window.ProgressManager || {};
}

// Deux réponses sont-elles la même ? Sert au chemin d'envoi comme au chemin
// brouillon, d'où la remontée au niveau du module.
function answersEqual(a, b) {
    if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.every((val, idx) => val === b[idx]);
    }
    return a === b;
}

// ✅ SINGLETON CONTEXTE EXAMEN
window.initChapterExamContext = function(chapter) {
    window.currentExamContext = getExamContext(chapter, window.currentChapterConfig);
    return window.currentExamContext;
};

/**
 * Synchroniser une réponse avec progressManager
 */
function syncAnswerToProgress(questionId, answer, isCorrect, score) {
    const pm = getProgressManager();
    if (!pm.recordAnswer || !ChapterSession.progress) return;

    ChapterSession.studentId = pm.getCurrentStudentId ? pm.getCurrentStudentId() : ChapterSession.studentId;
    ChapterSession.chapterId = pm.getCurrentChapterId ? pm.getCurrentChapterId() : ChapterSession.chapterId;

    if (!ChapterSession.chapterId) return;

    if (pm.ensureChapterInitialized && window.chaptersIndex) {
        pm.ensureChapterInitialized(ChapterSession.progress, window.chaptersIndex);
    }

    const question = ChapterSession.progress?.chapters?.[ChapterSession.chapterId]?.questions?.[questionId];
    if (!question) return;

    // Gérer le cas où la réponse est vide (effacement)
    if (answer === '' || answer === null || answer === undefined) {
        const now = new Date().toISOString();

        if (!answersEqual(question.answer, answer)) {
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

        question.answered = false;
        question.answer = null;
        question.isCorrect = null;
        question.score = 0;
        question.answeredAt = null;
        question.updatedAt = now;

        if (pm.recomputeChapterStats) pm.recomputeChapterStats(ChapterSession.progress.chapters[ChapterSession.chapterId]);
        if (pm.recomputeGlobalStats) pm.recomputeGlobalStats(ChapterSession.progress);
        if (pm.saveProgress && ChapterSession.studentId) pm.saveProgress(ChapterSession.studentId, ChapterSession.progress);

        updateAllProgressIndicators();
        return;
    }

    // Vérifier si les tentatives multiples sont autorisées
    const allowMultiple = pm.ALLOW_MULTIPLE_ATTEMPTS !== false;
    if (!allowMultiple && question.answered && question.isCorrect === true) return;

    // N'incrémenter les tentatives que si la réponse a changé
    if (!answersEqual(question.answer, answer)) {
        pm.recordAnswer(ChapterSession.progress, ChapterSession.chapterId, questionId, answer, isCorrect, score);
    } else if (question.isCorrect !== isCorrect || question.score !== score) {
        // Même réponse, mais verdict connu seulement maintenant. C'est le cas du mode
        // Blind : la saisie est enregistrée en silence avec isCorrect = null, et la
        // correction n'est calculée qu'à la validation finale. Sans cette branche, le
        // garde-fou ci-dessus rejetait la mise à jour — le verdict restait null et le
        // bilan Blind affichait 0 point quoi qu'ait répondu l'apprenant.
        //
        // On met à jour le verdict SANS repasser par recordAnswer, qui compterait une
        // tentative de plus : la réponse n'a pas changé, ce n'est pas un nouvel essai.
        question.isCorrect = isCorrect;
        question.score     = score;
        question.updatedAt = new Date().toISOString();
    }

    if (pm.recomputeChapterStats) pm.recomputeChapterStats(ChapterSession.progress.chapters[ChapterSession.chapterId]);
    if (pm.recomputeGlobalStats) pm.recomputeGlobalStats(ChapterSession.progress);
    if (pm.unlockNextChapter && window.chaptersIndex) {
        pm.unlockNextChapter(ChapterSession.progress, ChapterSession.chapterId, window.chaptersIndex);
    }
    if (pm.saveProgress && ChapterSession.studentId) pm.saveProgress(ChapterSession.studentId, ChapterSession.progress);

    updateAllProgressIndicators();
}

window.syncAnswerToProgress = syncAnswerToProgress;

/**
 * Synchroniser la lecture d'un cours avec progressManager
 */
async function syncCourseToProgress(courseId) {
    const pm = getProgressManager();
    if (!pm.recordAnswer || !ChapterSession.progress || !ChapterSession.chapterId) return;

    const chapterConfig = window.currentChapterConfig;
    if (!chapterConfig) return;

    if (pm.ensureChapterInitialized && window.chaptersIndex) {
        pm.ensureChapterInitialized(ChapterSession.progress, window.chaptersIndex);
    }

    const chapterQuestions = ChapterSession.progress.chapters[ChapterSession.chapterId].questions;
    const now = new Date().toISOString();

    if (!chapterQuestions[courseId]) {
        chapterQuestions[courseId] = {
            questionHash: courseId,
            answered: true,
            answer: 'read',
            isCorrect: true,
            score: 0,
            attempts: 1,
            attemptHistory: [],
            answeredAt: now,
            createdAt: now,
            updatedAt: now,
            needsManualCorrection: false,
            manualCorrectionStatus: 'none'
        };
    } else {
        const course = chapterQuestions[courseId];
        course.answered = true;
        course.answer = 'read';
        course.isCorrect = true;
        course.updatedAt = now;
    }

    if (pm.recomputeChapterStats) pm.recomputeChapterStats(ChapterSession.progress.chapters[ChapterSession.chapterId]);
    if (pm.recomputeGlobalStats) pm.recomputeGlobalStats(ChapterSession.progress);

    if (pm.unlockNextChapter && window.chaptersIndex) {
        pm.unlockNextChapter(ChapterSession.progress, ChapterSession.chapterId, window.chaptersIndex);
    }
    if (pm.saveProgress && ChapterSession.studentId) pm.saveProgress(ChapterSession.studentId, ChapterSession.progress);

    updateAllProgressIndicators();
}
window.syncCourseToProgress = syncCourseToProgress;

// ============================================================================
// BROUILLONS — les réponses qui partent chez un humain s'enregistrent seules
// ============================================================================
// En mode normal, la frappe n'enregistrait rien : le bouton était le seul point
// d'écriture, et le rendu de copie ne relisait pas la page. Une réponse modifiée
// après son envoi partait donc à l'évaluateur dans sa version précédente, sans
// que rien ne le signale.
//
// On n'enregistre d'office QUE ce qui n'engage rien : une réponse destinée à un
// humain (voir partChezUnHumain). Vérifier reste un acte voulu de l'apprenant —
// il peut coûter des points ou déclencher une pénalité, on n'y touche pas.

const _brouillonsEnAttente = new Map();   // questionId → { minuterie, reponse }
const DELAI_BROUILLON_MS = 800;

/**
 * Écrit la saisie courante. Appelé à la frappe, donc différé : sans ça, une
 * frappe soutenue déclencherait une écriture de stockage toutes les 120 ms
 * (l'anti-rebond de studentWorkEditor). Dernier appel gagnant.
 */
function syncBrouillonToProgress(questionId, reponse) {
    const enAttente = _brouillonsEnAttente.get(questionId);
    if (enAttente) clearTimeout(enAttente.minuterie);

    const minuterie = setTimeout(() => {
        _brouillonsEnAttente.delete(questionId);
        ecrireBrouillon(questionId, reponse);
    }, DELAI_BROUILLON_MS);

    _brouillonsEnAttente.set(questionId, { minuterie, reponse });
}

/** Écriture immédiate, sans différé. */
function ecrireBrouillon(questionId, reponse) {
    const pm = getProgressManager();
    if (!pm.enregistrerBrouillon || !ChapterSession.progress) return;

    ChapterSession.studentId = pm.getCurrentStudentId ? pm.getCurrentStudentId() : ChapterSession.studentId;
    ChapterSession.chapterId = pm.getCurrentChapterId ? pm.getCurrentChapterId() : ChapterSession.chapterId;
    if (!ChapterSession.chapterId) return;

    if (pm.ensureChapterInitialized && window.chaptersIndex) {
        pm.ensureChapterInitialized(ChapterSession.progress, window.chaptersIndex);
    }

    const question = ChapterSession.progress?.chapters?.[ChapterSession.chapterId]?.questions?.[questionId];
    if (!question) return;

    // Rien de neuf : ne pas réécrire pour réécrire.
    const valeur = (reponse === undefined) ? null : reponse;
    if (answersEqual(question.answer, valeur)) return;

    pm.enregistrerBrouillon(ChapterSession.progress, ChapterSession.chapterId, questionId, valeur);

    // Pas de unlockNextChapter ici : un brouillon ne débloque rien.
    if (pm.saveProgress && ChapterSession.studentId) pm.saveProgress(ChapterSession.studentId, ChapterSession.progress);

    updateAllProgressIndicators();
}

/**
 * Force l'écriture des brouillons encore différés. À appeler avant de rendre la
 * copie : sinon la dernière frappe, celle qui n'a pas encore atteint son délai,
 * serait perdue au moment précis où elle compte le plus.
 */
function viderLesBrouillonsEnAttente() {
    // Copier avant d'itérer : ecrireBrouillon ne touche pas la table, mais on ne
    // veut pas que ça devienne faux au premier remaniement.
    const differes = [..._brouillonsEnAttente.entries()];
    _brouillonsEnAttente.clear();

    for (const [questionId, { minuterie, reponse }] of differes) {
        clearTimeout(minuterie);
        ecrireBrouillon(questionId, reponse);
    }
}

window.syncBrouillonToProgress    = syncBrouillonToProgress;
window.ecrireBrouillon            = ecrireBrouillon;
window.viderLesBrouillonsEnAttente = viderLesBrouillonsEnAttente;
