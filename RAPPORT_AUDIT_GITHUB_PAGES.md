# Rapport d'Audit — Déploiement GitHub Pages

## Résumé

| Fichier | Problèmes | Gravité |
|---------|-----------|---------|
| `404.html` | ✅ OK | — |
| `index.html` | ❌ Pas de `_base` inline, chemins relatifs nus sans `_base` | **HAUTE** |
| `src/html/login.html` | ✅ OK | — |
| `src/html/teacher-login.html` | ❌ `<base href="/">` fixe + tous les chemins relatifs brisés | **CRITIQUE** |
| `src/html/teacher.html` | ❌ `<base href="/">` fixe + tous les chemins relatifs brisés | **CRITIQUE** |
| `src/html/user.html` | ✅ OK | — |
| `parcours/src/chapter_template.html` | ❌ Ligne 82,111 : URL `/parcours/src/user.html` inexistante | **HAUTE** |
| `tools_xlsx/templates/chapter_template.html` | ❌ `<base href="/">` fixe + URL `/parcours/src/user.html` inexistante | **HAUTE** |
| `src/js/index.js` | ❌ Ligne 62 : `Parcours.homeUrl` construit un mauvais chemin | **HAUTE** |

---

## 1. Fichier: `index.html` — ⚠️ PROBLÈMES

### Problème 1.1 — Pas de `_base` inline (lignes 8-9)
**Code actuel fautif :**
```html
<script src="src/js/config.js"></script>
<script src="src/js/parcours.js"></script>
```
**Code corrigé :**
```html
<script>
  var _base = (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost')
    ? '' : '/cours-interactifs';
  document.write('<script src="' + _base + '/src/js/config.js"><\/script>');
  document.write('<script src="' + _base + '/src/js/parcours.js"><\/script>');
</script>
```
**Pourquoi ça casse :** `index.html` est servi à la racine `https://scse972.github.io/cours-interactifs/`. Le chemin relatif `src/js/config.js` est résolu correctement par le navigateur en `/cours-interactifs/src/js/config.js`. **Cependant**, si GitHub Pages sert `index.html` via le fallback 404 (SPA), l'URL de la barre d'adresse peut être différente → le chemin relatif devient invalide. De plus, en cas d'échec de chargement de `config.js`, la variable `BASE` n'est pas définie et les `window.location.replace(BASE + ...)` échouent avec `undefined`.

---

## 2. Fichier: `src/html/teacher-login.html` — 🔴 PROBLÈMES CRITIQUES

### Problème 2.1 — `<base href="/">` fixe (ligne 8)
**Code actuel fautif :**
```html
<base href="/">
```
**Tous les chemins relatifs ci-dessous sont alors résolus par rapport à `/`** :
```html
<script src="src/js/config.js"></script>       <!-- Résolu : /src/js/config.js (FAUX) -->
<link rel="stylesheet" href="src/assets/css/style.css">
<script src="src/js/parcours.js"></script>
<script src="src/js/storage.js"></script>
<script src="src/js/main.js"></script>
```

**Code corrigé :**
```html
<!-- SUPPRIMER complètement la balise <base href="/"> -->
<!-- Remplacer tous les chemins par document.write avec _base : -->
<script>
  var _base = (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost')
    ? '' : '/cours-interactifs';
  document.write('<script src="' + _base + '/src/js/config.js"><\/script>');
  document.write('<link rel="stylesheet" href="' + _base + '/src/assets/css/style.css">');
  document.write('<script src="' + _base + '/src/js/parcours.js"><\/script>');
  document.write('<script src="' + _base + '/src/js/storage.js"><\/script>');
  document.write('<script src="' + _base + '/src/js/main.js"><\/script>');
</script>
```

**Pourquoi ça casse en production :** Avec `<base href="/">`, le navigateur résout les chemins relatifs à partir de la racine du domaine : `/src/js/config.js` au lieu de `/cours-interactifs/src/js/config.js`. Tous les scripts et CSS sont introuvables → page blanche en production.

---

## 3. Fichier: `src/html/teacher.html` — 🔴 PROBLÈMES CRITIQUES

### Problème 3.1 — `<base href="/">` fixe (ligne 9) + chemins relatifs (lignes 10-17)
**Code actuel fautif :**
```html
<base href="/">
<script src="src/js/config.js"></script>
<link rel="stylesheet" href="src/assets/css/style.css">
<link rel="stylesheet" href="src/assets/css/teacher.css">
<script src="src/js/parcours.js"></script>
... etc (lignes 15-17, 107-108, 115-128)
```

**Code corrigé :** Même pattern que pour teacher-login.html — supprimer `<base href="/">`, utiliser `document.write` avec `_base` pour tous les scripts/CSS.

### Problème 3.2 — Sélecteur de parcours (ligne 168)
**Code actuel :**
```js
window.location.href = window.location.pathname + '?parcours=' + select.value;
```
**Code corrigé :**
```js
window.location.href = (window.BASE || '') + '/src/html/teacher.html?parcours=' + select.value;
```
**Pourquoi :** `window.location.pathname` retourne le chemin complet (ex: `/cours-interactifs/src/html/teacher.html`), donc ça fonctionne en pratique. Mais si le formateur navigue via un sous-chemin inattendu, le pathname pourrait être différent. Plus sûr d'utiliser un chemin absolu préfixé par `window.BASE`.

---

## 4. Fichier: `parcours/src/chapter_template.html` — ⚠️ PROBLÈMES

### Problème 4.1 — URL de redirection invalide (lignes 82 et 111)
**Code actuel fautif :**
```js
// Ligne 82 :
window.location.href = (window.BASE || '') + '/parcours/src/user.html';
// Ligne 111 :
window.location.href = (window.BASE || '') + '/parcours/src/user.html?parcours=' + parcoursSlug;
```
**Code corrigé :**
```js
// Ligne 82 :
window.location.href = (window.BASE || '') + '/src/html/user.html?parcours=' + parcoursSlug;
// Ligne 111 :
window.location.href = (window.BASE || '') + '/src/html/user.html?parcours=' + parcoursSlug;
```
**Pourquoi ça casse :** Le fichier `user.html` se trouve dans `src/html/user.html`, pas dans `parcours/src/user.html`. La redirection mène vers une page 404.

---

## 5. Fichier: `tools_xlsx/templates/chapter_template.html` — ⚠️ PROBLÈMES

### Problème 5.1 — `<base href="/">` fixe (ligne 7)
**Code actuel fautif :**
```html
<base href="/">
```
Ce fichier est un template pour la génération, mais il a les mêmes problèmes :

### Problème 5.2 — URL invalide (lignes 87 et 120)
**Code actuel fautif :**
```js
window.location.href = (window.BASE || '') + '/parcours/src/user.html';
```
**Code corrigé :**
```js
window.location.href = (window.BASE || '') + '/src/html/user.html?parcours=' + parcoursSlug;
```

**Pourquoi :** Même bug que le fichier de production — `user.html` est à `src/html/user.html`, pas à `parcours/src/user.html`.

---

## 6. Fichier: `src/js/index.js` — ⚠️ PROBLÈME

### Problème 6.1 — `Parcours.homeUrl` construit un mauvais chemin (ligne 62)

**Code actuel fautif :**
```js
window.navigateToChapter = function(chapterId) {
    window.location.href = Parcours.homeUrl + 'src/chapter_template.html?parcours=' + Parcours.slug + '&chapitre=' + chapterId + '&t=' + Date.now();
};
```

Rappel : `Parcours.homeUrl` est défini dans `parcours.js` ligne 227 comme :
```js
homeUrl: parcoursBase(slug),
```
qui est :
```js
function parcoursBase(slug) {
    return BASE + '/' + SUBFOLDER + '/src/' + slug + '/';
}
```
Donc l'URL finale serait :
```
/cours-interactifs/parcours/src/nsi-term/src/chapter_template.html?...  (FAUX)
```

**Code corrigé :**
```js
window.navigateToChapter = function(chapterId) {
    window.location.href = (window.BASE || '') + '/parcours/src/chapter_template.html?parcours=' + Parcours.slug + '&chapitre=' + chapterId + '&t=' + Date.now();
};
```

**Pourquoi ça casse :** Le chemin construit est doublement préfixé (`/parcours/src/nsi-term/src/chapter_template.html`), menant vers une page inexistante. Le chemin correct est directement `BASE/parcours/src/chapter_template.html?parcours=...&chapitre=...`.

---

## 7. Vérification structure du repo

| Élément | Statut | Notes |
|---------|--------|-------|
| `404.html` à la racine | ✅ OK | Présent et fonctionnel |
| `index.html` à la racine | ✅ OK | Présent |
| `cours.json` accessible à `BASE + '/parcours/cours.json'` | ✅ OK | Accessible |

---

## Tableau récapitulatif des corrections

| # | Fichier | Ligne(s) | Correctif |
|---|---------|----------|-----------|
| 1 | `index.html` | 8-9 | Ajouter bloc `_base` inline + `document.write` |
| 2 | `src/html/teacher-login.html` | 8-14 | Supprimer `<base href="/">` + remplacer tous les chemins par `document.write(_base + ...)` |
| 3 | `src/html/teacher.html` | 9-17, 107-128, 168 | Supprimer `<base href="/">` + remplacer tous les chemins par `document.write(_base + ...)` + corriger ligne 168 |
| 4 | `parcours/src/chapter_template.html` | 82, 111 | Remplacer `/parcours/src/user.html` par `/src/html/user.html?parcours=...` |
| 5 | `tools_xlsx/templates/chapter_template.html` | 7, 87, 120 | Supprimer `<base href="/">` + corriger URL user.html |
| 6 | `src/js/index.js` | 62 | Remplacer `Parcours.homeUrl + 'src/chapter_template.html?...'` par `(window.BASE || '') + '/parcours/src/chapter_template.html?...'` |

---

## Priority d'implémentation

1. **🔴 URGENT** — `src/html/teacher-login.html` : page blanche en production
2. **🔴 URGENT** — `src/html/teacher.html` : page blanche en production
3. **⚠️ HAUTE** — `parcours/src/chapter_template.html` : redirections invalides vers user.html
4. **⚠️ HAUTE** — `src/js/index.js` : navigation chapitre invalide
5. **⚠️ MOYENNE** — `index.html` : pas de `_base` inline (robustesse)
6. **⚠️ MOYENNE** — `tools_xlsx/templates/chapter_template.html` : template source corrompu