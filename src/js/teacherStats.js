/**
 * teacherStats.js - Statistiques par chapitre
 * Vue groupée par chapitre avec filtres et export Excel
 */
class TeacherStats {
    constructor(dashboard) {
        this.dashboard = dashboard;
        this.container = document.getElementById('stats-content');
        this.students = [];
        this.selectedClass = 'all';
        this.selectedChapter = 'all';
        this.selectedStatus = 'all';
        this.searchFilter = '';
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
        
        // Dédupliquer les Apprenants
        const uniqueStudents = new Map();
        allStudents.forEach(student => {
            if (!uniqueStudents.has(student.id)) {
                uniqueStudents.set(student.id, student);
            }
        });
        
        this.students = Array.from(uniqueStudents.values());

        // Tri alphabétique classe puis nom — cohérent avec l'onglet Suivi apprenants
        this.students.sort((a, b) => {
            const classCompare = (a.class || '').localeCompare(b.class || '');
            if (classCompare !== 0) return classCompare;
            return (a.name || '').localeCompare(b.name || '');
        });
    }

    
    async render() {
        // Récupérer les classes uniques
        const allClasses = [...new Set(this.students.map(s => s.class).filter(c => c))].sort();

        // Compter les Apprenants actifs (<15min)
        let activeCount = 0;
        const now = new Date();
        const FIFTEEN_MINUTES = 15 * 60 * 1000;

        for (const student of this.students) {
            const progress = await this.dashboard.getStudentProgress(student.id);
            let latestDate = null;
            Object.values(progress.chapters).forEach(chapter => {
                if (chapter.updatedAt) {
                    const date = new Date(chapter.updatedAt);
                    if (!latestDate || date > latestDate) latestDate = date;
                }
            });
            if (latestDate && (now - latestDate < FIFTEEN_MINUTES)) activeCount++;
        }

        // Attendre le rendu des chapitres
        const chaptersHtml = await this.renderChapters();

        this.container.innerHTML = `
            <div style="padding: 2rem; max-width: 1200px; margin: 0 auto;">
                
                <div class="section-header">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
                        <div>
                            <h2>📊 Statistiques par chapitre</h2>
                            <p>${this.students.length} apprenant(s) enregistré(s) - ${activeCount} actif(s)</p>
                        </div>
                        <button onclick="dashboard.modules.stats.exportToExcel()" class="control-btn btn-unlock" style="padding: 0.5rem 1rem;">
                            📥 Exporter Excel
                        </button>
                    </div>
                </div>

                <!-- Filtres identiques à teacherStudents -->
                <div class="submissions-filters">
                    <div class="filter-group">
                        <label for="stats-filter-search">Recherche:</label>
                        <input type="text" id="stats-filter-search" oninput="dashboard.modules.stats.applyFilters()" placeholder="Rechercher un nom...">
                    </div>
                    <div class="filter-group">
                        <label for="stats-filter-class">Classe:</label>
                        <select id="stats-filter-class" onchange="dashboard.modules.stats.applyFilters()">
                            <option value="all">Toutes</option>
                            ${allClasses.map(cls => `<option value="${this.escapeHtml(cls)}">${this.escapeHtml(cls)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="filter-group">
                        <label for="stats-filter-chapter">Chapitre:</label>
                        <select id="stats-filter-chapter" onchange="dashboard.modules.stats.applyFilters()">
                            <option value="all">Tous</option>
                            ${this.dashboard.chapters.map(ch => `<option value="${ch.id}">${ch.title}</option>`).join('')}
                        </select>
                    </div>
                    <div class="filter-group">
                        <label for="stats-filter-status">Statut:</label>
                        <select id="stats-filter-status" onchange="dashboard.modules.stats.applyFilters()">
                            <option value="all">Tous</option>
                            <option value="validated">✅ Terminé</option>
                            <option value="returned_for_revision">🔄 À revoir</option>
                            <option value="submitted">📤 Rendu</option>
                            <option value="late_submitted">⚠️ Rendu en retard</option>
                            <option value="exam_in_progress">⛔ Examen en cours</option>
                            <option value="exam">📋 Mode examen</option>
                            <option value="blind">🥽 Mode blind</option>
                            <option value="in_progress">🟡 En cours</option>
                            <option value="not_started">⚪ Non commencé</option>
                            <option value="locked">🔒 Verrouillé</option>
                        </select>
                    </div>
                </div>

                <div id="stats-chapters-container">
                    ${chaptersHtml}
                </div>

            </div>
        `;

        // 🔧 Synchroniser les valeurs des filtres avec l'état interne APRES rendu
        setTimeout(() => {
            document.getElementById('stats-filter-search').value = this.searchFilter;
            document.getElementById('stats-filter-class').value = this.selectedClass;
            document.getElementById('stats-filter-chapter').value = this.selectedChapter;
            document.getElementById('stats-filter-status').value = this.selectedStatus;
        }, 0);
    }

    async applyFilters() {
        this.searchFilter = document.getElementById('stats-filter-search').value.toLowerCase().trim();
        this.selectedClass = document.getElementById('stats-filter-class').value;
        this.selectedChapter = document.getElementById('stats-filter-chapter').value;
        this.selectedStatus = document.getElementById('stats-filter-status').value;
        
        document.getElementById('stats-chapters-container').innerHTML = await this.renderChapters();
    }

    async renderChapters() {
        const chaptersToShow = this.selectedChapter === 'all' 
            ? this.dashboard.chapters 
            : this.dashboard.chapters.filter(c => c.id == this.selectedChapter);

        let html = '';

        for (const chapter of chaptersToShow) {
            html += await this.renderChapter(chapter);
        }

        return html;
    }
    async renderChapter(chapter) {
        const filteredStudents = await this.getFilteredStudents(chapter.id);

        if (filteredStudents.length === 0) return '';

        const chapterConfig = await this.dashboard.getChapterConfig(chapter.id);

        // Regroupées par classe (les élèves sont déjà triés classe puis nom, voir loadStudents())
        // pour ne plus répéter "(Classe)" sur chaque ligne — libère de la place pour le nom complet.
        let studentsHtml = '';
        let currentClass = null;

        for (const student of filteredStudents) {
            const studentClass = student.class || 'Non spécifié';
            if (studentClass !== currentClass) {
                currentClass = studentClass;
                studentsHtml += `<div class="stats-class-header">${this.escapeHtml(studentClass)}</div>`;
            }

            const chapterData = student.progress.chapters[chapter.id] || {};
            const state = getChapterBadgeState(chapterData, chapterConfig);

            studentsHtml += `
                <div class="stats-student-row">
                    <div class="stats-col-name">${this.escapeHtml(student.name)}</div>
                    <div class="stats-col-progress">
                        ${typeof chapterData.completionPercent === 'number' ? `${chapterData.completionPercent}%` : '<span class="stats-empty">-</span>'}
                    </div>
                    <div class="stats-col-note">
                        ${typeof chapterData.noteAttribuee === 'number' ? `<span class="stats-note-value">📝 ${chapterData.noteAttribuee}/20</span>` : '<span class="stats-empty">-</span>'}
                    </div>
                    <div class="stats-col-comment">
                        ${chapterData.globalComment ? `
                        <span title="${this.escapeHtml(chapterData.globalComment)}">
                            ${this.escapeHtml(chapterData.globalComment.length > 45 ? chapterData.globalComment.substring(0, 45) + '...' : chapterData.globalComment)}
                        </span>
                        ` : '<span class="stats-empty">-</span>'}
                    </div>
                    <div class="stats-col-status">
                        <span class="status-badge status-${state.color}">${state.icon} ${state.label}</span>
                    </div>
                </div>
            `;
        }

        return `
            <div class="stats-chapter-card">
                <div class="stats-chapter-header">
                    <span>📚 ${chapter.title}</span>
                    <span class="stats-chapter-count">${filteredStudents.length} apprenant(s)</span>
                </div>
                <div class="stats-student-row stats-header-row">
                    <div class="stats-col-name">Apprenant</div>
                    <div class="stats-col-progress">Progression</div>
                    <div class="stats-col-note">Note</div>
                    <div class="stats-col-comment">Commentaire global</div>
                    <div class="stats-col-status">Statut</div>
                </div>
                ${studentsHtml}
            </div>
        `;
    }

    async getFilteredStudents(chapterId) {
        let filtered = [...this.students];

        if (this.searchFilter !== '') {
            filtered = filtered.filter(s => 
                s.name.toLowerCase().includes(this.searchFilter) ||
                s.id.toLowerCase().includes(this.searchFilter)
            );
        }

        if (this.selectedClass !== 'all') {
            filtered = filtered.filter(s => s.class === this.selectedClass);
        }

        for (const student of filtered) {
            student.progress = await this.dashboard.getStudentProgress(student.id);
        }

        if (this.selectedStatus !== 'all') {
            const chapterConfig = await this.dashboard.getChapterConfig(chapterId);
            filtered = filtered.filter(student => {
                const chapterData = student.progress.chapters[chapterId] || {};
                const state = getChapterBadgeState(chapterData, chapterConfig);
                return matchesStatus(state, this.selectedStatus);
            });
        }

        return filtered;
    }

    async exportToExcel() {
        if (typeof XLSX === 'undefined') {
            alert('❌ Export Excel non disponible. Librairie SheetJS manquante.');
            return;
        }

        const wb = XLSX.utils.book_new();
        const chaptersToShow = this.selectedChapter === 'all' 
            ? this.dashboard.chapters 
            : this.dashboard.chapters.filter(c => c.id == this.selectedChapter);

        for (const chapter of chaptersToShow) {
            const students = await this.getFilteredStudents(chapter.id);
        const chapterConfig = await this.dashboard.getChapterConfig(chapter.id);
            
            const data = students.map(student => {
                const chapterData = student.progress.chapters[chapter.id] || {};
                const state = getChapterBadgeState(chapterData, chapterConfig);
                return {
                    'Nom': student.name,
                    'Classe': student.class || '',
                    'Progression': chapterData.completionPercent ? `${chapterData.completionPercent}%` : '-',
                    'Note /20': chapterData.noteAttribuee || '-',
                    'Commentaire global': chapterData.globalComment || '',
                    'Statut': state.label
                };
            });

            const ws = XLSX.utils.json_to_sheet(data);
            XLSX.utils.book_append_sheet(wb, ws, chapter.title.substring(0, 31));
        }

        XLSX.writeFile(wb, `statistiques_${new Date().toISOString().slice(0,10)}.xlsx`);
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}