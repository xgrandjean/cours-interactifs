// ============================================================================
// SIMULATION - Tester un chapitre comme un apprenant, sans laisser de trace
// ============================================================================
// Depuis la vue « Gestion des chapitres », l'icône 👁 ouvre le chapitre dans un
// nouvel onglet tel que l'apprenant le verra : le bon mode avec ses règles, l'ordre
// des questions, la pagination, les consignes, la protection copier-coller. Et
// l'interface est VIVANTE : on répond, on valide, on rend, on voit le bilan.
//
// POURQUOI ON ENREGISTRE PUIS ON PURGE, plutôt que de neutraliser le stockage :
//   la persistance ne passe pas par un point unique. Les écritures vont par paires
//   (saveProgress + un storage.set explicite sur la même clé, en cinq endroits), une
//   simple LECTURE alimente le cache localStorage, et la file hors-ligne rejoue plus
//   tard ce qui n'a pas pu partir. Neutraliser tout cela obligerait à faire tourner
//   le code dans des conditions qu'il ne rencontre jamais en vrai — et un simulateur
//   qui simule mal ne sert à rien. On laisse donc le code écrire NORMALEMENT, sous
//   une identité isolée, et on purge.
//
// LA PURGE A LIEU À L'ENTRÉE, pas à la sortie : un onglet fermé brutalement ou un
// réseau coupé emporterait un nettoyage de sortie. Purger au démarrage rend le
// mécanisme auto-réparant — au pire un résidu survit jusqu'à la simulation suivante.
//
// VISIBILITÉ : l'apprenant de simulation est un apprenant ordinaire de users_list.
// Les vues formateur le masquent quand il n'a aucune progression (voir
// estSimulation() / aDesDonnees()). Purgé, il disparaît donc partout ; visible, c'est
// le signe qu'une simulation est en cours ou a été abandonnée en route.
//
// HYPOTHÈSE ASSUMÉE : un seul formateur simule à la fois sur un parcours donné.
// L'authentification formateur étant un mot de passe partagé, deux personnes qui
// simuleraient le même parcours en même temps écriraient dans les mêmes clés.
// ============================================================================

const Simulation = {

    JETON: 'SIMU001',
    NOM:   'Simulation formateur',

    /** Fiche telle qu'elle est inscrite dans users_list du parcours. */
    utilisateur() {
        return {
            id: this.JETON,
            name: this.NOM,
            class: 'Simulation',
            // Un type d'apprenant ordinaire : les vues qui filtrent sur `type` doivent
            // le traiter comme tel, sinon la simulation ne reproduirait pas la réalité.
            // C'est l'indicateur `simulation` qui le distingue, jamais le type.
            type: 'student',
            simulation: true
        };
    },

    /** La page courante tourne-t-elle en simulation ? Jamais mémorisé en session. */
    active() {
        const params = new URLSearchParams(window.location.search);
        return params.get('simulation') === 'true' && params.get('student_id') === this.JETON;
    },

    /**
     * URL d'ouverture. Le jeton voyage dans student_id, comme pour l'aperçu
     * formateur : parcours.js et progressManager le lisent depuis l'URL sans écrire
     * la session de l'onglet, donc rien ne contamine la session du tableau de bord.
     */
    url(slug, chapitreId) {
        const base = (window.BASE || '');
        return `${base}/parcours/src/chapter_template.html`
            + `?parcours=${encodeURIComponent(slug)}`
            + `&chapitre=${encodeURIComponent(chapitreId)}`
            + `&simulation=true&student_id=${this.JETON}`;
    },

    /** Un utilisateur donné est-il l'apprenant de simulation ? */
    estSimulation(utilisateur) {
        if (!utilisateur) return false;
        return utilisateur.simulation === true || utilisateur.id === this.JETON;
    },

    /**
     * Y a-t-il quelque chose à montrer ? Le critère est l'ACTIVITÉ, pas l'existence
     * de la progression : ouvrir un chapitre en simulation en crée toujours une, vide.
     * Sans cette nuance, l'apprenant de simulation resterait visible à jamais après
     * la première simulation, alors qu'il n'a rien fait.
     */
    aDesDonnees(progression) {
        const chapitres = Object.values(progression?.chapters || {});
        return chapitres.some(chapitre =>
            (chapitre?.submissionStatus && chapitre.submissionStatus !== 'not_submitted') ||
            Object.values(chapitre?.questions || {}).some(q => q?.answered)
        );
    },

    // ------------------------------------------------------------------------
    // INSCRIPTION
    // ------------------------------------------------------------------------

    /**
     * Inscrit l'apprenant de simulation dans users_list s'il en est absent.
     * Il doit y figurer pour que tout le traite comme un apprenant : la modale de
     * correction le cherche par son identifiant, le tableau de bord parcourt cette
     * liste. Idempotent.
     */
    async assurerUtilisateur(slug) {
        if (!slug) return null;
        const cle = `${slug}:teacher:users_list`;

        try {
            const utilisateurs = await storage.get(cle) || [];
            const existant = utilisateurs.find(u => u.id === this.JETON);
            if (existant) return existant;

            const fiche = this.utilisateur();
            utilisateurs.push(fiche);
            await storage.set(cle, utilisateurs);
            return fiche;
        } catch (e) {
            console.warn('[Simulation] Inscription impossible :', e.message);
            return this.utilisateur();
        }
    },

    // ------------------------------------------------------------------------
    // PURGE
    // ------------------------------------------------------------------------

    /**
     * Efface toute trace de la simulation sur un parcours.
     *
     * Le périmètre est plus large que la seule progression :
     *   - tout le préfixe apprenant `{slug}:{JETON}:` ;
     *   - les clés hybrides possibles si les deux identités de la page divergent
     *     (le préfixe vient de Parcours.token, le nom de clé de getCurrentStudentId) ;
     *   - les AR du mode Atelier, `{slug}:atelier:ar_{JETON}_…` ;
     *   - les tickets du mode Atelier, `{slug}:atelier:code_…` — leur clé ne porte PAS
     *     le jeton, il faut donc lire chaque ticket pour savoir à qui il appartient ;
     *   - les opérations encore en file de synchronisation visant ces clés, sinon
     *     elles ressusciteraient les données au prochain chargement.
     *
     * Le cache localStorage est traité par storage.remove(), qui l'efface lui-même.
     *
     * @returns {Promise<number>} nombre de clés supprimées
     */
    async purger(slug) {
        if (!slug) return 0;

        const prefixeApprenant = `${slug}:${this.JETON}:`;
        const prefixeAr        = `${slug}:atelier:ar_${this.JETON}_`;
        const prefixeTickets   = `${slug}:atelier:code_`;
        const cleProgression   = `${prefixeApprenant}student_${this.JETON}_progress`;

        const aSupprimer = new Set();

        // ── 1. Clés connues d'avance ────────────────────────────────────────
        // Aucune dépendance à l'énumération : storage.keys() n'est pas garanti par
        // tous les backends, et une purge qui en dépend échoue en silence.
        aSupprimer.add(cleProgression);
        ['courseProgress', 'course_progress', 'userAnswers', 'question_attempts']
            .forEach(nom => aSupprimer.add(prefixeApprenant + nom));

        // ── 2. Clés que seule la progression permet de retrouver ────────────
        // Le ticket du mode Atelier porte un code aléatoire : sa clé est indevinable,
        // mais le code est stocké dans la question. On lit donc la progression AVANT
        // de la supprimer, sinon ces clés resteraient orphelines pour toujours.
        try {
            const progression = await storage.get(cleProgression);
            for (const [chapitreId, chapitre] of Object.entries(progression?.chapters || {})) {
                for (const [questionId, question] of Object.entries(chapitre?.questions || {})) {
                    if (question?.codeValidation) {
                        aSupprimer.add(prefixeTickets + question.codeValidation);
                    }
                    if (question?.arHash || question?.arCode || question?.arEmisAt) {
                        aSupprimer.add(`${prefixeAr}${chapitreId}_${questionId}`);
                    }
                }
            }
        } catch (_) { /* pas de progression : rien à retrouver */ }

        // ── 3. Balayage complémentaire, si le backend sait énumérer ─────────
        // Filet pour les résidus d'une version antérieure ou d'un chemin oublié.
        try {
            const cles = await storage.keys() || [];
            cles.filter(cle =>
                cle.startsWith(prefixeApprenant) ||
                cle.startsWith(prefixeAr) ||
                // Clés hybrides : `{slug}:_guest:student_{JETON}_progress` et voisines
                (cle.startsWith(`${slug}:`) && cle.includes(`student_${this.JETON}_progress`))
            ).forEach(cle => aSupprimer.add(cle));

            // Tickets restants : seul le contenu dit à qui ils appartiennent.
            for (const cle of cles.filter(c => c.startsWith(prefixeTickets))) {
                if (aSupprimer.has(cle)) continue;
                try {
                    const ticket = await storage.get(cle);
                    if (ticket && ticket.token === this.JETON) aSupprimer.add(cle);
                } catch (_) { /* ticket illisible : on le laisse */ }
            }
        } catch (e) {
            console.warn('[Simulation] Énumération des clés indisponible, purge limitée aux clés connues :', e.message);
        }

        for (const cle of aSupprimer) {
            try { await storage.remove(cle); } catch (_) { /* déjà absent */ }
        }

        // La file de synchronisation en dernier : storage.remove() peut y avoir mis
        // ses propres opérations de suppression, inutiles puisque la donnée s'en va.
        const enFile = window.SyncManager
            ? SyncManager.dropQueued(cle =>
                  cle.startsWith(prefixeApprenant) ||
                  cle.startsWith(prefixeAr) ||
                  cle.startsWith(prefixeTickets) ||
                  cle.includes(`student_${this.JETON}_progress`))
            : 0;

        if (aSupprimer.size || enFile) {
            console.log(`[Simulation] Purge : ${aSupprimer.size} clé(s) visée(s), ${enFile} opération(s) retirée(s) de la file`);
        }
        return aSupprimer.size;
    },

    // ------------------------------------------------------------------------
    // BANDEAU
    // ------------------------------------------------------------------------

    /** Rappel permanent : ce qui se passe ici ne compte pas. */
    afficherBandeau() {
        if (document.getElementById('bandeau-simulation')) return;

        const bandeau = document.createElement('div');
        bandeau.id = 'bandeau-simulation';
        bandeau.className = 'bandeau-simulation';
        bandeau.innerHTML =
            '👁 <strong>Simulation</strong> — vous voyez ce chapitre comme un apprenant. ' +
            'Vos réponses sont enregistrées pour que tout se comporte normalement, ' +
            'puis effacées au lancement de la prochaine simulation. ' +
            '<button type="button" id="fermer-simulation">Fermer</button>';
        document.body.prepend(bandeau);

        document.getElementById('fermer-simulation')
            ?.addEventListener('click', () => window.close());

        // L'onglet de simulation est autonome : « Retour au menu » renverrait vers la
        // page d'accueil du parcours, qui exige une session élève et redirigerait donc
        // le formateur vers la connexion. On masque ces boutons plutôt que de le laisser
        // tomber dans une impasse.
        //
        // ⚠️ MASQUER, jamais supprimer : le script du template branche ensuite
        //    #back-to-menu.onclick sans vérifier sa présence. Retirer le nœud faisait
        //    planter ce script — et le plantage survenait AVANT initChapterPage(),
        //    donc la page entière restait non initialisée.
        const nav = document.querySelector('.chapter-nav');
        if (nav) nav.style.display = 'none';
    }
};

window.Simulation = Simulation;
