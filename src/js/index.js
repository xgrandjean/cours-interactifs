/**
 * index.js - ORCHESTRATEUR ✅ CLEAN ARCHITECTURE — VERSION MULTI-PARCOURS
 *
 * Modifications par rapport à l'original :
 *  1. Le chemin vers chapters_index.json est construit depuis Parcours.homeUrl
 *     → pointe vers parcours/{slug}/src/chapters/chapters_index.json
 *  2. navigateToChapter utilise le même préfixe
 *  3. storage.get('chapter_config') passe par Parcours.scoped.config
 *     → clé Supabase : "nsi-term:config:chapter_config"
 *  Tout le reste est identique.
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
        // ── Chemin vers chapters_index.json ───────────────────────
        // Parcours.homeUrl = "/cours-interactifs/parcours/nsi-term/"
        // → fetch "/cours-interactifs/parcours/nsi-term/src/chapters/chapters_index.json"
        const chaptersJsonUrl = Parcours.homeUrl + 'src/chapters/chapters_index.json';

        const chapters = await this.repository.loadChapters(chaptersJsonUrl);
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

    // ── Navigation vers les chapitres ──────────────────────────
    // href = "chapitre1.html"
    // → "/cours-interactifs/parcours/nsi-term/src/chapters/chapitre1.html?t=..."
    window.navigateToChapter = function(href) {
        window.location.href = Parcours.homeUrl + 'src/chapters/' + href + '?t=' + Date.now();
    };
}

initApp();
