/**
 * Obtient le contexte d'examen pour un chapitre - SOURCE UNIQUE DE VERITE
 * Remplace toute logique dispersée concernant le mode examen
 * 
 * @param {Object} chapter - Objet chapitre
 * @param {Object|null} chapterConfig - Configuration du chapitre
 * @param {Object} globalContext - Contexte global (overrides)
 * @returns {Object} Contexte d'examen normalisé
 */
function getExamContext(chapter, chapterConfig = null, globalContext = {}) {

    const config = chapterConfig || window.currentChapterConfig;

    const submissionStatus = chapter?.submissionStatus || 'not_submitted';

    const isSubmitted = submissionStatus === 'submitted' || submissionStatus === 'late_submitted';
    const isCorrected = submissionStatus === 'validated';

    // 1. source UNIQUE de vérité pour le mode examen du chapitre
    const chapterExamMode = Boolean(config?.examMode);

    // 2. override global (ex: mode examen externe, test, admin)
    const globalExamMode = Boolean(globalContext?.examMode);


    let el={
        // vrai mode examen = OR contrôlé (mais explicite)
        isExamMode: chapterExamMode || globalExamMode,

        // état progression
        isSubmitted,
        isCorrected,

        // verrouillage strict
        isChapterLocked: isSubmitted || isCorrected,

        // debug utile
        _debug: {
            chapterExamMode,
            globalExamMode,
            submissionStatus
        }
    }
    
    return {
        // vrai mode examen = OR contrôlé (mais explicite)
        isExamMode: chapterExamMode || globalExamMode,

        // état progression
        isSubmitted,
        isCorrected,

        // verrouillage strict
        isChapterLocked: isSubmitted || isCorrected,

        // debug utile
        _debug: {
            chapterExamMode,
            globalExamMode,
            submissionStatus
        }
    };
}

// Export global pour compatibilité avec les scripts classiques
window.getExamContext = getExamContext;