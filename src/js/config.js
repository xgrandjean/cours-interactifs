/**
 * src/js/config.js — Configuration centralisée pour le routage multi-environnement
 * =======================================================================
 * À inclure EN PREMIER dans toutes les pages HTML, avant tout autre script.
 *
 * Détection d'environnement automatique :
 *   - localhost / 127.0.0.1              → développement (BASE = '')
 *   - *.github.io (GitHub Pages)          → production (BASE = '/cours-interactifs')
 *   - tout autre hostname                 → production dédiée (BASE = '/cours-interactifs')
 *
 * Le provider de stockage est choisi par storage.js à partir du fichier
 * de configuration (config.json en local, config.supabase.json sur GitHub Pages).
 * config.js ne force plus de provider, ce qui permet de travailler avec
 * Supabase ou SQLite indifféremment en local et en production.
 *
 * Usage :
 *   <script src="src/js/config.js"></script>
 *   <script>
 *     window.location.replace(BASE + '/src/html/login.html');
 *   </script>
 */
(function () {
  'use strict';

  var repoName = 'cours-interactifs';
  var hostname = window.location.hostname;

  // ── Détection d'environnement ─────────────────────────────
  var isLocal = (hostname === 'localhost' || hostname === '127.0.0.1');
  var isGithubPages = hostname.includes('github.io');

  // ── BASE URL ──────────────────────────────────────────────
  window.BASE = isLocal ? '' : '/' + repoName;

  // ── Nom du dépôt (utile pour parcours.js) ─────────────────
  window.REPO_NAME = repoName;

  // ── Flags d'environnement (utiles pour les autres modules) ─
  window.IS_LOCAL       = isLocal;
  window.IS_GITHUB_PAGES = isGithubPages;

  // ── Provider de stockage ──────────────────────────────────
  // Le provider est déterminé par le fichier de configuration
  // (config.json en local, config.supabase.json sur GitHub Pages)
  // et chargé par storage.js. On ne le force plus ici.
  window.STORAGE_PROVIDER = '';

  // ── Balise <base> dynamique ───────────────────────────────
  // Redirige les chemins relatifs vers le bon sous-répertoire
  var baseTag = document.querySelector('base');
  if (baseTag) {
    baseTag.href = window.BASE + '/';
  }

  console.log('[Config] hostname=' + hostname +
    ' isLocal=' + isLocal +
    ' isGithubPages=' + isGithubPages +
    ' BASE="' + window.BASE + '"' +
    ' STORAGE_PROVIDER=' + window.STORAGE_PROVIDER);
})();
