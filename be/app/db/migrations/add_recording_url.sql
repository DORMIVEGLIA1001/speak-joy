-- Add recording_url column to learning_sessions table
-- Run this migration on your Supabase database

ALTER TABLE learning_sessions
ADD COLUMN IF NOT EXISTS recording_url TEXT DEFAULT NULL;

COMMENT ON COLUMN learning_sessions.recording_url IS 'Public URL of the call recording stored on Supabase Storage';
