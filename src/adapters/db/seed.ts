// 去識別化種子資料（僅含「彗瑄/邦盛」序位代號與通用溫和語氣之任務/獎勵結構，不含任何真實姓名或個資）
import type { DB, Reward, Task } from '../../domain/types.ts';
import { DEFAULT_CHILD_CONFIGS } from '../../domain/rules.ts';

export const SEED_TASKS: Task[] = [
  // 專注力訓練
  { id: 't-focus-5m', icon: '🎯', title: '🎯 專心完成 5 分鐘任務', category: '專注力訓練', target: 'both', difficulty: 'easy', minutes: 5, flowers: 2, maxDaily: 1, recommend: true, active: true,
    desc: '設定 5 分鐘計時器，專注完成一項小活動。',
    promptText: '「先選一件事情，計時結束再休息；分心了也沒關係，溫柔指回來就好。」' },
  { id: 't-focus-10m', icon: '⏳', title: '⏳ 專心完成 10 分鐘任務', category: '專注力訓練', target: 'both', difficulty: 'normal', minutes: 10, flowers: 3, maxDaily: 1, recommend: true, active: true,
    desc: '閱讀、寫字或練習 10 分鐘。',
    promptText: '「我們穩定專心 10 分鐘，完成後一起打勾休息。」' },
  { id: 't-focus-read', icon: '📖', title: '📖 閱讀小偵探', category: '專注力訓練', target: 'child1', difficulty: 'normal', minutes: 10, flowers: 3, maxDaily: 1, recommend: true, active: true,
    desc: '閱讀 10 分鐘並分享一個故事重點。',
    promptText: '「選一本喜歡的書，讀完跟家人分享一個你印象最深的地方。」' },
  { id: 't-focus-2steps', icon: '👂', title: '👂 聽指令做兩件事', category: '專注力訓練', target: 'child2', difficulty: 'easy', minutes: 5, flowers: 2, maxDaily: 1, recommend: true, active: true,
    desc: '聽完兩項簡短指令後，依順序完成。',
    promptText: '「你可以先告訴我，等一下要依序完成哪兩件事嗎？」' },
  { id: 't-focus-return', icon: '🌟', title: '🌟 分心回來小高手', category: '專注力訓練', target: 'child2', difficulty: 'easy', minutes: 5, flowers: 2, maxDaily: 1, recommend: true, active: true,
    desc: '分心時接受提醒並重新回到原本任務。',
    promptText: '「分心沒關係，發現後願意再回來就是最棒的練習！」' },

  // 作業習慣
  { id: 't-hw-prep', icon: '✏️', title: '✏️ 自己準備作業用品', category: '作業習慣', target: 'both', difficulty: 'easy', minutes: 3, flowers: 2, maxDaily: 1, recommend: true, active: true,
    desc: '開始前準備好鉛筆、橡皮擦與課本，桌面保持清爽。',
    promptText: '「桌上只留現在要用的文具，讓開始變得簡單。」' },
  { id: 't-hw-chunk', icon: '📝', title: '📝 完成一小段作業', category: '作業習慣', target: 'both', difficulty: 'normal', minutes: 10, flowers: 3, maxDaily: 1, recommend: true, active: true,
    desc: '把作業拆成小段，完成約定的段落。',
    promptText: '「我們先完成這一小段就好，寫完就休息伸展。」' },
  { id: 't-hw-check', icon: '🔎', title: '🔎 作業完成自主檢查', category: '作業習慣', target: 'both', difficulty: 'normal', minutes: 5, flowers: 2, maxDaily: 1, recommend: true, active: true,
    desc: '自己檢查漏寫、題號及訂正項目。',
    promptText: '「不用寫最快，自己檢查清楚最重要。」' },
  { id: 't-hw-contact', icon: '📒', title: '📒 聯絡簿整理小達人', category: '作業習慣', target: 'child2', difficulty: 'normal', minutes: 8, flowers: 3, maxDaily: 1, recommend: true, active: true,
    desc: '確認聯絡簿內容完整、逐項核對打勾。',
    promptText: '「我們對照聯絡簿一項一項打勾，完成後心裡更踏實。」' },

  // 情緒管理
  { id: 't-emo-temp', icon: '💛', title: '💛 今天的心情溫度計', category: '情緒管理', target: 'both', difficulty: 'easy', minutes: 3, flowers: 2, maxDaily: 1, recommend: true, active: true,
    desc: '說出今天的情緒感覺及原因。',
    promptText: '「不管開心、累或煩躁都可以說出來，每個感覺都被接納。」' },
  { id: 't-emo-pause', icon: '🌬️', title: '🌬️ 生氣先暫停', category: '情緒管理', target: 'both', difficulty: 'normal', minutes: 5, flowers: 3, maxDaily: 1, recommend: true, active: true,
    desc: '不高興時先暫停動作，進行三次慢呼吸或喝口水。',
    promptText: '「可以生氣，但我們先讓身體慢下來，喝口水再說。」' },
  { id: 't-emo-speak', icon: '🗣️', title: '🗣️ 用說的表達需求', category: '情緒管理', target: 'child2', difficulty: 'normal', minutes: 5, flowers: 3, maxDaily: 1, recommend: true, active: true,
    desc: '遇到困難時用語言說出需要，不丟物品或大喊。',
    promptText: '「你可以直接告訴我需要什麼幫忙，例如『請提示我第一步』。」' },
  { id: 't-emo-happy', icon: '😊', title: '😊 今天一件開心事', category: '情緒管理', target: 'both', difficulty: 'easy', minutes: 3, flowers: 1, maxDaily: 1, recommend: true, active: true,
    desc: '分享今天一件值得開心或感謝的小事。',
    promptText: '「今天有哪一件小事讓你覺得溫暖或開心呢？」' },

  // 自我控制
  { id: 't-ctrl-light', icon: '🚦', title: '🚦 紅綠燈停看聽', category: '自我控制', target: 'child2', difficulty: 'easy', minutes: 5, flowers: 2, maxDaily: 1, recommend: true, active: true,
    desc: '透過紅燈停、黃燈想、綠燈動練習先看訊號再行動。',
    promptText: '「紅燈先停住，想好了再行動，錯了我們一起笑一笑重來。」' },
  { id: 't-ctrl-wait', icon: '🎲', title: '🎲 輪流等待小高手', category: '自我控制', target: 'both', difficulty: 'easy', minutes: 8, flowers: 2, maxDaily: 1, recommend: true, active: true,
    desc: '互動或遊戲時練習輪流與等待別人說完。',
    promptText: '「還沒輪到自己時先觀察，你有等別人說完真的很棒。」' },

  // 生活自理
  { id: 't-life-bag', icon: '🎒', title: '🎒 睡前書包小隊長', category: '生活自理', target: 'both', difficulty: 'easy', minutes: 5, flowers: 2, maxDaily: 1, recommend: true, active: true,
    desc: '睡前依照隔日課表檢查書包與學用品。',
    promptText: '「明天需要帶什麼？我們花 3 分鐘一起確認。」' },
  { id: 't-life-relax', icon: '🌙', title: '🌙 睡前放鬆小儀式', category: '生活自理', target: 'child1', difficulty: 'easy', minutes: 8, flowers: 2, maxDaily: 1, recommend: true, active: true,
    desc: '完成盥洗及 5～10 分鐘溫和安靜活動，準時就寢。',
    promptText: '「我們安靜聽首歌或伸展，讓身體舒服準備睡覺。」' },
  { id: 't-life-stretch', icon: '☀', title: '☀ 醒醒身體小伸展', category: '生活自理', target: 'both', difficulty: 'easy', minutes: 5, flowers: 2, maxDaily: 1, recommend: true, active: true,
    desc: '輕鬆伸展與喝水，觀察精神再決定今日練習量。',
    promptText: '「先站起來動一動、喝口水；如果還是很累就先休息。」' },

  // 親子互動
  { id: 't-fam-read', icon: '📚', title: '📚 親子共讀 10 分鐘', category: '親子互動', target: 'both', difficulty: 'easy', minutes: 10, flowers: 3, maxDaily: 1, recommend: true, active: true,
    desc: '和家長一起閱讀、輕鬆聊聊故事內容。',
    promptText: '「我們一起讀這段故事，享受舒服的共讀時光。」' },
  { id: 't-fam-game', icon: '🧩', title: '🧩 合作完成小任務', category: '親子互動', target: 'both', difficulty: 'normal', minutes: 10, flowers: 3, maxDaily: 1, recommend: true, active: true,
    desc: '一起拼圖、桌遊或合作整理一個小角落。',
    promptText: '「我們分工合作，一起把這件事完成吧！」' }
];

export const SEED_REWARDS: Reward[] = [
  { id: 'r-daily-song', icon: '🎵', title: '🎵 指定一首喜歡的歌一起聽', category: '日常小確幸', cost: 10, target: 'both', limit: 0, budget: '', active: true, note: '' },
  { id: 'r-daily-story', icon: '📖', title: '📖 選擇親子共讀故事', category: '日常小確幸', cost: 15, target: 'both', limit: 0, budget: '', active: true, note: '' },
  { id: 'r-daily-game', icon: '🎮', title: '🎮 選擇家庭小遊戲', category: '日常小確幸', cost: 15, target: 'both', limit: 0, budget: '', active: true, note: '' },
  { id: 'r-choice-breakfast', icon: '🍳', title: '🍳 選擇週末早餐菜單', category: '生活選擇權', cost: 20, target: 'both', limit: 0, budget: '', active: true, note: '' },
  { id: 'r-fam-boardgame', icon: '🎲', title: '🎲 親子桌遊 20 分鐘', category: '親子陪伴', cost: 25, target: 'both', limit: 0, budget: '', active: true, note: '額外特別安排，不取代日常基本陪伴' },
  { id: 'r-fam-snack', icon: '🍪', title: '🍪 親子一起製作小點心', category: '親子陪伴', cost: 30, target: 'both', limit: 0, budget: '', active: true, note: '' },
  { id: 'r-choice-movie', icon: '🎬', title: '🎬 決定一次家庭電影', category: '生活選擇權', cost: 30, target: 'both', limit: 0, budget: '', active: true, note: '' },
  { id: 'r-outdoor-park', icon: '🌳', title: '🌳 指定一次公園活動', category: '戶外活動', cost: 35, target: 'both', limit: 0, budget: '', active: true, note: '' },
  { id: 'r-item-stationery', icon: '🎀', title: '🎀 挑選小貼紙或文具', category: '實體獎勵', cost: 40, target: 'both', limit: 0, budget: 100, active: true, note: '' },
  { id: 'r-fam-date', icon: '❤️', title: '❤️ 與家長專屬約會 30 分鐘', category: '親子陪伴', cost: 40, target: 'both', limit: 0, budget: '', active: true, note: '額外特別安排，不取代日常基本陪伴' },
  { id: 'r-item-book', icon: '📚', title: '📚 挑選一本喜歡的課外書', category: '實體獎勵', cost: 50, target: 'both', limit: 0, budget: 350, active: true, note: '' },
  { id: 'r-item-craft', icon: '🎁', title: '🎁 小型積木或手作材料包', category: '實體獎勵', cost: 60, target: 'both', limit: 0, budget: 450, active: true, note: '' },
  { id: 'r-outdoor-weekend', icon: '🚲', title: '🚲 週末特別戶外活動', category: '戶外活動', cost: 70, target: 'both', limit: 0, budget: '', active: true, note: '' },
  { id: 'r-outdoor-trip', icon: '🎡', title: '🎡 家庭特別日行程選擇權', category: '戶外活動', cost: 80, target: 'both', limit: 0, budget: '', active: true, note: '' }
];

export function createInitialDB(familyHash: string, parentHash: string, now: number): DB {
  return {
    version: 1,
    updatedAt: now,
    deletedIds: [],
    auth: {
      familyHash,
      parentHash,
      updatedAt: now
    },
    tasks: structuredClone(SEED_TASKS),
    rewards: structuredClone(SEED_REWARDS),
    children: {
      child1: {
        profile: { nickname: '彗瑄' },
        config: structuredClone(DEFAULT_CHILD_CONFIGS.child1),
        points: 0,
        initialPointsBonus: 0,
        focusCategory: 'auto',
        sessions: [],
        redemptions: [],
        logs: [],
        checks: {},
        extra: ''
      },
      child2: {
        profile: { nickname: '邦盛' },
        config: structuredClone(DEFAULT_CHILD_CONFIGS.child2),
        points: 0,
        initialPointsBonus: 0,
        focusCategory: 'auto',
        sessions: [],
        redemptions: [],
        logs: [],
        checks: {},
        extra: ''
      }
    }
  };
}
