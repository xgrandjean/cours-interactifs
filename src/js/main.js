// ============================================================================
// MAIN.JS - Code générique de l'application (VERSION NETTOYÉE)
// ============================================================================

// ============================================================================
// UTILITAIRES DOM
// ============================================================================

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

// ============================================================================
// SYSTÈME DE PROGRESSION (PAGE ACCUEIL UNIQUEMENT)
// ============================================================================

class ProgressionSystem {
    constructor() {
        this.chapters = [
            { id: 1, title: 'Chapitre 1: Introduction', required: null },
            { id: 2, title: 'Chapitre 2: Concepts Avancés', required: 1 },
            { id: 3, title: 'Chapitre 3: Exercices Pratiques', required: 2 }
        ];
        
        this.auth = new DataStorage();
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.updateProgress();
        this.updateChapterStatus();
        this.updateProgressVisibility();
    }

    getProgress() {
        const token = sessionStorage.getItem('current_student_token');
        if (token) {
            return {
                chapters: {},
                scores: {},
                totalCompleted: 0,
                questionAttempts: {}
            };
        }
        return {
            chapters: {},
            scores: {},
            totalCompleted: 0
        };
    }

    async loadProgressFromManager() {
        const token = sessionStorage.getItem('current_student_token');
        if (token) {
            try {
                return await ProgressManager.loadProgress(token);
            } catch (error) {
                console.error('Erreur chargement ProgressManager:', error);
            }
        }
        return null;
    }

    saveProgress(progress) {
        if (this.auth && this.auth.currentStudent) {
            this.auth.saveStudentProgress(progress);
        } else {
            StorageService.set(STORAGE_KEYS.COURSE_PROGRESS, progress);
        }
    }

    getChapterConfig(chapterId) {
        const config = StorageService.get(STORAGE_KEYS.CHAPTER_CONFIG, {});
        return config[chapterId] || { locked: false, endDate: null };
    }

    async getChapterStatus(chapter, previousChapterCompleted) {
        if (!previousChapterCompleted) {
            return { key: 'locked', label: 'Verrouillé', icon: '🔒', className: 'status-locked' };
        }

        const token = sessionStorage.getItem('current_student_token');
        if (!token) {
            return { key: 'available', label: 'Disponible', icon: '🟢', className: 'status-available' };
        }

        const progressKey = `student_${token}_progress`;
        const progressData = await storage.get(progressKey) || {};
        const chapterProgress = progressData.chapters?.[chapter.id] || {};
        const submissionStatus = chapterProgress.submissionStatus;

        if (submissionStatus === 'validated') {
            return { key: 'corrected', label: 'Corrigé', icon: '✅', className: 'status-corrected' };
        }

        if (submissionStatus === 'submitted' || submissionStatus === 'late_submitted') {
            return { key: 'submitted', label: 'Rendu', icon: '📤', className: 'status-submitted' };
        }

        if (submissionStatus === 'returned_for_revision') {
            return { key: 'revision', label: 'À reprendre', icon: '✏️', className: 'status-revision' };
        }

        const hasStarted = Object.values(chapterProgress.questions || {}).some(q => {
            return (
                q.answered === true ||
                (typeof q.answer === 'string' && q.answer.trim() !== '') ||
                (Array.isArray(q.answer) && q.answer.length > 0)
            );
        });

        if (hasStarted) {
            return { key: 'in_progress', label: 'En cours', icon: '🟡', className: 'status-in-progress' };
        }

        return { key: 'available', label: 'Disponible', icon: '🟢', className: 'status-available' };
    }

    async updateChapterStatus() {
        for (const [index, chapter] of this.chapters.entries()) {
            const card = document.querySelector(`.chapter-card[data-chapter="${chapter.id}"]`);
            const status = document.getElementById(`chapter-${chapter.id}-status`);
            
            if (card && status) {
                const progress = this.getProgress();
                const previousChapterCompleted = index === 0 || 
                    (index > 0 && progress.chapters[this.chapters[index - 1].id]?.completed);
                
                const chapterStatus = await this.getChapterStatus(chapter, previousChapterCompleted);
                
                status.textContent = `${chapterStatus.icon} ${chapterStatus.label}`;
                status.className = `chapter-status ${chapterStatus.className}`;
                card.style.opacity = chapterStatus.key === 'locked' ? '0.5' : '1';
            }
        }
    }

    updateProgress() {
        const progress = this.getProgress();
        const totalChapters = this.chapters.length;
        const completedChapters = Object.values(progress.chapters).filter(c => c.completed).length;
        const percentage = totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : 0;

        const progressBar = document.getElementById('progress-fill');
        const progressText = document.getElementById('progress-text');

        if (progressBar) progressBar.style.width = percentage + '%';
        if (progressText) progressText.textContent = percentage + '% complété';
    }

    setupEventListeners() {
        const resetBtn = document.getElementById('reset-progress');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.resetProgress());
        }

        const scoresBtn = document.getElementById('show-scores');
        if (scoresBtn) {
            scoresBtn.addEventListener('click', () => this.showScores());
        }
    }

    resetProgress() {
        if (confirm('Réinitialiser la progression ?')) {
            StorageService.remove(STORAGE_KEYS.COURSE_PROGRESS);
            this.updateProgress();
            this.updateChapterStatus();
        }
    }

    showScores() {
        const progress = this.getProgress();
        let message = 'Scores :\n\n';
        
        this.chapters.forEach(chapter => {
            const data = progress.chapters[chapter.id];
            const score = data ? data.score : 0;
            message += `${chapter.title}: ${score}/100\n`;
        });

        alert(message);
    }

    updateProgressVisibility() {
        const el = document.getElementById('progress-overview');
        if (el) {
            el.style.display = this.auth?.currentStudent ? 'block' : 'none';
        }
    }
}

// ============================================================================
// CONFIG CHAPITRES
// ============================================================================

function getChapterConfigById(chapterId) {
    const config = StorageService.get(STORAGE_KEYS.CHAPTER_CONFIG, {});
    return config[chapterId] || { locked: false, endDate: null, examMode: false };
}

// ============================================================================
// INITIALISATION
// ============================================================================

window.APP_BASE_URL = (() => {
    const depth = (window.location.pathname.match(/\//g) || []).length - 1;
    return '../'.repeat(depth);
})();

async function initializeApp() {
    try {
        const response = await fetch(window.APP_BASE_URL + 'src/chapters/chapters_index.json');
        if (response.ok) {
            window.chaptersIndex = await response.json();

            const storageConfig = await storage.get('chapter_config');
            if (window.chaptersIndex?.chapters) {
                window.chaptersIndex.chapters = window.chaptersIndex.chapters.map(c => ({
                    ...c,
                    ...(storageConfig?.[c.id] || {})
                }));
            }
        }
    } catch (e) {
        console.warn('Erreur chargement chapters_index.json', e);
    }

    if (document.body.classList.contains('home') || !document.body.classList.length) {
        new ProgressionSystem();
    }
}

document.addEventListener('DOMContentLoaded', initializeApp);

// ============================================================================
// EXPORTS
// ============================================================================

window.ProgressionSystem = ProgressionSystem;
window.$ = $;
window.$$ = $$;
window.getChapterConfigById = getChapterConfigById;

console.log('✅ main.js CLEAN chargé');