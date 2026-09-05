// ============================================================================
// CHAPTER INIT - Initialisation des pages de chapitre
// ============================================================================
// Extrait du script inline du template chapitre.
// Gère : authentification, mode formateur, protection copier-coller.
// Chargé via <script src="../js/chapterInit.js" defer> dans le template.
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    // ✅ Attendre que Parcours soit défini (nécessaire pour DataStorage)
    if (!window.Parcours) {
        console.log('⏳ Attente de Parcours...');
        await new Promise(resolve => {
            const check = setInterval(() => {
                if (window.Parcours) {
                    clearInterval(check);
                    resolve();
                }
            }, 50);
        });
        console.log('✅ Parcours chargé');
    }
    
    const auth = new DataStorage();

    // Vérifier si c'est une vue formateur (teacher_view)
    const urlParams = new URLSearchParams(window.location.search);
    const isTeacherView = urlParams.get('teacher_view') === 'true';
    const teacherStudentId = urlParams.get('student_id');

    let student = null;

    if (window.Simulation?.active()) {
        // Simulation : ni session élève, ni redirection vers la connexion. L'identité
        // vient de l'URL et l'apprenant de simulation est inscrit à la volée.
        student = await _initSimulationView();
        if (!student) return;
    } else if (isTeacherView && teacherStudentId) {
        student = await _initTeacherView(auth, teacherStudentId);
        if (!student) return; // _initTeacherView gère l'alerte et la redirection
    } else {
        student = await _initStudentView(auth);
        if (!student) return; // _initStudentView gère la redirection vers login
    }
    const backBtn = document.getElementById('back-to-menu');
    if (backBtn && window.Parcours && Parcours.userHomeUrl) {
        backBtn.onclick = (e) => {
            e.preventDefault();
            window.location.href = Parcours.userHomeUrl;
            return false;
        };
    }


    // Afficher les informations utilisateur
    const studentInfo = document.getElementById('student-info');
    if (studentInfo) studentInfo.style.display = 'block';
    
    const studentName = document.querySelector('.student-name');
    const studentClass = document.querySelector('.student-class');
    if (studentName) studentName.textContent = student.name;
    if (studentClass) studentClass.textContent = student.class || '';

    // Protection anti copier-coller : seulement en mode apprenant
    if (!isTeacherView) {
        _applyAntiCopyProtection();
    }
});

// ============================================================================
// Fonctions privées (préfixe _ = usage interne uniquement)
// ============================================================================

/**
 * Initialise la page en simulation formateur.
 *
 * Contrairement à l'aperçu formateur, l'interface reste ENTIÈREMENT vivante : le
 * formateur doit pouvoir répondre, valider, rendre sa copie et voir le bilan. Rien
 * n'est verrouillé, et la protection copier-coller s'applique comme pour un
 * apprenant — c'est le but, voir ce qu'il vit.
 *
 * @returns {object|null} La fiche de l'apprenant de simulation
 */
async function _initSimulationView() {
    const slug = window.currentParcoursSlug || (window.Parcours ? Parcours.slug : null);
    const student = await Simulation.assurerUtilisateur(slug);
    Simulation.afficherBandeau();
    return student;
}

/**
 * Initialise la page en mode formateur.
 * Charge l'apprenant cible et désactive l'interface dès que le DOM est stable.
 * @returns {object|null} L'objet student, ou null si introuvable
 */
async function _initTeacherView(auth, teacherStudentId) {
    const slug = window.currentParcoursSlug || (window.Parcours ? Parcours.slug : null);
    if (!slug) return null;
    const usersKey = `${slug}:teacher:users_list`;
    const users = await storage.get(usersKey) || [];    const student = users.find(u => u.id === teacherStudentId);

    if (!student) {
        alert('Apprenant introuvable');
        // La fermeture est portée par le module submissions ; le tableau de bord la
        // délègue. Appeler directement dashboard.closeStudentChapterView() levait un
        // TypeError et laissait la modale ouverte sur une page vide.
        try {
            window.parent?.dashboard?.closeStudentChapterView?.();
        } catch (e) {
            console.warn('[TeacherView] Fermeture de la modale impossible :', e.message);
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
        const loginUrl = window.Parcours ? Parcours.loginUrl : (window.BASE || '') + '/src/html/login.html';
        window.location.href = loginUrl;
        return null;
    }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (window.Parcours) {
                Parcours.logout();
            } else {
                sessionStorage.removeItem(auth.SESSION_KEY);
                window.location.href = (window.BASE || '') + '/src/html/login.html';
            }
        });
    }

    return student;
}
/**
 * Désactive tous les inputs/boutons pour la vue formateur (lecture seule).
 * Utilise requestAnimationFrame pour s'exécuter après le premier rendu,
 * ce qui est plus fiable que setTimeout(fn, 100).
 */
function _lockInterfaceForTeacher() {
    // setTimeout(800) plutôt que requestAnimationFrame car les éléments
    // DOM dynamiques (questions, cours, boutons "Vérifier", "Valider toutes les réponses"…)
    // sont injectés par le script module <script type="module"> qui s'exécute
    // après requestAnimationFrame. Avec setTimeout on laisse le temps au module
    // de terminer son rendu (injection du HTML + initChapterPage).
    setTimeout(() => {
        // 1. Désactiver les boutons, SAUF ceux qui servent à se déplacer : désactiver
        //    la navigation enfermait le formateur dans l'aperçu, sans retour au menu
        //    ni passage d'une étape à l'autre quand le chapitre est paginé.
        const estNavigation = (btn) =>
            btn.closest('.chapter-nav') ||
            btn.closest('.pagination-barre') ||
            btn.id === 'back-to-menu' ||
            btn.id === 'logout-btn';

        document.querySelectorAll('button').forEach(btn => {
            if (estNavigation(btn)) return;
            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.style.pointerEvents = 'none';
        });

        // 2. Désactiver les entrées
        document.querySelectorAll('input, select, textarea').forEach(input => {
            input.disabled = true;
            input.style.backgroundColor = '#f8f9fa';
        });

        // 3. Cacher la validation globale (bouton "✅ Valider toutes les réponses")
        const globalValidation = document.querySelector('.global-validation');
        if (globalValidation) globalValidation.style.display = 'none';

        // 4. Cacher le bouton "Rendre la copie"
        const submitBtn = document.getElementById('submit-chapter-btn');
        if (submitBtn) submitBtn.style.display = 'none';

        // 5. Masquer les indications
        if (window.studentWorkEditor) {
            window.studentWorkEditor.hideAllHints();
        }
    }, 800);
}

// ============================================================================
// PROTECTION COPIER-COLLER ET GLISSER-DÉPOSER
// ============================================================================
// Actif uniquement en mode apprenant (cf. l'appel plus haut, exclu de la vue
// formateur qui doit rester manipulable normalement).
//
// UNE SEULE EXEMPTION, et elle est étroite : le COLLER dans la zone de texte d'une
// question ouverte à correction MANUELLE. Un apprenant doit pouvoir y déposer un
// travail rédigé ailleurs — c'est le seul endroit où ça a un sens pédagogique.
//
// Tout le reste est refusé, y compris depuis cette zone :
//   - le sens SORTANT (copier, couper) est bloqué partout, sinon l'énoncé et les
//     réponses des autres questions s'exfiltrent par le champ exempté ;
//   - les questions ouvertes en correction SEMI ont aussi des <textarea> et ne
//     sont PAS exemptées : la règle porte sur data-correction-type="manuel" ;
//   - le glisser-déposer est bloqué partout, dans les deux sens, y compris dans la
//     zone exemptée : c'est un contournement complet du presse-papiers.
//
// AUCUNE JOURNALISATION, et aucun message prétendant qu'une tentative est
// enregistrée ou signalée : ce serait faux. Le message dit seulement que le
// contenu est protégé.
// ============================================================================

function _applyAntiCopyProtection() {

    const ANTI_COPY_MSG = '🔒 Contenu protégé — copier/coller désactivé sur ce chapitre.';

    /**
     * LA règle d'exemption, unique : zone de texte d'une question ouverte à
     * correction manuelle. Toute exception au blocage passe par ici.
     */
    function _isManualOpenTextarea(target) {
        return !!target?.closest?.('.question-section[data-correction-type="manuel"] textarea');
    }

    // ── Copier : bloqué partout, presse-papiers neutralisé ──────────────────
    // Aucune exemption : le sens sortant est fermé même dans la zone qui accepte
    // le coller, sans quoi elle servirait de porte de sortie au contenu.
    document.addEventListener('copy', (e) => {
        e.clipboardData.setData('text/plain', ANTI_COPY_MSG);
        e.preventDefault();
    });

    // ── Couper : bloqué partout, pour la même raison ────────────────────────
    document.addEventListener('cut', (e) => {
        e.preventDefault();
    });

    // ── Coller : autorisé dans la seule zone exemptée ───────────────────────
    document.addEventListener('paste', (e) => {
        if (_isManualOpenTextarea(e.target)) return;
        e.preventDefault();
    });

    // ── Menu contextuel : autorisé dans la zone exemptée uniquement ─────────
    // Sans cela, le « Coller » du menu contextuel serait inaccessible et
    // l'exemption ne vaudrait que pour les apprenants qui connaissent Ctrl+V.
    document.addEventListener('contextmenu', (e) => {
        if (_isManualOpenTextarea(e.target)) return;
        e.preventDefault();
    });

    // ── Raccourcis clavier, interceptés en amont ────────────────────────────
    // Ctrl/Cmd+X toujours bloqué ; Ctrl/Cmd+V seulement hors zone exemptée.
    // Ctrl+C n'est pas traité ici : l'évènement 'copy' ci-dessus le couvre déjà.
    document.addEventListener('keydown', (e) => {
        if (!e.ctrlKey && !e.metaKey) return;

        const touche = e.key.toLowerCase();
        if (touche === 'x') e.preventDefault();
        if (touche === 'v' && !_isManualOpenTextarea(e.target)) e.preventDefault();
    });

    // ── Glisser-déposer : bloqué partout, dans les deux sens ────────────────
    // En capture pour intercepter avant toute cible : un handler posé par un
    // composant ne doit pas pouvoir rétablir le dépôt.
    document.addEventListener('dragstart', (e) => e.preventDefault(), { capture: true });

    document.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
    }, { capture: true });

    document.addEventListener('drop', (e) => e.preventDefault(), { capture: true });
}
