// ============================================================================
// ATELIER CODES - Codes de validation et AR du mode Atelier AR
// ============================================================================
// Module PARTAGÉ entre la page chapitre (apprenant) et l'outil suiviAtelier.html
// (formateur). Toute divergence entre les deux côtés rendrait les AR inutilisables :
// ne pas dupliquer ces fonctions, charger ce fichier.
//
// Alphabet base32 Crockford : ni I, ni L, ni O, ni U — aucune ambiguïté visuelle
// quand un code est dicté à voix haute ou recopié à la main sur un carnet.
//
// Voir "mode atelier AR.md" §4.
// ============================================================================

const ATELIER_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const AtelierCodes = {

    LONGUEUR_CODE_VALIDATION: 6,   // 30 bits d'aléa — c'est une adresse, elle ne signe rien
    LONGUEUR_AR: 8,                // 40 bits : [ points en quarts : 6 ][ aléa : 34 ]

    AR_BITS_ALEA: 34n,
    POINTS_MAX: 15.75,             // 63 quarts de point — plafond du format

    // ------------------------------------------------------------------------
    // BASE32
    // ------------------------------------------------------------------------

    _versBase32(valeur, longueur) {
        let sortie = '';
        let reste = valeur;
        for (let i = 0; i < longueur; i++) {
            sortie = ATELIER_ALPHABET[Number(reste & 31n)] + sortie;
            reste >>= 5n;
        }
        return sortie;
    },

    _depuisBase32(code) {
        let valeur = 0n;
        for (const caractere of code) {
            const index = ATELIER_ALPHABET.indexOf(caractere);
            if (index < 0) return null;
            valeur = (valeur << 5n) | BigInt(index);
        }
        return valeur;
    },

    _alea(nbBits) {
        const octets = new Uint8Array(Math.ceil(nbBits / 8));
        crypto.getRandomValues(octets);
        let valeur = 0n;
        for (const octet of octets) valeur = (valeur << 8n) | BigInt(octet);
        return valeur & ((1n << BigInt(nbBits)) - 1n);
    },

    // ------------------------------------------------------------------------
    // SAISIE HUMAINE
    // ------------------------------------------------------------------------

    /**
     * Normalise une saisie manuelle : majuscules, séparateurs ignorés, et
     * confusions visuelles corrigées (I et L valent 1, O vaut 0).
     */
    normaliser(saisie) {
        return String(saisie || '')
            .toUpperCase()
            .replace(/[IL]/g, '1')
            .replace(/O/g, '0')
            .split('')
            .filter(c => ATELIER_ALPHABET.includes(c))
            .join('');
    },

    /**
     * Découpe en groupes égaux pour l'affichage : X4T9-K2M7 (8 car.), V5K-123 (6 car.).
     * Des groupes égaux se dictent et se relisent mieux qu'un reliquat de 2 caractères.
     */
    formater(code, taille) {
        const pas = taille || (code.length % 4 === 0 ? 4 : 3);
        return (code.match(new RegExp(`.{1,${pas}}`, 'g')) || []).join('-');
    },

    // ------------------------------------------------------------------------
    // CODE DE VALIDATION (apprenant → formateur) — une adresse
    // ------------------------------------------------------------------------

    genererCodeValidation() {
        return this._versBase32(this._alea(30), this.LONGUEUR_CODE_VALIDATION);
    },

    // ------------------------------------------------------------------------
    // AR (formateur → apprenant) — le véhicule de l'évaluation
    // ------------------------------------------------------------------------

    /**
     * Fabrique un AR portant les points attribués.
     * Les points sont lisibles en clair par qui décode le code : ils ne prouvent
     * rien, ils servent à l'affichage immédiat quand le réseau manque. Seul l'aléa
     * fait foi, par comparaison avec le condensat enregistré à l'émission.
     */
    genererAR(points) {
        const quarts = BigInt(Math.max(0, Math.min(63, Math.round(points * 4))));
        const valeur = (quarts << this.AR_BITS_ALEA) | this._alea(Number(this.AR_BITS_ALEA));
        return this._versBase32(valeur, this.LONGUEUR_AR);
    },

    /** Relit les points portés par un AR. Retourne null si le format est invalide. */
    lireAR(code) {
        if (!code || code.length !== this.LONGUEUR_AR) return null;
        const valeur = this._depuisBase32(code);
        if (valeur === null) return null;
        return { points: Number(valeur >> this.AR_BITS_ALEA) / 4 };
    },

    /** Condensat SHA-256 en hexadécimal — c'est lui qui est enregistré, jamais l'AR. */
    async condensat(code) {
        const octets = new TextEncoder().encode(code);
        const empreinte = await crypto.subtle.digest('SHA-256', octets);
        return [...new Uint8Array(empreinte)]
            .map(o => o.toString(16).padStart(2, '0'))
            .join('');
    },

    // ------------------------------------------------------------------------
    // CLÉS DE STOCKAGE
    // ------------------------------------------------------------------------

    // Une clé par code : jamais de liste partagée, donc aucun conflit d'écriture
    // avec la file de synchronisation hors-ligne.
    cleCodeValidation(slug, code) {
        return `${slug}:atelier:code_${code}`;
    },

    cleAR(slug, token, chapitreId, questionId) {
        return `${slug}:atelier:ar_${token}_${chapitreId}_${questionId}`;
    }
};

window.ATELIER_ALPHABET = ATELIER_ALPHABET;
window.AtelierCodes = AtelierCodes;
