
CREATE TABLE IF NOT EXISTS words (
  id VARCHAR(50) PRIMARY KEY,
  word VARCHAR(255) NOT NULL,
  vietnamese VARCHAR(255) NOT NULL,
  ipa VARCHAR(100),
  category VARCHAR(100),
  level VARCHAR(10),
  icon VARCHAR(50),
  definition TEXT,
  example TEXT,
  example_translation TEXT,
  created_at BIGINT DEFAULT (EXTRACT(epoch FROM NOW()) * 1000)::BIGINT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_words_word ON words(word);
CREATE INDEX IF NOT EXISTS idx_words_category ON words(category);
CREATE INDEX IF NOT EXISTS idx_words_level ON words(level);

DROP TRIGGER IF EXISTS trg_words_updated_at ON words;
CREATE TRIGGER trg_words_updated_at
BEFORE UPDATE ON words
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'unique_word_category'
      AND conrelid = 'words'::regclass
  ) THEN
    ALTER TABLE words
      ADD CONSTRAINT unique_word_category UNIQUE (word, category);
  END IF;
END $$;


