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
        this.render();
    }

    async refresh() {
        await this.loadStudents();
        this.render();
    }

    async loadStudents() {
        const allStudents = await this.dashboard.getStudents();
        
        console.log('🔍 [DEBUG] TOUS LES ÉTUDIANTS:', allStudents);
        
        // DÉDUPLIQUER LES ÉTUDIANTS SUR ID UNIQUE
        const uniqueStudents = new Map();
        const duplicates = [];
        
        allStudents.forEach((student, index) => {
            console.log(`🔍 Étudiant ${index} : id=${student.id} nom=${student.name}`);
            
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
        
        console.log('✅ Résultat final :');
        console.log(`   - Total dans la base : ${allStudents.length}`);
        console.log(`   - Nombre unique : ${this.students.length}`);
        console.log(`   - Doublons masqués : ${this.duplicatesCount}`);
        
        // AVERTISSEMENT SI DOUBLONS
        if (duplicates.length > 0) {
            console.warn(`⚠️ ${duplicates.length} DOUBLONS D'ÉTUDIANTS DÉTECTÉS :`, duplicates);
        }
    }

    async render() {
        // Récupérer les classes uniques pour le filtre
        const allClasses = [...new Set(this.students.map(s => s.class).filter(c => c))].sort();

        let html = `
            <div class="section-header">
                <h2>👥 Suivi des Apprenants</h2>
            <p>${this.students.length} apprenant(s) enregistré(s)
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
                        <option value="started">A commencé</option>
                        <option value="completed">Terminé</option>
                        <option value="not_started">Non commencé</option>
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
                        <a class="chapter-link" onclick="dashboard.modules.students.showStudentChapterDetails('${student.id}', ${chapter.id})">
                            ${chapter.title}
                        </a>
                        <span class="status-badge ${statusClass}">${statusText}</span>
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

        if (chapterFilter !== 'all' || statusFilter !== 'all') {
            for (let i = filtered.length - 1; i >= 0; i--) {
                const student = filtered[i];
                const progress = await this.dashboard.getStudentProgress(student.id);
                const chapterData = progress.chapters[chapterFilter] || {};
                const hasStarted = chapterData.questions && Object.keys(chapterData.questions).length > 0;
                const isCompleted = chapterData.completed === true;

                if (chapterFilter !== 'all') {
                    if (statusFilter === 'started' && !hasStarted) {
                        filtered.splice(i, 1);
                        continue;
                    }
                    if (statusFilter === 'completed' && !isCompleted) {
                        filtered.splice(i, 1);
                        continue;
                    }
                    if (statusFilter === 'not_started' && hasStarted) {
                        filtered.splice(i, 1);
                        continue;
                    }
                }
            }
        }

        const grid = document.getElementById('students-grid');
        grid.innerHTML = await this.renderStudentsList(filtered);
    }
}