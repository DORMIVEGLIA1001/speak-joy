-- Add child profile fields: avatar_url + per-child AI usage on `children`,
-- and active_child_id on `users`.
-- Run this migration on your Supabase database.

-- 1) children.avatar_url: public URL of the child's avatar (optional)
ALTER TABLE children
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

COMMENT ON COLUMN children.avatar_url IS 'Public URL of the child avatar stored on Supabase Storage (bucket: avatar). NULL = use default icon';

-- 2) children.ai_usage: per-child AI usage tracking
--    Shape: { "usageCount": int, "usageLimit": int|null }  (limit null = unlimited)
ALTER TABLE children
ADD COLUMN IF NOT EXISTS ai_usage JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN children.ai_usage IS 'Per-child AI usage: { "usageCount": int, "usageLimit": int|null }. usageLimit null/absent = unlimited';

-- 3) users.active_child_id: the currently selected child for this parent account
--    (synced across devices). ON DELETE SET NULL keeps the row valid if the child is removed.
ALTER TABLE users
ADD COLUMN IF NOT EXISTS active_child_id UUID REFERENCES children(id) ON DELETE SET NULL;

COMMENT ON COLUMN users.active_child_id IS 'Currently selected Active_Child for this parent, synced across devices. NULL = no child selected';
