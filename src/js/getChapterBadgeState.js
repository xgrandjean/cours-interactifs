function getChapterBadgeState(chapter, chapterConfig = {}, globalContext = {}) {

    const examContext = getExamContext(chapter, chapterConfig, globalContext);
    const isExamMode = examContext.isExamMode;

    const hasAnyAnswer = Object.values(chapter.questions || {}).some(q => 
        q.answered === true || 
        (typeof q.answer === 'string' && q.answer.trim() !== '') ||
        (Array.isArray(q.answer) && q.answer.length > 0)
    );

    // PRIORITE 1 — Validé (prime sur tout)
    if (chapter.submissionStatus === 'validated') {
        return { 
            status: 'validated',
            label: 'Terminé', 
            icon: '✅', 
            color: 'success', 
            subtitle: null
        };
    }

    // PRIORITE 2 — Retourné
    if (chapter.submissionStatus === 'returned_for_revision') {
        return { 
            status: 'returned_for_revision',
            label: 'À revoir', 
            icon: '🔄', 
            color: 'returned_for_revision', 
            subtitle: null
        };
    }

    // PRIORITE 3 — Rendu
    if (chapter.submissionStatus === 'submitted') {
        return { 
            status: 'submitted',
            label: 'Rendu', 
            icon: '📤', 
            color: 'pending', 
            subtitle: 'En attente de correction'
        };
    }

    // PRIORITE 3 BIS — Rendu en retard
    if (chapter.submissionStatus === 'late_submitted') {
        return { 
            status: 'late_submitted',
            label: 'Rendu en retard', 
            icon: '⚠️', 
            color: 'warning', 
            subtitle: 'En attente de correction'
        };
    }

    // PRIORITE 4 — Mode examen (seulement si pas encore rendu)
    if (isExamMode) {
        return { 
            status: hasAnyAnswer ? 'exam_in_progress' : 'exam',
            label: hasAnyAnswer ? 'Examen en cours' : 'Mode examen', 
            icon: hasAnyAnswer ? '⛔' : '⚪', 
            color: hasAnyAnswer ? 'exam' : 'neutral',
            subtitle: null
        };
    }

    // PRIORITE 5 — En cours
    if (hasAnyAnswer) {
        return { 
            status: 'in_progress',
            label: 'En cours', 
            icon: '🟡', 
            color: 'progress', 
            subtitle: null
        };
    }

    // PRIORITE 6 — Non commencé
    return { 
        status: 'not_started',
        label: 'Non commencé', 
        icon: '⚪', 
        color: 'neutral', 
        subtitle: null
    };
}