/**
 * utils.js - Fonctions utilitaires partagées entre les modules
 */

/**
 * Vérifie si un état de chapitre correspond à un filtre de statut.
 * @param {Object} state - État calculé du chapitre (retour de computeChapterState/getChapterBadgeState)
 * @param {string} statusFilter - Valeur du filtre
 * @returns {boolean}
 */
function matchesStatus(state, statusFilter) {
    switch(statusFilter) {
        case 'in_progress':
            return state.status === 'in_progress' || state.status === 'exam_in_progress';
        case 'not_started':
            return state.status === 'not_started' || state.status === 'exam';
        default:
            return state.status === statusFilter;
    }
}

window.matchesStatus = matchesStatus;
