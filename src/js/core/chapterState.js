/**
 * chapterState.js - COEUR LOGIQUE PUR ✅ FINAL VERSION
 * 
 * RÈGLE ABSOLUE: AUCUNE DÉPENDANCE EXTERNE
 * Pas de DOM, pas de storage, pas de fetch, pas de window
 * 100% testable, 100% prévisible
 * 
 * C'est LA SEULE SOURCE DE VÉRITÉ pour le statut d'un chapitre
 */

export function computeChapterState(progress = {}, chapterConfig = {}) {

    let submissionStatus = progress.submissionStatus || 'not_submitted';

    const percent = progress.completionPercent ?? 0;

    const note =
        progress.noteSur20 ??
        progress.noteAttribuee ??
        null;

    const isExamMode =
        chapterConfig.examMode === true ||
        progress.isExamMode === true;

    if (submissionStatus === 'validated') {
        return {
            status: 'validated',
            label: '✅ Validé',
            note,
            percent, 
            locked: false,
            priority: 100
        };
    }

    if (submissionStatus === 'returned_for_revision') {
        return {
            status: 'returned_for_revision',
            label: '🔄 Retourné pour retouche',
            note: null,
            percent,
            locked: true,
            priority: 90
        };
    }

    if (submissionStatus === 'submitted') {
        return {
            status: 'submitted',
            label: '📝 Rendu - En attente de correction',
            note: null,
            percent,
            locked: true,
            priority: 80
        };
    }

    if (submissionStatus === 'late_submitted') {
        return {
            status: 'late',
            label: '⚠️ Rendu - En retard',
            note: null,
            percent,
            locked: true,
            priority: 70
        };
    }

    if (isExamMode) {
        return {
            status: 'exam_locked',
            label: '⛔ Examen en cours',
            note: null,
            percent,
            locked: true,
            priority: 60
        };
    }

    return {
        status: percent > 0 ? 'inprogress' : 'locked',
        label: percent > 0 ? '⏳ En cours' : '🔒 Verrouillé',
        note: null,
        percent,
        locked: false,
        priority: percent > 0 ? 10 : 0
    };
}