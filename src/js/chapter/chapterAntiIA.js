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
// fenêtre recouvre ce qui suit le temps de la lecture. Elle ne s'ouvre qu'après un
// court délai de survol (DELAI_SURVOL_MS) : un balayage de la souris — enregistrement
// vidéo de l'écran, agent qui déplace le pointeur — ne révèle rien ; l'apprenant qui
// lit ne le remarque pas. Clic, focus et toucher sont des gestes : immédiats. Sur
// écran tactile, un toucher l'ouvre et un toucher ailleurs la ferme ; au clavier,
// elle suit le focus du voile.
//
// Les blocs de cours ne sont jamais masqués.
//
// Le NUMÉRO de la question (« Question 3 ») est retiré du titre avec l'énoncé, pour les
// questions masquées, et ne réapparaît pas à la lecture (cf. retirerNumero).
//
// MASQUER, C'EST RETIRER DU DOM. Un agent lit la page, pas l'écran : un simple flou
// laisserait tout le texte à sa portée. L'intitulé et l'indication partent donc dans
// une WeakMap indexée par la section, PRIVÉE (fermeture du module : rien sur window
// ne la rend), et ne reviennent dans la page que le temps de la lecture. Indexer par
// la section fait que l'ordre peut être retiré au sort (Millionnaire) ou la page
// découpée en étapes (pagination) sans que ce module ait à le savoir.
//
// CAPTURES D'ÉCRAN. Une page web ne peut pas les empêcher : Windows prend la capture
// AVANT de prévenir le navigateur. Trois parades, par ordre d'efficacité :
//   - un FILIGRANE nominatif et daté sous l'énoncé affiché : une capture qui circule
//     désigne son auteur. C'est la vraie parade, par dissuasion ;
//   - le PRESSE-PAPIERS ÉCRASÉ par le message du blocage copier-coller — à chaque
//     affichage d'un énoncé, au relâchement d'Impr. écran (la capture y est déjà :
//     elle est perdue), et au retour du focus quand la page l'a perdu pendant qu'un
//     énoncé était affiché (Win+Shift+S, Outil Capture : ils volent le focus avant de
//     remplir le presse-papiers). Ce qui est collé ensuite dans une IA est le message,
//     pas l'image. Chrome et Edge acceptent l'écriture dès que la page a le focus ;
//     Firefox et Safari exigent un geste : l'écriture refusée est rejouée au prochain
//     clic ou à la prochaine touche. Coût assumé : l'apprenant qui a copié un texte
//     ailleurs doit le coller AVANT de relire un énoncé. Jamais en simulation ;
//   - tout remasquer dès que la fenêtre du navigateur perd le focus ou que l'onglet
//     est caché, et avant toute impression.
// Hors de portée, dit dans l'aide : la photo au téléphone, l'enregistrement vidéo
// (le délai de survol en limite le rendement), et le fichier que l'Outil Capture de
// Windows 11 enregistre de lui-même dans Images\Captures d'écran.
//
// AUTOMATE. Un navigateur piloté (Selenium, Playwright, Puppeteer, Chrome lancé avec
// --enable-automation) se déclare par navigator.webdriver : les énoncés ne s'y
// affichent jamais. Une extension (Copilot, Claude in Chrome) ne lève pas ce drapeau.
//
// Limites, dites aussi dans l'aide : les bonnes réponses (data-correct-answers) restent
// dans la page, cours.json est public, et une capture prise pendant qu'un énoncé est
// affiché le montre — filigrane compris.
//
// Ni en vue formateur (teacher_view AVEC session formateur, cf. Parcours.estVueFormateur :
// le paramètre seul ne suffit pas), ni dans les modales de correction : seule la page
// apprenant (simulation comprise) est concernée — y compris une copie rendue, dont la
// relecture reste masquée.
// ============================================================================

const ChapterAntiIA = (() => {

    const MODES = ['exam', 'blind', 'millionnaire'];

    const NIVEAUX = {
        'tous-persistant': { portee: 'tous', affichage: 'place' },
        'tous-temporaire': { portee: 'tous', affichage: 'fenetre' },
        'auto-persistant': { portee: 'auto', affichage: 'place' },
        'auto-temporaire': { portee: 'auto', affichage: 'fenetre' }
    };

    /** Délai de survol avant l'ouverture de la fenêtre (temporaire). */
    const DELAI_SURVOL_MS = 300;

    /**
     * Après la fermeture d'un énoncé, délai pendant lequel une perte de focus compte
     * encore comme « survenue pendant l'affichage » : l'outil de capture qui se pose
     * sur la page fait souvent sortir le pointeur (pointerleave, fenêtre fermée) juste
     * avant de prendre le focus (blur).
     */
    const DELAI_SUSPICION_MS = 1500;

    const contenus = new WeakMap();   // section → { texte, indication } — PRIVÉ
    let revelee = null;               // persistant : la section dont l'énoncé est affiché en place
    let fenetre = null;               // temporaire : { section, element } de la fenêtre ouverte
    let niveauCourant = null;
    let ecoutesBranchees = false;
    let minuterieSurvol = null;       // temporaire : ouverture différée en cours
    let derniereFermeture = 0;        // horodatage du dernier remasquage
    let pressePapiersEnAttente = false; // écriture refusée : à rejouer au prochain geste
    let captureSuspectee = false;     // focus perdu pendant un affichage : écraser au retour
    let compteurFenetres = 0;

    // ------------------------------------------------------------------------
    // DÉCISION
    // ------------------------------------------------------------------------

    function estVueFormateur() {
        const P = window.Parcours;
        return !!(P && typeof P.estVueFormateur === 'function' && P.estVueFormateur());
    }

    function estSimulation() {
        return !!(window.Simulation && typeof Simulation.active === 'function' && Simulation.active());
    }

    function estAutomate() {
        return navigator.webdriver === true;
    }

    function estProposable() {
        const mode = window.ChapterOrdre?.mode?.() || 'normal';
        return MODES.includes(mode);
    }

    function niveau() {
        if (estVueFormateur()) return null;
        if (!estProposable()) return null;
        // Actif par défaut, en « Intitulés temporaires » : cf. niveauAntiIA (core/utils.js).
        const valeur = window.niveauAntiIA
            ? niveauAntiIA(window.currentChapterConfig)
            : window.currentChapterConfig?.antiIA;
        return NIVEAUX[valeur] || null;
    }

    function enFenetre() {
        return niveauCourant?.affichage === 'fenetre';
    }

    function unEnonceEstAffiche() {
        return !!(revelee || fenetre);
    }

    // ------------------------------------------------------------------------
    // PRESSE-PAPIERS
    // ------------------------------------------------------------------------

    function messagePressePapiers() {
        return window.ANTI_COPY_MSG || '🔒 Contenu protégé — copier/coller désactivé sur ce chapitre.';
    }

    /**
     * Écrase le presse-papiers par le message du blocage copier-coller. Refus (pas de
     * geste, page sans focus, contexte non sécurisé) → rejoué au prochain geste. Jamais
     * en simulation : le formateur garde son presse-papiers.
     */
    function neutraliserPressePapiers() {
        if (!niveauCourant || estSimulation()) return;
        let promesse = null;
        try {
            promesse = navigator.clipboard?.writeText(messagePressePapiers());
        } catch (_) { promesse = null; }
        if (!promesse || typeof promesse.then !== 'function') {
            pressePapiersEnAttente = true;
            return;
        }
        promesse.then(
            () => { pressePapiersEnAttente = false; },
            () => { pressePapiersEnAttente = true; }
        );
    }

    /** Au prochain geste de l'apprenant, l'écriture refusée est rejouée. */
    function rejouerSiEnAttente() {
        if (pressePapiersEnAttente) neutraliserPressePapiers();
    }

    // ------------------------------------------------------------------------
    // MISE EN PLACE
    // ------------------------------------------------------------------------

    /** À appeler avant ChapterOrdre.reveler() : l'énoncé ne doit jamais s'afficher. */
    function init() {
        niveauCourant = niveau();
        if (!niveauCourant) return false;

        const sections = [...document.querySelectorAll('.question-section')]
            .filter(section => estVisee(section));

        sections.forEach(section => retirer(section));
        brancherEcoutes();

        console.log(`[Anti-IA] ${sections.length} énoncé(s) masqué(s)` + (estAutomate() ? ' — navigateur piloté, aucun affichage' : ''));
        return sections.length > 0;
    }

    function estVisee(section) {
        if (niveauCourant.portee === 'tous') return true;
        return ['auto', 'semi'].includes(section.dataset.correctionType || 'auto');
    }

    /** Première fois : l'intitulé et l'indication quittent la page pour la WeakMap. */
    function retirer(section) {
        const texte = section.querySelector('.question-text');
        if (!texte || contenus.has(section)) return;

        const indication = section.querySelector('.hint-content');
        contenus.set(section, {
            texte: texte.innerHTML,
            indication: indication ? indication.innerHTML : null
        });
        if (indication) {
            indication.innerHTML = '';
            // Ouverte vide, la boîte dit où lire l'indication (cf. style.css).
            indication.dataset.antiIa = enFenetre() ? 'survol' : 'clic';
        }

        retirerNumero(section);
        if (enFenetre() && !estAutomate()) brancherSurvol(section, texte);
        voiler(section);
    }

    /**
     * Le numéro du titre (« Question 3 » → « Question ») part avec l'énoncé. Il ne revient
     * JAMAIS, même quand l'énoncé est affiché : dans la WeakMap on ne met que ce qui doit
     * pouvoir se relire, et le numéro n'en fait pas partie. Il trahirait sinon la place de
     * la question dans la copie d'origine (l'ordre peut être tiré au sort), et permettrait
     * de désigner « la question 3 » à un tiers ou à un agent.
     * Seules les sections masquées sont touchées : un titre sans chiffre reste intact.
     */
    function retirerNumero(section) {
        const titre = section.querySelector('.question-title h3');
        if (!titre) return;
        const sans = titre.textContent.replace(/\s*\d+/g, '').trim();
        titre.textContent = sans || 'Question';
    }

    function voiler(section) {
        const texte = section.querySelector('.question-text');
        const enFen = enFenetre();

        texte.classList.add('anti-ia-masque');

        if (estAutomate()) {
            // Navigateur piloté : le voile le dit, et rien ne l'ouvre.
            texte.innerHTML = `
                <div class="anti-ia-voile anti-ia-automate" role="note">
                    🤖 Page pilotée par un automate : énoncés indisponibles
                </div>`;
            return;
        }

        // Pas un <button> : le verrouillage au rendu désactive tous les boutons de la
        // page, ce qui rendrait l'énoncé illisible à la relecture.
        texte.innerHTML = `
            <div class="anti-ia-voile" role="button" tabindex="0"
                 aria-label="Afficher l'énoncé de la question">
                🙈 Énoncé masqué — ${enFen ? 'survoler' : 'cliquer'} pour l'afficher
                ${enFen ? '<small>Il disparaît dès que le pointeur sort de sa fenêtre.</small>' : ''}
            </div>`;

        const voile = texte.querySelector('.anti-ia-voile');
        const ouvrir = () => enFen ? ouvrirFenetre(section) : reveler(section);
        voile.addEventListener('click', ouvrir);
        voile.addEventListener('keydown', (evenement) => {
            if (evenement.key === 'Enter' || evenement.key === ' ') {
                evenement.preventDefault();
                ouvrir();
            }
        });
        if (enFen) voile.addEventListener('focus', ouvrir);
    }

    /**
     * Temporaire : posé une fois par section, sur `.question-text`, qui contient le voile
     * ET la fenêtre. Passer du voile à la fenêtre ne compte donc pas comme une sortie ;
     * seule la sortie des deux la ferme. Le toucher n'a pas de survol : un « leave »
     * tactile suit chaque toucher, il fermerait la fenêtre aussitôt ouverte.
     * L'ouverture au survol attend DELAI_SURVOL_MS : un pointeur qui ne fait que passer
     * n'ouvre rien.
     */
    function brancherSurvol(section, texte) {
        texte.addEventListener('pointerenter', (evenement) => {
            if (evenement.pointerType === 'touch') return;
            annulerSurvolDiffere();
            minuterieSurvol = setTimeout(() => {
                minuterieSurvol = null;
                ouvrirFenetre(section);
            }, DELAI_SURVOL_MS);
        });
        texte.addEventListener('pointerleave', (evenement) => {
            if (evenement.pointerType === 'touch') return;
            annulerSurvolDiffere();
            fermerFenetre();
        });
        texte.addEventListener('focusout', (evenement) => {
            if (!texte.contains(evenement.relatedTarget)) fermerFenetre();
        });
    }

    function annulerSurvolDiffere() {
        if (minuterieSurvol) {
            clearTimeout(minuterieSurvol);
            minuterieSurvol = null;
        }
    }

    // ------------------------------------------------------------------------
    // PERSISTANT : AFFICHÉ EN PLACE
    // ------------------------------------------------------------------------

    function reveler(section) {
        const contenu = contenus.get(section);
        if (!contenu || estAutomate()) return;
        if (revelee && revelee !== section) masquer(revelee);

        const texte = section.querySelector('.question-text');
        const indication = section.querySelector('.hint-content');
        texte.innerHTML = contenu.texte;
        texte.classList.remove('anti-ia-masque');
        poserFiligrane(texte);
        if (indication && contenu.indication !== null) indication.innerHTML = contenu.indication;

        revelee = section;
        neutraliserPressePapiers();
    }

    /**
     * Le bouton « 💡 Indication » d'une question masquée : son texte est hors de la page
     * (cf. retirer), la boîte s'ouvrirait vide. Même règle que pour l'énoncé — lire
     * l'indication, c'est lire l'énoncé : affichée en place avec lui au niveau persistant,
     * dans la fenêtre au niveau temporaire (la boîte étant ouverte, la fenêtre l'inclut).
     * Renvoie true si la question est masquée et que le module s'en est chargé.
     */
    function afficherIndication(section) {
        if (!section || !contenus.has(section)) return false;
        if (enFenetre()) {
            fermerFenetre();
            ouvrirFenetre(section);
        } else {
            reveler(section);
        }
        return true;
    }

    function masquer(section) {
        if (!section || !contenus.has(section)) return;
        const indication = section.querySelector('.hint-content');
        if (indication) indication.innerHTML = '';
        retirerFiligrane(section.querySelector('.question-text'));
        voiler(section);
        if (revelee === section) revelee = null;
        derniereFermeture = Date.now();
    }

    // ------------------------------------------------------------------------
    // FILIGRANE NOMINATIF
    // ------------------------------------------------------------------------

    /**
     * « Nom · Classe — jj/mm/aaaa hh:mm », calculé à chaque affichage : le nom et la classe
     * sont lus dans l'en-tête de la page (chapterInit.js les remplit — « Simulation
     * formateur » en simulation), ce qui ne suppose aucun ordre de chargement. Repli sur le
     * nom du QRCode, puis date seule.
     */
    function texteFiligrane() {
        const nom = (document.querySelector('.student-name')?.textContent
            || window.QRQuestion?.nom || '').trim();
        const classe = (document.querySelector('.student-class')?.textContent || '').trim();
        const date = new Date().toLocaleString('fr-FR', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        const identite = [nom, classe].filter(Boolean).join(' · ');
        return identite ? `${identite} — ${date}` : date;
    }

    /**
     * Une tuile SVG (texte incliné, gris pâle) répétée en fond. Aucun nœud ajouté :
     * l'énoncé reste au premier plan, et rien n'est cliquable. Le texte est échappé pour
     * le XML, puis l'ensemble encodé pour l'URL data:.
     */
    function poserFiligrane(element) {
        if (!element) return;
        const texte = texteFiligrane()
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
        // Tuile basse (72px) et texte peu incliné : même un énoncé d'une ligne, dont la
        // fenêtre fait la hauteur du voile, porte au moins un filigrane entier.
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="72">`
            + `<text x="12" y="46" transform="rotate(-8 170 36)" fill="rgba(71,85,105,0.22)" `
            + `font-family="Segoe UI, Arial, sans-serif" font-size="15" font-weight="600">${texte}</text></svg>`;
        element.classList.add('anti-ia-filigrane');
        element.style.backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    }

    function retirerFiligrane(element) {
        if (!element) return;
        element.classList.remove('anti-ia-filigrane');
        element.style.backgroundImage = '';
    }

    // ------------------------------------------------------------------------
    // TEMPORAIRE : FENÊTRE AU SURVOL
    // ------------------------------------------------------------------------

    function ouvrirFenetre(section) {
        const contenu = contenus.get(section);
        if (!contenu || estAutomate()) return;
        if (fenetre?.section === section) return;
        fermerFenetre();

        const texte = section.querySelector('.question-text');
        // L'indication n'y figure que si l'apprenant l'a ouverte : lire l'indication,
        // c'est encore lire l'énoncé, elle est donc masquée avec lui.
        const conteneurIndication = section.querySelector('.hint-container');
        const indicationOuverte = conteneurIndication && conteneurIndication.style.display !== 'none'
            && contenu.indication;

        const element = document.createElement('div');
        element.className = 'anti-ia-fenetre';
        element.id = 'anti-ia-fenetre-' + (++compteurFenetres);
        element.setAttribute('role', 'tooltip');
        element.innerHTML = contenu.texte +
            (indicationOuverte ? `<div class="anti-ia-fenetre-indication">💡 ${contenu.indication}</div>` : '');
        poserFiligrane(element);
        texte.appendChild(element);
        // Lecture d'écran : le voile, qui a le focus, désigne la fenêtre qu'il a ouverte.
        texte.querySelector('.anti-ia-voile')?.setAttribute('aria-describedby', element.id);

        fenetre = { section, element };
        neutraliserPressePapiers();
    }

    function fermerFenetre() {
        if (!fenetre) return;
        fenetre.section.querySelector('.anti-ia-voile')?.removeAttribute('aria-describedby');
        fenetre.element.remove();
        fenetre = null;
        derniereFermeture = Date.now();
    }

    function masquerTout() {
        annulerSurvolDiffere();
        if (revelee) masquer(revelee);
        fermerFenetre();
    }

    /**
     * Un énoncé est-il affiché, ou vient-il de l'être ? Sert à qualifier une perte de
     * focus : l'outil de capture qui se pose sur la page fait souvent sortir le pointeur
     * (fenêtre fermée) juste avant de prendre le focus.
     */
    function affichageRecent() {
        return unEnonceEstAffiche() || (Date.now() - derniereFermeture) < DELAI_SUSPICION_MS;
    }

    /**
     * Posées une seule fois. Persistant : un clic ou un focus hors de la question
     * remasque. Temporaire : un toucher ou un focus hors de la fenêtre la ferme (le
     * survol, lui, est géré section par section). Quitter la fenêtre du navigateur ou
     * l'onglet remasque tout (agent qui prend la main, outil de capture qui vole le
     * focus) ; si un énoncé était affiché, le presse-papiers est écrasé au retour.
     */
    function brancherEcoutes() {
        if (ecoutesBranchees) return;
        ecoutesBranchees = true;

        const horsZone = (evenement) => {
            const cible = evenement.target;
            if (revelee && !revelee.contains(cible)) masquer(revelee);
            if (fenetre) {
                const texte = fenetre.section.querySelector('.question-text');
                if (!texte.contains(cible)) fermerFenetre();
            }
        };

        document.addEventListener('pointerdown', horsZone, true);
        document.addEventListener('focusin', horsZone, true);

        // Un geste de l'apprenant : l'écriture du presse-papiers refusée faute de geste
        // (Firefox, Safari) est rejouée ici.
        document.addEventListener('pointerdown', rejouerSiEnAttente, true);
        document.addEventListener('keydown', rejouerSiEnAttente, true);

        const focusPerdu = () => {
            if (affichageRecent()) captureSuspectee = true;
            masquerTout();
        };
        window.addEventListener('blur', focusPerdu);
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) focusPerdu();
        });
        window.addEventListener('focus', () => {
            if (!captureSuspectee) return;
            captureSuspectee = false;
            neutraliserPressePapiers();
        });

        // Impression (Ctrl+P, enregistrer en PDF) : rien d'affiché sur le papier.
        window.addEventListener('beforeprint', () => masquerTout());

        // Impr. écran : la capture est déjà prise quand la page l'apprend (cf. en-tête),
        // et déjà dans le presse-papiers : on l'y écrase.
        const imprEcran = (evenement) => {
            if (evenement.key !== 'PrintScreen' && evenement.code !== 'PrintScreen') return;
            masquerTout();
            neutraliserPressePapiers();
        };
        document.addEventListener('keyup', imprEcran, true);
        document.addEventListener('keydown', imprEcran, true);
    }

    return {
        MODES,
        NIVEAUX,
        DELAI_SURVOL_MS,
        estProposable,
        niveau,
        init,
        reveler,
        masquer,
        afficherIndication,
        ouvrirFenetre,
        fermerFenetre,
        masquerTout,
        /** Une section est-elle prise en charge (énoncé retiré) ? */
        estMasquee(section) { return contenus.has(section); },
        /** Pour les bancs d'essai : état interne en lecture, jamais le contenu. */
        etat() {
            return {
                enoncesAffiches: unEnonceEstAffiche(),
                pressePapiersEnAttente,
                captureSuspectee,
                survolDiffere: !!minuterieSurvol
            };
        }
    };
})();

window.ChapterAntiIA = ChapterAntiIA;
