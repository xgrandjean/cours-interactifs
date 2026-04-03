/**
 * progressMigration.js - Gère la migration de la progression des étudiants
 * lors des changements de structure des chapitres
 */

const ProgressMigration = {

    /**
     * Migre la progression d'un étudiant vers une nouvelle structure de chapitres
     * @param {Object} oldProgress - L'ancienne progression de l'étudiant
     * @param {Object} chaptersConfig - La nouvelle configuration des chapitres (depuis chapters_index.json)
     * @returns {Object} Résultat de la migration avec les changements détectés
     */
    migrateStudentProgress(oldProgress, chaptersConfig) {
        if (!oldProgress || !chaptersConfig) {
            return {
                migratedProgress: null,
                hasChanges: false,
                removedQuestions: [],
                addedQuestions: [],
                removedChapters: [],
                addedChapters: []
            };
        }

        const newChapters = chaptersConfig.chapters || [];
        const oldChapters = oldProgress.chapters || {};

        // Construire une map des nouveaux chapitres par ID
        const newChaptersMap = {};
        newChapters.forEach(ch => {
            newChaptersMap[ch.id] = ch;
        });

        // Construire une map des anciens chapitres par ID
        const oldChaptersMap = {};
        Object.keys(oldChapters).forEach(id => {
            oldChaptersMap[id] = oldChapters[id];
        });

        const removedChapters = [];
        const addedChapters = [];
        const removedQuestions = [];
        const addedQuestions = [];

        // Détecter les chapitres supprimés
        Object.keys(oldChaptersMap).forEach(chapterId => {
            if (!newChaptersMap[chapterId]) {
                removedChapters.push(chapterId);
            }
        });

        // Détecter les chapitres ajoutés
        Object.keys(newChaptersMap).forEach(chapterId => {
            if (!oldChaptersMap[chapterId]) {
                addedChapters.push(chapterId);
            }
        });

        // Construire la nouvelle progression
        const migratedChapters = {};

        // Traiter les chapitres existants (potentiellement modifiés)
        Object.keys(newChaptersMap).forEach(chapterId => {
            const newChapter = newChaptersMap[chapterId];
            const oldChapter = oldChaptersMap[chapterId];

            if (oldChapter) {
                // Chapitre existant - migrer les questions
                const { migratedChapter, chapterRemovedQuestions, chapterAddedQuestions } = 
                    this.migrateChapterQuestions(oldChapter, newChapter);
                
                migratedChapters[chapterId] = migratedChapter;
                
                chapterRemovedQuestions.forEach(q => {
                    removedQuestions.push({ chapterId, questionId: q });
                });
                chapterAddedQuestions.forEach(q => {
                    addedQuestions.push({ chapterId, questionId: q });
                });
            } else {
                // Nouveau chapitre - créer une structure vide
                migratedChapters[chapterId] = this.createEmptyChapter(newChapter);
                
                // Toutes les questions du nouveau chapitre sont considérées comme ajoutées
                if (newChapter.questions) {
                    newChapter.questions.forEach(q => {
                        addedQuestions.push({ chapterId, questionId: q.id });
                    });
                }
            }
        });

        // Calculer les nouvelles statistiques
        let completedChapters = 0;
        let totalScore = 0;

        Object.values(migratedChapters).forEach(chapter => {
            if (chapter.status === 'completed') {
                completedChapters++;
            }
            totalScore += chapter.score || 0;
        });

        const migratedProgress = {
            ...oldProgress,
            contentHash: chaptersConfig.contentHash || null,
            lastUpdated: new Date().toISOString(),
            completedChapters,
            totalScore,
            chapters: migratedChapters
        };

        const hasChanges = removedChapters.length > 0 || 
                          addedChapters.length > 0 || 
                          removedQuestions.length > 0 || 
                          addedQuestions.length > 0;

        return {
            migratedProgress,
            hasChanges,
            removedQuestions,
            addedQuestions,
            removedChapters,
            addedChapters
        };
    },

    /**
     * Migre les questions d'un chapitre
     * @param {Object} oldChapter - L'ancienne donnée du chapitre
     * @param {Object} newChapter - La nouvelle donnée du chapitre (depuis chapters_index.json)
     * @returns {Object} Le chapitre migré et les questions ajoutées/supprimées
     */
    migrateChapterQuestions(oldChapter, newChapter) {
        const oldQuestions = oldChapter.questions || {};
        const newQuestionsList = newChapter.questions || [];
        
        // Construire une map des nouvelles questions par ID
        const newQuestionsMap = {};
        newQuestionsList.forEach(q => {
            newQuestionsMap[q.id] = q;
        });

        // Construire une map des anciennes questions par ID
        const oldQuestionsMap = {};
        Object.keys(oldQuestions).forEach(id => {
            oldQuestionsMap[id] = oldQuestions[id];
        });

        const removedQuestions = [];
        const addedQuestions = [];
        const migratedQuestions = {};

        // Vérifier chaque nouvelle question
        Object.keys(newQuestionsMap).forEach(questionId => {
            const newQuestion = newQuestionsMap[questionId];
            const oldQuestion = oldQuestionsMap[questionId];

            if (oldQuestion) {
                // Question existante - vérifier si le hash a changé
                if (oldQuestion.questionHash === newQuestion.questionHash) {
                    // Même hash = même question, conserver la réponse
                    migratedQuestions[questionId] = { ...oldQuestion };
                } else {
                    // Hash différent = question modifiée
                    // Conserver la réponse mais marquer comme non correcte (à réévaluer)
                    migratedQuestions[questionId] = {
                        ...oldQuestion,
                        isCorrect: null, // Doit être réévalué
                        needsManualCorrection: newQuestion.type === 'ouverte' ? true : false
                    };
                }
            } else {
                // Nouvelle question - créer une entrée vide
                addedQuestions.push(questionId);
                migratedQuestions[questionId] = this.createEmptyQuestion();
            }
        });

        // Détecter les questions supprimées
        Object.keys(oldQuestionsMap).forEach(questionId => {
            if (!newQuestionsMap[questionId]) {
                removedQuestions.push(questionId);
            }
        });

        // Calculer le nouveau score du chapitre
        let chapterScore = 0;
        let maxScore = 0;

        Object.values(migratedQuestions).forEach(q => {
            chapterScore += q.score || 0;
            maxScore += q.maxScore || 0;
        });

        const migratedChapter = {
            ...oldChapter,
            score: chapterScore,
            maxScore,
            questions: migratedQuestions
        };

        // Mettre à jour le statut si nécessaire
        if (chapterScore > 0 && chapterScore >= maxScore) {
            migratedChapter.status = 'completed';
            if (!migratedChapter.completedAt) {
                migratedChapter.completedAt = new Date().toISOString();
            }
        } else if (chapterScore > 0) {
            migratedChapter.status = 'in_progress';
        }

        return {
            migratedChapter,
            chapterRemovedQuestions: removedQuestions,
            chapterAddedQuestions: addedQuestions
        };
    },

    /**
     * Crée une structure de chapitre vide
     * @param {Object} chapterConfig - La configuration du chapitre
     * @returns {Object} Une structure de chapitre vide
     */
    createEmptyChapter(chapterConfig) {
        const questions = {};
        
        if (chapterConfig.questions) {
            chapterConfig.questions.forEach(q => {
                questions[q.id] = this.createEmptyQuestion();
            });
        }

        return {
            status: "not_started",
            score: 0,
            maxScore: chapterConfig.maxPoints || 0,
            completedAt: null,
            questions
        };
    },

    /**
     * Crée une structure de question vide
     * @returns {Object} Une structure de question vide
     */
    createEmptyQuestion() {
        return {
            answered: false,
            answer: null,
            isCorrect: null,
            score: 0,
            attempts: 0,
            answeredAt: null,
            needsManualCorrection: false
        };
    },

    /**
     * Applique la migration et sauvegarde dans localStorage
     * @param {string} studentId - L'ID de l'étudiant
     * @param {Object} oldProgress - L'ancienne progression
     * @param {Object} chaptersConfig - La nouvelle configuration
     * @returns {Object} Résultat de la migration
     */
    applyMigration(studentId, oldProgress, chaptersConfig) {
        const result = this.migrateStudentProgress(oldProgress, chaptersConfig);
        
        if (result.migratedProgress) {
            const key = `student_${studentId}_progress`;
            localStorage.setItem(key, JSON.stringify(result.migratedProgress));
        }
        
        return result;
    }
};

// Export pour utilisation dans d'autres modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProgressMigration;
}