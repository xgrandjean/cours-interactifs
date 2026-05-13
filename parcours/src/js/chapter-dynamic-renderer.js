// src/js/chapter-dynamic-renderer.js
export class ChapterRenderer {
    render(chapitre, container) {
        container.innerHTML = '';
        
        // Rendre les questions
        for (const q of chapitre.questions) {
            const section = this.createQuestionSection(q);
            container.appendChild(section);
        }
        
        // Rendre les cours
        for (const course of chapitre.courses) {
            const courseSection = this.createCourseSection(course);
            container.appendChild(courseSection);
        }
        
        // Ajouter le bouton de validation globale
        const globalDiv = document.createElement('div');
        globalDiv.className = 'global-validation hidden';
        globalDiv.innerHTML = `
            <button class="btn btn-primary" onclick="window.validateAllQuestions()">
                ✅ Valider toutes les réponses
            </button>
            <div id="global-feedback" class="feedback"></div>
        `;
        container.appendChild(globalDiv);
        
        // Initialiser les événements
        this.initEvents();
    }
    
    createQuestionSection(q) {
        const section = document.createElement('section');
        section.className = 'question-section';
        section.dataset.questionId = q.id;
        section.dataset.correctionType = q.correctionType;
        section.dataset.points = q.points;
        
        if (q.type === 'qcm') {
            section.dataset.correctAnswers = JSON.stringify(q.correctAnswers);
        }
        
        section.innerHTML = `
            <div class="question-box">
                <div class="question-header">
                    <div class="question-title">
                        <h3>${q.title}</h3>
                    </div>
                    <div class="question-meta">
                        <span class="points-badge">⭐ ${q.points} point${q.points > 1 ? 's' : ''}</span>
                        ${q.hasHint ? `<button class="hint-badge" data-hint-btn>💡 Indication</button>` : ''}
                        <span class="correction-badge correction-${q.correctionType}">${this.getCorrectionLabel(q.correctionType)}</span>
                    </div>
                </div>
                <div class="question-text">${q.questionTextHtml || q.questionText}</div>
                ${q.hasHint ? `<div class="hint-container" style="display: none;"><div class="hint-content">${q.hintHtml || q.hint}</div></div>` : ''}
                <div class="answer-area">
                    ${this.renderAnswerArea(q)}
                </div>
                <div class="question-actions">
                    <button class="btn-check-answer">${this.getButtonLabel(q.correctionType)}</button>
                    <div class="feedback" id="feedback_${q.id}"></div>
                </div>
            </div>
        `;
        
        return section;
    }
    
    renderAnswerArea(q) {
        if (q.type === 'qcm') {
            const inputType = q.allowMultiple ? 'checkbox' : 'radio';
            return `<div class="choices">
                ${q.options.map((opt, i) => `
                    <div class="choice-option">
                        <input type="${inputType}" name="qcm_${q.id}" value="${i}" id="qcm_${q.id}_${i}">
                        <label for="qcm_${q.id}_${i}">${opt}</label>
                    </div>
                `).join('')}
            </div>`;
        }
        
        if (q.type === 'selection') {
            return `<select id="${q.id}" class="select-answer">
                <option value="">-- Choisissez une réponse --</option>
                ${q.options.map((opt, i) => `<option value="${i}">${opt}</option>`).join('')}
            </select>`;
        }
        
        if (q.type === 'courte') {
            return `<input type="text" id="short_${q.id}" placeholder="Votre réponse...">`;
        }
        
        if (q.type === 'ouverte') {
            return `<textarea id="${q.id}" placeholder="Votre réponse..." rows="4" data-min-length="${q.minLength || 0}"></textarea>
                ${q.minLength ? `<small style="color: #666;">Minimum ${q.minLength} caractères</small>` : ''}`;
        }
        
        return '';
    }
    
    getCorrectionLabel(type) {
        const labels = {
            'auto': '🔍 Auto',
            'semi': '⚡ Semi-auto',
            'manuel': '📝 Correction manuelle'
        };
        return labels[type] || '🔍 Auto';
    }
    
    getButtonLabel(type) {
        const labels = {
            'auto': '✓ Vérifier',
            'semi': '✓ Vérifier',
            'manuel': '📌 Envoyer au formateur'
        };
        return labels[type] || '✓ Vérifier';
    }
    
    initEvents() {
        // Les événements seront attachés par studentWorkEditor.js existant
        if (window.studentWorkEditor) {
            window.studentWorkEditor.init();
        }
    }
}