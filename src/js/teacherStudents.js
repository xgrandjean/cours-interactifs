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
        this.allStudentsCount = 0;
        this.duplicatesCount = 0;
        this.activeCount = 0;
        this.progressCache = new Map(); // studentId -> progress (partagé sur un cycle load/render)
        this.init();
    }

    async init() {
        this.renderLoading();
        try {
            await this.loadStudents();
            await this.render();
        } catch (error) {
            console.error('[TeacherStudents] Erreur de chargement:', error);
            this.renderError();
        }

        document.addEventListener('click', () => {
            document.querySelectorAll('.chapter-actions-dropdown.active').forEach(menu => {
                menu.classList.remove('active');
            });
        });
    }

    async refresh() {
        this.progressCache.clear();
        try {
            await this.loadStudents();
            await this.render();
        } catch (error) {
            console.error('[TeacherStudents] Erreur de rafraîchissement:', error);
            this.renderError();
        }
    }

    renderLoading() {
        this.container.innerHTML = `
            <div class="students-loading">
                <div class="spinner"></div>
                <p>Chargement des apprenants…</p>
            </div>
        `;
    }

    renderError() {
        this.container.innerHTML = `
            <div class="students-error">
                <p>❌ Impossible de charger le suivi des apprenants.</p>
                <small>Vérifiez votre connexion au stockage puis réessayez.</small>
            </div>
        `;
    }

    // Lecture de la progression avec cache partagé (évite les relectures multiples)
    async getProgress(studentId) {
        if (!this.progressCache.has(studentId)) {
            this.progressCache.set(studentId, await this.dashboard.getStudentProgress(studentId));
        }
        return this.progressCache.get(studentId);
    }

    async loadStudents() {
        const allStudents = await this.dashboard.getStudents();
        this.allStudentsCount = allStudents.length;

        // Dédupliquer
        const uniqueStudents = new Map();
        allStudents.forEach(student => {
            if (!uniqueStudents.has(student.id)) {
                uniqueStudents.set(student.id, student);
            }
        });

        this.students = Array.from(uniqueStudents.values());
        this.duplicatesCount = this.allStudentsCount - this.students.length;

        // Tri alphabétique classe puis nom — appliqué une fois ici, préservé par les filtres
        // (filterStudents part toujours de [...this.students])
        this.students.sort((a, b) => {
            const classCompare = (a.class || '').localeCompare(b.class || '');
            if (classCompare !== 0) return classCompare;
            return (a.name || '').localeCompare(b.name || '');
        });

        // ✅ Charger toutes les progressions une seule fois (cache réutilisé par le rendu et les filtres)
        await Promise.all(this.students.map(student => this.getProgress(student.id)));

        // ✅ Déterminer les actifs à partir du cache (aucun appel réseau supplémentaire).
        // this.activeStudentIds sert aussi à afficher une pastille par élève (voir renderStudentsList).
        const now = new Date();
        const FIFTEEN_MINUTES = 15 * 60 * 1000;

        this.activeStudentIds = new Set(
            this.students.filter(student => {
                const progress = this.progressCache.get(student.id);
                let latestDate = null;
                Object.values(progress.chapters).forEach(chapter => {
                    if (chapter.updatedAt) {
                        const date = new Date(chapter.updatedAt);
                        if (!latestDate || date > latestDate) latestDate = date;
                    }
                });
                return latestDate && (now - latestDate < FIFTEEN_MINUTES);
            }).map(student => student.id)
        );
        this.activeCount = this.activeStudentIds.size;
    }

    async render() {
        const allClasses = [...new Set(this.students.map(s => s.class).filter(c => c))].sort();

        const activeStudentNames = this.students
            .filter(s => this.activeStudentIds.has(s.id))
            .map(s => s.name)
            .sort((a, b) => a.localeCompare(b));
        const activeTooltip = activeStudentNames.length > 0
            ? activeStudentNames.join(', ')
            : 'Aucun élève actif actuellement';

        let html = `
            <div class="section-header">
                <h2>👥 Suivi des apprenants</h2>
                <p>${this.students.length} apprenant(s) enregistré(s) - <span class="active-count-pill" title="${this.escapeHtml(activeTooltip)}">${this.activeCount} actif(s)</span>
                    ${this.duplicatesCount > 0 ?
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
                        <option value="blind">🥽 Mode blind</option>
                        <option value="atelier">🧾 Mode atelier AR</option>
                        <option value="in_progress">🟡 En cours</option>
                        <option value="not_started">⚪ Non commencé</option>
                        <option value="locked">🔒 Verrouillé</option>
                    </select>
                </div>
            </div>

            <div class="students-grid" id="students-grid">
        `;

        if (this.students.length === 0) {
            html += this.renderEmptyState(
                'Aucun apprenant enregistré',
                'La liste des apprenants sera affichée ici dès qu\'il y aura des connexions.'
            );
        } else {
            html += await this.renderStudentsList(this.students);
        }

        html += '</div>';
        this.container.innerHTML = html;
    }

    renderEmptyState(message, hint) {
        return `
            <div class="empty-submissions">
                <p>📋 ${message}</p>
                <small>${hint}</small>
            </div>
        `;
    }

    async renderStudentsList(students) {
        if (students.length === 0) {
            return this.renderEmptyState('Aucun résultat pour ces filtres', 'Essayez de modifier ou réinitialiser les filtres ci-dessus.');
        }

        // ✅ Progressions déjà disponibles dans le cache partagé (chargées par loadStudents/refresh)
        await Promise.all(students.map(student => this.getProgress(student.id)));

        // Récupérer les filtres une seule fois
        const chapterSelect = document.getElementById('filter-student-chapter');
        const selectedChapterId = chapterSelect ? chapterSelect.value : 'all';
        const statusSelect = document.getElementById('filter-student-status');
        const selectedStatus = statusSelect ? statusSelect.value : 'all';

        // Construire le HTML sans nouveaux appels réseau
        let html = '';

        for (const student of students) {
            const progress = this.progressCache.get(student.id) || { chapters: {} };

            // Dernière activité (calculée sans appel réseau si getLastActivity est synchrone)
            const lastActivity = this.getLastActivity(progress);

            // Ne montrer, dans la carte de cet élève, que les chapitres qui correspondent aux
            // filtres actifs (chapitre précis et/ou statut) — au lieu d'afficher systématiquement
            // les 4 chapitres même quand un filtre ne concerne qu'un seul d'entre eux.
            const visibleChapters = this.dashboard.chapters.filter(chapter => {
                if (selectedChapterId !== 'all' && chapter.id !== selectedChapterId) return false;
                if (selectedStatus !== 'all') {
                    const chapterData = progress.chapters[chapter.id] || { completed: false, score: 0 };
                    const state = getChapterBadgeState(chapterData, chapter);
                    if (!matchesStatus(state, selectedStatus)) return false;
                }
                return true;
            });
            
            html += `
                <div class="student-card">
                    <div class="student-header">
                        <h4>${this.escapeHtml(student.name)}</h4>
                        <span class="student-class">${this.escapeHtml(student.class || 'Non spécifié')}</span>
                    </div>
                    
                    <div class="student-stats">
                        <div class="stat-row">
                            <span>Dernière activité</span>
                            <span>${this.activeStudentIds.has(student.id) ? '<span class="active-dot" title="Actif actuellement"></span>' : ''}${lastActivity}</span>
                        </div>
                    </div>

                    <div class="chapter-list">
                        <ul>
            `;
            
            for (const chapter of visibleChapters) {
                const chapterData = progress.chapters[chapter.id] || { completed: false, score: 0 };
                const state = getChapterBadgeState(chapterData, chapter);
                const hasStarted = state.status !== 'not_started';
                const percent = chapterData.completionPercent || 0;
                const titleEscaped = this.escapeHtml(chapter.title);

                html += `
                    <li class="chapter-progress-item status-border-${state.color}">
                        <div class="chapter-progress-item-title" title="${titleEscaped}">
                            ${titleEscaped}
                        </div>
                        <div class="chapter-progress-item-percent${hasStarted ? '' : ' is-neutral'}">
                            ${percent}%
                        </div>
                        <div class="chapter-progress-item-row">
                            <div class="chapter-progress-item-left">
                                <span class="status-badge status-${state.color}">${state.icon} ${state.label}</span>

                                <div class="chapter-actions-menu">
                                    <button class="btn-chapter-actions" onclick="dashboard.modules.students.toggleChapterActionsMenu(event, '${student.id}', '${chapter.id}')" title="Actions formateur">
                                        ✏️
                                    </button>
                                    <div class="chapter-actions-dropdown" id="actions-menu-${student.id}-${chapter.id}">
                                    </div>
                                </div>
                            </div>

                            ${hasStarted && typeof chapterData.noteAttribuee === 'number' ? `
                            <span class="chapter-progress-item-score">
                                📝 ${chapterData.noteAttribuee}/20
                            </span>
                            ` : ''}

                            <button class="btn-view-student${hasStarted ? '' : ' is-neutral'}" onclick="dashboard.showStudentChapterView('${student.id}', '${chapter.id}')" title="Voir les réponses de l'apprenant">
                                👁️
                            </button>
                        </div>
                    </li>
                `;
            }
            
            html += `
                        </ul>
                    </div>
                </div>
            `;
        }
        
        return html;
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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
        const grid = document.getElementById('students-grid');
        try {
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
                // Progressions déjà en cache (chargées par loadStudents) : aucun nouvel appel réseau
                for (let i = filtered.length - 1; i >= 0; i--) {
                    const student = filtered[i];
                    const progress = await this.getProgress(student.id);

                    // CAS 1 : un chapitre spécifique sélectionné
                    if (chapterFilter !== 'all') {
                        const chapterConfig = this.dashboard.chapters.find(c => c.id === chapterFilter);
                        const chapterData = progress.chapters[chapterFilter] || {};
                        const state = getChapterBadgeState(chapterData, chapterConfig);

                        const match = statusFilter === 'all' || matchesStatus(state, statusFilter);
                        if (!match) filtered.splice(i, 1);

                    // CAS 2 : tous les chapitres
                    } else {
                        const hasAtLeastOneMatch = this.dashboard.chapters.some(chapter => {
                            const chapterData = progress.chapters[chapter.id] || {};
                            const state = getChapterBadgeState(chapterData, chapter);
                            return matchesStatus(state, statusFilter);
                        });

                        if (!hasAtLeastOneMatch) filtered.splice(i, 1);
                    }
                }
            }

            grid.innerHTML = await this.renderStudentsList(filtered);
        } catch (error) {
            console.error('[TeacherStudents] Erreur de filtrage:', error);
            if (grid) grid.innerHTML = this.renderEmptyState('Erreur lors du filtrage', 'Réessayez ou rechargez la page.');
        }
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
        const chapterConfig = this.dashboard.chapters.find(c => c.id === chapterId);

        const state = getChapterBadgeState(chapterData, chapterConfig);

        let html = '';

        // Modifier la date limite individuelle de cet élève (figée à son démarrage) —
        // uniquement pertinent s'il a déjà commencé le chapitre. Le verrou manuel, lui,
        // reste global et n'a pas d'exception individuelle.
        if (chapterData.frozenAt) {
            html += `
                <button onclick="dashboard.modules.students.changeStudentDeadline('${studentId}', '${chapterId}')">
                    📅 Modifier sa date limite
                </button>
            `;
        }

        // Validé définitivement
        if (state.status === 'validated') {
            html += `
                <button onclick="dashboard.modules.students.reopenApproved('${studentId}', '${chapterId}')">
                    ✏️ Rouvrir pour modification
                </button>
                <button class="warning" onclick="dashboard.modules.students.returnApprovedForRevision('${studentId}', '${chapterId}')">
                    🔄 Renvoyer pour reprise
                </button>
                <button class="danger" onclick="dashboard.modules.students.resetChapter('${studentId}', '${chapterId}')">
                    ❌ Réinitialiser complètement
                </button>
            `;
        }
        // Rendu (en attente)
        else if (state.status === 'submitted' || state.status === 'late_submitted') {
            html += `
                <button onclick="dashboard.openCorrectionModal('${studentId}', '${chapterId}')">
                    ✏️ Ouvrir la correction
                </button>
                <button class="warning" onclick="dashboard.modules.students.returnForReview('${studentId}', '${chapterId}')">
                    🔄 Renvoyer pour reprise
                </button>
            `;
        }

        // Retourné pour reprise
        else if (state.status === 'returned_for_revision') {
            html += `
                <button class="success" onclick="dashboard.modules.students.forceSubmit('${studentId}', '${chapterId}')">
                    ✅ Forcer comme rendu
                </button>
            `;
        }

        // En cours / Non commencé / Examen
        else {
            html += `
                <button class="success" onclick="dashboard.modules.students.forceSubmit('${studentId}', '${chapterId}')">
                    ✅ Forcer comme rendu
                </button>
            `;
        }

        menu.innerHTML = html;
    }
    // Rafraîchit également le badge "Rendus à corriger"
    async _refreshSubmissionsBadge() {
        if (this.dashboard.modules.submissions && typeof this.dashboard.modules.submissions.refresh === 'function') {
            await this.dashboard.modules.submissions.refresh();
        }
    }

    async forceSubmit(studentId, chapterId) {
        if (!await confirm('Confirmer que cette copie est considérée comme rendue ?')) return;
        await this.dashboard.updateSubmissionStatus(studentId, chapterId, 'submitted');
        this.refresh();
        await this._refreshSubmissionsBadge();
    }

    async returnForReview(studentId, chapterId) {
        if (!await confirm('Renvoyer cette copie à l\'apprenant pour reprise ?')) return;
        await this.dashboard.updateSubmissionStatus(studentId, chapterId, 'returned_for_revision');
        this.refresh();
        await this._refreshSubmissionsBadge();
    }

    async validateFinal(studentId, chapterId) {
        if (!await confirm('Valider définitivement cette copie ?')) return;
        await this.dashboard.updateSubmissionStatus(studentId, chapterId, 'validated');
        this.refresh();
        await this._refreshSubmissionsBadge();
    }

    async reopenForCorrection(studentId, chapterId) {
        if (!await confirm('Rouvrir cette copie pour correction ?')) return;
        await this.dashboard.updateSubmissionStatus(studentId, chapterId, 'submitted');
        this.refresh();
        await this._refreshSubmissionsBadge();
    }

    async reopenApproved(studentId, chapterId) {
        if (!await confirm('Rouvrir ce chapitre terminé pour modification ?')) return;
        
        const slug = window.currentParcoursSlug;
        if (!slug) return;
        
        const progress = await this.dashboard.getStudentProgress(studentId);
        const chapter = progress.chapters[chapterId];
        
        if (chapter) {
            delete chapter.correctionStatus;
            // 'in_progress' n'existe dans aucun lecteur de statut : la copie rouverte
            // repart de « pas encore rendue », que l'apprenant peut re-rendre.
            ProgressManager.setSubmissionStatus(chapter, 'not_submitted');
            chapter.updatedAt = new Date().toISOString();
            
            const key = `${slug}:${studentId}:student_${studentId}_progress`;
            await storage.set(key, progress);
            alert('✅ Chapitre rouvert ! Il repasse en statut "En cours"');
            this.refresh();
            await this._refreshSubmissionsBadge();
        }
    }

    async returnApprovedForRevision(studentId, chapterId) {
        if (!await confirm('Renvoyer ce chapitre terminé à l\'apprenant pour reprise ?')) return;
        
        const slug = window.currentParcoursSlug;
        if (!slug) return;
        
        const progress = await this.dashboard.getStudentProgress(studentId);
        const chapter = progress.chapters[chapterId];
        
        if (chapter) {
            delete chapter.correctionStatus;
            // Le setter efface validatedAt : sans cela le chapitre reviendrait à
            // « validé » au premier recalcul, et la reprise serait sans effet.
            ProgressManager.setSubmissionStatus(chapter, 'returned_for_revision');
            chapter.updatedAt = new Date().toISOString();
            
            const key = `${slug}:${studentId}:student_${studentId}_progress`;
            await storage.set(key, progress);
            alert('🔄 Chapitre renvoyé pour reprise !');
            this.refresh();
            await this._refreshSubmissionsBadge();
        }
    }

    async resetChapter(studentId, chapterId) {
        if (!await confirm('⚠️ ÊTES VOUS SÛR ? Ceci effacera COMPLETEMENT toutes les réponses et le progrès de l\'apprenant sur ce chapitre. Cette action est irréversible.')) return;
        
        const slug = window.currentParcoursSlug;
        if (!slug) return;
        
        const progress = await this.dashboard.getStudentProgress(studentId);
        const chapterConfig = this.dashboard.chapters.find(c => c.id === chapterId) || {};

        // Réinitialiser complètement le chapitre (même structure qu'un chapitre jamais commencé)
        progress.chapters[chapterId] = window.ProgressManager.initChapter(chapterConfig);

        const key = `${slug}:${studentId}:student_${studentId}_progress`;
        await storage.set(key, progress);
        alert('✅ Chapitre réinitialisé complètement !');
        this.refresh();
        await this._refreshSubmissionsBadge();
    }

    // Formate une date ISO en "AAAA-MM-JJ HH" (heure locale), pour pré-remplir le prompt
    _formatDeadlineForPrompt(isoString) {
        const d = new Date(isoString);
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${d.getHours()}`;
    }

    async changeStudentDeadline(studentId, chapterId) {
        const slug = window.currentParcoursSlug;
        if (!slug) return;

        const progress = await this.dashboard.getStudentProgress(studentId);
        const chapter = progress.chapters[chapterId];
        if (!chapter) return;

        const current = (chapter.frozenDateLimitEnabled && chapter.frozenEndDate)
            ? this._formatDeadlineForPrompt(chapter.frozenEndDate)
            : '';

        const input = await window.prompt(
            'Date limite individuelle pour cet élève (format AAAA-MM-JJ HH, ex: 2026-08-15 18).\nLaisser vide pour lui retirer toute date limite personnelle.',
            current
        );
        if (input === null) return; // annulé

        const trimmed = input.trim();
        if (trimmed === '') {
            chapter.frozenDateLimitEnabled = false;
            chapter.frozenEndDate = null;
        } else {
            const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2})$/);
            if (!match) {
                alert('❌ Format invalide. Utilisez AAAA-MM-JJ HH, par exemple 2026-08-15 18.');
                return;
            }
            const [, year, month, day, hour] = match;
            const newEndDate = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), 0, 0, 0);
            chapter.frozenDateLimitEnabled = true;
            chapter.frozenEndDate = newEndDate.toISOString();
        }

        const key = `${slug}:${studentId}:student_${studentId}_progress`;
        await storage.set(key, progress);
        alert('✅ Date limite individuelle mise à jour pour cet élève.');
        this.refresh();
    }
}
