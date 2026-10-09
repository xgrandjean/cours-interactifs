

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

            if (minLength && answer.trimmed.length < minLength) {
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
            if (answer.type === 'input' && Array.isArray(correct)) {
                return this.comparerSaisie(question, correct, answer.value);
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
            userAnswer: answer.value ?? null,
            // Longueur utile de la saisie : sert aux seuils de longueur minimale, qui
            // comptent la réponse sans ses blancs de bordure, alors que userAnswer,
            // lui, reste brut (l'indentation compte comme réponse).
            trimmedLength: typeof answer.trimmed === 'string'
                ? answer.trimmed.length
                : (typeof answer.value === 'string' ? answer.value.trim().length : 0),
            typeState: status,
            ...extra
        };
    }

    /**
     * Les champs de la RÉPONSE, à l'exclusion de ceux que le mode Atelier ajoute dans la
     * question (auto-positionnement, saisie de l'AR — voir atelierQuestion.js).
     *
     * Sans ce filtre, le <select> d'auto-positionnement, lu avant la zone de texte,
     * devenait la réponse : le compte rendu était remplacé par « acquis » à la première
     * frappe suivante, et l'IA de correction de l'application recevait ce mot à noter.
     */
    static champsReponse(question, selecteur) {
        return [...question.querySelectorAll(selecteur)].filter(el => !el.closest('.atelier-bloc'));
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

        const [select] = this.champsReponse(question, 'select');
        if (select && select.value !== '') {
            return {
                hasAnswer: true,
                type: 'select',
                value: isNaN(select.value) ? select.value : +select.value
            };
        }

        const [input] = this.champsReponse(question, 'input[type="text"], input[type="number"]');
        if (input && input.value.trim()) {
            // Saisie gardée telle quelle : la casse compte (cf. comparerSaisie).
            return {
                hasAnswer: true,
                type: 'input',
                value: input.value.trim()
            };
        }

        const [textarea] = this.champsReponse(question, 'textarea');
        if (textarea && textarea.value.trim()) {
            // En NSI l'indentation FAIT PARTIE de la réponse : on enregistre la saisie
            // brute. Le trim ne sert qu'au test de vacuité ci-dessus (pour qu'une
            // réponse faite d'espaces ne compte pas) et à la longueur minimale, qui
            // ne doit pas se laisser atteindre à coups d'espaces.
            return {
                hasAnswer: true,
                type: 'textarea',
                value: textarea.value,
                trimmed: textarea.value.trim()
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
            return parsed.map(x => String(x).trim());
        } catch(e) {
            console.warn(`[QuestionEngine] data-correct-answers invalide sur question`, question);
            return [];
        }
    }

    /**
     * Réponse courte. La règle publiée (data-rule) décide de la comparaison :
     * - « nombre » : on compare des valeurs — 3, 3,0, 3.0 et 03 se valent ; « 3 octets » ou
     *   « trois » ne sont pas des nombres ;
     * - « texte » : à l'identique, casse comprise — elle fait partie de ce qui est évalué
     *   (ce qu'affiche exactement la console Python).
     * Sans data-rule, la question vient d'une publication antérieure, dont les réponses
     * attendues sont en minuscules : on garde la comparaison d'alors, insensible à la casse.
     */
    static comparerSaisie(question, attendues, saisie) {
        const regle = question.dataset.rule;
        if (regle === undefined) {
            const s = saisie.toLowerCase();
            return attendues.some(a => a.toLowerCase() === s);
        }
        if (regle === 'nombre') {
            const n = this.lireNombre(saisie);
            return !isNaN(n) && attendues.some(a => this.lireNombre(a) === n);
        }
        return attendues.includes(saisie);
    }

    /**
     * Un nombre écrit à la française ou à l'anglaise, espaces ignorés ; NaN pour tout le
     * reste. Pas Number() : il lirait « 0x10 » comme 16 et une chaîne vide comme 0.
     */
    static lireNombre(texte) {
        const t = String(texte).replace(/\s/g, '').replace(',', '.');
        return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t) ? parseFloat(t) : NaN;
    }
}

// 🎨 STUDENT WORK EDITOR - ORCHESTRATEUR DOM + UI - LIGHT, GLUE CODE SEULEMENT
class StudentWorkEditor {

    constructor(options = {}) {
        this.options = {
            onAnswerChanged: options.onAnswerChanged || (() => {}),
            onAnswerValidated: options.onAnswerValidated || (() => {}),
            onDraftChanged: options.onDraftChanged || (() => {}),
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

        // ✅ Utilise le contexte unique partagé par toute la page
        const examContext = window.currentExamContext;
        this.examMode = examContext.isExamMode; // 🔥 SOURCE UNIQUE DE VERITE
        this.blindMode = examContext.isBlindMode; // 🔥 SOURCE UNIQUE DE VERITE MODE BLIND
        this.millionnaireMode = examContext.isMillionnaireMode; // 🔥 MODE MILLIONNAIRE
        this.locked = examContext.isChapterLocked === true; // 🔒 rendu/validé/verrouillé formateur — défense en profondeur
        
        this.attachEventListeners();

        document.querySelectorAll('button[onclick*="toggleHint"]').forEach(btn => {
            const match = btn.getAttribute('onclick').match(/toggleHint\(['"]([^'"]+)['"]\)/);
            if (match) {
                btn.removeAttribute('onclick');
                btn.addEventListener('click', () => this.toggleHint(match[1]));
            }
        });
    }

    attachEventListeners() {
        document.querySelectorAll('.question-section').forEach(question => {

            QuestionEngine.champsReponse(question, 'input, select, textarea').forEach(element => {

                const eventType =
                    element.tagName === 'TEXTAREA' ? 'input' :
                    element.tagName === 'SELECT' ? 'change' :
                    'change';

                element.addEventListener(eventType, () => this.onInputChanged(question, element));
            });

            if (question.dataset.rule === 'nombre') {
                question.querySelectorAll('input[type="text"]').forEach(champ => this.filtrerNombre(champ));
            }
        });
    }

    /**
     * Réponse courte en règle « nombre » : seuls les chiffres, la virgule, le point, le
     * signe et les espaces passent, à la frappe comme au collage. Un caractère retiré fait
     * apparaître un court message sous le champ. La correction lit ensuite la valeur
     * (QuestionEngine.lireNombre) : « 3 », « 3,0 » et « 3.0 » se valent.
     */
    filtrerNombre(champ) {
        champ.addEventListener('input', () => {
            const propre = champ.value.replace(/[^0-9.,+\-\s]/g, '');
            if (propre === champ.value) return;
            const retires = champ.value.length - propre.length;
            const curseur = Math.max(0, (champ.selectionStart ?? champ.value.length) - retires);
            champ.value = propre;
            champ.setSelectionRange(curseur, curseur);
            this.signalerSaisieNombre(champ);
        });
    }

    signalerSaisieNombre(champ) {
        let aide = champ.parentElement.querySelector('.saisie-nombre-aide');
        if (!aide) {
            aide = document.createElement('small');
            aide.className = 'saisie-nombre-aide';
            aide.textContent = 'Réponse attendue : un nombre (des chiffres, avec une virgule ou un point si besoin).';
            champ.insertAdjacentElement('afterend', aide);
        }
        aide.hidden = false;
        clearTimeout(aide._minuterie);
        aide._minuterie = setTimeout(() => { aide.hidden = true; }, 3000);
    }

    onInputChanged(questionElement, inputElement) {
        if (this.locked) return;

        const questionId = questionElement.dataset.questionId;
        const now = Date.now();

        if ((this.cooldown.get(questionId) || 0) > now - 120) return;
        this.cooldown.set(questionId, now);

        const result = QuestionEngine.evaluate(questionElement);

        // 🔥 MODE BLIND = enregistrement silencieux (pas de feedback, mais persistance + progression comme en mode examen)
        if (this.blindMode) {
            this.options.onAnswerValidated({
                questionId,
                answer: result.userAnswer,
                isCorrect: null,
                points: 0,
                correctionType: questionElement.dataset.correctionType
            });
            return;
        }

        // 🔥 MODE EXAMEN = validation directe
        if (this.examMode) {
            this.options.onAnswerValidated({
                questionId,
                answer: result.userAnswer,
                isCorrect: result.isCorrect,
                points: result.points,
                correctionType: questionElement.dataset.correctionType
            });
        } else if (window.partChezUnHumain?.(questionElement)) {
            // Mode normal, réponse destinée à un humain : on l'enregistre sans
            // attendre de geste. Rien n'est engagé — aucun verdict, aucun point,
            // aucune pénalité — donc la perdre n'aurait aucune contrepartie.
            //
            // Volontairement SANS isCorrect ni points : c'est un brouillon, pas
            // un envoi. Une réponse sous le seuil de longueur minimale, que
            // QuestionEngine.evaluate classe 'wrong', ne doit surtout pas
            // arriver « fausse » chez l'évaluateur avant qu'il l'ait lue.
            this.options.onDraftChanged({
                questionId,
                answer: result.userAnswer,
                questionElement
            });
        } else {
            // Mode normal, question à vérifier : on ne touche à RIEN. Vérifier
            // est un acte voulu qui peut coûter des points.
            this.options.onAnswerChanged({
                questionId,
                result,
                questionElement,
                inputElement
            });
        }
    }

    handleAnswer(elementId, correctionType, points) {
        if (this.locked) return false;

        const question = document.querySelector(`.question-section[data-question-id="${elementId}"]`);
        const feedback = document.getElementById(`feedback_${elementId}`);
        const result = QuestionEngine.evaluate(question);

        if (!result.hasAnswer) {
            this.showFeedback(feedback, '❌ Réponse vide', 'error');
            this.displayIndividualFeedback(question, null);
            return false;
        }

        // ✅ Validation de la longueur minimale pour les zones de texte (questions ouvertes)
        const textarea = question.querySelector('textarea');
        if (textarea) {
            const minLength = parseInt(textarea.dataset.minLength, 10);
            const longueur = result.trimmedLength;
            if (!isNaN(minLength) && minLength > 0 && longueur < minLength) {
                // Dire que le texte est gardé : depuis que la saisie s'enregistre
                // seule, ce refus ne fait plus perdre ce qui est écrit, et le
                // message ne doit pas laisser croire le contraire.
                this.showFeedback(feedback, `❌ Minimum ${minLength} caractères requis (${longueur}/${minLength}) — votre texte est conservé`, 'error');
                this.displayIndividualFeedback(question, null);
                return false;
            }
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

                // 🔥 MODE MILLIONNAIRE : une erreur → proposer recommencer ou rendre
                if (this.millionnaireMode) {
                    this.showMillionnaireChoiceModal(elementId);
                    return false;
                }
            }
        }

        if (correctionType === 'semi') {
            if (result.shouldLock) {
                this.disableAutoCorrectedQuestion(question);
            }
            if (status === 'correct') {
                this.showFeedback(feedback, '✅ Correct', 'success');
            } else if (status === 'wrong') {
                this.showFeedback(feedback, '❌ Incorrect', 'error');
            } else {
                // Même libellé qu'au rechargement de la page (progressManager) : c'est
                // le même état, il ne doit pas se dire de deux façons.
                this.showFeedback(feedback, '⏳ En attente de correction', 'warning');
            }
        }

        if (correctionType === 'manuel') {
            this.showFeedback(feedback, '📮 Envoyé à votre évaluateur', 'info');
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

    disableAutoCorrectedQuestion(question) {
        question.classList.add('completed');

        question.querySelectorAll('input, select, textarea, button').forEach(element => {
            element.disabled = true;
            element.style.opacity = 0.7;
            element.style.pointerEvents = 'none';
        });

        const button = question.querySelector('.btn-check-answer');
        if (button) {
            window.memoriserLibelleBouton?.(button);
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

    // 🔥 MODE MILLIONNAIRE : modale de choix après une erreur
    showMillionnaireChoiceModal(elementId) {
        // Supprimer toute ancienne modale
        const oldModal = document.getElementById('millionnaire-choice-modal');
        if (oldModal) oldModal.remove();

        // Où en est l'apprenant : ce qu'il garde s'il rend maintenant (ce qui n'est pas
        // répondu vaut alors 0), ce qu'il peut encore espérer s'il recommence — chaque
        // tentative coûte des points (cf. Bareme, pénalité par tentative).
        const chapitre = window.ChapterSession?.progress?.chapters?.[window.ChapterSession?.chapterId];
        const questionsConfig = window.currentChapterConfig?.questions || [];
        let encadre = '';
        let cout = '';
        if (chapitre && window.ChapterBilan && window.Bareme) {
            const courante = ChapterBilan._fourchetteSur20(questionsConfig, chapitre.questions, { chapitreOuvert: false });
            const retenue = ChapterBilan._noteRetenue(chapitre, questionsConfig, courante);
            encadre = ChapterBilan.encadreTentatives(chapitre, retenue);
            cout = ChapterBilan.coutRecommencer(chapitre, retenue.plancherAcquis);
        }

        const overlay = document.createElement('div');
        overlay.id = 'millionnaire-choice-modal';
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-content" style="max-width:450px;text-align:center;">
                <div class="modal-header">
                    <h3>💰 Mode Millionnaire</h3>
                </div>
                <div class="modal-body">
                    <p style="margin-bottom:1.5rem;font-size:1.1rem;">
                        ❌ Mauvaise réponse détectée !
                    </p>
                    <p style="margin-bottom:1rem;color:#666;">
                        Recommencer remet à zéro toutes les questions auto-corrigées.<br>
                        Les questions à correction manuelle sont conservées.
                    </p>
                    ${encadre}
                    <div style="display:flex;gap:1rem;justify-content:center;margin-top:1.25rem;">
                        <button id="millionnaire-restart-btn" class="btn btn-primary" style="flex:1;"
                                title="${cout.trim().replace(/"/g, '&quot;')}">
                            🔄 Recommencer
                        </button>
                        <button id="millionnaire-submit-btn" class="btn btn-secondary" style="flex:1;">
                            📤 Rendre la copie
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById('millionnaire-restart-btn').addEventListener('click', async () => {
            overlay.remove();
            await window.ChapterSubmission._resetAutoQuestions();
            // Nouvelle tentative = nouveau tirage de l'ordre des questions, puis la
            // pagination le relit : sinon « Suivant » suivrait l'ancien ordre.
            window.ChapterOrdre?.appliquer();
            window.ChapterPagination?.init();
        });

        document.getElementById('millionnaire-submit-btn').addEventListener('click', async () => {
            overlay.remove();
            await window.ChapterSubmission.handleSubmitChapter();
            // Rendu annulé à la confirmation : on revient au choix. Sans cela la question
            // ratée restait modifiable, et l'apprenant la corrigeait sans rien payer.
            const statut = window.ChapterSession?.progress?.chapters?.[window.ChapterSession?.chapterId]?.submissionStatus;
            if (statut !== 'submitted' && statut !== 'late_submitted' && statut !== 'validated') {
                this.showMillionnaireChoiceModal(elementId);
            }
        });
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
            const ouvrir = hint.style.display === 'none';
            hint.style.display = ouvrir ? 'block' : 'none';
            // Question masquée par l'Anti-IA : son indication est hors de la page, elle se
            // montre avec l'énoncé (cf. ChapterAntiIA.afficherIndication).
            if (ouvrir) window.ChapterAntiIA?.afficherIndication?.(hint.closest('.question-section'));
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

