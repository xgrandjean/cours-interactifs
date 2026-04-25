// ============================================================================
// CHAPTER UI - Manipulation DOM, restauration, indicateurs, feedbacks
// ============================================================================
// Responsabilités :
//   - Restaurer les réponses (restoreQuestionAnswer, restoreAllAnswers, restoreCourses)
//   - Gérer les feedbacks (handleNormalMode, clearAllFeedbacks, showFeedback)
//   - Verrouiller/déverrouiller questions (lockQuestion, disableAutoCorrectedQuestion, setInputsDisabled)
//   - Mettre à jour les indicateurs de progression (updateAllProgressIndicators, addStatsDisplay)
//   - Gérer le mode examen visuel (applyChapterMode)
//   - Mettre à jour le bouton de rendu (updateSubmitButton)
// ============================================================================

const ChapterUI = {

    // ------------------------------------------------------------------------
    // RESTAURATION DES REPONSES
    // ------------------------------------------------------------------------

    restoreQuestionAnswer(questionId, questionData) {
        const pm = window.ProgressManager || {};
        const question = document.querySelector(`.question-section[data-question-id="${questionId}"]`);
        const correctionType = question ? question.dataset.correctionType : null;

        const shouldLock =
            (correctionType === 'auto' || correctionType === 'semi') &&
            !pm.ALLOW_MULTIPLE_ATTEMPTS &&
            questionData.isCorrect === true;

        // QCM radio
        const radio = document.querySelector(`input[type="radio"][name="qcm_${questionId}"]`);
        if (radio) {
            const radioSelected = document.querySelector(`input[name="qcm_${questionId}"][value="${questionData.answer}"]`);
            if (radioSelected) {
                radioSelected.checked = true;
                if (shouldLock) this.setInputsDisabled(`qcm_${questionId}`, true);
            }
            return;
        }

        // QCM checkbox
        const checkbox = document.querySelector(`input[type="checkbox"][name="qcm_${questionId}"]`);
        if (checkbox && Array.isArray(questionData.answer)) {
            questionData.answer.forEach(value => {
                const checkboxSelected = document.querySelector(`input[name="qcm_${questionId}"][value="${value}"]`);
                if (checkboxSelected) {
                    checkboxSelected.checked = true;
                    if (shouldLock) checkboxSelected.disabled = true;
                }
            });
            return;
        }

        // Select
        const select = document.querySelector(`select#${questionId}`);
        if (select) {
            select.value = questionData.answer;
            if (shouldLock) select.disabled = true;
            return;
        }

        // Réponse courte
        const shortInput = document.getElementById(`short_${questionId}`);
        if (shortInput) {
            shortInput.value = questionData.answer || '';
            if (shouldLock) shortInput.disabled = true;
            return;
        }

        // Réponse ouverte - textarea (jamais verrouillée automatiquement)
        const textarea = document.getElementById(questionId);
        if (textarea && textarea.tagName === 'TEXTAREA') {
            textarea.value = questionData.answer || '';
        }
    },

    restoreAllAnswers() {
        if (!ChapterSession.progress || !ChapterSession.chapterId) return;

        const chapter = ChapterSession.progress.chapters[ChapterSession.chapterId];
        if (!chapter?.questions) return;

        this.clearAllFeedbacks();

        const context = window.currentExamContext;
        const isChapterCorrected = chapter.submissionStatus === 'validated';

        this.restoreCourses(chapter);

        Object.entries(chapter.questions).forEach(([questionId, data]) => {
            if (questionId.startsWith('course_')) return;
            if (!data?.answered) return;

            this.restoreQuestionAnswer(questionId, data);

            const questionEl = document.querySelector(`.question-section[data-question-id="${questionId}"]`);
            if (!questionEl) return;

            if (context.isExamMode) {
                if (context.isChapterLocked) {
                    this.lockQuestion(questionEl);
                    if (isChapterCorrected) {
                        this.handleNormalMode(questionId, data, questionEl);
                    }
                }
                return;
            }

            this.handleNormalMode(questionId, data, questionEl);
        });
    },

    restoreCourses(chapter) {
        const courseSections = document.querySelectorAll('.course-content');

        courseSections.forEach((section, index) => {
            const courseId = `course_${index}`;
            const courseData = chapter.questions[courseId];

            if (courseData?.answered && courseData.isCorrect === true) {
                section.classList.add('completed');

                const button = section.querySelector('.btn-secondary');
                if (button) {
                    button.disabled = true;
                    button.textContent = '✓ Validé';
                    button.style.backgroundColor = '#27ae60';
                }
            }
        });
    },

    // ------------------------------------------------------------------------
    // FEEDBACKS ET MODE NORMAL
    // ------------------------------------------------------------------------

    handleNormalMode(questionId, questionData, question) {
        const correctionType = question.dataset.correctionType;
        const hasTextarea = question.querySelector('textarea') !== null;
        const feedback = document.getElementById(`feedback_${questionId}`);

        if (hasTextarea) {
            if (questionData.isCorrect === false) {
                if (feedback) {
                    feedback.innerHTML = '❌ Réponse invalide / trop courte';
                    feedback.className = 'feedback error show';
                    feedback.style.display = 'block';
                }
            } else if (questionData.answered === true) {
                if (feedback) {
                    feedback.innerHTML = '⏳ Réponse enregistrée - En attente de vérification';
                    feedback.className = 'feedback warning show';
                    feedback.style.display = 'block';
                }
            } else {
                if (feedback) {
                    feedback.innerHTML = '';
                    feedback.className = 'feedback';
                    feedback.style.display = 'none';
                }
            }
        } else {
            if (questionData.isCorrect === true) {
                if (feedback) {
                    feedback.innerHTML = '✅ Bonne réponse';
                    feedback.className = 'feedback success show';
                    feedback.style.display = 'block';
                }
            } else if (questionData.isCorrect === false) {
                if (feedback) {
                    feedback.innerHTML = '❌ Mauvaise réponse';
                    feedback.className = 'feedback error show';
                    feedback.style.display = 'block';
                }
            } else if (questionData.isCorrect === null && questionData.answered === true) {
                if (feedback) {
                    feedback.innerHTML = '⏳ Réponse enregistrée - En attente de correction';
                    feedback.className = 'feedback warning show';
                    feedback.style.display = 'block';
                }
            } else {
                if (feedback) {
                    feedback.innerHTML = '';
                    feedback.className = 'feedback';
                    feedback.style.display = 'none';
                }
            }
        }

        if (
            questionData.isCorrect === true &&
            (correctionType === 'auto' || correctionType === 'semi')
        ) {
            this.disableAutoCorrectedQuestion(question);
        }

        // Questions ouvertes : jamais verrouillées
        if (hasTextarea) {
            const inputs = question.querySelectorAll('textarea, button');
            inputs.forEach(input => {
                input.disabled = false;
                input.style.pointerEvents = 'auto';
                input.style.opacity = '1';

                if (input.classList.contains('btn-check-answer')) {
                    input.textContent = 'Vérifier';
                    input.style.backgroundColor = '';
                }
            });
            question.classList.remove('completed');
            question.style.opacity = '1';
        }
    },

    lockQuestion(questionEl) {
        questionEl.querySelectorAll('input, select, textarea, button').forEach(el => {
            el.disabled = true;
            el.style.pointerEvents = 'none';
            el.style.opacity = '0.7';
        });
        questionEl.classList.add('locked');
    },

    clearAllFeedbacks() {
        document.querySelectorAll('.feedback, .question-feedback').forEach(el => {
            el.innerHTML = '';
            el.className = 'feedback';
            el.style.display = '';
        });
    },

    setInputsDisabled(name, disabled) {
        document.querySelectorAll(`input[name="${name}"]`).forEach(input => {
            input.disabled = disabled;
        });
    },

    disableAutoCorrectedQuestion(question) {
        const button = question.querySelector('.btn-check-answer');
        if (button) {
            button.disabled = true;
            button.textContent = '✓ Validé';
            button.style.backgroundColor = '#27ae60';
            button.style.pointerEvents = 'none';
        }

        question.querySelectorAll('input, select, textarea').forEach(input => {
            input.disabled = true;
            input.style.pointerEvents = 'none';
            input.style.opacity = '0.7';
        });

        question.classList.add('completed');
        question.style.opacity = '0.8';
    },

    // ------------------------------------------------------------------------
    // INDICATEURS DE PROGRESSION
    // ------------------------------------------------------------------------

    updateAllProgressIndicators() {
        if (!ChapterSession.progress || !ChapterSession.chapterId) return;

        const chapter = ChapterSession.progress.chapters[ChapterSession.chapterId];
        if (!chapter) return;

        const chapterConfig = window.currentChapterConfig;
        if (!chapterConfig) return;

        const pm = window.ProgressManager;
        if (!pm || !pm.computeChapterUIStats) {
            console.warn('[updateAllProgressIndicators] ProgressManager.computeChapterUIStats non disponible');
            return;
        }

        const stats = pm.computeChapterUIStats(chapter, chapterConfig, APP_CONFIG.MAX_NOTE || 20);

        // Progression globale
        const progressValue = document.getElementById('chapterProgressValue');
        if (progressValue) {
            progressValue.textContent = stats.globalPercentage;
        }

        const progressCircle = document.getElementById('chapterProgressCircle');
        if (progressCircle) {
            progressCircle.title = `Avancement dans le chapitre : ${stats.completedItems} éléments complétés sur ${stats.totalItems} au total (${stats.answeredQuestions}/${stats.totalQuestions} questions, ${stats.answeredCourses}/${stats.totalValidatableCourses} cours)`;
        }

        // Questions auto-corrigées
        const statsDiv = document.getElementById('auto-correct-stats');

        if (statsDiv) {
            const examContext = getExamContext(chapter, chapterConfig, window.globalContext);
            const submissionStatus = chapter.submissionStatus || 'not_submitted';
            const isDisabled = examContext.isExamMode && submissionStatus === 'not_submitted';

            if (isDisabled) {
                statsDiv.innerHTML = '';
            } else {
                // ── Logique conditionnelle du bouton bilan / corrigé ──────────
                // Si le chapitre est validé définitivement par le professeur,
                // on affiche "📄 Voir le corrigé" qui ouvre le modal lecture seule.
                // Sinon on affiche "⭐ Voir le bilan" avec le comportement existant.
                const isValidated = submissionStatus === 'validated';
                const bilanBtnHtml = isValidated
                    ? `<button class="details-btn" id="bilan-btn" title="Voir le corrigé détaillé">📄 Voir le corrigé</button>`
                    : `<button class="details-btn" id="bilan-btn" title="Bilan des exercices">⭐ Voir le bilan</button>`;

                statsDiv.innerHTML = `
                    <div class="stats-card">
                        <h3>
                            📊 Exercices auto-corrigés (${stats.autoMaxPossible} points attribuables sur ${chapterConfig.maxPoints})
                            ${bilanBtnHtml}
                        </h3>
                        <div class="stats-grid">
                            <div class="stat-item" title="Pourcentage d'exercices auto-corrigés réussis sur le total.">
                                <span>📈 Avancement</span>
                                <strong>${Math.round(stats.avctBonneReponse)}%</strong>
                            </div>
                            <div class="stat-item" title="Taux de réussite au premier essai.">
                                <span>🥇 1er essai</span>
                                <strong>${stats.firstAttemptRate}%</strong>
                            </div>
                            <div class="stat-item accuracy-item" title="Mesure la qualité des réponses en tenant compte du nombre d'essais.">
                                <span>🎯 Précision</span>
                                <strong>${stats.accuracy}%</strong>
                            </div>
                            <div class="stat-item" title="Points obtenus à partir de la note calculée sur les exercices auto-corrigés.">
                                <span>⭐ Points obtenus</span>
                                <strong>${stats.pointsObtenus}/${stats.autoMaxPossible}</strong>
                            </div>
                        </div>
                    </div>
                `;
            }
        }

        // Attacher l'événement sur le bouton bilan APRÈS création
        const bilanBtn = document.getElementById('bilan-btn');
        if (bilanBtn) {
            const chapter = ChapterSession.progress.chapters[ChapterSession.chapterId];
            const isValidated = chapter?.submissionStatus === 'validated';

            bilanBtn.removeEventListener('click', showDetailsBilanChapter);

            if (isValidated) {
                // Mode corrigé : ouvrir le modal lecture seule
                bilanBtn.addEventListener('click', () => {
                    window.studentCorrectionModal?.open(ChapterSession.chapterId);
                });
            } else {
                // Mode bilan classique : comportement existant inchangé
                bilanBtn.addEventListener('click', () => showDetailsBilanChapter());
            }
        }
    },

    addStatsDisplay() {
        let statsContainer = document.getElementById('auto-correct-stats');
        if (!statsContainer) {
            statsContainer = document.createElement('div');
            statsContainer.id = 'auto-correct-stats';
            statsContainer.className = 'stats-container';

            const progressBar = document.querySelector('.progress-overview');
            if (progressBar) {
                progressBar.after(statsContainer);
            } else {
                const mainContent = document.querySelector('.chapter-content');
                if (mainContent) mainContent.before(statsContainer);
            }
        }

        this.updateAllProgressIndicators();
    },

    initializeStats() {
        setTimeout(() => { this.addStatsDisplay(); }, 200);
    },

    // ------------------------------------------------------------------------
    // MODE EXAMEN ET BOUTON RENDU
    // ------------------------------------------------------------------------

    applyChapterMode() {
        const match = window.location.pathname.match(/chapitre(\d+)\.html/);
        const chapterId = match ? parseInt(match[1]) : null;

        if (!chapterId) return;

        const chapterConfig = getChapterConfigById(chapterId);
        const allButtons = $$('.question-actions .btn-check-answer');

        if (chapterConfig?.examMode === true) {
            allButtons.forEach(btn => { btn.style.display = 'none'; });
        } else {
            allButtons.forEach(btn => { btn.style.display = 'block'; });
        }

        let submitBtn = document.getElementById('submit-chapter-btn');

        if (!submitBtn) {
            submitBtn = document.createElement('button');
            submitBtn.id = 'submit-chapter-btn';
            submitBtn.className = 'btn btn-primary';

            const footer = document.querySelector('.chapter-footer');
            if (footer) footer.appendChild(submitBtn);
        }

        submitBtn.style.display = 'block';
        submitBtn.style.marginLeft = 'auto';
        submitBtn.style.padding = '0.75rem 1.5rem';
    },

    updateSubmitButton() {
        const btn = document.getElementById('submit-chapter-btn');
        if (!btn || !ChapterSession.progress || !ChapterSession.chapterId) return;

        const chapter = ChapterSession.progress.chapters[ChapterSession.chapterId];
        if (!chapter) return;

        const submissionStatus = chapter.submissionStatus || 'not_submitted';

        switch (submissionStatus) {
            case 'not_submitted':
                btn.innerHTML = '📤 Rendre ce travail';
                btn.className = 'btn btn-primary';
                btn.onclick = handleSubmitChapter;
                btn.disabled = false;
                break;
            case 'submitted':
                btn.innerHTML = '📝 Rendu - En attente de correction';
                btn.className = 'btn btn-secondary';
                btn.disabled = true;
                btn.onclick = null;
                window.ChapterSubmission && window.ChapterSubmission.lockChapterAfterSubmission();
                break;
            case 'late_submitted':
                btn.innerHTML = '⚠️ Rendu - En retard';
                btn.className = 'btn btn-warning';
                btn.disabled = true;
                btn.onclick = null;
                window.ChapterSubmission && window.ChapterSubmission.lockChapterAfterSubmission();
                break;
            case 'returned_for_revision':
                btn.innerHTML = '🔄 Retouches demandées - Re-rendre';
                btn.className = 'btn btn-primary';
                btn.onclick = handleSubmitChapter;
                btn.disabled = false;
                break;
            case 'validated':
                btn.innerHTML = '✅ Validé par votre évaluateur';
                btn.className = 'btn btn-success';
                btn.disabled = true;
                btn.onclick = null;
                window.ChapterSubmission && window.ChapterSubmission.lockChapterAfterSubmission();
                break;
            default:
                btn.innerHTML = '📤 Rendre ce travail';
                btn.className = 'btn btn-primary';
                btn.onclick = handleSubmitChapter;
                btn.disabled = false;
        }
    }
};

window.ChapterUI = ChapterUI;
window.updateAllProgressIndicators = () => ChapterUI.updateAllProgressIndicators();
