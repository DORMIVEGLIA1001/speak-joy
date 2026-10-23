-- Add social-auth related columns to users table.
-- This prepares the schema for Google/Facebook login without replacing local auth.

ALTER TABLE users
ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'local',
ADD COLUMN IF NOT EXISTS provider_user_id TEXT,
ADD COLUMN IF NOT EXISTS avatar_url TEXT,
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE users
ALTER COLUMN password_hash DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_auth_provider_provider_user_id_idx
ON users (auth_provider, provider_user_id)
WHERE provider_user_id IS NOT NULL;

COMMENT ON COLUMN users.auth_provider
IS 'Authentication provider for this account: local, google, facebook, etc.';

COMMENT ON COLUMN users.provider_user_id
IS 'Provider-specific stable user id from Google/Facebook/etc.';

COMMENT ON COLUMN users.avatar_url
IS 'Optional avatar URL from the social provider profile.';

COMMENT ON COLUMN users.email_verified
IS 'Whether the email address is verified by the provider or local flow.';
