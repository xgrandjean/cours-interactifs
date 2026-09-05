/**
 * Obtient le contexte d'examen pour un chapitre - SOURCE UNIQUE DE VERITE
 * Remplace toute logique dispersée concernant le mode examen
 * 
 * @param {Object} chapter - Objet chapitre
 * @param {Object|null} chapterConfig - Configuration du chapitre
 * @returns {Object} Contexte d'examen normalisé
 */
function getExamContext(chapter, chapterConfig = null) {

    // Correction : détecter correctement les objets vides pour éviter la désynchronisation vue professeur
    const config = (chapterConfig && Object.keys(chapterConfig).length > 0) 
        ? chapterConfig 
        : window.currentChapterConfig;

    const submissionStatus = chapter?.submissionStatus || 'not_submitted';

    const isSubmitted = submissionStatus === 'submitted' || submissionStatus === 'late_submitted';
    const isCorrected = submissionStatus === 'validated';

    // 1. Déterminer le mode + la date limite EFFECTIFS.
    //    Une fois qu'un élève a démarré un chapitre (frozenAt posé par initChapter()),
    //    son contexte est figé : il ne suit plus les changements globaux faits après coup
    //    (utile avec plusieurs classes démarrant à des moments différents). Tant qu'il n'a
    //    pas démarré, on affiche la config globale actuelle (page d'accueil).
    const started = chapter?.frozenAt != null;

    const effectiveChapterMode = started
        ? chapter.frozenChapterMode
        : (config?.chapterMode || (config?.examMode ? 'exam' : 'normal'));

    const effectiveDateLimitEnabled = started
        ? chapter.frozenDateLimitEnabled === true
        : config?.dateLimitEnabled === true;

    const effectiveEndDate = started
        ? chapter.frozenEndDate
        : (config?.endDate || null);

    const mode = effectiveChapterMode;

    // 2. Verrouillage formateur : SEUL le verrou manuel ("🔒 Verrouiller", toujours en direct,
    //    jamais figé, global — pas d'exception individuelle) bloque le chapitre. La date limite
    //    figée pour cet élève ne bloque rien : elle sert uniquement à marquer son rendu comme
    //    "en retard" au moment où il rend sa copie (voir chapterSubmission.js / submitChapter()).
    const isManuallyLocked = config?.locked === true;
    const isDeadlinePassed = Boolean(
        effectiveDateLimitEnabled && effectiveEndDate && new Date() > new Date(effectiveEndDate)
    );
    const isTeacherLocked = isManuallyLocked;

    return {
        // vrais booléens pour chaque mode
        // Atelier AR : c'est un mode Découverte. Il n'a volontairement AUCUN levier propre ici —
        // il obtient le comportement Découverte par absence des autres drapeaux (chaque branche
        // du code teste explicitement exam / blind / millionnaire). Ce qu'il change se joue au
        // niveau des questions ouvertes à correction manuelle (cf. "mode atelier AR.md").
        isExamMode:        mode === 'exam',
        isBlindMode:       mode === 'blind',
        isMillionnaireMode: mode === 'millionnaire',
        isAtelierMode:     mode === 'atelier',
        // Consigne : c'est aussi un mode Découverte, et lui non plus n'a AUCUN levier propre
        // côté élève — le chapitre est travaillé sur papier, mais celui qui ouvre quand même
        // l'application y trouve exactement Découverte. Ce drapeau ne sert qu'à la posture de
        // CORRECTION côté formateur : accessible sans rendu, champs vides normaux, pénalité de
        // cours neutre. Ne pas le tester dans le code de la vue élève.
        isConsigneMode:    mode === 'consigne',
        isNormalMode:      mode === 'normal',

        // état progression
        isSubmitted,
        isCorrected,

        // verrouillage formateur (manuel uniquement) ; isDeadlinePassed est informatif
        // (utilisé pour le marquage "en retard" à la soumission, pas pour verrouiller)
        isManuallyLocked,
        isDeadlinePassed,
        isTeacherLocked,
        isChapterLocked: isSubmitted || isCorrected || isTeacherLocked,

        // debug utile
        _debug: {
            chapterMode: mode,
            submissionStatus,
            started,
            isManuallyLocked,
            isDeadlinePassed
        }
    };
}

// Export global pour compatibilité avec les scripts classiques
window.getExamContext = getExamContext;
