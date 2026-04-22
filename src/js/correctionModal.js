/**
 * correctionModal.js - Composant autonome de modal de correction
 * 
 * Ce module gère ENTIEREMENT l'interface de correction des chapitres.
 * Il est totalement découplé de TeacherSubmissions et peut être appelé depuis n'importe ou.
 * 
 * @author Cours Interactifs
 * @version 2.0
 */

class CorrectionModal {

    constructor() {
        this.context = null;
        this.viewModel = null;
        this.bindEvents();
    }

    /**
     * Calcule le score théorique AUTO indépendant (source de vérité système)
     * Ce score n'est JAMAIS modifié par le professeur
     */
    calculateAutoTheoreticalScore(q, qData) {
        if (!qData) return 0;

        // ✅ Pour les questions SEMI / MANUELLES : on réutilise DIRECTEMENT le score calculé coté élève
        // On ne recalcule rien, on respecte la logique métier déjà appliquée lors de la réponse
        if (q.correctionType === 'semi' || q.correctionType === 'manuel') {
            
            // 🚨 CAS SPÉCIAL : AUCUNE RÉPONSE
            // Si l'élève n'a JAMAIS répondu (answered = false ou undefined)
            if (!qData.answered || qData.answer === null || qData.answer === undefined || qData.answer === '') {
                return 0; // Pas de réponse = 0 point, statut AUTOMATIQUE
            }

            // Sinon on retourne la valeur exacte sauvegardée: 0, points, ou null
            // null = en attente de correction professeur
            return qData.score ?? null;
        }

        // Pour les questions AUTO : on garde le calcul existant
        let wasAnswered =
            qData.answered === true ||
            (typeof qData.answer === 'string' && qData.answer.trim() !== '') ||
            (Array.isArray(qData.answer) && qData.answer.length > 0) ||
            (qData.answer !== null && qData.answer !== undefined && qData.answer !== '');

        let effectiveIsCorrect = qData.isCorrect;
        let attempts = qData.attempts || 0;

        if (attempts > 0 && !wasAnswered) {
            effectiveIsCorrect = false;
        }

        if (effectiveIsCorrect === true) {
            let pointsEarned = q.points - ((attempts - 1) * q.points);
            const maxPenalty = q.points * 2;
            return Math.max(-maxPenalty, pointsEarned);
        }

        if (effectiveIsCorrect === false) {
            return -q.points;
        }

        return 0;
    }

    /**
     * Point d'entrée public unique pour ouvrir le modal de correction
     */
    async open(studentId, chapterId, dashboard) {
        // 🟢 DEBUG LOGS PARAMÈTRES D'ENTRÉE
        console.group('🔵 DEBUG CORRECTION MODAL - PARAMÈTRES D\'ENTRÉE');
        console.log('studentId:', studentId);
        console.log('chapterId:', chapterId);
        console.log('dashboard:', dashboard);
        console.groupEnd();

        this.dashboard = dashboard;
        
        const context = await this.getCorrectionContext(studentId, chapterId);
        if (!context) return;

        this.context = context;
        this.viewModel = this.buildQuestionsViewModel(context);
        
        this.render();
        this.bindModalEvents();

        // Appliquer directement le filtre "auto" au démarrage
        this.applyFilters('auto');
    }

    /**
     * Récupère toutes les données nécessaires pour la correction
     */
    async getCorrectionContext(studentId, chapterId) {
        const users = await this.dashboard.auth.getUsers();
        const student = users.find(u => u.id === studentId);
        const progress = await this.dashboard.getStudentProgress(studentId);
        const chapter = progress.chapters[chapterId];
        
        // Chargement de l'index des chapitres si pas déjà fait
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

    /**
     * Construit le modèle de vue unifié pour toutes les questions + cours
     */
    buildQuestionsViewModel(context) {
        const { chapter, chapterConfig } = context;
        
        const allQuestions = [];

        // 1. Ajouter toutes les questions standard depuis la configuration
        chapterConfig.questions.forEach((questionConfig, index) => {
            const questionData = chapter.questions?.[questionConfig.id] || {};
            
            const theoreticalScore = this.calculateAutoTheoreticalScore(questionConfig, questionData);

            allQuestions.push({
                id: questionConfig.id,
                ...questionConfig,
                ...questionData,
                status: this.getQuestionStatus(questionData, questionConfig),
                
                // ✅ NOUVEAU
                uxStatus: this.getDisplayStatus({
                    ...questionConfig,
                    ...questionData
                }),

                theoreticalScore,
                teacherScore: questionData.teacherScore,

                isManual: questionConfig.correctionType === 'semi',
                isCourse: false
            });
        });

        // 2. Ajouter TOUS les cours du chapitre depuis la configuration
        const totalCourseCount = chapterConfig.courseCount || 0;
        const requiredCourseCount = chapterConfig.courseValidationCount || 0;
        
        // 🟢 DEBUG COURS - Affiche toutes les données relatives aux cours
        console.group('📚 DEBUG CORRECTION MODAL - COURS');
        console.log('📊 Configuration chapitre:');
        console.log('   courseCount (total présent):', totalCourseCount);
        console.log('   courseValidationCount (obligatoires à valider):', requiredCourseCount);
        console.log('📋 Cours présents dans les réponses étudiant:');
        Object.keys(chapter.questions || {})
            .filter(key => key.startsWith('course_'))
            .forEach(key => {
                console.log(`   ${key}:`, chapter.questions[key]);
            });
        console.groupEnd();
        
        // ✅ On charge TOUS les cours du chapitre, pas seulement les obligatoires
        for (let i = 0; i < totalCourseCount; i++) {
            const courseId = `course_${i}`;
            const courseData = chapter.questions?.[courseId] || {};
            
            // ✅ SOURCE DE VÉRITÉ ABSOLUE: on lit directement depuis la configuration du générateur
            // Pas de calcul, pas de logique, pas d'ordre: c'est écrit dans le JSON
            const courseConfig = chapterConfig.courses?.find(c => c.index === i);
            const isRequired = courseConfig ? courseConfig.requiresValidation : false;
            
            console.log(`✅ Ajout cours ${i+1}/${totalCourseCount}: ${courseId} | obligatoire: ${isRequired}`, courseData);
            
            allQuestions.push({
                id: courseId,
                title: `Cours ${i + 1}`,
                index: i,
                ...courseData,
                status: courseData.isCorrect === true ? 'corrected' : 'pending',
                isManual: false,
                isCourse: true,
                isRequired: isRequired, // ❗ SEULEMENT les X premiers cours sont obligatoires
            });
        }

        const stats = this.calculateCorrectionStats(allQuestions);
        const scoring = this.calculateDetailedScore(allQuestions);
        
        return { 
            questions: allQuestions, 
            stats, 
            scoring,
            activeFilter: 'all' 
        };
    }

    /**
     * Détermine le statut d'une question
     */
    getQuestionStatus(data, config) {        
        if (data.manualCorrectionStatus === 'corrected') return 'corrected';
        if (data.manualCorrectionStatus === 'returned_for_revision') return 'returned';
        
        if (config.id.startsWith('course_')) {
            return data.isCorrect === true ? 'corrected' : 'pending';
        }
        
        if (config.correctionType === 'auto') return 'auto';
        
        if (config.correctionType === 'semi') {
            return 'pending';
        }
        
        return 'pending';
    }

    /**
     * 🧠 Statut UX simplifié adapté à la logique métier
     */
    getDisplayStatus(question) {
        // Cas des cours : pas de statut affiché
        if (question.isCourse) {
            return null;
        }

        // Définir score système et score affiché
        const systemScore = question.theoreticalScore ?? question.score;
        const displayScore = (typeof question.teacherScore === 'number' && !isNaN(question.teacherScore)) 
            ? question.teacherScore 
            : null;

        // ✅ 1. Automatique : score système existe et égal au score affiché
        if (systemScore !== null && systemScore !== undefined) {
            if (displayScore === null || displayScore === undefined || displayScore === systemScore) {
                return {
                    key: 'auto',
                    label: '⚙️ Automatique'
                };
            }
            
            // ✅ 2. Modifié : score système existe et différent du score affiché
            return {
                key: 'modified',
                label: '✏️ Modifiée'
            };
        }
        
        // ✅ 3. Corrigé : pas de score système mais score affiché défini
        if (displayScore !== null && displayScore !== undefined) {
            return {
                key: 'corrected',
                label: '✅ Corrigé'
            };
        }
        
        // ✅ 4. A corriger : ni score système ni score affiché
        return {
            key: 'pending',
            label: '⏳ À corriger'
        };
    }

    /**
     * Calcule les statistiques de progression de la correction
     */
    calculateCorrectionStats(questions) {
        const total = questions.length;
        const corrected = questions.filter(q => q.status === 'corrected').length;
        const pending = questions.filter(q => q.status === 'pending').length;
        const manual = questions.filter(q => q.isManual).length;
        const courses = questions.filter(q => q.isCourse).length;
        const progression = manual > 0 ? Math.round((corrected / manual) * 100) : 100;

        return { total, corrected, pending, manual, progression, auto: total - manual, totalCourses: courses };
    }

    calculateDetailedScore(questions) {

        const autoQs = questions.filter(q => q.correctionType === 'auto');
        const manualQs = questions.filter(q => q.correctionType !== 'auto' && !q.isCourse);

        const sum = (qs, field) => qs.reduce((acc, q) => acc + (q[field] || 0), 0);

        const sumTeacher = (qs) => qs.reduce((acc, q) => {
            // ✅ ROBUSTE: seulement si c'est un nombre valide
            if (typeof q.teacherScore === 'number' && !isNaN(q.teacherScore)) {
                return acc + q.teacherScore;
            }
            // ✅ Toujours forcer en nombre
            return acc + parseFloat(q.theoreticalScore ?? q.score ?? 0);
        }, 0);

        return {
            auto: {
                theoretical: sum(autoQs, 'theoreticalScore'),
                teacher: sumTeacher(autoQs),
                max: sum(autoQs, 'points')
            },
            manual: {
                teacher: sumTeacher(manualQs),
                max: sum(manualQs, 'points')
            }
        };
    }

    /**
     * Affiche le modal complet
     */
    render() {
        this.close();
        
        const html = `
            <div class="modal-overlay" id="correction-modal">
                <div class="modal-content correction-modal">
                    ${this.renderHeader()}
                    ${this.renderFilters()}
                    <div class="modal-body correction-modal-body">
                        ${this.renderQuestionList()}
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', html);
    }

    /**
     * Rendu de l'entête du modal
     */
    renderHeader() {
        const { student, chapterConfig } = this.context;
        const { stats } = this.viewModel;

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
                    <button class="correction-header-btn" id="correction-btn-cancel" title="Annuler et fermer">
                        ❌ Annuler
                    </button>
                    <button class="correction-header-btn btn-primary" id="correction-btn-save" title="Sauvegarder toutes les modifications">
                        💾 Sauvegarder
                    </button>
                    <button class="correction-header-btn btn-success" id="correction-btn-approve" title="Valider définitivement ce chapitre">
                        ✅ Valider
                    </button>
                    <button class="close-btn" id="correction-btn-close">&times;</button>
                </div>
            </div>
        `;
    }

    /**
     * Rendu des filtres de questions
     */
    renderFilters() {
        return `
            <div class="correction-filters" id="correction-filters">
                <button class="filter-btn active" data-filter="auto">⚙️ Automatique</button>
                <button class="filter-btn" data-filter="manual">✏️ A corriger</button>
                <button class="filter-btn" data-filter="course">📚 Cours</button>
            </div>
        `;
    }

    /**
     * Rendu de la liste complète des questions
     */
    renderQuestionList() {
        const { scoring } = this.viewModel;

        // ✅ Calculer les totaux affichés en direct conformément à la règle
        const displayAutoTeacher = this.viewModel.questions
            .filter(q => q.correctionType === 'auto')
            .reduce((sum, q) => {
                if (typeof q.teacherScore === 'number' && !isNaN(q.teacherScore)) {
                    return sum + q.teacherScore;
                }
                return sum + parseFloat(q.theoreticalScore ?? q.score ?? 0);
            }, 0);

        const displayManualTeacher = this.viewModel.questions
            .filter(q => q.correctionType !== 'auto' && !q.isCourse)
            .reduce((sum, q) => {
                const scoreInput = document.getElementById(`score-${q.id}`);
                if (scoreInput) {
                    const currentVal = parseFloat(scoreInput.value);
                    if (!isNaN(currentVal)) return sum + currentVal;
                }
                if (q.teacherScore !== undefined) return sum + q.teacherScore;
                return sum + (q.theoreticalScore || q.score || 0);
            }, 0);

        const autoSummary = `
<div class="question-correction" style="background:#f3f6fb; border-left:4px solid #2196f3;">
    <strong>⚙️ Automatique</strong><br>

    🧠 Théorique : ${scoring.auto.theoretical} / ${scoring.auto.max}<br>
    ✏️ Prof : ${displayAutoTeacher} / ${scoring.auto.max}
</div>
`;

        const manualSummary = `
<div class="question-correction" style="background:#f3f6fb; border-left:4px solid #2196f3;">
    <strong>✏️ Correction</strong><br>

    ✏️ Score : ${displayManualTeacher} / ${scoring.manual.max}
</div>
`;

        const questionsHtml = this.viewModel.questions.map(q => this.renderQuestionItem(q)).join('');
        
        // Vérifier si il y a des cours obligatoires
        const hasRequiredCourses = this.viewModel.questions.some(q => q.isCourse && q.isRequired);
        if (!hasRequiredCourses) {
            return autoSummary + questionsHtml;
        }

        // Compter combien de cours obligatoires sont non lus
        const unreadRequiredCount = this.viewModel.questions.filter(q => q.isCourse && q.isRequired && !q.isCorrect).length;
        const hasUnreadRequired = unreadRequiredCount > 0;

        // Lire la pénalité existante sauvegardée ou prendre défaut
        const existingPenalty = this.context.chapter.coursePenalty !== undefined ? this.context.chapter.coursePenalty : (hasUnreadRequired ? -2 : 0);

        const penaltyHtml = `
            <div class="question-correction question-penalty" style="border: 2px dashed #ff9800; background: #fff8e1; margin-top: 2rem;">
                <div class="question-correction-header">
                    <h6>📌 Pénalité validation cours</h6>
                </div>
                <div class="correction-row">
                    <div class="correction-label">⚖️ Statut:</div>
                    <div class="correction-value ${hasUnreadRequired ? 'incorrect' : 'correct'}">
                        ${hasUnreadRequired ? `⚠️ ${unreadRequiredCount} cours obligatoire(s) non lu(s)` : '✅ Tous les cours obligatoires sont lus'}
                    </div>
                </div>
                <div class="correction-inputs" style="margin-top: 1rem;">
                    <div class="form-group">
                        <label>Valeur de la pénalité</label>
                        <input type="number" class="question-score" 
                               id="course-penalty" min="-10" max="0"
                               value="${existingPenalty}" step="0.5">
                    </div>
                </div>
                <div class="correction-note">
                    ℹ️ Cette pénalité est appliquée UNE SEULE FOIS si au moins un cours obligatoire n'est pas lu. Vous pouvez modifier cette valeur ou la mettre à 0 pour annuler complètement la pénalité.
                </div>
            </div>
        `;

        return `
<div id="summary-container"></div>
${questionsHtml}
${penaltyHtml}
`;
    }

    /**
     * Rendu d'un élément question individuel
     */
    renderQuestionItem(question) {
        console.log('🔍 DEBUG QUESTION OBJET:', question);
        const maxPoints = question.points || 0;
        // ✅ ROBUSTE: prendre le teacherScore seulement si c'est un nombre valide
        const defaultScore = 
            (typeof question.teacherScore === 'number' && !isNaN(question.teacherScore)) 
                ? question.teacherScore 
                : parseFloat(question.theoreticalScore ?? question.score ?? 0);

        // ✅ Cas spécial: éléments de cours
        if (question.isCourse) {
            if (!question.isRequired) {
                // 🟢 Cours informatif : pas de statut, pas de validation, rien
                return `
                    <div class="question-correction question-info" data-question-id="${question.id}" data-is-course="true">
                        <div class="question-correction-header">
                            <h6>📚 ${question.title || question.id}</h6>
                            <span class="status-badge status-info">INFORMATIF</span>
                        </div>
                        <div class="correction-note">
                            ℹ️ Ceci est un cours informatif. Aucune validation requise, pas de pénalité.
                        </div>
                    </div>
                `;
            }

            // 🔴 Cours obligatoire
            const isRead = question.isCorrect === true;
            
            return `
                <div class="question-correction ${isRead ? 'question-corrected' : 'question-pending'}" data-question-id="${question.id}" data-status="${question.status}" data-is-course="${question.isCourse}">
                    <div class="question-correction-header">
                        <h6>📚 ${question.title || question.id}</h6>
                        <span class="status-badge status-pending" style="font-size: 0.7em;">OBLIGATOIRE</span>
                        <span class="status-badge ${isRead ? 'status-corrected' : 'status-pending'}">${isRead ? '✅ Lu' : '❌ Non lu'}</span>
                    </div>
                    
                    <div class="correction-row">
                        <div class="correction-label">👤 Statut:</div>
                        <div class="correction-value ${isRead ? 'correct' : 'incorrect'}">
                            ${isRead ? 'Apprenant a marqué ce cours comme lu' : 'Apprenant n\'a pas lu ce cours'}
                        </div>
                    </div>
                    
                    <div class="correction-note">
                        ℹ️ Ce cours est obligatoire pour la validation du chapitre.
                    </div>
                </div>
            `;
        }

        // Cas normal: questions
        let studentAnswer = '(pas de réponse)';
        if (question.answer !== undefined && question.answer !== null) {
            if (question.type === 'qcm' && question.options) {
                const answerIndex = parseInt(question.answer);
                studentAnswer = question.options[answerIndex] || question.answer;
            } else {
                studentAnswer = question.answer;
            }
        }

        const displayStatus = this.getDisplayStatus(question);
        
        const needsAttention = displayStatus.key === 'pending';
        
        // Résoudre la bonne réponse attendue en clair
        let correctAnswer = '';
        if (question.correctAnswers && question.options) {
            if (Array.isArray(question.correctAnswers)) {
                correctAnswer = question.correctAnswers.map(i => question.options[i]).join(' & ');
            } else {
                correctAnswer = question.options[question.correctAnswers] || '';
            }
        } else if (question.type === 'courte' && Array.isArray(question.correctAnswers)) {
            correctAnswer = question.correctAnswers.join(' || ');
        }

        return `
            <div class="question-correction question-${question.status} ${needsAttention ? 'needs-attention' : ''}" 
                 data-question-id="${question.id}" 
                 data-status="${question.status}" 
                 data-is-course="${question.isCourse}"
                 data-category="${question.correctionType === 'auto' ? 'auto' : 'manual'}">
                <div class="question-correction-header">
                    <h6>${question.title || `Question ${question.id}`}</h6>
                    <span class="status-badge status-${displayStatus.key}">${displayStatus.label}</span>
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

                ${question.correctionType === 'semi' ? `
                <div class="auto-correction-note">
                    <span>
${(question.answered === false || studentAnswer === '(pas de réponse)') ? `
🧠 Score système : 0 / ${maxPoints} pts
<br>❌ Aucune réponse
` : ''}

${question.answered !== false && (question.score !== undefined && question.score !== null) ? `
🧠 Score système : ${question.score} / ${maxPoints} pts

${(typeof question.teacherScore === 'number' && !isNaN(question.teacherScore) && question.teacherScore !== question.score) ? `
<br>🖊️ Score modifié par le professeur : ${question.teacherScore} / ${maxPoints} pts
` : ''}
` : ''}

${question.answered !== false && studentAnswer !== '(pas de réponse)' &&
  (question.score === undefined || question.score === null) && 
  !(typeof question.teacherScore === 'number' && !isNaN(question.teacherScore)) ? `
⏳ En attente de correction
` : ''}

${question.answered !== false && studentAnswer !== '(pas de réponse)' &&
  (question.score === undefined || question.score === null) && 
  (typeof question.teacherScore === 'number' && !isNaN(question.teacherScore)) ? `
🖊️ Score attribué par le professeur : ${question.teacherScore} / ${maxPoints} pts
` : ''}
</span>
                </div>
                ` : ''}

                ${question.correctionType === 'auto' ? `
                <div class="auto-correction-note">
                    <span>
🧠 Score système : ${question.theoreticalScore} / ${maxPoints} pts  
<br>
🔁 ${question.attempts || 0} tentative(s)

${question.theoreticalScore < 0 ? `
<br>❌ Réponse incorrecte
` : ''}

${question.theoreticalScore > 0 && (question.attempts || 0) > 1 ? `
<br>⚠️ Score réduit à cause des tentatives
` : ''}

${(typeof question.teacherScore === 'number' && !isNaN(question.teacherScore) && question.teacherScore !== question.theoreticalScore) ? `
<br>🖊️ Score modifié par le professeur : ${question.teacherScore} / ${maxPoints} pts
` : ''}
</span>
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

    /**
     * Attache tous les événements du modal
     */
    bindModalEvents() {
        // Boutons principaux
        document.getElementById('correction-btn-close').addEventListener('click', () => this.close());
        document.getElementById('correction-btn-cancel').addEventListener('click', () => this.close());
        document.getElementById('correction-btn-save').addEventListener('click', () => this.saveAllCorrections());
        document.getElementById('correction-btn-approve').addEventListener('click', () => this.approveChapter());

        // Filtres
        document.querySelectorAll('#correction-filters .filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.applyFilters(e.target.dataset.filter));
        });

        // Calcul du score en direct
        document.querySelectorAll('.question-score').forEach(input => {
            input.addEventListener('input', () => this.calculateScoreLive());
        });
    }

    /**
     * Applique les filtres sur la liste des questions
     */
    /**
     * Met à jour le résumé dynamique en fonction de l'onglet actif
     */
    updateSummary(filter) {
        const el = document.getElementById('summary-container');
        const { scoring } = this.viewModel;

        if (!el) return;

        if (filter === 'auto') {
            el.innerHTML = `
<div class="question-correction" style="background:#f3f6fb; border-left:4px solid #2196f3;">
    <strong>⚙️ Automatique</strong><br>
    🧠 Théorique : ${scoring.auto.theoretical} / ${scoring.auto.max}<br>
    ✏️ Prof : ${scoring.auto.teacher} / ${scoring.auto.max}
</div>
            `;
        }

        if (filter === 'manual') {
            el.innerHTML = `
<div class="question-correction" style="background:#f3f6fb; border-left:4px solid #2196f3;">
    <strong>✏️ Correction</strong><br>
    ✏️ Score : ${scoring.manual.teacher} / ${scoring.manual.max}
</div>
            `;
        }

        if (filter === 'course') {
            el.innerHTML = '';
        }
    }

    applyFilters(filter) {
        console.group('🔘 ONGLET CLICK:', filter);
        
        this.viewModel.questions.forEach(q => {
            if (q.correctionType === 'auto' || q.correctionType === 'semi') {
                console.log(`🔍 QUESTION ${q.correctionType} ${q.id}:`, {
                    id: q.id,
                    answered: q.answered,
                    answer: q.answer,
                    theoreticalScore: q.theoreticalScore,
                    score: q.score,
                    teacherScore: q.teacherScore,
                    correctionType: q.correctionType,
                    status: q.status
                });
            }
        });

        const { scoring } = this.viewModel;
        console.log('📊 SCORING GLOBAL:', scoring);
        
        document.querySelectorAll('#correction-filters .filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === filter);
        });

        const showCourses = filter === 'course';

        document.querySelectorAll('.question-correction:not(.question-penalty)').forEach(el => {
            const isCourse = el.dataset.isCourse === 'true';
            const category = el.dataset.category;

            let visible = false;

            if (filter === 'course') {
                visible = isCourse;
            } else if (filter === 'auto') {
                visible = !isCourse && category === 'auto';
            } else if (filter === 'manual') {
                visible = !isCourse && category === 'manual';
            }

            el.style.display = visible ? 'block' : 'none';
        });

        const penaltyEl = document.querySelector('.question-penalty');
        if (penaltyEl) {
            penaltyEl.style.display = showCourses ? 'block' : 'none';
        }

        this.updateSummary(filter);
    }

    /**
     * Calcule et met à jour le score total en temps réel
     */
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

    /**
     * Sauvegarde TOUTES les corrections effectuées
     */
    async saveAllCorrections() {
        try {
            const { studentId, chapterId } = this.context;
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

            // Ajouter la pénalité des cours
            const penaltyInput = document.getElementById('course-penalty');
            if (penaltyInput) {
                const coursePenalty = parseFloat(penaltyInput.value) || 0;
                finalScore += coursePenalty;
                chapter.coursePenalty = coursePenalty;
            }

            chapter.finalScore = finalScore;
            chapter.correctionStatus = 'in_progress';

            await storage.set(`student_${studentId}_progress`, progress);
            
            alert('✅ Toutes les corrections ont été sauvegardées !');
            
            this.close();
            
            // Réouvrir pour actualiser les données
            this.open(studentId, chapterId, this.dashboard);
            
            // Rafraichir le dashboard parent
            if(this.dashboard.modules.submissions) {
                this.dashboard.modules.submissions.refresh();
            }

        } catch (error) {
            console.error('❌ Erreur lors de la sauvegarde:', error);
            alert('Erreur lors de la sauvegarde des corrections');
        }
    }

    /**
     * Ferme et supprime le modal du DOM
     */
    close() {
        const existing = document.getElementById('correction-modal');
        if (existing) existing.remove();
    }

    bindEvents() {
        // Événements globaux si nécessaire
    }
}

// ✅ Initialisation globale obligatoire
window.correctionModal = new CorrectionModal();
console.log("✅ correctionModal.js chargé - Modal de correction disponible globalement");
