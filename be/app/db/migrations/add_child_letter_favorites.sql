CREATE TABLE IF NOT EXISTS child_letter_favorites (
    child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    letter_key VARCHAR(8) NOT NULL CHECK (letter_key ~ '^[A-Z]$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (child_id, letter_key)
);

CREATE INDEX IF NOT EXISTS idx_child_letter_favorites_child_created
    ON child_letter_favorites(child_id, created_at ASC);
