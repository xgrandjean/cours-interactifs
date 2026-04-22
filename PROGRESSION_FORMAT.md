# 📋 FORMAT DE DONNÉES PROGRESSION
## Règles de gestion des statuts et scores

> ⚠️ Ce document est la SOURCE DE VÉRITÉ. Toute modification doit être reportée ici.

---

## 🎯 Règles des statuts CorrectionModal
> Valide depuis 21/04/2026

| Statut | Condition | Badge |
|---|---|---|
| ⚙️ **Automatique** | `systemScore != null && (displayScore == null || displayScore == systemScore)` | Vert |
| ✏️ **Modifiée** | `systemScore != null && displayScore != null && displayScore != systemScore` | Orange |
| ✅ **Corrigé** | `systemScore == null && displayScore != null` | Vert |
| ⏳ **A corriger** | `systemScore == null && displayScore == null` | Rouge |

**Définitions :**
- `systemScore` = `question.theoreticalScore ?? question.score`
- `displayScore` = `question.teacherScore` (si valide)

---

## 🎯 Règles calcul score théorique
> Dans `correctionModal.calculateAutoTheoreticalScore()`

| Type de question | Comportement |
|---|---|
| `auto` | Calcul complet selon réponses / tentatives |
| `semi` / `manuel` | On retourne **DIRECTEMENT** `qData.score` (jamais de recalcul) |
| `semi` / `manuel` sans réponse | `return 0` (statut Automatique) |

---

## 🎯 Règles questions ouvertes
> Dans `chapitre.handleOpenAnswer()`

| Cas | Valeur `score` | Statut |
|---|---|---|
| Réponse vide | `0` | ⚙️ Automatique |
| `answer.length < minLength` | `0` | ⚙️ Automatique |
| `answer.length >= minLength` | `null` | ⏳ A corriger |

✅ Il n'y a **JAMAIS** de calcul coté professeur, on respecte toujours le score calculé lors de la réponse de l'élève.