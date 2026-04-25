/**
 * teacherDashboard.js - Contrôleur principal du tableau de bord formateur
 * Gère la navigation par onglets et l'initialisation des modules
 */

// Vérification de l'authentification formateur
if (sessionStorage.getItem('teacher_authenticated') !== 'true') {
    window.location.href = 'teacher-login.html';
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
        // Afficher le nom du formateur (admin par défaut)
        this.displayTeacherName();
        
        // Charger les chapitres
        await this.loadChapters();
        
        // Initialiser les modules
        this.initModules();
        
        // Configurer la navigation par onglets
        this.setupTabs();
        
        // Configurer les événements globaux
        this.setupEventListeners();
        
        // Activer l'onglet par défaut
        this.switchTab('chapters');
    }

    async displayTeacherName() {
        const display = document.getElementById('teacher-name-display');
        if (display) {
            // Vérifier s'il y a un formateur connecté
            const teacherName = sessionStorage.getItem('teacher_name');
            if (teacherName) {
                display.innerHTML = `Connecté en tant que : <strong>${teacherName}</strong>`;
            } else {
                // Par défaut, afficher Admin
                display.innerHTML = `Connecté en tant que : <strong>Admin</strong>`;
            }
        }
    }

    async loadChapters() {
        try {
            // Charger depuis chapters_index.json
            const response = await fetch('../chapters/chapters_index.json');
            const data = await response.json();
            this.chapters = data.chapters || [];
        } catch (error) {
            console.error('❌ Erreur chargement chapitres:', error);
            // Utiliser les chapitres par défaut
            this.chapters = [
                { id: 1, title: 'Chapitre 1: Introduction', required: null },
                { id: 2, title: 'Chapitre 2: Concepts Avancés', required: 1 },
                { id: 3, title: 'Chapitre 3: Exercices Pratiques', required: 2 }
            ];
        }
    }

    initModules() {
        // Initialiser les modules si ils sont disponibles
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
            btn.addEventListener('click', () => {
                const tabId = btn.dataset.tab;
                this.switchTab(tabId);
            });
        });
    }

    switchTab(tabId) {
        // Désactiver tous les onglets
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
        
        // Activer l'onglet sélectionné
        const activeBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
        const activePanel = document.getElementById(`tab-${tabId}`);
        
        if (activeBtn) activeBtn.classList.add('active');
        if (activePanel) activePanel.classList.add('active');
        
        this.currentTab = tabId;
        
        // Rafraîchir le module associé si nécessaire
        if (this.modules[tabId] && typeof this.modules[tabId].refresh === 'function') {
            this.modules[tabId].refresh();
        }
    }

    setupEventListeners() {
        // Bouton de déconnexion
        const logoutBtn = document.getElementById('logout-btn-header');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                sessionStorage.removeItem('teacher_authenticated');
                window.location.href = 'teacher-login.html';
            });
        }

        // Bouton de réinitialisation
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
        
        // Double confirmation
        const doubleConfirmed = confirm(
            '⚠️ DEUXIÈME CONFIRMATION\n\n' +
            'Voulez-vous VRAIMENT tout effacer ?\n' +
            'Cliquez sur OK pour confirmer la réinitialisation complète.'
        );
        
        if (!doubleConfirmed) return;
        
        try {
            // Récupérer toutes les clés et supprimer les progressions apprenant
            const allKeys = await storage.keys();
            const keysToRemove = allKeys.filter(key => 
                key.startsWith('student_') && key.endsWith('_progress')
            );
            
            for (const key of keysToRemove) {
                await storage.remove(key);
            }
            
            // Supprimer aussi les tentatives de questions
            const attemptKeys = allKeys.filter(key => 
                key.startsWith('question_attempts_')
            );
            for (const key of attemptKeys) {
                await storage.remove(key);
            }
            
            // Supprimer d'autres données
            await storage.remove('question_attempts');
            await storage.remove('chapter_config');
            await storage.remove('chapter_config_cache');
            await storage.remove('userAnswers');
            await storage.remove('userProgress');
            await storage.remove('courseProgress');
            await storage.remove('courseProgressRead');
            await storage.remove('course_progress');
            
            alert(
                `✅ Réinitialisation terminée !\n\n` +
                `${keysToRemove.length} progressions apprenants ont été effacées.\n` +
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

    // Méthodes utilitaires pour les modules
    
    async getStudents() {
        const users = await this.auth.getUsers();
        return users.filter(u => u.type === 'student');
    }

    async getStudentProgress(studentId) {
        const data = await storage.get(`student_${studentId}_progress`);
        return data || {
            chapters: {},
            scores: {},
            totalCompleted: 0,
            questionAttempts: {}
        };
    }

    async getChapterConfig(chapterId) {
        const config = await storage.get('chapter_config');
        if (!config) {
            return { locked: false, endDate: null, dateLimitEnabled: false, examMode: false };
        }
        return config[chapterId] || { locked: false, endDate: null, dateLimitEnabled: false, examMode: false };
    }

    async updateChapterConfig(chapterId, newConfig) {
        const currentConfig = await storage.get('chapter_config');
        let chapterConfig = currentConfig || {};
        
        chapterConfig[chapterId] = { ...chapterConfig[chapterId], ...newConfig };
        await storage.set('chapter_config', chapterConfig);
        
        // Vérification APRES sauvegarde
        const finalSaved = await storage.get('chapter_config');
    }

    // Navigation vers un chapitre en mode vue apprenant
    showStudentChapterView(studentId, chapterId) {
        if (this.modules.submissions && typeof this.modules.submissions.showStudentChapterView === 'function') {
            this.modules.submissions.showStudentChapterView(studentId, chapterId);
        }
    }

    // Ouvrir le modal de correction
    openCorrectionModal(studentId, chapterId) {
        if (this.modules.submissions && typeof this.modules.submissions.openCorrectionModal === 'function') {
            this.modules.submissions.openCorrectionModal(studentId, chapterId);
        }
    }

    /**
     * Met à jour le statut de soumission d'un chapitre pour un apprenant
     * Cette méthode est appelée depuis les actions formateur
     */
    async updateSubmissionStatus(studentId, chapterId, newStatus) {
        try {
            const progress = await this.getStudentProgress(studentId);
            
            // Initialiser le chapitre s'il n'existe pas encore
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
            // Cette date est réservée EXCLUSIVEMENT aux actions de l'apprenant lui même
            // Les actions formateur ne doivent pas modifier la date de dernière activité de l'apprenant
            
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
            await storage.set(`student_${studentId}_progress`, progress);
                        
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