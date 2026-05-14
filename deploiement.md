
## 🚀 Démarrage rapide

### Prérequis
- Node.js 16+ et npm
- Python 3.9+ avec `pip install openpyxl markdown`

### Installation

```bash
git clone https://github.com/scse972/cours-interactifs.git
cd cours-interactifs
npm install
```

### Développement local

```bash
npm run dev
```

Le serveur démarre sur `http://localhost:8000`.

Pour simuler GitHub Pages (sous-chemin `/cours-interactifs/`) :
```
http://localhost:8000/cours-interactifs/parcours/src/nsi-term?token=STU001
```

---

## ➕ Créer un nouveau parcours

La création d'un parcours se fait en 3 étapes.

### Étape 1 — Préparer le fichier Excel

Le fichier Excel source doit suivre la structure attendue par le générateur (une feuille par chapitre, colonnes définies). Utilisez `tools_xlsx/coursexportXSPRO.xlsx` comme modèle.

### Étape 2 — Générer les chapitres

Depuis la racine du repo :

```bash
python tools_xlsx/generate_chapters.py tools_xlsx/mon-cours.xlsx --parcours math-2de
```

Cela crée automatiquement :
```
parcours/src/math-2de/chapters_index.json
parcours/src/math-2de/chapitre1.html
parcours/src/math-2de/chapitre2.html
...
```

Et met à jour **`parcours/parcours.json`** en ajoutant l'entrée `math-2de` si elle n'existe pas encore :
```json
[
  { "slug": "nsi-term",  "label": "NSI — Terminale" },
  { "slug": "math-2de",  "label": "Math 2De" }
]
```

> Si le label généré automatiquement ne convient pas (ex: `Math 2De` au lieu de `Mathématiques — Seconde`), éditez `parcours/parcours.json` manuellement.

> **Sans `--parcours`**, les fichiers sont générés dans `tools_xlsx/generated/` (mode legacy) et `parcours.json` n'est pas modifié.

### Résultat

Les élèves de ce parcours accèdent via :
```
https://scse972.github.io/cours-interactifs/parcours/src/math-2de?token=STU001
```

Le tableau de bord formateur détecte automatiquement le nouveau parcours au prochain chargement (via `parcours/parcours.json`).

---

## 🔗 URLs

| Qui | URL | Résultat |
|-----|-----|----------|
| Élève avec lien direct | `.../parcours/src/nsi-term?token=STU001` | Connexion automatique |
| Élève sans token | `.../parcours/src/nsi-term` | Page de login du parcours |
| Formateur | `.../teacher/` | Dashboard (mot de passe requis) |
| Racine | `.../` | Page de routing invisible |

---

## 🗄️ Base de données Supabase

### Table `app_data`

```sql
CREATE TABLE app_data (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### Convention de nommage des clés

| Portée | Clé Supabase | Exemple |
|--------|-------------|---------|
| Progression élève | `{slug}:{token}:student_{token}_progress` | `nsi-term:STU001:student_STU001_progress` |
| Liste élèves | `{slug}:teacher:users_list` | `nsi-term:teacher:users_list` |
| Config chapitres | `{slug}:config:chapter_config` | `nsi-term:config:chapter_config` |

Chaque parcours est **totalement isolé** en base — aucune clé n'est partagée entre parcours.

---

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


```bash
git config --global user.email "scse972@gmail.com"
git config --global user.name "SCSE972"

git add .
git commit -m "Description des changements"
git push origin main
```

---
