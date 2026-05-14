# Rapport d'Audit Exhaustif — Tous les fichiers, tous les problèmes

> Audit systématique ligne par ligne de tous les fichiers HTML et JS du projet.
> Format : FICHIER | LIGNE | PROBLÈME | AVANT → APRÈS

---

## FICHIER: index.html

### Problème 1
**LIGNE:** 8-9
**PROBLÈME:** Scripts chargés avec chemin relatif nu sans `_base` inline. Si config.js ne se charge pas (ex: redirection 404 → index dans un sous-chemin), `BASE` est undefined et toutes les redirections échouent avec `undefined/path`.
**AVANT:**
```html
<script src="src/js/config.js"></script>
<script src="src/js/parcours.js"></script>
```
**APRÈS:**
```html
<script>
  var _base = (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost')
    ? '' : '/cours-interactifs';
  document.write('<script src="' + _base + '/src/js/config.js"><\/script>');
  document.write('<script src="' + _base + '/src/js/parcours.js"><\/script>');
</script>
```

---

## FICHIER: src/html/teacher-login.html

### Problème 0 (RÉSOLU)
**LIGNE:** 8 (anciennement)
**PROBLÈME:** `<base href="/">` présent.
**STATUT:** ✅ Déjà corrigé par l'utilisateur. Le fichier utilise maintenant `_base` + `document.write`.

---

## FICHIER: src/html/teacher.html

### Problème 1
**LIGNE:** 9
**PROBLÈME:** `<base href="/">` présent. Tous les chemins relatifs sont résolus depuis `/` au lieu de `/cours-interactifs/`.
**AVANT:** `<base href="/">`
**APRÈS:** (supprimer la ligne)

### Problème 2
**LIGNES:** 10, 11, 12, 15, 16, 17, 107, 108, 115, 116, 119, 122, 123, 124, 125, 126, 127, 128
**PROBLÈME:** Tous les scripts/CSS chargés avec chemin relatif nu sans `_base`. Avec `<base href="/">`, ces chemins résolvent vers `/src/js/config.js` au lieu de `/cours-interactifs/src/js/config.js`.
**AVANT (exemples):**
```html
<script src="src/js/config.js"></script>
<link rel="stylesheet" href="src/assets/css/style.css">
<script src="src/js/parcours.js"></script>
<script src="src/js/storage.js"></script>
<script src="src/js/main.js"></script>
<script src="src/js/correctionModal.js"></script>
```
**APRÈS:** Remplacer TOUS les `<script src="src/...">` et `<link href="src/...">` par `document.write('...' + _base + '/src/...')`. Ajouter le bloc `_base` en tête.
```html
<script>
  var _base = (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost')
    ? '' : '/cours-interactifs';
  document.write('<script src="' + _base + '/src/js/config.js"><\/script>');
  document.write('<link rel="stylesheet" href="' + _base + '/src/assets/css/style.css">');
  document.write('<link rel="stylesheet" href="' + _base + '/src/assets/css/teacher.css">');
  document.write('<script src="' + _base + '/src/js/parcours.js"><\/script>');
  // ... idem pour tous les scripts JS
</script>
```

---

## FICHIER: parcours/src/chapter_template.html

### Problème 1
**LIGNE:** 82
**PROBLÈME:** Redirection vers `/parcours/src/user.html` inexistant. Le fichier `user.html` est dans `src/html/user.html`.
**AVANT:** `window.location.href = (window.BASE || '') + '/parcours/src/user.html';`
**APRÈS:** `window.location.href = (window.BASE || '') + '/src/html/user.html?parcours=' + parcoursSlug;`

### Problème 2
**LIGNE:** 111
**PROBLÈME:** Même problème — lien "Retour au menu" redirige vers `/parcours/src/user.html`.
**AVANT:** `window.location.href = (window.BASE || '') + '/parcours/src/user.html?parcours=' + parcoursSlug;`
**APRÈS:** `window.location.href = (window.BASE || '') + '/src/html/user.html?parcours=' + parcoursSlug;`

---

## FICHIER: tools_xlsx/templates/chapter_template.html

### Problème 1
**LIGNE:** 7
**PROBLÈME:** `<base href="/">` présent.
**AVANT:** `<base href="/">`
**APRÈS:** (supprimer)

### Problème 2
**LIGNE:** 87
**PROBLÈME:** Redirection vers `/parcours/src/user.html` inexistant.
**AVANT:** `window.location.href = (window.BASE || '') + '/parcours/src/user.html';`
**APRÈS:** `window.location.href = (window.BASE || '') + '/src/html/user.html?parcours=' + parcoursSlug;`

### Problème 3
**LIGNE:** 120
**PROBLÈME:** Même problème — lien "Retour au menu".
**AVANT:** `window.location.href = (window.BASE || '') + '/parcours/src/user.html?parcours=' + parcoursSlug;`
**APRÈS:** `window.location.href = (window.BASE || '') + '/src/html/user.html?parcours=' + parcoursSlug;`

---

## FICHIER: src/js/index.js

### Problème 1
**LIGNE:** 62
**PROBLÈME:** `Parcours.homeUrl` construit un chemin doublement préfixé. `Parcours.homeUrl` vaut `BASE + '/parcours/src/slug/'`, donc l'URL finale est `BASE/parcours/src/slug/src/chapter_template.html` — chemin inexistant.
**AVANT:** 
```js
window.location.href = Parcours.homeUrl + 'src/chapter_template.html?parcours=' + Parcours.slug + '&chapitre=' + chapterId + '&t=' + Date.now();
```
**APRÈS:**
```js
window.location.href = (window.BASE || '') + '/parcours/src/chapter_template.html?parcours=' + Parcours.slug + '&chapitre=' + chapterId + '&t=' + Date.now();
```

---

## FICHIER: src/js/dataStorage.js

### Problème 1
**LIGNE:** 403
**PROBLÈME:** Chemin absolu fixe sans `window.BASE`. Sur localhost, `Parcours.repoName` = `'cours-interactifs'` mais le bon préfixe devrait être vide. Sur GitHub Pages, le chemin `/cours-interactifs/teacher/` n'existe pas.
**AVANT:**
```js
window.location.href = '/' + Parcours.repoName + '/teacher/';
```
**APRÈS:**
```js
window.location.href = (window.BASE || '') + '/src/html/teacher-login.html';
```

---

## FICHIER: src/js/chapterInit.js

### Problème 1
**LIGNE:** 102
**PROBLÈME:** Chemin relatif `../html/login.html`. Ce fichier est chargé depuis `parcours/src/chapter_template.html`, donc le chemin relatif remonte à `parcours/src/../html/` = `parcours/html/login.html` — inexistant. De plus, en iframe (vue formateur), le chemin relatif est résolu par rapport à la page parente.
**AVANT:**
```js
const loginUrl = window.Parcours ? Parcours.loginUrl : '../html/login.html';
```
**APRÈS:**
```js
const loginUrl = window.Parcours ? Parcours.loginUrl : (window.BASE || '') + '/src/html/login.html';
```

### Problème 2
**LIGNE:** 114
**PROBLÈME:** Chemin relatif `../html/login.html` pour la déconnexion. Même problème.
**AVANT:**
```js
window.location.href = '../html/login.html';
```
**APRÈS:**
```js
window.location.href = (window.BASE || '') + '/src/html/login.html';
```

---

## FICHIER: src/js/teacherSubmissions.js

### Problème 1
**LIGNE:** 555
**PROBLÈME:** Chemin relatif `../chapter_template.html` pour l'iframe de vue formateur. Ce code est exécuté depuis `src/html/teacher.html`, donc `../chapter_template.html` = `src/chapter_template.html` au lieu de `parcours/src/chapter_template.html`.
**AVANT:**
```js
const chapterUrl = `../chapter_template.html?parcours=${slug}&chapitre=${chapterId}&teacher_view=true&student_id=${studentId}&t=${Date.now()}`;
```
**APRÈS:**
```js
const chapterUrl = (window.BASE || '') + `/parcours/src/chapter_template.html?parcours=${slug}&chapitre=${chapterId}&teacher_view=true&student_id=${studentId}&t=${Date.now()}`;
```

---

## Fichiers vérifiés et ✅ OK (aucun problème de chemin)

### HTML
| Fichier | Statut |
|---------|--------|
| `404.html` | ✅ `_base` inline OK, `document.write` OK, `window.BASE` utilisé pour tous les `location.replace` |
| `src/html/login.html` | ✅ `_base` inline OK, `document.write` OK, `fetch((window.BASE || ''))` OK |
| `src/html/user.html` | ✅ `_base` inline OK, `document.write` OK, `fetch((window.BASE || ''))` OK |
| `src/html/teacher-login.html` | ✅ Déjà corrigé, `_base` inline + `document.write` OK |

### JS
| Fichier | Vérification |
|---------|-------------|
| `src/js/config.js` | ✅ Définit `window.BASE` correctement |
| `src/js/parcours.js` | ✅ Utilise `window.BASE` partout, `window.REPO_NAME` comme fallback |
| `src/js/storage.js` | ✅ `storagePath()` utilise `window.BASE` |
| `src/js/cours-loader.js` | ✅ `fetch((window.BASE || '') + '/parcours/cours.json')` |
| `src/js/chapitre.js` | ✅ `fetch((window.BASE || ''))`, `storage` sans URL hardcodée |
| `src/js/main.js` | ✅ Pas de fetch ni location, seulement des helpers DOM |
| `src/js/progressManager.js` | ✅ Pas de fetch/URL hardcodée |
| `src/js/teacherDashboard.js` | ✅ `fetch((window.BASE || ''))` OK |
| `src/js/teacherChapters.js` | ✅ Pas de URL directe |
| `src/js/teacherUsers.js` | ✅ Pas de URL directe |
| `src/js/teacherStudents.js` | ✅ Pas de URL directe |
| `src/js/teacherStats.js` | ✅ Pas de URL directe |
| `src/js/correctionModal.js` | ✅ `fetch((window.BASE || ''))` OK |
| `src/js/studentCorrectionModal.js` | ✅ Hérite de CorrectionModal, même logique |
| `src/js/getChapterBadgeState.js` | ✅ Pas de URL directe |
| `src/js/chapter/chapterUI.js` | ✅ Pas de URL directe |
| `src/js/chapter/chapterSubmission.js` | ✅ Pas de URL directe |
| `src/js/chapter/chapterBilan.js` | ✅ Pas de URL directe |
| `src/js/core/utils.js` | ✅ Pas de URL directe |
| `src/js/core/chapterRenderer.js` | ✅ Pas de URL directe |
| `src/js/core/chapterRepository.js` | ✅ Pas de URL directe |
| `src/js/core/chapterSession.js` | ✅ Pas de URL directe |
| `src/js/core/chapterState.js` | ✅ Pas de URL directe |
| `src/js/core/getExamContext.js` | ✅ Pas de URL directe |
| `src/js/studentWorkEditor.js` | ✅ Pas de URL directe |

---

## Tableau récapitulatif — 10 problèmes à corriger

| # | Fichier | Ligne | Problème | Gravité |
|---|---------|-------|----------|---------|
| 1 | `src/html/teacher.html` | 9 | `<base href="/">` fixe → **page blanche en prod** | 🔴 URGENT |
| 2 | `src/html/teacher.html` | 10-17, 107-128 | 20+ scripts/CSS avec chemins relatifs nus → **page blanche en prod** | 🔴 URGENT |
| 3 | `parcours/src/chapter_template.html` | 82 | Redirection vers `/parcours/src/user.html` → 404 | ⚠️ HAUTE |
| 4 | `parcours/src/chapter_template.html` | 111 | "Retour" vers `/parcours/src/user.html` → 404 | ⚠️ HAUTE |
| 5 | `src/js/index.js` | 62 | Navigation chapitre → chemin doublement préfixé → 404 | ⚠️ HAUTE |
| 6 | `src/js/dataStorage.js` | 403 | Logout prof → chemin fixe sans BASE | ⚠️ HAUTE |
| 7 | `src/js/chapterInit.js` | 102 | Redirection login → `../html/login.html` (chemin relatif) | ⚠️ HAUTE |
| 8 | `src/js/chapterInit.js` | 114 | Déconnexion → `../html/login.html` (chemin relatif) | ⚠️ HAUTE |
| 9 | `src/js/teacherSubmissions.js` | 555 | URL iframe vue formateur → `../chapter_template.html` (chemin relatif) | ⚠️ HAUTE |
| 10 | `tools_xlsx/templates/chapter_template.html` | 7, 87, 120 | Template source : `<base href="/">` + mauvais chemins | ⚠️ MOYENNE |
| 11 | `index.html` | 8-9 | Pas de `_base` inline (robustesse) | ⚠️ MOYENNE |