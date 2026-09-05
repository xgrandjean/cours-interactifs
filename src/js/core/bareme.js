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
        }
    };
})();
