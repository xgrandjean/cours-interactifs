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
    const globalContext = window.globalContext || window.APP_CONTEXT || {};
    window.currentExamContext = getExamContext(chapter, window.currentChapterConfig, globalContext);
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
function syncCourseToProgress(courseId) {
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
    if (pm.saveProgress && ChapterSession.studentId) pm.saveProgress(ChapterSession.studentId, ChapterSession.progress);
}
window.syncCourseToProgress = syncCourseToProgress;
