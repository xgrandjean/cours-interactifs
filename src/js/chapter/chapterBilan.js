// ============================================================================
// CHAPTER BILAN - Modal de bilan détaillé du chapitre
// ============================================================================
// Responsabilités :
//   - showDetailsBilanChapter (construit et affiche le modal)
//   - closeAutoCorrectDetails (ferme le modal)
// ============================================================================

const ChapterBilan = {

    // ── Gestion du focus : sauver/restaurer autour des modals ──────
    // Corrige le bug où les modals (confirm, alert, HTML) volent le focus
    // et empêchent la saisie dans les champs après fermeture.
    _previousFocus: null,

    _saveFocus() {
        this._previousFocus = document.activeElement;
    },

    /** Affichage d'un nombre de points : entier quand il l'est, sinon deux décimales. */
    _nombre(valeur) {
        const n = Number(valeur) || 0;
        return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, '');
    },

    _restoreFocus() {
        const el = this._previousFocus;
        // Petit délai pour laisser le navigateur finir le cleanup du modal
        setTimeout(() => {
            if (el && typeof el.focus === 'function') {
                el.focus();
            }
            this._previousFocus = null;
        }, 100);
    },

    /**
     * L'intervalle de points que cette question apporte au chapitre.
     *
     * C'est LA règle du bilan, et elle tient en une phrase : chaque question apporte un
     * intervalle `[min, max]`, et on somme. Le reste — fourchette de notes, convergence
     * vers la note définitive — en découle sans cas particulier. Quand tout est répondu
     * et corrigé, tous les intervalles sont fermés, `min` égale `max`, et le bilan
     * n'affiche plus qu'une note.
     *
     * Trois valeurs, pas deux :
     *   min     ce qui est garanti si tout ce qui reste tourne au pire
     *   max     ce qui est atteignable si tout tourne au mieux
     *   acquis  ce qui est déjà en poche — diffère de `min` sur une question auto pas
     *           encore tentée : elle N'A PAS encore coûté ses points, mais elle le peut.
     *
     * Les questions auto sont les seules à pouvoir retirer des points. Voir aussi le
     * plancher du cumul, appliqué par l'appelant, et la fiche « bareme » de aide.js.
     */
    _intervalle(question, donnees, chapitreOuvert) {
        const points = question.points || 0;
        const rien = { min: 0, max: 0, acquis: 0, statut: 'unanswered' };

        // « Répondue » au sens large : un 0 ou un tableau sont des réponses légitimes,
        // on ne peut pas se contenter de tester la véracité de `answer`.
        const repondue = !!donnees && (
            donnees.answered === true ||
            (typeof donnees.answer === 'string' && donnees.answer.trim() !== '') ||
            (Array.isArray(donnees.answer) && donnees.answer.length > 0)
        );

        if (question.correctionType === 'auto') {
            if (!donnees) {
                return chapitreOuvert
                    ? { min: -points, max: points, acquis: 0, statut: 'unanswered' }
                    : rien;
            }
            // Des essais sans réponse enregistrée : la question a été ratée.
            const rate = donnees.isCorrect === false
                      || (donnees.attempts > 0 && !repondue);

            if (donnees.isCorrect === true) {
                const pts = Bareme.pointsAuto(points, donnees.attempts, Bareme.nbOptions(question));
                return { min: pts, max: pts, acquis: pts, statut: 'correct' };
            }
            if (rate) {
                return { min: -points, max: -points, acquis: -points, statut: 'incorrect' };
            }
            // Ni réussie ni ratée : encore à tenter. C'est ce cas qui manquait — une auto
            // répondue sans verdict et sans essai comptabilisé ne tombait dans aucune
            // branche, et la note maximale annoncée était inférieure à la vérité.
            return chapitreOuvert
                ? { min: -points, max: points, acquis: 0, statut: 'unanswered' }
                : rien;
        }

        // Semi-auto et manuelles. L'ordre compte : la correction du formateur passe AVANT
        // la reconnaissance automatique — sur une semi validée d'office, un teacherScore
        // saisi ensuite l'emporte, le dernier mot est au formateur.
        if (!donnees) {
            return chapitreOuvert
                ? { min: 0, max: points, acquis: 0, statut: 'unanswered' }
                : rien;
        }
        if (donnees.manualCorrectionStatus === 'corrected'
            && typeof donnees.teacherScore === 'number' && !isNaN(donnees.teacherScore)) {
            const t = donnees.teacherScore;
            return { min: t, max: t, acquis: t, statut: 'corrected' };
        }
        if (donnees.isCorrect === true) {
            return { min: points, max: points, acquis: points, statut: 'correct' };
        }
        if (donnees.isCorrect === false) {
            // Réponse rejetée par la règle (« Texte non vide » trop court, par exemple).
            return { min: 0, max: 0, acquis: 0, statut: 'incorrect' };
        }
        if (repondue) {
            return { min: 0, max: points, acquis: 0, statut: 'pending' };
        }
        return chapitreOuvert
            ? { min: 0, max: points, acquis: 0, statut: 'unanswered' }
            : rien;
    },

    async showDetailsBilanChapter(chapterIdParam = null, progressDataParam = null) {
        this._saveFocus();
        let chapterId = chapterIdParam || ChapterSession.chapterId;
        let progress = progressDataParam || ChapterSession.progress;

        if (!progress || !chapterId) {
            console.error('showDetailsBilanChapter: manque progress ou chapterId', { progress, chapterId });
            alert('Erreur: Impossible de charger le bilan, données manquantes.');
            return;
        }

        const chapter = progress.chapters[chapterId];
        if (!chapter) return;

        const submissionStatus = chapter.submissionStatus || 'not_submitted';
        const chapterConfig = window.chaptersIndex?.chapters?.find(ch => ch.id == chapterId);
        if (!chapterConfig) return;

        const slug = window.currentParcoursSlug || (window.Parcours ? Parcours.slug : null);
        let storageConfig = {};
        if (slug) {
            storageConfig = await storage.get(`${slug}:config:chapter_config`) || {};
        }
        const finalConfig = {
            ...chapterConfig,
            ...(storageConfig[chapterId] || {})
        };

        const examContext = getExamContext(chapter, finalConfig);
        const isAllowed = !examContext.isExamMode || submissionStatus === 'validated';

        if (!isAllowed) {
            alert('⚠️ Le bilan n\'est pas disponible tant que le chapitre n\'a pas été corrigé.');
            return;
        }

        const allQuestions = finalConfig.questions || [];
        const totalPossiblePoints = finalConfig.maxPoints
            || allQuestions.reduce((sum, q) => sum + q.points, 0);
        const noteMax = APP_CONFIG.MAX_NOTE;

        // Le chapitre peut-il encore recevoir des réponses ? Ce qui n'a pas été fait vaut
        // zéro définitif une fois la copie rendue, alors qu'avant le rendu c'est encore
        // un enjeu — dans les deux sens pour une question auto, qui peut retirer des points.
        const chapitreOuvert = submissionStatus === 'not_submitted'
                            || submissionStatus === 'returned_for_revision';

        let autoMin = 0, autoMax = 0, autoAcquis = 0, autoMaxPossible = 0;
        let manuelMin = 0, manuelMax = 0, manuelAcquis = 0;

        const questionDetails = [];

        allQuestions.forEach(q => {
            const qData = chapter.questions[q.id];
            const bornes = this._intervalle(q, qData, chapitreOuvert);

            if (q.correctionType === 'auto') {
                autoMaxPossible += q.points;
                autoMin += bornes.min;
                autoMax += bornes.max;
                autoAcquis += bornes.acquis;
            } else {
                manuelMin += bornes.min;
                manuelMax += bornes.max;
                manuelAcquis += bornes.acquis;
            }

            questionDetails.push({
                id: q.id,
                title: q.title,
                type: q.correctionType,
                points: q.points,
                status: bornes.statut,
                attempts: qData ? (qData.attempts || 0) : 0,
                pointsEarned: bornes.acquis
            });
        });

        // Le cumul auto ne descend jamais sous 0 : un mauvais résultat sur les QCM ne
        // vient pas manger les points gagnés ailleurs. Les blocs semi et manuel ne
        // peuvent pas devenir négatifs par construction, il n'y a rien à y plancher.
        const autoBrutAcquis = autoAcquis;
        autoMin = Math.max(0, autoMin);
        autoMax = Math.max(0, autoMax);
        autoAcquis = Math.max(0, autoAcquis);
        // Ce qui a été ramené à 0, pour l'expliquer : sans cela l'apprenant additionne le
        // détail et ne retrouve pas le total.
        const autoRamene = autoAcquis - autoBrutAcquis;

        const minScore = autoMin + manuelMin;
        const maxScorePossible = autoMax + manuelMax;
        const currentScore = autoAcquis + manuelAcquis;

        // Pénalité de cours : l'AUTOMATIQUE seule, jamais la valeur discrétionnaire que le
        // formateur peut saisir à la correction (chapter.coursePenalty, bonus compris).
        // La fourchette reste ainsi une note THÉORIQUE : le geste du formateur lui
        // appartient et n'est annoncé qu'à la validation.
        // Même critère que correctionModal : un cours déclaré obligatoire et non validé.
        const coursObligatoireManquant = (finalConfig.courses || []).some(cours => {
            if (!cours.requiresValidation) return false;
            return chapter.questions?.[`course_${cours.index}`]?.isCorrect !== true;
        });
        const coursePenalty = coursObligatoireManquant ? -2 : 0;

        // Convention alignée sur le formateur : la pénalité est négative et s'AJOUTE à la
        // note, après le rapport au barème. Le clamp final est celui de calculateNoteSur20.
        const enNote = (points) => {
            if (!(totalPossiblePoints > 0)) return 0;
            const brute = (points / totalPossiblePoints) * noteMax + coursePenalty;
            return Math.min(noteMax, Math.max(0, brute));
        };
        const minNote = enNote(minScore);
        const maxNote = enNote(maxScorePossible);

        let questionsHtml = '';
        questionDetails.forEach(q => {
            let statusIcon = '';
            let statusText = '';
            let statusClass = '';

            // `manualCorrectionStatus` ne figure pas dans questionDetails : le statut de
            // l'intervalle est le seul discriminant.
            if (q.status === 'corrected') {
                if (q.pointsEarned >= q.points) {
                    statusIcon = '✅'; statusClass = 'correct';
                } else if (q.pointsEarned > 0) {
                    statusIcon = '🟠'; statusClass = 'partial';
                } else {
                    statusIcon = '❌'; statusClass = 'incorrect';
                }
                statusText = 'Corrigé';
            } else {
                switch (q.status) {
                    case 'correct':
                        statusIcon = '✅';
                        statusText = q.attempts > 1 ? `${q.attempts} essais` : '1 essai';
                        statusClass = 'correct';
                        break;
                    case 'incorrect':
                        statusIcon = '❌';
                        statusText = q.attempts > 0 ? `${q.attempts} essai${q.attempts > 1 ? 's' : ''}` : 'Non réussie';
                        statusClass = 'incorrect';
                        break;
                    case 'unanswered':
                        statusIcon = '⚪'; statusText = 'Non répondue'; statusClass = 'unanswered';
                        break;
                    case 'pending':
                        statusIcon = '⏳'; statusText = 'En attente'; statusClass = 'pending';
                        break;
                    // 'corrected' est traité plus haut, avec une icône proportionnelle
                    // aux points obtenus — la branche attendait ce statut sans qu'aucun
                    // calcul ne le produise jamais.
                }
            }

            questionsHtml += `
                <div class="detail-row">
                    <span class="detail-qid">${q.title}</span>
                    <span class="detail-type">${q.type}</span>
                    <span class="detail-status ${statusClass}">${statusIcon} ${statusText}</span>
                    <span class="detail-attempts">${
                        // Le nombre d'essais n'a de sens que sur une question
                        // auto-corrigée effectivement tentée : ailleurs, « 0 essai »
                        // ou un compteur sur une question corrigée à la main ne
                        // désigne rien.
                        (q.type === 'auto' && q.attempts > 0)
                            ? `Nombre d'essais: ${q.attempts}`
                            : ''
                    }</span>
                    <span class="detail-points">${q.pointsEarned > 0 ? '+' : ''}${this._nombre(q.pointsEarned)}/${q.points}</span>
                </div>
            `;
        });

        const modalContent = `
            <div class="modal-overlay" onclick="ChapterBilan.closeAutoCorrectDetails(event)">
                <div class="modal-content bilan-complet">
                    <div class="modal-header">
                        <h3>📊 Bilan du chapitre</h3>
                        <button class="modal-close" onclick="ChapterBilan.closeAutoCorrectDetails(event)">×</button>
                    </div>
                    <div class="modal-body">
${'' /* Pas de « Note finale » ici, et ce n'est pas un oubli : LE BILAN S'ARRÊTE À LA
                             VALIDATION. Dès qu'un chapitre est `validated`, les deux points d'entrée
                             (chapterUI et chapterRenderer) basculent le bouton sur « 📄 Voir le
                             corrigé » et ouvrent studentCorrectionModal, qui affiche la note du
                             formateur, le détail et les commentaires. Le bilan sert tout ce qui
                             précède ; le corrigé prend la main après. Une ligne de note définitive
                             ici serait inatteignable — c'est ce qu'était l'ancienne, qui lisait de
                             surcroît un champ `noteSur20` que rien n'écrit. */}
                        <div class="section-title">📋 Résumé</div>
                        <div class="note-range">
                            ${autoMaxPossible > 0 ? `
                            <div class="note-item">
                                <span class="note-label">Points auto-corrigés</span>
                                <span class="note-value current">${this._nombre(autoAcquis)} sur ${autoMaxPossible}</span>
                            </div>
                            ${autoRamene > 0 ? `
                            <div class="note-item note-item-mention">
                                <span class="note-label">dont ${this._nombre(-autoRamene)} ramené${autoRamene > 1 ? 's' : ''} à 0</span>
                                <span class="note-value">le total des questions auto ne descend pas sous 0</span>
                            </div>
                            ` : ''}
                            ` : ''}
                            ${(totalPossiblePoints - autoMaxPossible) > 0 ? `
                            <div class="note-item">
                                <span class="note-label">Points semi/manuels validés</span>
                                <span class="note-value current">${this._nombre(manuelAcquis)} sur ${totalPossiblePoints - autoMaxPossible}</span>
                            </div>
                            ` : ''}
                            <div class="note-item">
                                <span class="note-label">Total acquis actuellement</span>
                                <span class="note-value current">${this._nombre(currentScore)} sur ${totalPossiblePoints}</span>
                            </div>
${'' /* Les bornes se rejoignent d'elles-mêmes à mesure que les intervalles se
                              ferment. Quand il ne reste plus rien d'incertain, une seule note. */}
                            ${minScore !== maxScorePossible ? `
                            <div class="note-item">
                                <span class="note-label">Total minimal possible</span>
                                <span class="note-value min">${this._nombre(minScore)} sur ${totalPossiblePoints}</span>
                            </div>
                            <div class="note-item">
                                <span class="note-label">Note minimale possible</span>
                                <span class="note-value min">${minNote.toFixed(1)} sur ${noteMax}</span>
                            </div>
                            <div class="note-item">
                                <span class="note-label">Note maximale possible</span>
                                <span class="note-value max">${maxNote.toFixed(1)} sur ${noteMax}</span>
                            </div>
                            ` : `
                            <div class="note-item">
                                <span class="note-label">Note</span>
                                <span class="note-value final">${minNote.toFixed(1)} sur ${noteMax}</span>
                            </div>
                            `}
                        </div>
                        ${finalConfig.courseValidationCount > 0 ? `
                        <div class="section-title">📚 Cours validés</div>
                        <div class="note-range">
                            <div class="note-item">
                                <span class="note-label">Cours marqués comme lus</span>
                                <span class="note-value current">${chapter.answeredCourses || 0} sur ${finalConfig.courseValidationCount}</span>
                            </div>
                            ${coursePenalty !== 0 ? `
                            <div class="note-item">
                                <span class="note-label">Pénalité pour cours obligatoire non validé</span>
                                <span class="note-value min">${coursePenalty} sur la note</span>
                            </div>
                            ` : ''}
                        </div>
                        ` : ''}
                        <div class="section-title">📝 Détail par question</div>
                        <div class="questions-list">
                            ${questionsHtml}
                        </div>
                    </div>
                </div>
            </div>
        `;

        let existingModal = document.getElementById('auto-correct-details-modal');
        if (existingModal) existingModal.remove();

        const modalDiv = document.createElement('div');
        modalDiv.id = 'auto-correct-details-modal';
        modalDiv.innerHTML = modalContent;
        document.body.appendChild(modalDiv);

        // Focus sur le bouton de fermeture pour accessibilité
        const closeBtn = modalDiv.querySelector('.modal-close');
        if (closeBtn) closeBtn.focus();
    },

    // ------------------------------------------------------------------------
    // BILAN SIMPLIFIÉ POUR LE MODE BLIND (modale avec 2 choix)
    // ------------------------------------------------------------------------

    showBlindBilan(totalPointsDOM, chapterConfig, chapter) {
        this._saveFocus();
        // Supprimer toute modale existante
        document.getElementById('auto-correct-details-modal')?.remove();

        // --- Calcul des notes min/max en mode "rendu définitif" ---
        // Principe : auto non répondu ou erroné = 0 pt (définitif).
        // Seules les questions manuelles/semi vraiment incertaines
        // (réponse présente ET seuil de caractères atteint si applicable)
        // contribuent à la note maximale.
        const noteMax = APP_CONFIG.MAX_NOTE;

        // Mêmes questions que celles affichées à l'apprenant : le rendu écarte les
        // questions incohérentes (isQuestionValid), et une question jamais montrée n'a
        // pas à peser dans le barème. Sans ce filtre, le dénominateur — somme des
        // data-points du DOM — et la boucle ci-dessous ne parlaient pas de la même
        // liste, et la note maximale annoncée devenait inatteignable.
        const valide = window.isQuestionValid || (() => true);
        const allQuestions = (chapterConfig.questions || []).filter(valide);
        const totalPoints = allQuestions.reduce((somme, q) => somme + (q.points || 0), 0)
                         || totalPointsDOM || 0;
        const chapterQuestions = (chapter && chapter.questions) ? chapter.questions : {};

        let blindMinScore = 0;
        let blindMaxScore = 0;

        allQuestions.forEach(q => {
            const qData = chapterQuestions[q.id];
            const answerText = (qData && typeof qData.answer === 'string') ? qData.answer : '';
            const answerLength = answerText.trim().length;

            if (q.correctionType === 'auto') {
                // Auto : on ne compte que ce qui est déjà acquis (isCorrect === true)
                if (qData && qData.isCorrect === true) {
                    // Barème partagé (core/bareme.js). Le Math.max(0, …) est propre au bilan
                    // Blind, qui plafonne question par question : décision d'affichage, pas
                    // de barème.
                    const pts = Bareme.pointsAuto(q.points, qData.attempts, Bareme.nbOptions(q));
                    blindMinScore += Math.max(0, pts);
                    blindMaxScore += Math.max(0, pts);
                }
                // Non répondu ou incorrect → 0 dans les deux cas (définitif)

            } else {
                // Questions manuelles ou semi-auto
                const hasMinLength = q.minLength && q.minLength > 0;
                const answered = qData && (
                    qData.answered === true ||
                    (typeof qData.answer === 'string' && qData.answer.trim() !== '') ||
                    (Array.isArray(qData.answer) && qData.answer.length > 0)
                );

                if (q.correctionType === 'semi' && hasMinLength) {
                    // Semi avec seuil : incertain seulement si le seuil est atteint
                    if (answered && answerLength >= q.minLength) {
                        // Incertain → contribue à la note max uniquement
                        blindMaxScore += q.points;
                    }
                    // Sous le seuil ou non répondu → faux à coup sûr → 0 partout

                } else {
                    // Manuel (toutes règles) ou semi sans seuil : incertain si répondu
                    if (answered) {
                        blindMaxScore += q.points;
                    }
                    // Non répondu → 0 partout (pas d'espoir si rien n'a été envoyé)
                }
            }
        });

        const blindMinNote = totalPoints > 0 ? (blindMinScore / totalPoints) * noteMax : 0;
        const blindMaxNote = totalPoints > 0 ? (blindMaxScore / totalPoints) * noteMax : 0;

        const modalContent = `
            <div class="modal-overlay" style="cursor: default;">
                <div class="modal-content bilan-reduit">
                    <div class="modal-header">
                        <h3>📋 Bilan — Mode Blind</h3>
                    </div>
                    <div class="modal-body">
                        <div class="section-title">📊 Résumé</div>
                        <div class="note-range">
                            ${blindMinScore !== blindMaxScore ? `
                            <div class="note-item">
                                <span class="note-label">Note minimale</span>
                                <span class="note-value min">${blindMinNote.toFixed(1)} / ${noteMax} (${this._nombre(blindMinScore)} pt${blindMinScore > 1 ? 's' : ''})</span>
                            </div>
                            <div class="note-item">
                                <span class="note-label">Note maximale</span>
                                <span class="note-value max">${blindMaxNote.toFixed(1)} / ${noteMax} (${this._nombre(blindMaxScore)} pt${blindMaxScore > 1 ? 's' : ''})</span>
                            </div>
                            ` : `
                            <div class="note-item">
                                <span class="note-label">Note</span>
                                <span class="note-value final">${blindMinNote.toFixed(1)} / ${noteMax} (${this._nombre(blindMinScore)} pt${blindMinScore > 1 ? 's' : ''})</span>
                            </div>
                            `}
                        </div>
                        ${blindMinScore !== blindMaxScore ? `
                        <p style="text-align:center; font-size:0.85rem; color:#666; margin-top:0.75rem;">
                            L'écart vient des questions qui attendent une correction manuelle.
                        </p>
                        ` : ''}
                        <div style="display: flex; gap: 1rem; justify-content: center; margin-top: 2rem;">
                            <button class="btn btn-success" id="blind-validate-btn" style="padding: 0.75rem 1.5rem; font-size: 1.1rem;">
                                ✅ Valider définitivement
                            </button>
                            <button class="btn btn-warning" id="blind-retry-btn" style="padding: 0.75rem 1.5rem; font-size: 1.1rem;">
                                🔄 Recommencer
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const modalDiv = document.createElement('div');
        modalDiv.id = 'auto-correct-details-modal';
        modalDiv.innerHTML = modalContent;
        document.body.appendChild(modalDiv);

        // Cacher le bouton de rendu initial
        const submitBtn = document.getElementById('submit-chapter-btn');
        if (submitBtn) submitBtn.style.display = 'none';

        // Événement "Valider définitivement"
        document.getElementById('blind-validate-btn').addEventListener('click', async () => {
            if (!await ChapterSubmission._confirmModal('✅ Êtes-vous sûr de vouloir VALIDER DÉFINITIVEMENT ce chapitre ?\n\nCette action est irréversible.')) return;
            await ChapterSubmission._finalizeBlindSubmission(chapterConfig);
            // Réafficher le bouton de rendu (mis à jour par updateSubmitButton)
            const submitBtn = document.getElementById('submit-chapter-btn');
            if (submitBtn) submitBtn.style.display = 'block';
            document.getElementById('auto-correct-details-modal')?.remove();
            ChapterBilan._restoreFocus();
        });

        // Événement "Recommencer"
        document.getElementById('blind-retry-btn').addEventListener('click', async () => {
            if (!await ChapterSubmission._confirmModal('🔄 Êtes-vous sûr de vouloir RECOMMENCER ?\n\nToutes les questions auto-corrigées seront remises à zéro.\nLes questions à correction manuelle seront conservées.')) return;
            await ChapterSubmission._resetBlindAttempt();
            document.getElementById('auto-correct-details-modal')?.remove();
            ChapterBilan._restoreFocus();
        });
    },

    closeAutoCorrectDetails(event) {
        if (event) event.stopPropagation();
        document.getElementById('auto-correct-details-modal')?.remove();
        // Remettre le bouton de rendu si la modale est fermée sans valider (mode blind)
        const submitBtn = document.getElementById('submit-chapter-btn');
        if (submitBtn) submitBtn.style.display = 'block';
        // Restaurer le focus sur l'élément actif avant l'ouverture du modal
        this._restoreFocus();
    }
};

window.ChapterBilan = ChapterBilan;
window.showDetailsBilanChapter = (...args) => ChapterBilan.showDetailsBilanChapter(...args);
window.closeAutoCorrectDetails = (event) => ChapterBilan.closeAutoCorrectDetails(event);