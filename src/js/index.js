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
        console.log("🔥 INIT DASHBOARD START");

        const chapters = await this.repository.loadChapters('./src/chapters/chapters_index.json');
        if (!chapters.length) return this.renderer.renderEmptyState();

        const token = sessionStorage.getItem('current_student_token');
        const progress = await this.repository.ensureConsistency(token);

        this.renderer.render(chapters, progress, computeChapterState);

        window.chaptersIndex = Object.freeze({
            chapters,
            contentHash: this.repository.getContentHash()
        });

        console.log("✅ INIT DASHBOARD OK");
    }
}

async function initApp() {
    console.log("🚀 APP BOOTSTRAP - ES MODULE");

    // ✅ Attendre que TOUS les scripts legacy soient bien initialisés
    if (document.readyState === 'loading') {
        await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
    }

    // ✅ Attendre que chapitre.js ait bien injecté ses prototypes
    await new Promise(resolve => setTimeout(resolve, 0));

    const dashboard = new StudentDashboard();
    await dashboard.init();

    window.dashboard = dashboard;
    window.StudentDashboard = StudentDashboard;

    // ✅ Navigation globale vers les chapitres
    window.navigateToChapter = function(href) {
        // Ajoute un timestamp pour éviter le cache navigateur
        window.location.href = './src/chapters/' + href + '?t=' + Date.now();
    };

    console.log("✅ APP FULLY INITIALIZED");
}

// ✅ DEMARRAGE
initApp();
