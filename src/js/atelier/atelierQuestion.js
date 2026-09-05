// ============================================================================
// ATELIER QUESTION - Vue apprenant du mode Atelier AR
// ============================================================================
// En mode Atelier AR, une question OUVERTE à correction MANUELLE cesse d'être un
// cadre à remplir : elle devient un travail à faire, validé en main propre.
//
// L'apprenant rédige son compte rendu, se positionne, se déclare prêt — ce qui
// produit un code de validation — puis rapporte l'AR dicté par le formateur.
// C'est la saisie de l'AR qui inscrit les points.
//
// ⚠️ Ce module DÉCORE le HTML publié, il ne le remplace pas. Le mode est choisi
//    par le formateur APRÈS la publication du parcours (et parfois pour une classe
//    et pas pour l'autre) : rien de tout ceci ne peut être inscrit dans cours.json,
//    sous peine d'avoir à republier un cours pour changer de mode.
//
// Voir "mode atelier AR.md" §3.1.
// ============================================================================

const AtelierQuestion = {

    // Échelle d'auto-positionnement — volontairement fixe et non paramétrable :
    // elle sert de langage commun à l'échange, pas d'outil de notation.
    NIVEAUX: [
        { cle: 'non_acquis', label: '🔴 Pas encore acquis' },
        { cle: 'en_cours',   label: '🟠 En cours d\'acquisition' },
        { cle: 'acquis',     label: '🟢 Acquis' }
    ],

    // ------------------------------------------------------------------------
    // ENTRÉE
    // ------------------------------------------------------------------------

    init() {
        if (!window.currentExamContext?.isAtelierMode) return;

        const consignes = this.consignes();
        if (!consignes.length) return;

        consignes.forEach(consigne => this._decorer(consigne));
        console.log(`[Atelier] ${consignes.length} consigne(s) décorée(s)`);
    },

    // Règle qui EXCLUT une question ouverte manuelle du rituel de l'AR.
    //
    // Pourquoi une règle sert de discriminant : le collé n'est autorisé que dans les
    // zones de texte des questions ouvertes à correction manuelle (voir la protection
    // copier-coller dans chapterInit.js). Un formateur qui veut une question ouverte
    // acceptant le collé doit donc la passer en correction manuelle — et héritait
    // alors du rituel du code et de l'AR, qu'il ne voulait pas.
    //
    // « Texte non vide » (texte(10)) désigne désormais ce cas : question ouverte
    // corrigée à la main, collé autorisé, AUCUNE validation en main propre. La règle
    // « Texte », sans contrainte de longueur, reste celle des consignes — cohérent :
    // une consigne se juge en présence, pas au compteur de caractères.
    REGLE_HORS_CONSIGNE: 'texte(10)',

    /**
     * Les questions concernées : ouvertes, à correction manuelle, dont la règle n'est
     * pas celle qui exclut explicitement du rituel.
     *
     * L'exclusion est formulée en négatif à dessein : toute question ouverte manuelle
     * reste une consigne par défaut, y compris celles dont la règle est absente. Seul
     * un choix explicite du formateur l'en sort.
     */
    consignes() {
        const questions = window.currentChapterConfig?.questions || [];
        return questions.filter(q =>
            q.type === 'ouverte' &&
            q.correctionType === 'manuel' &&
            q.rule !== this.REGLE_HORS_CONSIGNE
        );
    },

    /**
     * Consignes qui partiront à 0 point faute d'AR, pour l'avertissement au rendu.
     * Retourne une liste vide hors mode Atelier AR : le rendu des autres modes n'a
     * pas à s'encombrer de ce message.
     */
    consignesNonValidees() {
        if (!window.currentExamContext?.isAtelierMode) return [];

        return this.consignes()
            .filter(consigne => !this.pointsAffiches(consigne.id))
            .map(consigne => ({
                id: consigne.id,
                points: consigne.points,
                libelle: this._libelleConsigne(consigne)
            }));
    },

    /** « Question 9 — "Expliquez en quelques phrases pourquoi…" » */
    _libelleConsigne(consigne) {
        const enonce = String(consigne.questionText || '').replace(/\s+/g, ' ').trim();
        if (!enonce) return consigne.title || consigne.id;
        const extrait = enonce.length > 50 ? enonce.slice(0, 50).trimEnd() + '…' : enonce;
        return `${consigne.title || consigne.id} — « ${extrait} »`;
    },

    // ------------------------------------------------------------------------
    // ACCÈS PROGRESSION
    // ------------------------------------------------------------------------

    _chapitre() {
        return ChapterSession.progress?.chapters?.[ChapterSession.chapterId] || null;
    },

    _donnees(questionId) {
        return this._chapitre()?.questions?.[questionId] || null;
    },

    /**
     * État de la consigne, déduit des seules données de progression — aucun champ n'est
     * ajouté en base pour le porter.
     *
     *   brouillon → demandee → validee     le rituel de l'AR
     *   brouillon → corrigee               le formateur a noté directement, sans rituel
     *
     * `corrigee` passe après `validee` et avant `demandee` : une consigne notée en direct
     * alors qu'un code dormait encore doit cesser d'afficher ce code, sinon l'apprenant
     * relancerait un rituel déjà tranché.
     */
    _etat(questionId) {
        const donnees = this._donnees(questionId);
        if (!donnees) return 'brouillon';
        if (donnees.arSaisiAt) return 'validee';
        if (donnees.manualCorrectionStatus === 'corrected') return 'corrigee';
        if (donnees.codeValidation) return 'demandee';
        return 'brouillon';
    },

    /**
     * La note de cette consigne est-elle déjà sous les yeux de l'apprenant ?
     * Le bilan s'en sert pour compter les mêmes points que ceux qu'il voit ici, au lieu
     * de les annoncer « en attente ». Prédicat exposé plutôt que dupliqué : deux
     * conditions séparées dériveraient.
     */
    pointsAffiches(questionId) {
        // Hors mode Atelier rien n'est décoré, donc rien n'est affiché : une question
        // manuelle notée en direct dans un chapitre Découverte reste muette jusqu'à la
        // validation du chapitre, exactement comme avant.
        if (!window.currentExamContext?.isAtelierMode) return false;
        if (!this.consignes().some(c => c.id === questionId)) return false;

        const etat = this._etat(questionId);
        return etat === 'validee' || etat === 'corrigee';
    },

    async _enregistrer() {
        const pm = window.ProgressManager;
        const chapitre = this._chapitre();
        if (!pm || !chapitre) return;
        if (pm.recomputeChapterStats) pm.recomputeChapterStats(chapitre);
        if (pm.recomputeGlobalStats) pm.recomputeGlobalStats(ChapterSession.progress);
        if (pm.saveProgress) await pm.saveProgress(ChapterSession.studentId, ChapterSession.progress);
    },

    // ------------------------------------------------------------------------
    // DÉCORATION
    // ------------------------------------------------------------------------

    _decorer(consigne) {
        const question = document.querySelector(`.question-section[data-question-id="${consigne.id}"]`);
        if (!question) return;

        question.classList.add('question-atelier');
        this._pastille(question);
        this._revelerCriteres(question, consigne.id);
        this._renommerBoutonEnregistrer(question);
        this._rendre(consigne);
    },

    /** Pastille de mode, posée à l'affichage — jamais à la publication. */
    _pastille(question) {
        const meta = question.querySelector('.question-meta');
        if (!meta || meta.querySelector('.badge-atelier')) return;
        const pastille = document.createElement('span');
        pastille.className = 'correction-badge badge-atelier';
        pastille.textContent = '🧾 Atelier';
        pastille.title = 'Cette consigne se valide en main propre auprès de votre formateur';
        meta.appendChild(pastille);
    },

    /**
     * L'indication devient les critères de réussite, visibles AVANT le travail :
     * l'apprenant ne peut se positionner que s'il sait ce qui est attendu.
     */
    _revelerCriteres(question, questionId) {
        const conteneur = question.querySelector(`#hint_${questionId}`);
        if (!conteneur) return;

        const bouton = question.querySelector('[data-hint-btn]');
        if (bouton) bouton.style.display = 'none';

        conteneur.style.display = 'block';
        conteneur.classList.add('criteres-atelier');

        if (!conteneur.querySelector('.criteres-titre')) {
            const titre = document.createElement('div');
            titre.className = 'criteres-titre';
            titre.textContent = '✔️ Critères de réussite';
            conteneur.prepend(titre);
        }
    },

    /**
     * Le bouton existant continue de faire exactement ce qu'il faisait — enregistrer
     * la réponse. Seul son libellé change, pour que « enregistrer » et « demander la
     * validation » ne soient pas confondus. Aucune logique de sauvegarde dupliquée.
     */
    _renommerBoutonEnregistrer(question) {
        const bouton = question.querySelector('.btn-check-answer');
        if (bouton) bouton.textContent = '💾 Enregistrer mon compte rendu';
    },

    // ------------------------------------------------------------------------
    // RENDU DU BLOC
    // ------------------------------------------------------------------------

    _rendre(consigne) {
        const question = document.querySelector(`.question-section[data-question-id="${consigne.id}"]`);
        if (!question) return;

        let bloc = question.querySelector('.atelier-bloc');
        if (!bloc) {
            bloc = document.createElement('div');
            bloc.className = 'atelier-bloc';
            const actions = question.querySelector('.question-actions');
            const zone = question.querySelector('.answer-area');
            if (actions) actions.parentNode.insertBefore(bloc, actions);
            else if (zone) zone.after(bloc);
            else question.querySelector('.question-box')?.appendChild(bloc);
        }

        const etat = this._etat(consigne.id);
        bloc.dataset.etat = etat;
        bloc.innerHTML = this._html(consigne, etat);
        this._brancher(bloc, consigne, etat);
        this._verrouiller(question, etat);
        this._bandeau(consigne.id);
    },

    _html(consigne, etat) {
        const donnees = this._donnees(consigne.id) || {};

        if (etat === 'validee') {
            const points = donnees.teacherScore ?? 0;
            const appreciation = donnees.teacherComment || donnees.arAppreciation || '';
            return `
                <div class="atelier-entete atelier-entete-validee">🧾 Consigne validée en main propre</div>
                <div class="atelier-resultat">
                    <span class="atelier-points">${this._nombre(points)} / ${this._nombre(consigne.points)} point${consigne.points > 1 ? 's' : ''}</span>
                    <span class="atelier-date">le ${this._date(donnees.arSaisiAt)}</span>
                </div>
                ${appreciation ? `<div class="atelier-appreciation">${this._echapper(appreciation)}</div>` : ''}
                ${donnees.arCode ? `
                <div class="atelier-carnet">
                    À recopier sur votre carnet : <strong>${AtelierCodes.formater(donnees.arCode)}</strong>
                </div>` : ''}
            `;
        }

        // Corrigée : le formateur a noté directement, hors rituel. Même présentation que
        // `validee`, sans le code AR à recopier — il n'y en a pas.
        if (etat === 'corrigee') {
            const points = donnees.teacherScore ?? 0;
            const appreciation = donnees.teacherComment || donnees.arAppreciation || '';
            const par = donnees.correctedBy && donnees.correctedBy !== 'teacher'
                ? ` par ${this._echapper(donnees.correctedBy)}` : '';
            return `
                <div class="atelier-entete atelier-entete-corrigee">✍️ Consigne corrigée${par}</div>
                <div class="atelier-resultat">
                    <span class="atelier-points">${this._nombre(points)} / ${this._nombre(consigne.points)} point${consigne.points > 1 ? 's' : ''}</span>
                    <span class="atelier-date">le ${this._date(donnees.correctedAt)}</span>
                </div>
                ${appreciation ? `<div class="atelier-appreciation">${this._echapper(appreciation)}</div>` : ''}
            `;
        }

        if (etat === 'demandee') {
            return `
                <div class="atelier-entete">🧾 Validation demandée le ${this._date(donnees.codeValidationAt)}</div>
                <p class="atelier-consigne-texte">
                    Présentez ce code de validation à votre formateur. Il évaluera votre travail
                    et vous dictera votre AR.
                </p>
                <div class="atelier-code">${AtelierCodes.formater(donnees.codeValidation)}</div>
                <div class="atelier-positionnement-fige">
                    Vous vous êtes positionné : <strong>${this._libelleNiveau(donnees.autoPositionnement)}</strong>
                </div>
                <label class="atelier-label" for="atelier-ar-${consigne.id}">Saisir mon AR</label>
                <div class="atelier-saisie">
                    <input type="text" id="atelier-ar-${consigne.id}" class="atelier-input-ar"
                           placeholder="XXXX-XXXX" maxlength="12" autocomplete="off">
                    <button type="button" class="btn btn-primary atelier-btn-ar">Valider</button>
                </div>
                <div class="atelier-message" id="atelier-msg-${consigne.id}"></div>
                <button type="button" class="atelier-annuler">Annuler ma demande</button>
            `;
        }

        const options = this.NIVEAUX.map(niveau => `
            <option value="${niveau.cle}" ${donnees.autoPositionnement === niveau.cle ? 'selected' : ''}>
                ${niveau.label}
            </option>`).join('');

        return `
            <div class="atelier-entete">🧾 Travail à faire valider en main propre</div>
            <label class="atelier-label" for="atelier-pos-${consigne.id}">Où j'estime en être</label>
            <select id="atelier-pos-${consigne.id}" class="atelier-select">
                <option value="">— choisissez —</option>
                ${options}
            </select>
            <button type="button" class="btn btn-primary atelier-btn-demander">
                ✅ Je me déclare prêt — demander la validation
            </button>
            <div class="atelier-message" id="atelier-msg-${consigne.id}"></div>
        `;
    },

    _brancher(bloc, consigne, etat) {
        if (etat === 'brouillon') {
            bloc.querySelector('.atelier-select')?.addEventListener('change', (e) => {
                this._positionner(consigne, e.target.value);
            });
            bloc.querySelector('.atelier-btn-demander')?.addEventListener('click', () => {
                this._demander(consigne);
            });
            return;
        }

        if (etat === 'demandee') {
            const champ = bloc.querySelector('.atelier-input-ar');
            const valider = () => this._validerAR(consigne, champ.value);
            bloc.querySelector('.atelier-btn-ar')?.addEventListener('click', valider);
            champ?.addEventListener('keydown', (e) => { if (e.key === 'Enter') valider(); });
            bloc.querySelector('.atelier-annuler')?.addEventListener('click', () => {
                this._annuler(consigne);
            });
        }
    },

    /**
     * Une fois la demande faite, le compte rendu est figé : c'est l'engagement de
     * l'apprenant, et la référence de l'échange. Il peut annuler s'il s'est déclaré
     * prêt trop vite — sinon il resterait bloqué si le formateur ne vient pas.
     */
    /**
     * Effacer le bandeau de feedback quand le bloc affiche déjà le résultat.
     *
     * `handleNormalMode` écrit « ⏳ Réponse enregistrée — En attente de vérification » sur
     * toute question ouverte répondue, et il tourne AVANT nous (chapitre.js appelle
     * restoreAllAnswers() puis AtelierQuestion.init()). Sur une consigne aboutie, cela
     * donnait un « en attente » posé juste au-dessus d'un « 8 / 10 points ».
     *
     * On efface plutôt que de réécrire : le bloc dit déjà tout, et deux fois la même chose
     * n'en dit pas plus. Les états brouillon et demandee gardent leur bandeau, qui ne
     * contredit rien — la réponse y est bien enregistrée et en attente.
     */
    _bandeau(questionId) {
        if (!this.pointsAffiches(questionId)) return;
        // getElementById plutôt qu'un sélecteur : les identifiants de question sont des
        // horodatages préfixés, un sélecteur CSS demanderait de les échapper.
        const feedback = document.getElementById(`feedback_${questionId}`);
        if (!feedback) return;
        feedback.innerHTML = '';
        feedback.className = 'feedback';
        feedback.style.display = 'none';
    },

    _verrouiller(question, etat) {
        const fige = etat !== 'brouillon';
        question.querySelectorAll('.answer-area textarea').forEach(champ => {
            champ.disabled = fige;
        });
        const bouton = question.querySelector('.btn-check-answer');
        if (bouton) bouton.style.display = fige ? 'none' : '';
    },

    // ------------------------------------------------------------------------
    // ACTIONS
    // ------------------------------------------------------------------------

    /**
     * Relit la progression enregistrée et n'en reprend QUE les champs écrits par
     * l'outil de validation. Le reste de l'état local reste maître : la progression
     * s'enregistre en objet entier, on ne veut pas écraser ce que l'apprenant vient
     * de saisir ici avec une version plus ancienne venue du serveur.
     */
    async _rafraichirEvaluation(questionId) {
        const slug = window.currentParcoursSlug || (window.Parcours ? Parcours.slug : null);
        const locale = this._donnees(questionId);
        if (!slug || !locale || !ChapterSession.studentId) return;

        try {
            const cle = `${slug}:${ChapterSession.studentId}:student_${ChapterSession.studentId}_progress`;
            const enregistree = await storage.get(cle);
            const distante = enregistree?.chapters?.[ChapterSession.chapterId]?.questions?.[questionId];
            if (!distante) return;

            ['arPoints', 'arAppreciation', 'arHash', 'arEmisAt', 'arEmisPar'].forEach(champ => {
                if (distante[champ] !== undefined) locale[champ] = distante[champ];
            });
        } catch (e) {
            console.warn('[Atelier] Relecture de l\'évaluation impossible :', e.message);
        }
    },

    async _positionner(consigne, valeur) {
        const donnees = this._donnees(consigne.id);
        if (!donnees) return;
        donnees.autoPositionnement = valeur || null;
        await this._enregistrer();
    },

    async _demander(consigne) {
        const donnees = this._donnees(consigne.id);

        if (!donnees?.answered || !donnees.answer) {
            return this._message(consigne, 'Enregistrez d\'abord votre compte rendu.', 'erreur');
        }
        if (!donnees.autoPositionnement) {
            return this._message(consigne, 'Indiquez où vous estimez en être avant de demander la validation.', 'erreur');
        }

        const slug = window.currentParcoursSlug || (window.Parcours ? Parcours.slug : null);
        if (!slug) return this._message(consigne, 'Parcours introuvable.', 'erreur');

        const code = AtelierCodes.genererCodeValidation();

        donnees.codeValidation = code;
        donnees.codeValidationAt = new Date().toISOString();

        await storage.set(AtelierCodes.cleCodeValidation(slug, code), {
            token: ChapterSession.studentId,
            chapitreId: ChapterSession.chapterId,
            questionId: consigne.id,
            demandeAt: donnees.codeValidationAt
        });

        await this._enregistrer();
        this._rendre(consigne);
    },

    async _annuler(consigne) {
        const donnees = this._donnees(consigne.id);
        if (!donnees?.codeValidation) return;

        const slug = window.currentParcoursSlug || (window.Parcours ? Parcours.slug : null);
        if (slug) {
            await storage.remove(AtelierCodes.cleCodeValidation(slug, donnees.codeValidation));
        }

        donnees.codeValidation = null;
        donnees.codeValidationAt = null;

        await this._enregistrer();
        this._rendre(consigne);
    },

    /**
     * Saisie de l'AR : c'est ici que les points entrent en compte.
     * L'outil de validation a écrit les points dans des champs d'attente
     * (arPoints / arAppreciation) ; l'AR les PROMEUT en teacherScore. Sans ce geste,
     * les points ne sont nulle part dans le calcul — d'où l'absence de tout masquage.
     */
    async _validerAR(consigne, saisie) {
        const donnees = this._donnees(consigne.id);
        if (!donnees) return;

        const code = AtelierCodes.normaliser(saisie);

        // Le formateur vient d'évaluer sur SON appareil : la progression en mémoire ici
        // ne connaît pas encore l'AR. Sans cette relecture, un AR valide serait refusé —
        // ce qui arriverait à chaque échange, l'apprenant restant sur sa page pendant
        // que le formateur note.
        await this._rafraichirEvaluation(consigne.id);

        if (code.length !== AtelierCodes.LONGUEUR_AR) {
            return this._message(consigne, `Un AR compte ${AtelierCodes.LONGUEUR_AR} caractères.`, 'erreur');
        }
        if (!donnees.arHash) {
            return this._message(consigne, 'Aucun AR n\'a encore été émis pour cette consigne.', 'attente');
        }

        const condensat = await AtelierCodes.condensat(code);
        if (condensat !== donnees.arHash) {
            return this._message(consigne, 'Cet AR ne correspond pas à cette consigne.', 'erreur');
        }

        // Les points enregistrés par l'outil font foi ; ceux lus dans le code ne
        // servent qu'au cas où la progression n'a pas encore été synchronisée.
        const lu = AtelierCodes.lireAR(code);
        const points = donnees.arPoints ?? lu?.points ?? 0;

        const pm = window.ProgressManager;
        if (pm?.teacherCorrectQuestion) {
            pm.teacherCorrectQuestion(
                ChapterSession.progress,
                ChapterSession.chapterId,
                consigne.id,
                points,
                donnees.arAppreciation || donnees.teacherComment || '',
                donnees.teacherFeedback || '',
                'corrected'
            );
        } else {
            donnees.teacherScore = points;
        }

        donnees.correctedBy = donnees.arEmisPar || 'atelier';
        donnees.arSaisiAt = new Date().toISOString();
        donnees.arCode = code;

        // L'échange est clos : le code de validation n'a plus à être résolvable.
        // Un ajustement ultérieur des points se fait depuis la vue de correction.
        const slug = window.currentParcoursSlug || (window.Parcours ? Parcours.slug : null);
        if (slug && donnees.codeValidation) {
            await storage.remove(AtelierCodes.cleCodeValidation(slug, donnees.codeValidation));
        }

        await this._enregistrer();
        this._rendre(consigne);

        if (window.ChapterUI?.updateAllProgressIndicators) {
            ChapterUI.updateAllProgressIndicators();
        }
    },

    // ------------------------------------------------------------------------
    // OUTILS D'AFFICHAGE
    // ------------------------------------------------------------------------

    _message(consigne, texte, type) {
        const zone = document.getElementById(`atelier-msg-${consigne.id}`);
        if (!zone) return;
        zone.textContent = texte;
        zone.className = `atelier-message atelier-message-${type}`;
    },

    /** Virgule décimale : les points tombent souvent sur des quarts (0,75 / 2,5). */
    _nombre(valeur) {
        return Number(valeur || 0).toLocaleString('fr-FR');
    },

    _libelleNiveau(cle) {
        return this.NIVEAUX.find(n => n.cle === cle)?.label || 'non précisé';
    },

    _date(iso) {
        if (!iso) return '';
        try {
            return new Date(iso).toLocaleDateString('fr-FR', {
                day: '2-digit', month: '2-digit', year: 'numeric'
            });
        } catch (_) {
            return '';
        }
    },

    _echapper(texte) {
        const noeud = document.createElement('div');
        noeud.textContent = texte;
        return noeud.innerHTML;
    }
};

window.AtelierQuestion = AtelierQuestion;
