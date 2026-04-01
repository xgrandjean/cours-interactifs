// chapterDetector.js - Détecte les chapitres via chapters_index.json
// et gère la cohérence des données de progression

const ChapterDetector = {

    async fetchChaptersFromJSON(pathname) {
        console.log("dossier de recherche du JSON:",pathname)
        try {
            const response = await fetch(pathname);
            if (!response.ok) throw new Error('Impossible de charger le JSON des chapitres');
            const chapters = await response.json();
            console.log('✅ Chapitres chargés depuis le fichier JSON:', chapters);
            return chapters;
        } catch (e) {
            console.error('❌ Erreur lors du chargement des chapitres JSON:', e);
            return [];
        }
    },

    checkConsistency(existingChapters) {
        const progressKeys = Object.keys(localStorage)
            .filter(key => key.startsWith('student_') && key.endsWith('_progress'));

        if (progressKeys.length === 0) return true;

        const existingIds = new Set(existingChapters.map(c => String(c.id)));

        for (const key of progressKeys) {
            const progressData = JSON.parse(localStorage.getItem(key) || '{}');
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
    },

    resetProgressIfInconsistent(existingChapters) {
        const isConsistent = this.checkConsistency(existingChapters);

        if (!isConsistent) {
            const confirmed = confirm(
                '⚠️ Incohérence détectée : des chapitres ont été modifiés ou supprimés.\n\n' +
                'La progression stockée contient des données pour des chapitres qui n\'existent plus.\n\n' +
                'Voulez-vous réinitialiser toute la progression des étudiants ?'
            );
            if (confirmed) {
                Object.keys(localStorage)
                    .filter(key => key.startsWith('student_') && key.endsWith('_progress'))
                    .forEach(key => localStorage.removeItem(key));
                localStorage.removeItem('chapter_config');
                alert('✅ Progression réinitialisée avec succès.');
            }
        }
    },

    async detectAndUpdateIndex() {
        const existingChapters = await this.fetchChaptersFromJSON('./src/chapters/chapters_index.json'); // lit le JSON
        this.resetProgressIfInconsistent(existingChapters);

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
                        <h3>${chapter.title}</h3>
                        <p>${index === 0 ? 'Découverte des concepts de base' : 'Suite de l\'apprentissage'}</p>
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
        this.resetProgressIfInconsistent(existingChapters);
        return existingChapters;
    }
};