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
 * Le provider de stockage est aussi auto-sélectionné :
 *   - local           → SQLite (via le backend Node.js sur :3000)
 *   - GitHub Pages    → Supabase (directement depuis le navigateur)
 *
 * Usage :
 *   <script src="src/js/config.js"></script>
 *   <script>
 *     window.location.replace(BASE + '/src/html/login.html');
 *   </script>
 */
(function () {
  'use strict';

  // Retrouve la balise <script> de ce fichier et en tire le prefixe d'URL.
  // document.currentScript suffit dans tous les navigateurs vises ; le repli par
  // parcours des balises couvre le cas d'un script injecte, ou currentScript est
  // nul.
  function baseDepuisCeScript() {
    var MARQUEUR = '/src/js/config.js';
    var src = (document.currentScript && document.currentScript.src) || null;

    if (!src) {
      var balises = document.getElementsByTagName('script');
      for (var i = balises.length - 1; i >= 0; i--) {
        if (balises[i].src && balises[i].src.indexOf(MARQUEUR) !== -1) {
          src = balises[i].src;
          break;
        }
      }
    }

    // Repli ultime : on retombe sur l'ancien comportement plutot que sur une
    // base vide, qui casserait un site de projet de facon plus sournoise.
    if (!src) return isLocal ? '' : '/' + repoName;

    var chemin = new URL(src, window.location.href).pathname;
    var i2 = chemin.indexOf(MARQUEUR);
    return (i2 >= 0) ? chemin.slice(0, i2) : '';
  }

  var repoName = 'cours-interactifs'; // repli seulement, cf. baseDepuisCeScript()
  var hostname = window.location.hostname;
  var protocol = window.location.protocol;
  var port     = window.location.port;

  var isElectron    = !hostname || protocol === 'file:';
  var isGithubPages = !isElectron && hostname.includes('github.io');
  var isLocal       = isElectron
                   || hostname === 'localhost'
                   || hostname === '127.0.0.1'
                   || port !== '';

  if (isElectron) {
    var depth = window._ELECTRON_DEPTH || 0;
    var parts = window.location.href
        .replace(/\/[^/]*$/, '')  // supprime le fichier
        .split('/');
    parts.splice(parts.length - depth);
    window.BASE = parts.join('/');
  } else {
    // La base se DEDUIT de l'emplacement reel de ce script, qui vit toujours a
    // <BASE>/src/js/config.js — au lieu d'etre devinee a partir d'un nom de
    // depot ecrit en dur.
    //
    // Pourquoi : repoName valait 'cours-interactifs' en constante, si bien que
    // le site ne pouvait vivre QUE dans un depot portant ce nom. Publie sous
    // n'importe quel autre (un second deploiement, un site partage, un fork
    // renomme), il cherchait ses fichiers sous /cours-interactifs/ alors qu'il
    // etait servi ailleurs : plus une seule page ne se chargeait, sans que rien
    // n'indique pourquoi.
    //
    // Fonctionne pour tous les cas d'un coup : page de projet GitHub Pages
    // (/<depot>/...), page d'utilisateur ou domaine personnalise (racine, base
    // vide), et serveur local. La profondeur de la page appelante n'entre pas en
    // jeu : currentScript.src est toujours absolu, une fois le chemin relatif
    // resolu par le navigateur.
    window.BASE = baseDepuisCeScript();
  }

  window.REPO_NAME        = repoName;
  window.IS_LOCAL         = isLocal;
  window.IS_ELECTRON      = isElectron;
  window.IS_GITHUB_PAGES  = isGithubPages;
  window.IS_IFRAME        = (window.self !== window.parent);
  if (window.STORAGE_PROVIDER === undefined) {
    window.STORAGE_PROVIDER = isElectron ? 'electron' : (isLocal ? 'sqlite' : 'supabase');
  }

  var baseTag = document.querySelector('base');
  if (baseTag) baseTag.href = window.BASE + '/';

  console.log('[Config] BASE="' + window.BASE + '" depth=' + depth + ' isElectron=' + isElectron);

  // ── Remplacement global de window.alert / window.confirm / window.prompt ──
  // Évite la perte de focus dans les iframes Electron après fermeture d'une boîte native.
  // alert() est synchrone sans valeur de retour ; confirm() et prompt() retournent
  // une Promise car la modale DOM est asynchrone. Les appelants doivent utiliser await.
  (function () {
    var activeElRef = null; // stocke le focus actif avant ouverture

    function _makeOverlay() {
      var el = document.createElement('div');
      el.style.cssText =
        'position:fixed;top:0;left:0;right:0;bottom:0;' +
        'background:rgba(0,0,0,0.4);z-index:999999;' +
        'display:flex;align-items:center;justify-content:center;' +
        'font-family:Arial,sans-serif;';
      return el;
    }

    function _makeBox() {
      var el = document.createElement('div');
      el.style.cssText =
        'background:white;border-radius:8px;padding:1.5rem 2rem;' +
        'max-width:420px;width:90%;box-shadow:0 4px 20px rgba(0,0,0,0.2);' +
        'text-align:center;';
      return el;
    }

    function _makeMsg(text) {
      var el = document.createElement('p');
      el.style.cssText = 'margin:0 0 1.2rem 0;font-size:1rem;color:#333;white-space:pre-wrap;';
      el.textContent = text;
      return el;
    }

    function _makeBtn(text, color) {
      var el = document.createElement('button');
      el.textContent = text;
      el.style.cssText =
        'padding:0.5rem 2rem;font-size:1rem;margin:0 0.3rem;' +
        'border:none;border-radius:6px;cursor:pointer;' +
        'color:white;background:' + (color || '#007bff') + ';';
      return el;
    }

    function _restoreFocus() {
      if (activeElRef && typeof activeElRef.focus === 'function') {
        try { activeElRef.focus(); } catch (_) {}
      }
    }

    // ── alert(message) ───────────────────────────────────────────
    var originalAlert = window.alert;
    window.alert = function (message) {
      activeElRef = document.activeElement;
      var overlay = _makeOverlay();
      var box = _makeBox();
      box.appendChild(_makeMsg(message));
      var btn = _makeBtn('OK');
      btn.onclick = function () {
        document.body.removeChild(overlay);
        _restoreFocus();
      };
      box.appendChild(btn);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      btn.focus();
    };

    // ── confirm(message) → Promise<boolean> ──────────────────────
    // retours : true (OK) / false (Annuler)
    var originalConfirm = window.confirm;
    window.confirm = function (message) {
      activeElRef = document.activeElement;
      return new Promise(function (resolve) {
        var overlay = _makeOverlay();
        var box = _makeBox();
        box.appendChild(_makeMsg(message));

        var btnOk = _makeBtn('OK', '#007bff');
        btnOk.style.marginRight = '0.5rem';
        btnOk.onclick = function () {
          document.body.removeChild(overlay);
          _restoreFocus();
          resolve(true);
        };

        var btnCancel = _makeBtn('Annuler', '#6c757d');
        btnCancel.onclick = function () {
          document.body.removeChild(overlay);
          _restoreFocus();
          resolve(false);
        };

        var btnContainer = document.createElement('div');
        btnContainer.style.cssText = 'display:flex;justify-content:center;gap:0.5rem;';
        btnContainer.appendChild(btnOk);
        btnContainer.appendChild(btnCancel);

        box.appendChild(btnContainer);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        btnOk.focus();
      });
    };

    // ── prompt(message, defaultValue?) → Promise<string|null> ────
    // retours : string (OK) / null (Annuler)
    var originalPrompt = window.prompt;
    window.prompt = function (message, defaultValue) {
      activeElRef = document.activeElement;
      return new Promise(function (resolve) {
        var overlay = _makeOverlay();
        var box = _makeBox();
        box.appendChild(_makeMsg(message));

        var input = document.createElement('input');
        input.type = 'text';
        input.value = defaultValue || '';
        input.style.cssText =
          'width:100%;padding:0.6rem;margin-bottom:1rem;' +
          'border:2px solid #ddd;border-radius:6px;font-size:1rem;' +
          'box-sizing:border-box;';
        box.appendChild(input);

        var btnOk = _makeBtn('OK', '#007bff');
        btnOk.style.marginRight = '0.5rem';
        btnOk.onclick = function () {
          document.body.removeChild(overlay);
          _restoreFocus();
          resolve(input.value);
        };

        var btnCancel = _makeBtn('Annuler', '#6c757d');
        btnCancel.onclick = function () {
          document.body.removeChild(overlay);
          _restoreFocus();
          resolve(null);
        };

        var btnContainer = document.createElement('div');
        btnContainer.style.cssText = 'display:flex;justify-content:center;gap:0.5rem;';
        btnContainer.appendChild(btnOk);
        btnContainer.appendChild(btnCancel);

        // Entrée → valider
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') btnOk.click();
          if (e.key === 'Escape') btnCancel.click();
        });

        box.appendChild(btnContainer);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        input.focus();
        input.select();
      });
    };
  })();
})();
