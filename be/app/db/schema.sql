CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    username VARCHAR(50) UNIQUE,
    password_hash VARCHAR(255),
    display_name VARCHAR(100) NOT NULL DEFAULT '',
    role VARCHAR(20) NOT NULL DEFAULT 'parent' CHECK (role IN ('parent', 'admin')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_login_at TIMESTAMPTZ,
    auth_provider TEXT NOT NULL DEFAULT 'local',
    provider_user_id TEXT,
    avatar_url TEXT,
    email_verified BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'local',
    ADD COLUMN IF NOT EXISTS provider_user_id TEXT,
    ADD COLUMN IF NOT EXISTS avatar_url TEXT,
    ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE users
    ALTER COLUMN password_hash DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_auth_provider_provider_user_id_idx
    ON users(auth_provider, provider_user_id)
    WHERE provider_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_ai_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL DEFAULT 'siliconflow',
    base_url TEXT NOT NULL,
    model_name VARCHAR(255) NOT NULL,
    api_key_encrypted TEXT,
    api_key_last4 VARCHAR(16),
    is_active BOOLEAN NOT NULL DEFAULT true,
    extra_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_ai_configs_user_active
    ON user_ai_configs(user_id, is_active, updated_at DESC);

CREATE TABLE IF NOT EXISTS user_webauthn_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    credential_id BYTEA NOT NULL UNIQUE,
    public_key BYTEA NOT NULL,
    sign_count BIGINT NOT NULL DEFAULT 0,
    label VARCHAR(150),
    device_type VARCHAR(50),
    backed_up BOOLEAN NOT NULL DEFAULT FALSE,
    transports JSONB NOT NULL DEFAULT '[]'::jsonb,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_webauthn_credentials_user_id
    ON user_webauthn_credentials(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS children (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    birth_year INTEGER,
    english_level VARCHAR(50),
    native_language VARCHAR(20) NOT NULL DEFAULT 'vi',
    notes TEXT,
    current_streak_days INTEGER NOT NULL DEFAULT 0,
    longest_streak_days INTEGER NOT NULL DEFAULT 0,
    last_practice_date DATE,
    total_pronunciations INTEGER NOT NULL DEFAULT 0,
    total_completed_lessons INTEGER NOT NULL DEFAULT 0,
    avatar_url TEXT,
    ai_usage JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_children_parent_user_id
    ON children(parent_user_id, created_at ASC);

CREATE TABLE IF NOT EXISTS child_letter_favorites (
    child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    letter_key VARCHAR(8) NOT NULL CHECK (letter_key ~ '^[A-Z]$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (child_id, letter_key)
);

CREATE INDEX IF NOT EXISTS idx_child_letter_favorites_child_created
    ON child_letter_favorites(child_id, created_at ASC);

CREATE TABLE IF NOT EXISTS child_ipa_favorites (
    child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    sound_key VARCHAR(24) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (child_id, sound_key)
);

CREATE INDEX IF NOT EXISTS idx_child_ipa_favorites_child_created
    ON child_ipa_favorites(child_id, created_at ASC);

CREATE TABLE IF NOT EXISTS child_credentials (
    child_id UUID PRIMARY KEY REFERENCES children(id) ON DELETE CASCADE,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_child_credentials_username
    ON child_credentials(username);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_created
    ON password_reset_tokens(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS password_reset_otps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    otp_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    resend_count INTEGER NOT NULL DEFAULT 0,
    max_resends INTEGER NOT NULL DEFAULT 3,
    last_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    verified_at TIMESTAMPTZ,
    consumed_at TIMESTAMPTZ,
    grant_token_hash VARCHAR(64),
    grant_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_otps_email_created
    ON password_reset_otps(email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_password_reset_otps_user_created
    ON password_reset_otps(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_password_reset_otps_grant_hash
    ON password_reset_otps(grant_token_hash);

-- active_child_id added after children so the FK target exists.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS active_child_id UUID REFERENCES children(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS topics (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vocabulary_items (
    id BIGSERIAL PRIMARY KEY,
    topic_id BIGINT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    source_id TEXT,
    word VARCHAR(255) NOT NULL,
    ipa TEXT,
    vietnamese TEXT,
    age_group VARCHAR(50),
    example TEXT,
    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vocabulary_items_topic_id
    ON vocabulary_items(topic_id);

CREATE TABLE IF NOT EXISTS vocabulary_questions (
    id BIGSERIAL PRIMARY KEY,
    vocabulary_item_id BIGINT NOT NULL REFERENCES vocabulary_items(id) ON DELETE CASCADE,
    question_order INTEGER NOT NULL DEFAULT 0,
    question_en TEXT NOT NULL,
    question_vi TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vocabulary_questions_item_id
    ON vocabulary_questions(vocabulary_item_id, question_order);

CREATE TABLE IF NOT EXISTS vocabulary_assets (
    id BIGSERIAL PRIMARY KEY,
    vocabulary_item_id BIGINT NOT NULL REFERENCES vocabulary_items(id) ON DELETE CASCADE,
    asset_type VARCHAR(50) NOT NULL DEFAULT 'image',
    asset_order INTEGER NOT NULL DEFAULT 0,
    asset_url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vocabulary_assets_item_id
    ON vocabulary_assets(vocabulary_item_id, asset_order);

CREATE TABLE IF NOT EXISTS learning_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    child_id UUID REFERENCES children(id) ON DELETE SET NULL,
    topic_id BIGINT REFERENCES topics(id) ON DELETE SET NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    turn_count INTEGER NOT NULL DEFAULT 0,
    overall_score NUMERIC(5,2),
    summary TEXT,
    conversation_transcript JSONB DEFAULT NULL,
    recording_url TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learning_sessions_user_started
    ON learning_sessions(user_id, started_at DESC);

CREATE TABLE IF NOT EXISTS lesson_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    topic_id BIGINT REFERENCES topics(id) ON DELETE SET NULL,
    lesson_key VARCHAR(255) NOT NULL,
    lesson_title VARCHAR(255) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    pronunciation_attempts INTEGER NOT NULL DEFAULT 0,
    score INTEGER,
    completed_at TIMESTAMPTZ,
    last_practiced_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (child_id, lesson_key)
);

CREATE INDEX IF NOT EXISTS idx_lesson_progress_child_topic
    ON lesson_progress(child_id, topic_id, status);

CREATE TABLE IF NOT EXISTS child_daily_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    activity_date DATE NOT NULL,
    sessions_count INTEGER NOT NULL DEFAULT 0,
    pronunciations_count INTEGER NOT NULL DEFAULT 0,
    lessons_completed_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (child_id, activity_date)
);

CREATE INDEX IF NOT EXISTS idx_child_daily_activity_child_date
    ON child_daily_activity(child_id, activity_date DESC);

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_user_ai_configs_updated_at ON user_ai_configs;
CREATE TRIGGER trg_user_ai_configs_updated_at
BEFORE UPDATE ON user_ai_configs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_user_webauthn_credentials_updated_at ON user_webauthn_credentials;
CREATE TRIGGER trg_user_webauthn_credentials_updated_at
BEFORE UPDATE ON user_webauthn_credentials
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_children_updated_at ON children;
CREATE TRIGGER trg_children_updated_at
BEFORE UPDATE ON children
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_child_credentials_updated_at ON child_credentials;
CREATE TRIGGER trg_child_credentials_updated_at
BEFORE UPDATE ON child_credentials
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_topics_updated_at ON topics;
CREATE TRIGGER trg_topics_updated_at
BEFORE UPDATE ON topics
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_vocabulary_items_updated_at ON vocabulary_items;
CREATE TRIGGER trg_vocabulary_items_updated_at
BEFORE UPDATE ON vocabulary_items
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_vocabulary_questions_updated_at ON vocabulary_questions;
CREATE TRIGGER trg_vocabulary_questions_updated_at
BEFORE UPDATE ON vocabulary_questions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_vocabulary_assets_updated_at ON vocabulary_assets;
CREATE TRIGGER trg_vocabulary_assets_updated_at
BEFORE UPDATE ON vocabulary_assets
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_learning_sessions_updated_at ON learning_sessions;
CREATE TRIGGER trg_learning_sessions_updated_at
BEFORE UPDATE ON learning_sessions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_lesson_progress_updated_at ON lesson_progress;
CREATE TRIGGER trg_lesson_progress_updated_at
BEFORE UPDATE ON lesson_progress
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_child_daily_activity_updated_at ON child_daily_activity;
CREATE TRIGGER trg_child_daily_activity_updated_at
BEFORE UPDATE ON child_daily_activity
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS child_game_records (
    child_id UUID PRIMARY KEY REFERENCES children(id) ON DELETE CASCADE,
    true_false_high_streak INTEGER NOT NULL DEFAULT 0,
    word_chain_high_score INTEGER NOT NULL DEFAULT 0,
    flashcard_match_best_time INTEGER NOT NULL DEFAULT 0,
    stories_completed_count INTEGER NOT NULL DEFAULT 0,
    blocks_high_score INTEGER NOT NULL DEFAULT 0,
    blast_high_score INTEGER NOT NULL DEFAULT 0,
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

CREATE INDEX IF NOT EXISTS idx_words_word
    ON words(word);

CREATE INDEX IF NOT EXISTS idx_words_category
    ON words(category);

CREATE INDEX IF NOT EXISTS idx_words_level
    ON words(level);

DROP TRIGGER IF EXISTS trg_words_updated_at ON words;
CREATE TRIGGER trg_words_updated_at
BEFORE UPDATE ON words
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS game_flashcards (
    id SERIAL PRIMARY KEY,
    word VARCHAR(255) NOT NULL UNIQUE,
    ipa VARCHAR(255),
    vietnamese VARCHAR(255) NOT NULL,
    emoji VARCHAR(50) NOT NULL,
    age_group VARCHAR(50) NOT NULL DEFAULT 'preschool',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_game_flashcards_updated_at ON game_flashcards;
CREATE TRIGGER trg_game_flashcards_updated_at
BEFORE UPDATE ON game_flashcards
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS game_stories (
    id VARCHAR(100) PRIMARY KEY,
    title_en VARCHAR(255) NOT NULL,
    title_vi VARCHAR(255) NOT NULL,
    text_en TEXT NOT NULL,
    text_vi TEXT NOT NULL,
    template TEXT NOT NULL,
    blanks JSONB NOT NULL DEFAULT '[]'::jsonb,
    story_type VARCHAR(20) NOT NULL DEFAULT 'narrative',
    dialogue JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_game_stories_updated_at ON game_stories;
CREATE TRIGGER trg_game_stories_updated_at
BEFORE UPDATE ON game_stories
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
