/**
 * teacherDashboard.js - Tableau de bord professeur
 * Gestion de la progression, corrections et suivi des élèves
 */

// Vérification de l'authentification professeur (sessionStorage pour expiration à la fermeture)
if (sessionStorage.getItem('teacher_authenticated') !== 'true') {
    window.location.href = 'teacher-login.html';
}

// Système de tableau de bord pour le professeur
class TeacherDashboard {
    constructor(chapters = []) {
        this.auth = new DataStorage();
        // Utiliser les chapitres passés ou utiliser les valeurs par défaut
        this.chapters = chapters.length > 0 ? chapters : [
            { id: 1, title: 'Chapitre 1: Introduction', required: null },
            { id: 2, title: 'Chapitre 2: Concepts Avancés', required: 1 },
            { id: 3, title: 'Chapitre 3: Exercices Pratiques', required: 2 }
        ];
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.renderDashboard();
        this.renderSubmissions();
        this.setupRefreshButton();
    }

    // Obtenir tous les élèves
    async getStudents() {
        const users = await this.auth.getUsers();
        return users.filter(u => u.type === 'student');
    }

    // Obtenir les données de progression d'un élève
    async getStudentProgress(studentId) {
        const data = await storage.get(`student_${studentId}_progress`);
        if (!data) {
            return {
                chapters: {},
                scores: {},
                totalCompleted: 0,
                questionAttempts: {}
            };
        }
        return data;
    }

    async getChapterConfig(chapterId) {
        const config = await storage.get('chapter_config');

        if (!config) {
            return {            
                locked: false,
                endDate: null,
                dateLimitEnabled: false
            };
        }

        return config[chapterId] || { 
            locked: false, 
            endDate: null, 
            dateLimitEnabled: false 
        };
    }

    async isChapterExpired(chapterId) {
        const config = await this.getChapterConfig(chapterId);

        if (!config.dateLimitEnabled || !config.endDate) return false;

        const now = new Date();
        const endDate = new Date(config.endDate);

        return now > endDate;
    }

    async updateChapterConfig(chapterId, config) {
        const currentConfig = await storage.get('chapter_config');
        let chapterConfig = currentConfig || {};
        
        chapterConfig[chapterId] = config;
        await storage.set('chapter_config', chapterConfig);
    }

    // Toggle exam mode for a chapter
    async toggleChapterMode(chapterId, isExamMode) {
        const config = await this.getChapterConfig(chapterId);
        await this.updateChapterConfig(chapterId, {
            ...config,
            examMode: isExamMode  // true = mode examen (boutons cachés), false = mode normal
        });
        // Mettre à jour le cache
        this.chapterConfigs[chapterId] = await this.getChapterConfig(chapterId);
        this.renderChapterControls();
    }

    async calculateGlobalStats() {
        const students = await this.getStudents();
        const totalStudents = students.length;
        let activeStudents = 0;
        let totalCompletedChapters = 0;
        let totalSuccessRate = 0;

        for (const student of students) {
            const progress = await this.getStudentProgress(student.id);
            const completedChapters = Object.values(progress.chapters).filter(c => c.completed).length;
            
            if (completedChapters > 0) {
                activeStudents++;
                totalCompletedChapters += completedChapters;
            }

            // Calculer le taux de réussite moyen
            let studentTotalScore = 0;
            let studentChapterCount = 0;
            
            Object.values(progress.chapters).forEach(chapter => {
                if (chapter.score !== undefined) {
                    studentTotalScore += chapter.score;
                    studentChapterCount++;
                }
            });

            if (studentChapterCount > 0) {
                totalSuccessRate += (studentTotalScore / studentChapterCount);
            }
        }

        const globalSuccessRate = totalStudents > 0 ? Math.round((totalSuccessRate / totalStudents)) : 0;
        const completedChaptersRatio = `${totalCompletedChapters}/${totalStudents * this.chapters.length}`;

        return {
            globalSuccessRate,
            activeStudents: `${activeStudents}/${totalStudents}`,
            completedChapters: completedChaptersRatio
        };
    }

    async calculateChapterStats() {
        const students = await this.getStudents();
        const chapterStats = {};

        for (const chapter of this.chapters) {
            let totalScore = 0;
            let completedCount = 0;
            let attemptCount = 0;

            for (const student of students) {
                const progress = await this.getStudentProgress(student.id);
                const chapterData = progress.chapters[chapter.id];
                
                if (chapterData) {
                    attemptCount++;
                    if (chapterData.score !== undefined) {
                        totalScore += chapterData.score;
                    }
                    if (chapterData.completed) {
                        completedCount++;
                    }
                }
            }

            const avgScore = attemptCount > 0 ? Math.round(totalScore / attemptCount) : 0;
            const completionRate = students.length > 0 ? Math.round((completedCount / students.length) * 100) : 0;

            chapterStats[chapter.id] = {
                title: chapter.title,
                avgScore,
                completionRate,
                completedCount,
                attemptCount
            };
        }

        return chapterStats;
    }

    async calculateQuestionStats(chapterId) {
        const students = await this.getStudents();
        const questionStats = {};

        for (const student of students) {
            const progress = await this.getStudentProgress(student.id);
            const attempts = progress.questionAttempts[chapterId];
            
            if (attempts) {
                Object.keys(attempts).forEach(questionId => {
                    if (!questionStats[questionId]) {
                        questionStats[questionId] = {
                            attempts: 0,
                            correct: 0,
                            successRate: 0
                        };
                    }
                    
                    questionStats[questionId].attempts += attempts[questionId].attempts;
                    questionStats[questionId].correct += attempts[questionId].correct;
                });
            }
        }

        // Calculer les taux de réussite
        Object.keys(questionStats).forEach(questionId => {
            const stats = questionStats[questionId];
            stats.successRate = stats.attempts > 0 ? Math.round((stats.correct / stats.attempts) * 100) : 0;
        });

        return questionStats;
    }

    // Rendre le tableau de bord
    renderDashboard() {
        this.renderGlobalStats();
        this.renderChapterControls();
        this.renderChapterStats();
        this.renderStudentsList();
    }

    async renderGlobalStats() {
        const stats = await this.calculateGlobalStats();
        
        document.getElementById('global-success-rate').textContent = stats.globalSuccessRate + '%';
        document.getElementById('active-students').textContent = stats.activeStudents;
        document.getElementById('completed-chapters').textContent = stats.completedChapters;
    }

    async renderChapterControls() {
        const grid = document.getElementById('chapter-controls-grid');
        let html = '';

        for (const chapter of this.chapters) {
            const config = await this.getChapterConfig(chapter.id);
            const isLocked = config.locked;
            const isDateEnabled = config.dateLimitEnabled === true;

            // Valeurs date et heure
            const dateValue = config.endDate ? config.endDate.split('T')[0] : '';
            const hourValue = config.endDate ? config.endDate.split('T')[1].split(':')[0] : '19';

            const isExpired = await this.isChapterExpired(chapter.id);

            // Statut
            let statusClass = 'status-available';
            let statusText = 'Disponible';
            if (isLocked) {
                statusClass = 'status-locked';
                statusText = 'Verrouillé';
            } else if (isExpired) {
                statusClass = 'status-expired';
                statusText = 'Expiré';
            }

            const isExamMode = config.examMode === true;

            html += `
                <div class="chapter-control-card">
                    <div class="control-header">
                        <h4>${chapter.title}</h4>
                        <span class="control-status ${statusClass}">${statusText}</span>
                    </div>

                    <div class="control-actions">
                        <button class="control-btn btn-unlock" onclick="dashboard.toggleChapterLock(${chapter.id})">
                            ${isLocked ? '🔓 Déverrouiller' : '🔒 Verrouiller'}
                        </button>
                    </div>

                    
                    <div class="control-actions" style="margin-top: 1rem;">
                        <label class="date-limit-toggle">
                            <input type="checkbox" 
                                ${isExamMode ? 'checked' : ''}
                                onchange="dashboard.toggleChapterMode(${chapter.id}, this.checked)">
                            <span>📝 Mode examen </span>
                        </label>
                    </div>
                    
                    <div class="control-actions" style="flex-direction: column; gap: 0.5rem;">
                        <!-- Checkbox sur sa propre ligne -->
                        <label class="date-limit-toggle">
                            <input type="checkbox" ${isDateEnabled ? 'checked' : ''} 
                                onchange="dashboard.toggleDateLimit(${chapter.id}, this.checked)">
                            Limite de date
                        </label>

                        <!-- Date et heure sur la même ligne -->
                        <div style="display: flex; gap: 0.5rem; align-items: center;">
                            <input type="date"
                                id="date-input-${chapter.id}"
                                value="${dateValue}"
                                ${isDateEnabled ? '' : 'disabled'}
                                onchange="dashboard.updateChapterDate(${chapter.id})"
                            >
                            <select id="hour-select-${chapter.id}" 
                                ${isDateEnabled ? '' : 'disabled'}
                                onchange="dashboard.updateChapterDate(${chapter.id})"
                            >
                                ${[...Array(24).keys()].map(h => 
                                    `<option value="${h}" ${h==hourValue?'selected':''}>${h}h</option>`).join('')}
                            </select>
                        </div>
                    </div>
                </div>
            `;
        }

        grid.innerHTML = html;
    }            

    async renderChapterStats() {
        const stats = await this.calculateChapterStats();
        const grid = document.getElementById('chapter-stats-grid');
        let html = '';

        this.chapters.forEach(chapter => {
            const chapterStats = stats[chapter.id];
            
            html += `
                <div class="stat-item">
                    <span>${chapter.title}</span>
                    <div class="progress-bar-small">
                        <div class="progress-fill-small" style="width: ${chapterStats.completionRate}%"></div>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 0.8rem; color: #666;">
                        <span>Taux de réussite: ${chapterStats.avgScore}%</span>
                        <span>Complétions: ${chapterStats.completedCount}/${chapterStats.attemptCount}</span>
                    </div>
                </div>
            `;
        });

        grid.innerHTML = html;
    }

    async renderStudentsList() {
        const students = await this.getStudents();
        const grid = document.getElementById('students-grid');
        let html = '';

        if (students.length === 0) {
            html = '<div class="empty-state">Aucun élève enregistré. Veuillez ajouter des élèves dans la section "Gérer les Utilisateurs".</div>';
        } else {
            for (const student of students) {
                const progress = await this.getStudentProgress(student.id);
                const completedChapters = Object.values(progress.chapters).filter(c => c.completed).length;
                const totalChapters = this.chapters.length;
                const completionRate = totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : 0;

                let avgScore = 0;
                let scoreCount = 0;
                Object.values(progress.chapters).forEach(chapter => {
                    if (chapter.score !== undefined) {
                        avgScore += chapter.score;
                        scoreCount++;
                    }
                });
                avgScore = scoreCount > 0 ? Math.round(avgScore / scoreCount) : 0;

                html += `
                    <div class="student-card">
                        <div class="student-header">
                            <h4>${student.name}</h4>
                            <span class="student-class">${student.class}</span>
                        </div>
                        
                        <div class="student-stats">
                            <div class="stat-row">
                                <span>Progression</span>
                                <span>${completionRate}% (${completedChapters}/${totalChapters})</span>
                            </div>
                            <div class="stat-row">
                                <span>Moyenne générale</span>
                                <span>${avgScore}%</span>
                            </div>
                            <div class="stat-row">
                                <span>Dernière activité</span>
                                <span>${this.getLastActivity(progress)}</span>
                            </div>
                        </div>

                        <div class="chapter-list">
                            <ul>
                        ${this.chapters.map(chapter => {
                            const chapterData = progress.chapters[chapter.id] || { completed: false, score: 0 };
                            // Note: config et isExpired sont gérés de manière synchrone ici car déjà chargés
                            const config = this.chapterConfigs && this.chapterConfigs[chapter.id];
                            const isLocked = config ? config.locked : false;
                            const isExpired = config && config.dateLimitEnabled && config.endDate ? new Date() > new Date(config.endDate) : false;
                                    
                                    let statusClass = 'status-not-started';
                                    let statusText = 'Non commencé';
                                    
                                    if (chapterData.completed) {
                                        statusClass = 'status-completed';
                                        statusText = 'Validé';
                                    } else if (chapterData.score > 0) {
                                        statusClass = 'status-in-progress';
                                        statusText = 'En cours';
                                    } else if (isExpired) {
                                        statusClass = 'status-expired';
                                        statusText = 'Expiré';
                                    } else if (isLocked) {
                                        statusClass = 'status-locked';
                                        statusText = '🔒';
                                    }

                                    // Afficher le bouton "Vue élève" seulement si l'élève a commencé le chapitre
                                    const hasStarted = chapterData.questions && Object.keys(chapterData.questions).length > 0;

                                    return `
                                        <li>
                                            <a class="chapter-link" onclick="dashboard.showChapterDetails('${student.id}', ${chapter.id})">
                                                ${chapter.title}
                                            </a>
                                            <span class="status-badge ${statusClass}">${statusText}</span>
                                            ${hasStarted ? `
                                            <button class="btn-view-student" onclick="dashboard.showStudentChapterView('${student.id}', ${chapter.id})" title="Voir les réponses de l'élève">
                                                👁️
                                            </button>
                                            ` : ''}
                                        </li>
                                    `;
                                }).join('')}
                            </ul>
                        </div>
                    </div>
                `;
            }
        }

        grid.innerHTML = html;
    }

    getLastActivity(progress) {
        let latestDate = null;
        
        Object.values(progress.chapters).forEach(chapter => {
            if (chapter.timestamp) {
                const date = new Date(chapter.timestamp);
                if (!latestDate || date > latestDate) {
                    latestDate = date;
                }
            }
        });

        return latestDate ? latestDate.toLocaleDateString('fr-FR') : 'Jamais';
    }

    async showChapterDetails(studentId, chapterId) {
        const users = await this.auth.getUsers();
        const student = users.find(u => u.id === studentId);
        const progress = await this.getStudentProgress(studentId);
        const questionStats = await this.calculateQuestionStats(chapterId);

        const chapterData = progress.chapters[chapterId] || { score: 0, completed: false, timestamp: null };
        const chapter = this.chapters.find(c => c.id === chapterId);

        let modalHtml = `
            <div class="modal-overlay" id="chapter-modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Détails du Chapitre - ${chapter.title}</h3>
                        <button class="close-btn" onclick="dashboard.closeModal()">&times;</button>
                    </div>
                    
                    <div class="chapter-details">
                        <h4>Informations sur l'élève</h4>
                        <div class="chapter-info">
                            <span><strong>Élève:</strong> ${student.name}</span>
                            <span><strong>Classe:</strong> ${student.class}</span>
                            <span><strong>Score:</strong> ${chapterData.score}/100</span>
                            <span><strong>Statut:</strong> ${chapterData.completed ? 'Validé' : 'En cours'}</span>
                        </div>
                        <div class="chapter-info">
                            <span><strong>Date de dernière tentative:</strong> ${chapterData.timestamp ? new Date(chapterData.timestamp).toLocaleString('fr-FR') : 'Jamais'}</span>
                        </div>
                    </div>

                    <div class="chapter-details">
                        <h4>Statistiques des Questions</h4>
                        <div id="question-stats-list">
                            ${this.renderQuestionStats(questionStats)}
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    renderQuestionStats(questionStats) {
        let html = '';
        
        Object.keys(questionStats).forEach(questionId => {
            const stats = questionStats[questionId];
            html += `
                <div class="question-detail">
                    <span>Question ${questionId}</span>
                    <span>${stats.successRate}% (${stats.correct}/${stats.attempts})</span>
                </div>
            `;
        });

        if (!html) {
            html = '<div style="text-align: center; color: #666; padding: 1rem;">Aucune donnée de question disponible</div>';
        }

        return html;
    }

    closeModal() {
        const modal = document.getElementById('chapter-modal');
        if (modal) {
            modal.remove();
        }
    }

    // Afficher la vue élève - le chapitre tel que l'élève le voit via iframe (lecture seule)
    async showStudentChapterView(studentId, chapterId) {
        const users = await this.auth.getUsers();
        const student = users.find(u => u.id === studentId);
        const chapterConfig = this.chapters.find(c => c.id === chapterId);
        
        if (!student || !chapterConfig) {
            alert('Élève ou chapitre introuvable');
            return;
        }

        // Déterminer le fichier du chapitre
        // Les chapitres sont dans src/chapters/ avec des noms comme chapitre1.html, chapitre2.html, etc.
        const chapterFileName = `chapitre${chapterId}.html`;
        const chapterUrl = `../chapters/${chapterFileName}?teacher_view=true&student_id=${studentId}&t=${Date.now()}`;

        const modalHtml = `
            <div class="modal-overlay" id="student-chapter-view-modal">
                <div class="modal-content" style="max-width: 95%; width: 95%; max-height: 90vh; padding: 0; overflow: hidden;">
                    <div class="modal-header" style="background: #2c3e50; color: white; margin: 0; padding: 1rem 2rem; border-radius: 0;">
                        <h3 style="margin: 0; color: white;">👁️ Vue Élève - ${chapterConfig.title} (${student.name})</h3>
                        <button class="close-btn" onclick="dashboard.closeStudentChapterView()" style="color: white;">&times;</button>
                    </div>
                    
                    <div class="teacher-view-banner" style="background: #fff3cd; color: #856404; padding: 0.75rem 1rem; text-align: center; font-weight: bold; border-bottom: 1px solid #ffc107;">
                        👨‍🏫 Mode Professeur - Lecture seule - Vous voyez ce que l'élève voit
                    </div>
                    
                    <div style="height: calc(90vh - 120px);">
                        <iframe 
                            id="student-chapter-iframe"
                            src="${chapterUrl}" 
                            style="width: 100%; height: 100%; border: none;"
                            title="Vue élève du chapitre"
                        ></iframe>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    closeStudentChapterView() {
        const modal = document.getElementById('student-chapter-view-modal');
        if (modal) {
            modal.remove();
        }
    }

    // Contrôle des chapitres
    async toggleChapterLock(chapterId) {
        const config = await this.getChapterConfig(chapterId);
        await this.updateChapterConfig(chapterId, {
            ...config,
            locked: !config.locked
        });
        // Mettre à jour le cache
        this.chapterConfigs[chapterId] = await this.getChapterConfig(chapterId);
        this.renderChapterControls();
    }

    async toggleDateLimit(chapterId, enabled) {
        const config = await this.getChapterConfig(chapterId);
        const dateInput = document.getElementById(`date-input-${chapterId}`);

        if (enabled) {
            dateInput.disabled = false;

            let endDate = config.endDate;

            if (!endDate) {
                const defaultDate = new Date();
                defaultDate.setDate(defaultDate.getDate() + 7);
                defaultDate.setHours(19, 0, 0, 0);

                endDate = defaultDate.toISOString();
                dateInput.value = endDate.split('T')[0];
            }

            await this.updateChapterConfig(chapterId, {
                ...config,
                endDate: endDate,
                dateLimitEnabled: true
            });

        } else {
            dateInput.disabled = true;

            await this.updateChapterConfig(chapterId, {
                ...config,
                dateLimitEnabled: false // ✅ on désactive sans supprimer la date
            });
        }

        // Mettre à jour le cache
        this.chapterConfigs[chapterId] = await this.getChapterConfig(chapterId);
        this.renderChapterControls();
    }

    async updateChapterDate(chapterId) {
        const dateInput = document.getElementById(`date-input-${chapterId}`);
        const hourSelect = document.getElementById(`hour-select-${chapterId}`);
        const config = await this.getChapterConfig(chapterId);

        if (!dateInput.value) return; // rien à faire si pas de date

        // On ajoute l'heure choisie pour fixer le fuseau correctement
        const selectedDate = dateInput.value; // "2026-03-23"
        const selectedHour = hourSelect ? hourSelect.value : '19';

        const endDate = `${selectedDate}T${selectedHour.padStart(2,'0')}:00:00`; // "2026-03-23T19:00:00"
        await this.updateChapterConfig(chapterId, {
            ...config,
            endDate: endDate
        });

        // Mettre à jour le cache
        this.chapterConfigs[chapterId] = await this.getChapterConfig(chapterId);
        this.renderChapterControls();
    }

    async clearChapterDate(chapterId) {
        const config = await this.getChapterConfig(chapterId);
        await this.updateChapterConfig(chapterId, {
            ...config,
            endDate: null
        });
        // Mettre à jour le cache
        this.chapterConfigs[chapterId] = await this.getChapterConfig(chapterId);
        this.renderChapterControls();
    }

    // Réinitialiser toutes les progressions de tous les élèves
    async resetAllProgress() {
        const confirmed = confirm(
            '⚠️ ATTENTION - Action Irréversible\n\n' +
            'Êtes-vous sûr de vouloir réinitialiser TOUTES les progressions de TOUS les élèves ?\n\n' +
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
        
        // Récupérer toutes les clés et supprimer les progressions étudiant
        const allKeys = await storage.keys();
        const keysToRemove = allKeys.filter(key => 
            key.startsWith('student_') && key.endsWith('_progress')
        );
        
        for (const key of keysToRemove) {
            await storage.remove(key);
        }
        
        // Supprimer aussi les tentatives de questions (ancien format)
        const attemptKeys = allKeys.filter(key => 
            key.startsWith('question_attempts_')
        );
        for (const key of attemptKeys) {
            await storage.remove(key);
        }
        
        // Supprimer les tentatives de questions (nouveau format - AttemptTracker)
        await storage.remove('question_attempts');
        
        // Supprimer la configuration des chapitres
        await storage.remove('chapter_config');
        
        // Supprimer le cache de configuration
        await storage.remove('chapter_config_cache');
        
        // Supprimer les réponses des utilisateurs
        await storage.remove('userAnswers');
        
        // Supprimer la progression des points
        await storage.remove('userProgress');
        
        // Supprimer la progression du cours
        await storage.remove('courseProgress');
        
        // Supprimer la progression de lecture des cours
        await storage.remove('courseProgressRead');
        
        // Supprimer l'ancien format de progression du cours
        await storage.remove('course_progress');
        
        alert(
            `✅ Réinitialisation terminée !\n\n` +
            `${keysToRemove.length} progressions élèves ont été effacées.\n` +
            `${attemptKeys.length} historiques de tentatives ont été effacés.\n\n` +
            'Les élèves peuvent maintenant recommencer les chapitres depuis le début.'
        );
        
        // Rafraîchir le tableau de bord
        this.renderDashboard();
    }

    setupEventListeners() {
        // Gestion de la déconnexion (bouton en haut à droite)
        const logoutBtn = document.getElementById('logout-btn-header');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                sessionStorage.removeItem('teacher_authenticated');
                window.location.href = 'teacher-login.html';
            });
        }
    }

    setupRefreshButton() {
        const refreshBtn = document.getElementById('refresh-dashboard');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.renderDashboard();
            });
        }
    }

    // ============================
    // GESTION DES RENDUS (SOUMISSIONS)
    // ============================

    // Obtenir toutes les soumissions à corriger
    async getSubmissions() {
        const students = await this.getStudents();
        const submissions = [];

        for (const student of students) {
            const progress = await this.getStudentProgress(student.id);
            
            for (const chapter of this.chapters) {
                const chapterData = progress.chapters[chapter.id];
                if (!chapterData) continue;
                
                // Vérifier si le chapitre a été soumis ou necesita correction
                const needsCorrection = 
                    chapterData.submissionStatus === 'submitted' ||
                    chapterData.submissionStatus === 'late_submitted' ||
                    chapterData.submissionStatus === 'returned_for_revision' ||
                    chapterData.correctionStatus === 'pending_review' ||
                    chapterData.correctionStatus === 'in_progress';
                
                if (needsCorrection) {
                    submissions.push({
                        studentId: student.id,
                        studentName: student.name,
                        studentClass: student.class,
                        chapterId: chapter.id,
                        chapterTitle: chapter.title,
                        ...chapterData
                    });
                }
            }
        }

        // Trier par priorité et date
        return submissions.sort((a, b) => {
            // Priorité aux retards
            if (a.submissionStatus === 'late_submitted' && b.submissionStatus !== 'late_submitted') return -1;
            if (b.submissionStatus === 'late_submitted' && a.submissionStatus !== 'late_submitted') return 1;
            
            // Puis par date de soumission (plus récent en premier)
            const dateA = new Date(a.submittedAt || a.updatedAt || 0);
            const dateB = new Date(b.submittedAt || b.updatedAt || 0);
            return dateB - dateA;
        });
    }

    // Filtrer les soumissions
    async filterSubmissions() {
        const statusFilter = document.getElementById('filter-status').value;
        const chapterFilter = document.getElementById('filter-chapter').value;
        const priorityFilter = document.getElementById('filter-priority').value;

        let submissions = await this.getSubmissions();

        // Appliquer les filtres
        if (statusFilter !== 'all') {
            if (statusFilter === 'pending_review') {
                submissions = submissions.filter(s => s.correctionStatus === 'pending_review' || s.correctionStatus === 'in_progress');
            } else {
                submissions = submissions.filter(s => s.submissionStatus === statusFilter);
            }
        }

        if (chapterFilter !== 'all') {
            submissions = submissions.filter(s => s.chapterId == chapterFilter);
        }

        if (priorityFilter !== 'all') {
            submissions = submissions.filter(s => {
                const priority = s.teacherMonitoring?.priorityLevel || 'normal';
                return priority === priorityFilter;
            });
        }

        this.renderSubmissionsList(submissions);
    }

    // Afficher la liste des soumissions
    async renderSubmissions() {
        const submissions = await this.getSubmissions();
        this.renderSubmissionsList(submissions);
        
        // Peupler le filtre des chapitres
        const chapterFilter = document.getElementById('filter-chapter');
        chapterFilter.innerHTML = '<option value="all">Tous</option>';
        this.chapters.forEach(chapter => {
            const option = document.createElement('option');
            option.value = chapter.id;
            option.textContent = chapter.title;
            chapterFilter.appendChild(option);
        });
    }

    renderSubmissionsList(submissions) {
        const grid = document.getElementById('submissions-grid');
        
        if (submissions.length === 0) {
            grid.innerHTML = `
                <div class="empty-submissions">
                    <p>🎉 Aucun rendu à corriger !</p>
                    <small>Tous les chapitres soumis ont été corrigés.</small>
                </div>
            `;
            return;
        }

        let html = '';
        submissions.forEach(sub => {
            const isLate = sub.submissionStatus === 'late_submitted';
            const isReturned = sub.submissionStatus === 'returned_for_revision';
            const isPending = sub.correctionStatus === 'pending_review';
            
            let cardClass = '';
            if (isLate) cardClass = 'late';
            else if (isReturned) cardClass = 'returned';
            else if (isPending) cardClass = 'pending';

            let badgeClass = 'badge-submitted';
            let badgeText = 'Soumis';
            if (isLate) { badgeClass = 'badge-late'; badgeText = 'En retard'; }
            else if (isReturned) { badgeClass = 'badge-returned'; badgeText = 'À revoir'; }

            const submittedDate = sub.submittedAt ? new Date(sub.submittedAt).toLocaleString('fr-FR') : 'N/A';
            const pendingCount = sub.pendingCorrectionCount || 0;
            const correctedCount = sub.correctedQuestionCount || 0;
            const totalManual = sub.manualCorrectionCount || 0;

            html += `
                <div class="submission-card ${cardClass}">
                    <div class="submission-header">
                        <h4>${sub.studentName}</h4>
                        <span class="submission-badge ${badgeClass}">${badgeText}</span>
                    </div>
                    <div class="submission-info">
                        <strong>Chapitre:</strong> ${sub.chapterTitle}<br>
                        <strong>Classe:</strong> ${sub.studentClass}<br>
                        <strong>Soumis le:</strong> ${submittedDate}<br>
                        <strong>Score actuel:</strong> ${sub.finalScore || 0} points
                    </div>
                    <div class="submission-info">
                        <strong>Correction:</strong> ${correctedCount}/${totalManual} questions corrigées
                        ${pendingCount > 0 ? `<span style="color: #e67e22;"> (${pendingCount} en attente)</span>` : ''}
                    </div>
                    <div class="submission-actions">
                        <button class="btn-correct" onclick="dashboard.openCorrectionModal('${sub.studentId}', ${sub.chapterId})">
                            ✏️ Corriger
                        </button>
                        ${isPending || correctedCount === totalManual ? `
                        <button class="btn-approve" onclick="dashboard.approveChapter('${sub.studentId}', ${sub.chapterId})">
                            ✅ Valider
                        </button>
                        ` : ''}
                        <button class="btn-return" onclick="dashboard.returnForRevision('${sub.studentId}', ${sub.chapterId})">
                            🔄 Renvoyer
                        </button>
                    </div>
                </div>
            `;
        });

        grid.innerHTML = html;
    }

    // Ouvrir le modal de correction
    async openCorrectionModal(studentId, chapterId) {
        const users = await this.auth.getUsers();
        const student = users.find(u => u.id === studentId);
        const progress = await this.getStudentProgress(studentId);
        const chapter = progress.chapters[chapterId];
        const chapterConfig = this.chapters.find(c => c.id === chapterId);

        if (!chapter || !chapterConfig) {
            alert('Chapitre introuvable');
            return;
        }

        // Récupérer les questions qui nécessitent une correction manuelle
        const questionsToCorrect = [];
        if (chapter.questions) {
            Object.entries(chapter.questions).forEach(([questionId, questionData]) => {
                // Skip les cours
                if (questionId.startsWith('course_')) return;
                
                if (questionData.needsManualCorrection && 
                    (questionData.manualCorrectionStatus === 'pending' || 
                     questionData.manualCorrectionStatus === 'not_needed')) {
                    questionsToCorrect.push({
                        id: questionId,
                        ...questionData
                    });
                }
            });
        }

        let questionsHtml = '';
        if (questionsToCorrect.length === 0) {
            questionsHtml = '<p style="text-align: center; color: #666; padding: 1rem;">Toutes les questions ont déjà été corrigées.</p>';
        } else {
            questionsToCorrect.forEach(q => {
                const answer = q.answer || '(pas de réponse)';
                const status = q.manualCorrectionStatus;
                
                questionsHtml += `
                    <div class="question-correction" id="correction-${q.id}">
                        <div class="question-correction-header">
                            <h6>Question: ${q.id}</h6>
                            <span class="status-badge status-${status === 'pending' ? 'pending-review' : 'corrected'}">${status}</span>
                        </div>
                        <div class="question-answer">
                            <strong>Réponse de l'élève:</strong><br>
                            ${answer}
                        </div>
                        <div class="correction-inputs">
                            <div class="form-group">
                                <label>Score (/$(chapterConfig.questions?.find(qc => qc.id === q.id)?.points || 0))</label>
                                <input type="number" id="score-${q.id}" min="0" 
                                    max="${chapterConfig.questions?.find(qc => qc.id === q.id)?.points || 0}" 
                                    value="${q.teacherScore || 0}" step="0.5">
                            </div>
                            <div class="form-group">
                                <label>Commentaire</label>
                                <textarea id="comment-${q.id}" placeholder="Commentaire pour l'élève...">${q.teacherComment || ''}</textarea>
                            </div>
                            <div style="display: flex; gap: 0.5rem; flex-direction: column;">
                                <button class="btn-save-correction" onclick="dashboard.saveQuestionCorrection('${studentId}', ${chapterId}, '${q.id}')">
                                    💾 Sauvegarder
                                </button>
                                <button class="btn-return-question" onclick="dashboard.returnQuestion('${studentId}', ${chapterId}, '${q.id}')">
                                    🔄 Renvoyer
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            });
        }

        const modalHtml = `
            <div class="modal-overlay" id="correction-modal">
                <div class="modal-content" style="max-width: 900px;">
                    <div class="modal-header">
                        <h3>Correction - ${chapterConfig.title}</h3>
                        <button class="close-btn" onclick="dashboard.closeCorrectionModal()">&times;</button>
                    </div>
                    
                    <div class="chapter-details">
                        <h4>Informations</h4>
                        <div class="chapter-info">
                            <span><strong>Élève:</strong> ${student.name}</span>
                            <span><strong>Classe:</strong> ${student.class}</span>
                            <span><strong>Score actuel:</strong> ${chapter.finalScore || 0}/${chapter.maxPoints || 0}</span>
                            <span><strong>Statut:</strong> ${chapter.submissionStatus}</span>
                        </div>
                    </div>

                    <div class="correction-section">
                        <h5>Questions à corriger (${questionsToCorrect.length})</h5>
                        ${questionsHtml}
                    </div>

                    <div style="display: flex; gap: 1rem; margin-top: 1.5rem;">
                        <button class="btn-approve" onclick="dashboard.approveChapter('${studentId}', ${chapterId}); dashboard.closeCorrectionModal();">
                            ✅ Approuver le chapitre
                        </button>
                        <button class="btn-return" onclick="dashboard.returnForRevision('${studentId}', ${chapterId}); dashboard.closeCorrectionModal();">
                            🔄 Renvoyer pour révision
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    closeCorrectionModal() {
        const modal = document.getElementById('correction-modal');
        if (modal) {
            modal.remove();
        }
    }

    // Sauvegarder la correction d'une question
    async saveQuestionCorrection(studentId, chapterId, questionId) {
        const scoreInput = document.getElementById(`score-${questionId}`);
        const commentInput = document.getElementById(`comment-${questionId}`);
        
        const score = parseFloat(scoreInput.value) || 0;
        const comment = commentInput.value.trim();

        const progress = await this.getStudentProgress(studentId);
        const chapter = progress.chapters[chapterId];
        
        if (!chapter || !chapter.questions[questionId]) {
            alert('Question introuvable');
            return;
        }

        // Utiliser ProgressManager pour corriger
        const pm = window.ProgressManager;
        pm.teacherCorrectQuestion(progress, chapterId, questionId, score, comment, '', 'corrected');
        
        // Sauvegarder la progression
        await pm.saveProgress(studentId, progress);

        // Mettre à jour l'UI
        const statusBadge = document.querySelector(`#correction-${q.id} .status-badge`);
        if (statusBadge) {
            statusBadge.textContent = 'corrected';
            statusBadge.className = 'status-badge status-corrected';
        }

        alert(`✅ Correction sauvegardée pour ${questionId}`);
        
        // Rafraîchir les soumissions
        this.renderSubmissions();
    }

    // Renvoyer une question pour révision
    async returnQuestion(studentId, chapterId, questionId) {
        const commentInput = document.getElementById(`comment-${questionId}`);
        const comment = commentInput.value.trim();

        if (!comment) {
            alert('Veuillez ajouter un commentaire expliquant pourquoi la question doit être révisée.');
            return;
        }

        const progress = await this.getStudentProgress(studentId);
        const chapter = progress.chapters[chapterId];
        
        if (!chapter || !chapter.questions[questionId]) {
            alert('Question introuvable');
            return;
        }

        // Utiliser ProgressManager
        const pm = window.ProgressManager;
        pm.teacherCorrectQuestion(progress, chapterId, questionId, 0, comment, 'Veuillez réviser votre réponse.', 'returned_for_revision');
        
        await pm.saveProgress(studentId, progress);

        alert(`🔄 Question renvoyée pour révision`);
        
        this.renderSubmissions();
    }

    // Approuver un chapitre
    async approveChapter(studentId, chapterId) {
        if (!confirm('Êtes-vous sûr de vouloir approuver ce chapitre ?')) return;

        const progress = await this.getStudentProgress(studentId);
        const pm = window.ProgressManager;
        
        pm.teacherApproveChapter(progress, chapterId);
        await pm.saveProgress(studentId, progress);

        alert('✅ Chapitre approuvé !');
        this.renderSubmissions();
        this.renderDashboard();
    }

    // Renvoyer un chapitre pour révision
    async returnForRevision(studentId, chapterId) {
        const comment = prompt('Veuillez entrer un commentaire pour l\'élève (optionnel) :');
        
        const progress = await this.getStudentProgress(studentId);
        const pm = window.ProgressManager;
        
        pm.teacherRequestRevision(progress, chapterId, comment || 'Veuillez réviser votre travail.');
        await pm.saveProgress(studentId, progress);

        alert('🔄 Chapitre renvoyé pour révision');
        this.renderSubmissions();
        this.renderDashboard();
    }

}

// Initialisation du tableau de bord avec détection dynamique des chapitres
let dashboard;

document.addEventListener('DOMContentLoaded', async () => {
    // Récupérer le nom du professeur depuis storage
    let teacherName = await storage.get('teacher_name');
    if (!teacherName) {
        teacherName = 'admin'; // valeur par défaut
    }

    // Afficher le nom dans le dashboard
    const display = document.getElementById('teacher-name-display');
    if (display) display.textContent = `Connecté en tant que : ${teacherName}`;

    // Détecter dynamiquement les chapitres existants
    // Chemin relatif DEPUIS src/html/teacher.html vers ../chapters/
    const existingChapters = await ChapterDetector.detectAndUpdateTeacher('../chapters/');
    
    // Formater les chapitres avec les prérequis
    const formattedChapters = existingChapters.map((c, i) => ({
        id: c.id,
        title: c.title,
        required: i > 0 ? existingChapters[i - 1].id : null
    }));

    // Afficher une alerte si aucun chapitre n'est trouvé
    if (formattedChapters.length === 0) {
        alert('⚠️ Aucun chapitre détecté dans le dossier src/chapters/. Veuillez ajouter des chapitres.');
    }

    // Initialiser le dashboard avec les chapitres détectés
    dashboard = new TeacherDashboard(formattedChapters);
    
    // Précharger les configs de chapitres pour utilisation synchrone dans le rendu
    dashboard.chapterConfigs = {};
    for (const chapter of formattedChapters) {
        dashboard.chapterConfigs[chapter.id] = await dashboard.getChapterConfig(chapter.id);
    }
});