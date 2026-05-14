// ============================================================================
// STORAGE.JS — Couche d'abstraction pour le stockage des données
// ============================================================================
// Chargé EN PREMIER avant tout autre script qui utilise le stockage.
//
// Responsabilités de CE fichier uniquement :
//   - Charger config.json et instancier le bon provider
//   - Maintenir le cache localStorage (lecture offline)
//   - Gérer la queue d'opérations hors-ligne et la resynchronisation
//   - Afficher la bannière de statut
//
// Les providers (provider.supabase.js, provider.sqlite.js) sont de simples
// clients HTTP sans logique de cache. Tout le cache est ici.
//
// API publique :
//   await storage.get(key)     → valeur ou null (cache si hors-ligne)
//   await storage.set(key, v)  → upsert (queue si hors-ligne)
//   await storage.remove(key)  → suppression (queue si hors-ligne)
//   await storage.keys()       → clés backend + clés en cache
// ============================================================================

// ============================================================================
// CONSTANTES
// ============================================================================

const STORAGE_KEYS = {
    COURSE_PROGRESS:      'course_progress',
    USER_PROGRESS:        'userProgress',
    USER_ANSWERS:         'userAnswers',
    QUESTION_ATTEMPTS:    'question_attempts',
    CHAPTER_CONFIG:       'chapter_config',
    COURSE_READ_PROGRESS: 'courseProgress'
};

const APP_CONFIG = {
    PASSING_SCORE:            80,
    SUCCESS_FEEDBACK_DURATION: 3000,
    ERROR_FEEDBACK_DURATION:   5000,
    MAX_NOTE:                 20
};

const SYNC_QUEUE_KEY  = '_sync_queue';
const CACHE_PREFIX    = '_cache_';
const ONLINE_BANNER_ID = 'storage-online-banner';

// ============================================================================
// CACHE LOCAL
// ============================================================================

const Cache = {
    get(key) {
        const raw = localStorage.getItem(CACHE_PREFIX + key);
        if (raw === null) return null;
        try { return JSON.parse(raw); } catch { return null; }
    },
    set(key, value) {
        localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value));
    },
    remove(key) {
        localStorage.removeItem(CACHE_PREFIX + key);
    },
    keys() {
        const result = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(CACHE_PREFIX)) {
                result.push(k.slice(CACHE_PREFIX.length));
            }
        }
        return result;
    }
};

// ============================================================================
// QUEUE DE SYNCHRONISATION HORS-LIGNE
// ============================================================================

const SyncManager = {
    _syncing: false,

    enqueue(operation) {
        const queue = this.getQueue();
        queue.push({ ...operation, timestamp: Date.now() });
        localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
    },

    getQueue() {
        try { return JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY)) || []; }
        catch { return []; }
    },

    clearQueue() {
        localStorage.removeItem(SYNC_QUEUE_KEY);
    },

    hasPending() {
        return this.getQueue().length > 0;
    },

    /**
     * Rejoue toutes les opérations en attente via le provider courant.
     * Les opérations qui échouent restent dans la queue.
     * @returns {Promise<{success: boolean, count: number, failed: number}>}
     */
    async sync() {
        if (this._syncing) return { success: false, count: 0, reason: 'already_syncing' };

        const queue = this.getQueue();
        if (queue.length === 0) return { success: true, count: 0, failed: 0 };

        this._syncing = true;
        let syncedCount = 0;
        const failed = [];
        const provider = window._storageProvider;

        for (const op of queue) {
            try {
                if (op.type === 'set') {
                    await provider.set(op.key, op.value);
                } else if (op.type === 'remove') {
                    await provider.remove(op.key);
                }
                syncedCount++;
            } catch (e) {
                console.warn('[Sync] Échec sync de "' + op.key + '":', e.message);
                failed.push(op);
            }
        }

        if (failed.length > 0) {
            localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(failed));
        } else {
            this.clearQueue();
        }

        this._syncing = false;
        return { success: failed.length === 0, count: syncedCount, failed: failed.length };
    }
};

// ============================================================================
// BANNIÈRE DE STATUT
// ============================================================================

const StatusBanner = {
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
            `;
            document.body.insertBefore(banner, document.body.firstChild);
            const existingPad = parseInt(getComputedStyle(document.body).paddingTop) || 0;
            document.body.style.paddingTop = (existingPad + 36) + 'px';

            const closeBtn = document.createElement('span');
            closeBtn.textContent = '✕';
            closeBtn.style.cssText = `
                position: absolute; right: 12px; top: 50%;
                transform: translateY(-50%); cursor: pointer; font-size: 16px; opacity: 0.8;
            `;
            closeBtn.onclick = () => this.hide();
            banner.appendChild(closeBtn);
        }

        const colors = {
            offline: { bg: '#fff3cd', text: '#856404', border: '#ffc107' },
            syncing: { bg: '#cce5ff', text: '#004085', border: '#b8daff' },
            success: { bg: '#d4edda', text: '#155724', border: '#c3e6cb' },
            error:   { bg: '#f8d7da', text: '#721c24', border: '#f5c6cb' }
        };
        const c = colors[type] || colors.offline;

        let textSpan = banner.querySelector('.banner-text');
        if (!textSpan) {
            textSpan = document.createElement('span');
            textSpan.className = 'banner-text';
            textSpan.style.marginRight = '24px';
            banner.insertBefore(textSpan, banner.lastChild);
        }
        textSpan.textContent = message;

        banner.style.background = c.bg;
        banner.style.color = c.text;
        banner.style.borderBottom = '2px solid ' + c.border;
        banner.style.transform = 'translateY(0)';
        banner.style.opacity = '1';
    },

    hide() {
        const banner = document.getElementById(ONLINE_BANNER_ID);
        if (!banner) return;
        banner.style.transform = 'translateY(-100%)';
        banner.style.opacity = '0';
        setTimeout(() => {
            banner.remove();
            document.body.style.paddingTop = '';
        }, 300);
    },

    remove() {
        const banner = document.getElementById(ONLINE_BANNER_ID);
        if (banner) banner.remove();
        document.body.style.paddingTop = '';
    }
};

// ============================================================================
// CHARGEMENT DYNAMIQUE DU PROVIDER
// ============================================================================

function injectScript(src) {
    return new Promise(function (resolve, reject) {
        if (document.querySelector('script[src="' + src + '"]')) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = () => reject(new Error('Impossible de charger ' + src));
        document.head.appendChild(script);
    });
}

function storagePath(relativePath) {
    const base = (window.BASE || '').replace(/\/$/, '');
    return base + '/storage/' + relativePath;
}

let _loadedConfig = null;

async function loadConfig() {
    if (_loadedConfig) return _loadedConfig;

    // ── Fichier de config selon l'environnement ──────────────
    //    local           → config.json (backend SQLite)
    //    GitHub Pages    → config.supabase.json (Supabase direct navigateur)
    var configFile = window.IS_GITHUB_PAGES ? 'config.supabase.json' : 'config.json';
    console.log('[storage] Chargement config: ' + configFile);

    const resp = await fetch(storagePath(configFile));
    if (!resp.ok) throw new Error(configFile + ': HTTP ' + resp.status);
    _loadedConfig = await resp.json();
    return _loadedConfig;
}

async function loadProvider() {
    try {
        const config = await loadConfig();

        // ── Provider auto-sélectionné par config.js ──────────────
        // window.STORAGE_PROVIDER est défini par config.js selon l'environnement :
        //   - local           → 'sqlite'
        //   - GitHub Pages    → 'supabase'
        // Si config.js n'est pas chargé, on lit config.json (fallback).
        var providerName = window.STORAGE_PROVIDER || config.storage || 'supabase';
        console.log('[storage] Provider sélectionné:', providerName, '(auto=' + !!window.STORAGE_PROVIDER + ')');

        let provider;

        if (providerName === 'supabase') {
            if (typeof SupabaseProvider === 'undefined') {
                await injectScript(storagePath('provider.supabase.js'));
            }
            provider = new SupabaseProvider(config.supabase || {});
            console.log('[storage] Provider: Supabase →', (config.supabase || {}).url);

        } else if (providerName === 'sqlite') {
            if (typeof SQLiteProvider === 'undefined') {
                await injectScript(storagePath('provider.sqlite.js'));
            }
            provider = new SQLiteProvider(config.sqlite || {});
            console.log('[storage] Provider: SQLite →', (config.sqlite || {}).apiBaseUrl);

        } else {
            throw new Error('Provider inconnu: "' + providerName + '". Valeurs supportées: supabase, sqlite.');
        }

        window._storageProvider = provider;
        return provider;

    } catch (e) {
        console.error('[storage] Erreur chargement provider:', e.message);
        console.warn('[storage] Fallback localStorage uniquement.');

        // Provider minimal : localStorage brut (pas de préfixe _cache_, accès direct)
        const fallback = {
            get:    async (key) => { const r = localStorage.getItem(key); return r ? JSON.parse(r) : null; },
            set:    async (key, value) => { localStorage.setItem(key, JSON.stringify(value)); },
            remove: async (key) => { localStorage.removeItem(key); },
            keys:   async () => Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter(Boolean)
        };
        window._storageProvider = fallback;
        return fallback;
    }
}

// ============================================================================
// COUCHE D'ABSTRACTION — API PUBLIQUE
// ============================================================================

const storage = {
    _provider:    null,
    _initPromise: null,

    async init() {
        if (this._provider) return;
        if (this._initPromise) return this._initPromise;
        this._initPromise = loadProvider()
            .then(p => { this._provider = p; this._initPromise = null; })
            .catch(e => { this._initPromise = null; throw e; });
        return this._initPromise;
    },

    /**
     * Récupère une valeur.
     * Si le backend est injoignable, retourne la valeur en cache.
     */
    async get(key) {
        if (!this._provider) await this.init();
        try {
            const value = await this._provider.get(key);
            // Mettre à jour le cache avec la valeur fraîche (ou le vider si inexistante)
            if (value !== null) {
                Cache.set(key, value);
            } else {
                Cache.remove(key);
            }
            return value;
        } catch (e) {
            const cached = Cache.get(key);
            if (cached !== null) {
                console.info('[storage] get("' + key + '") → cache (hors-ligne)');
                return cached;
            }
            console.warn('[storage] get("' + key + '") → null (hors-ligne, pas de cache)');
            return null;
        }
    },

    /**
     * Enregistre une valeur.
     * En cas d'échec : mise en cache local + enqueue pour sync ultérieure.
     */
    async set(key, value) {
        if (!this._provider) await this.init();

        // Écriture cache immédiate dans tous les cas (optimistic update)
        Cache.set(key, value);

        try {
            await this._provider.set(key, value);

            // Succès → profiter pour vider la queue si besoin
            if (SyncManager.hasPending()) {
                StatusBanner.show('syncing', '🔄 Synchronisation des données en attente…');
                const result = await SyncManager.sync();
                if (result.success) {
                    StatusBanner.hide();
                } else {
                    StatusBanner.show('offline', '⚠️ Mode hors-ligne — ' + result.failed + ' opération(s) en attente');
                }
            }

        } catch (e) {
            console.warn('[storage] set("' + key + '") → hors-ligne, mis en queue:', e.message);
            SyncManager.enqueue({ type: 'set', key, value });
            StatusBanner.show('offline', '⚠️ Mode hors-ligne — ' + SyncManager.getQueue().length + ' opération(s) en attente');
        }
    },

    /**
     * Supprime une entrée.
     * En cas d'échec : suppression locale + enqueue.
     */
    async remove(key) {
        if (!this._provider) await this.init();

        // Suppression cache immédiate
        Cache.remove(key);

        try {
            await this._provider.remove(key);
        } catch (e) {
            console.warn('[storage] remove("' + key + '") → hors-ligne, mis en queue:', e.message);
            SyncManager.enqueue({ type: 'remove', key });
            StatusBanner.show('offline', '⚠️ Mode hors-ligne — ' + SyncManager.getQueue().length + ' opération(s) en attente');
        }
    },

    /**
     * Retourne toutes les clés (backend + cache local fusionnés).
     */
    async keys() {
        if (!this._provider) await this.init();
        const keysSet = new Set();

        try {
            const backendKeys = await this._provider.keys();
            if (Array.isArray(backendKeys)) backendKeys.forEach(k => keysSet.add(k));
        } catch (e) {
            // Hors-ligne : on continue avec le cache seul
        }

        Cache.keys().forEach(k => keysSet.add(k));
        return Array.from(keysSet);
    }
};

// ============================================================================
// SERVICE SYNCHRONE (compatibilité avec l'existant)
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
// INITIALISATION AU CHARGEMENT
// ============================================================================

(function initStorage() {
    const run = () => {
        StatusBanner.remove();

        storage.init().then(() => {
            console.log('[storage] Provider initialisé');

            // Sync au démarrage si queue en attente et réseau disponible
            if (SyncManager.hasPending()) {
                const count = SyncManager.getQueue().length;
                if (navigator.onLine) {
                    StatusBanner.show('syncing', '🔄 Synchronisation de ' + count + ' opération(s) en attente…');
                    SyncManager.sync().then(result => {
                        if (result.success) {
                            StatusBanner.hide();
                        } else {
                            StatusBanner.show('offline', '⚠️ Mode hors-ligne — ' + result.failed + ' opération(s) en attente');
                        }
                    });
                } else {
                    StatusBanner.show('offline', '⚠️ Mode hors-ligne — ' + count + ' opération(s) en attente');
                }
            }
        }).catch(e => {
            console.warn('[storage] Échec init:', e.message);
        });

        window.addEventListener('online', async () => {
            if (!SyncManager.hasPending()) return;
            StatusBanner.show('syncing', '🔄 Connexion rétablie — synchronisation en cours…');
            const result = await SyncManager.sync();
            if (result.success) {
                StatusBanner.show('success', '✅ ' + result.count + ' opération(s) synchronisée(s)');
                setTimeout(() => StatusBanner.hide(), 3000);
            } else {
                StatusBanner.show('error', '❌ Erreur sync — ' + result.failed + ' opération(s) en échec');
            }
        });

        window.addEventListener('offline', () => {
            const pending = SyncManager.getQueue().length;
            StatusBanner.show('offline', pending > 0
                ? '⚠️ Connexion perdue — ' + pending + ' opération(s) en attente'
                : '⚠️ Connexion perdue — les modifications seront synchronisées automatiquement'
            );
        });

        console.log('✅ storage.js chargé (multi-backend + cache + queue offline)');
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run);
    } else {
        run();
    }
})();

// ============================================================================
// STATIC JSON — Ressources JSON en lecture seule (cours.json, etc.)
// ============================================================================
// Stratégie de résolution pour un chemin donné (ex: '/parcours/cours.json') :
//
//   1. Cache mémoire session       → retour immédiat, aucun I/O
//   2. Fetch statique              → GET (window.BASE || '') + chemin
//   3. Fallback provider actif     → storage.get('_static:<chemin>')
//      (utile si le fichier statique est absent en mode SQLite local
//       ou si Supabase est le seul backend disponible)
//
// La valeur est mise en cache mémoire dès le premier succès.
// Aucune écriture dans localStorage : ces données ne changent pas.
//
// API publique :
//   await staticJson.get('/parcours/cours.json')  → objet JS ou null
//   staticJson.prefetch('/parcours/cours.json')   → déclenche en arrière-plan
//   staticJson.invalidate('/parcours/cours.json') → vide le cache mémoire
// ============================================================================

const staticJson = (function () {

    // Cache mémoire : chemin → valeur parsée (ou null si introuvable)
    const _cache = new Map();

    // Promesses en cours : évite les doubles fetch simultanés pour le même chemin
    const _pending = new Map();

    /**
     * Construit l'URL statique complète pour un chemin relatif.
     */
    function _staticUrl(path) {
        const base = (window.BASE || '').replace(/\/$/, '');
        const p    = path.startsWith('/') ? path : '/' + path;
        return base + p;
    }

    /**
     * Clé utilisée dans le provider de stockage pour un JSON statique.
     * Séparée des données utilisateur par le préfixe '_static:'.
     */
    function _storageKey(path) {
        return '_static:' + path;
    }

    /**
     * Tente de charger le fichier statique via HTTP.
     * Retourne l'objet parsé ou null (sans lever d'exception).
     */
    async function _fetchStatic(path) {
        try {
            const url  = _staticUrl(path);
            const resp = await fetch(url);
            if (!resp.ok) return null;
            return await resp.json();
        } catch (e) {
            console.info('[staticJson] Fichier statique indisponible pour "' + path + '":', e.message);
            return null;
        }
    }

    /**
     * Tente de charger le JSON depuis le provider actif (Supabase / SQLite).
     * Retourne l'objet parsé ou null (sans lever d'exception).
     */
    async function _fetchFromProvider(path) {
        try {
            const value = await storage.get(_storageKey(path));
            if (value !== null) {
                console.info('[staticJson] "' + path + '" chargé depuis le provider.');
            }
            return value;
        } catch (e) {
            console.warn('[staticJson] Échec provider pour "' + path + '":', e.message);
            return null;
        }
    }

    /**
     * Résolution complète avec mise en cache.
     * Garantit qu'un seul fetch est en vol pour un chemin donné.
     */
    async function _resolve(path) {
        // 1. Cache mémoire
        if (_cache.has(path)) return _cache.get(path);

        // 2. Si un fetch est déjà en cours pour ce chemin, on attend le même
        if (_pending.has(path)) return _pending.get(path);

        const promise = (async () => {
            // 3. Tentative statique
            let value = await _fetchStatic(path);

            // 4. Fallback provider
            if (value === null) {
                console.info('[staticJson] "' + path + '" absent en statique, tentative provider…');
                value = await _fetchFromProvider(path);
            }

            if (value === null) {
                console.warn('[staticJson] "' + path + '" introuvable (statique + provider).');
            }

            _cache.set(path, value);
            _pending.delete(path);
            return value;
        })();

        _pending.set(path, promise);
        return promise;
    }

    return {
        /**
         * Charge et retourne le JSON pour le chemin donné.
         * Résultat mis en cache mémoire pour toute la session.
         *
         * @param   {string} path  Chemin absolu, ex: '/parcours/cours.json'
         * @returns {Promise<any|null>}
         */
        get(path) {
            return _resolve(path);
        },

        /**
         * Déclenche la résolution en arrière-plan sans attendre.
         * Appeler en début de page pour préchauffer le cache.
         *
         * @param {string|string[]} paths
         */
        prefetch(paths) {
            const list = Array.isArray(paths) ? paths : [paths];
            list.forEach(p => _resolve(p).catch(() => {}));
        },

        /**
         * Vide le cache mémoire pour un chemin (ou tout si omis).
         * Utile en développement ou tests.
         *
         * @param {string} [path]
         */
        invalidate(path) {
            if (path) {
                _cache.delete(path);
            } else {
                _cache.clear();
            }
        }
    };

})();

// ============================================================================
// EXPORTS GLOBAUX
// ============================================================================
window.storage        = storage;
window.STORAGE_KEYS   = STORAGE_KEYS;
window.APP_CONFIG     = APP_CONFIG;
window.StorageService = StorageService;
window.SyncManager    = SyncManager; // exposé pour debug console
window.staticJson     = staticJson;