CREATE TABLE IF NOT EXISTS child_ipa_favorites (
    child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    sound_key VARCHAR(24) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (child_id, sound_key)
);

CREATE INDEX IF NOT EXISTS idx_child_ipa_favorites_child_created
    ON child_ipa_favorites(child_id, created_at ASC);
