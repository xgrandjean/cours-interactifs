/**
 * studentCorrectionModal.js - Vue corrigé en lecture seule pour l'apprenant
 *
 * Hérite de CorrectionModal et réutilise 100% de la logique métier.
 * Surcharge uniquement les méthodes de rendu pour supprimer :
 *   - les onglets de filtre
 *   - tous les champs de saisie (scores, commentaires, pénalité)
 *   - tous les boutons d'action (Sauvegarder, Valider, Annuler)
 *
 * Point d'entrée : window.studentCorrectionModal.open(chapterId)
 *
 * @version 1.0
 */

class StudentCorrectionModal extends CorrectionModal {

    constructor() {
        super();
        // Pas de dashboard côté apprenant : on charge les données depuis le storage directement
    }

    // =========================================================================
    // POINT D'ENTRÉE PUBLIC
    // =========================================================================

    /**
     * Ouvre le modal corrigé en lecture seule pour l'apprenant connecté.
     * @param {string|number} chapterId
     */
    async open(chapterId) {
        const context = await this._getStudentContext(chapterId);
        if (!context) return;

        this.context = context;
        this.viewModel = this.buildQuestionsViewModel(context);

        this.render();
        this._bindStudentEvents();
        // Afficher l'onglet "auto" par défaut (applyFilters hérité fonctionne en lecture seule)
        this.applyFilters('auto');
    }

    // =========================================================================
    // CHARGEMENT DU CONTEXTE APPRENANT
    // =========================================================================

    /**
     * Récupère les données de l'apprenant connecté depuis le storage.
     * Ré-utilise la même structure que getCorrectionContext du parent.
     */
    async _getStudentContext(chapterId) {
        try {
            const token = sessionStorage.getItem('current_student_token');
            if (!token) {
                alert('Veuillez vous connecter pour voir le corrigé.');
                return null;
            }

            const progress = await storage.get(`student_${token}_progress`);
            if (!progress) {
                alert('Aucune progression trouvée pour ce chapitre.');
                return null;
            }

            const chapter = progress.chapters?.[chapterId];
            if (!chapter) {
                alert('Chapitre introuvable dans votre progression.');
                return null;
            }

            // Charger l'index des chapitres si nécessaire (même logique que le parent)
            if (!window.chaptersIndex) {
                const response = await fetch(window.APP_BASE_URL + 'src/chapters/chapters_index.json');
                if (response.ok) {
                    window.chaptersIndex = await response.json();
                }
            }

            const chapterConfig = window.chaptersIndex?.chapters?.find(ch => ch.id == chapterId);
            if (!chapterConfig) {
                alert('Configuration du chapitre introuvable.');
                return null;
            }

            // Merge config storage comme partout ailleurs
            const storageConfig = await storage.get('chapter_config') || {};
            const finalConfig = { ...chapterConfig, ...(storageConfig[chapterId] || {}) };

            // Construire un objet student minimal (nom depuis le storage si disponible)
            const student = { name: 'Vous', class: '' };

            return {
                student,
                progress,
                chapter,
                chapterConfig: finalConfig,
                studentId: token,
                chapterId
            };
        } catch (err) {
            console.error('[StudentCorrectionModal] Erreur chargement contexte:', err);
            alert('Erreur lors du chargement du corrigé.');
            return null;
        }
    }

    // =========================================================================
    // SURCHARGE DU RENDU — LECTURE SEULE
    // =========================================================================

    /**
     * Rendu de l'entête simplifié : note finale + bouton fermer uniquement.
     * Aucun bouton d'action (Sauvegarder / Valider / Annuler).
     */
    renderHeader() {
        const { chapterConfig } = this.context;
        const { scoring } = this.viewModel;
        const noteSur20 = Math.round(scoring.noteSur20 * 10) / 10;

        return `
            <div class="modal-header">
                <div>
                    <h3>📄 Corrigé — ${chapterConfig.title}</h3>
                    <div class="correction-header-info">
                        <span>📝 Note finale : <strong>${noteSur20}/20</strong></span>
                    </div>
                </div>
                <div class="correction-header-actions">
                    <button class="close-btn" id="student-correction-btn-close">&times;</button>
                </div>
            </div>
        `;
    }

    /**
     * Rendu des filtres — identique au modal professeur mais sans les boutons d'action.
     * Les onglets permettent de naviguer entre les catégories.
     */
    renderFilters() {
        return `
            <div class="correction-filters" id="correction-filters">
                <button class="filter-btn active" data-filter="auto">⚙️ Automatique</button>
                <button class="filter-btn" data-filter="manual">✏️ Correction</button>
                <button class="filter-btn" data-filter="course">📚 Cours</button>
            </div>
        `;
    }

    /**
     * Rendu de la liste des questions en lecture seule :
     * récapitulatif global + questions sans inputs.
     */
    renderQuestionList() {
        const { scoring } = this.viewModel;
        const autoScore   = scoring.auto.teacher;
        const manualScore = scoring.manual.teacher;
        const coursePenalty = scoring.coursePenalty;
        const noteSur20   = scoring.noteSur20;

        const globalSummary = `
<div class="question-correction" id="global-summary" style="background:#e8f5e9; border-left:4px solid #4caf50; margin-bottom:1rem;">
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem;">
        <div>
            <strong>⚙️ Automatique</strong><br>
            ${autoScore} / ${scoring.auto.max}
        </div>
        <div>
            <strong>✏️ Correction</strong><br>
            ${manualScore} / ${scoring.manual.max}
        </div>
        <div>
            <strong>📌 Pénalité sur 20</strong><br>
            ${coursePenalty} pts
        </div>
        <div style="font-weight: bold; font-size: 1.1em;">
            <strong>🏁 TOTAL</strong><br>
            ${Math.round(noteSur20 * 10) / 10} / 20
        </div>
    </div>
</div>
`;

        const questionsHtml = this.viewModel.questions
            .map(q => this._renderStudentQuestionItem(q))
            .join('');

        // Pénalité cours en lecture seule
        const hasRequiredCourses = this.viewModel.questions.some(q => q.isCourse && q.isRequired);
        const penaltyHtml = hasRequiredCourses ? this._renderStudentPenalty() : '';

        // Commentaire global professeur si présent
        const globalComment = this.context.chapter.globalComment
            ? `<div class="question-correction" style="border-left:4px solid #2196f3; background:#e3f2fd; margin-top:1rem;">
                <div class="question-correction-header"><h6>💬 Appréciation générale</h6></div>
                <div class="correction-value" style="padding:0.5rem 0;">${this.context.chapter.globalComment}</div>
               </div>`
            : '';

        return globalSummary + questionsHtml + penaltyHtml + globalComment;
    }

    // =========================================================================
    // RENDU DES ÉLÉMENTS INDIVIDUELS — LECTURE SEULE
    // =========================================================================

    /**
     * Rendu d'un élément question/cours en lecture seule.
     * Identique au parent mais SANS les .correction-inputs (score input + commentaire textarea).
     */
    _renderStudentQuestionItem(question) {
        // ── Cours informatif ──────────────────────────────────────────────────
        if (question.isCourse && !question.isRequired) {
            return `
                <div class="question-correction question-info" data-question-id="${question.id}" data-is-course="true">
                    <div class="question-correction-header">
                        <h6>📚 ${question.title || question.id}</h6>
                        <span class="status-badge status-info">INFORMATIF</span>
                    </div>
                    <div class="correction-note">
                        ℹ️ Cours informatif — aucune validation requise.
                    </div>
                </div>
            `;
        }

        // ── Cours obligatoire ─────────────────────────────────────────────────
        if (question.isCourse && question.isRequired) {
            const isRead = question.isCorrect === true;
            return `
                <div class="question-correction ${isRead ? 'question-corrected' : 'question-pending'}"
                     data-question-id="${question.id}"
                     data-status="${question.status}"
                     data-is-course="true">
                    <div class="question-correction-header">
                        <h6>📚 ${question.title || question.id}</h6>
                        <span class="status-badge status-pending" style="font-size:0.7em;">OBLIGATOIRE</span>
                        <span class="status-badge ${isRead ? 'status-corrected' : 'status-pending'}">${isRead ? '✅ Lu' : '❌ Non lu'}</span>
                    </div>
                    <div class="correction-row">
                        <div class="correction-label">👤 Statut :</div>
                        <div class="correction-value ${isRead ? 'correct' : 'incorrect'}">
                            ${isRead ? 'Cours marqué comme lu' : 'Cours non lu'}
                        </div>
                    </div>
                </div>
            `;
        }

        // ── Question normale ──────────────────────────────────────────────────
        const maxPoints = question.points || 0;

        // Résolution de la réponse apprenant en clair
        let studentAnswer = '(pas de réponse)';
        if (question.answer !== undefined && question.answer !== null) {
            if (question.type === 'qcm' && question.options) {
                const idx = parseInt(question.answer);
                studentAnswer = question.options[idx] || question.answer;
            } else {
                studentAnswer = question.answer;
            }
        }

        // Résolution de la bonne réponse en clair
        let correctAnswer = '';
        if (question.correctAnswers && question.options) {
            if (Array.isArray(question.correctAnswers)) {
                correctAnswer = question.correctAnswers.map(i => question.options[i]).join(' & ');
            } else {
                correctAnswer = question.options[question.correctAnswers] || '';
            }
        } else if (question.type === 'courte' && Array.isArray(question.correctAnswers)) {
            correctAnswer = question.correctAnswers.join(' || ');
        }

        // Score final affiché (teacherScore prioritaire, sinon theoreticalScore)
        const finalScore = (typeof question.teacherScore === 'number' && !isNaN(question.teacherScore))
            ? question.teacherScore
            : parseFloat(question.theoreticalScore ?? question.score ?? 0);

        const displayStatus = this.getDisplayStatus(question);

        // Commentaire professeur
        const teacherCommentHtml = question.teacherComment
            ? `<div class="correction-row">
                   <div class="correction-label">💬 Appréciation :</div>
                   <div class="correction-value" style="font-style:italic;">${question.teacherComment}</div>
               </div>`
            : '';

        // Note automatique / semi
        let scoreSummaryHtml = '';
        if (question.correctionType === 'semi') {
            scoreSummaryHtml = `
                <div class="auto-correction-note">
                    <span>
                        🧠 Score système : ${question.score ?? 0} / ${maxPoints} pts
                        ${(typeof question.teacherScore === 'number' && !isNaN(question.teacherScore) && question.teacherScore !== question.score)
                            ? `<br>🖊️ Score modifié par le professeur : ${question.teacherScore} / ${maxPoints} pts`
                            : ''}
                    </span>
                </div>`;
        } else if (question.correctionType === 'auto') {
            scoreSummaryHtml = `
                <div class="auto-correction-note">
                    <span>
                        🧠 Score système : ${question.theoreticalScore} / ${maxPoints} pts
                        &nbsp;|&nbsp; 🔁 ${question.attempts || 0} tentative(s)
                        ${(typeof question.teacherScore === 'number' && !isNaN(question.teacherScore) && question.teacherScore !== question.theoreticalScore)
                            ? `<br>🖊️ Score modifié par le professeur : ${question.teacherScore} / ${maxPoints} pts`
                            : ''}
                    </span>
                </div>`;
        }

        return `
            <div class="question-correction question-${question.status}"
                 data-question-id="${question.id}"
                 data-status="${question.status}"
                 data-is-course="false"
                 data-category="${question.correctionType === 'auto' ? 'auto' : 'manual'}">
                <div class="question-correction-header">
                    <h6>${question.title || `Question ${question.id}`}</h6>
                    <span class="status-badge status-${displayStatus.key}">${displayStatus.label}</span>
                    <span style="margin-left:auto; font-weight:bold; color:#1a73e8;">
                        ${finalScore} / ${maxPoints} pt${maxPoints > 1 ? 's' : ''}
                    </span>
                </div>

                ${question.questionText ? `
                <div class="correction-row">
                    <div class="correction-label">📝 Consigne :</div>
                    <div class="correction-value">${question.questionText}</div>
                </div>` : ''}

                <div class="correction-row">
                    <div class="correction-label">👤 Votre réponse :</div>
                    <div class="correction-value">${studentAnswer}</div>
                </div>

                ${correctAnswer ? `
                <div class="correction-row">
                    <div class="correction-label">✅ Réponse attendue :</div>
                    <div class="correction-value correct">${correctAnswer}</div>
                </div>` : ''}

                ${scoreSummaryHtml}
                ${teacherCommentHtml}
            </div>
        `;
    }

    /**
     * Rendu du bloc pénalité cours en lecture seule.
     */
    _renderStudentPenalty() {
        const hasUnreadRequired = this.viewModel.questions.some(
            q => q.isCourse && q.isRequired && !q.isCorrect
        );
        const penalty = this.context.chapter.coursePenalty ?? (hasUnreadRequired ? -2 : 0);
        const comment = this.context.chapter.coursePenaltyComment || '';

        return `
            <div class="question-correction question-penalty"
                 style="border:2px dashed #ff9800; background:#fff8e1; margin-top:2rem;">
                <div class="question-correction-header">
                    <h6>📌 Pénalité (validation cours) sur 20</h6>
                </div>
                <div class="correction-row">
                    <div class="correction-label">⚖️ Statut :</div>
                    <div class="correction-value ${hasUnreadRequired ? 'incorrect' : 'correct'}">
                        ${hasUnreadRequired
                            ? `⚠️ Cours obligatoire(s) non lu(s)`
                            : '✅ Tous les cours obligatoires sont lus'}
                    </div>
                </div>
                <div class="correction-row">
                    <div class="correction-label">📉 Valeur :</div>
                    <div class="correction-value">${penalty} pts</div>
                </div>
                ${comment ? `
                <div class="correction-row">
                    <div class="correction-label">💬 Commentaire :</div>
                    <div class="correction-value" style="font-style:italic;">${comment}</div>
                </div>` : ''}
            </div>
        `;
    }

    // =========================================================================
    // ÉVÉNEMENTS — LECTURE SEULE
    // =========================================================================

    _bindStudentEvents() {
        // Fermeture
        document.getElementById('student-correction-btn-close')
            ?.addEventListener('click', () => this.close());

        // Fermeture au clic sur l'overlay
        document.getElementById('correction-modal')
            ?.addEventListener('click', (e) => {
                if (e.target.id === 'correction-modal') this.close();
            });

        // Filtres (hérités de CorrectionModal — fonctionnent en lecture seule)
        document.querySelectorAll('#correction-filters .filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.applyFilters(e.target.dataset.filter));
        });
    }

    // =========================================================================
    // DÉSACTIVATION DES MÉTHODES DE SAUVEGARDE (sécurité)
    // =========================================================================

    /** Bloqué côté apprenant */
    saveAllCorrections() {
        console.warn('[StudentCorrectionModal] saveAllCorrections est désactivé en mode élève.');
    }

    /** Bloqué côté apprenant */
    applyTeacherInputsToChapter() {}

    /** Le score live ne s'applique pas en lecture seule */
    calculateScoreLive() {}

    /** Le résumé global est statique en lecture seule */
    updateGlobalSummary() {}
}

// ============================================================================
// EXPORT GLOBAL
// ============================================================================
window.studentCorrectionModal = new StudentCorrectionModal();
