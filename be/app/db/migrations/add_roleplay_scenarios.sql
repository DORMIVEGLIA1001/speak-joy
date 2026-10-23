-- Role-play (contextual speaking) scenarios for the kids' speaking mode (notes 14/7 · mục 3).
-- A scenario (e.g. "at school") holds several scripts; each script holds a few ordered
-- lines; each line is one thing Sunny says plus 4 tappable answer options. Each option
-- carries its target IPA (precomputed here) so the audio→IPA scorer has something to
-- compare the child's pronunciation against without a runtime IPA lookup.
-- Idempotent: safe to re-run (IF NOT EXISTS + ON CONFLICT DO NOTHING).

CREATE TABLE IF NOT EXISTS roleplay_scenarios (
    id BIGSERIAL PRIMARY KEY,
    slug VARCHAR(255) NOT NULL UNIQUE,
    title_en VARCHAR(255) NOT NULL,
    title_vi VARCHAR(255) NOT NULL,
    persona_en VARCHAR(255),
    persona_vi VARCHAR(255),
    emoji VARCHAR(50),
    greeting_en TEXT,
    greeting_vi TEXT,
    age_min INTEGER NOT NULL DEFAULT 4,
    age_max INTEGER NOT NULL DEFAULT 12,
    scenario_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS roleplay_scripts (
    id BIGSERIAL PRIMARY KEY,
    scenario_id BIGINT NOT NULL REFERENCES roleplay_scenarios(id) ON DELETE CASCADE,
    slug VARCHAR(255) NOT NULL UNIQUE,
    script_order INTEGER NOT NULL DEFAULT 0,
    title_en VARCHAR(255),
    title_vi VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_roleplay_scripts_scenario
    ON roleplay_scripts(scenario_id, script_order);

CREATE TABLE IF NOT EXISTS roleplay_lines (
    id BIGSERIAL PRIMARY KEY,
    script_id BIGINT NOT NULL REFERENCES roleplay_scripts(id) ON DELETE CASCADE,
    line_order INTEGER NOT NULL DEFAULT 0,
    ai_prompt_en TEXT NOT NULL,
    ai_prompt_vi TEXT,
    options JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (script_id, line_order)
);

CREATE INDEX IF NOT EXISTS idx_roleplay_lines_script
    ON roleplay_lines(script_id, line_order);

DROP TRIGGER IF EXISTS trg_roleplay_scenarios_updated_at ON roleplay_scenarios;
CREATE TRIGGER trg_roleplay_scenarios_updated_at
BEFORE UPDATE ON roleplay_scenarios
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_roleplay_scripts_updated_at ON roleplay_scripts;
CREATE TRIGGER trg_roleplay_scripts_updated_at
BEFORE UPDATE ON roleplay_scripts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_roleplay_lines_updated_at ON roleplay_lines;
CREATE TRIGGER trg_roleplay_lines_updated_at
BEFORE UPDATE ON roleplay_lines
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Seed data ────────────────────────────────────────────────────────────────
-- options JSON shape: [{ "text": "...", "ipa": "...", "translate": "...", "correct": true|false }]
-- IPA is a simple broad transcription of the whole answer, space-separated per word.

INSERT INTO roleplay_scenarios (slug, title_en, title_vi, persona_en, persona_vi, emoji, greeting_en, greeting_vi, age_min, age_max, scenario_order)
VALUES
  ('at-school', 'At School', 'Ở trường học', 'You are a student', 'Con là học sinh', '🎒',
   'Hi! I am your teacher. Welcome to class! Are you ready to learn?',
   'Chào con! Cô là giáo viên đây. Chào mừng con đến lớp! Con sẵn sàng học chưa?', 4, 12, 1),
  ('at-home', 'At Home with Family', 'Ở nhà với gia đình', 'You are talking with your family', 'Con nói chuyện với gia đình', '🏠',
   'Good morning, sweetie! Did you sleep well? Come and have breakfast!',
   'Chào buổi sáng con yêu! Con ngủ ngon không? Lại đây ăn sáng nào!', 4, 12, 2),
  ('with-friends', 'Playing with Friends', 'Chơi với bạn bè', 'You are talking with a friend', 'Con nói chuyện với bạn', '🧒',
   'Hi friend! Do you want to play with me today?',
   'Chào cậu! Hôm nay cậu có muốn chơi với tớ không?', 4, 12, 3)
ON CONFLICT (slug) DO NOTHING;

-- Scripts + lines for "at-school"
INSERT INTO roleplay_scripts (scenario_id, slug, script_order, title_en, title_vi)
SELECT s.id, 'at-school-greeting', 1, 'Saying hello to the teacher', 'Chào cô giáo'
FROM roleplay_scenarios s WHERE s.slug = 'at-school'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO roleplay_lines (script_id, line_order, ai_prompt_en, ai_prompt_vi, options)
SELECT sc.id, 1,
  'Good morning! How are you today?',
  'Chào buổi sáng! Hôm nay con thế nào?',
  '[
    {"text": "I am fine, thank you.", "ipa": "aɪ æm faɪn θæŋk juː", "translate": "Con khỏe, cảm ơn cô.", "correct": true},
    {"text": "I am happy today.", "ipa": "aɪ æm hæpi tədeɪ", "translate": "Hôm nay con vui.", "correct": true},
    {"text": "Good morning, teacher.", "ipa": "ɡʊd mɔːnɪŋ tiːtʃə", "translate": "Chào buổi sáng cô.", "correct": true},
    {"text": "My name is Anna.", "ipa": "maɪ neɪm ɪz ænə", "translate": "Con tên là Anna.", "correct": true}
  ]'::jsonb
FROM roleplay_scripts sc WHERE sc.slug = 'at-school-greeting'
ON CONFLICT DO NOTHING;

INSERT INTO roleplay_lines (script_id, line_order, ai_prompt_en, ai_prompt_vi, options)
SELECT sc.id, 2,
  'What is your favorite subject?',
  'Môn học con thích nhất là gì?',
  '[
    {"text": "I like English.", "ipa": "aɪ laɪk ɪŋɡlɪʃ", "translate": "Con thích tiếng Anh.", "correct": true},
    {"text": "I like math.", "ipa": "aɪ laɪk mæθ", "translate": "Con thích toán.", "correct": true},
    {"text": "I like music.", "ipa": "aɪ laɪk mjuːzɪk", "translate": "Con thích âm nhạc.", "correct": true},
    {"text": "I like art.", "ipa": "aɪ laɪk ɑːt", "translate": "Con thích mĩ thuật.", "correct": true}
  ]'::jsonb
FROM roleplay_scripts sc WHERE sc.slug = 'at-school-greeting'
ON CONFLICT DO NOTHING;

-- Scripts + lines for "at-home"
INSERT INTO roleplay_scripts (scenario_id, slug, script_order, title_en, title_vi)
SELECT s.id, 'at-home-breakfast', 1, 'Breakfast time', 'Giờ ăn sáng'
FROM roleplay_scenarios s WHERE s.slug = 'at-home'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO roleplay_lines (script_id, line_order, ai_prompt_en, ai_prompt_vi, options)
SELECT sc.id, 1,
  'What do you want for breakfast?',
  'Con muốn ăn gì cho bữa sáng?',
  '[
    {"text": "I want bread.", "ipa": "aɪ wɒnt bred", "translate": "Con muốn ăn bánh mì.", "correct": true},
    {"text": "I want milk.", "ipa": "aɪ wɒnt mɪlk", "translate": "Con muốn uống sữa.", "correct": true},
    {"text": "I want an egg.", "ipa": "aɪ wɒnt ən eɡ", "translate": "Con muốn ăn trứng.", "correct": true},
    {"text": "I want rice.", "ipa": "aɪ wɒnt raɪs", "translate": "Con muốn ăn cơm.", "correct": true}
  ]'::jsonb
FROM roleplay_scripts sc WHERE sc.slug = 'at-home-breakfast'
ON CONFLICT DO NOTHING;

INSERT INTO roleplay_lines (script_id, line_order, ai_prompt_en, ai_prompt_vi, options)
SELECT sc.id, 2,
  'Do you love me?',
  'Con có yêu mẹ không?',
  '[
    {"text": "Yes, I love you.", "ipa": "jes aɪ lʌv juː", "translate": "Có, con yêu mẹ.", "correct": true},
    {"text": "I love you so much.", "ipa": "aɪ lʌv juː səʊ mʌtʃ", "translate": "Con yêu mẹ nhiều lắm.", "correct": true},
    {"text": "You are the best.", "ipa": "juː ɑː ðə best", "translate": "Mẹ là tuyệt nhất.", "correct": true},
    {"text": "I love my family.", "ipa": "aɪ lʌv maɪ fæmɪli", "translate": "Con yêu gia đình.", "correct": true}
  ]'::jsonb
FROM roleplay_scripts sc WHERE sc.slug = 'at-home-breakfast'
ON CONFLICT DO NOTHING;

-- Scripts + lines for "with-friends"
INSERT INTO roleplay_scripts (scenario_id, slug, script_order, title_en, title_vi)
SELECT s.id, 'with-friends-play', 1, 'Playing together', 'Cùng nhau chơi'
FROM roleplay_scenarios s WHERE s.slug = 'with-friends'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO roleplay_lines (script_id, line_order, ai_prompt_en, ai_prompt_vi, options)
SELECT sc.id, 1,
  'What game do you want to play?',
  'Cậu muốn chơi trò gì?',
  '[
    {"text": "Let us play ball.", "ipa": "let ʌs pleɪ bɔːl", "translate": "Mình chơi bóng nhé.", "correct": true},
    {"text": "Let us run.", "ipa": "let ʌs rʌn", "translate": "Mình chạy nào.", "correct": true},
    {"text": "I want to hide.", "ipa": "aɪ wɒnt tə haɪd", "translate": "Tớ muốn chơi trốn tìm.", "correct": true},
    {"text": "Let us draw.", "ipa": "let ʌs drɔː", "translate": "Mình vẽ nhé.", "correct": true}
  ]'::jsonb
FROM roleplay_scripts sc WHERE sc.slug = 'with-friends-play'
ON CONFLICT DO NOTHING;

INSERT INTO roleplay_lines (script_id, line_order, ai_prompt_en, ai_prompt_vi, options)
SELECT sc.id, 2,
  'You are my best friend!',
  'Cậu là bạn thân nhất của tớ!',
  '[
    {"text": "You are my friend too.", "ipa": "juː ɑː maɪ frend tuː", "translate": "Cậu cũng là bạn của tớ.", "correct": true},
    {"text": "Thank you, friend.", "ipa": "θæŋk juː frend", "translate": "Cảm ơn cậu.", "correct": true},
    {"text": "I am so happy.", "ipa": "aɪ æm səʊ hæpi", "translate": "Tớ vui lắm.", "correct": true},
    {"text": "Let us play again.", "ipa": "let ʌs pleɪ əɡen", "translate": "Mình chơi tiếp nhé.", "correct": true}
  ]'::jsonb
FROM roleplay_scripts sc WHERE sc.slug = 'with-friends-play'
ON CONFLICT DO NOTHING;
