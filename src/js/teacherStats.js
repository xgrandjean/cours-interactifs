/**
 * teacherStats.js - Module de statistiques
 * Statistiques globales, taux de réussite, progression des élèves
 */

class TeacherStats {
    constructor(dashboard) {
        this.dashboard = dashboard;
        this.container = document.getElementById('stats-content');
        this.globalStats = {};
        this.chapterStats = {};
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
        
        // Statistiques globales
        console.log('📈 STATISTIQUES GLOBALES :');
        console.log(this.globalStats);
        console.log('');
        
        // Statistiques par chapitre
        console.log('📚 STATISTIQUES PAR CHAPITRE :');
        console.log(this.chapterStats);
        console.log('');
        
        // Performance par élève (données brutes)
        console.log('🎓 PERFORMANCE PAR ÉLÈVE :');
        const students = await this.dashboard.getStudents();
        const studentPerformances = [];
        
        for (const student of students) {
            const progress = await this.dashboard.getStudentProgress(student.id);
            const completedChapters = Object.values(progress.chapters).filter(c => c.completed).length;
            const totalChapters = this.dashboard.chapters.length;
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
            
            studentPerformances.push({
                studentId: student.id,
                studentName: student.name,
                studentClass: student.class,
                completionRate,
                avgScore,
                completedChapters,
                totalChapters,
                rawProgress: progress
            });
        }
        
        console.log(studentPerformances);
        console.log('');
        console.log('═══════════════════════════════════════════════════════════════');
    }

    async calculateStats() {
        const students = await this.dashboard.getStudents();
        const chapters = this.dashboard.chapters;
        
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
                                successRate: 0
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

        // Calculer les moyennes
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

            // Calculer les taux de réussite par question
            Object.values(stats.questionStats).forEach(qStats => {
                qStats.successRate = qStats.attempts > 0 
                    ? Math.round((qStats.correct / qStats.attempts) * 100) 
                    : 0;
            });
        }
    }

    render() {
        let html = `
            <div class="section-header">
                <h2>📊 Statistiques</h2>
                <p>Vue d'ensemble des performances</p>
            </div>

            <!-- Statistiques globales -->
            <div class="global-stats-summary">
                <div class="stat-card-large">
                    <div class="stat-icon">👥</div>
                    <div class="stat-content">
                        <div class="stat-value">${this.globalStats.activeStudents}/${this.globalStats.totalStudents}</div>
                        <div class="stat-label">Élèves actifs</div>
                    </div>
                </div>
                <div class="stat-card-large">
                    <div class="stat-icon">📈</div>
                    <div class="stat-content">
                        <div class="stat-value">${this.globalStats.globalSuccessRate}%</div>
                        <div class="stat-label">Taux de réussite global</div>
                    </div>
                </div>
                <div class="stat-card-large">
                    <div class="stat-icon">✅</div>
                    <div class="stat-content">
                        <div class="stat-value">${this.globalStats.totalCompletedChapters}</div>
                        <div class="stat-label">Chapitres complétés</div>
                    </div>
                </div>
                <div class="stat-card-large">
                    <div class="stat-icon">📬</div>
                    <div class="stat-content">
                        <div class="stat-value">${this.globalStats.pendingCorrections}</div>
                        <div class="stat-label">Corrections en attente</div>
                    </div>
                </div>
            </div>

            <!-- Statistiques par chapitre -->
            <div class="chapter-stats-section">
                <h3>Performance par Chapitre</h3>
                <div class="chapter-stats-grid">
        `;

        for (const chapter of this.dashboard.chapters) {
            const stats = this.chapterStats[chapter.id];
            html += `
                <div class="chapter-stat-card">
                    <div class="chapter-stat-header">
                        <h4>${stats.title}</h4>
                        <span class="completion-rate">${stats.completionRate}% complété</span>
                    </div>
                    <div class="progress-bar-container">
                        <div class="progress-bar" style="width: ${stats.completionRate}%"></div>
                    </div>
                    <div class="chapter-stat-details">
                        <div class="stat-item">
                            <span class="stat-label">Moyenne</span>
                            <span class="stat-value">${stats.avgScore}%</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Complétés</span>
                            <span class="stat-value">${stats.completedCount}/${stats.attemptCount}</span>
                        </div>
                    </div>
                    
                    <!-- Statistiques des questions -->
                    ${Object.keys(stats.questionStats).length > 0 ? `
                    <div class="question-stats">
                        <h5>📊 Taux de réussite par question</h5>
                        <div class="question-stats-list">
                    ` : ''}
                    
                    ${Object.entries(stats.questionStats).map(([questionId, qStats]) => `
                        <div class="question-stat-item">
                            <span class="question-id">${questionId}</span>
                            <div class="question-stat-bar">
                                <div class="question-stat-fill" style="width: ${qStats.successRate}%"></div>
                            </div>
                            <span class="question-stat-rate">${qStats.successRate}%</span>
                            <span class="question-stat-count">(${qStats.correct}/${qStats.attempts})</span>
                        </div>
                    `).join('')}
                    
                    ${Object.keys(stats.questionStats).length > 0 ? `
                        </div>
                    </div>
                    ` : ''}
                </div>
            `;
        }

        html += `
                </div>
            </div>

            <!-- Liste des élèves par performance -->
            <div class="students-performance-section">
                <h3>Performance par Élève</h3>
        `;

        // Récupérer les élèves et leurs performances
        this.renderStudentsPerformance(html);
        
        html += `</div>`;
        this.container.innerHTML = html;
    }

    async renderStudentsPerformance() {
        const students = await this.dashboard.getStudents();
        const studentPerformances = [];

        for (const student of students) {
            const progress = await this.dashboard.getStudentProgress(student.id);
            const completedChapters = Object.values(progress.chapters).filter(c => c.completed).length;
            const totalChapters = this.dashboard.chapters.length;
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

            studentPerformances.push({
                student,
                completionRate,
                avgScore,
                completedChapters,
                totalChapters
            });
        }

        // Trier par performance décroissante
        studentPerformances.sort((a, b) => b.avgScore - a.avgScore);

        let html = `
            <div class="students-performance-table">
                <table>
                    <thead>
                        <tr>
                            <th>Rang</th>
                            <th>Élève</th>
                            <th>Classe</th>
                            <th>Moyenne</th>
                            <th>Progression</th>
                            <th>Chapitres complétés</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        studentPerformances.forEach((perf, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`;
            const performanceClass = perf.avgScore >= 80 ? 'excellent' : perf.avgScore >= 60 ? 'good' : perf.avgScore >= 40 ? 'average' : 'needs-help';

            html += `
                <tr class="performance-${performanceClass}">
                    <td class="rank">${medal}</td>
                    <td><strong>${perf.student.name}</strong></td>
                    <td>${perf.student.class || 'Non spécifié'}</td>
                    <td>
                        <span class="score-badge ${performanceClass}">${perf.avgScore}%</span>
                    </td>
                    <td>
                        <div class="mini-progress-bar">
                            <div class="mini-progress-fill" style="width: ${perf.completionRate}%"></div>
                        </div>
                        <span class="progress-text">${perf.completionRate}%</span>
                    </td>
                    <td>${perf.completedChapters}/${perf.totalChapters}</td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;

        // Injecter dans le conteneur principal
        const container = document.querySelector('.students-performance-section');
        if (container) {
            const existingTable = container.querySelector('.students-performance-table');
            if (existingTable) {
                existingTable.remove();
            }
            container.insertAdjacentHTML('beforeend', html);
        }
    }
}