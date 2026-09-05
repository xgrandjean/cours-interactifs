/**
 * qrQuestion.js — QRCode et nom de l'apprenant dans le bandeau de chaque question
 * ============================================================================
 *
 * INTENTION
 * ---------
 * Le formateur circule dans la salle. Pour commenter le travail affiché devant lui, il
 * devait jusqu'ici retrouver la classe, l'apprenant, le chapitre et la question dans son
 * tableau de bord. Le QRCode de ce module supprime cette recherche : scanné depuis l'outil
 * formateur, il désigne exactement une question d'un apprenant.
 *
 * Le nom affiché à côté sert à deux choses : identifier de visu l'écran devant lequel on se
 * trouve, et vérifier après le scan qu'on est bien sur le bon apprenant.
 *
 * CE QUE CONTIENT LE QRCODE
 * -------------------------
 *      XSQ1|{slug}|{empreinte}|{chapitreId}|{questionId}
 *
 * Le format est figé et vit dans `qrCharge.js`, source unique de vérité partagée avec
 * l'outil formateur qui le lit. Ne pas le réimplémenter ici.
 *
 * Chaîne autoporteuse : contrairement aux tickets du mode Atelier
 * (`{slug}:atelier:code_XXXXXX`), RIEN N'EST ÉCRIT EN BASE. Le scan ne dépend d'aucun
 * aller-retour préalable, ce qui est indispensable pour un affichage présent sur toutes les
 * questions de tous les chapitres.
 *
 * COMMENT C'EST AFFICHÉ
 * ---------------------
 * Le HTML des questions est pré-généré et figé dans `parcours/cours.json` (item._html) :
 * on ne le touche jamais. On décore le DOM après affichage, exactement comme le fait
 * `atelier/atelierQuestion.js`.
 *
 * La vignette du bandeau fait 28 px : trop petite pour être scannée, c'est voulu — le
 * bandeau ne doit pas grossir. Un clic ouvre le QRCode en grand, et c'est celui-là qu'on
 * scanne. La vignette n'est qu'une affordance.
 */

(function () {
    'use strict';

    const QRQuestion = {

        empreinte: null,
        nom: null,

        // --------------------------------------------------------------------
        // ENTRÉE
        // --------------------------------------------------------------------

        /**
         * Décore toutes les questions affichées. Appelé depuis chapitre.js après
         * restoreAllAnswers() et après le tirage d'ordre : les sections sont alors en place
         * et à leur position définitive.
         */
        async init() {
            try {
                if (!this._autorise()) return;

                const slug = window.currentParcoursSlug || (window.Parcours ? Parcours.slug : null);
                const token = window.ChapterSession?.studentId;
                const chapitreId = window.ChapterSession?.chapterId;
                if (!slug || !token || !chapitreId) return;
                if (token === 'anonymous' || token === '_guest') return;
                if (typeof window.qrcode !== 'function' || !window.QRCharge) return;

                const fiche = await this._fiche(token);
                if (!fiche) return;
                this.nom = fiche.name;

                this.empreinte = await QRCharge.empreinte(slug, token);
                if (!this.empreinte) return;

                document.querySelectorAll('.question-section[data-question-id]')
                    .forEach(section => this._decorer(section, slug, chapitreId));
            } catch (e) {
                // Un QRCode absent ne doit jamais empêcher de répondre aux questions.
                console.warn('[QRQuestion] décoration abandonnée :', e);
            }
        },

        /**
         * Vue formateur : prévisualisation en lecture seule, sur l'écran du formateur —
         * il n'a rien à se scanner à lui-même. La simulation apprenant, elle, affiche bien
         * le QRCode : l'interface y est vivante à dessein, le formateur doit voir ce que
         * l'apprenant voit.
         */
        _autorise() {
            const params = new URLSearchParams(window.location.search);
            return params.get('teacher_view') !== 'true';
        },

        /**
         * Le nom n'est pas dans la progression — chapitre.js y inscrit la chaîne littérale
         * « Apprenant ». Il vient de `{slug}:teacher:users_list`, comme pour l'en-tête de
         * page (chapterInit.js).
         */
        async _fiche(token) {
            if (typeof window.DataStorage !== 'function') return null;
            return await new DataStorage().findUserByToken(token);
        },

        // --------------------------------------------------------------------
        // CHARGE UTILE
        // --------------------------------------------------------------------

        charge(slug, chapitreId, questionId) {
            return QRCharge.construire(slug, this.empreinte, chapitreId, questionId);
        },

        /**
         * SVG du QRCode. Version automatique (0) et correction d'erreur M : le compromis
         * habituel, et une charge d'environ 65 caractères tient largement.
         * `scalable` laisse la taille au CSS — la même image sert la vignette et la modale.
         */
        _svg(charge, cellSize) {
            const qr = window.qrcode(0, 'M');
            qr.addData(charge);
            qr.make();
            return qr.createSvgTag({ cellSize: cellSize || 2, margin: 2, scalable: true });
        },

        // --------------------------------------------------------------------
        // DÉCORATION DU BANDEAU
        // --------------------------------------------------------------------

        _decorer(section, slug, chapitreId) {
            const meta = section.querySelector('.question-meta');
            const questionId = section.dataset.questionId;
            if (!meta || !questionId || meta.querySelector('.qr-badge')) return;

            const charge = this.charge(slug, chapitreId, questionId);

            const bouton = document.createElement('button');
            bouton.type = 'button';
            bouton.className = 'qr-badge';
            bouton.title = 'Afficher le QRCode en grand';
            bouton.setAttribute('aria-label', `Afficher en grand le QRCode de cette question — ${this.nom}`);
            bouton.innerHTML = this._svg(charge);
            bouton.addEventListener('click', () => this._agrandir(charge, section));

            const identite = document.createElement('span');
            identite.className = 'qr-nom';
            identite.textContent = this.nom;
            identite.title = this.nom;

            meta.appendChild(bouton);
            meta.appendChild(identite);
        },

        // --------------------------------------------------------------------
        // AGRANDISSEMENT
        // --------------------------------------------------------------------

        /** Une seule modale, réutilisée : douze questions ne doivent pas faire douze nœuds. */
        _agrandir(charge, section) {
            const titre = section.querySelector('.question-title h3')?.textContent?.trim() || '';
            const modale = this._modale();

            modale.querySelector('.qr-modale-code').innerHTML = this._svg(charge, 4);
            modale.querySelector('.qr-modale-nom').textContent = this.nom;
            modale.querySelector('.qr-modale-question').textContent = titre;
            modale.querySelector('.qr-modale-charge').textContent = charge;
            modale.querySelector('.qr-modale-copier').textContent = '📋 Copier';
            modale.hidden = false;
            modale.querySelector('.qr-modale-fermer').focus();
        },

        /**
         * Copie la charge. `navigator.clipboard` exige un contexte sûr et n'est pas toujours
         * là ; on retombe alors sur la sélection du texte, que l'utilisateur copie lui-même.
         */
        async _copier(bouton, modale) {
            const zone = modale.querySelector('.qr-modale-charge');
            try {
                await navigator.clipboard.writeText(zone.textContent);
                bouton.textContent = '✅ Copié';
            } catch (e) {
                const selection = window.getSelection();
                const plage = document.createRange();
                plage.selectNodeContents(zone);
                selection.removeAllRanges();
                selection.addRange(plage);
                bouton.textContent = '⌨️ Copiez la sélection';
            }
        },

        _modale() {
            let modale = document.getElementById('qr-modale');
            if (modale) return modale;

            modale = document.createElement('div');
            modale.id = 'qr-modale';
            modale.className = 'qr-modale';
            modale.hidden = true;
            modale.innerHTML = `
                <div class="qr-modale-fond"></div>
                <div class="qr-modale-boite" role="dialog" aria-modal="true" aria-label="QRCode de la question">
                    <button type="button" class="qr-modale-fermer" aria-label="Fermer">✕</button>
                    <div class="qr-modale-code"></div>
                    <div class="qr-modale-nom"></div>
                    <div class="qr-modale-question"></div>
                    <!-- Là où la caméra n'est pas disponible — la copie intégrée dans XSpro —
                         l'outil formateur attend cette chaîne au clavier. Sans elle affichée,
                         son champ de saisie manuelle réclamerait un texte que personne ne peut
                         lire. Elle ne contient aucun secret : le token n'y est pas. -->
                    <code class="qr-modale-charge"></code>
                    <button type="button" class="qr-modale-copier">📋 Copier</button>
                </div>`;
            document.body.appendChild(modale);

            modale.querySelector('.qr-modale-copier')
                  .addEventListener('click', e => this._copier(e.currentTarget, modale));

            const fermer = () => { modale.hidden = true; };
            modale.querySelector('.qr-modale-fond').addEventListener('click', fermer);
            modale.querySelector('.qr-modale-fermer').addEventListener('click', fermer);
            document.addEventListener('keydown', e => {
                if (e.key === 'Escape' && !modale.hidden) fermer();
            });
            return modale;
        }
    };

    window.QRQuestion = QRQuestion;
})();
