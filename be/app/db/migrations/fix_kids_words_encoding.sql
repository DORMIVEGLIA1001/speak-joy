-- Fix corrupted UTF-8 encoding for all kids-level words.
-- Re-applies correct Vietnamese text, IPA, and emoji for all kids_ words.
-- Safe to run multiple times (idempotent UPDATE).

UPDATE words SET
    vietnamese = 'con chó',
    ipa = '/dɒɡ/',
    icon = '🐶'
WHERE id = 'kids_dog';

UPDATE words SET
    vietnamese = 'con mèo',
    ipa = '/kæt/',
    icon = '🐱'
WHERE id = 'kids_cat';

UPDATE words SET
    vietnamese = 'con chim',
    ipa = '/bɜːd/',
    icon = '🐦'
WHERE id = 'kids_bird';

UPDATE words SET
    vietnamese = 'con cá',
    ipa = '/fɪʃ/',
    icon = '🐟'
WHERE id = 'kids_fish';

UPDATE words SET
    vietnamese = 'con gấu',
    ipa = '/beər/',
    icon = '🐻'
WHERE id = 'kids_bear';

UPDATE words SET
    vietnamese = 'con thỏ',
    ipa = '/ˈræbɪt/',
    icon = '🐰'
WHERE id = 'kids_rabbit';

UPDATE words SET
    vietnamese = 'con lợn',
    ipa = '/pɪɡ/',
    icon = '🐷'
WHERE id = 'kids_pig';

UPDATE words SET
    vietnamese = 'con bò',
    ipa = '/kaʊ/',
    icon = '🐮'
WHERE id = 'kids_cow';

UPDATE words SET
    vietnamese = 'con vịt',
    ipa = '/dʌk/',
    icon = '🦆'
WHERE id = 'kids_duck';

UPDATE words SET
    vietnamese = 'con sư tử',
    ipa = '/ˈlaɪən/',
    icon = '🦁'
WHERE id = 'kids_lion';

UPDATE words SET
    vietnamese = 'con khỉ',
    ipa = '/ˈmʌŋki/',
    icon = '🐵'
WHERE id = 'kids_monkey';

UPDATE words SET
    vietnamese = 'con ếch',
    ipa = '/frɒɡ/',
    icon = '🐸'
WHERE id = 'kids_frog';

UPDATE words SET
    vietnamese = 'con ong',
    ipa = '/biː/',
    icon = '🐝'
WHERE id = 'kids_bee';

UPDATE words SET
    vietnamese = 'con rùa',
    ipa = '/ˈtɜːtl/',
    icon = '🐢'
WHERE id = 'kids_turtle';

UPDATE words SET
    vietnamese = 'con gấu trúc',
    ipa = '/ˈpændə/',
    icon = '🐼'
WHERE id = 'kids_panda';

UPDATE words SET
    vietnamese = 'quả bóng',
    ipa = '/bɔːl/',
    icon = '⚽'
WHERE id = 'kids_ball';

UPDATE words SET
    vietnamese = 'búp bê',
    ipa = '/dɒl/',
    icon = '👧'
WHERE id = 'kids_doll';

UPDATE words SET
    vietnamese = 'ô tô đồ chơi',
    ipa = '/kɑːr/',
    icon = '🚗'
WHERE id = 'kids_car';

UPDATE words SET
    vietnamese = 'quả bóng bay',
    ipa = '/bəˈluːn/',
    icon = '🎈'
WHERE id = 'kids_balloon';

UPDATE words SET
    vietnamese = 'tàu hỏa đồ chơi',
    ipa = '/treɪn/',
    icon = '🚂'
WHERE id = 'kids_train';

UPDATE words SET
    vietnamese = 'người máy đồ chơi',
    ipa = '/ˈroʊbɒt/',
    icon = '🤖'
WHERE id = 'kids_robot';

UPDATE words SET
    vietnamese = 'khối xếp hình',
    ipa = '/blɒk/',
    icon = '🧱'
WHERE id = 'kids_block';

UPDATE words SET
    vietnamese = 'cái diều',
    ipa = '/kaɪt/',
    icon = '🪁'
WHERE id = 'kids_kite';

UPDATE words SET
    vietnamese = 'gấu bông',
    ipa = '/ˈtedi/',
    icon = '🧸'
WHERE id = 'kids_teddy';

UPDATE words SET
    vietnamese = 'thuyền đồ chơi',
    ipa = '/boʊt/',
    icon = '⛵'
WHERE id = 'kids_boat';

UPDATE words SET
    vietnamese = 'cái trống đồ chơi',
    ipa = '/drʌm/',
    icon = '🥁'
WHERE id = 'kids_drum';

UPDATE words SET
    vietnamese = 'trò chơi ghép hình',
    ipa = '/ˈpʌzl/',
    icon = '🧩'
WHERE id = 'kids_puzzle';

UPDATE words SET
    vietnamese = 'màu đỏ',
    ipa = '/red/',
    icon = '🔴'
WHERE id = 'kids_red';

UPDATE words SET
    vietnamese = 'màu xanh dương',
    ipa = '/bluː/',
    icon = '🔵'
WHERE id = 'kids_blue';

UPDATE words SET
    vietnamese = 'màu xanh lá',
    ipa = '/ɡriːn/',
    icon = '🟢'
WHERE id = 'kids_green';

UPDATE words SET
    vietnamese = 'màu vàng',
    ipa = '/ˈjeloʊ/',
    icon = '🟡'
WHERE id = 'kids_yellow';

UPDATE words SET
    vietnamese = 'màu hồng',
    ipa = '/pɪŋk/',
    icon = '🌸'
WHERE id = 'kids_pink';

UPDATE words SET
    vietnamese = 'màu cam',
    ipa = '/ˈɒrɪndʒ/',
    icon = '🟠'
WHERE id = 'kids_orange';

UPDATE words SET
    vietnamese = 'màu tím',
    ipa = '/ˈpɜːpl/',
    icon = '🟣'
WHERE id = 'kids_purple';

UPDATE words SET
    vietnamese = 'màu trắng',
    ipa = '/waɪt/',
    icon = '⚪'
WHERE id = 'kids_white';

UPDATE words SET
    vietnamese = 'màu đen',
    ipa = '/blæk/',
    icon = '⚫'
WHERE id = 'kids_black';

UPDATE words SET
    vietnamese = 'màu nâu',
    ipa = '/braʊn/',
    icon = '🟤'
WHERE id = 'kids_brown';

UPDATE words SET
    vietnamese = 'mắt',
    ipa = '/aɪ/',
    icon = '👁️'
WHERE id = 'kids_eye';

UPDATE words SET
    vietnamese = 'mũi',
    ipa = '/noʊz/',
    icon = '👃'
WHERE id = 'kids_nose';

UPDATE words SET
    vietnamese = 'miệng',
    ipa = '/maʊθ/',
    icon = '👄'
WHERE id = 'kids_mouth';

UPDATE words SET
    vietnamese = 'tai',
    ipa = '/ɪər/',
    icon = '👂'
WHERE id = 'kids_ear';

UPDATE words SET
    vietnamese = 'bàn tay',
    ipa = '/hænd/',
    icon = '✋'
WHERE id = 'kids_hand';

UPDATE words SET
    vietnamese = 'bàn chân',
    ipa = '/fʊt/',
    icon = '🦶'
WHERE id = 'kids_foot';

UPDATE words SET
    vietnamese = 'đầu',
    ipa = '/hed/',
    icon = '👶'
WHERE id = 'kids_head';

UPDATE words SET
    vietnamese = 'ngón tay',
    ipa = '/ˈfɪŋɡər/',
    icon = '☝️'
WHERE id = 'kids_finger';

UPDATE words SET
    vietnamese = 'tóc',
    ipa = '/heər/',
    icon = '💇'
WHERE id = 'kids_hair';

UPDATE words SET
    vietnamese = 'cánh tay',
    ipa = '/ɑːm/',
    icon = '💪'
WHERE id = 'kids_arm';

UPDATE words SET
    vietnamese = 'chân',
    ipa = '/leɡ/',
    icon = '🦵'
WHERE id = 'kids_leg';

UPDATE words SET
    vietnamese = 'ngón chân',
    ipa = '/toʊ/',
    icon = '🦶'
WHERE id = 'kids_toe';

UPDATE words SET
    vietnamese = 'bố, ba',
    ipa = '/dæd/',
    icon = '👨'
WHERE id = 'kids_dad';

UPDATE words SET
    vietnamese = 'mẹ, má',
    ipa = '/mɒm/',
    icon = '👩'
WHERE id = 'kids_mom';

UPDATE words SET
    vietnamese = 'em bé',
    ipa = '/ˈbeɪbi/',
    icon = '👶'
WHERE id = 'kids_baby';

UPDATE words SET
    vietnamese = 'chị, em gái',
    ipa = '/ˈsɪstər/',
    icon = '👧'
WHERE id = 'kids_sister';

UPDATE words SET
    vietnamese = 'anh, em trai',
    ipa = '/ˈbrʌðər/',
    icon = '👦'
WHERE id = 'kids_brother';

UPDATE words SET
    vietnamese = 'gia đình',
    ipa = '/ˈfæməli/',
    icon = '🏠'
WHERE id = 'kids_family';

UPDATE words SET
    vietnamese = 'sữa',
    ipa = '/mɪlk/',
    icon = '🥛'
WHERE id = 'kids_milk';

UPDATE words SET
    vietnamese = 'quả táo',
    ipa = '/ˈæpl/',
    icon = '🍎'
WHERE id = 'kids_apple';

UPDATE words SET
    vietnamese = 'quả chuối',
    ipa = '/bəˈnænə/',
    icon = '🍌'
WHERE id = 'kids_banana';

UPDATE words SET
    vietnamese = 'bánh mì',
    ipa = '/bred/',
    icon = '🍞'
WHERE id = 'kids_bread';

UPDATE words SET
    vietnamese = 'quả trứng',
    ipa = '/eɡ/',
    icon = '🥚'
WHERE id = 'kids_egg';

UPDATE words SET
    vietnamese = 'bánh ngọt',
    ipa = '/keɪk/',
    icon = '🍰'
WHERE id = 'kids_cake';

UPDATE words SET
    vietnamese = 'nước lọc',
    ipa = '/ˈwɔːtər/',
    icon = '💧'
WHERE id = 'kids_water';

UPDATE words SET
    vietnamese = 'kẹo ngọt',
    ipa = '/sw iːt/',
    icon = '🍬'
WHERE id = 'kids_sweet';

UPDATE words SET
    vietnamese = 'củ cà rốt',
    ipa = '/ˈkærət/',
    icon = '🥕'
WHERE id = 'kids_carrot';

UPDATE words SET
    vietnamese = 'cơm, gạo',
    ipa = '/raɪs/',
    icon = '🍚'
WHERE id = 'kids_rice';

UPDATE words SET
    vietnamese = 'nước ép quả',
    ipa = '/dʒuːs/',
    icon = '🍊'
WHERE id = 'kids_juice';

UPDATE words SET
    vietnamese = 'bánh quy',
    ipa = '/ˈkʊki/',
    icon = '🍪'
WHERE id = 'kids_cookie';

UPDATE words SET
    vietnamese = 'mặt trời',
    ipa = '/sʌn/',
    icon = '☀️'
WHERE id = 'kids_sun';

UPDATE words SET
    vietnamese = 'mặt trăng',
    ipa = '/muːn/',
    icon = '🌙'
WHERE id = 'kids_moon';

UPDATE words SET
    vietnamese = 'ngôi sao',
    ipa = '/stɑːr/',
    icon = '⭐'
WHERE id = 'kids_star';

UPDATE words SET
    vietnamese = 'bông hoa',
    ipa = '/ˈflaʊər/',
    icon = '🌸'
WHERE id = 'kids_flower';

UPDATE words SET
    vietnamese = 'cây xanh',
    ipa = '/triː/',
    icon = '🌳'
WHERE id = 'kids_tree';

UPDATE words SET
    vietnamese = 'mưa',
    ipa = '/reɪn/',
    icon = '🌧️'
WHERE id = 'kids_rain';

UPDATE words SET
    vietnamese = 'bầu trời',
    ipa = '/skaɪ/',
    icon = '☁️'
WHERE id = 'kids_sky';

UPDATE words SET
    vietnamese = 'đám mây',
    ipa = '/klaʊd/',
    icon = '☁️'
WHERE id = 'kids_cloud';

UPDATE words SET
    vietnamese = 'gió',
    ipa = '/wɪnd/',
    icon = '💨'
WHERE id = 'kids_wind';

UPDATE words SET
    vietnamese = 'thảm cỏ',
    ipa = '/ɡrɑːs/',
    icon = '🌱'
WHERE id = 'kids_grass';

UPDATE words SET
    vietnamese = 'chạy',
    ipa = '/rʌn/',
    icon = '🏃'
WHERE id = 'kids_run';

UPDATE words SET
    vietnamese = 'nhảy lò cò, nhảy',
    ipa = '/dʒʌmp/',
    icon = '🦘'
WHERE id = 'kids_jump';

UPDATE words SET
    vietnamese = 'hát',
    ipa = '/sɪŋ/',
    icon = '🎤'
WHERE id = 'kids_sing';

UPDATE words SET
    vietnamese = 'nhảy múa',
    ipa = '/dæns/',
    icon = '💃'
WHERE id = 'kids_dance';

UPDATE words SET
    vietnamese = 'vui chơi',
    ipa = '/pleɪ/',
    icon = '🧸'
WHERE id = 'kids_play';

UPDATE words SET
    vietnamese = 'ngủ',
    ipa = '/sliːp/',
    icon = '😴'
WHERE id = 'kids_sleep';

UPDATE words SET
    vietnamese = 'ăn',
    ipa = '/iːt/',
    icon = '😋'
WHERE id = 'kids_eat';

UPDATE words SET
    vietnamese = 'uống',
    ipa = '/drɪŋk/',
    icon = '🥛'
WHERE id = 'kids_drink';

UPDATE words SET
    vietnamese = 'đi bộ',
    ipa = '/wɔːk/',
    icon = '🚶'
WHERE id = 'kids_walk';

UPDATE words SET
    vietnamese = 'ôm yêu thương',
    ipa = '/hʌɡ/',
    icon = '🤗'
WHERE id = 'kids_hug';

UPDATE words SET
    vietnamese = 'nhìn, xem',
    ipa = '/lʊk/',
    icon = '👀'
WHERE id = 'kids_look';

UPDATE words SET
    vietnamese = 'cuốn sách',
    ipa = '/bʊk/',
    icon = '📖'
WHERE id = 'kids_book';

UPDATE words SET
    vietnamese = 'bút vẽ',
    ipa = '/pen/',
    icon = '🖊️'
WHERE id = 'kids_pen';

UPDATE words SET
    vietnamese = 'chiếc giường',
    ipa = '/bed/',
    icon = '🛏️'
WHERE id = 'kids_bed';

UPDATE words SET
    vietnamese = 'cái ghế',
    ipa = '/tʃeər/',
    icon = '🪑'
WHERE id = 'kids_chair';

UPDATE words SET
    vietnamese = 'cái bàn',
    ipa = '/ˈteɪbl/',
    icon = '🟫'
WHERE id = 'kids_table';

UPDATE words SET
    vietnamese = 'cái cốc',
    ipa = '/kʌp/',
    icon = '🥤'
WHERE id = 'kids_cup';

UPDATE words SET
    vietnamese = 'ba lô, túi xách',
    ipa = '/bæɡ/',
    icon = '🎒'
WHERE id = 'kids_bag';

UPDATE words SET
    vietnamese = 'cái mũ',
    ipa = '/hæt/',
    icon = '🎩'
WHERE id = 'kids_hat';

UPDATE words SET
    vietnamese = 'chiếc giày',
    ipa = '/ʃuː/',
    icon = '👟'
WHERE id = 'kids_shoe';

UPDATE words SET
    vietnamese = 'đồng hồ',
    ipa = '/klɒk/',
    icon = '⏰'
WHERE id = 'kids_clock';

UPDATE words SET
    vietnamese = 'chìa khóa',
    ipa = '/kiː/',
    icon = '🔑'
WHERE id = 'kids_key';

UPDATE words SET
    vietnamese = 'ngôi nhà',
    ipa = '/haʊs/',
    icon = '🏠'
WHERE id = 'kids_house';

UPDATE words SET
    vietnamese = 'ngủ',
    ipa = '/sliːp/',
    icon = '😴'
WHERE id = 'kids_act_sleep';

UPDATE words SET
    vietnamese = 'ăn',
    ipa = '/iːt/',
    icon = '🍎'
WHERE id = 'kids_act_eat';

UPDATE words SET
    vietnamese = 'uống',
    ipa = '/drɪŋk/',
    icon = '🥛'
WHERE id = 'kids_act_drink';

UPDATE words SET
    vietnamese = 'rửa/tắm',
    ipa = '/wɒʃ/',
    icon = '🧼'
WHERE id = 'kids_act_wash';

UPDATE words SET
    vietnamese = 'chải/đánh răng',
    ipa = '/brʌʃ/',
    icon = '🪥'
WHERE id = 'kids_act_brush';

UPDATE words SET
    vietnamese = 'thức dậy',
    ipa = '/weɪk ʌp/',
    icon = '☀️'
WHERE id = 'kids_act_wake_up';

UPDATE words SET
    vietnamese = 'mặc quần áo',
    ipa = '/dres/',
    icon = '👕'
WHERE id = 'kids_act_dress';

UPDATE words SET
    vietnamese = 'chải tóc',
    ipa = '/kəʊm/',
    icon = '🪮'
WHERE id = 'kids_act_comb';

UPDATE words SET
    vietnamese = 'tắm bồn',
    ipa = '/bɑːθ/',
    icon = '🛁'
WHERE id = 'kids_act_bath';

UPDATE words SET
    vietnamese = 'ngáp',
    ipa = '/jɔːn/',
    icon = '🥱'
WHERE id = 'kids_act_yawn';

UPDATE words SET
    vietnamese = 'hét to',
    ipa = '/ʃaʊt/',
    icon = '🗣️'
WHERE id = 'kids_act_shout';

UPDATE words SET
    vietnamese = 'thì thầm',
    ipa = '/ˈwɪs.pər/',
    icon = '🤫'
WHERE id = 'kids_act_whisper';

UPDATE words SET
    vietnamese = 'lau dọn/quét',
    ipa = '/kliːn/',
    icon = '🧹'
WHERE id = 'kids_act_clean';

UPDATE words SET
    vietnamese = 'quét nhà',
    ipa = '/swiːp/',
    icon = '🧹'
WHERE id = 'kids_act_sweep';

UPDATE words SET
    vietnamese = 'rót/đổ nước',
    ipa = '/pɔːr/',
    icon = '🫗'
WHERE id = 'kids_act_pour';

UPDATE words SET
    vietnamese = 'gấp/xếp',
    ipa = '/fəʊld/',
    icon = '🧺'
WHERE id = 'kids_act_fold';

UPDATE words SET
    vietnamese = 'trộn/khuấy',
    ipa = '/mɪks/',
    icon = '🥣'
WHERE id = 'kids_act_mix';

UPDATE words SET
    vietnamese = 'nấu ăn',
    ipa = '/kʊk/',
    icon = '🍳'
WHERE id = 'kids_act_cook';

UPDATE words SET
    vietnamese = 'mặc/đội/đeo',
    ipa = '/weər/',
    icon = '👒'
WHERE id = 'kids_act_wear';

UPDATE words SET
    vietnamese = 'giúp đỡ',
    ipa = '/help/',
    icon = '🤝'
WHERE id = 'kids_act_help';

UPDATE words SET
    vietnamese = 'chạy',
    ipa = '/rʌn/',
    icon = '🏃'
WHERE id = 'kids_act_run';

UPDATE words SET
    vietnamese = 'nhảy',
    ipa = '/dʒʌmp/',
    icon = '🦘'
WHERE id = 'kids_act_jump';

UPDATE words SET
    vietnamese = 'đi bộ',
    ipa = '/wɔːk/',
    icon = '🚶'
WHERE id = 'kids_act_walk';

UPDATE words SET
    vietnamese = 'bơi',
    ipa = '/swɪm/',
    icon = '🏊'
WHERE id = 'kids_act_swim';

UPDATE words SET
    vietnamese = 'bay',
    ipa = '/flaɪ/',
    icon = '🦅'
WHERE id = 'kids_act_fly';

UPDATE words SET
    vietnamese = 'hát',
    ipa = '/sɪŋ/',
    icon = '🎤'
WHERE id = 'kids_act_sing';

UPDATE words SET
    vietnamese = 'nhảy múa',
    ipa = '/dɑːns/',
    icon = '💃'
WHERE id = 'kids_act_dance';

UPDATE words SET
    vietnamese = 'leo trèo',
    ipa = '/klaɪm/',
    icon = '🧗'
WHERE id = 'kids_act_climb';

UPDATE words SET
    vietnamese = 'vỗ tay',
    ipa = '/klæp/',
    icon = '👏'
WHERE id = 'kids_act_clap';

UPDATE words SET
    vietnamese = 'chơi đùa',
    ipa = '/pleɪ/',
    icon = '🧸'
WHERE id = 'kids_act_play';

UPDATE words SET
    vietnamese = 'nhảy lò cò',
    ipa = '/hɒp/',
    icon = '🐸'
WHERE id = 'kids_act_hop';

UPDATE words SET
    vietnamese = 'vẫy tay',
    ipa = '/weɪv/',
    icon = '👋'
WHERE id = 'kids_act_wave';

UPDATE words SET
    vietnamese = 'trượt',
    ipa = '/slaɪd/',
    icon = '🛝'
WHERE id = 'kids_act_slide';

UPDATE words SET
    vietnamese = 'chơi xích đu',
    ipa = '/swɪŋ/',
    icon = '🎡'
WHERE id = 'kids_act_swing';

UPDATE words SET
    vietnamese = 'cưỡi/đi xe',
    ipa = '/raɪd/',
    icon = '🚲'
WHERE id = 'kids_act_ride';

UPDATE words SET
    vietnamese = 'xoay tròn',
    ipa = '/spɪn/',
    icon = '🌀'
WHERE id = 'kids_act_spin';

UPDATE words SET
    vietnamese = 'vươn vai/giãn cơ',
    ipa = '/stretʃ/',
    icon = '🙆'
WHERE id = 'kids_act_stretch';

UPDATE words SET
    vietnamese = 'bò/trườn',
    ipa = '/krɔːl/',
    icon = '👶'
WHERE id = 'kids_act_crawl';

UPDATE words SET
    vietnamese = 'lăn/cuộn',
    ipa = '/rəʊl/',
    icon = '🥎'
WHERE id = 'kids_act_roll';

UPDATE words SET
    vietnamese = 'lắc/rung',
    ipa = '/ʃeɪk/',
    icon = '🫨'
WHERE id = 'kids_act_shake';

UPDATE words SET
    vietnamese = 'bước đi',
    ipa = '/step/',
    icon = '👣'
WHERE id = 'kids_act_step';

UPDATE words SET
    vietnamese = 'nhảy chân sáo/nhảy dây',
    ipa = '/skɪp/',
    icon = '🪢'
WHERE id = 'kids_act_skip';

UPDATE words SET
    vietnamese = 'ngã/rơi',
    ipa = '/fɔːl/',
    icon = '🍂'
WHERE id = 'kids_act_fall';

UPDATE words SET
    vietnamese = 'trốn/ẩn nấp',
    ipa = '/haɪd/',
    icon = '🫣'
WHERE id = 'kids_act_hide';

UPDATE words SET
    vietnamese = 'tìm kiếm',
    ipa = '/siːk/',
    icon = '🔍'
WHERE id = 'kids_act_seek';

UPDATE words SET
    vietnamese = 'ném/quăng',
    ipa = '/θrəʊ/',
    icon = '☄️'
WHERE id = 'kids_act_throw';

UPDATE words SET
    vietnamese = 'bắt lấy/chụp lấy',
    ipa = '/kætʃ/',
    icon = '🤲'
WHERE id = 'kids_act_catch';

UPDATE words SET
    vietnamese = 'đá',
    ipa = '/kɪk/',
    icon = '⚽'
WHERE id = 'kids_act_kick';

UPDATE words SET
    vietnamese = 'cầm/nắm',
    ipa = '/həʊld/',
    icon = '✊'
WHERE id = 'kids_act_hold';

UPDATE words SET
    vietnamese = 'đẩy',
    ipa = '/pʊʃ/',
    icon = '🫷'
WHERE id = 'kids_act_push';

UPDATE words SET
    vietnamese = 'kéo',
    ipa = '/pʊl/',
    icon = '🫸'
WHERE id = 'kids_act_pull';

UPDATE words SET
    vietnamese = 'mở',
    ipa = '/ˈəʊ.pən/',
    icon = '🚪'
WHERE id = 'kids_act_open';

UPDATE words SET
    vietnamese = 'đóng',
    ipa = '/kləʊz/',
    icon = '🚪'
WHERE id = 'kids_act_close';

UPDATE words SET
    vietnamese = 'xây dựng/xếp hình',
    ipa = '/bɪld/',
    icon = '🧱'
WHERE id = 'kids_act_build';

UPDATE words SET
    vietnamese = 'cắt',
    ipa = '/kʌt/',
    icon = '✂️'
WHERE id = 'kids_act_cut';

UPDATE words SET
    vietnamese = 'đào đất',
    ipa = '/dɪɡ/',
    icon = '🏖️'
WHERE id = 'kids_act_dig';

UPDATE words SET
    vietnamese = 'cho/tặng',
    ipa = '/ɡɪv/',
    icon = '🎁'
WHERE id = 'kids_act_give';

UPDATE words SET
    vietnamese = 'lấy/cầm lấy',
    ipa = '/teɪk/',
    icon = '🫳'
WHERE id = 'kids_act_take';

UPDATE words SET
    vietnamese = 'chia sẻ',
    ipa = '/ʃeər/',
    icon = '🍕'
WHERE id = 'kids_act_share';

UPDATE words SET
    vietnamese = 'dán hồ/keo',
    ipa = '/ɡluː/',
    icon = '🧪'
WHERE id = 'kids_act_glue';

UPDATE words SET
    vietnamese = 'bóp/nặn/vắt',
    ipa = '/skwiːz/',
    icon = '🍋'
WHERE id = 'kids_act_squeeze';

UPDATE words SET
    vietnamese = 'thổi',
    ipa = '/bləʊ/',
    icon = '🧼'
WHERE id = 'kids_act_blow';

UPDATE words SET
    vietnamese = 'sờ/chạm',
    ipa = '/tʌtʃ/',
    icon = '👉'
WHERE id = 'kids_act_touch';

UPDATE words SET
    vietnamese = 'chỉ tay',
    ipa = '/pɔɪnt/',
    icon = '☝️'
WHERE id = 'kids_act_point';

UPDATE words SET
    vietnamese = 'tìm thấy',
    ipa = '/faɪnd/',
    icon = '🔑'
WHERE id = 'kids_act_find';

UPDATE words SET
    vietnamese = 'mỉm cười',
    ipa = '/smaɪl/',
    icon = '😊'
WHERE id = 'kids_act_smile';

UPDATE words SET
    vietnamese = 'cười lớn',
    ipa = '/lɑːf/',
    icon = '😄'
WHERE id = 'kids_act_laugh';

UPDATE words SET
    vietnamese = 'khóc',
    ipa = '/kraɪ/',
    icon = '😢'
WHERE id = 'kids_act_cry';

UPDATE words SET
    vietnamese = 'ôm',
    ipa = '/hʌɡ/',
    icon = '🤗'
WHERE id = 'kids_act_hug';

UPDATE words SET
    vietnamese = 'hôn',
    ipa = '/kɪs/',
    icon = '😘'
WHERE id = 'kids_act_kiss';

UPDATE words SET
    vietnamese = 'nhìn/ngắm',
    ipa = '/lʊk/',
    icon = '👁️'
WHERE id = 'kids_act_look';

UPDATE words SET
    vietnamese = 'lắng nghe',
    ipa = '/ˈlɪs.ən/',
    icon = '👂'
WHERE id = 'kids_act_listen';

UPDATE words SET
    vietnamese = 'ngửi',
    ipa = '/smel/',
    icon = '👃'
WHERE id = 'kids_act_smell';

UPDATE words SET
    vietnamese = 'nếm',
    ipa = '/teɪst/',
    icon = '👅'
WHERE id = 'kids_act_taste';

UPDATE words SET
    vietnamese = 'yêu thương',
    ipa = '/lʌv/',
    icon = '❤️'
WHERE id = 'kids_act_love';

UPDATE words SET
    vietnamese = 'nháy mắt',
    ipa = '/blɪŋk/',
    icon = '😉'
WHERE id = 'kids_act_blink';

UPDATE words SET
    vietnamese = 'đổ mồ hôi',
    ipa = '/swet/',
    icon = '💦'
WHERE id = 'kids_act_sweat';

UPDATE words SET
    vietnamese = 'la lên/hét',
    ipa = '/jel/',
    icon = '🫨'
WHERE id = 'kids_act_yell';

UPDATE words SET
    vietnamese = 'run rẩy',
    ipa = '/ˈʃɪv.ər/',
    icon = '🥶'
WHERE id = 'kids_act_shiver';

UPDATE words SET
    vietnamese = 'mơ ngủ',
    ipa = '/driːm/',
    icon = '💭'
WHERE id = 'kids_act_dream';

UPDATE words SET
    vietnamese = 'đọc',
    ipa = '/riːd/',
    icon = '📖'
WHERE id = 'kids_act_read';

UPDATE words SET
    vietnamese = 'viết',
    ipa = '/raɪt/',
    icon = '✏️'
WHERE id = 'kids_act_write';

UPDATE words SET
    vietnamese = 'vẽ hình',
    ipa = '/drɔː/',
    icon = '🎨'
WHERE id = 'kids_act_draw';

UPDATE words SET
    vietnamese = 'tô màu/sơn',
    ipa = '/peɪnt/',
    icon = '🖌️'
WHERE id = 'kids_act_paint';

UPDATE words SET
    vietnamese = 'đếm số',
    ipa = '/kaʊnt/',
    icon = '🔢'
WHERE id = 'kids_act_count';

UPDATE words SET
    vietnamese = 'tô màu',
    ipa = '/ˈkʌl.ər/',
    icon = '🖍️'
WHERE id = 'kids_act_color';

UPDATE words SET
    vietnamese = 'lắng nghe cô giáo',
    ipa = '/ˈlɪs.ən tuː ˈtiː.tʃər/',
    icon = '👩‍🏫'
WHERE id = 'kids_act_listen_to_teacher';

UPDATE words SET
    vietnamese = 'ngồi xuống',
    ipa = '/sɪt/',
    icon = '🪑'
WHERE id = 'kids_act_sit';

UPDATE words SET
    vietnamese = 'đứng lên',
    ipa = '/stænd/',
    icon = '🧍'
WHERE id = 'kids_act_stand';

UPDATE words SET
    vietnamese = 'nói chuyện',
    ipa = '/tɔːk/',
    icon = '💬'
WHERE id = 'kids_act_talk';

UPDATE words SET
    vietnamese = 'học tập',
    ipa = '/lɜːn/',
    icon = '🎓'
WHERE id = 'kids_act_learn';

UPDATE words SET
    vietnamese = 'xem/quan sát',
    ipa = '/wɒtʃ/',
    icon = '📺'
WHERE id = 'kids_act_watch';

UPDATE words SET
    vietnamese = 'suy nghĩ',
    ipa = '/θɪŋk/',
    icon = '🤔'
WHERE id = 'kids_act_think';

UPDATE words SET
    vietnamese = 'hỏi câu hỏi',
    ipa = '/ɑːsk/',
    icon = '❓'
WHERE id = 'kids_act_ask';

UPDATE words SET
    vietnamese = 'chỉ ra/cho xem',
    ipa = '/ʃəʊ/',
    icon = '👉'
WHERE id = 'kids_act_show';

UPDATE words SET
    vietnamese = 'thu dọn cặp sách',
    ipa = '/pæk bæɡz/',
    icon = '🎒'
WHERE id = 'kids_act_pack_bags';

UPDATE words SET
    vietnamese = 'lau bảng',
    ipa = '/kliːn bɔːd/',
    icon = '🧹'
WHERE id = 'kids_act_clean_board';

UPDATE words SET
    vietnamese = 'mở sách',
    ipa = '/ˈəʊ.pən bʊk/',
    icon = '📖'
WHERE id = 'kids_act_open_book';

UPDATE words SET
    vietnamese = 'dọn dẹp ngăn nắp',
    ipa = '/ˈtaɪ.di ʌp/',
    icon = '📦'
WHERE id = 'kids_act_tidy_up';

UPDATE words SET
    vietnamese = 'nối từ/ghép đôi',
    ipa = '/mætʃ/',
    icon = '🧩'
WHERE id = 'kids_act_match';
