// ============================================================================
// CHOIX ORDRE - Ordre d'affichage des propositions d'un QCM / liste de choix
// ============================================================================
// Colonne « ordre_choix » des questions (valeurs « aleatoire » / « fixe » / vide) :
//   - « aleatoire » : les propositions sont mélangées à CHAQUE affichage du
//     chapitre par l'apprenant. AUCUNE mémorisation : l'ordre du tirage n'est
//     ni stocké ni répété — chaque ouverture re-tire au sort.
//   - « fixe » ou vide : ordre tel que conçu par l'auteur (l'ordre publié).
//
// PRINCIPE : on ne déplace que l'ORDRE DOM des propositions. Chaque proposition
// garde son indice publié comme identité stable (`value`, `id`, `for`,
// `data-correct-answers` ne bougent jamais) : la correction (QuestionEngine) et
// la restauration des réponses (ChapterUI / ProgressManager) raisonnent par
// indice publié et restent donc exactes quel que soit l'ordre affiché — même
// après un rechargement de la page, qui re-mélange.
//
// RÈGLES :
//   - Vue formateur (teacher_view) : ordre publié conservé, référence stable.
//   - Chapitre verrouillé (rendu, validé, verrouillé formateur) : ordre tel que
//     conçu — la relecture du chapitre ne doit pas bouger.
//   - Ailleurs (Découverte, Examen, Blind, Millionnaire, Atelier, Consigne…),
//     chaque question marquée « aleatoire » tire ses propositions au sort.
// ============================================================================

const ChoixOrdre = {

    /**
     * Mélange les propositions des questions marquées « aleatoire ».
     * À appeler APRÈS l'injection du HTML (template) et AVANT
     * ChapterUI.restoreAllAnswers() / ChapterOrdre.reveler() : le template masque
     * le contenu quelques instants via .questions-en-attente, ce qui évite que
     * l'ordre de l'auteur s'affiche ne serait-ce qu'une fraction de seconde.
     *
     * @returns {boolean} true si le traitement a été tenté, false sinon.
     */
    appliquer() {
        if (!this._actif()) return false;

        const sections = [...document.querySelectorAll('.question-section')];
        let melangees = 0;

        sections.forEach(section => {
            const question = this._questionDe(section);
            if (question?.ordreChoix !== 'aleatoire') return;

            const choix = this._collecterChoix(section);
            if (!choix || choix.length < 2) return;

            this._melangerDansDom(section, choix);
            melangees++;
        });

        if (melangees) {
            console.log(`[ChoixOrdre] ${melangees} question(s) à choix mélangée(s)`);
        }
        return true;
    },

    // ------------------------------------------------------------------------
    // DÉCISION
    // ------------------------------------------------------------------------

    /** Vue formateur ou chapitre verrouillé → ordre publié inchangé. */
    _actif() {
        if (window.currentExamContext?.isChapterLocked) return false;

        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('teacher_view') === 'true') return false;

        return true;
    },

    /** Retrouve l'objet question publié correspondant à la section DOM. */
    _questionDe(section) {
        const id = section.dataset.questionId;
        if (!id) return null;

        const questions = window.currentChapterConfig?.questions;
        if (Array.isArray(questions)) {
            return questions.find(q => String(q.id) === String(id)) || null;
        }
        return null;
    },

    // ------------------------------------------------------------------------
    // COLLECTE / MÉLANGE
    // ------------------------------------------------------------------------

    /**
     * QCM (radio/checkbox) → les .choice-option ; « selection » → les <option>
     * (hors placeholder « -- Choisissez une réponse -- » qui reste en tête).
     */
    _collecterChoix(section) {
        const choixMultiples = section.querySelectorAll('.choice-option');
        if (choixMultiples.length) return [...choixMultiples];

        const select = section.querySelector('select.select-answer');
        if (select) {
            const options = [...select.querySelectorAll('option')].filter(o => o.value !== '');
            return options.length >= 2 ? options : null;
        }
        return null;
    },

    /**
     * Réordonne les nœuds dans leur conteneur courant. Le conteneur des
     * .choice-option est le div.choices ; celui des <option> est le <select>.
     * appendChild sur un nœud déjà présent le déplace — aucune réattribution de
     * value/id/data-correct-answers, c'est le cœur du design.
     */
    _melangerDansDom(section, choix) {
        const conteneurs = new Set(choix.map(e => e.parentNode));
        conteneurs.forEach(conteneur => {
            const enfants = choix.filter(e => e.parentNode === conteneur);
            const ordre = this._melanger(enfants);
            ordre.forEach(node => conteneur.appendChild(node));
        });
    },

    /** Fisher-Yates sur une copie. */
    _melanger(elements) {
        const copie = [...elements];
        for (let i = copie.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [copie[i], copie[j]] = [copie[j], copie[i]];
        }
        return copie;
    }
};

window.ChoixOrdre = ChoixOrdre;