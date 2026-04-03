// Système d'authentification : localStorageAuth.js
 
class LocalStorageAuth {
    constructor() {
        this.currentStudent = null;
        this.RECOVERY_TOKEN = 'YXORP@97240'; // Jeton de récupération universel
        this.SESSION_KEY = 'current_student_token';
        this.init();
    }

    init() {
        this.checkAuth();
        this.setupEventListeners();
    }

    requireAuth() {
        const token = sessionStorage.getItem(this.SESSION_KEY);

        if (!token) {
            window.location.href = '/src/html/login.html';
            return false;
        }

        const user = this.findUserByToken(token);

        if (!user) {
            sessionStorage.removeItem(this.SESSION_KEY);
            window.location.href = '/src/html/login.html';
            return false;
        }

        this.currentStudent = user;
        return true;
    }

    requireTeacherAuth() {
        const token = sessionStorage.getItem(this.SESSION_KEY);

        if (!token) {
            window.location.href = '/src/html/login.html';
            return false;
        }

        const user = this.findUserByToken(token);

        if (!user || user.type !== 'teacher') {
            sessionStorage.removeItem(this.SESSION_KEY);
            sessionStorage.removeItem('teacher_authenticated');
            window.location.href = '/src/html/login.html';
            return false;
        }

        this.currentStudent = user;
        return true;
    }

    // Obtenir la liste des utilisateurs
    getUsers() {
        const users = localStorage.getItem('users_list');
        return users ? JSON.parse(users) : [];
    }

    // Sauvegarder la liste des utilisateurs
    saveUsers(users) {
        localStorage.setItem('users_list', JSON.stringify(users));
    }

    // Ajouter un utilisateur
    addUser(user) {
        const users = this.getUsers();
        users.push(user);
        this.saveUsers(users);
    }

    // Mettre à jour un utilisateur
    updateUser(userId, updatedUser) {
        const users = this.getUsers();
        const index = users.findIndex(u => u.id === userId);
        if (index !== -1) {
            users[index] = updatedUser;
            this.saveUsers(users);
        }
    }

    // Supprimer un utilisateur
    removeUser(userId) {
        const users = this.getUsers();
        const filteredUsers = users.filter(u => u.id !== userId);
        this.saveUsers(filteredUsers);
        
        localStorage.removeItem(`student_${userId}_progress`);

    }

    // Vérifier si un utilisateur est connecté
    checkAuth() {
        const token = sessionStorage.getItem(this.SESSION_KEY);

        if (token) {
            const student = this.findUserByToken(token);

            if (student) {
                this.currentStudent = student;
            } else {
                sessionStorage.removeItem(this.SESSION_KEY);
                sessionStorage.removeItem('teacher_authenticated');
            }
        }
    }

    // Trouver un utilisateur par jeton
    findUserByToken(token) {
        const users = this.getUsers();
        return users.find(u => u.id === token);
    }

    // Se connecter avec un jeton
    login(token) {
        // Vérifier le jeton de récupération universel
        if (token === this.RECOVERY_TOKEN) {
            // Jeton de récupération - connecter le professeur
            const teacher = this.getUsers().find(u => u.type === 'teacher');
            if (teacher) {
                this.currentStudent = teacher;
                sessionStorage.setItem(this.SESSION_KEY, teacher.id);
                sessionStorage.setItem('teacher_authenticated', 'true');
                return true;
            } else {
                // Si aucun professeur n'est configuré, en créer un par défaut
                const defaultTeacher = {
                    id: 'PROF001',
                    name: 'Professeur',
                    class: 'PROF',
                    type: 'teacher'
                };
                this.addUser(defaultTeacher);
                this.currentStudent = defaultTeacher;
                sessionStorage.setItem(this.SESSION_KEY, defaultTeacher.id);
                sessionStorage.setItem('teacher_authenticated', 'true');
                return true;
            }
        }

        // Vérification normale du jeton
        const user = this.findUserByToken(token);
        if (user) {
            this.currentStudent = user;
            sessionStorage.setItem(this.SESSION_KEY, token);
            return true;
        }
        return false;
    }

    // Se déconnecter
    logout() {
        this.currentStudent = null;
        sessionStorage.removeItem(this.SESSION_KEY);
        sessionStorage.removeItem('teacher_authenticated');
    }

    // Obtenir les données de progression pour l'utilisateur connecté
    getStudentProgress() {
        const token = sessionStorage.getItem(this.SESSION_KEY);
        if (!token) return null;

        const data = localStorage.getItem(`student_${token}_progress`);
        if (!data) {
            return {
                chapters: {},
                scores: {},
                totalCompleted: 0,
                questionAttempts: {}
            };
        }
        return JSON.parse(data);
    }

    // Sauvegarder les données de progression pour l'utilisateur connecté
    saveStudentProgress(progress) {
        const token = sessionStorage.getItem(this.SESSION_KEY);
        if (token) {
            localStorage.setItem(`student_${token}_progress`, JSON.stringify(progress));
        }
    }

    // Enregistrer une tentative de question
    recordQuestionAttempt(chapterId, questionId, isCorrect) {
        const progress = this.getStudentProgress() || {
            chapters: {},
            scores: {},
            totalCompleted: 0,
            questionAttempts: {}
        };

        if (!progress.questionAttempts[chapterId]) {
            progress.questionAttempts[chapterId] = {};
        }

        if (!progress.questionAttempts[chapterId][questionId]) {
            progress.questionAttempts[chapterId][questionId] = {
                attempts: 0,
                correct: 0,
                lastAttempt: null
            };
        }

        progress.questionAttempts[chapterId][questionId].attempts++;
        if (isCorrect) {
            progress.questionAttempts[chapterId][questionId].correct++;
        }
        progress.questionAttempts[chapterId][questionId].lastAttempt = new Date().toISOString();

        this.saveStudentProgress(progress);
    }

    // Obtenir les statistiques de questions pour un chapitre
    getQuestionStats(chapterId) {
        const progress = this.getStudentProgress();
        if (!progress || !progress.questionAttempts[chapterId]) {
            return {};
        }

        const stats = {};
        Object.keys(progress.questionAttempts[chapterId]).forEach(questionId => {
            const data = progress.questionAttempts[chapterId][questionId];
            stats[questionId] = {
                successRate: data.attempts > 0 ? Math.round((data.correct / data.attempts) * 100) : 0,
                attempts: data.attempts,
                correct: data.correct
            };
        });

        return stats;
    }

    setupEventListeners() {
        // Gestion de la connexion
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const tokenInput = document.getElementById('student-token');
                const token = tokenInput.value.trim().toUpperCase();
                
                if (this.login(token)) {
                    tokenInput.value = '';
                    // Rediriger vers le sommaire
                    if (window.location.pathname.includes('login')) {
                        window.location.href = '/index.html';
                    }
                } else {
                    alert(`Jeton invalide. Veuillez vérifier votre jeton et réessayer.\n\nSi vous êtes professeur, utilisez le jeton de récupération : ${this.RECOVERY_TOKEN.substring(0, 3)}...`);
                }
            });
        }

        // Gestion de la déconnexion
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                this.logout();
                // Rediriger vers la page de login
                if (!window.location.pathname.includes('login')) {
                    window.location.href = '/src/html/login.html';
                }
            });
        }

        // Gestion de la déconnexion depuis la page d'accueil
        const logoutBtnHome = document.getElementById('logout-btn-home');
        if (logoutBtnHome) {
            logoutBtnHome.addEventListener('click', () => {
                this.logout();
                // Rediriger vers la page de login
                window.location.href = '/src/html/login.html';
            });
        }
    }
}

// Système de gestion des utilisateurs pour le professeur
class UserManager {
    constructor() {
        this.auth = new LocalStorageAuth();
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.renderUserList();
    }

    // Charger la liste des utilisateurs
    getUsers() {
        return this.auth.getUsers();
    }

    // Sauvegarder la liste des utilisateurs
    saveUsers(users) {
        this.auth.saveUsers(users);
    }

    // Générer un jeton automatique
    generateToken(userType) {
        const users = this.getUsers();
        const prefix = userType === 'teacher' ? 'PROF' : 'STU';
        const existingTokens = users.map(u => u.id).filter(id => id.startsWith(prefix));
        
        let counter = 1;
        let newToken = `${prefix}${counter.toString().padStart(3, '0')}`;
        
        while (existingTokens.includes(newToken)) {
            counter++;
            newToken = `${prefix}${counter.toString().padStart(3, '0')}`;
        }
        
        return newToken;
    }

    // Ajouter un utilisateur
    addUser() {
        const userType = document.getElementById('user-type').value;
        const userToken = document.getElementById('user-token').value.trim();
        const userName = document.getElementById('user-name').value.trim();
        const userClass = document.getElementById('user-class').value.trim();

        if (!userToken || !userName || !userClass) {
            alert('Veuillez remplir tous les champs.');
            return;
        }

        // Vérifier que le jeton contient au moins 5 caractères
        if (userToken.length < 5) {
            alert('Le jeton doit contenir au moins 5 caractères.');
            return;
        }

        // Vérifier que le jeton ne contient pas d'espaces
        if (userToken.includes(' ')) {
            alert('Le jeton ne doit pas contenir d\'espaces.');
            return;
        }

        // Vérifier que le jeton ne contient que des lettres et des chiffres
        if (!/^[a-zA-Z0-9]+$/.test(userToken)) {
            alert('Le jeton ne doit contenir que des lettres et des chiffres.');
            return;
        }

        // Vérifier l'unicité du jeton
        const users = this.getUsers();
        const existingUser = users.find(u => u.id === userToken);
        if (existingUser) {
            alert('Ce jeton est déjà utilisé par un autre utilisateur.');
            return;
        }

        const newUser = {
            id: userToken,
            name: userName,
            class: userClass,
            type: userType
        };

        this.auth.addUser(newUser);
        this.renderUserList();
        
        // Réinitialiser le formulaire
        document.getElementById('user-token').value = '';
        document.getElementById('user-name').value = '';
        document.getElementById('user-class').value = '';
    }

    // Mettre à jour un utilisateur
    updateUser(userId) {
        const users = this.getUsers();
        const user = users.find(u => u.id === userId);
        
        const newName = prompt('Nouveau nom:', user.name);
        const newClass = prompt('Nouvelle classe:', user.class);
        
        if (newName !== null && newClass !== null) {
            const updatedUser = {
                ...user,
                name: newName.trim(),
                class: newClass.trim()
            };
            this.auth.updateUser(userId, updatedUser);
            this.renderUserList();
        }
    }

    // Supprimer un utilisateur
    removeUser(userId) {
        if (confirm('Êtes-vous sûr de vouloir supprimer cet utilisateur ?')) {
            this.auth.removeUser(userId);
            this.renderUserList();
        }
    }

    // Réinitialiser la liste avec les utilisateurs par défaut
    resetUsers() {
        if (confirm('Réinitialiser la liste avec les utilisateurs par défaut ? Cette action est irréversible.')) {
            localStorage.removeItem('users_list');
            this.renderUserList();
        }
    }

    // Exporter la liste des utilisateurs
    exportUsers() {
        const users = this.getUsers();
        
        // Toujours inclure la ligne de titre, même si la liste est vide
        const csvContent = [
            'ID;Nom;Classe;Type',  // Ligne de titre
            ...users.map(u => [u.id, u.name, u.class, u.type].join(';'))
        ].join('\n');

        console.log('Export CSV - Users:', users);
        console.log('Export CSV - Content:', csvContent);
        console.log('Export CSV - Content length:', csvContent.length);

        // Solution cross-platform pour les CSV avec BOM pour Excel
        const csvWithBOM = '\uFEFF' + csvContent; // BOM pour Excel
        const blob = new Blob([csvWithBOM], { 
            type: 'text/csv;charset=utf-8;' 
        });
        const url = URL.createObjectURL(blob);
        
        console.log('Export CSV - Blob created:', blob);
        console.log('Export CSV - URL created:', url);
        console.log('Export CSV - Blob size:', blob.size);
        
        // Lire le contenu du blob pour vérification
        blob.text().then(text => {
            console.log('Export CSV - Blob content:', text);
            console.log('Export CSV - Blob content length:', text.length);
        });
        
        // Méthode unique avec BOM pour Excel/OpenOffice
        const a = document.createElement('a');
        a.href = url;
        a.download = 'listeDesJetons.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        console.log('Export CSV - Download with BOM attempted');
        
        // Révoquer l'URL après un court délai
        setTimeout(() => {
            URL.revokeObjectURL(url);
            console.log('Export CSV - URL revoked');
        }, 500);
    }

    // Importer la liste des utilisateurs
    importUsers(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target.result;
            
            // Solution cross-platform pour les retours à la ligne
            const lines = content.split(/\r?\n/).filter(line => line.trim());
            
            if (lines.length < 2) {
                alert('Fichier invalide. Le fichier doit contenir au moins une ligne de titre et une ligne de données.');
                return;
            }

            // Sauter la ligne de titre (première ligne)
            const users = [];
            for (let i = 1; i < lines.length; i++) {
                // Solution robuste pour les séparateurs CSV
                const line = lines[i];
                let parts;
                
                // Essayer d'abord avec le séparateur ';'
                if (line.includes(';')) {
                    parts = line.split(';');
                } 
                // Sinon essayer avec ','
                else if (line.includes(',')) {
                    parts = line.split(',');
                }
                // Sinon échouer
                else {
                    continue;
                }
                
                const [id, name, classVal, type] = parts;
                if (id && name && classVal && type) {
                    users.push({
                        id: id.trim(),
                        name: name.trim(),
                        class: classVal.trim(),
                        type: type.trim()
                    });
                }
            }

            if (users.length > 0) {
                if (confirm(`Importer ${users.length} utilisateurs ? Cette action remplacera la liste actuelle.`)) {
                    this.saveUsers(users);
                    this.renderUserList();
                    alert('Importation terminée !');
                }
            } else {
                alert('Aucun utilisateur valide trouvé dans le fichier.');
            }
        };
        reader.readAsText(file);
    }

    // Rendre la liste des utilisateurs
    renderUserList() {
        const userList = document.getElementById('user-list');
        const users = this.getUsers();

        let html = '';
        users.forEach(user => {
            const userType = user.type === 'teacher' ? 'Professeur' : 'Élève';
            html += `
                <div class="user-item" data-user-id="${user.id}">
                    <span class="user-display user-id" id="display-id-${user.id}">${user.id}</span>
                    <span class="user-display user-name" id="display-name-${user.id}">${user.name}</span>
                    <span class="user-display user-class" id="display-class-${user.id}">${user.class}</span>
                    <span class="user-display user-type ${user.type}" id="display-type-${user.id}">${userType}</span>
                    <div class="edit-controls" id="controls-${user.id}">
                        <button class="btn btn-primary edit-btn" onclick="userManager.startEditUser('${user.id}')">
                            ✏️ Modifier
                        </button>
                        <button class="btn btn-danger delete-btn" onclick="userManager.removeUser('${user.id}')">
                            🗑️ 
                        </button>
                    </div>
                    
                    <div class="user-edit-form" id="edit-form-${user.id}" style="display: none;">
                        <input type="text" class="edit-input edit-id" name="edit-id-${user.id}" id="edit-id-${user.id}" value="${user.id}" placeholder="Jeton">
                        <input type="text" class="edit-input edit-name" name="edit-name-${user.id}" id="edit-name-${user.id}" value="${user.name}" placeholder="Nom">
                        <input type="text" class="edit-input edit-class" name="edit-class-${user.id}" id="edit-class-${user.id}" value="${user.class}" placeholder="Classe">
                        <select class="edit-select edit-type" name="edit-type-${user.id}" id="edit-type-${user.id}">
                            <option value="student" ${user.type === 'student' ? 'selected' : ''}>Élève</option>
                            <option value="teacher" ${user.type === 'teacher' ? 'selected' : ''}>Professeur</option>
                        </select>
                        <div class="edit-controls">
                            <button class="btn btn-primary save-btn" onclick="userManager.saveEditUser('${user.id}')">
                                ✅ Valider
                            </button>
                            <button class="btn btn-secondary cancel-btn" onclick="userManager.cancelEditUser('${user.id}')">
                                ❌ Annuler
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });

        userList.innerHTML = html;
    }

    setupEventListeners() {
        // Ajouter un utilisateur
        const addUserBtn = document.getElementById('add-user-btn');
        if (addUserBtn) {
            addUserBtn.addEventListener('click', () => this.addUser());
        }

        // Réinitialiser la liste
        const resetBtn = document.getElementById('reset-users-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.resetUsers());
        }

        // Exporter la liste
        const exportBtn = document.getElementById('export-users-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportUsers());
        }

        // Importer la liste
        const importBtn = document.getElementById('import-csv-btn');
        if (importBtn) {
            importBtn.addEventListener('click', () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.csv';
                input.onchange = (e) => this.importUsers(e);
                input.click();
            });
        }

        // Gestion de la déconnexion professeur
        const logoutProfBtn = document.getElementById('logout-prof-btn');
        if (logoutProfBtn) {
            logoutProfBtn.addEventListener('click', () => {
                sessionStorage.removeItem(this.auth.SESSION_KEY);
                sessionStorage.removeItem('teacher_authenticated');
                window.location.href = 'teacher-login.html';
            });
        }
    }

    // Commencer l'édition d'un utilisateur
    startEditUser(userId) {
        const userItem = document.querySelector(`.user-item[data-user-id="${userId}"]`);
        if (!userItem) return;

        // Cacher tous les formulaires d'édition
        const allEditForms = document.querySelectorAll('.user-edit-form');
        allEditForms.forEach(form => form.style.display = 'none');

        // Cacher tous les boutons Modifier et Supprimer
        const allEditBtns = document.querySelectorAll('.edit-btn');
        allEditBtns.forEach(btn => btn.style.display = 'none');
        
        const allDeleteBtns = document.querySelectorAll('.delete-btn');
        allDeleteBtns.forEach(btn => btn.style.display = 'none');

        // Afficher le formulaire d'édition pour cet utilisateur
        const editForm = document.getElementById(`edit-form-${userId}`);
        if (editForm) {
            editForm.style.display = 'grid';
        }
    }

    // Enregistrer les modifications d'un utilisateur
    saveEditUser(userId) {
        const userItem = document.querySelector(`.user-item[data-user-id="${userId}"]`);
        if (!userItem) return;

        const newId = userItem.querySelector('.edit-id').value.trim();
        const newName = userItem.querySelector('.edit-name').value.trim();
        const newClass = userItem.querySelector('.edit-class').value.trim();
        const newType = userItem.querySelector('.edit-type').value;

        if (!newId || !newName || !newClass) {
            alert('Veuillez remplir tous les champs.');
            return;
        }

        const users = this.getUsers();
        const userIndex = users.findIndex(u => u.id === userId);
        
        if (userIndex !== -1) {
            // Vérifier si le nouvel ID n'est pas déjà utilisé (sauf par l'utilisateur lui-même)
            const existingUser = users.find(u => u.id === newId && u.id !== userId);
            if (existingUser) {
                alert('Ce jeton est déjà utilisé par un autre utilisateur.');
                return;
            }

            const updatedUser = {
                id: newId,
                name: newName,
                class: newClass,
                type: newType
            };

            users[userIndex] = updatedUser;
            const oldProgress = localStorage.getItem(`student_${userId}_progress`);

            if (oldProgress && userId !== newId) {
                localStorage.setItem(`student_${newId}_progress`, oldProgress);
                localStorage.removeItem(`student_${userId}_progress`);
            }            
            this.saveUsers(users);
            this.renderUserList();
        }
    }

    // Annuler l'édition d'un utilisateur
    cancelEditUser(userId) {
        const editForm = document.getElementById(`edit-form-${userId}`);
        if (editForm) {
            editForm.style.display = 'none';
        }

        // Réafficher tous les boutons Modifier et Supprimer
        const allEditBtns = document.querySelectorAll('.edit-btn');
        allEditBtns.forEach(btn => btn.style.display = 'inline-block');
        
        const allDeleteBtns = document.querySelectorAll('.delete-btn');
        allDeleteBtns.forEach(btn => btn.style.display = 'inline-block');
    }
}

// Export pour utilisation globale
window.LocalStorageAuth = LocalStorageAuth;
window.UserManager = UserManager;