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

        const data = await staticJson.get('/parcours/cours.json');

        if (data && Array.isArray(data.parcours)) {
            const parcours = data.parcours.find(p => p.slug === Parcours.slug);
            // Parcours retiré de cours.json : un message, au lieu de planter sur `undefined`.
            if (!parcours) return this.renderer.renderEmptyState('⚠️ Ce parcours n\'est plus en ligne.');
            // 📦 Archivé par le formateur : fermé aux élèves (la vue formateur l'ouvre encore).
            if (Parcours.estArchive(parcours) && !Parcours.estVueFormateur()) {
                return this.renderer.renderEmptyState('📦 Ce parcours est archivé : il n\'est plus ouvert aux élèves. Demandez à votre professeur le parcours de cette année.');
            }
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

        // La config déjà lue est transmise : le rendu ne la relit pas (deux lectures avant).
        this.renderer.render(chapters, progress, computeChapterState, token, storageConfig);

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
        window.location.href = (window.BASE || '') + '/parcours/src/chapter_template.html?parcours=' + Parcours.slug + '&chapitre=' + chapterId + '&t=' + Date.now();
    };
}

initApp();
