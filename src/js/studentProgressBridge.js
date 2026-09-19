/**
 * studentProgressBridge.js — Pont vers la fonction serveur "student-progress"
 * ============================================================================
 * N'entre en jeu qu'en mode Web (backend cloud, aucune session formateur
 * active sur ce provider) : un élève anonyme ne peut jamais lire/écrire
 * app_data en direct une fois la RLS fermée (Phase 3 du plan multi-formateur)
 * — ce pont route sa lecture/écriture de progression via une fonction serveur
 * qui, elle, a accès à toute la base (clé service_role) et sait retrouver le
 * bon formateur à partir du seul slug (rendu globalement unique à la
 * publication, Phase 1).
 *
 * En mode personnel/local (electron/sqlite) ou avec une session formateur
 * active, ce pont n'est jamais sollicité (cf. shouldUseProgressBridge() dans
 * parcours.js) : storage.get/set continuent d'être appelés directement, sans
 * aucun changement de comportement.
 *
 * ⚠️ Jamais encore exécuté contre une fonction serveur réelle (aucun projet
 * Supabase/Appwrite de test au moment de l'écriture) — à valider dès qu'un
 * tel projet existe, en particulier le format exact de réponse d'une
 * exécution Appwrite (le format ci-dessous suit la documentation REST
 * publique, non vérifié en pratique).
 */
window.StudentProgressBridge = {
    async get(slug, token, key) {
        return this._call('get', slug, token, key, undefined);
    },

    async set(slug, token, key, value) {
        return this._call('set', slug, token, key, value);
    },

    /**
     * Vérifie qu'un jeton est bien inscrit à ce parcours, sans lire ni écrire
     * de progression. Utilisé par login.html/user.html pour valider un jeton
     * élève : en mode Web, la RLS fermée leur interdit de lire
     * "{slug}:teacher:users_list" en direct (owner_id = auth.uid() échoue
     * toujours pour un appel anonyme), ce qui provoquait une boucle de
     * redirection infinie entre les deux pages.
     *
     * Deux echecs a ne jamais confondre :
     *   { found: false }              → le service a repondu : jeton inconnu.
     *   { found: false, erreur: '…' } → le service n'a pas repondu. L'appelant
     *                                   doit s'ARRETER, pas rediriger.
     *
     * @returns {Promise<{found: boolean, name?: string|null, erreur?: string}>}
     */
    async whoami(slug, token) {
        const result = await this._call('whoami', slug, token, undefined, undefined, /* rawResult */ true);

        // Exiger un `found` BOOLEEN, pas seulement un objet : un corps illisible
        // ou tronque donne {} , qui n'a ni found ni erreur. L'appelant y lisait
        // alors « jeton inconnu » et repartait vers la connexion — la boucle,
        // encore, par une troisieme porte. Une reponse qu'on ne comprend pas
        // n'est pas un verdict.
        if (result && typeof result.found === 'boolean') return result;
        return { found: false, erreur: 'réponse illisible du service' };
    },

    async _call(action, slug, token, key, value, rawResult) {
        const p = window._storageProvider;
        const backend = window._storageBackend;

        try {
            if (backend === 'supabase') {
                const resp = await fetch(p._url + '/functions/v1/student-progress', {
                    method: 'POST',
                    headers: {
                        'apikey':        p._key,
                        'Authorization': 'Bearer ' + p._key, // clé anon : la fonction vérifie elle-même token+slug
                        'Content-Type':  'application/json'
                    },
                    body: JSON.stringify({ action, slug, token, key, value })
                });
                if (!resp.ok) throw new Error('HTTP ' + resp.status);
                const data = await resp.json();
                if (rawResult) return data;
                return data.value !== undefined ? data.value : null;
            }

            if (backend === 'appwrite') {
                // Exécution synchrone d'une Appwrite Function (id conventionnel
                // "student-progress" — à ajuster si l'id réel diffère à la création).
                const resp = await fetch(p._endpoint + '/functions/student-progress/executions', {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'X-Appwrite-Project': p._project,
                        'Content-Type':       'application/json'
                    },
                    body: JSON.stringify({
                        body:  JSON.stringify({ action, slug, token, key, value }),
                        async: false
                    })
                });
                if (!resp.ok) throw new Error('HTTP ' + resp.status);
                const execution = await resp.json();

                // PIEGE PROPRE A APPWRITE : cet appel repond 201 meme quand la
                // fonction, elle, a echoue. L'echec est A L'INTERIEUR de la
                // reponse — responseStatusCode et status. Sans ce controle, un
                // 500 de la fonction ressortait ici en objet { error: ... } sans
                // `found` : l'appelant y lisait « jeton inconnu » et repartait
                // vers la connexion. La boucle revenait par la porte de service.
                //
                // Cote Supabase le probleme ne se pose pas : l'appel EST la
                // fonction, donc !resp.ok suffit.
                let data = {};
                try { data = JSON.parse(execution.responseBody || '{}'); } catch (_) { data = {}; }

                const codeFonction = execution.responseStatusCode;
                const aEchoue = execution.status === 'failed'
                             || (typeof codeFonction === 'number' && codeFonction >= 400)
                             || (data && data.error !== undefined);

                if (aEchoue) {
                    // whoami n'a que deux reponses legitimes : trouve, ou pas
                    // trouve. Toute erreur — 500 interne, 404 parcours
                    // introuvable, 409 publie en double — est un probleme de
                    // service ou de configuration, jamais un verdict sur le
                    // jeton de l'apprenant. On ne redirige donc pas.
                    const detail = (data && data.error) || ('HTTP ' + (codeFonction || '?'));
                    const etape  = (data && data.etape) ? ' (' + data.etape + ')' : '';
                    throw new Error(detail + etape);
                }

                if (rawResult) return data;
                return data.value !== undefined ? data.value : null;
            }
        } catch (e) {
            // « Le service n'a pas pu repondre » n'est PAS « ce jeton n'existe
            // pas ». Confondre les deux transformait une panne en boucle de
            // redirection infinie entre login.html et user.html : whoami
            // renvoyait found:false, l'appelant en concluait jeton invalide et
            // repartait vers la connexion, qui renvoyait ici. Constate sur le
            // deploiement Appwrite, ou la fonction serveur n'existe pas (404) —
            // mais le defaut vaut pour n'importe quelle coupure, Supabase
            // comprise.
            console.warn('[StudentProgressBridge] échec ' + action + ' (key=' + key + ') :', e.message);
            if (rawResult) return { found: false, erreur: e.message || 'service injoignable' };
            return action === 'get' ? null : undefined;
        }

        // Backend inconnu : ni supabase ni appwrite. Ce n'est pas davantage un
        // verdict sur le jeton.
        return rawResult
            ? { found: false, erreur: 'backend non supporté par le pont' }
            : null;
    }
};
