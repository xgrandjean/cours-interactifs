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
            const storageConfig = await storage.get(configKey);
            
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
        ChapterSession.progress = await pm.getOrCreateStudentProgress(
            ChapterSession.studentId,
            'Apprenant',
            window.currentChapterConfig || {}
        );
    }

    // Ces deux appels ne modifient que l'objet en mémoire.
    if (pm.ensureChapterInitialized && window.chaptersIndex) {
        pm.ensureChapterInitialized(ChapterSession.progress, window.chaptersIndex);
    }

    if (pm.restoreSavedAnswers) {
        pm.restoreSavedAnswers(ChapterSession.progress, ChapterSession.chapterId);
    }

    if (!lectureSeule && pm.saveProgress) {
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

    const aDesReponses = Object.entries(chapitre.questions)
        .some(([id, donnees]) => !id.startsWith('course_') && donnees?.answered);
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

// ============================================================================
// INITIALISATION GLOBALE
// ============================================================================

async function initChapterPage() {
    const isChapterPage = window.location.pathname.includes('chapitre') ||
                        window.location.pathname.includes('chapter_template');
    if (!isChapterPage) return;

    const urlParams = new URLSearchParams(window.location.search);
    const isTeacherView = urlParams.get('teacher_view') === 'true';

    await loadChapterConfig();

    // 👁 Simulation : purge AVANT toute lecture ou écriture de progression, pour que
    //    la répétition démarre vierge — et pour qu'un résidu laissé par une session
    //    interrompue ne survive pas. C'est ici, et pas à la fermeture, parce qu'un
    //    onglet fermé brutalement n'exécute aucun nettoyage de sortie.
    if (window.Simulation?.active()) {
        await Simulation.purger(window.currentParcoursSlug || (window.Parcours ? Parcours.slug : null));
    }

    await initProgression({ lectureSeule: isTeacherView });

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
                submitBtn.textContent = '✅ Validé par votre évaluateur';
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
            msgDiv.innerHTML = '✅ <strong>Chapitre validé</strong> - Félicitations !';
        } else if (isSubmitted) {
            msgDiv.innerHTML = '📝 <strong>Copie rendue</strong> - Plus de modifications possibles.<br>Votre évaluateur la corrigera prochainement.';
        } else {
            msgDiv.innerHTML = '🔒 <strong>Chapitre verrouillé</strong> par votre formateur.';
        }
        msgDiv.style.cssText = 'background: #e8f5e9; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; text-align: center;';
    }

    // 💰 Mode Millionnaire : pas de reprise. Revenir sur le chapitre — y compris par
    //    un simple rechargement — repart d'une tentative neuve, ce qui interdit aussi
    //    de « sauvegarder » une bonne série en quittant la page.
    const tentativeReinitialisee = await reinitialiserTentativeMillionnaire();

    // 🎲 Ordre des questions, puis révélation du contenu masqué par le template.
    window.ChapterOrdre?.appliquer();
    window.ChapterPagination?.init();
    window.ChapterOrdre?.reveler();

    if (tentativeReinitialisee) afficherBandeauNouvelleTentative();

    ChapterUI.initializeStats();
    ChapterUI.applyChapterMode();
    initCallbacks();

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
