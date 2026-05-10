// ============================================================================
// STORAGE.JS - Couche d'abstraction pour le stockage des données
// ============================================================================
// Ce fichier doit être chargé EN PREMIER avant tout autre script
// qui utilise le stockage (dataStorage.js, main.js, etc.)
// ============================================================================
// Version Supabase avec queue hors-ligne et sync automatique.
//
// PRINCIPES :
// - Pas de fallback silencieux : l'utilisateur est TOUJOURS informé
// - Si Supabase est indisponible, les modifications sont mises en queue
//   et rejouées automatiquement au retour de la connexion
// - Un cache localStorage permet de lire les données même hors-ligne
// ============================================================================

/**
 * Clés utilisées dans le stockage
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

// ============================================================================
// CONFIGURATION SUPABASE
// ============================================================================
const SUPABASE_URL = 'https://rdvxgcwpennhbatkvats.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_hF3tWEb_lnpc4q5sL16Ghw_hYG5ov40';

/**
 * Nom de la table Supabase utilisée pour le stockage clé-valeur.
 */
const SUPABASE_TABLE = 'app_data';

// ============================================================================
// CONSTANTES DE SYNCHRONISATION
// ============================================================================
const SYNC_QUEUE_KEY = '_sync_queue';
const CACHE_PREFIX = '_cache_';
const ONLINE_BANNER_ID = 'storage-online-banner';

// ============================================================================
// FONCTIONS INTERNES D'APPEL À L'API SUPABASE
// ============================================================================

/**
 * Effectue une requête à l'API REST Supabase
 */
async function supabaseFetch(method, path, body = null, extraHeaders = {}) {
    const url = `${SUPABASE_URL}${path}`;
    const headers = {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...extraHeaders
    };

    const options = { method, headers };
    if (body !== null) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    // Succès sans contenu
    if (response.status === 204 || response.status === 201) {
        return null;
    }

    // Erreur HTTP
    if (!response.ok) {
        let errorMessage = `Supabase HTTP ${response.status}`;
        try {
            const errBody = await response.json();
            errorMessage += `: ${JSON.stringify(errBody)}`;
        } catch (_) {
            errorMessage += ` (${response.statusText})`;
        }
        throw new Error(errorMessage);
    }

    // Réponse avec contenu
    const text = await response.text();
    if (!text) return null;
    return JSON.parse(text);
}

// ============================================================================
// GESTIONNAIRE DE SYNCHRONISATION HORS-LIGNE
// ============================================================================

const SyncManager = {
    /** La queue est-elle en cours de vidage ? */
    _syncing: false,

    /**
     * Ajoute une opération à la queue hors-ligne
     */
    enqueue(operation) {
        const queue = this.getQueue();
        queue.push({
            ...operation,
            timestamp: Date.now()
        });
        localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
    },

    /**
     * Récupère la queue d'opérations en attente
     */
    getQueue() {
        try {
            return JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY)) || [];
        } catch {
            return [];
        }
    },

    /**
     * Vider la queue (après succès de la sync)
     */
    clearQueue() {
        localStorage.removeItem(SYNC_QUEUE_KEY);
    },

    /**
     * Vérifie si des opérations sont en attente
     */
    hasPending() {
        return this.getQueue().length > 0;
    },

    /**
     * Tente de synchroniser toutes les opérations en attente
     * @returns {Promise<{success: boolean, count: number}>}
     */
    async sync() {
        if (this._syncing) return { success: false, count: 0, reason: 'already_syncing' };

        const queue = this.getQueue();
        if (queue.length === 0) return { success: true, count: 0 };

        this._syncing = true;
        let syncedCount = 0;
        const failed = [];

        for (const op of queue) {
            try {
                if (op.type === 'set') {
                    await supabaseFetch(
                        'POST',
                        `/rest/v1/${SUPABASE_TABLE}`,
                        {
                            key: op.key,
                            value: op.value,
                            updated_at: new Date().toISOString()
                        },
                        { 'Prefer': 'resolution=merge-duplicates' }
                    );
                    // Mettre à jour le cache
                    localStorage.setItem(CACHE_PREFIX + op.key, JSON.stringify(op.value));
                } else if (op.type === 'remove') {
                    await supabaseFetch(
                        'DELETE',
                        `/rest/v1/${SUPABASE_TABLE}?key=eq.${encodeURIComponent(op.key)}`
                    );
                    localStorage.removeItem(CACHE_PREFIX + op.key);
                }
                syncedCount++;
            } catch (e) {
                console.warn(`[Sync] Échec sync de "${op.key}":`, e.message);
                failed.push(op);
            }
        }

        // Si certaines opérations ont réussi, on réécrit la queue avec les échecs
        if (failed.length > 0) {
            localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(failed));
        } else {
            this.clearQueue();
        }

        this._syncing = false;

        return {
            success: failed.length === 0,
            count: syncedCount,
            failed: failed.length
        };
    }
};

// ============================================================================
// BANNIÈRE DE STATUT
// ============================================================================

const StatusBanner = {
    /**
     * Crée ou met à jour la bannière de statut dans la page
     */
    show(type, message) {
        let banner = document.getElementById(ONLINE_BANNER_ID);
        if (!banner) {
            banner = document.createElement('div');
            banner.id = ONLINE_BANNER_ID;
            banner.style.cssText = `
                position: fixed; top: 0; left: 0; right: 0;
                z-index: 99999; padding: 8px 16px;
                text-align: center; font-size: 14px; font-weight: 600;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                transition: transform 0.3s ease, opacity 0.3s ease;
                transform: translateY(0); opacity: 1;
            `;
            document.body.insertBefore(banner, document.body.firstChild);

            // Ajouter un padding-top au body pour compenser la bannière
            const existingPad = parseInt(getComputedStyle(document.body).paddingTop) || 0;
            document.body.style.paddingTop = (existingPad + 36) + 'px';

            // Bouton fermer
            const closeBtn = document.createElement('span');
            closeBtn.textContent = '✕';
            closeBtn.style.cssText = `
                position: absolute; right: 12px; top: 50%;
                transform: translateY(-50%); cursor: pointer;
                font-size: 16px; opacity: 0.8;
            `;
            closeBtn.onclick = () => {
                banner.style.transform = 'translateY(-100%)';
                banner.style.opacity = '0';
                setTimeout(() => banner.remove(), 300);
                document.body.style.paddingTop = '';
            };
            banner.appendChild(closeBtn);
        }

        const colors = {
            offline: { bg: '#fff3cd', text: '#856404', border: '#ffc107' },
            syncing: { bg: '#cce5ff', text: '#004085', border: '#b8daff' },
            success: { bg: '#d4edda', text: '#155724', border: '#c3e6cb' },
            error:   { bg: '#f8d7da', text: '#721c24', border: '#f5c6cb' }
        };

        const c = colors[type] || colors.offline;

        // Message text (premier enfant avant le bouton fermer)
        const textSpan = banner.querySelector('span:first-child') || document.createElement('span');
        textSpan.textContent = message;
        textSpan.style.cssText = 'margin-right: 24px;';
        if (!banner.contains(textSpan)) {
            banner.insertBefore(textSpan, banner.lastChild);
        }

        banner.style.background = c.bg;
        banner.style.color = c.text;
        banner.style.borderBottom = `2px solid ${c.border}`;
        banner.style.transform = 'translateY(0)';
        banner.style.opacity = '1';
    },

    /**
     * Cache la bannière
     */
    hide() {
        const banner = document.getElementById(ONLINE_BANNER_ID);
        if (banner) {
            banner.style.transform = 'translateY(-100%)';
            banner.style.opacity = '0';
            setTimeout(() => {
                banner.remove();
                document.body.style.paddingTop = '';
            }, 300);
        }
    },

    /**
     * Supprime la bannière immédiatement
     */
    remove() {
        const banner = document.getElementById(ONLINE_BANNER_ID);
        if (banner) banner.remove();
        document.body.style.paddingTop = '';
    }
};

// ============================================================================
// COUCHE D'ABSTRACTION DE STOCKAGE
// ============================================================================

/**
 * Couche d'abstraction pour le stockage des données.
 *
 * - Utilise Supabase comme backend principal
 * - Maintient un cache localStorage pour la lecture hors-ligne
 * - Si Supabase est indisponible, les écritures sont mises en queue
 *   et synchronisées automatiquement au retour de la connexion
 * - L'utilisateur est informé du statut via une bannière visible
 */
const storage = {
    /**
     * Récupère une valeur par sa clé
     * - Priorité : Supabase → cache localStorage
     *
     * @param {string} key - Clé de stockage
     * @returns {Promise<*>} Valeur parsée ou null
     */
    async get(key) {
        try {
            const data = await supabaseFetch(
                'GET',
                `/rest/v1/${SUPABASE_TABLE}?key=eq.${encodeURIComponent(key)}&select=value`
            );
            if (data && data.length > 0) {
                // Mettre à jour le cache
                localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(data[0].value));
                return data[0].value;
            }
            // La clé n'existe pas dans Supabase → supprimer du cache
            localStorage.removeItem(CACHE_PREFIX + key);
            return null;
        } catch (e) {
            // Hors-ligne : essayer le cache
            const cached = localStorage.getItem(CACHE_PREFIX + key);
            if (cached !== null) {
                console.info(`storage.get("${key}") → depuis cache (hors-ligne)`);
                return JSON.parse(cached);
            }
            // Pas de cache non plus
            console.warn(`storage.get("${key}") → indisponible (hors-ligne, pas de cache)`);
            return null;
        }
    },

    /**
     * Enregistre une valeur associée à une clé (upsert dans Supabase)
     *
     * @param {string} key - Clé de stockage
     * @param {*} value - Valeur à stocker
     * @throws {Error} Si Supabase est indisponible (l'opération est mise en queue)
     */
    async set(key, value) {
        try {
            await supabaseFetch(
                'POST',
                `/rest/v1/${SUPABASE_TABLE}`,
                {
                    key: key,
                    value: value,
                    updated_at: new Date().toISOString()
                },
                { 'Prefer': 'resolution=merge-duplicates' }
            );

            // Mettre à jour le cache
            localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value));

            // Si on était en mode hors-ligne et que ça réussit, on en profite
            // pour tenter une sync globale
            if (SyncManager.hasPending()) {
                StatusBanner.show('syncing', '🔄 Synchronisation des données en attente…');
                const result = await SyncManager.sync();
                if (result.success) {
                    StatusBanner.hide();
                } else {
                    StatusBanner.show('offline', `⚠️ Mode hors-ligne — ${result.failed} opération(s) en attente de synchronisation`);
                }
            }

        } catch (e) {
            // Supabase indisponible → on met en queue + cache local
            console.warn(`storage.set("${key}") → Supabase indisponible: ${e.message}. Opération mise en queue.`);

            // Mettre à jour le cache local immédiatement
            localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value));

            // Ajouter à la queue de synchronisation
            SyncManager.enqueue({ type: 'set', key, value });

            // Afficher la bannière
            const pending = SyncManager.getQueue().length;
            StatusBanner.show('offline', `⚠️ Mode hors-ligne — ${pending} opération(s) en attente de synchronisation`);
        }
    },

    /**
     * Supprime une entrée par sa clé
     *
     * @param {string} key - Clé à supprimer
     * @throws {Error} Si Supabase est indisponible (l'opération est mise en queue)
     */
    async remove(key) {
        try {
            await supabaseFetch(
                'DELETE',
                `/rest/v1/${SUPABASE_TABLE}?key=eq.${encodeURIComponent(key)}`
            );

            // Supprimer du cache
            localStorage.removeItem(CACHE_PREFIX + key);

        } catch (e) {
            console.warn(`storage.remove("${key}") → Supabase indisponible: ${e.message}. Opération mise en queue.`);

            // Supprimer du cache local immédiatement
            localStorage.removeItem(CACHE_PREFIX + key);

            // Ajouter à la queue de synchronisation
            SyncManager.enqueue({ type: 'remove', key });

            // Afficher la bannière
            const pending = SyncManager.getQueue().length;
            StatusBanner.show('offline', `⚠️ Mode hors-ligne — ${pending} opération(s) en attente de synchronisation`);
        }
    },

    /**
     * Retourne toutes les clés du stockage
     * Combine Supabase + clés en cache (pour avoir les données offline)
     *
     * @returns {Promise<string[]>} Liste des clés
     */
    async keys() {
        const keysSet = new Set();

        // D'abord Supabase
        try {
            const data = await supabaseFetch('GET', `/rest/v1/${SUPABASE_TABLE}?select=key`);
            if (data && Array.isArray(data)) {
                data.forEach(row => keysSet.add(row.key));
            }
        } catch (e) {
            // Hors-ligne : on continue
        }

        // Compléter avec le cache local
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k.startsWith(CACHE_PREFIX)) {
                keysSet.add(k.slice(CACHE_PREFIX.length));
            }
        }

        return Array.from(keysSet);
    }
};

// ============================================================================
// SERVICE DE STOCKAGE SYNCHRONE (pour compatibilité avec l'existant)
// ============================================================================
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
// INITIALISATION — DÉTECTION ONLINE/OFFLINE ET SYNC AU DÉMARRAGE
// ============================================================================

(function initStorage() {
    // --- Nettoyer les bannières précédentes ---
    StatusBanner.remove();

    // --- Vérifier s'il y a des opérations en attente ---
    if (SyncManager.hasPending()) {
        const count = SyncManager.getQueue().length;
        if (navigator.onLine) {
            // On est online avec une queue en attente → sync
            StatusBanner.show('syncing', `🔄 Synchronisation de ${count} opération(s) en attente…`);
            SyncManager.sync().then(result => {
                if (result.success) {
                    StatusBanner.hide();
                } else {
                    StatusBanner.show('offline', `⚠️ Mode hors-ligne — ${result.failed} opération(s) en attente`);
                }
            });
        } else {
            StatusBanner.show('offline', `⚠️ Mode hors-ligne — ${count} opération(s) en attente de synchronisation`);
        }
    }

    // --- Écouter les événements online/offline ---
    window.addEventListener('online', async () => {
        if (!SyncManager.hasPending()) return;

        StatusBanner.show('syncing', '🔄 Connexion rétablie — synchronisation en cours…');
        const result = await SyncManager.sync();
        if (result.success) {
            StatusBanner.show('success', `✅ Synchronisation terminée — ${result.count} opération(s) synchronisée(s)`);
            setTimeout(() => StatusBanner.hide(), 3000);
        } else {
            StatusBanner.show('error', `❌ Erreur de synchronisation — ${result.failed} opération(s) en échec`);
        }
    });

    window.addEventListener('offline', () => {
        const pending = SyncManager.getQueue().length;
        if (pending > 0) {
            StatusBanner.show('offline', `⚠️ Connexion perdue — ${pending} opération(s) en attente`);
        } else {
            StatusBanner.show('offline', '⚠️ Connexion perdue — les modifications seront synchronisées automatiquement');
        }
    });

    console.log('✅ storage.js chargé (Supabase + queue offline + sync auto)');
})();

// ============================================================================
// EXPORTS GLOBAUX
// ============================================================================
window.supabaseUrl = SUPABASE_URL;
window.supabaseAnonKey = SUPABASE_ANON_KEY;
window.storage = storage;
window.STORAGE_KEYS = STORAGE_KEYS;
window.APP_CONFIG = APP_CONFIG;
window.StorageService = StorageService;
window.SyncManager = SyncManager; // Exposé pour débogage