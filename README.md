# Site Pédagogique Interactif

Un site éducatif statique conçu pour aider les élèves à suivre un parcours d'apprentissage avec QCM interactifs, progression sauvegardée et exercices Capytale.

## 🎯 Fonctionnalités

### Système d'Authentification
- **Jeton d'accès** : x élèves avec jetons uniques
- **Connexion simple** : Saisie du jeton pour accéder à l'espace personnel
- **Données individuelles** : Chaque élève a sa propre progression sauvegardée
- **Déconnexion** : Possibilité de se déconnecter et de changer d'utilisateur

### Système de Progression
- **Dépendances entre chapitres** : Chaque chapitre doit être validé avant d'accéder au suivant
- **Sauvegarde locale** : Progression et scores stockés dans localStorage par utilisateur
- **Barre de progression** : Visualisation du pourcentage de complétion
- **Validation par score** : Nécessite 80% de bonnes réponses pour valider un chapitre

### QCM Interactifs
- **Types de questions** : Choix unique (radio) et choix multiples (checkbox)
- **Feedback immédiat** : Affichage des bonnes et mauvaises réponses
- **Score final** : Calcul et affichage du pourcentage de bonnes réponses
- **Suivi des tentatives** : Enregistrement de chaque tentative de question
- **Taux de réussite** : Calcul du taux de réussite par question et par chapitre
- **Réinitialisation** : Possibilité de recommencer le QCM

### Tableau de Bord Professeur
- **Suivi global** : Taux de réussite global de la classe
- **Suivi par chapitre** : Performance moyenne par chapitre
- **Suivi individuel** : Progression détaillée de chaque élève
- **Détails des tentatives** : Nombre de tentatives et taux de réussite par question
- **Dernière activité** : Date et heure de la dernière activité de chaque élève
- **Export des données** : Données accessibles via localStorage pour export

### Intégration Capytale
- **Liens directs** : Accès facile aux exercices Capytale
- **Exercices pratiques** : Complément aux QCM théoriques

## 📁 Structure du Projet

```
coursInteractifs/
├── index.html              # Page d'accueil et sommaire (à la racine)
├── css/                    # Styles CSS principaux
│   └── style.css
├── js/                     # Scripts JavaScript principaux
│   ├── main.js
│   └── localStorageAuth.js
├── src/                    # Dossier source
│   ├── html/               # Pages principales
│   │   ├── login.html      # Page de connexion élèves
│   │   ├── teacher.html    # Tableau de bord professeur
│   │   ├── teacher-login.html  # Page de connexion professeur
│   │   └── teacher-users.html  # Gestion des utilisateurs
│   └── chapters/           # Chapitres du cours
│       ├── chapitre1.html  # Premier chapitre
│       ├── chapitre2.html  # Deuxième chapitre
│       └── chapitre3.html  # Troisième chapitre
├── package.json            # Configuration npm avec scripts de développement
└── package-lock.json
```

## 🚀 Démarrage Rapide

### Environnement de Développement

1. **Installation des dépendances** :
   ```bash
   npm install
   ```

2. **Lancement du serveur de développement** :
   ```bash
   npm run dev
   ```
   Le serveur démarre sur http://localhost:8000 et ouvre automatiquement index.html

3. **Alternative avec http-server** :
   ```bash
   npx http-server -p 8000 -o index.html
   ```

### Pour les Élèves
1. **Ouvrir le site** : Accédez à http://localhost:8000 dans votre navigateur
2. **Se connecter** : Cliquez sur "Se Connecter" et saisissez votre jeton (ex: STU001)
3. **Commencer le parcours** : Accédez aux chapitres débloqués via les liens dans index.html
4. **Suivre la progression** : Le système bloque automatiquement les chapitres non validés
5. **Se déconnecter** : Utilisez le bouton "Se Déconnecter" pour changer d'utilisateur

### Pour les Professeurs
1. **Accéder au tableau de bord** : Cliquez sur "Espace Professeur" depuis l'accueil
2. **S'authentifier** : Saisissez le mot de passe professeur
3. **Suivre la classe** : Visualisez la progression et les performances de tous les élèves
4. **Gérer les utilisateurs** : Utilisez "Gérer les Utilisateurs" pour ajouter/modifier les élèves

### Accès Direct
- **Page de login élèves** : `/src/html/login.html`
- **Page de login professeur** : `/src/html/teacher-login.html`
- **Tableau de bord** : `/src/html/teacher.html` (après authentification)
- **Gestion des utilisateurs** : `/src/html/teacher-users.html`

## 🛠️ Personnalisation


## 💾 Stockage Local

Le site utilise localStorage pour :
- **Progression** : `course_progress` (objets chapters, scores, totalCompleted)
- **Scores** : Enregistrés par chapitre avec timestamp
- **Validation** : État de validation de chaque chapitre

### Format des Données
```javascript
{
    "chapters": {
        "1": {
            "completed": true,
            "score": 90,
            "timestamp": "2024-01-01T12:00:00.000Z"
        }
    },
    "scores": {},
    "totalCompleted": 1
}
```

## 🔧 Dépannage

### Problèmes Courants

**Les chapitres restent verrouillés** :
- Vérifiez que le chapitre précédent a été validé (80% minimum)
- Vérifiez que JavaScript est activé dans le navigateur
- Essayez de vider le localStorage (F12 > Application > Local Storage)

**Les QCM ne fonctionnent pas** :
- Vérifiez que les questions sont bien définies dans le script
- Assurez-vous que les IDs des questions correspondent aux noms des inputs
- Vérifiez la syntaxe JavaScript dans la console (F12)


### Support Navigateur

Le site est compatible avec :
- **Chrome** (recommandé)
- **Firefox**
- **Safari**
- **Edge**
- **Navigateurs mobiles**

## 📚 Exemples de Contenu

### Structure Type d'un Chapitre

1. **Introduction** : Explication du concept
2. **Exemples** : Mise en pratique avec des exemples concrets
3. **QCM** : Évaluation des connaissances
4. **Exercice Capytale** : Application pratique

### Types de Questions Recommandées

- **Questions de compréhension** : Vérifient la compréhension des concepts
- **Questions d'application** : Mettent en pratique les connaissances
- **Questions pièges** : Identifient les erreurs fréquentes
- **Questions à choix multiples** : Pour les concepts complexes

## 🤝 sauvegarde sur git
# si non identifié:
git config --global user.email "scse972@gmail.com" 
git config --global user.name "SCSE972"        

# puis
git add .
git commit -m "vos changements"
git push origin main


1. **Fork** le projet
2. **Créez** une branche (`git checkout -b nouvelle-fonctionnalite`)
3. **Commit** vos changements (`git commit -m 'Ajout de nouvelle fonctionnalité'`)
4. **Push** vers la branche (`git push origin nouvelle-fonctionnalite`)
5. **Créez** une Pull Request

## 📄 Licence

Ce projet est sous licence MIT. Consultez le fichier LICENSE pour plus de détails.

## 🙏 Remerciements

- **Capytale** pour l'intégration des exercices pratiques
- **La communauté open-source** pour les inspirations et outils utilisés

---

**Besoin d'aide ?** Consultez cette documentation ou créez une issue sur le dépôt GitHub.
