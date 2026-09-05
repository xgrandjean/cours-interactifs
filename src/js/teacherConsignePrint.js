/**
 * teacherConsignePrint.js — La feuille de consignes imprimable du mode Consigne
 * ============================================================================
 *
 * INTENTION
 * ---------
 * En mode Consigne, l'apprenant répond sur papier. Il lui faut donc une feuille : les
 * énoncés, la place pour écrire, et surtout un QRCode par question — celui que le
 * formateur scanne depuis « ✍️ Correction en salle » pour noter la question sans avoir à
 * retrouver la classe, l'apprenant et le chapitre dans son tableau de bord.
 *
 * La feuille est donc NOMINATIVE : le QRCode porte l'empreinte de l'apprenant, il ne peut
 * pas servir pour un autre. Un jeu de pages par apprenant, une page de garde par jeu.
 *
 * LE NOM À CÔTÉ DE CHAQUE QRCODE
 * ------------------------------
 * Le nom est rappelé en vertical à gauche de CHAQUE QRCode, et pas seulement sur la page de
 * garde. La hauteur du QRCode offre la place, et ce rappel sert trois fois :
 *
 *   1. au récolement : le formateur qui ramasse ou reprend une feuille voit à qui elle est
 *      sans avoir à remonter à la première page ni à déchiffrer une écriture manuscrite ;
 *   2. à la dissuasion : deux apprenants ne peuvent plus échanger discrètement leurs
 *      feuilles, le nom est répété à chaque question ;
 *   3. au message : la feuille se lit d'un coup d'œil comme personnelle, ce que le seul
 *      QRCode — illisible à l'œil — ne dit pas.
 *
 * Écrit en vertical descendant (writing-mode: vertical-lr), la convention des dos de
 * livres en français, et non en travers de la page où il volerait de la place à l'énoncé.
 *
 * PAS DE NUMÉROTATION DES PAGES — ET POURQUOI
 * -------------------------------------------
 * Chaque question porte son rang ET le total (« 2 sur 12 »). Avec le nom à côté de chaque
 * QRCode, toute feuille détachée de la liasse reste donc identifiable, et il se voit qu'une
 * feuille manque. C'est du HTML ordinaire : aucune dépendance.
 *
 * Un vrai pied de page « feuille X sur Y » a été écarté après mesure, pour deux raisons :
 *   - il exige les boîtes de marge de @page. Chromium les honore bien — vérifié en
 *     imprimant en PDF : counter(pages) se résout au vrai total — mais Firefox ne les
 *     implémente pas, et le pied disparaîtrait alors en silence ;
 *   - counter(page)/counter(pages) comptent les pages du DOCUMENT. Sur une impression de
 *     classe, on lirait « feuille 7 sur 36 » et non « feuille 1 sur 3 ». Remettre le
 *     compteur à zéro par apprenant ne marche pas : `counter-reset: page` est ignoré
 *     (mesuré aussi), et il n'existe aucun compteur « pages de cette section ».
 * Imprimer un seul apprenant à la fois redonne une numérotation juste, si le besoin
 * revient un jour.
 *
 * CE QUI EST ÉCRIT EN BASE, ET POURQUOI
 * -------------------------------------
 * Le QRCode lui-même n'écrit rien : sa charge est autoporteuse (voir qrCharge.js).
 * Imprimer, en revanche, CRÉE la ligne de suivi de l'apprenant si elle n'existe pas.
 *
 * C'est délibéré et c'est le seul moyen d'y arriver. Un apprenant qui travaille sur papier
 * n'ouvre jamais le chapitre dans l'application : il n'a donc aucune entrée
 * `progress.chapters[chapitre]`. Or la liste des rendus saute les couples sans entrée
 * (teacherSubmissions.js), le modal de correction refuse de s'ouvrir sans elle, et la vue
 * XSpro n'affiche même pas d'onglet. Sans cet amorçage, la copie papier resterait
 * incorrigeable même avec la posture de correction du mode consigne.
 *
 * Imprimer la feuille EST le geste de distribuer le travail : c'est le bon moment pour
 * ouvrir le suivi, et c'est un geste explicite du formateur, pas un effet de bord.
 * L'entrée est créée par `ProgressManager.initChapter()`, la même fonction qu'au premier
 * démarrage d'un apprenant — donc avec `frozenAt` ET `frozenChapterMode` posés ensemble
 * (les séparer éteindrait tous les drapeaux de mode, cf. getExamContext.js).
 *
 * LES QRCODES SONT OPTIONNELS
 * ---------------------------
 * La case « Imprimer les QRCodes » est cochée par défaut, et peut être décochée : tout le
 * mode Consigne garde son intérêt pour qui veut seulement des feuilles d'énoncés
 * nominatives et corriger ensuite par les voies habituelles (le modal de correction, ou
 * XSpro). Décochée, le bloc du QRCode disparaît — et le nom qui lui est accolé avec lui,
 * puisqu'il n'a de sens qu'à côté de lui. La page de garde reste nominative dans les deux
 * cas, et l'amorçage du suivi a lieu dans les deux cas aussi : sans lui, la copie ne
 * s'afficherait nulle part, avec ou sans QRCode.
 *
 * POURQUOI HTTPS EST NÉCESSAIRE — MAIS SEULEMENT POUR LES QRCODES
 * ---------------------------------------------------------------
 * L'empreinte du QRCode est un SHA-256 calculé par `crypto.subtle`, indisponible hors
 * contexte sûr — c'est-à-dire sur une adresse LAN en http://192.168… .
 *
 * Cette contrainte ne pèse QUE sur les QRCodes : les énoncés ne demandent aucun calcul.
 * Hors contexte sûr, on décoche donc la case et on la verrouille, en expliquant pourquoi,
 * au lieu de refuser toute l'impression comme on le faisait d'abord — un formateur en LAN
 * peut sortir ses feuilles. Le bouton, lui, reste toujours visible : celui qui ne trouve
 * pas un bouton que son collègue a ne sait pas pourquoi. C'est la même contrainte que le
 * scan, déjà décrite dans la fiche d'aide « applicationTelephone ».
 *
 * IMPRESSION PAR IFRAME
 * ---------------------
 * On écrit un document complet dans une iframe cachée, puis on appelle son `print()`.
 * Plutôt qu'une fenêtre séparée : pas de bloqueur de popup à contourner, et le même
 * chemin fonctionne dans le navigateur comme dans la copie embarquée sous Electron.
 * L'aperçu du navigateur sert de relecture, et son « Enregistrer au format PDF » suffit à
 * qui veut garder la feuille.
 */

(function () {
    'use strict';

    const TeacherConsignePrint = {

        dashboard: null,
        chapterId: null,

        // ====================================================================
        // ENTRÉE
        // ====================================================================

        /** Ouvre la boîte de choix. Appelé depuis la carte de chapitre (teacherChapters.js). */
        async ouvrir(chapterId, dashboard) {
            this.dashboard = dashboard;
            this.chapterId = chapterId;

            const chapitre = this._chapitre();
            if (!chapitre) {
                alert('Chapitre introuvable.');
                return;
            }

            const apprenants = await dashboard.getStudents();
            this._afficherModale(chapitre, apprenants);
        },

        /**
         * La configuration du chapitre vient de `dashboard.chapters`, qui fusionne déjà
         * cours.json et les réglages de chapter_config : c'est là que vit le mode choisi.
         */
        _chapitre() {
            return (this.dashboard?.chapters || []).find(ch => ch.id == this.chapterId) || null;
        },

        /**
         * `crypto.subtle` n'existe qu'en contexte sûr. On teste la capacité elle-même
         * plutôt que le protocole : localhost est un contexte sûr, une adresse LAN non.
         */
        _contexteSur() {
            return Boolean(window.isSecureContext && window.crypto?.subtle);
        },

        // ====================================================================
        // BOÎTE DE CHOIX
        // ====================================================================

        _afficherModale(chapitre, apprenants) {
            this.fermer();

            const classes = [...new Set(apprenants.map(a => a.class).filter(Boolean))].sort();
            const corps = this._corpsChoix(apprenants, classes);

            const html = `
                <div class="modal-overlay" id="consigne-print-modal">
                    <div class="modal-content" style="max-width: 560px;">
                        <div class="modal-header">
                            <h3>🖨️ Feuille de consignes — ${this._echapper(chapitre.title)}</h3>
                            <button class="close-btn" id="consigne-print-close">&times;</button>
                        </div>
                        <div class="modal-body">${corps}</div>
                    </div>
                </div>`;
            document.body.insertAdjacentHTML('beforeend', html);

            document.getElementById('consigne-print-close').addEventListener('click', () => this.fermer());

            const selClasse = document.getElementById('consigne-print-classe');
            if (!selClasse) return;   // parcours sans apprenant : rien à régler
            const selApprenant = document.getElementById('consigne-print-apprenant');
            const majApprenants = () => {
                const classe = selClasse.value;
                const retenus = classe === 'all' ? apprenants : apprenants.filter(a => a.class === classe);
                selApprenant.innerHTML = `<option value="all">— Tous les apprenants (${retenus.length}) —</option>`
                    + retenus.map(a => `<option value="${this._echapper(a.id)}">${this._echapper(a.name)}</option>`).join('');
            };
            majApprenants();
            selClasse.addEventListener('change', majApprenants);

            document.getElementById('consigne-print-go').addEventListener('click', async () => {
                const classe = selClasse.value;
                const choix = selApprenant.value;
                const retenus = (classe === 'all' ? apprenants : apprenants.filter(a => a.class === classe))
                    .filter(a => choix === 'all' || a.id === choix);
                if (!retenus.length) { alert('Aucun apprenant sélectionné.'); return; }
                const caseQR = document.getElementById('consigne-print-qr');
                await this._imprimer(chapitre, retenus, Boolean(caseQR?.checked));
            });
        },

        _corpsChoix(apprenants, classes) {
            if (!apprenants.length) {
                return `<p>Aucun apprenant dans ce parcours. Ajoutez-en dans « 👥 Utilisateurs »
                        avant d'imprimer : la feuille est nominative, chaque QRCode ne vaut que
                        pour un apprenant.</p>`;
            }
            // Le contexte sûr ne conditionne QUE les QRCodes. Hors HTTPS, on décoche et on
            // verrouille la case au lieu de refuser toute la feuille : les énoncés, eux, se
            // sont toujours imprimés sans aucun calcul.
            const qrPossible = this._contexteSur();
            return `
                <div class="form-group">
                    <label for="consigne-print-classe">Classe</label>
                    <select id="consigne-print-classe" style="width:100%; padding:0.4rem;">
                        <option value="all">Toutes</option>
                        ${classes.map(c => `<option value="${this._echapper(c)}">${this._echapper(c)}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group" style="margin-top:0.75rem;">
                    <label for="consigne-print-apprenant">Apprenant</label>
                    <select id="consigne-print-apprenant" style="width:100%; padding:0.4rem;"></select>
                </div>
                <div class="form-group" style="margin-top:1rem;">
                    <label style="display:flex; align-items:flex-start; gap:0.5rem; cursor:${qrPossible ? 'pointer' : 'not-allowed'};">
                        <input type="checkbox" id="consigne-print-qr" style="margin-top:0.25rem;"
                               ${qrPossible ? 'checked' : 'disabled'}>
                        <span>
                            <strong>Imprimer les QRCodes</strong><br>
                            <span style="font-size:0.9em; color:#555;">
                                Un QRCode par question, à scanner depuis « ✍️ Correction en salle » pour
                                noter directement la question. Décochez pour une feuille d'énoncés
                                nue — le nom accolé aux QRCodes disparaît avec eux, et la correction
                                se fait alors par les voies habituelles.
                            </span>
                        </span>
                    </label>
                </div>
                ${qrPossible ? '' : this._noteContexte()}
                <p style="margin-top:1rem; font-size:0.9em; color:#555;">
                    Un jeu de pages par apprenant : en-tête nominatif, énoncés, barème et place
                    pour écrire.
                </p>
                <p style="margin-top:0.5rem; font-size:0.9em; background:#f6f1e7; border-left:4px solid #d9c9a3; color:#7a5c1e; padding:0.5rem 0.75rem;">
                    ℹ️ Imprimer ouvre aussi le <strong>suivi de correction</strong> des apprenants
                    concernés qui n'ont pas encore ouvert le chapitre. Sans cela leur copie papier
                    n'apparaîtrait nulle part : ni dans « 📬 Rendus à corriger », ni dans XSpro.
                </p>
                <div style="margin-top:1rem; display:flex; gap:0.75rem; justify-content:flex-end;">
                    <button class="btn btn-primary" id="consigne-print-go">🖨️ Préparer l'impression</button>
                </div>`;
        },

        /**
         * Pourquoi la case QRCode est verrouillée ici. Ce n'est plus un refus d'imprimer :
         * la feuille d'énoncés sort quand même, seuls les QRCodes manquent.
         */
        _noteContexte() {
            return `
                <p style="margin-top:0.5rem; font-size:0.9em; background:#fff3e0; border-left:4px solid #ffb74d; color:#8a4b00; padding:0.5rem 0.75rem;">
                    ⚠️ <strong>QRCodes indisponibles depuis cette adresse</strong> — la feuille
                    d'énoncés, elle, s'imprime normalement.<br>
                    Leur empreinte est un SHA-256 calculé par <code>crypto.subtle</code>, que le
                    navigateur ne fournit qu'en <strong>contexte sûr</strong> : HTTPS ou
                    <code>localhost</code>. Sur une adresse réseau du type
                    <code>http://192.168.…</code>, aucune empreinte n'est calculable ; imprimer
                    quand même produirait des QRCodes que le scan ne rattacherait à personne, et
                    l'erreur ne se verrait qu'au premier scan d'une feuille déjà distribuée.
                    C'est la même contrainte que le scan (voir la fiche « 📱 Application
                    téléphone »). Pour les obtenir, imprimez depuis le site publié en HTTPS.<br>
                    <span style="color:#666;">Adresse actuelle :
                    <code>${this._echapper(window.location.origin || window.location.href)}</code></span>
                </p>`;
        },

        fermer() {
            document.getElementById('consigne-print-modal')?.remove();
        },

        // ====================================================================
        // AMORÇAGE DU SUIVI
        // ====================================================================

        /**
         * Crée l'entrée de progression manquante, avec la même fonction qu'au premier
         * démarrage d'un apprenant : on ne fabrique pas une structure à la main, elle
         * dériverait de celle que produit l'application.
         *
         * @returns {boolean} true si une entrée a été créée (donc s'il faut sauvegarder)
         */
        async _amorcerSuivi(apprenant, chapitre) {
            const progress = await this.dashboard.getStudentProgress(apprenant.id);
            if (!progress.chapters) progress.chapters = {};
            if (progress.chapters[this.chapterId]) return false;

            progress.chapters[this.chapterId] = ProgressManager.initChapter(chapitre);

            const slug = window.currentParcoursSlug;
            const cle = slug
                ? `${slug}:${apprenant.id}:student_${apprenant.id}_progress`
                : `student_${apprenant.id}_progress`;
            await storage.set(cle, progress);
            console.log(`[TeacherConsignePrint] suivi amorcé pour ${apprenant.id} sur le chapitre ${this.chapterId}`);
            return true;
        },

        // ====================================================================
        // CONSTRUCTION DE LA FEUILLE
        // ====================================================================

        /**
         * @param {boolean} avecQR  case « Imprimer les QRCodes ». Décochée, on n'appelle ni le
         *   générateur ni crypto.subtle : la feuille d'énoncés ne dépend de rien, et le
         *   formateur qui corrige par les voies habituelles n'a que faire des QRCodes.
         */
        async _imprimer(chapitre, apprenants, avecQR = true) {
            const bouton = document.getElementById('consigne-print-go');
            if (bouton) { bouton.disabled = true; bouton.textContent = '⏳ Préparation…'; }

            try {
                const slug = window.currentParcoursSlug || (window.Parcours ? Parcours.slug : null);
                if (!slug) { alert('Aucun parcours sélectionné.'); return; }
                if (avecQR && (typeof window.qrcode !== 'function' || !window.QRCharge)) {
                    alert("Le générateur de QRCode n'est pas chargé : impression annulée plutôt qu'une feuille aux QRCodes vides.\n\n"
                        + "Décochez « Imprimer les QRCodes » pour sortir la feuille d'énoncés malgré tout.");
                    return;
                }

                const questions = (chapitre.questions || []).slice().sort((a, b) => (a._order ?? 0) - (b._order ?? 0));
                if (!questions.length) {
                    alert('Ce chapitre ne contient aucune question : rien à imprimer.');
                    return;
                }

                // Une empreinte par apprenant, donc une boucle d'await : crypto.subtle est
                // asynchrone, et rien ici ne peut être calculé d'avance. Sans QRCode, on
                // n'entre même pas dans ce calcul.
                let amorces = 0;
                const jeux = [];
                for (const apprenant of apprenants) {
                    let empreinte = null;
                    if (avecQR) {
                        empreinte = await QRCharge.empreinte(slug, apprenant.id);
                        if (!empreinte) {
                            alert(`Empreinte incalculable pour ${apprenant.name} : impression annulée.\n\n`
                                + "Cause probable : le module AtelierCodes n'est pas chargé, ou la page n'est pas en contexte sûr.\n"
                                + "Décochez « Imprimer les QRCodes » pour sortir la feuille d'énoncés malgré tout.");
                            return;
                        }
                    }
                    // L'amorçage du suivi a lieu dans les DEUX cas : sans QRCode, le formateur
                    // corrigera depuis le modal ou depuis XSpro, qui ont tout autant besoin de
                    // l'entrée de progression pour montrer la copie.
                    if (await this._amorcerSuivi(apprenant, chapitre)) amorces++;
                    jeux.push(this._pageApprenant(chapitre, questions, apprenant, slug, empreinte));
                }

                this._lancerImpression(this._document(chapitre, jeux.join('')));
                this.fermer();

                // Les vues qui listent les copies doivent voir les entrées qu'on vient de créer.
                if (amorces > 0 && this.dashboard?.modules?.submissions?.refresh) {
                    await this.dashboard.modules.submissions.refresh();
                }
            } catch (e) {
                console.error('[TeacherConsignePrint] impression abandonnée :', e);
                alert("Impression abandonnée : " + (e?.message || e));
            } finally {
                if (bouton) { bouton.disabled = false; bouton.textContent = "🖨️ Préparer l'impression"; }
            }
        },

        /** Un jeu de pages pour un apprenant : garde nominative puis les questions. */
        _pageApprenant(chapitre, questions, apprenant, slug, empreinte) {
            const total = questions.reduce((somme, q) => somme + (Number(q.points) || 0), 0);
            const aujourdhui = new Date().toLocaleDateString('fr-FR');

            const garde = `
                <header class="garde">
                    <div class="garde-titre">
                        <h1>${this._echapper(chapitre.title)}</h1>
                        <p class="garde-mode">📋 Consigne — à compléter sur cette feuille</p>
                    </div>
                    <table class="garde-identite">
                        <tr><th>Nom</th><td>${this._echapper(apprenant.name)}</td></tr>
                        <tr><th>Classe</th><td>${this._echapper(apprenant.class || '—')}</td></tr>
                        <tr><th>Date</th><td>${this._echapper(aujourdhui)}</td></tr>
                        <tr><th>Barème</th><td>${questions.length} question(s) — ${total} point(s)</td></tr>
                    </table>
                    <p class="garde-note">${empreinte
                        ? `Cette feuille vous est personnelle : les QRCodes portent votre identité et
                           ne valent pour personne d'autre. Ne les recouvrez pas en écrivant.`
                        : `Cette feuille vous est personnelle. Répondez dans les espaces prévus, et
                           n'oubliez pas de vérifier votre nom en tête de page.`}
                    </p>
                </header>`;

            const corps = questions
                .map((q, i) => this._blocQuestion(q, i + 1, questions.length, slug, chapitre.id, empreinte, apprenant))
                .join('');

            // `saut-jeu` force la page suivante pour l'apprenant d'après ; le dernier n'en a pas
            // besoin, mais une page blanche finale est moins grave qu'un jeu à cheval sur deux.
            return `<section class="jeu">${garde}${corps}</section>`;
        },

        /**
         * @param {string|null} empreinte  null quand la case « Imprimer les QRCodes » est
         *   décochée : le bloc du QRCode — et donc le nom qui lui est accolé — disparaît
         *   entièrement, et le titre de la question reprend toute la largeur.
         */
        _blocQuestion(q, numero, total, slug, chapitreId, empreinte, apprenant) {
            const points = Number(q.points) || 0;
            const enonce = q.questionTextHtml || (q.questionText ? `<p>${this._echapper(q.questionText)}</p>` : '');

            // Les propositions sont imprimées avec une case à cocher : sur papier, c'est ce qui
            // rend un QCM répondable. Elles ne sont PAS mélangées — l'ordre aléatoire est
            // réservé aux modes Examen/Blind/Millionnaire et n'a pas de sens sur une feuille.
            const propositions = Array.isArray(q.options) && q.options.length
                ? `<ol class="propositions">${q.options.map(o => `<li><span class="case"></span>${this._echapper(o)}</li>`).join('')}</ol>`
                : '';

            // Une image d'énoncé est référencée relativement à la page du parcours ; dans le
            // document que l'on fabrique, ce chemin ne veut plus rien dire. On le résout en
            // absolu. Non testé sur des données réelles : les jeux d'essai n'en contiennent pas.
            const image = q.imageQuestion
                ? `<p class="image-enonce"><img src="${this._echapper(this._absolu(q.imageQuestion))}" alt=""></p>`
                : '';

            // Hauteur de la zone de réponse selon le type : une question ouverte a besoin de
            // place, un QCM n'en a presque pas besoin puisqu'on coche au-dessus.
            const lignes = q.type === 'ouverte' ? 8 : (q.type === 'courte' ? 2 : 1);
            const zone = `<div class="reponse lignes-${lignes}">${'<span class="ligne"></span>'.repeat(lignes)}</div>`;

            // Le nom accolé n'a de sens qu'à côté du QRCode : sans QRCode, il disparaît avec
            // lui. La page de garde porte toujours le nom, elle.
            const blocQR = empreinte ? (() => {
                const charge = QRCharge.construire(slug, empreinte, chapitreId, q.id);
                return `<div class="qr-bloc">
                            ${this._nomVertical(apprenant?.name)}
                            <div class="qr" title="${this._echapper(charge)}">${this._svg(charge)}</div>
                        </div>`;
            })() : '';

            return `
                <article class="question">
                    <div class="question-tete">
                        ${'' /* « 2 sur 12 » plutôt qu'un simple « 2. » : le rang ET le total
                             figurent ainsi sur chaque feuille, quelle que soit la page où la
                             question tombe. C'est ce qui permet de voir qu'une feuille manque
                             sans numéroter les pages — impossible à faire sans dépendre des
                             compteurs @page, que seul Chromium honore (mesuré) et qui compteraient
                             de toute façon les pages du DOCUMENT, pas celles de l'apprenant. */}
                        <h2><span class="rang">${numero} sur ${total}</span> — ${this._echapper(q.title || `Question ${numero}`)}
                            <span class="bareme">${points} pt${points > 1 ? 's' : ''}</span></h2>
                        ${'' /* Le nom borde le QRCode sur toute sa hauteur : voir l'en-tête du
                             fichier pour le pourquoi (récolement, dissuasion, feuille
                             personnelle). `aria-hidden` parce que c'est un rappel visuel
                             répété douze fois — la page de garde le dit déjà une fois. */}
                        ${blocQR}
                    </div>
                    <div class="enonce">${enonce}${image}</div>
                    ${propositions}
                    ${zone}
                </article>`;
        },

        /**
         * Le nom en colonnes verticales, UNE PAR MOT.
         *
         * Laisser le navigateur découper tout seul donnait « VANDERMEERSC | H » : la coupure
         * tombait au milieu du nom de famille, c'est-à-dire précisément sur ce qui sert au
         * récolement. Une colonne par mot supprime le cas, et l'ordre des colonnes devient
         * explicite au lieu de dépendre du sens d'empilement du writing-mode.
         *
         * Un mot seul plus long que la hauteur du QRCode reste possible (un nom composé sans
         * espace) : le CSS le tronque alors avec des points de suspension. On ne tronque pas
         * ici, en JavaScript, parce qu'il faudrait deviner une largeur de glyphes — le
         * navigateur, lui, la connaît.
         */
        _nomVertical(nom) {
            const mots = String(nom || '').trim().split(/\s+/).filter(Boolean);
            if (!mots.length) return '';
            const colonnes = mots.map(m => `<span>${this._echapper(m)}</span>`).join('');
            return `<div class="qr-nom" aria-hidden="true">${colonnes}</div>`;
        },

        _absolu(src) {
            try { return new URL(src, window.location.href).href; } catch (e) { return src; }
        },

        /**
         * SVG du QRCode. Mêmes réglages que qrQuestion.js (version automatique, correction
         * d'erreur M) : c'est le même lecteur qui les scannera. `scalable` laisse la taille
         * au CSS, ce qui permet d'imprimer plus gros que la vignette de l'écran.
         */
        _svg(charge) {
            const qr = window.qrcode(0, 'M');
            qr.addData(charge);
            qr.make();
            return qr.createSvgTag({ cellSize: 3, margin: 1, scalable: true });
        },

        // ====================================================================
        // DOCUMENT ET IMPRESSION
        // ====================================================================

        _document(chapitre, contenu) {
            return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8">
<title>Feuille de consignes — ${this._echapper(chapitre.title)}</title>
<style>
    /* Feuille de travail : lisible à l'écran pour la relecture, calibrée pour l'A4 à
       l'impression. Aucune dépendance externe — le document est autonome. */
    * { box-sizing: border-box; }
    body { font: 12pt/1.45 Georgia, 'Times New Roman', serif; margin: 0; color: #111; background: #fff; }
    .jeu { padding: 14mm 14mm 10mm; }
    .jeu + .jeu { border-top: 2px dashed #bbb; }

    .garde { border: 1.5pt solid #111; padding: 6mm; margin-bottom: 8mm; }
    .garde-titre h1 { font-size: 17pt; margin: 0 0 1mm; }
    .garde-mode { margin: 0 0 4mm; font-size: 10.5pt; color: #6b5117; font-weight: bold; }
    .garde-identite { width: 100%; border-collapse: collapse; font-size: 11pt; }
    .garde-identite th { text-align: left; width: 26mm; padding: 1.4mm 0; font-weight: bold; }
    .garde-identite td { border-bottom: 0.6pt solid #999; padding: 1.4mm 0; }
    .garde-note { margin: 4mm 0 0; font-size: 9pt; color: #444; font-style: italic; }

    .question { margin: 0 0 7mm; page-break-inside: avoid; break-inside: avoid; }
    .question-tete { display: flex; align-items: flex-start; gap: 4mm; }
    .question-tete h2 { flex: 1; font-size: 12.5pt; margin: 0 0 2mm; }
    .bareme { font-weight: normal; font-size: 10pt; color: #555; white-space: nowrap; }
    /* Le rang tient la place du « 2. » d'avant : même poids visuel, mais il porte aussi le
       total, donc chaque feuille dit combien de questions compte le devoir. */
    .rang { white-space: nowrap; }
    .qr-bloc { display: flex; align-items: flex-start; gap: 1.2mm; flex: 0 0 auto; }
    .qr { width: 22mm; height: 22mm; flex: 0 0 22mm; }
    .qr svg { width: 100%; height: 100%; display: block; }

    /* Nom en vertical descendant, calé sur la hauteur du QRCode : c'est cette hauteur qui
       fait la place, et le rappel ne prend donc rien à l'énoncé.

       Un mot par colonne (les span, voir _nomVertical) : le retour à la ligne automatique
       coupait le nom de famille en deux — « VANDERMEERSC | H » — pile sur ce qui sert au
       récolement.

       Les colonnes sont posées par un flex en ligne plutôt que par l'empilement de blocs
       du writing-mode. Ce dernier donnait déjà le bon ordre (prénom à gauche), mais il
       dépendait d'une propriété d'écriture pour un résultat purement géométrique : avec le
       flex, l'ordre à l'écran est celui du DOM, et se lit dans le code.

       La police est calée pour qu'un nom de famille ordinaire tienne sur les 22 mm. Reste
       le cas d'un mot seul démesuré (un nom composé écrit sans espace) : on le TRONQUE
       avec des points de suspension au lieu de le couper, parce qu'un « VANDERMEERSC | H »
       sur deux colonnes se lit plus mal qu'un « VANDERMEERS… » sur une. Le rappel n'a pas
       à être exhaustif — la page de garde porte le nom complet — il doit être
       reconnaissable d'un coup d'œil. */
    .qr-nom {
        display: flex;
        flex-direction: row;
        align-items: flex-start;
        gap: 0.3mm;
        height: 22mm;
        font-family: Arial, Helvetica, sans-serif;
        font-size: 6pt;
        font-weight: bold;
        letter-spacing: 0.1pt;
        line-height: 1.25;
        text-transform: uppercase;
        color: #333;
    }
    .qr-nom span {
        writing-mode: vertical-lr;
        height: 22mm;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .enonce { font-size: 11.5pt; }
    .enonce p { margin: 0 0 2mm; }
    .image-enonce img { max-width: 100%; }

    .propositions { margin: 2mm 0 3mm; padding-left: 0; list-style: none; }
    .propositions li { margin: 0 0 1.6mm; font-size: 11pt; }
    .case { display: inline-block; width: 3.6mm; height: 3.6mm; border: 0.8pt solid #111; margin-right: 2.5mm; vertical-align: -0.4mm; }

    .reponse { margin-top: 2mm; }
    .ligne { display: block; border-bottom: 0.6pt solid #aaa; height: 7.5mm; }

    @media print {
        /* Un jeu de pages par apprenant : la feuille du suivant commence toujours en haut
           d'une page neuve, sinon deux noms se retrouvent sur la même feuille. */
        .jeu { page-break-after: always; break-after: page; padding: 0; border-top: none; }
        .jeu:last-child { page-break-after: auto; break-after: auto; }
        @page { size: A4; margin: 14mm; }
    }
</style></head><body>${contenu}</body></html>`;
        },

        /**
         * Iframe cachée plutôt qu'une fenêtre : aucun bloqueur de popup à contourner, et le
         * même chemin fonctionne sous Electron. L'iframe est retirée après l'impression —
         * mais pas tout de suite : la fermer pendant que le dialogue est ouvert annulerait
         * l'impression dans certains navigateurs.
         */
        _lancerImpression(html) {
            document.getElementById('consigne-print-frame')?.remove();

            const cadre = document.createElement('iframe');
            cadre.id = 'consigne-print-frame';
            cadre.setAttribute('aria-hidden', 'true');
            cadre.style.cssText = 'position:fixed; right:0; bottom:0; width:0; height:0; border:0;';
            document.body.appendChild(cadre);

            cadre.onload = () => {
                try {
                    cadre.contentWindow.focus();
                    cadre.contentWindow.print();
                } catch (e) {
                    console.warn('[TeacherConsignePrint] print() a échoué :', e);
                    alert("Le dialogue d'impression n'a pas pu s'ouvrir. Réessayez, ou utilisez l'impression du navigateur.");
                }
            };

            const doc = cadre.contentWindow.document;
            doc.open();
            doc.write(html);
            doc.close();
        },

        _echapper(texte) {
            const div = document.createElement('div');
            div.textContent = String(texte ?? '');
            return div.innerHTML;
        }
    };

    window.TeacherConsignePrint = TeacherConsignePrint;
})();
