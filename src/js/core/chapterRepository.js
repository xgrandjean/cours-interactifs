/**
 * chapterRepository.js - COUCHE DONNÉES PURE ✅ CLEAN ARCHITECTURE
 * VERSION MULTI-PARCOURS UNIFIÉE
 *
 * Toutes les clés sont construites explicitement avec le slug du parcours.
 * Aucune dépendance à Parcours.scoped (supprimé pour éviter les incohérences).
 *
 * RÈGLES ABSOLUES :
 * ❌ PAS DE confirm / alert / interaction utilisateur
 * ❌ PAS DE DOM
 * ❌ PAS D'EFFET DE BORD CACHÉ
 * ✅ SEULEMENT données + storage
 * ✅ Retourne toujours des objets immuables
 * ✅ Testable 100%
 */

export class ChapterRepository {

    constructor(storage) {
        this.storage = storage;   // storage global (Supabase)
        this.chapters = [];
        this.meta = {};
    }

    // ── Chargement du JSON des chapitres ─────────────────────────

    async loadChapters(jsonPath) {
        try {
            const response = await fetch(jsonPath);
            if (!response.ok) throw new Error('Impossible de charger le JSON des chapitres');
            const data = await response.json();

            if (Array.isArray(data)) {
                this.chapters = data;
                this.meta = {};
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
            this.meta = {};
            return [];
        }
    }

    getChapterById(id) {
        return this.chapters.find(c => String(c.id) === String(id));
    }

    getContentHash() {
        return this.meta.contentHash || null;
    }

    // ── Progression élève (clé complète avec slug) ────────────────

    /**
     * Récupère la progression d'un élève.
     * La clé est : `${slug}:${token}:student_${token}_progress`
     */
    async getStudentProgress(token) {
        if (!token) return Object.freeze({});
        const slug = this._getSlug();
        if (!slug) return Object.freeze({});
        const key = `${slug}:${token}:student_${token}_progress`;
        const data = await this.storage.get(key);
        return Object.freeze(data || {});
    }

    /**
     * Sauvegarde la progression d'un élève.
     * La clé est : `${slug}:${token}:student_${token}_progress`
     */
    async setStudentProgress(token, data) {
        if (!token) return;
        const slug = this._getSlug();
        if (!slug) return;
        const key = `${slug}:${token}:student_${token}_progress`;
        await this.storage.set(key, data);
    }

    // ── Configuration du parcours (verrouillage, mode examen, etc.) ──

    /**
     * Récupère la configuration des chapitres pour ce parcours.
     * Clé : `${slug}:config:chapter_config`
     */
    async getChapterConfig() {
        const slug = this._getSlug();
        if (!slug) return {};
        const config = await this.storage.get(`${slug}:config:chapter_config`);
        return config || {};
    }

    /**
     * Sauvegarde la configuration des chapitres pour ce parcours.
     */
    async setChapterConfig(config) {
        const slug = this._getSlug();
        if (!slug) return;
        await this.storage.set(`${slug}:config:chapter_config`, config);
    }

    // ── Utilitaires ──────────────────────────────────────────────

    _getSlug() {
        return window.currentParcoursSlug || (window.Parcours ? Parcours.slug : null);
    }

    // ── Cohérence du contenu ─────────────────────────────────────

    async ensureConsistency(token) {
        const progress = await this.getStudentProgress(token);
        if (progress?.contentHash && progress.contentHash !== this.getContentHash()) {
            await this.clearAllProgress();
            return Object.freeze({});
        }
        return progress;
    }

    /**
     * Supprime UNIQUEMENT les progressions du parcours courant.
     * Nettoie également la configuration du parcours.
     */
    async clearAllProgress() {
        const slug = this._getSlug();
        if (!slug) return;

        const allKeys = await this.storage.keys();
        const prefix = `${slug}:`;

        for (const key of allKeys) {
            // Supprimer les clés de progression : slug:token:student_token_progress
            if (key.startsWith(prefix) && key.includes(':student_') && key.endsWith('_progress')) {
                await this.storage.remove(key);
            }
            // Supprimer aussi la configuration du parcours
            if (key === `${slug}:config:chapter_config`) {
                await this.storage.remove(key);
            }
        }
    }

    async migrateProgress(newContentHash) {
        const slug = this._getSlug();
        if (!slug) return;

        const allKeys = await this.storage.keys();
        const prefix = `${slug}:`;
        const progressKeys = allKeys.filter(key =>
            key.startsWith(prefix) && key.includes(':student_') && key.endsWith('_progress')
        );

        for (const key of progressKeys) {
            const progressData = await this.storage.get(key) || {};
            await this.storage.set(key, { ...progressData, contentHash: newContentHash });
        }
    }
}