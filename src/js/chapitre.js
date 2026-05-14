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
                const response = await fetch((window.BASE || '') + '/parcours/cours.json');
                if (response.ok) {
                    const data = await response.json();
                    // Utiliser window.currentParcoursSlug ou Parcours.slug
                    const slug = window.currentParcoursSlug || (window.Parcours ? Parcours.slug : null);
                    const parcours = data.parcours.find(p => p.slug === slug);
                    if (parcours) {
                        window.chaptersIndex = { chapters: parcours.chapitres };
                    }
                } else {
                    console.error('❌ Impossible de charger cours.json.', response.status);
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


async function initProgression() {
    const pm = window.ProgressManager;
    if (!pm || !pm.getOrCreateStudentProgress) return;

    ChapterSession.studentId = pm.getCurrentStudentId ? pm.getCurrentStudentId() : null;
    ChapterSession.chapterId = pm.getCurrentChapterId ? pm.getCurrentChapterId() : null;

    if (!ChapterSession.studentId || !ChapterSession.chapterId) return;

    ChapterSession.progress = await pm.getOrCreateStudentProgress(
        ChapterSession.studentId,
        'Apprenant',
        window.currentChapterConfig || {}
    );

    if (pm.ensureChapterInitialized && window.chaptersIndex) {
        pm.ensureChapterInitialized(ChapterSession.progress, window.chaptersIndex);
    }

    if (pm.restoreSavedAnswers) {
        pm.restoreSavedAnswers(ChapterSession.progress, ChapterSession.chapterId);
    }

    if (pm.saveProgress) {
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

        // 🔥 IMPORTANT : en mode examen on NE bloque PAS
        if (isEmpty && !window.currentChapterConfig?.examMode) return;

        syncAnswerToProgress(questionId, answer, isCorrect, isCorrect ? points : 0);
        ChapterUI.updateAllProgressIndicators();
    };

    window.studentWorkEditor.init();
}

// ============================================================================
// INITIALISATION GLOBALE
// ============================================================================

async function initChapterPage() {
    const isChapterPage = window.location.pathname.includes('chapitre') || 
                        window.location.pathname.includes('chapter_template');
    if (!isChapterPage) return;

    // Ne pas altérer l'interface en mode formateur (lecture seule déjà gérée par _lockInterfaceForTeacher)
    const urlParams = new URLSearchParams(window.location.search);
    const isTeacherView = urlParams.get('teacher_view') === 'true';
    if (isTeacherView) {
        console.log('👨‍🏫 Mode formateur — initChapterPage ne modifie pas l\'interface');
        return;
    }

    await loadChapterConfig();
    await initProgression();

    // ✅ Vérifier et verrouiller si chapitre déjà rendu
    const chapter = ChapterSession.progress?.chapters?.[ChapterSession.chapterId];
    const isSubmitted = chapter?.submissionStatus === 'submitted' || 
                        chapter?.submissionStatus === 'late_submitted';
    const isValidated = chapter?.submissionStatus === 'validated';
    
    if (isSubmitted || isValidated) {
        console.log('🔒 Chapitre déjà rendu/validé, verrouillage immédiat');
        
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
            } else {
                submitBtn.textContent = '📝 Rendu - En attente de correction';
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
        }
        msgDiv.style.cssText = 'background: #e8f5e9; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; text-align: center;';
    }

    ChapterUI.initializeStats();
    ChapterUI.applyChapterMode();
    initCallbacks();

    setTimeout(() => { 
        ChapterUI.updateSubmitButton();
        ChapterUI.restoreAllAnswers();
        ChapterUI.updateAllProgressIndicators();
    }, 500);
}

// ============================================================================
// EXPORTS GLOBAUX (compatibilité)
// ============================================================================

window.initChapterPage = initChapterPage;
