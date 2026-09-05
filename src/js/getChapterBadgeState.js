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

    // PRIORITE 1 — Validé (prime sur tout)
    if (chapter.submissionStatus === 'validated') {
        return {
            status: 'validated',
            label: 'Corrigé',
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

    // PRIORITE 3 — Rendu
    if (chapter.submissionStatus === 'submitted') {
        return {
            status: 'submitted',
            label: 'Rendu',
            icon: '📤',
            color: 'pending',
            mode
        };
    }

    // PRIORITE 3 BIS — Rendu en retard
    if (chapter.submissionStatus === 'late_submitted') {
        return {
            status: 'late_submitted',
            label: 'Rendu en retard',
            icon: '⚠️',
            color: 'warning',
            mode
        };
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
