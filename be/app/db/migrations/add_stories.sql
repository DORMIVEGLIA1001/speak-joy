INSERT INTO game_stories (
  id, 
  title_en, 
  title_vi, 
  text_en, 
  text_vi, 
  template, 
  blanks, 
  created_at, 
  updated_at
)
VALUES (
  'story_1783061202385_11',
  'A Simple Daily Routine',
  'Một Thói Quen Hàng Ngày Đơn Giản',
  'Every morning, Jack wakes up early to prepare a healthy breakfast. After eating, he walks to the nearby station to catch his ride to work. In the evening, he enjoys reading a book to relax before going to sleep.',
  'Mỗi buổi sáng, Jack thức dậy sớm để chuẩn bị một bữa ăn sáng lành mạnh. Sau khi ăn, anh ấy đi bộ đến nhà ga gần đó để đón xe đi làm. Vào buổi tối, anh ấy thích đọc một cuốn sách để thư giãn trước khi đi ngủ.',
  'Every {blank_0}, Jack wakes up early to prepare a {blank_1} {blank_2}. After eating, he walks to the nearby station to catch his ride to work. In the evening, he enjoys reading a book to {blank_3} before going to sleep.',
  '[{"index":0,"word":"morning","ipa":"/ˈmɔː.nɪŋ/","vietnameseHint":"buổi sáng"},{"index":1,"word":"healthy","ipa":"/ˈhel.θi/","vietnameseHint":"lành mạnh, tốt cho sức khỏe"},{"index":2,"word":"breakfast","ipa":"/ˈbrek.fəst/","vietnameseHint":"bữa ăn sáng"},{"index":3,"word":"relax","ipa":"/rɪˈlæks/","vietnameseHint":"thư giãn"}]'::jsonb,
  '2026-07-03T06:46:42.385Z',
  '2026-07-03T06:46:42.385Z'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO game_stories (
  id, 
  title_en, 
  title_vi, 
  text_en, 
  text_vi, 
  template, 
  blanks, 
  created_at, 
  updated_at
)
VALUES (
  'story-brave-knight',
  'The Brave Knight',
  'Hiệp Sĩ Quả Cảm',
  'The courageous knight fought a dangerous dragon to protect the peaceful kingdom.',
  'Hiệp sĩ dũng cảm đã chiến đấu với một con rồng nguy hiểm để bảo vệ vương quốc hòa bình.',
  'The {blank_0} knight fought a {blank_1} dragon to protect the {blank_2} {blank_3}.',
  '[{"vietnameseHint":"quả cảm / dũng cảm","word":"courageous","index":0,"ipa":"/kəˈreɪ.dʒəs/"},{"ipa":"/ˈdeɪn.dʒər.əs/","index":1,"vietnameseHint":"nguy hiểm","word":"dangerous"},{"ipa":"/ˈpiːs.fəl/","index":2,"vietnameseHint":"hòa bình","word":"peaceful"},{"vietnameseHint":"vương quốc","word":"kingdom","index":3,"ipa":"/ˈkɪŋ.dəm/"}]'::jsonb,
  '2026-06-30T04:18:04.101Z',
  '2026-06-30T04:18:04.101Z'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO game_stories (
  id, 
  title_en, 
  title_vi, 
  text_en, 
  text_vi, 
  template, 
  blanks, 
  created_at, 
  updated_at
)
VALUES (
  'story_1783061202385_11',
  'A Simple Daily Routine',
  'Một Thói Quen Hàng Ngày Đơn Giản',
  'Every morning, Jack wakes up early to prepare a healthy breakfast. After eating, he walks to the nearby station to catch his ride to work. In the evening, he enjoys reading a book to relax before going to sleep.',
  'Mỗi buổi sáng, Jack thức dậy sớm để chuẩn bị một bữa ăn sáng lành mạnh. Sau khi ăn, anh ấy đi bộ đến nhà ga gần đó để đón xe đi làm. Vào buổi tối, anh ấy thích đọc một cuốn sách để thư giãn trước khi đi ngủ.',
  'Every {blank_0}, Jack wakes up early to prepare a {blank_1} {blank_2}. After eating, he walks to the nearby station to catch his ride to work. In the evening, he enjoys reading a book to {blank_3} before going to sleep.',
  '[{"index":0,"word":"morning","ipa":"/ˈmɔː.nɪŋ/","vietnameseHint":"buổi sáng"},{"index":1,"word":"healthy","ipa":"/ˈhel.θi/","vietnameseHint":"lành mạnh, tốt cho sức khỏe"},{"index":2,"word":"breakfast","ipa":"/ˈbrek.fəst/","vietnameseHint":"bữa ăn sáng"},{"index":3,"word":"relax","ipa":"/rɪˈlæks/","vietnameseHint":"thư giãn"}]'::jsonb,
  '2026-07-03T06:46:42.385Z',
  '2026-07-03T06:46:42.385Z'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO game_stories (
  id, 
  title_en, 
  title_vi, 
  text_en, 
  text_vi, 
  template, 
  blanks, 
  created_at, 
  updated_at
)
VALUES (
  'story_1783061350331_389',
  'The Cheese Magician',
  'Nhà ảo thuật phô mai',
  'Leo loved to tell funny jokes to make his friends laugh. One day, he performed a hilarious trick on stage at the local talent show. Instead of pulling a rabbit out of his hat, he pulled out a giant slice of cheese. The entire audience burst into laughter, and he won the prize for the best comedian.',
  'Leo rất thích kể những câu chuyện cười vui nhộn để làm cho bạn bè của mình cười. Một ngày nọ, anh ấy đã biểu diễn một trò ảo thuật cực kỳ hài hước trên sân khấu tại buổi biểu diễn tài năng địa phương. Thay vì kéo một con thỏ ra khỏi mũ, anh ấy lại kéo ra một lát phô mai khổng lồ. Toàn bộ khán giả đã bật cười lớn, và anh ấy đã giành được giải thưởng dành cho diễn viên hài xuất sắc nhất.',
  'Leo loved to tell funny {blank_0} to make his friends laugh. One day, he performed a {blank_1} trick on stage at the local talent show. Instead of pulling a rabbit out of his hat, he pulled out a giant slice of cheese. The entire audience burst into {blank_2}, and he won the prize for the best {blank_3}.',
  '[{"vietnameseHint":"những câu chuyện cười, trò đùa","index":0,"word":"jokes","ipa":"/dʒoʊks/"},{"ipa":"/hɪˈler.i.əs/","word":"hilarious","vietnameseHint":"cực kỳ hài hước, vui nhộn","index":1},{"word":"laughter","index":2,"vietnameseHint":"tiếng cười","ipa":"/ˈlæf.tər/"},{"ipa":"/kəˈmiː.di.ən/","word":"comedian","vietnameseHint":"diễn viên hài","index":3}]'::jsonb,
  '2026-07-03T06:49:10.331Z',
  '2026-07-03T06:49:10.331Z'
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE game_stories
    ADD COLUMN IF NOT EXISTS story_type VARCHAR(20) NOT NULL DEFAULT 'narrative',
    ADD COLUMN IF NOT EXISTS dialogue JSONB NOT NULL DEFAULT '[]'::jsonb;

INSERT INTO game_stories (
    id, title_en, title_vi, text_en, text_vi, template, blanks, story_type, dialogue
)
VALUES (
    'friends_picnic_dialogue',
    'A Picnic with Friends',
    'Buổi dã ngoại cùng bạn bè',
    'Mia: Hello, Ben! I brought some apples. Ben: Great! I have a blue kite. Lily: Let us play near the big tree.',
    'Mia: Chào Ben! Tớ mang theo vài quả táo. Ben: Tuyệt! Tớ có một chiếc diều xanh. Lily: Chúng ta hãy chơi gần cái cây lớn.',
    'Hello, {blank_0}! I brought some {blank_1}. Great! I have a blue {blank_2}. Let us play near the big {blank_3}.',
    '[
      {"index": 0, "word": "Ben", "vietnameseHint": "tên Ben", "ipa": "/ben/"},
      {"index": 1, "word": "apples", "vietnameseHint": "những quả táo", "ipa": "/ˈæp.əlz/"},
      {"index": 2, "word": "kite", "vietnameseHint": "chiếc diều", "ipa": "/kaɪt/"},
      {"index": 3, "word": "tree", "vietnameseHint": "cái cây", "ipa": "/triː/"}
    ]'::jsonb,
    'dialogue',
    '[
      {"speaker": "Mia", "avatar": "👧", "template": "Hello, {blank_0}! I brought some {blank_1}."},
      {"speaker": "Ben", "avatar": "👦", "template": "Great! I have a blue {blank_2}."},
      {"speaker": "Lily", "avatar": "🧒", "template": "Let us play near the big {blank_3}."}
    ]'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
    story_type = EXCLUDED.story_type,
    dialogue = EXCLUDED.dialogue,
    blanks = EXCLUDED.blanks,
    template = EXCLUDED.template,
    updated_at = NOW();
