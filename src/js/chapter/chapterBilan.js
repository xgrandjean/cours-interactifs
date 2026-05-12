// ============================================================================
// CHAPTER BILAN - Modal de bilan détaillé du chapitre
// ============================================================================
// Responsabilités :
//   - showDetailsBilanChapter (construit et affiche le modal)
//   - closeAutoCorrectDetails (ferme le modal)
// ============================================================================

const ChapterBilan = {

    async showDetailsBilanChapter(chapterIdParam = null, progressDataParam = null) {
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

        const storageConfig = await (window.Parcours?.scoped?.config?.get('chapter_config') || storage.get('chapter_config')) || {};        
        const finalConfig = {
            ...chapterConfig,
            ...(storageConfig[chapterId] || {})
        };

        const examContext = getExamContext(chapter, finalConfig, window.globalContext);
        const isAllowed = !examContext.isExamMode || submissionStatus === 'validated';

        if (!isAllowed) {
            alert('⚠️ Le bilan n\'est pas disponible tant que le chapitre n\'a pas été corrigé.');
            return;
        }

        const allQuestions = chapterConfig.questions;
        const totalPossiblePoints = chapterConfig.maxPoints || allQuestions.reduce((sum, q) => sum + q.points, 0);

        let autoScore = 0;
        let autoMaxPossible = 0;
        let autoRemainingRisk = 0;
        let manualCurrentScore = 0;
        let manualRemainingMax = 0;

        const questionDetails = [];

        allQuestions.forEach(q => {
            const qData = chapter.questions[q.id];
            let status = 'unanswered';
            let pointsEarned = 0;

            if (q.correctionType === 'auto') autoMaxPossible += q.points;

            const wasAnswered =
                qData &&
                (qData.answered === true ||
                (typeof qData.answer === 'string' && qData.answer.trim() !== '') ||
                (Array.isArray(qData.answer) && qData.answer.length > 0) ||
                (qData.answer !== null && qData.answer !== undefined && qData.answer !== ''));

            let effectiveIsCorrect = qData ? qData.isCorrect : null;
            let effectiveWasAnswered = wasAnswered;

            if (q.correctionType === 'auto' && qData && qData.attempts > 0 && !wasAnswered) {
                effectiveIsCorrect = false;
                effectiveWasAnswered = true;
            }

            if (qData) {
                if (effectiveIsCorrect === true) {
                    status = 'correct';
                    pointsEarned = q.points;
                    if (q.correctionType === 'auto') {
                        pointsEarned = q.points - ((qData.attempts - 1) * q.points);
                        const maxPenalty = q.points * 2;
                        pointsEarned = Math.max(-maxPenalty, pointsEarned);
                        autoScore += pointsEarned;
                    } else {
                        manualCurrentScore += pointsEarned;
                    }
                } else if (effectiveIsCorrect === false) {
                    status = 'incorrect';
                    if (q.correctionType === 'auto') {
                        pointsEarned = -q.points;
                        autoScore += pointsEarned;
                    } else {
                        pointsEarned = 0;
                    }
                } else if (effectiveIsCorrect === null && q.correctionType !== 'auto') {
                    if (effectiveWasAnswered) {
                        status = 'pending';
                        manualRemainingMax += q.points;
                    } else {
                        status = 'unanswered';
                        if (submissionStatus === 'not_submitted' || submissionStatus === 'returned_for_revision')
                            manualRemainingMax += q.points;
                    }
                    pointsEarned = 0;
                } else if (
                    q.correctionType === 'auto' &&
                    !effectiveWasAnswered &&
                    (submissionStatus === 'not_submitted' || submissionStatus === 'returned_for_revision')
                ) {
                    autoRemainingRisk += q.points;
                }
            } else {
                status = 'unanswered';
                pointsEarned = 0;
                if (
                    q.correctionType === 'auto' &&
                    (submissionStatus === 'not_submitted' || submissionStatus === 'returned_for_revision')
                ) {
                    autoRemainingRisk += q.points;
                } else if (submissionStatus === 'not_submitted' || submissionStatus === 'returned_for_revision') {
                    manualRemainingMax += q.points;
                }
            }

            questionDetails.push({
                id: q.id,
                title: q.title,
                type: q.correctionType,
                points: q.points,
                status,
                attempts: qData ? qData.attempts : 0,
                pointsEarned
            });
        });

        const noteMax = APP_CONFIG.MAX_NOTE;
        const minAutoScore = Math.max(0, autoScore - autoRemainingRisk);
        const autoProjectedScore = Math.max(0, autoScore);
        const minScore = minAutoScore + manualCurrentScore;
        const currentScore = autoProjectedScore + manualCurrentScore;
        const maxScorePossible = autoProjectedScore + autoRemainingRisk + manualCurrentScore + manualRemainingMax;
        const minNote = totalPossiblePoints > 0 ? (minScore / totalPossiblePoints) * noteMax : 0;
        const maxNote = totalPossiblePoints > 0 ? (maxScorePossible / totalPossiblePoints) * noteMax : 0;

        let coursePenalty = 0;
        const totalCourses = chapterConfig.courseValidationCount;
        const validatedCourses = chapter.answeredCourses || 0;
        if (validatedCourses < totalCourses) coursePenalty = 2;

        let questionsHtml = '';
        questionDetails.forEach(q => {
            let statusIcon = '';
            let statusText = '';
            let statusClass = '';

            if (q.status === 'corrected' || q.manualCorrectionStatus === 'corrected') {
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
                }
            }

            questionsHtml += `
                <div class="detail-row">
                    <span class="detail-qid">${q.title}</span>
                    <span class="detail-type">${q.type}</span>
                    <span class="detail-status ${statusClass}">${statusIcon} ${statusText}</span>
                    <span class="detail-attempts">Nombre d'essais: ${q.attempts}</span>
                    <span class="detail-points">${q.pointsEarned > 0 ? '+' : ''}${q.pointsEarned}/${q.points}</span>
                </div>
            `;
        });

        const modalContent = `
            <div class="modal-overlay" onclick="ChapterBilan.closeAutoCorrectDetails(event)">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>📊 Bilan du chapitre</h3>
                        <button class="modal-close" onclick="ChapterBilan.closeAutoCorrectDetails(event)">×</button>
                    </div>
                    <div class="modal-body">
                        ${submissionStatus === 'validated' && typeof chapter.noteSur20 !== 'undefined' ? `
                            <div class="note-item">
                                <span class="note-label">Note finale</span>
                                <span class="note-value final">${chapter.noteSur20} sur 20</span>
                            </div>
                        ` : ''}
                        <div class="section-title">📋 Résumé</div>
                        <div class="note-range">
                            <div class="note-item">
                                <span class="note-label">Points auto-corrigés</span>
                                <span class="note-value current">${autoProjectedScore} sur ${autoMaxPossible}</span>
                            </div>
                            <div class="note-item">
                                <span class="note-label">Points semi/manuels validés</span>
                                <span class="note-value current">${manualCurrentScore} sur ${totalPossiblePoints - autoMaxPossible}</span>
                            </div>
                            <div class="note-item">
                                <span class="note-label">Total acquis actuellement</span>
                                <span class="note-value current">${currentScore} sur ${totalPossiblePoints}</span>
                            </div>
                            <div class="note-item">
                                <span class="note-label">Total minimal possible</span>
                                <span class="note-value min">${minScore} sur ${totalPossiblePoints}</span>
                            </div>
                            <div class="note-item">
                                <span class="note-label">Note minimale possible</span>
                                <span class="note-value min">${minNote.toFixed(1)} sur 20</span>
                            </div>
                            <div class="note-item">
                                <span class="note-label">Note maximale possible</span>
                                <span class="note-value max">${maxNote.toFixed(1)} sur 20</span>
                            </div>
                        </div>
                        ${chapterConfig.courseValidationCount > 0 ? `
                        <div class="section-title">📚 Cours validés</div>
                        <div class="note-range">
                            <div class="note-item">
                                <span class="note-label">Cours marqués comme lus</span>
                                <span class="note-value current">${chapter.answeredCourses || 0} sur ${chapterConfig.courseValidationCount}</span>
                            </div>
                            ${coursePenalty > 0 ? `
                            <div class="note-item">
                                <span class="note-label">Pénalité appliquée sur la note sur 20</span>
                                <span class="note-value min">-${coursePenalty}</span>
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
    },

    closeAutoCorrectDetails(event) {
        if (event) event.stopPropagation();
        document.getElementById('auto-correct-details-modal')?.remove();
    }
};

window.ChapterBilan = ChapterBilan;
window.showDetailsBilanChapter = (...args) => ChapterBilan.showDetailsBilanChapter(...args);
window.closeAutoCorrectDetails = (event) => ChapterBilan.closeAutoCorrectDetails(event);
