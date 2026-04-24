// ============================================================================
// STUDENT WORK EDITOR - FINAL ARCHITECTURE (ENGINE + EDITOR)
// ============================================================================

// 🔧 QUESTION ENGINE - TOUTE LA LOGIQUE MÉTIER - PURE, TESTABLE, SANS EFFET DE BORD
class QuestionEngine {

    static evaluate(question) {

        const type = question.dataset.correctionType;
        const points = +question.dataset.points || 0;

        const answer = this.extract(question);

        if (!answer.hasAnswer) {
            return this.state('empty', answer, points);
        }

        if (answer.type === 'textarea') {

            const minLength = +question.dataset.minLength || 0;

            if (!answer.value) {
                return this.state('empty', answer, 0);
            }

            if (minLength && answer.value.length < minLength) {
                return this.state('wrong', answer, 0);
            }

            return this.state('pending', answer, 0);
        }

        const correct = this.correct(question, answer.type);

        const normalized = (v) =>
            Array.isArray(v) ? [...v].sort().join(',') : String(v);

        const isValid = (() => {
            if (Array.isArray(correct) && Array.isArray(answer.value)) {
                return normalized(correct) === normalized(answer.value);
            }
            if (Array.isArray(correct)) {
                return correct.includes(answer.value);
            }
            return answer.value === correct;
        })();

        switch (type) {

            case 'auto':
                return this.state(
                    isValid ? 'correct' : 'wrong',
                    answer,
                    isValid ? points : 0
                );

            case 'semi':
                return this.state(
                    isValid ? 'correct' : 'pending',
                    answer,
                    isValid ? points : 0,
                    question,
                    { shouldLock: isValid }
                );

            case 'manuel':
                return this.state('manual', answer, points);

            case 'obligatoire':
                return this.state('correct', answer, points);

            default:
                return this.state('pending', answer, 0);
        }
    }

    static state(status, answer, points, question = null, extra = {}) {
        return {
            hasAnswer: status !== 'empty',
            isCorrect:
                status === 'correct' ? true :
                status === 'pending' ? null :
                status === 'wrong' ? false :
                null,

            points,
            userAnswer: answer.value || null,
            typeState: status,
            ...extra
        };
    }

    static extract(question) {

        const radio = question.querySelector('input[type="radio"]:checked');
        if (radio) return { hasAnswer: true, type: 'radio', value: +radio.value };

        const checkbox = [...question.querySelectorAll('input[type="checkbox"]:checked')];
        if (checkbox.length) return {
            hasAnswer: true,
            type: 'checkbox',
            value: checkbox.map(x => +x.value)
        };

        const select = question.querySelector('select');
        if (select && select.value !== '') {
            return {
                hasAnswer: true,
                type: 'select',
                value: isNaN(select.value) ? select.value : +select.value
            };
        }

        const input = question.querySelector('input[type="text"], input[type="number"]');
        if (input && input.value.trim()) {
            return {
                hasAnswer: true,
                type: 'input',
                value: input.value.trim().toLowerCase()
            };
        }

        const textarea = question.querySelector('textarea');
        if (textarea && textarea.value.trim()) {
            return {
                hasAnswer: true,
                type: 'textarea',
                value: textarea.value.trim()
            };
        }

        return { hasAnswer: false };
    }

   
    static correct(question, type) {
        const dataAnswers = question.dataset.correctAnswers;
        if (!dataAnswers) return [];

        try {
            const parsed = JSON.parse(dataAnswers);
            if (type === 'radio' || type === 'select') return +parsed[0];
            if (type === 'checkbox') return parsed.map(x => +x);
            return parsed.map(x => String(x).trim().toLowerCase());
        } catch(e) {
            console.warn(`[QuestionEngine] data-correct-answers invalide sur question`, question);
            return [];
        }
    }
}

// 🎨 STUDENT WORK EDITOR - ORCHESTRATEUR DOM + UI - LIGHT, GLUE CODE SEULEMENT
class StudentWorkEditor {

    constructor(options = {}) {
        this.options = {
            onAnswerChanged: options.onAnswerChanged || (() => {}),
            onAnswerValidated: options.onAnswerValidated || (() => {}),
            allowMultipleAttempts: options.allowMultipleAttempts !== false,
            ...options
        };

        this.cooldown = new Map();
        this.history = [];
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;
        this.initialized = true;
        this.attachEventListeners();
        
        // Auto bind des boutons toggleHint sans exposition globale
        document.querySelectorAll('button[onclick*="toggleHint"]').forEach(btn => {
            const match = btn.getAttribute('onclick').match(/toggleHint\(['"]([^'"]+)['"]\)/);
            if (match) {
                btn.removeAttribute('onclick');
                btn.addEventListener('click', () => this.toggleHint(match[1]));
            }
        });

        console.log('✅ StudentWorkEditor initialisé');
    }

    attachEventListeners() {
        document.querySelectorAll('.question-section').forEach(question => {

            question.querySelectorAll('input, select, textarea').forEach(element => {

                const eventType = 
                    element.tagName === 'TEXTAREA' ? 'input' :
                    element.tagName === 'SELECT' ? 'change' :
                    'change';

                element.addEventListener(eventType, () => this.onInputChanged(question, element));
            });
        });
    }

    onInputChanged(questionElement, inputElement) {
        const questionId = questionElement.dataset.questionId;
        const now = Date.now();

        // Anti spam 120ms
        if ((this.cooldown.get(questionId) || 0) > now - 120) return;
        this.cooldown.set(questionId, now);

        const result = QuestionEngine.evaluate(questionElement);

        this.options.onAnswerChanged({
            questionId,
            result,
            questionElement,
            inputElement
        });
    }

    handleAnswer(elementId, correctionType, points) {

        const question = document.querySelector(`.question-section[data-question-id="${elementId}"]`);
        const feedback = document.getElementById(`feedback_${elementId}`);

        const result = QuestionEngine.evaluate(question);

        if (!result.hasAnswer) {
            this.showFeedback(feedback, '❌ Réponse vide', 'error');
            this.displayIndividualFeedback(question, null);
            return false;
        }

        this.history.push({
            id: elementId,
            answer: result.userAnswer,
            ok: result.typeState === 'correct',
            isCorrect: result.isCorrect,
            time: Date.now()
        });

        const state = result.isCorrect;
        const status = result.typeState;
        
        if (correctionType === 'auto') {
            if (state === true) {
                this.showFeedback(feedback, '✅ Correct', 'success');
                this.disableAutoCorrectedQuestion(question);
            } else {
                this.showFeedback(feedback, '❌ Incorrect', 'error');
            }
        }

        if (correctionType === 'semi') {

            if (result.shouldLock) {
                this.disableAutoCorrectedQuestion(question);
            }

            if (status === 'correct') {
                this.showFeedback(feedback, '✅ Correct', 'success');
            }
            else if (status === 'wrong') {
                this.showFeedback(feedback, '❌ Incorrect', 'error');
            }
            else {
                this.showFeedback(feedback, '⏳ À corriger', 'warning');
            }
        }
        if (correctionType === 'manuel') {
            this.showFeedback(feedback, '📝 Envoyé professeur', 'info');
        }

        this.displayIndividualFeedback(question, state);

        this.options.onAnswerValidated({
            questionId: elementId,
            answer: result.userAnswer,
            isCorrect: state,
            points,
            correctionType
        });

        return state;
    }

    handleOpenAnswer(elementId, correctionType, points, minLength) {
        const textarea = document.getElementById(elementId);
        const feedback = document.getElementById(`feedback_${elementId}`);
        const question = document.querySelector(`.question-section[data-question-id="${elementId}"]`);
        const result = QuestionEngine.evaluate(question);

        if (!result.hasAnswer) {
            this.showFeedback(feedback, '❌ Réponse vide', 'error');
            this.displayIndividualFeedback(question, null);
            return false;
        }

        if (result.isCorrect === false) {
            this.showFeedback(feedback, `❌ Réponse (${result.userAnswer.length}/${minLength} caractères). Trop courte.`, 'error');
        } else {
            this.showFeedback(feedback, `⏳ Réponse enregistrée (${result.userAnswer.length} caractères). En attente de correction.`, 'info');
        }

        if (result.shouldLock) {
            this.disableAutoCorrectedQuestion(question);
        }

        this.displayIndividualFeedback(question, result.isCorrect);

        this.options.onAnswerValidated({
            questionId: elementId,
            answer: result.userAnswer,
            isCorrect: result.isCorrect,
            points: result.points,
            correctionType,
            needsReview: result.isCorrect === null
        });

        return true;
    }

    disableAutoCorrectedQuestion(question) {
        question.classList.add('completed');

        question.querySelectorAll('input, select, textarea, button').forEach(element => {
            element.disabled = true;
            element.style.opacity = 0.7;
            element.style.pointerEvents = 'none';
        });

        const button = question.querySelector('.btn-check-answer');
        if (button) {
            button.textContent = '✓ Validé';
            button.style.backgroundColor = '#27ae60';
        }
    }

    displayIndividualFeedback(question, isCorrect) {
        let feedbackDiv = question.querySelector('.question-feedback');
        if (!feedbackDiv) {
            feedbackDiv = document.createElement('div');
            feedbackDiv.className = 'question-feedback';
            question.querySelector('.question-box').appendChild(feedbackDiv);
        }

        feedbackDiv.textContent =
            isCorrect === null ? '⏳' :
            isCorrect ? '✓' : '✗';

        feedbackDiv.className =
            `question-feedback ${isCorrect === null ? 'pending' :
             isCorrect ? 'correct' : 'incorrect'}`;

        feedbackDiv.style.cssText = 'position: absolute; right: 1rem; top: 1rem; font-size: 1.2rem; font-weight: bold;';
    }

    showFeedback(feedbackElement, message, type) {
        if (!feedbackElement) return;

        feedbackElement.innerHTML = message;
        feedbackElement.className = `feedback show ${type}`;
        feedbackElement.style.display = 'block';

        setTimeout(() => {
            feedbackElement.className = 'feedback';
        }, 3000);
    }

    lockAllQuestions() {
        document.querySelectorAll('.question-section').forEach(question => this.disableAutoCorrectedQuestion(question));
    }

    restoreQuestion(questionId, questionData) {
        const radio = document.querySelector(`input[type="radio"][name="qcm_${questionId}"]`);
        if (radio) {
            const radioSelected = document.querySelector(`input[name="qcm_${questionId}"][value="${questionData.answer}"]`);
            if (radioSelected) {
                radioSelected.checked = true;
                if (!this.options.allowMultipleAttempts && questionData.isCorrect === true) {
                    this.setInputsDisabled(`qcm_${questionId}`, true);
                }
            }
            return;
        }
        
        const checkbox = document.querySelector(`input[type="checkbox"][name="qcm_${questionId}"]`);
        if (checkbox && Array.isArray(questionData.answer)) {
            questionData.answer.forEach(value => {
                const checkboxSelected = document.querySelector(`input[name="qcm_${questionId}"][value="${value}"]`);
                if (checkboxSelected) {
                    checkboxSelected.checked = true;
                    if (!this.options.allowMultipleAttempts && questionData.isCorrect === true) {
                        checkboxSelected.disabled = true;
                    }
                }
            });
            return;
        }
        
        const select = document.querySelector(`select#${questionId}`);
        if (select) {
            select.value = questionData.answer;
            if (!this.options.allowMultipleAttempts && questionData.isCorrect === true) {
                select.disabled = true;
            }
            return;
        }
        
        const shortInput = document.getElementById(`short_${questionId}`);
        if (shortInput) {
            shortInput.value = questionData.answer || '';
            if (!this.options.allowMultipleAttempts && questionData.isCorrect === true) {
                shortInput.disabled = true;
            }
            return;
        }
        
        const textarea = document.getElementById(questionId);
        if (textarea && textarea.tagName === 'TEXTAREA') {
            textarea.value = questionData.answer || '';
        }
    }

    setInputsDisabled(name, disabled) {
        const inputs = document.querySelectorAll(`input[name="${name}"]`);
        inputs.forEach(input => {
            input.disabled = disabled;
        });
    }

    validateCourse(button) {
        button.disabled = true;
        button.textContent = '✓ Validé';
        button.style.backgroundColor = '#27ae60';
        
        const courseSection = button.closest('.course-content');
        if (courseSection) {
            const feedbackDiv = document.createElement('div');
            feedbackDiv.className = 'feedback success show';
            feedbackDiv.textContent = '✅ Cours marqué comme lu. Vous pouvez continuer.';
            feedbackDiv.style.marginTop = '1rem';
            courseSection.appendChild(feedbackDiv);
            
            setTimeout(() => {
                feedbackDiv.remove();
            }, window.APP_CONFIG.SUCCESS_FEEDBACK_DURATION);
            
            courseSection.classList.add('completed');
        }
        
        if (window.syncCourseToProgress) {
            const courseIndex = Array.from(document.querySelectorAll('.course-content')).indexOf(courseSection);
            const courseId = `course_${courseIndex}`;
            window.syncCourseToProgress(courseId);
        }
        
        if (window.updateAllProgressIndicators) {
            window.updateAllProgressIndicators();
        }
    }

    toggleHint(hintId) {
        const hint = document.getElementById(hintId);
        if (hint) {
            hint.style.display = hint.style.display === 'none' ? 'block' : 'none';
        }
    }

    hideAllHints() {
        document.querySelectorAll('.hint-container').forEach(hint => {
            hint.style.display = 'none';
        });

        document.querySelectorAll('[data-hint-btn]').forEach(btn => {
            btn.style.display = 'none';
        });
    }

    validateAllQuestions() {
        return window.validateAllQuestions ? window.validateAllQuestions() : false;
    }

    destroy() {
        this.initialized = false;
        this.cooldown.clear();
        this.history = [];
    }
}

// Export global
window.QuestionEngine = QuestionEngine;
window.StudentWorkEditor = StudentWorkEditor;
window.studentWorkEditor = new StudentWorkEditor();

// Bind functions pour onclick HTML
window.studentWorkEditor.validateCourse = window.studentWorkEditor.validateCourse.bind(window.studentWorkEditor);
window.studentWorkEditor.toggleHint = window.studentWorkEditor.toggleHint.bind(window.studentWorkEditor);
window.studentWorkEditor.validateAllQuestions = window.studentWorkEditor.validateAllQuestions.bind(window.studentWorkEditor);

console.log('✅ studentWorkEditor.js chargé - Architecture finale ENGINE + EDITOR ✔');