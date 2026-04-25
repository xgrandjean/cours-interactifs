// ============================================================================
// CHAPITRE.JS - Orchestration de la page de chapitre
// ============================================================================
// Fichier allégé : la logique métier, DOM et bilan ont été factorisés dans :
//   - core/chapterSession.js    (session, sync progressManager)
//   - chapter/chapterUI.js      (DOM, restauration, indicateurs)
//   - chapter/chapterSubmission.js (rendu, validation, lock)
//   - chapter/chapterBilan.js   (modal bilan détaillé)
// ============================================================================

// ============================================================================
// CHARGEMENT CONFIG
// ============================================================================

async function loadChapterConfig() {
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
}

// ============================================================================
// INITIALISATION PROGRESSION
// ============================================================================

async function initProgression() {
    const pm = getProgressManager();
    if (!pm.getOrCreateStudentProgress) return;

    ChapterSession.studentId = pm.getCurrentStudentId ? pm.getCurrentStudentId() : null;
    ChapterSession.chapterId = pm.getCurrentChapterId ? pm.getCurrentChapterId() : null;

    if (!ChapterSession.studentId || !ChapterSession.chapterId) return;

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

    // ✅ INITIALISATION UNIQUE DU CONTEXTE EXAMEN
    initChapterExamContext(ChapterSession.progress.chapters[ChapterSession.chapterId]);
}

// ============================================================================
// INITIALISATION UI ET CALLBACKS
// ============================================================================

function initCallbacks() {
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

        syncAnswerToProgress(questionId, answer, isCorrect, isCorrect ? points : 0);
        ChapterUI.updateAllProgressIndicators();
    };

    window.studentWorkEditor.init();
}

// ============================================================================
// INITIALISATION GLOBALE
// ============================================================================

async function initChapterPage() {
    if (!window.location.pathname.includes('chapitre')) return;

    await loadChapterConfig();
    await initProgression();

    ChapterUI.initializeStats();
    ChapterUI.applyChapterMode();
    initCallbacks();

    setTimeout(() => { ChapterUI.updateSubmitButton(); }, 400);
    setTimeout(() => { ChapterUI.restoreAllAnswers(); }, 300);
}

document.addEventListener('DOMContentLoaded', () => {
    initChapterPage();
});

// ============================================================================
// EXPORTS GLOBAUX (compatibilité)
// ============================================================================

window.initChapterPage = initChapterPage;
