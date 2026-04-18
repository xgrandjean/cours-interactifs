/**
 * teacherStats.js - Module de statistiques
 * Refonte moderne et élégante de l'onglet Statistiques
 */

class TeacherStats {
    constructor(dashboard) {
        this.dashboard = dashboard;
        this.container = document.getElementById('stats-content');
        this.globalStats = {};
        this.chapterStats = {};
        this.studentPerformances = [];
        this.selectedClass = 'all';
        this.classesList = [];
        this.init();
    }

    async init() {
        await this.calculateStats();
        this.render();
    }

    async refresh() {
        await this.calculateStats();
        this.render();
        await this.logStats();
    }

    async logStats() {
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('📊 STATISTIQUES COMPLÈTES DU TABLEAU DE BORD');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('');
        console.log('📈 STATISTIQUES GLOBALES :');
        console.log(this.globalStats);
        console.log('');
        console.log('📚 STATISTIQUES PAR CHAPITRE :');
        console.log(this.chapterStats);
        console.log('');
        console.log('🎓 PERFORMANCE PAR Apprenant :');
        console.log(this.studentPerformances);
        console.log('');
        console.log('═══════════════════════════════════════════════════════════════');
    }

    async calculateStats() {
        const students = await this.dashboard.getStudents();
        const chapters = this.dashboard.chapters;
        
        // Récupérer la liste des classes uniques
        const classSet = new Set();
        students.forEach(s => {
            if (s.class && s.class.trim()) {
                classSet.add(s.class.trim());
            }
        });
        this.classesList = Array.from(classSet).sort();
        
        // Initialisation des stats globales
        this.globalStats = {
            totalStudents: students.length,
            activeStudents: 0,
            totalCompletedChapters: 0,
            globalSuccessRate: 0,
            totalSubmissions: 0,
            pendingCorrections: 0
        };

        this.chapterStats = {};
        let totalSuccessRate = 0;
        let studentChapterCount = 0;

        // Initialisation des stats par chapitre
        for (const chapter of chapters) {
            this.chapterStats[chapter.id] = {
                title: chapter.title,
                totalScore: 0,
                completedCount: 0,
                attemptCount: 0,
                avgScore: 0,
                completionRate: 0,
                questionStats: {}
            };
        }

        // Calcul des statistiques
        for (const student of students) {
            const progress = await this.dashboard.getStudentProgress(student.id);
            const completedChapters = Object.values(progress.chapters).filter(c => c.completed).length;
            
            if (completedChapters > 0) {
                this.globalStats.activeStudents++;
                this.globalStats.totalCompletedChapters += completedChapters;
            }

            for (const chapter of chapters) {
                const chapterData = progress.chapters[chapter.id];
                if (!chapterData) continue;

                this.globalStats.totalSubmissions++;
                
                if (chapterData.correctionStatus === 'pending_review' || 
                    chapterData.correctionStatus === 'in_progress') {
                    this.globalStats.pendingCorrections++;
                }

                const stats = this.chapterStats[chapter.id];
                stats.attemptCount++;
                
                if (chapterData.score !== undefined) {
                    stats.totalScore += chapterData.score;
                    totalSuccessRate += chapterData.score;
                    studentChapterCount++;
                }
                
                if (chapterData.completed) {
                    stats.completedCount++;
                }

                // Statistiques par question
                if (chapterData.questions) {
                    Object.entries(chapterData.questions).forEach(([questionId, questionData]) => {
                        if (questionId.startsWith('course_')) return;
                        
                        if (!stats.questionStats[questionId]) {
                            stats.questionStats[questionId] = {
                                attempts: 0,
                                correct: 0,
                                successRate: 0,
                                questionText: this.getQuestionText(chapter, questionId)
                            };
                        }
                        
                        const qStats = stats.questionStats[questionId];
                        if (questionData.answered) {
                            qStats.attempts += questionData.attempts || 1;
                            if (questionData.isCorrect === true) {
                                qStats.correct++;
                            }
                        }
                    });
                }
            }
        }

        // Calcul des moyennes
        this.globalStats.globalSuccessRate = studentChapterCount > 0 
            ? Math.round(totalSuccessRate / studentChapterCount) 
            : 0;

        for (const chapter of chapters) {
            const stats = this.chapterStats[chapter.id];
            stats.avgScore = stats.attemptCount > 0 
                ? Math.round(stats.totalScore / stats.attemptCount) 
                : 0;
            stats.completionRate = students.length > 0 
                ? Math.round((stats.completedCount / students.length) * 100) 
                : 0;

            // Calcul des taux de réussite par question
            Object.values(stats.questionStats).forEach(qStats => {
                qStats.successRate = qStats.attempts > 0 
                    ? Math.round((qStats.correct / qStats.attempts) * 100) 
                    : 0;
            });
        }

        // Calcul des performances par apprenant
        await this.calculateStudentPerformances(students, chapters);
    }

    getQuestionText(chapter, questionId) {
        if (chapter.questions && chapter.questions[questionId]) {
            const q = chapter.questions[questionId];
            return q.text || q.title || questionId;
        }
        return questionId.replace('ch', 'Q');
    }

    async calculateStudentPerformances(students, chapters) {
        this.studentPerformances = [];
        
        for (const student of students) {
            const progress = await this.dashboard.getStudentProgress(student.id);
            const completedChapters = Object.values(progress.chapters).filter(c => c.completed).length;
            const totalChapters = chapters.length;
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

            this.studentPerformances.push({
                studentId: student.id,
                studentName: student.name,
                studentClass: student.class || 'Non spécifié',
                completionRate,
                avgScore,
                completedChapters,
                totalChapters,
                rawProgress: progress
            });
        }

        // Trier par moyenne décroissante
        this.studentPerformances.sort((a, b) => b.avgScore - a.avgScore);
    }

    getFilteredStudents() {
        if (this.selectedClass === 'all') {
            return this.studentPerformances;
        }
        return this.studentPerformances.filter(s => s.studentClass === this.selectedClass);
    }

    getScoreColorClass(score) {
        if (score >= 75) return 'excellent';
        if (score >= 60) return 'good';
        if (score >= 40) return 'average';
        return 'needs-help';
    }

    getScoreLabel(score) {
        if (score >= 75) return 'Excellent';
        if (score >= 60) return 'Bon';
        if (score >= 40) return 'Moyen';
        return 'Difficulté';
    }

    getDifficultyQuestions(stats, limit = 3) {
        const questions = Object.entries(stats.questionStats)
            .map(([id, qStats]) => ({
                id,
                text: qStats.questionText || id,
                successRate: qStats.successRate,
                attempts: qStats.attempts,
                correct: qStats.correct
            }))
            .filter(q => q.attempts > 0)
            .sort((a, b) => a.successRate - b.successRate)
            .slice(0, limit);
        
        return questions;
    }

    render() {
        this.container.innerHTML = `
            <div class="stats-modern-container">
                ${this.renderGlobalStats()}
                ${this.renderChapterStats()}
                ${this.renderStudentsPerformance()}
            </div>
        `;
        
        // Attacher l'événement du filtre après le rendu
        const filterSelect = document.getElementById('class-filter-select');
        if (filterSelect) {
            filterSelect.addEventListener('change', (e) => {
                this.selectedClass = e.target.value;
                this.refreshStudentsTable();
            });
        }
    }
    
    refreshStudentsTable() {
        const tableContainer = document.querySelector('.students-table-container-modern');
        if (tableContainer) {
            const newTableHtml = this.renderStudentsTable();
            tableContainer.innerHTML = newTableHtml;
        }
    }

    renderGlobalStats() {
        const cards = [
            { 
                icon: '👥', 
                value: `${this.globalStats.activeStudents}/${this.globalStats.totalStudents}`, 
                label: 'apprenants actifs',
                color: 'blue',
                tooltip: 'apprenants ayant commencé au moins un chapitre'
            },
            { 
                icon: '📈', 
                value: `${this.globalStats.globalSuccessRate}%`, 
                label: 'Taux de réussite',
                color: 'green',
                tooltip: 'Moyenne générale sur tous les chapitres'
            },
            { 
                icon: '✅', 
                value: this.globalStats.totalCompletedChapters, 
                label: 'Chapitres complétés',
                color: 'orange',
                tooltip: 'Nombre total de chapitres terminés'
            },
            { 
                icon: '📬', 
                value: this.globalStats.pendingCorrections, 
                label: 'Corrections en attente',
                color: 'purple',
                tooltip: 'Travaux nécessitant une correction'
            }
        ];

        return `
            <div class="stats-section">
                <div class="stats-section-header">
                    <h3>📊 Vue d'ensemble</h3>
                    <p class="stats-section-desc">Synthèse des performances globales</p>
                </div>
                <div class="global-stats-grid-modern">
                    ${cards.map(card => `
                        <div class="stat-card-modern stat-card-${card.color}" data-tooltip="${card.tooltip}">
                            <div class="stat-card-icon">${card.icon}</div>
                            <div class="stat-card-value">${card.value}</div>
                            <div class="stat-card-label">${card.label}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    renderChapterStats() {
        if (this.dashboard.chapters.length === 0) {
            return `
                <div class="stats-section">
                    <div class="stats-section-header">
                        <h3>📚 Performance par chapitre</h3>
                    </div>
                    <div class="empty-state">
                        <div class="empty-state-icon">📖</div>
                        <p>Aucun chapitre disponible</p>
                    </div>
                </div>
            `;
        }

        let chaptersHtml = '';
        for (const chapter of this.dashboard.chapters) {
            const stats = this.chapterStats[chapter.id];
            if (!stats) continue;
            
            const difficultyQuestions = this.getDifficultyQuestions(stats, 3);
            
            chaptersHtml += `
                <div class="chapter-card-modern">
                    <div class="chapter-card-header">
                        <h4 class="chapter-card-title">${this.escapeHtml(stats.title)}</h4>
                        <span class="completion-badge-modern ${stats.completionRate >= 70 ? 'high' : stats.completionRate >= 40 ? 'medium' : 'low'}">
                            ${stats.completionRate}% complété
                        </span>
                    </div>
                    
                    <div class="progress-section-modern">
                        <div class="progress-header-modern">
                            <span>Progression globale</span>
                            <span>${stats.completionRate}%</span>
                        </div>
                        <div class="progress-bar-modern">
                            <div class="progress-fill-modern" style="width: ${stats.completionRate}%"></div>
                        </div>
                    </div>
                    
                    <div class="chapter-stats-grid-modern">
                        <div class="chapter-stat-item">
                            <span class="chapter-stat-label">📊 Moyenne</span>
                            <span class="chapter-stat-value ${this.getScoreColorClass(stats.avgScore)}">${stats.avgScore}%</span>
                        </div>
                        <div class="chapter-stat-item">
                            <span class="chapter-stat-label">✅ Complétés</span>
                            <span class="chapter-stat-value">${stats.completedCount}/${stats.attemptCount}</span>
                        </div>
                        <div class="chapter-stat-item">
                            <span class="chapter-stat-label">🎯 Taux de complétion</span>
                            <span class="chapter-stat-value">${stats.completionRate}%</span>
                        </div>
                    </div>
                    
                    ${difficultyQuestions.length > 0 ? `
                        <div class="difficult-questions-modern">
                            <div class="difficult-questions-header">
                                <span>⚠️ Questions difficiles</span>
                                <span class="difficult-questions-sub">Taux de réussite le plus faible</span>
                            </div>
                            <div class="questions-list-modern">
                                ${difficultyQuestions.map(q => `
                                    <div class="question-item-modern">
                                        <span class="question-name-modern" title="${this.escapeHtml(q.text)}">${this.truncateText(q.text, 40)}</span>
                                        <span class="question-rate-modern ${q.successRate <= 30 ? 'critical' : q.successRate <= 50 ? 'warning' : ''}">
                                            ${q.successRate}% (${q.correct}/${q.attempts})
                                        </span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : `
                        <div class="difficult-questions-modern empty">
                            <span>✅ Aucune donnée de question disponible</span>
                        </div>
                    `}
                </div>
            `;
        }

        return `
            <div class="stats-section">
                <div class="stats-section-header">
                    <h3>📚 Performance par chapitre</h3>
                    <p class="stats-section-desc">Analyse détaillée de chaque chapitre</p>
                </div>
                <div class="chapters-grid-modern">
                    ${chaptersHtml}
                </div>
            </div>
        `;
    }

    renderStudentsPerformance() {
        return `
            <div class="stats-section">
                <div class="stats-section-header">
                    <h3>🎓 Performance des apprenants</h3>
                    <p class="stats-section-desc">Classement par moyenne générale</p>
                </div>
                
                <!-- Filtre par classe -->
                <div class="class-filter-container">
                    <label for="class-filter-select" class="filter-label">Filtrer par classe :</label>
                    <select id="class-filter-select" class="class-filter-select">
                        <option value="all">📚 Toutes les classes</option>
                        ${this.classesList.map(className => `
                            <option value="${this.escapeHtml(className)}" ${this.selectedClass === className ? 'selected' : ''}>
                                ${this.escapeHtml(className)}
                            </option>
                        `).join('')}
                    </select>
                </div>
                
                <div class="students-table-container-modern">
                    ${this.renderStudentsTable()}
                </div>
            </div>
        `;
    }
    
    renderStudentsTable() {
        const filteredStudents = this.getFilteredStudents();
        
        if (filteredStudents.length === 0) {
            return `
                <div class="empty-state-table">
                    <div class="empty-state-icon">👨‍🎓</div>
                    <p>Aucun apprenant dans cette classe</p>
                </div>
            `;
        }
        
        let studentsHtml = '';
        filteredStudents.forEach((student, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '';
            const scoreClass = this.getScoreColorClass(student.avgScore);
            const scoreLabel = this.getScoreLabel(student.avgScore);
            
            studentsHtml += `
                <tr class="student-row-modern ${index < 3 ? 'top-student' : ''}">
                    <td class="student-rank">
                        ${medal ? `<span class="medal">${medal}</span>` : `<span class="rank-number">${index + 1}</span>`}
                    </td>
                    <td class="student-name">
                        <span class="student-name-text">${this.escapeHtml(student.studentName)}</span>
                    </td>
                    <td class="student-name">
                        <span class="student-name-text">${this.escapeHtml(student.studentClass)}</span>
                    </td>
                    <td class="student-score">
                        <span class="score-badge-modern ${scoreClass}" title="${scoreLabel}">
                            ${student.avgScore}%
                        </span>
                    </td>
                    <td class="student-progress">
                        <div class="progress-cell">
                            <div class="mini-progress-modern">
                                <div class="mini-progress-fill-modern" style="width: ${student.completionRate}%"></div>
                            </div>
                            <span class="progress-text-modern">${student.completionRate}%</span>
                        </div>
                    </td>
                    <td class="student-chapters">
                        <span class="chapters-count">${student.completedChapters}/${student.totalChapters}</span>
                    </td>
                </tr>
            `;
        });
        
        return `
            <table class="students-table-modern">
                <thead>
                    <tr>
                        <th>Rang</th>
                        <th>Apprenant</th>
                        <th>Classe</th>
                        <th>Moyenne</th>
                        <th>Progression</th>
                        <th>Chapitres</th>
                    </tr>
                </thead>
                <tbody>
                    ${studentsHtml}
                </tbody>
            </table>
        `;
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    truncateText(text, maxLength) {
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }
}