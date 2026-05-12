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
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ============================================================================
// ENDPOINTS API
// ============================================================================

app.get('/api/data/:key', (req, res) => {
    try {
        const { key } = req.params;
        const row = db.prepare('SELECT key, value, updated_at FROM app_data WHERE key = ?').get(key);

        if (!row) {
            // Retourne une valeur par défaut selon le type de clé
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

        try {
            row.value = JSON.parse(row.value);
        } catch (_) {}
        res.json(row);
    } catch (e) {
        console.error('[SQLite] Erreur GET:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/data', (req, res) => {
    try {
        const { key, value } = req.body;
        if (!key) {
            return res.status(400).json({ error: 'Le champ "key" est requis.' });
        }
        const valueStr = JSON.stringify(value);
        const now = new Date().toISOString();
        db.prepare(`
            INSERT INTO app_data (key, value, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updated_at = excluded.updated_at
        `).run(key, valueStr, now);
        res.status(201).json({ key, value, updated_at: now });
    } catch (e) {
        console.error('[SQLite] Erreur POST:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/data/:key', (req, res) => {
    try {
        const { key } = req.params;
        db.prepare('DELETE FROM app_data WHERE key = ?').run(key);
        res.status(204).send();
    } catch (e) {
        console.error('[SQLite] Erreur DELETE:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/keys', (req, res) => {
    try {
        const rows = db.prepare('SELECT key FROM app_data ORDER BY key').all();
        res.json(rows);
    } catch (e) {
        console.error('[SQLite] Erreur GET /keys:', e.message);
        res.status(500).json({ error: e.message });
    }
});

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