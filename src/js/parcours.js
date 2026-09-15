/**
 * parcours.js — Module partagé multi-parcours
 * ============================================
 * Charger EN PREMIER sur toutes les pages, avant storage.js et dataStorage.js.
 *
 * Responsabilités :
 *  1. Résoudre la redirection GitHub Pages (param ?r=)
 *  2. Détecter le slug du parcours depuis l'URL, quel que soit le nom du dépôt
 *     <BASE>/parcours/src/nsi-term → slug = "nsi-term"
 *  3. Lire/écrire le token élève (query param → sessionStorage)
 *  4. Exposer window.Parcours (slug, token, scopedStorage, logout…)
 *
 * PHILOSOPHIE : on ne patche RIEN dans storage.js.
 * À la place, scopedStorage(slug, token) retourne un wrapper
 * qui préfixe les clés avant d'appeler storage.get/set/remove.
 * Supabase reçoit donc des clés comme "nsi-term:STU001:course_progress"
 * et le cache localStorage suit la même convention.
 *
 * Exposition publique :
 *   window.Parcours.slug              → "nsi-term"
 *   window.Parcours.token             → "STU001" | null
 *   window.Parcours.scoped            → wrapper storage préfixé (disponible après storage.js)
 *   window.Parcours.makeScoped()      → recrée le wrapper (appelé après storage.js)
 *   window.Parcours.logout()          → efface session + redirect login
 *   window.Parcours.allSlugs()        → slugs connus depuis le cache localStorage
 *   window.Parcours.studentsForSlug() → tokens élèves d'un parcours
 */
(function () {
  'use strict';

  // ── 1. RÉSOLUTION GITHUB PAGES ──────────────────────────────
  // 404.html encode l'URL dans ?r= et redirige vers la racine.
  // On restaure l'URL propre ici avant toute détection de slug.
  (function resolveGitHubRedirect() {
    var params = new URLSearchParams(window.location.search);
    var r = params.get('r');
    if (!r) return;
    var decoded = decodeURIComponent(r);
    // decoded = "cours-interactifs/parcours/nsi-term?token=STU001"
    var newUrl = window.location.protocol + '//' + window.location.host + '/' + decoded;
    window.history.replaceState(null, '', newUrl);
  })();

  // ── 2. DÉTECTION DU SLUG ─────────────────────────────────────
  // Structure attendue, une fois le préfixe du site retiré :
  //   parcours/src/{slug}[/...]  →  ["parcours", "src", "nsi-term", ...]
  var SUBFOLDER = 'parcours';

  /**
   * Le chemin de la page, débarrassé du préfixe du site.
   *
   * window.BASE est déduit par config.js de l'emplacement réel du script :
   * '/cours-interactifs' sur un dépôt de projet, '' à la racine d'un domaine ou
   * en local. Le nom du dépôt était ici écrit en dur, ce qui condamnait le site
   * à ce seul nom : publié sous un autre (un second déploiement, le site
   * partagé, un fork renommé), il ne reconnaissait plus ses propres adresses de
   * parcours et retombait sur la session — vide au premier clic sur un lien
   * envoyé à un élève, donc aucun parcours affiché, sans rien pour l'expliquer.
   */
  function cheminSousLaBase() {
      var chemin = window.location.pathname;
      var base   = (typeof window.BASE === 'string') ? window.BASE : '';
      if (base && chemin.indexOf(base) === 0) chemin = chemin.slice(base.length);
      return chemin.replace(/^\//, '');
  }


  function detectSlug() {
      // ✅ Priorité 1 : query param ?parcours=
      var urlSlug = new URLSearchParams(window.location.search).get('parcours');
      if (urlSlug) return urlSlug;

      var parts = cheminSousLaBase().split('/');

      // ✅ Servi par le web, quel que soit le nom du dépôt : une seule règle
      //    couvre le dépôt de projet (/<depot>/parcours/src/{slug}/...), la page
      //    d'utilisateur ou le domaine personnalisé (/parcours/src/{slug}/...)
      //    et le serveur local, puisque le préfixe a déjà été retiré.
      if (parts[0] === SUBFOLDER && parts[1] === 'src' && parts[2]) {
          return parts[2];
      }

      // ✅ Electron (file: ou protocole custom) : pathname = /chemin/absolu/parcours/src/{slug}/...
      //    On cherche le segment "src" précédé de SUBFOLDER, indépendamment du préfixe
      if (!window.location.hostname || window.location.protocol === 'file:') {
          var srcIdx = parts.indexOf('src');
          if (srcIdx > 0 && parts[srcIdx - 1] === SUBFOLDER && parts[srcIdx + 1]) {
              return parts[srcIdx + 1];
          }
      }

      // ✅ Fallback : slug stocké en session
      var sessionSlug = sessionStorage.getItem('parcours:current:slug');
      if (sessionSlug) return sessionSlug;
      return '';
  }
  // ── 3. LECTURE DU TOKEN ─────────────────────────────────────
  /**
   * L'identité de la page est-elle imposée par l'URL plutôt que par la session ?
   * Vrai pour l'aperçu formateur (teacher_view) et pour la simulation.
   */
  function identiteParUrl(params) {
    return params.get('teacher_view') === 'true' || params.get('simulation') === 'true';
  }

  function readToken(slug) {
    if (!slug) return null;
    var params  = new URLSearchParams(window.location.search);

    // Identité portée par l'URL, indépendamment de toute session élève active dans
    // cet onglet : aperçu formateur (apprenant réel prévisualisé) ou simulation
    // (apprenant de simulation). Dans les deux cas on ne touche pas à la session,
    // voir plus bas — sinon ouvrir un aperçu depuis le tableau de bord y installerait
    // une identité d'élève.
    if (identiteParUrl(params) && params.has('student_id')) {
      return params.get('student_id');
    }

    var fromUrl = params.get('token');
    var ssKey   = 'parcours:' + slug + ':token';

    if (fromUrl) {
      sessionStorage.setItem(ssKey, fromUrl);
      // Nettoie le token de la barre d'adresse (ne pas exposer le token)
      params.delete('token');
      var clean = window.location.pathname +
        (params.toString() ? '?' + params.toString() : '');
      window.history.replaceState(null, '', clean);
      return fromUrl;
    }
    return sessionStorage.getItem(ssKey) || null;
  }

  // ── 4. SCOPED STORAGE (WRAPPER PRÉFIXÉ) ─────────────────────
  // Ne patche pas storage.js. Retourne un objet avec les mêmes
  // méthodes que `storage` mais qui préfixe toutes les clés avec
  // "[slug]:[token]:" avant d'appeler storage.get/set/remove.
  //
  // Les clés Supabase ressembleront à :
  //   "nsi-term:STU001:course_progress"
  //   "nsi-term:teacher:users_list"
  //   "nsi-term:config:chapter_config"
  //
  // Le cache localStorage (géré par storage.js) sera :
  //   "_cache_nsi-term:STU001:course_progress"

  function makeScopedStorage(slug, token) {
    var studentPrefix = slug + ':' + (token || '_guest') + ':';
    var teacherPrefix = slug + ':teacher:';
    var configPrefix  = slug + ':config:';

    // ── Pont vers la fonction serveur "student-progress" (Phase 3 du plan
    // multi-formateur) ────────────────────────────────────────────────────
    // Une fois la RLS fermée en mode Web (backend cloud), un élève anonyme
    // (aucune session formateur posée sur le provider, cf. Phase 2 —
    // storage.setOwnerSession) ne peut plus jamais lire/écrire app_data en
    // direct : owner_id = auth.uid() échoue toujours pour un appel anonyme.
    // Seule la donnée élève (studentPrefix) a besoin de ce détour — les
    // données formateur/config restent volontairement en accès direct,
    // protégées par la RLS elle-même (un élève n'a pas à les toucher).
    //
    // ⚠️ Le pont lui-même (studentProgressBridge.js) n'a jamais tourné contre
    // une fonction serveur réelle — à valider dès qu'un projet de test existe.
    function shouldUseProgressBridge() {
      var backend = window._storageBackend;
      if (backend !== 'supabase' && backend !== 'appwrite') return false; // mode local : jamais de pont
      var p = window._storageProvider;
      return !(p && p._ownerId); // une session formateur active => accès direct, RLS s'en charge
    }

    function wrap(prefix, isStudentScope) {
      return {
        get: function(key) {
          if (isStudentScope && shouldUseProgressBridge()) {
            return window.StudentProgressBridge.get(slug, token, key);
          }
          // storage est défini par storage.js, chargé juste après
          return window.storage ? window.storage.get(prefix + key) : Promise.resolve(null);
        },
        set: function(key, value) {
          if (isStudentScope && shouldUseProgressBridge()) {
            return window.StudentProgressBridge.set(slug, token, key, value);
          }
          return window.storage ? window.storage.set(prefix + key, value) : Promise.resolve();
        },
        remove: function(key) {
          // Pas de détour pont ici : la suppression de progression élève reste
          // une action formateur (réinitialisation), toujours faite en session
          // authentifiée — cf. Phase 3 du plan.
          return window.storage ? window.storage.remove(prefix + key) : Promise.resolve();
        },
        // Préfixe brut, utile pour les clés legacy (DataStorage)
        prefix: prefix
      };
    }

    return {
      // Données de l'élève courant
      student: wrap(studentPrefix, true),
      // Données formateur (users_list, teacher_name…)
      teacher: wrap(teacherPrefix, false),
      // Config du parcours (chapter_config, locks, examMode…)
      config:  wrap(configPrefix, false),

      // Préfixe élève brut — utilisé par DataStorage pour les clés comme
      // "student_{token}_progress" → devient "nsi-term:STU001:student_STU001_progress"
      studentPrefix: studentPrefix,
      teacherPrefix: teacherPrefix,
      configPrefix:  configPrefix,
    };
  }

  // ── 5. NAVIGATION ────────────────────────────────────────────
  // Utilise window.BASE depuis config.js (env-aware : "" en local, "/cours-interactifs" sur GitHub Pages)
  var BASE = (window.BASE || '') + '/';

  function parcoursBase(slug) {
    return BASE + SUBFOLDER + '/src/' + slug + '/';
  }

  function loginUrl(slug) {
    return BASE + 'src/html/login.html?parcours=' + slug;
  }

  // ── 6. LISTE DES PARCOURS / ÉLÈVES (depuis cache localStorage)
  // Le cache de storage.js utilise le préfixe "_cache_".
  // On scanne ces clés pour découvrir les slugs et tokens existants.

  function allSlugs() {
    var slugs = new Set();
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      // Clés de cache : "_cache_nsi-term:STU001:..."
      if (k && k.startsWith('_cache_')) {
        var parts = k.slice('_cache_'.length).split(':');
        if (parts.length >= 2) slugs.add(parts[0]);
      }
    }
    return Array.from(slugs);
  }

  function studentsForSlug(slug) {
    var tokens = new Set();
    var cachePrefix = '_cache_' + slug + ':';
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.startsWith(cachePrefix)) {
        var rest  = k.slice(cachePrefix.length);
        var token = rest.split(':')[0];
        if (token && token !== 'teacher' && token !== 'config') {
          tokens.add(token);
        }
      }
    }
    return Array.from(tokens);
  }

  // ── 7. ASSEMBLAGE ────────────────────────────────────────────
  var slug  = detectSlug();
  var token = readToken(slug);
  var identitePortéeParUrl = identiteParUrl(new URLSearchParams(window.location.search));

  // Compatibilité avec le code existant qui lit sessionStorage directement.
  // On n'écrit PAS la session quand l'identité vient de l'URL : ni l'apprenant
  // prévisualisé par le formateur, ni l'apprenant de simulation ne doivent
  // s'installer dans la session de l'onglet.
  if (token && !identitePortéeParUrl) {
    sessionStorage.setItem('current_student_token', token);
  }

  // scoped est null au moment de l'exécution de ce script
  // (storage.js n'est pas encore chargé).
  // Il faut appeler Parcours.makeScoped() après storage.js,
  // ou utiliser Parcours.scoped qui est un Proxy lazy.
  var _scoped = null;

  function makeScoped() {
    _scoped = makeScopedStorage(slug, token);
    return _scoped;
  }

  // Proxy lazy : _scoped est initialisé à la première utilisation
  // si makeScoped() n'a pas encore été appelé
  var scopedProxy = new Proxy({}, {
    get: function(_, prop) {
      if (!_scoped) makeScoped();
      return _scoped[prop];
    }
  });

  window.Parcours = Object.freeze({
    slug:  slug,
    token: token,

    // Wrapper storage préfixé — disponible après storage.js
    // Utilisation : await Parcours.scoped.student.get('course_progress')
    get scoped() { return scopedProxy; },

    // Recrée le wrapper (à appeler explicitement si besoin)
    makeScoped: makeScoped,

    // URL helpers
    homeUrl:  parcoursBase(slug),
    loginUrl: loginUrl(slug),
    // URL de la page d'accueil du parcours (liste des chapitres)
    // → /src/html/user.html?parcours=math-Term
    userHomeUrl: BASE + 'src/html/user.html?parcours=' + slug,

    // Redirection
    redirectToLogin: function() {
      window.location.href = loginUrl(slug);
    },

    logout: function() {
      sessionStorage.removeItem('parcours:' + slug + ':token');
      sessionStorage.removeItem('current_student_token');
      window.location.href = loginUrl(slug);
    },

    // Découverte (depuis cache localStorage)
    allSlugs:         allSlugs,
    studentsForSlug:  studentsForSlug,

    // Infos de débogage. `repoName` a disparu avec la constante qu'il exposait :
    // personne ne le lisait, et il annonçait un nom de dépôt qui n'était pas
    // celui servant la page. `base` est déduit, donc toujours exact.
    base:       (typeof window.BASE === 'string') ? window.BASE : '',
    subFolder:  SUBFOLDER,
  });

  // if (slug || token) console.log('[Parcours] slug=' + slug + ' token=' + (token ? token : 'null'));

})();
