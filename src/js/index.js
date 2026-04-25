/**
 * index.js - ORCHESTRATEUR ✅ CLEAN ARCHITECTURE
 * 
 * ✅ UN SEUL POINT D'ENTREE
 * ✅ AUCUN EVENEMENT EXTERNE NECESSAIRE
 * ✅ PAS DE CONFLIT DE TIMING
 * ✅ PAS DE DOUBLE INITIALISATION
 */

import { ChapterRepository } from './core/chapterRepository.js';
import { ChapterRenderer } from './core/chapterRenderer.js';
import { computeChapterState } from './core/chapterState.js';

class StudentDashboard {
    constructor() {
        this.repository = new ChapterRepository(storage);
        this.renderer = new ChapterRenderer();
    }

    async init() {
        const chapters = await this.repository.loadChapters('./src/chapters/chapters_index.json');
        if (!chapters.length) return this.renderer.renderEmptyState();

        const token = sessionStorage.getItem('current_student_token');
        const progress = await this.repository.ensureConsistency(token);

        // ✅ Injecter la config storage comme sur les pages chapitre
        const storageConfig = await storage.get('chapter_config') || {};
        chapters.forEach(chapter => {
            if (storageConfig[chapter.id]) {
                Object.assign(chapter, storageConfig[chapter.id]);
            }
        });

        this.renderer.render(chapters, progress, computeChapterState, window.globalContext);

        window.chaptersIndex = Object.freeze({
            chapters,
            contentHash: this.repository.getContentHash()
        });

    }
}

async function initApp() {
    // ✅ Attendre que TOUS les scripts legacy soient bien initialisés
    if (document.readyState === 'loading') {
        await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
    }

    const dashboard = new StudentDashboard();
    await dashboard.init();

    window.dashboard = dashboard;
    window.StudentDashboard = StudentDashboard;

    // ✅ Navigation globale vers les chapitres
    window.navigateToChapter = function(href) {
        // Ajoute un timestamp pour éviter le cache navigateur
        window.location.href = './src/chapters/' + href + '?t=' + Date.now();
    };
}

// ✅ DEMARRAGE
initApp();
