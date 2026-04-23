// ============================================================================
// STUDENT WORK EDITOR - FINAL FIXED VERSION
// ============================================================================

class StudentWorkEditor {

    constructor(options = {}) {
        this.options = {
            onAnswerChanged: options.onAnswerChanged || (() => {}),
            onAnswerValidated: options.onAnswerValidated || (() => {}),
            allowMultipleAttempts: options.allowMultipleAttempts !== false,
            ...options
        };

        this.initialized = false;
    }

    /**
     * Initialiser l'éditeur sur la page courante
     */
    init() {
        if (this.initialized) return;

        this.attachEventListeners();
        this.initialized = true;

        console.log('✅ StudentWorkEditor initialisé');
    }

    /**
     * Attacher tous les listeners aux questions
     */
    attachEventListeners() {
        // Attacher les listeners sur tous les types de questions
        document.querySelectorAll('.question-section').forEach(question => {
            const correctionType = question.dataset.correctionType;
            const questionId = question.dataset.questionId;

            // QCM Radio
            question.querySelectorAll('input[type="radio"]').forEach(input => {
                input.addEventListener('change', () => this.onInputChanged(question, input));
            });

            // QCM Checkbox
            question.querySelectorAll('input[type="checkbox"]').forEach(input => {
                input.addEventListener('change', () => this.onInputChanged(question, input));
            });

            // Select
            question.querySelectorAll('select').forEach(select => {
                select.addEventListener('change', () => this.onInputChanged(question, select));
            });

            // Input texte / nombre
            question.querySelectorAll('input[type="text"], input[type="number"]').forEach(input => {
                input.addEventListener('input', () => this.onInputChanged(question, input));
                input.addEventListener('blur', () => this.onInputChanged(question, input));
            });

            // Textarea (questions ouvertes)
            question.querySelectorAll('textarea').forEach(textarea => {
                textarea.addEventListener('input', () => this.onInputChanged(question, textarea));
            });
        });
    }

    /**
     * Appelé quand un champ est modifié
     */
    onInputChanged(questionElement, inputElement) {
        const questionId = questionElement.dataset.questionId;
        const result = this.checkQuestion(questionElement);

        this.options.onAnswerChanged({
            questionId,
            result,
            questionElement,
            inputElement
        });
    }

    /**
     * Gérer la validation d'une réponse (bouton vérifier)
     */
    handleAnswer(elementId, correctionType, correctAnswer, points, answerType, correctAnswersStr = '') {
        const feedback = document.getElementById(`feedback_${elementId}`);
        const question = document.querySelector(`.question-section[data-question-id="${elementId}"]`);

        // ✅ SOURCE UNIQUE DE VÉRITÉ
        const result = this.checkQuestion(question);

        // ✅ Gestion réponse vide
        if (!result.hasAnswer) {
            this.handleEmptyAnswer(feedback, question);
            return false;
        }

        const userAnswer = result.userAnswer;
        let isCorrect;

        switch(correctionType) {
            case 'auto':
                isCorrect = this.handleAutoCorrection(feedback, userAnswer, correctAnswer, points, answerType, elementId);
                break;
            case 'semi':
                isCorrect = this.handleSemiCorrection(feedback, userAnswer, correctAnswer, points, answerType, correctAnswersStr, elementId);
                break;
            case 'manuel':
                isCorrect = this.handleManualCorrection(feedback, userAnswer, elementId, points);
                break;
            case 'obligatoire':
                isCorrect = this.handleRequiredCorrection(feedback, userAnswer, points);
                break;
            default:
                isCorrect = this.handleAutoCorrection(feedback, userAnswer, correctAnswer, points, answerType, elementId);
        }


        this.options.onAnswerValidated({
            questionId: elementId,
            answer: userAnswer,
            isCorrect,
            points,
            correctionType
        });

        return isCorrect;
    }

    /**
     * Gestion des questions ouvertes
     */
    handleOpenAnswer(elementId, correctionType, points, minLength) {
        const textarea = document.getElementById(elementId);
        const feedback = document.getElementById(`feedback_${elementId}`);
        const question = document.querySelector(`.question-section[data-question-id="${elementId}"]`);
        const answer = textarea.value.trim();

        // ✅ Gestion réponse vide - court-circuit avant toute logique
        if (!answer) {
            this.handleEmptyAnswer(feedback, question);
            return false;
        }

        let message = '';
        let etat = null;
        let score = 0;
        let needsReview = true;

        if (minLength > 0 && answer.length < minLength) {
            message = `❌ Réponse (${answer.length}/${minLength} caractères). Trop courte.`;
            etat = false;
            score = 0;
            needsReview = false;
        } else {
            message = `⏳ Réponse enregistrée (${answer.length} caractères). En attente de correction.`;
            etat = null;
            score = null;
            needsReview = true;
        }

        this.showFeedback(feedback, message, etat === false ? 'error' : 'info');

        this.options.onAnswerValidated({
            questionId: elementId,
            answer,
            isCorrect: etat,
            points: score,
            correctionType,
            needsReview
        });

        return true;
    }

    // ========================================================================
    // MÉTHODES INTERNES
    // ========================================================================


    /**
     * Gestion centralisée des réponses vides
     */
    handleEmptyAnswer(feedback, question) {
        this.showFeedback(feedback, '❌ Réponse vide.', 'error');
        this.displayIndividualFeedback(question, null, false);
    }

    handleAutoCorrection(feedback, userAnswer, correctAnswer, points, answerType, elementId) {
        const question = document.querySelector(`.question-section[data-question-id="${elementId}"]`);
        
        const result = this.checkQuestion(question);

        if (result.isCorrect) {
            this.showFeedback(feedback, `✅ Correct !`, 'success');
            this.disableAutoCorrectedQuestion(question);
        } else {
            this.showFeedback(feedback, '❌ Incorrect. Essayez encore !', 'error');
        }
        
        this.displayIndividualFeedback(question, result.isCorrect, true);

        return result.isCorrect;
    }

    handleSemiCorrection(feedback, userAnswer, correctAnswer, points, answerType, correctAnswersStr, elementId) {
        let isCorrect = null;
        let feedbackMessage = '';
        const question = document.querySelector(`.question-section[data-question-id="${elementId}"]`);

        let possibleAnswers = [];
        if (correctAnswersStr) {
            possibleAnswers = correctAnswersStr.split(';').map(s => s.trim().toLowerCase());
        }
        
        if (answerType === 'short') {
            if (possibleAnswers.length > 0 && possibleAnswers.includes(userAnswer)) {
                isCorrect = true;
                feedbackMessage = `✅ Bonne réponse !`;
                this.disableAutoCorrectedQuestion(question);
            } else {
                feedbackMessage = `⏳ Réponse enregistrée. En attente de correction.`;
                isCorrect = null;
            }
        } else {
            feedbackMessage = `⏳ Réponse enregistrée. En attente de correction.`;
            isCorrect = null;
        }
        
        this.showFeedback(feedback, feedbackMessage, isCorrect === null ? 'warning' : 'success');

        return isCorrect;
    }

    handleManualCorrection(feedback, userAnswer, elementId, points) {
        this.showFeedback(feedback, `📝 Réponse enregistrée. +${points} point(s) après validation du formateur.`, 'info');
        return true;
    }

    handleRequiredCorrection(feedback, userAnswer, points) {
        this.showFeedback(feedback, `✅ Réponse enregistrée. +${points} point(s) pour participation.`, 'success');
        return true;
    }

    checkQuestion(question) {
        const correctionType = question.dataset.correctionType;
        const points = parseInt(question.dataset.points);
        
        let userAnswer = null;
        let hasAnswer = false;
        let isCorrect = false;
        
        // -----------------------------
        // DETECTION REPONSE (FIXED)
        // -----------------------------

        const qcmRadio = question.querySelector('input[type="radio"]:checked');
        const qcmCheckbox = Array.from(question.querySelectorAll('input[type="checkbox"]:checked'));
        const shortInput = question.querySelector('input[type="text"], input[type="number"]');
        const openTextarea = question.querySelector('textarea');
        const select = question.querySelector('select');

        // RESET SAFE
        userAnswer = null;
        hasAnswer = false;

        // RADIO
        if (qcmRadio) {
            hasAnswer = true;
            userAnswer = parseInt(qcmRadio.value);
        }

        // CHECKBOX
        else if (qcmCheckbox.length > 0) {
            hasAnswer = true;
            userAnswer = qcmCheckbox.map(cb => parseInt(cb.value)).sort();
        }

        // SELECT (IMPORTANT FIX 0)
        else if (select && select.value !== '') {
            hasAnswer = true;
            userAnswer = isNaN(select.value) ? select.value : parseInt(select.value);
        }

        // TEXT / NUMBER
        else if (shortInput && shortInput.value.trim() !== '') {
            hasAnswer = true;
            userAnswer = shortInput.value.trim().toLowerCase();
        }

        // TEXTAREA (IMPORTANT FIX OPEN)
        else if (openTextarea && openTextarea.value.trim() !== '') {
            hasAnswer = true;
            userAnswer = openTextarea.value.trim();
        }

        // FINAL SAFETY
        if (!hasAnswer) {
            return { hasAnswer: false, isCorrect: null, points: 0, userAnswer: null };
        }
        
        if (correctionType === 'auto') {
            if (qcmRadio) {
                const button = question.querySelector('.btn-check-answer');
                const onclickAttr = button.getAttribute('onclick');
                const match = onclickAttr.match(/,\s*(\d+),/);
                if (match) {
                    const correctAnswer = parseInt(match[1]);
                    isCorrect = userAnswer === correctAnswer;
                }
            }
            else if (qcmCheckbox.length > 0) {
                const button = question.querySelector('.btn-check-answer');
                const onclickAttr = button.getAttribute('onclick');
                const match = onclickAttr.match(/\[(.*?)\]/);
                if (match) {
                    const correctIndices = JSON.parse('[' + match[1] + ']');
                    isCorrect = userAnswer.length === correctIndices.length &&
                               userAnswer.every((v, i) => v === correctIndices[i]);
                }
            }
            else if (shortInput) {
                let correctAnswers = [];
                const button = question.querySelector('.btn-check-answer');
                const onclickAttr = button.getAttribute('onclick');
                const match = onclickAttr.match(/, '([^']*)'\)$/);
                if (match && match[1]) {
                    correctAnswers = match[1].split(';').map(s => s.trim().toLowerCase());
                }
                isCorrect = correctAnswers.includes(userAnswer);
            }
            else if (select) {
                const button = question.querySelector('.btn-check-answer');
                const onclickAttr = button.getAttribute('onclick');
                const match = onclickAttr.match(/,\s*(\d+),/);

                if (match) {
                    const correctIndex = parseInt(match[1]);
                    isCorrect = userAnswer === correctIndex;
                }
            }
        }
        else if (correctionType === 'semi') {

            if (openTextarea) {

                const minLength = parseInt(question.dataset.minLength || "0");

                if (!userAnswer || userAnswer.length === 0) {
                    return { hasAnswer: false, isCorrect: null, points: 0, userAnswer: null };
                }

                if (minLength > 0 && userAnswer.length < minLength) {
                    isCorrect = false; // auto fail
                } else {
                    isCorrect = null; // review prof
                }
            }
            else if (shortInput) {
                // ✅ SEMI-AUTO COURTE: vérifier dans la liste des réponses valides
                let correctAnswers = [];
                const button = question.querySelector('.btn-check-answer');
                const onclickAttr = button.getAttribute('onclick');
                const match = onclickAttr.match(/, '([^']*)'\)$/);
                if (match && match[1]) {
                    correctAnswers = match[1].split(';').map(s => s.trim().toLowerCase());
                }
                isCorrect = correctAnswers.includes(userAnswer) ? true : null;
            }
            else {
                isCorrect = null;
            }
        }
        // ✅ FALLBACK SAFE POUR TEXTAREA EN MODE AUTO
        else if (correctionType === 'auto' && openTextarea) {

            const minLength = parseInt(question.dataset.minLength || "0");

            if (!userAnswer || userAnswer.length === 0) {
                return { hasAnswer: false, isCorrect: null, points: 0, userAnswer: null };
            }

            isCorrect = minLength > 0 && userAnswer.length < minLength ? false : true;
        }
        else if (correctionType === 'manuel') {
            // ✅ MANUEL: TOUJOURS null (jamais true, jamais false)
            isCorrect = null;
        }
        
        return { hasAnswer: true, isCorrect: isCorrect, points: points, userAnswer: userAnswer };
    }

    disableAutoCorrectedQuestion(question) {
        const button = question.querySelector('.btn-check-answer');
        if (button) {
            button.disabled = true;
            button.textContent = '✓ Validé';
            button.style.backgroundColor = '#27ae60';
            button.style.pointerEvents = 'none';
        }
        
        const inputs = question.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            input.disabled = true;
            input.style.pointerEvents = 'none';
            input.style.opacity = '0.7';
        });
        
        question.classList.add('completed');
        question.style.opacity = '0.8';
    }

    displayIndividualFeedback(question, isCorrect, hasAnswer) {
        let feedbackDiv = question.querySelector('.question-feedback');
        if (!feedbackDiv) {
            feedbackDiv = document.createElement('div');
            feedbackDiv.className = 'question-feedback';
            question.querySelector('.question-box').appendChild(feedbackDiv);
        }
        
        if (!hasAnswer) {
            feedbackDiv.textContent = '?';
            feedbackDiv.className = 'question-feedback unanswered';
        } 
        else if (isCorrect === null) {
            feedbackDiv.textContent = '⏳';
            feedbackDiv.className = 'question-feedback pending';
        } 
        else if (isCorrect) {
            feedbackDiv.textContent = '✓';
            feedbackDiv.className = 'question-feedback correct';
        } else {
            feedbackDiv.textContent = '✗';
            feedbackDiv.className = 'question-feedback incorrect';
        }
        
        feedbackDiv.style.cssText = 'position: absolute; right: 1rem; top: 1rem; font-size: 1.2rem; font-weight: bold;';
    }

    showFeedback(feedbackElement, message, type) {
        if (!feedbackElement) return;

        feedbackElement.innerHTML = message;
        feedbackElement.className = `feedback show ${type}`;
        feedbackElement.style.display = 'block';

        setTimeout(() => {
            feedbackElement.className = 'feedback';
        }, 4000);
    }

    /**
     * Restaurer l'état d'une question depuis les données sauvegardées
     */
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

    /**
     * Verrouiller toutes les questions (après rendu)
     */
    lockAllQuestions() {
        document.querySelectorAll('.question-section').forEach(question => {
            question.querySelectorAll('input, select, textarea, button').forEach(el => {
                el.disabled = true;
                el.style.pointerEvents = 'none';
                el.style.opacity = '0.7';
            });
            question.classList.add('locked');
        });
    }

    /**
     * Détruire l'éditeur et nettoyer tous les listeners
     */
    destroy() {
        this.initialized = false;
    }
}

// Export global
window.StudentWorkEditor = StudentWorkEditor;

// Instance globale par défaut
window.studentWorkEditor = new StudentWorkEditor();

console.log('✅ studentWorkEditor.js chargé - Composant de saisie réponses prêt');
