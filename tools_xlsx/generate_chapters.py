#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Générateur de chapitres HTML à partir de fichiers Excel
Convertisseur de contenu Excel vers HTML interactif
"""

import openpyxl
import os
import re
import sys
import markdown
from datetime import datetime
from pathlib import Path


class ChapterGenerator:
    def __init__(self):
        self.output_dir = "tools_xlsx/generated"
        self.template_dir = "tools_xlsx/templates"
        
        # Créer les répertoires nécessaires
        Path(self.output_dir).mkdir(parents=True, exist_ok=True)
        Path(self.template_dir).mkdir(parents=True, exist_ok=True)
        
        # Créer le template HTML de base si ce n'est pas déjà fait
        self.create_base_template()
    
    def create_base_template(self):
        """Crée le template HTML de base pour les chapitres"""
        template_content = '''<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <link rel="stylesheet" href="../assets/css/style.css">
    <script src="../js/main.js" defer></script>
    <script src="../js/localStorageAuth.js" defer></script>
</head>
<body class="chapter-page">
    <div class="container">
        <header class="chapter-header">
            <h1>{title}</h1>
            <div class="chapter-nav">
                <a href="../html/index.html" class="btn btn-secondary">← Retour au menu</a>
                {next_chapter_link}
            </div>
        </header>
        
        <main class="chapter-content">
            {content}
        </main>
        
        <footer class="chapter-footer">
            <div class="progress-actions">
                <button class="btn btn-primary" onclick="window.location.href='../html/index.html'">
                    Retour au menu
                </button>
                {next_chapter_button}
            </div>
        </footer>
    </div>
</body>
</html>'''
        
        template_path = Path(self.template_dir) / "chapter_template.html"
        if not template_path.exists():
            with open(template_path, 'w', encoding='utf-8') as f:
                f.write(template_content)
    
    def convert_markdown_to_html(self, markdown_text):
        """Convertit du markdown enrichi en HTML"""
        if not markdown_text:
            return ""
        
        try:
            # Convertir le markdown en HTML avec les extensions
            html = markdown.markdown(
                str(markdown_text),
                extensions=[
                    'extra',
                    'nl2br',
                    'sane_lists',
                    'tables',
                    'fenced_code',
                    'codehilite'
                ]
            )
            return html
        except Exception as e:
            print(f"⚠️ Erreur de conversion markdown: {e}")
            return str(markdown_text)
    
    def generate_from_excel(self, excel_file):
        """Génère tous les chapitres à partir d'un fichier Excel"""
        try:
            print(f"🔍 Lecture du fichier Excel : {excel_file}")
            
            # Vérifier si le fichier existe
            if not os.path.exists(excel_file):
                raise FileNotFoundError(f"Le fichier {excel_file} n'existe pas")
            
            # Charger le classeur Excel
            workbook = openpyxl.load_workbook(excel_file)
            print(f"✅ Classeur chargé avec {len(workbook.sheetnames)} feuilles")
            
            # Générer chaque chapitre
            generated_files = []
            for i, sheet_name in enumerate(workbook.sheetnames, 1):
                worksheet = workbook[sheet_name]
                result = self.generate_chapter(worksheet, i, sheet_name)
                if result:
                    generated_files.append(result)
            
            print(f"✅ Génération terminée : {len(generated_files)} fichiers générés")
            return {
                'success': True,
                'message': f'{len(generated_files)} chapitres générés avec succès',
                'files': generated_files
            }
            
        except Exception as e:
            print(f"❌ Erreur lors de la génération : {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def generate_chapter(self, worksheet, chapter_number, chapter_title):
        """Génère un chapitre HTML à partir d'une feuille Excel"""
        try:
            print(f"📝 Génération du chapitre {chapter_number} : {chapter_title}")
            
            # Lire les données de la feuille
            rows = list(worksheet.iter_rows(values_only=True))
            if len(rows) < 2:  # Vérifier qu'il y a au moins l'en-tête et une ligne de données
                print(f"⚠️  Feuille {chapter_title} vide, ignorée")
                return None
            
            # Extraire les en-têtes
            headers = rows[0]
            data_rows = rows[1:]
            
            # Générer le contenu HTML
            html_content = ""
            question_count = 0
            
            for row in data_rows:
                if len(row) < 2:  # S'assurer que la ligne a au moins type et contenu
                    continue
                
                content_type = row[0] if row[0] else ""
                content = row[1] if row[1] else ""
                
                if content_type.lower() == 'cours':
                    html_content += self.generate_course_content(content, chapter_number)
                elif content_type.lower() == 'qcm':
                    question_count += 1
                    html_content += self.generate_qcm_content(row, question_count)
                elif content_type.lower() == 'ouverte':
                    question_count += 1
                    html_content += self.generate_open_content(row, question_count)
                elif content_type.lower() == 'courte':
                    question_count += 1
                    html_content += self.generate_short_content(row, question_count)
                elif content_type.lower() == 'selection':
                    question_count += 1
                    html_content += self.generate_selection_content(row, question_count)
            
            # Générer les liens de navigation
            next_chapter_link = ""
            next_chapter_button = ""
            
            if chapter_number < len(worksheet.parent.sheetnames):
                next_chapter_num = chapter_number + 1
                next_chapter_name = worksheet.parent.sheetnames[chapter_number]
                next_chapter_link = f'<a href="chapitre{next_chapter_num}.html" class="btn btn-primary">Chapitre {next_chapter_num} →</a>'
                next_chapter_button = f'<button class="btn btn-primary" onclick="window.location.href=\'chapitre{next_chapter_num}.html\'">Chapitre {next_chapter_num} →</button>'
            
            # Charger le template et remplacer les variables
            template_path = Path(self.template_dir) / "chapter_template.html"
            with open(template_path, 'r', encoding='utf-8') as f:
                template = f.read()
            
            html_content = template.format(
                title=f"Chapitre {chapter_number} : {chapter_title}",
                content=html_content,
                next_chapter_link=next_chapter_link,
                next_chapter_button=next_chapter_button
            )
            
            # Sauvegarder le fichier
            output_file = Path(self.output_dir) / f"chapitre{chapter_number}.html"
            with open(output_file, 'w', encoding='utf-8') as f:
                f.write(html_content)
            
            print(f"✅ Chapitre {chapter_number} généré : {output_file}")
            return str(output_file)
            
        except Exception as e:
            print(f"❌ Erreur lors de la génération du chapitre {chapter_number} : {str(e)}")
            return None
    
    def generate_course_content(self, content, chapter_number):
        """Génère le contenu de type cours"""
        if not content:
            return ""
        
        # Convertir le markdown simplifié en HTML
        html_content = self.convert_markdown_to_html(content)
        
        return f'''
        <section class="course-content">
            <div class="content-box">
                {html_content}
            </div>
        </section>
        '''

    def generate_qcm_content(self, row, question_id):
        """Génère le contenu de type QCM"""
        if len(row) < 8:
            return ""
        
        question_text = row[1] if row[1] else ""
        hint = row[9] if len(row) > 9 and row[9] else ""  # Changé: index 9 au lieu de 8
        points = row[5] if row[5] else 1
        choices = row[6] if row[6] else ""
        correct_choices = row[7] if row[7] else ""
        
        if not question_text or not choices:
            return ""
        
        # Parser les choix
        choice_list = [choice.strip() for choice in str(choices).split('\n') if choice.strip()]
        if not choice_list:
            return ""        
        correct_indices = self.parse_correct_indices(correct_choices)
        
        # Générer les options
        choices_html = ""
        for i, choice in enumerate(choice_list):
            choices_html += f'''
                        <div class="choice-option">
                            <input type="radio" name="qcm_{question_id}" value="{i}" id="qcm_{question_id}_{i}">
                            <label for="qcm_{question_id}_{i}">{choice}</label>
                        </div>
                    '''
        
        return f'''
                <section class="question-section">
                    <div class="question-box">
                        <div class="question-header">
                            <div class="question-title">
                                <h3>Question {question_id}</h3>
                            </div>
                            <div class="question-meta">
                                <span class="points-badge">⭐ {points} point{'s' if points > 1 else ''}</span>
                                {self.generate_hint_badge(hint, question_id)}
                            </div>
                        </div>
                        <div class="question-text">{self.convert_markdown_to_html(question_text)}</div>
                        {self.generate_hint_content(hint, question_id)}
                        <div class="choices">
                            {choices_html}
                        </div>
                        <div class="question-actions">
                            <button class="btn-check-answer" onclick="checkAnswer('qcm_{question_id}', {correct_indices[0] if len(correct_indices) > 0 else 0}, {points})">
                                ✓ Vérifier la réponse
                            </button>
                            <div class="feedback" id="feedback_qcm_{question_id}"></div>
                        </div>
                    </div>
                </section>
                '''

    def generate_open_content(self, row, question_id):
        """Génère le contenu de type réponse ouverte"""
        if len(row) < 4:
            return ""
        
        question_text = row[1] if row[1] else ""
        hint = row[9] if len(row) > 9 and row[9] else ""  # Changé: index 9 au lieu de 8
        points = row[5] if row[5] else 1
        
        return f'''
                <section class="question-section">
                    <div class="question-box">
                        <div class="question-header">
                            <div class="question-title">
                                <h3>Question {question_id}</h3>
                            </div>
                            <div class="question-meta">
                                <span class="points-badge">⭐ {points} point{'s' if points > 1 else ''}</span>
                                {self.generate_hint_badge(hint, question_id)}
                            </div>
                        </div>
                        <div class="question-text">{self.convert_markdown_to_html(question_text)}</div>
                        {self.generate_hint_content(hint, question_id)}
                        <div class="answer-area">
                            <textarea id="open_{question_id}" placeholder="Votre réponse..." rows="4"></textarea>
                        </div>
                        <div class="question-actions">
                            <button class="btn-check-answer" onclick="submitOpenAnswer('open_{question_id}', {points})">
                                ✓ Soumettre la réponse
                            </button>
                            <div class="feedback" id="feedback_open_{question_id}"></div>
                        </div>
                    </div>
                </section>
                '''

    def generate_short_content(self, row, question_id):
        """Génère le contenu de type réponse courte"""
        if len(row) < 4:
            return ""
        
        question_text = row[1] if row[1] else ""
        hint = row[9] if len(row) > 9 and row[9] else ""  # Changé: index 9 au lieu de 8
        answer_type = row[2] if row[2] else "texte"
        points = row[5] if row[5] else 1
        
        input_type = "text" if answer_type.lower() == "texte" else "number"
        
        return f'''
                <section class="question-section">
                    <div class="question-box">
                        <div class="question-header">
                            <div class="question-title">
                                <h3>Question {question_id}</h3>
                            </div>
                            <div class="question-meta">
                                <span class="points-badge">⭐ {points} point{'s' if points > 1 else ''}</span>
                                {self.generate_hint_badge(hint, question_id)}
                            </div>
                        </div>
                        <div class="question-text">{self.convert_markdown_to_html(question_text)}</div>
                        {self.generate_hint_content(hint, question_id)}
                        <div class="answer-area">
                            <input type="{input_type}" id="short_{question_id}" placeholder="Votre réponse...">
                        </div>
                        <div class="question-actions">
                            <button class="btn-check-answer" onclick="submitShortAnswer('short_{question_id}', {points})">
                                ✓ Vérifier la réponse
                            </button>
                            <div class="feedback" id="feedback_short_{question_id}"></div>
                        </div>
                    </div>
                </section>
                '''

    def generate_selection_content(self, row, question_id):
        """Génère le contenu de type sélection"""
        if len(row) < 8:
            return ""
        
        question_text = row[1] if row[1] else ""
        hint = row[9] if len(row) > 9 and row[9] else ""  # Changé: index 9 au lieu de 8
        points = row[5] if row[5] else 1
        choices = row[6] if row[6] else ""
        correct_choices = row[7] if row[7] else ""
        
        if not question_text or not choices:
            return ""
        
        # Parser les choix
        choice_list = [choice.strip() for choice in str(choices).split('\n') if choice.strip()]
        if not choice_list:
            return ""
        
        correct_indices = self.parse_correct_indices(correct_choices)
        
        choices_html = ""
        for i, choice in enumerate(choice_list):
            choices_html += f'''
                        <div class="choice-option">
                            <input type="checkbox" name="selection_{question_id}" value="{i}" id="selection_{question_id}_{i}">
                            <label for="selection_{question_id}_{i}">{choice}</label>   
                        </div>
                    '''
        
        return f'''
                <section class="question-section">
                    <div class="question-box">
                        <div class="question-header">
                            <div class="question-title">
                                <h3>Question {question_id}</h3>
                            </div>
                            <div class="question-meta">
                                <span class="points-badge">⭐ {points} point{'s' if points > 1 else ''}</span>
                                {self.generate_hint_badge(hint, question_id)}
                            </div>
                        </div>
                        <div class="question-text">{self.convert_markdown_to_html(question_text)}</div>
                        {self.generate_hint_content(hint, question_id)}
                        <div class="choices">
                            {choices_html}
                        </div>
                        <div class="question-actions">
                            <button class="btn-check-answer" onclick="checkSelection('selection_{question_id}', {repr(correct_indices)}, {points})">
                                ✓ Vérifier la réponse
                            </button>
                            <div class="feedback" id="feedback_selection_{question_id}"></div>
                        </div>
                    </div>
                </section>
                '''
    def generate_hint_badge(self, hint, question_id):
        """Génère un badge pour l'indication"""
        if not hint:
            return ""
        
        return f'''
            <button class="hint-badge" onclick="toggleHint('hint_{question_id}')" type="button">
                💡 Indication
            </button>
        '''

    def generate_hint_content(self, hint, question_id):
        """Génère le contenu de l'indication (caché par défaut)"""
        if not hint:
            return ""
        
        return f'''
            <div class="hint-container" id="hint_{question_id}" style="display: none;">
                <div class="hint-content">
                    {self.convert_markdown_to_html(str(hint))}
                </div>
            </div>
        '''
    
    def parse_correct_indices(self, correct_choices):
        """Convertit une chaîne de type '1;3' en indices Python [0, 2]"""
        if not correct_choices:
            return []

        indices = []

        try:
            for value in str(correct_choices).split(';'):
                value = value.strip()

                if not value:
                    continue

                if value.isdigit():
                    index = int(value) - 1

                    if index >= 0:
                        indices.append(index)
        except Exception:
            return []

        return indices

def main():
    """Fonction principale pour l'exécution en ligne de commande"""
    if len(sys.argv) != 2:
        print("Usage: python generate_chapters.py <fichier_excel>")
        print("Exemple: python generate_chapters.py cours.xlsx")
        sys.exit(1)
    
    excel_file = sys.argv[1]
    
    if not os.path.exists(excel_file):
        print(f"❌ Erreur: Le fichier {excel_file} n'existe pas")
        sys.exit(1)
    
    print("🚀 Démarrage de la génération des chapitres...")
    print(f"📁 Répertoire de sortie: {os.path.abspath('tools_xlsx/generated')}")
    
    generator = ChapterGenerator()
    result = generator.generate_from_excel(excel_file)
    
    if result['success']:
        print(f"\n✅ Génération réussie !")
        print(f"📄 {result['message']}")
        print(f"\n📋 Fichiers générés:")
        for file_path in result['files']:
            print(f"   - {file_path}")
        print(f"\n💡 Instructions:")
        print(f"   Copiez les fichiers générés depuis tools_xlsx/generated/ vers src/chapters/")
        print(f"   Exemple: cp tools_xlsx/generated/*.html src/chapters/")
    else:
        print(f"\n❌ Erreur lors de la génération: {result['error']}")
        sys.exit(1)

if __name__ == "__main__":
    main()