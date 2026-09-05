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

    function answersEqual(a, b) {
        if (Array.isArray(a) && Array.isArray(b)) {
            return a.length === b.length && a.every((val, idx) => val === b[idx]);
        }
        return a === b;
    }

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

    // ✅ Sauvegarde explicite avec la clé complète (slug + studentId)
    (async () => {
        const slug = window.currentParcoursSlug || (window.Parcours ? Parcours.slug : null);
        const studentId = ChapterSession.studentId;
        if (slug && studentId) {
            const key = `${slug}:${studentId}:student_${studentId}_progress`;
            await storage.set(key, ChapterSession.progress);
            console.log(`✅ Réponse sauvegardée dans ${key}`);
        }
    })();

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

    // ✅ Sauvegarde explicite avec la clé complète (slug + studentId)
    const slug = window.currentParcoursSlug || (window.Parcours ? Parcours.slug : null);
    const studentId = ChapterSession.studentId;
    if (slug && studentId) {
        const key = `${slug}:${studentId}:student_${studentId}_progress`;
        await storage.set(key, ChapterSession.progress);
        console.log(`✅ Cours validé sauvegardé dans ${key}`);
    }

    if (pm.unlockNextChapter && window.chaptersIndex) {
        pm.unlockNextChapter(ChapterSession.progress, ChapterSession.chapterId, window.chaptersIndex);
    }
    if (pm.saveProgress && ChapterSession.studentId) pm.saveProgress(ChapterSession.studentId, ChapterSession.progress);

    updateAllProgressIndicators();
}
window.syncCourseToProgress = syncCourseToProgress;
