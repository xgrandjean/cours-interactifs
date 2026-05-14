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

## 📁 Organisation physique des dossiers (arborescence réelle)

```
cours-interactifs/                         # Racine du dépôt (servie sur GitHub Pages)
│
├── index.html                             # Router technique SPA → parcours/src/{slug}/
├── 404.html                               # Fallback GitHub Pages pour les routes SPA
├── package.json                           # npm run deploy → GitHub Pages
│
├── src/                                   # ★ Code source partagé (tous parcours, écrit à la main)
│   ├── js/
│   │   ├── storage.js                     #   Module central : storage (cache+sync) + staticJson
│   │   ├── cours-loader.js                #   Couche métier au-dessus de staticJson
│   │   ├── parcours.js                    #   Module multi-parcours (chargé en premier)
│   │   ├── dataStorage.js                 #   Auth, progression, UserManager
│   │   ├── main.js                        #   Utilitaires DOM, APP_BASE_URL
│   │   ├── config.js                      #   Configuration globale
│   │   ├── index.js                       #   Grille des chapitres (page d'accueil du parcours)
│   │   ├── chapitre.js                    #   Logique page chapitre
│   │   ├── chapterInit.js                 #   Init page chapitre (auth, vue formateur)
│   │   ├── correctionModal.js             #   Modale de correction formateur
│   │   ├── studentCorrectionModal.js      #   Modale de correction élève
│   │   ├── studentWorkEditor.js           #   Éditeur de travail élève
│   │   ├── progressManager.js             #   Gestionnaire de progression
│   │   ├── getChapterBadgeState.js        #   État des badges chapitre
│   │   ├── teacherDashboard.js            #   Tableau de bord formateur
│   │   ├── teacherChapters.js             #   Gestion des chapitres (formateur)
│   │   ├── teacherStats.js                #   Statistiques (formateur)
│   │   ├── teacherStudents.js             #   Gestion des élèves (formateur)
│   │   ├── teacherSubmissions.js          #   Soumissions (formateur)
│   │   ├── teacherUsers.js                #   Utilisateurs (formateur)
│   │   ├── chapter/
│   │   │   ├── chapterBilan.js            #   Bilan de chapitre
│   │   │   ├── chapterSubmission.js       #   Soumission de chapitre
│   │   │   └── chapterUI.js               #   UI chapitre
│   │   └── core/
│   │       ├── chapterRepository.js       #   Accès données chapitre
│   │       ├── chapterRenderer.js         #   Rendu chapitre
│   │       ├── chapterSession.js          #   Session chapitre
│   │       ├── chapterState.js            #   État chapitre
│   │       ├── getExamContext.js          #   Contexte examen
│   │       └── utils.js                   #   Utilitaires
│   │
│   ├── assets/css/
│   │   ├── style.css
│   │   ├── index.css
│   │   ├── chapitre.css
│   │   ├── teacher.css
│   │   ├── chapter-bilan.css
│   │   └── correction-modal.css
│   │
│   └── html/
│       ├── login.html                     #   Connexion apprenant
│       ├── teacher-login.html             #   Connexion formateur
│       ├── teacher.html                   #   Gestion parcours (formateur)
│       └── user.html                      #   Profil utilisateur
│
├── parcours/                              # ★ Données pédagogiques (générées par outils_xlsx/)
│   ├── cours.json                         #   Registre JSON complet de TOUS les parcours
│   │                                      #   (contient la totalité des données : chapitres,
│   │                                      #    questions, réponses, feedbacks, html incorporé)
│   │                                      #   Chargé via staticJson.get('/parcours/cours.json')
│   └── src/
│       └── chapter_template.html          #   Template HTML unique pour générer les chapitres
│
├── storage/                               # ★ Configuration du backend de stockage
│   ├── config.json                        #   Provider actif (copie locale de .supabase ou .local)
│   ├── config.local.json                  #   Configuration SQLite (développement local)
│   ├── config.supabase.json               #   Identifiants Supabase (production)
│   ├── provider.sqlite.js                 #   Client HTTP vers le backend SQLite local
│   ├── provider.supabase.js               #   Client HTTP vers Supabase
│   └── MIGRATION.md                       #   Notes de migration
│
├── backend/                               # ★ Serveur local (Node.js / SQLite, développement)
│   ├── server.js                          #   Serveur Express (API REST /api/data/*)
│   ├── data.db                            #   Fichier SQLite
│   ├── sync_supabase_to_sqlite.js         #   Sync Supabase → SQLite
│   └── sync_sqlite_to_supabase.js         #   Sync SQLite → Supabase
│
├── tools_xlsx/                            # ★ Outils de génération (non déployés)
│   ├── generate_chapters.py               #   Générateur Python Excel → cours.json + HTML
│   ├── coursexportXSPRO.xlsx              #   Fichier source Excel (contenu pédagogique)
│   ├── cours.xlsx                         #   Fichier source Excel (variable suivant besoins)
│   ├── SUPABASE_SETUP.sql                 #   Schéma SQL pour la table Supabase app_data
│   ├── templates/
│   │   └── chapter_template.html          #   Template de chapitre (source, copié vers parcours/src/)
│   └── generated/                         #   Sortie legacy (sans --parcours)
│
├── deploiement.md                         # Documentation déploiement
├── DETAILS_VUES.md                        # Documentation vues
├── principe flux.md                       # Documentation flux de données
│
└── .gitignore
```

### Clé de lecture

| Dossier | Rôle | Déployé sur GitHub Pages | Généré automatiquement | Modifiable à chaud |
|---------|------|--------------------------|------------------------|--------------------|
| `src/` | Moteur de l'application | ✅ Oui | ❌ Non (écrit à la main) | ❌ Non |
| `parcours/` | Contenu pédagogique | ✅ Oui (fichier statique) | ✅ Oui par `generate_chapters.py` | ❌ Non |
| `storage/` | Configuration providers | ❌ Non (sensible) | ❌ Non | ✅ Oui (copie de fichier) |
| `backend/` | Serveur local dev | ❌ Non | ❌ Non | ✅ Oui |
| `tools_xlsx/` | Usine de génération | ❌ Non | N/A | N/A |

### Logique de chargement au runtime

1. **Code** → les pages HTML chargent les scripts depuis `src/js/` (via balises `<script>`)
2. **Données des parcours** → `staticJson.get('/parcours/cours.json')` dans `storage.js`
   - Cache mémoire session → fetch statique → fallback provider Supabase/SQLite
3. **Template chapitre** → `parcours/src/chapter_template.html` (exporté depuis `tools_xlsx/templates/chapter_template.html`)
4. **Pages parcours** → servies statiquement depuis GitHub Pages

---

## 🔧 Architecture du chargement des données statiques (`staticJson`)

Le refactor centralise **tous les appels** à `/parcours/cours.json` via `staticJson`, remplaçant les `fetch((window.BASE || '') + '/parcours/cours.json')` dispersés dans le code.

### Module : `src/js/storage.js` → `window.staticJson`

```
staticJson.get('/parcours/cours.json')
```

### Stratégie de résolution

Pour un chemin donné (ex: `/parcours/cours.json`) :

| Étape | Source | Description |
|-------|--------|-------------|
| **1. Cache mémoire** | `Map<chemin, valeur>` | Retour immédiat si déjà résolu durant la session |
| **2. Fetch statique** | `fetch((window.BASE \|\| '') + chemin)` | Requête HTTP vers le fichier `.json` |
| **3. Fallback provider** | `storage.get('_static:<chemin>')` | Fournisseur actif (Supabase / SQLite) si le fichier statique est absent |

La valeur est mise en cache mémoire **dès le premier succès** (aucune écriture localStorage : ces données ne changent pas).  
Toutes les erreurs sont capturées — la méthode retourne `null` au lieu de lever une exception.

### API publique

```js
// Chargement synchrone-asynchrone (retourne un cache mémoire si déjà chargé)
const data = await staticJson.get('/parcours/cours.json');   // → objet JS ou null

// Préchargement en arrière-plan (sans attendre le résultat)
staticJson.prefetch('/parcours/cours.json');                  // single path
staticJson.prefetch(['/parcours/cours.json', '/autres.json']); // multiple paths

// Invalidation du cache mémoire (pour développement / tests)
staticJson.invalidate('/parcours/cours.json');   // un seul chemin
staticJson.invalidate();                         // tout le cache
```

### Fichiers impactés (tous centralisés)

| Fichier | Utilisation |
|---------|-------------|
| `src/js/storage.js` | Définition du module `staticJson` |
| `src/js/cours-loader.js` | `loadCours()` → `staticJson.get('/parcours/cours.json')` |
| `src/js/index.js` | Chargement de la grille des chapitres |
| `src/js/chapitre.js` | Chargement des données du parcours courant |
| `src/js/correctionModal.js` | Correction formateur |
| `src/js/studentCorrectionModal.js` | Correction côté élève |
| `src/js/teacherDashboard.js` | Tableau de bord formateur |

Avant (dans chaque fichier) :
```js
const resp = await fetch((window.BASE || '') + '/parcours/cours.json');
```

Après (partout) :
```js
const data = await staticJson.get('/parcours/cours.json');
```

---

## 💾 Architecture du stockage (`storage.js`)

`src/js/storage.js` centralise trois systèmes distincts :

### 1. `storage` — Cache localStorage + sync provider

```js
await storage.get(key)      // → valeur ou null (cache si hors-ligne)
await storage.set(key, v)   // → upsert (queue si hors-ligne)
await storage.remove(key)   // → suppression (queue si hors-ligne)
await storage.keys()        // → clés backend + clés en cache
```

- **Provider** : configuré via `storage/config.json` (provider.supabase.js ou provider.sqlite.js)
- **Cache** : localStorage avec préfixe `_cache_` pour accès immédiat hors-ligne
- **Queue** : opérations enregistrées dans `_sync_queue` et rejouées à la reconnexion

### 2. `SyncManager` — Queue hors-ligne

- Accumule les opérations `{type, key, value}` dans localStorage
- Rejoue automatiquement à la reconnexion (bannière de statut visible)
- Garantit `{success, count, failed}` en retour

### 3. `staticJson` — JSON lecture seule (cours.json)

Cf. section dédiée ci-dessus.

---

## ⚙️ Configuration

### Storage providers

| Fichier | Provider | Usage |
|---------|----------|-------|
| `storage/config.supabase.json` | Supabase | Production — backend distant |
| `storage/config.local.json` | SQLite | Développement local via `backend/server.js` |

Sélection : copier le fichier souhaité vers `storage/config.json`.

### Backend local

```bash
cd backend
npm install
node server.js
# → http://localhost:3001
# → API REST : /api/data/:key, /api/data/:key (PUT), /api/keys
```

---

## 🚀 Déploiement

### GitHub Pages

```bash
npm run deploy
```

Cette commande :
1. Bascule automatiquement sur le provider Supabase
2. Pousse le dossier racine sur `origin gh-pages`
3. Les fichiers statiques (dont `/parcours/cours.json`) sont servis directement depuis le repo

### Initialisation Supabase

1. Créer un projet Supabase
2. Exécuter le schéma `tools_xlsx/SUPABASE_SETUP.sql`
3. Copier les identifiants dans `storage/config.supabase.json`

---

## 🛠️ Développement

### Génération des chapitres (scripts outils)

```bash
python tools_xlsx/generate_chapters.py \
    --xlsx tools_xlsx/coursexportXSPRO.xlsx \
    --parcours nsi-term
```

### Extension : ajouter un parcours

1. Ajouter l'entrée dans `parcours/parcours.json`
2. Générer les chapitres avec le script ci-dessus
3. Ajouter les utilisateurs via l'interface formateur

---