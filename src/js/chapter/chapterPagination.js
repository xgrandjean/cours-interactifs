// ============================================================================
// CHAPTER PAGINATION - Affichage question par question
// ============================================================================
// Option « questions par questions », disponible dans les modes Examen et Blind.
// Un écran = un élément : les blocs de cours sont des étapes comme les questions,
// sinon un long cours resterait affiché au-dessus de chaque question.
//
// Navigation libre dans les deux sens : aucune étape ne verrouille la suivante.
// Rien n'est mémorisé — à l'ouverture on se place sur la première étape non faite,
// ce qui est déduit des réponses déjà enregistrées et non d'un avancement stocké.
//
// Aucune condition sur le type de correction : contrairement à l'ordre aléatoire,
// afficher une question ouverte seule à l'écran ne pose aucun problème.
//
// Chapitre rendu, validé ou verrouillé : la pagination s'efface, la relecture se
// fait d'un seul tenant.
// ============================================================================

const ChapterPagination = {

    MODES_PAGINABLES: ['exam', 'blind'],

    etapes: [],
    index: 0,

    // ------------------------------------------------------------------------
    // DÉCISION
    // ------------------------------------------------------------------------

    estProposable() {
        const mode = window.ChapterOrdre?.mode?.() || 'normal';
        return this.MODES_PAGINABLES.includes(mode);
    },

    estActif() {
        if (window.currentExamContext?.isChapterLocked) return false;
        if (!this.estProposable()) return false;
        return window.currentChapterConfig?.questionParQuestion === true;
    },

    // ------------------------------------------------------------------------
    // MISE EN PLACE
    // ------------------------------------------------------------------------

    /** À appeler après ChapterOrdre.appliquer() : l'ordre des étapes en dépend. */
    init() {
        if (!this.estActif()) return false;

        this.etapes = [...document.querySelectorAll('.question-section, .course-content')];
        if (this.etapes.length < 2) return false;

        document.querySelector('.chapter-content')?.classList.add('mode-pagine');
        this._construireBarre();
        this._brancherClavier();
        this.aller(this._premiereEtapeAFaire());

        console.log(`[Pagination] ${this.etapes.length} étape(s)`);
        return true;
    },

    _construireBarre() {
        document.getElementById('pagination-barre')?.remove();

        const barre = document.createElement('nav');
        barre.id = 'pagination-barre';
        barre.className = 'pagination-barre';
        barre.innerHTML = `
            <button type="button" class="pagination-btn" id="pagination-precedent">← Précédent</button>
            <span class="pagination-position" id="pagination-position"></span>
            <button type="button" class="pagination-btn" id="pagination-suivant">Suivant →</button>
        `;

        document.querySelector('.chapter-content')?.appendChild(barre);

        document.getElementById('pagination-precedent')
            .addEventListener('click', () => this.aller(this.index - 1));
        document.getElementById('pagination-suivant')
            .addEventListener('click', () => this.aller(this.index + 1));
    },

    /** Flèches gauche/droite — sans jamais voler les touches à un champ de saisie. */
    _brancherClavier() {
        document.addEventListener('keydown', (evenement) => {
            if (!this.estActif()) return;
            // `closest` n'existe que sur les éléments : la cible peut être document.
            if (evenement.target?.closest?.('input, textarea, select')) return;
            if (evenement.key === 'ArrowLeft')  this.aller(this.index - 1);
            if (evenement.key === 'ArrowRight') this.aller(this.index + 1);
        });
    },

    /**
     * Première étape non faite : question sans réponse, ou cours à valider non
     * validé. Les cours purement informatifs ne sont jamais un point d'arrêt.
     */
    _premiereEtapeAFaire() {
        const questions = ChapterSession.progress?.chapters?.[ChapterSession.chapterId]?.questions || {};
        let rangCours = -1;

        for (let i = 0; i < this.etapes.length; i++) {
            const etape = this.etapes[i];

            if (etape.classList.contains('course-content')) {
                // Les cours ne sont pas réordonnés : leur rang dans le DOM correspond
                // à la clé course_N de la progression (cf. ChapterUI.restoreCourses).
                rangCours++;
                const aValider = !!etape.querySelector('.btn-course-validate, button');
                if (aValider && questions[`course_${rangCours}`]?.isCorrect !== true) return i;
                continue;
            }

            if (!questions[etape.dataset.questionId]?.answered) return i;
        }

        return 0;
    },

    // ------------------------------------------------------------------------
    // NAVIGATION
    // ------------------------------------------------------------------------

    aller(cible) {
        if (!this.etapes.length) return;

        this.index = Math.max(0, Math.min(cible, this.etapes.length - 1));

        this.etapes.forEach((etape, i) => {
            etape.classList.toggle('etape-masquee', i !== this.index);
        });

        const position = document.getElementById('pagination-position');
        if (position) position.textContent = `${this.index + 1} / ${this.etapes.length}`;

        const precedent = document.getElementById('pagination-precedent');
        const suivant   = document.getElementById('pagination-suivant');
        if (precedent) precedent.disabled = this.index === 0;
        if (suivant)   suivant.disabled   = this.index === this.etapes.length - 1;

        this.etapes[this.index].scrollIntoView({ block: 'start', behavior: 'auto' });
    },

    /** Rétablit l'affichage complet — utilisé quand le chapitre se verrouille. */
    toutAfficher() {
        this.etapes.forEach(etape => etape.classList.remove('etape-masquee'));
        document.querySelector('.chapter-content')?.classList.remove('mode-pagine');
        document.getElementById('pagination-barre')?.remove();
    }
};

window.ChapterPagination = ChapterPagination;
