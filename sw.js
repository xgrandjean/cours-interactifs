/**
 * sw.js — Service worker de « Correction en salle » (src/html/suiviAtelier.html)
 * ============================================================================
 *
 * ⚠️ CE FICHIER EST À LA RACINE DU DÉPÔT PAR NÉCESSITÉ, PAS PAR COMMODITÉ.
 *
 * Un service worker ne contrôle que les pages situées sous son propre chemin. La page
 * à installer vit dans /src/html/ ; un mobile/sw.js aurait pour portée /…/mobile/ et
 * ne l'aurait jamais contrôlée. L'en-tête HTTP Service-Worker-Allowed, qui permettrait
 * d'élargir la portée, n'est pas configurable sur GitHub Pages. D'où la racine.
 *
 * Conséquence à ne jamais perdre de vue : ce worker voit passer les requêtes de TOUT
 * le site, y compris les pages apprenant, qui partagent config.js, storage.js,
 * progressManager.js et style.css. Servir à un apprenant une vieille copie d'un de ces
 * fichiers serait une régression silencieuse et durable — les écritures fautives
 * dorment ensuite dans _sync_queue et se rejouent plus tard. Deux gardes s'y opposent :
 *
 *   1. RÉSEAU D'ABORD. En ligne, tout vient du réseau ; le cache n'est qu'un secours.
 *      Et toute réponse valide réécrit son entrée : le cache suit le réseau tout seul,
 *      il n'y a donc aucun numéro de version à incrémenter à la main.
 *   2. GARDE PAR RÉFÉRENT. Le worker ne répond qu'aux requêtes émises par
 *      suiviAtelier.html. Une page apprenant traverse ce fichier sans être touchée.
 *
 * Ce que ce worker ne fait pas, délibérément :
 *   - aucun mécanisme hors-ligne pour les DONNÉES : storage.js a déjà son cache
 *     localStorage (_cache_*), sa file d'écritures (_sync_queue) et son bandeau d'état.
 *     Pas de Background Sync non plus — doublon de SyncManager, et absent d'iOS ;
 *   - aucun fallback de navigation générique : index.html et 404.html portent la
 *     logique de redirection par slug, les figer casserait les liens profonds ;
 *   - aucune interception de Supabase ni d'Appwrite : provider.supabase.js impose
 *     cache:'no-store' avec une justification explicite. Le filtre d'origine s'en charge.
 *
 * Enregistré par le bloc en fin de <body> de src/html/suiviAtelier.html. La liste
 * COQUILLE ci-dessous est figée à la main : tout renommage dans src/js/ la casse sans
 * alerte — le seul symptôme serait la perte du hors-ligne.
 *
 * Pour retirer ce worker du parc (coupe-circuit) : voir mobile/CLAUDE.md.
 */

'use strict';

const SW_VERSION = '2026-09-02';        // diagnostic seulement — rien n'en dépend

// Le worker n'a pas accès à window.BASE : il déduit sa racine de sa propre adresse.
// '/cours-interactifs/' sur GitHub Pages, '/' en local.
const RACINE = new URL('./', self.location).pathname;
const PAGE   = RACINE + 'src/html/suiviAtelier.html';
const COURS  = RACINE + 'parcours/cours.json';

const CACHE  = 'correction-en-salle';   // nom stable : réconcilié, jamais versionné
const DELAI  = 2500;                    // ms avant de servir le secours

// Ce dont la page a besoin pour s'ouvrir. L'installation n'en dépend pas (un échec est
// journalisé, pas fatal), mais sans elle il n'y a pas de hors-ligne.
const COQUILLE_LEGERE = [
    'src/html/suiviAtelier.html',
    'src/assets/css/style.css',
    'src/js/config.js',
    'src/js/parcours.js',
    'src/js/storage.js',
    'src/js/atelier/atelierCodes.js',
    'src/js/qrCharge.js',
    'src/js/aide.js',
    'src/js/core/bareme.js',
    'src/js/progressManager.js',
    'src/js/atelier/suiviAtelier.js',
    'storage/config.json',
    // Les trois providers : config.json choisit au runtime, et deploySite() (XSpro)
    // peut le basculer. Manquer celui qui sera choisi coûterait le hors-ligne.
    'storage/provider.supabase.js',
    'storage/provider.appwrite.js',
    'storage/provider.sqlite.js',
].map(c => RACINE + c);

// Volumineux, et non requis pour ouvrir la page — d'où la seconde vague.
//   jsqr.js    : 257 Ko, chargé à la demande au démarrage de la caméra. Le précacher ne
//                contredit pas ce choix : l'installation du worker se fait en arrière-
//                plan, hors du chemin critique de rendu. Sans lui, pas de scan hors ligne.
//   cours.json : 103 Ko. staticJson interroge le PROVIDER D'ABORD (storage.js), donc en
//                ligne ce fichier n'est presque jamais demandé — il n'existe ici que pour
//                le hors-ligne, et c'est pourquoi il lui faut un rafraîchissement à part.
const COQUILLE_LOURDE = [
    'src/js/vendor/jsqr.js',
    'parcours/cours.json',
].map(c => RACINE + c);

const COQUILLE = new Set([...COQUILLE_LEGERE, ...COQUILLE_LOURDE]);

// ---------------------------------------------------------------------------
// OUTILS DE CACHE
// ---------------------------------------------------------------------------

/**
 * GitHub Pages sert 404.html AVEC un statut 404 pour tout chemin inconnu. Sans ce
 * contrôle, une faute de frappe dans COQUILLE mettrait une page HTML en cache sous une
 * URL .js, que le navigateur exécuterait ensuite comme du JavaScript.
 */
function estRangeable(reponse) {
    return !!reponse && reponse.ok && reponse.type === 'basic';
}

async function ranger(cache, chemin) {
    // cache:'reload' — sinon on recopierait la version que le cache HTTP de Pages garde
    // encore dix minutes après un déploiement.
    const reponse = await fetch(new Request(chemin, { cache: 'reload' }));
    if (!estRangeable(reponse)) throw new Error(chemin + ' → HTTP ' + reponse.status);
    await cache.put(chemin, reponse);
}

/**
 * Jamais cache.addAll() : il est atomique, et une seule URL renommée ferait échouer
 * l'installation entière — en silence, donc sans PWA et sans savoir pourquoi.
 */
async function rangerToutes(cache, chemins) {
    const resultats = await Promise.allSettled(chemins.map(c => ranger(cache, c)));
    const echecs = resultats
        .map((r, i) => (r.status === 'rejected' ? chemins[i] : null))
        .filter(Boolean);
    if (echecs.length) console.warn('[sw] non mis en cache :', echecs.join(', '));
}

async function rafraichir(chemin) {
    try {
        await ranger(await caches.open(CACHE), chemin);
    } catch (_) {
        // Hors ligne, ou fichier absent : la copie précédente reste valable.
    }
}

// ---------------------------------------------------------------------------
// CYCLE DE VIE
// ---------------------------------------------------------------------------

self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE);
        await rangerToutes(cache, COQUILLE_LEGERE);
        await rangerToutes(cache, COQUILLE_LOURDE);
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE);

        // Réconciliation : c'est ce qui remplace le numéro de version. Ce qui a quitté
        // la liste est retiré, le reste est re-téléchargé. Idempotent.
        for (const requete of await cache.keys()) {
            if (!COQUILLE.has(new URL(requete.url).pathname)) await cache.delete(requete);
        }
        await rangerToutes(cache, COQUILLE_LEGERE);
        await rangerToutes(cache, COQUILLE_LOURDE);

        // Uniquement NOS caches : l'origine github.io est partagée avec les autres
        // dépôts du compte, dont les caches ne nous regardent pas.
        for (const nom of await caches.keys()) {
            if (nom !== CACHE && nom.startsWith('correction-en-salle')) await caches.delete(nom);
        }

        await self.clients.claim();
        console.log('[sw] actif — version', SW_VERSION, '— racine', RACINE);
    })());
});

// ---------------------------------------------------------------------------
// INTERCEPTION
// ---------------------------------------------------------------------------

/**
 * Le référent d'une sous-ressource same-origin porte l'URL complète du document qui
 * l'a demandée. C'est ce qui fait tomber le rayon d'action de « tout le site » à
 * « une page ». Un référent vide (rare) est traité comme « ne pas intervenir ».
 */
function vientDeLaPage(requete) {
    if (!requete.referrer) return false;
    try {
        return new URL(requete.referrer).pathname === PAGE;
    } catch (_) {
        return false;
    }
}

/**
 * Réseau d'abord, secours après DELAI. La requête réseau n'est jamais annulée : servie
 * en retard, elle rafraîchit quand même le cache — c'est ce write-through qui dispense
 * de tout versionnage manuel.
 */
async function reseauPuisCache(event, requete, cle) {
    const cache = await caches.open(CACHE);

    const reseau = fetch(requete).then(async reponse => {
        if (estRangeable(reponse)) await cache.put(cle, reponse.clone());
        return reponse;
    });
    event.waitUntil(reseau.catch(() => {}));

    try {
        const gagnant = await Promise.race([
            reseau,
            new Promise(resoudre => setTimeout(() => resoudre(null), DELAI)),
        ]);
        if (gagnant && gagnant.ok) return gagnant;
    } catch (_) {
        // Réseau en échec : on tente le secours ci-dessous.
    }

    const copie = await cache.match(cle);
    if (copie) return copie;

    // Ni délai tenu, ni copie : on rend ce que le réseau finira par dire, erreur comprise.
    return reseau;
}

self.addEventListener('fetch', event => {
    const requete = event.request;

    if (requete.method !== 'GET') return;            // écritures intactes
    if (requete.headers.has('range')) return;        // requêtes partielles : passe-plat

    let url;
    try { url = new URL(requete.url); } catch (_) { return; }
    if (url.origin !== self.location.origin) return; // Supabase / Appwrite intacts

    // La navigation vers la page doit TOUJOURS être traitée : Chrome n'offre
    // l'installation que si un fetch du worker répond réellement pour start_url.
    const navigation = requete.mode === 'navigate' && url.pathname === PAGE;

    if (!navigation) {
        if (!COQUILLE.has(url.pathname)) return;     // hors coquille : passe-plat
        if (!vientDeLaPage(requete)) return;         // site apprenant : passe-plat total
    }

    // suiviAtelier.js pose ?parcours=… par replaceState : sans normalisation, une entrée
    // de cache s'accumulerait par parcours. On range et on relit sous l'URL nue.
    event.respondWith(reseauPuisCache(event, requete, navigation ? PAGE : url.pathname));

    // cours.json n'est presque jamais demandé en ligne (le provider répond avant), donc
    // le write-through ne le touche jamais : sans ceci, sa copie vieillirait sans fin.
    if (navigation) event.waitUntil(rafraichir(COURS));
});
