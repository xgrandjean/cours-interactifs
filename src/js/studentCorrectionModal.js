/**
 * studentCorrectionModal.js - Vue corrigé en lecture seule pour l'apprenant
 * Les styles sont injectés automatiquement — aucun fichier CSS externe requis.
 */

class StudentCorrectionModal extends CorrectionModal {

    constructor() {
        super();
        this._injectStyles();
    }

    // =========================================================================
    // INJECTION DES STYLES
    // =========================================================================

    _injectStyles() {
        if (document.getElementById('scm-styles')) return;
        const style = document.createElement('style');
        style.id = 'scm-styles';
        style.textContent = `
            #student-correction-modal {
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0,0,0,0.5);
                display: flex;
                align-items: flex-start;
                justify-content: center;
                z-index: 1100;
                padding: 2rem 1rem;
                overflow-y: auto;
            }
            .scm-modal {
                background: #ffffff;
                border-radius: 12px;
                border: 1px solid #dee2e6;
                width: 100%;
                max-width: 1100px;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                margin: auto;
                box-shadow: 0 4px 20px rgba(0,0,0,0.2);
            }
            .scm-header {
                padding: 1rem 1.25rem 0.875rem;
                border-bottom: 1px solid #e9ecef;
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                background: #ffffff;
            }
            .scm-title {
                font-size: 1rem;
                font-weight: 600;
                color: #2c3e50;
                margin: 0 0 6px;
            }
            .scm-meta {
                display: flex;
                align-items: center;
                gap: 8px;
                flex-wrap: wrap;
            }
            .scm-note-pill {
                display: inline-flex;
                align-items: center;
                background: #dbeafe;
                color: #1e40af;
                border-radius: 20px;
                padding: 3px 12px;
                font-size: 0.8rem;
                font-weight: 600;
            }
            .scm-validated-label {
                font-size: 0.75rem;
                color: #6c757d;
            }
            .scm-close-btn {
                background: #ffffff;
                border: 1px solid #dee2e6;
                cursor: pointer;
                color: #6c757d;
                font-size: 1.1rem;
                padding: 4px 9px;
                border-radius: 6px;
                line-height: 1;
                flex-shrink: 0;
            }
            .scm-close-btn:hover { background: #f8f9fa; color: #343a40; }
            .scm-global-comment {
                margin: 0.875rem 1.25rem 0;
                background: #dbeafe;
                border-left: 3px solid #3b82f6;
                border-radius: 6px;
                padding: 0.75rem 1rem;
            }
            .scm-global-comment-label {
                font-size: 0.7rem;
                color: #1e40af;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                margin-bottom: 4px;
            }
            .scm-global-comment-text {
                font-size: 0.875rem;
                color: #1e3a8a;
                font-style: italic;
                line-height: 1.6;
                margin: 0;
            }
            .scm-body {
                padding: 0.875rem 1.25rem 1.5rem;
                display: flex;
                flex-direction: column;
                gap: 0.625rem;
                background: #ffffff;
            }
            .scm-summary {
                background: #f8f9fa;
                border-radius: 8px;
                border: 1px solid #e9ecef;
                padding: 0.75rem 1rem;
                display: grid;
                grid-template-columns: repeat(4,1fr);
                gap: 8px;
            }
            .scm-summary-cell { display: flex; flex-direction: column; gap: 2px; }
            .scm-summary-label { font-size: 0.65rem; color: #6c757d; text-transform: uppercase; letter-spacing: 0.05em; }
            .scm-summary-value { font-size: 0.9rem; font-weight: 600; color: #2c3e50; }
            .scm-summary-total .scm-summary-value { color: #1e40af; font-size: 1rem; }
            .scm-section-title {
                font-size: 0.7rem;
                font-weight: 600;
                color: #6c757d;
                text-transform: uppercase;
                letter-spacing: 0.07em;
                padding: 0.375rem 0 0.125rem;
                margin-top: 0.25rem;
            }
            .scm-card {
                background: #ffffff;
                border: 1px solid #e9ecef;
                border-radius: 8px;
                overflow: hidden;
            }
            .scm-card.scm-ok    { border-left: 3px solid #2e7d32; background-color: #e8f5e9; }
            .scm-card.scm-err   { border-left: 3px solid #c62828; background-color: #ffebee; }
            .scm-card.scm-warn  { border-left: 3px solid #ef6c00; background-color: #fff3e0; }
            .scm-card.scm-neutral { border-left: 3px solid #dee2e6; }
            .scm-card-head {
                padding: 0.55rem 0.875rem;
                background: #f8f9fa;
                border-bottom: 1px solid #e9ecef;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .scm-card-title { font-size: 0.875rem; font-weight: 600; color: #2c3e50; flex: 1; margin: 0; }
            .scm-score-pill { font-size: 0.78rem; font-weight: 600; padding: 2px 10px; border-radius: 12px; white-space: nowrap; flex-shrink: 0; }
            .scm-score-pill.scm-ok      { background: #c8e6c9; color: #2e7d32; }
            .scm-score-pill.scm-err     { background: #ffcdd2; color: #c62828; }
            .scm-score-pill.scm-neutral { background: #ffe0b2; color: #ef6c00; border: 1px solid #ffcc80; }
            .scm-row {
                display: flex;
                gap: 10px;
                padding: 0.45rem 0.875rem;
                border-bottom: 1px solid #f0f0f0;
                background: #ffffff;
            }
            .scm-row:last-of-type { border-bottom: none; }
            .scm-row-label { font-size: 0.75rem; color: #6c757d; min-width: 130px; padding-top: 2px; flex-shrink: 0; }
            .scm-row-value { font-size: 0.875rem; color: #2c3e50; flex: 1; line-height: 1.5; }
            .scm-row-value.scm-ok  { color: #2e7d32; font-weight: 600; }
            .scm-row-value.scm-err { color: #c62828; font-weight: 500; text-decoration: line-through; opacity: 0.85; }
            .scm-sys-note { padding: 0.35rem 0.875rem; background: #f8f9fa; border-top: 1px solid #f0f0f0; font-size: 0.72rem; color: #6c757d; }
            .scm-q-comment { display: flex; gap: 8px; padding: 0.5rem 0.875rem; background: #dbeafe; border-top: 1px solid #bfdbfe; }
            .scm-q-comment-text { font-size: 0.8rem; color: #1e3a8a; font-style: italic; line-height: 1.5; margin: 0; }
            .scm-course-card { background: #ffffff; border: 1px solid #e9ecef; border-radius: 8px; padding: 0.55rem 0.875rem; display: flex; align-items: center; gap: 8px; }
            .scm-course-card.scm-err { border-left: 3px solid #dc3545; }
            .scm-course-name { font-size: 0.875rem; color: #2c3e50; flex: 1; }
            .scm-course-name.scm-muted { color: #6c757d; }
            .scm-badge { display: inline-flex; align-items: center; padding: 2px 9px; border-radius: 10px; font-size: 0.7rem; font-weight: 600; flex-shrink: 0; }
            .scm-badge.scm-ok      { background: #d4edda; color: #155724; }
            .scm-badge.scm-err     { background: #f8d7da; color: #721c24; }
            .scm-badge.scm-neutral { background: #f8f9fa; color: #6c757d; border: 1px solid #dee2e6; }
            @media (max-width: 600px) {
                .scm-summary { grid-template-columns: repeat(2,1fr); }
                .scm-row { flex-direction: column; gap: 2px; }
                .scm-row-label { min-width: unset; }
            }
        `;
        document.head.appendChild(style);
    }

    // =========================================================================
    // POINT D'ENTRÉE PUBLIC
    // =========================================================================

    async open(chapterId) {
        const context = await this._getStudentContext(chapterId);
        if (!context) return;

        this.context   = context;
        this.viewModel = this.buildQuestionsViewModel(context);

        this._injectModalHTML();
        this._bindStudentEvents();
    }

    // =========================================================================
    // CHARGEMENT DU CONTEXTE APPRENANT
    // =========================================================================

    async _getStudentContext(chapterId) {
        try {
            const token = sessionStorage.getItem('current_student_token');
                if (!token) { alert('Veuillez vous connecter pour voir le corrigé.'); return null; }

            // ✅ Récupérer le slug du parcours
            const slug = window.currentParcoursSlug || (window.Parcours ? Parcours.slug : null);
            if (!slug) {
                alert('Parcours non identifié.');
                return null;
            }

            // ✅ Utiliser la clé complète avec slug
            const key = `${slug}:${token}:student_${token}_progress`;
            const progress = await storage.get(key);
            if (!progress) {
                alert('Aucune progression trouvée.');
                return null;
            }

            const chapter = progress.chapters?.[chapterId];
            if (!chapter) {
                alert('Chapitre introuvable dans votre progression.');
                return null;
            }

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
            if (!chapterConfig) {
                alert('Configuration du chapitre introuvable.');
                return null;
            }

            // ✅ Lire la config spécifique du chapitre avec la bonne clé
            const configKey = `${slug}:config:chapter_config`;
            const storageConfig = await storage.get(configKey) || {};
            const finalConfig = { ...chapterConfig, ...(storageConfig[chapterId] || {}) };

            return {
                student: { name: 'Vous', class: '' },
                progress,
                chapter,
                chapterConfig: finalConfig,
                studentId: token,
                chapterId,
                slug
            };
        } catch (err) {
            console.error('[StudentCorrectionModal] Erreur:', err);
            alert('Erreur lors du chargement du corrigé.');
            return null;
        }
    }
    // =========================================================================
    // INJECTION DU MODAL
    // =========================================================================

    _injectModalHTML() {
        document.getElementById('student-correction-modal')?.remove();
        const wrapper = document.createElement('div');
        wrapper.id        = 'student-correction-modal';
        wrapper.innerHTML = this._buildModalHTML();
        document.body.appendChild(wrapper);
    }

    close() {
        document.getElementById('student-correction-modal')?.remove();
    }

    // =========================================================================
    // HTML COMPLET
    // =========================================================================

    _buildModalHTML() {
        const { chapterConfig, chapter } = this.context;
        const { scoring }                = this.viewModel;
        const noteSur20                  = Math.round(scoring.noteSur20 * 10) / 10;
        const validatedAt = chapter.validatedAt
            ? new Date(chapter.validatedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
            : null;

        return `
        <div class="scm-modal">
            ${this._buildHeader(chapterConfig.title, noteSur20, validatedAt)}
            ${chapter.globalComment ? this._buildGlobalComment(chapter.globalComment) : ''}
            <div class="scm-body">
                ${this._buildSummary(scoring)}
                ${this._buildQuestions()}
                ${this._buildCourses()}
            </div>
        </div>`;
    }

    _buildHeader(title, note, validatedAt) {
        return `
        <div class="scm-header">
            <div>
                <p class="scm-title">📄 ${title}</p>
                <div class="scm-meta">
                    <span class="scm-note-pill">Note finale : ${note} / 20</span>
                    ${validatedAt ? `<span class="scm-validated-label">Validé le ${validatedAt}</span>` : ''}
                </div>
            </div>
            <button class="scm-close-btn" id="scm-close-btn" title="Fermer">&times;</button>
        </div>`;
    }

    _buildGlobalComment(comment) {
        return `
        <div class="scm-global-comment">
            <div class="scm-global-comment-label">Appréciation générale</div>
            <p class="scm-global-comment-text">${comment}</p>
        </div>`;
    }

    _buildSummary(scoring) {
        const note = Math.round(scoring.noteSur20 * 10) / 10;
        return `
        <div class="scm-summary">
            <div class="scm-summary-cell">
                <span class="scm-summary-label">Automatique</span>
                <span class="scm-summary-value">${scoring.auto.teacher} / ${scoring.auto.max}</span>
            </div>
            <div class="scm-summary-cell">
                <span class="scm-summary-label">Correction</span>
                <span class="scm-summary-value">${scoring.manual.teacher} / ${scoring.manual.max}</span>
            </div>
            <div class="scm-summary-cell">
                <span class="scm-summary-label">Pénalité</span>
                <span class="scm-summary-value">${scoring.coursePenalty ?? 0} pt</span>
            </div>
            <div class="scm-summary-cell scm-summary-total">
                <span class="scm-summary-label">Note finale</span>
                <span class="scm-summary-value">${note} / 20</span>
            </div>
        </div>`;
    }

    _buildQuestions() {
        const questions = this.viewModel.questions.filter(q => !q.isCourse);
        if (!questions.length) return '';
        return `<div class="scm-section-title">Questions</div>${questions.map(q => this._buildQuestionCard(q)).join('')}`;
    }

    _buildQuestionCard(q) {
        const maxPoints  = q.points || 0;
        const isAuto     = q.correctionType === 'auto' || q.correctionType === 'semi';
        const finalScore = (typeof q.teacherScore === 'number' && !isNaN(q.teacherScore))
            ? q.teacherScore
            : parseFloat(q.theoreticalScore ?? q.score ?? 0);

        let borderClass, pillClass;
        if (finalScore === maxPoints && maxPoints > 0) {
            borderClass = 'scm-ok';  pillClass = 'scm-ok';
        } else if (finalScore <= 0) {
            borderClass = 'scm-err'; pillClass = 'scm-err';
        } else {
            borderClass = 'scm-warn'; pillClass = 'scm-neutral';
        }

        let studentAnswer = '<em style="color:#6c757d;">Pas de réponse</em>';
        if (q.answer !== undefined && q.answer !== null && q.answer !== '') {
            if (q.type === 'qcm' && q.options) {
                studentAnswer = q.options[parseInt(q.answer)] ?? q.answer;
            } else if (Array.isArray(q.answer)) {
                studentAnswer = q.answer.map(i => q.options ? q.options[i] : i).join(', ');
            } else {
                studentAnswer = q.answer;
            }
        }

        let expectedRow = '';
        if (isAuto) {
            let expected = '';
            if (q.options && q.correctAnswers !== undefined) {
                expected = Array.isArray(q.correctAnswers)
                    ? q.correctAnswers.map(i => q.options[i]).join(' & ')
                    : (q.options[q.correctAnswers] ?? '');
            } else if (q.type === 'courte' && Array.isArray(q.correctAnswers)) {
                expected = q.correctAnswers.join(' ou ');
            }
            if (expected) {
                expectedRow = `<div class="scm-row"><span class="scm-row-label">Réponse attendue</span><span class="scm-row-value scm-ok">${expected}</span></div>`;
            }
        }

        let sysNote = '';
        if (isAuto && typeof q.attempts === 'number') {
            sysNote = `<div class="scm-sys-note">Nombre d'essais: ${q.attempts}</div>`;
        } else if (!isAuto) {
            sysNote = `<div class="scm-sys-note">Score attribué par le professeur</div>`;
        }

        const commentHtml = q.teacherComment
            ? `<div class="scm-q-comment"><p class="scm-q-comment-text">${q.teacherComment}</p></div>`
            : '';

        const answerClass = finalScore === maxPoints && maxPoints > 0 ? 'scm-ok'
            : finalScore <= 0 ? 'scm-err' : '';

        return `
        <div class="scm-card ${borderClass}">
            <div class="scm-card-head">
                <p class="scm-card-title">${q.title || `Question ${q.id}`}</p>
                <span class="scm-score-pill ${pillClass}">${finalScore} / ${maxPoints} pt${maxPoints > 1 ? 's' : ''}</span>
            </div>
            ${q.questionText ? `<div class="scm-row"><span class="scm-row-label">Consigne</span><span class="scm-row-value">${q.questionText}</span></div>` : ''}
            <div class="scm-row">
                <span class="scm-row-label">Votre réponse</span>
                <span class="scm-row-value ${answerClass}">${studentAnswer}</span>
            </div>
            ${expectedRow}
            ${sysNote}
            ${commentHtml}
        </div>`;
    }

    _buildCourses() {
        const courses = this.viewModel.questions.filter(q => q.isCourse);
        if (!courses.length) return '';
        return `<div class="scm-section-title">Cours</div>${courses.map(c => this._buildCourseCard(c)).join('')}`;
    }

    _buildCourseCard(course) {
        if (!course.isRequired) {
            return `<div class="scm-course-card"><span class="scm-course-name scm-muted">${course.title || course.id}</span><span class="scm-badge scm-neutral">Informatif</span></div>`;
        }
        const isRead = course.isCorrect === true;
        return `
        <div class="scm-course-card ${isRead ? '' : 'scm-err'}">
            <span class="scm-course-name">${course.title || course.id}</span>
            <span class="scm-badge ${isRead ? 'scm-ok' : 'scm-err'}">${isRead ? 'Lu' : 'Non lu'}</span>
        </div>`;
    }

    // =========================================================================
    // ÉVÉNEMENTS
    // =========================================================================

    _bindStudentEvents() {
        document.getElementById('scm-close-btn')
            ?.addEventListener('click', () => this.close());
        document.getElementById('student-correction-modal')
            ?.addEventListener('click', (e) => {
                if (e.target.id === 'student-correction-modal') this.close();
            });
    }

    // =========================================================================
    // DÉSACTIVATION DES MÉTHODES D'ÉCRITURE
    // =========================================================================

    saveAllCorrections()          {}
    applyTeacherInputsToChapter() {}
    calculateScoreLive()          {}
    updateGlobalSummary()         {}
    render()                      {}
}

window.studentCorrectionModal = new StudentCorrectionModal();
