CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS child_game_records (
    child_id UUID PRIMARY KEY REFERENCES children(id) ON DELETE CASCADE,
    true_false_high_streak INTEGER NOT NULL DEFAULT 0 CHECK (true_false_high_streak >= 0),
    word_chain_high_score INTEGER NOT NULL DEFAULT 0 CHECK (word_chain_high_score >= 0),
    flashcard_match_best_time INTEGER NOT NULL DEFAULT 0 CHECK (flashcard_match_best_time >= 0),
    stories_completed_count INTEGER NOT NULL DEFAULT 0 CHECK (stories_completed_count >= 0),
    blocks_high_score INTEGER NOT NULL DEFAULT 0 CHECK (blocks_high_score >= 0),
    blast_high_score INTEGER NOT NULL DEFAULT 0 CHECK (blast_high_score >= 0),
    record_date DATE NOT NULL DEFAULT ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE child_game_records
    ADD COLUMN IF NOT EXISTS record_date DATE,
    ADD COLUMN IF NOT EXISTS blocks_high_score INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS blast_high_score INTEGER NOT NULL DEFAULT 0;

UPDATE child_game_records
SET record_date = (updated_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
WHERE record_date IS NULL;

ALTER TABLE child_game_records
    ALTER COLUMN record_date SET DEFAULT ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date),
    ALTER COLUMN record_date SET NOT NULL;

DROP TRIGGER IF EXISTS trg_child_game_records_updated_at ON child_game_records;
CREATE TRIGGER trg_child_game_records_updated_at
BEFORE UPDATE ON child_game_records
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_child_game_records_updated_at
    ON child_game_records(updated_at DESC);
