// ============================================================================
// CHAPTER ENTRAINEMENT — Rejouer un chapitre corrigé, sans rien écrire (21/10/2026)
// ============================================================================
// Demande des apprenants : une fois la correction publiée, le chapitre est figé (on voit le
// corrigé, on ne peut plus répondre). « 🔁 S'entraîner » rouvre la page avec ?entrainement=1 :
// le chapitre est refait à blanc, sur TOUTES ses questions (le tirage de la copie n'y est pas
// appliqué), en style examen (réponses retenues sans retour), et « 🏁 Terminer l'entraînement »
// donne la note sur 20 des questions auto-corrigées, juste/faux et bonne réponse.
//
// RIEN n'est écrit : ni la progression (saveProgress rend la main tant que
// ChapterSession.entrainement est posé), ni cours.json, ni chapter_config. La page travaille sur
// un CLONE de la progression, vidé de ses réponses ; la copie corrigée et sa note restent
// intactes, « Voir le corrigé » les montre toujours.
//
// Proposé seulement si : correction publiée (submissionStatus « validated »), mode Découverte,
// Examen, Blind ou Millionnaire, au moins une question auto ou semi-corrigée, hors vue formateur.
// Décisions de l'utilisateur du 21/10/2026.
//
// Chargé par la page de chapitre (chapter_template.html) et par la liste des chapitres
// (user.html, bouton de la carte) : rien ne s'exécute au chargement.
// ============================================================================

(function () {
    'use strict';

    const PARAMETRE = 'entrainement';
    const MODES = ['normal', 'exam', 'blind', 'millionnaire'];
    const NOTEES = ['auto', 'semi'];

    // ------------------------------------------------------------------------
    // DÉCISION (fonctions pures)
    // ------------------------------------------------------------------------

    /** L'URL demande-t-elle un entraînement ? */
    function demande(search) {
        try {
            const chaine = search !== undefined ? search : window.location.search;
            return new URLSearchParams(chaine).get(PARAMETRE) === '1';
        } catch (_) {
            return false;
        }
    }

    /** Mode de la copie : figé au premier démarrage, sinon celui de la config. */
    function modeDuChapitre(chapitre, config) {
        if (chapitre && chapitre.frozenAt != null && chapitre.frozenChapterMode) return chapitre.frozenChapterMode;
        return (config && config.chapterMode) || (config && config.examMode ? 'exam' : 'normal');
    }

    /**
     * L'entraînement est-il proposé pour ce chapitre ?
     * @param {Object} chapitre  entrée de la progression (chapters[id])
     * @param {Object} config    configuration du chapitre (cours.json + chapter_config)
     * @param {Object} [options] { vueFormateur }
     */
    function estDisponible(chapitre, config, options = {}) {
        if (options.vueFormateur) return false;
        if (!chapitre || chapitre.submissionStatus !== 'validated') return false;
        if (!MODES.includes(modeDuChapitre(chapitre, config))) return false;
        const questions = (config && Array.isArray(config.questions)) ? config.questions : [];
        return questions.some(q => NOTEES.includes(q && q.correctionType));
    }

    /**
     * Le clone de la progression sur lequel la page travaille : le chapitre courant y est vidé
     * de ses réponses (les validations de cours restent), sans tirage (toutes les questions), sans
     * statut de rendu ni tentatives. L'objet reçu n'est jamais modifié.
     */
    function progressionVierge(progression, chapterId) {
        const copie = JSON.parse(JSON.stringify(progression || { chapters: {} }));
        const chapitre = copie.chapters && copie.chapters[chapterId];
        if (!chapitre) return copie;
        const cours = {};
        Object.entries(chapitre.questions || {}).forEach(([id, donnees]) => {
            if (String(id).startsWith('course_')) cours[id] = donnees;
        });
        chapitre.questions = cours;
        chapitre.questionsTirees = null;
        chapitre.submissionStatus = 'not_submitted';
        delete chapitre.tentativesPassees;
        delete chapitre.tentative;
        delete chapitre.coursePenalty;
        return copie;
    }

    /**
     * Note de l'entraînement : sur les questions auto et semi-corrigées seulement, les autres
     * (correction manuelle) sont « non notées ».
     * @param {Array<{id, correctionType, points, etat}>} resultats  etat : typeState de QuestionEngine
     * @returns {{ obtenus, total, sur20, details }}
     */
    function noter(resultats) {
        let obtenus = 0;
        let total = 0;
        const details = (resultats || []).map(r => {
            const notee = NOTEES.includes(r.correctionType);
            const points = Number(r.points) || 0;
            const juste = notee && r.etat === 'correct';
            if (notee) {
                total += points;
                if (juste) obtenus += points;
            }
            return { ...r, notee, juste, gagne: juste ? points : 0 };
        });
        const sur20 = total > 0 ? Math.round((obtenus / total) * 200) / 10 : null;
        return { obtenus, total, sur20, details };
    }

    /** Adresse de la page du chapitre en entraînement (liste des chapitres, page corrigée). */
    function url(chapterId) {
        const slug = window.Parcours ? Parcours.slug : (window.currentParcoursSlug || '');
        return (window.BASE || '') + '/parcours/src/chapter_template.html?parcours=' + encodeURIComponent(slug)
            + '&chapitre=' + encodeURIComponent(chapterId) + '&' + PARAMETRE + '=1&t=' + Date.now();
    }

    /** La même page, sans entraînement. */
    function urlSansEntrainement() {
        const params = new URLSearchParams(window.location.search);
        params.delete(PARAMETRE);
        params.set('t', String(Date.now()));
        return window.location.pathname + '?' + params.toString();
    }

    // ------------------------------------------------------------------------
    // PAGE DU CHAPITRE
    // ------------------------------------------------------------------------

    /**
     * Bascule la page en entraînement, juste après initProgression (chapitre.js). Le contexte
     * d'examen est recalculé sur le clone, puis déverrouillé : le verrou du formateur protège
     * la copie, et l'entraînement n'écrit rien.
     */
    function demarrer() {
        const pm = window.ProgressManager || {};
        const chapterId = ChapterSession.chapterId;
        ChapterSession.entrainement = true;
        ChapterSession.progress = progressionVierge(ChapterSession.progress, chapterId);
        if (pm.ensureChapterInitialized && window.chaptersIndex) {
            pm.ensureChapterInitialized(ChapterSession.progress, window.chaptersIndex);
        }
        const contexte = window.initChapterExamContext
            ? window.initChapterExamContext(ChapterSession.progress.chapters[chapterId])
            : window.currentExamContext;
        if (contexte) {
            contexte.isManuallyLocked = false;
            contexte.isTeacherLocked = false;
            contexte.isChapterLocked = false;
        }
        document.body.classList.add('mode-entrainement');
        console.log('[Entraînement] chapitre à blanc, aucune écriture');
    }

    /** Après initCallbacks : réponses retenues sans retour, comme en examen. */
    function preparerPage() {
        const editeur = window.studentWorkEditor;
        if (editeur) {
            editeur.examMode = true;
            editeur.blindMode = false;
            editeur.millionnaireMode = false;
            editeur.locked = false;
        }
        afficherBandeau();
    }

    function afficherBandeau() {
        const zone = document.querySelector('.chapter-content');
        if (!zone || document.getElementById('bandeau-entrainement')) return;
        const bandeau = document.createElement('div');
        bandeau.id = 'bandeau-entrainement';
        bandeau.className = 'bandeau-entrainement';
        bandeau.innerHTML = '🔁 <strong>Entraînement</strong> — le chapitre est à blanc et rien n\'est enregistré : '
            + 'ta copie corrigée et ta note ne changent pas. Réponds, puis « 🏁 Terminer l\'entraînement » '
            + 'pour voir ton résultat. <a href="' + urlSansEntrainement() + '">Quitter l\'entraînement</a>';
        zone.insertBefore(bandeau, zone.firstChild);
    }

    /** Le bouton de rendu devient « Terminer l'entraînement » (ChapterUI.updateSubmitButton). */
    function boutonTerminer(bouton) {
        if (!bouton) return;
        bouton.innerHTML = '🏁 Terminer l\'entraînement';
        bouton.className = 'btn btn-primary';
        bouton.disabled = false;
        bouton.style.display = 'block';
        bouton.onclick = terminer;
    }

    /** Lit les réponses de la page (dans l'ordre affiché) et les évalue. */
    function lireResultats() {
        const moteur = (typeof QuestionEngine !== 'undefined') ? QuestionEngine : null;
        return [...document.querySelectorAll('.question-section[data-question-id]')].map(section => {
            const evaluation = moteur ? moteur.evaluate(section) : { typeState: 'empty', userAnswer: null };
            return {
                id: section.dataset.questionId,
                correctionType: section.dataset.correctionType || 'auto',
                points: +section.dataset.points || 0,
                etat: evaluation.typeState,
                reponse: evaluation.userAnswer,
            };
        });
    }

    function terminer() {
        const bilan = noter(lireResultats());
        afficherResultat(bilan);
    }

    // ------------------------------------------------------------------------
    // RÉSULTAT
    // ------------------------------------------------------------------------

    function echapper(texte) {
        return String(texte ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function questionPubliee(id) {
        const questions = window.currentChapterConfig?.questions || [];
        return questions.find(q => String(q.id) === String(id)) || null;
    }

    /** Une réponse en clair : libellé d'option pour un QCM, texte sinon (comme le corrigé). */
    function enClair(q, valeur) {
        if (valeur === null || valeur === undefined || valeur === '' || (Array.isArray(valeur) && !valeur.length)) return '';
        const options = q && Array.isArray(q.options) ? q.options : null;
        if (Array.isArray(valeur)) return valeur.map(v => (options && options[v] !== undefined) ? options[v] : v).join(', ');
        if (options && options[parseInt(valeur, 10)] !== undefined && /^\d+$/.test(String(valeur))) return options[parseInt(valeur, 10)];
        return String(valeur);
    }

    function reponseAttendue(q) {
        if (!q || q.correctAnswers === undefined || q.correctAnswers === null) return '';
        if (Array.isArray(q.options)) {
            return Array.isArray(q.correctAnswers)
                ? q.correctAnswers.map(i => q.options[i]).join(' & ')
                : (q.options[q.correctAnswers] ?? '');
        }
        return Array.isArray(q.correctAnswers) ? q.correctAnswers.join(' ou ') : String(q.correctAnswers);
    }

    function ligneQuestion(detail, rang) {
        const q = questionPubliee(detail.id);
        const titre = echapper((q && q.title) || ('Question ' + rang));
        const repondu = enClair(q, detail.reponse);
        let pastille;
        let classe;
        if (!detail.notee) {
            pastille = 'non notée';
            classe = 'neutre';
        } else if (detail.juste) {
            pastille = '✓ ' + detail.gagne + ' / ' + detail.points;
            classe = 'juste';
        } else {
            pastille = '✗ 0 / ' + detail.points;
            classe = 'faux';
        }
        const attendue = detail.notee && !detail.juste ? reponseAttendue(q) : '';
        const explication = q && q.explicationHtml && detail.notee && !detail.juste
            ? '<div class="entrainement-explication">' + q.explicationHtml + '</div>' : '';
        return '<div class="entrainement-ligne ' + classe + '">'
            + '<div class="entrainement-ligne-tete"><span>' + rang + '. ' + titre + '</span>'
            + '<span class="entrainement-pastille ' + classe + '">' + echapper(pastille) + '</span></div>'
            + '<div class="entrainement-rep">Ta réponse : ' + (repondu ? echapper(repondu) : '<em>pas de réponse</em>') + '</div>'
            + (attendue ? '<div class="entrainement-rep attendue">Réponse attendue : ' + echapper(attendue) + '</div>' : '')
            + (!detail.notee ? '<div class="entrainement-rep"><em>Correction manuelle : non notée en entraînement.</em></div>' : '')
            + explication
            + '</div>';
    }

    function afficherResultat(bilan) {
        document.getElementById('entrainement-resultat')?.remove();
        const note = bilan.sur20 === null ? '—' : String(bilan.sur20).replace('.', ',');
        const fond = document.createElement('div');
        fond.id = 'entrainement-resultat';
        fond.className = 'entrainement-fond';
        fond.innerHTML = '<div class="entrainement-boite" role="dialog" aria-modal="true" aria-labelledby="entrainement-titre">'
            + '<h2 id="entrainement-titre">🏁 Résultat de l\'entraînement</h2>'
            + '<p class="entrainement-note"><strong>' + note + ' / 20</strong> — ' + bilan.obtenus + ' point(s) sur ' + bilan.total
            + ' (questions auto-corrigées)</p>'
            + '<p class="entrainement-rappel">Rien n\'a été enregistré : ta copie corrigée et ta note restent celles de « Voir le corrigé ».</p>'
            + '<div class="entrainement-liste">' + bilan.details.map((d, i) => ligneQuestion(d, i + 1)).join('') + '</div>'
            + '<div class="entrainement-actions">'
            + '<button type="button" class="btn btn-secondary" id="entrainement-fermer">Fermer</button>'
            + '<a class="btn btn-secondary" href="' + urlSansEntrainement() + '">Quitter l\'entraînement</a>'
            + '<button type="button" class="btn btn-primary" id="entrainement-recommencer">🔁 Recommencer</button>'
            + '</div></div>';
        document.body.appendChild(fond);
        document.getElementById('entrainement-fermer').addEventListener('click', () => fond.remove());
        document.getElementById('entrainement-recommencer').addEventListener('click', () => {
            const params = new URLSearchParams(window.location.search);
            params.set('t', String(Date.now()));
            window.location.href = window.location.pathname + '?' + params.toString();
        });
    }

    window.ChapterEntrainement = {
        PARAMETRE,
        demande,
        modeDuChapitre,
        estDisponible,
        progressionVierge,
        noter,
        url,
        urlSansEntrainement,
        demarrer,
        preparerPage,
        boutonTerminer,
        lireResultats,
        terminer,
        afficherResultat,
    };
})();
