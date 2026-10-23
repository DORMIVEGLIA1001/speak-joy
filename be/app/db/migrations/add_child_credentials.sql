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

DROP TRIGGER IF EXISTS trg_child_credentials_updated_at ON child_credentials;
CREATE TRIGGER trg_child_credentials_updated_at
BEFORE UPDATE ON child_credentials
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
