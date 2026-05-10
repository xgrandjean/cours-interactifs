/**
 * parcours.js — Module partagé multi-parcours
 * =============================================
 * À charger en premier sur toutes les pages (avant main.js et index.js).
 *
 * Responsabilités :
 *  1. Détecter le slug du parcours courant depuis l'URL
 *  2. Lire / écrire le token élève (query param + sessionStorage)
 *  3. Préfixer TOUTES les clés localStorage avec le slug
 *     → isolation totale entre parcours
 *  4. Résoudre la redirection GitHub Pages (param `r`)
 *  5. Exposer window.Parcours pour le reste de l'application
 *
 * Usage dans les autres scripts :
 *   const token   = Parcours.token;           // "STU001" ou null
 *   const slug    = Parcours.slug;            // "nsi-term"
 *   Parcours.storage.set('progress', data);   // clé réelle : "nsi-term:STU001:progress"
 *   Parcours.storage.get('progress');
 *   Parcours.redirectToLogin();               // si pas de token
 *   Parcours.allSlugs();                      // liste tous les parcours connus
 */

(function () {
  'use strict';

  // ─────────────────────────────────────────────
  // 1. RÉSOLUTION GITHUB PAGES (param `r`)
  // ─────────────────────────────────────────────
  (function resolveGitHubPagesRedirect() {
    var params = new URLSearchParams(window.location.search);
    var r = params.get('r');
    if (!r) return;

    // Reconstitue l'URL propre et remplace l'historique sans recharger
    var decoded = decodeURIComponent(r);
    // decoded = "nsi-term?token=STU001"
    var newUrl = window.location.protocol + '//' + window.location.host + '/' + decoded;
    window.history.replaceState(null, '', newUrl);
  })();

  // ─────────────────────────────────────────────
  // 2. DÉTECTION DU SLUG
  // ─────────────────────────────────────────────
  /**
   * Extrait le premier segment du pathname.
   * /nsi-term?token=STU001  →  "nsi-term"
   * /teacher                →  "teacher"
   * /                       →  ""  (page racine)
   */
  function detectSlug() {
    var parts = window.location.pathname.replace(/^\//, '').split('/');
    return parts[0] || '';
  }

  // ─────────────────────────────────────────────
  // 3. LECTURE DU TOKEN
  // ─────────────────────────────────────────────
  /**
   * Priorité :
   *  1. Query param  ?token=STU001   (lien direct)
   *  2. sessionStorage  (navigation intra-parcours)
   *  3. null  → l'appelant devra rediriger vers login
   *
   * Si un token est trouvé en query param, il est sauvegardé
   * dans sessionStorage pour toute la session.
   * La clé sessionStorage est préfixée par le slug pour éviter
   * qu'un token d'un parcours ne "pollue" un autre.
   */
  function readToken(slug) {
    var params  = new URLSearchParams(window.location.search);
    var fromUrl = params.get('token');
    var ssKey   = 'parcours:' + slug + ':token';

    if (fromUrl) {
      sessionStorage.setItem(ssKey, fromUrl);
      // Nettoie le token de l'URL (propre dans la barre d'adresse)
      params.delete('token');
      var clean = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
      window.history.replaceState(null, '', clean);
      return fromUrl;
    }
    return sessionStorage.getItem(ssKey) || null;
  }

  // ─────────────────────────────────────────────
  // 4. STORAGE ISOLÉ PAR PARCOURS + TOKEN
  // ─────────────────────────────────────────────
  /**
   * Toutes les clés sont préfixées :
   *   "[slug]:[token]:[key]"    pour les données élève
   *   "[slug]:teacher:[key]"    pour les données formateur
   *   "[slug]:config:[key]"     pour la config du parcours
   *
   * Ça permet au dashboard formateur de scanner tous les parcours
   * avec un simple préfixe.
   */
  function makeStorage(slug, token) {
    var studentPrefix = slug + ':' + (token || '_guest') + ':';
    var teacherPrefix = slug + ':teacher:';
    var configPrefix  = slug + ':config:';

    function _set(prefix, key, value) {
      try {
        localStorage.setItem(prefix + key, JSON.stringify(value));
      } catch(e) { console.warn('[Parcours] storage.set error', e); }
    }

    function _get(prefix, key, fallback) {
      try {
        var raw = localStorage.getItem(prefix + key);
        return raw !== null ? JSON.parse(raw) : (fallback !== undefined ? fallback : null);
      } catch(e) { return fallback !== undefined ? fallback : null; }
    }

    function _remove(prefix, key) {
      localStorage.removeItem(prefix + key);
    }

    return {
      // Données élève courant
      set:    function(key, value)          { _set(studentPrefix, key, value); },
      get:    function(key, fallback)       { return _get(studentPrefix, key, fallback); },
      remove: function(key)                 { _remove(studentPrefix, key); },

      // Données formateur (liste élèves, config tokens…)
      teacher: {
        set:    function(key, value)        { _set(teacherPrefix, key, value); },
        get:    function(key, fallback)     { return _get(teacherPrefix, key, fallback); },
        remove: function(key)               { _remove(teacherPrefix, key); },
      },

      // Config du parcours (chapitres verrouillés, dates, examMode…)
      config: {
        set:    function(key, value)        { _set(configPrefix, key, value); },
        get:    function(key, fallback)     { return _get(configPrefix, key, fallback); },
        remove: function(key)               { _remove(configPrefix, key); },
      },

      /**
       * Retourne toutes les entrées localStorage d'un préfixe donné.
       * Utile pour le dashboard formateur.
       */
      scanPrefix: function(prefix) {
        var result = {};
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.startsWith(prefix)) {
            try { result[k] = JSON.parse(localStorage.getItem(k)); }
            catch(e) { result[k] = localStorage.getItem(k); }
          }
        }
        return result;
      },

      /**
       * Préfixe brut (slug:token:) — pour compatibilité avec
       * le code existant qui utilise StorageService directement.
       */
      rawPrefix: studentPrefix
    };
  }

  // ─────────────────────────────────────────────
  // 5. LISTE DES PARCOURS CONNUS
  // ─────────────────────────────────────────────
  /**
   * Scanne le localStorage pour trouver tous les slugs de parcours
   * qui ont des données. Utile pour le dashboard formateur.
   * Format des clés : "slug:..."
   */
  function allSlugs() {
    var slugs = new Set();
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k) {
        var parts = k.split(':');
        if (parts.length >= 2) slugs.add(parts[0]);
      }
    }
    return Array.from(slugs);
  }

  /**
   * Retourne tous les tokens (élèves) qui ont des données
   * pour un slug donné.
   */
  function studentsForSlug(slug) {
    var tokens = new Set();
    var prefix = slug + ':';
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.startsWith(prefix)) {
        var rest  = k.slice(prefix.length);
        var token = rest.split(':')[0];
        if (token && token !== 'teacher' && token !== 'config') {
          tokens.add(token);
        }
      }
    }
    return Array.from(tokens);
  }

  // ─────────────────────────────────────────────
  // 6. HELPERS NAVIGATION
  // ─────────────────────────────────────────────
  var BASE_URL = window.location.protocol + '//' + window.location.host;

  function loginUrl(slug) {
    return BASE_URL + '/' + slug;
  }

  function parcoursUrl(slug, token) {
    return BASE_URL + '/' + slug + (token ? '?token=' + token : '');
  }

  // ─────────────────────────────────────────────
  // 7. ASSEMBLAGE ET EXPOSITION
  // ─────────────────────────────────────────────
  var slug    = detectSlug();
  var token   = (slug && slug !== 'teacher') ? readToken(slug) : null;
  var storage = makeStorage(slug, token);

  /**
   * window.Parcours — API publique
   *
   * Disponible sur TOUTES les pages après chargement de ce script.
   * Remplace les accès directs à localStorage et sessionStorage
   * dans le reste de l'application.
   */
  window.Parcours = Object.freeze({
    slug:    slug,
    token:   token,
    storage: storage,

    /** Redirige vers la page de login du parcours courant */
    redirectToLogin: function () {
      window.location.href = loginUrl(slug);
    },

    /** URL de login pour n'importe quel slug */
    loginUrl: loginUrl,

    /** URL d'accès direct avec token */
    parcoursUrl: parcoursUrl,

    /** Liste tous les slugs ayant des données en localStorage */
    allSlugs: allSlugs,

    /** Liste tous les tokens élèves d'un parcours */
    studentsForSlug: studentsForSlug,

    /**
     * Déconnexion : efface le token de session
     * et redirige vers le login du parcours
     */
    logout: function () {
      var ssKey = 'parcours:' + slug + ':token';
      sessionStorage.removeItem(ssKey);
      window.location.href = loginUrl(slug);
    },

    /**
     * Compatibilité avec l'ancien StorageService :
     * retourne le préfixe brut pour les clés existantes.
     */
    rawPrefix: storage.rawPrefix
  });

  // ─────────────────────────────────────────────
  // 8. PATCH DE COMPATIBILITÉ
  // ─────────────────────────────────────────────
  /**
   * Le code existant utilise :
   *   sessionStorage.getItem('current_student_token')
   *   StorageService.get(STORAGE_KEYS.xxx, ...)
   *
   * On patche sessionStorage pour que 'current_student_token'
   * retourne le bon token du parcours courant, sans modifier
   * le code existant.
   */
  if (token) {
    // Maintient la clé legacy pour index.js et les chapitres
    sessionStorage.setItem('current_student_token', token);
  }

})();
