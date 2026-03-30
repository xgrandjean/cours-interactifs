#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

/**
 * Programme de génération automatique de chapitres à partir d'Excel
 * 
 * Ce programme lit un fichier Excel contenant des données de cours et génère
 * un fichier HTML interactif pour un chapitre de cours.
 */

class ChapterGenerator {
    constructor() {
        this.templatePath = path.join(__dirname, 'templates', 'chapter-template.html');
        this.outputDir = path.join(__dirname, 'generated');
        
        // Créer le répertoire de sortie s'il n'existe pas
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }

    /**
     * Point d'entrée principal
     */
    async run() {
        const args = process.argv.slice(2);
        
        if (args.length === 0) {
            this.showHelp();
            return;
        }

        const command = args[0];
        
        switch (command) {
            case 'generate':
                await this.generateFromExcel(args[1], args[2]);
                break;
            case 'batch':
                await this.generateFromBatchExcel(args[1] || 'cours.xlsx');
                break;
            case 'help':
            case '--help':
            case '-h':
                this.showHelp();
                break;
            default:
                console.error(`Commande inconnue: ${command}`);
                this.showHelp();
                break;
        }
    }

    /**
     * Affiche l'aide
     */
    showHelp() {
        console.log(`
Générateur de Chapitres Interactifs

USAGE:
    node generate-chapter.js generate <fichier_excel> [numero_chapitre]

ARGUMENTS:
    generate <fichier_excel> [numero_chapitre]  Génère un chapitre à partir d'un fichier Excel
    help, --help, -h                           Affiche cette aide

EXEMPLES:
    node generate-chapter.js generate chapitre1.xlsx 1
    node generate-chapter.js generate cours/exercices.xlsx

FORMAT EXCEL:
    Le fichier Excel doit contenir une feuille avec les colonnes suivantes :
    - type: Type de contenu (cours, qcm, ouverte, courte, selection)
    - contenu: Contenu au format Markdown
    - type réponse: Type de réponse (unique, multiple, etc.)
    - règle: Règle de validation
    - type correction: Type de correction (auto, semi)
    - points: Points attribués
    - choix: Options de réponse (pour QCM)
    - ordre choix: Ordre des choix
    - choix correct(s): Réponses correctes
    - indication: Indications supplémentaires
`);
    }

    /**
     * Génère un chapitre à partir d'un fichier Excel
     */
    async generateFromExcel(excelFile, chapterNumber = null) {
        try {
            console.log(`Lecture du fichier Excel: ${excelFile}`);
            
            // Vérifier que le fichier existe
            if (!fs.existsSync(excelFile)) {
                throw new Error(`Le fichier ${excelFile} n'existe pas.`);
            }

            // Lire le fichier Excel
            const workbook = XLSX.readFile(excelFile);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            
            // Convertir en JSON
            const data = XLSX.utils.sheet_to_json(worksheet);
            
            console.log(`Données lues: ${data.length} lignes`);

            // Extraire les informations du chapitre
            const chapterInfo = this.extractChapterInfo(data);
            const chapterNum = chapterNumber || chapterInfo.number || this.getNextChapterNumber();
            
            console.log(`Génération du chapitre ${chapterNum}: ${chapterInfo.title}`);

            // Générer le contenu HTML
            const htmlContent = this.generateHTML(chapterNum, chapterInfo, data);
            
            // Enregistrer le fichier
            const outputFile = path.join(this.outputDir, `chapitre${chapterNum}.html`);
            fs.writeFileSync(outputFile, htmlContent, 'utf8');
            
            console.log(`✅ Chapitre généré avec succès: ${outputFile}`);
            console.log(`   Titre: ${chapterInfo.title}`);
            console.log(`   Contenu: ${chapterInfo.contentCount} éléments`);
            
        } catch (error) {
            console.error(`❌ Erreur lors de la génération: ${error.message}`);
            process.exit(1);
        }
    }

    /**
     * Extrait les informations du chapitre à partir des données
     */
    extractChapterInfo(data) {
        const firstCourse = data.find(row => row.type === 'cours');
        
        if (!firstCourse) {
            throw new Error('Aucun contenu de type "cours" trouvé dans le fichier Excel.');
        }

        // Extraire le titre du chapitre à partir du contenu Markdown
        const titleMatch = firstCourse['contenu (format markdow Capytale)'].match(/^# (.+)$/m);
        const title = titleMatch ? titleMatch[1] : 'Chapitre sans titre';
        
        // Compter les différents types de contenu
        const contentCount = {
            cours: data.filter(row => row.type === 'cours').length,
            qcm: data.filter(row => row.type === 'qcm').length,
            ouverte: data.filter(row => row.type === 'ouverte').length,
            courte: data.filter(row => row.type === 'courte').length,
            selection: data.filter(row => row.type === 'selection').length
        };

        return {
            title: title,
            number: null, // À déterminer par l'utilisateur ou automatiquement
            contentCount: contentCount
        };
    }

    /**
     * Extrait les informations du chapitre à partir du nom de l'onglet
     * Nouvelle méthode pour la génération batch
     */
    extractChapterInfoFromSheetName(data, sheetName) {
        // Pour la génération batch, on utilise directement le nom de l'onglet comme titre
        const title = sheetName;
        
        // Compter les différents types de contenu
        const contentCount = {
            cours: data.filter(row => row.type === 'cours').length,
            qcm: data.filter(row => row.type === 'qcm').length,
            ouverte: data.filter(row => row.type === 'ouverte').length,
            courte: data.filter(row => row.type === 'courte').length,
            selection: data.filter(row => row.type === 'selection').length
        };

        return {
            title: title,
            number: null, // Le numéro est géré par l'ordre des onglets
            contentCount: contentCount
        };
    }

    /**
     * Génère le contenu HTML pour le chapitre
     */
    generateHTML(chapterNumber, chapterInfo, data) {
        const chapterTitle = chapterInfo.title;
        const chapterSubtitle = `Chapitre ${chapterNumber}`;
        
        // Générer le contenu principal
        const mainContent = this.generateMainContent(data);
        
        // Générer les questions QCM
        const qcmContent = this.generateQCMContent(data);
        
        // Générer le contenu Capytale
        const capytaleContent = this.generateCapytaleContent(data);

        return `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${chapterTitle} - Cours Interactifs</title>
    <link rel="stylesheet" href="/src/assets/css/style.css">
</head>
<body class="chapter-page">
    <header>
        <div class="container">
            <h1>${chapterTitle}</h1>
            <p class="subtitle">${chapterSubtitle}</p>
        </div>
    </header>

    <main class="container">
        <!-- Message de blocage si le chapitre précédent n'est pas validé -->
        <div id="lock-message" class="lock-message" style="display: none;">
            <h3>🔒 Accès refusé</h3>
            <p>Vous devez d'abord valider le chapitre précédent pour accéder à celui-ci.</p>
            <a href="/index.html" class="btn btn-primary">Retour au sommaire</a>
        </div>

        <!-- Contenu du cours (visible uniquement si débloqué) -->
        <div id="course-content" style="display: none;">
            ${mainContent}
            
            ${qcmContent}
            
            ${capytaleContent}
        </div>
    </main>

    <footer>
        <div class="container">
            <p>&copy; 2024 - Site pédagogique interactif</p>
            <a href="/index.html" class="btn btn-secondary">Retour au sommaire</a>
        </div>
    </footer>

    <script src="/src/js/localStorageAuth.js"></script>
    <script src="/src/js/main.js"></script>
    <script>
        // Configuration spécifique pour ce chapitre
        document.addEventListener('DOMContentLoaded', () => {
            // Vérifier si le chapitre est débloqué
            const progression = new ProgressionSystem();
            const isUnlocked = progression.isChapterUnlocked(${chapterNumber});
            
            const lockMessage = document.getElementById('lock-message');
            const courseContent = document.getElementById('course-content');
            
            if (isUnlocked) {
                lockMessage.style.display = 'none';
                courseContent.style.display = 'block';
            } else {
                lockMessage.style.display = 'block';
                courseContent.style.display = 'none';
            }
            
            // Configuration des questions pour ce chapitre
            window.qcmSystem = new QCMSystem();
            window.qcmSystem.questions = [
                ${this.generateQCMQuestions(data)}
            ];
        });
    </script>
</body>
</html>`;
    }

    /**
     * Génère le contenu principal du cours
     */
    generateMainContent(data) {
        let content = '';
        const courseData = data.filter(row => row.type === 'cours');
        
        courseData.forEach((row, index) => {
            const markdownContent = row['contenu (format markdow Capytale)'] || '';
            const htmlContent = this.markdownToHTML(markdownContent);
            
            if (index === 0) {
                // Premier bloc de cours - titre principal
                content += `
            <section class="course-content">
                ${htmlContent}
            </section>`;
            } else {
                // Blocs de cours supplémentaires
                content += `
            <section class="course-content">
                ${htmlContent}
            </section>`;
            }
        });
        
        return content;
    }

    /**
     * Génère le contenu QCM
     */
    generateQCMContent(data) {
        const qcmData = data.filter(row => row.type === 'qcm');
        
        if (qcmData.length === 0) {
            return '';
        }

        let content = `
            <section class="qcm-section">
                <h2>QCM d'Évaluation</h2>
                <p>Répondez aux questions suivantes pour tester vos connaissances. Vous devez obtenir au moins 80% de bonnes réponses pour valider ce chapitre.</p>`;

        qcmData.forEach((row, index) => {
            const questionNumber = index + 1;
            const questionText = this.markdownToHTML(row['contenu (format markdow Capytale)'] || '');
            const questionType = row['type réponse'] || 'unique';
            const options = this.parseOptions(row.choix);
            const correctAnswers = this.parseCorrectAnswers(row['choix correct(s)']);
            const explanation = row.indication || '';

            content += `
                <!-- Question ${questionNumber} -->
                <div class="qcm-question">
                    <h3>${questionNumber}. ${questionText}</h3>
                    <div class="qcm-options">`;

            options.forEach((option, optionIndex) => {
                const optionId = String.fromCharCode(97 + optionIndex); // a, b, c, d...
                const isCorrect = correctAnswers.includes(optionIndex + 1);
                const inputType = questionType === 'unique' ? 'radio' : 'checkbox';
                
                content += `
                        <label class="qcm-option">
                            <input type="${inputType}" name="q${questionNumber}" value="${optionId}">
                            ${option}
                        </label>`;
            });

            content += `
                    </div>
                    <div class="justification-section">
                        <label for="justification-${questionNumber}">Justification (obligatoire) :</label>
                        <textarea id="justification-${questionNumber}" name="justification-${questionNumber}" rows="3" placeholder="Expliquez votre choix..."></textarea>
                        <div class="justification-feedback" id="justification-feedback-${questionNumber}"></div>
                    </div>
                    <div id="feedback-${questionNumber}" class="feedback"></div>
                </div>`;
        });

        content += `
                <!-- Actions QCM -->
                <div class="qcm-actions">
                    <button id="validate-qcm" class="btn btn-primary">Valider mes réponses</button>
                    <button id="reset-qcm" class="btn btn-secondary">Recommencer</button>
                </div>

                <!-- Résultat final -->
                <div id="qcm-result"></div>
            </section>`;

        return content;
    }

    /**
     * Génère le contenu Capytale
     */
    generateCapytaleContent(data) {
        const capytaleData = data.filter(row => row.type === 'cours' && row['contenu (format markdow Capytale)'].includes('Capytale'));
        
        if (capytaleData.length === 0) {
            return `
            <!-- Exercice Capytale -->
            <section class="course-content">
                <h2>Exercice Pratique</h2>
                <p>Pour approfondir vos connaissances, rendez-vous sur Capytale pour réaliser l'exercice pratique de ce chapitre.</p>
                
                <div style="text-align: center; margin: 2rem 0;">
                    <a href="https://capytale2.ac-paris.fr/web/c/4b82-1234567890abcdef" target="_blank" class="btn btn-primary" style="font-size: 1.2rem; padding: 1rem 2rem;">
                        📚 Accéder à l'exercice Capytale
                    </a>
                    <p style="margin-top: 1rem; color: #666; font-size: 0.9rem;">
                        (Ouvre dans un nouvel onglet)
                    </p>
                </div>
            </section>`;
        }

        return '';
    }

    /**
     * Génère les questions QCM pour le JavaScript
     */
    generateQCMQuestions(data) {
        const qcmData = data.filter(row => row.type === 'qcm');
        let questions = [];

        qcmData.forEach((row, index) => {
            const questionNumber = index + 1;
            const questionText = this.escapeJSString(row['contenu (format markdow Capytale)'] || '');
            const questionType = row['type réponse'] === 'unique' ? 'single' : 'multiple';
            const options = this.parseOptions(row.choix);
            const correctAnswers = this.parseCorrectAnswers(row['choix correct(s)']);
            const explanation = this.escapeJSString(row.indication || '');
            const points = parseInt(row.points) || 1;

            let optionsArray = '';
            options.forEach((option, optionIndex) => {
                const isCorrect = correctAnswers.includes(optionIndex + 1);
                const optionId = String.fromCharCode(97 + optionIndex);
                optionsArray += `                    { id: "${optionId}", text: "${this.escapeJSString(option)}", correct: ${isCorrect} },\n`;
            });

            questions.push(`{
                id: ${questionNumber},
                question: "${questionText}",
                type: "${questionType}",
                options: [
${optionsArray}                ],
                explanation: "${explanation}",
                points: ${points},
                justificationPoints: 1
            }`);
        });

        return questions.join(',\n                ');
    }

    /**
     * Convertit le Markdown en HTML basique
     */
    markdownToHTML(markdown) {
        if (!markdown) return '';

        let html = markdown;

        // Convertir les titres
        html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
        html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

        // Convertir les listes à puces
        html = html.replace(/^\* (.+)$/gm, '<li>$1</li>');
        
        // Regrouper les éléments de liste en listes non ordonnées
        html = html.replace(/(<li>.*?<\/li>)/gs, (match) => {
            // Vérifier si ce n'est pas déjà dans une liste
            if (!match.includes('<ul>') && !match.includes('</ul>')) {
                return `<ul>${match}</ul>`;
            }
            return match;
        });

        // Convertir les gras
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

        // Convertir les italiques
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

        // Convertir les retours à la ligne en paragraphes
        html = html.replace(/\n\n/g, '</p><p>');
        html = html.replace(/\n/g, '<br>');

        // Envelopper le contenu dans des paragraphes si nécessaire
        if (!html.startsWith('<') && !html.endsWith('>')) {
            html = `<p>${html}</p>`;
        }

        // Nettoyer les balises vides
        html = html.replace(/<ul><\/ul>/g, '');
        html = html.replace(/<br><\/li>/g, '</li>');

        return html;
    }

    /**
     * Parse les options de réponse
     */
    parseOptions(optionsString) {
        if (!optionsString) return [];
        
        // Séparer par les retours à la ligne
        return optionsString.split('\n').map(option => option.trim()).filter(option => option.length > 0);
    }

    /**
     * Parse les réponses correctes
     */
    parseCorrectAnswers(correctString) {
        if (!correctString) return [];
        
        // Convertir en chaîne si ce n'est pas déjà le cas
        const str = String(correctString);
        
        // Séparer par les points-virgules ou virgules
        return str.split(/[;,]/).map(num => parseInt(num.trim())).filter(num => !isNaN(num));
    }

    /**
     * Échappe les chaînes pour JavaScript
     */
    escapeJSString(str) {
        return str.replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
    }

    /**
     * Obtient le prochain numéro de chapitre disponible
     */
    getNextChapterNumber() {
        const files = fs.readdirSync(this.outputDir);
        const chapterFiles = files.filter(file => file.match(/^chapitre(\d+)\.html$/));
        const numbers = chapterFiles.map(file => {
            const match = file.match(/^chapitre(\d+)\.html$/);
            return match ? parseInt(match[1]) : 0;
        });
        
        return numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
    }

    /**
     * Génère tous les chapitres à partir d'un fichier Excel avec plusieurs onglets
     * Nouvelle approche : ordre des onglets = numéro du chapitre, nom de l'onglet = titre
     */
    async generateFromBatchExcel(excelFile) {
        try {
            console.log(`Lecture du fichier Excel batch: ${excelFile}`);
            
            // Vérifier que le fichier existe
            if (!fs.existsSync(excelFile)) {
                throw new Error(`Le fichier ${excelFile} n'existe pas.`);
            }

            // Lire le fichier Excel
            const workbook = XLSX.readFile(excelFile);
            const sheetNames = workbook.SheetNames;
            
            console.log(`Onglets trouvés: ${sheetNames.join(', ')}`);
            
            // Nouvelle logique : tous les onglets sont des chapitres, dans l'ordre d'apparition
            const chapterSheets = sheetNames;
            
            if (chapterSheets.length === 0) {
                throw new Error('Aucun onglet trouvé dans le fichier Excel.');
            }

            console.log(`Génération de ${chapterSheets.length} chapitres...`);

            // Supprimer les anciens fichiers de chapitres
            this.cleanOldChapters();

            // Générer chaque chapitre
            for (let i = 0; i < chapterSheets.length; i++) {
                const sheetName = chapterSheets[i];
                const worksheet = workbook.Sheets[sheetName];
                const data = XLSX.utils.sheet_to_json(worksheet);
                
                // Nouvelle logique : numéro du chapitre = position dans l'ordre des onglets (+1)
                const chapterNumber = i + 1;
                
                // Nouvelle logique : titre du chapitre = nom de l'onglet
                const chapterTitle = sheetName;
                
                console.log(`Génération du chapitre ${chapterNumber} "${chapterTitle}" depuis l'onglet "${sheetName}"`);
                
                // Extraire les informations du chapitre (en utilisant le titre de l'onglet)
                const chapterInfo = this.extractChapterInfoFromSheetName(data, chapterTitle);
                
                // Générer le contenu HTML
                const htmlContent = this.generateHTML(chapterNumber, chapterInfo, data);
                
                // Enregistrer le fichier
                const outputFile = path.join(this.outputDir, `chapitre${chapterNumber}.html`);
                fs.writeFileSync(outputFile, htmlContent, 'utf8');
                
                console.log(`✅ Chapitre ${chapterNumber} "${chapterTitle}" généré: ${outputFile}`);
            }

            console.log(`\n🎉 Génération terminée ! ${chapterSheets.length} chapitres ont été générés.`);
            
        } catch (error) {
            console.error(`❌ Erreur lors de la génération batch: ${error.message}`);
            process.exit(1);
        }
    }

    /**
     * Supprime les anciens fichiers de chapitres avec confirmation utilisateur
     */
    async cleanOldChapters() {
        try {
            const files = fs.readdirSync(this.outputDir);
            const chapterFiles = files.filter(file => file.match(/^chapitre\d+\.html$/));
            
            if (chapterFiles.length === 0) {
                console.log('Aucun ancien chapitre à supprimer.');
                return;
            }

            console.log(`\n⚠️  ${chapterFiles.length} anciens chapitres vont être supprimés :`);
            chapterFiles.forEach(file => {
                console.log(`   - ${file}`);
            });

            // Demander confirmation à l'utilisateur
            const readline = require('readline');
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            const confirmed = await new Promise((resolve) => {
                rl.question('\nContinuer ? (o/n) : ', (answer) => {
                    rl.close();
                    resolve(answer.toLowerCase() === 'o' || answer.toLowerCase() === 'oui');
                });
            });

            if (!confirmed) {
                console.log('❌ Annulation de la suppression. La génération est arrêtée.');
                process.exit(0);
            }

            // Supprimer les anciens fichiers
            chapterFiles.forEach(file => {
                const filePath = path.join(this.outputDir, file);
                fs.unlinkSync(filePath);
                console.log(`🗑️  Suppression de l'ancien chapitre: ${file}`);
            });
            
            console.log(`✅ Suppression de ${chapterFiles.length} anciens fichiers de chapitres.`);
            
        } catch (error) {
            console.warn(`⚠️  Impossible de nettoyer les anciens chapitres: ${error.message}`);
        }
    }
}

// Exécuter le programme
if (require.main === module) {
    const generator = new ChapterGenerator();
    generator.run().catch(console.error);
}

module.exports = ChapterGenerator;