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
    this._url         = config.url;
    this._key         = config.anonKey;
    this._table       = config.table || 'app_data';
    this._timeout     = config.timeout || 10000; // 10s par défaut
    // Isolation multi-formateur (mode Web) : tant qu'aucune session n'est posée via
    // setSession(), ownerId/accessToken restent null et ce provider se comporte
    // EXACTEMENT comme avant (mode personnel, une seule base, pas de filtrage) —
    // c'est ce qui garantit la non-régression du mode personnel.
    this._ownerId     = config.ownerId || null;
    this._accessToken = config.accessToken || null;
}

/**
 * Attache une session formateur (posée après connexion GitHub, Phase 2) à ce
 * provider déjà instancié — on ne réinstancie pas, storage.js garde une seule
 * référence partagée (window._storageProvider / window._parcoursProvider).
 * @param {string|null} accessToken — JWT Supabase de l'utilisateur (auth.uid() en dérive côté RLS)
 * @param {string|null} ownerId    — uuid auth.users.id, utilisé pour filtrer/étiqueter les lignes
 */
SupabaseProvider.prototype.setSession = function (accessToken, ownerId) {
    this._accessToken = accessToken || null;
    this._ownerId     = ownerId || null;
};

/**
 * Requête à l'API REST Supabase.
 * Lève une Error en cas d'échec HTTP ou réseau.
 * Protégée contre les erreurs DNS, timeout et refus de connexion.
 */
SupabaseProvider.prototype._fetch = async function (method, path, body, extraHeaders) {
    const url = this._url + path;
    const headers = {
        // apikey identifie toujours le projet (clé anon) ; Authorization porte le JWT
        // de l'utilisateur connecté quand il y en a un — c'est ce qui permet à
        // auth.uid() de se résoudre côté RLS (Phase 3). Sans session (mode personnel,
        // ou avant connexion), on retombe sur la clé anon pour les deux, comme avant.
        'apikey':         this._key,
        'Authorization':  'Bearer ' + (this._accessToken || this._key),
        'Content-Type':   'application/json',
        'Accept':         'application/json'
    };
    if (extraHeaders) Object.assign(headers, extraHeaders);

    // Timeout via AbortController
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), this._timeout);

    // cache: 'no-store' — une réponse GET resservie depuis le cache du navigateur
    // ferait relire une donnée déjà modifiée ou supprimée. Protection symétrique de
    // celle du provider SQLite.
    const options = { method, headers, cache: 'no-store', signal: controller.signal };
    if (body !== undefined && body !== null) options.body = JSON.stringify(body);

    let response;
    try {
        response = await fetch(url, options);
    } catch (e) {
        clearTimeout(timeoutId);
        if (e.name === 'AbortError') {
            throw new Error('Supabase ne répond pas (délai dépassé)');
        }
        // TypeError = DNS / réseau / refus de connexion
        if (e.message && e.message.includes('Failed to fetch')) {
            throw new Error('Supabase injoignable');
        }
        // Autre nature (ex: CORS, certificat)
        throw new Error('Supabase injoignable (' + e.message + ')');
    }
    clearTimeout(timeoutId);

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
 * Suffixe de filtre '&owner_id=eq.<id>' quand une session formateur est posée
 * (mode Web, Phase 1), chaîne vide sinon (mode personnel, comportement inchangé).
 */
SupabaseProvider.prototype._ownerFilter = function () {
    return this._ownerId ? ('&owner_id=eq.' + encodeURIComponent(this._ownerId)) : '';
};

/**
 * Récupère une valeur par sa clé.
 * Retourne null si la clé n'existe pas.
 * Lève une exception si le réseau est indisponible.
 */
SupabaseProvider.prototype.get = async function (key) {
    const data = await this._fetch(
        'GET',
        '/rest/v1/' + this._table + '?key=eq.' + encodeURIComponent(key) + this._ownerFilter() + '&select=value'
    );
    return (data && data.length > 0) ? data[0].value : null;
};

/**
 * Crée ou met à jour une entrée (upsert).
 * Stratégie : on tente d'abord un PATCH (UPDATE). S'il ne touche aucune ligne
 * (clé absente pour ce owner_id), on fait un POST (INSERT). Cela contourne les
 * conflits 23505 sans dépendre de la configuration ON CONFLICT de la table.
 * En mode Web, deux formateurs peuvent avoir la même `key` : c'est la colonne
 * owner_id qui les distingue, jamais le contenu de la clé (Phase 1 du plan).
 * Lève une exception si le réseau est indisponible.
 */
SupabaseProvider.prototype.set = async function (key, value) {
    const payload = { key, value, updated_at: new Date().toISOString() };
    if (this._ownerId) payload.owner_id = this._ownerId;

    // 1. Tentative de mise à jour (PATCH) sur la ligne existante — filtrée par
    //    owner_id en plus de key pour ne jamais toucher la ligne d'un autre
    //    formateur (défense en profondeur, RLS déjà garante côté serveur).
    const updated = await this._fetch(
        'PATCH',
        '/rest/v1/' + this._table + '?key=eq.' + encodeURIComponent(key) + this._ownerFilter(),
        payload,
        { 'Prefer': 'return=representation' }
    );

    // 2. Si aucune ligne mise à jour → la clé (pour ce owner_id) n'existe pas
    //    encore, on insère.
    if (!updated || (Array.isArray(updated) && updated.length === 0)) {
        await this._fetch(
            'POST',
            '/rest/v1/' + this._table,
            payload,
            { 'Prefer': 'return=minimal' }
        );
    }
};

/**
 * Supprime une entrée par sa clé.
 * Lève une exception si le réseau est indisponible.
 */
SupabaseProvider.prototype.remove = async function (key) {
    await this._fetch(
        'DELETE',
        '/rest/v1/' + this._table + '?key=eq.' + encodeURIComponent(key) + this._ownerFilter()
    );
};

/**
 * Retourne toutes les clés présentes dans Supabase (celles du formateur connecté
 * seulement, si une session est posée).
 * Lève une exception si le réseau est indisponible.
 */
SupabaseProvider.prototype.keys = async function () {
    const data = await this._fetch('GET', '/rest/v1/' + this._table + '?select=key' + this._ownerFilter());
    return (data && Array.isArray(data)) ? data.map(row => row.key) : [];
};

// Export global
window.SupabaseProvider = SupabaseProvider;