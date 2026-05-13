# 🌐 Bilan – Architecture et flux du site "Cours Interactifs"

## 1. 🏗️ Architecture générale

Le projet est un site statique (HTML/CSS/JS) hébergé sur **GitHub Pages**, avec **Supabase** comme backend de persistance. Il gère des **parcours pédagogiques** (ex: `math-Term`) composés de **chapitres** contenant des **questions** et des **pages de cours**.

L'infrastructure est **multi-parcours** : une même instance peut servir plusieurs parcours (maths, NSI, SNT...) avec des élèves et des configurations isolés.

---

## 2. 🗄️ Stockage Supabase — Table unique clé-valeur

**Base de données :** une seule table `app_data` avec la structure :

| Colonne | Type | Description |
|---|---|---|
| `key` | `TEXT PRIMARY KEY` | Clé unique (ex: `math-Term:STU001:student_STU001_progress`) |
| `value` | `JSONB` | Valeur (objet JSON quelconque) |
| `updated_at` | `TIMESTAMPTZ` | Dernière modification |

**Toutes les données** (progression élève, liste utilisateurs, config chapitres) passent par cette table unique. L'isolation se fait par **préfixe de clé** :

```
[slug]:[token]:[nom_de_la_donnée]
```

### Exemples de clés stockées dans Supabase

| Clé | Contenu (valeur JSON) |
|---|---|
| `math-Term:teacher:users_list` | `[{id:"STU001", name:"Jean", class:"TG3", type:"student"}, ...]` |
| `math-Term:STU001:student_STU001_progress` | `{chapters:{1:{completed:true,...}}, scores:{}, totalCompleted:3, questionAttempts:{...}}` |
| `math-Term:config:chapter_config` | `{1:{locked:false, examMode:true, endDate:"2026-06-01T19:00:00", dateLimitEnabled:true}, ...}` |
| `math-Term:STU001:course_progress` | Progression de lecture des pages de cours |
| `math-Term:STU001:userAnswers` | Réponses brutes aux questions (restauration) |

---

## 3. 🔄 Couche de persistance (`storage.js`)

Le fichier `storage.js` fournit une **abstraction asynchrone** uniforme avec 3 mécanismes :

### 3.1 Cache localStorage
- Toute lecture Supabase met à jour un cache local préfixé `_cache_`
- Permet la consultation **hors-ligne**

### 3.2 Queue offline
- Si Supabase est indisponible, les écritures sont **mises en queue** dans `localStorage` (clé `_sync_queue`)
- Au retour de la connexion (événement `online`), la queue est **rejouée automatiquement**
- L'utilisateur voit une **bannière** indiquant l'état (syncing / offline / erreur)

### 3.3 Scoped Storage (`parcours.js`)
- Un **wrapper** qui préfixe automatiquement les clés avant d'appeler `storage.get/set/remove`
- 3 "scopes" par parcours :
  - `Parcours.scoped.student` → préfixe `slug:token:`
  - `Parcours.scoped.teacher` → préfixe `slug:teacher:`
  - `Parcours.scoped.config` → préfixe `slug:config:`

---

## 4. 📦 Constitution d'un parcours

### 4.1 Structure des fichiers (statiques, versionnés dans Git)

```
parcours/
├── parcours.json              → Liste des parcours disponibles
└── src/
    └── math-Term/
        ├── index.html          → Page d'accueil du parcours (questions + cours)
        ├── chapitre1.html      → Chapitres (créés par génération)
        └── 
            └── chapters_index.json   → Métadonnées du parcours (JSON généré)
```

### 4.2 `chapters_index.json`
Fichier **généré automatiquement** (via `tools_xlsx/`) à partir d'un fichier Excel (`cours.xlsx`). Il définit :

- **Chapitres** : id, titre, slug, fichiers HTML
- **Questions** par chapitre : type (qcm, ouverte, courte, sélection), correctionType (auto/semi/manuel), points, options, réponses correctes, hints
- **Cours** : pages de cours à valider (lecture obligatoire)
- **Statistiques** : nombre total de questions, durée estimée, etc.

Ce fichier est **la source de vérité locale** pour l'affichage des chapitres et des questions. Les données de progression, elles, sont dans Supabase.

---

## 5. 👤 Flux de connexion

```
Utilisateur → login.html
    ↓
Entre son jeton (STU001)
    ↓
login.html interroge Supabase : storage.get("math-Term:teacher:users_list")
    ↓
Cherche si le jeton existe dans la liste
    ↓
Si oui → sessionStorage.setItem("current_student_token", "STU001")
        → redirige vers /parcours/src/math-Term/
    ↓
Si non → message d'erreur
```

Le jeton est ensuite passé dans l'URL (`?token=STU001`), puis nettoyé de la barre d'adresse par `parcours.js`. Il est conservé en `sessionStorage` pour toute la session.

---

## 6. 📝 Flux de travail élève (vue principale : `chapitre.html`)

```
Page du chapitre chargée
    ↓
1. Restaure l'état depuis Supabase
   (progression, réponses existantes, verrous)
    ↓
2. Affiche les questions
   - Chaque question est un composant StudentWorkEditor
   - data-question-id, data-correction-type, data-points
    ↓
3. L'élève interagit :
   - Saisit une réponse → événement onAnswerChanged (sauvegarde auto en mode examen)
   - Clique sur "Vérifier" → événement onAnswerValidated
    ↓
4. StudentWorkEditor détermine isCorrect selon le tableau de vérité :
   - auto  : correct → true / incorrect → false
   - semi  : réponse dans liste → true / trop courte → false / autre → null
   - manuel: toujours null (correction par le formateur)
    ↓
5. Mise à jour de la progression dans Supabase :
   - storage.set("math-Term:STU001:student_STU001_progress", {chapters, scores, questionAttempts})
   - recordQuestionAttempt(chapterId, questionId, isCorrect)
    ↓
6. Si toutes les questions validées + cours lus → chapitre complété
```

---

## 7. 👨‍🏫 Flux formateur (tableau de bord)

Le formateur se connecte via `teacher-login.html` avec un jeton de type `teacher`.

### 7.1 Gestion des utilisateurs (`UserManager`)
- **CRUD** des jetons élèves (ajout, modification, suppression)
- **Import/Export** CSV (format : `ID;Nom;Classe;Type`)
- Génération automatique de jetons (`STU001`, `STU002`...)
- Les données sont stockées dans `slug:teacher:users_list` (Supabase)

### 7.2 Contrôle des chapitres (`TeacherChapters`)
Pour chaque chapitre, le formateur peut :

| Action | Stockage dans Supabase |
|---|---|
| 🔒 **Verrouiller/Déverrouiller** | `slug:config:chapter_config` → `{1: {locked: true/false}}` |
| 📝 **Mode examen** | `slug:config:chapter_config` → `{1: {examMode: true/false}}` |
| 📅 **Limite de date** | `slug:config:chapter_config` → `{1: {endDate: "2026-06-01T19:00:00", dateLimitEnabled: true}}` |

### 7.3 Correction manuelle (modal)
Pour les questions de type `manuel` et `semi` en attente, le formateur utilise `correctionModal.js` pour attribuer une note et un feedback.

---

## 8. 🧩 Diagramme des flux de données

```
┌─────────────────────────────────────────────────────────┐
│                   GITHUB PAGES                           │
│  (fichiers statics : HTML, CSS, JS, JSON)               │
│                                                          │
│  parcours.json ──► chapters_index.json ──► chapitre.html │
└──────┬────────────────────────────────────────┬──────────┘
       │                                         │
       │  fetch (lecture)                        │  storage.get/set (API REST)
       ▼                                         ▼
┌─────────────────┐                 ┌──────────────────────────┐
│  Cache localStorage│               │       SUPABASE            │
│  (offline)         │◄─────────────►│  Table unique : app_data  │
│  _cache_[clé]      │    sync       │                           │
│  _sync_queue       │  auto         │  Clés :                   │
└────────────────────┘               │  slug:token:progress      │
                                     │  slug:teacher:users_list  │
                                     │  slug:config:chapter_conf │
                                     └──────────────────────────┘
```

---

## 9. 📊 Résumé des responsabilités par fichier

| Fichier | Rôle |
|---|---|
| `config.js` | Détection environnement (local vs prod), `window.BASE` |
| `parcours.js` | Détection slug, gestion token, scoped storage |
| `storage.js` | Backend Supabase + cache localStorage + queue offline + sync auto |
| `dataStorage.js` | Couche métier : users, progression, questions, auth |
| `teacherChapters.js` | Interface formateur : verrous, examen, dates |
| `correctionModal.js` | Modal de correction manuelle |
| `chapters_index.json` | Définition locale des chapitres/questions (généré depuis Excel) |

---

Ce bilan couvre l'intégralité du principe de fonctionnement : **constitution des données** (Excel → JSON → Supabase) et **flux** (connexion → navigation → réponse → correction → persistance). Souhaitez-vous que je détaille un point particulier ?


# 🔑 Détail : Enregistrement et gestion des jetons utilisateurs

Le système de jetons est entièrement **décentralisé** et **isolé par parcours**. Il n'y a **pas de table "users"** dans Supabase — tout repose sur **la table unique `app_data`** avec des clés préfixées.

---

## 1. 📁 Structure d'un jeton dans Supabase

**Clé Supabase :** `math-Term:teacher:users_list`
**Valeur JSON stockée :**
```json
[
  {
    "id": "STU001",
    "name": "Jean Dupont",
    "class": "TG3",
    "type": "student"
  },
  {
    "id": "PROF001",
    "name": "M. Martin",
    "class": "PROF",
    "type": "teacher"
  }
]
```

C'est un **simple tableau JSON** — la liste complète des utilisateurs d'un parcours, rangée dans une **seule clé**.
- **Pas de table relationnelle**
- **Pas d'authentification Supabase (Auth)**
- Les jetons sont des **identifiants libres** choisis par le formateur (ou générés automatiquement)

---

## 2. 👨‍🏫 Ajout d'un utilisateur (côté formateur)

### 2.1 Interface de gestion des jetons

Le formateur accède à un `UserManager` via le tableau de bord (`teacher-login.html`). Il voit :

```
┌──────────────────────────────────────────────┐
│  📋 Gestion des jetons                       │
│                                              │
│  Type: [Apprenant ▼]   Jeton: [STU   ]      │
│  Nom:  [Jean Dupont]   Classe: [TG3 ]       │
│  [➕ Ajouter]                                │
│                                              │
│  ┌─────────┬──────────────┬────────┬──────┐  │
│  │ Jeton   │ Nom          │ Classe │ Type │  │
│  ├─────────┼──────────────┼────────┼──────┤  │
│  │ STU001  │ Jean Dupont  │ TG3    │ Appr │  │
│  │ STU002  │ Marie Durand │ TG3    │ Appr │  │
│  └─────────┴──────────────┴────────┴──────┘  │
│                                              │
│  [📥 Importer CSV]  [📤 Exporter CSV]       │
│  [🔄 Réinitialiser]                          │
└──────────────────────────────────────────────┘
```

### 2.2 Ajout manuel — code

```javascript
// UserManager.addUser() — fichier dataStorage.js lignes 273-291
async addUser() {
    const userType  = document.getElementById('user-type').value;   // "student" ou "teacher"
    const userToken = document.getElementById('user-token').value.trim();   // ex: "STU001"
    const userName  = document.getElementById('user-name').value.trim();    // ex: "Jean Dupont"
    const userClass = document.getElementById('user-class').value.trim();   // ex: "TG3"

    // Validations : token ≥ 5 carac., pas d'espaces, alphanumérique uniquement
    // Vérification : pas de doublon dans le parcours courant

    const users = await this.getUsers();   // lit Supabase : "math-Term:teacher:users_list"
    users.push({ id: userToken, name: userName, class: userClass, type: userType });
    await this.saveUsers(users);           // écrit dans Supabase : "math-Term:teacher:users_list"
}
```

### 2.3 Génération automatique de jetons

```javascript
// dataStorage.js lignes 264-271
async generateToken(userType) {
    const users  = await this.getUsers();
    const prefix = userType === 'teacher' ? 'PROF' : 'STU';  // "STU" ou "PROF"
    const existing = users.map(u => u.id).filter(id => id.startsWith(prefix));
    let counter = 1;
    let newToken = `${prefix}${String(counter).padStart(3, '0')}`;  // STU001
    while (existing.includes(newToken)) {
        counter++;
        newToken = `${prefix}${String(counter).padStart(3, '0')}`;  // STU002, STU003...
    }
    return newToken;
}
```

### 2.4 Import CSV

Le formateur peut importer un fichier CSV structuré :
```csv
ID;Nom;Classe;Type
STU001;Jean Dupont;TG3;student
STU002;Marie Durand;TG3;student
PROF001;M. Martin;PROF;teacher
```

Le fichier est parsé ligne par ligne, et la liste entière est **remplacée** (pas de merge) dans Supabase.

---

## 3. 🔐 Flux de connexion détaillé

```
Élève arrive sur login.html
    ↓
1. Vérifie sessionStorage : "current_student_token" existe ?
    ↓ OUI → déjà connecté, redirige vers le parcours
    ↓ NON → affiche le formulaire
    ↓
2. L'élève saisit son jeton : "STU001"
    ↓
3. login.html appelle :
   storage.get("math-Term:teacher:users_list")
    ↓
4. Supabase renvoie le tableau JSON des utilisateurs
    ↓
5. Recherche : users.find(u => u.id === "STU001")
    ↓
   TROUVÉ →
     sessionStorage.setItem("current_student_token", "STU001")
     sessionStorage.setItem("parcours:math-Term:token", "STU001")
     Redirection vers /parcours/src/math-Term/
    ↓
   PAS TROUVÉ →
     Message d'erreur : "Jeton invalide pour ce parcours"
```

**Mécanisme jeton de récupération :**  
Le code `YXORP@97240` est un mot de passe "root" codé en dur dans `DataStorage`. Saisi dans le champ jeton, il connecte automatiquement en tant que formateur (crée même un compte PROF001 s'il n'existe pas). C'est un **backdoor de secours** pour les formateurs qui auraient perdu leur accès.

---

## 4. 🗄️ Données associées à un jeton

Quand un élève est connecté avec le jeton `STU001`, **toutes ses données** sont stockées avec le préfixe `math-Term:STU001:` :

| Clé Supabase | Contenu |
|---|---|
| `math-Term:STU001:student_STU001_progress` | Progression complète (chapitres, scores, tentatives) |
| `math-Term:STU001:courseProgress` | Pages de cours lues |
| `math-Term:STU001:userAnswers` | Réponses brutes pour restauration |
| `math-Term:STU001:course_progress` | Progression de lecture des cours |
| `math-Term:STU001:question_attempts` | Statistiques de tentatives par question |

Ces données sont écrites par le **scoped storage** :
```javascript
// Exemple : sauvegarde de la progression
Parcours.scoped.student.set(`student_STU001_progress`, {
    chapters: { 1: { completed: true, score: 5 } },
    scores: { 1: 5 },
    totalCompleted: 1,
    questionAttempts: { ... }
});
// Supabase reçoit : set("math-Term:STU001:student_STU001_progress", {...})
```

---

## 5. 🔄 Modification / Suppression d'un jeton

### 5.1 Modification
Le formateur peut changer le jeton, le nom ou la classe d'un élève :
```javascript
// Si le jeton change (ex: STU001 → STU010)
const oldProgress = await Parcours.scoped.student.get(`student_STU001_progress`);
await Parcours.scoped.student.set(`student_STU010_progress`, oldProgress);   // nouvelle clé
await Parcours.scoped.student.remove(`student_STU001_progress`);             // ancienne clé effacée
```

### 5.2 Suppression
```javascript
async removeUser(userId) {
    const users = await this.getUsers();                           // liste des utilisateurs
    await this.saveUsers(users.filter(u => u.id !== userId));      // supprime de la liste
    await this._student.remove(`student_${userId}_progress`);      // supprime la progression
}
```
**⚠️ La suppression d'un jeton efface toute la progression de l'élève dans Supabase** (pas de retour possible).

---

## 6. 📌 Points clés à retenir

1. **Pas d'authentification Supabase Auth** — tout est géré par un tableau JSON dans la table `app_data`
2. **Un même jeton peut exister dans plusieurs parcours** — `math-Term:teacher:users_list` et `nsi-term:teacher:users_list` sont indépendants
3. **Pas de mot de passe** — le jeton fait office à la fois d'identifiant et de secret. La sécurité repose sur la non-devinabilité des jetons (mais un jeton comme `STU001` est trivial)
4. **Stockage plat** — pas de normalisation, pas de jointure, tout est dans une seule table
5. **Le "backdoor" `YXORP@97240`** permet à un formateur de se connecter sans jeton pré-existant
6. **La liste des utilisateurs est remplacée en bloc** à l'import CSV — pas de merge fin

