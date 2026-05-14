// ============================================================================
// provider.sqlite.js — Client HTTP vers le backend Express/SQLite local
// ============================================================================
// Ce fichier est un client HTTP pur vers l'API locale.
// Il ne touche PAS à localStorage. Tout le cache est géré par storage.js.
//
// Interface attendue par storage.js :
//   async get(key)         → valeur parsée ou null
//   async set(key, value)  → upsert (lève une exception si indisponible)
//   async remove(key)      → suppression (lève une exception si indisponible)
//   async keys()           → tableau de strings (lève une exception si indisponible)
//
// Configuration :
//   config.apiBaseUrl  — ex: 'http://localhost:3000/api'  (défaut)
//   config.table       — préfixe de route :
//                          'app_data' → /api/app_data/... (app_data, défaut)
//                          'parcours_data' → /api/parcours_data/... (parcours_data)
// ============================================================================

function SQLiteProvider(config) {
    this._base  = (config.apiBaseUrl || 'http://localhost:3000/api').replace(/\/$/, '');
    this._table = config.table || 'app_data';
}

/**
 * Requête à l'API locale Express/SQLite.
 * Lève une Error en cas d'échec HTTP ou réseau.
 */
SQLiteProvider.prototype._fetch = async function (method, path, body) {
    const url = this._base + path;
    const options = {
        method,
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
    };
    if (body !== undefined && body !== null) options.body = JSON.stringify(body);

    const response = await fetch(url, options);

    if (response.status === 204) return null;

    if (!response.ok) {
        let msg = 'SQLite API HTTP ' + response.status;
        try { msg += ': ' + JSON.stringify(await response.json()); } catch { msg += ' (' + response.statusText + ')'; }
        throw new Error(msg);
    }

    const text = await response.text();
    return text ? JSON.parse(text) : null;
};

/**
 * Récupère une valeur par sa clé.
 * Retourne null si la clé n'existe pas (404).
 * Lève une exception si le serveur est indisponible.
 */
SQLiteProvider.prototype.get = async function (key) {
    try {
        const data = await this._fetch('GET', '/' + this._table + '/' + encodeURIComponent(key));
        return (data && data.value !== undefined) ? data.value : null;
    } catch (e) {
        if (e.message.includes('HTTP 404')) return null;
        throw e;
    }
};

/**
 * Crée ou met à jour une entrée (upsert).
 * Lève une exception si le serveur est indisponible.
 */
SQLiteProvider.prototype.set = async function (key, value) {
    await this._fetch('POST', '/' + this._table, { key, value });
};

/**
 * Supprime une entrée par sa clé.
 * Lève une exception si le serveur est indisponible.
 */
SQLiteProvider.prototype.remove = async function (key) {
    await this._fetch('DELETE', '/' + this._table + '/' + encodeURIComponent(key));
};

/**
 * Retourne toutes les clés présentes dans la table.
 * Lève une exception si le serveur est indisponible.
 */
SQLiteProvider.prototype.keys = async function () {
    const data = await this._fetch('GET', '/' + this._table + '/keys');
    return (data && Array.isArray(data)) ? data.map(row => row.key) : [];
};

// Export global
window.SQLiteProvider = SQLiteProvider;