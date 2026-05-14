-- ============================================================================
-- SCRIPT COMPLET POUR SUPABASE
-- ============================================================================
-- À exécuter dans l'éditeur SQL de Supabase:
--   https://supabase.com/dashboard/project/rdvxgcwpennhbatkvats/sql/new
-- ============================================================================
-- ============================================================================
-- MIGRATION COMPLÈTE POUR SUPABASE (idempotent)
-- ============================================================================
-- Fonctionne que la table existe ou non
-- Peut être exécuté plusieurs fois sans erreur
-- ============================================================================

-- ============================================================================
-- 1. TABLE app_data (clé-valeur)
-- ============================================================================
CREATE TABLE IF NOT EXISTS app_data (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 2. TABLE parcours_data (clé-valeur)
-- ============================================================================

CREATE TABLE IF NOT EXISTS parcours_data (
    key        TEXT PRIMARY KEY,
    value      JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);