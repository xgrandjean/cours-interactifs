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
                        <br>
                        <div class="chapter-status" id="chapter-${chapter.id}-status">🔒 Verrouillé</div>
                        <a href="./src/chapters/${chapter.href}" class="btn btn-primary">Accéder au chapitre</a>
                    </div>
                `).join('');
            }
        }
        return existingChapters;
    },

    async detectAndUpdateTeacher() {
        const existingChapters = await this.fetchChaptersFromJSON('../chapters/chapters_index.json');
        await this.resetProgressIfInconsistent(existingChapters);
        return existingChapters;
    }
};