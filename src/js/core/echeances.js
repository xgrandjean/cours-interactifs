// echeances.js — La date limite et la date de rendu d'un chapitre pour un élève, et la phrase
// qui les dit. Une seule source pour l'accueil de l'élève (core/chapterRenderer.js) et les vues
// du formateur (Suivi apprenants, Statistiques, Rendus à corriger, modale de correction) : les
// deux côtés emploient les mêmes mots, et XPro (formulaireProgressionApprenant) les reprend.
//
// Règles (les mêmes que progressManager.dateLimiteDuChapitre et que le journal de XPro) :
//   - date limite : figée dans la progression dès que le chapitre est ouvert (frozenEndDate),
//     sinon la date propre de l'élève (chapter_config.datesEleves[jeton]), sinon celle du
//     chapitre (endDate si dateLimitEnabled) ;
//   - date de rendu : submittedAt (ou validatedAt) d'une copie rendue, en retard ou corrigée ;
//   - en retard : le statut late_submitted fait foi, sinon le rendu après la date limite ;
//   - la date limite ne verrouille rien (getExamContext.js) : passée, elle prévient que le rendu
//     sera en retard.
// Script classique : window.Echeances. À charger après progressManager.js.
(function () {
    const RENDUS = new Set(['submitted', 'late_submitted', 'validated']);
    const valide = d => !!d && !isNaN(new Date(d));

    function dateLimite(pc, config, jeton) {
        if (pc && pc.frozenAt != null) {
            return pc.frozenDateLimitEnabled === true && pc.frozenEndDate ? pc.frozenEndDate : null;
        }
        const d = window.ProgressManager && typeof window.ProgressManager.dateLimiteDuChapitre === 'function'
            ? window.ProgressManager.dateLimiteDuChapitre(config || {}, jeton)
            : { active: !!(config && config.dateLimitEnabled === true), date: (config && config.endDate) || null };
        return d.active && d.date ? d.date : null;
    }

    function estRendu(pc) {
        return !!(pc && RENDUS.has(pc.submissionStatus));
    }

    function dateRendu(pc) {
        return estRendu(pc) ? (pc.submittedAt || pc.validatedAt || null) : null;
    }

    function formaterJour(iso) {
        if (!valide(iso)) return '';
        return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
    }

    function formaterJourHeure(iso) {
        if (!valide(iso)) return '';
        const d = new Date(iso);
        return formaterJour(iso) + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }


    /**
     * La phrase à afficher sous le badge, ou null s'il n'y a rien à dire.
     * @param {object} pc - la progression du chapitre pour cet élève (peut être vide)
     * @param {object} config - le chapitre, fusionné avec chapter_config (dashboard.chapters)
     * @param {string} jeton - l'identifiant de l'élève
     * @param {{ masquerSiRendu?: boolean }} [options] - l'accueil de l'élève ne dit rien une fois rendu
     * @returns {null | { texte, classe, limite, rendu, estRendu, enRetard, depassee }}
     *   texte : la phrase entière — sur l'accueil de l'élève, et au survol du badge côté formateur.
     */
    function decrire(pc, config, jeton, options) {
        const opts = options || {};
        const limite = dateLimite(pc, config, jeton);
        const rendu = dateRendu(pc);
        const rendue = estRendu(pc);
        if (rendue && opts.masquerSiRendu) return null;
        const ou = (texte) => texte || '—';
        let texte, classe, enRetard = false, depassee = false;
        if (rendue) {
            enRetard = pc.submissionStatus === 'late_submitted'
                || (valide(limite) && valide(rendu) && new Date(rendu) > new Date(limite));
            if (enRetard) {
                texte = '⚠️ Rendu en retard le ' + ou(formaterJourHeure(rendu)) + ' (limite le ' + ou(formaterJour(limite)) + ')';
                classe = 'echeance retard';
            } else {
                texte = '📤 Rendu le ' + ou(formaterJourHeure(rendu)) + (valide(limite) ? ' (limite le ' + formaterJour(limite) + ')' : '');
                classe = 'echeance rendue';
            }
        } else if (valide(limite)) {
            depassee = Date.now() > new Date(limite).getTime();
            texte = depassee
                ? '⏰ Date limite dépassée (' + formaterJour(limite) + ') : le rendu sera en retard'
                : '📅 À rendre avant le ' + formaterJourHeure(limite);
            classe = depassee ? 'echeance depassee' : 'echeance';
        } else {
            return null;
        }
        return { texte, classe, limite, rendu, estRendu: rendue, enRetard, depassee };
    }

    window.Echeances = { dateLimite, dateRendu, estRendu, formaterJour, formaterJourHeure, decrire };
})();
