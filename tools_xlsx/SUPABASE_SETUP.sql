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
-- 2. TABLES STRUCTURELLES
-- ============================================================================

-- Parcours
CREATE TABLE IF NOT EXISTS parcours (
    id SERIAL PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    label TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chapitres
CREATE TABLE IF NOT EXISTS chapitres (
    id SERIAL PRIMARY KEY,
    parcours_slug TEXT NOT NULL,
    numero INTEGER NOT NULL,
    title TEXT NOT NULL,
    slug TEXT,
    chapter_hash TEXT,
    max_points INTEGER DEFAULT 0,
    course_validation_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(parcours_slug, numero)
);

-- Questions
CREATE TABLE IF NOT EXISTS questions (
    id SERIAL PRIMARY KEY,
    chapitre_id INTEGER NOT NULL,
    numero INTEGER NOT NULL,
    type TEXT NOT NULL,
    correction_type TEXT DEFAULT 'auto',
    title TEXT,
    content TEXT,
    points INTEGER DEFAULT 1,
    options JSONB DEFAULT '[]',
    correct_answers JSONB DEFAULT '[]',
    hint TEXT,
    min_length INTEGER DEFAULT 0,
    required BOOLEAN DEFAULT TRUE,
    question_hash TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(chapitre_id, numero)
);

-- Cours
CREATE TABLE IF NOT EXISTS cours (
    id SERIAL PRIMARY KEY,
    chapitre_id INTEGER NOT NULL,
    numero INTEGER NOT NULL,
    content TEXT NOT NULL,
    requires_validation BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(chapitre_id, numero)
);

-- ============================================================================
-- 3. CLÉS ÉTRANGÈRES (avec vérification d'existence)
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_chapitres_parcours'
    ) THEN
        ALTER TABLE chapitres 
        ADD CONSTRAINT fk_chapitres_parcours 
        FOREIGN KEY (parcours_slug) REFERENCES parcours(slug) ON DELETE CASCADE;
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_questions_chapitre'
    ) THEN
        ALTER TABLE questions 
        ADD CONSTRAINT fk_questions_chapitre 
        FOREIGN KEY (chapitre_id) REFERENCES chapitres(id) ON DELETE CASCADE;
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_cours_chapitre'
    ) THEN
        ALTER TABLE cours 
        ADD CONSTRAINT fk_cours_chapitre 
        FOREIGN KEY (chapitre_id) REFERENCES chapitres(id) ON DELETE CASCADE;
    END IF;
END$$;

-- ============================================================================
-- 4. INDEX
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_app_data_updated_at ON app_data (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chapitres_parcours ON chapitres(parcours_slug);
CREATE INDEX IF NOT EXISTS idx_questions_chapitre ON questions(chapitre_id);
CREATE INDEX IF NOT EXISTS idx_cours_chapitre ON cours(chapitre_id);

-- ============================================================================
-- 5. RLS (ROW LEVEL SECURITY)
-- ============================================================================

-- Activation RLS
ALTER TABLE app_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE parcours ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapitres ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cours ENABLE ROW LEVEL SECURITY;

-- Politique app_data (accès complet)
DROP POLICY IF EXISTS "anon_all_app_data" ON app_data;
CREATE POLICY "anon_all_app_data" ON app_data
    USING (true)
    WITH CHECK (true);

-- Politiques lecture seule pour les tables structurelles
DROP POLICY IF EXISTS "anon_read_parcours" ON parcours;
CREATE POLICY "anon_read_parcours" ON parcours
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "anon_read_chapitres" ON chapitres;
CREATE POLICY "anon_read_chapitres" ON chapitres
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "anon_read_questions" ON questions;
CREATE POLICY "anon_read_questions" ON questions
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "anon_read_cours" ON cours;
CREATE POLICY "anon_read_cours" ON cours
    FOR SELECT USING (true);

-- ============================================================================
-- 6. DONNÉES INITIALES (idempotent)
-- ============================================================================
-- INSERT INTO parcours (slug, label) VALUES
--    ('math-Term', 'Mathématiques - Terminale'),
--    ('math-2de', 'Mathématiques - Seconde'),
--    ('nsi-term', 'NSI - Terminale')
-- ON CONFLICT (slug) DO UPDATE SET label = EXCLUDED.label;

-- ============================================================================
-- 7. VÉRIFICATION
-- ============================================================================
SELECT '✅ Base de données prête' AS status;
SELECT COUNT(*) AS parcours_count FROM parcours;
SELECT COUNT(*) AS tables_count 
FROM information_schema.tables 
WHERE table_schema = 'public';