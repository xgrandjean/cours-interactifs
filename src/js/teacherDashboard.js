/**
 * teacherDashboard.js - Contrôleur principal du tableau de bord formateur
 * Gère la navigation par onglets et l'initialisation des modules
 */

// Vérification de l'authentification formateur
if (sessionStorage.getItem('teacher_authenticated') !== 'true') {
    window.location.href = (window.BASE || '') + '/src/html/teacher-login.html';
}

// Classe principale du tableau de bord
class TeacherDashboard {
    constructor() {
        this.auth = new DataStorage();
        this.chapters = [];
        this.students = [];
        this.modules = {};
        this.currentTab = 'chapters';
        
        this.init();
    }

    async init() {    
        // Afficher le nom du formateur
        this.displayTeacherName();

        // Indicateur de connexion au storage
        this.updateStorageIndicator();

        // Toujours configurer la déconnexion
        this.setupLogout();

        // Configurer le changement de mot de passe
        this.setupPasswordChange();

        // ── Aucun parcours sélectionné → scanner les orphelins ──
        if (!window.currentParcoursSlug) {
            // ✅ Ne remplacer QUE le contenu #chapters-content, pas #tab-chapters (qui contient danger-zone)
            const contentDiv = document.getElementById('chapters-content');
            if (contentDiv) {
                contentDiv.innerHTML = `
                    <div style="display:flex; align-items:center; justify-content:center; min-height:200px;
                                color:#888; font-size:1.1rem; text-align:center; padding:2rem;">
                        <p>👆 Sélectionnez un parcours ci-dessus pour afficher son contenu.</p>
                    </div>`;
            }
            // Masquer le bouton "Réinitialiser tout"
            const resetBtn = document.getElementById('reset-all-progress-btn');
            if (resetBtn) resetBtn.style.display = 'none';
            // Scanner les parcours orphelins (attendre le résultat avant d'afficher)
            await this.scanOrphans();
            document.body.style.opacity = '1';
            return;
        }

        // Charger les chapitres
        await this.loadChapters();
        
        // Initialiser les modules
        this.initModules();
        
        // Configurer la navigation par onglets
        this.setupTabs();
        
        // Configurer les événements globaux
        this.setupEventListeners();
        
        // ✅ Restaurer l'onglet sauvegardé ou utiliser 'chapters' par défaut
        const savedTab = sessionStorage.getItem('teacher_active_tab');
        const defaultTab = (savedTab && ['chapters', 'users', 'submissions', 'students', 'stats'].includes(savedTab)) 
            ? savedTab 
            : 'chapters';
        
        await this.switchTab(defaultTab);

        // Un parcours est sélectionné → afficher la liste des étudiants
        const orphanSection = document.getElementById('orphan-section');
        if (orphanSection) orphanSection.style.display = 'none';
        await this.scanResetStudents();

        document.body.style.opacity = '1';
    }

    /**
     * Met à jour l'indicateur de connexion au storage
     * Affiche le provider réel derrière l'abstraction (Supabase / SQLite)
     * et une pastille verte (connecté) ou rouge (hors-ligne).
     *
     * Si le provider a fail (fallback localStorage), on affiche
     * le provider configuré en rouge pour montrer la réalité.
     */
    async updateStorageIndicator() {
        const dot = document.getElementById('storage-status-dot');
        const nameEl = document.getElementById('storage-provider-name');
        const textEl = document.getElementById('storage-status-text');
        if (!dot || !nameEl || !textEl) return;

        // Attendre que le storage soit initialisé (provider chargé)
        await storage.init();

        // 1. Déterminer le provider réel (derrière l'abstraction)
        const provider = window._storageProvider;
        let providerName = 'Inconnu';
        let isFallback = false;

        if (provider) {
            const ctorName = provider.constructor?.name;
            if (ctorName === 'SupabaseProvider') {
                providerName = 'Supabase';
            } else if (ctorName === 'SQLiteProvider') {
                providerName = 'SQLite';
            } else {
                // Fallback localStorage → lire la config pour savoir ce qui était demandé
                isFallback = true;
                providerName = await this._readConfiguredProvider();
            }
        } else {
            // Pas de provider du tout → lire la config
            isFallback = true;
            providerName = await this._readConfiguredProvider();
        }

        nameEl.textContent = providerName;

        // 2. Tester la connexion avec un timeout
        try {
            const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000));
            await Promise.race([storage.keys(), timeout]);

            // Succès → vert
            dot.style.background = '#2ecc71';
            textEl.textContent = 'Connecté';
            textEl.style.color = '#27ae60';

        } catch (err) {
            // Timeout ou erreur → rouge
            dot.style.background = '#e74c3c';
            textEl.textContent = isFallback ? 'Hors-ligne (fallback)' : 'Hors-ligne';
            textEl.style.color = '#e74c3c';
        }
    }

    /**
     * Lit le fichier config.json pour déterminer le provider configuré
     * Utilisé en fallback quand le provider réel est indisponible (localStorage)
     */
    async _readConfiguredProvider() {
        try {
            const configFile = window.IS_GITHUB_PAGES ? 'config.supabase.json' : 'config.json';
            const resp = await fetch((window.BASE || '') + '/storage/' + configFile);
            if (resp.ok) {
                const config = await resp.json();
                if (config.storage === 'supabase') return 'Supabase';
                if (config.storage === 'sqlite') return 'SQLite';
                return config.storage;
            }
            return 'localStorage';
        } catch {
            return 'localStorage';
        }
    }

    async displayTeacherName() {
        const display = document.getElementById('teacher-name-display');
        if (display) {
            const teacherName = sessionStorage.getItem('teacher_name');
            const role = sessionStorage.getItem('teacher_role') || 'formateur';
            const roleLabel = role === 'admin' ? 'Super Admin' : 'Formateur';
            const name = teacherName || (role === 'admin' ? 'Admin' : 'Formateur');
            display.innerHTML = `Connecté en tant que : <strong>${name}</strong> <span style="font-size:0.8rem; color:#888;">(${roleLabel})</span>`;
        }
    }

    async loadChapters() {
        const slug = window.currentParcoursSlug;
        const data = await staticJson.get('/parcours/cours.json');
        if (!data) {
            console.error(`❌ Erreur de chargement chapitres pour le parcours "${slug}"`);
            this.chapters = [];
            return;
        }
        const parcours = data.parcours.find(p => p.slug === slug);
        this.chapters = parcours ? parcours.chapitres : [];
    }
    
    initModules() {
        if (typeof TeacherChapters !== 'undefined') {
            this.modules.chapters = new TeacherChapters(this);
        }
        if (typeof TeacherUsers !== 'undefined') {
            this.modules.users = new TeacherUsers(this);
        }
        if (typeof TeacherSubmissions !== 'undefined') {
            this.modules.submissions = new TeacherSubmissions(this);
        }
        if (typeof TeacherStudents !== 'undefined') {
            this.modules.students = new TeacherStudents(this);
        }
        if (typeof TeacherStats !== 'undefined') {
            this.modules.stats = new TeacherStats(this);
        }
    }

    setupTabs() {
        const tabButtons = document.querySelectorAll('.tab-btn');
        tabButtons.forEach(btn => {
            btn.addEventListener('click', async () => {
                const tabId = btn.dataset.tab;
                await this.switchTab(tabId);
            });
        });
    }

    async switchTab(tabId) {
        // Sauvegarder l'onglet actif dans sessionStorage
        sessionStorage.setItem('teacher_active_tab', tabId);
        
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
        
        const activeBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
        const activePanel = document.getElementById(`tab-${tabId}`);
        
        if (activeBtn) activeBtn.classList.add('active');
        if (activePanel) activePanel.classList.add('active');
        
        this.currentTab = tabId;
        
        if (this.modules[tabId] && typeof this.modules[tabId].refresh === 'function') {
            await this.modules[tabId].refresh();
        }
    }
    
    setupPasswordChange() {
        const changeBtn = document.getElementById('change-password-btn');
        const modal = document.getElementById('change-password-modal');
        const newPwdInput = document.getElementById('new-password-input');
        const confirmPwdInput = document.getElementById('confirm-password-input');
        const saveBtn = document.getElementById('save-password-btn');
        const cancelBtn = document.getElementById('cancel-password-btn');

        if (!changeBtn || !modal) return;

        // Ouvrir la modale
        changeBtn.addEventListener('click', () => {
            newPwdInput.value = '';
            confirmPwdInput.value = '';
            modal.style.display = 'flex';
            newPwdInput.focus();
        });

        // Annuler
        const closeModal = () => {
            modal.style.display = 'none';
            newPwdInput.value = '';
            confirmPwdInput.value = '';
        };
        cancelBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        // Sauvegarder
        saveBtn.addEventListener('click', async () => {
            const newPassword = newPwdInput.value.trim();
            const confirmPassword = confirmPwdInput.value.trim();

            if (!newPassword) {
                alert('Veuillez entrer un nouveau mot de passe.');
                newPwdInput.focus();
                return;
            }
            if (newPassword.length < 6) {
                alert('Le mot de passe doit contenir au moins 6 caractères.');
                newPwdInput.focus();
                return;
            }
            if (newPassword !== confirmPassword) {
                alert('Les mots de passe ne correspondent pas.');
                confirmPwdInput.value = '';
                confirmPwdInput.focus();
                return;
            }

            try {
                // Stocker le mot de passe de manière globale (indépendant du parcours)
                await storage.set('teacher_password', newPassword);
                alert('✅ Mot de passe modifié avec succès !\n\nUtilisez ce nouveau mot de passe pour vos prochaines connexions.');
                closeModal();
            } catch (error) {
                console.error('❌ Erreur lors du changement de mot de passe:', error);
                alert('❌ Erreur lors de la sauvegarde du mot de passe.');
            }
        });

        // Permettre l'envoi avec Entrée
        const handleKeyDown = (e) => {
            if (e.key === 'Enter') {
                saveBtn.click();
            } else if (e.key === 'Escape') {
                closeModal();
            }
        };
        newPwdInput.addEventListener('keydown', handleKeyDown);
        confirmPwdInput.addEventListener('keydown', handleKeyDown);
    }

    setupLogout() {
        const logoutBtn = document.getElementById('logout-btn-header');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                sessionStorage.removeItem('teacher_authenticated');
                sessionStorage.removeItem('teacher_active_tab'); // ✅ Nettoyer
                window.location.href = (window.BASE || '') + '/src/html/teacher-login.html';
            });
        }
    }

    setupEventListeners() {
        const resetBtn = document.getElementById('reset-all-progress-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', async () => this.resetAllProgress());
        }
    }
    
    async scanOrphans() {
        const orphanSection = document.getElementById('orphan-section');
        const orphanList = document.getElementById('orphan-list');
        const purgeBtn = document.getElementById('purge-orphans-btn');
        const dangerZone = document.getElementById('danger-zone-container');
        const subtitle = document.getElementById('danger-zone-subtitle');
        if (!orphanSection || !orphanList || !purgeBtn) return;

        // Rendre la zone de danger visible (elle est masquée au départ pour éviter le flash)
        if (dangerZone) dangerZone.style.display = 'block';

        try {
            // Charger les slugs valides depuis cours.json
            const data = await staticJson.get('/parcours/cours.json');
            const validSlugs = data ? data.parcours.map(p => p.slug) : [];

            // Scanner toutes les clés du storage
            const allKeys = await storage.keys();

            // Extraire tous les slugs utilisés dans les clés (format: slug:...)
            const usedSlugs = new Set();
            allKeys.forEach(key => {
                const parts = key.split(':');
                if (parts.length >= 2 && parts[0]) {
                    usedSlugs.add(parts[0]);
                }
            });

            // Filtrer : slugs orphelins = utilisés mais pas dans la liste valide
            const orphanSlugs = Array.from(usedSlugs).filter(slug =>
                !validSlugs.includes(slug) && slug !== '_static' && slug !== '_sync_queue'
            );

            // Appliquer le style de fond sur la zone de danger
            if (dangerZone) {
                if (orphanSlugs.length === 0) {
                    dangerZone.style.background = '#eafaf1';
                    dangerZone.style.borderLeftColor = '#27ae60';
                    dangerZone.style.padding = '1rem';
                } else {
                    dangerZone.style.background = '#fdedec';
                    dangerZone.style.borderLeftColor = '#e74c3c';
                    dangerZone.style.padding = '1rem';
                }
            }
            if (subtitle) {
                subtitle.textContent = 'Aucun parcours sélectionné. Scannez les données orphelines ci-dessous.';
            }

            if (orphanSlugs.length === 0) {
                orphanSection.style.display = 'block';
                orphanList.innerHTML = '<p style="color:#27ae60; font-weight:600;">✅ Aucun parcours orphelin détecté. Toutes les données sont propres.</p>';
                purgeBtn.style.display = 'none';
                return;
            }

            // Pour chaque orphelin, compter les clés et utilisateurs
            const orphanData = [];
            for (const slug of orphanSlugs) {
                const keys = allKeys.filter(k => k.startsWith(slug + ':'));
                const userTokens = new Set();
                keys.forEach(k => {
                    const parts = k.split(':');
                    if (parts.length >= 2 && parts[1] !== 'teacher' && parts[1] !== 'config') {
                        userTokens.add(parts[1]);
                    }
                });
                orphanData.push({ slug, keyCount: keys.length, userCount: userTokens.size });
            }

            // Afficher
            orphanSection.style.display = 'block';
            orphanList.innerHTML = `
                <p style="color:#e74c3c; font-weight:600;">⚠️ ${orphanData.length} parcours orphelin(s) trouvé(s)</p>
                ${orphanData.map(o => `
                    <label style="display:block; background:#fef9e7; padding:0.75rem 1rem; border-radius:6px; margin:0.5rem 0; cursor:pointer;">
                        <input type="checkbox" class="orphan-checkbox" data-slug="${o.slug}" checked>
                        <strong>${o.slug}</strong> — ${o.keyCount} clé(s) de données, ${o.userCount} utilisateur(s) concerné(s)
                    </label>
                `).join('')}
            `;
            purgeBtn.style.display = 'inline-block';

            // Remplacer l'ancien listener pour éviter les doublons
            const newPurgeBtn = purgeBtn.cloneNode(true);
            purgeBtn.parentNode.replaceChild(newPurgeBtn, purgeBtn);
            newPurgeBtn.addEventListener('click', () => this.purgeOrphans());

        } catch (error) {
            console.error('❌ Erreur scan orphelins:', error);
            orphanSection.style.display = 'block';
            orphanList.innerHTML = `<p style="color:#e74c3c;">❌ Erreur lors du scan : ${error.message}</p>`;
        }
    }

    async scanResetStudents() {
        const slug = window.currentParcoursSlug;
        if (!slug) return;

        const dangerZone = document.getElementById('danger-zone-container');
        const subtitle = document.getElementById('danger-zone-subtitle');
        const resetSection = document.getElementById('reset-section');
        const resetList = document.getElementById('reset-students-list');
        const resetBtn = document.getElementById('reset-selected-btn');
        if (!dangerZone || !resetSection || !resetList || !resetBtn) return;

        // Rendre la zone visible IMMÉDIATEMENT (avant tout await)
        dangerZone.style.display = 'block';
        dangerZone.style.background = '';
        dangerZone.style.borderLeftColor = '';
        dangerZone.style.padding = '1rem';
        resetSection.style.display = 'block';
        resetList.innerHTML = '<p style="color:#888;">🔍 Scan des progressions en cours...</p>';

        try {
            // Charger les utilisateurs pour avoir nom + classe
            const usersKey = slug + ':teacher:users_list';
            const users = await storage.get(usersKey) || [];
            const userMap = {};
            users.forEach(u => { userMap[u.id] = u; });

            const prefix = slug + ':';
            const allKeys = await storage.keys();

            // Filtrer les clés de progression (exclure _guest)
            const progressKeys = allKeys.filter(k =>
                k.startsWith(prefix) && k.includes(':student_') && k.endsWith('_progress') && !k.includes(':_guest:')
            );

            if (progressKeys.length === 0) {
                subtitle.textContent = 'Gestion des progressions du parcours — aucune progression enregistrée.';
                resetList.innerHTML = '<p style="color:#27ae60; font-weight:600;">✅ Aucune progression enregistrée pour ce parcours.</p>';
                resetBtn.style.display = 'none';
                return;
            }

            subtitle.textContent = 'Gestion des progressions du parcours — sélectionnez les étudiants à réinitialiser.';

            // Construire la liste des étudiants avec stats
            const students = [];
            for (const key of progressKeys) {
                const parts = key.split(':');
                const token = parts[1];
                const user = userMap[token] || { name: token, class: '—' };
                const progress = await storage.get(key).catch(() => null);
                let chapterCount = 0;
                let completedCount = 0;
                let status = 'Aucun';
                if (progress && progress.chapters) {
                    const chs = Object.values(progress.chapters);
                    chapterCount = chs.length;
                    completedCount = chs.filter(c => c.completed || c.submissionStatus === 'validated').length;
                    const latest = chs.find(c => c.submissionStatus && c.submissionStatus !== 'not_started');
                    if (latest) status = latest.submissionStatus;
                }
                students.push({ token, name: user.name, class: user.class, key, chapterCount, completedCount, status });
            }

            // Afficher
            resetList.innerHTML = `
                <p style="color:#e74c3c; font-weight:600;">⚠️ ${students.length} étudiant(s) avec progression</p>
                ${students.map(s => `
                    <label style="display:block; background:#fef9e7; padding:0.75rem 1rem; border-radius:6px; margin:0.5rem 0; cursor:pointer;">
                        <input type="checkbox" class="reset-student-checkbox" data-token="${s.token}" checked>
                        <strong>${s.name}</strong> <span style="font-size:0.85rem; color:#888;">(${s.class})</span>
                        <span style="display:block; font-size:0.8rem; color:#888; margin-top:0.25rem;">
                            ${s.chapterCount} chapitre(s) (${s.completedCount} complété(s)) — statut : ${s.status}
                        </span>
                    </label>
                `).join('')}
                <label style="display:block; margin-top:0.75rem; font-size:0.9rem; cursor:pointer;">
                    <input type="checkbox" id="select-all-students" checked> Tout sélectionner / désélectionner
                </label>
            `;
            resetBtn.style.display = 'inline-block';

            // Gérer le "tout sélectionner"
            const selectAll = document.getElementById('select-all-students');
            if (selectAll) {
                selectAll.addEventListener('change', () => {
                    document.querySelectorAll('.reset-student-checkbox').forEach(cb => cb.checked = selectAll.checked);
                });
            }

            // Remplacer l'ancien listener
            const newResetBtn = resetBtn.cloneNode(true);
            resetBtn.parentNode.replaceChild(newResetBtn, resetBtn);
            newResetBtn.addEventListener('click', () => this.resetSelectedProgress());

        } catch (error) {
            console.error('❌ Erreur scan étudiants:', error);
            resetList.innerHTML = `<p style="color:#e74c3c;">❌ Erreur lors du scan : ${error.message}</p>`;
        }
    }

    async purgeOrphans() {
        const checkboxes = document.querySelectorAll('.orphan-checkbox:checked');
        if (checkboxes.length === 0) {
            alert('Veuillez sélectionner au moins un parcours à purger.');
            return;
        }

        const slugsToPurge = Array.from(checkboxes).map(cb => cb.dataset.slug);
        const msg = `⚠️ ATTENTION - Action Irréversible\n\n` +
            `Êtes-vous sûr de vouloir purger les données des ${slugsToPurge.length} parcours orphelins suivants ?\n\n` +
            slugsToPurge.map(s => `• ${s}`).join('\n') + `\n\n` +
            `Cela supprimera TOUTES les progressions, utilisateurs et configurations associés.`;

        if (!confirm(msg)) return;
        if (!confirm('⚠️ DEUXIÈME CONFIRMATION\n\nVoulez-vous VRAIMENT purger ces données ? Cette action est irréversible.')) return;

        try {
            const allKeys = await storage.keys();
            let totalDeleted = 0;

            for (const slug of slugsToPurge) {
                const prefix = slug + ':';
                const keysToDelete = allKeys.filter(k => k.startsWith(prefix));
                for (const key of keysToDelete) {
                    await storage.remove(key);
                    totalDeleted++;
                }
            }

            alert(`✅ Purge terminée !\n\n${totalDeleted} clé(s) supprimée(s) pour ${slugsToPurge.length} parcours orphelin(s).`);

            // Rescanner
            this.scanOrphans();

        } catch (error) {
            console.error('❌ Erreur purge:', error);
            alert('❌ Une erreur est survenue lors de la purge.');
        }
    }

    async resetSelectedProgress() {
        const checkboxes = document.querySelectorAll('.reset-student-checkbox:checked');
        if (checkboxes.length === 0) {
            alert('Veuillez sélectionner au moins un étudiant.');
            return;
        }

        const tokens = Array.from(checkboxes).map(cb => cb.dataset.token);
        const slug = window.currentParcoursSlug;
        if (!slug) return;

        // Charger les utilisateurs pour afficher nom + classe
        const usersKey = slug + ':teacher:users_list';
        const users = await storage.get(usersKey) || [];
        const userMap = {};
        users.forEach(u => { userMap[u.id] = u; });

        const studentLines = tokens.map(t => {
            const u = userMap[t];
            return u ? `• ${u.name} (${u.class})` : `• ${t}`;
        });

        const msg = `⚠️ ATTENTION - Action Irréversible\n\n` +
            `Êtes-vous sûr de vouloir réinitialiser la progression de ${tokens.length} étudiant(s) ?\n\n` +
            studentLines.join('\n') + `\n\n` +
            `Cela effacera toutes leurs réponses, scores et historiques de tentatives.`;

        if (!confirm(msg)) return;
        if (!confirm('⚠️ DEUXIÈME CONFIRMATION\n\nVoulez-vous VRAIMENT réinitialiser ces progressions ? Cette action est irréversible.')) return;

        try {
            const prefix = slug + ':';
            let totalDeleted = 0;

            for (const token of tokens) {
                // Supprimer la progression
                const progKey = `${prefix}${token}:student_${token}_progress`;
                await storage.remove(progKey);
                totalDeleted++;

                // Supprimer les tentatives associées
                const allKeys = await storage.keys();
                const attemptKeys = allKeys.filter(k =>
                    k.startsWith(prefix) && k.includes('question_attempts_') && k.includes(token)
                );
                for (const key of attemptKeys) {
                    await storage.remove(key);
                    totalDeleted++;
                }
            }

            alert(`✅ Réinitialisation terminée !\n\n${totalDeleted} clé(s) supprimée(s) pour ${tokens.length} étudiant(s).`);

            // Rescanner
            this.scanResetStudents();

        } catch (error) {
            console.error('❌ Erreur réinitialisation:', error);
            alert('❌ Une erreur est survenue lors de la réinitialisation.');
        }
    }

    async resetAllProgress() {
        const confirmed = confirm(
            '⚠️ ATTENTION - Action Irréversible\n\n' +
            'Êtes-vous sûr de vouloir réinitialiser TOUTES les progressions de TOUS les apprenants ?\n\n' +
            'Cela effacera :\n' +
            '• Toutes les réponses aux questions\n' +
            '• Tous les scores et statistiques\n' +
            '• Tous les chapitres complétés\n' +
            '• Tout l\'historique des tentatives\n\n' +
            'Cette action ne peut pas être annulée.'
        );
        
        if (!confirmed) return;
        
        const doubleConfirmed = confirm(
            '⚠️ DEUXIÈME CONFIRMATION\n\n' +
            'Voulez-vous VRAIMENT tout effacer ?\n' +
            'Cliquez sur OK pour confirmer la réinitialisation complète.'
        );
        
        if (!doubleConfirmed) return;
        
        try {
            const slug = window.currentParcoursSlug;
            if (!slug) {
                alert('Aucun parcours sélectionné');
                return;
            }
            const prefix = `${slug}:`;
            
            const allKeys = await storage.keys();
            
            // ✅ Supprimer toutes les clés de progression des élèves (format: slug:studentId:student_..._progress)
            const progressKeys = allKeys.filter(key => 
                key.startsWith(prefix) && 
                key.includes(':student_') && 
                key.endsWith('_progress')
            );
            
            for (const key of progressKeys) {
                await storage.remove(key);
                console.log(`🗑️ Supprimé : ${key}`);
            }
            
            // ✅ (Optionnel) Supprimer également les anciennes clés sans slug (héritage)
            const legacyKeys = allKeys.filter(key => 
                key.startsWith('student_') && key.endsWith('_progress') && !key.includes(':')
            );
            for (const key of legacyKeys) {
                await storage.remove(key);
            }
            
            // ✅ Supprimer les tentatives (si elles existent sous forme de clés séparées)
            const attemptKeys = allKeys.filter(key => 
                key.startsWith(prefix) && key.includes('question_attempts_')
            );
            for (const key of attemptKeys) {
                await storage.remove(key);
            }
            
            // ✅ Supprimer les configurations spécifiques au parcours (optionnel)
            await storage.remove(prefix + 'chapter_config');
            await storage.remove(prefix + 'question_attempts');
            await storage.remove(prefix + 'userAnswers');
            await storage.remove(prefix + 'userProgress');
            await storage.remove(prefix + 'courseProgress');
            await storage.remove(prefix + 'course_progress');
            
            alert(
                `✅ Réinitialisation terminée !\n\n` +
                `${progressKeys.length} progressions apprenants ont été effacées.\n` +
                `${attemptKeys.length} historiques de tentatives ont été effacés.\n\n` +
                'Les apprenants peuvent maintenant recommencer les chapitres depuis le début.'
            );
            
            // Rafraîchir tous les modules
            Object.values(this.modules).forEach(module => {
                if (typeof module.refresh === 'function') {
                    module.refresh();
                }
            });
            
        } catch (error) {
            console.error('❌ Erreur réinitialisation:', error);
            alert('❌ Une erreur est survenue lors de la réinitialisation.');
        }
    }
    async getStudents() {
        const slug = window.currentParcoursSlug;
        if (!slug) return [];
        const usersKey = `${slug}:teacher:users_list`;
        const users = await storage.get(usersKey) || [];
        return users.filter(u => u.type === 'student');
    }

    async getStudentProgress(studentId) {
        const slug = window.currentParcoursSlug;
        if (!slug) return {};
        const key = `${slug}:${studentId}:student_${studentId}_progress`;
        const data = await storage.get(key);
        return data || {
            chapters: {},
            scores: {},
            totalCompleted: 0,
            questionAttempts: {}
        };
    }
    async getChapterConfig(chapterId) {
        const slug = window.currentParcoursSlug;
        if (!slug) return { locked: false, endDate: null, dateLimitEnabled: false, examMode: false };
        
        const configKey = `${slug}:config:chapter_config`;
        const config = await storage.get(configKey);
        if (!config) {
            return { locked: false, endDate: null, dateLimitEnabled: false, examMode: false };
        }
        return config[chapterId] || { locked: false, endDate: null, dateLimitEnabled: false, examMode: false };
    }

    async updateChapterConfig(chapterId, newConfig) {
        const slug = window.currentParcoursSlug;
        if (!slug) return;
        
        const configKey = `${slug}:config:chapter_config`;
        const currentConfig = await storage.get(configKey);
        let chapterConfig = currentConfig || {};
        chapterConfig[chapterId] = { ...chapterConfig[chapterId], ...newConfig };
        await storage.set(configKey, chapterConfig);
    }

    showStudentChapterView(studentId, chapterId) {
        if (this.modules.submissions && typeof this.modules.submissions.showStudentChapterView === 'function') {
            this.modules.submissions.showStudentChapterView(studentId, chapterId);
        }
    }

    openCorrectionModal(studentId, chapterId) {
        if (this.modules.submissions && typeof this.modules.submissions.openCorrectionModal === 'function') {
            this.modules.submissions.openCorrectionModal(studentId, chapterId);
        }
    }

    async updateSubmissionStatus(studentId, chapterId, newStatus) {
        try {
            const progress = await this.getStudentProgress(studentId);

            if (!progress.chapters[chapterId]) {
                progress.chapters[chapterId] = {
                    questions: {},
                    completionPercent: 0,
                    finalScore: 0
                };
            }

            const chapter = progress.chapters[chapterId];

            // Mettre à jour le statut
            chapter.submissionStatus = newStatus;
            // ❌ NE PAS METTRE A JOUR updatedAt !
            // Cette date est réservée EXCLUSIVEMENT aux actions de l'apprenant lui-même.
            // Les actions formateur ne doivent pas modifier la date de dernière activité de l'apprenant.

            // Ajouter des métadonnées selon le statut
            if (newStatus === 'submitted' || newStatus === 'late_submitted') {
                chapter.submittedAt = chapter.submittedAt || new Date().toISOString();
            } else if (newStatus === 'validated') {
                chapter.validatedAt = new Date().toISOString();
                chapter.completed = true;
            } else if (newStatus === 'returned_for_revision') {
                chapter.returnedAt = new Date().toISOString();
            }

            // Sauvegarder les modifications
            const slug = window.currentParcoursSlug;
            const key = slug ? `${slug}:${studentId}:student_${studentId}_progress` : `student_${studentId}_progress`;
            await storage.set(key, progress);
                        
            return true;
        } catch (error) {
            console.error('❌ Erreur lors de la mise à jour du statut:', error);
            alert('❌ Une erreur est survenue lors de la mise à jour du statut.');
            return false;
        }
    }
}

// Initialisation au chargement du DOM
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new TeacherDashboard();
});