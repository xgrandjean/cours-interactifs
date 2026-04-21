/**
 * teacherSubmissions.js - Module de gestion des rendus et corrections
 * Vue détaillée des apprenants, corrections manuelles, validation
 */

class TeacherSubmissions {
    constructor(dashboard) {
        this.dashboard = dashboard;
        this.container = document.getElementById('submissions-content');
        this.submissions = [];
        this.init();
    }

    async init() {
        await this.loadSubmissions();
        this.render();
        this.updateBadge();
    }

    async refresh() {
        await this.loadSubmissions();
        this.render();
        this.updateBadge();
    }

    async loadSubmissions() {
        const students = await this.dashboard.getStudents();
        const chapters = this.dashboard.chapters;
        this.submissions = [];

        for (const student of students) {
            const progress = await this.dashboard.getStudentProgress(student.id);
            
            for (const chapter of chapters) {
                const chapterData = progress.chapters[chapter.id];
                if (!chapterData) continue;
                
                const needsCorrection = 
                    chapterData.submissionStatus === 'submitted' ||
                    chapterData.submissionStatus === 'late_submitted' ||
                    chapterData.submissionStatus === 'returned_for_revision' ||
                    chapterData.correctionStatus === 'pending_review' ||
                    chapterData.correctionStatus === 'in_progress';
                
                if (needsCorrection) {
                    this.submissions.push({
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

        // Trier par priorité
        this.submissions.sort((a, b) => {
            if (a.submissionStatus === 'late_submitted' && b.submissionStatus !== 'late_submitted') return -1;
            if (b.submissionStatus === 'late_submitted' && a.submissionStatus !== 'late_submitted') return 1;
            const dateA = new Date(a.submittedAt || a.updatedAt || 0);
            const dateB = new Date(b.submittedAt || b.updatedAt || 0);
            return dateB - dateA;
        });
    }

    updateBadge() {
        const badge = document.getElementById('submissions-badge');
        if (badge) {
            badge.textContent = this.submissions.length;
            badge.style.display = this.submissions.length > 0 ? 'inline' : 'none';
        }
    }

    async render() {
        let html = `
            <div class="section-header">
                <h2>📬 Rendus à Corriger</h2>
                <p>${this.submissions.length} rendu(s) en attente de correction</p>
            </div>

            <div class="submissions-filters">
                <div class="filter-group">
                    <label for="filter-submission-search">Recherche:</label>
                    <input type="text" id="filter-submission-search" oninput="dashboard.modules.submissions.filterSubmissions()" placeholder="Rechercher un nom...">
                </div>
                <div class="filter-group">
                    <label for="filter-status">Statut:</label>
                    <select id="filter-status" onchange="dashboard.modules.submissions.filterSubmissions()">
                        <option value="all">Tous</option>
                        <option value="submitted">Rendu</option>
                        <option value="late_submitted">En retard</option>
                        <option value="returned_for_revision">À revoir</option>
                        <option value="pending_review">En attente de correction</option>
                    </select>
                </div>
                <div class="filter-group">
                    <label for="filter-chapter">Chapitre:</label>
                    <select id="filter-chapter" onchange="dashboard.modules.submissions.filterSubmissions()">
                        <option value="all">Tous</option>
                        ${this.dashboard.chapters.map(ch => `<option value="${ch.id}">${ch.title}</option>`).join('')}
                    </select>
                </div>
                <div class="filter-group">
                    <label for="filter-class">Classe:</label>
                    <select id="filter-class" onchange="dashboard.modules.submissions.filterSubmissions()">
                        <option value="all">Toutes</option>
                        ${[...new Set(this.submissions.map(s => s.studentClass).filter(c => c))].sort().map(cls => `<option value="${cls}">${cls}</option>`).join('')}
                    </select>
                </div>
            </div>

            <div class="submissions-grid" id="submissions-grid">
        `;

        if (this.submissions.length === 0) {
            html += `
                <div class="empty-submissions">
                    <p>🎉 Aucun rendu à corriger !</p>
                    <small>Tous les chapitres soumis ont été corrigés.</small>
                </div>
            `;
        } else {
            // Liste des chapitres à corriger  - Onglet "Rendus à corriger"
            this.submissions.forEach(sub => {
                const isLate = sub.submissionStatus === 'late_submitted';
                const isReturned = sub.submissionStatus === 'returned_for_revision';
                const isPending = sub.correctionStatus === 'pending_review';
                
                let cardClass = '';
                if (isLate) cardClass = 'late';
                else if (isReturned) cardClass = 'returned';
                else if (isPending) cardClass = 'pending';

                const submittedDate = sub.submittedAt ? new Date(sub.submittedAt).toLocaleString('fr-FR') : 'N/A';
                const pendingCount = sub.pendingCorrectionCount || 0;
                const correctedCount = sub.correctedQuestionCount || 0;
                const totalManual = sub.manualCorrectionCount || 0;

                const isInProgress = sub.correctionStatus === 'in_progress' || (correctedCount > 0 && correctedCount < totalManual);
                
                let badgeClass = 'badge-submitted';
                let badgeText = '📤 Rendu';
                if (isLate) { badgeClass = 'badge-late'; badgeText = '📤 En retard'; }
                else if (isReturned) { badgeClass = 'badge-returned'; badgeText = '🔄 À revoir'; }
                else if (isInProgress) { badgeClass = 'badge-in-progress'; badgeText = '🟡 En correction'; }

                html += `
                    <div class="submission-card ${cardClass}">
                        <div class="submission-header">
                            <h4>${sub.studentName}</h4>
                            <span class="submission-badge ${badgeClass}">${badgeText}</span>
                        </div>
                        <div class="submission-info">
                            <strong>Chapitre:</strong> ${sub.chapterTitle}<br>
                            <strong>Classe:</strong> ${sub.studentClass}<br>
                            <strong>Rendu le:</strong> ${submittedDate}<br>
                            <strong>Score actuel:</strong> ${sub.finalScore || 0} points
                        </div>
                        <div class="submission-info">
                            <strong>Correction:</strong> ${correctedCount}/${totalManual} questions corrigées
                            ${pendingCount > 0 ? `<span style="color: #e67e22;"> (${pendingCount} en attente)</span>` : ''}
                        </div>
                        <div class="submission-actions">

                            ${!isReturned ? `
                            <button class="btn-correct" onclick="dashboard.modules.submissions.openCorrectionModal('${sub.studentId}', ${sub.chapterId})">
                                ✏️ Corriger
                            </button>
                            ` : `
                            <button class="btn-correct" disabled style="opacity: 0.4; cursor: not-allowed;" title="Impossible de corriger : ce chapitre a été renvoyé à l'apprenant, il n'a pas encore rendu sa nouvelle version">
                                ✏️ Corriger
                            </button>
                            `}

                            ${!isReturned ? `
                            <button class="btn-return" onclick="dashboard.modules.submissions.returnForRevision('${sub.studentId}', ${sub.chapterId})">
                                🔄 Renvoyer
                            </button>
                            ` : `
                            <button class="btn-return" disabled style="opacity: 0.4; cursor: not-allowed;" title="Ce chapitre a déjà été renvoyé pour révision">
                                🔄 Renvoyer
                            </button>
                            `}

                            <button class="btn-view-student" onclick="dashboard.showStudentChapterView('${sub.studentId}', ${sub.chapterId})" title="Voir les réponses de l'apprenant">
                                👁️
                            </button>
                        </div>
                    </div>
                `;
            });
        }

        html += '</div>';
        this.container.innerHTML = html;
    }

    async renderStudentDetailsSection() {
        const students = await this.dashboard.getStudents();
        
        let html = `
            <div class="students-list" style="margin-top: 2rem;">
                <h2>Détails par Apprenant</h2>
                <button class="refresh-btn" id="refresh-dashboard" onclick="dashboard.modules.submissions.refresh()">🔄 Rafraîchir les données</button>
                <div class="students-grid" id="students-grid">
        `;

        if (students.length === 0) {
            html += '<div class="empty-state">Aucun apprenant enregistré.</div>';
        } else {
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

                html += `
                    <div class="student-card">
                        <div class="student-header">
                            <h4>${student.name}</h4>
                            <span class="student-class">${student.class || 'Non spécifié'}</span>
                        </div>
                        
                        <div class="student-stats">
                            <div class="stat-row">
                                <span>Progression</span>
                                <span>${completionRate}% (${completedChapters}/${totalChapters})</span>
                            </div>
                            <div class="stat-row">
                            </div>
                            <div class="stat-row">
                                <span>Dernière activité</span>
                                <span>${this.getLastActivity(progress)}</span>
                            </div>
                        </div>

                        <div class="chapter-list">
                            <ul>
                ${this.dashboard.chapters.map(chapter => {
                    const chapterData = progress.chapters[chapter.id] || { completed: false, score: 0 };
                    const config = this.dashboard.modules.chapters ? null : null; // simplified
                    const isLocked = false; // simplified
                            
                    let statusClass = 'status-not-started';
                    let statusText = 'Non commencé';
                            
                    if (chapterData.completed) {
                        statusClass = 'status-completed';
                        statusText = 'Validé';
                    } else if (chapterData.score > 0) {
                        statusClass = 'status-in-progress';
                        statusText = 'En cours';
                    } else if (chapterData.submissionStatus === 'submitted') {
                        statusClass = 'status-pending-review';
                        statusText = 'Rendu';
                    }
                            
                    const hasStarted = chapterData.questions && Object.keys(chapterData.questions).length > 0;

                    return `
                        <li>
                            <a class="chapter-link" onclick="dashboard.modules.submissions.showStudentChapterDetails('${student.id}', ${chapter.id})">
                                ${chapter.title}
                            </a>
                            <span class="status-badge ${statusClass}">${statusText}</span>
                            ${hasStarted ? `
                            <button class="btn-view-student" onclick="dashboard.showStudentChapterView('${student.id}', ${chapter.id})" title="Voir les réponses de l'apprenant">
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

        html += `
                </div>
            </div>
        `;
        
        return html;
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

    showStudentChapterDetails(studentId, chapterId) {
        // Open a modal with detailed chapter info for the student
        alert(`Détails du chapitre ${chapterId} pour l'apprenant ${studentId} - Fonctionnalité à implémenter`);
    }

    filterSubmissions() {
        const searchFilter = document.getElementById('filter-submission-search').value.toLowerCase().trim();
        const statusFilter = document.getElementById('filter-status').value;
        const chapterFilter = document.getElementById('filter-chapter').value;
        const classFilter = document.getElementById('filter-class').value;

        let filtered = [...this.submissions];

        if (statusFilter !== 'all') {
            if (statusFilter === 'pending_review') {
                filtered = filtered.filter(s => s.correctionStatus === 'pending_review' || s.correctionStatus === 'in_progress');
            } else {
                filtered = filtered.filter(s => s.submissionStatus === statusFilter);
            }
        }

        if (chapterFilter !== 'all') {
            filtered = filtered.filter(s => s.chapterId == chapterFilter);
        }

        if (classFilter !== 'all') {
            filtered = filtered.filter(s => s.studentClass === classFilter);
        }

        if (searchFilter !== '') {
            filtered = filtered.filter(s => 
                s.studentName.toLowerCase().includes(searchFilter)
            );
        }

        this.renderSubmissionsList(filtered);
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

            const submittedDate = sub.submittedAt ? new Date(sub.submittedAt).toLocaleString('fr-FR') : 'N/A';
            const pendingCount = sub.pendingCorrectionCount || 0;
            const correctedCount = sub.correctedQuestionCount || 0;
            const totalManual = sub.manualCorrectionCount || 0;

            const isInProgress = sub.correctionStatus === 'in_progress' || (correctedCount > 0 && correctedCount < totalManual);
            
            let badgeClass = 'badge-submitted';
            let badgeText = '📤 Rendu';
            if (isLate) { badgeClass = 'badge-late'; badgeText = '📤 En retard'; }
            else if (isReturned) { badgeClass = 'badge-returned'; badgeText = '🔄 À revoir'; }
            else if (isInProgress) { badgeClass = 'badge-in-progress'; badgeText = '🟡 En correction'; }

            html += `
                <div class="submission-card ${cardClass}">
                    <div class="submission-header">
                        <h4>${sub.studentName}</h4>
                        <span class="submission-badge ${badgeClass}">${badgeText}</span>
                    </div>
                    <div class="submission-info">
                        <strong>Chapitre:</strong> ${sub.chapterTitle}<br>
                        <strong>Classe:</strong> ${sub.studentClass}<br>
                        <strong>Rendu le:</strong> ${submittedDate}<br>
                        <strong>Score actuel:</strong> ${sub.finalScore || 0} points
                    </div>
                    <div class="submission-info">
                        <strong>Correction:</strong> ${correctedCount}/${totalManual} questions corrigées
                        ${pendingCount > 0 ? `<span style="color: #e67e22;"> (${pendingCount} en attente)</span>` : ''}
                    </div>
                    <div class="submission-actions">

                        ${!isReturned ? `
                        <button class="btn-correct" onclick="dashboard.modules.submissions.openCorrectionModal('${sub.studentId}', ${sub.chapterId})">
                            ✏️ Corriger
                        </button>
                        ` : `
                        <button class="btn-correct" disabled style="opacity: 0.4; cursor: not-allowed;" title="Impossible de corriger : ce chapitre a été renvoyé à l'apprenant, il n'a pas encore rendu sa nouvelle version">
                            ✏️ Corriger
                        </button>
                        `}

                        ${!isReturned ? `
                        <button class="btn-return" onclick="dashboard.modules.submissions.returnForRevision('${sub.studentId}', ${sub.chapterId})">
                            🔄 Renvoyer
                        </button>
                        ` : `
                        <button class="btn-return" disabled style="opacity: 0.4; cursor: not-allowed;" title="Ce chapitre a déjà été renvoyé pour révision">
                            🔄 Renvoyer
                        </button>
                        `}

                        <button class="btn-view" onclick="dashboard.showStudentChapterView('${sub.studentId}', ${sub.chapterId})" title="Voir la copie">
                            👁️
                        </button>
                    </div>
                </div>
            `;
        });

        grid.innerHTML = html;
    }

    // ─────────────────────────────────────────────────────────────
    // 🎯 FONCTION PRINCIPALE
    // ─────────────────────────────────────────────────────────────
    async openCorrectionModal(studentId, chapterId) {
        const context = await this.getCorrectionContext(studentId, chapterId);
        if (!context) return;

        const viewModel = this.buildQuestionsViewModel(context);
        
        // Stocker le view model pour y acceder dans renderFilters
        this.currentViewModel = viewModel;
        
        const modalHtml = this.renderModalShell(context, viewModel);
        
        this.closeCorrectionModal();
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        this.bindCorrectionEvents(studentId, chapterId);
    }

    // ─────────────────────────────────────────────────────────────
    // 📊 FONCTIONS DE DONNÉES
    // ─────────────────────────────────────────────────────────────
    async getCorrectionContext(studentId, chapterId) {
        const users = await this.dashboard.auth.getUsers();
        const student = users.find(u => u.id === studentId);
        const progress = await this.dashboard.getStudentProgress(studentId);
        const chapter = progress.chapters[chapterId];
        
        // ✅ SOURCE DE VERITE OFFICIELLE : window.chaptersIndex comme partout ailleurs
        if (!window.chaptersIndex) {
            const response = await fetch(window.APP_BASE_URL + 'src/chapters/chapters_index.json');
            if (response.ok) {
                window.chaptersIndex = await response.json();
            }
        }
        
        const chapterConfig = window.chaptersIndex?.chapters?.find(ch => ch.id == chapterId);

        if (!chapter || !chapterConfig || !student) {
            alert('Chapitre ou apprenant introuvable');
            return null;
        }

        return { student, progress, chapter, chapterConfig, studentId, chapterId };
    }

    buildQuestionsViewModel(context) {
        const { chapter, chapterConfig } = context;
        console.group('🔍 DEBUG CORRECTION VIEW FINAL');
        console.log('📋 CHAPTER CONFIG COMPLETE:', chapterConfig);
        console.log('📊 Student answers:', chapter.questions);
        
        const allQuestions = [];

        // 1. Ajouter d'abord toutes les questions standard depuis la config
        chapterConfig.questions.forEach((questionConfig, index) => {
            console.log(`\n📝 Question ${index} ${questionConfig.id}:`);
            console.log('  ⚙️ FULL Config:', questionConfig);
            console.log('  📝 Type:', questionConfig.type);
            console.log('  🎯 correctionType:', questionConfig.correctionType);
            console.log('  📄 options:', questionConfig.options);
            console.log('  📝 statement:', questionConfig.statement);
            console.log('  💾 Student data:', chapter.questions?.[questionConfig.id]);
            
            const questionData = chapter.questions?.[questionConfig.id] || {};
            
            allQuestions.push({
                id: questionConfig.id,
                ...questionConfig,
                ...questionData,
                status: this.getQuestionStatus(questionData, questionConfig),
                isManual: questionConfig.correctionType === 'semi',
                isCourse: false
            });
        });

        // 2. AJOUTER LES COURS QUI NE SONT PAS DANS LA CONFIG MAIS DANS LES REPONSES
        Object.keys(chapter.questions || {})
            .filter(key => key.startsWith('course_'))
            .forEach(courseId => {
                const courseData = chapter.questions[courseId];
                console.log(`\n📚 COURS trouvé: ${courseId}`, courseData);
                
                allQuestions.push({
                    id: courseId,
                    title: `Cours ${courseId.replace('course_', '')}`,
                    ...courseData,
                    status: courseData.isCorrect === true ? 'corrected' : 'pending',
                    isManual: false,
                    isCourse: true
                });
            });

        console.log('\n✅ Final view model:', allQuestions);
        console.groupEnd();

        const stats = this.calculateCorrectionStats(allQuestions);
        return { questions: allQuestions, stats, activeFilter: 'all' };
    }

    getQuestionStatus(data, config) {        
        // Cas spéciaux en PREMIER
        if (data.manualCorrectionStatus === 'corrected') return 'corrected';
        if (data.manualCorrectionStatus === 'returned_for_revision') return 'returned';
        
        // Cas des cours
        if (config.id.startsWith('course_')) {
            return data.isCorrect === true ? 'corrected' : 'pending';
        }
        
        // Questions auto: toujours auto
        if (config.correctionType === 'auto') return 'auto';
        
        // Questions semi: si non corrigée → EN ATTENTE
        if (config.correctionType === 'semi') {
            return 'pending';
        }
        
        return 'pending';
    }

    calculateCorrectionStats(questions) {
        const total = questions.length;
        const corrected = questions.filter(q => q.status === 'corrected').length;
        const pending = questions.filter(q => q.status === 'pending').length;
        const manual = questions.filter(q => q.isManual).length;
        const courses = questions.filter(q => q.isCourse).length;
        const progression = manual > 0 ? Math.round((corrected / manual) * 100) : 100;

        return { total, corrected, pending, manual, progression, auto: total - manual, totalCourses: courses };
    }

    // ─────────────────────────────────────────────────────────────
    // 🎨 FONCTIONS DE RENDU
    // ─────────────────────────────────────────────────────────────
    renderModalShell(context, viewModel) {
        const { studentId, chapterId, student, chapterConfig } = context;
        
        return `
            <div class="modal-overlay" id="correction-modal">
                <div class="modal-content correction-modal" style="max-width: 1100px;">
                    ${this.renderHeader(student, chapterConfig, viewModel.stats)}
                    ${this.renderFilters()}
                    <div class="modal-body correction-modal-body">
                        ${this.renderQuestionList(viewModel.questions, context)}
                    </div>
                </div>
            </div>
        `;
    }

    renderHeader(student, chapterConfig, stats) {
        return `
            <div class="modal-header">
                <div>
                    <h3>Correction - ${chapterConfig.title}</h3>
                    <div class="correction-header-info">
                        <span>👤 ${student.name} (${student.class || 'Non spécifié'})</span>
                        <span>✅ ${stats.corrected}/${stats.manual} | Progression: ${stats.progression}%</span>
                    </div>
                </div>

                <div class="correction-header-actions">
                    <button class="correction-header-btn" 
                            onclick="dashboard.modules.submissions.closeCorrectionModal()" 
                            title="Annuler et fermer">
                        ❌ Annuler
                    </button>
                    <button class="correction-header-btn btn-primary" 
                            onclick="dashboard.modules.submissions.saveAllCorrections('${student.id}', ${chapterConfig.id})"
                            title="Sauvegarder toutes les modifications">
                        💾 Sauvegarder
                    </button>
                    <button class="correction-header-btn btn-success" 
                            onclick="dashboard.modules.submissions.approveChapter('${student.id}', ${chapterConfig.id})"
                            title="Valider définitivement ce chapitre">
                        ✅ Valider
                    </button>
                    <button class="close-btn" onclick="dashboard.modules.submissions.closeCorrectionModal()">&times;</button>
                </div>
            </div>
        `;
    }

    renderFilters() {
        // MASQUER COMPLETEMENT le bouton cours si aucun cours dans ce chapitre
        const hasCourses = this.currentViewModel?.stats?.totalCourses > 0;
        
        return `
            <div class="correction-filters" id="correction-filters">
                <button class="filter-btn active" data-filter="all">🔹 Toutes</button>
                <button class="filter-btn" data-filter="pending">⏳ En attente</button>
                <button class="filter-btn" data-filter="corrected">✅ Corrigées</button>
                <button class="filter-btn" data-filter="manual">✏️ Manuelles</button>
                ${hasCourses ? '<button class="filter-btn" data-filter="course">📚 Cours</button>' : ''}
            </div>
        `;
    }

    renderQuestionList(questions, context) {
        return questions.map(q => this.renderQuestionItem(q, context)).join('');
    }

    renderQuestionItem(question, context) {
        const { studentId, chapterId } = context;
        const maxPoints = question.points || 0;
        const defaultScore = parseFloat(question.teacherScore) || parseFloat(question.score) || 0;

        // ✅ CAS SPECIAL: COURS
        if (question.isCourse) {
            const isRead = question.isCorrect === true;
            const penalty = isRead ? '' : '⚠️ -2 points de pénalité';
            
            return `
                <div class="question-correction question-${question.status}" data-question-id="${question.id}" data-status="${question.status}" data-type="${question.status}" data-is-course="${question.isCourse}">
                    <div class="question-correction-header">
                        <h6>📚 ${question.title || question.id}</h6>
                        <span class="status-badge ${isRead ? 'status-corrected' : 'status-pending'}">${isRead ? '✅ Lu' : '❌ Non lu'}</span>
                    </div>
                    
                    <div class="correction-row">
                        <div class="correction-label">👤 Statut:</div>
                        <div class="correction-value ${isRead ? 'correct' : 'incorrect'}">${isRead ? 'Apprenant a marqué ce cours comme lu' : 'Apprenant n\'a pas lu ce cours'} ${penalty}</div>
                    </div>
                    
                    <div style="padding: 0.75rem; background: #f8f9fa; border-radius: 6px; margin-top: 0.5rem; font-size: 0.9rem; color: #666;">
                        ℹ️ Ceci est un élément de cours, pas une question. La validation est automatique.
                    </div>
                </div>
            `;
        }

        // Cas normal: questions
        // Résoudre la réponse textuelle (pas juste l'indice pour QCM)
        let studentAnswer = '(pas de réponse)';
        if (question.answer !== undefined && question.answer !== null) {
            if (question.type === 'qcm' && question.options) {
                const answerIndex = parseInt(question.answer);
                studentAnswer = question.options[answerIndex] || question.answer;
            } else {
                studentAnswer = question.answer;
            }
        }

        const statusClass = `status-${question.status}`;
        const statusLabels = { 
            pending: 'À corriger', 
            corrected: 'Corrigée', 
            auto: 'Automatique', 
            semiauto: 'Semi-Auto',
            course: 'Cours',
            returned: 'Renvoyée' 
        };
        
        // Résoudre la bonne réponse attendue en clair
        let correctAnswer = '';
        if (question.correctAnswers && question.options) {
            // QCM / Selection
            if (Array.isArray(question.correctAnswers)) {
                correctAnswer = question.correctAnswers.map(i => question.options[i]).join(' & ');
            } else {
                correctAnswer = question.options[question.correctAnswers] || '';
            }
        } else if (question.type === 'courte' && Array.isArray(question.correctAnswers)) {
            // Question courte
            correctAnswer = question.correctAnswers.join(' || ');
        }

        return `
            <div class="question-correction question-${question.status}" data-question-id="${question.id}" data-status="${question.status}" data-type="${question.status}" data-is-course="${question.isCourse}">
                <div class="question-correction-header">
                    <h6>${question.title || `Question ${question.id}`}</h6>
                    <span class="status-badge ${statusClass}">${statusLabels[question.status]}</span>
                </div>
                
                ${question.questionText ? `
                <div class="correction-row">
                    <div class="correction-label">📝 Consigne:</div>
                    <div class="correction-value">${question.questionText}</div>
                </div>
                ` : ''}
                
                <div class="correction-row">
                    <div class="correction-label">👤 Réponse de l'apprenant:</div>
                    <div class="correction-value">${studentAnswer}</div>
                </div>
                
                ${correctAnswer ? `
                <div class="correction-row">
                    <div class="correction-label">✅ Réponse attendue:</div>
                    <div class="correction-value correct">${correctAnswer}</div>
                </div>
                ` : ''}

                ${!question.isManual ? `
                <div class="auto-correction-note">
                    <span>ℹ️ Score automatique initial: ${question.score || 0}/${maxPoints} points - Vous pouvez modifier ce score ci-dessous</span>
                </div>
                ` : ''}

                <div class="correction-inputs">
                    <div class="form-group">
                        <label>Score (/${maxPoints})</label>
                        <input type="number" class="question-score" 
                               id="score-${question.id}" min="0" max="${maxPoints}"
                               value="${defaultScore}" step="0.5">
                    </div>
                    <div class="form-group">
                        <label>Appréciation / Commentaire</label>
                        <textarea class="question-comment" id="comment-${question.id}"
                                  placeholder="Ajouter une appréciation pour cette question...">${question.teacherComment || ''}</textarea>
                    </div>
                </div>
            </div>
        `;
    }

    // ─────────────────────────────────────────────────────────────
    // ⚙️ FONCTIONS UI & ÉVÈNEMENTS
    // ─────────────────────────────────────────────────────────────
    bindCorrectionEvents(studentId, chapterId) {
        document.querySelectorAll('#correction-filters .filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.applyFilters(e.target.dataset.filter));
        });

        document.querySelectorAll('.question-score').forEach(input => {
            input.addEventListener('input', () => this.calculateScoreLive());
        });
    }

    applyFilters(filter) {
        if(filter === 'course') {
            console.log('📚 [FILTER] Affichage des cours uniquement');
        }
        
        document.querySelectorAll('#correction-filters .filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === filter);
        });

        document.querySelectorAll('.question-correction').forEach(el => {
            const status = el.dataset.status;
            const isManual = status === 'pending' || status === 'corrected';
            const isCourse = el.dataset.isCourse === 'true';

            let visible = false;
            
            // 🔹 RÈGLE ABSOLUE: les cours ne sont VISIBLE que sur filtre course
            if(isCourse) {
                visible = filter === 'course';
            } else {
                // Pour les questions normales: comportement standard
                switch(filter) {
                    case 'all': visible = true; break;
                    case 'pending': visible = status === 'pending'; break;
                    case 'corrected': visible = status === 'corrected'; break;
                    case 'manual': visible = isManual; break;
                }
            }

            el.style.display = visible ? 'block' : 'none';
        });
    }

    calculateScoreLive() {
        let totalScore = 0;
        document.querySelectorAll('.question-score').forEach(input => {
            totalScore += parseFloat(input.value) || 0;
        });

        const headerInfo = document.querySelector('.correction-header-info span:last-child');
        if (headerInfo) {
            const currentText = headerInfo.textContent;
            headerInfo.textContent = currentText.replace(/\| Score:.+$/, `| Score: ${totalScore} pts`);
        }
    }

    async saveAllCorrections(studentId, chapterId) {
        try {
            const progress = await this.dashboard.getStudentProgress(studentId);
            const chapter = progress.chapters[chapterId];
            const chapterConfig = this.dashboard.chapters.find(c => c.id === chapterId);

            if (!chapter || !chapterConfig) {
                alert('Erreur lors de la sauvegarde');
                return;
            }

            let finalScore = 0;

            chapterConfig.questions.forEach(questionConfig => {
                const questionId = questionConfig.id;
                const scoreInput = document.getElementById(`score-${questionId}`);
                const commentInput = document.getElementById(`comment-${questionId}`);

                if (scoreInput && commentInput && chapter.questions[questionId]) {
                    const question = chapter.questions[questionId];
                    const teacherScore = parseFloat(scoreInput.value) || 0;
                    const teacherComment = commentInput.value.trim();

                    question.teacherScore = teacherScore;
                    question.teacherComment = teacherComment;
                    question.manualCorrectionStatus = 'corrected';
                    question.correctedAt = new Date().toISOString();
                    
                    finalScore += teacherScore;
                }
            });

            chapter.finalScore = finalScore;
            chapter.correctionStatus = 'in_progress';

            await storage.set(`student_${studentId}_progress`, progress);
            
            alert('✅ Toutes les corrections ont été sauvegardées !');
            this.closeCorrectionModal();
            this.openCorrectionModal(studentId, chapterId);
            this.refresh();

        } catch (error) {
            console.error('❌ Erreur sauvegarde globale:', error);
            alert('❌ Une erreur est survenue lors de la sauvegarde.');
        }
    }

    async saveQuestionCorrection(studentId, chapterId, questionId) {
        const scoreInput = document.getElementById(`score-${questionId}`);
        const commentInput = document.getElementById(`comment-${questionId}`);
        
        if (!scoreInput || !commentInput) return;

        const teacherScore = parseFloat(scoreInput.value) || 0;
        const teacherComment = commentInput.value.trim();

        try {
            const progress = await this.dashboard.getStudentProgress(studentId);
            const chapter = progress.chapters[chapterId];
            
            if (chapter && chapter.questions[questionId]) {
                const question = chapter.questions[questionId];
                question.teacherScore = teacherScore;
                question.teacherComment = teacherComment;
                question.manualCorrectionStatus = 'corrected';
                question.correctedAt = new Date().toISOString();

                // Recalculer le score final
                chapter.finalScore = Object.values(chapter.questions)
                    .filter(q => !q.needsManualCorrection && q.isCorrect === true)
                    .reduce((sum, q) => sum + (q.score || 0), 0) +
                    Object.values(chapter.questions)
                    .filter(q => q.needsManualCorrection)
                    .reduce((sum, q) => sum + (q.teacherScore || 0), 0);

                await storage.set(`student_${studentId}_progress`, progress);
                
                alert('✅ Correction sauvegardée !');
                this.closeCorrectionModal();
                this.openCorrectionModal(studentId, chapterId);
                this.refresh();
            }
        } catch (error) {
            console.error('❌ Erreur sauvegarde correction:', error);
            alert('❌ Une erreur est survenue lors de la sauvegarde.');
        }
    }

    async returnQuestion(studentId, chapterId, questionId) {
        const confirmed = confirm('🔄 Renvoyer cette question à l\'apprenant pour révision ?');
        if (!confirmed) return;

        try {
            const progress = await this.dashboard.getStudentProgress(studentId);
            const chapter = progress.chapters[chapterId];
            
            if (chapter && chapter.questions[questionId]) {
                const question = chapter.questions[questionId];
                question.manualCorrectionStatus = 'returned_for_revision';
                question.revisionRequested = true;
                question.revisionRequestedAt = new Date().toISOString();

                await storage.set(`student_${studentId}_progress`, progress);
                
                alert('🔄 Question renvoyée pour révision !');
                this.closeCorrectionModal();
                this.refresh();
            }
        } catch (error) {
            console.error('❌ Erreur renvoi question:', error);
            alert('❌ Une erreur est survenue.');
        }
    }

    async approveChapter(studentId, chapterId) {
        const confirmed = confirm('✅ Valider définitivement ce chapitre ?');
        if (!confirmed) return;

        try {
            const progress = await this.dashboard.getStudentProgress(studentId);
            const chapter = progress.chapters[chapterId];
            
            if (chapter) {
                chapter.approvedAt = new Date().toISOString();
                chapter.validatedAt = chapter.approvedAt;
                chapter.submissionStatus = 'validated';

                await storage.set(`student_${studentId}_progress`, progress);
                
                alert('✅ Chapitre validé avec succès !');
                this.closeCorrectionModal();
                this.refresh();
            }
        } catch (error) {
            console.error('❌ Erreur validation chapitre:', error);
            alert('❌ Une erreur est survenue.');
        }
    }

    async returnForRevision(studentId, chapterId) {
        const comment = prompt('💬 Commentaire pour l\'apprenant (optionnel) :');
        
        // Si l'utilisateur clique sur Annuler → on arrête tout, aucune action
        if (comment === null) {
            return;
        }

        try {
            const progress = await this.dashboard.getStudentProgress(studentId);
            const chapter = progress.chapters[chapterId];
            
            if (chapter) {
                chapter.revisionRequestedAt = new Date().toISOString();
                chapter.teacherComment = comment || '';
                chapter.submissionStatus = 'returned_for_revision';

                await storage.set(`student_${studentId}_progress`, progress);
                
                alert('🔄 Chapitre renvoyé pour révision !');
                this.refresh();
            }
        } catch (error) {
            console.error('❌ Erreur renvoi chapitre:', error);
            alert('❌ Une erreur est survenue.');
        }
    }

    async showStudentChapterView(studentId, chapterId) {
        const users = await this.dashboard.auth.getUsers();
        const student = users.find(u => u.id === studentId);
        const chapterConfig = this.dashboard.chapters.find(c => c.id === chapterId);
        
        if (!student || !chapterConfig) {
            alert('Apprenant ou chapitre introuvable');
            return;
        }

        const chapterFileName = `chapitre${chapterId}.html`;
        const chapterUrl = `../chapters/${chapterFileName}?teacher_view=true&student_id=${studentId}&t=${Date.now()}`;

        const modalHtml = `
            <div class="modal-overlay" id="student-chapter-view-modal">
                <div class="modal-content" style="max-width: 95%; width: 95%; max-height: 90vh; padding: 0; overflow: hidden;">
                    <div class="modal-header" style="background: #2c3e50; color: white; margin: 0; padding: 1rem 2rem; border-radius: 0;">
                        <h3 style="margin: 0; color: white;">👁️ Vue Apprenant - ${chapterConfig.title} (${student.name})</h3>
                        <button class="close-btn" onclick="dashboard.modules.submissions.closeStudentChapterView()" style="color: white;">&times;</button>
                    </div>
                    
                    <div class="teacher-view-banner" style="background: #fff3cd; color: #856404; padding: 0.75rem 1rem; text-align: center; font-weight: bold; border-bottom: 1px solid #ffc107;">
                        👨‍🏫 Mode Formateur - Lecture seule - Vous voyez ce que l'apprenant voit
                    </div>
                    
                    <div style="height: calc(90vh - 120px);">
                        <iframe 
                            id="student-chapter-iframe"
                            src="${chapterUrl}" 
                            style="width: 100%; height: 100%; border: none;"
                            title="Vue apprenant du chapitre"
                        ></iframe>
                    </div>
                </div>
            </div>
        `;

        // Fermer d'abord tout modal existant
        const existingModal = document.getElementById('student-chapter-view-modal');
        if (existingModal) existingModal.remove();

        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    closeCorrectionModal() {
        const modal = document.getElementById('correction-modal');
        if (modal) modal.remove();
    }

    closeStudentChapterView() {
        const modal = document.getElementById('student-chapter-view-modal');
        if (modal) modal.remove();
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.remove();
    }
}