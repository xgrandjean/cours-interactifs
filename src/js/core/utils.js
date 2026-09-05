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
            return state.status === 'in_progress' || state.status === 'exam_in_progress' || state.status === 'blind_in_progress';
        case 'not_started':
            return state.status === 'not_started' || state.status === 'exam' || state.status === 'blind';
        case 'locked':
            return state.status === 'locked' || state.status === 'locked_inprogress';
        // Filtres de MODE : matchent peu importe l'avancement (non commencé, en cours, rendu,
        // corrigé, verrouillé...) — contrairement aux autres filtres qui portent sur le statut.
        case 'exam':
            return state.mode === 'exam';
        case 'blind':
            return state.mode === 'blind';
        case 'atelier':
            return state.mode === 'atelier';
        default:
            return state.status === statusFilter;
    }
}

/**
 * Vérifie qu'une question respecte les règles minimales de cohérence de son type
 * (ex: un QCM/selection doit avoir au moins une option, toute question doit avoir un énoncé).
 * @param {Object} question
 * @returns {boolean}
 */
function isQuestionValid(question) {
    if (!question || !question.questionText || !String(question.questionText).trim()) return false;
    if ((question.type === 'qcm' || question.type === 'selection') &&
        (!Array.isArray(question.options) || question.options.length === 0)) {
        return false;
    }
    return true;
}

/**
 * Un chapitre est-il entièrement auto-corrigé ?
 *
 * Condition d'accès à l'option « ordre aléatoire » (modes Examen, Blind,
 * Millionnaire) : mélanger des questions dont certaines attendent une correction
 * manuelle n'apporte rien et brouillerait la lecture du formateur. Un chapitre sans
 * aucune question répond false — il n'y a pas d'ordre à tirer.
 *
 * @param {Array} questions - chapter.questions (cours.json)
 * @returns {boolean}
 */
function estChapitreToutAuto(questions) {
    const liste = Array.isArray(questions) ? questions : [];
    if (liste.length === 0) return false;
    return liste.every(q => (q.correctionType || 'auto') === 'auto');
}

/**
 * Analyse l'ensemble des questions d'un chapitre pour détecter les incohérences
 * (questions invalides) et les cas particuliers (chapitre vide, ou uniquement du cours).
 * @param {Array} questions - chapter.questions (cours.json)
 * @param {number} courseCount - chapter.courseCount (cours.json)
 * @returns {{invalidQuestions: Array, validQuestionCount: number, isEmpty: boolean, isCourseOnly: boolean, hasIssues: boolean}}
 */
function analyzeChapterQuestions(questions, courseCount) {
    const list = questions || [];
    const invalidQuestions = list.filter(q => !isQuestionValid(q));
    const validQuestionCount = list.length - invalidQuestions.length;
    const hasCourses = (courseCount || 0) > 0;
    return {
        invalidQuestions,
        validQuestionCount,
        isEmpty: validQuestionCount === 0 && !hasCourses,
        isCourseOnly: validQuestionCount === 0 && hasCourses,
        hasIssues: invalidQuestions.length > 0
    };
}

window.matchesStatus = matchesStatus;
window.estChapitreToutAuto = estChapitreToutAuto;
window.isQuestionValid = isQuestionValid;
window.analyzeChapterQuestions = analyzeChapterQuestions;
