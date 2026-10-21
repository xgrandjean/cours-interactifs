// ============================================================================
// CHAPITRE.JS - Orchestration de la page de chapitre
// ============================================================================
// Fichier allégé : la logique métier, DOM et bilan ont été factorisés dans :
//   - core/chapterSession.js    (session, sync progressManager)
//   - chapter/chapterUI.js      (DOM, restauration, indicateurs)
//   - chapter/chapterSubmission.js (rendu, validation, lock)
//   - chapter/chapterBilan.js   (modal bilan détaillé)
// ============================================================================

// ============================================================================
// CHARGEMENT CONFIG
// ============================================================================
// ── Préchargement (19/10/2026) ───────────────────────────────────────────────
// Sur une page de chapitre, cours.json (le gabarit), chapter_config (loadChapterConfig) et la
// progression (initProgression) s'enchaînaient : 0,8 + 0,5 + 0,5 s sur Appwrite. chapter_config
// ne dépend de rien : il part dès DOMContentLoaded. La progression part aussi, mais son chemin
// (direct ou pont) attend le constat sur cours.json : elle suit donc cours.json de près, au lieu
// de suivre chapter_config. Jamais en vue formateur ni en simulation (qui purge d'abord).
const _prechargement = { config: null };

function estPageDeChapitre() {
    return window.location.pathname.includes('chapitre') || window.location.pathname.includes('chapter_template');
}

function prechargerDonneesChapitre() {
    if (!estPageDeChapitre() || !window.storage) return;
    if (window.Parcours && Parcours.estVueFormateur && Parcours.estVueFormateur()) return;
    if (window.Simulation && Simulation.active && Simulation.active()) return;
    const slug = window.currentParcoursSlug || (window.Parcours ? Parcours.slug : null);
    if (!slug) return;
    _prechargement.config = storage.get(`${slug}:config:chapter_config`).catch(() => null);
    const pm = window.ProgressManager;
    if (pm && pm.prechargerProgression && pm.getCurrentStudentId) {
        const id = pm.getCurrentStudentId();
        if (id) pm.prechargerProgression(id);
    }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', prechargerDonneesChapitre);
else prechargerDonneesChapitre();

async function loadChapterConfig() {
    const isChapterPage = window.location.pathname.includes('chapitre') || 
                        window.location.pathname.includes('chapter_template');
    if (!isChapterPage) return;
    try {
        // Récupérer l'ID du chapitre depuis window.currentChapitreId ou l'URL
        let chapterId = window.currentChapitreId;
        if (!chapterId) {
            const urlParams = new URLSearchParams(window.location.search);
            chapterId = urlParams.get('chapitre');
        }
        
        if (chapterId) {
            // Charger cours.json si pas déjà fait
            if (!window.chaptersIndex) {
                const data = await staticJson.get('/parcours/cours.json');

                if (data && Array.isArray(data.parcours)) {
                    const slug = window.currentParcoursSlug || (window.Parcours ? Parcours.slug : null);
                    const parcours = data.parcours.find(p => p.slug === slug);
                    // 📦 Parcours archivé : un lien direct vers un chapitre renvoie à l'accueil du
                    // parcours, qui le dit (index.js) ; la vue formateur l'ouvre encore.
                    if (parcours && window.Parcours && Parcours.estArchive(parcours) && !Parcours.estVueFormateur()) {
                        window.location.replace(Parcours.userHomeUrl);
                        return;
                    }
                    if (parcours) {
                        window.chaptersIndex = { chapters: parcours.chapitres };
                    }
                } else {
                    console.error('❌ Impossible de charger cours.json.');
                }
            }

            const staticConfig = window.chaptersIndex?.chapters?.find(ch => ch.id == chapterId);
            
            const slug = window.currentParcoursSlug || (window.Parcours ? Parcours.slug : null);
            const configKey = slug ? `${slug}:config:chapter_config` : 'chapter_config';
            // Préchargée dès DOMContentLoaded (prechargerDonneesChapitre), consommée une fois.
            const prechargee = slug ? _prechargement.config : null;
            _prechargement.config = null;
            const storageConfig = prechargee ? await prechargee : await storage.get(configKey);
            
            window.currentChapterConfig = {
                ...staticConfig,
                ...(storageConfig?.[chapterId] || {})
            };
        }
    } catch (error) {
        console.warn('[ChaptersIndex] Erreur lors du chargement de la configuration:', error);
    }
}

// ============================================================================
// INITIALISATION PROGRESSION
// ============================================================================


/**
 * @param {Object}  [options]
 * @param {boolean} [options.lectureSeule] Aperçu formateur : ne RIEN écrire.
 */
async function initProgression({ lectureSeule = false } = {}) {
    const pm = window.ProgressManager;
    if (!pm || !pm.getOrCreateStudentProgress) return;

    ChapterSession.studentId = pm.getCurrentStudentId ? pm.getCurrentStudentId() : null;
    ChapterSession.chapterId = pm.getCurrentChapterId ? pm.getCurrentChapterId() : null;

    if (!ChapterSession.studentId || !ChapterSession.chapterId) return;

    // 🔁 Mode « Entraînement » : la progression est d'abord seulement LUE — getOrCreateStudentProgress
    //    enregistrerait une progression neuve. Si l'apprenant avait commencé le chapitre dans un autre
    //    mode, il le garde : chemin ordinaire ci-dessous. Sinon, entraînement, sans aucune écriture
    //    (chapter/chapterEntrainement.js). Lecture impossible : entraînement en mémoire, rien d'écrit.
    if (!lectureSeule && window.ChapterEntrainement?.estModeEntrainement(window.currentChapterConfig)) {
        let lue = null;
        try { lue = pm.loadProgress ? await pm.loadProgress(ChapterSession.studentId) : null; } catch (_) { lue = null; }
        if (ChapterEntrainement.estModeEntrainement(window.currentChapterConfig, lue?.chapters?.[ChapterSession.chapterId])) {
            ChapterSession.entrainement = true;
            ChapterSession.progress = lue
                || (pm.initProgress ? pm.initProgress(ChapterSession.studentId, 'Apprenant', null) : { chapters: {} });
            ChapterSession.demarreAvantOuverture = false;
            ChapterEntrainement.demarrer();
            return;
        }
    }

    if (lectureSeule) {
        // Consulter la copie d'un apprenant ne doit pas modifier ses données.
        // getOrCreateStudentProgress écrit quand la progression n'existe pas encore,
        // et le saveProgress plus bas écrivait de toute façon à chaque ouverture :
        // l'aperçu formateur touchait donc la progression de l'apprenant observé.
        // Ici on lit, et s'il n'y a rien on travaille sur un objet en mémoire.
        ChapterSession.progress =
            (pm.loadProgress ? await pm.loadProgress(ChapterSession.studentId) : null)
            || (pm.initProgress ? pm.initProgress(ChapterSession.studentId, 'Apprenant', null) : { chapters: {} });
    } else {
        try {
            ChapterSession.progress = await pm.getOrCreateStudentProgress(
                ChapterSession.studentId,
                'Apprenant',
                window.currentChapterConfig || {}
            );
        } catch (e) {
            // La progression n'a pas pu être LUE (panne passagère du service) : on n'en crée
            // pas une vide, qui serait ensuite enregistrée par-dessus celle du serveur. La page
            // s'ouvre en lecture seule sur un objet en mémoire, et toute écriture est refusée
            // (saveProgress) jusqu'au rechargement.
            console.error('[chapitre] progression illisible, page en lecture seule :', e.message);
            lectureSeule = true;
            ChapterSession.ecritureBloquee = true;
            ChapterSession.progress = pm.initProgress
                ? pm.initProgress(ChapterSession.studentId, 'Apprenant', null)
                : { chapters: {} };
            afficherProgressionIllisible();
        }
    }

    // Le chapitre était-il déjà démarré (donc son tirage déjà fait) AVANT cette ouverture ?
    // En vue formateur, ensureChapterInitialized peut tirer EN MÉMOIRE pour un apprenant qui
    // n'a pas commencé : ce tirage-là n'est pas le sien, la page garde alors toutes les questions.
    ChapterSession.demarreAvantOuverture = !!ChapterSession.progress?.chapters?.[ChapterSession.chapterId]?.frozenAt;

    // 🔁 Entraînement (?entrainement=1) : un chapitre dont la correction est publiée, refait à
    //    blanc sur un clone de la progression, sans aucune écriture (chapter/chapterEntrainement.js).
    //    ICI, avant restoreSavedAnswers : il remet les réponses de la vraie copie dans la page au
    //    rafraîchissement suivant. Hors de ces conditions, le paramètre est sans effet.
    if (!lectureSeule && window.ChapterEntrainement?.demande() && ChapterEntrainement.estDisponible(
        ChapterSession.progress?.chapters?.[ChapterSession.chapterId], window.currentChapterConfig)) {
        ChapterEntrainement.demarrer();
        return;
    }

    // Ces deux appels ne modifient que l'objet en mémoire.
    const avantInitialisation = JSON.stringify(ChapterSession.progress);
    if (pm.ensureChapterInitialized && window.chaptersIndex) {
        pm.ensureChapterInitialized(ChapterSession.progress, window.chaptersIndex);
    }

    if (pm.restoreSavedAnswers) {
        pm.restoreSavedAnswers(ChapterSession.progress, ChapterSession.chapterId);
    }

    // Enregistrer seulement si l'ouverture a changé quelque chose (chapitre figé au premier
    // accès, progression tout juste créée). Ouvrir un chapitre déjà commencé n'écrivait rien
    // d'utile, et coûtait une relecture plus une écriture — par la fonction serveur, 2 s.
    if (!lectureSeule && pm.saveProgress && JSON.stringify(ChapterSession.progress) !== avantInitialisation) {
        await pm.saveProgress(ChapterSession.studentId, ChapterSession.progress);
    }

    // ✅ INITIALISATION UNIQUE DU CONTEXTE EXAMEN
    initChapterExamContext(ChapterSession.progress.chapters[ChapterSession.chapterId]);
}

// ============================================================================
// INITIALISATION UI ET CALLBACKS
// ============================================================================

function initCallbacks() {
    window.studentWorkEditor.options.onAnswerValidated = ({
        questionId,
        answer,
        isCorrect,
        points
    }) => {
        const isEmpty =
            answer === null ||
            answer === undefined ||
            answer === '' ||
            (Array.isArray(answer) && answer.length === 0);

        // 🔥 IMPORTANT : en mode examen/blind on NE bloque PAS
        const isBlindOrExam = window.currentChapterConfig?.chapterMode === 'exam' ||
                              window.currentChapterConfig?.chapterMode === 'blind' ||
                              window.currentChapterConfig?.examMode === true;
        if (isEmpty && !isBlindOrExam) return;

        syncAnswerToProgress(questionId, answer, isCorrect, isCorrect ? points : 0);
        ChapterUI.updateAllProgressIndicators();
    };

    // Saisie en cours d'une réponse destinée à un humain : enregistrement
    // d'office, sans attendre que l'apprenant appuie sur le bouton.
    //
    // Pas de garde-fou de vacuité ici, contrairement à onAnswerValidated
    // ci-dessus : effacer sa réponse est une action volontaire qui doit être
    // enregistrée. Sans ça, l'ancienne version ressusciterait au rendu.
    window.studentWorkEditor.options.onDraftChanged = ({ questionId, answer }) => {
        syncBrouillonToProgress(questionId, answer ?? null);
    };

    window.studentWorkEditor.init();
}

// ============================================================================
// MODE MILLIONNAIRE — PAS DE REPRISE
// ============================================================================

/**
 * Réinitialise la tentative en cours quand l'apprenant revient sur un chapitre en
 * mode Millionnaire. Sans effet si le chapitre est rendu, validé ou verrouillé, ni
 * si rien n'a encore été répondu.
 *
 * @returns {Promise<boolean>} true si une tentative a effectivement été effacée
 */
async function reinitialiserTentativeMillionnaire() {
    const contexte = window.currentExamContext;
    if (!contexte?.isMillionnaireMode || contexte.isChapterLocked) return false;

    const chapitre = ChapterSession.progress?.chapters?.[ChapterSession.chapterId];
    if (!chapitre?.questions) return false;

    // Seules les questions auto et semi comptent : ce sont elles que la remise à zéro
    // efface. Une réponse manuelle, conservée d'une tentative à l'autre, ne signifie pas
    // que la tentative a commencé — et chaque tentative coûte désormais des points.
    const aDesReponses = Object.entries(chapitre.questions)
        .some(([id, donnees]) => !id.startsWith('course_') && donnees?.answered
            && ChapterSubmission._typeCorrection(id) !== 'manuel');
    if (!aDesReponses) return false;

    await ChapterSubmission._resetAutoQuestions();
    return true;
}

/** Prévient l'apprenant : ses réponses n'ont pas disparu par accident. */
function afficherBandeauNouvelleTentative() {
    const contenu = document.querySelector('.chapter-content');
    if (!contenu || document.getElementById('bandeau-nouvelle-tentative')) return;

    const bandeau = document.createElement('div');
    bandeau.id = 'bandeau-nouvelle-tentative';
    bandeau.className = 'bandeau-nouvelle-tentative';
    bandeau.innerHTML = '💰 <strong>Nouvelle tentative</strong> — en mode Millionnaire, ' +
                        'quitter le chapitre remet les questions à zéro.';
    contenu.insertBefore(bandeau, contenu.firstChild);
}

/** Bandeau de la page de chapitre quand la progression n'a pas pu être lue (même style que chapterInit). */
function afficherProgressionIllisible() {
    const zone = document.querySelector('.chapter-content') || document.body;
    if (!zone || document.getElementById('bandeau-progression-illisible')) return;
    zone.insertAdjacentHTML('afterbegin',
        '<div id="bandeau-progression-illisible" style="margin:1rem;padding:1rem;border-radius:8px;background:#fff3cd;' +
        'border:1px solid #ffeaa7;color:#856404;text-align:center;">' +
        '<strong>Service momentanément indisponible</strong> : votre progression n\'a pas pu être lue. ' +
        'Le chapitre est affiché en lecture seule, rien ne sera enregistré. ' +
        '<a href="#" onclick="location.reload(); return false;">Recharger la page</a> dans quelques instants.</div>');
    if (typeof _lockInterfaceForTeacher === 'function') {
        try { _lockInterfaceForTeacher(); } catch (_) { /* verrouillage facultatif */ }
    }
}

/**
 * Tirage de questions (progressManager.js, questionsDuChapitre) : la page ne garde que les
 * questions tirées pour cet apprenant. Les autres sections sont RETIRÉES du DOM — l'ordre
 * aléatoire, l'anti-IA, la pagination, les QRCodes et la validation lisent le DOM et suivent
 * d'eux-mêmes. Les titres « Question N » sont renumérotés 1..x. À appeler avant
 * ChapterOrdre.appliquer, contenu encore masqué. Sans tirage : rien.
 */
function retirerQuestionsNonTirees(chapitre) {
    const tirees = chapitre && Array.isArray(chapitre.questionsTirees) ? new Set(chapitre.questionsTirees.map(String)) : null;
    if (!tirees) return 0;
    let retirees = 0;
    document.querySelectorAll('.question-section[data-question-id]').forEach(section => {
        if (!tirees.has(String(section.dataset.questionId))) { section.remove(); retirees++; }
    });
    let rang = 0;
    document.querySelectorAll('.question-section .question-title h3').forEach(titre => {
        rang++;
        if (/\d/.test(titre.textContent)) titre.textContent = titre.textContent.replace(/\d+/, String(rang));
    });
    if (retirees) console.log(`[chapitre] tirage : ${tirees.size} question(s) gardée(s), ${retirees} retirée(s)`);
    return retirees;
}

// ============================================================================
// INITIALISATION GLOBALE
// ============================================================================

async function initChapterPage() {
    const isChapterPage = window.location.pathname.includes('chapitre') ||
                        window.location.pathname.includes('chapter_template');
    if (!isChapterPage) return;

    // Vue formateur : le paramètre d'URL ne vaut qu'avec une session formateur.
    const isTeacherView = !!(window.Parcours && Parcours.estVueFormateur && Parcours.estVueFormateur());

    await loadChapterConfig();

    // 👁 Simulation : purge AVANT toute lecture ou écriture de progression, pour que
    //    la répétition démarre vierge — et pour qu'un résidu laissé par une session
    //    interrompue ne survive pas. C'est ici, et pas à la fermeture, parce qu'un
    //    onglet fermé brutalement n'exécute aucun nettoyage de sortie.
    if (window.Simulation?.active()) {
        await Simulation.purger(window.currentParcoursSlug || (window.Parcours ? Parcours.slug : null));
    }

    await initProgression({ lectureSeule: isTeacherView });

    // Tirage : seules les questions de cet apprenant restent dans la page. En vue formateur,
    // un apprenant qui n'a pas encore démarré n'a pas de tirage (il se fait à son premier
    // accès) : toutes les questions restent. ensureChapterInitialized a pu en tirer un EN
    // MÉMOIRE dans ce cas (lecture seule, jamais enregistré) : on l'ignore.
    const chapitreProgression = ChapterSession.progress?.chapters?.[ChapterSession.chapterId];
    if (!isTeacherView || ChapterSession.demarreAvantOuverture) retirerQuestionsNonTirees(chapitreProgression);

    // Mode formateur : lecture seule (verrouillage déjà géré par _lockInterfaceForTeacher).
    // On charge quand même la progression pour afficher les réponses de l'apprenant.
    if (isTeacherView) {
        console.log('👨‍🏫 Mode formateur — affichage de la progression en lecture seule');
        ChapterUI.initializeStats();
        ChapterUI.applyChapterMode();

        // Vue formateur : ordre publié, jamais tiré au sort — il a besoin d'une
        // référence stable, pas de l'ordre vu par tel apprenant.
        window.ChapterOrdre?.reveler();

        setTimeout(() => {
            ChapterUI.restoreAllAnswers();
            ChapterUI.updateAllProgressIndicators();
            window.AtelierQuestion?.init();
            window.QRQuestion?.init();
        }, 500);
        return;
    }

    // ✅ Vérifier et verrouiller si chapitre déjà rendu, ou verrouillé par le formateur
    //    (verrou manuel global — la date limite ne verrouille pas, elle marque juste le
    //    rendu comme "en retard" au moment où l'élève rend sa copie, voir submitChapter())
    const chapter = ChapterSession.progress?.chapters?.[ChapterSession.chapterId];
    const isSubmitted = chapter?.submissionStatus === 'submitted' ||
                        chapter?.submissionStatus === 'late_submitted';
    const isValidated = chapter?.submissionStatus === 'validated';
    const isTeacherLocked = window.currentExamContext?.isTeacherLocked === true;

    if (isSubmitted || isValidated || isTeacherLocked) {
        console.log('🔒 Chapitre verrouillé (rendu/validé/formateur), verrouillage immédiat');

        // Désactiver tous les boutons et inputs (sauf navigation)
        document.querySelectorAll('input, select, textarea, button').forEach(el => {
            // Ne pas désactiver les boutons de navigation (Retour au menu)
            const isNavButton = el.closest('.chapter-nav') ||
                               el.closest('.progress-actions') ||
                               el.classList.contains('btn-secondary');
            if (!isNavButton) {
                el.disabled = true;
                el.style.opacity = '0.6';
                el.style.cursor = 'not-allowed';
            }
        });

        // Modifier le bouton de soumission
        const submitBtn = document.getElementById('submit-chapter-btn');
        if (submitBtn) {
            if (isValidated) {
                submitBtn.textContent = '✅ Correction publiée';
            } else if (isSubmitted) {
                submitBtn.textContent = '📝 Rendu - En attente de correction';
            } else {
                submitBtn.textContent = '🔒 Chapitre verrouillé';
            }
            submitBtn.disabled = true;
        }

        // Ajouter le message de confirmation
        let msgDiv = document.getElementById('submission-confirmation-msg');
        if (!msgDiv) {
            msgDiv = document.createElement('div');
            msgDiv.id = 'submission-confirmation-msg';
            const mainContent = document.querySelector('.chapter-content');
            if (mainContent) mainContent.insertBefore(msgDiv, mainContent.firstChild);
        }
        if (isValidated) {
            msgDiv.innerHTML = '✅ <strong>Correction publiée</strong> par votre évaluateur — consultez votre corrigé.';
            // Un lien et non un bouton : le verrouillage d'une copie rendue désactive les boutons.
            if (window.ChapterEntrainement?.estDisponible(chapter, window.currentChapterConfig)) {
                msgDiv.innerHTML += '<br><a class="lien-entrainement" href="' + ChapterEntrainement.url(ChapterSession.chapterId)
                    + '" title="Refaire ce chapitre à blanc pour t\'entraîner : rien n\'est enregistré, ta note ne change pas">🔁 S\'entraîner</a>';
            }
        } else if (isSubmitted) {
            msgDiv.innerHTML = '📝 <strong>Copie rendue</strong> - Plus de modifications possibles.<br>Votre évaluateur la corrigera prochainement.';
        } else {
            msgDiv.innerHTML = '🔒 <strong>Chapitre verrouillé</strong> par votre évaluateur.';
        }
        msgDiv.style.cssText = 'background: #e8f5e9; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; text-align: center;';
    }

    // 💰 Mode Millionnaire : pas de reprise. Revenir sur le chapitre — y compris par
    //    un simple rechargement — repart d'une tentative neuve, ce qui interdit aussi
    //    de « sauvegarder » une bonne série en quittant la page.
    const tentativeReinitialisee = await reinitialiserTentativeMillionnaire();

    // 🎲 Ordre des questions, puis révélation du contenu masqué par le template.
    window.ChapterOrdre?.appliquer();
    // 🎲 Ordre des propositions des QCM et « selection » marqués « aleatoire » :
    //    nouvel ordre à chaque affichage, sans mémorisation. Sur un chapitre
    //    rendu/validé/verrouillé et en vue formateur, l'ordre conçu est conservé
    //    (cf. chapter/choixOrdre.js) — le mélange y est donc sans effet.
    window.ChoixOrdre?.appliquer();
    // 🤖 Anti-IA : les énoncés quittent la page avant qu'elle soit révélée — ils ne
    //    doivent jamais s'afficher, même un instant (cf. chapter/chapterAntiIA.js).
    window.ChapterAntiIA?.init();
    window.ChapterPagination?.init();
    window.ChapterOrdre?.reveler();

    if (tentativeReinitialisee) afficherBandeauNouvelleTentative();

    ChapterUI.initializeStats();
    ChapterUI.applyChapterMode();
    initCallbacks();
    if (ChapterSession.entrainement) ChapterEntrainement.preparerPage();

    setTimeout(() => {
        ChapterUI.updateSubmitButton();
        ChapterUI.restoreAllAnswers();
        ChapterUI.updateAllProgressIndicators();
        // ⚠️ Après restoreAllAnswers : le bloc Atelier lit l'état restauré, et son champ
        //    de saisie d'AR doit survivre au verrouillage d'un chapitre déjà rendu
        //    (l'AR arrive souvent après le rendu — cf. "mode atelier AR.md" §3.1).
        window.AtelierQuestion?.init();
        window.QRQuestion?.init();
    }, 500);
}

// ============================================================================
// EXPORTS GLOBAUX (compatibilité)
// ============================================================================

window.initChapterPage = initChapterPage;
