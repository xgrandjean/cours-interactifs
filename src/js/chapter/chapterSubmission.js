// ============================================================================
// CHAPTER SUBMISSION - Gestion des rendus, validation et verrouillage
// ============================================================================
// Responsabilités :
//   - validateAllQuestions (évaluation globale en mode examen)
//   - handleSubmitChapter (rendu de copie)
//   - lockChapterAfterSubmission (verrouillage post-rendu)
// ============================================================================

const ChapterSubmission = {

    // ------------------------------------------------------------------------
    // VALIDATION GLOBALE (MODE EXAMEN)
    // ------------------------------------------------------------------------

    validateAllQuestions() {
        const questions = document.querySelectorAll('.question-section');
        let totalPoints = 0;
        let earnedPoints = 0;
        let unansweredQuestions = [];

        // 🔍 1. Détection des questions non répondues
        questions.forEach(question => {
            const result = QuestionEngine.evaluate(question);
            if (!result.hasAnswer) {
                unansweredQuestions.push(question);
            }
        });

        const globalFeedback = document.getElementById('global-feedback');

        // ⚠️ 2. Confirmation si incomplet
        if (unansweredQuestions.length > 0) {
            const confirmSubmit = confirm(
                `⚠️ Attention : ${unansweredQuestions.length} question(s) sans réponse.\n\n` +
                `Souhaitez-vous vraiment valider sans y répondre ?\n\n` +
                `Les réponses manquantes seront comptées comme incorrectes.`
            );

            if (!confirmSubmit) {
                if (globalFeedback) {
                    globalFeedback.className = 'feedback show warning';
                    globalFeedback.innerHTML = `
                        ⚠️ Validation annulée.<br>
                        Veuillez répondre aux questions manquantes avant de valider.
                    `;
                }
                return false;
            }

            if (globalFeedback) globalFeedback.innerHTML = '';
        }

        // ✅ 3. Évaluation + sync
        questions.forEach(question => {
            const points = parseInt(question.dataset.points) || 0;
            totalPoints += points;

            const result = QuestionEngine.evaluate(question);

            if (result.isCorrect) {
                earnedPoints += points;
            }

            const answer = result.hasAnswer ? result.userAnswer : null;

            syncAnswerToProgress(
                question.dataset.questionId,
                answer,
                result.isCorrect,
                result.isCorrect ? points : 0
            );
        });

        // 🧠 4. Sync exam mode
        const pm = getProgressManager();
        if (pm.saveProgress && ChapterSession.progress && ChapterSession.chapterId) {
            const chapter = ChapterSession.progress.chapters?.[ChapterSession.chapterId];

            if (chapter) {
                chapter.examModeValidated = true;
                chapter.examModeValidatedAt = new Date().toISOString();

                if (pm.recomputeChapterStats) pm.recomputeChapterStats(chapter);
                if (pm.recomputeGlobalStats) pm.recomputeGlobalStats(ChapterSession.progress);
                pm.saveProgress(ChapterSession.studentId, ChapterSession.progress);
            }
        }

        // 🎯 5. Feedback global
        if (globalFeedback) {
            globalFeedback.className = 'feedback show info';
            globalFeedback.innerHTML = unansweredQuestions.length > 0
                ? `✅ Validation terminée !<br>
                   ${unansweredQuestions.length} question(s) sans réponse.<br>
                   Réponses enregistrées.<br>
                   Vous ne pouvez plus modifier vos réponses.`
                : `✅ Validation terminée !<br>
                   Réponses enregistrées.<br>
                   Vous ne pouvez plus modifier vos réponses.`;
        }

        // 🔒 6. Lock UI
        document.querySelectorAll('input, select, textarea, button').forEach(input => {
            const isNavButton =
                input.closest('.chapter-nav') ||
                input.closest('.progress-actions') ||
                input.classList.contains('btn-secondary') ||
                (input.tagName === 'BUTTON' && input.textContent.includes('Retour au menu')) ||
                (input.tagName === 'BUTTON' && input.textContent.includes('Chapitre'));

            if (!isNavButton) {
                input.disabled = true;
                input.style.pointerEvents = 'none';
                input.style.opacity = '0.7';
            }
        });

        return true;
    },

    // ------------------------------------------------------------------------
    // RENDU DU CHAPITRE
    // ------------------------------------------------------------------------

    async handleSubmitChapter() {
        const chapterConfig = window.currentChapterConfig ||
                              window.chaptersIndex?.chapters?.find(ch => ch.id == ChapterSession.chapterId);

        const chapter = ChapterSession.progress?.chapters?.[ChapterSession.chapterId];
        const submissionStatus = chapter?.submissionStatus || 'not_submitted';

        if (chapterConfig?.examMode === true) {
            this.validateAllQuestions();

            const pm = getProgressManager();
            if (pm.submitChapter && ChapterSession.progress && ChapterSession.chapterId) {
                const deadline = chapterConfig.submissionDeadline || null;
                pm.submitChapter(ChapterSession.progress, ChapterSession.chapterId, deadline);

                if (pm.saveProgress && ChapterSession.studentId) {
                    await pm.saveProgress(ChapterSession.studentId, ChapterSession.progress);
                }

                this.lockChapterAfterSubmission();
                ChapterUI.updateSubmitButton();
                ChapterUI.updateAllProgressIndicators();
            }
            return;
        }

        const pm = getProgressManager();
        if (!pm.submitChapter || !ChapterSession.progress || !ChapterSession.chapterId) {
            console.warn('[handleSubmitChapter] ProgressManager non initialisé');
            return;
        }

        if (!chapter) return;

        const config = window.chaptersIndex?.chapters?.find(ch => ch.id == ChapterSession.chapterId);
        if (!config) return;

        if (submissionStatus === 'submitted' || submissionStatus === 'late_submitted') {
            alert('⚠️ Ce chapitre a déjà été rendu et est en attente de correction.');
            return;
        }

        if (submissionStatus === 'validated') {
            alert('✅ Ce chapitre a déjà été validé par votre évaluateur.');
            return;
        }

        const completionPercent = chapter.completionPercent || 0;
        let confirmMessage = '';
        if (completionPercent < 100) {
            confirmMessage = `⚠️ Votre progression est de ${completionPercent}%.\n\n`;
        }
        if (submissionStatus === 'returned_for_revision') {
            confirmMessage += '🔄 Vous êtes sur le point de re-rendre ce chapitre après les retouches demandées.\n\n';
        }
        confirmMessage += 'Êtes-vous sûr de vouloir rendre votre copie ?\n';
        confirmMessage += 'Cette action est irréversible et toutes les réponses seront figées.';

        if (!confirm(confirmMessage)) return;

        const deadline = config.submissionDeadline || null;
        pm.submitChapter(ChapterSession.progress, ChapterSession.chapterId, deadline);

        if (pm.saveProgress && ChapterSession.studentId) {
            await pm.saveProgress(ChapterSession.studentId, ChapterSession.progress);
        }

        this.lockChapterAfterSubmission();
        ChapterUI.updateSubmitButton();
        ChapterUI.updateAllProgressIndicators();
        alert('✅ Votre copie a été rendue avec succès !');
    },

    // ------------------------------------------------------------------------
    // VERROUILLAGE POST-SOUMISSION
    // ------------------------------------------------------------------------

    lockChapterAfterSubmission() {
        document.body.classList.add('chapter-locked');

        document.querySelectorAll('input, textarea, select').forEach(input => {
            input.disabled = true;
        });

        document.querySelectorAll('.btn-check-answer').forEach(btn => {
            btn.disabled = true;
        });

        const globalValidation = document.querySelector('.global-validation');
        if (globalValidation) globalValidation.style.display = 'none';

        document.querySelectorAll('.course-validation button').forEach(btn => {
            btn.disabled = true;
        });

        const mainContent = document.querySelector('.chapter-content');
        if (mainContent && !document.getElementById('submission-confirmation-msg')) {
            const msgDiv = document.createElement('div');
            msgDiv.id = 'submission-confirmation-msg';
            msgDiv.className = 'submission-confirmation';
            msgDiv.innerHTML = '📝 <strong>Copie rendue</strong> - Plus de modifications possibles.<br>Votre évaluateur la corrigera prochainement.';
            mainContent.insertBefore(msgDiv, mainContent.firstChild);
        }
    }
};

window.ChapterSubmission = ChapterSubmission;
window.validateAllQuestions = () => ChapterSubmission.validateAllQuestions();
window.handleSubmitChapter = async () => ChapterSubmission.handleSubmitChapter();
