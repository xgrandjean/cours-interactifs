// sync_supabase_to_sqlite.js
// Synchronise Supabase (cloud) → SQLite (local)
// Usage: node sync_supabase_to_sqlite.js

const SUPABASE_URL = 'https://rdvxgcwpennhbatkvats.supabase.co';
const SUPABASE_KEY = 'sb_publishable_hF3tWEb_lnpc4q5sL16Ghw_hYG5ov40';
const SQLITE_API   = 'http://localhost:3000/api';

// Tables à synchroniser : { supabaseTable, sqliteRoute }
const TABLES = [
    { supabaseTable: 'app_data',      sqliteRoute: 'app_data'      },
    { supabaseTable: 'parcours_data', sqliteRoute: 'parcours_data' }
];

async function fetchAllKeysFromSupabase(supabaseTable) {
    let allKeys = [];
    let offset  = 0;
    const limit = 1000;

    while (true) {
        const response = await fetch(
            `${SUPABASE_URL}/rest/v1/${supabaseTable}?select=key&limit=${limit}&offset=${offset}`,
            {
                headers: {
                    'apikey':        SUPABASE_KEY,
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

async function fetchValueFromSupabase(supabaseTable, key) {
    const response = await fetch(
        `${SUPABASE_URL}/rest/v1/${supabaseTable}?key=eq.${encodeURIComponent(key)}&select=value`,
        {
            headers: {
                'apikey':        SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        }
    );

    if (!response.ok) return null;
    const data = await response.json();
    return data[0]?.value || null;
}

async function importToSQLite(sqliteRoute, key, value) {
    const response = await fetch(`${SQLITE_API}/${sqliteRoute}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value })
    });
    return response.ok;
}

async function syncTable({ supabaseTable, sqliteRoute }) {
    console.log(`\n📦 Table : ${supabaseTable}`);

    const keys = await fetchAllKeysFromSupabase(supabaseTable);
    console.log(`   📋 ${keys.length} clé(s) trouvée(s) dans Supabase`);

    if (keys.length === 0) {
        console.log('   ⚠️  Aucune donnée à synchroniser');
        return { success: 0, errors: 0 };
    }

    let success = 0, errors = 0;

    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        process.stdout.write(`   ⏳ [${i+1}/${keys.length}] ${key}... `);

        try {
            const value = await fetchValueFromSupabase(supabaseTable, key);
            if (value !== null && await importToSQLite(sqliteRoute, key, value)) {
                success++;
                console.log('✅');
            } else {
                console.log('⚠️  (échec)');
                errors++;
            }
        } catch (e) {
            errors++;
            console.log(`❌ ${e.message}`);
        }
    }

    return { success, errors };
}

async function main() {
    console.log('☁️  → 💾 Synchronisation Supabase → SQLite\n');

    let totalSuccess = 0, totalErrors = 0;

    try {
        for (const table of TABLES) {
            const { success, errors } = await syncTable(table);
            totalSuccess += success;
            totalErrors  += errors;
        }

        console.log(`\n✅ Terminé ! ${totalSuccess} importée(s), ${totalErrors} erreur(s)`);

    } catch (error) {
        console.error('❌ Erreur:', error.message);
        process.exit(1);
    }
}

main();