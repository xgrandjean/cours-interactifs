# Structure Standard de Progression Étudiant

Ce document décrit le format standard pour stocker la progression des étudiants dans le localStorage.

## Clé de stockage

```
student_<id>_progress
```

Exemple : `student_123_progress`

## Structure JSON complète

```json
{
  "studentId": "123",
  "studentName": "Alice",
  "contentHash": "abc123",
  "startedAt": "2026-04-03T10:00:00.000Z",
  "lastUpdated": "2026-04-03T10:30:00.000Z",
  "completedChapters": 1,
  "totalScore": 8,
  "chapters": {
    "1": {
      "status": "in_progress",
      "score": 8,
      "maxScore": 12,
      "questionCount": 6,
      "answeredQuestions": 5,
      "completionPercent": 83,
      "chapterHash": "a91bc33de1",
      "isLocked": false,
      "unlockedAt": "2026-04-03T10:00:00.000Z",
      "createdAt": "2026-04-03T10:00:00.000Z",
      "updatedAt": "2026-04-03T10:25:00.000Z",
      "completedAt": null,
      "questions": {
        "ch1_q1": {
          "questionHash": "f3b19a2210",
          "answered": true,
          "answer": 0,
          "isCorrect": true,
          "score": 1,
          "attempts": 1,
          "attemptHistory": [
            {
              "answer": 0,
              "isCorrect": true,
              "score": 1,
              "answeredAt": "2026-04-03T10:15:00.000Z"
            }
          ],
          "answeredAt": "2026-04-03T10:15:00.000Z",
          "createdAt": "2026-04-03T10:15:00.000Z",
          "updatedAt": "2026-04-03T10:15:00.000Z",
          "needsManualCorrection": false,
          "manualCorrectionStatus": "none"
        }
      }
    }
  }
}
```

## Description des champs

### Niveau racine

| Champ | Type | Description |
|-------|------|-------------|
| `studentId` | string | Identifiant unique de l'étudiant |
| `studentName` | string | Nom de l'étudiant |
| `contentHash` | string | Hash MD5 (10 caractères) de la structure des chapitres. Permet de détecter les changements de contenu |
| `startedAt` | string (ISO date) | Date de début de la progression |
| `lastUpdated` | string (ISO date) | Date de dernière mise à jour globale |
| `completedChapters` | number | Nombre de chapitres complétés |
| `totalScore` | number | Score total accumulé sur tous les chapitres |
| `chapters` | object | Objet contenant les données de progression par chapitre |

### Niveau chapitre (`chapters["<chapter_id>"]`)

| Champ | Type | Description |
|-------|------|-------------|
| `status` | string | Statut du chapitre : `"not_started"`, `"in_progress"`, `"completed"` |
| `score` | number | Score obtenu dans ce chapitre |
| `maxScore` | number | Score maximum possible dans ce chapitre |
| `questionCount` | number | Nombre total de questions dans le chapitre |
| `answeredQuestions` | number | Nombre de questions auxquelles l'étudiant a répondu |
| `completionPercent` | number | Pourcentage de progression (0-100) |
| `chapterHash` | string | Hash du chapitre issu de chapters_index.json |
| `isLocked` | boolean | Indique si le chapitre est verrouillé |
| `unlockedAt` | string (ISO date) \| null | Date de déverrouillage du chapitre |
| `createdAt` | string (ISO date) | Date de création de la progression du chapitre |
| `updatedAt` | string (ISO date) | Date de dernière modification du chapitre |
| `completedAt` | string (ISO date) \| null | Date de complétion du chapitre, ou null si non complété |
| `questions` | object | Objet contenant les données de progression par question |

### Niveau question (`chapters["<chapter_id>"].questions["<question_id>"]`)

| Champ | Type | Description |
|-------|------|-------------|
| `questionHash` | string | Hash de la question issu de chapters_index.json |
| `answered` | boolean | Indique si la question a reçu une réponse |
| `answer` | any \| null | La réponse donnée par l'étudiant |
| `isCorrect` | boolean \| null | Indique si la réponse est correcte (`null` si pas encore évaluée) |
| `score` | number | Score obtenu pour cette question |
| `attempts` | number | Nombre de tentatives |
| `attemptHistory` | array | Tableau des anciennes réponses (voir structure ci-dessous) |
| `answeredAt` | string (ISO date) \| null | Date de la dernière réponse |
| `createdAt` | string (ISO date) | Date de création de l'entrée question |
| `updatedAt` | string (ISO date) | Date de dernière mise à jour de la question |
| `needsManualCorrection` | boolean | Indique si la question nécessite une correction manuelle |
| `manualCorrectionStatus` | string | Statut de correction manuelle : `"none"`, `"pending"`, `"corrected"` |

### Structure de `attemptHistory`

```json
[
  {
    "answer": "3",
    "isCorrect": false,
    "score": 0,
    "answeredAt": "2026-04-03T10:10:00.000Z"
  },
  {
    "answer": "4",
    "isCorrect": true,
    "score": 1,
    "answeredAt": "2026-04-03T10:12:00.000Z"
  }
]
```

## Statuts

### Statuts de chapitre

| Statut | Description |
|--------|-------------|
| `not_started` | L'étudiant n'a pas encore commencé ce chapitre |
| `in_progress` | L'étudiant est en train de travailler sur ce chapitre |
| `completed` | L'étudiant a terminé ce chapitre (toutes les questions répondues) |

### Statuts de correction manuelle

| Statut | Description |
|--------|-------------|
| `none` | Pas de correction manuelle nécessaire |
| `pending` | En attente de correction par le professeur |
| `corrected` | Corrigé par le professeur |

## Fonctions utilitaires

```javascript
// Initialiser une nouvelle progression
function initProgress(studentId, studentName, contentHash) {
  return {
    studentId,
    studentName,
    contentHash,
    startedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    completedChapters: 0,
    totalScore: 0,
    chapters: {}
  };
}

// Initialiser un chapitre
function initChapter(chapterConfig) {
  const now = new Date().toISOString();
  const questions = {};
  const questionCount = chapterConfig.questions ? chapterConfig.questions.length : 0;
  
  if (chapterConfig.questions) {
    chapterConfig.questions.forEach(q => {
      questions[q.id] = initQuestion(q);
    });
  }
  
  return {
    status: "not_started",
    score: 0,
    maxScore: chapterConfig.maxPoints || 0,
    questionCount,
    answeredQuestions: 0,
    completionPercent: 0,
    chapterHash: chapterConfig.chapterHash || null,
    isLocked: false,
    unlockedAt: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    questions
  };
}

// Initialiser une question
function initQuestion(questionConfig) {
  const now = new Date().toISOString();
  return {
    questionHash: questionConfig.questionHash || null,
    answered: false,
    answer: null,
    isCorrect: null,
    score: 0,
    attempts: 0,
    attemptHistory: [],
    answeredAt: null,
    createdAt: now,
    updatedAt: now,
    needsManualCorrection: questionConfig.type === 'ouverte',
    manualCorrectionStatus: "none"
  };
}

// Enregistrer une réponse
function recordAnswer(progress, chapterId, questionId, answer, isCorrect, score) {
  const chapter = progress.chapters[chapterId];
  if (!chapter) return progress;
  
  const question = chapter.questions[questionId];
  if (!question) return progress;
  
  const now = new Date().toISOString();
  
  // Sauvegarder l'ancienne réponse dans l'historique si existe
  if (question.answered) {
    question.attemptHistory.push({
      answer: question.answer,
      isCorrect: question.isCorrect,
      score: question.score,
      answeredAt: question.answeredAt
    });
  }
  
  // Mettre à jour la question
  question.answered = true;
  question.answer = answer;
  question.isCorrect = isCorrect;
  question.score = score;
  question.attempts++;
  question.answeredAt = now;
  question.updatedAt = now;
  
  // Mettre à jour les statistiques du chapitre
  chapter.answeredQuestions = Object.values(chapter.questions).filter(q => q.answered).length;
  chapter.completionPercent = Math.round((chapter.answeredQuestions / chapter.questionCount) * 100);
  chapter.score = Object.values(chapter.questions).reduce((sum, q) => sum + (q.score || 0), 0);
  chapter.updatedAt = now;
  
  // Mettre à jour le statut
  if (chapter.answeredQuestions === chapter.questionCount) {
    chapter.status = 'completed';
    chapter.completedAt = now;
  } else if (chapter.answeredQuestions > 0) {
    chapter.status = 'in_progress';
  }
  
  // Mettre à jour les statistiques globales
  progress.completedChapters = Object.values(progress.chapters).filter(c => c.status === 'completed').length;
  progress.totalScore = Object.values(progress.chapters).reduce((sum, c) => sum + (c.score || 0), 0);
  progress.lastUpdated = now;
  
  return progress;
}

// Sauvegarder la progression
function saveProgress(studentId, progress) {
  progress.lastUpdated = new Date().toISOString();
  localStorage.setItem(`student_${studentId}_progress`, JSON.stringify(progress));
}

// Charger la progression
function loadProgress(studentId) {
  const data = localStorage.getItem(`student_${studentId}_progress`);
  return data ? JSON.parse(data) : null;
}
```

## Exemple complet avec données

```json
{
  "studentId": "123",
  "studentName": "Alice Dupont",
  "contentHash": "02105dc5eb",
  "startedAt": "2026-04-03T10:00:00.000Z",
  "lastUpdated": "2026-04-03T10:30:00.000Z",
  "completedChapters": 1,
  "totalScore": 8,
  "chapters": {
    "1": {
      "status": "completed",
      "score": 8,
      "maxScore": 9,
      "questionCount": 6,
      "answeredQuestions": 6,
      "completionPercent": 100,
      "chapterHash": "710c201482",
      "isLocked": false,
      "unlockedAt": "2026-04-03T10:00:00.000Z",
      "createdAt": "2026-04-03T10:00:00.000Z",
      "updatedAt": "2026-04-03T10:30:00.000Z",
      "completedAt": "2026-04-03T10:30:00.000Z",
      "questions": {
        "ch1_q1": {
          "questionHash": "abc0024885",
          "answered": true,
          "answer": 0,
          "isCorrect": true,
          "score": 1,
          "attempts": 1,
          "attemptHistory": [
            {
              "answer": 0,
              "isCorrect": true,
              "score": 1,
              "answeredAt": "2026-04-03T10:15:00.000Z"
            }
          ],
          "answeredAt": "2026-04-03T10:15:00.000Z",
          "createdAt": "2026-04-03T10:15:00.000Z",
          "updatedAt": "2026-04-03T10:15:00.000Z",
          "needsManualCorrection": false,
          "manualCorrectionStatus": "none"
        },
        "ch1_q2": {
          "questionHash": "4fc065dfbe",
          "answered": true,
          "answer": [1, 3],
          "isCorrect": true,
          "score": 1,
          "attempts": 1,
          "attemptHistory": [
            {
              "answer": [1, 3],
              "isCorrect": true,
              "score": 1,
              "answeredAt": "2026-04-03T10:16:00.000Z"
            }
          ],
          "answeredAt": "2026-04-03T10:16:00.000Z",
          "createdAt": "2026-04-03T10:16:00.000Z",
          "updatedAt": "2026-04-03T10:16:00.000Z",
          "needsManualCorrection": false,
          "manualCorrectionStatus": "none"
        },
        "ch1_q3": {
          "questionHash": "36133083a8",
          "answered": true,
          "answer": "Le cheval blanc d'Henri IV est blanc.",
          "isCorrect": null,
          "score": 0,
          "attempts": 1,
          "attemptHistory": [
            {
              "answer": "Le cheval blanc d'Henri IV est blanc.",
              "isCorrect": null,
              "score": 0,
              "answeredAt": "2026-04-03T10:20:00.000Z"
            }
          ],
          "answeredAt": "2026-04-03T10:20:00.000Z",
          "createdAt": "2026-04-03T10:20:00.000Z",
          "updatedAt": "2026-04-03T10:20:00.000Z",
          "needsManualCorrection": true,
          "manualCorrectionStatus": "pending"
        },
        "ch1_q4": {
          "questionHash": "c3c90b6714",
          "answered": true,
          "answer": "blanche",
          "isCorrect": true,
          "score": 2,
          "attempts": 1,
          "attemptHistory": [
            {
              "answer": "blanche",
              "isCorrect": true,
              "score": 2,
              "answeredAt": "2026-04-03T10:22:00.000Z"
            }
          ],
          "answeredAt": "2026-04-03T10:22:00.000Z",
          "createdAt": "2026-04-03T10:22:00.000Z",
          "updatedAt": "2026-04-03T10:22:00.000Z",
          "needsManualCorrection": false,
          "manualCorrectionStatus": "none"
        },
        "ch1_q5": {
          "questionHash": "940b1582b4",
          "answered": true,
          "answer": "4",
          "isCorrect": true,
          "score": 3,
          "attempts": 1,
          "attemptHistory": [
            {
              "answer": "4",
              "isCorrect": true,
              "score": 3,
              "answeredAt": "2026-04-03T10:25:00.000Z"
            }
          ],
          "answeredAt": "2026-04-03T10:25:00.000Z",
          "createdAt": "2026-04-03T10:25:00.000Z",
          "updatedAt": "2026-04-03T10:25:00.000Z",
          "needsManualCorrection": false,
          "manualCorrectionStatus": "none"
        },
        "ch1_q6": {
          "questionHash": "54fac06c01",
          "answered": true,
          "answer": 1,
          "isCorrect": true,
          "score": 1,
          "attempts": 1,
          "attemptHistory": [
            {
              "answer": 1,
              "isCorrect": true,
              "score": 1,
              "answeredAt": "2026-04-03T10:28:00.000Z"
            }
          ],
          "answeredAt": "2026-04-03T10:28:00.000Z",
          "createdAt": "2026-04-03T10:28:00.000Z",
          "updatedAt": "2026-04-03T10:28:00.000Z",
          "needsManualCorrection": false,
          "manualCorrectionStatus": "none"
        }
      }
    }
  }
}
```

## Utilisation avec contentHash

Le `contentHash` permet de détecter les changements dans la structure des chapitres :

1. Lors du chargement de l'application, comparer le `contentHash` stocké avec celui du fichier `chapters_index.json`
2. Si les hash diffèrent, informer l'utilisateur que le contenu a changé
3. Proposer soit une migration (mettre à jour le hash) soit une réinitialisation

## Gestion des tentatives multiples

Lorsqu'un étudiant répond plusieurs fois à une question :
1. L'ancienne réponse est poussée dans `attemptHistory`
2. `attempts` est incrémenté
3. `updatedAt` est mis à jour
4. Les statistiques sont recalculées