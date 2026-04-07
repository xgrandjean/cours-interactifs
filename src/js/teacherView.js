/**
 * teacherView.js - Gestion de la vue professeur pour les chapitres
 * Permet au professeur de visualiser le travail d'un élève en mode lecture seule
 */

// Gestion de la vue professeur au chargement de la page
document.addEventListener('DOMContentLoaded', async () => {
    const auth = new DataStorage();

    // Vérifier si c'est une vue professeur (teacher_view)
    const urlParams = new URLSearchParams(window.location.search);
    const isTeacherView = urlParams.get('teacher_view') === 'true';
    const teacherStudentId = urlParams.get('student_id');

    let student = null;

    if (isTeacherView && teacherStudentId) {
        // Mode professeur : charger les données de l'élève spécifié
        console.log('[teacherView.js] Mode professeur détecté - student_id:', teacherStudentId);
        console.log('[teacherView.js] URL actuelle:', window.location.href);
        
        // Récupérer l'élève depuis DataStorage
        const users = await auth.getUsers();
        student = users.find(u => u.id === teacherStudentId);
        
        if (!student) {
            alert('Élève introuvable');
            // Fermer le modal iframe
            if (window.parent && window.parent.dashboard) {
                window.parent.dashboard.closeStudentChapterView();
            }
            return;
        }
        
        // Mode professeur : masquer les indices (hints)
        document.querySelectorAll('.hint-container, button[onclick*="toggleHint"]').forEach(hint => {
            hint.style.display = 'none';
        });
        
        // Désactiver tous les boutons interactifs (sauf navigation)
        document.querySelectorAll('button').forEach(btn => {
            // Garder les boutons de navigation toujours actifs
            if (btn.textContent.includes('Retour au menu') || 
                (btn.onclick && btn.onclick.toString().includes('index.html'))) {
                return;
            }
            btn.disabled = true;
        });
        
        // Désactiver tous les inputs
        document.querySelectorAll('input, select, textarea').forEach(input => {
            input.disabled = true;
        });
        
        // Note: Le banner "Mode Professeur" est déjà géré par le script inline dans le template HTML
        
        console.log('[Teacher View] Mode lecture seule activé');
        
    } else {
        // Mode élève normal
        const token = sessionStorage.getItem(auth.SESSION_KEY);
        student = token ? await auth.findUserByToken(token) : null;

        if (!student) {
            window.location.href = '../html/login.html';
            return;
        }

        // Réactiver TOUS les boutons et inputs (retirer le disabled)
        document.querySelectorAll('button').forEach(btn => {
            // Garder les boutons de navigation toujours actifs (ils n'ont pas disabled)
            if (btn.textContent.includes('Retour au menu') || 
                (btn.onclick && btn.onclick.toString().includes('index.html'))) {
                return;
            }
            btn.disabled = false;
        });
        
        // Réactiver tous les inputs
        document.querySelectorAll('input, select, textarea').forEach(input => {
            input.disabled = false;
        });
        
        console.log('[Student Mode] Tous les boutons ont été activés');

        // Bouton déconnexion (seulement en mode élève)
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                sessionStorage.removeItem(auth.SESSION_KEY);
                window.location.href = '../html/login.html';
            });
        }
    }

    // Afficher les informations utilisateur (commun aux deux modes)
    const studentInfo = document.getElementById('student-info');
    if (studentInfo) {
        studentInfo.style.display = 'block';
    }
    
    const studentNameEl = document.querySelector('.student-name');
    const studentClassEl = document.querySelector('.student-class');
    
    if (studentNameEl) {
        studentNameEl.textContent = student.name;
    }
    if (studentClassEl) {
        studentClassEl.textContent = student.class || '';
    }
});