// 零外部 import，純型別定義（符合規格 2.3 與 2.4，不含任何真實個資或機密值）

export type Mood = 'ready' | 'distracted' | 'angry' | 'tired';
export type Difficulty = 'easy' | 'normal' | 'challenge';
export type RedemptionStatus = 'pending' | 'approved' | 'completed' | 'cancelled';
export type TaskId = string;
export type ChildId = string; // 序位代號，例如 'child1' (老大) | 'child2' (老二)

export interface Task {
  id: TaskId;
  icon: string;
  title: string;
  category: string;
  target: 'both' | ChildId;
  difficulty: Difficulty;
  minutes: number; // 1–15
  flowers: number; // 預設得點
  maxDaily: number;
  recommend: boolean;
  active: boolean;
  desc: string;
  promptText: string;
  updatedAt?: number;
}

export interface Reward {
  id: string;
  icon: string;
  title: string;
  category: string;
  cost: number;
  target: 'both' | ChildId;
  limit: number; // 0 = 不限
  budget?: number | '';
  active: boolean;
  note?: string;
  updatedAt?: number;
}

export interface Session {
  id: string;
  date: string; // YYYY-MM-DD
  task: TaskId;
  taskTitle?: string;
  level: string;
  planned: number;
  elapsed: number; // 秒
  distractions: number;
  earned: number;
  created?: number;
  updatedAt?: number;
}

export interface Redemption {
  id: string;
  date: string;
  rewardId: string;
  title?: string;
  cost: number;
  status: RedemptionStatus;
  pointsDeducted: boolean;
  created?: number;
  updatedAt?: number;
}

export interface Log {
  id: string;
  date: string;
  context?: string;
  mood?: string;
  energy?: string;
  distractions?: number | '';
  reminders?: number | '';
  homework?: number | '';
  calmMinutes?: number | '';
  note?: string;
  bed?: string;
  asleep?: string;
  wake?: string;
  sleepHours?: number | '';
  snore?: string;
  sleepy?: string;
  created?: number;
  updatedAt?: number;
}

export interface MoodPlanSlot {
  preferredIds: TaskId[];
  fallbackCategory: string;
}

export interface ChildConfig {
  dailyCount: Record<Mood, number>;
  moodPlan: Record<Mood, MoodPlanSlot[]>;
}

export interface Child {
  profile: {
    nickname?: string; // 至多一個暱稱（預設顯示序位如「老大」「老二」，無生日/年齡/年級/性別）
  };
  config?: ChildConfig;
  points: number; // 由 2.3(a) computePoints 重算
  initialPointsBonus: number;
  focusCategory: string | 'auto';
  sessions: Session[];
  redemptions: Redemption[];
  logs: Log[];
  checks: Record<string, Mood>;
  extra?: string;
}

export interface DB {
  version: number;
  updatedAt: number;
  deletedIds?: string[];
  auth: {
    familyHash: string;
    parentHash: string;
    updatedAt?: number;
  };
  tasks: Task[];
  rewards: Reward[];
  children: Record<ChildId, Child>;
}

export interface RecommendSignals {
  childId: ChildId;
  mood: Mood;
  yesterdayTasks: Set<TaskId>;
  recentHighDistract: Set<TaskId>;
  focusCategory: string | 'auto';
  tasks: Task[];
}
