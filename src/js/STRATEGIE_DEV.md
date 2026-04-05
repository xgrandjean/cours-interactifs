# Stratégie de Développement - Tableaux de Bord Étudiant & Enseignant

## Architecture Validée (Version 2.0)

### Structure de Données Centralisée
- **Source unique** : `progressManager.js` gère toutes les données
- **Format standard** : Défini dans `PROGRESSION_FORMAT.md`
- **Calcul dynamique** : Les champs calculés ne sont pas stockés, recalculés à chaque chargement

### Concepts Clés (À respecter impérativement)

#### 1. Distinction des Concepts
| Concept | Description | Qui gère |
|---------|-------------|----------|
| **Progression élève** | Questions répondues, cours lus | Automatique |
| **Rendu élève** | Chapitre marqué comme "rendu" | Manuel (élève) |
| **Correction enseignant** | Questions corrigées, scores | Manuel (enseignant) |
| **Validation finale** | Chapitre approuvé définitivement | Manuel (enseignant) |

#### 2. Statuts Imposés (Non négociables)

**Rendu de chapitre** :
```json
["not_submitted", "submitted", "late_submitted", "returned_for_revision", "approved"]
```

**Correction de chapitre** :
```json
["not_started", "in_progress", "pending_review", "corrected", "validated"]
```

**Correction de question** :
```json
["not_needed", "pending", "in_review", "corrected", "validated", "returned_for_revision"]
```

#### 3. Règles de Calcul (À implémenter telles quelles)

**correctionStatus** :
```javascript
if (manualCorrectionCount === 0) → "validated"
else if (pendingCorrectionCount === manualCorrectionCount) → "pending_review"
else if (pendingCorrectionCount > 0 && correctedQuestionCount > 0) → "in_progress"
else if (correctedQuestionCount === manualCorrectionCount) → "corrected"
else → "not_started"
```

**submissionStatus** :
```javascript
if (approvedAt) → "approved"
else if (revisionRequestedAt) → "returned_for_revision"
else if (submittedAt) → "submitted" ou "late_submitted"
else → "not_submitted"
```

**Scores** :
```javascript
autoScore = questions auto-corrigées correctes
manualScore = questions manuelles avec teacherScore
finalScore = autoScore + manualScore
```

### Questions Semi-Automatiques (Cas particulier)

```javascript
if (correctionType === "semi") {
  if (réponse exacte dans correctAnswers) {
    manualCorrectionStatus = "not_needed"
    autoScore = points
  } else {
    manualCorrectionStatus = "pending"
    autoScore = 0
  }
}
```

## Pour les Dashboards

### Dashboard Étudiant
- Utiliser `completionPercent` pour la progression
- Afficher `finalScore` comme note
- Montrer `submissionStatus` pour l'état de rendu
- Lister les questions avec `manualCorrectionStatus = "pending"` en attente

### Dashboard Enseignant
- Utiliser `computeGlobalStats()` pour les compteurs globaux
- Filtrer par `submissionStatus` pour voir rendus/retards
- Filtrer par `correctionStatus` pour voir corrections en attente
- Trier par `teacherMonitoring.priorityLevel` pour les urgences

### Fonctions à Utiliser
```javascript
// Récupérer les stats globales
const stats = ProgressManager.computeGlobalStats(progress);

// Soumettre un chapitre
ProgressManager.submitChapter(progress, chapterId, deadline);

// Corriger une question
ProgressManager.teacherCorrectQuestion(progress, chapterId, questionId, score, comment, feedback, action);

// Valider une question
ProgressManager.teacherValidateQuestion(progress, chapterId, questionId);

// Approuver un chapitre
ProgressManager.teacherApproveChapter(progress, chapterId);

// Demander une révision
ProgressManager.teacherRequestRevision(progress, chapterId, comment);
```

## Pièges à Éviter

1. **Ne jamais stocker les champs calculés** - Toujours recalculer via `recomputeChapterStats()`
2. **Respecter les statuts imposés** - Ne pas inventer de nouveaux statuts
3. **Séparer autoScore/manualScore** - Ne pas mélanger les deux
4. **Gérer les null correctement** - `isCorrect = null` ≠ `false`
5. **Conserver la rétrocompatibilité** - Le champ `score` existe toujours (= `finalScore`)

## Checklist pour Nouvelle Fonctionnalité

- [ ] Les nouveaux champs sont-ils dans `initChapter()` ou `initQuestion()` ?
- [ ] Le recalcul est-il dans `recomputeChapterStats()` ?
- [ ] Les statuts utilisent-ils la liste imposée ?
- [ ] Y a-t-il un console.log `[TEST]` pour le débogage ?
- [ ] La documentation `PROGRESSION_FORMAT.md` est-elle mise à jour ?
- [ ] La fonction est-elle exportée dans `window.ProgressManager` ?

## Fichiers de Référence

- `src/js/progressManager.js` - Coeur du système
- `src/js/PROGRESSION_FORMAT.md` - Documentation complète
- `src/js/chapitre.js` - Interface utilisateur
- `src/chapters/chapters_index.json` - Configuration des chapitres

---

**Cette stratégie doit être relue avant chaque nouvelle implémentation pour garantir la cohérence de l'architecture.**