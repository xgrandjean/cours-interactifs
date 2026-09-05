/**
 * qrCharge.js — Le format de la charge portée par le QRCode de question
 * ============================================================================
 *
 * Ce module est la SOURCE UNIQUE DE VÉRITÉ du format. Il est chargé des deux côtés :
 * par la page chapitre, qui l'écrit dans le QRCode (`qrQuestion.js`), et par l'outil
 * formateur, qui le lit (`atelier/suiviAtelier.js`). Deux implémentations séparées
 * dériveraient tôt ou tard, et la charge est imprimée sur tous les écrans : on ne
 * pourrait plus la changer sans les réimprimer tous.
 *
 *      XSQ1|{slug}|{empreinte}|{chapitreId}|{questionId}
 *
 *   XSQ1        marqueur et version. Tout ce qui ne commence pas par là est refusé ;
 *               le 1 permettra d'en changer plus tard sans ambiguïté.
 *   |           séparateur. Surtout pas « _ » : les identifiants sont des horodatages
 *               préfixés (_1779826730874) qui en contiennent déjà.
 *   empreinte   SHA-256 de « slug:token » tronqué à 12 caractères hexadécimaux — et
 *               NON le token, qui est l'identifiant de connexion de l'apprenant. On ne
 *               le publie pas en lisible-machine sur tous les écrans de la salle.
 *               Se résout par balayage de {slug}:teacher:users_list, liste que l'outil
 *               formateur possède déjà. 12 hex = 48 bits, aucune collision à l'échelle
 *               d'un établissement.
 *
 * Documentation complète : « qrcode question.md ».
 */

(function () {
    'use strict';

    const PREFIXE = 'XSQ1';
    const SEPARATEUR = '|';
    const NB_SEGMENTS = 5;
    const LONGUEUR_EMPREINTE = 12;

    const QRCharge = {

        PREFIXE,
        LONGUEUR_EMPREINTE,

        /**
         * Empreinte d'un apprenant dans un parcours. Portée par le QRCode à la place du
         * token. S'appuie sur AtelierCodes.condensat() — SHA-256 via crypto.subtle, déjà
         * éprouvé sur GitHub Pages, en local et en Electron sur file:.
         */
        async empreinte(slug, token) {
            if (!window.AtelierCodes?.condensat) return null;
            const condensat = await AtelierCodes.condensat(`${slug}:${token}`);
            return condensat.slice(0, LONGUEUR_EMPREINTE);
        },

        construire(slug, empreinte, chapitreId, questionId) {
            return [PREFIXE, slug, empreinte, chapitreId, questionId].join(SEPARATEUR);
        },

        /**
         * Relit une charge. Retourne null sur tout ce qui n'est pas exactement du format
         * attendu — un QRCode quelconque, un code Atelier, un collage approximatif.
         */
        lire(chaine) {
            const segments = String(chaine || '').trim().split(SEPARATEUR);
            if (segments.length !== NB_SEGMENTS) return null;

            const [prefixe, slug, empreinte, chapitreId, questionId] = segments;
            if (prefixe !== PREFIXE) return null;
            if (!slug || !empreinte || !chapitreId || !questionId) return null;

            return { slug, empreinte, chapitreId, questionId };
        },

        /**
         * Retrouve le token derrière une empreinte, en la recalculant pour chaque
         * apprenant du parcours. Une liste de classe se parcourt en quelques
         * millisecondes ; il n'y a pas d'index à tenir, donc rien à maintenir à jour.
         *
         * @param {Array} apprenants  contenu de {slug}:teacher:users_list
         */
        async resoudre(slug, empreinte, apprenants) {
            for (const apprenant of (apprenants || [])) {
                if (!apprenant?.id) continue;
                if (await this.empreinte(slug, apprenant.id) === empreinte) return apprenant.id;
            }
            return null;
        }
    };

    window.QRCharge = QRCharge;
})();
