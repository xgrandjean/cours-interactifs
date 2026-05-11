// ============================================================================
// MAIN.JS - Code générique de l'application (VERSION NETTOYÉE)
// ============================================================================

// ============================================================================
// UTILITAIRES DOM
// ============================================================================

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);


// ============================================================================
// CONFIG CHAPITRES
// ============================================================================

function getChapterConfigById(chapterId) {
    const config = StorageService.get(STORAGE_KEYS.CHAPTER_CONFIG, {});
    return config[chapterId] || { locked: false, endDate: null, examMode: false };
}

// ============================================================================
// INITIALISATION
// ============================================================================

window.APP_BASE_URL = (() => {
    // Si parcours.js est chargé, on utilise Parcours.homeUrl comme base
    // (plus fiable que le calcul par profondeur dans la structure multi-parcours)
    if (window.Parcours && Parcours.homeUrl) {
        return Parcours.homeUrl;
    }
    // Fallback : calcul par profondeur du pathname (comportement original)
    const depth = (window.location.pathname.match(/\//g) || []).length - 1;
    return '../'.repeat(depth);
})();

// ============================================================================
// EXPORTS
// ============================================================================

window.$ = $;
window.$$ = $$;
window.getChapterConfigById = getChapterConfigById;
