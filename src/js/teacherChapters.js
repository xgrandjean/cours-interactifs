/**
 * teacherChapters.js - Module de gestion des chapitres
 * Verrouillage/déverrouillage, mode examen, limites de date
 */

class TeacherChapters {
    constructor(dashboard) {
        this.dashboard = dashboard;
        this.container = document.getElementById('chapters-content');
        this.init();
    }

    init() {
        this.render();
    }

    refresh() {
        this.render();
    }

    async render() {
        const chapters = this.dashboard.chapters;
        let html = `
            <div class="section-header">
                <h2>📚 Gestion des Chapitres</h2>
                <p>Configurez les paramètres de chaque chapitre</p>
            </div>
            <div class="controls-grid">
        `;

        for (const chapter of chapters) {
            const config = await this.dashboard.getChapterConfig(chapter.id);
            const isLocked = config.locked;
            const isDateEnabled = config.dateLimitEnabled === true;
            const isExamMode = config.examMode === true;

            // Valeurs date et heure
            const dateValue = config.endDate ? config.endDate.split('T')[0] : '';
            const hourValue = config.endDate ? config.endDate.split('T')[1]?.split(':')[0] || '19' : '19';

            const isExpired = await this.isChapterExpired(chapter.id);

            // Statut
            let statusClass = 'status-available';
            let statusText = 'Disponible';
            if (isLocked) {
                statusClass = 'status-locked';
                statusText = 'Verrouillé';
            } else if (isExpired) {
                statusClass = 'status-expired';
                statusText = 'Expiré';
            }

            html += `
                <div class="chapter-control-card">
                    <div class="control-header">
                        <h4>${chapter.title}</h4>
                        <span class="control-status ${statusClass}">${statusText}</span>
                    </div>

                    <div class="control-actions">
                        <button class="control-btn btn-unlock" onclick="dashboard.modules.chapters.toggleChapterLock(${chapter.id})">
                            ${isLocked ? '🔓 Déverrouiller' : '🔒 Verrouiller'}
                        </button>
                    </div>

                    <div class="control-actions" style="margin-top: 1rem;">
                        <label class="date-limit-toggle">
                            <input type="checkbox" 
                                ${isExamMode ? 'checked' : ''}
                                onchange="dashboard.modules.chapters.toggleChapterMode(${chapter.id}, this.checked)">
                            <span>📝 Mode examen</span>
                        </label>
                    </div>

                    <div class="control-actions" style="flex-direction: column; gap: 0.5rem;">
                        <label class="date-limit-toggle">
                            <input type="checkbox" ${isDateEnabled ? 'checked' : ''} 
                                onchange="dashboard.modules.chapters.toggleDateLimit(${chapter.id}, this.checked)">
                            Limite de date
                        </label>

                        <div style="display: flex; gap: 0.5rem; align-items: center;">
                            <input type="date"
                                id="date-input-${chapter.id}"
                                value="${dateValue}"
                                ${isDateEnabled ? '' : 'disabled'}
                                onchange="dashboard.modules.chapters.updateChapterDate(${chapter.id})"
                            >
                            <select id="hour-select-${chapter.id}" 
                                ${isDateEnabled ? '' : 'disabled'}
                                onchange="dashboard.modules.chapters.updateChapterDate(${chapter.id})"
                            >
                                ${[...Array(24).keys()].map(h => 
                                    `<option value="${h}" ${h == hourValue ? 'selected' : ''}>${h}h</option>`
                                ).join('')}
                            </select>
                        </div>
                    </div>
                </div>
            `;
        }

        html += '</div>';
        this.container.innerHTML = html;
    }

    async isChapterExpired(chapterId) {
        const config = await this.dashboard.getChapterConfig(chapterId);
        if (!config.dateLimitEnabled || !config.endDate) return false;
        const now = new Date();
        const endDate = new Date(config.endDate);
        return now > endDate;
    }

    async toggleChapterLock(chapterId) {
        const config = await this.dashboard.getChapterConfig(chapterId);
        await this.dashboard.updateChapterConfig(chapterId, {
            locked: !config.locked
        });
        this.render();
    }

    async toggleChapterMode(chapterId, isExamMode) {
        console.log('🔘 [TEACHER CLICK MODE EXAMEN]', {
            chapterId,
            isExamMode,
            before: await this.dashboard.getChapterConfig(chapterId)
        });
        
        await this.dashboard.updateChapterConfig(chapterId, {
            examMode: isExamMode
        });
        
        const after = await this.dashboard.getChapterConfig(chapterId);
        console.log('✅ [TEACHER MODE EXAMEN APPLIQUÉ]', {
            after,
            examMode_saved: after.examMode
        });
        
        this.render();
    }

    async toggleDateLimit(chapterId, enabled) {
        const config = await this.dashboard.getChapterConfig(chapterId);
        const dateInput = document.getElementById(`date-input-${chapterId}`);

        if (enabled) {
            dateInput.disabled = false;

            let endDate = config.endDate;
            if (!endDate) {
                const defaultDate = new Date();
                defaultDate.setDate(defaultDate.getDate() + 7);
                defaultDate.setHours(19, 0, 0, 0);
                endDate = defaultDate.toISOString();
                dateInput.value = endDate.split('T')[0];
            }

            await this.dashboard.updateChapterConfig(chapterId, {
                ...config,
                endDate: endDate,
                dateLimitEnabled: true
            });
        } else {
            dateInput.disabled = true;
            await this.dashboard.updateChapterConfig(chapterId, {
                ...config,
                dateLimitEnabled: false
            });
        }

        this.render();
    }

    async updateChapterDate(chapterId) {
        const dateInput = document.getElementById(`date-input-${chapterId}`);
        const hourSelect = document.getElementById(`hour-select-${chapterId}`);
        const config = await this.dashboard.getChapterConfig(chapterId);

        if (!dateInput.value) return;

        const selectedDate = dateInput.value;
        const selectedHour = hourSelect ? hourSelect.value : '19';

        const endDate = `${selectedDate}T${selectedHour.padStart(2, '0')}:00:00`;
        await this.dashboard.updateChapterConfig(chapterId, {
            ...config,
            endDate: endDate
        });

        this.render();
    }
}