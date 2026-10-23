-- Add conversation_transcript column to learning_sessions table
-- Stores the detailed freestyle/SpeakJoy transcript as JSONB.

ALTER TABLE learning_sessions
ADD COLUMN IF NOT EXISTS conversation_transcript JSONB DEFAULT NULL;

COMMENT ON COLUMN learning_sessions.conversation_transcript
IS 'Detailed conversation transcript for freestyle / SpeakJoy sessions';
