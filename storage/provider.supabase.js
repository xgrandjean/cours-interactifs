// ============================================================================
// provider.supabase.js — Client HTTP Supabase (sans logique de cache)
// ============================================================================
// Ce fichier est un client HTTP pur vers l'API REST Supabase.
// Il ne touche PAS à localStorage. Tout le cache est géré par storage.js.
//
// Interface attendue par storage.js :
//   async get(key)         → valeur parsée ou null
//   async set(key, value)  → upsert (lève une exception si indisponible)
//   async remove(key)      → suppression (lève une exception si indisponible)
//   async keys()           → tableau de strings (lève une exception si indisponible)
// ============================================================================

function SupabaseProvider(config) {
    this._url   = config.url;
    this._key   = config.anonKey;
    this._table = config.table || 'app_data';
}

/**
 * Requête à l'API REST Supabase.
 * Lève une Error en cas d'échec HTTP ou réseau.
 */
SupabaseProvider.prototype._fetch = async function (method, path, body, extraHeaders) {
    const url = this._url + path;
    const headers = {
        'apikey':         this._key,
        'Authorization':  'Bearer ' + this._key,
        'Content-Type':   'application/json',
        'Accept':         'application/json'
    };
    if (extraHeaders) Object.assign(headers, extraHeaders);

    const options = { method, headers };
    if (body !== undefined && body !== null) options.body = JSON.stringify(body);

    const response = await fetch(url, options);

    if (response.status === 204) return null;

    if (!response.ok) {
        let msg = 'Supabase HTTP ' + response.status;
        try { msg += ': ' + JSON.stringify(await response.json()); } catch { msg += ' (' + response.statusText + ')'; }
        throw new Error(msg);
    }

    const text = await response.text();
    return text ? JSON.parse(text) : null;
};

/**
 * Récupère une valeur par sa clé.
 * Retourne null si la clé n'existe pas.
 * Lève une exception si le réseau est indisponible.
 */
SupabaseProvider.prototype.get = async function (key) {
    const data = await this._fetch(
        'GET',
        '/rest/v1/' + this._table + '?key=eq.' + encodeURIComponent(key) + '&select=value'
    );
    return (data && data.length > 0) ? data[0].value : null;
};

/**
 * Crée ou met à jour une entrée (upsert).
 * Lève une exception si le réseau est indisponible.
 */
SupabaseProvider.prototype.set = async function (key, value) {
    await this._fetch(
        'POST',
        '/rest/v1/' + this._table,
        { key, value, updated_at: new Date().toISOString() },
        { 'Prefer': 'resolution=merge-duplicates' }
    );
};

/**
 * Supprime une entrée par sa clé.
 * Lève une exception si le réseau est indisponible.
 */
SupabaseProvider.prototype.remove = async function (key) {
    await this._fetch(
        'DELETE',
        '/rest/v1/' + this._table + '?key=eq.' + encodeURIComponent(key)
    );
};

/**
 * Retourne toutes les clés présentes dans Supabase.
 * Lève une exception si le réseau est indisponible.
 */
SupabaseProvider.prototype.keys = async function () {
    const data = await this._fetch('GET', '/rest/v1/' + this._table + '?select=key');
    return (data && Array.isArray(data)) ? data.map(row => row.key) : [];
};

// Export global
window.SupabaseProvider = SupabaseProvider;
