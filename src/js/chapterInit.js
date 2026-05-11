// ============================================================================
// CHAPTER INIT - Initialisation des pages de chapitre
// ============================================================================
// Extrait du script inline du template chapitre.
// Gère : authentification, mode formateur, protection copier-coller.
// Chargé via <script src="../js/chapterInit.js" defer> dans le template.
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    const auth = new DataStorage();

    // Vérifier si c'est une vue formateur (teacher_view)
    const urlParams = new URLSearchParams(window.location.search);
    const isTeacherView = urlParams.get('teacher_view') === 'true';
    const teacherStudentId = urlParams.get('student_id');

    let student = null;

    if (isTeacherView && teacherStudentId) {
        student = await _initTeacherView(auth, teacherStudentId);
        if (!student) return; // _initTeacherView gère l'alerte et la redirection
    } else {
        student = await _initStudentView(auth);
        if (!student) return; // _initStudentView gère la redirection vers login
    }

    // Afficher les informations utilisateur
    document.getElementById('student-info').style.display = 'block';
    document.querySelector('.student-name').textContent = student.name;
    document.querySelector('.student-class').textContent = student.class || '';

    // Protection anti copier-coller : seulement en mode apprenant
    if (!isTeacherView) {
        _applyAntiCopyProtection();
    }
});


// ============================================================================
// Fonctions privées (préfixe _ = usage interne uniquement)
// ============================================================================

/**
 * Initialise la page en mode formateur.
 * Charge l'apprenant cible et désactive l'interface dès que le DOM est stable.
 * @returns {object|null} L'objet student, ou null si introuvable
 */
async function _initTeacherView(auth, teacherStudentId) {
    const users = await auth.getUsers();
    const student = users.find(u => u.id === teacherStudentId);

    if (!student) {
        alert('Apprenant introuvable');
        if (window.parent?.dashboard) {
            window.parent.dashboard.closeStudentChapterView();
        }
        return null;
    }

    _lockInterfaceForTeacher();
    return student;
}

/**
 * Initialise la page en mode apprenant normal.
 * Vérifie la session et branche le bouton de déconnexion.
 * @returns {object|null} L'objet student, ou null si non connecté
 */
async function _initStudentView(auth) {
    const token = sessionStorage.getItem(auth.SESSION_KEY);
    const student = token ? await auth.findUserByToken(token) : null;

    if (!student) {
        window.location.href = window.Parcours ? Parcours.loginUrl : '../html/login.html';
        return null;
    }

    document.getElementById('logout-btn').addEventListener('click', () => {
        if (window.Parcours) {
            Parcours.logout(); // efface le token de session ET redirige vers login du parcours
        } else {
            sessionStorage.removeItem(auth.SESSION_KEY);
            window.location.href = '../html/login.html';
        }
    });

    return student;
}

/**
 * Désactive tous les inputs/boutons pour la vue formateur (lecture seule).
 * Utilise requestAnimationFrame pour s'exécuter après le premier rendu,
 * ce qui est plus fiable que setTimeout(fn, 100).
 */
function _lockInterfaceForTeacher() {
    // requestAnimationFrame garantit que le navigateur a terminé son rendu
    // avant de désactiver les éléments — plus fiable que setTimeout(fn, 100).
    requestAnimationFrame(() => {
        document.querySelectorAll('button').forEach(btn => {
            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.style.pointerEvents = 'none';
        });

        document.querySelectorAll('input, select, textarea').forEach(input => {
            input.disabled = true;
            input.style.backgroundColor = '#f8f9fa';
        });

        if (window.studentWorkEditor) {
            window.studentWorkEditor.hideAllHints();
        }
    });
}

/**
 * Applique la protection anti copier-coller sur les zones de contenu.
 * Bloque le menu contextuel uniquement sur les éléments marqués .prevent-copy.
 */
function _applyAntiCopyProtection() {
    document.querySelectorAll('.question-text, .content-box, .hint-content').forEach(el => {
        el.classList.add('prevent-copy');
    });

    document.addEventListener('contextmenu', (e) => {
        if (e.target.closest('.prevent-copy')) {
            e.preventDefault();
        }
    });
}
