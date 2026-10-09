function getChapterBadgeState(chapter, chapterConfig = {}) {

    const examContext = getExamContext(chapter, chapterConfig);

    // Mode effectif (figé pour l'élève une fois démarré) — indépendant du statut/avancement,
    // sert au filtre "Mode examen"/"Mode blind" (matche peu importe l'étape : non commencé,
    // en cours, rendu, corrigé, verrouillé...) et à l'icône du badge ci-dessous.
    const mode = examContext.isExamMode ? 'exam'
        : examContext.isBlindMode ? 'blind'
        : examContext.isMillionnaireMode ? 'millionnaire'
        : examContext.isAtelierMode ? 'atelier'
        : examContext.isConsigneMode ? 'consigne'
        : 'normal';

    // Icône de MODE — toujours affichée en fonction du mode, jamais du statut. Le statut,
    // lui, s'exprime uniquement par le libellé (+ sa propre icône pour les statuts de rendu,
    // universels et déjà indépendants du mode). Convention alignée sur chapterRenderer.js
    // (page d'accueil élève) : 📖 Découverte, 📝 Examen, 🥽 Blind, 💰 Millionnaire, 🧾 Atelier AR,
    // 📋 Consigne.
    const modeIcon = mode === 'exam' ? '📝'
        : mode === 'blind' ? '🥽'
        : mode === 'millionnaire' ? '💰'
        : mode === 'atelier' ? '🧾'
        : mode === 'consigne' ? '📋'
        : '📖';

    const hasAnyAnswer = Object.values(chapter.questions || {}).some(q =>
        q.answered === true ||
        (typeof q.answer === 'string' && q.answer.trim() !== '') ||
        (Array.isArray(q.answer) && q.answer.length > 0)
    );

    // Vocabulaire : l'apprenant REND sa copie (Rendu, Rendu en retard) ; le formateur PUBLIE
    // la correction (Corrigé, à publier → Correction publiée). Jamais « rendre » pour le geste
    // du formateur. Même libellés que XSpro (getTeacherSubmissionLikeState).

    // PRIORITE 1 — Correction publiée (prime sur tout). Libellé court, « Publié » : la
    // pastille tient dans une ligne de la carte du suivi, « Correction publiée » y passait
    // sur deux lignes et débordait.
    if (chapter.submissionStatus === 'validated') {
        return {
            status: 'validated',
            label: 'Publié',
            icon: '✅',
            color: 'success',
            mode
        };
    }

    // PRIORITE 2 — Retourné : icône du mode (règle générale), libellé du statut
    if (chapter.submissionStatus === 'returned_for_revision') {
        return {
            status: 'returned_for_revision',
            label: 'À revoir',
            icon: modeIcon,
            color: 'returned_for_revision',
            mode
        };
    }

    // PRIORITE 3 — Rendu, ou corrigé et pas encore publié. `correctionStatus` suit les
    // questions manuelles (validated d'office s'il n'y en a aucune) : une copie rendue et
    // entièrement corrigée n'attend plus que « Publier la correction ». Le `status` reste
    // 'submitted'/'late_submitted' — filtres et bordures en dépendent —, seul le libellé change.
    const correctionFinie = chapter.correctionStatus === 'corrected' || chapter.correctionStatus === 'validated';
    if (chapter.submissionStatus === 'submitted') {
        return correctionFinie
            ? { status: 'submitted', label: 'À publier', icon: '📝', color: 'progress', mode }
            : { status: 'submitted', label: 'Rendu', icon: '📤', color: 'pending', mode };
    }

    // PRIORITE 3 BIS — Rendu en retard (ou corrigé, à publier)
    if (chapter.submissionStatus === 'late_submitted') {
        return correctionFinie
            ? { status: 'late_submitted', label: 'À publier', icon: '📝', color: 'progress', mode }
            : { status: 'late_submitted', label: 'Rendu en retard', icon: '⚠️', color: 'warning', mode };
    }

    // PRIORITE 3 TER — Verrouillé par le formateur (verrou manuel, global)
    if (examContext.isTeacherLocked) {
        return {
            status: hasAnyAnswer ? 'locked_inprogress' : 'locked',
            label: 'Verrouillé',
            icon: '🔒',
            color: 'chapter-locked',
            mode
        };
    }

    // PRIORITE 4 — Non commencé / En cours, selon le mode. Schéma standard : l'icône reflète
    // toujours le mode (modeIcon), le libellé reflète toujours le statut générique — plus de
    // mélange (avant : "🥽 Blind" ou "⛔ En cours" pour l'examen, incohérents entre eux).
    if (hasAnyAnswer) {
        return {
            status: examContext.isExamMode ? 'exam_in_progress' : (examContext.isBlindMode ? 'blind_in_progress' : 'in_progress'),
            label: 'En cours',
            icon: modeIcon,
            color: 'progress',
            mode
        };
    }

    return {
        status: examContext.isExamMode ? 'exam' : (examContext.isBlindMode ? 'blind' : 'not_started'),
        label: 'Non commencé',
        icon: modeIcon,
        color: 'neutral',
        mode
    };
}
