/**
 * index.js - ORCHESTRATEUR ✅ CLEAN ARCHITECTURE — VERSION MULTI-PARCOURS
 *
 */

import { ChapterRepository } from './core/chapterRepository.js';
import { ChapterRenderer } from './core/chapterRenderer.js';
import { computeChapterState } from './core/chapterState.js';

class StudentDashboard {
    constructor() {
        this.repository = new ChapterRepository(storage);
        this.renderer   = new ChapterRenderer();
    }

    async init() {

        const response = await fetch((window.BASE || '') + '/parcours/cours.json');
        if (response.ok) {
            const data = await response.json();
            const parcours = data.parcours.find(p => p.slug === Parcours.slug);
            window.chaptersIndex = { chapters: parcours.chapitres };
        }

        const chapters = window.chaptersIndex?.chapters || [];
        if (!chapters.length) return this.renderer.renderEmptyState();

        const token    = Parcours.token || sessionStorage.getItem('current_student_token');
        const progress = await this.repository.ensureConsistency(token);

        // ── Config chapitres (lock, examMode, endDate) ─────────────
        // Utilise Parcours.scoped.config pour que la clé soit préfixée
        // "nsi-term:config:chapter_config" dans Supabase
        const storageConfig = await Parcours.scoped.config.get('chapter_config') || {};
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
    if (document.readyState === 'loading') {
        await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
    }

    const dashboard = new StudentDashboard();
    await dashboard.init();

    window.dashboard       = dashboard;
    window.StudentDashboard = StudentDashboard;

    window.navigateToChapter = function(chapterId) {
        window.location.href = Parcours.homeUrl + 'src/chapter_template.html?parcours=' + Parcours.slug + '&chapitre=' + chapterId + '&t=' + Date.now();
    };
}

initApp();
