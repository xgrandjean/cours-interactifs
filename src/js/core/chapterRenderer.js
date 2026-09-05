export class ChapterRenderer {

    async render(chapters, progress, computeState) {
        const container = document.querySelector('.chapters');

        container.innerHTML = chapters.map(c =>
            this.generateChapterCardHTML(c)
        ).join('');

        this.attachEvents(container);

        // ✅ Récupérer le slug du parcours
        const slug = window.currentParcoursSlug || (window.Parcours ? Parcours.slug : null);
        let storageConfig = {};
        if (slug) {
            storageConfig = await storage.get(`${slug}:config:chapter_config`) || {};
        }

        for (const chapter of chapters) {
            const chapterProgress = progress.chapters?.[chapter.id] || {};
            const finalConfig = {
                ...chapter,
                ...(storageConfig[chapter.id] || {})
            };
            
            const state = computeState(chapterProgress, finalConfig);

            this.updateChapterCard(chapter.id, state, chapterProgress, finalConfig);
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

    updateChapterCard(chapterId, state, chapterProgress = {}, chapterConfig = {}) {
        const fill = document.getElementById(`progress-fill-${chapterId}`);
        const value = document.getElementById(`progress-value-${chapterId}`);
        const grade = document.getElementById(`chapter-grade-${chapterId}`);
        const status = document.getElementById(`chapter-${chapterId}-status`);
        const btn = document.querySelector(`.chapter-card[data-chapter="${chapterId}"] .details-btn`);

        if (fill && value) {
            fill.setAttribute('stroke-dasharray', `${state.percent}, 100`);
            value.textContent = `${state.percent}%`;
        }

        // Chapitre sans question notable (uniquement du cours, ou vide) : ni note, ni bilan.
        const analysis = window.analyzeChapterQuestions(chapterConfig.questions, chapterConfig.courseCount);
        const noBilan = analysis.isEmpty || analysis.isCourseOnly;

        if (grade) {
            grade.style.display = noBilan ? 'none' : '';
            grade.textContent = state.note !== null
                ? `Note: ${state.note}/20`
                : 'Note: --';
        }

        if (status) {
            status.textContent = state.label;
            status.className = `chapter-status status-${state.status}`;
        }

        // ── Logique conditionnelle du bouton bilan / corrigé ──────────────────
        // Si le chapitre est validé définitivement par le professeur :
        //   → texte "📄 Voir le corrigé", action = ouvrir StudentCorrectionModal
        // Sinon :
        //   → texte "⭐ Voir le bilan", action = comportement existant (showChapterDetails)
        if (btn) {
            btn.style.display = noBilan ? 'none' : '';
            const isValidated = chapterProgress.submissionStatus === 'validated';

            if (noBilan) {
                // Rien à afficher : ni bilan ni corrigé.
            } else if (isValidated) {
                btn.textContent = '📄 Voir le corrigé';
                btn.title = 'Voir le corrigé détaillé';

                // Remplacement de l'événement : on retire l'ancien listener (attachEvents)
                // en clonant le nœud, puis on attache le nouveau
                const newBtn = btn.cloneNode(true);
                btn.parentNode.replaceChild(newBtn, btn);
                newBtn.addEventListener('click', () => {
                    window.studentCorrectionModal?.open(chapterId);
                });

                // Le bouton corrigé est toujours accessible (pas de disabled)
                newBtn.removeAttribute('disabled');
            } else {
                // Comportement existant inchangé
                btn.textContent = '⭐ Voir le bilan';
                btn.title = 'Bilan des exercices';

                state.bilanLocked
                    ? btn.setAttribute('disabled', 'disabled')
                    : btn.removeAttribute('disabled');
            }
        }

        // ── Badge du mode de chapitre (exam, blind, millionnaire, atelier, consigne, normal → Découverte) ─────
        const modeBadge = document.getElementById(`chapter-mode-${chapterId}`);
        if (modeBadge) {
            const mode = state.chapterMode || 'normal';
            const modeConfig = {
                exam:         { icon: '📝', label: 'Examen' },
                blind:        { icon: '🥽', label: 'Blind' },
                millionnaire: { icon: '💰', label: 'Millionnaire' },
                atelier:      { icon: '🧾', label: 'Atelier AR' },
                consigne:     { icon: '📋', label: 'Consigne' },
                normal:       { icon: '📖', label: 'Découverte' },
            };
            const config = modeConfig[mode] || modeConfig.normal;
            modeBadge.textContent = `${config.icon} ${config.label}`;
            modeBadge.className = `chapter-mode-badge mode-${mode}`;
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
                <div class="chapter-mode-badge" id="chapter-mode-${chapter.id}"></div>
                <h3>Chapitre ${chapter.numero}</h3>
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

                <button class="btn btn-primary" data-href="${chapter.id}">
                    Accéder au chapitre
                </button>
            </div>
        `;
    }
}
