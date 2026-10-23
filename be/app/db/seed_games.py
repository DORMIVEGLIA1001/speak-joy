import json
import psycopg2
from psycopg2.extras import Json
from be.app.core.config import settings

# 60 Diverse Vocabulary Items for game_flashcards
FLASHCARDS_DATA = [
    # Preschool (35 items)
    {"word": "apple", "ipa": "/ˈæp.əl/", "vietnamese": "quả táo", "emoji": "🍎", "age_group": "preschool"},
    {"word": "banana", "ipa": "/bəˈnɑː.nə/", "vietnamese": "quả chuối", "emoji": "🍌", "age_group": "preschool"},
    {"word": "cat", "ipa": "/kæt/", "vietnamese": "con mèo", "emoji": "🐱", "age_group": "preschool"},
    {"word": "dog", "ipa": "/dɒɡ/", "vietnamese": "con chó", "emoji": "🐶", "age_group": "preschool"},
    {"word": "fish", "ipa": "/fɪʃ/", "vietnamese": "con cá", "emoji": "🐟", "age_group": "preschool"},
    {"word": "car", "ipa": "/kɑːr/", "vietnamese": "xe ô tô", "emoji": "🚗", "age_group": "preschool"},
    {"word": "sun", "ipa": "/sʌn/", "vietnamese": "mặt trời", "emoji": "☀️", "age_group": "preschool"},
    {"word": "bird", "ipa": "/bɜːd/", "vietnamese": "con chim", "emoji": "🐦", "age_group": "preschool"},
    {"word": "star", "ipa": "/stɑːr/", "vietnamese": "ngôi sao", "emoji": "⭐", "age_group": "preschool"},
    {"word": "moon", "ipa": "/muːn/", "vietnamese": "mặt trăng", "emoji": "🌙", "age_group": "preschool"},
    {"word": "frog", "ipa": "/frɒɡ/", "vietnamese": "con ếch", "emoji": "🐸", "age_group": "preschool"},
    {"word": "flower", "ipa": "/ˈflaʊ.ər/", "vietnamese": "bông hoa", "emoji": "🌸", "age_group": "preschool"},
    {"word": "bear", "ipa": "/beər/", "vietnamese": "con gấu", "emoji": "🐻", "age_group": "preschool"},
    {"word": "duck", "ipa": "/dʌk/", "vietnamese": "con vịt", "emoji": "🦆", "age_group": "preschool"},
    {"word": "cow", "ipa": "/kaʊ/", "vietnamese": "con bò", "emoji": "🐄", "age_group": "preschool"},
    {"word": "sheep", "ipa": "/ʃiːp/", "vietnamese": "con cừu", "emoji": "🐑", "age_group": "preschool"},
    {"word": "pig", "ipa": "/pɪɡ/", "vietnamese": "con lợn", "emoji": "🐖", "age_group": "preschool"},
    {"word": "ant", "ipa": "/ænt/", "vietnamese": "con kiến", "emoji": "🐜", "age_group": "preschool"},
    {"word": "bee", "ipa": "/biː/", "vietnamese": "con ong", "emoji": "🐝", "age_group": "preschool"},
    {"word": "turtle", "ipa": "/ˈtɜː.təl/", "vietnamese": "con rùa", "emoji": "🐢", "age_group": "preschool"},
    {"word": "tree", "ipa": "/triː/", "vietnamese": "cái cây", "emoji": "🌳", "age_group": "preschool"},
    {"word": "book", "ipa": "/bʊk/", "vietnamese": "quyển sách", "emoji": "📘", "age_group": "preschool"},
    {"word": "hat", "ipa": "/hæt/", "vietnamese": "cái mũ", "emoji": "👒", "age_group": "preschool"},
    {"word": "clock", "ipa": "/klɒk/", "vietnamese": "đồng hồ", "emoji": "⏰", "age_group": "preschool"},
    {"word": "grape", "ipa": "/ɡreɪps/", "vietnamese": "quả nho", "emoji": "🍇", "age_group": "preschool"},
    {"word": "orange", "ipa": "/ˈɒr.ɪndʒ/", "vietnamese": "quả cam", "emoji": "🍊", "age_group": "preschool"},
    {"word": "pear", "ipa": "/peər/", "vietnamese": "quả lê", "emoji": "🍐", "age_group": "preschool"},
    {"word": "milk", "ipa": "/mɪlk/", "vietnamese": "sữa", "emoji": "🥛", "age_group": "preschool"},
    {"word": "cake", "ipa": "/keɪk/", "vietnamese": "bánh ngọt", "emoji": "🍰", "age_group": "preschool"},
    {"word": "ball", "ipa": "/bɔːl/", "vietnamese": "quả bóng", "emoji": "⚽", "age_group": "preschool"},
    {"word": "balloon", "ipa": "/bəˈluːn/", "vietnamese": "quả bóng bay", "emoji": "🎈", "age_group": "preschool"},
    {"word": "kite", "ipa": "/kaɪt/", "vietnamese": "cái diều", "emoji": "🪁", "age_group": "preschool"},
    {"word": "home", "ipa": "/həʊm/", "vietnamese": "ngôi nhà", "emoji": "🏠", "age_group": "preschool"},
    {"word": "shoes", "ipa": "/ʃuːz/", "vietnamese": "đôi giày", "emoji": "👟", "age_group": "preschool"},
    {"word": "strawberry", "ipa": "/ˈstrɔː.bər.i/", "vietnamese": "quả dâu tây", "emoji": "🍓", "age_group": "preschool"},
    {"word": "bus", "ipa": "/bʌs/", "vietnamese": "xe buýt", "emoji": "🚌", "age_group": "preschool"},
    {"word": "truck", "ipa": "/trʌk/", "vietnamese": "xe tải", "emoji": "🚚", "age_group": "preschool"},

    # Primary (25 items)
    {"word": "lion", "ipa": "/ˈlaɪ.ən/", "vietnamese": "sư tử", "emoji": "🦁", "age_group": "primary"},
    {"word": "elephant", "ipa": "/ˈel.ɪ.fənt/", "vietnamese": "con voi", "emoji": "🐘", "age_group": "primary"},
    {"word": "plane", "ipa": "/pleɪn/", "vietnamese": "máy bay", "emoji": "✈️", "age_group": "primary"},
    {"word": "bag", "ipa": "/bæɡ/", "vietnamese": "cặp sách", "emoji": "🎒", "age_group": "primary"},
    {"word": "pencil", "ipa": "/ˈpen.səl/", "vietnamese": "bút chì", "emoji": "✏️", "age_group": "primary"},
    {"word": "dinosaur", "ipa": "/ˈdaɪ.nə.sɔːr/", "vietnamese": "khủng long", "emoji": "🦖", "age_group": "primary"},
    {"word": "monkey", "ipa": "/ˈmʌŋ.ki/", "vietnamese": "con khỉ", "emoji": "🐒", "age_group": "primary"},
    {"word": "parrot", "ipa": "/ˈpær.ət/", "vietnamese": "con vẹt", "emoji": "🦜", "age_group": "primary"},
    {"word": "watermelon", "ipa": "/ˈwɔː.tə.mel.ən/", "vietnamese": "dưa hấu", "emoji": "🍉", "age_group": "primary"},
    {"word": "tiger", "ipa": "/ˈtaɪ.ɡər/", "vietnamese": "con hổ", "emoji": "🐯", "age_group": "primary"},
    {"word": "rabbit", "ipa": "/ˈræb.ɪt/", "vietnamese": "con thỏ", "emoji": "🐰", "age_group": "primary"},
    {"word": "chicken", "ipa": "/ˈtʃɪk.ɪn/", "vietnamese": "con gà", "emoji": "🐔", "age_group": "primary"},
    {"word": "school", "ipa": "/skuːl/", "vietnamese": "trường học", "emoji": "🏫", "age_group": "primary"},
    {"word": "bicycle", "ipa": "/ˈbaɪ.sɪ.kəl/", "vietnamese": "xe đạp", "emoji": "🚲", "age_group": "primary"},
    {"word": "train", "ipa": "/treɪn/", "vietnamese": "tàu hoả", "emoji": "🚂", "age_group": "primary"},
    {"word": "boat", "ipa": "/bəʊt/", "vietnamese": "thuyền", "emoji": "⛵", "age_group": "primary"},
    {"word": "spider", "ipa": "/ˈspaɪ.dər/", "vietnamese": "con nhện", "emoji": "🕷️", "age_group": "primary"},
    {"word": "butterfly", "ipa": "/ˈbʌt.ə.flaɪ/", "vietnamese": "con bướm", "emoji": "🦋", "age_group": "primary"},
    {"word": "octopus", "ipa": "/ˈɒk.tə.pəs/", "vietnamese": "bạch tuộc", "emoji": "🐙", "age_group": "primary"},
    {"word": "dolphin", "ipa": "/ˈdɒl.fɪn/", "vietnamese": "cá heo", "emoji": "🐬", "age_group": "primary"},
    {"word": "shark", "ipa": "/ʃɑːk/", "vietnamese": "cá mập", "emoji": "🦈", "age_group": "primary"},
    {"word": "violin", "ipa": "/ˌvaɪəˈlɪn/", "vietnamese": "đàn vĩ cầm", "emoji": "🎻", "age_group": "primary"},
    {"word": "guitar", "ipa": "/ɡɪˈtɑːr/", "vietnamese": "đàn ghi-ta", "emoji": "🎸", "age_group": "primary"},
    {"word": "drum", "ipa": "/drʌm/", "vietnamese": "cái trống", "emoji": "🥁", "age_group": "primary"},
    {"word": "umbrella", "ipa": "/ʌmˈbrel.ə/", "vietnamese": "cái ô", "emoji": "☂️", "age_group": "primary"},
]

# 10 Child-Friendly Stories for game_stories
STORIES_DATA = [
    {
        "id": "ant_bird",
        "title_en": "The Helpful Ant",
        "title_vi": "Chú kiến tốt bụng",
        "text_en": "A small ant fell into the water. A beautiful bird dropped a green leaf to save the ant. They were very happy.",
        "text_vi": "Một chú kiến nhỏ bị ngã xuống nước. Một chú chim xinh đẹp đã thả một chiếc lá xanh xuống để cứu chú kiến. Họ đã rất vui vẻ.",
        "template": "A small {blank_0} fell into the {blank_1}. A beautiful {blank_2} dropped a green {blank_3} to save the ant. They were very {blank_4}.",
        "blanks": [
            {"index": 0, "word": "ant", "vietnameseHint": "con kiến", "ipa": "/ænt/"},
            {"index": 1, "word": "water", "vietnameseHint": "nước", "ipa": "/ˈwɔː.tər/"},
            {"index": 2, "word": "bird", "vietnameseHint": "con chim", "ipa": "/bɜːd/"},
            {"index": 3, "word": "leaf", "vietnameseHint": "chiếc lá", "ipa": "/liːf/"},
            {"index": 4, "word": "happy", "vietnameseHint": "vui vẻ", "ipa": "/ˈhæp.i/"}
        ]
    },
    {
        "id": "fox_grapes",
        "title_en": "The Hungry Fox",
        "title_vi": "Con cáo đói bụng",
        "text_en": "A hungry fox saw some sweet grapes. The grapes were high on the tree. The fox jumped but could not reach them.",
        "text_vi": "Một con cáo đói bụng nhìn thấy những quả nho ngọt ngào. Chùm nho ở tít trên cao của cái cây. Con cáo đã nhảy lên nhưng không thể chạm tới.",
        "template": "A hungry {blank_0} saw some sweet {blank_1}. The grapes were high on the {blank_2}. The fox {blank_3} but could not reach them.",
        "blanks": [
            {"index": 0, "word": "fox", "vietnameseHint": "con cáo", "ipa": "/fɒks/"},
            {"index": 1, "word": "grapes", "vietnameseHint": "quả nho", "ipa": "/ɡreɪps/"},
            {"index": 2, "word": "tree", "vietnameseHint": "cái cây", "ipa": "/triː/"},
            {"index": 3, "word": "jumped", "vietnameseHint": "đã nhảy", "ipa": "/dʒʌmpt/"}
        ]
    },
    {
        "id": "golden_fish",
        "title_en": "The Golden Fish",
        "title_vi": "Chú cá vàng",
        "text_en": "A little boy found a golden fish in the sea. The fish said thank you and gave him a bright star.",
        "text_vi": "Một cậu bé nhỏ tìm thấy một chú cá vàng dưới biển. Chú cá nói lời cảm ơn và tặng cậu một ngôi sao sáng lấp lánh.",
        "template": "A little {blank_0} found a golden {blank_1} in the {blank_2}. The fish said thank you and gave him a bright {blank_3}.",
        "blanks": [
            {"index": 0, "word": "boy", "vietnameseHint": "cậu bé", "ipa": "/bɔɪ/"},
            {"index": 1, "word": "fish", "vietnameseHint": "con cá", "ipa": "/fɪʃ/"},
            {"index": 2, "word": "sea", "vietnameseHint": "biển", "ipa": "/siː/"},
            {"index": 3, "word": "star", "vietnameseHint": "ngôi sao", "ipa": "/stɑːr/"}
        ]
    },
    {
        "id": "sleepy_bear",
        "title_en": "The Sleepy Bear",
        "title_vi": "Chú gấu buồn ngủ",
        "text_en": "A brown bear sat under a big tree. He ate sweet honey and wanted to sleep. A soft wind blew.",
        "text_vi": "Một chú gấu nâu ngồi dưới một cái cây lớn. Chú ăn mật ong ngọt ngào và muốn đi ngủ. Một làn gió nhẹ thổi qua.",
        "template": "A brown {blank_0} sat under a big {blank_1}. He ate sweet {blank_2} and wanted to {blank_3}. A soft {blank_4} blew.",
        "blanks": [
            {"index": 0, "word": "bear", "vietnameseHint": "con gấu", "ipa": "/beər/"},
            {"index": 1, "word": "tree", "vietnameseHint": "cái cây", "ipa": "/triː/"},
            {"index": 2, "word": "honey", "vietnameseHint": "mật ong", "ipa": "/ˈhʌn.i/"},
            {"index": 3, "word": "sleep", "vietnameseHint": "đi ngủ", "ipa": "/sliːp/"},
            {"index": 4, "word": "wind", "vietnameseHint": "gió", "ipa": "/wɪnd/"}
        ]
    },
    {
        "id": "magic_seed",
        "title_en": "The Magic Tree",
        "title_vi": "Cây thần kì",
        "text_en": "A cute rabbit found a magic seed in the garden. She planted it in the dark soil. A tall tree grew.",
        "text_vi": "Một chú thỏ dễ thương tìm thấy một hạt giống thần kì trong vườn. Chú gieo nó xuống đất tối. Một cái cây cao đã mọc lên.",
        "template": "A cute {blank_0} found a magic {blank_1} in the {blank_2}. She planted it in the dark {blank_3}. A tall {blank_4} grew.",
        "blanks": [
            {"index": 0, "word": "rabbit", "vietnameseHint": "con thỏ", "ipa": "/ˈræb.ɪt/"},
            {"index": 1, "word": "seed", "vietnameseHint": "hạt giống", "ipa": "/siːd/"},
            {"index": 2, "word": "garden", "vietnameseHint": "khu vườn", "ipa": "/ˈɡɑː.dən/"},
            {"index": 3, "word": "soil", "vietnameseHint": "đất", "ipa": "/sɔɪl/"},
            {"index": 4, "word": "tree", "vietnameseHint": "cái cây", "ipa": "/triː/"}
        ]
    },
    {
        "id": "brave_turtle",
        "title_en": "The Brave Turtle",
        "title_vi": "Chú rùa dũng cảm",
        "text_en": "A green turtle walked to the sunny beach. He saw a blue shell near the water. He was very proud.",
        "text_vi": "Một chú rùa xanh đi bộ đến bãi biển đầy nắng. Chú thấy một chiếc vỏ ốc màu xanh lam ở gần nước. Chú đã rất tự hào.",
        "template": "A green {blank_0} walked to the sunny {blank_1}. He saw a blue {blank_2} near the {blank_3}. He was very {blank_4}.",
        "blanks": [
            {"index": 0, "word": "turtle", "vietnameseHint": "con rùa", "ipa": "/ˈtɜː.təl/"},
            {"index": 1, "word": "beach", "vietnameseHint": "bãi biển", "ipa": "/biːtʃ/"},
            {"index": 2, "word": "shell", "vietnameseHint": "vỏ ốc", "ipa": "/ʃel/"},
            {"index": 3, "word": "water", "vietnameseHint": "nước", "ipa": "/ˈwɔː.tər/"},
            {"index": 4, "word": "proud", "vietnameseHint": "tự hào", "ipa": "/praʊd/"}
        ]
    },
    {
        "id": "clever_crow",
        "title_en": "The Clever Crow",
        "title_vi": "Chú quạ thông minh",
        "text_en": "A thirsty crow saw a small pitcher. The water was very low. The crow dropped small stones to make the water rise.",
        "text_vi": "Một chú quạ đang khát nước nhìn thấy một chiếc bình nhỏ. Nước trong bình rất thấp. Chú quạ đã thả những viên đá nhỏ để nước dâng lên.",
        "template": "A thirsty {blank_0} saw a small pitcher. The {blank_1} was very low. The crow dropped small {blank_2} to make the water {blank_3}.",
        "blanks": [
            {"index": 0, "word": "crow", "vietnameseHint": "con quạ", "ipa": "/krəʊ/"},
            {"index": 1, "word": "water", "vietnameseHint": "nước", "ipa": "/ˈwɔː.tər/"},
            {"index": 2, "word": "stones", "vietnameseHint": "những viên đá", "ipa": "/stəʊnz/"},
            {"index": 3, "word": "rise", "vietnameseHint": "dâng lên", "ipa": "/raɪz/"}
        ]
    },
    {
        "id": "proud_lion",
        "title_en": "The Lion and the Mouse",
        "title_vi": "Chú sư tử tốt bụng",
        "text_en": "A big lion was sleeping. A small mouse ran on him. The lion caught the mouse but let him go. Later the mouse saved the lion.",
        "text_vi": "Một chú sư tử lớn đang ngủ. Một chú chuột nhỏ chạy qua người chú. Sư tử đã bắt lấy chuột nhưng lại thả đi. Sau này chuột đã cứu sư tử.",
        "template": "A big {blank_0} was sleeping. A small {blank_1} ran on him. The lion caught the mouse but let him {blank_2}. Later the mouse {blank_3} the lion.",
        "blanks": [
            {"index": 0, "word": "lion", "vietnameseHint": "sư tử", "ipa": "/ˈlaɪ.ən/"},
            {"index": 1, "word": "mouse", "vietnameseHint": "con chuột", "ipa": "/maʊs/"},
            {"index": 2, "word": "go", "vietnameseHint": "đi", "ipa": "/ɡəʊ/"},
            {"index": 3, "word": "saved", "vietnameseHint": "đã cứu", "ipa": "/seɪvd/"}
        ]
    },
    {
        "id": "busy_bee",
        "title_en": "The Busy Bee",
        "title_vi": "Chú ong chăm chỉ",
        "text_en": "A little bee flew in the garden. She collected sweet nectar from a yellow flower. She made sweet honey for the hive.",
        "text_vi": "Một chú ong nhỏ bay trong vườn. Chú hút mật ngọt từ một bông hoa màu vàng. Chú làm mật ong ngọt ngào cho tổ.",
        "template": "A little {blank_0} flew in the {blank_1}. She collected sweet nectar from a yellow {blank_2}. She made sweet {blank_3} for the hive.",
        "blanks": [
            {"index": 0, "word": "bee", "vietnameseHint": "con ong", "ipa": "/biː/"},
            {"index": 1, "word": "garden", "vietnameseHint": "khu vườn", "ipa": "/ˈɡɑː.dən/"},
            {"index": 2, "word": "flower", "vietnameseHint": "bông hoa", "ipa": "/ˈflaʊ.ər/"},
            {"index": 3, "word": "honey", "vietnameseHint": "mật ong", "ipa": "/ˈhʌn.i/"}
        ]
    },
    {
        "id": "lost_puppy",
        "title_en": "The Lost Puppy",
        "title_vi": "Chú cún đi lạc",
        "text_en": "A cute puppy lost his way home. A kind girl found him near the park. She gave him warm milk and they played together.",
        "text_vi": "Một chú cún dễ thương bị lạc đường về nhà. Một cô bé tốt bụng đã tìm thấy chú ở gần công viên. Cô cho chú uống sữa ấm và họ cùng chơi đùa.",
        "template": "A cute {blank_0} lost his way {blank_1}. A kind {blank_2} found him near the park. She gave him warm {blank_3} and they played together.",
        "blanks": [
            {"index": 0, "word": "puppy", "vietnameseHint": "chó con", "ipa": "/ˈpʌp.i/"},
            {"index": 1, "word": "home", "vietnameseHint": "nhà", "ipa": "/həʊm/"},
            {"index": 2, "word": "girl", "vietnameseHint": "cô bé", "ipa": "/ɡɜːl/"},
            {"index": 3, "word": "milk", "vietnameseHint": "sữa", "ipa": "/mɪlk/"}
        ]
    }
]

def seed_games():
    print("Starting database seeding for Game Zone assets...")
    with psycopg2.connect(settings.db_dsn) as connection:
        with connection.cursor() as cursor:
            # 1. Seed Flashcards
            print(f"Seeding {len(FLASHCARDS_DATA)} game flashcards...")
            for f in FLASHCARDS_DATA:
                cursor.execute(
                    """
                    INSERT INTO game_flashcards (word, ipa, vietnamese, emoji, age_group)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (word) DO UPDATE
                    SET ipa = EXCLUDED.ipa,
                        vietnamese = EXCLUDED.vietnamese,
                        emoji = EXCLUDED.emoji,
                        age_group = EXCLUDED.age_group,
                        updated_at = NOW()
                    """,
                    (f["word"], f["ipa"], f["vietnamese"], f["emoji"], f["age_group"])
                )
            
            # 2. Seed Stories
            print(f"Seeding {len(STORIES_DATA)} game stories...")
            for s in STORIES_DATA:
                cursor.execute(
                    """
                    INSERT INTO game_stories (id, title_en, title_vi, text_en, text_vi, template, blanks)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO UPDATE
                    SET title_en = EXCLUDED.title_en,
                        title_vi = EXCLUDED.title_vi,
                        text_en = EXCLUDED.text_en,
                        text_vi = EXCLUDED.text_vi,
                        template = EXCLUDED.template,
                        blanks = EXCLUDED.blanks,
                        updated_at = NOW()
                    """,
                    (s["id"], s["title_en"], s["title_vi"], s["text_en"], s["text_vi"], s["template"], Json(s["blanks"]))
                )
                
            connection.commit()
    print("Game Zone database seeding completed successfully!")

if __name__ == "__main__":
    seed_games()
