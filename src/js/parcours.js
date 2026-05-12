/**
 * parcours.js — Module partagé multi-parcours
 * ============================================
 * Charger EN PREMIER sur toutes les pages, avant storage.js et dataStorage.js.
 *
 * Responsabilités :
 *  1. Résoudre la redirection GitHub Pages (param ?r=)
 *  2. Détecter le slug du parcours depuis l'URL
 *     /cours-interactifs/parcours/nsi-term → slug = "nsi-term"
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
  // Structure attendue : /cours-interactifs/parcours/{slug}[/...]
  // parts après split('/') sur le pathname sans le slash initial :
  //   ["cours-interactifs", "parcours", "nsi-term", ...]
  var REPO      = window.REPO_NAME || 'cours-interactifs';
  var SUBFOLDER = 'parcours';

  function detectSlug() {
    var parts = window.location.pathname.replace(/^\//, '').split('/');
    // parts[0] = REPO, parts[1] = "parcours" ou "teacher", parts[2] = slug
    if (parts[0] === REPO && parts[1] === SUBFOLDER && parts[2]) {
      return parts[2];
    }
    // Sur domaine custom sans sous-chemin
    if (parts[0] === SUBFOLDER && parts[1]) {
      return parts[1];
    }
    return '';
  }

  // ── 3. LECTURE DU TOKEN ─────────────────────────────────────
  function readToken(slug) {
    if (!slug) return null;
    var params  = new URLSearchParams(window.location.search);
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

    function wrap(prefix) {
      return {
        get: function(key) {
          // storage est défini par storage.js, chargé juste après
          return window.storage ? window.storage.get(prefix + key) : Promise.resolve(null);
        },
        set: function(key, value) {
          return window.storage ? window.storage.set(prefix + key, value) : Promise.resolve();
        },
        remove: function(key) {
          return window.storage ? window.storage.remove(prefix + key) : Promise.resolve();
        },
        // Préfixe brut, utile pour les clés legacy (DataStorage)
        prefix: prefix
      };
    }

    return {
      // Données de l'élève courant
      student: wrap(studentPrefix),
      // Données formateur (users_list, teacher_name…)
      teacher: wrap(teacherPrefix),
      // Config du parcours (chapter_config, locks, examMode…)
      config:  wrap(configPrefix),

      // Préfixe élève brut — utilisé par DataStorage pour les clés comme
      // "student_{token}_progress" → devient "nsi-term:STU001:student_STU001_progress"
      studentPrefix: studentPrefix,
      teacherPrefix: teacherPrefix,
      configPrefix:  configPrefix,
    };
  }

  // ── 5. NAVIGATION ────────────────────────────────────────────
  var BASE = '/' + REPO + '/';

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

  // Compatibilité avec le code existant qui lit sessionStorage directement
  if (token) {
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

    // Infos de débogage
    repoName:   REPO,
    subFolder:  SUBFOLDER,
  });

  console.log('[Parcours] slug=' + slug + ' token=' + (token ? token : 'null'));

})();
