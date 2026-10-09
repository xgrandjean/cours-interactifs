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

            // Options du mode : une ligne par option, empilées dans un même bloc. Chacune
            // déclare quand elle est proposée ; une option non proposée n'est pas affichée,
            // et le bloc disparaît s'il ne reste rien. Ajouter une option = une entrée ici,
            // sans toucher à la mise en page : la liste s'allonge d'une ligne. Une option
            // porte soit `actif` (interrupteur), soit `choix` + `valeur` (menu).
            const optionsMode = [
                {
                    // 🎲 Examen, Blind et Millionnaire, et seulement si le chapitre est
                    // entièrement auto-corrigé. Coché par défaut en Millionnaire, où l'ordre
                    // fait partie du jeu.
                    cle: 'ordreAleatoire',
                    libelle: '🎲 Ordre aléatoire',
                    aide: 'Les questions sont présentées dans un ordre tiré au sort, propre à chaque apprenant. Les questions déjà répondues restent regroupées en tête.',
                    proposable: ['exam', 'blind', 'millionnaire'].includes(chapterMode)
                        && window.estChapitreToutAuto(chapter.questions),
                    actif: config.ordreAleatoire === undefined
                        ? chapterMode === 'millionnaire'
                        : config.ordreAleatoire === true
                },
                {
                    // 📄 Examen, Blind et Millionnaire, sans condition sur le type de
                    // correction : afficher une question ouverte seule ne pose aucun problème.
                    // Décoché par défaut, car ça change toute l'expérience de l'apprenant.
                    cle: 'questionParQuestion',
                    libelle: '📄 Question par question',
                    aide: 'Une seule question affichée à la fois, avec navigation libre dans les deux sens. Les blocs de cours comptent comme des étapes.',
                    proposable: ['exam', 'blind', 'millionnaire'].includes(chapterMode),
                    actif: config.questionParQuestion === true
                },
                {
                    // 🤖 Examen, Blind et Millionnaire. Les intitulés ne se lisent qu'à la
                    // demande de l'apprenant (cf. chapter/chapterAntiIA.js) : « persistant »
                    // les affiche en place au clic, jusqu'à un clic hors de la question ;
                    // « temporaire » les montre au survol, dans une fenêtre qui disparaît dès
                    // que le pointeur en sort.
                    cle: 'antiIA',
                    libelle: '🤖 Anti-IA',
                    aide: "Les énoncés sont masqués. Persistants : un clic les affiche, jusqu'à un clic hors de la question. Temporaires : le survol les montre dans une fenêtre qui disparaît dès qu'on en sort. Contre les agents IA du navigateur et les captures d'écran.",
                    proposable: ['exam', 'blind', 'millionnaire'].includes(chapterMode),
                    choix: [
                        { valeur: '',                libelle: 'Désactivé' },
                        { valeur: 'tous-persistant', libelle: 'Intitulés persistants' },
                        { valeur: 'tous-temporaire', libelle: 'Intitulés temporaires' },
                        { valeur: 'auto-persistant', libelle: 'Auto-corrigés persistants' },
                        { valeur: 'auto-temporaire', libelle: 'Auto-corrigés temporaires' }
                    ],
                    // Actif par défaut (cf. niveauAntiIA, core/utils.js) : sans choix du
                    // formateur, le menu montre « Intitulés temporaires ».
                    valeur: window.niveauAntiIA(config) || ''
                },
                // 🔁 Blind et Millionnaire : chaque nouvelle tentative coûte des points sur
                // la note sur 20, sans la faire descendre sous le plancher (cf. Bareme,
                // pénalité par tentative). Figés par apprenant à son premier démarrage.
                {
                    cle: 'penaliteTentative',
                    libelle: '🔁 Pénalité par tentative',
                    aide: "Points retirés de la note sur 20 à chaque nouvelle tentative (Recommencer). 0 : pas de pénalité. Figé pour chaque apprenant à son premier démarrage.",
                    proposable: ['blind', 'millionnaire'].includes(chapterMode),
                    nombre: { min: 0, max: 5, step: 0.5, suffixe: 'pt' },
                    valeur: config.penaliteTentative ?? Bareme.DEFAUT_PENALITE_TENTATIVE
                },
                {
                    cle: 'notePlancher',
                    libelle: '🛟 Note plancher',
                    aide: "Filet de sécurité qui se gagne : tant qu'aucune tentative n'a atteint cette note, rien n'est garanti (c'est la règle « Note retenue » qui joue). Dès qu'une tentative l'a atteinte, les suivantes ne peuvent plus descendre dessous — ni par la pénalité, ni par un moins bon résultat. 0 : pas de filet.",
                    proposable: ['blind', 'millionnaire'].includes(chapterMode),
                    nombre: { min: 0, max: 20, step: 0.5, suffixe: '/20' },
                    valeur: config.notePlancher ?? Bareme.DEFAUT_NOTE_PLANCHER
                },
                {
                    cle: 'noteRetenue',
                    libelle: '🏅 Note retenue',
                    aide: "Dernière tentative : la note est celle de la dernière tentative, même plus basse. Meilleure tentative : la meilleure note obtenue, pénalité comprise.",
                    proposable: ['blind', 'millionnaire'].includes(chapterMode),
                    choix: [
                        { valeur: 'derniere',  libelle: 'Dernière tentative' },
                        { valeur: 'meilleure', libelle: 'Meilleure tentative' }
                    ],
                    valeur: config.noteRetenue || 'derniere'
                }
            ].filter(option => option.proposable);

            html += `
                <div class="chapter-control-card carte-${statusClass}">
                    <div class="control-header">
                        <div class="control-header-badges">
                            <span class="control-status ${statusClass}">${statusText}</span>
                            ${consistencyBadge}
                            <button class="btn-simuler"
                                    title="Tester ce chapitre comme un apprenant — rien n'est conservé"
                                    onclick="dashboard.modules.chapters.simulerChapitre('${chapter.id}')">👁</button>
                            ${'' /* Le cadenas montre l'état, le clic l'inverse : ouvert quand le
                                 chapitre est disponible, fermé quand il est verrouillé. */}
                            <button class="btn-simuler btn-verrou ${isLocked ? 'est-verrouille' : ''}"
                                    title="${isLocked ? 'Verrouillé — cliquer pour déverrouiller' : 'Disponible — cliquer pour verrouiller'}"
                                    aria-label="${isLocked ? 'Déverrouiller le chapitre' : 'Verrouiller le chapitre'}"
                                    onclick="dashboard.modules.chapters.toggleChapterLock('${chapter.id}')">${isLocked ? '🔒' : '🔓'}</button>
                        </div>
                        <h4 title="${this.escapeHtml(chapter.title)}">${this.escapeHtml(chapter.title)}</h4>
                    </div>

                    <div class="carte-section">
                        ${'' /* Le `for` est indispensable : sans lui, ce <label> s'associe à son
                             premier descendant labelable — c'est-à-dire au <button> de l'icône
                             d'aide. Cliquer le texte ouvrirait alors l'aide, et le menu n'aurait
                             plus de nom accessible. */}
                        <label class="carte-section-titre" for="mode-chapitre-${chapter.id}">
                            🎯 Mode du chapitre ${window.Aide ? Aide.icone('modes') : ''}
                        </label>
                        <select id="mode-chapitre-${chapter.id}" class="carte-select"
                                onchange="dashboard.modules.chapters.toggleChapterMode('${chapter.id}', this.value)">
                            <option value="normal" ${chapterMode === 'normal' ? 'selected' : ''}>📖 Découverte</option>
                            <option value="exam" ${chapterMode === 'exam' ? 'selected' : ''}>📝 Examen</option>
                            <option value="blind" ${chapterMode === 'blind' ? 'selected' : ''}>🥽 Blind</option>
                            <option value="millionnaire" ${chapterMode === 'millionnaire' ? 'selected' : ''}>💰 Millionnaire</option>
                            <option value="atelier" ${chapterMode === 'atelier' ? 'selected' : ''}>🧾 Atelier AR</option>
                            <option value="consigne" ${chapterMode === 'consigne' ? 'selected' : ''}>📋 Consigne</option>
                        </select>
                        ${optionsMode.length ? `
                        <div class="carte-options" role="group" aria-label="Options du mode">
                            ${optionsMode.map(option => `
                            <label class="carte-option" title="${this.escapeHtml(option.aide)}">
                                <span>${option.libelle}</span>
                                ${option.nombre ? `
                                <span class="carte-option-nombre">
                                    <input type="number" min="${option.nombre.min}" max="${option.nombre.max}" step="${option.nombre.step}"
                                           value="${option.valeur}" aria-label="${this.escapeHtml(option.libelle)}"
                                           ${'' /* onchange et non oninput : render() redessine toute la grille et
                                                   volerait le focus à chaque chiffre tapé. */}
                                           onchange="dashboard.modules.chapters.basculerOption('${chapter.id}', '${option.cle}', this.value === '' ? null : Math.min(${option.nombre.max}, Math.max(${option.nombre.min}, Number(this.value))))">
                                    <span>${option.nombre.suffixe}</span>
                                </span>` : option.choix ? `
                                <select class="carte-option-select"
                                        onchange="dashboard.modules.chapters.basculerOption('${chapter.id}', '${option.cle}', this.value || null)">
                                    ${option.choix.map(c => `<option value="${c.valeur}" ${c.valeur === option.valeur ? 'selected' : ''}>${c.libelle}</option>`).join('')}
                                </select>` : `
                                <input type="checkbox" class="interrupteur" ${option.actif ? 'checked' : ''}
                                       onchange="dashboard.modules.chapters.basculerOption('${chapter.id}', '${option.cle}', this.checked)">`}
                            </label>`).join('')}
                        </div>` : ''}
                        ${chapterMode === 'consigne' ? `
                        ${'' /* Réservé au mode consigne : c'est le seul où l'apprenant répond
                             ailleurs que dans l'application. Le bouton reste visible même hors
                             HTTPS — le module explique alors pourquoi il ne peut pas imprimer,
                             plutôt que de disparaître sans dire pourquoi. */}
                        <button class="carte-btn-secondaire"
                                title="Imprimer les énoncés et un QRCode par question, pour chaque apprenant"
                                onclick="dashboard.modules.chapters.imprimerConsignes('${chapter.id}')">
                            🖨️ Feuille de consignes
                        </button>` : ''}
                    </div>

                    <div class="carte-section">
                        <label class="carte-option carte-option-titre">
                            <span class="carte-section-titre">📅 Limite de date</span>
                            <input type="checkbox" class="interrupteur" ${isDateEnabled ? 'checked' : ''}
                                   onchange="dashboard.modules.chapters.toggleDateLimit('${chapter.id}', this.checked)">
                        </label>
                        <div class="carte-date">
                            <input type="date" aria-label="Date limite"
                                id="date-input-${chapter.id}"
                                value="${dateValue}"
                                ${isDateEnabled ? '' : 'disabled'}
                                onchange="dashboard.modules.chapters.updateChapterDate('${chapter.id}')"
                            >
                            <select id="hour-select-${chapter.id}" aria-label="Heure limite"
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

    /**
     * Une option du mode (cf. `optionsMode` dans render) : sa clé est celle de la config.
     * Un interrupteur passe true/false, un menu sa valeur — null pour « Désactivé ».
     */
    async basculerOption(chapterId, cle, valeur) {
        await this.dashboard.updateChapterConfig(chapterId, {
            [cle]: valeur
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