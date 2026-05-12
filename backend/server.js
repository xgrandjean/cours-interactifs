// ============================================================================
// SERVER.JS — Backend Express + SQLite pour Cours Interactifs (mode local)
// ============================================================================
// Serveur minimal qui expose une API REST clé-valeur identique à Supabase.
//
// Endpoints :
//   GET    /api/data/:key   → { key, value, updated_at } ou 404
//   POST   /api/data        → upsert { key, value }
//   DELETE /api/data/:key   → suppression
//   GET    /api/keys        → [{ key }, ...]
//
// Usage :
//   1. cd backend && npm install
//   2. npm start
//   3. Le serveur écoute sur http://localhost:3000
//
// Le frontend pointe storage/config.json vers { "sqlite": { "apiBaseUrl": "http://localhost:3000/api" } }
// ============================================================================

const express = require('express');
const cors = require('cors');
const path = require('path');
const Database = require('better-sqlite3');

// ============================================================================
// CONFIGURATION
// ============================================================================
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data.db');

// ============================================================================
// BASE DE DONNÉES
// ============================================================================

const db = new Database(DB_PATH);

// Activer WAL pour de meilleures performances en lecture concurrente
db.pragma('journal_mode = WAL');

// Créer la table si elle n'existe pas
db.exec(`
  CREATE TABLE IF NOT EXISTS app_data (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

console.log('[SQLite] Base de données initialisée :', DB_PATH);

// ============================================================================
// APPLICATION EXPRESS
// ============================================================================

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ============================================================================
// ENDPOINTS API
// ============================================================================

/**
 * GET /api/data/:key
 * Récupère une entrée par sa clé
 * Retourne : { key, value, updated_at } ou 404
 */
app.get('/api/data/:key', (req, res) => {
    try {
        const { key } = req.params;
        const row = db.prepare('SELECT key, value, updated_at FROM app_data WHERE key = ?').get(key);

        if (!row) {
            return res.status(404).json({ error: 'Key not found' });
        }

        // La valeur stockée est une string JSON, la parser avant de renvoyer
        // pour correspondre au format Supabase
        try {
            row.value = JSON.parse(row.value);
        } catch (_) {
            // Si ce n'est pas du JSON valide, laisser tel quel
        }

        res.json(row);
    } catch (e) {
        console.error('[SQLite] Erreur GET /api/data/:key', e.message);
        res.status(500).json({ error: e.message });
    }
});

/**
 * POST /api/data
 * Crée ou met à jour une entrée (upsert)
 * Body : { key: string, value: any }
 * Retourne : 201 + { key, value, updated_at }
 */
app.post('/api/data', (req, res) => {
    try {
        const { key, value } = req.body;

        if (!key) {
            return res.status(400).json({ error: 'Le champ "key" est requis.' });
        }

        // Sérialiser la valeur en JSON pour le stockage
        const valueStr = JSON.stringify(value);
        const now = new Date().toISOString();

        // INSERT OR REPLACE (upsert)
        db.prepare(`
            INSERT INTO app_data (key, value, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updated_at = excluded.updated_at
        `).run(key, valueStr, now);

        res.status(201).json({
            key,
            value,
            updated_at: now
        });
    } catch (e) {
        console.error('[SQLite] Erreur POST /api/data', e.message);
        res.status(500).json({ error: e.message });
    }
});

/**
 * DELETE /api/data/:key
 * Supprime une entrée par sa clé
 * Retourne : 204 No Content
 */
app.delete('/api/data/:key', (req, res) => {
    try {
        const { key } = req.params;
        db.prepare('DELETE FROM app_data WHERE key = ?').run(key);
        res.status(204).send();
    } catch (e) {
        console.error('[SQLite] Erreur DELETE /api/data/:key', e.message);
        res.status(500).json({ error: e.message });
    }
});

/**
 * GET /api/keys
 * Retourne la liste de toutes les clés
 * Format : [{ key: string }, ...]
 */
app.get('/api/keys', (req, res) => {
    try {
        const rows = db.prepare('SELECT key FROM app_data ORDER BY key').all();
        res.json(rows);
    } catch (e) {
        console.error('[SQLite] Erreur GET /api/keys', e.message);
        res.status(500).json({ error: e.message });
    }
});

/**
 * GET /api/health
 * Endpoint de santé du serveur
 */
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        db: DB_PATH
    });
});

// ============================================================================
// DÉMARRAGE
// ============================================================================

app.listen(PORT, () => {
    console.log('============================================');
    console.log('  Cours Interactifs — Backend SQLite');
    console.log('  Serveur démarré sur http://localhost:' + PORT);
    console.log('  API : http://localhost:' + PORT + '/api');
    console.log('============================================');
});

// Gestion propre de l'arrêt
process.on('SIGINT', () => {
    console.log('\n[SQLite] Arrêt du serveur...');
    db.close();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n[SQLite] Arrêt du serveur...');
    db.close();
    process.exit(0);
});