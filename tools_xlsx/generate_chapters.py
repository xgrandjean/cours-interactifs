#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Générateur de chapitres JSON - Version finale
Lit un fichier Excel et génère cours.json avec le HTML pré-généré des questions

Usage:
    py generate_chapters.py maths.xlsx --parcours math-2de
"""

import openpyxl
import os
import sys
import re
import markdown
import hashlib
import json
import shutil
from datetime import UTC, datetime
from pathlib import Path

class ChapterGenerator:
    def __init__(self, parcours_slug=None):
        self.parcours_slug = parcours_slug
        self.cours_json_path = Path("parcours/cours.json")
        self.template_source = Path("tools_xlsx/templates/chapter_template.html")
        self.template_dest = Path("parcours/src/chapter_template.html")

    # =========================================================================
    # MÉTHODES DE CONVERSION HTML
    # =========================================================================

    def convert_markdown_to_html(self, markdown_text):
        if not markdown_text:
            return ""
        try:
            return markdown.markdown(str(markdown_text), extensions=['extra', 'nl2br'])
        except:
            return str(markdown_text)

    def _get_correction_label(self, correction_type):
        labels = {'auto': '🔍 Auto', 'semi': '⚡ Semi-auto', 'manuel': '📝 Correction manuelle'}
        return labels.get(correction_type, '🔍 Auto')

    def _get_button_label(self, correction_type):
        labels = {'auto': '✓ Vérifier', 'semi': '✓ Vérifier', 'manuel': '📌 Envoyer au formateur'}
        return labels.get(correction_type, '✓ Vérifier')

    def _get_hint_badge(self, has_hint, question_id):
        if not has_hint:
            return ""
        return f'<button class="hint-badge" data-hint-btn onclick="window.studentWorkEditor.toggleHint(\'hint_{question_id}\')" type="button">💡 Indication</button>'

    def _get_hint_content(self, hint_html, question_id):
        if not hint_html:
            return ""
        return f'<div class="hint-container" id="hint_{question_id}" style="display: none;"><div class="hint-content">{hint_html}</div></div>'

    def _render_answer_area(self, q, question_id):
        q_type = q.get("type", "")
        
        if q_type == "qcm":
            options = q.get("options", [])
            allow_multiple = q.get("allowMultiple", False)
            input_type = "checkbox" if allow_multiple else "radio"
            
            choices_html = ""
            for i, opt in enumerate(options):
                choices_html += f'''
                    <div class="choice-option">
                        <input type="{input_type}" name="qcm_{question_id}" value="{i}" id="qcm_{question_id}_{i}">
                        <label for="qcm_{question_id}_{i}">{opt}</label>
                    </div>
                '''
            return f'<div class="choices">{choices_html}</div>'
        
        elif q_type == "selection":
            options = q.get("options", [])
            options_html = '<option value="">-- Choisissez une réponse --</option>'
            for i, opt in enumerate(options):
                options_html += f'<option value="{i}">{opt}</option>'
            return f'<select id="{question_id}" class="select-answer">{options_html}</select>'
        
        elif q_type == "courte":
            return f'<input type="text" id="short_{question_id}" placeholder="Votre réponse...">'
        
        elif q_type == "ouverte":
            min_length = q.get("minLength", 0)
            min_length_html = f'<small style="color: #666; display: block; margin-top: 0.25rem;">Minimum {min_length} caractères</small>' if min_length > 0 else ''
            return f'''
                <textarea id="{question_id}" placeholder="Votre réponse..." rows="4" data-min-length="{min_length}"></textarea>
                {min_length_html}
            '''
        
        return ""

    def _generate_question_html(self, q, chapter_number):
        """Génère le HTML complet d'une question"""
        question_id = q.get("id", f"ch{chapter_number}_q{q.get('index', 1)}")
        q_type = q.get("type", "")
        correction_type = q.get("correctionType", "auto")
        points = q.get("points", 1)
        question_text_html = q.get("questionTextHtml", q.get("questionText", ""))
        hint_html = q.get("hintHtml", "")
        has_hint = bool(hint_html)
        
        html = f'''
<section class="question-section" data-question-id="{question_id}" 
        data-correction-type="{correction_type}" 
        data-points="{points}">
    <div class="question-box">
        <div class="question-header">
            <div class="question-title">
                <h3>{q.get("title", f"Question {q.get('index', 1)}")}</h3>
            </div>
            <div class="question-meta">
                <span class="points-badge">⭐ {points} point{"s" if points > 1 else ""}</span>
                {self._get_hint_badge(has_hint, question_id)}
                <span class="correction-badge correction-{correction_type}">{self._get_correction_label(correction_type)}</span>
            </div>
        </div>
        <div class="question-text">{question_text_html}</div>
        {self._get_hint_content(hint_html, question_id)}
        <div class="answer-area">
            {self._render_answer_area(q, question_id)}
        </div>
        <div class="question-actions">
            <button class="btn-check-answer" onclick="window.studentWorkEditor.handleAnswer('{question_id}', '{correction_type}', {points})">
                {self._get_button_label(correction_type)}
            </button>
            <div class="feedback" id="feedback_{question_id}"></div>
        </div>
    </div>
</section>
'''
        return html

    def _generate_course_html(self, course):
        """Génère le HTML d'un cours"""
        content = course.get("content", "")
        requires_validation = course.get("requiresValidation", True)
        
        if requires_validation:
            return f'''
<section class="course-content">
    <div class="content-box">
        {content}
        <div class="course-validation" style="margin-top: 1rem; text-align: right;">
            <button class="btn btn-secondary" onclick="window.studentWorkEditor.validateCourse(this)">
                ✅ J'ai lu et compris
            </button>
        </div>
    </div>
</section>
'''
        else:
            return f'''
<section class="course-content">
    <div class="content-box">
        {content}
    </div>
</section>
'''

    # =========================================================================
    # MÉTHODES D'EXTRACTION EXCEL
    # =========================================================================

    def get_column_indices(self, headers):
        col_index = {}
        for idx, header in enumerate(headers):
            if header:
                header_str = str(header).strip().lower()
                for a, b in [('é','e'),('è','e'),('ê','e'),('à','a'),('â','a'),
                             ('î','i'),('ï','i'),('ô','o'),('ö','o'),('û','u'),
                             ('ü','u'),('ç','c'),(' ',''),('_',''),('(',''),(')','')]:
                    header_str = header_str.replace(a, b)
                col_index[header_str] = idx
        return col_index

    def generate_slug(self, title):
        if not title:
            return ""
        clean_title = re.sub(r'^Chapitre\s*\d+\s*:\s*', '', title, flags=re.IGNORECASE).strip()
        slug = clean_title.lower()
        accents = {'é':'e','è':'e','ê':'e','ë':'e','à':'a','â':'a','ä':'a',
                   'î':'i','ï':'i','ô':'o','ö':'o','û':'u','ü':'u','ù':'u',
                   'ç':'c','œ':'oe','æ':'ae'}
        for acc, rep in accents.items():
            slug = slug.replace(acc, rep)
        slug = re.sub(r'[^a-z0-9]+', '-', slug)
        slug = re.sub(r'-+', '-', slug).strip('-')
        return slug

    def _get_col(self, row, col_index, *keys, default=""):
        for key in keys:
            idx = col_index.get(key)
            if idx is not None and idx < len(row) and row[idx] is not None:
                val = str(row[idx]).strip()
                if val:
                    return val
        return default

    def _resolve_correct_indices(self, correct_values_str, choice_list):
        if not correct_values_str or not choice_list:
            return []
        indices = []
        for val in str(correct_values_str).split('\n'):
            val = val.strip()
            if val and val in choice_list:
                indices.append(choice_list.index(val))
        return indices

    def _extract_question(self, row, col_index, chapter_number, question_index):
        question_text = self._get_col(row, col_index, 'contenu', 'enonce', default="")
        hint = self._get_col(row, col_index, 'indication', 'indiceaide', default="")
        points_str = self._get_col(row, col_index, 'points', default="1")
        try:
            points = int(float(points_str))
        except:
            points = 1
            
        correction_type = self._get_col(row, col_index, 'correction', default="auto")
        regle = self._get_col(row, col_index, 'regle', default="")
        
        question_id = f"ch{chapter_number}_q{question_index}"
        
        hash_content = f"{question_text}{question_id}{points}"
        question_hash = hashlib.md5(hash_content.encode()).hexdigest()[:10]
        
        base_data = {
            "id": question_id,
            "index": question_index,
            "type": self._get_col(row, col_index, 'type', default="").lower(),
            "title": f"Question {question_index}",
            "questionText": question_text,
            "questionTextHtml": self.convert_markdown_to_html(question_text),
            "points": points,
            "correctionType": correction_type,
            "rule": regle if regle else None,
            "hasHint": bool(hint),
            "hint": hint,
            "hintHtml": self.convert_markdown_to_html(hint) if hint else None,
            "questionHash": question_hash
        }
        
        question_type = base_data["type"]
        
        if question_type == 'qcm':
            choices = self._get_col(row, col_index, 'choix', 'propositionsdereponse', default="")
            choice_list = [c.strip() for c in str(choices).split('\n') if c.strip()]
            correct_answers_text = self._get_col(row, col_index, 'choix_corrects', 'bonnesreponses', default="")
            correct_indices = self._resolve_correct_indices(correct_answers_text, choice_list)
            
            base_data.update({
                "choiceCount": len(choice_list),
                "allowMultiple": 'multiple' in str(regle).lower(),
                "options": choice_list,
                "correctAnswers": correct_indices
            })
            
        elif question_type == 'selection':
            choices = self._get_col(row, col_index, 'choix', 'propositionsdereponse', default="")
            choice_list = [c.strip() for c in str(choices).split('\n') if c.strip()]
            correct_answers_text = self._get_col(row, col_index, 'choix_corrects', 'bonnesreponses', default="")
            correct_indices = self._resolve_correct_indices(correct_answers_text, choice_list)
            
            base_data.update({
                "choiceCount": len(choice_list),
                "options": choice_list,
                "correctAnswers": correct_indices
            })
            
        elif question_type == 'courte':
            correct_answers_text = self._get_col(row, col_index, 'choix_corrects', 'bonnesreponses', default="")
            correct_list = [a.strip().lower() for a in str(correct_answers_text).split('\n') if a.strip()]
            base_data["correctAnswers"] = correct_list
            
        elif question_type == 'ouverte':
            min_length = 0
            if 'texte(' in str(regle):
                try:
                    min_length = int(str(regle).split('(')[1].split(')')[0])
                except:
                    pass
            base_data["minLength"] = min_length
        
        # Générer le HTML de la question
        base_data["html"] = self._generate_question_html(base_data, chapter_number)
        
        return base_data

    def _extract_chapter(self, worksheet, chapter_number, chapter_title):
        rows = list(worksheet.iter_rows(values_only=True))
        if len(rows) < 2:
            return None
        
        headers = rows[0]
        col_index = self.get_column_indices(headers)
        data_rows = rows[1:]
        
        questions_list = []
        course_count = 0
        course_validation_count = 0
        max_points = 0
        courses_list = []
        types_count = {"cours": 0, "qcm": 0, "ouverte": 0, "courte": 0, "selection": 0}
        
        for row in data_rows:
            content_type = self._get_col(row, col_index, 'type', default="")
            content = self._get_col(row, col_index, 'contenu', 'enonce', default="")
            
            if not content_type or not content:
                continue
            
            if content_type.lower() == 'cours':
                types_count["cours"] += 1
                course_count += 1
                regle = self._get_col(row, col_index, 'regle', default="")
                requires_validation = 'validation' in str(regle).lower()
                if requires_validation:
                    course_validation_count += 1
                
                course_html = self.convert_markdown_to_html(content)
                courses_list.append({
                    "index": course_count - 1,
                    "requiresValidation": requires_validation,
                    "content": course_html,
                    "html": self._generate_course_html({"content": course_html, "requiresValidation": requires_validation})
                })
                
            elif content_type.lower() in ['qcm', 'ouverte', 'courte', 'selection']:
                q_type = content_type.lower()
                types_count[q_type] = types_count.get(q_type, 0) + 1
                q_data = self._extract_question(row, col_index, chapter_number, len(questions_list) + 1)
                if q_data:
                    questions_list.append(q_data)
                    max_points += q_data.get("points", 0)
        
        clean_title = re.sub(r'^Chapitre\s*\d+\s*:\s*', '', chapter_title, flags=re.IGNORECASE).strip()
        slug = self.generate_slug(clean_title)
        
        chapter_hash_content = f"{clean_title}{json.dumps(questions_list, sort_keys=True)}"
        chapter_hash = hashlib.md5(chapter_hash_content.encode()).hexdigest()[:10]
        
        return {
            "id": chapter_number,
            "slug": slug,
            "title": clean_title,
            "sheetName": chapter_title,
            "chapterHash": chapter_hash,
            "questionCount": len(questions_list),
            "courseCount": course_count,
            "courseValidationCount": course_validation_count,
            "courses": courses_list,
            "maxPoints": max_points,
            "questions": questions_list
        }

    # =========================================================================
    # GESTION DE COURS.JSON
    # =========================================================================

    def _load_cours_json(self):
        if self.cours_json_path.exists():
            with open(self.cours_json_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        return {"version": None, "parcours": []}

    def _save_cours_json(self, data):
        self.cours_json_path.parent.mkdir(parents=True, exist_ok=True)
        data["version"] = datetime.now(UTC).isoformat()
        with open(self.cours_json_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"✅ cours.json sauvegardé")

    def _copy_template(self):
        self.template_dest.parent.mkdir(parents=True, exist_ok=True)
        if self.template_source.exists():
            shutil.copy2(self.template_source, self.template_dest)
            print(f"✅ Template copié : {self.template_dest}")
        else:
            print(f"⚠️ Template source introuvable : {self.template_source}")

    # =========================================================================
    # GÉNÉRATION PRINCIPALE
    # =========================================================================

    def generate_from_excel(self, excel_file):
        try:
            print(f"🔍 Lecture du fichier Excel : {excel_file}")
            workbook = openpyxl.load_workbook(excel_file)
            
            # Extraire les chapitres
            chapters_list = []
            for i, sheet_name in enumerate(workbook.sheetnames, 1):
                worksheet = workbook[sheet_name]
                chapter_data = self._extract_chapter(worksheet, i, sheet_name)
                if chapter_data:
                    chapters_list.append(chapter_data)
                    print(f"✅ Chapitre {i} extrait : {chapter_data['title']}")
            
            # Calculer les totaux
            total_questions = sum(c.get("questionCount", 0) for c in chapters_list)
            total_course_validations = sum(c.get("courseValidationCount", 0) for c in chapters_list)
            total_max_points = sum(c.get("maxPoints", 0) for c in chapters_list)
            
            # Nouveau parcours
            new_parcours = {
                "slug": self.parcours_slug,
                "label": Path(excel_file).stem,
                "generated_at": datetime.now(UTC).isoformat(),
                "totalChapitres": len(chapters_list),
                "totalQuestions": total_questions,
                "totalCourseValidations": total_course_validations,
                "totalMaxPoints": total_max_points,
                "chapitres": chapters_list
            }
            
            # Mettre à jour cours.json
            cours_data = self._load_cours_json()
            cours_data["parcours"] = [p for p in cours_data["parcours"] if p.get("slug") != self.parcours_slug]
            cours_data["parcours"].append(new_parcours)
            cours_data["parcours"].sort(key=lambda p: p.get("slug", ""))
            self._save_cours_json(cours_data)
            
            # Copier le template
            self._copy_template()
            
            return {"success": True, "chapters": len(chapters_list), "parcours_slug": self.parcours_slug}
            
        except Exception as e:
            print(f"❌ Erreur: {e}")
            import traceback
            traceback.print_exc()
            return {"success": False, "error": str(e)}


def main():
    import argparse
    parser = argparse.ArgumentParser(description='Générateur de chapitres JSON')
    parser.add_argument('excel_file', help='Fichier Excel source')
    parser.add_argument('--parcours', '-p', required=True, help='Slug du parcours (ex: math-2de)')
    args = parser.parse_args()
    
    if not os.path.exists(args.excel_file):
        print(f"❌ Erreur: Le fichier {args.excel_file} n'existe pas")
        sys.exit(1)
    
    generator = ChapterGenerator(parcours_slug=args.parcours)
    result = generator.generate_from_excel(args.excel_file)
    
    if result['success']:
        print(f"\n✅ Génération réussie !")
        print(f"   - Parcours: {result['parcours_slug']}")
        print(f"   - Chapitres: {result['chapters']}")
        print(f"   - Fichier: parcours/cours.json")
        print(f"   - Template: parcours/src/chapter_template.html")
    else:
        print(f"\n❌ Erreur: {result['error']}")
        sys.exit(1)


if __name__ == "__main__":
    main()