// ============================================================================
// CHAPTER SUBMISSION - Gestion des rendus, validation et verrouillage
// ============================================================================
// Responsabilités :
//   - validateAllQuestions (évaluation globale en mode examen)
//   - handleSubmitChapter (rendu de copie)
//   - lockChapterAfterSubmission (verrouillage post-rendu)
// ============================================================================

const ChapterSubmission = {

    // ── Modals HTML (remplacent confirm/alert natifs) ──────────────
    // Les dialogs natifs (confirm/alert) volent le focus du webContents
    // en Electron iframe et empêchent la saisie après fermeture.
    // Ces modals HTML restent dans le contexte du document et ne
    // causent aucun problème de focus. Fonctionnent aussi dans les
    // navigateurs externes.
    // API :
    //   await this._confirmModal("message") → true/false
    //   await this._alertModal("message")   → undefined

    _confirmModal(message) {
        // Supprimer tout modal existant
        document.getElementById('_native-dialog-overlay')?.remove();

        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.id = '_native-dialog-overlay';
            overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;';

            const box = document.createElement('div');
            box.style.cssText = 'background:white;padding:1.5rem;border-radius:8px;max-width:450px;width:90%;box-shadow:0 4px 20px rgba(0,0,0,0.3);font-family:inherit;';

            const safeMsg = message.replace(/&/g,'&').replace(/</g,'<').replace(/>/g,'>');
            box.innerHTML =
                '<p style="white-space:pre-line;margin:0 0 1.5rem;font-size:0.95rem;line-height:1.5;">' + safeMsg + '</p>' +
                '<div style="display:flex;gap:0.75rem;justify-content:flex-end;">' +
                    '<button id="_dlg_cancel" style="padding:0.5rem 1.25rem;cursor:pointer;border:1px solid #ccc;background:#f5f5f5;border-radius:4px;font-size:0.9rem;">Annuler</button>' +
                    '<button id="_dlg_ok" style="padding:0.5rem 1.25rem;cursor:pointer;background:#3498db;color:white;border:none;border-radius:4px;font-size:0.9rem;">OK</button>' +
                '</div>';

            overlay.appendChild(box);
            document.body.appendChild(overlay);

            const cleanup = (result) => { overlay.remove(); resolve(result); };

            box.querySelector('#_dlg_ok').onclick     = () => cleanup(true);
            box.querySelector('#_dlg_cancel').onclick = () => cleanup(false);
            overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(false); });

            box.querySelector('#_dlg_ok').focus();
        });
    },

    _alertModal(message) {
        document.getElementById('_native-dialog-overlay')?.remove();

        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.id = '_native-dialog-overlay';
            overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;';

            const box = document.createElement('div');
            box.style.cssText = 'background:white;padding:1.5rem;border-radius:8px;max-width:450px;width:90%;box-shadow:0 4px 20px rgba(0,0,0,0.3);font-family:inherit;';

            const safeMsg = message.replace(/&/g,'&').replace(/</g,'<').replace(/>/g,'>');
            box.innerHTML =
                '<p style="white-space:pre-line;margin:0 0 1.5rem;font-size:0.95rem;line-height:1.5;">' + safeMsg + '</p>' +
                '<div style="display:flex;justify-content:flex-end;">' +
                    '<button id="_dlg_ok" style="padding:0.5rem 1.25rem;cursor:pointer;background:#3498db;color:white;border:none;border-radius:4px;font-size:0.9rem;">OK</button>' +
                '</div>';

            overlay.appendChild(box);
            document.body.appendChild(overlay);

            const cleanup = () => { overlay.remove(); resolve(); };

            box.querySelector('#_dlg_ok').onclick = cleanup;
            overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(); });

            box.querySelector('#_dlg_ok').focus();
        });
    },

    // ------------------------------------------------------------------------
    // VALIDATION GLOBALE (MODE EXAMEN / BLIND)
    // ------------------------------------------------------------------------

    async validateAllQuestions() {
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
            const confirmSubmit = await this._confirmModal(
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

        // 🔒 6. Lock UI (pas en mode blind — c'est géré après le choix)
        const context = window.currentExamContext;
        if (!context?.isBlindMode) {
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
        }

        return { earnedPoints, totalPoints };
    },

    // ------------------------------------------------------------------------
    // RENDU DU CHAPITRE
    // ------------------------------------------------------------------------

    async handleSubmitChapter() {
        const chapterConfig = window.currentChapterConfig ||
                              window.chaptersIndex?.chapters?.find(ch => ch.id == ChapterSession.chapterId);

        const chapter = ChapterSession.progress?.chapters?.[ChapterSession.chapterId];
        const submissionStatus = chapter?.submissionStatus || 'not_submitted';

        // ── MODE BLIND : logique spécifique ────────────────────────────────
        const context = window.currentExamContext;
        if (context?.isBlindMode) {
            const result = await this.validateAllQuestions();
            if (result === false) return; // annulé par l'utilisateur

            const { totalPoints } = result;

            // Afficher le bilan simplifié dans une modale.
            // ⚠️ Le dernier argument est la progression du chapitre : sans lui,
            //    showBlindBilan travaillait sur un objet vide et affichait toujours
            //    0 point, en min comme en max — il ne montrait donc jamais rien d'utile.
            // Le total du DOM n'est plus qu'un repli : showBlindBilan calcule le sien
            //    depuis la config, pour que numérateur et dénominateur s'accordent.
            ChapterBilan.showBlindBilan(totalPoints, chapterConfig, chapter);
            return;
        }

        if (chapterConfig?.examMode === true || chapterConfig?.chapterMode === 'exam') {
            await this.validateAllQuestions();

            const pm = getProgressManager();
            if (pm.submitChapter && ChapterSession.progress && ChapterSession.chapterId) {
                // Date limite FIGÉE pour cet élève (voir progressManager.initChapter) — pas la
                // config globale, qui peut avoir changé depuis son démarrage.
                const deadline = (chapter?.frozenDateLimitEnabled && chapter?.frozenEndDate) ? chapter.frozenEndDate : null;
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
            console.warn(`[handleSubmitChapter] ⚠️ Tentative de rendu bloquée : statut="${submissionStatus}"`);
            console.warn(`[handleSubmitChapter] Détail du chapitre :`, JSON.stringify(chapter, null, 2));
            console.warn(`[handleSubmitChapter] ChapitreId :`, ChapterSession.chapterId);
            console.warn(`[handleSubmitChapter] StudentId :`, ChapterSession.studentId);
            if (ChapterSession.progress) {
                console.warn(`[handleSubmitChapter] Tous les statuts du progress :`, 
                    Object.fromEntries(
                        Object.entries(ChapterSession.progress.chapters || {}).map(([id, ch]) => [
                            id, { submissionStatus: ch.submissionStatus, completed: ch.completed, correctionStatus: ch.correctionStatus }
                        ])
                    )
                );
            }
            await this._alertModal('⚠️ Ce chapitre a déjà été rendu et est en attente de correction.');
            return;
        }

        if (submissionStatus === 'validated') {
            await this._alertModal('✅ Ce chapitre a déjà été validé par votre évaluateur.');
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
        // 🧾 MODE ATELIER AR : nommer les consignes qui partiront à 0 point faute d'AR.
        // Une phrase générale ne suffit pas — on clique sans lire et on découvre le 0
        // trop tard. On dit « non validée », jamais « fausse » : le travail a peut-être
        // été fait, c'est la procédure qui n'est pas allée au bout.
        const consignesSansAR = window.AtelierQuestion?.consignesNonValidees?.() || [];
        if (consignesSansAR.length > 0) {
            const uneSeule = consignesSansAR.length === 1;
            confirmMessage += uneSeule
                ? '🧾 Une consigne n\'a pas été validée en main propre :\n'
                : `🧾 ${consignesSansAR.length} consignes n'ont pas été validées en main propre :\n`;
            confirmMessage += consignesSansAR.map(c => `   • ${c.libelle}`).join('\n');
            confirmMessage += uneSeule
                ? '\n\nElle comptera pour 0 point.\n\n'
                : '\n\nElles compteront pour 0 point.\n\n';
        }

        confirmMessage += 'Êtes-vous sûr de vouloir rendre votre copie ?\n';
        confirmMessage += 'Cette action est irréversible et toutes les réponses seront figées.';

        if (!await this._confirmModal(confirmMessage)) return;

        // Date limite FIGÉE pour cet élève (voir progressManager.initChapter) — pas la config
        // globale, qui peut avoir changé depuis son démarrage.
        const deadline = (chapter?.frozenDateLimitEnabled && chapter?.frozenEndDate) ? chapter.frozenEndDate : null;
        pm.submitChapter(ChapterSession.progress, ChapterSession.chapterId, deadline);

        if (pm.saveProgress && ChapterSession.studentId) {
            await pm.saveProgress(ChapterSession.studentId, ChapterSession.progress);
        }
        
        const slug = window.currentParcoursSlug || (window.Parcours ? Parcours.slug : null);
        if (slug && ChapterSession.studentId) {
            const key = `${slug}:${ChapterSession.studentId}:student_${ChapterSession.studentId}_progress`;
            await storage.set(key, ChapterSession.progress);
            console.log(`✅ Progression sauvegardée (rendu) dans ${key}`);
        }
                
        this.lockChapterAfterSubmission();
        ChapterUI.updateSubmitButton();
        ChapterUI.updateAllProgressIndicators();
        await this._alertModal('✅ Votre copie a été rendue avec succès !');
    },

    // ── Validation définitive du mode Blind (soumission au formateur) ────────
    async _finalizeBlindSubmission(chapterConfig) {
        const pm = getProgressManager();
        if (pm.submitChapter && ChapterSession.progress && ChapterSession.chapterId) {
            // Date limite FIGÉE pour cet élève (voir progressManager.initChapter) — pas la config
            // globale, qui peut avoir changé depuis son démarrage.
            const chapter = ChapterSession.progress.chapters[ChapterSession.chapterId];
            const deadline = (chapter?.frozenDateLimitEnabled && chapter?.frozenEndDate) ? chapter.frozenEndDate : null;
            pm.submitChapter(ChapterSession.progress, ChapterSession.chapterId, deadline);

            if (pm.saveProgress && ChapterSession.studentId) {
                await pm.saveProgress(ChapterSession.studentId, ChapterSession.progress);
            }

            // Sauvegarde explicite
            const slug = window.currentParcoursSlug || (window.Parcours ? Parcours.slug : null);
            if (slug && ChapterSession.studentId) {
                const key = `${slug}:${ChapterSession.studentId}:student_${ChapterSession.studentId}_progress`;
                await storage.set(key, ChapterSession.progress);
            }

            this.lockChapterAfterSubmission();
            ChapterUI.updateSubmitButton();
            ChapterUI.updateAllProgressIndicators();
            await this._alertModal('✅ Chapitre validé définitivement avec succès !');
        }
    },

    // ── Réinitialiser toutes les questions auto/semi (mode millionnaire) ────
    async _resetAutoQuestions() {
        if (!ChapterSession.progress || !ChapterSession.chapterId) return;

        const chapter = ChapterSession.progress.chapters[ChapterSession.chapterId];
        if (!chapter?.questions) return;

        Object.entries(chapter.questions).forEach(([questionId, data]) => {
            if (questionId.startsWith('course_')) return;

            const questionEl = document.querySelector(`.question-section[data-question-id="${questionId}"]`);
            const correctionType = questionEl?.dataset?.correctionType || 'auto';

            if (correctionType === 'manuel') return;

            // Reset de la question dans le progress
            data.answered = false;
            data.answer = null;
            data.isCorrect = null;
            data.score = 0;
            data.attempts = 0;
            data.answeredAt = null;
            data.updatedAt = new Date().toISOString();
        });

        // Réinitialiser les indicateurs
        chapter.completionPercent = 0;
        delete chapter.finalScore;

        // Sauvegarder
        const pm = getProgressManager();
        if (pm.recomputeChapterStats) pm.recomputeChapterStats(chapter);
        if (pm.recomputeGlobalStats) pm.recomputeGlobalStats(ChapterSession.progress);
        if (pm.saveProgress && ChapterSession.studentId) {
            await pm.saveProgress(ChapterSession.studentId, ChapterSession.progress);
        }

        const slug = window.currentParcoursSlug || (window.Parcours ? Parcours.slug : null);
        if (slug && ChapterSession.studentId) {
            const key = `${slug}:${ChapterSession.studentId}:student_${ChapterSession.studentId}_progress`;
            await storage.set(key, ChapterSession.progress);
        }

        // Réinitialiser le DOM
        document.querySelectorAll('.question-section input, .question-section select, .question-section textarea').forEach(el => {
            if (el.type === 'checkbox' || el.type === 'radio') {
                el.checked = false;
            } else if (el.tagName === 'SELECT') {
                el.selectedIndex = 0;
            } else {
                el.value = '';
            }
            el.disabled = false;
            el.style.pointerEvents = 'auto';
            el.style.opacity = '1';
        });

        document.querySelectorAll('.question-section .btn-check-answer').forEach(btn => {
            btn.disabled = false;
            btn.textContent = 'Vérifier';
            btn.style.backgroundColor = '';
            btn.style.pointerEvents = 'auto';
        });

        document.querySelectorAll('.question-section').forEach(el => {
            el.classList.remove('completed', 'locked');
            el.style.opacity = '1';
        });

        // Réinitialiser les feedbacks
        document.querySelectorAll('.feedback, .question-feedback').forEach(el => {
            el.innerHTML = '';
            el.className = 'feedback';
            el.style.display = '';
        });

        ChapterUI.updateAllProgressIndicators();
        ChapterUI.updateSubmitButton();
    },

    // ── Recommencer en mode Blind ───────────────────────────────────────────
    async _resetBlindAttempt() {
        if (!ChapterSession.progress || !ChapterSession.chapterId) return;

        const chapter = ChapterSession.progress.chapters[ChapterSession.chapterId];
        if (!chapter?.questions) return;

        // Réinitialiser UNIQUEMENT les questions auto/semi (pas les manuelles)
        Object.entries(chapter.questions).forEach(([questionId, data]) => {
            if (questionId.startsWith('course_')) return;

            // Déterminer le type de correction via le DOM si accessible
            const questionEl = document.querySelector(`.question-section[data-question-id="${questionId}"]`);
            const correctionType = questionEl?.dataset?.correctionType || 'auto';

            // Ne réinitialiser que les questions auto-corrigées
            if (correctionType === 'manuel') return;

            // Reset de la question
            data.answered = false;
            data.answer = null;
            data.isCorrect = null;
            data.score = 0;
            data.attempts = 0;
            data.answeredAt = null;
            data.updatedAt = new Date().toISOString();
        });

        // Réinitialiser les indicateurs de stats du chapitre
        chapter.examModeValidated = false;
        chapter.examModeValidatedAt = null;
        chapter.completionPercent = 0;
        delete chapter.finalScore;

        // Sauvegarder
        const pm = getProgressManager();
        if (pm.recomputeChapterStats) pm.recomputeChapterStats(chapter);
        if (pm.recomputeGlobalStats) pm.recomputeGlobalStats(ChapterSession.progress);
        if (pm.saveProgress && ChapterSession.studentId) {
            await pm.saveProgress(ChapterSession.studentId, ChapterSession.progress);
        }

        const slug = window.currentParcoursSlug || (window.Parcours ? Parcours.slug : null);
        if (slug && ChapterSession.studentId) {
            const key = `${slug}:${ChapterSession.studentId}:student_${ChapterSession.studentId}_progress`;
            await storage.set(key, ChapterSession.progress);
        }

        // Réinitialiser tous les champs de saisie dans le DOM
        document.querySelectorAll('.question-section input, .question-section select, .question-section textarea').forEach(el => {
            if (el.type === 'checkbox' || el.type === 'radio') {
                el.checked = false;
            } else if (el.tagName === 'SELECT') {
                el.selectedIndex = 0;
            } else {
                el.value = '';
            }
            el.disabled = false;
            el.style.pointerEvents = 'auto';
            el.style.opacity = '1';
        });

        // Réinitialiser les boutons "Vérifier" s'ils existent
        document.querySelectorAll('.question-section .btn-check-answer').forEach(btn => {
            btn.disabled = false;
            btn.textContent = 'Vérifier';
            btn.style.backgroundColor = '';
            btn.style.pointerEvents = 'auto';
        });

        // Enlever les classes de verrouillage
        document.querySelectorAll('.question-section').forEach(el => {
            el.classList.remove('completed', 'locked');
            el.style.opacity = '1';
        });

        // Remettre le bouton de rendu
        const submitBtn = document.getElementById('submit-chapter-btn');
        if (submitBtn) submitBtn.style.display = 'block';

        // Recharger les stats
        ChapterUI.updateAllProgressIndicators();
        ChapterUI.updateSubmitButton();

        await this._alertModal('🔄 Tentative réinitialisée ! Vous pouvez recommencer.\n\nLes questions à correction manuelle ont été conservées.');
    },

    // ------------------------------------------------------------------------
    // VERROUILLAGE POST-SOUMISSION
    // ------------------------------------------------------------------------

    lockChapterAfterSubmission() {
        document.body.classList.add('chapter-locked');

        // Copie rendue : la relecture se fait d'un seul tenant, plus étape par étape.
        window.ChapterPagination?.toutAfficher();

        // 1. Désactiver tous les champs de saisie
        document.querySelectorAll('input, select, textarea').forEach(el => {
            el.disabled = true;
            el.style.pointerEvents = 'none';
            el.style.opacity = '0.7';
        });

        // 2. Désactiver tous les boutons d'action sauf ceux de navigation et d'information
        document.querySelectorAll('button').forEach(btn => {
            const isNavButton = btn.closest('.chapter-nav') !== null;
            const isSubmitBtn = btn.id === 'submit-chapter-btn';
            const isBilanBtn = btn.classList.contains('details-btn') || btn.id === 'bilan-btn';
            if (!isNavButton && !isSubmitBtn && !isBilanBtn) {
                btn.disabled = true;
                btn.style.pointerEvents = 'none';
                btn.style.opacity = '0.7';
            }
        });

        // 3. Masquer le bloc de validation globale
        const globalValidation = document.querySelector('.global-validation');
        if (globalValidation) globalValidation.style.display = 'none';

        // 4. Ajouter le message de confirmation s'il n'existe pas
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
