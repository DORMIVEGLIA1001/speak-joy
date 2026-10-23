export interface Outfit {
  id: string;
  name: string;
  vietnameseName: string;
  description: string;
  cost: number;
  unlocked: boolean;
  color: string;
  iconName: string;
}

export interface Question {
  id: string;
  type: 'match' | 'speak' | 'multiple';
  prompt: string;
  vietnamesePrompt: string;
  options?: string[];
  correctAnswer: string;
  vietnameseAnswerExplanation?: string;
  spokenPhonetics?: string;
}

export interface Lesson {
  id: string;
  title: string;
  vietnameseTitle: string;
  points: number;
  questions: Question[];
  completed: boolean;
  locked: boolean;
  type: 'lesson' | 'chest' | 'trophy';
}

export interface Quest {
  id: string;
  title: string;
  target: number;
  current: number;
  rewardGems: number;
  rewardXp: number;
  completed: boolean;
}

export interface LeaderboardUser {
  id: string;
  name: string;
  score: number;
  avatarColor: string;
  avatarUrl?: string;
  rank: number;
  isCurrentPlayer?: boolean;
}

export interface AppState {
  currentTab: string; // 'hoc' | 'chucai' | 'banggxephang' | 'nhiemvu' | 'cuahang' | 'hosor'
  viewMode: 'app' | 'docs'; // Dual modes: Interactive children app or design token plan docs
  gems: number;
  streak: number;
  hearts: number;
  xp: number;
  selectedOutfitId: string;
  outfits: Outfit[];
  quests: Quest[];
  lessons: Lesson[];
  leaderboard: LeaderboardUser[];
  activeLessonId: string | null;
}
