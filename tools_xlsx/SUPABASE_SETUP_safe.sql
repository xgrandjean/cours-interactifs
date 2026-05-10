-- ============================================================================
-- Script d'initialisation de la table Supabase pour cours-interactifs
-- ============================================================================
-- À exécuter dans l'éditeur SQL de Supabase :
--   https://supabase.com/dashboard/project/rdvxgcwpennhbatkvats/sql/new
-- ============================================================================

-- ============================================================================
-- 1. Création de la table de stockage clé-valeur
-- ============================================================================
CREATE TABLE IF NOT EXISTS app_data (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 2. Active RLS (Row Level Security) pour les accès anonymes
-- ============================================================================
ALTER TABLE app_data ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 3. Politiques d'accès pour les utilisateurs anonymes (via l'anon key)
-- ============================================================================

-- Lire toutes les lignes
DROP POLICY IF EXISTS "Anon peut lire" ON app_data;
CREATE POLICY "Anon peut lire"
    ON app_data
    FOR SELECT
    USING (true);

-- Insérer de nouvelles lignes
DROP POLICY IF EXISTS "Anon peut inserer" ON app_data;
CREATE POLICY "Anon peut inserer"
    ON app_data
    FOR INSERT
    WITH CHECK (true);

-- Modifier des lignes existantes
DROP POLICY IF EXISTS "Anon peut modifier" ON app_data;
CREATE POLICY "Anon peut modifier"
    ON app_data
    FOR UPDATE
    USING (true)
    WITH CHECK (true);

-- Supprimer des lignes
DROP POLICY IF EXISTS "Anon peut supprimer" ON app_data;
CREATE POLICY "Anon peut supprimer"
    ON app_data
    FOR DELETE
    USING (true);

-- ============================================================================
-- 4. (Optionnel) Index pour améliorer les performances sur updated_at
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_app_data_updated_at ON app_data (updated_at DESC);

-- ============================================================================
-- 5. Vérification
-- ============================================================================
SELECT '✅ Table app_data prête' AS status FROM app_data LIMIT 1;