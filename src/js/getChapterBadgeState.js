function getChapterBadgeState(chapter, chapterConfig = {}, globalContext = {}) {

    const examContext = getExamContext(chapter, chapterConfig, globalContext);
    const isExamMode = examContext.isExamMode;

    // 🔝 PRIORITE 0: Mode examen
    if (isExamMode) {

        const hasAnyAnswer = Object.values(chapter.questions || {}).some(q => 
            q.answered === true || 
            (typeof q.answer === 'string' && q.answer.trim() !== '') ||
            (Array.isArray(q.answer) && q.answer.length > 0)
        );

        return { 
            label: hasAnyAnswer ? 'Examen en cours' : 'Mode examen', 
            icon: !hasAnyAnswer ? '⚪' : '⛔', 
            color: !hasAnyAnswer ? 'neutral' :'exam', 
            priority: 0,
            subtitle: null
        };
    }

    // 🔝 PRIORITE 1: Validé définitivement
    if (chapter.correctionStatus === 'validated') {
        return { 
            label: 'Terminé', 
            icon: '✅', 
            color: 'success', 
            priority: 1,
            subtitle: null
        };
    }

    // 🔝 PRIORITE 2: Retourné
    if (chapter.submissionStatus === 'returned_for_revision') {
        return { 
            label: 'À revoir', 
            icon: '🔄', 
            color: 'returned_for_revision', 
            priority: 2,
            subtitle: null
        };
    }

    // 🔝 PRIORITE 3: Rendu
    if (chapter.submissionStatus === 'submitted') {
        return { 
            label: 'Rendu', 
            icon: '📤', 
            color: 'pending', 
            priority: 3,
            subtitle: 'En attente de correction'
        };
    }

    // 🔝 PRIORITE 3 BIS: Rendu en retard
    if (chapter.submissionStatus === 'late_submitted') {
        return { 
            label: 'Rendu en retard', 
            icon: '⚠️', 
            color: 'warning', 
            priority: 3,
            subtitle: 'En attente de correction'
        };
    }

    // 🔝 PRIORITE 4: En cours
    const hasAnyAnswer = Object.values(chapter.questions || {}).some(q => 
        q.answered === true || 
        (typeof q.answer === 'string' && q.answer.trim() !== '') ||
        (Array.isArray(q.answer) && q.answer.length > 0)
    );

    if (hasAnyAnswer) {
        return { 
            label: 'En cours', 
            icon: '🟡', 
            color: 'progress', 
            priority: 4,
            subtitle: null
        };
    }

    // 🔝 PRIORITE 5: Non commencé
    return { 
        label: 'Non commencé', 
        icon: '⚪', 
        color: 'neutral', 
        priority: 5,
        subtitle: null
    };
}