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
        
        if (students.length === 0) {
            this.submissions = [];
            return;
        }
        
        const progressesMap = new Map();
        const progressPromises = students.map(async (student) => {
            const progress = await this.dashboard.getStudentProgress(student.id);
            progressesMap.set(student.id, progress);
        });
        await Promise.all(progressPromises);
        
        this.submissions = [];
        
        for (const student of students) {
            const progress = progressesMap.get(student.id);
            if (!progress) continue;
            
            for (const chapter of chapters) {
                const chapterData = progress.chapters[chapter.id];
                if (!chapterData) continue;

                // Mode EFFECTIF du chapitre pour CET apprenant. Même précédence que la vue
                // élève (frozenChapterMode d'abord), et `chapter` vient de dashboard.chapters,
                // qui fusionne déjà cours.json et les réglages de chapter_config
                // (teacherDashboard.js:209-221) : le mode lu est donc bien le mode courant.
                const examContext = (typeof getExamContext === 'function')
                    ? getExamContext(chapterData, chapter)
                    : { isConsigneMode: false };
                const isConsigneMode = examContext.isConsigneMode === true;

                // En consigne, l'apprenant n'a rien à rendre : il a composé sur papier. Exiger
                // un rendu, comme le fait la règle ci-dessous, rendait la copie inatteignable
                // — le bouton « ✏️ Corriger » n'apparaissait jamais. Le chapitre entre donc dans
                // la liste dès qu'il existe, quel que soit son statut de rendu.
                const needsCorrection = isConsigneMode ||
                    chapterData.submissionStatus === 'submitted' ||
                    chapterData.submissionStatus === 'late_submitted' ||
                    chapterData.submissionStatus === 'returned_for_revision' ||
                    chapterData.correctionStatus === 'pending_review' ||
                    chapterData.correctionStatus === 'in_progress';

                if (needsCorrection && chapterData.submissionStatus !== 'validated') {
                    // ✅ Calcul des totaux selon la logique du modal
                    const chapterConfig = chapters.find(ch => ch.id === chapter.id);
                    let totalToCorrect = 0;
                    let correctedCount = 0;
                    
                    if (chapterConfig && chapterConfig.questions) {
                        for (const qConfig of chapterConfig.questions) {
                            const qData = chapterData.questions?.[qConfig.id] || {};
                            let needsManual = false;

                            if (isConsigneMode) {
                                // Dénominateur du compteur « X/Y traitées » en consigne : TOUTES
                                // les questions (les blocs de cours n'en font pas partie, ils
                                // vivent dans chapterConfig.courses, pas ici).
                                //
                                // La règle générale ci-dessous exclut les auto et ne retient les
                                // semi que si l'apprenant a répondu dans l'application. Sur une
                                // copie papier, où presque rien n'est répondu à l'écran, elle
                                // affichait « 0/0 traitées » — un compteur qui ne voulait rien dire
                                // dans le seul mode où il sert vraiment.
                                needsManual = true;
                            } else if (qConfig.correctionType === 'manuel') {
                                needsManual = true;
                            } else if (qConfig.correctionType === 'semi') {
                                // À corriger si l'élève a répondu ET la réponse n'est pas auto-validée
                                if (qData.answered && qData.isCorrect !== true) {
                                    needsManual = true;
                                }
                            }
                            
                            if (needsManual) {
                                totalToCorrect++;
                                if (qData.manualCorrectionStatus === 'corrected' || qData.manualCorrectionStatus === 'validated') {
                                    correctedCount++;
                                }
                            }
                        }
                    }
                    
                    this.submissions.push({
                        studentId: student.id,
                        studentName: student.name,
                        studentClass: student.class,
                        chapterId: chapter.id,
                        chapterTitle: chapter.title,
                        ...chapterData,
                        isConsigneMode,    // ← sépare les copies papier des vrais rendus
                        totalToCorrect,    // ← stocké
                        correctedCount     // ← stocké
                    });
                }
            }
        }
        
        this.submissions.sort((a, b) => {
            // Les consignes papier passent après les vrais rendus : elles restent dans la liste
            // en permanence (rien ne les « rend »), donc en tête elles masqueraient le travail
            // du jour.
            if (a.isConsigneMode !== b.isConsigneMode) return a.isConsigneMode ? 1 : -1;
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
            // Les consignes papier sont exclues du compteur : elles n'ont pas de rendu à
            // attendre, elles figureraient donc en permanence dans le badge et celui-ci ne
            // signalerait plus rien. Elles se consultent par le filtre « 📋 Consignes (papier) ».
            const aCorriger = this.submissions.filter(sub => !sub.isConsigneMode).length;
            badge.textContent = aCorriger;
            badge.style.display = aCorriger > 0 ? 'inline' : 'none';
        }
    }


    async render() {
        // Deux populations distinctes dans le même onglet : les vrais rendus, et les copies
        // papier du mode consigne, qui ne sont pas « en attente de rendu » et ne doivent donc
        // pas gonfler le compteur.
        const rendus = this.submissions.filter(sub => !sub.isConsigneMode);
        const consignes = this.submissions.filter(sub => sub.isConsigneMode);

        let html = `
            <div class="section-header">
                <h2>📬 Rendus à Corriger</h2>
                <p>${rendus.length} rendu(s) en attente de correction${consignes.length
                    ? ` — et ${consignes.length} copie(s) papier, à voir dans le filtre « 📋 Consignes (papier) »`
                    : ''}</p>
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
                        <option value="consigne">📋 Consignes (papier)</option>
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

        if (rendus.length === 0) {
            html += `
                <div class="empty-submissions">
                    <p>🎉 Aucun rendu à corriger !</p>
                    <small>Tous les chapitres soumis ont été corrigés.</small>
                </div>
            `;
        } else {
            // Liste des chapitres à corriger  - Onglet "Rendus à corriger"
            rendus.forEach(sub => {
                const isLate = sub.submissionStatus === 'late_submitted';
                const isReturned = sub.submissionStatus === 'returned_for_revision';
                const isPending = sub.correctionStatus === 'pending_review';
                
                let cardClass = '';
                if (isLate) cardClass = 'late';
                else if (isReturned) cardClass = 'returned_for_revision';
                else if (isPending) cardClass = 'pending';

                const submittedDate = sub.submittedAt ? new Date(sub.submittedAt).toLocaleString('fr-FR') : 'N/A';
                const isInProgress = sub.correctionStatus === 'in_progress' || (sub.correctedCount > 0 && sub.correctedCount < sub.totalToCorrect);
                
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
                             ${sub.totalToCorrect > 0 
                                 ? `<strong>Correction:</strong> ${sub.correctedCount}/${sub.totalToCorrect} questions traitées`
                                 : `<strong>Correction:</strong> ✅ Aucune question à corriger`
                             }
                         </div>
                        <div class="submission-actions">

                            ${!isReturned ? `
                            <button class="btn-correct" onclick="dashboard.modules.submissions.openCorrectionModal('${sub.studentId}', '${sub.chapterId}')">
                                ✏️ Corriger
                            </button>
                            ` : `
                            <button class="btn-correct" disabled style="opacity: 0.4; cursor: not-allowed;" title="Impossible de corriger : ce chapitre a été renvoyé à l'apprenant, il n'a pas encore rendu sa nouvelle version">
                                ✏️ Corriger
                            </button>
                            `}

                            ${!isReturned ? `
                            <button class="btn-return" onclick="dashboard.modules.submissions.returnForRevision('${sub.studentId}', '${sub.chapterId}')">
                                🔄 Renvoyer
                            </button>
                            ` : `
                            <button class="btn-return" disabled style="opacity: 0.4; cursor: not-allowed;" title="Ce chapitre a déjà été renvoyé pour révision">
                                🔄 Renvoyer
                            </button>
                            `}

                            <button class="btn-view-student" onclick="dashboard.showStudentChapterView('${sub.studentId}', '${sub.chapterId}')" title="Voir les réponses de l'apprenant">
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

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    filterSubmissions() {
        const searchFilter = document.getElementById('filter-submission-search').value.toLowerCase().trim();
        const statusFilter = document.getElementById('filter-status').value;
        const chapterFilter = document.getElementById('filter-chapter').value;
        const classFilter = document.getElementById('filter-class').value;

        // « 📋 Consignes (papier) » n'est pas un statut de rendu mais un mode de chapitre :
        // c'est la seule entrée qui montre les copies papier, et toutes les autres les
        // excluent — sans quoi elles se mêleraient en permanence aux rendus du jour.
        const consigneOnly = statusFilter === 'consigne';
        let filtered = this.submissions.filter(sub => Boolean(sub.isConsigneMode) === consigneOnly);

        if (!consigneOnly && statusFilter !== 'all') {
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

        this.renderSubmissionsList(filtered, consigneOnly);
    }

    renderSubmissionsList(submissions, consigneOnly = false) {
        const grid = document.getElementById('submissions-grid');

        if (submissions.length === 0) {
            grid.innerHTML = consigneOnly ? `
                <div class="empty-submissions">
                    <p>📋 Aucune consigne papier</p>
                    <small>Aucun chapitre en mode Consigne n'a encore été ouvert par un apprenant.</small>
                </div>
            ` : `
                <div class="empty-submissions">
                    <p>🎉 Aucun rendu à corriger !</p>
                    <small>Tous les chapitres soumis ont été corrigés.</small>
                </div>
            `;
            return;
        }

        let html = '';
        for (const sub of submissions) {
            const isLate = sub.submissionStatus === 'late_submitted';
            // « Renvoyer pour révision » n'a pas de sens sur une copie papier jamais rendue :
            // on réutilise le verrou existant de ce bouton plutôt que d'en ajouter un.
            const isReturned = sub.submissionStatus === 'returned_for_revision' || sub.isConsigneMode;
            const submittedDate = sub.isConsigneMode
                ? '📄 sur papier'
                : (sub.submittedAt ? new Date(sub.submittedAt).toLocaleString('fr-FR') : 'N/A');

            // ✅ Utiliser les valeurs pré-calculées
            const totalToCorrect = sub.totalToCorrect || 0;
            const correctedCount = sub.correctedCount || 0;
            const pendingCount = totalToCorrect - correctedCount;

            let badgeClass = 'badge-submitted';
            let badgeText = '📤 Rendu';
            if (sub.isConsigneMode) { badgeClass = 'badge-returned'; badgeText = '📋 Consigne'; }
            else if (isLate) { badgeClass = 'badge-late'; badgeText = '📤 En retard'; }
            else if (sub.submissionStatus === 'returned_for_revision') { badgeClass = 'badge-returned'; badgeText = '🔄 À revoir'; }
            
            // Affichage clair
            let correctionDisplay = '';
            if (totalToCorrect === 0) {
                correctionDisplay = '<strong>Correction:</strong> ✅ Aucune question à corriger';
            } else {
                correctionDisplay = `<strong>À corriger:</strong> ${correctedCount}/${totalToCorrect} traitées (${pendingCount} restante${pendingCount > 1 ? 's' : ''})`;
            }
            
            html += `
                <div class="submission-card ${isLate ? 'late' : (isReturned ? 'returned_for_revision' : '')}">
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
                        ${correctionDisplay}
                    </div>
                    <div class="submission-actions">
                        ${(!isReturned || sub.isConsigneMode) ? `
                        <button class="btn-correct" onclick="dashboard.modules.submissions.openCorrectionModal('${sub.studentId}', '${sub.chapterId}')">
                            ✏️ Corriger
                        </button>
                        ` : `
                        <button class="btn-correct" disabled style="opacity: 0.4; cursor: not-allowed;">
                            ✏️ Corriger
                        </button>
                        `}
                        
                        ${!isReturned ? `
                        <button class="btn-return" onclick="dashboard.modules.submissions.returnForRevision('${sub.studentId}', '${sub.chapterId}')">
                            🔄 Renvoyer
                        </button>
                        ` : `
                        <button class="btn-return" disabled style="opacity: 0.4; cursor: not-allowed;">
                            🔄 Renvoyer
                        </button>
                        `}
                        
                        <button class="btn-view" onclick="dashboard.showStudentChapterView('${sub.studentId}', '${sub.chapterId}')" title="Voir la copie">
                            👁️
                        </button>
                    </div>
                </div>
            `;
        }
        
        grid.innerHTML = html;
    }    /**
        * Ouvre le modal de correction (délégué au composant autonome CorrectionModal)
     */
    async openCorrectionModal(studentId, chapterId) {
        await window.correctionModal.open(studentId, chapterId, this.dashboard);
    }

    async returnForRevision(studentId, chapterId) {
        console.log(`[returnForRevision] 🔄 Appelé pour studentId="${studentId}", chapterId="${chapterId}"`);
        
        const slug = window.currentParcoursSlug;
        if (!slug) {
            console.error(`[returnForRevision] ❌ Aucun slug sélectionné`);
            return;
        }
        
        // prompt() est maintenant remplacé par une modale DOM dans config.js
        // (fonctionne sans perte de focus dans les iframes Electron)
        const comment = await window.prompt('💬 Commentaire pour l\'apprenant (optionnel) :');
        
        if (comment === null) {
            console.log(`[returnForRevision] ⏹️ Annulé par l'utilisateur`);
            return;
        }

        try {
            const progress = await this.dashboard.getStudentProgress(studentId);
            const chapter = progress.chapters[chapterId];
            
            if (chapter) {
                chapter.teacherComment = comment || '';
                // Le setter pose revisionRequestedAt et efface une validation antérieure.
                ProgressManager.setSubmissionStatus(chapter, 'returned_for_revision');

                const key = `${slug}:${studentId}:student_${studentId}_progress`;
                await storage.set(key, progress);
                
                alert('🔄 Chapitre renvoyé pour révision !');
                this.refresh();
            } else {
                console.error(`[returnForRevision] ❌ chapter non trouvé dans progress.chapters`);
                alert(`❌ Chapitre "${chapterId}" introuvable dans la progression de l'étudiant.`);
            }
        } catch (error) {
            console.error('❌ Erreur renvoi chapitre:', error);
            alert('❌ Une erreur est survenue lors du renvoi.');
        }
    }

    async showStudentChapterView(studentId, chapterId) {
        const slug = window.currentParcoursSlug;
        if (!slug) return;
        
        const usersKey = `${slug}:teacher:users_list`;
        const users = await storage.get(usersKey) || [];
        const student = users.find(u => u.id === studentId);
        const chapterConfig = this.dashboard.chapters.find(c => c.id === chapterId);
        
        if (!student || !chapterConfig) {
            alert('Apprenant ou chapitre introuvable');
            return;
        }

        const chapterUrl = (window.BASE || '') + `/parcours/src/chapter_template.html?parcours=${slug}&chapitre=${chapterId}&teacher_view=true&student_id=${studentId}&t=${Date.now()}`;

        const modalHtml = `
            <div class="modal-overlay" id="student-chapter-view-modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>👁️ Vue Apprenant - ${this.escapeHtml(chapterConfig.title)} (${this.escapeHtml(student.name)})</h3>
                        <button class="close-btn" onclick="dashboard.modules.submissions.closeStudentChapterView()">&times;</button>
                    </div>
                    
                    <div class="teacher-view-banner">
                        👨🏫 Mode Formateur - Lecture seule - Vous voyez ce que l'apprenant voit
                    </div>
                    
                    <div class="iframe-container">
                        <iframe 
                            id="student-chapter-iframe"
                            src="${chapterUrl}" 
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