/**
 * teacherDashboard.js - Contrôleur principal du tableau de bord formateur
 * Gère la navigation par onglets et l'initialisation des modules
 */

// Vérification de l'authentification formateur
if (sessionStorage.getItem('teacher_authenticated') !== 'true') {
    window.location.href = (window.BASE || '') + '/src/html/teacher-login.html';
}

// Classe principale du tableau de bord
class TeacherDashboard {
    constructor() {
        this.auth = new DataStorage();
        this.chapters = [];
        this.students = [];
        this.modules = {};
        this.currentTab = 'chapters';
        
        this.init();
    }

    async init() {    
        // Afficher le nom du formateur
        this.displayTeacherName();

        // Toujours configurer la déconnexion
        this.setupLogout();

        // ── Aucun parcours sélectionné → afficher message d'invite ──
        if (!window.currentParcoursSlug) {
            const placeholder = `
                <div style="display:flex; align-items:center; justify-content:center; min-height:200px;
                            color:#888; font-size:1.1rem; text-align:center; padding:2rem;">
                    <p>👆 Sélectionnez un parcours ci-dessus pour afficher son contenu.</p>
                </div>`;
            document.querySelectorAll('.tab-panel').forEach(panel => {
                panel.innerHTML = placeholder;
            });
            const dangerZone = document.querySelector('.danger-zone');
            if (dangerZone) dangerZone.style.display = 'none';
            document.body.style.opacity = '1';
            return;
        }

        // Charger les chapitres
        await this.loadChapters();
        
        // Initialiser les modules
        this.initModules();
        
        // Configurer la navigation par onglets
        this.setupTabs();
        
        // Configurer les événements globaux
        this.setupEventListeners();
        
        // ✅ Restaurer l'onglet sauvegardé ou utiliser 'chapters' par défaut
        const savedTab = sessionStorage.getItem('teacher_active_tab');
        const defaultTab = (savedTab && ['chapters', 'users', 'submissions', 'students', 'stats'].includes(savedTab)) 
            ? savedTab 
            : 'chapters';
        
        await this.switchTab(defaultTab);

        // Afficher la zone de danger
        const dangerZone = document.querySelector('.danger-zone');
        if (dangerZone) dangerZone.style.display = '';

        document.body.style.opacity = '1';
    }

    async displayTeacherName() {
        const display = document.getElementById('teacher-name-display');
        if (display) {
            const teacherName = sessionStorage.getItem('teacher_name');
            if (teacherName) {
                display.innerHTML = `Connecté en tant que : <strong>${teacherName}</strong>`;
            } else {
                display.innerHTML = `Connecté en tant que : <strong>Admin</strong>`;
            }
        }
    }

    async loadChapters() {
        const slug = window.currentParcoursSlug;
        const data = await staticJson.get('/parcours/cours.json');
        if (!data) {
            console.error(`❌ Erreur de chargement chapitres pour le parcours "${slug}"`);
            this.chapters = [];
            return;
        }
        const parcours = data.parcours.find(p => p.slug === slug);
        this.chapters = parcours ? parcours.chapitres : [];
    }
    
    initModules() {
        if (typeof TeacherChapters !== 'undefined') {
            this.modules.chapters = new TeacherChapters(this);
        }
        if (typeof TeacherUsers !== 'undefined') {
            this.modules.users = new TeacherUsers(this);
        }
        if (typeof TeacherSubmissions !== 'undefined') {
            this.modules.submissions = new TeacherSubmissions(this);
        }
        if (typeof TeacherStudents !== 'undefined') {
            this.modules.students = new TeacherStudents(this);
        }
        if (typeof TeacherStats !== 'undefined') {
            this.modules.stats = new TeacherStats(this);
        }
    }

    setupTabs() {
        const tabButtons = document.querySelectorAll('.tab-btn');
        tabButtons.forEach(btn => {
            btn.addEventListener('click', async () => {
                const tabId = btn.dataset.tab;
                await this.switchTab(tabId);
            });
        });
    }

    async switchTab(tabId) {
        // Sauvegarder l'onglet actif dans sessionStorage
        sessionStorage.setItem('teacher_active_tab', tabId);
        
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
        
        const activeBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
        const activePanel = document.getElementById(`tab-${tabId}`);
        
        if (activeBtn) activeBtn.classList.add('active');
        if (activePanel) activePanel.classList.add('active');
        
        this.currentTab = tabId;
        
        if (this.modules[tabId] && typeof this.modules[tabId].refresh === 'function') {
            await this.modules[tabId].refresh();
        }
    }
    
    setupLogout() {
        const logoutBtn = document.getElementById('logout-btn-header');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                sessionStorage.removeItem('teacher_authenticated');
                sessionStorage.removeItem('teacher_active_tab'); // ✅ Nettoyer
                window.location.href = (window.BASE || '') + '/src/html/teacher-login.html';
            });
        }
    }

    setupEventListeners() {
        const resetBtn = document.getElementById('reset-all-progress-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', async () => this.resetAllProgress());
        }
    }
    
    async resetAllProgress() {
        const confirmed = confirm(
            '⚠️ ATTENTION - Action Irréversible\n\n' +
            'Êtes-vous sûr de vouloir réinitialiser TOUTES les progressions de TOUS les apprenants ?\n\n' +
            'Cela effacera :\n' +
            '• Toutes les réponses aux questions\n' +
            '• Tous les scores et statistiques\n' +
            '• Tous les chapitres complétés\n' +
            '• Tout l\'historique des tentatives\n\n' +
            'Cette action ne peut pas être annulée.'
        );
        
        if (!confirmed) return;
        
        const doubleConfirmed = confirm(
            '⚠️ DEUXIÈME CONFIRMATION\n\n' +
            'Voulez-vous VRAIMENT tout effacer ?\n' +
            'Cliquez sur OK pour confirmer la réinitialisation complète.'
        );
        
        if (!doubleConfirmed) return;
        
        try {
            const slug = window.currentParcoursSlug;
            if (!slug) {
                alert('Aucun parcours sélectionné');
                return;
            }
            const prefix = `${slug}:`;
            
            const allKeys = await storage.keys();
            
            // ✅ Supprimer toutes les clés de progression des élèves (format: slug:studentId:student_..._progress)
            const progressKeys = allKeys.filter(key => 
                key.startsWith(prefix) && 
                key.includes(':student_') && 
                key.endsWith('_progress')
            );
            
            for (const key of progressKeys) {
                await storage.remove(key);
                console.log(`🗑️ Supprimé : ${key}`);
            }
            
            // ✅ (Optionnel) Supprimer également les anciennes clés sans slug (héritage)
            const legacyKeys = allKeys.filter(key => 
                key.startsWith('student_') && key.endsWith('_progress') && !key.includes(':')
            );
            for (const key of legacyKeys) {
                await storage.remove(key);
            }
            
            // ✅ Supprimer les tentatives (si elles existent sous forme de clés séparées)
            const attemptKeys = allKeys.filter(key => 
                key.startsWith(prefix) && key.includes('question_attempts_')
            );
            for (const key of attemptKeys) {
                await storage.remove(key);
            }
            
            // ✅ Supprimer les configurations spécifiques au parcours (optionnel)
            await storage.remove(prefix + 'chapter_config');
            await storage.remove(prefix + 'question_attempts');
            await storage.remove(prefix + 'userAnswers');
            await storage.remove(prefix + 'userProgress');
            await storage.remove(prefix + 'courseProgress');
            await storage.remove(prefix + 'course_progress');
            
            alert(
                `✅ Réinitialisation terminée !\n\n` +
                `${progressKeys.length} progressions apprenants ont été effacées.\n` +
                `${attemptKeys.length} historiques de tentatives ont été effacés.\n\n` +
                'Les apprenants peuvent maintenant recommencer les chapitres depuis le début.'
            );
            
            // Rafraîchir tous les modules
            Object.values(this.modules).forEach(module => {
                if (typeof module.refresh === 'function') {
                    module.refresh();
                }
            });
            
        } catch (error) {
            console.error('❌ Erreur réinitialisation:', error);
            alert('❌ Une erreur est survenue lors de la réinitialisation.');
        }
    }
    async getStudents() {
        const slug = window.currentParcoursSlug;
        if (!slug) return [];
        const usersKey = `${slug}:teacher:users_list`;
        const users = await storage.get(usersKey) || [];
        return users.filter(u => u.type === 'student');
    }

    async getStudentProgress(studentId) {
        const slug = window.currentParcoursSlug;
        if (!slug) return {};
        const key = `${slug}:${studentId}:student_${studentId}_progress`;
        const data = await storage.get(key);
        return data || {
            chapters: {},
            scores: {},
            totalCompleted: 0,
            questionAttempts: {}
        };
    }
    async getChapterConfig(chapterId) {
        const slug = window.currentParcoursSlug;
        if (!slug) return { locked: false, endDate: null, dateLimitEnabled: false, examMode: false };
        
        const configKey = `${slug}:config:chapter_config`;
        const config = await storage.get(configKey);
        if (!config) {
            return { locked: false, endDate: null, dateLimitEnabled: false, examMode: false };
        }
        return config[chapterId] || { locked: false, endDate: null, dateLimitEnabled: false, examMode: false };
    }

    async updateChapterConfig(chapterId, newConfig) {
        const slug = window.currentParcoursSlug;
        if (!slug) return;
        
        const configKey = `${slug}:config:chapter_config`;
        const currentConfig = await storage.get(configKey);
        let chapterConfig = currentConfig || {};
        chapterConfig[chapterId] = { ...chapterConfig[chapterId], ...newConfig };
        await storage.set(configKey, chapterConfig);
    }

    showStudentChapterView(studentId, chapterId) {
        if (this.modules.submissions && typeof this.modules.submissions.showStudentChapterView === 'function') {
            this.modules.submissions.showStudentChapterView(studentId, chapterId);
        }
    }

    openCorrectionModal(studentId, chapterId) {
        if (this.modules.submissions && typeof this.modules.submissions.openCorrectionModal === 'function') {
            this.modules.submissions.openCorrectionModal(studentId, chapterId);
        }
    }

    async updateSubmissionStatus(studentId, chapterId, newStatus) {
        try {
            const progress = await this.getStudentProgress(studentId);

            if (!progress.chapters[chapterId]) {
                progress.chapters[chapterId] = {
                    questions: {},
                    completionPercent: 0,
                    finalScore: 0
                };
            }

            const chapter = progress.chapters[chapterId];

            // Mettre à jour le statut
            chapter.submissionStatus = newStatus;
            // ❌ NE PAS METTRE A JOUR updatedAt !
            // Cette date est réservée EXCLUSIVEMENT aux actions de l'apprenant lui-même.
            // Les actions formateur ne doivent pas modifier la date de dernière activité de l'apprenant.

            // Ajouter des métadonnées selon le statut
            if (newStatus === 'submitted' || newStatus === 'late_submitted') {
                chapter.submittedAt = chapter.submittedAt || new Date().toISOString();
            } else if (newStatus === 'validated') {
                chapter.validatedAt = new Date().toISOString();
                chapter.completed = true;
            } else if (newStatus === 'returned_for_revision') {
                chapter.returnedAt = new Date().toISOString();
            }

            // Sauvegarder les modifications
            const slug = window.currentParcoursSlug;
            const key = slug ? `${slug}:${studentId}:student_${studentId}_progress` : `student_${studentId}_progress`;
            await storage.set(key, progress);
                        
            return true;
        } catch (error) {
            console.error('❌ Erreur lors de la mise à jour du statut:', error);
            alert('❌ Une erreur est survenue lors de la mise à jour du statut.');
            return false;
        }
    }
}

// Initialisation au chargement du DOM
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new TeacherDashboard();
});