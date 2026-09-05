// ============================================================================
// CHAPTER ORDRE - Ordre d'affichage des questions
// ============================================================================
// Option « ordre aléatoire », disponible dans les modes Examen, Blind et
// Millionnaire, et seulement pour les chapitres ENTIÈREMENT auto-corrigés.
// Activée par défaut en Millionnaire, désactivée par défaut ailleurs.
//
// RÈGLE D'ORDONNANCEMENT — une seule, pour les trois modes :
//   questions déjà répondues d'abord (dans l'ordre où elles l'ont été),
//   puis les autres tirées au sort.
//
// Rien n'est mémorisé : l'ordre est recalculé à chaque affichage. Ce qui est fait
// reste devant, ce qui reste à faire change de place. En Millionnaire la tentative
// repart de zéro au retour sur le chapitre, donc plus rien n'est répondu et le
// tirage porte sur l'ensemble.
//
// Les blocs de cours ne bougent pas : seules les questions permutent entre elles,
// dans les emplacements qu'elles occupaient.
// ============================================================================

const ChapterOrdre = {

    MODES_ORDONNABLES: ['exam', 'blind', 'millionnaire'],

    // Le tirage n'est le comportement par défaut qu'en Millionnaire : c'est le seul
    // mode où l'ordre fait partie du jeu. Ailleurs, le formateur doit le demander.
    DEFAUT_PAR_MODE: { millionnaire: true, exam: false, blind: false },

    // ------------------------------------------------------------------------
    // DÉCISION
    // ------------------------------------------------------------------------

    /** Mode effectif, lu depuis la source unique de vérité (getExamContext). */
    mode() {
        const contexte = window.currentExamContext;
        if (!contexte) return 'normal';
        if (contexte.isExamMode)         return 'exam';
        if (contexte.isBlindMode)        return 'blind';
        if (contexte.isMillionnaireMode) return 'millionnaire';
        if (contexte.isAtelierMode)      return 'atelier';
        return 'normal';
    },

    /** L'option est-elle proposable ? (mode concerné + chapitre tout auto) */
    estProposable() {
        if (!this.MODES_ORDONNABLES.includes(this.mode())) return false;
        return window.estChapitreToutAuto?.(window.currentChapterConfig?.questions) === true;
    },

    /** L'option est-elle effectivement active pour ce chapitre ? */
    estActif() {
        if (!this.estProposable()) return false;
        const choix = window.currentChapterConfig?.ordreAleatoire;
        return choix === undefined
            ? this.DEFAUT_PAR_MODE[this.mode()] === true
            : choix === true;
    },

    // ------------------------------------------------------------------------
    // APPLICATION
    // ------------------------------------------------------------------------

    /**
     * Réordonne les questions dans le DOM. À appeler une fois la progression
     * chargée (elle dit ce qui est déjà répondu) et avant de révéler le contenu.
     */
    appliquer() {
        if (!this.estActif()) return false;

        const sections = [...document.querySelectorAll('.question-section')];
        if (sections.length < 2) return false;

        const nouvelOrdre = this._ordonner(sections);
        this._replacer(sections, nouvelOrdre);

        console.log(`[Ordre] ${sections.length} question(s) réordonnée(s) — mode ${this.mode()}`);
        return true;
    },

    /** Répondues d'abord (par date de réponse), puis les autres mélangées. */
    _ordonner(sections) {
        const questions = ChapterSession.progress?.chapters?.[ChapterSession.chapterId]?.questions || {};

        const repondues = [];
        const restantes  = [];

        sections.forEach(section => {
            const donnees = questions[section.dataset.questionId];
            if (donnees?.answered) repondues.push({ section, date: donnees.answeredAt || '' });
            else restantes.push(section);
        });

        repondues.sort((a, b) => String(a.date).localeCompare(String(b.date)));

        return [...repondues.map(r => r.section), ...this._melanger(restantes)];
    },

    /** Fisher-Yates sur une copie — l'ordre d'affichage n'a pas besoin de plus. */
    _melanger(elements) {
        const copie = [...elements];
        for (let i = copie.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [copie[i], copie[j]] = [copie[j], copie[i]];
        }
        return copie;
    },

    /**
     * Repose les questions dans les emplacements qu'elles occupaient, dans le nouvel
     * ordre. On passe par des repères insérés dans le DOM : déplacer un nœud invalide
     * les références de voisinage, et les blocs de cours doivent rester en place.
     */
    _replacer(sections, nouvelOrdre) {
        const reperes = sections.map(section => {
            const repere = document.createComment('question');
            section.parentNode.insertBefore(repere, section);
            return repere;
        });

        sections.forEach(section => section.remove());

        nouvelOrdre.forEach((section, index) => {
            const repere = reperes[index];
            repere.parentNode.insertBefore(section, repere);
        });

        reperes.forEach(repere => repere.remove());
    },

    // ------------------------------------------------------------------------
    // RÉVÉLATION DU CONTENU
    // ------------------------------------------------------------------------
    // Le HTML est injecté par le template AVANT que la progression soit chargée :
    // sans masquage, l'ordre publié s'afficherait une fraction de seconde avant de
    // changer sous les yeux de l'apprenant. Le template pose la classe d'attente et
    // programme un filet de sécurité ; on la retire dès que l'ordre est appliqué.

    reveler() {
        document.querySelector('.chapter-content')?.classList.remove('questions-en-attente');
    }
};

window.ChapterOrdre = ChapterOrdre;
