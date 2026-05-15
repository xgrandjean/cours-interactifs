# Déploiement

Le site fonctionne dans deux environnements, avec un backend différent dans chacun :

| Environnement | Backend | Config chargée |
|---------------|---------|----------------|
| Local (développement) | Express + SQLite | `config.json` |
| Production (GitHub Pages) | Supabase | `config.supabase.json` |

La bascule est automatique : `window.IS_GITHUB_PAGES` est détecté au démarrage et
le bon provider est sélectionné sans aucune intervention manuelle.

---

## 1. Supabase (production)

### Créer les tables

Dans l'éditeur SQL de votre projet Supabase (onglet **SQL Editor**) :

```sql
-- Données utilisateur
CREATE TABLE IF NOT EXISTS app_data (
    key        TEXT PRIMARY KEY,
    value      JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Référentiel parcours (cours.json)
CREATE TABLE IF NOT EXISTS parcours_data (
    key        TEXT PRIMARY KEY,
    value      JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Mettre à jour config.supabase.json

```json
{
  "storage": "supabase",
  "supabase": {
    "url": "https://<votre-projet>.supabase.co",
    "anonKey": "<votre-anon-key>"
  }
}
```

L'`anonKey` se trouve dans Supabase → **Project Settings → API → Project API keys**.

### Peupler parcours_data depuis SQLite

Si vous avez des données locales à monter en production :

```bash
node sync_sqlite_to_supabase.js
```

---

## 2. GitHub Pages (mise en ligne)

### Première mise en ligne

```bash
git add .
git commit -m "deploy"
git push origin main
```

Activer GitHub Pages dans **Settings → Pages → Source : main / root** (ou le dossier
configuré). Le site sera accessible à `https://<utilisateur>.github.io/<repo>/`.

### Mises à jour suivantes

```bash
git add .
git commit -m "votre message"
git push origin main
```

GitHub Pages se met à jour automatiquement après chaque push.

> **Note :** `window.IS_GITHUB_PAGES` doit être défini à `true` dans votre `config.js`
> ou équivalent pour que le provider Supabase soit sélectionné automatiquement.

---

## 3. Mode local (développement SQLite)

### Prérequis

```bash
npm install
```

### Démarrer le serveur

```bash
node server.js
```

Le serveur démarre sur `http://localhost:3000`. Les tables `app_data` et
`parcours_data` sont créées automatiquement dans `data.db` au premier démarrage.

### Récupérer les données de production

Pour travailler avec les données Supabase en local :

```bash
node sync_supabase_to_sqlite.js
```

---

## 4. Synchronisation des données

| Commande | Direction |
|----------|-----------|
| `node sync_sqlite_to_supabase.js` | Local → Production |
| `node sync_supabase_to_sqlite.js` | Production → Local |

Les deux tables (`app_data` et `parcours_data`) sont synchronisées dans les deux cas.

---

## 5. cours.json (référentiel parcours)

Ce fichier est la source de données des parcours et chapitres affichés aux apprenants.

**Ordre de résolution au chargement :**
1. Fichier statique servi par le serveur web (`/parcours/cours.json`) — prioritaire
2. Base de données (`parcours_data`, clé `cours.json`) — si le fichier statique est absent

En production sur GitHub Pages, le fichier statique est toujours présent et utilisé.
La table `parcours_data` sert de fallback en développement ou si le fichier statique
n'est pas déployé.

Pour mettre à jour le référentiel, utilisez l'outil d'administration qui écrit
directement dans `parcours_data`. Le fichier statique peut ensuite être regénéré
et committé si nécessaire.






### Étape 1 — Préparer le fichier Excel

Le fichier Excel source doit suivre la structure attendue par le générateur (une feuille par chapitre, colonnes définies). Utilisez `tools_xlsx/coursexportXSPRO.xlsx` comme modèle.

### Étape 2 — Générer les chapitres

Depuis la racine du repo :

```bash
python tools_xlsx/generate_chapters.py tools_xlsx/mon-cours.xlsx --parcours math-2de
```

### Résultat

Les élèves de ce parcours accèdent via :
```
https://scse972.github.io/cours-interactifs/parcours/src/math-2de?token=STU001
```

## 👨‍🎓 Guide utilisateur

### Pour les apprenants

1. Recevez votre lien direct de la part du formateur (ex: `.../parcours/src/nsi-term?token=STU001`)
2. Si vous n'avez pas de lien direct, accédez à `.../parcours/src/nsi-term` et saisissez votre jeton
3. Réalisez les QCM chapitre par chapitre (≥ 80 % pour valider et passer au suivant)
4. Déconnectez-vous via le bouton "Se déconnecter"

### Pour les formateurs

1. Accédez à `https://scse972.github.io/cours-interactifs/teacher/`
2. Saisissez le mot de passe formateur (défaut : `formateur2026`)
3. Sélectionnez un parcours via les onglets
4. Consultez les statistiques, corrigez les réponses ouvertes, configurez les chapitres
5. Gérez les utilisateurs de chaque parcours (import/export CSV)
6. Exportez les données en JSON

**Changer le mot de passe formateur** (dans la console du navigateur) :
```javascript
localStorage.setItem('teacher:password', 'nouveau-mot-de-passe')
```

---

## 🔐 Notes de sécurité

| Élément | Stockage | Notes |
|---------|----------|-------|
| Token élève | `sessionStorage` | Effacé à la fermeture du navigateur |
| Mot de passe formateur | `localStorage` | Modifiable via console |
| Jeton de récupération | Code source | `YXORP@97240` — usage formateur uniquement |
| Clé Supabase | Code source | Clé anon publique, RLS activé |

---

## 🛠️ Stack technique

| Composant | Technologie |
|-----------|-------------|
| Frontend | HTML5, CSS3, JavaScript ES2020+ |
| Backend | Supabase (PostgreSQL REST API) |
| Stockage local | localStorage (cache + queue offline) |
| Hébergement | GitHub Pages |
| Génération | Python 3 + openpyxl + markdown |
| Serveur local | http-server (Node.js) |

---

git add .
git commit -m "Description des changements"
git push origin main
```

---
