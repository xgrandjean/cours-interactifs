// ============================================================================
// SUIVI ATELIER - Outil de validation en main propre (mode Atelier AR)
// ============================================================================
// Page formateur autonome, pensée pour un téléphone en atelier : on saisit le code
// de validation de l'apprenant, on voit son travail, on met des points et un mot,
// on obtient l'AR à lui dicter.
//
// ⚠️ RÈGLE D'ARCHITECTURE — cet outil parle au stockage et aux données du cours,
//    JAMAIS au tableau de bord. C'est cette indépendance, et elle seule, qui
//    permettra de l'emballer plus tard en application mobile. Ne pas y importer
//    correctionModal ni teacherDashboard.
//
//    progressManager.js, lui, est admis : c'est le MODÈLE de progression, même couche
//    que storage et atelierCodes, sans effet de bord au chargement. Réimplémenter son
//    recalcul de chapitre ici produirait deux vérités qui dériveraient.
//
// DEUX CHEMINS DE CORRECTION, à ne pas confondre :
//   • le rituel AR (_emettre) — champs d'attente arPoints/arAppreciation, promus en
//     points par la saisie de l'AR chez l'apprenant. La lenteur y est le dispositif.
//   • la correction directe (_enregistrerDirect) — teacherScore/teacherComment écrits
//     tout de suite, exactement comme depuis le tableau de bord après le rendu.
//     Silencieuse pour l'apprenant : corriger ne peut pas rendre un chapitre "validated".
//
// On y entre par le code dicté, par la liste, ou en lisant la charge d'un QRCode de
// question (_ouvrirCharge) — voir "qrcode question.md".
//
// Voir "mode atelier AR.md" §3.3.
// ============================================================================

// Même valeur que AtelierQuestion.REGLE_HORS_CONSIGNE. Elle est redéclarée plutôt
// qu'importée : cette page ne charge pas la vue apprenant, et n'a pas à la charger.
const REGLE_HORS_CONSIGNE = 'texte(10)';

const SuiviAtelier = {

    MOT_DE_PASSE_DEFAUT: 'XSedu',

    slug: null,
    formateur: 'Formateur',
    contexte: null,   // question en cours d'évaluation
    flux: null,       // flux caméra en cours, à couper en quittant l'écran de scan
    _lectureEnCours: false,   // une charge est en cours de résolution
    _decodeur: null,  // chargement du décodeur de QRCode, à la demande

    // ------------------------------------------------------------------------
    // AMORÇAGE
    // ------------------------------------------------------------------------

    async init() {
        this.slug = new URLSearchParams(window.location.search).get('parcours') || '';
        this._brancher();

        if (sessionStorage.getItem('teacher_authenticated') !== 'true') {
            this._ecran('acces');
            this._indicerMotDePasseParDefaut();
            return;
        }
        await this._chargerIdentite();

        if (!this.slug) return this._parcours();
        this._ecran('code');
    },

    _brancher() {
        document.getElementById('form-acces').addEventListener('submit', (e) => {
            e.preventDefault();
            this._connecter();
        });
        document.getElementById('form-code').addEventListener('submit', (e) => {
            e.preventDefault();
            this._chercherCode();
        });
        document.getElementById('form-code-direct').addEventListener('submit', (e) => {
            e.preventDefault();
            this._chercherCodeDirect();
        });
        document.getElementById('btn-changer-parcours').addEventListener('click', () => {
            window.location.search = '';
        });
        document.getElementById('lien-repli').addEventListener('click', () => this._repli());
        document.getElementById('form-eval').addEventListener('submit', (e) => {
            e.preventDefault();
            this._emettre();
        });
        document.getElementById('btn-direct').addEventListener('click', () => this._enregistrerDirect());
        document.querySelectorAll('.lien-scan').forEach(lien => {
            lien.addEventListener('click', () => this._scan());
        });
        document.getElementById('form-charge').addEventListener('submit', (e) => {
            e.preventDefault();
            this._ouvrirCharge(document.getElementById('champ-charge').value);
        });
        document.getElementById('btn-scan-demarrer')
            .addEventListener('click', () => this._demarrerCamera());
        document.getElementById('lien-commentaire-chapitre').addEventListener('click', () => {
            const bloc = document.getElementById('bloc-commentaire-chapitre');
            bloc.hidden = !bloc.hidden;
        });
        document.getElementById('btn-commentaire-chapitre')
            .addEventListener('click', () => this._enregistrerCommentaireChapitre());
        document.querySelectorAll('[data-retour-code]').forEach(bouton => {
            bouton.addEventListener('click', () => this._ecran('code'));
        });
        document.getElementById('btn-deconnexion').addEventListener('click', () => {
            sessionStorage.removeItem('teacher_authenticated');
            window.location.reload();
        });
    },

    /** Affiche un seul écran à la fois — l'outil est une suite de gestes, pas un menu. */
    _ecran(nom) {
        document.querySelectorAll('.ecran').forEach(bloc => {
            bloc.hidden = bloc.dataset.ecran !== nom;
        });
        document.getElementById('barre-formateur').hidden = (nom === 'acces');
        if (nom === 'code') {
            const champ = document.getElementById('champ-code');
            champ.value = '';
            champ.focus();
        }
        if (nom === 'parcours') {
            const champ = document.getElementById('champ-code-direct');
            champ.value = '';
            champ.focus();
        }
        // La caméra ne survit pas au départ de son écran : une lampe témoin qui reste
        // allumée dans une salle de classe est un problème en soi.
        if (nom !== 'scan') this._couperCamera();
    },

    /**
     * Zone de message de l'écran ACTUELLEMENT visible.
     *
     * `_ouvrir()` est atteint depuis six endroits — le code dicté, le code direct, le
     * scan, le collage, la liste, et les autres consignes d'un même apprenant. Elle
     * écrivait ses erreurs dans `msg-code`, qui vit sur le seul écran du code : cinq fois
     * sur six le message tombait dans une section masquée. Le pire cas était le scan —
     * la caméra se coupait, le champ se vidait, et rien ne s'affichait.
     */
    _zoneMessage() {
        const visible = [...document.querySelectorAll('.ecran')]
            .find(bloc => !bloc.hidden)?.dataset.ecran;
        return ({
            acces:    'msg-acces',
            code:     'msg-code',
            parcours: 'msg-code-direct',
            scan:     'msg-scan',
            repli:    'msg-repli',
            eval:     'msg-eval',
            ar:       'msg-eval'
        })[visible] || 'msg-code';
    },

    _message(id, texte, type = 'erreur') {
        const zone = document.getElementById(id);
        zone.textContent = texte || '';
        zone.className = `sa-message sa-message-${type}`;
    },

    // ------------------------------------------------------------------------
    // ACCÈS — même mécanisme que teacher-login.html, volontairement
    // ------------------------------------------------------------------------

    async _connecter() {
        const saisie = document.getElementById('champ-mdp').value.trim();

        if (await estJetonRecuperation(saisie)) {
            sessionStorage.removeItem('teacher_login_echecs');
            return this._accesAccorde('Admin');
        }

        let motDePasseEnregistre = null;
        try { motDePasseEnregistre = await storage.get('teacher_password'); } catch (_) {}

        if (motDePasseEnregistre && saisie === motDePasseEnregistre) {
            sessionStorage.removeItem('teacher_login_echecs');
            return this._accesAccorde();
        }
        if (!motDePasseEnregistre && saisie === this.MOT_DE_PASSE_DEFAUT) {
            sessionStorage.removeItem('teacher_login_echecs');
            return this._accesAccorde();
        }

        // Après 3 échecs sur un mot de passe personnalisé oublié, uniquement depuis
        // XSpro (IS_ELECTRON — seul signal fiable, cf. mode atelier AR.md) : proposer
        // une réinitialisation en un clic, sans fenêtre supplémentaire.
        if (window.IS_ELECTRON && motDePasseEnregistre) {
            const echecs = (parseInt(sessionStorage.getItem('teacher_login_echecs'), 10) || 0) + 1;
            sessionStorage.setItem('teacher_login_echecs', String(echecs));
            if (echecs >= 3) return this._proposerReinitialisation();
        }

        this._message('msg-acces', 'Mot de passe incorrect.');
        document.getElementById('champ-mdp').value = '';
    },

    /**
     * Mot de passe encore par défaut ? Le dire tout de suite, avant même une tentative
     * de connexion — uniquement depuis XSpro, jamais sur le site déployé.
     */
    async _indicerMotDePasseParDefaut() {
        if (!window.IS_ELECTRON) return;
        let motDePasseEnregistre = null;
        try { motDePasseEnregistre = await storage.get('teacher_password'); } catch (_) { return; }
        if (motDePasseEnregistre) return;
        this._message('msg-acces',
            `🔑 Mot de passe encore par défaut (${this.MOT_DE_PASSE_DEFAUT}) — pensez à le changer depuis le tableau de bord.`,
            'info');
    },

    async _proposerReinitialisation() {
        this._message('msg-acces', 'Mot de passe incorrect.');
        document.getElementById('champ-mdp').value = '';

        if (document.getElementById('btn-reset-mdp')) return;
        const bouton = document.createElement('button');
        bouton.type = 'button';
        bouton.id = 'btn-reset-mdp';
        bouton.className = 'sa-bouton';
        bouton.textContent = `🔄 Réinitialiser au mot de passe par défaut (${this.MOT_DE_PASSE_DEFAUT})`;
        bouton.addEventListener('click', async () => {
            await storage.remove('teacher_password');
            sessionStorage.removeItem('teacher_login_echecs');
            await this._accesAccorde();
        });
        document.getElementById('msg-acces').insertAdjacentElement('afterend', bouton);
    },

    async _accesAccorde(nom) {
        sessionStorage.setItem('teacher_authenticated', 'true');
        if (nom) sessionStorage.setItem('teacher_name', nom);
        await this._chargerIdentite();
        if (!this.slug) return this._parcours();
        this._ecran('code');
    },

    /**
     * Le nom du formateur est affiché en permanence : cet outil tournera sur des
     * appareils partagés, et c'est lui qui signera les AR émis.
     */
    async _chargerIdentite() {
        let nom = sessionStorage.getItem('teacher_name');
        if (!nom) {
            try { nom = await storage.get('teacher_name'); } catch (_) {}
        }
        this.formateur = nom || 'Formateur';
        document.getElementById('nom-formateur').textContent = this.formateur;
        document.getElementById('nom-parcours').textContent =
            this.slug ? await this._libelleParcours(this.slug) : '—';
    },

    /**
     * Titre lisible d'un parcours pour l'en-tête.
     *
     * ⚠️ Ce commentaire affirmait qu'une republication en cours d'atelier « se voit tout
     * de suite » parce que cours.json ne serait pas mis en cache ici. C'est faux :
     * staticJson.get() met en cache POUR TOUTE LA SESSION (voir storage.js), et les cinq
     * lecteurs de cours.json de ce fichier partagent le même objet. Une republication ne
     * se voit qu'après rechargement de la page — pour tout le monde, y compris au moment
     * de noter. À garder en tête si l'on retouche un parcours pendant un atelier.
     */
    async _libelleParcours(slug) {
        const donnees = await staticJson.get('/parcours/cours.json');
        const parcours = (donnees && Array.isArray(donnees.parcours)) ? donnees.parcours : [];
        return parcours.find(p => p.slug === slug)?.label || slug;
    },

    // ------------------------------------------------------------------------
    // CHOIX DU PARCOURS — une fois par session
    // ------------------------------------------------------------------------

    async _parcours() {
        this._ecran('parcours');
        const liste = document.getElementById('liste-parcours');
        liste.innerHTML = '<p>Chargement…</p>';

        const donnees = await staticJson.get('/parcours/cours.json');
        const parcours = (donnees && Array.isArray(donnees.parcours)) ? donnees.parcours : [];

        if (!parcours.length) {
            liste.innerHTML = '<p class="sa-message sa-message-erreur">Aucun parcours publié.</p>';
            return;
        }

        liste.innerHTML = '';
        parcours.forEach(p => {
            const bouton = document.createElement('button');
            bouton.type = 'button';
            bouton.className = 'sa-choix';
            bouton.textContent = p.label || p.slug;
            bouton.addEventListener('click', () => {
                window.location.search = `?parcours=${encodeURIComponent(p.slug)}`;
            });
            liste.appendChild(bouton);
        });
    },

    // ------------------------------------------------------------------------
    // RÉSOLUTION DU CODE
    // ------------------------------------------------------------------------

    async _chercherCode() {
        const code = AtelierCodes.normaliser(document.getElementById('champ-code').value);

        if (code.length !== AtelierCodes.LONGUEUR_CODE_VALIDATION) {
            return this._message('msg-code', `Un code de validation compte ${AtelierCodes.LONGUEUR_CODE_VALIDATION} caractères.`);
        }

        this._message('msg-code', 'Recherche…', 'attente');
        const ticket = await storage.get(AtelierCodes.cleCodeValidation(this.slug, code));

        if (!ticket) {
            return this._message('msg-code',
                'Code inconnu pour ce parcours. Si le réseau vient de tomber, passez par la liste des apprenants.');
        }

        this._message('msg-code', '');
        await this._ouvrir(ticket.token, ticket.chapitreId, ticket.questionId, code);
    },

    /**
     * Retrouve un code sans connaître le parcours au préalable — le code est une adresse
     * pure (30 bits d'aléa, cf. atelierCodes.js), le lien vers le parcours n'existe que
     * dans la clé de stockage qui le porte (slug:atelier:code_XXX). Il faut donc balayer
     * les clés plutôt que lire une clé connue — même principe que simulation.js.purger().
     */
    async _chercherCodeDirect() {
        const code = AtelierCodes.normaliser(document.getElementById('champ-code-direct').value);

        if (code.length !== AtelierCodes.LONGUEUR_CODE_VALIDATION) {
            return this._message('msg-code-direct', `Un code de validation compte ${AtelierCodes.LONGUEUR_CODE_VALIDATION} caractères.`);
        }

        this._message('msg-code-direct', 'Recherche…', 'attente');

        const suffixe = `:atelier:code_${code}`;
        let cles = [];
        try { cles = await storage.keys() || []; } catch (_) {}
        const cle = cles.find(k => k.endsWith(suffixe));
        const ticket = cle ? await storage.get(cle) : null;

        if (!ticket) {
            return this._message('msg-code-direct', 'Code introuvable.');
        }

        this.slug = cle.slice(0, cle.length - suffixe.length);
        window.history.replaceState(null, '', `?parcours=${encodeURIComponent(this.slug)}`);
        await this._chargerIdentite();

        this._message('msg-code-direct', '');
        await this._ouvrir(ticket.token, ticket.chapitreId, ticket.questionId, code);
    },

    // ------------------------------------------------------------------------
    // SCAN D'UN QRCODE DE QUESTION
    // ------------------------------------------------------------------------

    /**
     * Écran de scan. La caméra n'est proposée que là où elle peut fonctionner : dans
     * XSpro la page tourne en file: sous Electron, et aucune permission média n'y est
     * accordée — on s'en tient au collage, qui marche partout.
     */
    _scan() {
        const camera = document.getElementById('scan-camera');
        camera.hidden = !this._cameraDisponible();
        this._message('msg-scan', '');
        this._message('msg-scan-camera', '');   // sinon on revient sur le message du passage précédent
        this._ecran('scan');
        if (camera.hidden) document.getElementById('champ-charge').focus();
    },

    _cameraDisponible() {
        return !window.IS_ELECTRON && !!navigator.mediaDevices?.getUserMedia;
    },

    /**
     * Le décodeur pèse 250 Ko, pour un geste que la plupart des ouvertures de l'outil ne
     * feront pas : on ne le charge qu'au moment où la caméra démarre.
     */
    _chargerDecodeur() {
        if (typeof window.jsQR === 'function') return Promise.resolve(true);
        if (this._decodeur) return this._decodeur;

        this._decodeur = new Promise(resolve => {
            const balise = document.createElement('script');
            balise.src = `${window.BASE || ''}/src/js/vendor/jsqr.js`;
            balise.onload = () => resolve(typeof window.jsQR === 'function');
            balise.onerror = () => {
                // Ne pas mémoriser l'échec : un chargement raté (réseau, chemin) rendrait
                // le bouton définitivement inerte pour toute la session.
                this._decodeur = null;
                resolve(false);
            };
            document.head.appendChild(balise);
        });
        return this._decodeur;
    },

    /**
     * Ouvre la question désignée par la charge d'un QRCode.
     *
     * Contrairement au code de validation, la charge ne suppose aucun ticket en base :
     * elle désigne n'importe quelle question de n'importe quel apprenant, qu'il ait ou
     * non demandé une validation. Elle porte son propre parcours, donc on peut arriver
     * ici sans en avoir choisi un.
     */
    async _ouvrirCharge(chaine) {
        const charge = window.QRCharge?.lire(chaine);
        if (!charge) {
            this._message('msg-scan', "Ce n'est pas un QRCode de question.");
            return false;
        }

        if (charge.slug !== this.slug) {
            this.slug = charge.slug;
            window.history.replaceState(null, '', `?parcours=${encodeURIComponent(this.slug)}`);
            await this._chargerIdentite();
        }

        this._message('msg-scan', 'Recherche…', 'attente');
        const apprenants = await storage.get(`${this.slug}:teacher:users_list`) || [];
        const token = await QRCharge.resoudre(this.slug, charge.empreinte, apprenants);
        if (!token) {
            // Le message va dans la zone de la caméra quand elle tourne : celle du
            // formulaire de collage est sous la vidéo, souvent hors écran sur un téléphone.
            this._message(this.flux ? 'msg-scan-camera' : 'msg-scan',
                          'Apprenant introuvable dans ce parcours.');
            return false;
        }

        // On ne coupe la caméra qu'une fois la question réellement ouverte : si _ouvrir
        // échoue, il faut pouvoir viser un autre écran sans rien relancer.
        const ouvert = await this._ouvrir(token, charge.chapitreId, charge.questionId, null);
        if (!ouvert) return false;

        this._couperCamera();
        this._message('msg-scan', '');
        document.getElementById('champ-charge').value = '';
        return true;
    },

    /**
     * Boucle de lecture caméra. Elle ne s'arrête QUE si une question s'est réellement
     * ouverte : lire une charge ne suffit pas, encore faut-il qu'elle désigne quelqu'un.
     * Sans cette distinction, un scan dont l'apprenant est introuvable laissait la vidéo
     * tourner sans plus rien décoder — image vivante, lecteur mort, aucun signe.
     */
    async _demarrerCamera() {
        if (this.flux) return;      // déjà en marche : un second flux fuiterait le premier

        const bouton = document.getElementById('btn-scan-demarrer');
        this._message('msg-scan-camera', 'Préparation…', 'attente');
        if (!await this._chargerDecodeur()) {
            return this._message('msg-scan-camera', 'Lecteur de QRCode indisponible.');
        }

        const video = document.getElementById('scan-video');
        const toile = document.createElement('canvas');
        const contexte = toile.getContext('2d', { willReadFrequently: true });

        try {
            this.flux = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });
            video.srcObject = this.flux;
            await video.play();
        } catch (e) {
            this._couperCamera();   // un play() refusé laisserait la caméra allumée
            return this._message('msg-scan-camera', "Caméra indisponible : " + e.message);
        }

        if (bouton) bouton.disabled = true;
        this._message('msg-scan-camera', 'Visez le QRCode de la question.', 'info');

        const lire = () => {
            if (!this.flux) return;                       // écran quitté
            if (!this._lectureEnCours && video.readyState === video.HAVE_ENOUGH_DATA) {
                toile.width = video.videoWidth;
                toile.height = video.videoHeight;
                contexte.drawImage(video, 0, 0, toile.width, toile.height);
                const image = contexte.getImageData(0, 0, toile.width, toile.height);
                const lu = jsQR(image.data, image.width, image.height);
                if (lu?.data && window.QRCharge?.lire(lu.data)) {
                    // Une résolution à la fois : sans ce drapeau, les images suivantes
                    // relanceraient la même charge pendant que la première est en vol.
                    this._lectureEnCours = true;
                    this._ouvrirCharge(lu.data)
                        .catch(() => false)
                        .then(ouvert => {
                            this._lectureEnCours = false;
                            if (!ouvert && this.flux) requestAnimationFrame(lire);
                        });
                    return;
                }
            }
            requestAnimationFrame(lire);
        };
        requestAnimationFrame(lire);
    },

    _couperCamera() {
        this._lectureEnCours = false;
        const bouton = document.getElementById('btn-scan-demarrer');
        if (bouton) bouton.disabled = false;
        if (!this.flux) return;
        this.flux.getTracks().forEach(piste => piste.stop());
        this.flux = null;
        const video = document.getElementById('scan-video');
        if (video) video.srcObject = null;
    },

    // ------------------------------------------------------------------------
    // NAVIGATION PAR LISTE — apprenant / chapitre / question
    // ------------------------------------------------------------------------
    // Le chemin sans QRCode ni code : devant un écran en veille, ou depuis son bureau.
    // C'est aussi le repli d'origine, quand le code ne résout pas — typiquement une
    // coupure réseau, la clé du ticket ayant été écrite quelques secondes plus tôt sur
    // l'appareil de l'apprenant. On perd le raccourci, pas l'échange.
    //
    // Les trois niveaux réutilisent le même conteneur : la page reste « un seul écran à
    // la fois », un niveau remplaçant le précédent plutôt que de s'empiler.

    _niveau(titre, fil, retour) {
        document.getElementById('repli-titre').textContent = titre;
        const filAriane = document.getElementById('repli-fil');
        filAriane.textContent = fil || '';
        filAriane.hidden = !fil;
        const lien = document.getElementById('repli-retour');
        lien.hidden = !retour;
        lien.onclick = retour || null;
        return document.getElementById('liste-apprenants');
    },

    _choix(conteneur, libelle, detail, action, discret) {
        const bouton = document.createElement('button');
        bouton.type = 'button';
        bouton.className = discret ? 'sa-choix sa-choix-discret' : 'sa-choix';
        bouton.textContent = libelle;
        if (detail) {
            const petit = document.createElement('small');
            petit.textContent = detail;
            bouton.appendChild(petit);
        }
        bouton.addEventListener('click', action);
        conteneur.appendChild(bouton);
        return bouton;
    },

    _intertitre(conteneur, texte) {
        const titre = document.createElement('div');
        titre.className = 'sa-sous-titre';
        titre.textContent = texte;
        conteneur.appendChild(titre);
    },

    /** Niveau 1 — les apprenants du parcours. */
    async _repli() {
        this._ecran('repli');
        const liste = this._niveau('Choisir un apprenant', '', null);
        liste.innerHTML = '<p>Chargement…</p>';

        const apprenants = (await storage.get(`${this.slug}:teacher:users_list`) || [])
            .filter(u => u.type !== 'teacher');

        if (!apprenants.length) {
            liste.innerHTML = '<p class="sa-message sa-message-erreur">Aucun apprenant dans ce parcours.</p>';
            return;
        }

        liste.innerHTML = '';
        apprenants.forEach(apprenant => {
            this._choix(liste, apprenant.name || apprenant.id, apprenant.class || '',
                        () => this._repliChapitres(apprenant));
        });
    },

    /**
     * Niveau 2 — les chapitres, lus du parcours et non de la progression : un chapitre
     * jamais ouvert par l'apprenant doit rester atteignable. Les consignes en attente
     * d'AR sont hissées en tête, c'est le geste le plus fréquent.
     */
    async _repliChapitres(apprenant) {
        const nom = apprenant.name || apprenant.id;
        const liste = this._niveau('Choisir un chapitre', nom, () => this._repli());
        liste.innerHTML = '<p>Chargement…</p>';

        const attentes = await this._attentes(apprenant.id);
        const chapitres = await this._chapitres();
        const progression = await storage.get(this._cleProgression(apprenant.id));

        liste.innerHTML = '';

        if (attentes.length) {
            this._intertitre(liste, 'Consignes en attente de validation');
            attentes.forEach(attente => {
                this._choix(liste, `🧾 ${attente.question.title}`, attente.titreChapitre,
                    () => this._ouvrir(apprenant.id, attente.chapitreId, attente.question.id,
                                       attente.donnees.codeValidation));
            });
            this._intertitre(liste, 'Ou parcourir les chapitres');
        }

        if (!chapitres.length) {
            this._intertitre(liste, 'Aucun chapitre dans ce parcours.');
            return;
        }

        chapitres.forEach(chapitre => {
            const suivi = progression?.chapters?.[chapitre.id];
            const nb = (chapitre.questions || []).length;
            const detail = `${nb} question${nb > 1 ? 's' : ''} · `
                + (suivi ? this._libelleRendu(suivi.submissionStatus) : 'non commencé');
            this._choix(liste, chapitre.title || chapitre.id, detail,
                        () => this._repliQuestions(apprenant, chapitre), true);
        });
    },

    /** Niveau 3 — les questions du chapitre, avec l'état de chacune. */
    async _repliQuestions(apprenant, chapitre) {
        const nom = apprenant.name || apprenant.id;
        const liste = this._niveau('Choisir une question',
                                   `${nom} · ${chapitre.title || chapitre.id}`,
                                   () => this._repliChapitres(apprenant));
        liste.innerHTML = '<p>Chargement…</p>';

        const progression = await storage.get(this._cleProgression(apprenant.id));
        const questions = chapitre.questions || [];

        if (!questions.length) {
            liste.innerHTML = '<p class="sa-message sa-message-attente">Ce chapitre ne contient aucune question.</p>';
            return;
        }

        liste.innerHTML = '';
        questions.forEach(question => {
            const donnees = progression?.chapters?.[chapitre.id]?.questions?.[question.id];
            this._choix(liste, `${this._pastille(donnees)} ${question.title || question.id}`,
                        this._libelleEtatQuestion(question, donnees),
                        () => this._ouvrir(apprenant.id, chapitre.id, question.id, null));
        });
    },

    async _chapitres() {
        const donneesCours = await staticJson.get('/parcours/cours.json');
        const parcours = donneesCours?.parcours?.find(p => p.slug === this.slug);
        return parcours?.chapitres || [];
    },

    _pastille(donnees) {
        if (!donnees) return '⚪';
        if (donnees.manualCorrectionStatus === 'corrected' || donnees.arSaisiAt) return '✍️';
        if (donnees.codeValidation) return '🧾';
        if (donnees.answered) return '🔵';
        return '⚪';
    },

    _libelleEtatQuestion(question, donnees) {
        const bareme = `${this._nombre(question.points)} pt${question.points > 1 ? 's' : ''}`;
        if (!donnees || !donnees.answered) return `${bareme} · non répondue`;
        if (donnees.manualCorrectionStatus === 'corrected') {
            return `${bareme} · corrigée ${this._nombre(donnees.teacherScore ?? 0)}/${this._nombre(question.points)}`;
        }
        if (donnees.codeValidation) return `${bareme} · validation demandée`;
        if (question.correctionType === 'auto') return `${bareme} · auto-corrigée`;
        return `${bareme} · répondue, à corriger`;
    },

    _libelleRendu(statut) {
        return ({
            validated: 'corrigé',
            submitted: 'rendu',
            late_submitted: 'rendu en retard',
            returned_for_revision: 'à retoucher',
            not_submitted: 'en cours'
        })[statut] || 'en cours';
    },

    async _attentes(token) {
        const progression = await storage.get(this._cleProgression(token));
        const donneesCours = await staticJson.get('/parcours/cours.json');
        const parcours = donneesCours?.parcours?.find(p => p.slug === this.slug);
        const attentes = [];

        Object.entries(progression?.chapters || {}).forEach(([chapitreId, chapitre]) => {
            const configChapitre = parcours?.chapitres?.find(c => String(c.id) === String(chapitreId));
            Object.entries(chapitre.questions || {}).forEach(([questionId, donnees]) => {
                if (!donnees?.codeValidation || donnees.arSaisiAt) return;
                const question = configChapitre?.questions?.find(q => q.id === questionId);
                if (!question) return;
                attentes.push({
                    chapitreId,
                    titreChapitre: configChapitre?.title || `Chapitre ${chapitreId}`,
                    question,
                    donnees
                });
            });
        });

        return attentes;
    },

    _cleProgression(token) {
        return `${this.slug}:${token}:student_${token}_progress`;
    },

    // ------------------------------------------------------------------------
    // ÉVALUATION
    // ------------------------------------------------------------------------

    async _ouvrir(token, chapitreId, questionId, code) {
        const progression = await storage.get(this._cleProgression(token));
        const zone = this._zoneMessage();
        if (!progression) {
            this._message(zone, 'Progression de cet apprenant introuvable.');
            return false;
        }

        const donneesCours = await staticJson.get('/parcours/cours.json');
        const parcours = donneesCours?.parcours?.find(p => p.slug === this.slug);
        const chapitre = parcours?.chapitres?.find(c => String(c.id) === String(chapitreId));
        const question = chapitre?.questions?.find(q => q.id === questionId);
        if (!question) {
            this._message(zone, 'Question introuvable dans ce parcours.');
            return false;
        }

        const apprenants = await storage.get(`${this.slug}:teacher:users_list`) || [];
        const apprenant = apprenants.find(u => u.id === token);
        const donnees = progression.chapters?.[chapitreId]?.questions?.[questionId] || {};

        // Le rituel de l'AR n'a de sens que sur une consigne d'un chapitre joué en Atelier.
        // Partout ailleurs on corrige directement, comme depuis le tableau de bord.
        const estConsigne = question.type === 'ouverte'
                         && question.correctionType === 'manuel'
                         && question.rule !== REGLE_HORS_CONSIGNE;
        const modeAtelier = await this._modeAtelier(progression, chapitreId);

        this.contexte = { token, chapitreId, questionId, question, code, donnees,
                          estConsigne, modeAtelier };

        document.getElementById('eval-apprenant').textContent =
            `${apprenant?.name || token}${apprenant?.class ? ' · ' + apprenant.class : ''}`;
        document.getElementById('eval-chapitre').textContent = chapitre?.title || '';
        document.getElementById('eval-consigne').innerHTML = question.questionTextHtml || question.questionText || '';

        // Le titre suivait la visibilité du bloc : « Critères de réussite » s'affichait
        // au-dessus du vide dès que la question n'en portait pas.
        document.getElementById('eval-criteres').innerHTML = question.hintHtml || '';
        document.getElementById('eval-bloc-criteres').hidden = !question.hintHtml;

        // « Compte rendu » est le vocabulaire du rituel Atelier ; ailleurs c'est une réponse.
        const rituel = estConsigne && modeAtelier;
        document.getElementById('eval-titre-reponse').textContent =
            rituel ? "Compte rendu de l'apprenant" : "Réponse de l'apprenant";
        document.getElementById('eval-compte-rendu').textContent = donnees.answer
            || (rituel ? '— aucun compte rendu enregistré —' : '— aucune réponse enregistrée —');
        // L'auto-positionnement est un geste du rituel Atelier : hors de ce rituel il
        // n'existe pas, et afficher « Il s'estime : — » ne ferait qu'encombrer.
        document.getElementById('eval-bloc-positionnement').hidden = !(estConsigne && modeAtelier);
        document.getElementById('eval-positionnement').textContent =
            this._libelleNiveau(donnees.autoPositionnement);

        const points = document.getElementById('champ-points');
        points.max = question.points;
        points.value = donnees.teacherScore ?? donnees.arPoints ?? question.points;
        document.getElementById('eval-bareme').textContent = `sur ${this._nombre(question.points)}`;
        document.getElementById('champ-appreciation').value =
            donnees.teacherComment || donnees.arAppreciation || '';

        document.getElementById('btn-ar').hidden = !(estConsigne && modeAtelier);

        // Réévaluation : le précédent AR cessera de fonctionner dès que le nouveau sera émis.
        const avis = document.getElementById('eval-deja');
        avis.hidden = !donnees.arHash && donnees.manualCorrectionStatus !== 'corrected';
        if (donnees.arHash) {
            avis.textContent = donnees.arSaisiAt
                ? 'Cette consigne a déjà été validée par l\'apprenant. Émettre un nouvel AR remplacera les points.'
                : 'Un AR a déjà été émis et n\'a pas encore été saisi. En émettre un nouveau annulera le précédent.';
        } else if (donnees.manualCorrectionStatus === 'corrected') {
            avis.textContent = this._avisDejaCorrigee(donnees);
        }

        this._chargerCommentaireChapitre(progression, chapitreId);

        this._message('msg-eval', '');
        this._ecran('eval');
        await this._autresAttentes(token, questionId);
        return true;   // la boucle caméra s'en sert pour savoir si elle peut s'arrêter
    },

    /** Un seul passage doit suffire : on montre les autres consignes prêtes du même apprenant. */
    async _autresAttentes(token, questionIdCourante) {
        const zone = document.getElementById('eval-autres');
        const attentes = (await this._attentes(token)).filter(a => a.question.id !== questionIdCourante);

        if (!attentes.length) {
            zone.hidden = true;
            return;
        }

        zone.hidden = false;
        zone.innerHTML = `<div class="sa-sous-titre">Autres consignes prêtes pour cet apprenant</div>`;
        attentes.forEach(attente => {
            const bouton = document.createElement('button');
            bouton.type = 'button';
            bouton.className = 'sa-choix sa-choix-discret';
            bouton.innerHTML = `${attente.titreChapitre} <small>${attente.question.title}</small>`;
            bouton.addEventListener('click', () =>
                this._ouvrir(token, attente.chapitreId, attente.question.id, attente.donnees.codeValidation));
            zone.appendChild(bouton);
        });
    },

    // ------------------------------------------------------------------------
    // ÉMISSION DE L'AR
    // ------------------------------------------------------------------------

    /**
     * L'outil n'écrit PAS teacherScore : il dépose les points dans des champs
     * d'attente (arPoints / arAppreciation). C'est la saisie de l'AR par l'apprenant
     * qui les promeut dans le calcul. Sans ce geste, les points ne comptent nulle
     * part — c'est ce qui rend l'échange obligatoire sans masquer quoi que ce soit.
     */
    /**
     * Mode effectif du chapitre pour cet apprenant. Même résolution que
     * core/getExamContext.js : le mode figé au premier démarrage prime sur la
     * configuration courante, sinon le formateur qui change le mode en cours de route
     * changerait le contrat sous les pieds de ceux qui ont commencé.
     */
    async _modeAtelier(progression, chapitreId) {
        const fige = progression?.chapters?.[chapitreId]?.frozenChapterMode;
        if (fige) return fige === 'atelier';
        const config = await storage.get(`${this.slug}:config:chapter_config`);
        return config?.[chapitreId]?.chapterMode === 'atelier';
    },

    /**
     * Points saisis, ou null si la saisie n'est pas exploitable.
     *
     * `Number('')` vaut **0**, pas NaN : un champ vidé passait donc toutes les gardes et
     * la question partait à 0, marquée corrigée, sans un mot. Le `required` du champ ne
     * protège que la soumission du formulaire — le bouton d'enregistrement direct est un
     * `type="button"`, il la contourne. La vérification vit donc ici, pour les deux chemins.
     */
    _lirePoints(bareme) {
        const brut = String(document.getElementById('champ-points').value || '').trim();
        if (brut === '') {
            this._message('msg-eval', 'Indiquez un nombre de points.');
            return null;
        }
        const points = Number(brut);
        if (Number.isNaN(points) || points < 0 || points > bareme) {
            this._message('msg-eval',
                `Les points doivent être compris entre 0 et ${this._nombre(bareme)}.`);
            return null;
        }
        return points;
    },

    _avisDejaCorrigee(donnees) {
        const quand = donnees.correctedAt ? ` le ${this._date(donnees.correctedAt)}` : '';
        const qui = donnees.correctedBy ? ` par ${donnees.correctedBy}` : '';
        return `Question déjà corrigée${quand}${qui}.`
             + ` Enregistrer remplacera la note et l'appréciation.`;
    },

    // ------------------------------------------------------------------------
    // CORRECTION DIRECTE — le second chemin, sans rituel
    // ------------------------------------------------------------------------

    /**
     * Écrit la note et l'appréciation comme le ferait le tableau de bord après le rendu
     * d'une copie. Aucun accusé de réception : ce qui est écrit compte immédiatement
     * dans les totaux.
     *
     * C'est silencieux pour l'apprenant, et par construction : recomputeChapterStats
     * dérive submissionStatus de validatedAt / revisionRequestedAt / submittedAt et de
     * rien d'autre, donc corriger ne peut pas faire basculer un chapitre en « validated »,
     * seul état qui lui ouvre le corrigé — ni l'en faire sortir, depuis que la validation
     * pose sa date (voir setSubmissionStatus dans progressManager).
     */
    async _enregistrerDirect() {
        if (!this.contexte) return;
        const { token, chapitreId, questionId, question } = this.contexte;

        const points = this._lirePoints(question.points);
        if (points === null) return;

        this._message('msg-eval', 'Enregistrement…', 'attente');

        // Même précaution que _emettre : relecture juste avant écriture.
        const cle = this._cleProgression(token);
        const progression = await storage.get(cle);
        const donnees = progression?.chapters?.[chapitreId]?.questions?.[questionId];
        if (!donnees) return this._message('msg-eval', 'Progression introuvable — réessayez.');

        const appreciation = document.getElementById('champ-appreciation').value.trim();

        // teacherCorrectQuestion pose teacherScore, teacherComment, manualCorrectionStatus
        // et correctedAt, puis recalcule le chapitre. Sans ce recalcul, pendingCorrectionCount
        // et correctionStatus resteraient faux et le bouton « Valider » du tableau de bord
        // resterait bloqué.
        ProgressManager.teacherCorrectQuestion(
            progression, chapitreId, questionId, points, appreciation, '', 'corrected');
        donnees.correctedBy = this.formateur;   // la fonction y met "teacher" en dur
        ProgressManager.recomputeGlobalStats(progression);

        await storage.set(cle, progression);

        this.contexte.donnees = donnees;
        document.getElementById('eval-deja').hidden = false;
        document.getElementById('eval-deja').textContent = this._avisDejaCorrigee(donnees);
        this._message('msg-eval',
            `Correction enregistrée : ${this._nombre(points)} / ${this._nombre(question.points)}.`, 'info');
    },

    // ------------------------------------------------------------------------
    // COMMENTAIRE GÉNÉRAL DU CHAPITRE
    // ------------------------------------------------------------------------

    _chargerCommentaireChapitre(progression, chapitreId) {
        const champ = document.getElementById('champ-commentaire-chapitre');
        const existant = progression?.chapters?.[chapitreId]?.globalComment || '';
        champ.value = existant;
        // Déplié d'office s'il y a déjà quelque chose à lire : on ne cache pas un mot déjà écrit.
        document.getElementById('bloc-commentaire-chapitre').hidden = !existant;
        this._message('msg-commentaire-chapitre', '');
    },

    /** Le champ que le tableau de bord appelle « commentaire GÉNÉRAL sur la prestation ». */
    async _enregistrerCommentaireChapitre() {
        if (!this.contexte) return;
        const { token, chapitreId } = this.contexte;

        this._message('msg-commentaire-chapitre', 'Enregistrement…', 'attente');

        const cle = this._cleProgression(token);
        const progression = await storage.get(cle);
        const chapitre = progression?.chapters?.[chapitreId];
        if (!chapitre) return this._message('msg-commentaire-chapitre', 'Progression introuvable — réessayez.');

        chapitre.globalComment = document.getElementById('champ-commentaire-chapitre').value.trim();
        chapitre.updatedAt = new Date().toISOString();
        await storage.set(cle, progression);

        this._message('msg-commentaire-chapitre', 'Commentaire enregistré.', 'info');
    },

    async _emettre() {
        if (!this.contexte) return;
        const { token, chapitreId, questionId, question, estConsigne, modeAtelier } = this.contexte;

        // Le bouton AR est masqué hors rituel, mais la touche Entrée soumet quand même le
        // formulaire : sans cette garde, une question ordinaire déclencherait un AR.
        if (!(estConsigne && modeAtelier)) return this._enregistrerDirect();

        const points = this._lirePoints(question.points);
        if (points === null) return;
        if (points > AtelierCodes.POINTS_MAX) {
            return this._message('msg-eval', `Le format d'AR ne porte que ${AtelierCodes.POINTS_MAX} points au maximum.`);
        }

        this._message('msg-eval', 'Émission…', 'attente');

        // Relecture juste avant écriture : la progression s'enregistre en objet entier,
        // on réduit la fenêtre pendant laquelle l'appareil de l'apprenant pourrait écrire.
        const cle = this._cleProgression(token);
        const progression = await storage.get(cle);
        const donnees = progression?.chapters?.[chapitreId]?.questions?.[questionId];
        if (!donnees) return this._message('msg-eval', 'Progression introuvable — réessayez.');

        const ar = AtelierCodes.genererAR(points);
        const maintenant = new Date().toISOString();

        donnees.arPoints = points;
        donnees.arAppreciation = document.getElementById('champ-appreciation').value.trim();
        donnees.arHash = await AtelierCodes.condensat(ar);
        donnees.arEmisAt = maintenant;
        donnees.arEmisPar = this.formateur;
        donnees.arSaisiAt = null;   // un nouvel AR annule la saisie précédente

        await storage.set(cle, progression);

        // L'AR en clair, pour les surfaces formateur : réémission d'un AR perdu,
        // et vérification d'un code recopié sur un carnet des mois plus tard.
        await storage.set(AtelierCodes.cleAR(this.slug, token, chapitreId, questionId), {
            ar, points, emisAt: maintenant, emisPar: this.formateur
        });

        document.getElementById('ar-code').textContent = AtelierCodes.formater(ar);
        document.getElementById('ar-points').textContent =
            `${this._nombre(points)} / ${this._nombre(question.points)}`;
        this._ecran('ar');
    },

    // ------------------------------------------------------------------------
    // OUTILS
    // ------------------------------------------------------------------------

    _libelleNiveau(cle) {
        const niveaux = {
            non_acquis: '🔴 Pas encore acquis',
            en_cours: '🟠 En cours d\'acquisition',
            acquis: '🟢 Acquis'
        };
        return niveaux[cle] || 'non précisé';
    },

    _nombre(valeur) {
        return Number(valeur || 0).toLocaleString('fr-FR');
    },

    _date(iso) {
        if (!iso) return '';
        return new Date(iso).toLocaleDateString('fr-FR',
            { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
    }
};

window.SuiviAtelier = SuiviAtelier;
document.addEventListener('DOMContentLoaded', () => SuiviAtelier.init());

// Installé sur un écran d'accueil, l'outil a une sortie que le navigateur n'offrait pas :
// passer en arrière-plan. Quitter l'écran de scan n'est donc plus le seul chemin, et le
// flux survivrait à l'application réduite. Même raison qu'en _ecran() — une lampe témoin
// qui reste allumée dans une salle de classe est un problème en soi.
document.addEventListener('visibilitychange', () => {
    if (document.hidden) SuiviAtelier._couperCamera();
});
