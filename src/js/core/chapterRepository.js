/**
 * chapterRepository.js - COUCHE DONNÉES PURE ✅ CLEAN ARCHITECTURE
 * VERSION MULTI-PARCOURS
 *
 * Modifications par rapport à l'original :
 *  1. getStudentProgress / setStudentProgress passent par
 *     Parcours.scoped.student pour que les clés soient préfixées
 *     "nsi-term:STU001:student_STU001_progress" dans Supabase.
 *
 *  2. clearAllProgress scanne uniquement les clés du parcours courant :
 *     - Supabase : storage.keys() retourne toutes les clés globales.
 *       On filtre celles qui commencent par le préfixe élève du parcours.
 *     - On ne touche pas aux données des autres parcours.
 *
 *  3. Le constructeur accepte toujours `storage` pour la compatibilité
 *     (certains appels externes passent storage directement).
 *     En interne on préfère Parcours.scoped.student quand disponible.
 *
 * RÈGLES ABSOLUES INCHANGÉES :
 * ❌ PAS DE confirm / alert / interaction utilisateur
 * ❌ PAS DE DOM
 * ❌ PAS D'EFFET DE BORD CACHÉ
 * ✅ SEULEMENT données + storage
 * ✅ Retourne toujours des objets immuables
 * ✅ Testable 100%
 */

export class ChapterRepository {

    constructor(storage) {
        this.storage  = storage;   // storage global (Supabase) — conservé pour compatibilité
        this.chapters = [];
        this.meta     = {};
    }

    // ── Storage scopé (préfixé par parcours + token) ────────────
    // Parcours.scoped.student.get(key) → storage.get("nsi-term:STU001:" + key)
    get _scoped() {
        return (window.Parcours && Parcours.scoped)
            ? Parcours.scoped.student
            : null;
    }

    // ── Chargement du JSON des chapitres ─────────────────────────

    async loadChapters(jsonPath) {
        try {
            const response = await fetch(jsonPath);
            if (!response.ok) throw new Error('Impossible de charger le JSON des chapitres');
            const data = await response.json();

            if (Array.isArray(data)) {
                this.chapters = data;
                this.meta     = {};
            } else {
                this.chapters = data.chapters || [];
                this.meta = {
                    contentHash:    data.contentHash    || null,
                    version:        data.version        || null,
                    generatedAt:    data.generatedAt    || null,
                    totalChapters:  data.totalChapters  || 0,
                    totalQuestions: data.totalQuestions || 0
                };
            }
            return this.chapters;

        } catch (e) {
            console.error('❌ Erreur lors du chargement des chapitres JSON:', e);
            this.chapters = [];
            this.meta     = {};
            return [];
        }
    }

    getChapterById(id) {
        return this.chapters.find(c => String(c.id) === String(id));
    }

    getContentHash() {
        return this.meta.contentHash || null;
    }

    // ── Progression élève ────────────────────────────────────────

    async getStudentProgress(token) {
        if (!token) return Object.freeze({});

        // Priorité : Parcours.scoped.student (clé préfixée dans Supabase)
        if (this._scoped) {
            const data = await this._scoped.get(`student_${token}_progress`);
            return Object.freeze(data || {});
        }

        // Fallback : storage direct (cas où parcours.js n'est pas chargé)
        return Object.freeze(
            await this.storage.get(`student_${token}_progress`) || {}
        );
    }

    async setStudentProgress(token, data) {
        if (!token) return;

        if (this._scoped) {
            await this._scoped.set(`student_${token}_progress`, data);
        } else {
            await this.storage.set(`student_${token}_progress`, data);
        }
    }

    // ── Cohérence du contenu ─────────────────────────────────────

    async ensureConsistency(token) {
        const progress = await this.getStudentProgress(token);

        if (
            progress?.contentHash &&
            progress.contentHash !== this.getContentHash()
        ) {
            await this.clearAllProgress();
            return Object.freeze({});
        }

        return progress;
    }

    /**
     * Supprime UNIQUEMENT les progressions du parcours courant.
     * Avec le préfixage, les clés Supabase ressemblent à :
     *   "nsi-term:STU001:student_STU001_progress"
     *
     * storage.keys() retourne toutes les clés (tous parcours).
     * On filtre celles qui appartiennent au parcours courant
     * via le préfixe slug (ex: "nsi-term:").
     */
    async clearAllProgress() {
        const allKeys = await this.storage.keys();
        const slug    = window.Parcours ? Parcours.slug + ':' : '';

        for (const key of allKeys) {
            const isProgressKey = key.includes(':student_') && key.endsWith('_progress');
            const isThisParcours = !slug || key.startsWith(slug);

            if (isProgressKey && isThisParcours) {
                await this.storage.remove(key);
            }
        }

        // Supprime aussi la config du parcours courant
        if (window.Parcours) {
            await Parcours.scoped.config.remove('chapter_config');
        } else {
            await this.storage.remove('chapter_config');
        }
    }

    async migrateProgress(newContentHash) {
        const allKeys      = await this.storage.keys();
        const slug         = window.Parcours ? Parcours.slug + ':' : '';
        const progressKeys = allKeys.filter(key =>
            key.includes(':student_') && key.endsWith('_progress') &&
            (!slug || key.startsWith(slug))
        );

        for (const key of progressKeys) {
            const progressData = await this.storage.get(key) || {};
            await this.storage.set(key, { ...progressData, contentHash: newContentHash });
        }
    }
}
