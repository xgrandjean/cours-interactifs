/**
 * teacherSubmissions.js - Module de gestion des rendus et corrections
 * Vue détaillée des apprenants, corrections manuelles, validation
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
                    // ✅ EXCLUSION: si chapitre est VALIDE DEFINITIVEMENT on ne l'affiche PLUS DANS LES RENDUS A CORRIGER
                    if (chapterData.correctionStatus === 'validated') continue;
                    
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
                    <label for="filter-submission-search">Recherche:</label>
                    <input type="text" id="filter-submission-search" oninput="dashboard.modules.submissions.filterSubmissions()" placeholder="Rechercher un nom...">
                </div>
                <div class="filter-group">
                    <label for="filter-status">Statut:</label>
                    <select id="filter-status" onchange="dashboard.modules.submissions.filterSubmissions()">
                        <option value="all">Tous</option>
                        <option value="submitted">Rendu</option>
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
                    <label for="filter-class">Classe:</label>
                    <select id="filter-class" onchange="dashboard.modules.submissions.filterSubmissions()">
                        <option value="all">Toutes</option>
                        ${[...new Set(this.submissions.map(s => s.studentClass).filter(c => c))].sort().map(cls => `<option value="${cls}">${cls}</option>`).join('')}
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
            // Liste des chapitres à corriger  - Onglet "Rendus à corriger"
            this.submissions.forEach(sub => {
                const isLate = sub.submissionStatus === 'late_submitted';
                const isReturned = sub.submissionStatus === 'returned_for_revision';
                const isPending = sub.correctionStatus === 'pending_review';
                
                let cardClass = '';
                if (isLate) cardClass = 'late';
                else if (isReturned) cardClass = 'returned';
                else if (isPending) cardClass = 'pending';

                const submittedDate = sub.submittedAt ? new Date(sub.submittedAt).toLocaleString('fr-FR') : 'N/A';
                // ✅ CALCUL EN DIRECT DES COMPTEURS (pas les valeurs obsolètes de la soumission)
                const manualQuestions = Object.values(sub.questions || {})
                    .filter(q => q.needsManualCorrection === true);
                const totalManual = manualQuestions.length;
                const correctedCount = manualQuestions.filter(q => ["corrected", "validated"].includes(q.manualCorrectionStatus)).length;
                const pendingCount = manualQuestions.filter(q => q.manualCorrectionStatus === 'pending').length;

                const isInProgress = sub.correctionStatus === 'in_progress' || (correctedCount > 0 && correctedCount < totalManual);
                
                let badgeClass = 'badge-submitted';
                let badgeText = '📤 Rendu';
                if (isLate) { badgeClass = 'badge-late'; badgeText = '📤 En retard'; }
                else if (isReturned) { badgeClass = 'badge-returned'; badgeText = '🔄 À revoir'; }
                else if (isInProgress) { badgeClass = 'badge-in-progress'; badgeText = '🟡 En correction'; }

                html += `
                    <div class="submission-card ${cardClass}">
                        <div class="submission-header">
                            <h4>${sub.studentName}</h4>
                            <span class="submission-badge ${badgeClass}">${badgeText}</span>
                        </div>
                         <div class="submission-info">
                             <strong>Chapitre:</strong> ${sub.chapterTitle}<br>
                             <strong>Classe:</strong> ${sub.studentClass}<br>
                             <strong>Rendu le:</strong> ${submittedDate}<br>
                             <strong>Progression:</strong> ${sub.completionPercent || 0}%
                         </div>
                         <div class="submission-info">
                             ${totalManual > 0 
                                 ? `<strong>Correction:</strong> ${correctedCount}/${totalManual} questions corrigées ${pendingCount > 0 ? `<span style="color: #e67e22;"> (${pendingCount} en attente)</span>` : ''}`
                                 : `<strong>Correction:</strong> ✅ Aucune question à corriger`
                             }
                         </div>
                        <div class="submission-actions">

                            ${!isReturned ? `
                            <button class="btn-correct" onclick="dashboard.modules.submissions.openCorrectionModal('${sub.studentId}', ${sub.chapterId})">
                                ✏️ Corriger
                            </button>
                            ` : `
                            <button class="btn-correct" disabled style="opacity: 0.4; cursor: not-allowed;" title="Impossible de corriger : ce chapitre a été renvoyé à l'apprenant, il n'a pas encore rendu sa nouvelle version">
                                ✏️ Corriger
                            </button>
                            `}

                            ${!isReturned ? `
                            <button class="btn-return" onclick="dashboard.modules.submissions.returnForRevision('${sub.studentId}', ${sub.chapterId})">
                                🔄 Renvoyer
                            </button>
                            ` : `
                            <button class="btn-return" disabled style="opacity: 0.4; cursor: not-allowed;" title="Ce chapitre a déjà été renvoyé pour révision">
                                🔄 Renvoyer
                            </button>
                            `}

                            <button class="btn-view-student" onclick="dashboard.showStudentChapterView('${sub.studentId}', ${sub.chapterId})" title="Voir les réponses de l'apprenant">
                                👁️
                            </button>
                        </div>
                    </div>
                `;
            });
        }

        html += '</div>';
        this.container.innerHTML = html;
    }

    async renderStudentDetailsSection() {
        console.log('✅✅✅ VERSION MODIFIÉE ACTIVE - Progression par chapitre affichée ✅✅✅');
        const students = await this.dashboard.getStudents();
        
        let html = `
            <div class="students-list" style="margin-top: 2rem;">
                <h2>Détails par Apprenant</h2>
                <button class="refresh-btn" id="refresh-dashboard" onclick="dashboard.modules.submissions.refresh()">🔄 Rafraîchir les données</button>
                <div class="students-grid" id="students-grid">
        `;

        if (students.length === 0) {
            html += '<div class="empty-state">Aucun apprenant enregistré.</div>';
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
                    
                    // DEBUG - Affichage des valeurs exactes dans la console
                    console.log(`🔍 Chapitre ${chapter.id} pour ${student.name}:`, {
                        correctionStatus: chapterData.correctionStatus,
                        completed: chapterData.completed,
                        score: chapterData.score,
                        submissionStatus: chapterData.submissionStatus
                    });
                            
                    let statusClass = 'status-not-started';
                    let statusText = 'Non commencé';
                            
                    // PRIORITE ABSOLUE: Si c'est validated = VALIDE DEFINITIVEMENT
                    if (chapterData.correctionStatus === 'validated') {
                        statusClass = 'status-completed';
                        statusText = '✅ Validé';
                    } 
                    else if (chapterData.completed) {
                        statusClass = 'status-completed';
                        statusText = 'Validé';
                    } 
                    else if (chapterData.score > 0) {
                        statusClass = 'status-in-progress';
                        statusText = '🟡 En cours';
                    } 
                    else if (chapterData.submissionStatus === 'submitted') {
                        statusClass = 'status-pending-review';
                        statusText = 'Rendu';
                    }
                            
                    const hasStarted = chapterData.questions && Object.keys(chapterData.questions).length > 0;

                    return `
                        <li style="display: flex; align-items: center; justify-content: space-between;">
                            <div style="display: flex; align-items: center; gap: 0.75rem;">
                                <a class="chapter-link" onclick="dashboard.modules.submissions.showStudentChapterDetails('${student.id}', ${chapter.id})">
                                    ${chapter.title}
                                </a>
                                <span class="status-badge ${statusClass}">${statusText}</span>
                            </div>
                            <span style="font-weight: 600; color: #34495e; min-width: 45px; text-align: right;">
                                ${hasStarted && chapterData ? `${chapterData.completionPercent || 0}%` : ''}
                            </span>
                            ${hasStarted ? `
                            <button class="btn-view-student" onclick="dashboard.showStudentChapterView('${student.id}', ${chapter.id})" title="Voir les réponses de l'apprenant">
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
        alert(`Détails du chapitre ${chapterId} pour l'apprenant ${studentId} - Fonctionnalité à implémenter`);
    }

    filterSubmissions() {
        const searchFilter = document.getElementById('filter-submission-search').value.toLowerCase().trim();
        const statusFilter = document.getElementById('filter-status').value;
        const chapterFilter = document.getElementById('filter-chapter').value;
        const classFilter = document.getElementById('filter-class').value;

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

        if (classFilter !== 'all') {
            filtered = filtered.filter(s => s.studentClass === classFilter);
        }

        if (searchFilter !== '') {
            filtered = filtered.filter(s => 
                s.studentName.toLowerCase().includes(searchFilter)
            );
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

            const submittedDate = sub.submittedAt ? new Date(sub.submittedAt).toLocaleString('fr-FR') : 'N/A';
                // ✅ CALCUL EN DIRECT DES COMPTEURS (pas les valeurs obsolètes de la soumission)
                const manualQuestions = Object.values(sub.questions || {})
                    .filter(q => q.needsManualCorrection === true);
                const totalManual = manualQuestions.length;
                const correctedCount = manualQuestions.filter(q => ["corrected", "validated"].includes(q.manualCorrectionStatus)).length;
                const pendingCount = manualQuestions.filter(q => q.manualCorrectionStatus === 'pending').length;

                const isInProgress = sub.correctionStatus === 'in_progress' || (correctedCount > 0 && correctedCount < totalManual);
                
                let badgeClass = 'badge-submitted';
                let badgeText = '📤 Rendu';
                if (isLate) { badgeClass = 'badge-late'; badgeText = '📤 En retard'; }
                else if (isReturned) { badgeClass = 'badge-returned'; badgeText = '🔄 À revoir'; }
                else if (isInProgress) { badgeClass = 'badge-in-progress'; badgeText = '🟡 En correction'; }

            html += `
                <div class="submission-card ${cardClass}">
                    <div class="submission-header">
                        <h4>${sub.studentName}</h4>
                        <span class="submission-badge ${badgeClass}">${badgeText}</span>
                    </div>
                     <div class="submission-info">
                         <strong>Chapitre:</strong> ${sub.chapterTitle}<br>
                         <strong>Classe:</strong> ${sub.studentClass}<br>
                         <strong>Rendu le:</strong> ${submittedDate}<br>
                         <strong>Progression:</strong> ${sub.completionPercent || 0}%
                     </div>
                    <div class="submission-info">
                        ${totalManual > 0 
                            ? `<strong>Correction:</strong> ${correctedCount}/${totalManual} questions corrigées ${pendingCount > 0 ? `<span style="color: #e67e22;"> (${pendingCount} en attente)</span>` : ''}`
                            : `<strong>Correction:</strong> ✅ Aucune question à corriger`
                        }
                    </div>
                    <div class="submission-actions">

                        ${!isReturned ? `
                        <button class="btn-correct" onclick="dashboard.modules.submissions.openCorrectionModal('${sub.studentId}', ${sub.chapterId})">
                            ✏️ Corriger
                        </button>
                        ` : `
                        <button class="btn-correct" disabled style="opacity: 0.4; cursor: not-allowed;" title="Impossible de corriger : ce chapitre a été renvoyé à l'apprenant, il n'a pas encore rendu sa nouvelle version">
                            ✏️ Corriger
                        </button>
                        `}

                        ${!isReturned ? `
                        <button class="btn-return" onclick="dashboard.modules.submissions.returnForRevision('${sub.studentId}', ${sub.chapterId})">
                            🔄 Renvoyer
                        </button>
                        ` : `
                        <button class="btn-return" disabled style="opacity: 0.4; cursor: not-allowed;" title="Ce chapitre a déjà été renvoyé pour révision">
                            🔄 Renvoyer
                        </button>
                        `}

                        <button class="btn-view" onclick="dashboard.showStudentChapterView('${sub.studentId}', ${sub.chapterId})" title="Voir la copie">
                            👁️
                        </button>
                    </div>
                </div>
            `;
        });

        grid.innerHTML = html;
    }

    /**
     * Ouvre le modal de correction (délégué au composant autonome CorrectionModal)
     */
    async openCorrectionModal(studentId, chapterId) {
        await window.correctionModal.open(studentId, chapterId, this.dashboard);
    }

    async returnForRevision(studentId, chapterId) {
        const comment = prompt('💬 Commentaire pour l\'apprenant (optionnel) :');
        
        // Si l'utilisateur clique sur Annuler → on arrête tout, aucune action
        if (comment === null) {
            return;
        }

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
            alert('Apprenant ou chapitre introuvable');
            return;
        }

        const chapterFileName = `chapitre${chapterId}.html`;
        const chapterUrl = `../chapters/${chapterFileName}?teacher_view=true&student_id=${studentId}&t=${Date.now()}`;

        const modalHtml = `
            <div class="modal-overlay" id="student-chapter-view-modal">
                <div class="modal-content" style="max-width: 95%; width: 95%; max-height: 90vh; padding: 0; overflow: hidden;">
                    <div class="modal-header" style="background: #2c3e50; color: white; margin: 0; padding: 1rem 2rem; border-radius: 0;">
                        <h3 style="margin: 0; color: white;">👁️ Vue Apprenant - ${chapterConfig.title} (${student.name})</h3>
                        <button class="close-btn" onclick="dashboard.modules.submissions.closeStudentChapterView()" style="color: white;">&times;</button>
                    </div>
                    
                    <div class="teacher-view-banner" style="background: #fff3cd; color: #856404; padding: 0.75rem 1rem; text-align: center; font-weight: bold; border-bottom: 1px solid #ffc107;">
                        👨‍🏫 Mode Formateur - Lecture seule - Vous voyez ce que l'apprenant voit
                    </div>
                    
                    <div style="height: calc(90vh - 120px);">
                        <iframe 
                            id="student-chapter-iframe"
                            src="${chapterUrl}" 
                            style="width: 100%; height: 100%; border: none;"
                            title="Vue apprenant du chapitre"
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