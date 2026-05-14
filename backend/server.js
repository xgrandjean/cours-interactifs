// ============================================================================
// SERVER.JS — Backend Express + SQLite pour Cours Interactifs (mode local)
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
db.pragma('journal_mode = WAL');

// Données utilisateur
db.exec(`
    CREATE TABLE IF NOT EXISTS app_data (
        key        TEXT PRIMARY KEY,
        value      TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

// Référentiel parcours (cours.json et futurs référentiels)
db.exec(`
    CREATE TABLE IF NOT EXISTS parcours_data (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

console.log('[SQLite] Base de données initialisée :', DB_PATH);

// ============================================================================
// APPLICATION EXPRESS
// ============================================================================

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ============================================================================
// ENDPOINTS — app_data
// ============================================================================

app.get('/api/app_data/:key', (req, res) => {
    try {
        const { key } = req.params;
        const row = db.prepare('SELECT key, value, updated_at FROM app_data WHERE key = ?').get(key);

        if (!row) {
            let defaultValue = null;
            if (key.includes(':teacher:users_list')) {
                defaultValue = [];
            } else if (key.includes(':config:chapter_config')) {
                defaultValue = {};
            } else if (key.includes(':student_') && key.endsWith('_progress')) {
                defaultValue = {
                    chapters: {},
                    scores: {},
                    totalCompleted: 0,
                    questionAttempts: {}
                };
            }
            return res.json({
                key,
                value: defaultValue,
                updated_at: new Date().toISOString()
            });
        }

        try { row.value = JSON.parse(row.value); } catch (_) {}
        res.json(row);
    } catch (e) {
        console.error('[SQLite] Erreur GET /app_data/:key:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/app_data', (req, res) => {
    try {
        const { key, value } = req.body;
        if (!key) return res.status(400).json({ error: 'Le champ "key" est requis.' });
        const now = new Date().toISOString();
        db.prepare(`
            INSERT INTO app_data (key, value, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
                value      = excluded.value,
                updated_at = excluded.updated_at
        `).run(key, JSON.stringify(value), now);
        res.status(201).json({ key, value, updated_at: now });
    } catch (e) {
        console.error('[SQLite] Erreur POST /data:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/app_data/:key', (req, res) => {
    try {
        db.prepare('DELETE FROM app_data WHERE key = ?').run(req.params.key);
        res.status(204).send();
    } catch (e) {
        console.error('[SQLite] Erreur DELETE /app_data/:key:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/app_data/keys', (req, res) => {
    try {
        const rows = db.prepare('SELECT key FROM app_data ORDER BY key').all();
        res.json(rows);
    } catch (e) {
        console.error('[SQLite] Erreur GET /keys:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ============================================================================
// ENDPOINTS — parcours_data
// ============================================================================

// IMPORTANT : /api/parcours_data/keys doit être déclaré avant /api/parcours_data/:key

app.get('/api/parcours_data/keys', (req, res) => {
    try {
        const rows = db.prepare('SELECT key FROM parcours_data ORDER BY key').all();
        res.json(rows);
    } catch (e) {
        console.error('[SQLite] Erreur GET /parcours_data/keys:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/parcours_data/:key', (req, res) => {
    try {
        const row = db.prepare('SELECT key, value, updated_at FROM parcours_data WHERE key = ?')
                      .get(req.params.key);
        if (!row) return res.status(404).json({ error: 'Clé introuvable' });
        try { row.value = JSON.parse(row.value); } catch (_) {}
        res.json(row);
    } catch (e) {
        console.error('[SQLite] Erreur GET /parcours_data/:key:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/parcours_data', (req, res) => {
    try {
        const { key, value } = req.body;
        if (!key || value === undefined) {
            return res.status(400).json({ error: 'Champs "key" et "value" requis' });
        }
        const now = new Date().toISOString();
        db.prepare(`
            INSERT INTO parcours_data (key, value, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
                value      = excluded.value,
                updated_at = excluded.updated_at
        `).run(key, JSON.stringify(value), now);
        res.status(204).end();
    } catch (e) {
        console.error('[SQLite] Erreur POST /parcours_data:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/parcours_data/:key', (req, res) => {
    try {
        db.prepare('DELETE FROM parcours_data WHERE key = ?').run(req.params.key);
        res.status(204).end();
    } catch (e) {
        console.error('[SQLite] Erreur DELETE /parcours_data/:key:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ============================================================================
// HEALTH CHECK
// ============================================================================

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