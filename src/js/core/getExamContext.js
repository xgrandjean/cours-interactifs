/**
 * Obtient le contexte d'examen pour un chapitre - SOURCE UNIQUE DE VERITE
 * Remplace toute logique dispersée concernant le mode examen
 * 
 * @param {Object} chapter - Objet chapitre
 * @param {Object|null} chapterConfig - Configuration du chapitre
 * @param {string|null} jeton - L'élève dont c'est la copie, pour son exception de verrou
 *   (verrousEleves). Sans jeton, seul le verrou du chapitre compte.
 * @returns {Object} Contexte d'examen normalisé
 */
function getExamContext(chapter, chapterConfig = null, jeton = null) {

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
    //    jamais figé) bloque le chapitre. Le verrou du chapitre est le réglage par défaut ; une
    //    exception par élève (verrousEleves, posée par XPro ou la fiche élève) l'emporte — un
    //    même parcours sert plusieurs classes (06/11/2026). La date limite figée pour cet élève
    //    ne bloque rien : elle sert uniquement à marquer son rendu comme "en retard" au moment
    //    où il rend sa copie (voir chapterSubmission.js / submitChapter()).
    const isManuallyLocked = verrouPourEleve(config, jeton);
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
        // 🔁 Entraînement : la config en direct le dit, et l'apprenant n'a pas commencé le chapitre
        // dans un autre mode — qui l'avait commencé autrement garde son mode figé (rétrocompatibilité,
        // même règle que ChapterEntrainement.estModeEntrainement). Rien ne s'enregistre.
        isEntrainementMode: config?.chapterMode === 'entrainement'
            && (!started || !chapter.frozenChapterMode || chapter.frozenChapterMode === 'entrainement'),

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

/**
 * Le chapitre est-il verrouillé pour CET élève ? Son exception (chapter_config.verrousEleves :
 * true = fermé, false = ouvert) s'il en a une, sinon le verrou du chapitre (locked). Copie de
 * verrouPourEleve dans XSpro (datesLimitesParcours.js) : les modifier ensemble.
 */
function verrouPourEleve(config, jeton) {
    const propres = config && config.verrousEleves;
    if (jeton && propres && Object.prototype.hasOwnProperty.call(propres, jeton)) return propres[jeton] === true;
    return !!config && config.locked === true;
}

/**
 * ⊘ Le chapitre n'est-il PAS attribué à cet élève ? (chapter_config.nonAttribuesEleves, posé par
 * XEdu, 10/11/2026 : le chapitre ne concerne pas sa classe, ou son parcours est adapté.) L'accueil
 * ne le lui montre pas (index.js). Ce n'est pas un 3e état du site : XEdu pose en même temps son
 * verrou (verrousEleves), si bien que tout endroit qui ne filtre pas — un lien direct — le montre
 * 🔒, jamais ouvert. Copie de estNonAttribue dans XSpro (datesLimitesParcours.js) : les modifier ensemble.
 */
function nonAttribuePourEleve(config, jeton) {
    const propres = config && config.nonAttribuesEleves;
    return !!(jeton && propres && Object.prototype.hasOwnProperty.call(propres, jeton) && propres[jeton] === true);
}

/** Combien d'élèves ont une exception : { ouverts, fermes }. Pour la vue formateur. */
function compterExceptionsVerrou(config) {
    const valeurs = Object.values((config && config.verrousEleves) || {});
    return { ouverts: valeurs.filter(v => v === false).length, fermes: valeurs.filter(v => v === true).length };
}

// Export global pour compatibilité avec les scripts classiques
window.getExamContext = getExamContext;
window.verrouPourEleve = verrouPourEleve;
window.nonAttribuePourEleve = nonAttribuePourEleve;
window.compterExceptionsVerrou = compterExceptionsVerrou;
