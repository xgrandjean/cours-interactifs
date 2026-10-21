// ============================================================================
// CHAPTER ENTRAINEMENT — Rejouer un chapitre corrigé, sans rien écrire (21/10/2026)
// ============================================================================
// Demande des apprenants : une fois la correction publiée, le chapitre est figé (on voit le
// corrigé, on ne peut plus répondre). « 🔁 S'entraîner » rouvre la page avec ?entrainement=1 :
// le chapitre est refait à blanc, en style examen (réponses retenues sans retour), et
// « 🏁 Terminer l'entraînement » donne la note sur 20 des questions auto-corrigées, juste/faux et
// bonne réponse. Avec un tirage x parmi y, chaque entraînement tire x questions NEUVES au hasard
// (pas forcément celles de la copie) ; sans tirage, toutes les questions.
//
// Le MODE de chapitre « 🔁 Entraînement » (chapterMode 'entrainement', réglé dans XPro ou sur la
// carte du chapitre) joue toujours ainsi, sans correction préalable : la page ne lit la
// progression que pour l'identité, et ne crée ni ne modifie jamais d'entrée (chapitre.js,
// initProgression ; progressManager.js, unlockNextChapter). RÉTROCOMPATIBILITÉ : un apprenant
// qui avait commencé le chapitre dans un autre mode (mode figé à son premier démarrage) le
// GARDE — copie, rendu, correction, comme avant. Le mode Entraînement ne vaut que pour qui n'a
// pas commencé (estModeEntrainement, getExamContext.isEntrainementMode : même règle).
//
// RIEN n'est écrit : ni la progression (saveProgress rend la main tant que
// ChapterSession.entrainement est posé), ni cours.json, ni chapter_config. La page travaille sur
// un CLONE de la progression, vidé de ses réponses ; la copie corrigée et sa note restent
// intactes, « Voir le corrigé » les montre toujours.
//
// Proposé si : mode Entraînement ; ou correction publiée (submissionStatus « validated »), mode
// Découverte, Examen, Blind ou Millionnaire, au moins une question auto ou semi-corrigée. Jamais en
// vue formateur. Décisions de l'utilisateur du 21/10/2026.
//
// Chargé par la page de chapitre (chapter_template.html) et par la liste des chapitres
// (user.html, bouton de la carte) : rien ne s'exécute au chargement.
// ============================================================================

(function () {
    'use strict';

    const PARAMETRE = 'entrainement';
    const MODES = ['normal', 'exam', 'blind', 'millionnaire'];
    const MODE_ENTRAINEMENT = 'entrainement';
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

    /**
     * Le chapitre se joue-t-il en mode « Entraînement » pour cet apprenant ? Oui si la config
     * (en direct) le dit, SAUF s'il a commencé le chapitre dans un autre mode : son mode figé
     * prime (rétrocompatibilité). Sans entrée, ou entrée jamais figée : Entraînement.
     * @param {Object} config      configuration du chapitre (cours.json + chapter_config)
     * @param {Object} [chapitre]  son entrée de progression, si elle existe
     */
    function estModeEntrainement(config, chapitre) {
        if (!(config && config.chapterMode === MODE_ENTRAINEMENT)) return false;
        const figeAutrement = !!(chapitre && chapitre.frozenAt != null && chapitre.frozenChapterMode
            && chapitre.frozenChapterMode !== MODE_ENTRAINEMENT);
        return !figeAutrement;
    }

    /** La page en cours est-elle un chapitre en mode Entraînement (et non un corrigé rejoué) ? */
    function pageEnModeEntrainement() {
        const chapitre = window.ChapterSession && ChapterSession.progress && ChapterSession.progress.chapters
            ? ChapterSession.progress.chapters[ChapterSession.chapterId] : null;
        return estModeEntrainement(window.currentChapterConfig, chapitre);
    }

    /** Mode de la copie : figé au premier démarrage, sinon celui de la config. */
    function modeDuChapitre(chapitre, config) {
        if (estModeEntrainement(config, chapitre)) return MODE_ENTRAINEMENT;
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
        if (estModeEntrainement(config, chapitre)) return true;
        if (!chapitre || chapitre.submissionStatus !== 'validated') return false;
        if (!MODES.includes(modeDuChapitre(chapitre, config))) return false;
        const questions = (config && Array.isArray(config.questions)) ? config.questions : [];
        return questions.some(q => NOTEES.includes(q && q.correctionType));
    }

    /**
     * Vide une entrée de chapitre pour l'entraînement : réponses retirées (les validations de cours
     * restent), questions tirées pour CET entraînement (null = toutes), ni statut de rendu ni
     * tentatives. Modifie l'entrée reçue.
     */
    function viderChapitre(chapitre, questionsTirees) {
        const cours = {};
        Object.entries(chapitre.questions || {}).forEach(([id, donnees]) => {
            if (String(id).startsWith('course_')) cours[id] = donnees;
        });
        chapitre.questions = cours;
        chapitre.questionsTirees = Array.isArray(questionsTirees) ? questionsTirees.slice() : null;
        chapitre.submissionStatus = 'not_submitted';
        delete chapitre.tentativesPassees;
        delete chapitre.tentative;
        delete chapitre.coursePenalty;
        return chapitre;
    }

    /**
     * Le clone de la progression sur lequel la page travaille, chapitre courant vidé
     * (viderChapitre). L'objet reçu n'est jamais modifié.
     * @param {Array<string>|null} [questionsTirees]  le tirage de cet entraînement (null = toutes)
     */
    function progressionVierge(progression, chapterId, questionsTirees = null) {
        const copie = JSON.parse(JSON.stringify(progression || { chapters: {} }));
        const chapitre = copie.chapters && copie.chapters[chapterId];
        if (!chapitre) return copie;
        viderChapitre(chapitre, questionsTirees);
        return copie;
    }

    /**
     * Le tirage d'un entraînement : x questions neuves parmi les valides, si le chapitre a un tirage
     * réglé (nombreQuestions), quel que soit son mode ; sinon null (toutes). Fonction pure de
     * progressManager.js (tirerQuestions), qui ne tire qu'en Examen, Blind, Millionnaire et
     * Entraînement : le mode lui est donc présenté comme « exam ».
     */
    function tirageNeuf(config, tirer) {
        const fonction = tirer || (window.ProgressManager && window.ProgressManager.tirerQuestions);
        if (typeof fonction !== 'function' || !config) return null;
        return fonction({ ...config, chapterMode: 'exam' });
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
        const config = window.currentChapterConfig || {};
        const tirees = tirageNeuf(config);
        ChapterSession.entrainement = true;
        ChapterSession.progress = progressionVierge(ChapterSession.progress, chapterId, tirees);
        if (!ChapterSession.progress.chapters) ChapterSession.progress.chapters = {};
        // Mode Entraînement jamais ouvert : l'entrée n'existe qu'en mémoire, le temps de la page.
        if (!ChapterSession.progress.chapters[chapterId] && pm.initChapter) {
            ChapterSession.progress.chapters[chapterId] = viderChapitre(pm.initChapter(config, ChapterSession.studentId), tirees);
        }
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
        bandeau.innerHTML = pageEnModeEntrainement()
            ? '🔁 <strong>Entraînement</strong> — rien n\'est enregistré. Réponds, puis « 🏁 Terminer l\'entraînement » '
              + 'pour voir ton résultat ; « 🔁 Recommencer » tire de nouvelles questions.'
            : '🔁 <strong>Entraînement</strong> — le chapitre est à blanc et rien n\'est enregistré : '
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
        const modeChapitre = pageEnModeEntrainement();
        const note = bilan.sur20 === null ? '—' : String(bilan.sur20).replace('.', ',');
        const fond = document.createElement('div');
        fond.id = 'entrainement-resultat';
        fond.className = 'entrainement-fond';
        fond.innerHTML = '<div class="entrainement-boite" role="dialog" aria-modal="true" aria-labelledby="entrainement-titre">'
            + '<h2 id="entrainement-titre">🏁 Résultat de l\'entraînement</h2>'
            + '<p class="entrainement-note"><strong>' + note + ' / 20</strong> — ' + bilan.obtenus + ' point(s) sur ' + bilan.total
            + ' (questions auto-corrigées)</p>'
            + '<p class="entrainement-rappel">' + (modeChapitre
                ? 'Rien n\'a été enregistré.'
                : 'Rien n\'a été enregistré : ta copie corrigée et ta note restent celles de « Voir le corrigé ».') + '</p>'
            + '<div class="entrainement-liste">' + bilan.details.map((d, i) => ligneQuestion(d, i + 1)).join('') + '</div>'
            + '<div class="entrainement-actions">'
            + '<button type="button" class="btn btn-secondary" id="entrainement-fermer">Fermer</button>'
            + (modeChapitre ? '' : '<a class="btn btn-secondary" href="' + urlSansEntrainement() + '">Quitter l\'entraînement</a>')
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
        MODE_ENTRAINEMENT,
        demande,
        estModeEntrainement,
        modeDuChapitre,
        estDisponible,
        progressionVierge,
        viderChapitre,
        tirageNeuf,
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
