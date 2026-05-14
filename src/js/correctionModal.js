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
        this.activeFilter = 'manual'; // ✅ Mémorise l'onglet actif (par défaut "À corriger")
        this.bindEvents();
    }

    /**
     * Calcule le score théorique AUTO indépendant (source de vérité système)
     * Ce score n'est JAMAIS modifié par le professeur
     */
    calculateAutoTheoreticalScore(q, qData) {
        if (!qData) return 0;

        // ✅ Pour les questions SEMI / MANUELLES : on réutilise DIRECTEMENT le score calculé coté apprenant
        // On ne recalcule rien, on respecte la logique métier déjà appliquée lors de la réponse
        if (q.correctionType === 'semi' || q.correctionType === 'manuel') {
            
            // 🚨 CAS SPÉCIAL : AUCUNE RÉPONSE
            // Si l'apprenant n'a JAMAIS répondu (answered = false ou undefined)
            if (!qData.answered || qData.answer === null || qData.answer === undefined || qData.answer === '') {
                return 0; // Pas de réponse = 0 point, statut AUTOMATIQUE
            }

            // 🔑 CAS CLÉ : question ouverte (textarea) semi-auto
            // QuestionEngine stocke toujours score=0 pour state('pending'), même si la réponse est assez longue.
            // On distingue via isCorrect :
            //   isCorrect === null  → réponse assez longue, EN ATTENTE du prof → null (À corriger)
            //   isCorrect === false → réponse trop courte, échec automatique définitif → 0 (Auto-corrigé)
            //   isCorrect === true  → réponse exacte (QCM/courte), auto-validée → score stocké
            if (q.correctionType === 'semi' && qData.isCorrect === null) {
                // La réponse existe et est assez longue, mais le prof doit évaluer
                return null; // → theoreticalScore null → onglet "À corriger"
            }

            // Sinon: 0 (trop courte/faux) ou points (correct auto-validé)
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

        this.dashboard = dashboard;
        
        const context = await this.getCorrectionContext(studentId, chapterId);
        if (!context) return;

        this.context = context;
        this.viewModel = this.buildQuestionsViewModel(context);
        
        this.render();
        this.bindModalEvents();

        // ✅ Ré-appliquer le dernier onglet utilisé au lieu de forcer 'auto'
        this.applyFilters(this.activeFilter);
    }

    /**
     * Récupère toutes les données nécessaires pour la correction
     */
    async getCorrectionContext(studentId, chapterId) {
        // 1. Récupérer le slug du parcours
        const slug = window.currentParcoursSlug || (window.Parcours ? Parcours.slug : null);
        if (!slug) {
            alert('Aucun parcours sélectionné');
            return null;
        }
        
        // 2. Charger la liste des utilisateurs (clé avec slug)
        const usersKey = `${slug}:teacher:users_list`;
        const users = await storage.get(usersKey) || [];
        const student = users.find(u => u.id === studentId);
        if (!student) {
            alert(`Apprenant ${studentId} introuvable dans le parcours ${slug}`);
            return null;
        }
        
        // 3. Charger la progression avec la clé complète
        const progressKey = `${slug}:${studentId}:student_${studentId}_progress`;
        let progress = await storage.get(progressKey);
        if (!progress) {
            // Initialiser une progression vide si elle n'existe pas
            progress = {
                chapters: {},
                scores: {},
                totalCompleted: 0,
                questionAttempts: {},
                lastUpdated: new Date().toISOString()
            };
        }
        
        const chapter = progress.chapters?.[chapterId];
        
        // 4. Charger l'index des chapitres (cours.json) si nécessaire
        if (!window.chaptersIndex) {
            const response = await fetch((window.BASE || '') + '/parcours/cours.json');
            if (response.ok) {
                const data = await response.json();
                const parcours = data.parcours.find(p => p.slug === slug);
                if (parcours) {
                    window.chaptersIndex = { chapters: parcours.chapitres };
                }
            }
        }
        const chapterConfig = window.chaptersIndex?.chapters?.find(ch => ch.id == chapterId);
        
        if (!chapter || !chapterConfig) {
            alert(`Chapitre ${chapterId} ou configuration introuvable`);
            return null;
        }
        
        // 5. Retourner le contexte complet
        return {
            student,
            progress,
            chapter,
            chapterConfig,
            studentId,
            chapterId,
            slug,
            progressKey   // ← utile pour la sauvegarde
        };
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

            // ✅ On construit d'abord l'objet complet AVEC theoreticalScore
            const questionObj = {
                id: questionConfig.id,
                ...questionConfig,
                ...questionData,
                status: this.getQuestionStatus(questionData, questionConfig),
                theoreticalScore,
                teacherScore: questionData.teacherScore,
                isManual: questionConfig.correctionType === 'semi',
                isCourse: false
            };

            // ✅ MAINTENANT on peut calculer uxStatus qui aura accès à theoreticalScore
            questionObj.uxStatus = this.getDisplayStatus(questionObj);

            allQuestions.push(questionObj);
        });

        // 2. Ajouter TOUS les cours du chapitre depuis la configuration
        const totalCourseCount = chapterConfig.courseCount || 0;
        const requiredCourseCount = chapterConfig.courseValidationCount || 0;
        
        
        // ✅ On charge TOUS les cours du chapitre, pas seulement les obligatoires
        for (let i = 0; i < totalCourseCount; i++) {
            const courseId = `course_${i}`;
            const courseData = chapter.questions?.[courseId] || {};
            
            // ✅ SOURCE DE VÉRITÉ ABSOLUE: on lit directement depuis la configuration du générateur
            // Pas de calcul, pas de logique, pas d'ordre: c'est écrit dans le JSON
            const courseConfig = chapterConfig.courses?.find(c => c.index === i);
            const isRequired = courseConfig ? courseConfig.requiresValidation : false;
            
            
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
        if (data.manualCorrectionStatus === 'returned_for_revision') return 'returned_for_revision';
        
        if (config.id.startsWith('course_')) {
            return data.isCorrect === true ? 'corrected' : 'pending';
        }
        
        if (config.correctionType === 'auto') return 'auto';
        
        if (config.correctionType === 'semi') {
            return 'pending';
        }
        
        return 'pending';
    }

    getDisplayStatus(question) {
        // Cas des cours : pas de statut affiché
        if (question.isCourse) {
            return null;
        }

        const systemScore = question.theoreticalScore ?? question.score;
        const displayScore = (typeof question.teacherScore === 'number' && !isNaN(question.teacherScore)) 
            ? question.teacherScore 
            : null;

        // ✅ Les badges reflètent le correctionType RÉEL de la question
        // On ne recalcule pas le type, on l'affiche fidèlement
        const typeLabels = {
            'auto':   '⚙️ Auto',
            'semi':   '🔀 Semi-auto',
            'manuel': '✏️ Manuel',
        };
        const typeLabel = typeLabels[question.correctionType] || '⚙️ Auto';
        const typeKey   = question.correctionType || 'auto';

        // ✅ 1. Score système disponible (auto-évalué)
        if (systemScore !== null && systemScore !== undefined) {
            if (displayScore === null || displayScore === undefined || displayScore === systemScore) {
                return {
                    key: typeKey,
                    label: typeLabel
                };
            }
            // ✅ 2. Score système modifié par le prof
            return {
                key: 'modified',
                label: `${typeLabel} ✏️`
            };
        }
        
        // ✅ 3. Pas de score système mais score prof défini
        if (displayScore !== null && displayScore !== undefined) {
            return {
                key: 'corrected',
                label: `${typeLabel} ✅`
            };
        }
        
        // ✅ 4. Aucun score : à corriger
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
        
        // ✅ CORRECTION: utiliser la même logique que le filtre "À corriger"
        // Une question est "à corriger" si correctionType === 'semi' et theoreticalScore === null
        // (pas de score système, le prof doit évaluer)
        // On inclut aussi 'manuel' et 'semi' sans theoreticalScore
        const itemsToCorrect = questions.filter(q => 
            !q.isCourse && (
                (q.correctionType === 'semi' && q.theoreticalScore === null) ||
                q.correctionType === 'manuel'
            )
        ).length;

        // ✅ Total questions manuelles/semi à évaluer
        const totalManualQuestions = questions.filter(q => 
            !q.isCourse && (
                q.correctionType === 'manuel' ||
                (q.correctionType === 'semi' && q.theoreticalScore === null)
            )
        ).length;
        const correctedManual = totalManualQuestions - itemsToCorrect;

        
        // ✅ On plafonne la progression à 100% maximum
        const progression = totalManualQuestions > 0 
            ? Math.min(100, Math.round((correctedManual / totalManualQuestions) * 100)) 
            : 100;

        return { total, corrected, correctedManual, pending, manual, itemsToCorrect, progression, auto: total - manual, totalCourses: courses };
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
        const { stats, scoring } = this.viewModel;

        // ✅ Utiliser DIRECTEMENT le calcul officiel depuis calculateDetailedScore
        // Plus aucun recalcul à la main, plus aucun écart
        const noteSur20 = scoring.noteSur20;
        const maxTotalScore = scoring.maxTotalScore;

        // ✅ Vérifier si toutes les questions manuelles sont corrigées
        const canApprove = stats.correctedManual >= stats.itemsToCorrect;

        return `
            <div class="modal-header">
                <div>
                    <h3>Correction - ${chapterConfig.title}</h3>
                    <div class="correction-header-info">
                        <span>👤 ${student.name} (${student.class || 'Non spécifié'}) | 📝 Note: ${Math.round(noteSur20*10)/10}/20</span>
                    </div>
                </div>

                <div class="correction-header-actions">
                    <button class="correction-header-btn" id="correction-btn-cancel" title="Annuler et fermer">
                        ❌ Annuler
                    </button>
                    <button class="correction-header-btn btn-primary" id="correction-btn-save" title="Sauvegarder toutes les modifications">
                        💾 Sauvegarder
                    </button>
                    <button class="correction-header-btn btn-success" 
                            id="correction-btn-approve" 
                            title="${canApprove ? 'Valider définitivement ce chapitre' : 'Corriger toutes les questions manuelles d\'abord'}"
                            ${canApprove ? '' : 'disabled style="opacity: 0.5; cursor: not-allowed;"'}>
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
                <button class="filter-btn active" data-filter="auto">⚙️ Auto-corrigé</button>
                <button class="filter-btn" data-filter="manual">✏️ À corriger</button>
                <button class="filter-btn" data-filter="course">📚 Cours</button>
                <button class="filter-btn" data-filter="all">📋 Tous</button>
            </div>
        `;
    }

    /**
     * Rendu de la liste complète des questions
     */
    renderQuestionList() {
        const { scoring } = this.viewModel;

        // ✅ Utiliser DIRECTEMENT les valeurs calculées dans scoring
        // Plus aucun recalcul, plus aucun écart
        const autoScore = scoring.auto.teacher;
        const manualScore = scoring.manual.teacher;
        const coursePenalty = scoring.coursePenalty;
        const noteSur20 = scoring.noteSur20;
        const maxTotal = scoring.auto.max + scoring.manual.max;

        // Compter les questions par catégorie filtre
        const autoFilterCount = this.viewModel.questions.filter(q => !q.isCourse && (
            q.correctionType === 'auto' ||
            (q.correctionType === 'semi' && q.theoreticalScore !== null && q.theoreticalScore !== undefined)
        )).length;
        const manualFilterTotal = this.viewModel.questions.filter(q => !q.isCourse && (
            q.correctionType === 'manuel' ||
            (q.correctionType === 'semi' && (q.theoreticalScore === null || q.theoreticalScore === undefined))
        )).length;
        const manualFilterTreated = this.viewModel.questions.filter(q => !q.isCourse && (
            q.correctionType === 'manuel' ||
            (q.correctionType === 'semi' && (q.theoreticalScore === null || q.theoreticalScore === undefined))
        ) && q.manualCorrectionStatus === 'corrected').length;

        // ✅ Récapitulatif GLOBAL PERMANENT
        const globalSummary = `
<div class="question-correction" id="global-summary" style="background:#e8f5e9; border-left:4px solid #4caf50; margin-bottom:1rem;">
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; text-align: center;">
        <div style="padding: 0.75rem 1rem; border-right: 1px solid #c8e6c9;">
            <strong>⚙️ Auto-corrigé</strong><br>
            <span style="font-size:1.1em;">${autoFilterCount} / ${autoFilterCount}</span>
        </div>
        <div style="padding: 0.75rem 1rem; border-right: 1px solid #c8e6c9;">
            <strong>✏️ À traiter</strong><br>
            <span id="summary-manual-treated" style="font-size:1.1em;">${manualFilterTreated} / ${manualFilterTotal}</span>
        </div>
        <div style="padding: 0.75rem 1rem; border-right: 1px solid #c8e6c9;">
            <strong>📌 Pénalité sur 20</strong><br>
            <span id="summary-penalty" style="font-size:1.1em;">${coursePenalty} pts</span>
        </div>
        <div style="padding: 0.75rem 1rem; font-weight: bold;">
            <strong>🏁 TOTAL</strong><br>
            <span id="summary-total" style="font-size:1.1em;">${noteSur20} / 20</span>
        </div>
    </div>
</div>
`;

        const questionsHtml = this.viewModel.questions.map(q => this.renderQuestionItem(q)).join('');
        
        // Vérifier si il y a des cours obligatoires
        const hasRequiredCourses = this.viewModel.questions.some(q => q.isCourse && q.isRequired);

        // Compter combien de cours obligatoires sont non lus
        const unreadRequiredCount = this.viewModel.questions.filter(q => q.isCourse && q.isRequired && !q.isCorrect).length;
        const hasUnreadRequired = unreadRequiredCount > 0;

        // Lire la pénalité existante sauvegardée ou prendre défaut
        const existingPenalty = this.context.chapter.coursePenalty !== undefined ? this.context.chapter.coursePenalty : (hasUnreadRequired ? -2 : 0);

        const penaltyHtml = `
            <div class="question-correction question-penalty" style="border: 2px dashed #ff9800; background: #fff8e1; margin-top: 2rem;">
                <div class="question-correction-header">
                    <h6>📌 Pénalité (validation cours,...) sur 20</h6>
                </div>
                <div class="correction-row">
                    <div class="correction-label">⚖️ Statut:</div>
                    <div class="correction-value ${hasUnreadRequired ? 'incorrect' : 'correct'}">
                        ${hasUnreadRequired ? `⚠️ ${unreadRequiredCount} cours obligatoire(s) non lu(s)` : '✅ Tous les cours obligatoires sont lus'}
                    </div>
                </div>
                <div class="correction-inputs" style="margin-top: 1rem;">
                    <div class="form-group">
                        <label>Valeur de la pénalité sur la note finale</label>
                        <input type="number" class="question-score" 
                               id="course-penalty" min="-10" max="0"
                               value="${existingPenalty}" step="0.5">
                    </div>
                    <div class="form-group">
                        <label>Appréciation / Commentaire</label>
                        <textarea class="question-comment" id="course-penalty-comment"
                                  placeholder="Ajouter une appréciation concernant cette pénalité...">${this.context.chapter.coursePenaltyComment || ''}</textarea>
                    </div>
                    <div class="form-group">
                        <label>💬 Commentaire GÉNÉRAL sur la prestation</label>
                        <textarea class="question-comment" id="chapter-global-comment"
                                  placeholder="Ajouter un commentaire global sur l'ensemble du travail...">${this.context.chapter.globalComment || ''}</textarea>
                    </div>
                </div>
                <div class="correction-note">
                    ℹ️ Cette pénalité est appliquée UNE SEULE FOIS si au moins un cours obligatoire n'est pas lu. Vous pouvez modifier cette valeur ou la mettre à 0 pour annuler complètement la pénalité.
                </div>
            </div>
        `;

        return globalSummary + questionsHtml + (hasRequiredCourses ? penaltyHtml : '');
    }

    /**
     * Rendu d'un élément question individuel
     */
    renderQuestionItem(question) {
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

        // ✅ Mapper les clés de type vers des classes CSS existantes
        // auto → status-auto, semi → status-auto (évalué système), manuel → status-pending, modified → status-modified, etc.
        const badgeCssClass = (() => {
            switch (displayStatus.key) {
                case 'auto':     return 'status-auto';
                case 'semi':     return 'status-auto';     // semi évalué = traité côté système
                case 'manuel':   return 'status-pending';  // manuel = en attente prof
                case 'modified': return 'status-modified';
                case 'corrected':return 'status-corrected';
                case 'pending':  return 'status-pending';
                default:         return 'status-auto';
            }
        })();
        
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

        // ✅ Calcul de la catégorie d'onglet réelle :
        // - auto → toujours onglet "auto"
        // - semi évalué par le système (theoreticalScore non null) → onglet "auto"
        // - semi non évalué (theoreticalScore null) → onglet "manual"
        // - manuel → toujours onglet "manual"
        const tabCategory = (() => {
            if (question.correctionType === 'auto') return 'auto';
            if (question.correctionType === 'semi') {
                const sysScore = question.theoreticalScore;
                return (sysScore !== null && sysScore !== undefined) ? 'auto' : 'manual';
            }
            return 'manual';
        })();

        // === CHECKBOX "Traité" dans l'en-tête pour les questions manuelles/semi ===
        const needsCheckbox = (question.correctionType === 'semi' && question.theoreticalScore === null)
            || question.correctionType === 'manuel';
        const isAlreadyTreated = question.manualCorrectionStatus === 'corrected';

        const treatedToggleHtml = needsCheckbox ? `
                    <span class="treated-toggle" style="display:inline-flex; align-items:center; gap:4px; margin-left:0.75rem; font-size:0.85em;">
                        <input type="checkbox" id="treated-${question.id}" 
                               class="treated-checkbox"
                               data-question-id="${question.id}"
                               ${isAlreadyTreated ? 'checked' : ''}>
                        <label for="treated-${question.id}" style="cursor:pointer; user-select:none; white-space:nowrap;">
                            Traité
                        </label>
                    </span>` : '';

        return `
            <div class="question-correction question-${question.status} ${needsAttention ? 'needs-attention' : ''}" 
                 data-question-id="${question.id}" 
                 data-status="${question.status}" 
                 data-is-course="${question.isCourse}"
                 data-category="${tabCategory}">
                <div class="question-correction-header">
                    <h6>${question.title || `Question ${question.id}`}</h6>
                    ${treatedToggleHtml}
                    <span class="status-badge ${badgeCssClass}">${displayStatus.label}</span>
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
                               id="score-${question.id}" min="${question.correctionType === 'auto' ? -maxPoints : 0}" max="${maxPoints}"
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
     * Met à jour le compteur de questions traitées et l'état du bouton Valider
     */
    updateTreatedCount() {
        const total   = document.querySelectorAll('.treated-checkbox').length;
        const treated = document.querySelectorAll('.treated-checkbox:checked').length;

        // ✅ Mettre à jour le bandeau de stats (case "À traiter")
        this.updateGlobalSummary();

        // Activer/désactiver le bouton Valider
        const approveBtn = document.getElementById('correction-btn-approve');
        if (approveBtn) {
            const canApprove = treated >= total;
            approveBtn.disabled = !canApprove;
            approveBtn.style.opacity = canApprove ? '' : '0.5';
            approveBtn.style.cursor  = canApprove ? '' : 'not-allowed';
            approveBtn.title = canApprove
                ? 'Valider définitivement ce chapitre'
                : 'Corriger toutes les questions manuelles d\'abord';
        }
    }

    /**
     * Attache tous les événements du modal
     */
    bindModalEvents() {
        // Boutons principaux
        document.getElementById('correction-btn-close').addEventListener('click', () => this.close());
        document.getElementById('correction-btn-cancel').addEventListener('click', () => this.close());
        document.getElementById('correction-btn-save').addEventListener('click', () => this.saveAllCorrections());
        document.getElementById('correction-btn-approve').addEventListener('click', () => this.saveAllCorrections(true));

        // Filtres
        document.querySelectorAll('#correction-filters .filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.applyFilters(e.target.dataset.filter));
        });

        // Calcul du score en direct
        document.querySelectorAll('.question-score').forEach(input => {
            input.addEventListener('input', () => this.calculateScoreLive());
        });

        // Écouter les checkboxes "Traité"
        document.querySelectorAll('.treated-checkbox').forEach(cb => {
            cb.addEventListener('change', () => this.updateTreatedCount());
        });

        // Pénalité de cours → recalcul live du header
        document.getElementById('course-penalty')?.addEventListener('input', () => this.calculateScoreLive());

        // Initialiser l'état du bouton Valider au chargement
        this.updateTreatedCount();
    }

    /**
     * Applique les filtres sur la liste des questions
     */
    /**
     * Met à jour le résumé dynamique en fonction de l'onglet actif
     */
    updateGlobalSummary() {
        let autoScore = 0;
        let manualScore = 0;

        document.querySelectorAll('.question-score').forEach(input => {
            const value = parseFloat(input.value) || 0;
            const questionId = input.id.replace('score-', '');
            const question = this.viewModel.questions.find(q => q.id === questionId);
            if (question) {
                if (question.correctionType === 'auto') {
                    autoScore += value;
                } else if (!question.isCourse) {
                    manualScore += value;
                }
            }
        });

        autoScore = Math.max(0, autoScore);
        manualScore = Math.max(0, manualScore);

        const coursePenalty = parseFloat(document.getElementById('course-penalty')?.value) || 0;
        const maxTotal = this.viewModel.scoring.auto.max + this.viewModel.scoring.manual.max;
        let noteSur20 = maxTotal > 0 ? Math.round(((autoScore + manualScore) / maxTotal) * 20 * 10) / 10 : 0;
        noteSur20 = Math.max(0, noteSur20 + coursePenalty);

        // ✅ Mettre à jour uniquement les spans dynamiques
        const treated = document.querySelectorAll('.treated-checkbox:checked').length;
        const total   = document.querySelectorAll('.treated-checkbox').length;

        const manualEl  = document.getElementById('summary-manual-treated');
        const penaltyEl = document.getElementById('summary-penalty');
        const totalEl   = document.getElementById('summary-total');

        if (manualEl)  manualEl.textContent  = `${treated} / ${total}`;
        if (penaltyEl) penaltyEl.textContent  = `${coursePenalty} pts`;
        if (totalEl)   totalEl.textContent    = `${Math.round(noteSur20*10)/10} / 20`;
    }

    applyFilters(filter) {
        this.activeFilter = filter; // ✅ Mémoriser l'onglet sélectionné
        
        document.querySelectorAll('#correction-filters .filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === filter);
        });

        const showCourses = filter === 'course';

        document.querySelectorAll('.question-correction:not(.question-penalty):not(#global-summary)').forEach(el => {
            const isCourse = el.dataset.isCourse === 'true';
            const category = el.dataset.category;

            let visible = false;

            if (filter === 'course') {
                visible = isCourse;
            } else if (filter === 'auto') {
                visible = !isCourse && category === 'auto';
            } else if (filter === 'manual') {
                visible = !isCourse && category === 'manual';
            } else if (filter === 'all') {
                visible = !isCourse; // Toutes les questions (hors cours), dans l'ordre naturel
            }

            el.style.display = visible ? 'block' : 'none';
        });

        const penaltyEl = document.querySelector('.question-penalty');
        if (penaltyEl) {
            penaltyEl.style.display = (showCourses || filter === 'all') ? 'block' : 'none';
        }

        this.updateGlobalSummary();
    }

    /**
     * Calcule et met à jour le score total en temps réel
     */
    /**
     * Helper sécurisé pour conversion en nombre
     */
    toNumber(value) {
        return Number.isFinite(+value) ? +value : 0;
    }

    /**
     * Calcule la note sur 20 (SOURCE DE VÉRITÉ UNIQUE)
     */
    calculateNoteSur20(autoScore, manualScore, maxTotalScore, coursePenalty = 0) {
        if (maxTotalScore <= 0) return 0;

        const raw = (autoScore + manualScore) / maxTotalScore * 20;
        const rounded = Math.round(raw * 10) / 10;

        return Math.max(0, rounded + coursePenalty);
    }
    /**
     * Met à jour la note dans l'entête du modal
     */
    updateHeaderNote(noteSur20) {
        const headerInfo = document.querySelector('.correction-header-info span:first-child');
        if (!headerInfo) return;

        const rounded = Math.round(noteSur20 * 10) / 10;
        headerInfo.textContent = headerInfo.textContent.replace(
            /\| 📝 Note: [0-9.,-]+\/20/,
            `| 📝 Note: ${rounded}/20`
        );
    }

    /**
     * Calcule et met à jour le score total en temps réel
     * ✅ Optimisé O(n) au lieu de O(n²) avec Map indexé
     */
    calculateScoreLive() {
        let autoScore = 0;
        let manualScore = 0;

        const questionsMap = new Map(
            this.viewModel.questions.map(q => [q.id, q])
        );

        // ✅ Mettre à jour les badges de statut pour les questions modifiées
        this.updateQuestionBadges(questionsMap);

        document.querySelectorAll('.question-score').forEach(input => {
            const value = this.toNumber(input.value);
            const questionId = input.id.replace('score-', '');
            const question = questionsMap.get(questionId);

            if (!question) return;

            if (question.correctionType === 'auto') {
                autoScore += value;
            } else if (!question.isCourse) {
                manualScore += value;
            }
        });

        autoScore = Math.max(0, autoScore);
        manualScore = Math.max(0, manualScore);

        const coursePenalty = this.toNumber(
            document.getElementById('course-penalty')?.value
        );

        const maxTotalScore =
            this.viewModel.scoring.auto.max +
            this.viewModel.scoring.manual.max;

        const noteSur20 = this.calculateNoteSur20(
            autoScore,
            manualScore,
            maxTotalScore,
            coursePenalty
        );

        this.updateHeaderNote(noteSur20);
        this.updateGlobalSummary();
    }

    /**
     * ✅ Met à jour le badge de statut de chaque question en fonction du champ score modifié
     */
    updateQuestionBadges(questionsMap) {
        document.querySelectorAll('.question-score').forEach(input => {
            const questionId = input.id.replace('score-', '');
            const question = questionsMap.get(questionId);
            if (!question || question.isCourse) return;

            const currentValue = this.toNumber(input.value);
            const originalScore = this.toNumber(question.theoreticalScore ?? question.score ?? 0);
            const card = input.closest('.question-correction');
            if (!card) return;

            const badge = card.querySelector('.status-badge');
            if (!badge) return;

            // ✅ Recalculer le libellé du badge
            const typeLabels = {
                'auto':   '⚙️ Auto',
                'semi':   '🔀 Semi-auto',
                'manuel': '✏️ Manuel',
            };
            const typeLabel = typeLabels[question.correctionType] || '⚙️ Auto';

            // Si le score saisi est différent du score théorique/système → "modifié"
            if (currentValue !== originalScore) {
                badge.textContent = `${typeLabel} ✏️`;
                badge.className = 'status-badge status-modified';
            } else {
                // Revenir au badge d'origine
                const originalKey = question.correctionType || 'auto';
                badge.textContent = typeLabel;
                badge.className = `status-badge status-${originalKey}`;
            }
        });
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

        let autoScore = sumTeacher(autoQs);
        let manualScore = sumTeacher(manualQs);
        
        // ✅ Appliquer plancher 0 SEPAREMENT sur chaque catégorie
        autoScore = Math.max(0, autoScore);
        manualScore = Math.max(0, manualScore);

        const maxTotalScore = sum(autoQs, 'points') + sum(manualQs, 'points');
        const totalScore = autoScore + manualScore;

        // ✅ Calculer la pénalité par défaut SI pas déjà sauvegardée
        const hasUnreadRequired = questions.some(q => q.isCourse && q.isRequired && !q.isCorrect);

        const coursePenalty = this.context.chapter.coursePenalty ??
            (hasUnreadRequired ? -2 : 0);

        // ✅ Utilisation de la fonction SOURCE DE VÉRITÉ UNIQUE
        const noteSur20 = this.calculateNoteSur20(
            autoScore,
            manualScore,
            maxTotalScore,
            coursePenalty
        );

        return {
            auto: {
                theoretical: sum(autoQs, 'theoreticalScore'),
                teacher: autoScore,
                max: sum(autoQs, 'points')
            },
            manual: {
                teacher: manualScore,
                max: sum(manualQs, 'points')
            },
            totalScore,
            maxTotalScore,
            coursePenalty,
            noteSur20
        };
    }




    /**
     * Applique les saisies du professeur depuis le DOM vers l'objet chapter
     */
    applyTeacherInputsToChapter(chapter, chapterConfig) {
        chapterConfig.questions.forEach(questionConfig => {
            const questionId = questionConfig.id;
            const scoreInput = document.getElementById(`score-${questionId}`);
            const commentInput = document.getElementById(`comment-${questionId}`);

            if (scoreInput && commentInput && chapter.questions[questionId]) {
                const question = chapter.questions[questionId];
                
                question.teacherScore = this.toNumber(scoreInput.value);
                question.teacherComment = commentInput.value.trim();
                
                // ✅ Lire l'état de la checkbox "Traité"
                const treatedCb = document.getElementById(`treated-${questionId}`);
                if (treatedCb) {
                    question.manualCorrectionStatus = treatedCb.checked ? 'corrected' : 'pending';
                } else {
                    question.manualCorrectionStatus = 'corrected';
                }
                
                question.correctedAt = new Date().toISOString();
            }
        });

        // Champs globaux
        const penaltyInput = document.getElementById('course-penalty');
        const penaltyCommentInput = document.getElementById('course-penalty-comment');
        const globalCommentInput = document.getElementById('chapter-global-comment');
        
        if (penaltyInput) {
            chapter.coursePenalty = this.toNumber(penaltyInput.value);
        }
        if (penaltyCommentInput) {
            chapter.coursePenaltyComment = penaltyCommentInput.value.trim();
        }
        if (globalCommentInput) {
            chapter.globalComment = globalCommentInput.value.trim();
        }
    }

    /**
     * Construit un tableau de questions compatible avec calculateDetailedScore depuis le DOM
     */
    buildQuestionsFromDOM(chapter, chapterConfig) {
        return chapterConfig.questions.map(qConfig => {
            const q = chapter.questions[qConfig.id];
            const scoreInput = document.getElementById(`score-${qConfig.id}`);

            return {
                ...q,
                id: qConfig.id,
                correctionType: qConfig.correctionType,
                isCourse: false,
                points: qConfig.points,
                teacherScore: this.toNumber(scoreInput?.value),
                theoreticalScore: q?.theoreticalScore ?? q?.score
            };
        });
    }

    /**
     * Applique les résultats du calcul centralisé sur l'objet chapter
     */
    applyScoreToChapter(chapter, result, approve) {
        chapter.finalScore = result.totalScore;
        chapter.noteAttribuee = Math.round(result.noteSur20 * 10) / 10; // ✅ Arrondi garanti 1 décimale
        chapter.coursePenalty = result.coursePenalty;

        chapter.correctionStatus = approve ? 'validated' : 'in_progress';
        
        if (approve) {
            chapter.submissionStatus = 'validated';
        }
    }

    /**
     * Gère les actions UI après sauvegarde
     */
    async afterSaveUI(approve, studentId, chapterId) {
        if (approve) {
            alert('✅ Chapitre validé définitivement !');
        } else {
            alert('✅ Toutes les corrections ont été sauvegardées !');
        }
        
        this.close();
        if (this.dashboard && typeof this.dashboard.refresh === 'function') {
           await this.dashboard.refresh();
        } else if (this.dashboard && this.dashboard.modules?.chapters) {
            this.dashboard.modules.chapters.render();
        }
        
        if (!approve) {
            await this.open(studentId, chapterId, this.dashboard);
        }
        
        if (this.dashboard.modules.submissions) {
            this.dashboard.modules.submissions.refresh();
        } else {
            console.warn("Pas de méthode Refresh")
        }
    }

    /**
     * Sauvegarde TOUTES les corrections effectuées
     * ✅ Architecture propre : Séparation des responsabilités
     * ✅ 0 duplication - 1 seul moteur de calcul pour TOUT
     */
    async saveAllCorrections(approve = false) {
        try {
            const { studentId, chapterId } = this.context;
            const progress = await this.dashboard.getStudentProgress(studentId);
            const chapter = progress.chapters[chapterId];
            const chapterConfig = this.dashboard.chapters.find(c => c.id === chapterId);

            if (!chapter || !chapterConfig) {
                alert('Erreur lors de la sauvegarde');
                return;
            }

            // 1. Synchroniser DOM → données
            this.applyTeacherInputsToChapter(chapter, chapterConfig);

            // 2. ✅ MOTEUR DE CALCUL UNIQUE ET CENTRALISÉ
            const questions = this.buildQuestionsFromDOM(chapter, chapterConfig);
            const result = this.calculateDetailedScore(questions);

            // 3. Appliquer résultats
            this.applyScoreToChapter(chapter, result, approve);

            // 4. Persister
            // Sauvegarde via scoped storage (préfixé par parcours dans Supabase)
            // Sauvegarde avec la clé complète (slug:studentId:student_...)
            const key = this.context.progressKey; // déjà construit dans getCorrectionContext
            await storage.set(key, progress);
            console.log(`✅ Progression sauvegardée dans ${key}`);
            
            // 5. Interface utilisateur
            await this.afterSaveUI(approve, studentId, chapterId);

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