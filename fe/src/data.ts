import { Outfit, Lesson, Quest, LeaderboardUser } from './types';

export const INITIAL_OUTFITS: Outfit[] = [
  {
    id: 'original',
    name: 'Classic Golden Sun',
    vietnameseName: 'Mặt Trời Nguyên Bản',
    description: 'Tia nắng vàng ấm áp và nụ cười rạng rỡ của Người Bạn Mặt Trời.',
    cost: 0,
    unlocked: true,
    color: '#ffc800',
    iconName: 'sun-classic',
  },
  {
    id: 'aodai',
    name: 'Vietnamese Ao Dai',
    vietnameseName: 'Áo Dài Truyền Thống',
    description: 'Chiếc áo dài màu đỏ thêu tơ vàng đón Tết cùng trẻ em Việt Nam.',
    cost: 0,
    unlocked: true,
    color: '#ff4b4b',
    iconName: 'sun-aodai',
  },
  {
    id: 'explorer',
    name: 'Solar Explorer',
    vietnameseName: 'Thám Hiểm Hệ Mặt Trời',
    description: 'Mũ tai bèo thám hiểm cùng la bàn rực sáng để cùng bé khám phá từ vựng.',
    cost: 0,
    unlocked: true,
    color: '#ff9600',
    iconName: 'sun-explorer',
  },
  {
    id: 'schoolboy',
    name: 'Smart Sunshine',
    vietnameseName: 'Học Sinh Thanh Lịch',
    description: 'Thắt nơ đỏ thanh lịch và đeo cặp kính thư sinh siêu thông minh.',
    cost: 0,
    unlocked: true,
    color: '#1cb0f6',
    iconName: 'sun-student',
  },
  {
    id: 'panda',
    name: 'Panda Sunshine',
    vietnameseName: 'Hóa Trang Gấu Trúc',
    description: 'Khi Người Bạn Mặt Trời hóa trang thành chú gấu trúc hai mắt đen tròn trịa.',
    cost: 0,
    unlocked: true,
    color: '#37464f',
    iconName: 'sun-panda',
  },
];

export const INITIAL_QUESTS: Quest[] = [
  {
    id: 'xp_quest',
    title: 'Kiếm 10 KN (Kinh nghiệm)',
    target: 10,
    current: 0,
    rewardGems: 20,
    rewardXp: 5,
    completed: false,
  },
  {
    id: 'pronounce_quest',
    title: 'Luyện nói đúng 2 câu tiếng Anh',
    target: 2,
    current: 0,
    rewardGems: 15,
    rewardXp: 10,
    completed: false,
  },
  {
    id: 'perfect_lesson',
    title: 'Hoàn thành 1 bài học 100% đúng',
    target: 1,
    current: 0,
    rewardGems: 30,
    rewardXp: 15,
    completed: false,
  },
];

export const INITIAL_LEADERBOARD: LeaderboardUser[] = [
  { id: '1', name: 'Bảo Nam', score: 620, avatarColor: '#58cc02', rank: 1 },
  { id: '2', name: 'Minh Thư', score: 540, avatarColor: '#1cb0f6', rank: 2 },
  { id: 'player_id', name: 'Bé Tập Sự (Bạn)', score: 0, avatarColor: '#ff9600', rank: 3, isCurrentPlayer: true },
  { id: '4', name: 'Gia Huy', score: 450, avatarColor: '#ff4b4b', rank: 4 },
  { id: '5', name: 'Khánh Vy', score: 380, avatarColor: '#84d8ff', rank: 5 },
];

export const INITIAL_LESSONS: Lesson[] = [
  {
    id: 'lesson1',
    title: 'Lesson 1: Greetings',
    vietnameseTitle: 'Mời khách xơi nước',
    points: 10,
    completed: false,
    locked: false,
    type: 'lesson',
    questions: [
      {
        id: 'q1_1',
        type: 'multiple',
        prompt: 'Which English word means "Nước"?',
        vietnamesePrompt: 'Chọn từ tiếng Anh đúng với nghĩa "Nước".',
        options: ['Water', 'Guest', 'Please', 'Family'],
        correctAnswer: 'Water',
        vietnameseAnswerExplanation: 'Water có nghĩa là nước.',
      },
      {
        id: 'q1_2',
        type: 'multiple',
        prompt: 'How do you politely invite a guest to drink water?',
        vietnamesePrompt: 'Khi khách đến chơi nhà, câu nào lịch sự nhất để mời khách uống nước?',
        options: ['Give me water.', 'Would you like some water, please?', 'Drink water now!', 'Who is that?'],
        correctAnswer: 'Would you like some water, please?',
        vietnameseAnswerExplanation: '"Would you like some water, please?" là cách mời lịch sự và tự nhiên nhất.',
      },
      {
        id: 'q1_3',
        type: 'speak',
        prompt: 'Would you like some water, please?',
        vietnamesePrompt: 'Nhấn mic và đọc to câu này để luyện mời khách bằng tiếng Anh nhé.',
        correctAnswer: 'would you like some water please',
        spokenPhonetics: '/wʊd juː laɪk sʌm ˈwɔːtər pliːz/',
      },
    ],
  },
  {
    id: 'lesson2',
    title: 'Lesson 2: Alphabet Fun',
    vietnameseTitle: 'Chữ cái vui nhộn',
    points: 15,
    completed: false,
    locked: false,
    type: 'lesson',
    questions: [
      {
        id: 'q2_1',
        type: 'multiple',
        prompt: 'What letter does "Apple" start with?',
        vietnamesePrompt: 'Từ "Apple" bắt đầu bằng chữ cái nào?',
        options: ['Letter B', 'Letter C', 'Letter A', 'Letter D'],
        correctAnswer: 'Letter A',
        vietnameseAnswerExplanation: 'Apple bắt đầu bằng chữ A.',
      },
      {
        id: 'q2_2',
        type: 'speak',
        prompt: 'A is for Apple',
        vietnamesePrompt: 'Nhấn mic và đọc to câu "A is for Apple".',
        correctAnswer: 'a is for apple',
        spokenPhonetics: '/eɪ ɪz fɔːr ˈæpl/',
      },
    ],
  },
  {
    id: 'lesson3',
    title: 'Lesson 3: Pet Animals',
    vietnameseTitle: 'Những chú thú cưng',
    points: 15,
    completed: false,
    locked: false,
    type: 'lesson',
    questions: [
      {
        id: 'q3_1',
        type: 'multiple',
        prompt: 'Which English word means "Con chó"?',
        vietnamesePrompt: 'Chọn từ tiếng Anh đúng với nghĩa "Con chó".',
        options: ['Dog', 'Cat', 'Bird', 'Fish'],
        correctAnswer: 'Dog',
        vietnameseAnswerExplanation: 'Dog có nghĩa là con chó.',
      },
      {
        id: 'q3_2',
        type: 'speak',
        prompt: 'I love my lovely dog and cat',
        vietnamesePrompt: 'Đọc to câu nói về thú cưng của bé.',
        correctAnswer: 'i love my lovely dog and cat',
        spokenPhonetics: '/aɪ lʌv maɪ ˈlʌvli dɔːg ænd kæt/',
      },
    ],
  },
  {
    id: 'chest_node',
    title: 'Phần thưởng đích thực',
    vietnameseTitle: 'Rương kho báu lớn',
    points: 0,
    completed: false,
    locked: false,
    type: 'chest',
    questions: [],
  },
  {
    id: 'lesson4',
    title: 'Lesson 4: Colors',
    vietnameseTitle: 'Sắc màu cuộc sống',
    points: 20,
    completed: false,
    locked: false,
    type: 'lesson',
    questions: [
      {
        id: 'q4_1',
        type: 'multiple',
        prompt: 'What color is Sunny the mascot?',
        vietnamesePrompt: 'Sunny có màu gì nổi bật nhất?',
        options: ['Blue', 'Yellow', 'Green', 'Red'],
        correctAnswer: 'Yellow',
        vietnameseAnswerExplanation: 'Sunny có màu vàng rực rỡ.',
      },
      {
        id: 'q4_2',
        type: 'speak',
        prompt: 'Yellow is my favorite color',
        vietnamesePrompt: 'Nhấn mic và đọc to câu về màu yêu thích.',
        correctAnswer: 'yellow is my favorite color',
        spokenPhonetics: '/ˈjeləʊ ɪz maɪ ˈfeɪvərɪt ˈkʌlər/',
      },
    ],
  },
  {
    id: 'lesson5',
    title: 'Lesson 5: Sweet Fruits',
    vietnameseTitle: 'Trái cây ngọt ngào',
    points: 20,
    completed: false,
    locked: false,
    type: 'lesson',
    questions: [
      {
        id: 'q5_1',
        type: 'multiple',
        prompt: 'What fruit is sweet, round, and orange-colored?',
        vietnamesePrompt: 'Quả nào ngọt, tròn và có màu cam?',
        options: ['Orange', 'Watermelon', 'Lemon', 'Banana'],
        correctAnswer: 'Orange',
        vietnameseAnswerExplanation: 'Orange chính là quả cam.',
      },
      {
        id: 'q5_2',
        type: 'speak',
        prompt: 'I love orange juice',
        vietnamesePrompt: 'Nhấn mic và đọc to câu về nước cam.',
        correctAnswer: 'i love orange juice',
        spokenPhonetics: '/aɪ lʌv ˈɒrɪndʒ dʒuːs/',
      },
    ],
  },
  {
    id: 'lesson6',
    title: 'Lesson 6: My Family',
    vietnameseTitle: 'Gia đình yêu thương',
    points: 20,
    completed: false,
    locked: false,
    type: 'lesson',
    questions: [
      {
        id: 'q6_1',
        type: 'multiple',
        prompt: 'Which English word means "Mẹ"?',
        vietnamesePrompt: 'Chọn từ tiếng Anh đúng với nghĩa "Mẹ".',
        options: ['Father', 'Mother', 'Baby', 'Sister'],
        correctAnswer: 'Mother',
        vietnameseAnswerExplanation: 'Mother có nghĩa là mẹ.',
      },
      {
        id: 'q6_2',
        type: 'speak',
        prompt: 'I love my happy family',
        vietnamesePrompt: 'Nhấn mic và nói câu về gia đình của bé.',
        correctAnswer: 'i love my happy family',
        spokenPhonetics: '/aɪ lʌv maɪ ˈhæpi ˈfæməli/',
      },
    ],
  },
  {
    id: 'lesson_alphabet2',
    title: 'Lesson 7: Letters E, F, G, H',
    vietnameseTitle: 'Chữ cái E, F, G, H',
    points: 15,
    completed: false,
    locked: false,
    type: 'lesson',
    questions: [
      {
        id: 'q_alp2_1',
        type: 'multiple',
        prompt: 'What letter does "Elephant" start with?',
        vietnamesePrompt: 'Từ "Elephant" bắt đầu bằng chữ cái nào?',
        options: ['Letter F', 'Letter G', 'Letter E', 'Letter H'],
        correctAnswer: 'Letter E',
        vietnameseAnswerExplanation: 'Elephant bắt đầu bằng chữ E.',
      },
      {
        id: 'q_alp2_2',
        type: 'speak',
        prompt: 'E is for Elephant',
        vietnamesePrompt: 'Nhấn mic và đọc to câu "E is for Elephant".',
        correctAnswer: 'e is for elephant',
        spokenPhonetics: '/iː ɪz fɔːr ˈelɪfənt/',
      },
    ],
  },
  {
    id: 'lesson_alphabet3',
    title: 'Lesson 8: Letters I, J, K, L',
    vietnameseTitle: 'Chữ cái I, J, K, L',
    points: 15,
    completed: false,
    locked: false,
    type: 'lesson',
    questions: [
      {
        id: 'q_alp3_1',
        type: 'multiple',
        prompt: 'What letter does "Ice cream" start with?',
        vietnamesePrompt: 'Từ "Ice cream" bắt đầu bằng chữ cái nào?',
        options: ['Letter I', 'Letter J', 'Letter K', 'Letter L'],
        correctAnswer: 'Letter I',
        vietnameseAnswerExplanation: 'Ice cream bắt đầu bằng chữ I.',
      },
      {
        id: 'q_alp3_2',
        type: 'speak',
        prompt: 'I love sweet ice cream',
        vietnamesePrompt: 'Nhấn mic và đọc to câu về kem ngọt.',
        correctAnswer: 'i love sweet ice cream',
        spokenPhonetics: '/aɪ lʌv swiːt ˈaɪs kriːm/',
      },
    ],
  },
  {
    id: 'trophy_node',
    title: 'Cúp vinh danh phần 1',
    vietnameseTitle: 'Cúp bé giỏi ngoan',
    points: 0,
    completed: false,
    locked: false,
    type: 'trophy',
    questions: [],
  },
];

let sharedAudioCtx: AudioContext | null = null;

export function playAppSound(
  frequency: number,
  type: 'sine' | 'sawtooth' | 'triangle' | 'square',
  duration: number = 0.15
) {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    if (!sharedAudioCtx) {
      sharedAudioCtx = new AudioContextClass();
    }

    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }

    const oscillator = sharedAudioCtx.createOscillator();
    const gainNode = sharedAudioCtx.createGain();

    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gainNode.gain.setValueAtTime(0.08, sharedAudioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, sharedAudioCtx.currentTime + duration);

    oscillator.connect(gainNode);
    gainNode.connect(sharedAudioCtx.destination);

    oscillator.start();
    oscillator.stop(sharedAudioCtx.currentTime + duration);
  } catch (error) {
    console.warn('Audio feedback blocked by browser policies or unsupported:', error);
  }
}

export function playCorrectSound() {
  playAppSound(523.25, 'triangle', 0.1);
  setTimeout(() => {
    playAppSound(659.25, 'triangle', 0.1);
  }, 100);
  setTimeout(() => {
    playAppSound(783.99, 'triangle', 0.25);
  }, 200);
}

export function playIncorrectSound() {
  playAppSound(220.0, 'sawtooth', 0.2);
  setTimeout(() => {
    playAppSound(196.0, 'sawtooth', 0.35);
  }, 150);
}

export function playCoinSound() {
  for (let i = 0; i < 3; i += 1) {
    setTimeout(() => {
      playAppSound(987.77, 'sine', 0.08);
    }, i * 90);
  }
}

export function playStreakSound() {
  playAppSound(261.63, 'sine', 0.08);
  setTimeout(() => playAppSound(329.63, 'sine', 0.08), 80);
  setTimeout(() => playAppSound(392.00, 'sine', 0.15), 160);
}

export function playLevelUpSound() {
  playAppSound(349.23, 'triangle', 0.1);
  setTimeout(() => playAppSound(440.00, 'triangle', 0.1), 100);
  setTimeout(() => playAppSound(523.25, 'triangle', 0.1), 200);
  setTimeout(() => playAppSound(698.46, 'triangle', 0.35), 300);
}

export function playHeartbeatSound() {
  playAppSound(100.0, 'sine', 0.12);
  setTimeout(() => playAppSound(100.0, 'sine', 0.12), 150);
}

export function playMagicSparkleSound() {
  for (let i = 0; i < 5; i += 1) {
    setTimeout(() => {
      playAppSound(800 + i * 150, 'sine', 0.05);
    }, i * 50);
  }
}

