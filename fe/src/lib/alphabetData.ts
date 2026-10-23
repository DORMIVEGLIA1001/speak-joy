// ── Alphabet A–Z learning dataset (kids level, ~4–6 y.o.) ────────────────────
// One entry per letter. Each letter carries several kid-friendly words; each word
// has an emoji icon, IPA, Vietnamese gloss and one or more short example
// sentences. Compound-practice sentences let the child rehearse the letter's
// sound inside a full phrase (notes 14/7 · mục 1).
//
// This is a client-side catalog (no DB dependency) so the Alphabet tab can render
// rich per-letter content offline. Adding a word is a one-entry change here.

export interface AlphabetExample {
  en: string;
  vi: string;
}

export interface AlphabetWord {
  word: string;
  ipa: string;
  vietnamese: string;
  emoji: string;
  examples: AlphabetExample[];
}

export interface AlphabetLetter {
  letter: string;
  letterIPA: string;
  phonicsSound: string; // how the letter usually sounds at the start of a word
  words: AlphabetWord[];
  practiceSentences: AlphabetExample[]; // compound sentences to rehearse the sound
}

export const ALPHABET_DATA: AlphabetLetter[] = [
  {
    letter: 'A', letterIPA: '/eɪ/', phonicsSound: '/æ/',
    words: [
      { word: 'Apple', ipa: '/ˈæpl/', vietnamese: 'Quả táo', emoji: '🍎', examples: [
        { en: 'I eat a red apple.', vi: 'Tớ ăn một quả táo đỏ.' },
        { en: 'The apple is sweet.', vi: 'Quả táo ngọt.' },
      ] },
      { word: 'Ant', ipa: '/ænt/', vietnamese: 'Con kiến', emoji: '🐜', examples: [
        { en: 'The ant is very small.', vi: 'Con kiến rất nhỏ.' },
      ] },
      { word: 'Airplane', ipa: '/ˈeəpleɪn/', vietnamese: 'Máy bay', emoji: '✈️', examples: [
        { en: 'The airplane flies high.', vi: 'Máy bay bay cao.' },
      ] },
      { word: 'Arm', ipa: '/ɑːm/', vietnamese: 'Cánh tay', emoji: '💪', examples: [
        { en: 'I raise my arm.', vi: 'Tớ giơ cánh tay lên.' },
      ] },
      { word: 'Alligator', ipa: '/ˈælɪɡeɪtə/', vietnamese: 'Cá sấu', emoji: '🐊', examples: [
        { en: 'The alligator has big teeth.', vi: 'Con cá sấu có hàm răng to.' },
      ] },
    ],
    practiceSentences: [
      { en: 'An ant sees an apple.', vi: 'Con kiến thấy một quả táo.' },
      { en: 'An airplane flies over the alligator.', vi: 'Máy bay bay qua con cá sấu.' },
    ],
  },
  {
    letter: 'B', letterIPA: '/biː/', phonicsSound: '/b/',
    words: [
      { word: 'Bear', ipa: '/beə/', vietnamese: 'Con gấu', emoji: '🐻', examples: [
        { en: 'The bear is big and brown.', vi: 'Con gấu to và màu nâu.' },
      ] },
      { word: 'Ball', ipa: '/bɔːl/', vietnamese: 'Quả bóng', emoji: '⚽', examples: [
        { en: 'I kick the ball.', vi: 'Tớ đá quả bóng.' },
      ] },
      { word: 'Banana', ipa: '/bəˈnɑːnə/', vietnamese: 'Quả chuối', emoji: '🍌', examples: [
        { en: 'The banana is yellow.', vi: 'Quả chuối màu vàng.' },
      ] },
      { word: 'Bird', ipa: '/bɜːd/', vietnamese: 'Con chim', emoji: '🐦', examples: [
        { en: 'The bird can fly.', vi: 'Con chim biết bay.' },
      ] },
      { word: 'Bus', ipa: '/bʌs/', vietnamese: 'Xe buýt', emoji: '🚌', examples: [
        { en: 'I go to school by bus.', vi: 'Tớ đi học bằng xe buýt.' },
      ] },
    ],
    practiceSentences: [
      { en: 'The big bear has a ball.', vi: 'Con gấu to có một quả bóng.' },
      { en: 'A bird sits on the bus.', vi: 'Con chim đậu trên xe buýt.' },
    ],
  },
  {
    letter: 'C', letterIPA: '/siː/', phonicsSound: '/k/',
    words: [
      { word: 'Cat', ipa: '/kæt/', vietnamese: 'Con mèo', emoji: '🐱', examples: [
        { en: 'The cat drinks milk.', vi: 'Con mèo uống sữa.' },
      ] },
      { word: 'Car', ipa: '/kɑː/', vietnamese: 'Xe hơi', emoji: '🚗', examples: [
        { en: 'The car is fast.', vi: 'Chiếc xe chạy nhanh.' },
      ] },
      { word: 'Cake', ipa: '/keɪk/', vietnamese: 'Bánh ngọt', emoji: '🍰', examples: [
        { en: 'I like birthday cake.', vi: 'Tớ thích bánh sinh nhật.' },
      ] },
      { word: 'Cow', ipa: '/kaʊ/', vietnamese: 'Con bò', emoji: '🐮', examples: [
        { en: 'The cow says moo.', vi: 'Con bò kêu ụm bò.' },
      ] },
      { word: 'Cloud', ipa: '/klaʊd/', vietnamese: 'Đám mây', emoji: '☁️', examples: [
        { en: 'The cloud is white.', vi: 'Đám mây màu trắng.' },
      ] },
    ],
    practiceSentences: [
      { en: 'The cat sits in the car.', vi: 'Con mèo ngồi trong xe.' },
      { en: 'A cow eats cake under a cloud.', vi: 'Con bò ăn bánh dưới đám mây.' },
    ],
  },
  {
    letter: 'D', letterIPA: '/diː/', phonicsSound: '/d/',
    words: [
      { word: 'Dog', ipa: '/dɒɡ/', vietnamese: 'Con chó', emoji: '🐶', examples: [
        { en: 'The dog runs fast.', vi: 'Con chó chạy nhanh.' },
      ] },
      { word: 'Duck', ipa: '/dʌk/', vietnamese: 'Con vịt', emoji: '🦆', examples: [
        { en: 'The duck swims in the pond.', vi: 'Con vịt bơi trong ao.' },
      ] },
      { word: 'Door', ipa: '/dɔː/', vietnamese: 'Cái cửa', emoji: '🚪', examples: [
        { en: 'Please open the door.', vi: 'Hãy mở cửa nhé.' },
      ] },
      { word: 'Doll', ipa: '/dɒl/', vietnamese: 'Búp bê', emoji: '🪆', examples: [
        { en: 'She has a pretty doll.', vi: 'Bạn ấy có một con búp bê đẹp.' },
      ] },
      { word: 'Drum', ipa: '/drʌm/', vietnamese: 'Cái trống', emoji: '🥁', examples: [
        { en: 'I play the drum.', vi: 'Tớ chơi trống.' },
      ] },
    ],
    practiceSentences: [
      { en: 'The dog and the duck play.', vi: 'Con chó và con vịt chơi đùa.' },
      { en: 'A doll is behind the door.', vi: 'Con búp bê ở sau cánh cửa.' },
    ],
  },
  {
    letter: 'E', letterIPA: '/iː/', phonicsSound: '/e/',
    words: [
      { word: 'Elephant', ipa: '/ˈelɪfənt/', vietnamese: 'Con voi', emoji: '🐘', examples: [
        { en: 'The elephant is very big.', vi: 'Con voi rất to.' },
      ] },
      { word: 'Egg', ipa: '/eɡ/', vietnamese: 'Quả trứng', emoji: '🥚', examples: [
        { en: 'I eat an egg for breakfast.', vi: 'Tớ ăn trứng vào bữa sáng.' },
      ] },
      { word: 'Ear', ipa: '/ɪə/', vietnamese: 'Cái tai', emoji: '👂', examples: [
        { en: 'I hear with my ears.', vi: 'Tớ nghe bằng tai.' },
      ] },
      { word: 'Eagle', ipa: '/ˈiːɡl/', vietnamese: 'Đại bàng', emoji: '🦅', examples: [
        { en: 'The eagle flies high.', vi: 'Đại bàng bay cao.' },
      ] },
    ],
    practiceSentences: [
      { en: 'The elephant sees an egg.', vi: 'Con voi thấy một quả trứng.' },
      { en: 'An eagle has sharp eyes.', vi: 'Đại bàng có đôi mắt tinh.' },
    ],
  },
  {
    letter: 'F', letterIPA: '/ef/', phonicsSound: '/f/',
    words: [
      { word: 'Fish', ipa: '/fɪʃ/', vietnamese: 'Con cá', emoji: '🐟', examples: [
        { en: 'The fish swims in water.', vi: 'Con cá bơi trong nước.' },
      ] },
      { word: 'Flower', ipa: '/ˈflaʊə/', vietnamese: 'Bông hoa', emoji: '🌸', examples: [
        { en: 'The flower smells nice.', vi: 'Bông hoa thơm.' },
      ] },
      { word: 'Frog', ipa: '/frɒɡ/', vietnamese: 'Con ếch', emoji: '🐸', examples: [
        { en: 'The frog jumps high.', vi: 'Con ếch nhảy cao.' },
      ] },
      { word: 'Fox', ipa: '/fɒks/', vietnamese: 'Con cáo', emoji: '🦊', examples: [
        { en: 'The fox is clever.', vi: 'Con cáo thông minh.' },
      ] },
      { word: 'Fan', ipa: '/fæn/', vietnamese: 'Cái quạt', emoji: '🪭', examples: [
        { en: 'The fan is cool.', vi: 'Cái quạt mát.' },
      ] },
    ],
    practiceSentences: [
      { en: 'The frog and the fish are friends.', vi: 'Con ếch và con cá là bạn.' },
      { en: 'A fox sees a flower.', vi: 'Con cáo thấy một bông hoa.' },
    ],
  },
  {
    letter: 'G', letterIPA: '/dʒiː/', phonicsSound: '/ɡ/',
    words: [
      { word: 'Giraffe', ipa: '/dʒɪˈrɑːf/', vietnamese: 'Hươu cao cổ', emoji: '🦒', examples: [
        { en: 'The giraffe has a long neck.', vi: 'Hươu cao cổ có cổ dài.' },
      ] },
      { word: 'Goat', ipa: '/ɡəʊt/', vietnamese: 'Con dê', emoji: '🐐', examples: [
        { en: 'The goat eats grass.', vi: 'Con dê ăn cỏ.' },
      ] },
      { word: 'Grapes', ipa: '/ɡreɪps/', vietnamese: 'Quả nho', emoji: '🍇', examples: [
        { en: 'I like sweet grapes.', vi: 'Tớ thích nho ngọt.' },
      ] },
      { word: 'Gift', ipa: '/ɡɪft/', vietnamese: 'Món quà', emoji: '🎁', examples: [
        { en: 'This gift is for you.', vi: 'Món quà này dành cho bạn.' },
      ] },
      { word: 'Grass', ipa: '/ɡrɑːs/', vietnamese: 'Cỏ', emoji: '🌱', examples: [
        { en: 'The grass is green.', vi: 'Cỏ màu xanh.' },
      ] },
    ],
    practiceSentences: [
      { en: 'The goat eats grass.', vi: 'Con dê ăn cỏ.' },
      { en: 'The giraffe gets a gift.', vi: 'Hươu cao cổ nhận một món quà.' },
    ],
  },
  {
    letter: 'H', letterIPA: '/eɪtʃ/', phonicsSound: '/h/',
    words: [
      { word: 'House', ipa: '/haʊs/', vietnamese: 'Ngôi nhà', emoji: '🏠', examples: [
        { en: 'My house is big.', vi: 'Ngôi nhà của tớ to.' },
      ] },
      { word: 'Hat', ipa: '/hæt/', vietnamese: 'Cái mũ', emoji: '🧢', examples: [
        { en: 'I wear a blue hat.', vi: 'Tớ đội mũ xanh.' },
      ] },
      { word: 'Horse', ipa: '/hɔːs/', vietnamese: 'Con ngựa', emoji: '🐴', examples: [
        { en: 'The horse runs fast.', vi: 'Con ngựa chạy nhanh.' },
      ] },
      { word: 'Hand', ipa: '/hænd/', vietnamese: 'Bàn tay', emoji: '✋', examples: [
        { en: 'I wave my hand.', vi: 'Tớ vẫy tay.' },
      ] },
      { word: 'Honey', ipa: '/ˈhʌni/', vietnamese: 'Mật ong', emoji: '🍯', examples: [
        { en: 'The bear likes honey.', vi: 'Con gấu thích mật ong.' },
      ] },
    ],
    practiceSentences: [
      { en: 'The horse is in the house.', vi: 'Con ngựa ở trong nhà.' },
      { en: 'I hold my hat in my hand.', vi: 'Tớ cầm mũ trong tay.' },
    ],
  },
  {
    letter: 'I', letterIPA: '/aɪ/', phonicsSound: '/ɪ/',
    words: [
      { word: 'Ice cream', ipa: '/ˈaɪs kriːm/', vietnamese: 'Kem', emoji: '🍦', examples: [
        { en: 'I love ice cream.', vi: 'Tớ thích kem.' },
      ] },
      { word: 'Igloo', ipa: '/ˈɪɡluː/', vietnamese: 'Nhà tuyết', emoji: '🛖', examples: [
        { en: 'The igloo is made of ice.', vi: 'Nhà tuyết làm bằng băng.' },
      ] },
      { word: 'Insect', ipa: '/ˈɪnsekt/', vietnamese: 'Côn trùng', emoji: '🐞', examples: [
        { en: 'The insect is tiny.', vi: 'Con côn trùng bé xíu.' },
      ] },
      { word: 'Island', ipa: '/ˈaɪlənd/', vietnamese: 'Hòn đảo', emoji: '🏝️', examples: [
        { en: 'The island has palm trees.', vi: 'Hòn đảo có cây dừa.' },
      ] },
    ],
    practiceSentences: [
      { en: 'I eat ice cream on the island.', vi: 'Tớ ăn kem trên hòn đảo.' },
      { en: 'An insect sits on the igloo.', vi: 'Con côn trùng đậu trên nhà tuyết.' },
    ],
  },
  {
    letter: 'J', letterIPA: '/dʒeɪ/', phonicsSound: '/dʒ/',
    words: [
      { word: 'Jellyfish', ipa: '/ˈdʒelɪfɪʃ/', vietnamese: 'Con sứa', emoji: '🪼', examples: [
        { en: 'The jellyfish is soft.', vi: 'Con sứa mềm.' },
      ] },
      { word: 'Juice', ipa: '/dʒuːs/', vietnamese: 'Nước ép', emoji: '🧃', examples: [
        { en: 'I drink orange juice.', vi: 'Tớ uống nước cam.' },
      ] },
      { word: 'Jam', ipa: '/dʒæm/', vietnamese: 'Mứt', emoji: '🍓', examples: [
        { en: 'I like jam on bread.', vi: 'Tớ thích mứt phết bánh mì.' },
      ] },
      { word: 'Jet', ipa: '/dʒet/', vietnamese: 'Máy bay phản lực', emoji: '🛩️', examples: [
        { en: 'The jet is very fast.', vi: 'Máy bay phản lực rất nhanh.' },
      ] },
    ],
    practiceSentences: [
      { en: 'I drink juice with jam.', vi: 'Tớ uống nước ép với mứt.' },
      { en: 'A jellyfish sees a jet.', vi: 'Con sứa thấy một chiếc máy bay.' },
    ],
  },
  {
    letter: 'K', letterIPA: '/keɪ/', phonicsSound: '/k/',
    words: [
      { word: 'Koala', ipa: '/kəʊˈɑːlə/', vietnamese: 'Gấu koala', emoji: '🐨', examples: [
        { en: 'The koala sleeps a lot.', vi: 'Gấu koala ngủ nhiều.' },
      ] },
      { word: 'Kite', ipa: '/kaɪt/', vietnamese: 'Con diều', emoji: '🪁', examples: [
        { en: 'I fly my kite.', vi: 'Tớ thả diều.' },
      ] },
      { word: 'Key', ipa: '/kiː/', vietnamese: 'Chìa khóa', emoji: '🔑', examples: [
        { en: 'This is the door key.', vi: 'Đây là chìa khóa cửa.' },
      ] },
      { word: 'King', ipa: '/kɪŋ/', vietnamese: 'Vua', emoji: '🤴', examples: [
        { en: 'The king wears a crown.', vi: 'Nhà vua đội vương miện.' },
      ] },
    ],
    practiceSentences: [
      { en: 'The king flies a kite.', vi: 'Nhà vua thả diều.' },
      { en: 'The koala has a key.', vi: 'Gấu koala có một chiếc chìa khóa.' },
    ],
  },
  {
    letter: 'L', letterIPA: '/el/', phonicsSound: '/l/',
    words: [
      { word: 'Lion', ipa: '/ˈlaɪən/', vietnamese: 'Sư tử', emoji: '🦁', examples: [
        { en: 'The lion is strong.', vi: 'Sư tử khỏe.' },
      ] },
      { word: 'Leaf', ipa: '/liːf/', vietnamese: 'Chiếc lá', emoji: '🍃', examples: [
        { en: 'The leaf is green.', vi: 'Chiếc lá màu xanh.' },
      ] },
      { word: 'Lemon', ipa: '/ˈlemən/', vietnamese: 'Quả chanh', emoji: '🍋', examples: [
        { en: 'The lemon is sour.', vi: 'Quả chanh chua.' },
      ] },
      { word: 'Lamp', ipa: '/læmp/', vietnamese: 'Cái đèn', emoji: '💡', examples: [
        { en: 'The lamp is bright.', vi: 'Cái đèn sáng.' },
      ] },
      { word: 'Ladder', ipa: '/ˈlædə/', vietnamese: 'Cái thang', emoji: '🪜', examples: [
        { en: 'I climb the ladder.', vi: 'Tớ trèo lên thang.' },
      ] },
    ],
    practiceSentences: [
      { en: 'The lion sits under a leaf.', vi: 'Sư tử ngồi dưới chiếc lá.' },
      { en: 'The lemon is near the lamp.', vi: 'Quả chanh ở gần cái đèn.' },
    ],
  },
  {
    letter: 'M', letterIPA: '/em/', phonicsSound: '/m/',
    words: [
      { word: 'Monkey', ipa: '/ˈmʌŋki/', vietnamese: 'Con khỉ', emoji: '🐒', examples: [
        { en: 'The monkey eats a banana.', vi: 'Con khỉ ăn chuối.' },
      ] },
      { word: 'Moon', ipa: '/muːn/', vietnamese: 'Mặt trăng', emoji: '🌙', examples: [
        { en: 'The moon is bright at night.', vi: 'Mặt trăng sáng vào ban đêm.' },
      ] },
      { word: 'Mouse', ipa: '/maʊs/', vietnamese: 'Con chuột', emoji: '🐭', examples: [
        { en: 'The mouse is small.', vi: 'Con chuột nhỏ.' },
      ] },
      { word: 'Milk', ipa: '/mɪlk/', vietnamese: 'Sữa', emoji: '🥛', examples: [
        { en: 'I drink milk every day.', vi: 'Tớ uống sữa mỗi ngày.' },
      ] },
      { word: 'Mango', ipa: '/ˈmæŋɡəʊ/', vietnamese: 'Quả xoài', emoji: '🥭', examples: [
        { en: 'The mango is sweet.', vi: 'Quả xoài ngọt.' },
      ] },
    ],
    practiceSentences: [
      { en: 'The monkey drinks milk.', vi: 'Con khỉ uống sữa.' },
      { en: 'The mouse sees the moon.', vi: 'Con chuột thấy mặt trăng.' },
    ],
  },
  {
    letter: 'N', letterIPA: '/en/', phonicsSound: '/n/',
    words: [
      { word: 'Nest', ipa: '/nest/', vietnamese: 'Tổ chim', emoji: '🪹', examples: [
        { en: 'The bird has a nest.', vi: 'Con chim có một cái tổ.' },
      ] },
      { word: 'Nose', ipa: '/nəʊz/', vietnamese: 'Cái mũi', emoji: '👃', examples: [
        { en: 'I smell with my nose.', vi: 'Tớ ngửi bằng mũi.' },
      ] },
      { word: 'Net', ipa: '/net/', vietnamese: 'Cái lưới', emoji: '🥅', examples: [
        { en: 'The fish is in the net.', vi: 'Con cá ở trong lưới.' },
      ] },
      { word: 'Nut', ipa: '/nʌt/', vietnamese: 'Hạt', emoji: '🥜', examples: [
        { en: 'The squirrel eats a nut.', vi: 'Con sóc ăn hạt.' },
      ] },
    ],
    practiceSentences: [
      { en: 'The nest is near the net.', vi: 'Cái tổ ở gần cái lưới.' },
      { en: 'I touch my nose.', vi: 'Tớ chạm vào mũi.' },
    ],
  },
  {
    letter: 'O', letterIPA: '/əʊ/', phonicsSound: '/ɒ/',
    words: [
      { word: 'Owl', ipa: '/aʊl/', vietnamese: 'Con cú', emoji: '🦉', examples: [
        { en: 'The owl is awake at night.', vi: 'Con cú thức vào ban đêm.' },
      ] },
      { word: 'Orange', ipa: '/ˈɒrɪndʒ/', vietnamese: 'Quả cam', emoji: '🍊', examples: [
        { en: 'The orange is juicy.', vi: 'Quả cam mọng nước.' },
      ] },
      { word: 'Octopus', ipa: '/ˈɒktəpəs/', vietnamese: 'Bạch tuộc', emoji: '🐙', examples: [
        { en: 'The octopus has eight arms.', vi: 'Bạch tuộc có tám cánh tay.' },
      ] },
      { word: 'Onion', ipa: '/ˈʌnjən/', vietnamese: 'Củ hành', emoji: '🧅', examples: [
        { en: 'The onion makes me cry.', vi: 'Củ hành làm tớ chảy nước mắt.' },
      ] },
    ],
    practiceSentences: [
      { en: 'The owl eats an orange.', vi: 'Con cú ăn một quả cam.' },
      { en: 'The octopus holds an onion.', vi: 'Bạch tuộc cầm một củ hành.' },
    ],
  },
  {
    letter: 'P', letterIPA: '/piː/', phonicsSound: '/p/',
    words: [
      { word: 'Penguin', ipa: '/ˈpeŋɡwɪn/', vietnamese: 'Chim cánh cụt', emoji: '🐧', examples: [
        { en: 'The penguin lives in the cold.', vi: 'Chim cánh cụt sống ở nơi lạnh.' },
      ] },
      { word: 'Pig', ipa: '/pɪɡ/', vietnamese: 'Con lợn', emoji: '🐷', examples: [
        { en: 'The pig is pink.', vi: 'Con lợn màu hồng.' },
      ] },
      { word: 'Pizza', ipa: '/ˈpiːtsə/', vietnamese: 'Pizza', emoji: '🍕', examples: [
        { en: 'I eat a slice of pizza.', vi: 'Tớ ăn một miếng pizza.' },
      ] },
      { word: 'Pencil', ipa: '/ˈpensl/', vietnamese: 'Bút chì', emoji: '✏️', examples: [
        { en: 'I write with a pencil.', vi: 'Tớ viết bằng bút chì.' },
      ] },
      { word: 'Panda', ipa: '/ˈpændə/', vietnamese: 'Gấu trúc', emoji: '🐼', examples: [
        { en: 'The panda eats bamboo.', vi: 'Gấu trúc ăn tre.' },
      ] },
    ],
    practiceSentences: [
      { en: 'The pig eats pizza.', vi: 'Con lợn ăn pizza.' },
      { en: 'The penguin has a pencil.', vi: 'Chim cánh cụt có một cây bút chì.' },
    ],
  },
  {
    letter: 'Q', letterIPA: '/kjuː/', phonicsSound: '/kw/',
    words: [
      { word: 'Queen', ipa: '/kwiːn/', vietnamese: 'Nữ hoàng', emoji: '👸', examples: [
        { en: 'The queen is kind.', vi: 'Nữ hoàng tốt bụng.' },
      ] },
      { word: 'Queue', ipa: '/kjuː/', vietnamese: 'Hàng chờ', emoji: '🚶', examples: [
        { en: 'We wait in a queue.', vi: 'Chúng tớ xếp hàng chờ.' },
      ] },
      { word: 'Quilt', ipa: '/kwɪlt/', vietnamese: 'Chăn bông', emoji: '🛏️', examples: [
        { en: 'The quilt is warm.', vi: 'Cái chăn ấm.' },
      ] },
      { word: 'Question', ipa: '/ˈkwestʃən/', vietnamese: 'Câu hỏi', emoji: '❓', examples: [
        { en: 'I ask a question.', vi: 'Tớ đặt một câu hỏi.' },
      ] },
    ],
    practiceSentences: [
      { en: 'The queen asks a question.', vi: 'Nữ hoàng đặt một câu hỏi.' },
      { en: 'We wait in a quiet queue.', vi: 'Chúng tớ xếp hàng chờ yên lặng.' },
    ],
  },
  {
    letter: 'R', letterIPA: '/ɑːr/', phonicsSound: '/r/',
    words: [
      { word: 'Rabbit', ipa: '/ˈræbɪt/', vietnamese: 'Con thỏ', emoji: '🐰', examples: [
        { en: 'The rabbit hops fast.', vi: 'Con thỏ nhảy nhanh.' },
      ] },
      { word: 'Rainbow', ipa: '/ˈreɪnbəʊ/', vietnamese: 'Cầu vồng', emoji: '🌈', examples: [
        { en: 'The rainbow has many colors.', vi: 'Cầu vồng có nhiều màu.' },
      ] },
      { word: 'Rose', ipa: '/rəʊz/', vietnamese: 'Hoa hồng', emoji: '🌹', examples: [
        { en: 'The rose is red.', vi: 'Hoa hồng màu đỏ.' },
      ] },
      { word: 'Rain', ipa: '/reɪn/', vietnamese: 'Mưa', emoji: '🌧️', examples: [
        { en: 'I like the rain.', vi: 'Tớ thích mưa.' },
      ] },
      { word: 'Robot', ipa: '/ˈrəʊbɒt/', vietnamese: 'Người máy', emoji: '🤖', examples: [
        { en: 'The robot can walk.', vi: 'Người máy biết đi.' },
      ] },
    ],
    practiceSentences: [
      { en: 'The rabbit sees a rainbow.', vi: 'Con thỏ thấy cầu vồng.' },
      { en: 'A rose grows in the rain.', vi: 'Hoa hồng nở trong mưa.' },
    ],
  },
  {
    letter: 'S', letterIPA: '/es/', phonicsSound: '/s/',
    words: [
      { word: 'Sun', ipa: '/sʌn/', vietnamese: 'Mặt trời', emoji: '☀️', examples: [
        { en: 'The sun is bright.', vi: 'Mặt trời sáng.' },
      ] },
      { word: 'Star', ipa: '/stɑː/', vietnamese: 'Ngôi sao', emoji: '⭐', examples: [
        { en: 'I see a star at night.', vi: 'Tớ thấy ngôi sao vào ban đêm.' },
      ] },
      { word: 'Snake', ipa: '/sneɪk/', vietnamese: 'Con rắn', emoji: '🐍', examples: [
        { en: 'The snake is long.', vi: 'Con rắn dài.' },
      ] },
      { word: 'Sock', ipa: '/sɒk/', vietnamese: 'Cái tất', emoji: '🧦', examples: [
        { en: 'I put on my socks.', vi: 'Tớ mang tất vào.' },
      ] },
      { word: 'Strawberry', ipa: '/ˈstrɔːbəri/', vietnamese: 'Dâu tây', emoji: '🍓', examples: [
        { en: 'The strawberry is sweet.', vi: 'Quả dâu tây ngọt.' },
      ] },
    ],
    practiceSentences: [
      { en: 'The sun and a star shine.', vi: 'Mặt trời và ngôi sao tỏa sáng.' },
      { en: 'The snake sees a strawberry.', vi: 'Con rắn thấy quả dâu tây.' },
    ],
  },
  {
    letter: 'T', letterIPA: '/tiː/', phonicsSound: '/t/',
    words: [
      { word: 'Tiger', ipa: '/ˈtaɪɡə/', vietnamese: 'Con hổ', emoji: '🐯', examples: [
        { en: 'The tiger has stripes.', vi: 'Con hổ có sọc.' },
      ] },
      { word: 'Tree', ipa: '/triː/', vietnamese: 'Cái cây', emoji: '🌳', examples: [
        { en: 'The tree is tall.', vi: 'Cái cây cao.' },
      ] },
      { word: 'Train', ipa: '/treɪn/', vietnamese: 'Tàu hỏa', emoji: '🚂', examples: [
        { en: 'The train is long.', vi: 'Đoàn tàu dài.' },
      ] },
      { word: 'Turtle', ipa: '/ˈtɜːtl/', vietnamese: 'Con rùa', emoji: '🐢', examples: [
        { en: 'The turtle is slow.', vi: 'Con rùa chậm.' },
      ] },
      { word: 'Tomato', ipa: '/təˈmɑːtəʊ/', vietnamese: 'Cà chua', emoji: '🍅', examples: [
        { en: 'The tomato is red.', vi: 'Quả cà chua màu đỏ.' },
      ] },
    ],
    practiceSentences: [
      { en: 'The tiger sits under a tree.', vi: 'Con hổ ngồi dưới gốc cây.' },
      { en: 'The turtle sees a train.', vi: 'Con rùa thấy đoàn tàu.' },
    ],
  },
  {
    letter: 'U', letterIPA: '/juː/', phonicsSound: '/ʌ/',
    words: [
      { word: 'Umbrella', ipa: '/ʌmˈbrelə/', vietnamese: 'Cái ô', emoji: '☂️', examples: [
        { en: 'I use an umbrella in the rain.', vi: 'Tớ dùng ô khi trời mưa.' },
      ] },
      { word: 'Unicorn', ipa: '/ˈjuːnɪkɔːn/', vietnamese: 'Kỳ lân', emoji: '🦄', examples: [
        { en: 'The unicorn is magic.', vi: 'Kỳ lân thần kỳ.' },
      ] },
      { word: 'Uncle', ipa: '/ˈʌŋkl/', vietnamese: 'Chú/Bác', emoji: '👨', examples: [
        { en: 'My uncle is funny.', vi: 'Chú của tớ vui tính.' },
      ] },
    ],
    practiceSentences: [
      { en: 'The unicorn has an umbrella.', vi: 'Kỳ lân có một cái ô.' },
      { en: 'My uncle holds the umbrella.', vi: 'Chú tớ cầm cái ô.' },
    ],
  },
  {
    letter: 'V', letterIPA: '/viː/', phonicsSound: '/v/',
    words: [
      { word: 'Violin', ipa: '/ˌvaɪəˈlɪn/', vietnamese: 'Đàn vĩ cầm', emoji: '🎻', examples: [
        { en: 'I play the violin.', vi: 'Tớ chơi đàn vĩ cầm.' },
      ] },
      { word: 'Van', ipa: '/væn/', vietnamese: 'Xe tải nhỏ', emoji: '🚐', examples: [
        { en: 'The van is white.', vi: 'Chiếc xe tải màu trắng.' },
      ] },
      { word: 'Vase', ipa: '/vɑːz/', vietnamese: 'Bình hoa', emoji: '🏺', examples: [
        { en: 'The flower is in the vase.', vi: 'Bông hoa ở trong bình.' },
      ] },
      { word: 'Vegetable', ipa: '/ˈvedʒtəbl/', vietnamese: 'Rau củ', emoji: '🥦', examples: [
        { en: 'I eat vegetables.', vi: 'Tớ ăn rau củ.' },
      ] },
    ],
    practiceSentences: [
      { en: 'The vase is in the van.', vi: 'Bình hoa ở trong xe tải.' },
      { en: 'I play the violin very well.', vi: 'Tớ chơi vĩ cầm rất giỏi.' },
    ],
  },
  {
    letter: 'W', letterIPA: '/ˈdʌbljuː/', phonicsSound: '/w/',
    words: [
      { word: 'Whale', ipa: '/weɪl/', vietnamese: 'Cá voi', emoji: '🐳', examples: [
        { en: 'The whale is huge.', vi: 'Cá voi khổng lồ.' },
      ] },
      { word: 'Watch', ipa: '/wɒtʃ/', vietnamese: 'Đồng hồ', emoji: '⌚', examples: [
        { en: 'I look at my watch.', vi: 'Tớ nhìn đồng hồ.' },
      ] },
      { word: 'Water', ipa: '/ˈwɔːtə/', vietnamese: 'Nước', emoji: '💧', examples: [
        { en: 'I drink water.', vi: 'Tớ uống nước.' },
      ] },
      { word: 'Window', ipa: '/ˈwɪndəʊ/', vietnamese: 'Cửa sổ', emoji: '🪟', examples: [
        { en: 'I open the window.', vi: 'Tớ mở cửa sổ.' },
      ] },
      { word: 'Wolf', ipa: '/wʊlf/', vietnamese: 'Chó sói', emoji: '🐺', examples: [
        { en: 'The wolf howls at night.', vi: 'Con sói hú vào ban đêm.' },
      ] },
    ],
    practiceSentences: [
      { en: 'The whale swims in the water.', vi: 'Cá voi bơi trong nước.' },
      { en: 'The wolf looks through the window.', vi: 'Con sói nhìn qua cửa sổ.' },
    ],
  },
  {
    letter: 'X', letterIPA: '/eks/', phonicsSound: '/ks/',
    words: [
      { word: 'Xylophone', ipa: '/ˈzaɪləfəʊn/', vietnamese: 'Đàn mộc cầm', emoji: '🎹', examples: [
        { en: 'I play the xylophone.', vi: 'Tớ chơi đàn mộc cầm.' },
      ] },
      { word: 'Fox', ipa: '/fɒks/', vietnamese: 'Con cáo', emoji: '🦊', examples: [
        { en: 'The fox has a bushy tail.', vi: 'Con cáo có cái đuôi xù.' },
      ] },
      { word: 'Box', ipa: '/bɒks/', vietnamese: 'Cái hộp', emoji: '📦', examples: [
        { en: 'The toy is in the box.', vi: 'Món đồ chơi ở trong hộp.' },
      ] },
      { word: 'Six', ipa: '/sɪks/', vietnamese: 'Số sáu', emoji: '6️⃣', examples: [
        { en: 'I have six pencils.', vi: 'Tớ có sáu cây bút chì.' },
      ] },
    ],
    practiceSentences: [
      { en: 'The fox has six boxes.', vi: 'Con cáo có sáu cái hộp.' },
      { en: 'I play the xylophone in a box.', vi: 'Tớ chơi đàn mộc cầm bên cái hộp.' },
    ],
  },
  {
    letter: 'Y', letterIPA: '/waɪ/', phonicsSound: '/j/',
    words: [
      { word: 'Yo-yo', ipa: '/ˈjəʊ jəʊ/', vietnamese: 'Con quay yo-yo', emoji: '🪀', examples: [
        { en: 'I play with my yo-yo.', vi: 'Tớ chơi yo-yo.' },
      ] },
      { word: 'Yak', ipa: '/jæk/', vietnamese: 'Bò Tây Tạng', emoji: '🐂', examples: [
        { en: 'The yak has long hair.', vi: 'Con bò Tây Tạng có lông dài.' },
      ] },
      { word: 'Yogurt', ipa: '/ˈjɒɡət/', vietnamese: 'Sữa chua', emoji: '🍶', examples: [
        { en: 'I eat yogurt.', vi: 'Tớ ăn sữa chua.' },
      ] },
      { word: 'Yellow', ipa: '/ˈjeləʊ/', vietnamese: 'Màu vàng', emoji: '🟡', examples: [
        { en: 'The sun is yellow.', vi: 'Mặt trời màu vàng.' },
      ] },
    ],
    practiceSentences: [
      { en: 'I eat yellow yogurt.', vi: 'Tớ ăn sữa chua màu vàng.' },
      { en: 'The yak plays with a yo-yo.', vi: 'Con bò chơi yo-yo.' },
    ],
  },
  {
    letter: 'Z', letterIPA: '/zed/', phonicsSound: '/z/',
    words: [
      { word: 'Zebra', ipa: '/ˈzebrə/', vietnamese: 'Ngựa vằn', emoji: '🦓', examples: [
        { en: 'The zebra has stripes.', vi: 'Ngựa vằn có sọc.' },
      ] },
      { word: 'Zoo', ipa: '/zuː/', vietnamese: 'Sở thú', emoji: '🦁', examples: [
        { en: 'I see animals at the zoo.', vi: 'Tớ thấy các con vật ở sở thú.' },
      ] },
      { word: 'Zip', ipa: '/zɪp/', vietnamese: 'Khóa kéo', emoji: '🧥', examples: [
        { en: 'I zip up my jacket.', vi: 'Tớ kéo khóa áo khoác.' },
      ] },
      { word: 'Zero', ipa: '/ˈzɪərəʊ/', vietnamese: 'Số không', emoji: '0️⃣', examples: [
        { en: 'Ten minus ten is zero.', vi: 'Mười trừ mười là không.' },
      ] },
    ],
    practiceSentences: [
      { en: 'The zebra lives in the zoo.', vi: 'Ngựa vằn sống ở sở thú.' },
      { en: 'I see zero zebras here.', vi: 'Tớ thấy không con ngựa vằn nào ở đây.' },
    ],
  },
];

export const findAlphabetLetter = (letter: string): AlphabetLetter | undefined =>
  ALPHABET_DATA.find((entry) => entry.letter.toUpperCase() === letter.toUpperCase());
