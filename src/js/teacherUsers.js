/**
 * teacherUsers.js - Module de gestion des utilisateurs
 * Liste des apprenants, ajout/suppression, informations de classe
 * RGPD compliant: seulement nom, classe et jeton (pas d'email ni données personnelles)
 */

class TeacherUsers {
    constructor(dashboard) {
        this.dashboard = dashboard;
        this.container = document.getElementById('users-content');
        this.students = [];
        this.init();
    }

    async init() {
        await this.loadStudents();
        this.render();
    }

    async refresh() {
        await this.loadStudents();
        this.render();
    }

    async loadStudents() {
        this.students = await this.dashboard.getStudents();
        
        // ✅ TRI PAR ORDRE ALPHABETIQUE PAR DEFAUT
        this.students.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    }

    async render() {
        let html = `
            <div class="section-header">
                <h2>👥 Gérer les Utilisateurs</h2>
                <p>Gérez la liste des apprenants et leurs informations</p>
            </div>

            <div class="users-filters">
                <div class="filter-group">
                    <label for="filter-users-search">Recherche:</label>
                    <input type="text" id="filter-users-search" oninput="dashboard.modules.users.filterUsers()" placeholder="Rechercher un nom...">
                </div>
                <div class="filter-group">
                    <label for="filter-users-class">Classe:</label>
                    <select id="filter-users-class" onchange="dashboard.modules.users.filterUsers()">
                        <option value="all">Toutes</option>
                        ${[...new Set(this.students.map(s => s.class).filter(c => c))].sort().map(cls => `<option value="${cls}">${cls}</option>`).join('')}
                    </select>
                </div>
            </div>

            <div class="users-actions">
                <button class="btn btn-primary" onclick="dashboard.modules.users.showAddUserModal()">
                    ➕ Ajouter un apprenant
                </button>
                <button class="btn btn-secondary" onclick="dashboard.modules.users.importFromExcel()">
                    📥 Importer depuis Excel
                </button>
                <button class="btn btn-secondary" onclick="dashboard.modules.users.exportToExcel()">
                    📤 Exporter vers Excel
                </button>
                <button class="btn btn-danger" onclick="dashboard.modules.users.deleteFilteredUsers()" id="btn-delete-filtered" style="display: none;">
                    🗑️ Supprimer les utilisateurs affichés
                </button>
            </div>

            <div class="users-table-container">
                <table class="users-table" id="users-table">
                    <thead>
                        <tr>
                            <th>Nom</th>
                            <th>Classe</th>
                            <th>Jeton</th>
                            <th>Dernière activité</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        if (this.students.length === 0) {
            html += `
                <tr>
                    <td colspan="5" class="empty-message">Aucun apprenant enregistré. Ajoutez des apprenants pour commencer.</td>
                </tr>
            `;
        } else {
            for (const student of this.students) {
                const lastActivity = await this.getLastActivity(student);
                html += `
                    <tr>
                        <td><strong>${student.name}</strong></td>
                        <td>${student.class || 'Non spécifié'}</td>
                        <td><code>${student.id}</code></td>
                        <td>${lastActivity}</td>
                        <td>
                            <button class="btn-action btn-edit" onclick="dashboard.modules.users.editUser('${student.id}')" title="Modifier">
                                ✏️
                            </button>
                            <button class="btn-action btn-delete" onclick="dashboard.modules.users.deleteUser('${student.id}')" title="Supprimer">
                                🗑️
                            </button>
                        </td>
                    </tr>
                `;
            }
        }

        html += `
                    </tbody>
                </table>
            </div>
        `;

        this.container.innerHTML = html;
    }

    async getLastActivity(student) {
        // Récupérer la progression de l'apprenant pour trouver la dernière activité
        const progress = await this.dashboard.getStudentProgress(student.id);
        let latestDate = null;

        if (progress && progress.chapters) {
            Object.values(progress.chapters).forEach(chapter => {
                if (chapter.updatedAt) {
                    const date = new Date(chapter.updatedAt);
                    if (!latestDate || date > latestDate) {
                        latestDate = date;
                    }
                }
            });
        }

        if (!latestDate) return 'Jamais';
        
        const now = new Date();
        const diffMs = now - latestDate;
        const diffMins = Math.round(diffMs / 60000);
        const diffHours = Math.round(diffMs / 3600000);
        const diffDays = Math.round(diffMs / 86400000);
        
        if (diffMins < 60) return `Il y a ${diffMins} min`;
        if (diffHours < 24) return `Il y a ${diffHours}h`;
        if (diffDays < 7) return `Il y a ${diffDays}j`;
        
        return latestDate.toLocaleDateString('fr-FR');
    }

    showAddUserModal() {
        const modalHtml = `
            <div class="modal-overlay" id="add-user-modal">
                <div class="modal-content" style="max-width: 500px;">
                    <div class="modal-header">
                        <h3>➕ Ajouter un apprenant</h3>
                        <button class="close-btn" onclick="dashboard.modules.users.closeModal('add-user-modal')">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form id="add-user-form" onsubmit="dashboard.modules.users.addUser(event)">
                            <div class="form-group">
                                <label for="student-name">Nom complet *</label>
                                <input type="text" id="student-name" name="name" required placeholder="Ex: Jean Dupont">
                            </div>
                            <div class="form-group">
                                <label for="student-class">Classe</label>
                                <input type="text" id="student-class" name="class" placeholder="Ex: 2nde A">
                            </div>
                            <div class="form-group">
                                <label for="student-id">Jeton (identifiant unique) *</label>
                                <input type="text" id="student-id" name="id" required placeholder="Ex: JETON123">
                                <small style="color: #666;">Le jeton est l'identifiant unique de l'apprenant. Il ne peut pas être modifié après création.</small>
                            </div>
                            <div class="form-actions">
                                <button type="button" class="btn btn-secondary" onclick="dashboard.modules.users.closeModal('add-user-modal')">Annuler</button>
                                <button type="submit" class="btn btn-primary">Ajouter l'apprenant</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    async addUser(event) {
        event.preventDefault();
        const form = event.target;
        const name = form.querySelector('#student-name').value.trim();
        const classValue = form.querySelector('#student-class').value.trim();
        const id = form.querySelector('#student-id').value.trim();

        if (!name) {
            alert('Le nom de l\'apprenant est obligatoire.');
            return;
        }

        if (!id) {
            alert('Le jeton (identifiant) est obligatoire.');
            return;
        }

        // Vérifier que le jeton n'existe pas déjà
        const users = await this.dashboard.auth.getUsers();
        if (users.some(u => u.id === id)) {
            alert('Ce jeton existe déjà. Chaque apprenant doit avoir un jeton unique.');
            return;
        }

        // Ajouter l'apprenant (pas de mot de passe, juste un jeton)
        const newUser = {
            id,
            name,
            class: classValue,
            type: 'student',
            createdAt: new Date().toISOString()
        };

        try {
            users.push(newUser);
            await this.dashboard.auth.saveUsers(users);

            this.closeModal('add-user-modal');
            alert(`✅ Apprenant ajouté avec succès !\n\nJeton: ${id}`);
            this.refresh();
        } catch (error) {
            console.error('❌ Erreur ajout apprenant:', error);
            alert('❌ Une erreur est survenue lors de l\'ajout de l\'apprenant.');
        }
    }

    async editUser(studentId) {
        const student = this.students.find(s => s.id === studentId);
        if (!student) return;

        const modalHtml = `
            <div class="modal-overlay" id="edit-user-modal">
                <div class="modal-content" style="max-width: 500px;">
                    <div class="modal-header">
                        <h3>✏️ Modifier l'apprenant</h3>
                        <button class="close-btn" onclick="dashboard.modules.users.closeModal('edit-user-modal')">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form id="edit-user-form" onsubmit="dashboard.modules.users.saveUser(event, '${studentId}')">
                            <div class="form-group">
                                <label for="edit-student-name">Nom complet *</label>
                                <input type="text" id="edit-student-name" name="name" value="${student.name}" required>
                            </div>
                            <div class="form-group">
                                <label for="edit-student-class">Classe</label>
                                <input type="text" id="edit-student-class" name="class" value="${student.class || ''}">
                            </div>
                            <div class="form-group">
                                <label>Jeton (identifiant unique)</label>
                                <input type="text" value="${student.id}" disabled style="background: #f0f0f0; cursor: not-allowed;">
                                <small style="color: #666;">Le jeton ne peut pas être modifié.</small>
                            </div>
                            <div class="form-actions">
                                <button type="button" class="btn btn-secondary" onclick="dashboard.modules.users.closeModal('edit-user-modal')">Annuler</button>
                                <button type="submit" class="btn btn-primary">Enregistrer</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    async saveUser(event, studentId) {
        event.preventDefault();
        const form = event.target;
        const name = form.querySelector('#edit-student-name').value.trim();
        const classValue = form.querySelector('#edit-student-class').value.trim();

        if (!name) {
            alert('Le nom de l\'apprenant est obligatoire.');
            return;
        }

        try {
            const users = await this.dashboard.auth.getUsers();
            const index = users.findIndex(u => u.id === studentId);
            if (index !== -1) {
                users[index] = { ...users[index], name, class: classValue };
                await this.dashboard.auth.saveUsers(users);

                this.closeModal('edit-user-modal');
                alert('✅ Apprenant modifié avec succès !');
                this.refresh();
            }
        } catch (error) {
            console.error('❌ Erreur modification apprenant:', error);
            alert('❌ Une erreur est survenue lors de la modification.');
        }
    }

    async deleteUser(studentId) {
        const student = this.students.find(s => s.id === studentId);
        if (!student) return;

        const confirmed = confirm(
            `⚠️ Supprimer l'apprenant "${student.name}" ?\n\n` +
            'Cette action est irréversible et supprimera :\n' +
            '• Le compte de l\'apprenant\n' +
            '• Toutes ses réponses et sa progression\n\n' +
            'Êtes-vous sûr de vouloir continuer ?'
        );

        if (!confirmed) return;

        try {
            const users = await this.dashboard.auth.getUsers();
            const filteredUsers = users.filter(u => u.id !== studentId);
            await this.dashboard.auth.saveUsers(filteredUsers);

            // Supprimer la progression de l'apprenant
            await storage.remove(`student_${studentId}_progress`);

            alert('✅ Apprenant supprimé avec succès !');
            this.refresh();
        } catch (error) {
            console.error('❌ Erreur suppression apprenant:', error);
            alert('❌ Une erreur est survenue lors de la suppression.');
        }
    }

    importFromExcel() {
        // Créer un input file temporaire
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.xlsx,.xls';
        input.onchange = (e) => this.handleExcelImport(e);
        input.click();
    }

    async handleExcelImport(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const data = new Uint8Array(await file.arrayBuffer());
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

            // Supposer que la première ligne est l'en-tête
            // Colonnes attendues: Nom, Classe, Jeton
            let importCount = 0;
            const users = await this.dashboard.auth.getUsers();

            for (let i = 1; i < jsonData.length; i++) {
                const row = jsonData[i];
                if (!row[0]) continue; // Skip les lignes vides

                const name = row[0]?.trim() || '';
                const classValue = row[1]?.trim() || '';
                const jeton = row[2]?.trim() || '';

                if (name && jeton) {
                    // Vérifier que le jeton n'existe pas déjà
                    if (!users.some(u => u.id === jeton)) {
                        users.push({
                            id: jeton,
                            name,
                            class: classValue,
                            type: 'student',
                            createdAt: new Date().toISOString()
                        });
                        importCount++;
                    }
                }
            }

            await this.dashboard.auth.saveUsers(users);
            alert(`✅ ${importCount} apprenant(s) importé(s) avec succès !`);
            this.refresh();
        } catch (error) {
            console.error('❌ Erreur import Excel:', error);
            alert('❌ Une erreur est survenue lors de l\'import Excel.');
        }
    }

    exportToExcel() {
        try {
            // Préparer les données pour l'export (RGPD compliant - pas d'email)
            const data = this.students.map(student => ({
                'Nom': student.name,
                'Classe': student.class || '',
                'Jeton': student.id,
                'Date création': student.createdAt ? new Date(student.createdAt).toLocaleDateString('fr-FR') : ''
            }));

            if (data.length === 0) {
                alert('Aucun apprenant à exporter.');
                return;
            }

            // Créer un nouveau workbook
            const ws = XLSX.utils.json_to_sheet(data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'apprenants');

            // Télécharger le fichier
            const fileName = `eleves_${new Date().toISOString().split('T')[0]}.xlsx`;
            XLSX.writeFile(wb, fileName);

            alert(`✅ ${data.length} apprenant(s) exporté(s) avec succès !`);
        } catch (error) {
            console.error('❌ Erreur export Excel:', error);
            alert('❌ Une erreur est survenue lors de l\'export Excel.');
        }
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.remove();
        }
    }

    async filterUsers() {
        const searchFilter = document.getElementById('filter-users-search').value.toLowerCase().trim();
        const classFilter = document.getElementById('filter-users-class').value;
        const deleteBtn = document.getElementById('btn-delete-filtered');

        let filtered = [...this.students];

        if (classFilter !== 'all') {
            filtered = filtered.filter(s => s.class === classFilter);
        }

        if (searchFilter !== '') {
            filtered = filtered.filter(s => 
                s.name.toLowerCase().includes(searchFilter) ||
                s.id.toLowerCase().includes(searchFilter)
            );
        }

        // Afficher / cacher le bouton supprimer filtrés
        if (deleteBtn) {
            deleteBtn.style.display = filtered.length > 0 && filtered.length < this.students.length ? 'inline-block' : 'none';
        }

        this.renderUsersTable(filtered);
    }

    async renderUsersTable(students) {
        const tbody = document.querySelector('#users-table tbody');
        
        if (students.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="empty-message">Aucun apprenant ne correspond à vos critères.</td>
                </tr>
            `;
            return;
        }

        let html = '';
        for (const student of students) {
                const lastActivity = await this.getLastActivity(student);
            html += `
                <tr>
                    <td><strong>${student.name}</strong></td>
                    <td>${student.class || 'Non spécifié'}</td>
                    <td><code>${student.id}</code></td>
                    <td>${lastActivity}</td>
                    <td>
                        <button class="btn-action btn-edit" onclick="dashboard.modules.users.editUser('${student.id}')" title="Modifier">
                            ✏️
                        </button>
                        <button class="btn-action btn-delete" onclick="dashboard.modules.users.deleteUser('${student.id}')" title="Supprimer">
                            🗑️
                        </button>
                    </td>
                </tr>
            `;
        }

        tbody.innerHTML = html;
    }

    async deleteFilteredUsers() {
        const searchFilter = document.getElementById('filter-users-search').value.toLowerCase().trim();
        const classFilter = document.getElementById('filter-users-class').value;

        let filtered = [...this.students];

        if (classFilter !== 'all') {
            filtered = filtered.filter(s => s.class === classFilter);
        }

        if (searchFilter !== '') {
            filtered = filtered.filter(s => 
                s.name.toLowerCase().includes(searchFilter) ||
                s.id.toLowerCase().includes(searchFilter)
            );
        }

        const confirmed = confirm(
            `⚠️ SUPPRESSION GROUPEE\n\n` +
            `Êtes-vous SÛR de vouloir supprimer ${filtered.length} apprenant(s) ?\n\n` +
            `Cette action est IRRÉVERSIBLE et supprimera définitivement ces comptes et toutes leurs progressions.`
        );

        if (!confirmed) return;

        try {
            const users = await this.dashboard.auth.getUsers();
            const idsToDelete = filtered.map(s => s.id);
            
            const remainingUsers = users.filter(u => !idsToDelete.includes(u.id));
            await this.dashboard.auth.saveUsers(remainingUsers);

            // Supprimer aussi toutes les progressions
            for (const student of filtered) {
                await storage.remove(`student_${student.id}_progress`);
            }

            alert(`✅ ${filtered.length} apprenant(s) supprimé(s) avec succès !`);
            this.refresh();
        } catch (error) {
            console.error('❌ Erreur suppression en masse:', error);
            alert('❌ Une erreur est survenue lors de la suppression.');
        }
    }
}
