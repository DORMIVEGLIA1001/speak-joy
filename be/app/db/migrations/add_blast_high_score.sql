ALTER TABLE child_game_records
    ADD COLUMN IF NOT EXISTS blast_high_score INTEGER NOT NULL DEFAULT 0;

ALTER TABLE child_game_records
    DROP CONSTRAINT IF EXISTS child_game_records_blast_high_score_check;

ALTER TABLE child_game_records
    ADD CONSTRAINT child_game_records_blast_high_score_check
    CHECK (blast_high_score >= 0);
