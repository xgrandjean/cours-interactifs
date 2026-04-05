// chapterDetector.js - Détecte les chapitres via chapters_index.json
// et gère la cohérence des données de progression

const ChapterDetector = {

    // Contenu global chargé depuis le JSON (inclut contentHash, version, etc.)
    chaptersConfig: null,

    async fetchChaptersFromJSON(pathname) {
        console.log("dossier de recherche du JSON:", pathname);
        try {
            const response = await fetch(pathname);
            if (!response.ok) throw new Error('Impossible de charger le JSON des chapitres');
            const json = await response.json();
            
            // Support des deux formats : ancien (tableau) et nouveau (objet avec chapters)
            if (Array.isArray(json)) {
                // Ancien format : tableau direct
                this.chaptersConfig = {
                    chapters: json,
                    contentHash: null,
                    version: null,
                    generatedAt: null
                };
            } else {
                // Nouveau format : objet avec métadonnées
                this.chaptersConfig = {
                    chapters: json.chapters || [],
                    contentHash: json.contentHash || null,
                    version: json.version || null,
                    generatedAt: json.generatedAt || null,
                    totalChapters: json.totalChapters || 0,
                    totalQuestions: json.totalQuestions || 0
                };
            }
            
            console.log('✅ Chapitres chargés depuis le fichier JSON:', this.chaptersConfig.chapters);
            return this.chaptersConfig.chapters;
        } catch (e) {
            console.error('❌ Erreur lors du chargement des chapitres JSON:', e);
            this.chaptersConfig = {
                chapters: [],
                contentHash: null,
                version: null,
                generatedAt: null
            };
            return [];
        }
    },

    // Récupère le contentHash global depuis la configuration chargée
    getContentHash() {
        return this.chaptersConfig ? this.chaptersConfig.contentHash : null;
    },

    // Vérifie la cohérence en comparant le contentHash stocké avec le contentHash actuel
    async checkConsistency(existingChapters) {
        const currentContentHash = this.getContentHash();
        
        // Si pas de contentHash dans le JSON, on utilise l'ancienne méthode (vérification par IDs)
        if (!currentContentHash) {
            // Récupérer toutes les clés de stockage pour trouver les progressions
            const allKeys = await storage.keys();
            const progressKeys = allKeys.filter(key => key.startsWith('student_') && key.endsWith('_progress'));

            if (progressKeys.length === 0) return true;

            const existingIds = new Set(existingChapters.map(c => String(c.id)));

            for (const key of progressKeys) {
                const progressData = await storage.get(key) || {};
                if (progressData && progressData.chapters) {
                    const storedChapterIds = Object.keys(progressData.chapters);
                    for (const storedId of storedChapterIds) {
                        if (!existingIds.has(storedId)) {
                            return false; // incohérence détectée
                        }
                    }
                }
            }
            return true;
        }
        
        // Nouvelle méthode : comparaison du contentHash
        const allKeys = await storage.keys();
        const progressKeys = allKeys.filter(key => key.startsWith('student_') && key.endsWith('_progress'));

        if (progressKeys.length === 0) return true;

        for (const key of progressKeys) {
            const progressData = await storage.get(key) || {};
            const storedContentHash = progressData.contentHash;
            
            if (storedContentHash && storedContentHash !== currentContentHash) {
                return false; // contentHash différent = structure modifiée
            }
        }
        return true;
    },

    async resetProgressIfInconsistent(existingChapters) {
        const isConsistent = await this.checkConsistency(existingChapters);
        const currentContentHash = this.getContentHash();

        if (!isConsistent) {
            // Message plus intelligent selon la situation
            let message = '';
            
            if (currentContentHash) {
                // Nouveau format avec contentHash
                message = 
                    '⚠️ Changement détecté dans la structure des chapitres\n\n' +
                    'Le contenu des chapitres a été modifié depuis votre dernière visite.\n' +
                    'Votre progression actuelle peut ne plus être compatible.\n\n' +
                    'Que souhaitez-vous faire ?';
                
                // Proposer le choix : migration ou réinitialisation
                const userChoice = confirm(
                    message + '\n\n' +
                    'Cliquez sur OK pour MIGRER (conserver la progression existante)\n' +
                    'ou sur Annuler pour RÉINITIALISER (effacer toute la progression)'
                );
                
                if (userChoice) {
                    // Migration : on garde la progression mais on met à jour le contentHash
                    const allKeys = await storage.keys();
                    const progressKeys = allKeys.filter(key => key.startsWith('student_') && key.endsWith('_progress'));
                    
                    for (const key of progressKeys) {
                        const progressData = await storage.get(key) || {};
                        progressData.contentHash = currentContentHash;
                        await storage.set(key, progressData);
                    }
                    alert('✅ Progression migrée avec succès. Le nouveau contentHash a été enregistré.');
                } else {
                    // Réinitialisation complète
                    const allKeys = await storage.keys();
                    const progressKeys = allKeys.filter(key => key.startsWith('student_') && key.endsWith('_progress'));
                    
                    for (const key of progressKeys) {
                        await storage.remove(key);
                    }
                    await storage.remove('chapter_config');
                    alert('✅ Progression réinitialisée avec succès.');
                }
            } else {
                // Ancien format sans contentHash
                message = 
                    '⚠️ Incohérence détectée : des chapitres ont été modifiés ou supprimés.\n\n' +
                    'La progression stockée contient des données pour des chapitres qui n\'existent plus.\n\n' +
                    'Voulez-vous réinitialiser toute la progression des étudiants ?';
                
                const confirmed = confirm(message);
                if (confirmed) {
                    const allKeys = await storage.keys();
                    const progressKeys = allKeys.filter(key => key.startsWith('student_') && key.endsWith('_progress'));
                    
                    for (const key of progressKeys) {
                        await storage.remove(key);
                    }
                    await storage.remove('chapter_config');
                    alert('✅ Progression réinitialisée avec succès.');
                }
            }
        }
    },

    async detectAndUpdateIndex() {
        const existingChapters = await this.fetchChaptersFromJSON('./src/chapters/chapters_index.json'); // lit le JSON
        
        // Assigner la config complète à window.chaptersIndex pour accès global
        if (this.chaptersConfig) {
            window.chaptersIndex = this.chaptersConfig;
            console.log('[ChapterDetector] window.chaptersIndex assigné:', window.chaptersIndex);
        }
        
        await this.resetProgressIfInconsistent(existingChapters);

        const chaptersContainer = document.querySelector('.chapters');
        if (chaptersContainer) {
            if (existingChapters.length === 0) {
                chaptersContainer.innerHTML = `
                    <p style="color: #e74c3c; text-align: center; padding: 2rem;">
                        ⚠️ Aucun chapitre disponible pour le moment.
                    </p>`;
            } else {
                chaptersContainer.innerHTML = existingChapters.map((chapter, index) => `
                    <div class="chapter-card" data-chapter="${chapter.id}">
                        <h3>Chapitre ${chapter.id}</h3>
                        <p>${chapter.title}</p>
                        <div class="chapter-stats">
                            <div class="progress-ring" id="progress-ring-${chapter.id}">
                                <svg viewBox="0 0 36 36">
                                    <path class="progress-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#eee" stroke-width="3"/>
                                    <path class="progress-fill" id="progress-fill-${chapter.id}" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#3498db" stroke-width="3" stroke-dasharray="0, 100"/>
                                </svg>
                                <span class="progress-value" id="progress-value-${chapter.id}">0%</span>
                            </div>
                            <div class="chapter-grade" id="chapter-grade-${chapter.id}">Note: --</div>
                            <button class="details-btn" onclick="showChapterDetails('${chapter.id}')" title="Bilan des exercices"> ⭐ Voir le bilan</button>
                        </div>
                        <br>
                        <div class="chapter-status" id="chapter-${chapter.id}-status">🔒 Verrouillé</div>
                        <a href="./src/chapters/${chapter.href}" class="btn btn-primary">Accéder au chapitre</a>
                    </div>
                `).join('');
                
                // Mettre à jour les stats après le rendu
                this.updateChapterStats(existingChapters);
            }
        }
        return existingChapters;
    },

    // Mettre à jour l'affichage des stats pour chaque chapitre
    async updateChapterStats(chapters) {
        for (const chapter of chapters) {
            await this.updateSingleChapterStats(chapter.id);
        }
    },

    // Mettre à jour les stats d'un seul chapitre
    // Source de vérité : chapters_index.json (immutable et fiable)
    async updateSingleChapterStats(chapterId) {
        try {
            // Récupérer le token de session (qui est l'ID de l'élève)
            const token = sessionStorage.getItem('current_student_token');
            if (!token) return;

            // Source de vérité : chapters_index.json
            const chapterConfig = window.chaptersIndex?.chapters?.find(ch => ch.id == chapterId);
            if (!chapterConfig) {
                this.updateChapterDisplay(chapterId, 0, null);
                return;
            }

            // Récupérer la progression de l'élève
            const progressKey = `student_${token}_progress`;
            const progressData = await storage.get(progressKey) || {};
            const chapterProgress = progressData.chapters?.[chapterId];
            
            // Si pas de progression, afficher 0%
            if (!chapterProgress) {
                this.updateChapterDisplay(chapterId, 0, null);
                return;
            }

            // Calculer l'avancement depuis la source de vérité JSON
            const progressItemCount = chapterConfig.progressItemCount;
            const answeredQuestions = chapterProgress.answeredQuestions || 0;
            const answeredCourses = chapterProgress.answeredCourses || 0;
            const completedItems = answeredQuestions + answeredCourses;
            
            const progressPercent = progressItemCount > 0 
                ? Math.round((completedItems / progressItemCount) * 100) 
                : 0;

            console.log(`[updateSingleChapterStats] Chapitre ${chapterId}: progressItemCount=${progressItemCount}, completedItems=${completedItems} (${answeredQuestions} questions + ${answeredCourses} cours) => ${progressPercent}%`);

            // Calculer la note
            const totalQuestions = chapterConfig.questionCount;
            const correctQuestions = Object.values(chapterProgress.questions || {})
                .filter(q => q.isCorrect === true && !q.questionHash?.startsWith('course_'))
                .length;
            
            let note = null;
            if (totalQuestions > 0 && answeredQuestions === totalQuestions) {
                note = ((correctQuestions / totalQuestions) * 20).toFixed(1);
            }

            this.updateChapterDisplay(chapterId, progressPercent, note);
        } catch (error) {
            console.error(`Erreur mise à jour stats chapitre ${chapterId}:`, error);
        }
    },

    // Mettre à jour l'affichage d'un chapitre
    updateChapterDisplay(chapterId, progressPercent, note) {
        // Mettre à jour le cercle de progression
        const progressFill = document.getElementById(`progress-fill-${chapterId}`);
        const progressValue = document.getElementById(`progress-value-${chapterId}`);
        
        if (progressFill && progressValue) {
            progressFill.setAttribute('stroke-dasharray', `${progressPercent}, 100`);
            progressValue.textContent = `${progressPercent}%`;
            
            // Changer la couleur selon l'avancement
            if (progressPercent === 0) {
                progressFill.setAttribute('stroke', '#95a5a6');
            } else if (progressPercent < 50) {
                progressFill.setAttribute('stroke', '#e74c3c');
            } else if (progressPercent < 100) {
                progressFill.setAttribute('stroke', '#f39c12');
            } else {
                progressFill.setAttribute('stroke', '#27ae60');
            }
        }

        // Mettre à jour la note
        const gradeElement = document.getElementById(`chapter-grade-${chapterId}`);
        if (gradeElement) {
            if (note !== null) {
                gradeElement.textContent = `Note: ${note}/20`;
                gradeElement.classList.add('completed');
            } else {
                gradeElement.textContent = 'Note: --';
                gradeElement.classList.remove('completed');
            }
        }
    },

    async detectAndUpdateTeacher() {
        const existingChapters = await this.fetchChaptersFromJSON('../chapters/chapters_index.json');
        await this.resetProgressIfInconsistent(existingChapters);
        return existingChapters;
    }
};