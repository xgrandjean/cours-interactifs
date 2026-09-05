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

    async _call(action, slug, token, key, value) {
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
                const data = JSON.parse(execution.responseBody || '{}');
                return data.value !== undefined ? data.value : null;
            }
        } catch (e) {
            console.warn('[StudentProgressBridge] échec ' + action + '("' + key + '") :', e.message);
            return action === 'get' ? null : undefined;
        }

        return null;
    }
};
