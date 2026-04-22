// ============================================================================
// getChapterBadgeState - FONCTION UNIQUE DE REFERENCE POUR LES STATUTS
// ============================================================================
// Source de vérité UNIQUE pour tous les badges d'état des chapitres
// Utilisée PARTOUT dans l'application: suivi apprenants, rendus, dashboard
// Ordre de priorité garanti, aucune ambiguïté, aucun cas limite
// ============================================================================

/**
 * Retourne l'état d'affichage unique et cohérent pour un chapitre
 * Source de vérité ABSOLUE - UTILISER CETTE FONCTION PARTOUT
 * 
 * @param {Object} chapter - Objet chapitre depuis progressManager
 * @returns {Object} { label, icon, color, priority, subtitle }
 */
function getChapterBadgeState(chapter) {

    // 🔝 PRIORITE 1: Validé définitivement par le formateur
    if (chapter.correctionStatus === 'approved') {
        return { 
            label: 'Terminé', 
            icon: '✅', 
            color: 'success', 
            priority: 1,
            subtitle: null
        };
    }

    // 🔝 PRIORITE 2: Retourné pour corrections
    if (chapter.submissionStatus === 'returned_for_revision') {
        return { 
            label: 'À revoir', 
            icon: '🔄', 
            color: 'returned', 
            priority: 2,
            subtitle: null
        };
    }

    // 🔝 PRIORITE 3: Rendu en attente de correction
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

    // 🔝 PRIORITE 4: Commencé mais pas rendu
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

    // 🔝 PRIORITE 5: Jamais touché
    return { 
        label: 'Non commencé', 
        icon: '⚪', 
        color: 'neutral', 
        priority: 5,
        subtitle: null
    };
}

// Export global
window.getChapterBadgeState = getChapterBadgeState;

console.log('✅ getChapterBadgeState chargé - Source de vérité statuts active');