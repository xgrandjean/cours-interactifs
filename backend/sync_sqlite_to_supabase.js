// sync_sqlite_to_supabase.js
// Synchronise SQLite (local) → Supabase (cloud)
// Usage: node sync_sqlite_to_supabase.js

const SUPABASE_URL = 'https://rdvxgcwpennhbatkvats.supabase.co';
const SUPABASE_KEY = 'sb_publishable_hF3tWEb_lnpc4q5sL16Ghw_hYG5ov40';
const TABLE_NAME = 'app_data';
const SQLITE_API = 'http://localhost:3000/api';

async function fetchAllKeysFromSQLite() {
    const response = await fetch(`${SQLITE_API}/keys`);
    if (!response.ok) throw new Error(`Erreur SQLite: ${response.status}`);
    const data = await response.json();
    return data.map(row => row.key);
}

async function fetchValueFromSQLite(key) {
    const response = await fetch(`${SQLITE_API}/data/${encodeURIComponent(key)}`);
    if (!response.ok) return null;
    const data = await response.json();
    return data.value;
}

async function importToSupabase(key, value) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE_NAME}`, {
        method: 'POST',
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify({ 
            key, 
            value, 
            updated_at: new Date().toISOString() 
        })
    });
    
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`HTTP ${response.status}: ${error}`);
    }
    return true;
}

async function main() {
    console.log('💾 → ☁️ Synchronisation SQLite → Supabase\n');
    
    try {
        const keys = await fetchAllKeysFromSQLite();
        console.log(`📋 ${keys.length} clés trouvées dans SQLite\n`);
        
        if (keys.length === 0) {
            console.log('⚠️ Aucune donnée à synchroniser');
            return;
        }
        
        let success = 0, errors = 0;
        
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            process.stdout.write(`⏳ [${i+1}/${keys.length}] ${key}... `);
            
            try {
                const value = await fetchValueFromSQLite(key);
                if (value !== null && await importToSupabase(key, value)) {
                    success++;
                    console.log('✅');
                } else {
                    console.log('⚠️ (valeur null ou échec)');
                    errors++;
                }
            } catch (e) {
                errors++;
                console.log(`❌ ${e.message}`);
            }
        }
        
        console.log(`\n✅ Terminé ! ${success} synchronisées, ${errors} erreurs`);
        
    } catch (error) {
        console.error('❌ Erreur:', error.message);
        process.exit(1);
    }
}

main();