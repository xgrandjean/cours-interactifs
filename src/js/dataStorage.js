// ============================================================================
// DATASTORAGE.JS — VERSION MULTI-PARCOURS
// ============================================================================
// Modifications par rapport à l'original :
//
//  1. Toutes les clés passent par Parcours.scoped.student / .teacher / .config
//     → elles sont automatiquement préfixées "slug:token:key" dans Supabase
//     → Supabase et le cache localStorage restent cohérents
//     → AUCUNE modification de storage.js
//
//  2. _loginUrl() et _homeUrl() sont construites dynamiquement depuis Parcours
//
//  3. users_list est par parcours : Parcours.scoped.teacher.get('users_list')
//     → clé Supabase : "nsi-term:teacher:users_list"
//     → un même token STU001 peut exister dans plusieurs parcours indépendamment
//
//  4. login() met à jour la clé de session Parcours en plus de la clé legacy
//
//  Tout le reste (UserManager, recordQuestionAttempt, etc.) est identique.
// ============================================================================

class DataStorage {
    constructor() {
        this.currentStudent = null;
        this.RECOVERY_TOKEN = 'YXORP@97240';
        this.SESSION_KEY    = 'current_student_token';

        // Initialiser le scoped storage dès que storage.js est prêt
        // (parcours.js est chargé avant, storage.js juste avant dataStorage.js)
        Parcours.makeScoped();

        this.init();
    }

    init() {
        this.checkAuth();
        this.setupEventListeners();
    }

    // ── Helpers URL ──────────────────────────────────────────────
    _loginUrl() { return Parcours.loginUrl; }
    _homeUrl()  { return Parcours.homeUrl;  }

    // ── Accès au storage scopé ───────────────────────────────────
    // Les clés élève sont préfixées "slug:token:"
    // Les clés formateur sont préfixées "slug:teacher:"
    get _student() { return Parcours.scoped.student; }
    get _teacher() { return Parcours.scoped.teacher; }
    get _config()  { return Parcours.scoped.config;  }

    // ── Gestion des utilisateurs (isolée par parcours) ───────────

    async getUsers() {
        // Clé Supabase : "nsi-term:teacher:users_list"
        const users = await this._teacher.get('users_list');
        return users || [];
    }

    async saveUsers(users) {
        await this._teacher.set('users_list', users);
    }

    async addUser(user) {
        const users = await this.getUsers();
        users.push(user);
        await this.saveUsers(users);
    }

    async updateUser(userId, updatedUser) {
        const users = await this.getUsers();
        const index = users.findIndex(u => u.id === userId);
        if (index !== -1) {
            users[index] = updatedUser;
            await this.saveUsers(users);
        }
    }

    async removeUser(userId) {
        const users = await this.getUsers();
        await this.saveUsers(users.filter(u => u.id !== userId));
        // Supprime aussi la progression de l'élève dans ce parcours
        await this._student.remove(`student_${userId}_progress`);
    }

    async findUserByToken(token) {
        const users = await this.getUsers();
        return users.find(u => u.id === token) || null;
    }

    // ── Authentification ─────────────────────────────────────────

    async checkAuth() {
        const token = sessionStorage.getItem(this.SESSION_KEY);
        if (token) {
            const student = await this.findUserByToken(token);
            if (student) {
                this.currentStudent = student;
            } else {
                sessionStorage.removeItem(this.SESSION_KEY);
                sessionStorage.removeItem('teacher_authenticated');
            }
        }
    }

    async requireAuth() {
        const token = sessionStorage.getItem(this.SESSION_KEY);
        if (!token) { window.location.href = this._loginUrl(); return false; }
        const user = await this.findUserByToken(token);
        if (!user) {
            sessionStorage.removeItem(this.SESSION_KEY);
            window.location.href = this._loginUrl();
            return false;
        }
        this.currentStudent = user;
        return true;
    }

    async requireTeacherAuth() {
        const token = sessionStorage.getItem(this.SESSION_KEY);
        if (!token) { window.location.href = this._loginUrl(); return false; }
        const user = await this.findUserByToken(token);
        if (!user || user.type !== 'teacher') {
            sessionStorage.removeItem(this.SESSION_KEY);
            sessionStorage.removeItem('teacher_authenticated');
            window.location.href = this._loginUrl();
            return false;
        }
        this.currentStudent = user;
        return true;
    }

    async login(token) {
        // Jeton de récupération universel
        if (token === this.RECOVERY_TOKEN) {
            const users   = await this.getUsers();
            const teacher = users.find(u => u.type === 'teacher') || {
                id: 'PROF001', name: 'Formateur', class: 'PROF', type: 'teacher'
            };
            if (!users.find(u => u.type === 'teacher')) await this.addUser(teacher);
            this.currentStudent = teacher;
            sessionStorage.setItem(this.SESSION_KEY, teacher.id);
            sessionStorage.setItem('teacher_authenticated', 'true');
            return true;
        }

        const user = await this.findUserByToken(token);
        if (user) {
            this.currentStudent = user;
            sessionStorage.setItem(this.SESSION_KEY, token);
            // Sync avec la clé de session Parcours
            sessionStorage.setItem('parcours:' + Parcours.slug + ':token', token);
            return true;
        }
        return false;
    }

    logout() {
        this.currentStudent = null;
        sessionStorage.removeItem(this.SESSION_KEY);
        sessionStorage.removeItem('teacher_authenticated');
        sessionStorage.removeItem('parcours:' + Parcours.slug + ':token');
    }

    // ── Progression élève ────────────────────────────────────────

    async getStudentProgress() {
        const token = sessionStorage.getItem(this.SESSION_KEY);
        if (!token) return null;
        // Clé : "nsi-term:STU001:student_STU001_progress"
        const data = await this._student.get(`student_${token}_progress`);
        return data || { chapters: {}, scores: {}, totalCompleted: 0, questionAttempts: {} };
    }

    async saveStudentProgress(progress) {
        const token = sessionStorage.getItem(this.SESSION_KEY);
        if (token) {
            await this._student.set(`student_${token}_progress`, progress);
        }
    }

    async recordQuestionAttempt(chapterId, questionId, isCorrect) {
        const progress = await this.getStudentProgress() || {
            chapters: {}, scores: {}, totalCompleted: 0, questionAttempts: {}
        };
        if (!progress.questionAttempts[chapterId])                  progress.questionAttempts[chapterId] = {};
        if (!progress.questionAttempts[chapterId][questionId])      progress.questionAttempts[chapterId][questionId] = { attempts: 0, correct: 0, lastAttempt: null };
        progress.questionAttempts[chapterId][questionId].attempts++;
        if (isCorrect) progress.questionAttempts[chapterId][questionId].correct++;
        progress.questionAttempts[chapterId][questionId].lastAttempt = new Date().toISOString();
        await this.saveStudentProgress(progress);
    }

    async getQuestionStats(chapterId) {
        const progress = await this.getStudentProgress();
        if (!progress?.questionAttempts?.[chapterId]) return {};
        const stats = {};
        for (const [qId, data] of Object.entries(progress.questionAttempts[chapterId])) {
            stats[qId] = {
                successRate: data.attempts > 0 ? Math.round((data.correct / data.attempts) * 100) : 0,
                attempts: data.attempts,
                correct: data.correct
            };
        }
        return stats;
    }

    // ── Event listeners ──────────────────────────────────────────

    setupEventListeners() {
        // Login élève
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const tokenInput = document.getElementById('student-token');
                const token = tokenInput.value.trim();
                if (await this.login(token)) {
                    tokenInput.value = '';
                    window.location.href = this._homeUrl();
                } else {
                    alert(`Jeton invalide. Vérifiez votre jeton.\n\nFormateur : utilisez le jeton de récupération ${this.RECOVERY_TOKEN.substring(0,3)}...`);
                }
            });
        }

        // Déconnexion élève
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                this.logout();
                window.location.href = this._loginUrl();
            });
        }

        const logoutBtnHome = document.getElementById('logout-btn-home');
        if (logoutBtnHome) {
            logoutBtnHome.addEventListener('click', () => {
                this.logout();
                window.location.href = this._loginUrl();
            });
        }
    }
}

// ============================================================================
// UserManager — identique à l'original
// ============================================================================
class UserManager {
    constructor() {
        this.auth = new DataStorage();
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.renderUserList();
    }

    async getUsers()            { return await this.auth.getUsers(); }
    async saveUsers(users)      { await this.auth.saveUsers(users); }

    async generateToken(userType) {
        const users  = await this.getUsers();
        const prefix = userType === 'teacher' ? 'PROF' : 'STU';
        const existing = users.map(u => u.id).filter(id => id.startsWith(prefix));
        let counter = 1, newToken = `${prefix}${String(counter).padStart(3,'0')}`;
        while (existing.includes(newToken)) { counter++; newToken = `${prefix}${String(counter).padStart(3,'0')}`; }
        return newToken;
    }

    async addUser() {
        const userType  = document.getElementById('user-type')?.value;
        const userToken = document.getElementById('user-token')?.value.trim();
        const userName  = document.getElementById('user-name')?.value.trim();
        const userClass = document.getElementById('user-class')?.value.trim();

        if (!userToken || !userName || !userClass) { alert('Veuillez remplir tous les champs.'); return; }
        if (userToken.length < 5)                  { alert('Le jeton doit contenir au moins 5 caractères.'); return; }
        if (userToken.includes(' '))               { alert('Le jeton ne doit pas contenir d\'espaces.'); return; }
        if (!/^[a-zA-Z0-9]+$/.test(userToken))    { alert('Le jeton ne doit contenir que des lettres et des chiffres.'); return; }

        const users = await this.getUsers();
        if (users.find(u => u.id === userToken)) { alert('Ce jeton est déjà utilisé dans ce parcours.'); return; }

        await this.auth.addUser({ id: userToken, name: userName, class: userClass, type: userType });
        this.renderUserList();
        ['user-token','user-name','user-class'].forEach(id => {
            const el = document.getElementById(id); if (el) el.value = '';
        });
    }

    async updateUser(userId) {
        const users = await this.getUsers();
        const user  = users.find(u => u.id === userId);
        const newName  = prompt('Nouveau nom:', user.name);
        const newClass = prompt('Nouvelle classe:', user.class);
        if (newName !== null && newClass !== null) {
            await this.auth.updateUser(userId, { ...user, name: newName.trim(), class: newClass.trim() });
            this.renderUserList();
        }
    }

    async removeUser(userId) {
        if (confirm('Êtes-vous sûr de vouloir supprimer cet utilisateur de ce parcours ?')) {
            await this.auth.removeUser(userId);
            this.renderUserList();
        }
    }

    async resetUsers() {
        if (confirm('Réinitialiser la liste ? Cette action est irréversible.')) {
            await this.auth.saveUsers([]);
            this.renderUserList();
        }
    }

    async exportUsers() {
        const users = await this.getUsers();
        const csv = ['ID;Nom;Classe;Type',
            ...users.map(u => [u.id, u.name, u.class, u.type].join(';'))
        ].join('\n');
        const a = document.createElement('a');
        a.href     = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
        a.download = `listeDesJetons-${Parcours.slug}.csv`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(a.href), 500);
    }

    async importUsers(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            const lines = e.target.result.split(/\r?\n/).filter(l => l.trim());
            if (lines.length < 2) { alert('Fichier invalide.'); return; }
            const users = lines.slice(1).map(line => {
                const parts = line.includes(';') ? line.split(';') : line.split(',');
                const [id, name, classVal, type] = parts;
                return (id && name && classVal && type)
                    ? { id: id.trim(), name: name.trim(), class: classVal.trim(), type: type.trim() }
                    : null;
            }).filter(Boolean);
            if (users.length > 0) {
                if (confirm(`Importer ${users.length} utilisateurs dans le parcours "${Parcours.slug}" ? Cette action remplacera la liste actuelle.`)) {
                    await this.saveUsers(users);
                    this.renderUserList();
                    alert('Importation terminée !');
                }
            } else { alert('Aucun utilisateur valide trouvé.'); }
        };
        reader.readAsText(file);
    }

    async renderUserList() {
        const userList = document.getElementById('user-list');
        if (!userList) return;
        const users = await this.getUsers();
        userList.innerHTML = users.map(user => {
            const typeLabel = user.type === 'teacher' ? 'Formateur' : 'Apprenant';
            return `
            <div class="user-item" data-user-id="${user.id}">
                <span class="user-display user-id"    id="display-id-${user.id}">${user.id}</span>
                <span class="user-display user-name"  id="display-name-${user.id}">${user.name}</span>
                <span class="user-display user-class" id="display-class-${user.id}">${user.class}</span>
                <span class="user-display user-type ${user.type}" id="display-type-${user.id}">${typeLabel}</span>
                <div class="edit-controls" id="controls-${user.id}">
                    <button class="btn btn-primary edit-btn"   onclick="userManager.startEditUser('${user.id}')">✏️ Modifier</button>
                    <button class="btn btn-danger  delete-btn" onclick="userManager.removeUser('${user.id}')">🗑️</button>
                </div>
                <div class="user-edit-form" id="edit-form-${user.id}" style="display:none;">
                    <input type="text" class="edit-input edit-id"    id="edit-id-${user.id}"    value="${user.id}"    placeholder="Jeton">
                    <input type="text" class="edit-input edit-name"  id="edit-name-${user.id}"  value="${user.name}"  placeholder="Nom">
                    <input type="text" class="edit-input edit-class" id="edit-class-${user.id}" value="${user.class}" placeholder="Classe">
                    <select class="edit-select edit-type" id="edit-type-${user.id}">
                        <option value="student" ${user.type==='student'?'selected':''}>Apprenant</option>
                        <option value="teacher" ${user.type==='teacher'?'selected':''}>Formateur</option>
                    </select>
                    <div class="edit-controls">
                        <button class="btn btn-primary   save-btn"   onclick="userManager.saveEditUser('${user.id}')">✅ Valider</button>
                        <button class="btn btn-secondary cancel-btn" onclick="userManager.cancelEditUser('${user.id}')">❌ Annuler</button>
                    </div>
                </div>
            </div>`;
        }).join('');
    }

    setupEventListeners() {
        const on = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); };
        on('add-user-btn',    'click', async () => await this.addUser());
        on('reset-users-btn', 'click', async () => await this.resetUsers());
        on('export-users-btn','click', async () => await this.exportUsers());
        on('import-csv-btn',  'click', () => {
            const input = document.createElement('input');
            input.type = 'file'; input.accept = '.csv';
            input.onchange = async (e) => await this.importUsers(e);
            input.click();
        });
        on('logout-prof-btn', 'click', () => {
            sessionStorage.removeItem(this.auth.SESSION_KEY);
            sessionStorage.removeItem('teacher_authenticated');
            window.location.href = '/' + Parcours.repoName + '/teacher/';
        });
    }

    startEditUser(userId) {
        document.querySelectorAll('.user-edit-form').forEach(f => f.style.display = 'none');
        document.querySelectorAll('.edit-btn,.delete-btn').forEach(b => b.style.display = '');
        const form = document.getElementById(`edit-form-${userId}`);
        if (form) form.style.display = 'grid';
    }

    async saveEditUser(userId) {
        const item = document.querySelector(`.user-item[data-user-id="${userId}"]`);
        if (!item) return;
        const newId    = item.querySelector('.edit-id').value.trim();
        const newName  = item.querySelector('.edit-name').value.trim();
        const newClass = item.querySelector('.edit-class').value.trim();
        const newType  = item.querySelector('.edit-type').value;
        if (!newId || !newName || !newClass) { alert('Veuillez remplir tous les champs.'); return; }
        const users = await this.getUsers();
        if (users.find(u => u.id === newId && u.id !== userId)) { alert('Ce jeton est déjà utilisé.'); return; }
        // Migration de la progression si le token change
        if (userId !== newId) {
            const oldProgress = await Parcours.scoped.student.get(`student_${userId}_progress`);
            if (oldProgress) {
                await Parcours.scoped.student.set(`student_${newId}_progress`, oldProgress);
                await Parcours.scoped.student.remove(`student_${userId}_progress`);
            }
        }
        const idx = users.findIndex(u => u.id === userId);
        if (idx !== -1) {
            users[idx] = { id: newId, name: newName, class: newClass, type: newType };
            await this.saveUsers(users);
            await this.renderUserList();
        }
    }

    cancelEditUser(userId) {
        const form = document.getElementById(`edit-form-${userId}`);
        if (form) form.style.display = 'none';
        document.querySelectorAll('.edit-btn,.delete-btn').forEach(b => b.style.display = '');
    }
}

window.DataStorage = DataStorage;
window.UserManager = UserManager;
