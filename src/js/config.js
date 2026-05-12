/**
 * src/js/config.js — Configuration centralisée pour le routage multi-environnement
 * =======================================================================
 * À inclure EN PREMIER dans toutes les pages HTML, avant tout autre script.
 *
 * Détecte automatiquement si la page est servie en local (dev)
 * ou sur GitHub Pages (production) et définit BASE en conséquence.
 *
 * Usage :
 *   <script src="src/js/config.js"></script>  <!-- à adapter selon profondeur -->
 *   <script>
 *     window.location.replace(BASE + '/src/html/login.html');
 *   </script>
 */
(function () {
  'use strict';

  var repoName = 'cours-interactifs';

  // En local (127.0.0.1 ou localhost) → pas de sous-chemin
  // En production (GitHub Pages) → préfixe avec le nom du dépôt
  window.BASE = (
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === 'localhost'
  ) ? '' : '/' + repoName;

  // Utile pour que les autres modules (parcours.js) puissent aussi
  // connaître le nom du dépôt sans le dupliquer.
  window.REPO_NAME = repoName;
})();