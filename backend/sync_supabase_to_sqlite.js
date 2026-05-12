// sync_supabase_to_sqlite.js
// Version pour Node.js 18+ (fetch natif)

const SUPABASE_URL = 'https://rdvxgcwpennhbatkvats.supabase.co';
const SUPABASE_KEY = 'sb_publishable_hF3tWEb_lnpc4q5sL16Ghw_hYG5ov40';
const TABLE_NAME = 'app_data';
const SQLITE_API = 'http://localhost:3000/api';

async function fetchAllKeysFromSupabase() {
    let allKeys = [];
    let offset = 0;
    const limit = 1000;
    
    while (true) {
        const response = await fetch(
            `${SUPABASE_URL}/rest/v1/${TABLE_NAME}?select=key&limit=${limit}&offset=${offset}`,
            {
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`
                }
            }
        );
        
        if (!response.ok) throw new Error(`Erreur Supabase: ${response.status}`);
        
        const data = await response.json();
        allKeys = allKeys.concat(data);
        
        if (data.length < limit) break;
        offset += limit;
    }
    
    return allKeys.map(row => row.key);
}

async function fetchValueFromSupabase(key) {
    const response = await fetch(
        `${SUPABASE_URL}/rest/v1/${TABLE_NAME}?key=eq.${encodeURIComponent(key)}&select=value`,
        {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        }
    );
    
    if (!response.ok) return null;
    const data = await response.json();
    return data[0]?.value || null;
}

async function importToSQLite(key, value) {
    const response = await fetch(`${SQLITE_API}/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value })
    });
    return response.ok;
}

async function main() {
    console.log('☁️ → 💾 Synchronisation Supabase → SQLite\n');
    
    try {
        const keys = await fetchAllKeysFromSupabase();
        console.log(`📋 ${keys.length} clés trouvées dans Supabase\n`);
        
        let success = 0, errors = 0;
        
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            process.stdout.write(`⏳ [${i+1}/${keys.length}] ${key}... `);
            
            try {
                const value = await fetchValueFromSupabase(key);
                if (value !== null && await importToSQLite(key, value)) {
                    success++;
                    console.log('✅');
                } else {
                    console.log('⚠️ (échec)');
                    errors++;
                }
            } catch (e) {
                errors++;
                console.log(`❌ ${e.message}`);
            }
        }
        
        console.log(`\n✅ Terminé ! ${success} importées, ${errors} erreurs`);
        
    } catch (error) {
        console.error('❌ Erreur:', error.message);
        process.exit(1);
    }
}

main();