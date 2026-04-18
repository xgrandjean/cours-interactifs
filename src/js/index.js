// index.js - Initialisation simplifiée pour la page d'accueil (Version 2.0)
// Ce fichier coordonne l'affichage des chapitres en utilisant chapterDetector.js et main.js
// Il ne duplique PAS la logique d'injection HTML

class StudentDashboard {
    constructor() {
        this.init();
    }

    async init() {
        // 1. Détecter et charger les chapitres (utilise chapterDetector.js)
        const existingChapters = await ChapterDetector.detectAndUpdateIndex('./src/chapters/');
        
        if (existingChapters.length === 0) {
            console.warn('⚠️ Aucun chapitre disponible');
            return;
        }

        // 2. Initialiser ProgressionSystem avec les chapitres détectés
        const progression = new ProgressionSystem();
        progression.chapters = existingChapters.map((c, i) => ({
            id: c.id,
            title: c.title,
            required: i > 0 ? existingChapters[i - 1].id : null
        }));

        // 3. Mettre à jour la progression et les statuts
        progression.updateProgress();
        progression.updateChapterStatus();

        console.log('✅ StudentDashboard initialisé avec', existingChapters.length, 'chapitres');
    }
}

// Exposer la classe globalement pour être initialisée SEULEMENT APRES vérification auth
window.StudentDashboard = StudentDashboard;
