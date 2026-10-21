// ============================================================================
// RAFRAÎCHISSEMENT DE SESSION — une page élève laissée ouverte se remet à jour
// ============================================================================
// Un onglet rouvert le lendemain sur un téléphone garde le code et les données de la
// veille : rien ne relisait quoi que ce soit au retour (19/10/2026). Ici, quand la page
// redevient visible après avoir été cachée ou gelée plus de SEUIL_MS, elle se recharge :
// les scripts reviennent de GitHub Pages avec validation par ETag (à jour s'ils ont
// changé, du cache sinon), les données du serveur (storage.js, serveur d'abord), et
// l'identité est revérifiée si son mémo de session a plus de 30 min (dataStorage.js).
// Rien n'est ajouté en cache, rien n'est à vider : ce n'est PAS un service worker.
//
// Le rechargement est refusé, et seulement proposé par un bandeau, quand il perdrait
// quelque chose :
//   - des écritures attendent dans la file hors ligne (_sync_queue, storage.js) : elles
//     se rejouent d'abord, au retour du réseau ;
//   - une saisie est en cours : un champ de texte a le focus, ou une réponse rédigée
//     n'est pas encore validée (textarea ou champ texte d'une question, non désactivé,
//     non vide). Sur une page de chapitre avec des réponses rédigées, on propose donc
//     plutôt que d'imposer.
//
// Le temps « caché » se mesure de deux façons, parce qu'un téléphone qui s'endort ne
// prévient pas toujours : l'horodatage posé quand la page passe cachée, et un battement
// par minute tant qu'elle est visible — un battement manquant de plusieurs heures dit
// que l'onglet a été gelé.
// ============================================================================

(function () {
    'use strict';

    const SEUIL_MS = 6 * 60 * 60 * 1000;      // au-delà : la page se recharge d'elle-même
    const BATTEMENT_MS = 60 * 1000;
    const ID_BANDEAU = 'bandeau-rafraichissement-session';

    let derniereVie = Date.now();            // dernier instant où la page était visible et vivante
    let horloge = () => Date.now();           // remplaçable par les bancs
    let recharger = () => { try { window.location.reload(); } catch (_) {} };

    function fileNonVide() {
        try {
            const file = JSON.parse(localStorage.getItem('_sync_queue') || '[]');
            return Array.isArray(file) && file.length > 0;
        } catch (_) {
            return false;
        }
    }

    function estChampTexte(element) {
        if (!element || !element.tagName) return false;
        if (element.tagName === 'TEXTAREA') return true;
        if (element.tagName === 'INPUT') {
            const type = (element.type || 'text').toLowerCase();
            return !['checkbox', 'radio', 'button', 'submit', 'hidden', 'range', 'file'].includes(type);
        }
        return !!element.isContentEditable;
    }

    function saisieEnCours() {
        if (estChampTexte(document.activeElement)) return true;
        const champs = document.querySelectorAll('.question-section textarea, .question-section input[type="text"], .question-section input:not([type])');
        for (const champ of champs) {
            if (!champ.disabled && !champ.readOnly && String(champ.value || '').trim() !== '') return true;
        }
        return false;
    }

    function marquerVivante() {
        derniereVie = horloge();
    }

    function proposer() {
        if (document.getElementById(ID_BANDEAU)) return;
        const bandeau = document.createElement('div');
        bandeau.id = ID_BANDEAU;
        bandeau.setAttribute('role', 'status');
        bandeau.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:9000;padding:.6rem 1rem;'
            + 'background:#fff3cd;border-top:1px solid #ffeaa7;color:#856404;font-size:.95rem;text-align:center;';
        bandeau.innerHTML = 'Cette page est restée ouverte longtemps : ses informations peuvent être anciennes. '
            + '<button type="button" id="' + ID_BANDEAU + '-recharger" style="margin-left:.5rem;padding:.25rem .7rem;border-radius:6px;'
            + 'border:1px solid #d4b106;background:#fff;color:#7b5800;cursor:pointer;">Recharger</button>'
            + '<button type="button" id="' + ID_BANDEAU + '-fermer" aria-label="Fermer" style="margin-left:.5rem;padding:.25rem .5rem;'
            + 'border:none;background:transparent;color:#856404;cursor:pointer;">✕</button>';
        document.body.appendChild(bandeau);
        document.getElementById(ID_BANDEAU + '-recharger').addEventListener('click', () => recharger());
        document.getElementById(ID_BANDEAU + '-fermer').addEventListener('click', () => bandeau.remove());
    }

    /**
     * Au retour de la page. Rend ce qui a été décidé : 'rien' | 'recharge' | 'propose'.
     * @param {boolean} [force]  tenir l'écart pour dépassé (bancs, diagnostic)
     */
    function verifier(force) {
        const ecart = horloge() - derniereVie;
        if (!force && ecart < SEUIL_MS) {
            marquerVivante();
            return 'rien';
        }
        marquerVivante();
        // Un entraînement en cours vit en mémoire seulement : le recharger d'office le perdrait.
        const entrainement = !!(window.ChapterSession && window.ChapterSession.entrainement);
        if (fileNonVide() || saisieEnCours() || entrainement) {
            proposer();
            return 'propose';
        }
        recharger();
        return 'recharge';
    }

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) marquerVivante();
        else verifier();
    });
    // Retour depuis le cache arrière/avant du navigateur : la page revient telle qu'elle était.
    window.addEventListener('pageshow', (e) => { if (e && e.persisted) verifier(); });
    // Battement tant que la page est visible : un trou de plusieurs heures = onglet gelé.
    setInterval(() => { if (!document.hidden) marquerVivante(); }, BATTEMENT_MS);

    window.RafraichissementSession = {
        SEUIL_MS,
        verifier,
        saisieEnCours,
        fileNonVide,
        /** Pour les bancs : horloge et rechargement remplaçables. */
        _configurer({ horloge: h, recharger: r, derniereVie: d } = {}) {
            if (typeof h === 'function') horloge = h;
            if (typeof r === 'function') recharger = r;
            if (typeof d === 'number') derniereVie = d;
        },
        _derniereVie() { return derniereVie; },
    };
})();
