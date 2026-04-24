// ============================================================================
// STORAGE.JS - Couche d'abstraction pour le stockage des données
// ============================================================================
// Ce fichier doit être chargé EN PREMIER avant tout autre script
// qui utilise le stockage (dataStorage.js, main.js, etc.)
// ============================================================================

/**
 * Clés utilisées dans localStorage
 */
const STORAGE_KEYS = {
    COURSE_PROGRESS: 'course_progress',
    USER_PROGRESS: 'userProgress',
    USER_ANSWERS: 'userAnswers',
    QUESTION_ATTEMPTS: 'question_attempts',
    CHAPTER_CONFIG: 'chapter_config',
    COURSE_READ_PROGRESS: 'courseProgress'
};

/**
 * Configuration globale de l'application
 */
const APP_CONFIG = {
    PASSING_SCORE: 80,
    SUCCESS_FEEDBACK_DURATION: 3000,
    ERROR_FEEDBACK_DURATION: 5000,
    MAX_NOTE: 20
};

/**
 * Couche d'abstraction pour le stockage des données.
 * Actuellement implémentée avec localStorage, mais peut être facilement
 * remplacée par une implémentation Gist ou autre backend.
 */
const storage = {
    async get(key) {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : null;
    },
    async set(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    },
    async remove(key) {
        localStorage.removeItem(key);
    },
    /**
     * Retourne toutes les clés du stockage
     * @returns {Promise<string[]>} Liste des clés
     */
    async keys() {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            keys.push(localStorage.key(i));
        }
        return keys;
    }
};

/**
 * Service centralisé pour les opérations localStorage
 * Utilise la couche d'abstraction storage en interne
 */
class StorageService {
    static get(key, defaultValue = null) {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : defaultValue;
    }

    static set(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    static remove(key) {
        localStorage.removeItem(key);
    }
}

// ============================================================================
// EXPORTS GLOBAUX
// ============================================================================
window.storage = storage;
window.STORAGE_KEYS = STORAGE_KEYS;
window.APP_CONFIG = APP_CONFIG;
window.StorageService = StorageService;
