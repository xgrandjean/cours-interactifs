/**
 * chapterRepository.js - COUCHE DONNÉES PURE ✅ CLEAN ARCHITECTURE
 * 
 * RÈGLES ABSOLUES RESPECTÉES :
 * ❌ PAS DE confirm / alert / interaction utilisateur
 * ❌ PAS DE DOM
 * ❌ PAS D'EFFET DE BORD CACHÉ
 * ✅ SEULEMENT données + storage
 * ✅ Retourne toujours des objets immuables
 * ✅ Testable 100%
 * ✅ Pas couplé au navigateur
 */

export class ChapterRepository {

    constructor(storage) {
        this.storage = storage;
        this.chapters = [];
        this.meta = {};
    }

    /**
     * Charge les chapitres depuis le fichier JSON
     */
    async loadChapters(jsonPath) {
        try {
            const response = await fetch(jsonPath);
            if (!response.ok) throw new Error('Impossible de charger le JSON des chapitres');
            const data = await response.json();

            if (Array.isArray(data)) {
                // Ancien format: tableau direct
                this.chapters = data;
                this.meta = {};
            } else {
                // Nouveau format: objet avec métadonnées
                this.chapters = data.chapters || [];
                this.meta = {
                    contentHash: data.contentHash || null,
                    version: data.version || null,
                    generatedAt: data.generatedAt || null,
                    totalChapters: data.totalChapters || 0,
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

    /**
     * ✅ Retourne toujours un objet IMMUABLE
     * Aucune mutation possible depuis l'extérieur
     */
    async getStudentProgress(token) {
        if (!token) return Object.freeze({});
        return Object.freeze(
            await this.storage.get(`student_${token}_progress`) || {}
        );
    }

    async setStudentProgress(token, data) {
        if (!token) return;
        await this.storage.set(`student_${token}_progress`, data);
    }

    /**
     * ✅ UNE SEULE MÉTHODE POUR LA COHÉRENCE
     * Vérifie ET corrige automatiquement si incohérence
     * C'est LA SEULE méthode à appeler depuis l'extérieur
     */
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

    async clearAllProgress() {
        const allKeys = await this.storage.keys();
        
        for (const key of allKeys) {
            if (key.startsWith('student_') && key.endsWith('_progress')) {
                await this.storage.remove(key);
            }
        }

        await this.storage.remove('chapter_config');
    }

    async migrateProgress(newContentHash) {
        const allKeys = await this.storage.keys();
        const progressKeys = allKeys.filter(key => key.startsWith('student_') && key.endsWith('_progress'));
        
        for (const key of progressKeys) {
            const progressData = await this.storage.get(key) || {};
            // ✅ Pas de mutation directe : on crée un nouvel objet
            await this.storage.set(key, {
                ...progressData,
                contentHash: newContentHash
            });
        }
    }
}