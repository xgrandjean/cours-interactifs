Voici un prompt de vérification complet, **sans limitation de fichiers**, que vous pouvez donner à une IA pour auditer l’intégralité du codebase sur la gestion des slugs de parcours.

---

## 🔍 Prompt de vérification IA : Gestion des slugs de parcours – Audit complet

**Contexte** :  
L’application est une plateforme de cours interactifs multi‑parcours. Chaque parcours (ex: `terminale`, `seconde`, `math-2de`) possède ses propres données :
- Liste des utilisateurs : clé `<slug>:teacher:users_list`
- Progression des élèves : clé `<slug>:<studentId>:student_<studentId>_progress`
- Configuration des chapitres : clé `<slug>:config:chapter_config` (dans le storage) **OU** dans `cours.json` (avec un champ `slug` dans chaque objet parcours).

**Objectif** :  
Vérifier **l’intégralité** du code source (JavaScript, HTML, Python, tout fichier pertinent) pour s’assurer que **toutes** les opérations de lecture/écriture/suppression des données utilisateur et progression utilisent le slug du parcours comme préfixe des clés de stockage, et que le slug est correctement récupéré partout.

**Instructions pour l’IA** :

### 1. Analyse exhaustive des fichiers
- Parcourez **tous** les fichiers du projet, sans restriction de nom ou d’extension.
- Inspectez en priorité les extensions `.js`, `.html`.  
- Ne vous limitez pas à une liste pré‑définie ; fouillez récursivement tous les sous‑dossiers (ex: `src/`, `tools_xlsx/`, `parcours/`, etc.).

### 2. Détection des patterns incorrects
Recherchez les occurrences de :
- Clés de stockage **sans préfixe slug** :  
  - `student_<id>_progress` (ex: `student_STU001_progress`)  
  - `teacher:users_list`  
  - `chapter_config`  
  - Toute clé commençant directement par `student_` ou `teacher:` ou `config:` sans `${slug}:` devant.
- Utilisation de `window.Parcours.slug` **sans fallback** sur `window.currentParcoursSlug` ou sans attendre l’initialisation de `Parcours`.
- Appels à `Parcours.scoped.student.get/set` ou `Parcours.scoped.config.get/set` : vérifiez que l’implémentation de `scoped` préfixe bien les clés avec le slug. Si ce n’est pas le cas, signalez les endroits où cette méthode est utilisée.
- Récupération du slug à partir de l’URL de manière **inconsistante** :  
  - Parfois `new URLSearchParams(window.location.search).get('parcours')`  
  - Parfois `window.currentParcoursSlug` (qui doit être défini au chargement)  
  - Parfois directement `Parcours.slug` (peut être non disponible au moment de l’appel).
- Absence de prise en compte du slug dans les scripts **Python** (générateur `generate_chapters.py` ou autre) :  
  - Les fichiers `cours.json` produits contiennent-ils les slugs dans la structure JSON (`parcours[].slug`) ?  
  - Les templates HTML générés (s’il y en a) utilisent-ils des liens relatifs qui ignorent le slug ?

### 3. Vérification de la cohérence globale
- La **même clé** doit être utilisée pour lire et écrire la progression d’un élève donné, **dans tous les modules** (formateur, élève, correction, statistiques, etc.).
- Les fonctions d’aide comme `dashboard.getStudentProgress(studentId)` doivent systématiquement construire la clé avec le slug courant.
- Les méthodes de `ProgressManager` (`saveProgress`, `loadProgress`, etc.) doivent également utiliser le slug (elles reçoivent `studentId` mais doivent connaître le slug).
- Dans `teacher.html` (et toute autre page d’administration), le slug doit être défini **dès le chargement** (via paramètre URL) et accessible globalement (ex: `window.currentParcoursSlug`).
- Le sélecteur de parcours (dans `teacher.html`) doit modifier l’URL et recharger la page, pas seulement changer une variable JavaScript.

### 4. Actions correctives à fournir
Pour chaque anomalie détectée, l’IA doit :
- **Citer le fichier et la ligne** (ou la fonction) concernée.
- **Expliquer pourquoi** le pattern actuel est incorrect (risque de conflit entre parcours, perte de données, non‑affichage des statuts).
- **Proposer le code corrigé** (extrait complet de la fonction ou de la ligne modifiée).
- **Justifier** en quoi la correction résout le problème de cohérence.

### 5. Rapport final
L’IA doit livrer un rapport structuré contenant :
- **Liste exhaustive des fichiers analysés** (avec pour chacun un statut : `OK`, `À corriger`, `Non concerné`).
- **Tableau récapitulatif des anomalies** (fichier, ligne, pattern incorrect, correction proposée).
- **Recommandations générales** pour éviter les régressions (ex: créer un module centralisé `StorageKeys` qui fabrique les clés à partir du slug, réécrire `Parcours.scoped` pour qu’il préfixe réellement, etc.).

**Résultat attendu** : Un audit complet garantissant que toutes les données liées à un parcours sont isolées par préfixe, que les mises à jour de progression (soumission, validation, correction) sont correctement persistées et affichées, et qu’il n’y a plus de conflits entre parcours.

---

Ce prompt peut être copié/collé dans une session de chat avec une IA (ou fourni à un développeur) pour exécuter l’audit.