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

    async refresh() {
        await this.render();
    }

    async render() {
        const chapters = this.dashboard.chapters;
        let html = `
            <div class="section-header">
                <h2>📚 Gestion des Chapitres ${window.Aide ? Aide.icone('bareme') : ''}</h2>
                <p>Configurez les paramètres de chaque chapitre</p>
            </div>
            <div class="controls-grid">
        `;

        for (const chapter of chapters) {
            const config = await this.dashboard.getChapterConfig(chapter.id);
            const isLocked = config.locked;
            const isDateEnabled = config.dateLimitEnabled === true;
            // Déterminer le mode : rétrocompatibilité examMode
            const chapterMode = config.chapterMode || chapter.chapterMode || (config.examMode ? 'exam' : 'normal');

            // Valeurs date et heure — toujours interprétées/affichées en heure locale du navigateur,
            // quel que soit le format de stockage (UTC ISO ou local naïf), pour éviter tout décalage
            // de fuseau au ré-affichage (endDate est toujours une vraie Date valide, peu importe le format).
            const endDateObj = config.endDate ? new Date(config.endDate) : null;
            const dateValue = endDateObj
                ? `${endDateObj.getFullYear()}-${String(endDateObj.getMonth() + 1).padStart(2, '0')}-${String(endDateObj.getDate()).padStart(2, '0')}`
                : '';
            const hourValue = endDateObj ? String(endDateObj.getHours()) : '19';

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

            // Cohérence du chapitre : questions invalides (ex: QCM sans options) ou chapitre
            // vide → alerte ; chapitre composé uniquement de cours (pas de question) → info.
            const analysis = window.analyzeChapterQuestions(chapter.questions, chapter.courseCount);
            let consistencyBadge = '';
            if (analysis.hasIssues || analysis.isEmpty) {
                const issues = analysis.invalidQuestions.map(q => `${q.title || q.id} (${q.type})`).join(', ');
                const tooltip = analysis.isEmpty
                    ? 'Ce chapitre ne contient aucune question ni cours exploitable.'
                    : `Question(s) invalide(s) exclue(s) de l'affichage élève : ${issues}`;
                consistencyBadge = `<span class="control-status status-inconsistent" title="${this.escapeHtml(tooltip)}">⚠️ Incohérence</span>`;
            } else if (analysis.isCourseOnly) {
                consistencyBadge = `<span class="control-status status-course-only" title="Chapitre composé uniquement de cours : pas de note, pas de bilan.">ℹ️ Cours uniquement</span>`;
            }

            // 🎲 Ordre aléatoire : proposé aux seuls modes Examen, Blind et Millionnaire,
            // et seulement si le chapitre est entièrement auto-corrigé. Coché par défaut
            // en Millionnaire, où l'ordre fait partie du jeu.
            const ordreProposable = ['exam', 'blind', 'millionnaire'].includes(chapterMode)
                && window.estChapitreToutAuto(chapter.questions);
            const ordreActif = config.ordreAleatoire === undefined
                ? chapterMode === 'millionnaire'
                : config.ordreAleatoire === true;

            // 📄 Questions par questions : Examen et Blind uniquement, sans condition sur
            // le type de correction — afficher une question ouverte seule ne pose aucun
            // problème. Décoché par défaut : ça change toute l'expérience de l'apprenant.
            const paginationProposable = ['exam', 'blind'].includes(chapterMode);
            const paginationActive = config.questionParQuestion === true;

            html += `
                <div class="chapter-control-card">
                    <div class="control-header">
                        <div class="control-header-badges">
                            <span class="control-status ${statusClass}">${statusText}</span>
                            ${consistencyBadge}
                            <button class="btn-simuler"
                                    title="Tester ce chapitre comme un apprenant — rien n'est conservé"
                                    onclick="dashboard.modules.chapters.simulerChapitre('${chapter.id}')">👁</button>
                        </div>
                        <h4 style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${this.escapeHtml(chapter.title)}">${this.escapeHtml(chapter.title)}</h4>
                    </div>

                    <div class="control-actions">
                        <button class="control-btn ${isLocked ? 'btn-unlock' : 'btn-lock'}" onclick="dashboard.modules.chapters.toggleChapterLock('${chapter.id}')">
                            ${isLocked ? '🔓 Déverrouiller' : '🔒 Verrouiller'}
                        </button>
                    </div>

                    <div class="control-actions" style="margin-top: 1rem;">
                        ${'' /* Le `for` est indispensable : sans lui, ce <label> s'associe à son
                             premier descendant labelable — c'est-à-dire au <button> de l'icône
                             d'aide, qui précède le <select>. Cliquer le texte ouvrirait alors
                             l'aide, et le menu n'aurait plus de nom accessible. */}
                        <label class="date-limit-toggle" for="mode-chapitre-${chapter.id}"
                               style="flex-direction: column; align-items: flex-start; gap: 0.3rem;">
                            <span>🎯 Mode du chapitre ${window.Aide ? Aide.icone('modes') : ''}</span>
                            <select id="mode-chapitre-${chapter.id}"
                                    onchange="dashboard.modules.chapters.toggleChapterMode('${chapter.id}', this.value)" 
                                    style="padding:0.3rem 0.5rem; border-radius:6px; border:1px solid #ccc; font-size:0.9rem; cursor:pointer;">
                                <option value="normal" ${chapterMode === 'normal' ? 'selected' : ''}>Découverte</option>
                                <option value="exam" ${chapterMode === 'exam' ? 'selected' : ''}>Examen</option>
                                <option value="blind" ${chapterMode === 'blind' ? 'selected' : ''}>Blind</option>
                                <option value="millionnaire" ${chapterMode === 'millionnaire' ? 'selected' : ''}>Millionnaire</option>
                                <option value="atelier" ${chapterMode === 'atelier' ? 'selected' : ''}>Atelier AR</option>
                                <option value="consigne" ${chapterMode === 'consigne' ? 'selected' : ''}>📋 Consigne</option>
                            </select>
                        </label>
                        ${chapterMode === 'consigne' ? `
                        ${'' /* Réservé au mode consigne : c'est le seul où l'apprenant répond
                             ailleurs que dans l'application. Le bouton reste visible même hors
                             HTTPS — le module explique alors pourquoi il ne peut pas imprimer,
                             plutôt que de disparaître sans dire pourquoi. */}
                        <button class="control-btn" style="margin-top:0.6rem;"
                                title="Imprimer les énoncés et un QRCode par question, pour chaque apprenant"
                                onclick="dashboard.modules.chapters.imprimerConsignes('${chapter.id}')">
                            🖨️ Feuille de consignes
                        </button>` : ''}
                        ${ordreProposable ? `
                        <label class="date-limit-toggle" style="margin-top:0.5rem;"
                               title="Les questions sont présentées dans un ordre tiré au sort, propre à chaque apprenant. Les questions déjà répondues restent regroupées en tête.">
                            <input type="checkbox" ${ordreActif ? 'checked' : ''}
                                onchange="dashboard.modules.chapters.toggleOrdreAleatoire('${chapter.id}', this.checked)">
                            🎲 Ordre aléatoire
                        </label>` : ''}
                        ${paginationProposable ? `
                        <label class="date-limit-toggle" style="margin-top:0.4rem;"
                               title="Une seule question affichée à la fois, avec navigation libre dans les deux sens. Les blocs de cours comptent comme des étapes.">
                            <input type="checkbox" ${paginationActive ? 'checked' : ''}
                                onchange="dashboard.modules.chapters.toggleQuestionParQuestion('${chapter.id}', this.checked)">
                            📄 Questions par questions
                        </label>` : ''}
                    </div>

                    <div class="control-actions" style="flex-direction: column; gap: 0.5rem;">
                        <label class="date-limit-toggle">
                            <input type="checkbox" ${isDateEnabled ? 'checked' : ''} 
                                onchange="dashboard.modules.chapters.toggleDateLimit('${chapter.id}', this.checked)">
                            Limite de date
                        </label>

                        <div style="display: flex; gap: 0.5rem; align-items: center;">
                            <input type="date"
                                id="date-input-${chapter.id}"
                                value="${dateValue}"
                                ${isDateEnabled ? '' : 'disabled'}
                                onchange="dashboard.modules.chapters.updateChapterDate('${chapter.id}')"
                            >
                            <select id="hour-select-${chapter.id}" 
                                ${isDateEnabled ? '' : 'disabled'}
                                onchange="dashboard.modules.chapters.updateChapterDate('${chapter.id}')"
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

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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

    /**
     * Feuille de consignes imprimable — mode consigne uniquement. Le module vit à part
     * (teacherConsignePrint.js) : il fabrique un document A4 complet, ce qui n'a rien à
     * voir avec les réglages de chapitre gérés ici.
     */
    imprimerConsignes(chapterId) {
        if (!window.TeacherConsignePrint) {
            alert("Le module d'impression n'est pas chargé.");
            return;
        }
        TeacherConsignePrint.ouvrir(chapterId, this.dashboard);
    }

    async toggleChapterMode(chapterId, mode) {        
        await this.dashboard.updateChapterConfig(chapterId, {
            chapterMode: mode,
            examMode: mode === 'exam' // rétrocompatibilité pour le code qui lit encore examMode
        });
                
        this.render();
    }

    /**
     * 👁 Ouvre le chapitre dans un nouvel onglet, tel qu'un apprenant le verra.
     *
     * La purge de la simulation précédente n'est PAS faite ici mais au chargement de
     * la page simulée : d'une part pour que l'ouverture reste un geste synchrone (un
     * window.open après un await se fait bloquer comme fenêtre surgissante), d'autre
     * part pour que le nettoyage ait lieu même si la simulation est ouverte autrement.
     */
    simulerChapitre(chapterId) {
        const slug = window.currentParcoursSlug || (window.Parcours ? Parcours.slug : null);
        if (!slug) {
            alert('Aucun parcours sélectionné');
            return;
        }
        window.open(Simulation.url(slug, chapterId), '_blank');
    }

    async toggleOrdreAleatoire(chapterId, actif) {
        await this.dashboard.updateChapterConfig(chapterId, {
            ordreAleatoire: actif
        });
        this.render();
    }

    async toggleQuestionParQuestion(chapterId, actif) {
        await this.dashboard.updateChapterConfig(chapterId, {
            questionParQuestion: actif
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

        const selectedHour = parseInt(hourSelect ? hourSelect.value : '19', 10);
        const [year, month, day] = dateInput.value.split('-').map(Number);

        // Construit la date en heure LOCALE (celle choisie par le formateur) puis convertit
        // en ISO UTC pour le stockage — même format que toggleDateLimit(), pour que le
        // ré-affichage (via new Date()) retombe toujours sur l'heure locale voulue.
        const endDate = new Date(year, month - 1, day, selectedHour, 0, 0, 0);
        await this.dashboard.updateChapterConfig(chapterId, {
            ...config,
            endDate: endDate.toISOString()
        });

        this.render();
    }
}