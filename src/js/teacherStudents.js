/**
 * teacherStudents.js - Module dédié à la vue Apprenants
 * Affichage détaillé, filtres, suivi de progression par étudiant
 * Séparé de teacherSubmissions pour une meilleure maintenabilité
 */
class TeacherStudents {
    constructor(dashboard) {
        this.dashboard = dashboard;
        this.container = document.getElementById('students-content');
        this.students = [];
        this.init();
    }

    async init() {
        await this.loadStudents();
        await this.render();
        
        document.addEventListener('click', () => {
            document.querySelectorAll('.chapter-actions-dropdown.active').forEach(menu => {
                menu.classList.remove('active');
            });
        });
    }

    async refresh() {
        await this.loadStudents();
        await this.render();
    }

    async loadStudents() {
        const allStudents = await this.dashboard.getStudents();
                
        // DÉDUPLIQUER LES ÉTUDIANTS SUR ID UNIQUE
        const uniqueStudents = new Map();
        const duplicates = [];
        
        allStudents.forEach((student, index) => {            
            if (uniqueStudents.has(student.id)) {
                console.log(`⚠️ DOUBLON DÉTECTÉ pour id=${student.id}`);
                duplicates.push(student);
            } else {
                uniqueStudents.set(student.id, student);
            }
        });
        
        this.students = Array.from(uniqueStudents.values());
        this.allStudentsCount = allStudents.length;
        this.duplicatesCount = duplicates.length;

        // Compter les Apprenants actifs (connectés : dernière activité < 15 minutes)
        this.activeCount = 0;
        const now = new Date();
        const FIFTEEN_MINUTES = 15 * 60 * 1000;

        for (const student of this.students) {
            const progress = await this.dashboard.getStudentProgress(student.id);
            
            // Calculer la dernière activité de l'apprenant
            let latestDate = null;
            Object.values(progress.chapters).forEach(chapter => {
                if (chapter.updatedAt) {
                    const date = new Date(chapter.updatedAt);
                    if (!latestDate || date > latestDate) {
                        latestDate = date;
                    }
                }
            });

            if (latestDate && (now - latestDate < FIFTEEN_MINUTES)) {
                this.activeCount++;
            }
        }
                
        // AVERTISSEMENT SI DOUBLONS
        if (duplicates.length > 0) {
            console.warn(`⚠️ ${duplicates.length} DOUBLONS D'ÉTUDIANTS DÉTECTÉS :`, duplicates);
        }
    }


    async render() {
        const allClasses = [...new Set(this.students.map(s => s.class).filter(c => c))].sort();

        let html = `
            <div class="section-header">
                <h2>👥 Suivi des Apprenants</h2>
                <p>${this.students.length} apprenant(s) enregistré(s) - ${this.activeCount} actif(s)
                    ${this.allStudentsCount > this.students.length ? 
                        `<span style="color: #e67e22; margin-left: 1rem;">⚠️ ${this.duplicatesCount} doublons masqués (voir console)</span>` : 
                        ''}
                </p>
            </div>

            <div class="submissions-filters">
                <div class="filter-group">
                    <label for="filter-student-search">Recherche:</label>
                    <input type="text" id="filter-student-search" oninput="dashboard.modules.students.filterStudents()" placeholder="Rechercher un nom...">
                </div>
                <div class="filter-group">
                    <label for="filter-student-class">Classe:</label>
                    <select id="filter-student-class" onchange="dashboard.modules.students.filterStudents()">
                        <option value="all">Toutes</option>
                        ${allClasses.map(cls => `<option value="${cls}">${cls}</option>`).join('')}
                    </select>
                </div>
                <div class="filter-group">
                    <label for="filter-student-chapter">Chapitre:</label>
                    <select id="filter-student-chapter" onchange="dashboard.modules.students.filterStudents()">
                        <option value="all">Tous</option>
                        ${this.dashboard.chapters.map(ch => `<option value="${ch.id}">${ch.title}</option>`).join('')}
                    </select>
                </div>
                <div class="filter-group">
                    <label for="filter-student-status">Statut:</label>
                    <select id="filter-student-status" onchange="dashboard.modules.students.filterStudents()">
                        <option value="all">Tous</option>
                        <option value="validated">✅ Terminé</option>
                        <option value="returned_for_revision">🔄 À revoir</option>
                        <option value="submitted">📤 Rendu</option>
                        <option value="late_submitted">⚠️ Rendu en retard</option>
                        <option value="exam_in_progress">⛔ Examen en cours</option>
                        <option value="exam">📋 Mode examen</option>
                        <option value="in_progress">🟡 En cours</option>
                        <option value="not_started">⚪ Non commencé</option>
                    </select>
                </div>
            </div>

            <div class="students-grid" id="students-grid">
        `;

        if (this.students.length === 0) {
            html += `
                <div class="empty-submissions">
                    <p>📋 Aucun apprenant enregistré</p>
                    <small>La liste des apprenants sera affichée ici dès qu'il y aura des connexions.</small>
                </div>
            `;
        } else {
            html += await this.renderStudentsList(this.students);
        }

        html += '</div>';
        this.container.innerHTML = html;
    }

    async renderStudentsList(students) {
        let html = '';

        for (const student of students) {
            const progress = await this.dashboard.getStudentProgress(student.id);
            
            // ✅ Affichage DU CHAPITRE SELECTIONNE uniquement
            const chapterSelect = document.getElementById('filter-student-chapter');
            const selectedChapterId = chapterSelect ? chapterSelect.value : 'all';
            
            let completionRate = 0;
            let avgScore = 0;
            
            if (selectedChapterId !== 'all' && progress.chapters[selectedChapterId]) {
                // ✅ UTILISER LA MEME VALEUR QUE VOIT L'APPRENANT
                const chapter = progress.chapters[selectedChapterId];
                completionRate = chapter.completionPercent || 0;
                avgScore = chapter.finalScore || 0;
            } else {
                // Moyenne globale sur tous les chapitres
                let totalCompletion = 0;
                let totalScore = 0;
                let chapterCount = 0;
                
                Object.values(progress.chapters).forEach(chapter => {
                    totalCompletion += chapter.completionPercent || 0;
                    if (chapter.finalScore !== undefined) {
                        totalScore += chapter.finalScore;
                    }
                    chapterCount++;
                });
                
                completionRate = chapterCount > 0 ? Math.round(totalCompletion / chapterCount) : 0;
                avgScore = chapterCount > 0 ? Math.round(totalScore / chapterCount) : 0;
            }

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

                const state = getChapterBadgeState(chapterData, chapter, window.globalContext);
                const hasStarted = state.status !== 'not_started';

                return `
                    <li style="position: relative; border: 1px solid #dee2e6; background: #f8f9fa; border-radius: 8px; padding: 1rem 0.75rem 0.75rem; margin-bottom: 0.75rem; margin-top: 0.5rem;">
                        <div style="position: absolute; top: -0.7rem; left: 0.75rem; background: #ffffff; padding: 0 0.5rem; font-weight: 600; color: #495057; font-size: 0.9rem;">
                            ${chapter.title}
                        </div>
                        ${hasStarted && chapterData ? `
                        <div style="position: absolute; top: -0.7rem; right: 0.75rem; background: #ffffff; padding: 0 0.5rem; font-weight: 700; color: #2c3e50; font-size: 0.9rem;">
                            ${chapterData.completionPercent || 0}%
                        </div>
                        ` : ''}
                        <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.4rem; padding-top: 0.15rem; width: 100%;">
                            <div style="display: flex; align-items: center; gap: 0.4rem; flex: 1;">
                                <span class="status-badge status-${state.color}" style="font-size: 0.8rem; padding: 0.15rem 0.4rem;">${state.icon} ${state.label}</span>
                                
                                <div class="chapter-actions-menu">
                                    <button class="btn-chapter-actions" onclick="dashboard.modules.students.toggleChapterActionsMenu(event, '${student.id}', ${chapter.id})" title="Actions formateur" style="padding: 0.2rem 0.35rem; font-size: 0.9rem; min-width: unset;">
                                        ✏️
                                    </button>
                                    <div class="chapter-actions-dropdown" id="actions-menu-${student.id}-${chapter.id}">
                                        <!-- Actions chargées dynamiquement -->
                                    </div>
                                </div>
                            </div>
                            
                            ${hasStarted && typeof chapterData.noteAttribuee === 'number' ? `
                            <span style="font-weight: 600; color: #27ae60; font-size: 0.85rem; padding: 0.18rem 0.55rem; background: #d5f5e3; border-radius: 4px; white-space: nowrap; margin: 0 0.5rem;">
                                📝 ${chapterData.noteAttribuee}/20
                            </span>
                            ` : ''}
                            
                            ${hasStarted ? `
                            <button class="btn-view-student" onclick="dashboard.showStudentChapterView('${student.id}', ${chapter.id})" title="Voir les réponses de l'apprenant" style="padding: 0.2rem 0.35rem; font-size: 0.9rem; min-width: unset;">
                                👁️
                            </button>
                            ` : ''}
                        </div>
                    </li>
                `;
            }).join('')}                        </ul>
                    </div>
                </div>
            `;
        }

        return html;
    }

    getLastActivity(progress) {
        let latestDate = null;
        
        // ✅ Utiliser updatedAt qui est mis à jour à CHAQUE action dans progressManager
        Object.values(progress.chapters).forEach(chapter => {
            if (chapter.updatedAt) {
                const date = new Date(chapter.updatedAt);
                if (!latestDate || date > latestDate) {
                    latestDate = date;
                }
            }
        });

        if (!latestDate) return 'Jamais';
        
        const now = new Date();
        const diffMs = now - latestDate;
        const diffMins = Math.round(diffMs / 60000);
        const diffHours = Math.round(diffMs / 3600000);
        const diffDays = Math.round(diffMs / 86400000);
        
        if (diffMins < 60) return `Il y a ${diffMins} min`;
        if (diffHours < 24) return `Il y a ${diffHours}h`;
        if (diffDays < 7) return `Il y a ${diffDays}j`;
        
        return latestDate.toLocaleDateString('fr-FR');
    }

    showStudentChapterDetails(studentId, chapterId) {
        alert(`Détails du chapitre ${chapterId} pour l'apprenant ${studentId} - Fonctionnalité à implémenter`);
    }

    async filterStudents() {
        const searchFilter = document.getElementById('filter-student-search').value.toLowerCase().trim();
        const classFilter = document.getElementById('filter-student-class').value;
        const chapterFilter = document.getElementById('filter-student-chapter').value;
        const statusFilter = document.getElementById('filter-student-status').value;

        let filtered = [...this.students];

        if (classFilter !== 'all') {
            filtered = filtered.filter(s => s.class === classFilter);
        }

        if (searchFilter !== '') {
            filtered = filtered.filter(s => 
                s.name.toLowerCase().includes(searchFilter) ||
                s.id.toLowerCase().includes(searchFilter)
            );
        }

        if (statusFilter !== 'all' || chapterFilter !== 'all') {
            for (let i = filtered.length - 1; i >= 0; i--) {
                const student = filtered[i];
                const progress = await this.dashboard.getStudentProgress(student.id);

                // CAS 1 : un chapitre spécifique sélectionné
                if (chapterFilter !== 'all') {
                    const chapterConfig = this.dashboard.chapters.find(c => c.id === chapterFilter);
                    const chapterData = progress.chapters[chapterFilter] || {};
                    const state = getChapterBadgeState(chapterData, chapterConfig, window.globalContext);

                    const match = statusFilter === 'all' || matchesStatus(state, statusFilter);
                    if (!match) filtered.splice(i, 1);

                // CAS 2 : tous les chapitres
                } else {
                    const hasAtLeastOneMatch = this.dashboard.chapters.some(chapter => {
                        const chapterData = progress.chapters[chapter.id] || {};
                        const state = getChapterBadgeState(chapterData, chapter, window.globalContext);
                        return matchesStatus(state, statusFilter);
                    });

                    if (!hasAtLeastOneMatch) filtered.splice(i, 1);
                }
            }
        }

        const grid = document.getElementById('students-grid');
        grid.innerHTML = await this.renderStudentsList(filtered);
    }

    toggleChapterActionsMenu(event, studentId, chapterId) {
        event.stopPropagation();
        
        // Fermer tous les autres menus ouverts
        document.querySelectorAll('.chapter-actions-dropdown.active').forEach(menu => {
            if (menu.id !== `actions-menu-${studentId}-${chapterId}`) {
                menu.classList.remove('active');
            }
        });

        const menu = document.getElementById(`actions-menu-${studentId}-${chapterId}`);
        menu.classList.toggle('active');
        
        if (menu.classList.contains('active')) {
            this.populateChapterActionsMenu(menu, studentId, chapterId);
        }
    }

    async populateChapterActionsMenu(menu, studentId, chapterId) {
        const progress = await this.dashboard.getStudentProgress(studentId);
        const chapterData = progress.chapters[chapterId] || {};

        const state = getChapterBadgeState(chapterData, this.dashboard.chapters.find(c => c.id === chapterId), window.globalContext);

        let html = '';

        // Validé définitivement
        if (state.status === 'validated') {
            html += `
                <button onclick="dashboard.modules.students.reopenApproved('${studentId}', ${chapterId})">
                    ✏️ Rouvrir pour modification
                </button>
                <button class="warning" onclick="dashboard.modules.students.returnApprovedForRevision('${studentId}', ${chapterId})">
                    🔄 Renvoyer pour reprise
                </button>
                <button class="danger" onclick="dashboard.modules.students.resetChapter('${studentId}', ${chapterId})">
                    ❌ Réinitialiser complètement
                </button>
            `;
        }
        // Rendu (en attente)
        else if (state.status === 'submitted' || state.status === 'late_submitted') {
            html += `
                <button onclick="dashboard.openCorrectionModal('${studentId}', ${chapterId})">
                    ✏️ Ouvrir la correction
                </button>
                <button class="warning" onclick="dashboard.modules.students.returnForReview('${studentId}', ${chapterId})">
                    🔄 Renvoyer pour reprise
                </button>
            `;
        }

        // Retourné pour reprise
        else if (state.status === 'returned_for_revision') {
            html += `
                <button class="success" onclick="dashboard.modules.students.forceSubmit('${studentId}', ${chapterId})">
                    ✅ Forcer comme rendu
                </button>
            `;
        }

        // En cours / Non commencé / Examen
        else {
            html += `
                <button class="success" onclick="dashboard.modules.students.forceSubmit('${studentId}', ${chapterId})">
                    ✅ Forcer comme rendu
                </button>
            `;
        }

        menu.innerHTML = html;
    }
    async forceSubmit(studentId, chapterId) {
        if (!confirm('Confirmer que cette copie est considérée comme rendue ?')) return;
        await this.dashboard.updateSubmissionStatus(studentId, chapterId, 'submitted');
        this.refresh();
    }

    async returnForReview(studentId, chapterId) {
        if (!confirm('Renvoyer cette copie à l\'apprenant pour reprise ?')) return;
        await this.dashboard.updateSubmissionStatus(studentId, chapterId, 'returned_for_revision');
        this.refresh();
    }

    async markAsCorrected(studentId, chapterId) {
        if (!confirm('Marquer cette copie comme corrigée ?')) return;
        await this.dashboard.updateSubmissionStatus(studentId, chapterId, 'corrected');
        this.refresh();
    }

    async validateFinal(studentId, chapterId) {
        if (!confirm('Valider définitivement cette copie ?')) return;
        await this.dashboard.updateSubmissionStatus(studentId, chapterId, 'validated');
        this.refresh();
    }

    async reopenForCorrection(studentId, chapterId) {
        if (!confirm('Rouvrir cette copie pour correction ?')) return;
        await this.dashboard.updateSubmissionStatus(studentId, chapterId, 'submitted');
        this.refresh();
    }

    async reopenApproved(studentId, chapterId) {
        if (!confirm('Rouvrir ce chapitre terminé pour modification ?')) return;
        const progress = await this.dashboard.getStudentProgress(studentId);
        const chapter = progress.chapters[chapterId];
        
        if (chapter) {
            delete chapter.correctionStatus;
            chapter.submissionStatus = 'in_progress';
            chapter.updatedAt = new Date().toISOString();
            
            await storage.set(`student_${studentId}_progress`, progress);
            alert('✅ Chapitre rouvert ! Il repasse en statut "En cours"');
            this.refresh();
        }
    }

    async returnApprovedForRevision(studentId, chapterId) {
        if (!confirm('Renvoyer ce chapitre terminé à l\'apprenant pour reprise ?')) return;
        const progress = await this.dashboard.getStudentProgress(studentId);
        const chapter = progress.chapters[chapterId];
        
        if (chapter) {
            delete chapter.correctionStatus;
            chapter.submissionStatus = 'returned_for_revision';
            chapter.returnedAt = new Date().toISOString();
            chapter.updatedAt = new Date().toISOString();
            
            await storage.set(`student_${studentId}_progress`, progress);
            alert('🔄 Chapitre renvoyé pour reprise !');
            this.refresh();
        }
    }

    async resetChapter(studentId, chapterId) {
        if (!confirm('⚠️ ÊTES VOUS SÛR ? Ceci effacera COMPLETEMENT toutes les réponses et le progrès de l\'apprenant sur ce chapitre. Cette action est irréversible.')) return;
        const progress = await this.dashboard.getStudentProgress(studentId);
        
        // Réinitialiser complètement le chapitre
        progress.chapters[chapterId] = {
            started: false,
            completed: false,
            score: 0,
            finalScore: 0,
            completionPercent: 0,
            questions: {},
            updatedAt: new Date().toISOString()
        };
        
        await storage.set(`student_${studentId}_progress`, progress);
        alert('✅ Chapitre réinitialisé complètement !');
        this.refresh();
    }
}
