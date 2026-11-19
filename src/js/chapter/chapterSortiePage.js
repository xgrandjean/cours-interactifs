// ============================================================================
// CHAPTER SORTIE DE PAGE - Option « 🚪 Sortie de page »
// ============================================================================
// Option d'un chapitre (chapter_config.sortiePage, interrupteur du formateur, sur la carte du
// site ou dans la colonne 23 de « Gestion des chapitres » de XPro), proposée en Examen, Blind
// et Millionnaire, et FIGÉE pour chaque apprenant à son premier démarrage (frozenSortiePage,
// progressManager.js) : qui a commencé sans être prévenu n'est pas pris en cours de route.
//
// Décisions de l'utilisateur (17/11/2026) :
//   - une sortie de la page (autre onglet, fenêtre réduite, autre application) ne compte que
//     si elle dure PLUS DE 3 s (Bareme.SEUIL_SORTIE_PAGE_MS ; 5 s jusqu'au 18/11/2026) : en
//     dessous, rien n'est enregistré ni retiré — c'est le filtre des pertes de focus
//     accidentelles. Ce seuil n'est JAMAIS annoncé, ni à l'apprenant ni au formateur
//     (décision du 18/11/2026) : l'apprenant lit seulement qu'il ne doit pas quitter la page, et
//     le message au retour ne dit pas non plus la durée de la sortie ;
//   - chaque sortie confirmée est enregistrée dans la copie (chapter.sortiesPage : le,
//     dureeS, tentative) ; à la correction, 3 points sur 20 par sortie (Bareme.PENALITE_SORTIE_PAGE,
//     valeur par défaut) sont PROPOSÉS dans la case bonus/pénalité avec une ligne 🚪 dans le bloc ⟦Auto : …⟧, à côté des
//     lignes 📚 et 🔁, le texte du formateur épargné (Bareme.sortiesPage, fusionnerAuto) ;
//   - les sorties se cumulent sur toutes les tentatives (Blind, Millionnaire) ;
//   - l'apprenant est prévenu dès l'ouverture (bandeau + fenêtre), puis au retour de chaque
//     sortie confirmée ;
//   - SANS MONTANT : les 3 points ne sont que la valeur proposée par défaut, que le formateur
//     modifie à la correction. L'apprenant lit seulement que sortir est interdit, enregistré,
//     signalé et sanctionné sur la note — jamais un chiffre qui pourrait ne pas être tenu.
//
// COMMENT ON LE SAIT. La page est « dehors » quand elle est cachée (document.hidden) ou que
// son document n'a plus le focus (document.hasFocus()). Les événements blur / focus /
// visibilitychange réagissent tout de suite, et un relevé chaque seconde rattrape ce qu'ils ne
// disent pas : le focus passé dans une <iframe> de la page (vidéo, appliquette) n'est PAS une
// sortie — le document garde le focus —, mais quitter l'application DEPUIS cette iframe en
// est une, et seule la fenêtre de l'iframe en est prévenue.
//
// Une sortie se confirme de deux façons, sans doublon : par le relevé, l'apprenant toujours
// dehors au-delà du seuil — elle est alors enregistrée tout de suite, même si l'onglet est fermé
// ensuite ; ou au retour, par l'écart d'horloge, quand le navigateur a gelé la page
// (téléphone). Au retour, sa durée est complétée et l'apprenant est prévenu.
//
// Ce qui n'est pas une sortie : le sélecteur de fichier natif (photo d'une réponse), en pause
// du clic sur un input[type=file] jusqu'au retour, une minute au plus ; quitter le chapitre
// par un lien (Retour au menu) : la page n'existe plus, rien n'est compté.
//
// Inerte : vue formateur, simulation, entraînement, progression illisible (rien ne peut s'y
// écrire : on ne prétend pas enregistrer), copie rendue, validée ou verrouillée, option non
// figée pour cet apprenant. Limites dites dans l'aide : un second écran, un téléphone, une
// fenêtre posée par-dessus sans qu'on clique dedans ne font pas sortir de la page.
// ============================================================================

const ChapterSortiePage = (() => {

    const MODES = ['exam', 'blind', 'millionnaire'];
    const ID_BANDEAU = 'bandeau-sortie-page';
    const RELEVE_MS = 1000;
    /** Le sélecteur de fichier ouvert ne suspend le décompte qu'une minute. */
    const PAUSE_FICHIER_MS = 60 * 1000;

    let horloge = () => Date.now();
    let armer = (fn, ms) => setTimeout(fn, ms);
    let releve = (fn, ms) => setInterval(fn, ms);

    let actif = false;
    let ecoutesBranchees = false;
    // L'apprenant a-t-il été sur la page au moins une fois ? Un chapitre ouvert dans un onglet
    // d'arrière-plan est « dehors » dès son chargement : il n'y est pas encore ARRIVÉ, ce n'est
    // pas une sortie (constaté le 17/11/2026 dans le navigateur intégré, sans focus au chargement).
    let arrive = false;
    let sortie = null;          // { debut, confirmee, le } : la sortie en cours
    let pauseJusqua = 0;        // sélecteur de fichier ouvert : pas de sortie avant cet instant
    let pauseDepuis = 0;        // le clic qui l'a ouvert
    let pauseEntamee = false;   // la page a bien été dehors pendant la pause
    let avertissementsEnAttente = 0;

    function finirPause() { pauseJusqua = 0; pauseDepuis = 0; pauseEntamee = false; }

    // ------------------------------------------------------------------------
    // DÉCISION
    // ------------------------------------------------------------------------

    function seuil() { return window.Bareme?.SEUIL_SORTIE_PAGE_MS ?? 3000; }

    function chapitre() {
        const S = window.ChapterSession;
        return S?.progress?.chapters?.[S.chapterId] || null;
    }

    function estVueFormateur() {
        const P = window.Parcours;
        return !!(P && typeof P.estVueFormateur === 'function' && P.estVueFormateur());
    }

    function estSimulation() {
        return !!(window.Simulation && typeof Simulation.active === 'function' && Simulation.active());
    }

    function copieFermee(ch) {
        if (['submitted', 'late_submitted', 'validated'].includes(ch?.submissionStatus)) return true;
        return window.currentExamContext?.isChapterLocked === true;
    }

    /** L'option joue-t-elle, maintenant, pour cet apprenant ? */
    function estConcerne() {
        if (estVueFormateur() || estSimulation()) return false;
        const S = window.ChapterSession;
        if (!S || S.entrainement || S.ecritureBloquee) return false;
        const ch = chapitre();
        if (!ch || ch.frozenSortiePage !== true) return false;
        if (!MODES.includes(window.ChapterOrdre?.mode?.() || 'normal')) return false;
        return !copieFermee(ch);
    }

    function estDehors() {
        if (document.hidden) return true;
        return typeof document.hasFocus === 'function' ? !document.hasFocus() : false;
    }

    // ------------------------------------------------------------------------
    // TEXTES
    // ------------------------------------------------------------------------

    // Aucun montant ni aucune durée dans ce qui suit : cf. l'en-tête (« sans montant », seuil
    // jamais annoncé).

    function bilan() {
        const n = Array.isArray(chapitre()?.sortiesPage) ? chapitre().sortiesPage.length : 0;
        return n ? `${n} sortie${n > 1 ? 's' : ''} enregistrée${n > 1 ? 's' : ''}.` : '';
    }

    function regle() {
        return `Quitter la page (autre onglet, autre fenêtre, autre application) est interdit : `
            + `chaque sortie est enregistrée, signalée à votre évaluateur et sanctionnée sur votre note.`;
    }

    function majBandeau() {
        const bandeau = document.getElementById(ID_BANDEAU);
        if (!bandeau) return;
        const deja = bilan();
        bandeau.innerHTML = '🚪 <strong>Ne quittez pas cette page avant d\'avoir rendu votre copie.</strong> '
            + regle() + (deja ? ` <strong>${deja}</strong>` : '');
    }

    /** Les fenêtres du chapitre (_alertModal, _confirmModal) partagent un seul emplacement : en
     *  ouvrir une referme la précédente, et une confirmation de rendu refermée ainsi ne rendrait
     *  jamais la main. On attend donc qu'aucune ne soit ouverte. */
    function quandAucuneFenetre(fn) {
        if (document.getElementById('_native-dialog-overlay')) armer(() => quandAucuneFenetre(fn), 400);
        else fn();
    }

    function fenetre(message) {
        const S = window.ChapterSubmission;
        if (S && typeof S._alertModal === 'function') return S._alertModal(message);
        return Promise.resolve();
    }

    // ------------------------------------------------------------------------
    // ENREGISTREMENT
    // ------------------------------------------------------------------------

    function enregistrer() {
        const pm = window.ProgressManager;
        const S = window.ChapterSession;
        if (!pm || typeof pm.saveProgress !== 'function' || !S?.studentId) return Promise.resolve();
        const signaler = e => console.warn('[Sortie de page] enregistrement :', e?.message || e);
        // Lancé sur-le-champ : l'onglet peut être fermé juste après.
        try {
            return Promise.resolve(pm.saveProgress(S.studentId, S.progress)).catch(signaler);
        } catch (e) {
            signaler(e);
            return Promise.resolve();
        }
    }

    /** Inscrit la sortie en cours dans la copie (sa durée viendra au retour). */
    function confirmer(s) {
        const ch = chapitre();
        if (!ch) return;
        const tentative = window.Bareme ? Bareme.reglesTentatives(ch).tentative : Math.max(1, Number(ch.tentative) || 1);
        s.le = new Date(s.debut).toISOString();
        s.confirmee = true;
        ch.sortiesPage = [...(Array.isArray(ch.sortiesPage) ? ch.sortiesPage : []), { le: s.le, dureeS: null, tentative }];
        console.log(`[Sortie de page] sortie confirmée (tentative n°${tentative})`);
    }

    function retour() {
        const s = sortie;
        sortie = null;
        if (!s) return;
        const ecart = horloge() - s.debut;
        if (!s.confirmee) {
            if (ecart <= seuil() || !estConcerne()) return;
            confirmer(s);
        }
        const ch = chapitre();
        const entree = (ch?.sortiesPage || []).find(e => e && e.le === s.le);
        if (entree) entree.dureeS = Math.round(ecart / 1000);
        majBandeau();
        enregistrer();
        avertissementsEnAttente++;
        const texte = `🚪 Vous avez quitté la page du chapitre.\n\n`
            + `C'est interdit pendant ce chapitre : la sortie a été enregistrée, elle est signalée à votre `
            + `évaluateur et sera sanctionnée sur votre note.\n\n${bilan()}`;
        quandAucuneFenetre(() => {
            // Plusieurs retours avant que l'apprenant ait fermé la fenêtre : une seule, la dernière.
            if (--avertissementsEnAttente > 0) return;
            fenetre(texte);
        });
    }

    /** Appelé par les événements et par le relevé : fait avancer la sortie en cours. */
    function verifier() {
        if (!actif) return 'inactif';
        const maintenant = horloge();
        if (!estDehors()) {
            arrive = true;
            // Le sélecteur s'est refermé (choix fait ou annulé) : la pause est finie. Un clic
            // qui n'a ouvert aucun sélecteur ne laisse pas non plus de pause derrière lui.
            if (pauseJusqua && (pauseEntamee || maintenant - pauseDepuis > 3000)) finirPause();
            if (sortie) { retour(); return 'retour'; }
            return 'present';
        }
        if (maintenant < pauseJusqua) { pauseEntamee = true; return 'pause'; }
        if (pauseJusqua) finirPause();
        if (!sortie) {
            if (!arrive) return 'pas-arrive';
            if (!estConcerne()) return 'present';
            sortie = { debut: maintenant, confirmee: false, le: null };
            return 'depart';
        }
        if (!sortie.confirmee && maintenant - sortie.debut > seuil() && estConcerne()) {
            confirmer(sortie);
            majBandeau();
            enregistrer();
            return 'confirmee';
        }
        return 'dehors';
    }

    // ------------------------------------------------------------------------
    // MISE EN PLACE
    // ------------------------------------------------------------------------

    function brancherEcoutes() {
        if (ecoutesBranchees) return;
        ecoutesBranchees = true;
        window.addEventListener('blur', verifier);
        window.addEventListener('focus', verifier);
        document.addEventListener('visibilitychange', verifier);
        // Le sélecteur de fichier natif prend le focus : ce n'est pas une sortie.
        document.addEventListener('click', (evenement) => {
            const cible = evenement.target;
            if (cible && cible.tagName === 'INPUT' && String(cible.type).toLowerCase() === 'file') {
                pauseDepuis = horloge();
                pauseJusqua = pauseDepuis + PAUSE_FICHIER_MS;
                pauseEntamee = false;
            }
        }, true);
        releve(verifier, RELEVE_MS);
    }

    /** Bandeau en tête du chapitre et fenêtre, comme l'avertissement Millionnaire — après
     *  la fenêtre de celui-ci, s'il en a ouvert une (quandAucuneFenetre). */
    function annoncer() {
        const contenu = document.querySelector('.chapter-content');
        if (contenu && !document.getElementById(ID_BANDEAU)) {
            const bandeau = document.createElement('div');
            bandeau.id = ID_BANDEAU;
            bandeau.className = 'bandeau-nouvelle-tentative';
            contenu.insertBefore(bandeau, contenu.firstChild);
            majBandeau();
        }
        const deja = bilan();
        const message = '🚪 Restez sur cette page jusqu\'au rendu\n\n' + regle()
            + (deja ? `\n\n${deja}` : '');
        quandAucuneFenetre(() => fenetre(message));
    }

    /**
     * À appeler une fois le contexte d'examen posé (initChapterExamContext).
     * @returns {boolean} l'option joue pour cet apprenant
     */
    function init() {
        if (!estConcerne()) return false;
        actif = true;
        brancherEcoutes();
        annoncer();
        verifier();   // l'apprenant est-il déjà là ? (cf. `arrive`)
        console.log('[Sortie de page] option active : sorties enregistrées');
        return true;
    }

    return {
        MODES,
        init,
        verifier,
        estConcerne,
        /** Pour les bancs d'essai : état interne en lecture. */
        etat() {
            return { actif, arrive, sortie: sortie ? { ...sortie } : null, pause: pauseJusqua > horloge() };
        },
        /** Pour les bancs : horloge, minuteur et relevé remplaçables. */
        _configurer({ horloge: h, armer: a, releve: r } = {}) {
            if (typeof h === 'function') horloge = h;
            if (typeof a === 'function') armer = a;
            if (typeof r === 'function') releve = r;
        }
    };
})();

window.ChapterSortiePage = ChapterSortiePage;
