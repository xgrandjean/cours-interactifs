export function computeChapterState(progress = {}, chapterConfig = {}) {

    const submissionStatus = progress.submissionStatus || 'not_submitted';
    const percent = progress.completionPercent ?? 0;
    const note = progress.noteSur20 ?? progress.noteAttribuee ?? null;

    const examContext = getExamContext(progress, chapterConfig);
    const isExamMode = examContext.isExamMode;
    const chapterMode = examContext._debug?.chapterMode || 'normal';
    // Verrou manuel (direct) OU date limite figée dépassée pour cet élève, sauf exception accordée
    const isTeacherLocked = examContext.isTeacherLocked === true;

    // Verrouillé par le formateur
    if (isTeacherLocked) {
        return {
            status: percent > 0 ? 'locked_inprogress' : 'locked',
            label: percent > 0 ? '🔒 Verrouillé (progression conservée)' : '🔒 Verrouillé',
            note: null,
            percent,
            locked: true,
            bilanLocked: true,
            chapterMode,
        };
    }

    // Validé — prime sur tout
    if (submissionStatus === 'validated') {
        return {
            status: 'validated',
            label: '✅ Validé',
            note,
            percent,
            locked: false,
            bilanLocked: false,
            chapterMode,
        };
    }

    // Retourné pour retouche
    if (submissionStatus === 'returned_for_revision') {
        return {
            status: 'returned_for_revision',
            label: '🔄 Retourné pour retouche',
            note: null,
            percent,
            locked: false,
            bilanLocked: false,
            chapterMode,
        };
    }

    // Rendu — en attente
    if (submissionStatus === 'submitted') {
        return {
            status: 'submitted',
            label: '📝 Rendu - En attente de correction',
            note: null,
            percent,
            locked: false,
            bilanLocked: false,
            chapterMode,
        };
    }

    // Rendu en retard
    if (submissionStatus === 'late_submitted') {
        return {
            status: 'late_submitted',
            label: '⚠️ Rendu - En retard',
            note: null,
            percent,
            locked: false,
            bilanLocked: false,
            chapterMode,
        };
    }

    // Mode examen (seulement si pas encore rendu)
    if (isExamMode) {
        return {
            status: percent > 0 ? 'exam_in_progress' : 'exam',
            label: percent > 0 ? '⛔ Examen en cours' : '⛔ Examen - Non commencé',
            note: null,
            percent,
            locked: false,
            bilanLocked: true,
            chapterMode,
        };
    }

    // En cours
    if (percent > 0) {
        return {
            status: 'inprogress',
            label: '⏳ En cours',
            note: null,
            percent,
            locked: false,
            bilanLocked: false,
            chapterMode,
        };
    }

    // Non commencé
    return {
        status: 'not_started',
        label: '⬜ Non commencé',
        note: null,
        percent,
        locked: false,
        bilanLocked: true,
        chapterMode,
    };
}