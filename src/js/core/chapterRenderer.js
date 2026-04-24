export class ChapterRenderer {

    async render(chapters, progress, computeState, globalContext = {}) {
        const container = document.querySelector('.chapters');

        container.innerHTML = chapters.map(c =>
            this.generateChapterCardHTML(c)
        ).join('');

        this.attachEvents(container);

        for (const chapter of chapters) {
            const chapterProgress = progress.chapters?.[chapter.id] || {};
            // ✅ Merge la config storage comme PARTOUT ailleurs
            const storageConfig = await storage.get('chapter_config') || {};
            const finalConfig = {
                ...chapter,
                ...(storageConfig[chapter.id] || {})
            };
            
            const state = computeState(chapterProgress, finalConfig, globalContext);

            this.updateChapterCard(chapter.id, state);
        }
    }

    attachEvents(container) {
        container.querySelectorAll('.details-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                window.showChapterDetails(btn.dataset.id);
            });
        });

        container.querySelectorAll('.btn-primary').forEach(btn => {
            btn.addEventListener('click', () => {
                window.navigateToChapter(btn.dataset.href);
            });
        });
    }

    updateChapterCard(chapterId, state) {
        const fill = document.getElementById(`progress-fill-${chapterId}`);
        const value = document.getElementById(`progress-value-${chapterId}`);
        const grade = document.getElementById(`chapter-grade-${chapterId}`);
        const status = document.getElementById(`chapter-${chapterId}-status`);
        const btn = document.querySelector(`.chapter-card[data-chapter="${chapterId}"] .details-btn`);

        if (fill && value) {
            fill.setAttribute('stroke-dasharray', `${state.percent}, 100`);
            value.textContent = `${state.percent}%`;
        }

        if (grade) {
            grade.textContent = state.note !== null
                ? `Note: ${state.note}/20`
                : 'Note: --';
        }

        if (status) {
            status.textContent = state.label;
            status.className = `chapter-status status-${state.status}`;
        }

        if (btn) {
            state.bilanLocked
                ? btn.setAttribute('disabled', 'disabled')
                : btn.removeAttribute('disabled');
        }

        const accessBtn = document.querySelector(`.chapter-card[data-chapter="${chapterId}"] .btn-primary`);
        if (accessBtn) {
            if (state.locked) {
                accessBtn.setAttribute('disabled', 'disabled');
                accessBtn.style.pointerEvents = 'none';
                accessBtn.style.opacity = '0.5';
            } else {
                accessBtn.removeAttribute('disabled');
                accessBtn.style.pointerEvents = '';
                accessBtn.style.opacity = '';
            }
        }        
    }

    renderEmptyState() {
        const container = document.querySelector('.chapters');
        container.innerHTML = `
            <p style="color:#e74c3c;text-align:center;padding:2rem;">
                ⚠️ Aucun chapitre disponible
            </p>
        `;
    }

    generateChapterCardHTML(chapter) {
        return `
            <div class="chapter-card" data-chapter="${chapter.id}">
                <h3>Chapitre ${chapter.id}</h3>
                <p>${chapter.title}</p>

                <div class="chapter-stats">
                    <div class="progress-ring">
                        <svg viewBox="0 0 36 36">
                            <path class="progress-bg"/>
                            <path class="progress-fill" id="progress-fill-${chapter.id}"/>
                        </svg>
                        <span id="progress-value-${chapter.id}">0%</span>
                    </div>

                    <div id="chapter-grade-${chapter.id}">Note: --</div>

                    <button class="details-btn" data-id="${chapter.id}">
                        ⭐ Voir le bilan
                    </button>
                </div>

                <div id="chapter-${chapter.id}-status"></div>

                <button class="btn btn-primary" data-href="${chapter.href}">
                    Accéder au chapitre
                </button>
            </div>
        `;
    }
}