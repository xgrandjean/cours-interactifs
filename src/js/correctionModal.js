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
     * Le chapitre est-il travaillé sur papier ? Résolu une seule fois, à l'ouverture
     * (getCorrectionContext), pour que toutes les décisions de posture parlent de la même
     * chose. Faux par défaut : hors consigne, rien ne change dans ce fichier.
     */
    isConsigne() {
        return this.context?.isConsigneMode === true;
    }

    /**
     * La ligne porte-t-elle une case « Traité » ?
     *
     * Historiquement : seulement celles que le formateur doit trancher lui-même — une
     * question manuelle, ou une semi que le système n'a pas su évaluer. Une question auto
     * n'en avait aucune, et l'enregistrement la marquait « corrigée » d'office.
     *
     * En consigne, ce raccourci devient faux : l'apprenant n'a pas composé dans
     * l'application, donc une question auto restée vide n'est pas « corrigée », elle
     * n'a simplement pas encore été relevée sur la copie papier. Elle reçoit donc sa case
     * comme les autres, et c'est le formateur qui la coche quand il l'a notée.
     */
    needsTreatedCheckbox(question) {
        if (question.isCourse) return false;
        if (question.correctionType === 'manuel') return true;
        if (question.correctionType === 'semi' && question.theoreticalScore === null) return true;
        return this.isConsigne();
    }

    /**
     * État initial de cette case à l'ouverture du modal.
     *
     * Cochée dès qu'une correction a déjà été posée — y compris par QRCode depuis
     * « Correction en salle », qui écrit manualCorrectionStatus = 'corrected' sans passer
     * par ce modal : c'est ce qui permet de réutiliser ces corrections sans nouveau marquage.
     *
     * En consigne, les cases nouvellement apparues (auto, ou semi déjà tranchée par le
     * système) partent cochées uniquement s'il y a de quoi considérer la question notée :
     * une réponse saisie dans l'application, ou un score déjà attribué. Sans réponse ni
     * score, elles restent décochées — c'est ce qui empêche un chapitre consigne
     * entièrement auto d'être validable d'emblée, tous scores en attente.
     */
    isTreatedInitially(question) {
        if (question.manualCorrectionStatus === 'corrected') return true;
        if (!this.isConsigne()) return false;
        if (question.correctionType === 'manuel') return false;
        if (question.correctionType === 'semi' && question.theoreticalScore === null) return false;
        return question.theoreticalScore !== null
            || (typeof question.teacherScore === 'number' && !isNaN(question.teacherScore));
    }

    /**
     * Calcule le score théorique AUTO indépendant (source de vérité système)
     * Ce score n'est JAMAIS modifié par le professeur
     */
    calculateAutoTheoreticalScore(q, qData) {
        // En consigne, l'absence d'entrée de progression est le cas NORMAL (l'apprenant n'a
        // jamais ouvert la question dans l'appli) : elle ne vaut pas zéro, elle reste à corriger.
        if (!qData) return this.isConsigne() ? null : 0;

        // ✅ Pour les questions SEMI / MANUELLES : on réutilise DIRECTEMENT le score calculé coté apprenant
        // On ne recalcule rien, on respecte la logique métier déjà appliquée lors de la réponse
        if (q.correctionType === 'semi' || q.correctionType === 'manuel') {
            
            // 🚨 CAS SPÉCIAL : AUCUNE RÉPONSE
            // Si l'apprenant n'a JAMAIS répondu (answered = false ou undefined)
            if (!qData.answered || qData.answer === null || qData.answer === undefined || qData.answer === '') {
                // Mode consigne : la copie est sur papier. Un champ vide dans l'application
                // est attendu, pas un zéro mérité — la question reste « ⏳ À corriger » et le
                // formateur saisit le score en lisant la feuille.
                if (this.isConsigne()) return null;
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

        // Même règle pour les questions auto en consigne : ni réponse ni tentative dans
        // l'application = rien à évaluer, donc null (⏳ À corriger) et non 0. On exige
        // attempts === 0 pour ne pas effacer un échec réel : si l'apprenant a essayé puis
        // vidé son champ, le calcul habituel ci-dessous s'applique toujours.
        if (this.isConsigne() && !wasAnswered && attempts === 0) return null;

        if (attempts > 0 && !wasAnswered) {
            effectiveIsCorrect = false;
        }

        if (effectiveIsCorrect === true) {
            // Barème partagé : la pénalité dépend du nombre d'options, voir core/bareme.js
            // et la fiche « bareme » de aide.js.
            return Bareme.pointsAuto(q.points, attempts, Bareme.nbOptions(q));
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
            const data = await staticJson.get('/parcours/cours.json');

            if (data && Array.isArray(data.parcours)) {
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

        // 4bis. Mode EFFECTIF du chapitre. Le mode ne décorait rien ici jusqu'à présent :
        // le modal n'appelait pas getExamContext et se comportait pareil dans tous les modes.
        // Le mode consigne, lui, change la posture de correction (champs vides normaux,
        // pénalité de cours neutre), donc on le résout UNE fois, ici.
        //
        // Deux précautions :
        //  - la précédence du gel (frozenChapterMode) est celle de getExamContext, pour ne pas
        //    donner la tolérance papier à une copie réellement composée dans l'application ;
        //  - le mode vit dans chapter_config (réglages du tableau de bord), pas dans cours.json.
        //    dashboard.chapters porte déjà la fusion des deux (teacherDashboard.js:209-221),
        //    alors que window.chaptersIndex n'est que la config publiée : on préfère donc la
        //    première quand elle est disponible.
        const chapterConfigLive = this.dashboard?.chapters?.find(ch => ch.id == chapterId) || chapterConfig;
        const examContext = (typeof getExamContext === 'function')
            ? getExamContext(chapter, chapterConfigLive)
            : { isConsigneMode: false };

        // 5. Retourner le contexte complet
        return {
            student,
            progress,
            chapter,
            chapterConfig,
            isConsigneMode: examContext.isConsigneMode === true,
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
                isCourse: true,
                isRequired: isRequired, // ❗ SEULEMENT les X premiers cours sont obligatoires
            });
        }

        const scoring = this.calculateDetailedScore(allQuestions);
        
        return { 
            questions: allQuestions, 
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

        // Mode consigne : theoreticalScore à null veut dire « rien n'a été relevé ». Sans
        // cette garde, le score résiduel parfois stocké côté apprenant (souvent 0) passerait
        // par « score système disponible » plus bas et la question s'afficherait comme
        // évaluée par le système alors que la copie papier n'a pas encore été lue.
        if (this.isConsigne() && question.theoreticalScore === null
            && !(typeof question.teacherScore === 'number' && !isNaN(question.teacherScore))) {
            return { key: 'pending', label: '⏳ À corriger' };
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
     * Affiche le modal complet
     */
    render() {
        this.close();
        
        const html = `
            <div class="modal-overlay" id="correction-modal">
                <div class="modal-content correction-modal">
                    <div class="correction-sticky-header">
                        ${this.renderHeader()}
                        ${this.renderFilters()}
                    </div>
                    <div class="modal-body correction-modal-body">
                        ${this.renderConsigneBanner()}
                        ${this.renderQuestionList()}
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', html);
    }

    /**
     * Échappe le HTML d'une valeur dynamique avant insertion dans un template — indispensable
     * pour tout texte qui peut venir de l'élève (réponse, etc.) : sans ça, une réponse contenant
     * un simple "<" peut casser la structure DOM de tout ce qui suit dans le modal (cases à
     * cocher, onglets, cours... qui deviennent invisibles car imbriqués dans un parent masqué).
     */
    escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    /**
     * Énoncé d'une question tel que l'apprenant l'a vu : questionTextHtml est produit à la
     * publication (marked puis sanitize-html, cf. publishParcours.js), comme pour le suivi
     * Atelier et l'impression des consignes. L'énoncé brut échappé n'est qu'un repli, pour
     * un chapitre publié avant que ce champ existe — le Markdown y resterait visible.
     */
    enonceHtml(question) {
        return question.questionTextHtml || this.escapeHtml(question.questionText);
    }

    /**
     * Bandeau du mode consigne. Il dit au formateur pourquoi les champs sont vides : sans
     * lui, une copie papier ressemble à une copie bâclée, et les « ⏳ À corriger » à un bug.
     */
    renderConsigneBanner() {
        if (!this.isConsigne()) return '';
        return `
            <div class="question-correction" style="background:#f6f1e7; border-left:4px solid #d9c9a3; color:#7a5c1e; margin-bottom:1rem;">
                <strong>📋 Mode Consigne — réponses attendues sur papier.</strong><br>
                Les champs vides sont normaux : l'apprenant a répondu sur la feuille imprimée.
                Les questions non relevées s'affichent « ⏳ À corriger » plutôt que 0 ; saisissez
                les scores depuis la copie, puis cochez « Traité » ligne par ligne. La pénalité de
                cours part de 0 — un cours validé sur papier ne passe pas par l'application.
            </div>
        `;
    }

    /**
     * Rendu de l'entête du modal
     */
    renderHeader() {
        const { student, chapterConfig } = this.context;
        const { scoring } = this.viewModel;

        // ✅ Utiliser DIRECTEMENT le calcul officiel depuis calculateDetailedScore
        // Plus aucun recalcul à la main, plus aucun écart
        const noteSur20 = scoring.noteSur20;
        const maxTotalScore = scoring.maxTotalScore;

        return `
            <div class="modal-header">
                <div>
                    <h3>Correction - ${this.escapeHtml(chapterConfig.title)} ${window.Aide ? Aide.icone('notation') : ''}</h3>
                    <div class="correction-header-info">
                        <span>👤 ${this.escapeHtml(student.name)} (${this.escapeHtml(student.class || 'Non spécifié')}) | 📝 Note: ${Math.round(noteSur20*10)/10}/20</span>
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
                            title="Publier la correction : la note devient visible pour l'apprenant"
                            >
                        ✅ Publier la correction
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
                <button class="filter-btn" data-filter="appreciations">🗒️ Appréciations</button>
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
        // Même ensemble que les cases « Traité » réellement rendues, et que celles comptées
        // ensuite par updateGlobalSummary() depuis le DOM : hors consigne le résultat est
        // identique à l'ancien calcul, en consigne il inclut les questions auto.
        const rowsWithCheckbox = this.viewModel.questions.filter(q => this.needsTreatedCheckbox(q));
        const manualFilterTotal = rowsWithCheckbox.length;
        const manualFilterTreated = rowsWithCheckbox.filter(q => this.isTreatedInitially(q)).length;

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
            <strong>🎯 Bonus / Pénalité</strong><br>
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
        // Compter combien de cours obligatoires sont non lus
        const unreadRequiredCount = this.viewModel.questions.filter(q => q.isCourse && q.isRequired && !q.isCorrect).length;
        const hasUnreadRequired = unreadRequiredCount > 0;

        // Lire la pénalité existante sauvegardée ou prendre défaut.
        // En consigne, le défaut retombé est 0 et non -2 : le cours a été validé sur papier,
        // il ne passera jamais par la validation in-app, donc le compter comme « non lu »
        // punirait l'apprenant pour un geste qu'on ne lui a pas demandé de faire. La formule
        // ne change pas et le formateur garde la main : une valeur qu'il saisit prime toujours.
        // Rien de saisi : la valeur proposée (cours + tentatives, cf. penaliteAutomatique),
        // qui suit la copie tant que le formateur n'y touche pas (data-auto).
        const penaliteAuto = this.viewModel.scoring.penaliteAuto || { valeur: 0, commentaire: '' };
        const penaliteProposee = this.context.chapter.coursePenalty === undefined;
        const existingPenalty = penaliteProposee ? penaliteAuto.valeur : this.context.chapter.coursePenalty;
        const commentaireSaisi = this.context.chapter.coursePenaltyComment;
        const commentaireProposee = !commentaireSaisi && penaliteProposee && !!penaliteAuto.commentaire;
        const commentairePenalite = commentaireSaisi || (commentaireProposee ? penaliteAuto.commentaire : '');

        // Appréciations : pénalité/bonus (valeur + statut cours) ET commentaires, regroupés
        // ensemble comme un seul bloc (pas de séparation) — visible sous l'onglet "Appréciations"
        // et sous "Tous". L'onglet "Cours" ne montre plus que les cours eux-mêmes (lu/non lu).
        const appreciationsHtml = `
            <div class="question-correction question-appreciations" data-category="appreciations" style="border: 2px dashed #ff9800; background: #fff8e1; margin-top: 2rem;">
                <div class="question-correction-header">
                    <h6>🎯 Bonus / Pénalité (validation cours, ...)</h6>
                </div>
                ${this.historiqueTentatives(this.viewModel.scoring.tentatives)}
                <div class="correction-row">
                    <div class="correction-label">⚖️ Statut:</div>
                    <div class="correction-value ${hasUnreadRequired ? 'incorrect' : 'correct'}">
                        ${hasUnreadRequired ? `⚠️ ${unreadRequiredCount} cours obligatoire(s) non lu(s)` : '✅ Tous les cours obligatoires sont lus'}
                    </div>
                </div>
                <div class="correction-inputs" style="margin-top: 1rem;">
                    <div class="form-group">
                        <label>Valeur du bonus (+) ou pénalité (-) sur la note finale</label>
                        <input type="number" class="question-score"
                               id="course-penalty" min="-10" max="10"
                               value="${existingPenalty}" step="0.5" data-auto="${penaliteProposee ? '1' : '0'}">
                    </div>
                    <div class="form-group">
                        <label>Appréciation / Commentaire</label>
                        <textarea class="question-comment" id="course-penalty-comment" data-auto="${commentaireProposee ? '1' : '0'}"
                                  placeholder="Ajouter une appréciation concernant cette pénalité...">${this.escapeHtml(commentairePenalite)}</textarea>
                    </div>
                    <div class="form-group">
                        <label>💬 Commentaire GÉNÉRAL sur la prestation</label>
                        <textarea class="question-comment" id="chapter-global-comment"
                                  placeholder="Ajouter un commentaire global sur l'ensemble du travail...">${this.escapeHtml(this.context.chapter.globalComment || '')}</textarea>
                    </div>
                </div>
                <div class="correction-note">
                    ℹ️ Valeur proposée : −2 si au moins un cours obligatoire n'est pas lu (une seule fois), plus, en Blind et Millionnaire, l'effet des tentatives (pénalité par tentative, plancher, tentative retenue — expliqué dans l'appréciation). Vous pouvez la modifier ou la mettre à 0 : votre saisie fait foi.
                </div>
            </div>
        `;

        return globalSummary + questionsHtml + appreciationsHtml;
    }

    /**
     * Rendu d'un élément question individuel
     */
    /**
     * Ligne d'état du mode Atelier AR.
     *
     * Dit au formateur ce qui s'est déjà passé en main propre, pour qu'il ne refasse
     * pas une évaluation déjà faite. Depuis le 2026-10-05 l'émission de l'AR inscrit
     * aussi `teacherScore` ; un AR émis AVANT cette date n'a posé que `arPoints`, promu
     * à la saisie de l'AR par l'apprenant (voir "mode atelier AR.md" §7).
     *
     * Affichée dès que les champs existent, indépendamment du mode courant du
     * chapitre : ce qui compte est ce qui a eu lieu, pas la configuration du moment.
     */
    renderAtelierRow(question) {
        if (!question.codeValidation && !question.arEmisAt && !question.arSaisiAt) return '';

        const date    = (iso) => iso ? new Date(iso).toLocaleDateString('fr-FR') : '?';
        const nombre  = (valeur) => Number(valeur || 0).toLocaleString('fr-FR');
        const maxPts  = nombre(question.points || 0);
        const par     = this.escapeHtml(question.arEmisPar || 'formateur');

        const NIVEAUX = {
            non_acquis: '🔴 Pas encore acquis',
            en_cours:   '🟠 En cours d\'acquisition',
            acquis:     '🟢 Acquis'
        };

        let etat;
        if (question.arSaisiAt) {
            const points = nombre(question.teacherScore ?? question.arPoints);
            etat = `✅ Validé en main propre — ${points} / ${maxPts} pt attribué(s) par ${par}, ` +
                   `AR saisi par l'apprenant le ${date(question.arSaisiAt)}`;
        } else if (question.arEmisAt && question.manualCorrectionStatus === 'corrected') {
            // Depuis le 2026-10-05, émettre l'AR inscrit la correction : les points comptent déjà.
            etat = `📤 AR émis le ${date(question.arEmisAt)} par ${par} — ${nombre(question.teacherScore ?? question.arPoints)} / ${maxPts} pt ` +
                   `enregistré(s) ; l'apprenant n'a pas encore saisi son AR`;
        } else if (question.arEmisAt) {
            etat = `📤 AR émis le ${date(question.arEmisAt)} par ${par} — ${nombre(question.arPoints)} / ${maxPts} pt ` +
                   `<strong>en attente</strong> : l'apprenant n'a pas encore saisi son AR, les points ne comptent pas`;
        } else {
            etat = `⏳ Validation demandée le ${date(question.codeValidationAt)} ` +
                   `(code ${this.escapeHtml(question.codeValidation)}) — pas encore évaluée`;
        }

        const positionnement = question.autoPositionnement
            ? `<br><small>L'apprenant s'estimait : ${NIVEAUX[question.autoPositionnement] || 'non précisé'}</small>`
            : '';

        return `
                <div class="correction-row correction-row-atelier">
                    <div class="correction-label">🧾 Atelier:</div>
                    <div class="correction-value">${etat}${positionnement}</div>
                </div>
        `;
    }

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
                            <h6>📚 ${this.escapeHtml(question.title || question.id)}</h6>
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
                <div class="question-correction ${isRead ? 'question-corrected' : 'question-pending'}" data-question-id="${question.id}" data-is-course="${question.isCourse}">
                    <div class="question-correction-header">
                        <h6>📚 ${this.escapeHtml(question.title || question.id)}</h6>
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

        // === CHECKBOX "Traité" dans l'en-tête ===
        // Manuelles et semi non tranchées toujours ; toutes les questions en mode consigne.
        // Voir needsTreatedCheckbox() / isTreatedInitially() pour le pourquoi.
        const needsCheckbox = this.needsTreatedCheckbox(question);
        const isAlreadyTreated = this.isTreatedInitially(question);

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
                 data-is-course="${question.isCourse}"
                 data-category="${tabCategory}">
                <div class="question-correction-header">
                    <h6>${this.escapeHtml(question.title || `Question ${question.id}`)}</h6>
                    ${treatedToggleHtml}
                    <span class="status-badge ${badgeCssClass}">${displayStatus.label}</span>
                </div>

                ${this.renderAtelierRow(question)}

                ${question.questionText ? `
                <div class="correction-row">
                    <div class="correction-label">📝 Consigne:</div>
                    <div class="correction-value">${this.enonceHtml(question)}</div>
                </div>
                ` : ''}

                <div class="correction-row">
                    <div class="correction-label">👤 Réponse de l'apprenant:</div>
                    <div class="correction-value">${this.escapeHtml(studentAnswer)}</div>
                </div>

                ${correctAnswer ? `
                <div class="correction-row">
                    <div class="correction-label">✅ Réponse attendue:</div>
                    <div class="correction-value correct">${this.escapeHtml(correctAnswer)}</div>
                </div>
                ` : ''}

                ${question.explicationHtml ? `
                <div class="correction-row">
                    <div class="correction-label">💡 Explication:</div>
                    <div class="correction-value">${question.explicationHtml}</div>
                </div>
                ` : ''}

                ${question.correctionType === 'semi' ? `
                <div class="auto-correction-note">
                    <span>
${(question.answered === false || studentAnswer === '(pas de réponse)') ? (this.isConsigne() ? `
📄 Réponse sur papier — en attente de saisie
` : `
🧠 Score système : 0 / ${maxPoints} pts
<br>❌ Aucune réponse
`) : ''}

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

                ${question.correctionType === 'auto' && this.isConsigne() && question.theoreticalScore === null ? `
                <div class="auto-correction-note">
                    <span>
📄 Réponse sur papier — en attente de saisie
</span>
                </div>
                ` : ''}

                ${question.correctionType === 'auto' && !(this.isConsigne() && question.theoreticalScore === null) ? `
                <div class="auto-correction-note">
                    <span>
🧠 Score système : ${question.theoreticalScore} / ${maxPoints} pts  
<br>
🔁 ${question.attempts || 0} tentative(s)

${question.theoreticalScore < 0 ? `
<br>❌ Réponse incorrecte
` : ''}

${(question.attempts || 0) > 1 ? `
<br>⚠️ ${Bareme.penaliteParEssai(maxPoints, Bareme.nbOptions(question))} pt(s) retiré(s) par tentative ratée${Bareme.nbOptions(question) ? ` (${Bareme.nbOptions(question)} choix proposés)` : ''}
` : ''}

${question.theoreticalScore < 0 ? `
<br>ℹ️ Le total des questions auto ne descend pas sous 0
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
                                  placeholder="Ajouter une appréciation pour cette question...">${this.escapeHtml(question.teacherComment || '')}</textarea>
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
                ? 'Publier la correction : la note devient visible pour l\'apprenant'
                : 'Corriger toutes les questions manuelles avant de publier';
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
        document.getElementById('course-penalty')?.addEventListener('input', (evenement) => {
            evenement.target.dataset.auto = '0';   // sa saisie fait foi, on ne la recalcule plus
            this.calculateScoreLive();
        });
        document.getElementById('course-penalty-comment')?.addEventListener('input', (evenement) => {
            evenement.target.dataset.auto = '0';
        });

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

        const maxTotal = this.viewModel.scoring.auto.max + this.viewModel.scoring.manual.max;
        this.majPenaliteAutomatique(autoScore, manualScore, maxTotal);
        const coursePenalty = parseFloat(document.getElementById('course-penalty')?.value) || 0;
        // La formule officielle, et non une copie : celle-ci ignorait déjà un cas limite.
        const noteSur20 = this.calculateNoteSur20(autoScore, manualScore, maxTotal, coursePenalty);

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

        document.querySelectorAll('.question-correction:not(.question-appreciations):not(#global-summary)').forEach(el => {
            const isCourse = el.dataset.isCourse === 'true';
            const category = el.dataset.category;

            let visible = false;

            if (filter === 'course') {
                visible = isCourse; // Uniquement les cours (lu/non lu), jamais le panneau appréciations
            } else if (filter === 'auto') {
                visible = !isCourse && category === 'auto';
            } else if (filter === 'manual') {
                visible = !isCourse && category === 'manual';
            } else if (filter === 'appreciations') {
                visible = false; // Seul le panneau appréciations est visible dans cet onglet
            } else if (filter === 'all') {
                visible = true; // Tout : cours + questions, dans l'ordre naturel
            }

            el.style.display = visible ? 'block' : 'none';
        });

        const appreciationsEl = document.querySelector('.question-appreciations');
        if (appreciationsEl) {
            appreciationsEl.style.display = (filter === 'appreciations' || filter === 'all') ? 'block' : 'none';
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
        // Le retour anticipé « maxTotalScore <= 0 → 0 » ignorait la pénalité/bonus, alors que
        // le résumé live updateGlobalSummary() l'appliquait déjà dans ce cas. Un chapitre
        // cours-seul (aucune question notée, bonus saisi) affichait donc un total dans le
        // bandeau et enregistrait 0 : deux chiffres différents pour la même copie.
        //
        // Alignement sur le résumé live. Le résultat est STRICTEMENT identique dès qu'il y a
        // au moins une question notée ; seul le cas « aucune question » change, et le bonus
        // s'y exprime enfin. Changement général, valable dans tous les modes : ce n'est pas
        // une exception consigne, c'est la correction d'une incohérence déjà présente.
        //
        // La pénalité par tentative n'a PAS d'étape ici : comme celle des cours, elle est
        // proposée dans le bonus/pénalité (cf. penaliteAutomatique), que le formateur voit
        // et peut modifier. La formule de la note ne change pas.
        const raw = maxTotalScore > 0 ? (autoScore + manualScore) / maxTotalScore * 20 : 0;
        const rounded = Math.round(raw * 10) / 10;

        return Math.min(20, Math.max(0, rounded + coursePenalty));
    }

    /**
     * Le bonus/pénalité proposé tant que le formateur n'a rien saisi : la pénalité de cours
     * (−2 si un cours obligatoire n'est pas lu, 0 en consigne) PLUS l'ajustement dû aux
     * tentatives (Blind, Millionnaire), avec l'appréciation qui l'explique. Tout ce qui est
     * retiré de la note l'est par cette case, et nulle part ailleurs.
     *
     * @param {number} noteBrute  note sur 20 de la copie, avant tout bonus/pénalité
     * @returns {{valeur: number, commentaire: string, tentatives: Object}}
     */
    penaliteAutomatique(noteBrute, maxTotalScore, valeurManuelle, hasUnreadRequired) {
        const cours = (hasUnreadRequired && !this.isConsigne()) ? -2 : 0;
        const tentatives = this.ajustementTentatives(noteBrute, maxTotalScore, valeurManuelle);
        const valeur = Math.round((cours + tentatives.ajustement) * 10) / 10;

        // L'appréciation n'est proposée que s'il y a des tentatives à expliquer : sans elles,
        // rien ne change par rapport à avant (le −2 des cours se passait de commentaire).
        const lignes = [];
        if (tentatives.texte) {
            if (cours) lignes.push(`📚 Cours obligatoire non lu : ${cours} pt`);
            lignes.push(tentatives.texte);
        }
        return { valeur, commentaire: lignes.join('\n'), tentatives };
    }

    /**
     * Ce que les tentatives changent à la note : la tentative retenue (la dernière, ou la
     * meilleure en mode « meilleure note »), pénalisée selon son rang et, si une tentative
     * antérieure a atteint le plancher, relevée à ce plancher (cf. Bareme), moins la note de
     * la copie affichée. Négatif le plus souvent ; POSITIF en mode meilleure note quand une
     * tentative passée valait mieux que la dernière, et quand le filet du plancher relève.
     *
     * Une tentative archivée est notée comme la copie affichée, ses réponses auto et semi
     * remplaçant les actuelles. Les questions manuelles, conservées d'une tentative à
     * l'autre, gardent la valeur que le formateur leur donne — `valeurManuelle(id)`.
     * Limite assumée : une semi d'une tentative archivée restée en attente de correction
     * compte 0, le formateur ne corrigeant que la dernière tentative.
     */
    ajustementTentatives(noteBrute, maxTotalScore, valeurManuelle) {
        const chapter = this.context?.chapter;
        const neutre = { ajustement: 0, tentative: 1, texte: '', regles: null };
        if (!chapter || !window.Bareme) return neutre;

        const regles = Bareme.reglesTentatives(chapter);
        const archives = chapter.tentativesPassees || [];
        if (regles.tentative <= 1 && !archives.length) return { ...neutre, regles };

        const chapitreRendu = chapter.submittedAt || chapter.examModeValidatedAt || null;
        const candidates = [{ tentative: regles.tentative, note: noteBrute, fermeeLe: chapitreRendu }];
        // Toutes les tentatives archivées sont notées, même en mode « dernière » : leur
        // historique reste sous les yeux du formateur (historiqueTentatives), quoi que
        // devienne l'appréciation.
        if (archives.length && maxTotalScore > 0) {
            const questions = this.context.chapterConfig?.questions || [];
            const valeur = valeurManuelle || (() => 0);
            archives.forEach(archive => {
                let auto = 0;
                let manuel = 0;
                questions.forEach(q => {
                    const archivee = archive.questions?.[q.id];
                    if (q.correctionType === 'auto') {
                        auto += this.toNumber(this.calculateAutoTheoreticalScore(q, archivee || {}));
                    } else if (q.correctionType === 'semi' && archivee) {
                        manuel += this.toNumber(this.calculateAutoTheoreticalScore(q, archivee));
                    } else {
                        manuel += this.toNumber(valeur(q.id));
                    }
                });
                const brute = (Math.max(0, auto) + Math.max(0, manuel)) / maxTotalScore * 20;
                candidates.push({ tentative: archive.tentative, note: Math.round(brute * 10) / 10, fermeeLe: archive.fermeeLe || null });
            });
        }

        const retenue = Bareme.retenirTentative(candidates, chapter);
        // Le filet du plancher se lit sur les tentatives de rang inférieur : la note de
        // chaque ligne vient de noterTentatives, qui suit son acquisition.
        const fermeeLe = new Map(candidates.map(c => [c.tentative, c.fermeeLe]));
        const historique = Bareme.noterTentatives(candidates, chapter)
            .map(c => ({
                tentative: c.tentative,
                fermeeLe: fermeeLe.get(c.tentative),
                noteBrute: c.noteBrute,
                note: c.note,
                enCours: c.tentative === regles.tentative,
                retenue: c.tentative === retenue.tentative
            }));
        const ajustement = Math.round((retenue.note - noteBrute) * 10) / 10;
        const n = v => String(Math.round(v * 10) / 10).replace('.', ',');
        const texte = `🔁 ${regles.tentative} tentative${regles.tentative > 1 ? 's' : ''} — retenue `
            + `${regles.retenue === 'meilleure' ? 'meilleure' : 'dernière'} : n°${retenue.tentative} `
            + `(${n(regles.penalite)} pt par tentative, plancher ${n(regles.plancher)}/20${retenue.plancherActif ? ' acquis' : ''})`
            + (ajustement ? ` : ${ajustement > 0 ? '+' : ''}${n(ajustement)} pt` : '');

        return { ajustement, tentative: retenue.tentative, texte, regles, historique };
    }

    /**
     * Historique des tentatives, en lecture seule : ce que le formateur doit pouvoir
     * retrouver même s'il a effacé ou réécrit l'appréciation du bonus/pénalité.
     * Rien quand il n'y a eu qu'une tentative.
     */
    historiqueTentatives(tentatives) {
        const liste = tentatives?.historique || [];
        if (!tentatives?.regles || liste.length < 2 && tentatives.regles.tentative <= 1) return '';
        const r = tentatives.regles;
        const n = v => String(Math.round(v * 10) / 10).replace('.', ',');
        const date = d => d ? new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
        const lignes = liste.map(t => `
            <tr${t.retenue ? ' style="font-weight:600;"' : ''}>
                <td>n°${t.tentative}${t.enCours ? ' (rendue)' : ''}</td>
                <td>${date(t.fermeeLe)}</td>
                <td>${n(t.noteBrute)}/20</td>
                <td>${n(t.note)}/20</td>
                <td>${t.retenue ? '✅ retenue' : ''}</td>
            </tr>`).join('');
        return `
            <div class="correction-row" style="display:block;">
                <div class="correction-label">🔁 Tentatives : ${r.tentative} — retenue ${r.retenue === 'meilleure' ? 'la meilleure' : 'la dernière'}
                    (${n(r.penalite)} pt par tentative, plancher ${n(r.plancher)}/20)</div>
                <table style="width:100%; border-collapse:collapse; margin-top:0.4rem; font-size:0.85rem;">
                    <tr style="text-align:left; color:#555;"><th>Tentative</th><th>Terminée le</th><th>Note</th><th>Après pénalité</th><th></th></tr>
                    ${lignes}
                </table>
                <div style="font-size:0.8rem; color:#777; margin-top:0.3rem;">Information permanente, indépendante de l'appréciation ci-dessous. Les questions manuelles, communes à toutes les tentatives, y comptent avec vos notes actuelles.</div>
            </div>`;
    }

    /** Valeurs des questions telles que saisies dans le modal, pour le calcul en direct. */
    valeursDepuisDOM() {
        const valeurs = new Map();
        document.querySelectorAll('.question-score').forEach(input => {
            valeurs.set(input.id.replace('score-', ''), this.toNumber(input.value));
        });
        return id => valeurs.get(id) ?? 0;
    }

    /**
     * Tant que le formateur n'a pas touché au bonus/pénalité (ni à son appréciation), la
     * valeur proposée suit la copie : une note manuelle qui change peut faire jouer le
     * plancher autrement. Dès qu'il y touche, sa saisie fait foi.
     */
    majPenaliteAutomatique(autoScore, manualScore, maxTotalScore) {
        const champ = document.getElementById('course-penalty');
        if (!champ || champ.dataset.auto !== '1') return;
        const noteBrute = maxTotalScore > 0
            ? Math.round((autoScore + manualScore) / maxTotalScore * 20 * 10) / 10 : 0;
        const nonLu = this.viewModel.questions.some(q => q.isCourse && q.isRequired && !q.isCorrect);
        const proposee = this.penaliteAutomatique(noteBrute, maxTotalScore, this.valeursDepuisDOM(), nonLu);
        champ.value = proposee.valeur;
        const commentaire = document.getElementById('course-penalty-comment');
        if (commentaire && commentaire.dataset.auto === '1') commentaire.value = proposee.commentaire;
    }

    /**
     * ✅ Met à jour le libellé dynamique "Bonus" ou "Pénalité" selon le signe
     */
    updateBonusPenaltyLabel(value) {
        const penaltyLabel = document.getElementById('summary-penalty');
        if (!penaltyLabel) return;
        
        if (value > 0) {
            penaltyLabel.innerHTML = `+${value} pts 🎁 Bonus`;
            penaltyLabel.style.color = '#2e7d32';
        } else if (value < 0) {
            penaltyLabel.innerHTML = `${value} pts 📌 Pénalité`;
            penaltyLabel.style.color = '#c62828';
        } else {
            penaltyLabel.innerHTML = `0 pts`;
            penaltyLabel.style.color = '';
        }
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

        const maxTotalScore =
            this.viewModel.scoring.auto.max +
            this.viewModel.scoring.manual.max;

        this.majPenaliteAutomatique(autoScore, manualScore, maxTotalScore);
        const coursePenalty = this.toNumber(
            document.getElementById('course-penalty')?.value
        );

        const noteSur20 = this.calculateNoteSur20(
            autoScore,
            manualScore,
            maxTotalScore,
            coursePenalty
        );

        this.updateHeaderNote(noteSur20);
        this.updateGlobalSummary();
        this.updateBonusPenaltyLabel(coursePenalty);
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

        // Bonus/pénalité proposé tant que rien n'est saisi : cours (0 en consigne au lieu
        // de −2) et tentatives (Blind, Millionnaire). Le rendu (renderQuestionList) affiche
        // cette même valeur : les deux doivent rester d'accord, sinon la note de l'en-tête
        // et la note sauvegardée divergent.
        const parId = new Map(questions.map(q => [q.id, q]));
        const valeurManuelle = id => {
            const q = parId.get(id);
            if (!q) return 0;
            return (typeof q.teacherScore === 'number' && !isNaN(q.teacherScore))
                ? q.teacherScore : this.toNumber(q.theoreticalScore ?? q.score);
        };
        const noteBrute = maxTotalScore > 0 ? Math.round(totalScore / maxTotalScore * 20 * 10) / 10 : 0;
        const penaliteAuto = this.penaliteAutomatique(noteBrute, maxTotalScore, valeurManuelle, hasUnreadRequired);
        const coursePenalty = this.context.chapter.coursePenalty ?? penaliteAuto.valeur;

        // ✅ Utilisation de la fonction SOURCE DE VÉRITÉ UNIQUE
        const noteSur20 = this.calculateNoteSur20(
            autoScore,
            manualScore,
            maxTotalScore,
            coursePenalty
        );
        const tentatives = penaliteAuto.tentatives;

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
            penaliteAuto,
            tentatives,
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

            if (!scoreInput || !commentInput) return;

            // Une question à laquelle l'apprenant n'a jamais touché n'a pas d'entrée de
            // progression. Hors consigne, on s'abstient comme avant : il n'y a rien à corriger.
            // En consigne c'est le cas ORDINAIRE — la copie est sur papier — et s'abstenir
            // ferait disparaître en silence le score que le formateur vient de lire sur la feuille.
            if (!chapter.questions) chapter.questions = {};
            if (!chapter.questions[questionId]) {
                if (!this.isConsigne()) return;
                chapter.questions[questionId] = { answered: false };
            }

            const question = chapter.questions[questionId];

            question.teacherScore = this.toNumber(scoreInput.value);
            question.teacherComment = commentInput.value.trim();

            // ✅ Lire l'état de la checkbox "Traité"
            const treatedCb = document.getElementById(`treated-${questionId}`);
            if (treatedCb) {
                question.manualCorrectionStatus = treatedCb.checked ? 'corrected' : 'pending';
            } else {
                // Pas de case : la question ne demandait aucun arbitrage (auto, ou semi
                // tranchée par le système), elle est donc corrigée par construction. En
                // consigne ce repli ne joue jamais, puisque toutes les lignes ont une case —
                // et il ne DOIT pas jouer, sous peine de marquer « corrigée » une question
                // dont personne n'a encore lu la réponse papier.
                question.manualCorrectionStatus = 'corrected';
            }

            question.correctedAt = new Date().toISOString();
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
        const questions = chapterConfig.questions.map(qConfig => {
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

        // ✅ Inclure les cours pour que calculateDetailedScore puisse détecter les cours obligatoires non lus
        const totalCourseCount = chapterConfig.courseCount || 0;
        for (let i = 0; i < totalCourseCount; i++) {
            const courseId = `course_${i}`;
            const courseData = chapter.questions?.[courseId] || {};
            const courseConfig = chapterConfig.courses?.find(c => c.index === i);

            questions.push({
                ...courseData,
                id: courseId,
                correctionType: 'manuel',
                isCourse: true,
                isRequired: courseConfig ? courseConfig.requiresValidation : false,
                points: 0,
                teacherScore: undefined,
                theoreticalScore: undefined
            });
        }

        return questions;
    }

    /**
     * Applique les résultats du calcul centralisé sur l'objet chapter
     */
    applyScoreToChapter(chapter, result, approve) {
        chapter.finalScore = result.totalScore;
        chapter.noteAttribuee = Math.round(result.noteSur20 * 10) / 10; // ✅ Arrondi garanti 1 décimale
        chapter.coursePenalty = result.coursePenalty;
        // La pénalité par tentative est dans coursePenalty (bonus/pénalité), comme celle des
        // cours ; on garde seulement la tentative retenue, pour l'expliquer (export, suivi).
        chapter.tentativeRetenue = result.tentatives?.tentative || 1;

        chapter.correctionStatus = approve ? 'validated' : 'in_progress';

        if (approve) {
            // Par le setter, jamais en écrivant l'étiquette : celle-ci est dérivée des
            // dates, et posée seule elle disparaissait au premier recalcul — c'est-à-dire
            // dès la correction suivante depuis Correction en salle.
            ProgressManager.setSubmissionStatus(chapter, 'validated');
        }
    }

    /**
     * Gère les actions UI après sauvegarde
     */
    async afterSaveUI(approve, studentId, chapterId) {
        if (approve) {
            alert('✅ Correction publiée !');
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

            // ✅ SYNC : la référence rechargée remplace l'ancienne dans le contexte
            this.context.chapter = chapter;

            // 1. Synchroniser DOM → données
            this.applyTeacherInputsToChapter(chapter, chapterConfig);

            // 1 bis. Recompter l'avancement pendant qu'on tient la progression : une copie
            // rendue ne verra plus d'action de l'apprenant, donc plus aucun recalcul — un
            // compteur faux le resterait. On ne touche QUE ces trois champs, le moteur de
            // score ci-dessous gardant le dernier mot sur finalScore et correctionStatus.
            const avancement = ProgressManager.compterAvancement(chapter, chapterConfig);
            chapter.answeredQuestions = avancement.repondues;
            chapter.answeredCourses = avancement.coursValides;
            chapter.completionPercent = avancement.pourcentage;

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