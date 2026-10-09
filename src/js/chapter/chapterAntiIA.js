// ============================================================================
// CHAPTER ANTI-IA - Énoncés masqués
// ============================================================================
// Option « 🤖 Anti-IA », disponible dans les modes Examen, Blind et Millionnaire.
// Un agent intégré au navigateur, ou une capture d'écran confiée à une IA, lit d'un
// coup tout l'énoncé d'un chapitre. Ici l'intitulé d'une question n'est lisible qu'à
// la demande de l'apprenant, une question à la fois.
//
// Quatre niveaux, réglés par le formateur (chapter_config.antiIA) :
//
//   tous-persistant   toutes les questions   clic → affiché EN PLACE, remasqué au
//                                            clic hors de la question
//   tous-temporaire   toutes les questions   survol → affiché dans une FENÊTRE posée
//                                            par-dessus, fermée dès qu'on en sort
//   auto-persistant   auto et semi           comme tous-persistant
//   auto-temporaire   auto et semi           comme tous-temporaire
//
// La fenêtre du niveau temporaire ne décale rien : la page garde sa mise en page, la
// fenêtre recouvre ce qui suit le temps de la lecture. Sur écran tactile, où il n'y a
// pas de survol, un toucher l'ouvre et un toucher ailleurs la ferme ; au clavier, elle
// suit le focus du voile.
//
// Les blocs de cours ne sont jamais masqués.
//
// Le NUMÉRO de la question (« Question 3 ») est retiré du titre avec l'énoncé, pour les
// questions masquées, et ne réapparaît pas à la lecture (cf. _retirerNumero).
//
// MASQUER, C'EST RETIRER DU DOM. Un agent lit la page, pas l'écran : un simple flou
// laisserait tout le texte à sa portée. L'intitulé et l'indication partent donc dans
// une WeakMap indexée par la section, et ne reviennent dans la page que le temps de
// la lecture. Indexer par la section fait que l'ordre peut être retiré au sort
// (Millionnaire) ou la page découpée en étapes (pagination) sans que ce module ait à
// le savoir.
//
// CAPTURES D'ÉCRAN. Une page web ne peut pas les empêcher : Windows prend la capture
// AVANT de prévenir le navigateur, qui ne reçoit que le relâchement d'Impr. écran — et
// l'Outil Capture de Windows 11 fige l'écran dès l'appui. Deux parades seulement :
//   - un FILIGRANE nominatif et daté sous l'énoncé affiché : une capture qui circule
//     désigne son auteur. C'est la vraie parade, par dissuasion ;
//   - au relâchement d'Impr. écran, tout remasquer et tenter de vider le presse-papiers
//     (refusé hors HTTPS ou sans geste de l'utilisateur) : un appoint, sans garantie.
//
// Limites, dites aussi dans l'aide : les bonnes réponses (data-correct-answers) restent
// dans la page, cours.json est public, et une capture prise pendant qu'un énoncé est
// affiché le montre — filigrane compris.
//
// Ni en vue formateur, ni dans les modales de correction : seule la page apprenant
// (simulation comprise) est concernée — y compris une copie rendue, dont la relecture
// reste masquée.
// ============================================================================

const ChapterAntiIA = {

    MODES: ['exam', 'blind', 'millionnaire'],

    NIVEAUX: {
        'tous-persistant': { portee: 'tous', affichage: 'place' },
        'tous-temporaire': { portee: 'tous', affichage: 'fenetre' },
        'auto-persistant': { portee: 'auto', affichage: 'place' },
        'auto-temporaire': { portee: 'auto', affichage: 'fenetre' }
    },

    _contenus: new WeakMap(),
    _revelee: null,       // persistant : la section dont l'énoncé est affiché en place
    _fenetre: null,       // temporaire : { section, element } de la fenêtre ouverte
    _niveau: null,
    _ecoutesBranchees: false,

    // ------------------------------------------------------------------------
    // DÉCISION
    // ------------------------------------------------------------------------

    estProposable() {
        const mode = window.ChapterOrdre?.mode?.() || 'normal';
        return this.MODES.includes(mode);
    },

    niveau() {
        if (new URLSearchParams(window.location.search).get('teacher_view') === 'true') return null;
        if (!this.estProposable()) return null;
        // Actif par défaut, en « Intitulés temporaires » : cf. niveauAntiIA (core/utils.js).
        const valeur = window.niveauAntiIA
            ? niveauAntiIA(window.currentChapterConfig)
            : window.currentChapterConfig?.antiIA;
        return this.NIVEAUX[valeur] || null;
    },

    _enFenetre() {
        return this._niveau?.affichage === 'fenetre';
    },

    // ------------------------------------------------------------------------
    // MISE EN PLACE
    // ------------------------------------------------------------------------

    /** À appeler avant ChapterOrdre.reveler() : l'énoncé ne doit jamais s'afficher. */
    init() {
        this._niveau = this.niveau();
        if (!this._niveau) return false;

        const sections = [...document.querySelectorAll('.question-section')]
            .filter(section => this._estVisee(section));

        sections.forEach(section => this._retirer(section));
        this._brancherEcoutes();

        console.log(`[Anti-IA] ${sections.length} énoncé(s) masqué(s)`);
        return sections.length > 0;
    },

    _estVisee(section) {
        if (this._niveau.portee === 'tous') return true;
        return ['auto', 'semi'].includes(section.dataset.correctionType || 'auto');
    },

    /** Première fois : l'intitulé et l'indication quittent la page pour la WeakMap. */
    _retirer(section) {
        const texte = section.querySelector('.question-text');
        if (!texte || this._contenus.has(section)) return;

        const indication = section.querySelector('.hint-content');
        this._contenus.set(section, {
            texte: texte.innerHTML,
            indication: indication ? indication.innerHTML : null
        });
        if (indication) {
            indication.innerHTML = '';
            // Ouverte vide, la boîte dit où lire l'indication (cf. style.css).
            indication.dataset.antiIa = this._enFenetre() ? 'survol' : 'clic';
        }

        this._retirerNumero(section);
        if (this._enFenetre()) this._brancherSurvol(section, texte);
        this._voiler(section);
    },

    /**
     * Le numéro du titre (« Question 3 » → « Question ») part avec l'énoncé. Il ne revient
     * JAMAIS, même quand l'énoncé est affiché : dans la WeakMap on ne met que ce qui doit
     * pouvoir se relire, et le numéro n'en fait pas partie. Il trahirait sinon la place de
     * la question dans la copie d'origine (l'ordre peut être tiré au sort), et permettrait
     * de désigner « la question 3 » à un tiers ou à un agent.
     * Seules les sections masquées sont touchées : un titre sans chiffre reste intact.
     */
    _retirerNumero(section) {
        const titre = section.querySelector('.question-title h3');
        if (!titre) return;
        const sans = titre.textContent.replace(/\s*\d+/g, '').trim();
        titre.textContent = sans || 'Question';
    },

    _voiler(section) {
        const texte = section.querySelector('.question-text');
        const fenetre = this._enFenetre();

        texte.classList.add('anti-ia-masque');
        // Pas un <button> : le verrouillage au rendu désactive tous les boutons de la
        // page, ce qui rendrait l'énoncé illisible à la relecture.
        texte.innerHTML = `
            <div class="anti-ia-voile" role="button" tabindex="0"
                 aria-label="Afficher l'énoncé de la question">
                🙈 Énoncé masqué — ${fenetre ? 'survoler' : 'cliquer'} pour l'afficher
                ${fenetre ? '<small>Il disparaît dès que le pointeur sort de sa fenêtre.</small>' : ''}
            </div>`;

        const voile = texte.querySelector('.anti-ia-voile');
        const ouvrir = () => fenetre ? this.ouvrirFenetre(section) : this.reveler(section);
        voile.addEventListener('click', ouvrir);
        voile.addEventListener('keydown', (evenement) => {
            if (evenement.key === 'Enter' || evenement.key === ' ') {
                evenement.preventDefault();
                ouvrir();
            }
        });
        if (fenetre) voile.addEventListener('focus', ouvrir);
    },

    /**
     * Temporaire : posé une fois par section, sur `.question-text`, qui contient le voile
     * ET la fenêtre. Passer du voile à la fenêtre ne compte donc pas comme une sortie ;
     * seule la sortie des deux la ferme. Le toucher n'a pas de survol : un « leave »
     * tactile suit chaque toucher, il fermerait la fenêtre aussitôt ouverte.
     */
    _brancherSurvol(section, texte) {
        texte.addEventListener('pointerenter', (evenement) => {
            if (evenement.pointerType !== 'touch') this.ouvrirFenetre(section);
        });
        texte.addEventListener('pointerleave', (evenement) => {
            if (evenement.pointerType !== 'touch') this.fermerFenetre();
        });
        texte.addEventListener('focusout', (evenement) => {
            if (!texte.contains(evenement.relatedTarget)) this.fermerFenetre();
        });
    },

    // ------------------------------------------------------------------------
    // PERSISTANT : AFFICHÉ EN PLACE
    // ------------------------------------------------------------------------

    reveler(section) {
        const contenu = this._contenus.get(section);
        if (!contenu) return;
        if (this._revelee && this._revelee !== section) this.masquer(this._revelee);

        const texte = section.querySelector('.question-text');
        const indication = section.querySelector('.hint-content');
        texte.innerHTML = contenu.texte;
        texte.classList.remove('anti-ia-masque');
        this._poserFiligrane(texte);
        if (indication && contenu.indication !== null) indication.innerHTML = contenu.indication;

        this._revelee = section;
    },

    /**
     * Le bouton « 💡 Indication » d'une question masquée : son texte est hors de la page
     * (cf. _retirer), la boîte s'ouvrirait vide. Même règle que pour l'énoncé — lire
     * l'indication, c'est lire l'énoncé : affichée en place avec lui au niveau persistant,
     * dans la fenêtre au niveau temporaire (la boîte étant ouverte, la fenêtre l'inclut).
     * Renvoie true si la question est masquée et que le module s'en est chargé.
     */
    afficherIndication(section) {
        if (!section || !this._contenus.has(section)) return false;
        if (this._enFenetre()) {
            this.fermerFenetre();
            this.ouvrirFenetre(section);
        } else {
            this.reveler(section);
        }
        return true;
    },

    masquer(section) {
        if (!section || !this._contenus.has(section)) return;
        const indication = section.querySelector('.hint-content');
        if (indication) indication.innerHTML = '';
        this._retirerFiligrane(section.querySelector('.question-text'));
        this._voiler(section);
        if (this._revelee === section) this._revelee = null;
    },

    // ------------------------------------------------------------------------
    // FILIGRANE NOMINATIF
    // ------------------------------------------------------------------------

    /**
     * « Nom — jj/mm/aaaa hh:mm », calculé à chaque affichage : le nom est lu dans l'en-tête
     * de la page (chapterInit.js le remplit — « Simulation formateur » en simulation), ce
     * qui ne suppose aucun ordre de chargement. Repli sur le nom du QRCode, puis date seule.
     */
    _texteFiligrane() {
        const nom = (document.querySelector('.student-name')?.textContent
            || window.QRQuestion?.nom || '').trim();
        const date = new Date().toLocaleString('fr-FR', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        return nom ? `${nom} — ${date}` : date;
    },

    /**
     * Une tuile SVG (texte incliné, gris très pâle) répétée en fond. Aucun nœud ajouté :
     * l'énoncé reste au premier plan, et rien n'est cliquable. Le texte est échappé pour
     * le XML, puis l'ensemble encodé pour l'URL data:.
     */
    _poserFiligrane(element) {
        if (!element) return;
        const texte = this._texteFiligrane()
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
        // Tuile basse (72px) et texte peu incliné : même un énoncé d'une ligne, dont la
        // fenêtre fait la hauteur du voile, porte au moins un filigrane entier.
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="72">`
            + `<text x="12" y="46" transform="rotate(-8 170 36)" fill="rgba(71,85,105,0.16)" `
            + `font-family="Segoe UI, Arial, sans-serif" font-size="15" font-weight="600">${texte}</text></svg>`;
        element.classList.add('anti-ia-filigrane');
        element.style.backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    },

    _retirerFiligrane(element) {
        if (!element) return;
        element.classList.remove('anti-ia-filigrane');
        element.style.backgroundImage = '';
    },

    // ------------------------------------------------------------------------
    // TEMPORAIRE : FENÊTRE AU SURVOL
    // ------------------------------------------------------------------------

    ouvrirFenetre(section) {
        const contenu = this._contenus.get(section);
        if (!contenu) return;
        if (this._fenetre?.section === section) return;
        this.fermerFenetre();

        const texte = section.querySelector('.question-text');
        // L'indication n'y figure que si l'apprenant l'a ouverte : lire l'indication,
        // c'est encore lire l'énoncé, elle est donc masquée avec lui.
        const conteneurIndication = section.querySelector('.hint-container');
        const indicationOuverte = conteneurIndication && conteneurIndication.style.display !== 'none'
            && contenu.indication;

        const element = document.createElement('div');
        element.className = 'anti-ia-fenetre';
        element.setAttribute('role', 'tooltip');
        element.innerHTML = contenu.texte +
            (indicationOuverte ? `<div class="anti-ia-fenetre-indication">💡 ${contenu.indication}</div>` : '');
        this._poserFiligrane(element);
        texte.appendChild(element);

        this._fenetre = { section, element };
    },

    fermerFenetre() {
        if (!this._fenetre) return;
        this._fenetre.element.remove();
        this._fenetre = null;
    },

    masquerTout() {
        if (this._revelee) this.masquer(this._revelee);
        this.fermerFenetre();
    },

    /**
     * Posées une seule fois. Persistant : un clic ou un focus hors de la question
     * remasque. Temporaire : un toucher ou un focus hors de la fenêtre la ferme (le
     * survol, lui, est géré section par section). Quitter la fenêtre du navigateur ou
     * l'onglet remasque tout (agent qui prend la main, outil de capture qui vole le
     * focus).
     */
    _brancherEcoutes() {
        if (this._ecoutesBranchees) return;
        this._ecoutesBranchees = true;

        const horsZone = (evenement) => {
            const cible = evenement.target;
            if (this._revelee && !this._revelee.contains(cible)) this.masquer(this._revelee);
            if (this._fenetre) {
                const texte = this._fenetre.section.querySelector('.question-text');
                if (!texte.contains(cible)) this.fermerFenetre();
            }
        };

        document.addEventListener('pointerdown', horsZone, true);
        document.addEventListener('focusin', horsZone, true);
        window.addEventListener('blur', () => this.masquerTout());
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) this.masquerTout();
        });

        // Impr. écran : la capture est déjà prise quand la page l'apprend (cf. en-tête).
        // On remasque tout de même, et on tente d'écraser le presse-papiers — refusé hors
        // HTTPS ou sans geste de l'utilisateur, ce qui est attendu et sans conséquence.
        const imprEcran = (evenement) => {
            if (evenement.key !== 'PrintScreen' && evenement.code !== 'PrintScreen') return;
            this.masquerTout();
            try {
                navigator.clipboard?.writeText(' ').catch(() => {});
            } catch (_) { /* presse-papiers indisponible */ }
        };
        document.addEventListener('keyup', imprEcran, true);
        document.addEventListener('keydown', imprEcran, true);
    }
};

window.ChapterAntiIA = ChapterAntiIA;
