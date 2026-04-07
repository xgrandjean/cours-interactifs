/**
 * teacherSubmissions.js - Module de gestion des rendus et corrections
 * Vue détaillée des élèves, corrections manuelles, validation
 */

class TeacherSubmissions {
    constructor(dashboard) {
        this.dashboard = dashboard;
        this.container = document.getElementById('submissions-content');
        this.submissions = [];
        this.init();
    }

    async init() {
        await this.loadSubmissions();
        this.render();
        this.updateBadge();
    }

    async refresh() {
        await this.loadSubmissions();
        this.render();
        this.updateBadge();
    }

    async loadSubmissions() {
        const students = await this.dashboard.getStudents();
        const chapters = this.dashboard.chapters;
        this.submissions = [];

        for (const student of students) {
            const progress = await this.dashboard.getStudentProgress(student.id);
            
            for (const chapter of chapters) {
                const chapterData = progress.chapters[chapter.id];
                if (!chapterData) continue;
                
                const needsCorrection = 
                    chapterData.submissionStatus === 'submitted' ||
                    chapterData.submissionStatus === 'late_submitted' ||
                    chapterData.submissionStatus === 'returned_for_revision' ||
                    chapterData.correctionStatus === 'pending_review' ||
                    chapterData.correctionStatus === 'in_progress';
                
                if (needsCorrection) {
                    this.submissions.push({
                        studentId: student.id,
                        studentName: student.name,
                        studentClass: student.class,
                        chapterId: chapter.id,
                        chapterTitle: chapter.title,
                        ...chapterData
                    });
                }
            }
        }

        // Trier par priorité
        this.submissions.sort((a, b) => {
            if (a.submissionStatus === 'late_submitted' && b.submissionStatus !== 'late_submitted') return -1;
            if (b.submissionStatus === 'late_submitted' && a.submissionStatus !== 'late_submitted') return 1;
            const dateA = new Date(a.submittedAt || a.updatedAt || 0);
            const dateB = new Date(b.submittedAt || b.updatedAt || 0);
            return dateB - dateA;
        });
    }

    updateBadge() {
        const badge = document.getElementById('submissions-badge');
        if (badge) {
            badge.textContent = this.submissions.length;
            badge.style.display = this.submissions.length > 0 ? 'inline' : 'none';
        }
    }

    async render() {
        let html = `
            <div class="section-header">
                <h2>📬 Rendus à Corriger</h2>
                <p>${this.submissions.length} rendu(s) en attente de correction</p>
            </div>

            <div class="submissions-filters">
                <div class="filter-group">
                    <label for="filter-status">Statut:</label>
                    <select id="filter-status" onchange="dashboard.modules.submissions.filterSubmissions()">
                        <option value="all">Tous</option>
                        <option value="submitted">Soumis</option>
                        <option value="late_submitted">En retard</option>
                        <option value="returned_for_revision">À revoir</option>
                        <option value="pending_review">En attente de correction</option>
                    </select>
                </div>
                <div class="filter-group">
                    <label for="filter-chapter">Chapitre:</label>
                    <select id="filter-chapter" onchange="dashboard.modules.submissions.filterSubmissions()">
                        <option value="all">Tous</option>
                        ${this.dashboard.chapters.map(ch => `<option value="${ch.id}">${ch.title}</option>`).join('')}
                    </select>
                </div>
                <div class="filter-group">
                    <label for="filter-priority">Priorité:</label>
                    <select id="filter-priority" onchange="dashboard.modules.submissions.filterSubmissions()">
                        <option value="all">Toutes</option>
                        <option value="high">Élevée</option>
                        <option value="normal">Normale</option>
                        <option value="low">Faible</option>
                    </select>
                </div>
            </div>

            <div class="submissions-grid" id="submissions-grid">
        `;

        if (this.submissions.length === 0) {
            html += `
                <div class="empty-submissions">
                    <p>🎉 Aucun rendu à corriger !</p>
                    <small>Tous les chapitres soumis ont été corrigés.</small>
                </div>
            `;
        } else {
            this.submissions.forEach(sub => {
                const isLate = sub.submissionStatus === 'late_submitted';
                const isReturned = sub.submissionStatus === 'returned_for_revision';
                const isPending = sub.correctionStatus === 'pending_review';
                
                let cardClass = '';
                if (isLate) cardClass = 'late';
                else if (isReturned) cardClass = 'returned';
                else if (isPending) cardClass = 'pending';

                let badgeClass = 'badge-submitted';
                let badgeText = 'Soumis';
                if (isLate) { badgeClass = 'badge-late'; badgeText = 'En retard'; }
                else if (isReturned) { badgeClass = 'badge-returned'; badgeText = 'À revoir'; }

                const submittedDate = sub.submittedAt ? new Date(sub.submittedAt).toLocaleString('fr-FR') : 'N/A';
                const pendingCount = sub.pendingCorrectionCount || 0;
                const correctedCount = sub.correctedQuestionCount || 0;
                const totalManual = sub.manualCorrectionCount || 0;

                html += `
                    <div class="submission-card ${cardClass}">
                        <div class="submission-header">
                            <h4>${sub.studentName}</h4>
                            <span class="submission-badge ${badgeClass}">${badgeText}</span>
                        </div>
                        <div class="submission-info">
                            <strong>Chapitre:</strong> ${sub.chapterTitle}<br>
                            <strong>Classe:</strong> ${sub.studentClass}<br>
                            <strong>Soumis le:</strong> ${submittedDate}<br>
                            <strong>Score actuel:</strong> ${sub.finalScore || 0} points
                        </div>
                        <div class="submission-info">
                            <strong>Correction:</strong> ${correctedCount}/${totalManual} questions corrigées
                            ${pendingCount > 0 ? `<span style="color: #e67e22;"> (${pendingCount} en attente)</span>` : ''}
                        </div>
                        <div class="submission-actions">
                            <button class="btn-correct" onclick="dashboard.modules.submissions.openCorrectionModal('${sub.studentId}', ${sub.chapterId})">
                                ✏️ Corriger
                            </button>
                            ${isPending || correctedCount === totalManual ? `
                            <button class="btn-approve" onclick="dashboard.modules.submissions.approveChapter('${sub.studentId}', ${sub.chapterId})">
                                ✅ Valider
                            </button>
                            ` : ''}
                            <button class="btn-return" onclick="dashboard.modules.submissions.returnForRevision('${sub.studentId}', ${sub.chapterId})">
                                🔄 Renvoyer
                            </button>
                            <button class="btn-view-student" onclick="dashboard.showStudentChapterView('${sub.studentId}', ${sub.chapterId})" title="Voir les réponses de l'élève">
                                👁️
                            </button>
                        </div>
                    </div>
                `;
            });
        }

        html += '</div>';
        
        // Add student details section
        html += await this.renderStudentDetailsSection();
        
        this.container.innerHTML = html;
    }

    async renderStudentDetailsSection() {
        const students = await this.dashboard.getStudents();
        
        let html = `
            <div class="students-list" style="margin-top: 2rem;">
                <h2>Détails par Élève</h2>
                <button class="refresh-btn" id="refresh-dashboard" onclick="dashboard.modules.submissions.refresh()">🔄 Rafraîchir les données</button>
                <div class="students-grid" id="students-grid">
        `;

        if (students.length === 0) {
            html += '<div class="empty-state">Aucun élève enregistré.</div>';
        } else {
            for (const student of students) {
                const progress = await this.dashboard.getStudentProgress(student.id);
                const completedChapters = Object.values(progress.chapters).filter(c => c.completed).length;
                const totalChapters = this.dashboard.chapters.length;
                const completionRate = totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : 0;

                let avgScore = 0;
                let scoreCount = 0;
                Object.values(progress.chapters).forEach(chapter => {
                    if (chapter.score !== undefined) {
                        avgScore += chapter.score;
                        scoreCount++;
                    }
                });
                avgScore = scoreCount > 0 ? Math.round(avgScore / scoreCount) : 0;

                html += `
                    <div class="student-card">
                        <div class="student-header">
                            <h4>${student.name}</h4>
                            <span class="student-class">${student.class || 'Non spécifié'}</span>
                        </div>
                        
                        <div class="student-stats">
                            <div class="stat-row">
                                <span>Progression</span>
                                <span>${completionRate}% (${completedChapters}/${totalChapters})</span>
                            </div>
                            <div class="stat-row">
                                <span>Moyenne générale</span>
                                <span>${avgScore}%</span>
                            </div>
                            <div class="stat-row">
                                <span>Dernière activité</span>
                                <span>${this.getLastActivity(progress)}</span>
                            </div>
                        </div>

                        <div class="chapter-list">
                            <ul>
                ${this.dashboard.chapters.map(chapter => {
                    const chapterData = progress.chapters[chapter.id] || { completed: false, score: 0 };
                    const config = this.dashboard.modules.chapters ? null : null; // simplified
                    const isLocked = false; // simplified
                            
                    let statusClass = 'status-not-started';
                    let statusText = 'Non commencé';
                            
                    if (chapterData.completed) {
                        statusClass = 'status-completed';
                        statusText = 'Validé';
                    } else if (chapterData.score > 0) {
                        statusClass = 'status-in-progress';
                        statusText = 'En cours';
                    } else if (chapterData.submissionStatus === 'submitted') {
                        statusClass = 'status-pending-review';
                        statusText = 'Soumis';
                    }
                            
                    const hasStarted = chapterData.questions && Object.keys(chapterData.questions).length > 0;

                    return `
                        <li>
                            <a class="chapter-link" onclick="dashboard.modules.submissions.showStudentChapterDetails('${student.id}', ${chapter.id})">
                                ${chapter.title}
                            </a>
                            <span class="status-badge ${statusClass}">${statusText}</span>
                            ${hasStarted ? `
                            <button class="btn-view-student" onclick="dashboard.showStudentChapterView('${student.id}', ${chapter.id})" title="Voir les réponses de l'élève">
                                👁️
                            </button>
                            ` : ''}
                        </li>
                    `;
                }).join('')}
                            </ul>
                        </div>
                    </div>
                `;
            }
        }

        html += `
                </div>
            </div>
        `;
        
        return html;
    }

    getLastActivity(progress) {
        let latestDate = null;
        
        Object.values(progress.chapters).forEach(chapter => {
            if (chapter.timestamp) {
                const date = new Date(chapter.timestamp);
                if (!latestDate || date > latestDate) {
                    latestDate = date;
                }
            }
        });

        return latestDate ? latestDate.toLocaleDateString('fr-FR') : 'Jamais';
    }

    showStudentChapterDetails(studentId, chapterId) {
        // Open a modal with detailed chapter info for the student
        alert(`Détails du chapitre ${chapterId} pour l'élève ${studentId} - Fonctionnalité à implémenter`);
    }

    filterSubmissions() {
        const statusFilter = document.getElementById('filter-status').value;
        const chapterFilter = document.getElementById('filter-chapter').value;
        const priorityFilter = document.getElementById('filter-priority').value;

        let filtered = [...this.submissions];

        if (statusFilter !== 'all') {
            if (statusFilter === 'pending_review') {
                filtered = filtered.filter(s => s.correctionStatus === 'pending_review' || s.correctionStatus === 'in_progress');
            } else {
                filtered = filtered.filter(s => s.submissionStatus === statusFilter);
            }
        }

        if (chapterFilter !== 'all') {
            filtered = filtered.filter(s => s.chapterId == chapterFilter);
        }

        if (priorityFilter !== 'all') {
            filtered = filtered.filter(s => {
                const priority = s.teacherMonitoring?.priorityLevel || 'normal';
                return priority === priorityFilter;
            });
        }

        this.renderSubmissionsList(filtered);
    }

    renderSubmissionsList(submissions) {
        const grid = document.getElementById('submissions-grid');
        
        if (submissions.length === 0) {
            grid.innerHTML = `
                <div class="empty-submissions">
                    <p>🎉 Aucun rendu à corriger !</p>
                    <small>Tous les chapitres soumis ont été corrigés.</small>
                </div>
            `;
            return;
        }

        let html = '';
        submissions.forEach(sub => {
            const isLate = sub.submissionStatus === 'late_submitted';
            const isReturned = sub.submissionStatus === 'returned_for_revision';
            const isPending = sub.correctionStatus === 'pending_review';
            
            let cardClass = '';
            if (isLate) cardClass = 'late';
            else if (isReturned) cardClass = 'returned';
            else if (isPending) cardClass = 'pending';

            let badgeClass = 'badge-submitted';
            let badgeText = 'Soumis';
            if (isLate) { badgeClass = 'badge-late'; badgeText = 'En retard'; }
            else if (isReturned) { badgeClass = 'badge-returned'; badgeText = 'À revoir'; }

            const submittedDate = sub.submittedAt ? new Date(sub.submittedAt).toLocaleString('fr-FR') : 'N/A';
            const pendingCount = sub.pendingCorrectionCount || 0;
            const correctedCount = sub.correctedQuestionCount || 0;
            const totalManual = sub.manualCorrectionCount || 0;

            html += `
                <div class="submission-card ${cardClass}">
                    <div class="submission-header">
                        <h4>${sub.studentName}</h4>
                        <span class="submission-badge ${badgeClass}">${badgeText}</span>
                    </div>
                    <div class="submission-info">
                        <strong>Chapitre:</strong> ${sub.chapterTitle}<br>
                        <strong>Classe:</strong> ${sub.studentClass}<br>
                        <strong>Soumis le:</strong> ${submittedDate}<br>
                        <strong>Score actuel:</strong> ${sub.finalScore || 0} points
                    </div>
                    <div class="submission-info">
                        <strong>Correction:</strong> ${correctedCount}/${totalManual} questions corrigées
                        ${pendingCount > 0 ? `<span style="color: #e67e22;"> (${pendingCount} en attente)</span>` : ''}
                    </div>
                    <div class="submission-actions">
                        <button class="btn-correct" onclick="dashboard.modules.submissions.openCorrectionModal('${sub.studentId}', ${sub.chapterId})">
                            ✏️ Corriger
                        </button>
                        ${isPending || correctedCount === totalManual ? `
                        <button class="btn-approve" onclick="dashboard.modules.submissions.approveChapter('${sub.studentId}', ${sub.chapterId})">
                            ✅ Valider
                        </button>
                        ` : ''}
                        <button class="btn-return" onclick="dashboard.modules.submissions.returnForRevision('${sub.studentId}', ${sub.chapterId})">
                            🔄 Renvoyer
                        </button>
                        <button class="btn-view" onclick="dashboard.showStudentChapterView('${sub.studentId}', ${sub.chapterId})" title="Voir la copie">
                            👁️
                        </button>
                    </div>
                </div>
            `;
        });

        grid.innerHTML = html;
    }

    async openCorrectionModal(studentId, chapterId) {
        const users = await this.dashboard.auth.getUsers();
        const student = users.find(u => u.id === studentId);
        const progress = await this.dashboard.getStudentProgress(studentId);
        const chapter = progress.chapters[chapterId];
        const chapterConfig = this.dashboard.chapters.find(c => c.id === chapterId);

        if (!chapter || !chapterConfig) {
            alert('Chapitre introuvable');
            return;
        }

        // Récupérer les questions qui nécessitent une correction manuelle
        const questionsToCorrect = [];
        if (chapter.questions) {
            Object.entries(chapter.questions).forEach(([questionId, questionData]) => {
                if (questionId.startsWith('course_')) return;
                
                if (questionData.needsManualCorrection && 
                    (questionData.manualCorrectionStatus === 'pending' || 
                     questionData.manualCorrectionStatus === 'not_needed')) {
                    questionsToCorrect.push({
                        id: questionId,
                        ...questionData
                    });
                }
            });
        }

        let questionsHtml = '';
        if (questionsToCorrect.length === 0) {
            questionsHtml = '<p style="text-align: center; color: #666; padding: 1rem;">Toutes les questions ont déjà été corrigées.</p>';
        } else {
            questionsToCorrect.forEach(q => {
                const answer = q.answer || '(pas de réponse)';
                const status = q.manualCorrectionStatus;
                const maxPoints = chapterConfig.questions?.find(qc => qc.id === q.id)?.points || 0;
                
                questionsHtml += `
                    <div class="question-correction" id="correction-${q.id}">
                        <div class="question-correction-header">
                            <h6>Question: ${q.id}</h6>
                            <span class="status-badge status-${status === 'pending' ? 'pending-review' : 'corrected'}">${status}</span>
                        </div>
                        <div class="question-answer">
                            <strong>Réponse de l'élève:</strong><br>
                            ${answer}
                        </div>
                        <div class="correction-inputs">
                            <div class="form-group">
                                <label>Score (/${maxPoints})</label>
                                <input type="number" id="score-${q.id}" min="0" 
                                    max="${maxPoints}" 
                                    value="${q.teacherScore || 0}" step="0.5">
                            </div>
                            <div class="form-group">
                                <label>Commentaire</label>
                                <textarea id="comment-${q.id}" placeholder="Commentaire pour l'élève...">${q.teacherComment || ''}</textarea>
                            </div>
                            <div style="display: flex; gap: 0.5rem; flex-direction: column;">
                                <button class="btn-save-correction" onclick="dashboard.modules.submissions.saveQuestionCorrection('${studentId}', ${chapterId}, '${q.id}')">
                                    💾 Sauvegarder
                                </button>
                                <button class="btn-return-question" onclick="dashboard.modules.submissions.returnQuestion('${studentId}', ${chapterId}, '${q.id}')">
                                    🔄 Renvoyer
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            });
        }

        const modalHtml = `
            <div class="modal-overlay" id="correction-modal">
                <div class="modal-content" style="max-width: 900px;">
                    <div class="modal-header">
                        <h3>Correction - ${chapterConfig.title}</h3>
                        <button class="close-btn" onclick="dashboard.modules.submissions.closeCorrectionModal()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="student-info-header">
                            <strong>Élève:</strong> ${student.name} (${student.class})
                        </div>
                        ${questionsHtml}
                    </div>
                </div>
            </div>
        `;

        // Fermer d'abord tout modal existant
        const existingModal = document.getElementById('correction-modal');
        if (existingModal) existingModal.remove();

        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    async saveQuestionCorrection(studentId, chapterId, questionId) {
        const scoreInput = document.getElementById(`score-${questionId}`);
        const commentInput = document.getElementById(`comment-${questionId}`);
        
        if (!scoreInput || !commentInput) return;

        const teacherScore = parseFloat(scoreInput.value) || 0;
        const teacherComment = commentInput.value.trim();

        try {
            const progress = await this.dashboard.getStudentProgress(studentId);
            const chapter = progress.chapters[chapterId];
            
            if (chapter && chapter.questions[questionId]) {
                const question = chapter.questions[questionId];
                question.teacherScore = teacherScore;
                question.teacherComment = teacherComment;
                question.manualCorrectionStatus = 'corrected';
                question.correctedAt = new Date().toISOString();

                // Recalculer le score final
                chapter.finalScore = Object.values(chapter.questions)
                    .filter(q => !q.needsManualCorrection && q.isCorrect === true)
                    .reduce((sum, q) => sum + (q.score || 0), 0) +
                    Object.values(chapter.questions)
                    .filter(q => q.needsManualCorrection)
                    .reduce((sum, q) => sum + (q.teacherScore || 0), 0);

                await storage.set(`student_${studentId}_progress`, progress);
                
                alert('✅ Correction sauvegardée !');
                this.closeCorrectionModal();
                this.openCorrectionModal(studentId, chapterId);
                this.refresh();
            }
        } catch (error) {
            console.error('❌ Erreur sauvegarde correction:', error);
            alert('❌ Une erreur est survenue lors de la sauvegarde.');
        }
    }

    async returnQuestion(studentId, chapterId, questionId) {
        const confirmed = confirm('🔄 Renvoyer cette question à l\'élève pour révision ?');
        if (!confirmed) return;

        try {
            const progress = await this.dashboard.getStudentProgress(studentId);
            const chapter = progress.chapters[chapterId];
            
            if (chapter && chapter.questions[questionId]) {
                const question = chapter.questions[questionId];
                question.manualCorrectionStatus = 'returned_for_revision';
                question.revisionRequested = true;
                question.revisionRequestedAt = new Date().toISOString();

                await storage.set(`student_${studentId}_progress`, progress);
                
                alert('🔄 Question renvoyée pour révision !');
                this.closeCorrectionModal();
                this.refresh();
            }
        } catch (error) {
            console.error('❌ Erreur renvoi question:', error);
            alert('❌ Une erreur est survenue.');
        }
    }

    async approveChapter(studentId, chapterId) {
        const confirmed = confirm('✅ Valider définitivement ce chapitre ?');
        if (!confirmed) return;

        try {
            const progress = await this.dashboard.getStudentProgress(studentId);
            const chapter = progress.chapters[chapterId];
            
            if (chapter) {
                chapter.approvedAt = new Date().toISOString();
                chapter.validatedAt = chapter.approvedAt;
                chapter.submissionStatus = 'approved';

                await storage.set(`student_${studentId}_progress`, progress);
                
                alert('✅ Chapitre validé avec succès !');
                this.closeCorrectionModal();
                this.refresh();
            }
        } catch (error) {
            console.error('❌ Erreur validation chapitre:', error);
            alert('❌ Une erreur est survenue.');
        }
    }

    async returnForRevision(studentId, chapterId) {
        const comment = prompt('💬 Commentaire pour l\'élève (optionnel) :');
        
        try {
            const progress = await this.dashboard.getStudentProgress(studentId);
            const chapter = progress.chapters[chapterId];
            
            if (chapter) {
                chapter.revisionRequestedAt = new Date().toISOString();
                chapter.teacherComment = comment || '';
                chapter.submissionStatus = 'returned_for_revision';

                await storage.set(`student_${studentId}_progress`, progress);
                
                alert('🔄 Chapitre renvoyé pour révision !');
                this.refresh();
            }
        } catch (error) {
            console.error('❌ Erreur renvoi chapitre:', error);
            alert('❌ Une erreur est survenue.');
        }
    }

    async showStudentChapterView(studentId, chapterId) {
        const users = await this.dashboard.auth.getUsers();
        const student = users.find(u => u.id === studentId);
        const chapterConfig = this.dashboard.chapters.find(c => c.id === chapterId);
        
        if (!student || !chapterConfig) {
            alert('Élève ou chapitre introuvable');
            return;
        }

        const chapterFileName = `chapitre${chapterId}.html`;
        const chapterUrl = `../chapters/${chapterFileName}?teacher_view=true&student_id=${studentId}&t=${Date.now()}`;

        const modalHtml = `
            <div class="modal-overlay" id="student-chapter-view-modal">
                <div class="modal-content" style="max-width: 95%; width: 95%; max-height: 90vh; padding: 0; overflow: hidden;">
                    <div class="modal-header" style="background: #2c3e50; color: white; margin: 0; padding: 1rem 2rem; border-radius: 0;">
                        <h3 style="margin: 0; color: white;">👁️ Vue Élève - ${chapterConfig.title} (${student.name})</h3>
                        <button class="close-btn" onclick="dashboard.modules.submissions.closeStudentChapterView()" style="color: white;">&times;</button>
                    </div>
                    
                    <div class="teacher-view-banner" style="background: #fff3cd; color: #856404; padding: 0.75rem 1rem; text-align: center; font-weight: bold; border-bottom: 1px solid #ffc107;">
                        👨‍🏫 Mode Professeur - Lecture seule - Vous voyez ce que l'élève voit
                    </div>
                    
                    <div style="height: calc(90vh - 120px);">
                        <iframe 
                            id="student-chapter-iframe"
                            src="${chapterUrl}" 
                            style="width: 100%; height: 100%; border: none;"
                            title="Vue élève du chapitre"
                        ></iframe>
                    </div>
                </div>
            </div>
        `;

        // Fermer d'abord tout modal existant
        const existingModal = document.getElementById('student-chapter-view-modal');
        if (existingModal) existingModal.remove();

        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    closeCorrectionModal() {
        const modal = document.getElementById('correction-modal');
        if (modal) modal.remove();
    }

    closeStudentChapterView() {
        const modal = document.getElementById('student-chapter-view-modal');
        if (modal) modal.remove();
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.remove();
    }
}