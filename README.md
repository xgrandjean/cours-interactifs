# 🎓 Cours Interactifs

Plateforme pédagogique interactive multi-parcours avec QCM, suivi de progression en temps réel et tableau de bord formateur.

---

## 🌟 Aperçu

**Cours Interactifs** est une application web statique (GitHub Pages) conçue pour :
- Diffuser plusieurs **parcours pédagogiques** totalement isolés les uns des autres
- **Suivre la progression** individuelle de chaque apprenant par parcours
- Offrir un **tableau de bord formateur** multi-parcours avec statistiques, correction et gestion des utilisateurs
- Fonctionner **hors-ligne** grâce à un cache localStorage et une queue de synchronisation Supabase
- Être déployée sur **GitHub Pages** avec gestion des redirections SPA

---

## 🎯 Fonctionnalités

### 🔐 Authentification multi-parcours
- Jetons uniques par apprenant, **isolés par parcours** (`STU001` dans `nsi-term` ≠ `STU001` dans `math-2de`)
- Connexion via URL directe `?token=STU001` ou formulaire de login
- Données cloisonnées : progression, users_list et config sont indépendants par parcours
- Jeton de récupération universel pour les formateurs

### 📚 Parcours indépendants
- Chaque parcours vit dans `parcours/src/{slug}/` avec ses propres chapitres
- Un élève ne voit **jamais** les autres parcours — aucune liste publique
- URL pattern : `https://scse972.github.io/cours-interactifs/parcours/src/{slug}?token=STU001`

### 📊 QCM interactifs et progression
- Types de questions : choix unique, choix multiple, question ouverte, question courte, sélection
- Validation par score (≥ 80 % pour débloquer le chapitre suivant)
- Feedback immédiat et suivi des tentatives par question
- Mode examen et dates limites configurables par chapitre

### 👨‍🏫 Tableau de bord formateur
- Accès protégé par mot de passe sur `/cours-interactifs/teacher/`
- Sélection du parcours par onglets — liste chargée depuis `parcours/parcours.json`
- Statistiques globales, suivi individuel, correction des réponses ouvertes
- Configuration des chapitres (verrouillage, mode examen, date limite)
- Gestion des utilisateurs : ajout, modification, suppression, import/export CSV

### ☁️ Stockage hybride — Supabase + hors-ligne
- Backend Supabase avec table clé-valeur `app_data`
- Cache localStorage pour un accès immédiat
- Queue de synchronisation automatique pour les modifications hors-ligne
- **Préfixage des clés** par parcours et token : `{slug}:{token}:{key}`

---

## 📁 Structure du projet

```
cours-interactifs/
│
├── index.html                          # Routeur technique (redirection GitHub Pages → parcours)
├── 404.html                            # Gestion 404 GitHub Pages (redirection SPA)
├── README.md
├── package.json
│
├── src/                                # Code source partagé (tous parcours)
│   ├── assets/css/
│   │   ├── style.css
│   │   ├── index.css
│   │   ├── chapitre.css
│   │   ├── teacher.css
│   │   └── chapter-bilan.css
│   │
│   ├── js/
│   │   ├── parcours.js                 # ⚡ Module multi-parcours (CHARGÉ EN PREMIER)
│   │   ├── storage.js                  # Supabase + cache localStorage + queue offline
│   │   ├── dataStorage.js              # Auth, progression, UserManager (scopé par parcours)
│   │   ├── main.js                     # Utilitaires DOM, APP_BASE_URL
│   │   ├── index.js                    # Grille des chapitres (page d'accueil du parcours)
│   │   ├── chapitre.js                 # Logique page chapitre
│   │   ├── chapterInit.js              # Initialisation page chapitre (auth, vue formateur)
│   │   ├── correctionModal.js          # Modale de correction formateur
│   │   ├── studentCorrectionModal.js
│   │   ├── progressManager.js
│   │   └── core/
│   │       ├── chapterRepository.js    # Accès données chapitre (scopé par parcours)
│   │       ├── chapterRenderer.js
│   │       ├── chapterState.js
│   │       └── getExamContext.js
│   │
│   └── html/
│       └── login.html                  # Page de connexion apprenant (commune à tous parcours)
│       └── teacher-login.html          # Page de connexion formateur (commune à tous parcours)
│       └── teacher.html                # Page de gestion d'un parcours particuliers
│
├── parcours/
│   ├── parcours.json                   # Registre des parcours (slug + label)
│   └── src/                            # Un dossier par parcours
│       └── nsi-term/
│           ├── index.html              # Page d'accueil du parcours (grille chapitres)
│           └── 
│                   ├── chapters_index.json   # Généré automatiquement
│                   ├── chapitre1.html        # Généré automatiquement
│                   └── chapitre2.html        # Généré automatiquement
│
│
└── tools_xlsx/
    ├── generate_chapters.py            # Générateur Excel → HTML
    ├── coursexportXSPRO.xlsx           # Fichier Excel source (exemple)
    ├── templates/
    │   └── chapter_template.html       # Template de chapitre (multi-parcours)
    └── generated/                      # Sortie legacy (sans --parcours)
```

---

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

### Étape 3 — Créer la page d'accueil du parcours

Copiez la page d'accueil d'un parcours existant et adaptez le titre :

```bash
mkdir -p parcours/src/math-2de
cp parcours/src/nsi-term/index.html parcours/src/math-2de/index.html
```

Ouvrez `parcours/src/math-2de/index.html` et changez uniquement le `<title>` et le `<h1>`.
C'est la **seule modification manuelle** nécessaire.

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

## 🤝 Contribution

```bash
git config --global user.email "scse972@gmail.com"
git config --global user.name "SCSE972"

git add .
git commit -m "Description des changements"
git push origin main
```

---

## 📄 Licence

MIT
