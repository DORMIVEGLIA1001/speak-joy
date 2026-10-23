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
