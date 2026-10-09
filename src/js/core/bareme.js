/**
 * bareme.js — Le barème des questions auto-corrigées
 * ============================================================================
 *
 * SOURCE UNIQUE de la pénalité d'essais. Elle existait en quatre exemplaires
 * (chapterBilan ×2, correctionModal, progressManager), avec deux comportements
 * différents et un seul garde-fou sur trois — c'est cette absence de garde-fou qui
 * faisait afficher « NaN sur 20 » à l'apprenant.
 *
 * À QUOI SERT CETTE PÉNALITÉ
 * --------------------------
 * À dissuader la réponse au hasard. Sans elle, un apprenant qui coche n'importe quoi
 * et réessaie finit par tomber juste, et repart avec des points qu'il n'a pas gagnés.
 *
 * LA CALIBRATION, ET POURQUOI ELLE DÉPEND DU NOMBRE D'OPTIONS
 * -----------------------------------------------------------
 * Deviner est d'autant plus facile qu'il y a peu de choix. La pénalité doit donc être
 * d'autant plus forte. On la fixe à :
 *
 *      pénalité par essai raté = 2 × points / (options − 1)
 *
 * Ce qui annule l'espérance de gain d'un apprenant qui répond au hasard, quel que soit
 * le nombre d'options — en supposant qu'il ne réessaie pas une réponse déjà rejetée :
 *
 *      options   pénalité/essai   scores successifs        espérance
 *         2       2 × points      +p, −p                       0
 *         3         points        +p, 0, −p                    0   ← calibration historique
 *         4       ⅔ × points      +p, +⅓p, −⅓p, −p             0
 *         5       ½ × points      +p, +½p, 0, −½p, −p          0
 *
 * La formule d'avant était celle de la ligne « 3 » appliquée à tout. Elle était donc
 * juste sur les questions à trois choix, et laissait exactement la moitié des points au
 * hasard sur un vrai/faux — le cas le plus courant. Le présent module généralise, il ne
 * remplace pas : à trois options, les valeurs sont rigoureusement identiques.
 *
 * DEUX RÉSERVES ASSUMÉES
 * ----------------------
 * • Sur un QCM à réponses multiples, deviner est bien plus difficile que 1/options :
 *   la pénalité y est donc trop douce. C'est le sens qui protège l'apprenant.
 * • Une question sans options — texte court auto ou semi — prend la calibration
 *   historique. On ne répond pas au hasard à une question ouverte.
 *
 * CE QUE CE MODULE NE DÉCIDE PAS
 * ------------------------------
 * Le plancher du CUMUL. Une question peut valoir des points négatifs, mais le total des
 * questions auto ne descend jamais sous 0 — un mauvais résultat sur les QCM ne vient
 * pas manger les points gagnés ailleurs. Cette règle appartient à celui qui somme, et
 * tous ne l'appliquent pas de la même façon :
 *
 *   chapterBilan       plancher sur le CUMUL des questions auto, les deux bornes
 *   correctionModal    plancher sur le cumul, par catégorie (auto d'un côté, manuel de l'autre)
 *   showBlindBilan     plancher PAR QUESTION — et ce n'est pas un écart, c'est la
 *                      conséquence d'une règle propre au mode Blind : une question auto
 *                      ratée ou non répondue y vaut 0, jamais −points. On n'y punit pas
 *                      une erreur commise sans aucun retour. Sans malus, il n'y a aucun
 *                      négatif à absorber, donc aucun plancher cumulatif à poser.
 *
 * Texte destiné au formateur : fiche « bareme » de `src/js/aide.js`.
 */

(function () {
    'use strict';

    const OPTIONS_PAR_DEFAUT = 3;    // la calibration historique
    const MULTIPLICATEUR_PLANCHER = 2;

    window.Bareme = {

        OPTIONS_PAR_DEFAUT,
        MULTIPLICATEUR_PLANCHER,

        /**
         * Nombre de choix proposés par une question, ou null si la notion n'a pas de sens
         * (texte court, question ouverte). `options` est un tableau dans cours.json.
         */
        nbOptions(question) {
            return Array.isArray(question?.options) ? question.options.length : null;
        },

        /**
         * Points d'une question auto RÉUSSIE, après pénalité d'essais.
         *
         * @param {number} points     barème de la question
         * @param {number} essais     nombre de tentatives ; absent ou incohérent → 1,
         *                            car c'est ici, et nulle part ailleurs, que se tient
         *                            le garde-fou contre le NaN
         * @param {number|null} nbOptions  null → calibration historique (3)
         */
        pointsAuto(points, essais, nbOptions) {
            const bareme = Number(points) || 0;
            const tentatives = Math.max(1, Math.round(Number(essais) || 1));
            // Deux options au minimum : à une seule, il n'y a rien à deviner et la
            // division n'aurait pas de sens.
            const choix = Math.max(2, Math.round(Number(nbOptions) || OPTIONS_PAR_DEFAUT));

            const penaliteParEssai = (2 * bareme) / (choix - 1);
            const brut = bareme - (tentatives - 1) * penaliteParEssai;

            const plancher = -MULTIPLICATEUR_PLANCHER * bareme;
            // Arrondi au centième : 2/3 de point produirait sinon des 1.6666666666666667
            // jusque dans les totaux affichés.
            return Math.round(Math.max(plancher, brut) * 100) / 100;
        },

        /** Ce que coûte un essai raté, pour l'expliquer au formateur. */
        penaliteParEssai(points, nbOptions) {
            const bareme = Number(points) || 0;
            const choix = Math.max(2, Math.round(Number(nbOptions) || OPTIONS_PAR_DEFAUT));
            return Math.round(((2 * bareme) / (choix - 1)) * 100) / 100;
        },

        // ====================================================================
        // PÉNALITÉ PAR TENTATIVE (modes Blind et Millionnaire)
        // ====================================================================
        //
        // Une autre pénalité que celle des essais : elle porte sur la NOTE SUR 20 du
        // chapitre, pas sur les points d'une question. Chaque nouvelle tentative (un
        // « Recommencer ») coûte `penalite` points sur 20 par rang : la tentative n°n
        // perd (n − 1) × penalite.
        //
        // LE PLANCHER EST UN FILET, ET IL SE GAGNE. Tant qu'aucune tentative antérieure n'a
        // atteint `plancher`, il ne protège rien : la règle du chapitre (dernière ou
        // meilleure) joue seule. Dès qu'une tentative de rang inférieur a atteint le
        // plancher (note BRUTE ≥ plancher), il est acquis : toute tentative suivante vaut
        // au moins `plancher` — que la pénalité l'eût fait descendre dessous, ou que la
        // tentative ait simplement été moins bonne (une note relevée, donc).
        //
        //      14/20, 3e tentative, 1 pt, plancher 10, 1re à 6 →  12   (pas de filet : 14 − 2)
        //      14/20, 7e tentative, une tentative ≥ 10 avant   →  10   (et pas 8)
        //       5/20, 2e tentative, 1re à 18, « dernière »      →  10   (le filet relève)
        //       5/20, 2e tentative, 1re à  6, « dernière »      →   4   (rien d'acquis : 5 − 1)
        //
        // Le filet vaut quelle que soit la pénalité (même 0) ; `plancher` à 0 le désactive.
        //
        // Les réglages sont figés sur la progression de l'apprenant à son premier
        // démarrage (frozenPenaliteTentative, frozenNotePlancher, frozenNoteRetenue —
        // progressManager.js), comme le mode : c'est aussi ce qui les rend lisibles par
        // le modal de correction et par XSpro, qui ne voient pas chapter_config.
        // `chapter.tentative` est le numéro de la tentative en cours (absent = 1) ; il ne
        // dépasse 1 qu'en Blind et en Millionnaire, d'où l'absence de test de mode ici.
        //
        // À LA CORRECTION, la formule de la note ne change pas (points → /20 → arrondi →
        // bonus/pénalité → borne 0..20) : l'effet des tentatives est PROPOSÉ dans le
        // bonus/pénalité, comme la pénalité de cours, avec son explication dans
        // l'appréciation (correctionModal.penaliteAutomatique) — le formateur le voit et le
        // modifie. Les bilans de l'apprenant, avant correction, l'appliquent directement,
        // entre l'arrondi et la pénalité de cours : même résultat.
        //
        // XSpro en porte une copie (formulaireProgressionApprenant.js) : la modifier avec.

        DEFAUT_PENALITE_TENTATIVE: 1,
        DEFAUT_NOTE_PLANCHER: 10,

        /** Réglages effectifs d'un chapitre : valeurs figées, ou défauts. */
        reglesTentatives(chapter) {
            const nombre = (valeur, defaut) =>
                (valeur === null || valeur === undefined || valeur === '' || !Number.isFinite(Number(valeur)))
                    ? defaut : Number(valeur);
            return {
                tentative: Math.max(1, Math.round(nombre(chapter?.tentative, 1))),
                penalite:  Math.max(0, nombre(chapter?.frozenPenaliteTentative, this.DEFAUT_PENALITE_TENTATIVE)),
                plancher:  nombre(chapter?.frozenNotePlancher, this.DEFAUT_NOTE_PLANCHER),
                retenue:   chapter?.frozenNoteRetenue === 'meilleure' ? 'meilleure' : 'derniere'
            };
        },

        /**
         * Note sur 20 d'une tentative de rang `tentative`, pénalité et filet compris.
         * @param {boolean} plancherActif  une tentative de rang inférieur a atteint le
         *                                 plancher : il est acquis (cf. l'en-tête du bloc)
         * @returns {{note: number, retrait: number}}  `retrait` est négatif quand le filet
         *                                 relève la note au-dessus de sa valeur brute
         */
        penaliserTentative(note, tentative, regles, plancherActif = false) {
            const brute = Number(note) || 0;
            const n = Math.max(1, Math.round(Number(tentative) || 1)) - 1;
            const apres = brute - regles.penalite * n;
            const finale = plancherActif ? Math.max(regles.plancher, apres) : Math.max(0, apres);
            return {
                note: Math.round(finale * 10) / 10,
                retrait: Math.round((brute - finale) * 10) / 10
            };
        },

        /**
         * Note chaque tentative, dans l'ordre des rangs, en suivant l'acquisition du
         * plancher : `[{ tentative, note }]` (notes brutes sur 20) devient
         * `[{ tentative, noteBrute, note, retrait, plancherActif }]`, trié par rang.
         * C'est ici, et nulle part ailleurs, que se décide si le filet joue : il ne se lit
         * que sur les tentatives de rang INFÉRIEUR, jamais sur la tentative elle-même.
         */
        noterTentatives(candidates, chapter) {
            const regles = this.reglesTentatives(chapter);
            let atteint = false;
            return [...(candidates || [])]
                .sort((a, b) => a.tentative - b.tentative)
                .map(c => {
                    const noteBrute = Number(c.note) || 0;
                    const p = this.penaliserTentative(noteBrute, c.tentative, regles, atteint);
                    const ligne = { tentative: c.tentative, noteBrute, note: p.note, retrait: p.retrait, plancherActif: atteint };
                    if (noteBrute >= regles.plancher) atteint = true;
                    return ligne;
                });
        },

        /** Une tentative parmi `candidates` (notes brutes sur 20) a-t-elle atteint le plancher ? */
        plancherAcquis(candidates, chapter) {
            const { plancher } = this.reglesTentatives(chapter);
            return (candidates || []).some(c => (Number(c.note) || 0) >= plancher);
        },

        /**
         * La meilleure note qu'une tentative SUIVANTE peut encore atteindre : 20/20
         * pénalisé du rang suivant. Sert à dire à l'apprenant quand recommencer ne peut
         * plus rien lui apporter. `plancherActif` : le plancher est déjà acquis (voir
         * `plancherAcquis`) — sans lui, la pénalité seule joue.
         */
        meilleurePossible(chapter, plancherActif = false) {
            const regles = this.reglesTentatives(chapter);
            return this.penaliserTentative(20, regles.tentative + 1, regles, plancherActif).note;
        },

        /**
         * Choisit la tentative retenue parmi des candidates déjà notées sur 20, AVANT
         * pénalité : `[{ tentative, note }]`. Chacune est notée selon son rang et
         * l'acquisition du plancher (noterTentatives), puis on garde la dernière (défaut)
         * ou la meilleure, selon le réglage du chapitre.
         * @returns {{note: number, retrait: number, tentative: number, noteBrute: number, plancherActif: boolean}}
         */
        retenirTentative(candidates, chapter) {
            const regles = this.reglesTentatives(chapter);
            const notees = this.noterTentatives(candidates, chapter);
            if (!notees.length) return { note: 0, retrait: 0, tentative: regles.tentative, noteBrute: 0, plancherActif: false };
            if (regles.retenue === 'meilleure') {
                // À note égale, la plus récente : c'est elle que le formateur a sous les yeux.
                return notees.reduce((m, c) => (c.note >= m.note ? c : m));
            }
            return notees[notees.length - 1];
        }
    };
})();
