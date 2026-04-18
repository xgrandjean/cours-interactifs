# Structure Standard de Progression Apprenant - Version 2.0

## Vision architecturale

Ce document décrit le format standard pour stocker la progression des apprenants via la couche d'abstraction `storage.js`, avec une architecture optimisée pour :

1. **Suivi apprenant** : progression, rendus, révisions
2. **Supervision évaluateur** : corrections, validations, dashboard
3. **Performance** : données stockées vs recalculées
4. **Maintenance** : statuts clairs, pas de redondance
5. **Déploiement futur** : abstraction storage.js pour migration facile (localStorage → IndexedDB → API)

---

## Couche de stockage

La progression est stockée via `storage.js` qui fournit une abstraction pour :
- **localStorage** (actuel)
- **IndexedDB** (futur)
- **API distante** (futur)

### Clé de stockage
```
student_<id>_progress
```
Exemple : `student_123_progress`

La clé est gérée par `progressManager.js` via les fonctions `storage.get()` et `storage.set()`.

---

## Principes fondamentaux

### 1. Distinction claire des concepts

| Concept | Description | Qui gère |
|---------|-------------|----------|
| **Progression apprenant** | Questions répondues, cours lus, avancement | Automatique |
| **Rendu apprenant** | Chapitre marqué comme "rendu" pour correction | Manuel (apprenant) |
| **Correction évaluateur** | Questions corrigées, scores attribués | Manuel (évaluateur) |
| **Validation finale** | Chapitre approuvé définitivement | Manuel (évaluateur) |

### 2. Statuts imposés

#### Statuts de rendu de chapitre
```json
[
  "not_submitted",       // Chapitre non rendu (défaut)
  "submitted",           // Rendu dans les temps
  "late_submitted",      // Rendu en retard
  "returned_for_revision", // Renvoyé à l'apprenant pour révision
  "validated"             // Validé définitivement
]
```

#### Statuts de correction de chapitre
```json
[
  "not_started",         // Correction non commencée
  "in_progress",         // Correction en cours
  "pending_review",      // En attente de review (questions manuelles)
  "corrected",           // Toutes les questions corrigées
  "validated"            // Validé définitivement
]
```

#### Statuts de correction de question
```json
[
  "not_needed",          // Pas de correction manuelle nécessaire
  "pending",             // En attente de correction
  "in_review",           // En cours de correction
  "corrected",           // Corrigée
  "validated",           // Validée définitivement
  "returned_for_revision" // Renvoyée à l'apprenant
]
```

---



### 3. Modes d’évaluation (Normal / Examen)

Le système supporte deux modes de fonctionnement :

- **mode normal** : apprentissage progressif avec feedback immédiat
- **mode examen** : évaluation contrôlée sans assistance

Chaque chapitre doit définir un mode d’évaluation qui impacte :
- la disponibilité des feedbacks
- l’accès aux aides
- la visibilité des corrections
- le comportement des tentatives

### 4. Politique de feedback

Le feedback n’est pas global mais dépend du mode d’évaluation :

- mode normal → feedback immédiat autorisé
- mode examen → feedback limité ou différé

La politique est définie via `evaluationContext`


## Structure JSON complète

```json
{
  "studentId": "123",
  "studentName": "Alice Dupont",
  "studentClass": "2nde A",
  "contentHash": "abc123",
  "startedAt": "2026-04-03T10:00:00.000Z",
  "lastUpdated": "2026-04-03T10:30:00.000Z",
  
  "globalPendingCorrections": 3,
  "globalSubmittedChapters": 2,
  "globalApprovedChapters": 1,
  "globalLateSubmissions": 0,
  "globalRevisionRequests": 1,
  
  "chapters": {
    "1": {
      "status": "in_progress",
      "score": 8,
      "maxPoints": 9,
      "questionCount": 6,
      "answeredQuestions": 5,
      "completionPercent": 90,
      
      "submissionStatus": "submitted",
      "submittedAt": "2026-04-03T10:25:00.000Z",
      "approvedAt": null,
      "returnedAt": null,
      "revisionRequestedAt": null,
      "submissionDeadline": "2026-04-05T23:59:59.000Z",
      
      "teacherComment": "",
      "teacherFeedbackSummary": "",
      
      "correctionStatus": "pending_review",
      "pendingCorrectionCount": 2,
      "correctedQuestionCount": 4,
      "manualCorrectionCount": 2,
      "correctedAt": null,
      "validatedAt": null,
      "correctedBy": null,
      
      "autoScore": 6,
      "manualScore": 2,
      "finalScore": 8,
      
      "manualQuestionsTotalCount": 2,
      "manualQuestionsAutoCorrectedCount": 0,
      "manualQuestionsPendingCount": 2,
      "manualQuestionsCorrectedCount": 0,
      "manualQuestionsUnansweredCount": 0,
      
      "teacherMonitoring": {
        "lastViewedAt": "2026-04-03T11:00:00.000Z",
        "lastTeacherActionAt": null,
        "teacherId": null,
        "priorityLevel": "normal",
        "flags": [],
        "notes": ""
      },
      
      "questions": {
        "ch1_q1": {
          "questionHash": "f3b19a2210",
          "answered": true,
          "answer": 0,
          "isCorrect": true,
          "score": 1,
          "attempts": 1,
          "attemptHistory": [],
          "answeredAt": "2026-04-03T10:15:00.000Z",
          
          "needsManualCorrection": false,
          "manualCorrectionStatus": "not_needed",
          "correctedBy": null,
          "correctedAt": null,
          "teacherComment": "",
          "teacherFeedback": "",
          "teacherScore": null,
          "revisionRequested": false,
          "revisionRequestedAt": null,
          
          "autoScore": 1,
          "manualScore": 0,
          "finalScore": 1
        },
        "ch1_q3": {
          "questionHash": "36133083a8",
          "answered": true,
          "answer": "Le cheval blanc d'Henri IV est blanc.",
          "isCorrect": null,
          "score": 0,
          "attempts": 1,
          "attemptHistory": [],
          "answeredAt": "2026-04-03T10:20:00.000Z",
          
          "needsManualCorrection": true,
          "manualCorrectionStatus": "pending",
          "correctedBy": null,
          "correctedAt": null,
          "teacherComment": "",
          "teacherFeedback": "",
          "teacherScore": null,
          "revisionRequested": false,
          "revisionRequestedAt": null,
          
          "autoScore": 0,
          "manualScore": 0,
          "finalScore": 0
        }
      }
    }
  }
}
```

---

## Description détaillée des champs

### Niveau racine

| Champ | Type | Description | Calculé ou Stocké | Obligatoire |
|-------|------|-------------|-------------------|-------------|
| `studentId` | string | Identifiant unique de l'apprenant | Stocké | ✅ |
| `studentName` | string | Nom de l'apprenant | Stocké | ✅ |
| `studentClass` | string | Classe de l'apprenant | Stocké | ✅ |
| `contentHash` | string | Hash du contenu des chapitres | Stocké | ✅ |
| `startedAt` | string (ISO) | Date de début de la progression | Stocké | ✅ |
| `lastUpdated` | string (ISO) | Dernière mise à jour globale | **Calculé** | ✅ |
| `globalPendingCorrections` | number | Total questions en attente de correction | **Calculé** | ✅ |
| `globalSubmittedChapters` | number | Total chapitres rendus | **Calculé** | ✅ |
| `globalApprovedChapters` | number | Total chapitres approuvés | **Calculé** | ✅ |
| `globalLateSubmissions` | number | Total rendus en retard | **Calculé** | ✅ |
| `globalRevisionRequests` | number | Total demandes de révision | **Calculé** | ✅ |
| `chapters` | object | Données par chapitre | Stocké | ✅ |

### Niveau chapitre

| Champ | Type | Description | Calculé ou Stocké | Obligatoire |
|-------|------|-------------|-------------------|-------------|
| `status` | string | Statut de progression : `not_started`, `in_progress`, `completed` | **Calculé** | ✅ |
| `score` | number | Score total obtenu (= `finalScore`). Champ conservé pour rétrocompatibilité. | **Calculé** | ✅ |
| `maxPoints` | number | Points maximum possibles | Stocké (depuis JSON) | ✅ |
| `questionCount` | number | Nombre total de questions | Stocké (depuis JSON) | ✅ |
| `answeredQuestions` | number | Questions répondues | **Calculé** | ✅ |
| `completionPercent` | number | Pourcentage de progression | **Calculé** | ✅ |
| `submissionStatus` | string | Statut de rendu (voir liste) | Stocké | ✅ |
| `submittedAt` | string (ISO) \| null | Date de rendu | Stocké | ❌ |
| `approvedAt` | string (ISO) \| null | Date d'approbation | Stocké | ❌ |
| `returnedAt` | string (ISO) \| null | Date de retour pour révision | Stocké | ❌ |
| `revisionRequestedAt` | string (ISO) \| null | Date demande de révision | Stocké | ❌ |
| `submissionDeadline` | string (ISO) \| null | Date limite de rendu | Stocké (depuis JSON) | ❌ |
| `teacherComment` | string | Commentaire général de l'évaluateur | Stocké | ❌ |
| `teacherFeedbackSummary` | string | Résumé du feedback | Stocké | ❌ |
| `correctionStatus` | string | Statut de correction (voir liste) | **Calculé** | ✅ |
| `pendingCorrectionCount` | number | Questions en attente de correction | **Calculé** | ✅ |
| `correctedQuestionCount` | number | Questions déjà corrigées | **Calculé** | ✅ |
| `manualCorrectionCount` | number | Questions nécessitant correction manuelle | **Calculé** | ✅ |
| `correctedAt` | string (ISO) \| null | Date de fin de correction | Stocké | ❌ |
| `validatedAt` | string (ISO) \| null | Date de validation finale | Stocké | ❌ |
| `correctedBy` | string \| null | ID de l'évaluateur correcteur | Stocké | ❌ |
| `autoScore` | number | Score des questions auto-corrigées | **Calculé** | ✅ |
| `manualScore` | number | Score des questions à correction manuelle | **Calculé** | ✅ |
| `finalScore` | number | Score final (autoScore + manualScore) | **Calculé** | ✅ |
| `teacherMonitoring` | object | Données de suivi évaluateur | Stocké | ✅ |
| `teacherMonitoring.lastViewedAt` | string (ISO) \| null | Dernière consultation par évaluateur | Stocké | ❌ |
| `teacherMonitoring.lastTeacherActionAt` | string (ISO) \| null | Dernière action évaluateur | Stocké | ❌ |
| `teacherMonitoring.teacherId` | string \| null | ID évaluateur en charge | Stocké | ❌ |
| `teacherMonitoring.priorityLevel` | string | `low`, `normal`, `high`, `urgent` | Stocké | ✅ |
| `teacherMonitoring.flags` | array | Drapeaux : `late`, `revision_needed`, `incomplete` | Stocké | ✅ |
| `teacherMonitoring.notes` | string | Notes internes évaluateur | Stocké | ❌ |
| **Indicateurs complémentaires** | | | | |
| `manualQuestionsTotalCount` | number | Total questions avec `needsManualCorrection = true` | **Calculé** | ✅ |
| `manualQuestionsAutoCorrectedCount` | number | Questions semi-auto auto-corrigées (réponse exacte) | **Calculé** | ✅ |
| `manualQuestionsPendingCount` | number | Questions manuelles en attente de correction | **Calculé** | ✅ |
| `manualQuestionsCorrectedCount` | number | Questions manuelles corrigées par le prof | **Calculé** | ✅ |
| `manualQuestionsUnansweredCount` | number | Questions manuelles non répondues | **Calculé** | ✅ |
| `questions` | object | Données par question | Stocké | ✅ |

### Niveau question

| Champ | Type | Description | Calculé ou Stocké | Obligatoire |
|-------|------|-------------|-------------------|-------------|
| `questionHash` | string | Hash de la question | Stocké (depuis JSON) | ✅ |
| `answered` | boolean | Question a-t-elle reçu une réponse ? | Stocké | ✅ |
| `answer` | any \| null | Réponse donnée par l'apprenant | Stocké | ✅ |
| `isCorrect` | boolean \| null | Réponse correcte ? (null = pas évaluée) | Stocké | ✅ |
| `score` | number | Score obtenu pour cette question | **Calculé** | ✅ |
| `attempts` | number | Nombre de tentatives | Stocké | ✅ |
| `attemptHistory` | array | Historique des tentatives | Stocké | ✅ |
| `answeredAt` | string (ISO) \| null | Date de la dernière réponse | Stocké | ❌ |
| `needsManualCorrection` | boolean | Nécessite correction manuelle | **Calculé** (type question) | ✅ |
| `manualCorrectionStatus` | string | Statut correction manuelle (voir liste) | Stocké | ✅ |
| `correctedBy` | string \| null | ID de l'évaluateur correcteur | Stocké | ❌ |
| `correctedAt` | string (ISO) \| null | Date de correction | Stocké | ❌ |
| `teacherComment` | string | Commentaire sur cette réponse | Stocké | ❌ |
| `teacherFeedback` | string | Feedback détaillé | Stocké | ❌ |
| `teacherScore` | number \| null | Score attribué par l'évaluateur | Stocké | ❌ |
| `revisionRequested` | boolean | Renvoyée à l'apprenant pour révision | Stocké | ✅ |
| `revisionRequestedAt` | string (ISO) \| null | Date demande révision | Stocké | ❌ |
| `autoScore` | number | Score de la correction auto | **Calculé** | ✅ |
| `manualScore` | number | Score de la correction manuelle | **Calculé** | ✅ |
| `finalScore` | number | Score final (max(autoScore, manualScore)) | **Calculé** | ✅ |

---

## Champs calculés automatiquement (ne pas stocker)

Ces champs doivent être recalculés à chaque chargement ou modification :

### Niveau racine
```javascript
globalPendingCorrections = sum(chapter.pendingCorrectionCount)
globalSubmittedChapters = count(chapters where submissionStatus != "not_submitted")
globalApprovedChapters = count(chapters where submissionStatus == "validated")
globalLateSubmissions = count(chapters where submissionStatus == "late_submitted")
globalRevisionRequests = count(chapters where submissionStatus == "returned_for_revision")
```

### Niveau chapitre
```javascript
status = 
  if (answeredQuestions == 0) return "not_started"
  if (answeredQuestions == questionCount) return "completed"
  return "in_progress"

answeredQuestions = count(questions where answered == true AND !isCourse)
completionPercent = (answeredQuestions / questionCount) * 100

correctionStatus =
  if (manualCorrectionCount == 0) return "not_started"
  if (pendingCorrectionCount > 0) return "pending_review"
  if (correctedQuestionCount == manualCorrectionCount) return "corrected"
  return "in_progress"

pendingCorrectionCount = count(questions where manualCorrectionStatus == "pending")
correctedQuestionCount = count(questions where manualCorrectionStatus in ["corrected", "validated"])
manualCorrectionCount = count(questions where needsManualCorrection == true)

autoScore = sum(questions where !needsManualCorrection ? question.score : 0)
manualScore = sum(questions where needsManualCorrection ? question.teacherScore ?? 0 : 0)
finalScore = autoScore + manualScore
```

### Niveau question
```javascript
needsManualCorrection = (questionType == "ouverte" OR questionType == "courte" OR correctionType == "semi")

score = isCorrect == true ? questionPoints : 0
autoScore = (!needsManualCorrection && isCorrect == true) ? questionPoints : 0
manualScore = (needsManualCorrection && teacherScore != null) ? teacherScore : 0
finalScore = max(autoScore, manualScore)
```

---

## Transitions entre statuts

### Rendu de chapitre
```
not_submitted → submitted (apprenant clique "Rendre")
not_submitted → late_submitted (apprenant clique "Rendre" après deadline)
submitted → returned_for_revision (évaluateur demande révision)
submitted → validated (évaluateur approuve)
late_submitted → returned_for_revision (évaluateur demande révision)
late_submitted → validated (évaluateur approuve)
returned_for_revision → submitted (apprenant re-rend)
```

### Correction de chapitre
```
not_started → pending_review (questions manuelles détectées)
not_started → corrected (pas de questions manuelles)
pending_review → in_review (évaluateur commence correction)
in_review → corrected (toutes questions corrigées)
corrected → validated (évaluateur valide)
```

### Correction de question
```
not_needed → (pas de transition, reste not_needed)
pending → in_review (évaluateur ouvre la question)
in_review → corrected (évaluateur attribue score)
in_review → returned_for_revision (évaluateur demande révision)
corrected → validated (évaluateur valide définitivement)
returned_for_revision → pending (apprenant modifie et re-soumet)
```

---

## Cas particulier : Questions semi-automatiques

Les questions avec `correctionType == "semi"` ont un comportement hybride :

### Comportement
1. **Réponse exacte dans la liste** → Correction automatique immédiate
   - `isCorrect = true`
   - `manualCorrectionStatus = "corrected"` (pas d'intervention prof nécessaire)
   - `autoScore = questionPoints`

2. **Réponse non exacte mais plausible** → Validation manuelle requise
   - `isCorrect = null`
   - `manualCorrectionStatus = "pending"`
   - En attente de correction par l'évaluateur

### Implémentation
```javascript
// needsManualCorrection est TOUJOURS true pour les questions semi-auto
needsManualCorrection = (correctionType == "semi")

// Mais manualCorrectionStatus évolue selon la réponse
if (correctAnswers.includes(userAnswer)) {
    // Réponse exacte → auto-corrigé
    isCorrect = true;
    manualCorrectionStatus = "corrected";  // Pas besoin de validation
    autoScore = questionPoints;
} else {
    // Réponse non exacte → validation manuelle
    isCorrect = null;
    manualCorrectionStatus = "pending";
    autoScore = 0;
}
```

### Exemple JSON

```json
{
  "ch1_q4": {
    "type": "courte",
    "correctionType": "semi",
    "correctAnswers": ["blanche", "blanc"],
    "points": 2,
    
    // Cas 1 : Réponse exacte (auto-corrigé)
    "answer": "blanche",
    "isCorrect": true,
    "needsManualCorrection": true,
    "manualCorrectionStatus": "corrected",  // ← Pas d'intervention prof
    "autoScore": 2,
    "manualScore": 0,
    "finalScore": 2,
    
    // Cas 2 : Réponse non exacte (en attente)
    "answer": "neige",
    "isCorrect": null,
    "needsManualCorrection": true,
    "manualCorrectionStatus": "pending",  // ← En attente de validation
    "autoScore": 0,
    "manualScore": null,
    "finalScore": 0
  }
}
```

---

## Règles métier

### 1. Rendu de chapitre
- Un chapitre ne peut être rendu que si `completionPercent == 100`
- Le rendu est automatique ou manuel selon configuration
- `submittedAt` est défini au moment du rendu
- Si `submittedAt > submissionDeadline` → `submissionStatus = "late_submitted"`

### 2. Correction manuelle
- Seules les questions avec `needsManualCorrection == true` nécessitent correction
- `manualCorrectionStatus` passe à `pending` quand le chapitre est rendu
- L'évaluateur peut corriger question par question
- `teacherScore` remplace `autoScore` si attribué

### 3. Validation finale
- Un chapitre ne peut être validé que si `correctionStatus == "corrected"`
- `validatedAt` marque la fin du processus
- Après validation, le chapitre est verrouillé (plus de modifications possibles)

### 4. Demandes de révision
- L'évaluateur peut demander révision d'une question ou du chapitre entier
- `revisionRequested = true` bloque la question pour l'apprenant
- L'apprenant peut modifier sa réponse et re-soumettre
- `revisionRequestedAt` est défini à chaque demande

### 5. Scores
- `autoScore` : calculé automatiquement pour questions auto-corrigées
- `manualScore` : attribué par l'évaluateur pour questions manuelles
- `finalScore = autoScore + manualScore`
- Si une question manuelle n'a pas de `teacherScore`, elle compte comme 0

---

## Pièges à éviter

### ❌ À NE PAS FAIRE

1. **Stocker des champs calculés**
   - Ne jamais stocker `completionPercent`, `finalScore`, etc.
   - Toujours recalculer depuis les données brutes

2. **Redondance de statuts**
   - Ne pas avoir `status` et `submissionStatus` qui disent la même chose
   - `status` = progression, `submissionStatus` = rendu

3. **Oublier les cas limites**
   - Chapitre rendu mais aucune question manuelle → `correctionStatus = "corrected"` directement
   - Question auto-corrigée → `manualCorrectionStatus = "not_needed"` toujours

4. **Mauvaise gestion des null**
   - `isCorrect = null` signifie "pas encore évalué" (différent de false)
   - `teacherScore = null` signifie "pas encore corrigé"

5. **Performance localStorage**
   - Ne pas stocker `attemptHistory` complet si trop volumineux
   - Limiter à 5 tentatives maximum

### ✅ BONNES PRATIQUES

1. **Calculer à la volée**
   - Tous les compteurs globaux sont recalculés au chargement
   - Les scores sont recalculés à chaque modification

2. **Séparer stockage et affichage**
   - Stocker les données brutes
   - Calculer les valeurs affichées dynamiquement

3. **Garder l'historique**
   - `attemptHistory` pour tracer les tentatives
   - `submittedAt`, `correctedAt`, `validatedAt` pour le suivi temporel

4. **Flags pour le dashboard**
   - `teacherMonitoring.flags` permet un filtrage rapide
   - `priorityLevel` pour trier les corrections urgentes

---

## Exemples concrets

### Exemple 1 : Chapitre rendu mais non encore corrigé

```json
{
  "chapters": {
    "1": {
      "status": "completed",
      "completionPercent": 100,
      "answeredQuestions": 6,
      "questionCount": 6,
      
      "submissionStatus": "submitted",
      "submittedAt": "2026-04-03T10:30:00.000Z",
      "submissionDeadline": "2026-04-05T23:59:59.000Z",
      
      "correctionStatus": "pending_review",
      "pendingCorrectionCount": 2,
      "correctedQuestionCount": 0,
      "manualCorrectionCount": 2,
      
      "autoScore": 4,
      "manualScore": 0,
      "finalScore": 4,
      
      "manualQuestionsTotalCount": 2,
      "manualQuestionsAutoCorrectedCount": 0,
      "manualQuestionsPendingCount": 2,
      "manualQuestionsCorrectedCount": 0,
      "manualQuestionsUnansweredCount": 0,
      
      "questions": {
        "ch1_q1": {
          "answered": true,
          "isCorrect": true,
          "score": 1,
          "needsManualCorrection": false,
          "manualCorrectionStatus": "not_needed"
        },
        "ch1_q3": {
          "answered": true,
          "isCorrect": null,
          "score": 0,
          "needsManualCorrection": true,
          "manualCorrectionStatus": "pending",
          "teacherScore": null
        }
      }
    }
  }
}
```

### Exemple 2 : Chapitre validé définitivement

```json
{
  "chapters": {
    "1": {
      "status": "completed",
      "completionPercent": 100,
      
      "submissionStatus": "validated",
      "submittedAt": "2026-04-03T10:30:00.000Z",
      "approvedAt": "2026-04-04T14:00:00.000Z",
      
      "correctionStatus": "validated",
      "correctedAt": "2026-04-04T13:50:00.000Z",
      "validatedAt": "2026-04-04T14:00:00.000Z",
      "correctedBy": "PROF001",
      
      "autoScore": 4,
      "manualScore": 2,
      "finalScore": 6,
      
      "manualQuestionsTotalCount": 1,
      "manualQuestionsAutoCorrectedCount": 0,
      "manualQuestionsPendingCount": 0,
      "manualQuestionsCorrectedCount": 1,
      "manualQuestionsUnansweredCount": 0,
      
      "teacherComment": "Excellent travail !",
      "teacherFeedbackSummary": "Très bonnes réponses aux questions ouvertes.",
      
      "questions": {
        "ch1_q3": {
          "isCorrect": true,
          "score": 1,
          "needsManualCorrection": true,
          "manualCorrectionStatus": "validated",
          "correctedBy": "PROF001",
          "correctedAt": "2026-04-04T13:30:00.000Z",
          "teacherScore": 1,
          "teacherComment": "Bonne dissertation, bien structurée.",
          "teacherFeedback": "Vous avez bien identifié les points clés."
        }
      }
    }
  }
}
```

### Exemple 3 : Question en attente de correction manuelle

```json
{
  "questions": {
    "ch1_q3": {
      "id": "ch1_q3",
      "type": "ouverte",
      "questionText": "Expliquez le théorème de Pythagore",
      "points": 3,
      
      "answered": true,
      "answer": "Le théorème de Pythagore dit que dans un triangle rectangle, le carré de l'hypoténuse est égal à la somme des carrés des deux autres côtés.",
      "isCorrect": null,
      "score": 0,
      "attempts": 1,
      "answeredAt": "2026-04-03T10:20:00.000Z",
      
      "needsManualCorrection": true,
      "manualCorrectionStatus": "pending",
      "correctedBy": null,
      "correctedAt": null,
      "teacherComment": "",
      "teacherFeedback": "",
      "teacherScore": null,
      "revisionRequested": false,
      
      "autoScore": 0,
      "manualScore": 0,
      "finalScore": 0
    }
  }
}
```

### Exemple 4 : Question renvoyée à l'apprenant pour révision

```json
{
  "questions": {
    "ch1_q3": {
      "id": "ch1_q3",
      "type": "ouverte",
      "questionText": "Expliquez le théorème de Pythagore",
      "points": 3,
      
      "answered": true,
      "answer": "C'est un théorème sur les triangles.",
      "isCorrect": null,
      "score": 0,
      "attempts": 1,
      "answeredAt": "2026-04-03T10:20:00.000Z",
      
      "needsManualCorrection": true,
      "manualCorrectionStatus": "returned_for_revision",
      "correctedBy": "PROF001",
      "correctedAt": null,
      "teacherComment": "Réponse trop courte. Développez davantage.",
      "teacherFeedback": "Vous devez expliquer la formule a² + b² = c² et donner un exemple concret.",
      "teacherScore": null,
      "revisionRequested": true,
      "revisionRequestedAt": "2026-04-04T09:00:00.000Z",
      
      "autoScore": 0,
      "manualScore": 0,
      "finalScore": 0
    }
  }
}
```

---

## Dashboard évaluateur - Champs utiles

Pour construire un dashboard évaluateur efficace, voici les indicateurs à calculer :

### Indicateurs globaux
```javascript
{
  totalStudents: number,
  totalChapters: number,
  pendingCorrections: number,        // globalPendingCorrections
  submittedChapters: number,         // globalSubmittedChapters
  approvedChapters: number,          // globalApprovedChapters
  lateSubmissions: number,           // globalLateSubmissions
  revisionRequests: number,          // globalRevisionRequests
  avgCompletionRate: number,         // moyenne des completionPercent
  avgScore: number                   // moyenne des finalScore
}
```

### Indicateurs complémentaires par chapitre (pour questions manuelles)

Ces indicateurs fournissent une vue détaillée de l'état des questions nécessitant une correction manuelle, en tenant compte des questions semi-automatiques.

| Champ | Type | Description | Calcul |
|-------|------|-------------|--------|
| `manualQuestionsTotalCount` | number | Total questions avec `needsManualCorrection = true` | `count(needsManualCorrection)` |
| `manualQuestionsAutoCorrectedCount` | number | Questions semi-auto avec réponse exacte (auto-corrigées) | `count(needsManualCorrection AND manualCorrectionStatus = "not_needed" AND answered)` |
| `manualQuestionsPendingCount` | number | Questions manuelles **vraiment en attente** | `count(needsManualCorrection AND manualCorrectionStatus = "pending")` |
| `manualQuestionsCorrectedCount` | number | Questions manuelles corrigées par le prof | `count(needsManualCorrection AND manualCorrectionStatus IN ["corrected", "validated"])` |
| `manualQuestionsUnansweredCount` | number | Questions manuelles non répondues | `count(needsManualCorrection AND NOT answered)` |

### Relation entre indicateurs

```javascript
manualQuestionsTotalCount = 
    manualQuestionsAutoCorrectedCount + 
    manualQuestionsPendingCount + 
    manualQuestionsCorrectedCount + 
    manualQuestionsUnansweredCount
```

### Exemple concret

Dans un chapitre avec 3 questions semi-automatiques :
- Q1 : réponse exacte → auto-corrigée
- Q2 : réponse inexacte → en attente
- Q3 : non répondue → non répondue

Résultat :
- `manualQuestionsTotalCount = 3`
- `manualQuestionsAutoCorrectedCount = 1` (Q1 auto-corrigée)
- `manualQuestionsPendingCount = 1` (Q2 en attente)
- `manualQuestionsCorrectedCount = 0` (aucune corrigée par le prof)
- `manualQuestionsUnansweredCount = 1` (Q3 non répondue)

### Affichage recommandé dans le dashboard

```
📝 Questions à correction manuelle : 3
├── Auto-corrigées (réponse exacte) : 1 ✅
├── En attente de correction : 1 ⏳
├── Déjà corrigées : 0 ✓
└── Non répondues : 1 ❌
```

### Implémentation dans `recomputeChapterStats()`

```javascript
// Questions manuelles - indicateurs détaillés
chapter.manualQuestionsTotalCount = Object.values(chapter.questions)
    .filter(q => q.needsManualCorrection).length;

chapter.manualQuestionsAutoCorrectedCount = Object.values(chapter.questions)
    .filter(q => q.needsManualCorrection && 
                 q.manualCorrectionStatus === "not_needed" && 
                 q.answered).length;

chapter.manualQuestionsPendingCount = Object.values(chapter.questions)
    .filter(q => q.needsManualCorrection && 
                 q.manualCorrectionStatus === "pending").length;

chapter.manualQuestionsCorrectedCount = Object.values(chapter.questions)
    .filter(q => q.needsManualCorrection && 
                 ["corrected", "validated"].includes(q.manualCorrectionStatus)).length;

chapter.manualQuestionsUnansweredCount = Object.values(chapter.questions)
    .filter(q => q.needsManualCorrection && !q.answered).length;
```

### Filtres rapides
```javascript
{
  byPriority: {
    urgent: chapters where priorityLevel == "urgent",
    high: chapters where priorityLevel == "high",
    normal: chapters where priorityLevel == "normal",
    low: chapters where priorityLevel == "low"
  },
  byStatus: {
    pending: chapters where correctionStatus == "pending_review",
    inProgress: chapters where correctionStatus == "in_progress",
    corrected: chapters where correctionStatus == "corrected",
    validated: chapters where correctionStatus == "validated"
  },
  bySubmission: {
    notSubmitted: chapters where submissionStatus == "not_submitted",
    submitted: chapters where submissionStatus == "submitted",
    late: chapters where submissionStatus == "late_submitted",
    returned: chapters where submissionStatus == "returned_for_revision",
    validated: chapters where submissionStatus == "validated"
  }
}
```

### Alertes
```javascript
{
  urgentCorrections: chapters where priorityLevel == "urgent" AND correctionStatus == "pending_review",
  overdueChapters: chapters where submissionDeadline < now AND submissionStatus == "not_submitted",
  pendingRevisions: chapters where revisionRequested == true,
  incompleteSubmissions: chapters where completionPercent < 100 AND submissionStatus != "not_submitted"
}
```

---

## Résumé des bonnes pratiques

1. **Stocker uniquement les données brutes** - Tout le reste est calculé
2. **Séparer progression, rendu, correction, validation** - 4 concepts distincts
3. **Utiliser des statuts explicites** - Pas d'ambiguïté sur l'état
4. **Garder l'historique** - `attemptHistory`, dates, etc.
5. **Penser dashboard dès le début** - Champs utiles pour l'évaluateur
6. **Éviter les redondances** - Un champ = une information
7. **Gérer les cas limites** - null, 0, vide ont des significations différentes
8. **Performance localStorage** - Calculer plutôt que stocker
9. **Scalabilité** - Structure extensible pour futures fonctionnalités
10. **Maintenance** - Code et données faciles à comprendre et modifier