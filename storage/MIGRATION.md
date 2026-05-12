# Guide de migration — Système de stockage multi-backend

## Résumé des changements

Le système de stockage passe d'un backend unique Supabase à un système multi-backend configurable via `storage/config.json`.

### Nouvelle architecture

```text
storage/
├── config.json              # Choix du backend
├── provider.supabase.js     # Provider Supabase (extrait de storage.js)
├── provider.sqlite.js       # Provider SQLite (via API Express locale)
└── MIGRATION.md             # Ce fichier

src/js/
├── storage.js               # Refactoré : charge le provider dynamiquement
└── ... (inchangé)

backend/
├── package.json             # Dépendances Express + SQLite
└── server.js                # Serveur Express + SQLite minimal
```

## API publique inchangée

```javascript
await storage.get(key)
await storage.set(key, value)
await storage.remove(key)
await storage.keys()
```

Le format métier des clés reste identique :

```text
"math-Term:STU001:student_STU001_progress"
"math-Term:teacher:users_list"
"math-Term:config:chapter_config"
```

## Étapes de migration

### Étape 1 : Vérifier que le dossier `storage/` est accessible

Le dossier `storage/` doit être déployé sur GitHub Pages au même niveau que `src/`.

Les fichiers sont chargés dynamiquement par `storage.js` via `fetch()` et `document.createElement('script')`.

### Étape 2 : Configurer le backend

#### Mode Supabase (actuel, par défaut)

`storage/config.json` :

```json
{
  "storage": "supabase",
  "supabase": {
    "url": "https://rdvxgcwpennhbatkvats.supabase.co",
    "anonKey": "sb_publishable_hF3tWEb_lnpc4q5sL16Ghw_hYG5ov40",
    "table": "app_data"
  }
}
```

**Aucun changement côté frontend.** C'est le comportement par défaut.

#### Mode SQLite locale

`storage/config.json` :

```json
{
  "storage": "sqlite",
  "sqlite": {
    "apiBaseUrl": "http://localhost:3000/api"
  }
}
```

Puis lancer le backend :

```bash
cd backend
npm install
npm start
```

Le serveur écoute sur `http://localhost:3000`.

### Étape 3 : Modifications des pages HTML existantes

**Aucune modification nécessaire.**

Le nouveau `storage.js` :
1. Charge `storage/config.json` via `fetch()`
2. Injecte dynamiquement le script provider (`provider.supabase.js` ou `provider.sqlite.js`) via `document.createElement('script')`
3. Instancie le provider et expose l'API `storage.get/set/remove/keys`

L'ordre de chargement actuel reste valide :

```html
<script src="src/js/config.js"></script>
<script src="src/js/parcours.js"></script>
<script src="src/js/storage.js"></script>
<script src="src/js/dataStorage.js"></script>
```

### Étape 4 : Nouveaux fichiers à déployer

Pour GitHub Pages, ajouter ces fichiers au dépôt :

```
storage/config.json
storage/provider.supabase.js
storage/provider.sqlite.js
```

Le dossier `backend/` n'est déployé que si vous utilisez le mode SQLite local.

## Points de vigilance

### Cache localStorage

Le système offline utilise le préfixe `_cache_` dans localStorage, identique à l'ancien système. Les données existantes dans le cache localStorage sont automatiquement réutilisées.

### Queue offline

La queue de synchronisation (clé `_sync_queue` dans localStorage) est conservée. Les opérations en attente avant la migration sont automatiquement rejouées au prochain appel à `storage.set()` réussi.

### Bannière de statut

La bannière de statut (`#storage-online-banner`) est entièrement conservée, avec le même comportement.

### Compatibilité GitHub Pages

Le système fonctionne sur GitHub Pages car :
- `config.json` est chargé via `fetch()` (GET classique)
- Les scripts providers sont injectés via `document.createElement('script')` (GET classique)
- La résolution des chemins utilise `window.BASE` configuré par `config.js`

### Erreurs réseau

Si `config.json` n'est pas trouvé (fetch rate limit GitHub Pages, fichier manquant, CORS), `storage.js` bascule automatiquement sur un fallback purement localStorage.

### Synchronisation de migration

Si vous passez de Supabase à SQLite, les données ne sont PAS migrées automatiquement. Vous devez exporter les données Supabase et les importer dans SQLite.

Pour exporter depuis Supabase :
```sql
-- Dans le SQL Editor de Supabase
SELECT key, value FROM app_data;
```

Pour importer dans SQLite :
```bash
# Via le serveur Express
curl -X POST http://localhost:3000/api/data \
  -H "Content-Type: application/json" \
  -d '{"key": "math-Term:teacher:users_list", "value": [...]}'
```

## Tests

1. **Test Supabase** : Le comportement doit être identique à l'avant-migration
2. **Test SQLite** : Lancer `cd backend && npm install && npm start`, basculer `config.json` en mode `sqlite`, les opérations doivent fonctionner
3. **Test offline** : Déconnecter le réseau, les modifications doivent être mises en queue et synchronisées au retour de la connexion
4. **Test fallback** : Supprimer `storage/config.json` → le système doit fonctionner en localStorage uniquement

## Rollback

Pour revenir à l'ancien système :
1. Restaurer l'ancien `src/js/storage.js` (avec Supabase en dur)
2. Supprimer le dossier `storage/`
3. Supprimer le dossier `backend/` (si déployé)