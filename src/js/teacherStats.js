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
        this.render();

        // Recharger toutes les 60s
        setInterval(() => this.refresh(), 60000);
    }

    async refresh() {
        await this.loadStudents();
        this.render();
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
                            <option value="completed">✅ Terminé</option>
                            <option value="returned">🔄 À revoir</option>
                            <option value="submitted">📤 Rendu</option>
                            <option value="late">⚠️ Rendu en retard</option>
                            <option value="in_progress">🟡 En cours</option>
                            <option value="not_started">⚪ Non commencé</option>
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

        let studentsHtml = filteredStudents.map(student => {
            const chapterData = student.progress.chapters[chapter.id] || {};
            const state = getChapterBadgeState(chapterData);

            return `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.7rem 1.2rem; border-bottom: 1px solid #f0f0f0;">
                    <div style="flex: 2;">
                        <span style="font-size: 0.95rem;">${this.escapeHtml(student.name)}</span>
                        ${student.class ? `<span style="font-size: 0.75rem; color: #666; margin-left: 0.5rem;">(${this.escapeHtml(student.class)})</span>` : ''}
                    </div>

                    <div style="flex: 1; text-align: center;">
                        ${typeof chapterData.completionPercent === 'number' ? `
                        <span style="font-size: 0.85rem; color: #666;">${chapterData.completionPercent}%</span>
                        ` : '<span style="color: #bbb;">-</span>'}
                    </div>

                    <div style="flex: 1; text-align: center;">
                        ${typeof chapterData.noteAttribuee === 'number' ? `
                        <span style="font-weight: 600; color: #27ae60; font-size: 0.85rem;">
                            📝 ${chapterData.noteAttribuee}/20
                        </span>
                        ` : '<span style="color: #bbb;">-</span>'}
                    </div>

                    <div style="flex: 3; padding-left: 1rem;">
                        ${chapterData.globalComment ? `
                        <span style="font-size: 0.8rem; color: #555;" title="${this.escapeHtml(chapterData.globalComment)}">
                            ${this.escapeHtml(chapterData.globalComment.length > 45 ? chapterData.globalComment.substring(0,45) + '...' : chapterData.globalComment)}
                        </span>
                        ` : '<span style="color: #ddd;">-</span>'}
                    </div>

                    <div style="flex: 1; text-align: right;">
                        <span class="status-badge status-${state.color}" style="font-size: 0.75rem;">
                            ${state.icon} ${state.label}
                        </span>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div style="background: white; border-radius: 8px; margin-bottom: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <div style="padding: 1rem 1.5rem; border-bottom: 1px solid #eee; font-weight: 600; color: #2c3e50; display: flex; justify-content: space-between;">
                    <span>📚 ${chapter.title}</span>
                    <span style="font-size: 0.85rem; color: #666;">${filteredStudents.length} apprenant(s)</span>
                </div>
                
                <!-- En-tête -->
                <div style="display: flex; padding: 0.7rem 1.2rem; background: #f8f9fa; border-bottom: 1px solid #e9ecef; font-size: 0.8rem; font-weight: 600; color: #495057;">
                    <div style="flex: 2;">Apprenant</div>
                    <div style="flex: 1; text-align: center;">Progression</div>
                    <div style="flex: 1; text-align: center;">Note</div>
                    <div style="flex: 3;">Commentaire global</div>
                    <div style="flex: 1; text-align: right;">Statut</div>
                </div>

                ${studentsHtml}
            </div>
        `;
    }

    async getFilteredStudents(chapterId) {
        let filtered = [...this.students];

        // Filtre recherche
        if (this.searchFilter !== '') {
            filtered = filtered.filter(s => 
                s.name.toLowerCase().includes(this.searchFilter) ||
                s.id.toLowerCase().includes(this.searchFilter)
            );
        }

        // Filtre classe
        if (this.selectedClass !== 'all') {
            filtered = filtered.filter(s => s.class === this.selectedClass);
        }

        // Charger les progressions
        for (const student of filtered) {
            student.progress = await this.dashboard.getStudentProgress(student.id);
        }

        // Filtre statut
        if (this.selectedStatus !== 'all') {
            filtered = filtered.filter(student => {
                const chapterData = student.progress.chapters[chapterId] || {};
                const state = getChapterBadgeState(chapterData);
                let match = false;
                switch(this.selectedStatus) {
                    case 'completed':    match = (state.priority === 1); break;
                    case 'returned':     match = (state.priority === 2); break;
                    case 'submitted':    match = (state.priority === 3 && chapterData.submissionStatus === 'submitted'); break;
                    case 'late':         match = (state.priority === 3 && chapterData.submissionStatus === 'late_submitted'); break;
                    case 'in_progress':  match = (state.priority === 4); break;
                    case 'not_started':  match = (state.priority === 5); break;
                    default: match = true;
                }
                return match;
            });
        }

        return filtered;
    }

    async exportToExcel() {
        // Vérifier si XLSX est chargé
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
            
            const data = students.map(student => {
                const chapterData = student.progress.chapters[chapter.id] || {};
                const state = getChapterBadgeState(chapterData);
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