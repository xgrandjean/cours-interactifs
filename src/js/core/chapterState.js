/**
 * chapterState.js - COEUR LOGIQUE PUR ✅ FINAL VERSION
 *
 * RÈGLE ABSOLUE: AUCUNE DÉPENDANCE EXTERNE
 * Pas de DOM, pas de storage, pas de fetch, pas de window
 * 100% testable, 100% prévisible
 *
 * C'est LA SEULE SOURCE DE VÉRITÉ pour le statut d'un chapitre (côté étudiant)
 *
 * Champs retournés :
 * - status        : identifiant machine du statut
 * - label         : texte affiché à l'étudiant
 * - note          : note sur 20 ou null
 * - percent       : progression en %
 * - locked        : true = accès au chapitre bloqué (isTeacherLocked uniquement)
 * - bilanLocked   : true = bilan non accessible
 *                   Règle : locked OU not_started OU (isExamMode ET non validé)
 * - priority      : ordre de priorité pour tri éventuel
 */

export function computeChapterState(progress = {}, chapterConfig = {}) {

    const submissionStatus = progress.submissionStatus || 'not_submitted';
    const percent = progress.completionPercent ?? 0;

    const note =
        progress.noteSur20 ??
        progress.noteAttribuee ??
        null;

    const isExamMode =
        chapterConfig.examMode === true ||
        progress.isExamMode === true;

    console.log(isExamMode,chapterConfig.examMode)

    const isTeacherLocked = chapterConfig.locked === true;

    // ============================
    // Verrouillé par le formateur
    // locked: true → bilanLocked: true
    // ============================
    if (isTeacherLocked) {
        return {
            status: percent > 0 ? 'locked_inprogress' : 'locked',
            label: percent > 0
                ? '🔒 Verrouillé (progression conservée)'
                : '🔒 Verrouillé',
            note: null,
            percent,
            locked: true,
            bilanLocked: true,
            priority: 1000
        };
    }

    // ============================
    // Validé par le formateur
    // locked: false → bilanLocked: false
    // ============================
    if (submissionStatus === 'validated') {
        return {
            status: 'validated',
            label: '✅ Validé',
            note,
            percent,
            locked: false,
            bilanLocked: false,
            priority: 100
        };
    }

    // ============================
    // Retourné pour retouche
    // bilanLocked: isExamMode
    // ============================
    if (submissionStatus === 'returned_for_revision') {
        return {
            status: 'returned_for_revision',
            label: '🔄 Retourné pour retouche',
            note: null,
            percent,
            locked: false,
            bilanLocked: isExamMode,
            priority: 90
        };
    }

    // ============================
    // Rendu — en attente
    // bilanLocked: isExamMode
    // ============================
    if (submissionStatus === 'submitted') {
        return {
            status: 'submitted',
            label: '📝 Rendu - En attente de correction',
            note: null,
            percent,
            locked: false,
            bilanLocked: isExamMode,
            priority: 80
        };
    }

    // ============================
    // Rendu en retard
    // bilanLocked: isExamMode
    // ============================
    if (submissionStatus === 'late_submitted') {
        return {
            status: 'late',
            label: '⚠️ Rendu - En retard',
            note: null,
            percent,
            locked: false,
            bilanLocked: isExamMode,
            priority: 70
        };
    }

    // ============================
    // Mode examen — non soumis
    // bilanLocked: true (examen en cours, pas encore validé)
    // ============================
    if (isExamMode) {
        return {
            status: percent > 0 ? 'exam_inprogress' : 'exam',
            label: percent > 0 ? '⛔ Examen en cours' : '⛔ Examen - Non commencé',
            note: null,
            percent,
            locked: false,
            bilanLocked: true,
            priority: 60
        };
    }

    // ============================
    // Mode normal — en cours
    // bilanLocked: false
    // ============================
    if (percent > 0) {
        return {
            status: 'inprogress',
            label: '⏳ En cours',
            note: null,
            percent,
            locked: false,
            bilanLocked: false,
            priority: 10
        };
    }

    // ============================
    // Non commencé
    // bilanLocked: true (rien à voir)
    // ============================
    return {
        status: 'not_started',
        label: '⬜ Non commencé',
        note: null,
        percent,
        locked: false,
        bilanLocked: true,
        priority: 0
    };
}