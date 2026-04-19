# # STRATEGIE_DEV.MD
# # Stratégie de Développement - Tableaux de Bord Apprenant & évaluateur (V2.1)

---

## 🧠 Architecture Validée (Version 2.1)

### Structure de Données Centralisée

* **Source unique** : `progressManager.js` gère toutes les données
* **Format standard** : défini dans `PROGRESSION_FORMAT.md`
* **Calcul dynamique** : aucun champ dérivé stocké
* **Principe fondamental** : seules les données brutes sont persistées

---

## 🧩 Concepts Clés (À respecter impérativement)

### 1. Distinction des concepts

| Concept                   | Description                      | Qui gère            |
| ------------------------- | -------------------------------- | ------------------- |
| **Progression apprenant**     | Questions répondues, cours lus   | Automatique         |
| **Rendu apprenant**           | Chapitre marqué comme "rendu"    | Manuel (apprenant)      |
| **Correction évaluateur** | Questions corrigées, scores      | Manuel (évaluateur) |
| **Validation finale**     | Chapitre approuvé définitivement | Manuel (évaluateur) |

---

## 🏷️ 2. Statuts imposés (non négociables)

### Rendu de chapitre

```json
["not_submitted", "submitted", "late_submitted", "returned_for_revision", "validated"]
```

### Correction de chapitre

```json
["not_started", "in_progress", "pending_review", "corrected", "validated"]
```

### Correction de question

```json
["not_needed", "pending", "in_review", "corrected", "validated", "returned_for_revision"]
```

---

## 🆕 3. Modes d’évaluation (NORMAL / EXAMEN)

### Principe fondamental

Le comportement du système dépend du **mode du chapitre**.

```json
"mode": "normal | examen"
```

---

### Context d’évaluation

```json
"evaluationContext": {
  "mode": "normal | examen",
  "isExam": true,
  "autoFeedbackEnabled": true,
  "teacherFeedbackEnabled": true,
  "showHints": true,
  "showSolutions": false
}
```

---

## 🔒 3.1 Règles UI MODE EXAMEN (STRICTES)

### 📌 Règle DE CONFIGURATION À RESPECTER PARTOUT

✅ **FUSION OBLIGATOIRE**:
Tout accès à un chapitre doit obligatoirement faire la fusion:
```javascript
// JAMAIS utiliser directement le JSON statique ❌
const chapterConfig = window.chaptersIndex.chapters.find(ch => ch.id == id);

// ✅ TOUJOURS faire la fusion
const staticConfig = window.chaptersIndex.chapters.find(ch => ch.id == id);
const storageConfig = await storage.get('chapter_config');
const mergedConfig = {
    ...staticConfig,
    ...(storageConfig && storageConfig[id] ? storageConfig[id] : {})
};
```

👉 Cette fusion doit être faite DANS TOUS LES FICHIERS: `chapitre.js`, `chapterDetector.js`, `teacherChapters.js`, etc.

### 📌 Source unique de vérité : `submissionStatus`

| submissionStatus | État         | Lock UI | Feedback |
| ---------------- | ------------ | ------- | -------- |
| not_submitted    | En cours     | ❌       | ❌        |
| submitted        | Rendu        | 🔒      | ❌        |
| late_submitted   | Rendu tardif | 🔒      | ❌        |
| validated         | Corrigé      | 🔒      | ✅        |

---

### 🔒 Règle de verrouillage globale

```javascript
const isChapterLocked =
  ['submitted', 'late_submitted', 'validated'].includes(submissionStatus);
```

👉 Si `true` :

* toutes les questions sont désactivées
* aucune exception (QCM, texte, input)
* aucune logique locale autorisée

---

### 💬 Règle globale des feedbacks

Le système de feedback dépend du mode du chapitre :

- Mode normal : feedback progressif autorisé après soumission
- Mode examen : feedback uniquement après validation finale (validated)

La règle est contrôlée uniquement par `submissionStatus` et `evaluationContext.mode`.

Aucune logique au niveau question ne peut influencer l’affichage des feedbacks en mode examen.

### 🚫 Anti-patterns interdits

* désactiver seulement certaines questions ❌
* activer textarea après rendu ❌
* afficher feedback avant approval ❌
* logique basée sur `question.isCorrect` ❌
* logique basée sur `correctionType` ❌

---

## ⚠️ 3.2 Règle fondamentale

👉 Le chapitre est la **seule source de vérité en mode examen**

---

## 🎯 3.3 Règles d'affichage corrections manuelles

✅ **Règle IMPERATIVE** pour l'affichage des questions corrigées par le professeur:

| Valeur points attribuée | Icône | Couleur |
|---|---|---|
| 🟢 `score == pointsMax` | ✅ | Vert |
| 🟡 `0 < score < pointsMax` | 🟠 | Orange |
| 🔴 `score <= 0` | ❌ | Rouge |

👉 **Aucun autre icône n'est autorisé** pour les questions en statut `corrected`.

Cette règle s'applique **par tout** : bilan détaillé, indicateurs, tableaux, dashboards.

---

## 🧮 4. Règles de calcul

### correctionStatus

```javascript
if (manualCorrectionCount === 0) return "validated";
else if (pendingCorrectionCount === manualCorrectionCount) return "pending_review";
else if (pendingCorrectionCount > 0 && correctedQuestionCount > 0) return "in_progress";
else if (correctedQuestionCount === manualCorrectionCount) return "corrected";
else return "not_started";
```

---

### submissionStatus

```javascript
if (approvedAt) return "validated";
else if (revisionRequestedAt) return "returned_for_revision";
else if (submittedAt) return isLate ? "late_submitted" : "submitted";
else return "not_submitted";
```

---

### Scores

```javascript
autoScore = questions auto-corrigées correctes
manualScore = teacherScore des questions manuelles
finalScore = autoScore + manualScore
```

✅ **Priorité absolue des notes manuelles**:
> Toute note saisie manuellement par le professeur **remplace définitivement tout calcul automatique**.
> Aucune règle, aucun calcul, aucune logique ne devra jamais modifier ou écraser une valeur `score` définie manuellement.

Ce principe s'applique à `getChapterFinalNote`, `getChapterFinalNoteBrute`, tous les dashboards et tous les calculs.

---

## 🧪 5. Questions semi-automatiques

```javascript
if (correctionType === "semi") {
  if (correctAnswers.includes(userAnswer)) {
    manualCorrectionStatus = "not_needed";
    autoScore = points;
  } else {
    manualCorrectionStatus = "pending";
    autoScore = 0;
  }
}
```

---

## 💬 6. Règles de feedback

### 🔹 Mode normal

* feedback immédiat autorisé
* correction progressive
* aides disponibles

---

### 🔹 Mode examen

```javascript
if (mode === "examen") {
  feedbackVisible = submissionStatus === "validated";
  hintsEnabled = false;
  instantCorrection = false;
}
```

---

## 📊 7. Dashboards

### Apprenant

* progression → `completionPercent`
* note → `finalScore`
* état → `submissionStatus`
* feedback → uniquement si `validated`

---

### évaluateur

* stats globales → `computeGlobalStats`
* filtres :

  * `submissionStatus`
  * `correctionStatus`
* priorité :

  * `teacherMonitoring.priorityLevel`

---

## ⚙️ 8. Fonctions

```javascript
ProgressManager.computeGlobalStats(progress);

ProgressManager.submitChapter(progress, chapterId, deadline);

ProgressManager.teacherCorrectQuestion(progress, chapterId, questionId, score, comment, feedback, action);

ProgressManager.teacherValidateQuestion(progress, chapterId, questionId);

ProgressManager.teacherApproveChapter(progress, chapterId);

ProgressManager.teacherRequestRevision(progress, chapterId, comment);
```

---

## ⚠️ 9. Pièges à éviter

* ❌ stocker champs calculés
* ❌ UI examen basée sur question-level
* ❌ utiliser isCorrect pour UI
* ❌ mélanger autoScore/manualScore incorrectement
* ❌ bypass submissionStatus

---

## ✅ 10. Checklist nouvelle fonctionnalité

* [ ] champs dans initChapter / initQuestion
* [ ] recalcul dans recomputeChapterStats
* [ ] respect statuts imposés
* [ ] compatibilité mode examen
* [ ] logs de test
* [ ] doc mise à jour
* [ ] export ProgressManager OK

---

## 📁 11. Fichiers de référence

* `progressManager.js`
* `PROGRESSION_FORMAT.md`
* `chapitre.js`
* `chapters_index.json`

---

## 🧷 Conclusion

Ce système impose une règle stricte :

👉 **le chapitre contrôle tout en mode examen**
👉 **les questions ne pilotent jamais l’UI d’évaluation**

---

Si tu veux, prochaine étape je peux te faire :
👉 une version **ultra robuste “anti-triche examen + verrouillage total + audit évaluateur”** prête production.
