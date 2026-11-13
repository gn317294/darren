const $ = s => document.querySelector(s);
const key = 'xu-family-garden-v1';
const sessionLoginKey = 'xu-garden-logged-in';
const sessionParentKey = 'xu-garden-parent-unlocked';
const cloudConfigKey = 'xu-garden-cloud-config';
const DEFAULT_CLOUD_URL = 'https://script.google.com/macros/s/AKfycbwfSDogknZ_sQpZUa14MKto_1TRShc9FZgWOWo_ikoT6aHPDwuMHnd4j4gtIm8pv0FJ/exec';
const DEFAULT_CLOUD_TOKEN = 'darren0937701291';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei' }).format(new Date());

function hashPin(str) {
  let h1 = 0xdeadbeef ^ 0x13579bdf;
  let h2 = 0x41c6ce57 ^ 0x2468ace0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const DEFAULT_FAMILY_PIN = '2026';
const DEFAULT_PARENT_PIN = '9999';

const CATEGORY_META = {
  '專注力訓練': { code: 'A', cls: 'cat-focus', icon: '🎯' },
  '作業習慣': { code: 'B', cls: 'cat-homework', icon: '✏️' },
  '情緒管理': { code: 'C', cls: 'cat-emotion', icon: '💛' },
  '自我控制': { code: 'D', cls: 'cat-control', icon: '🚦' },
  '生活自理': { code: 'E', cls: 'cat-life', icon: '🎒' },
  '親子互動': { code: 'F', cls: 'cat-family', icon: '📚' }
};

// 保留原有 5 大基礎任務與 2 項預設自訂任務 + 新增六大類 33 項任務（共 40 項，不重複）
const SYSTEM_TASKS_SEED = [
  // 原有 5 大核心任務（完整保留 ID 以相容歷史打卡紀錄）
  { id: 'focus', icon: '⌕', title: '小小專注探險', category: '專注力訓練', target: 'both', difficulty: 'easy', minutes: 5, flowers: 2, maxDaily: 1, recommend: true, active: true,
    desc: '一次只做一小步，分心了就溫柔地回來。',
    promptText: '「我們先做這一小步，我在旁邊陪你；分心沒關係，發現後回來就很棒。」' },
  { id: 'stop', icon: '◉', title: '紅綠燈小隊長', category: '自我控制', target: 'both', difficulty: 'easy', minutes: 5, flowers: 2, maxDaily: 1, recommend: true, active: true,
    desc: '綠燈走、紅燈停，練習先看訊號再行動。',
    promptText: '「你剛才有等一下再動，這就是練習！我們再試一輪。」' },
  { id: 'calm', icon: '☁', title: '生氣小雲朵', category: '情緒管理', target: 'both', difficulty: 'easy', minutes: 5, flowers: 3, maxDaily: 1, recommend: true, active: true,
    desc: '先停一下、說感受，再選一個可以做的動作。',
    promptText: '「遇到卡住或覺得不合理時，我們先抱抱、喝口水休息一下，準備好再看第一步。」' },
  { id: 'homework', icon: '✎', title: '作業起步儀式', category: '作業習慣', target: 'both', difficulty: 'easy', minutes: 5, flowers: 2, maxDaily: 1, recommend: true, active: true,
    desc: '清出桌面、用小白板與計時器，讓開始變得簡單。',
    promptText: '「用計時器先做這一小段，完成就在小白板打勾！」' },
  { id: 'move', icon: '☀', title: '醒醒身體小伸展', category: '生活自理', target: 'both', difficulty: 'easy', minutes: 5, flowers: 2, maxDaily: 1, recommend: true, active: true,
    desc: '先看看精神，再決定今天適合的練習量。',
    promptText: '「坐久了容易想睡，我們先站起來動一動、喝口水；還是累的話就先休息。」' },
  { id: 'custom-boy-writing', icon: '✍', title: '國字小方格分段練', category: '作業習慣', target: 'boy', difficulty: 'normal', minutes: 8, flowers: 3, maxDaily: 1, recommend: true, active: true,
    desc: '用計時器分段寫國字，寫完一小段就休息擊掌。',
    promptText: '「媽媽知道國字寫起來很累，我們用計時器先寫這一行，寫完馬上擊掌！」' },

  // A. 專注力訓練（6 項）
  { id: 'sys-a1', icon: '🎯', title: '🎯 專心完成5分鐘任務', category: '專注力訓練', target: 'both', difficulty: 'easy', minutes: 5, flowers: 2, maxDaily: 1, recommend: true, active: true,
    desc: '設定5分鐘計時器，專注完成一項活動',
    promptText: '「先選一件事情，計時結束再休息。」' },
  { id: 'sys-a2', icon: '⏳', title: '⏳ 專心完成10分鐘任務', category: '專注力訓練', target: 'both', difficulty: 'normal', minutes: 10, flowers: 3, maxDaily: 1, recommend: true, active: true,
    desc: '閱讀、寫字或練習10分鐘',
    promptText: '「先選一件事情，計時結束再休息。」' },
  { id: 'sys-a3', icon: '👂', title: '👂 聽指令做兩件事', category: '專注力訓練', target: 'boy', difficulty: 'easy', minutes: 5, flowers: 2, maxDaily: 1, recommend: true, active: true,
    desc: '聽完兩項指令後，依順序完成',
    promptText: '「你可以先告訴我，等一下要完成哪兩件事？」' },
  { id: 'sys-a4', icon: '🔍', title: '🔍 找不同挑戰', category: '專注力訓練', target: 'both', difficulty: 'easy', minutes: 8, flowers: 2, maxDaily: 1, recommend: true, active: true,
    desc: '進行5～10分鐘找不同、迷宮或觀察力遊戲',
    promptText: '「先選一件事情，計時結束再休息。」' },
  { id: 'sys-a5', icon: '📖', title: '📖 閱讀小偵探', category: '專注力訓練', target: 'girl', difficulty: 'normal', minutes: 10, flowers: 3, maxDaily: 1, recommend: true, active: true,
    desc: '閱讀10分鐘並分享一個故事重點',
    promptText: '「先選一本喜歡的故事書，讀完跟爸爸媽媽分享一個最特別的地方。」' },
  { id: 'sys-a6', icon: '🌟', title: '🌟 分心回來小高手', category: '專注力訓練', target: 'boy', difficulty: 'easy', minutes: 5, flowers: 2, maxDaily: 2, recommend: true, active: true,
    desc: '分心時接受提醒並重新回到任務',
    promptText: '「分心沒關係，發現後再回來就很棒。」' },

  // B. 作業習慣（6 項）
  { id: 'sys-b1', icon: '✏️', title: '✏️ 自己準備作業用品', category: '作業習慣', target: 'both', difficulty: 'easy', minutes: 3, flowers: 2, maxDaily: 1, recommend: true, active: true,
    desc: '作業前準備鉛筆、橡皮擦、課本',
    promptText: '「我們先完成這一小段就好。」' },
  { id: 'sys-b2', icon: '📝', title: '📝 完成一小段作業', category: '作業習慣', target: 'both', difficulty: 'normal', minutes: 10, flowers: 3, maxDaily: 2, recommend: true, active: true,
    desc: '把作業拆成小段，完成約定內容',
    promptText: '「我們先完成這一小段就好。」' },
  { id: 'sys-b3', icon: '🔎', title: '🔎 作業完成自主檢查', category: '作業習慣', target: 'both', difficulty: 'normal', minutes: 5, flowers: 2, maxDaily: 1, recommend: true, active: true,
    desc: '檢查漏寫、姓名、題目及訂正',
    promptText: '「不用寫最快，寫清楚最重要。」' },
  { id: 'sys-b4', icon: '📒', title: '📒 聯絡簿整理小達人', category: '作業習慣', target: 'boy', difficulty: 'normal', minutes: 8, flowers: 3, maxDaily: 1, recommend: true, active: true,
    desc: '確認聯絡簿內容完整、字跡可辨識',
    promptText: '「不用寫最快，寫清楚最重要。」' },
  { id: 'sys-b5', icon: '💡', title: '💡 不會先試一試', category: '作業習慣', target: 'both', difficulty: 'normal', minutes: 5, flowers: 2, maxDaily: 1, recommend: true, active: true,
    desc: '遇到困難先嘗試一種方法，再尋求協助',
    promptText: '「不會的地方可以問，但先試試自己的方法。」' },
  { id: 'sys-b6', icon: '🧹', title: '🧹 完成後整理書桌', category: '作業習慣', target: 'both', difficulty: 'easy', minutes: 4, flowers: 2, maxDaily: 1, recommend: true, active: true,
    desc: '作業完成後把文具、課本歸位',
    promptText: '「我們一起把文具跟課本送回自己的家。」' },

  // C. 情緒管理（6 項）
  { id: 'sys-c1', icon: '💛', title: '💛 今天的心情溫度計', category: '情緒管理', target: 'both', difficulty: 'easy', minutes: 3, flowers: 2, maxDaily: 1, recommend: true, active: true,
    desc: '說出今天的情緒及原因',
    promptText: '「你可以說出今天的感覺，不管開心或累都可以分享。」' },
  { id: 'sys-c2', icon: '🌬️', title: '🌬️ 生氣先暫停', category: '情緒管理', target: 'both', difficulty: 'normal', minutes: 5, flowers: 3, maxDaily: 2, recommend: true, active: true,
    desc: '不高興時先暫停並進行三次慢呼吸',
    promptText: '「可以生氣，但是我們先讓身體慢下來。」' },
  { id: 'sys-c3', icon: '🗣️', title: '🗣️ 用說的表達需求', category: '情緒管理', target: 'boy', difficulty: 'normal', minutes: 5, flowers: 3, maxDaily: 2, recommend: true, active: true,
    desc: '不開心時用語言表達，不丟東西或大吼',
    promptText: '「你可以說出需要什麼幫忙。」' },
  { id: 'sys-c4', icon: '🌱', title: '🌱 失敗再試一次', category: '情緒管理', target: 'both', difficulty: 'normal', minutes: 5, flowers: 3, maxDaily: 1, recommend: true, active: true,
    desc: '遇到挫折時調整方法並重新嘗試',
    promptText: '「做不到沒關係，我們換個方法試試。」' },
  { id: 'sys-c5', icon: '😊', title: '😊 今天一件開心事', category: '情緒管理', target: 'both', difficulty: 'easy', minutes: 3, flowers: 1, maxDaily: 1, recommend: true, active: true,
    desc: '分享今天一件值得開心或感謝的事情',
    promptText: '「今天有哪一件小事讓你覺得開心或想謝謝別人呢？」' },
  { id: 'sys-c6', icon: '🤝', title: '🤝 接受提醒重新開始', category: '情緒管理', target: 'boy', difficulty: 'normal', minutes: 5, flowers: 3, maxDaily: 2, recommend: true, active: true,
    desc: '被提醒後願意聽說明並嘗試修正行為',
    promptText: '「做不到沒關係，我們換個方法試試。」' },

  // D. 自我控制（5 項）
  { id: 'sys-d1', icon: '🚦', title: '🚦 紅綠燈停看聽', category: '自我控制', target: 'boy', difficulty: 'easy', minutes: 5, flowers: 2, maxDaily: 1, recommend: true, active: true,
    desc: '玩紅燈停、黃燈想、綠燈行動的遊戲',
    promptText: '「紅燈先停住，想好了再行動。」' },
  { id: 'sys-d2', icon: '🎲', title: '🎲 輪流等待小高手', category: '自我控制', target: 'both', difficulty: 'easy', minutes: 8, flowers: 2, maxDaily: 1, recommend: true, active: true,
    desc: '玩遊戲時練習輪流、等待',
    promptText: '「還沒輪到你時，可以先觀察。」' },
  { id: 'sys-d3', icon: '👂', title: '👂 聽完再回答', category: '自我控制', target: 'boy', difficulty: 'normal', minutes: 5, flowers: 2, maxDaily: 2, recommend: true, active: true,
    desc: '練習等別人說完再表達意見',
    promptText: '「還沒輪到你時，可以先觀察。」' },
  { id: 'sys-d4', icon: '⏰', title: '⏰ 計時結束切換活動', category: '自我控制', target: 'both', difficulty: 'normal', minutes: 5, flowers: 3, maxDaily: 1, recommend: true, active: true,
    desc: '活動結束前預告，時間到轉換下一項',
    promptText: '「再過兩分鐘，我們就要準備收尾。」' },
  { id: 'sys-d5', icon: '🧠', title: '🧠 自己做一個小決定', category: '自我控制', target: 'both', difficulty: 'easy', minutes: 4, flowers: 2, maxDaily: 1, recommend: true, active: true,
    desc: '從兩個可接受選項中選擇並完成',
    promptText: '「這兩個方式都可以，你想先選哪一個開始？」' },

  // E. 生活自理（6 項，與 custom-girl-bag 整合）
  { id: 'custom-girl-bag', icon: '🎒', title: '🎒 睡前書包小隊長', category: '生活自理', target: 'both', difficulty: 'easy', minutes: 5, flowers: 2, maxDaily: 1, recommend: true, active: true,
    desc: '依照隔日課表檢查書包',
    promptText: '「明天需要帶什麼？我們一起確認。」' },
  { id: 'sys-e2', icon: '🧸', title: '🧸 睡前整理5分鐘', category: '生活自理', target: 'both', difficulty: 'easy', minutes: 5, flowers: 2, maxDaily: 1, recommend: true, active: true,
    desc: '將玩具、書籍及桌面簡單歸位',
    promptText: '「設定五分鐘，讓物品回到自己的家。」' },
  { id: 'sys-e3', icon: '🌙', title: '🌙 睡前放鬆小儀式', category: '生活自理', target: 'girl', difficulty: 'easy', minutes: 8, flowers: 2, maxDaily: 1, recommend: true, active: true,
    desc: '完成盥洗及5～10分鐘安靜活動（不延後就寢）',
    promptText: '「我們安靜聽首歌或看幾頁書，讓身體準備好舒服睡覺。」' },
  { id: 'sys-e4', icon: '☀️', title: '☀️ 晨間準備小達人', category: '生活自理', target: 'both', difficulty: 'normal', minutes: 10, flowers: 3, maxDaily: 1, recommend: true, active: true,
    desc: '依圖卡完成刷牙、換衣、準備書包',
    promptText: '「早上照著步驟一樣一樣完成，精神滿滿出門！」' },
  { id: 'sys-e5', icon: '👕', title: '👕 自己的衣服自己整理', category: '生活自理', target: 'both', difficulty: 'easy', minutes: 4, flowers: 1, maxDaily: 1, recommend: true, active: true,
    desc: '整理衣物，髒衣服放入洗衣籃',
    promptText: '「把衣服送回洗衣籃或衣櫃，動作好俐落！」' },
  { id: 'sys-e6', icon: '🏠', title: '🏠 幫忙一件家事', category: '生活自理', target: 'both', difficulty: 'easy', minutes: 5, flowers: 2, maxDaily: 1, recommend: true, active: true,
    desc: '擦桌子、分類襪子或整理餐具',
    promptText: '「今天你想幫忙哪一件事情？」' },

  // F. 親子互動（4 項）
  { id: 'sys-f1', icon: '📚', title: '📚 親子共讀10分鐘', category: '親子互動', target: 'both', difficulty: 'easy', minutes: 10, flowers: 3, maxDaily: 1, recommend: true, active: true,
    desc: '和家長一起閱讀、討論故事',
    promptText: '「我們一起讀這本書，看看裡面發生了什麼有趣的事。」' },
  { id: 'sys-f2', icon: '🎲', title: '🎲 親子桌遊挑戰', category: '親子互動', target: 'both', difficulty: 'normal', minutes: 15, flowers: 3, maxDaily: 1, recommend: true, active: true,
    desc: '練習遵守規則、輪流與合作',
    promptText: '「我們一起遵守遊戲規則，輪流等待更好玩。」' },
  { id: 'sys-f3', icon: '❤️', title: '❤️ 稱讚家人一件事', category: '親子互動', target: 'both', difficulty: 'easy', minutes: 3, flowers: 1, maxDaily: 1, recommend: true, active: true,
    desc: '說出對家人的具體感謝或欣賞',
    promptText: '「今天有沒有想謝謝爸爸、媽媽或兄妹的一件事呢？」' },
  { id: 'sys-f4', icon: '🧩', title: '🧩 合作完成小任務', category: '親子互動', target: 'both', difficulty: 'normal', minutes: 10, flowers: 3, maxDaily: 1, recommend: true, active: true,
    desc: '一起拼圖、整理或完成小作品',
    promptText: '「我們分工合作，一起把這個作品完成吧！」' }
];

// 預設共享集點商店（18 項新獎勵 + 保留既有獎勵相容）
const SYSTEM_REWARDS_SEED = [
  // A. 日常小確幸
  { id: 'rw-a1', icon: '📖', title: '📖 自己選今天的睡前故事', category: '日常小確幸', cost: 2, target: 'both', limit: 0, budget: '', active: true, note: '' },
  { id: 'rw-a2', icon: '🎵', title: '🎵 指定一首喜歡的歌一起聽', category: '日常小確幸', cost: 2, target: 'both', limit: 0, budget: '', active: true, note: '' },
  { id: 'rw-a3', icon: '💬', title: '💬 睡前多聊10分鐘', category: '日常小確幸', cost: 3, target: 'both', limit: 0, budget: '', active: true, note: '睡前聊天不能影響原本就寢時間，可提前安排。' },
  { id: 'rw-a4', icon: '🎮', title: '🎮 選擇今天的家庭小遊戲', category: '日常小確幸', cost: 3, target: 'both', limit: 0, budget: '', active: true, note: '' },
  // B. 親子陪伴
  { id: 'rw-b1', icon: '🎲', title: '🎲 和爸爸或媽媽玩桌遊20分鐘', category: '親子陪伴', cost: 4, target: 'both', limit: 0, budget: '', active: true, note: '' },
  { id: 'rw-b2', icon: '🧩', title: '🧩 親子拼圖或積木時間20分鐘', category: '親子陪伴', cost: 4, target: 'both', limit: 0, budget: '', active: true, note: '' },
  { id: 'rw-b3', icon: '🍪', title: '🍪 親子一起製作小點心', category: '親子陪伴', cost: 6, target: 'both', limit: 0, budget: '', active: true, note: '' },
  { id: 'rw-b4', icon: '❤️', title: '❤️ 和爸爸或媽媽單獨約會30分鐘', category: '親子陪伴', cost: 8, target: 'both', limit: 0, budget: '', active: true, note: '' },
  { id: 'rw-b5', icon: '🧁', title: '🧁 週末特別親子烘焙活動', category: '親子陪伴', cost: 12, target: 'both', limit: 0, budget: '', active: true, note: '' },
  // C. 生活選擇權
  { id: 'rw-c1', icon: '🍳', title: '🍳 選擇週末早餐菜單', category: '生活選擇權', cost: 5, target: 'both', limit: 0, budget: '', active: true, note: '' },
  { id: 'rw-c2', icon: '🎬', title: '🎬 決定一次家庭電影', category: '生活選擇權', cost: 6, target: 'both', limit: 0, budget: '', active: true, note: '' },
  { id: 'rw-c3', icon: '🎨', title: '🎨 選擇週末家庭桌遊或手作活動', category: '生活選擇權', cost: 8, target: 'both', limit: 0, budget: '', active: true, note: '' },
  // D. 戶外活動
  { id: 'rw-d1', icon: '🌳', title: '🌳 選擇一次附近公園活動', category: '戶外活動', cost: 6, target: 'both', limit: 0, budget: '', active: true, note: '' },
  { id: 'rw-d2', icon: '🚲', title: '🚲 週末特別戶外活動', category: '戶外活動', cost: 18, target: 'both', limit: 0, budget: '', active: true, note: '' },
  { id: 'rw-d3', icon: '🎡', title: '🎡 一次家庭特別日行程選擇權', category: '戶外活動', cost: 20, target: 'both', limit: 0, budget: '', active: true, note: '' },
  // E. 實體獎勵
  { id: 'rw-e1', icon: '🎀', title: '🎀 選一本小筆記本或貼紙', category: '實體獎勵', cost: 10, target: 'both', limit: 0, budget: 100, active: true, note: '可依家長預算上限挑選' },
  { id: 'rw-e2', icon: '📚', title: '📚 挑選一本喜歡的課外書', category: '實體獎勵', cost: 12, target: 'both', limit: 0, budget: 350, active: true, note: '可依家長預算上限挑選' },
  { id: 'rw-e3', icon: '🎁', title: '🎁 挑選小型積木或手作材料包', category: '實體獎勵', cost: 15, target: 'both', limit: 0, budget: 400, active: true, note: '可依家長預算上限挑選' }
];

function makeDefaultChild(c) {
  return {
    level: 'easy',
    minutes: 10,
    focusCategory: 'auto',
    checks: {},
    logs: [],
    sessions: [],
    extra: '',
    points: 0,
    initialPointsBonus: 0,
    rewards: [],
    redemptions: [],
    customTasks: []
  };
}

function stripEmojiTitle(s) {
  return String(s || '').replace(/^[^\w\u4e00-\u9fa5]+/, '').trim();
}

function normalizeDB(raw) {
  const base = {
    version: 1,
    updatedAt: 0,
    deletedIds: [],
    lastBackupAt: null,
    physicalBudgetMax: 500,
    auth: {
      familyHash: hashPin(DEFAULT_FAMILY_PIN),
      parentHash: hashPin(DEFAULT_PARENT_PIN),
      isDefaultFamily: true,
      isDefaultParent: true,
      updatedAt: 0
    },
    taskCatalog: [],
    rewardCatalog: [],
    children: {
      girl: makeDefaultChild('girl'),
      boy: makeDefaultChild('boy')
    }
  };

  if (raw && raw.version === 1 && raw.children) {
    base.updatedAt = typeof raw.updatedAt === 'number' ? raw.updatedAt : 0;
    base.deletedIds = Array.isArray(raw.deletedIds) ? raw.deletedIds.slice(-300) : [];
    base.lastBackupAt = typeof raw.lastBackupAt === 'number' ? raw.lastBackupAt : null;
    if (Number.isFinite(raw.physicalBudgetMax)) base.physicalBudgetMax = raw.physicalBudgetMax;

    if (raw.auth && typeof raw.auth === 'object') {
      if (typeof raw.auth.familyHash === 'string') {
        base.auth.familyHash = raw.auth.familyHash;
        base.auth.isDefaultFamily = Boolean(raw.auth.isDefaultFamily);
      }
      if (typeof raw.auth.parentHash === 'string') {
        base.auth.parentHash = raw.auth.parentHash;
        base.auth.isDefaultParent = Boolean(raw.auth.isDefaultParent);
      }
      base.auth.updatedAt = typeof raw.auth.updatedAt === 'number' ? raw.auth.updatedAt : 0;
    }

    if (Array.isArray(raw.taskCatalog)) base.taskCatalog = structuredClone(raw.taskCatalog);
    if (Array.isArray(raw.rewardCatalog)) base.rewardCatalog = structuredClone(raw.rewardCatalog);

    for (const c of ['girl', 'boy']) {
      const src = raw.children[c];
      if (!src) continue;
      const dst = base.children[c];
      dst.level = ['easy', 'normal', 'challenge'].includes(src.level) ? src.level : 'easy';
      dst.minutes = Number.isFinite(src.minutes) ? Math.min(15, Math.max(5, src.minutes)) : 10;
      dst.focusCategory = typeof src.focusCategory === 'string' ? src.focusCategory : 'auto';
      dst.checks = (src.checks && typeof src.checks === 'object') ? src.checks : {};
      dst.logs = Array.isArray(src.logs) ? src.logs : [];
      dst.sessions = Array.isArray(src.sessions) ? src.sessions.map(s => ({
        ...s,
        earned: Number.isFinite(s.earned) ? s.earned : 1
      })) : [];
      dst.extra = typeof src.extra === 'string' ? src.extra : '';
      dst.redemptions = Array.isArray(src.redemptions) ? src.redemptions.map(r => ({
        ...r,
        status: ['pending', 'approved', 'completed', 'cancelled'].includes(r.status) ? r.status : 'completed',
        pointsDeducted: typeof r.pointsDeducted === 'boolean' ? r.pointsDeducted : (r.status !== 'pending' && r.status !== 'cancelled')
      })) : [];

      // 保留舊版手動點數差額，確保舊小花餘額 100% 不遺失
      const sessionSum = dst.sessions.reduce((acc, s) => acc + (Number(s.earned) || 1), 0);
      const spentSum = dst.redemptions.filter(r => r.pointsDeducted && r.status !== 'cancelled').reduce((acc, r) => acc + (Number(r.cost) || 0), 0);
      if (Number.isFinite(src.initialPointsBonus)) {
        dst.initialPointsBonus = src.initialPointsBonus;
      } else if (Number.isFinite(src.points)) {
        dst.initialPointsBonus = Math.max(0, src.points - (sessionSum - spentSum));
      }
      dst.points = Math.max(0, dst.initialPointsBonus + sessionSum - spentSum);

      // 遷移舊版各孩子名下的自訂任務與自訂獎勵至共用目錄（保留原設定且不重複）
      if (Array.isArray(src.customTasks)) {
        for (const ct of src.customTasks) {
          if (!ct || !ct.title) continue;
          const clean = stripEmojiTitle(ct.title);
          const exists = base.taskCatalog.some(x => x.id === ct.id || stripEmojiTitle(x.title) === clean);
          if (!exists && !base.deletedIds.includes(ct.id)) {
            base.taskCatalog.push({
              id: ct.id || ('custom-' + crypto.randomUUID().slice(0, 8)),
              icon: ct.icon || '🌱',
              title: ct.title,
              category: CATEGORY_META[ct.area] ? ct.area : '生活自理',
              target: c,
              difficulty: 'easy',
              minutes: 5,
              flowers: 2,
              maxDaily: 1,
              recommend: true,
              active: ct.active !== false,
              desc: ct.desc || '',
              promptText: typeof ct.prompt === 'string' ? ct.prompt : '「我們一起完成這項練習吧！」'
            });
          }
        }
      }
      if (Array.isArray(src.rewards)) {
        for (const rw of src.rewards) {
          if (!rw || !rw.title) continue;
          const clean = stripEmojiTitle(rw.title);
          const exists = base.rewardCatalog.some(x => x.id === rw.id || stripEmojiTitle(x.title) === clean);
          if (!exists && !base.deletedIds.includes(rw.id)) {
            base.rewardCatalog.push({
              id: rw.id || ('rew-' + crypto.randomUUID().slice(0, 8)),
              icon: rw.icon || '🎁',
              title: rw.title,
              category: '日常小確幸',
              cost: Number(rw.cost) || 3,
              target: c,
              limit: 0,
              budget: '',
              active: true,
              note: ''
            });
          }
        }
      }
    }
  }

  // 補齊系統預設 40 項任務（避免與既有或已刪除項目重複）
  const delSet = new Set(base.deletedIds || []);
  for (const seed of SYSTEM_TASKS_SEED) {
    if (delSet.has(seed.id)) continue;
    const cleanSeed = stripEmojiTitle(seed.title);
    const existing = base.taskCatalog.find(t => t.id === seed.id || stripEmojiTitle(t.title) === cleanSeed);
    if (!existing) {
      base.taskCatalog.push(structuredClone(seed));
    }
  }

  // 補齊系統預設 18 項獎勵（避免與既有或已刪除項目重複，並依小花排序）
  for (const seed of SYSTEM_REWARDS_SEED) {
    if (delSet.has(seed.id)) continue;
    const cleanSeed = stripEmojiTitle(seed.title);
    const existing = base.rewardCatalog.find(r => r.id === seed.id || stripEmojiTitle(r.title) === cleanSeed);
    if (!existing) {
      base.rewardCatalog.push(structuredClone(seed));
    }
  }
  base.rewardCatalog.sort((a, b) => (Number(a.cost) || 0) - (Number(b.cost) || 0));

  return base;
}

let db;
try {
  db = normalizeDB(JSON.parse(localStorage.getItem(key)));
} catch {
  db = normalizeDB(null);
}

let child = 'girl';
let page = 'home';
let currentTask = null;
let remaining = 0;
let total = 0;
let interval = null;
let endTime = 0;
let celebrateHero = false;
let confirmDeleteKey = null;
let summaryDays = 7;
let pendingParentAction = null;

// 任務篩選狀態
let filterTaskSearch = '';
let filterTaskCat = 'all';
let filterTaskTarget = 'all';
let filterTaskDiff = 'all';

function isLoggedIn() {
  return sessionStorage.getItem(sessionLoginKey) === '1';
}
function isParentUnlocked() {
  return sessionStorage.getItem(sessionParentKey) === '1';
}

function updateAuthUI() {
  const logged = isLoggedIn();
  $('#loginGate').hidden = logged;
  $('#appAside').hidden = !logged;
  $('#appMain').hidden = !logged;
  if (!logged) {
    $('#loginHint').textContent = '';
    return;
  }
  const unlocked = isParentUnlocked();
  $('#parentLockBadge').textContent = unlocked ? '🔓' : '🔒';
  $('#parentAuthBtn').textContent = unlocked ? '🔓 家長已解鎖（點擊鎖定）' : '🔒 家長模式';
}

function requireParentAuth(desc, onSuccess) {
  if (isParentUnlocked()) {
    onSuccess();
    return;
  }
  pendingParentAction = onSuccess;
  $('#parentPinDesc').textContent = desc || '此操作需由家長輸入密碼確認。';
  $('#parentPinInput').value = '';
  $('#parentPinError').hidden = true;
  $('#parentPinHint').textContent = '';
  $('#parentPinModal').showModal();
}

$('#loginForm').onsubmit = async e => {
  e.preventDefault();
  const pin = $('#loginPassword').value.trim();
  if (hashPin(pin) !== db.auth.familyHash && getCloudConfig().url) {
    await pullFromCloud(true);
  }
  if (hashPin(pin) === db.auth.familyHash) {
    sessionStorage.setItem(sessionLoginKey, '1');
    $('#loginPassword').value = '';
    $('#loginError').hidden = true;
    updateAuthUI();
    render();
    pullFromCloud(true);
  } else {
    $('#loginError').hidden = false;
  }
};

$('#parentPinForm').onsubmit = async e => {
  e.preventDefault();
  const pin = $('#parentPinInput').value.trim();
  if (hashPin(pin) !== db.auth.parentHash && getCloudConfig().url) {
    await pullFromCloud(true);
  }
  if (hashPin(pin) === db.auth.parentHash) {
    sessionStorage.setItem(sessionParentKey, '1');
    $('#parentPinModal').close();
    updateAuthUI();
    const act = pendingParentAction;
    pendingParentAction = null;
    if (act) act();
    toast('已解鎖家長操作模式。');
  } else {
    $('#parentPinError').hidden = false;
  }
};

$('#parentAuthBtn').onclick = () => {
  if (isParentUnlocked()) {
    sessionStorage.removeItem(sessionParentKey);
    updateAuthUI();
    render();
    toast('已鎖定家長模式，可安心交給孩子操作。');
  } else {
    requireParentAuth('解鎖後即可檢視完整統計、管理任務與獎勵、核准兌換。', () => render());
  }
};

$('#logoutBtn').onclick = () => {
  sessionStorage.removeItem(sessionLoginKey);
  sessionStorage.removeItem(sessionParentKey);
  confirmDeleteKey = null;
  updateAuthUI();
};

const profiles = {
  girl: {
    name: '彗瑄',
    full: '徐彗瑄',
    birth: '2018-07-29',
    age: '8 歲',
    grade: '小學三年級',
    traits: [
      '主要訓練方向：專注力與持續完成任務、閱讀與作業規劃、自主檢查及整理能力、情緒表達與自我肯定、睡前放鬆及良好睡眠習慣。',
      '已知觀察：坐著看書或上課容易想睡，有時覺得上課無聊會發呆、分心；滿常漏帶東西。',
      '睡眠與作息：平日約 19:00 多洗澡、21:30 上床，約 22:00–22:30 睡著，06:00 起床（優先改善睡眠品質，避免刺激性睡前活動或為集點延後就寢）。',
      '挫折與安撫：容易安靜不說話／發呆或想哭；需要大人先抱抱／拍拍，休息喝水後再試。'
    ],
    favorites: '畫畫手作、閱讀故事書、桌遊、親子遊戲、戶外散步或運動',
    calming: '先給予抱抱／拍拍安撫，休息喝水後再陪著試一次',
    unknown: '注意：睡前任務保持溫和安靜，不為了完成任務或集點而延後就寢時間。'
  },
  boy: {
    name: '邦盛',
    full: '徐邦盛',
    birth: '2020-03-11',
    age: '6 歲',
    grade: '小學一年級',
    traits: [
      '主要訓練方向：任務開始與持續專注、分心後重新回到原本任務、聽取指令與依序執行、自我控制及等待能力、被糾正時的情緒調節、作業及聯絡簿習慣。',
      '已知觀察：ESL 完成作業後媽媽陪對約 1 小時；一次約能坐半小時後分心，目前最卡關國字書寫與聯絡簿。',
      '課堂與情緒：上課坐不住／插嘴頻率偏高，對喜歡課程很投入；覺得不合理時容易急躁，練習用說的表達需求。',
      '訓練核心：不要求完全不分心，以「發現分心後願意重新開始」為主要目標。'
    ],
    favorites: '集點換東西、選一本繪本或桌遊陪玩、貼紙／小點心、週末去公園或特別活動、口頭肯定＋擊掌',
    calming: '倒數計時器視覺提示、輕拍肩膀與眼神對視、一次一個短指令、小白板打勾',
    unknown: '注意：本工具僅作日常習慣陪伴與行為觀察，不自行判定 ADHD 或其他醫療診斷。'
  }
};

function allTasksMap() {
  const map = {};
  for (const t of db.taskCatalog || []) {
    if (t && t.id) map[t.id] = t;
  }
  return map;
}

function childTasks(includeInactive = false) {
  return (db.taskCatalog || []).filter(t => {
    if (!t) return false;
    if (!includeInactive && t.active === false) return false;
    return t.target === 'both' || t.target === child;
  });
}

function childRewards(includeInactive = false) {
  return (db.rewardCatalog || []).filter(r => {
    if (!r) return false;
    if (!includeInactive && r.active === false) return false;
    return r.target === 'both' || r.target === child;
  }).sort((a, b) => (Number(a.cost) || 0) - (Number(b.cost) || 0));
}

function getCloudConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(cloudConfigKey));
    if (saved && saved.url) return { url: saved.url.trim(), token: (saved.token || '').trim() };
  } catch {}
  if (DEFAULT_CLOUD_URL) return { url: DEFAULT_CLOUD_URL.trim(), token: DEFAULT_CLOUD_TOKEN.trim() };
  return { url: '', token: '' };
}

function setCloudStatus(text, isError = false) {
  const btn = $('#syncStatusBtn');
  if (!btn) return;
  btn.textContent = text;
  btn.style.color = isError ? 'var(--danger)' : '';
  btn.style.borderColor = isError ? '#edd0d0' : '';
}

function mergeDatasets(localData, incoming) {
  const merged = structuredClone(localData);
  const delSet = new Set([...(localData.deletedIds || []), ...(incoming.deletedIds || [])]);
  merged.deletedIds = Array.from(delSet).slice(-300);

  if (incoming.auth && typeof incoming.auth.familyHash === 'string' && (incoming.auth.updatedAt || 0) > (localData.auth?.updatedAt || 0)) {
    merged.auth = { ...incoming.auth };
  }
  if ((incoming.updatedAt || 0) > (localData.updatedAt || 0) && Number.isFinite(incoming.physicalBudgetMax)) {
    merged.physicalBudgetMax = incoming.physicalBudgetMax;
  }

  // 合併共用任務目錄與獎勵目錄
  for (const catKey of ['taskCatalog', 'rewardCatalog']) {
    const byId = new Map();
    for (const item of (merged[catKey] || [])) {
      if (item && item.id && !delSet.has(item.id)) byId.set(item.id, item);
    }
    for (const item of (incoming[catKey] || [])) {
      if (!item || !item.id || delSet.has(item.id)) continue;
      const prev = byId.get(item.id);
      if (!prev || (item.updatedAt || 0) > (prev.updatedAt || 0)) {
        byId.set(item.id, item);
      }
    }
    merged[catKey] = Array.from(byId.values());
  }

  for (const c of ['girl', 'boy']) {
    const from = incoming.children && incoming.children[c];
    const to = merged.children[c];
    if (!from) continue;

    for (const k of ['logs', 'sessions', 'redemptions']) {
      const fromArr = Array.isArray(from[k]) ? from[k] : [];
      const byId = new Map();
      for (const item of to[k]) {
        if (item && item.id && !delSet.has(item.id)) byId.set(item.id, item);
      }
      for (const item of fromArr) {
        if (!item || !item.id || delSet.has(item.id)) continue;
        const prev = byId.get(item.id);
        if (!prev || (item.updatedAt || item.created || 0) > (prev.updatedAt || prev.created || 0)) {
          byId.set(item.id, item);
        }
      }
      to[k] = Array.from(byId.values());
    }

    for (const [date, state] of Object.entries(from.checks || {})) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(date) && ['ready', 'distracted', 'angry', 'tired'].includes(state) && !to.checks[date]) {
        to.checks[date] = state;
      }
    }
    if ((incoming.updatedAt || 0) > (localData.updatedAt || 0)) {
      if (typeof from.extra === 'string' && from.extra) to.extra = from.extra;
      if (['easy', 'normal', 'challenge'].includes(from.level)) to.level = from.level;
      if (Number.isFinite(from.minutes)) to.minutes = from.minutes;
      if (typeof from.focusCategory === 'string') to.focusCategory = from.focusCategory;
    }
  }
  merged.updatedAt = Math.max(localData.updatedAt || 0, incoming.updatedAt || 0);
  return normalizeDB(merged);
}

let syncTimer = null;
async function pushToCloud() {
  const cfg = getCloudConfig();
  if (!cfg.url) { setCloudStatus('☁ 尚未設定雲端'); return; }
  setCloudStatus('☁ 同步中...');
  try {
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token: cfg.token, data: db })
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'SYNC_FAILED');
    setCloudStatus('☁ 已同步雲端');
  } catch {
    setCloudStatus('☁ 同步失敗（點擊重試）', true);
  }
}

async function pullFromCloud(silent = false) {
  const cfg = getCloudConfig();
  if (!cfg.url) { setCloudStatus('☁ 尚未設定雲端'); return; }
  setCloudStatus('☁ 讀取雲端...');
  try {
    const res = await fetch(`${cfg.url}?token=${encodeURIComponent(cfg.token)}`);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'PULL_FAILED');
    if (json.data && json.data.version === 1) {
      const before = JSON.stringify(db);
      db = mergeDatasets(db, json.data);
      localStorage.setItem(key, JSON.stringify(db));
      if (JSON.stringify(db) !== before && (db.updatedAt || 0) > (json.data.updatedAt || 0)) {
        await pushToCloud();
      } else {
        setCloudStatus('☁ 已同步雲端');
      }
      if (isLoggedIn()) render();
    } else if ((db.updatedAt || 0) > 0) {
      await pushToCloud();
    } else {
      setCloudStatus('☁ 已連線（雲端尚無資料）');
    }
    if (!silent) toast('已完成雲端資料同步！');
  } catch {
    setCloudStatus('☁ 雲端連線失敗', true);
    if (!silent) toast('雲端連線失敗，請檢查網址與密鑰是否正確。');
  }
}

function schedulePush() {
  const cfg = getCloudConfig();
  if (!cfg.url) return;
  clearTimeout(syncTimer);
  setCloudStatus('☁ 準備同步...');
  syncTimer = setTimeout(() => { pushToCloud(); }, 600);
}

function recalcChildPoints(c = child) {
  const d = db.children[c];
  const bonus = Number.isFinite(d.initialPointsBonus) ? d.initialPointsBonus : 0;
  const earnedTotal = d.sessions.reduce((acc, s) => acc + (Number(s.earned) || 1), 0);
  const spentTotal = d.redemptions
    .filter(r => r.pointsDeducted && r.status !== 'cancelled')
    .reduce((acc, r) => acc + (Number(r.cost) || 0), 0);
  d.points = Math.max(0, bonus + earnedTotal - spentTotal);
}

function walletStats(c = child) {
  recalcChildPoints(c);
  const d = db.children[c];
  const tStr = today();
  const wDates = week();
  const todayEarned = d.sessions.filter(s => s.date === tStr).reduce((a, s) => a + (Number(s.earned) || 1), 0);
  const weekEarned = d.sessions.filter(s => wDates.includes(s.date)).reduce((a, s) => a + (Number(s.earned) || 1), 0);
  const totalEarned = (Number(d.initialPointsBonus) || 0) + d.sessions.reduce((a, s) => a + (Number(s.earned) || 1), 0);
  const totalSpent = d.redemptions.filter(r => r.pointsDeducted && r.status !== 'cancelled').reduce((a, r) => a + (Number(r.cost) || 0), 0);
  return {
    available: d.points,
    todayEarned,
    weekEarned,
    totalEarned,
    totalSpent
  };
}

function save(skipPush = false) {
  try {
    recalcChildPoints('girl');
    recalcChildPoints('boy');
    db.updatedAt = Date.now();
    localStorage.setItem(key, JSON.stringify(db));
    if (!skipPush) schedulePush();
    return true;
  } catch {
    toast('瀏覽器無法儲存，請檢查儲存空間。');
    return false;
  }
}

function toast(t) {
  $('#toast').textContent = t;
  $('#toast').style.display = 'block';
  clearTimeout(window.toastTimeout);
  window.toastTimeout = setTimeout(() => ($('#toast').style.display = 'none'), 3500);
}

function data() { return db.children[child]; }
function check() { return data().checks[today()] || 'unknown'; }

function todayTaskCount(id) {
  return data().sessions.filter(s => s.date === today() && s.task === id).length;
}

function completed(id) {
  const t = allTasksMap()[id];
  const maxD = t && Number.isFinite(Number(t.maxDaily)) ? Number(t.maxDaily) : 1;
  return todayTaskCount(id) >= maxD;
}

function yesterdayStr() {
  const d = new Date(today() + 'T12:00:00+08:00');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// 每日智慧推薦任務邏輯（依孩子年齡、當天狀態、近 7 天分心與昨日任務動態挑選）
function plan() {
  const pool = childTasks(false).filter(t => t.recommend !== false);
  const map = allTasksMap();
  const mood = check();
  const yStr = yesterdayStr();
  const yesterdayTasks = new Set(data().sessions.filter(s => s.date === yStr).map(s => s.task));
  const recent7 = recentDays(7);
  const recentHighDistract = new Set(
    data().sessions.filter(s => recent7.includes(s.date) && Number(s.distractions) >= 3).map(s => s.task)
  );
  const focusCat = data().focusCategory || 'auto';

  const pickFrom = (preferredIds, fallbackCat) => {
    const candidates = preferredIds.map(id => map[id]).filter(t => t && t.active !== false && (t.target === 'both' || t.target === child) && t.recommend !== false);
    const catPool = pool.filter(t => !fallbackCat || t.category === fallbackCat);
    const merged = [...new Set([...candidates, ...catPool, ...pool])];
    merged.sort((a, b) => {
      const aFocus = focusCat !== 'auto' && a.category === focusCat ? -2 : 0;
      const bFocus = focusCat !== 'auto' && b.category === focusCat ? -2 : 0;
      const aDist = recentHighDistract.has(a.id) ? -1 : 0;
      const bDist = recentHighDistract.has(b.id) ? -1 : 0;
      const aYest = yesterdayTasks.has(a.id) ? 1 : 0;
      const bYest = yesterdayTasks.has(b.id) ? 1 : 0;
      return (aFocus + aDist + aYest) - (bFocus + bDist + bYest);
    });
    return merged;
  };

  const chosen = [];
  const addUnique = list => {
    for (const t of list) {
      if (t && !chosen.includes(t.id)) {
        chosen.push(t.id);
        return;
      }
    }
  };

  if (child === 'girl') {
    // 徐彗瑄：每天建議 2 項（疲倦或心情不佳時降為輕鬆放鬆任務，不影響睡眠）
    if (mood === 'tired') {
      addUnique(pickFrom(['move', 'sys-e3'], '生活自理'));
      addUnique(pickFrom(['sys-c1', 'sys-c5'], '情緒管理'));
    } else if (mood === 'angry') {
      addUnique(pickFrom(['sys-c2', 'calm', 'sys-c1'], '情緒管理'));
      addUnique(pickFrom(['sys-e3', 'sys-b1'], '生活自理'));
    } else if (mood === 'distracted') {
      addUnique(pickFrom(['sys-a1', 'focus', 'sys-a5'], '專注力訓練'));
      addUnique(pickFrom(['sys-b3', 'custom-girl-bag'], '作業習慣'));
    } else {
      addUnique(pickFrom(['sys-a5', 'sys-a2', 'focus'], '專注力訓練'));
      addUnique(pickFrom(['sys-b3', 'custom-girl-bag', 'sys-e3'], focusCat !== 'auto' ? focusCat : '作業習慣'));
    }
    return chosen.slice(0, 2);
  } else {
    // 徐邦盛：每天建議 2～3 項（疲倦或生氣時降低為 2 項溫和練習）
    if (mood === 'tired') {
      addUnique(pickFrom(['move', 'sys-a1'], '專注力訓練'));
      addUnique(pickFrom(['sys-c1', 'calm'], '情緒管理'));
      return chosen.slice(0, 2);
    } else if (mood === 'angry') {
      addUnique(pickFrom(['sys-c2', 'sys-c3', 'calm'], '情緒管理'));
      addUnique(pickFrom(['sys-a6', 'sys-d1'], '自我控制'));
      return chosen.slice(0, 2);
    } else if (mood === 'distracted') {
      addUnique(pickFrom(['sys-a6', 'sys-a1', 'focus'], '專注力訓練'));
      addUnique(pickFrom(['sys-a3', 'sys-d1', 'stop'], '自我控制'));
      addUnique(pickFrom(['custom-boy-writing', 'sys-b4', 'homework'], '作業習慣'));
      return chosen.slice(0, 3);
    } else {
      addUnique(pickFrom(['sys-a1', 'sys-a6', 'sys-a3'], '專注力訓練'));
      addUnique(pickFrom(['custom-boy-writing', 'sys-b4', 'sys-b2'], '作業習慣'));
      addUnique(pickFrom(['sys-c3', 'sys-c6', 'sys-d1', 'sys-d3'], focusCat !== 'auto' ? focusCat : '情緒管理'));
      return chosen.slice(0, 3);
    }
  }
}

function nextTask() { return plan().find(id => !completed(id)) || null; }

function week(offset = 0) {
  const now = new Date(today() + 'T12:00:00+08:00');
  const day = now.getUTCDay();
  now.setUTCDate(now.getUTCDate() - ((day + 6) % 7) + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

function recentDays(n) {
  const now = new Date(today() + 'T12:00:00+08:00');
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    return d.toISOString().slice(0, 10);
  });
}

function sessionsIn(dates) { return data().sessions.filter(s => dates.includes(s.date)); }

function weekChart() {
  const dates = week();
  const max = Math.max(3, ...dates.map(d => data().sessions.filter(s => s.date === d).length));
  return '<div class="miniweek">' + dates.map((d, i) => {
    const n = data().sessions.filter(s => s.date === d).length;
    return `<div class="day ${d === today() ? 'today' : ''}" title="${d}：${n} 次"><div class="bar"><i style="height:${Math.max(4, n / max * 64)}px"></i></div>${['一', '二', '三', '四', '五', '六', '日'][i]}<br>${n ? n + '次' : '—'}</div>`;
  }).join('') + '</div>';
}

function gardenStage(count) {
  if (count === 0) return { idx: 0, label: '種子期', next: '完成 1 次練習就能發芽' };
  if (count <= 2) return { idx: 1, label: '發芽期', next: `再 ${3 - count} 次長出小葉子` };
  if (count <= 5) return { idx: 2, label: '長葉期', next: `再 ${6 - count} 次冒出花苞` };
  if (count <= 8) return { idx: 3, label: '含苞期', next: `再 ${9 - count} 次就會開花` };
  return { idx: 4, label: '開花期', next: '花園已經盛開了，繼續保持節奏！' };
}

function gardenSVG(count, celebrating) {
  const st = gardenStage(count).idx;
  const pot = `
    <ellipse cx="135" cy="184" rx="105" ry="12" fill="#d8e2c9"/>
    <path d="M103 151H168L156 186H116Z" fill="#d6a98a"/>
    <path d="M98 150h75v10h-75z" fill="#e4b99b"/>
    <ellipse cx="135" cy="150" rx="34" ry="5" fill="#9d7b5e"/>`;
  let plant = '';
  if (st === 0) {
    plant = `
      <ellipse cx="135" cy="147" rx="9" ry="6" fill="#7c5d41"/>
      <circle cx="135" cy="145" r="2.5" fill="#b7966e"/>
      <path d="M92 122l3-6 3 6 6 2-6 2-3 6-3-6-6-2z" fill="#b7c6a2"/>`;
  } else if (st === 1) {
    plant = `
      <path d="M135 150V122" stroke="#69835a" stroke-width="4" stroke-linecap="round"/>
      <path d="M135 130c-16-4-17-16-12-16 8 0 12 7 12 16" fill="#9ab57f"/>
      <path d="M135 127c16-4 17-16 12-16-8 0-12 7-12 16" fill="#b0c792"/>`;
  } else if (st === 2) {
    plant = `
      <path d="M135 150V104" stroke="#69835a" stroke-width="4.5" stroke-linecap="round"/>
      <path d="M135 134C102 129 102 103 110 103C128 103 136 116 135 134" fill="#8fa978"/>
      <path d="M136 119C168 121 174 96 165 95C147 95 136 105 136 119" fill="#a6ba86"/>
      <circle cx="135" cy="100" r="6" fill="#9fb984"/>`;
  } else if (st === 3) {
    plant = `
      <path d="M135 150V92" stroke="#69835a" stroke-width="4.5" stroke-linecap="round"/>
      <path d="M135 134C96 129 96 99 105 99C126 99 136 114 135 134" fill="#8fa978"/>
      <path d="M136 117C172 119 182 92 173 91C152 91 136 102 136 117" fill="#a6ba86"/>
      <path d="M135 72c10 0 15 12 12 22h-24c-3-10 2-22 12-22z" fill="#e9c276"/>
      <path d="M124 90c5-4 17-4 22 0" stroke="#789464" stroke-width="3" fill="none"/>`;
  } else {
    plant = `
      <path d="M135 150V82" stroke="#69835a" stroke-width="4.5" stroke-linecap="round"/>
      <path d="M135 134C96 129 96 97 105 97C128 97 136 112 135 134" fill="#8fa978"/>
      <path d="M136 115C174 117 186 89 177 88C153 88 136 100 136 115" fill="#a6ba86"/>
      <circle cx="135" cy="66" r="26" fill="#e9c276"/>
      <circle cx="135" cy="67" r="10" fill="#ac8755"/>
      <path d="M62 174v-40M62 150c-26-5-22-20-22-20 19-1 23 13 22 20M62 158c21-4 19-21 19-21-16 0-20 12-19 21" stroke="#819469" stroke-width="3" fill="#a8bb8b"/>
      <path d="M198 174v-26" stroke="#809366" stroke-width="3"/><circle cx="198" cy="138" r="11" fill="#e3c8a3"/>`;
  }
  const sparkles = celebrating
    ? `<g class="petal-burst">
         <circle cx="88" cy="62" r="5" fill="#e9c276"/>
         <circle cx="185" cy="54" r="4" fill="#e49b7e"/>
         <circle cx="165" cy="36" r="5" fill="#9fb984"/>
         <path d="M52 78l4-8 4 8 8 3-8 3-4 8-4-8-8-3zM206 46l3-6 3 6 6 2-6 2-3 6-3-6-6-2z" fill="#8ea578"/>
       </g>`
    : `<path d="M40 76l4-8 4 8 8 3-8 3-4 8-4-8-8-3zM205 46l3-6 3 6 6 2-6 2-3 6-3-6-6-2z" fill="#a9b88f"/>`;
  return `<svg class="garden" viewBox="0 0 260 200" aria-hidden="true">${pot}${plant}${sparkles}</svg>`;
}

function renderTaskCard(t) {
  if (!t) return '';
  const meta = CATEGORY_META[t.category] || { cls: 'cat-focus', icon: '🌱' };
  const diffLabel = { easy: '簡單', normal: '一般', challenge: '進階' }[t.difficulty || 'easy'] || '簡單';
  const doneCount = todayTaskCount(t.id);
  const maxD = Number(t.maxDaily) || 1;
  const isDone = doneCount >= maxD;
  return `<article class="card task">
    <div class="task-icon">${esc(t.icon || meta.icon)}</div>
    <div class="task-body">
      <h3>${esc(t.title)}</h3>
      <p>${esc(t.desc)}</p>
      <div class="chips">
        <span class="cat-badge ${meta.cls}">${esc(t.category)}</span>
        <span class="chip">◷ ${t.minutes || 5} 分鐘</span>
        <span class="chip">難度：${diffLabel}</span>
        <span class="flower-badge">🌸 +${t.flowers || 2} 朵</span>
        ${maxD > 1 ? `<span class="chip">今日 ${doneCount}/${maxD} 次</span>` : ''}
      </div>
      <details class="task-prompt-details">
        <summary>💬 查看家長引導語與步驟</summary>
        <p>${esc(t.promptText || '「我們先做這一小步，完成後一起擊掌！」')}</p>
      </details>
    </div>
    <div class="task-actions">
      ${isDone ? '<span class="done">✓ 今日已完成</span>' : `<button class="primary" data-start="${esc(t.id)}" type="button">開始練習 →</button>`}
    </div>
  </article>`;
}

function tasksHTML() {
  const ids = plan();
  const map = allTasksMap();
  return ids.map(id => renderTaskCard(map[id])).join('');
}

function recommendation() {
  if (child === 'girl') {
    return {
      unknown: '先選擇彗瑄今天的狀態；每日智慧推薦 2 項任務，優先照顧睡眠與放鬆，不因集點延後就寢。',
      ready: '精神不錯！今天推薦閱讀與自主檢查任務，按部就班完成即可。',
      distracted: '有點分心沒關係，先從 5 分鐘專注小任務開始，完成一項就休息。',
      angry: '心情不好時先抱抱拍拍、喝口水，進行溫和的情緒與放鬆練習。',
      tired: '今天有點想睡，已自動減少任務量並改為溫和伸展與睡前放鬆儀式，早點休息喔！'
    }[check()];
  }
  return {
    unknown: '先選擇邦盛今天的狀態；每日智慧推薦 2～3 項練習，重點在於「發現分心後願意重新開始」。',
    ready: '精神不錯！搭配倒數計時器與小白板打勾，一段一段完成任務。',
    distracted: '有點分心很正常，發現後願意指回步驟重新開始就值得鼓勵！',
    angry: '生氣或挫折時先停一下、三次慢呼吸，練習用說的告訴大人需要什麼幫忙。',
    tired: '今天比較累，已將推薦任務減量為輕鬆項目，願意嘗試就很棒。'
  }[check()];
}

function walletCardHTML() {
  const w = walletStats(child);
  return `<div class="card">
    <h3 style="margin:0">🌸 ${profiles[child].name}的小花錢包</h3>
    <div class="wallet-grid">
      <div class="wallet-item"><span>目前可用</span><strong>${w.available} 🌸</strong></div>
      <div class="wallet-item"><span>今日獲得</span><strong>+${w.todayEarned}</strong></div>
      <div class="wallet-item"><span>本週累積</span><strong>+${w.weekEarned}</strong></div>
      <div class="wallet-item"><span>歷史總獲</span><strong>${w.totalEarned}</strong></div>
      <div class="wallet-item"><span>已兌換使用</span><strong>${w.totalSpent}</strong></div>
    </div>
    <p class="subtext" style="margin:0">💡 建議每天約獲得 6～10 朵小花（不必強制達成）；生氣或失敗不扣分，願意嘗試（+1🌸）與重新開始都算進步！</p>
  </div>`;
}

function rewardsShopHTML() {
  const w = walletStats(child);
  const list = childRewards(false);
  const redemptions = data().redemptions || [];
  const pendingList = redemptions.filter(r => r.status === 'pending' || r.status === 'approved');

  const byCat = {};
  for (const r of list) {
    const c = r.category || '日常小確幸';
    if (!byCat[c]) byCat[c] = [];
    byCat[c].push(r);
  }

  return `<div class="card tip">
    <h3>🎁 集點獎勵商店（可用：🌸 ${w.available} 朵）</h3>
    <p>選擇想要的獎勵提出兌換申請，由爸爸媽媽確認核准後才會扣除小花。</p>
    ${pendingList.length ? `<div style="background:#f9faf4;border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:12px">
      <b style="font-size:13px">📌 進行中的兌換申請（${pendingList.length} 筆）</b>
      ${pendingList.map(rd => `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;font-size:13px">
        <span>${esc(rd.title)}（${rd.cost} 🌸）</span>
        <span class="status-badge status-${rd.status}">${rd.status === 'pending' ? '待家長確認' : '已核准待履行'}</span>
      </div>`).join('')}
    </div>` : ''}
    ${Object.entries(byCat).map(([cat, items], idx) => `
      <details class="category-fold" ${idx === 0 ? 'open' : ''} style="padding:4px 14px;margin-bottom:10px">
        <summary style="font-size:15px;padding:8px 0">${esc(cat)} <small class="subtext">（${items.length} 項）</small></summary>
        ${items.map(r => {
          const usedCount = redemptions.filter(x => x.rewardId === r.id && x.status !== 'cancelled').length;
          const limitReached = Number(r.limit) > 0 && usedCount >= Number(r.limit);
          const diff = (Number(r.cost) || 0) - w.available;
          return `<div class="reward-item">
            <div class="reward-info">
              <b>${esc(r.title)}</b>
              <small>需要 🌸 ${r.cost} 朵 ${diff > 0 ? `（還差 ${diff} 朵）` : '（點數足夠！）'}${r.limit > 0 ? ` · 已兌換 ${usedCount}/${r.limit} 次` : ''}${r.budget ? ` · 預算上限 $${r.budget}` : ''}</small>
              ${r.note ? `<small style="display:block;color:#8a6d3b">※ ${esc(r.note)}</small>` : ''}
            </div>
            ${limitReached
              ? '<span class="chip">已達上限</span>'
              : diff > 0
                ? `<button class="ghost-btn btn-sm" disabled style="opacity:.55;cursor:not-allowed">差 ${diff} 🌸</button>`
                : `<button class="secondary btn-sm" data-request-redeem="${esc(r.id)}" type="button">申請兌換</button>`}
          </div>`;
        }).join('')}
      </details>
    `).join('')}
  </div>`;
}

function renderBackupBanner() {
  const banner = $('#backupBanner');
  if (!banner) return;
  banner.hidden = true;
  banner.innerHTML = '';
}

function home() {
  const p = profiles[child];
  const ids = plan();
  const done = ids.filter(completed).length;
  const weekSessions = sessionsIn(week());
  const stage = gardenStage(weekSessions.length);
  const map = allTasksMap();
  const nextId = nextTask();
  const w = walletStats(child);
  return `
    <section class="hero ${celebrateHero ? 'celebrating' : ''}">
      <span class="tag">SMALL STEPS, EVERY DAY</span>
      <h1>${p.name}，今天也一起長大吧。</h1>
      <p>每天照自己的節奏完成 ${ids.length} 個推薦小練習，不求完美，願意嘗試與重新開始就是最棒的進步。</p>
      <div class="garden-status">🌱 本週花園：<b>${stage.label}</b>（本週已完成 ${weekSessions.length} 次 · ${stage.next}）</div>
      ${gardenSVG(weekSessions.length, celebrateHero)}
    </section>
    <div class="section-head"><h2>今天，感覺怎麼樣？ <small>依當下狀態智慧調整每日推薦任務</small></h2></div>
    <div class="layout">
      <div>
        <section class="card checkin">
          <h3>陪${p.name}選一個現在的感覺</h3>
          <div class="mood-row">
            ${[['ready', '😊', '精神不錯'], ['distracted', '🌀', '有點分心'], ['angry', '🌧', '心情不太好'], ['tired', '😴', '有點想睡']].map(([v, e, t]) => `<button class="mood ${check() === v ? 'selected' : ''}" data-mood="${v}" aria-pressed="${check() === v}" type="button"><span>${e}</span>${t}</button>`).join('')}
          </div>
          <div class="check-bottom"><span>狀態沒有對錯；疲倦或情緒不佳時會自動減量。</span><span>選擇即儲存 ✓</span></div>
        </section>
        <div class="section-head">
          <h2>🌟 今日智慧推薦任務（${ids.length} 項）</h2>
          <a href="#tasks" class="text-link">瀏覽全部 6 大類任務 ↗</a>
        </div>
        ${tasksHTML()}
        <div style="margin-top:18px">${walletCardHTML()}</div>
      </div>
      <div>
        <div class="card progress-card">
          <h3>今天的小小累積 <span style="float:right">🌱</span></h3>
          <div class="big">${done} <small>/ ${ids.length} 項推薦</small></div>
          <div class="progress-track"><div style="width:${ids.length ? (done / ids.length * 100) : 0}%"></div></div>
          <div class="points-pill">🌸 可用小花：<b>${w.available} 朵</b>（今日 +${w.todayEarned}）</div>
          <p>${done ? '謝謝你願意練習，每一小步都留下了足跡！' : '花園準備好了，從第一個推薦任務開始吧。'}</p>
          ${weekChart()}
        </div>
        <div class="card tip">
          <h3>✧ 給陪伴的你</h3>
          <p>${recommendation()}</p>
          ${nextId && map[nextId] ? `<blockquote>${esc(map[nextId].promptText)}</blockquote>
          <button class="primary full" data-start="${esc(nextId)}" type="button">開始下一個：${esc(map[nextId].title)} →</button>` : '<p>今天的推薦任務都完成了，好好休息吧！</p>'}
        </div>
        ${rewardsShopHTML()}
      </div>
    </div>
    <p class="notice">✳ 這是日常陪伴與觀察工具，不提供醫療診斷。兩個孩子獨立計點、不排名、犯錯不扣分。已啟用 Google 試算表雲端同步與瀏覽器本機雙重保存。</p>`;
}

function settings() {
  const focusCat = data().focusCategory || 'auto';
  return `<div class="card">
    <div class="form-grid">
      <label>家長指定近期練習重點（影響智慧推薦）
        <select id="focusCategory">
          <option value="auto" ${focusCat === 'auto' ? 'selected' : ''}>自動依孩子檔案平衡推薦</option>
          <option value="專注力訓練" ${focusCat === '專注力訓練' ? 'selected' : ''}>優先加強：A. 專注力訓練</option>
          <option value="作業習慣" ${focusCat === '作業習慣' ? 'selected' : ''}>優先加強：B. 作業習慣</option>
          <option value="情緒管理" ${focusCat === '情緒管理' ? 'selected' : ''}>優先加強：C. 情緒管理</option>
          <option value="自我控制" ${focusCat === '自我控制' ? 'selected' : ''}>優先加強：D. 自我控制</option>
          <option value="生活自理" ${focusCat === '生活自理' ? 'selected' : ''}>優先加強：E. 生活自理</option>
          <option value="親子互動" ${focusCat === '親子互動' ? 'selected' : ''}>優先加強：F. 親子互動</option>
        </select>
      </label>
      <label>預設練習難度檢視
        <select id="level">
          <option value="easy">輕鬆起步 · 簡單</option>
          <option value="normal">穩穩練習 · 一般</option>
          <option value="challenge">小小挑戰 · 進階</option>
        </select>
      </label>
    </div>
    <p class="subtext" style="margin-bottom:0">集點規則：願意嘗試 (+1🌸) · 完成簡單任務 (+2🌸) · 持續努力任務 (+3🌸) · 較高難度或延長任務 (+4🌸)。同一任務達每日上限後不重複計點。</p>
  </div>`;
}

function taskPage() {
  const recIds = plan();
  const allForChild = childTasks(false);
  const categories = Object.keys(CATEGORY_META);

  return `<h1 class="page-title">今天，練習一小步。</h1>
    <p class="subtext">為${profiles[child].name}挑選合適的練習。${recommendation()}</p>
    ${settings()}
    <div class="section-head"><h2>🌟 今日智慧推薦（${recIds.length} 項）</h2><small>依年齡、近期完成與今日狀態推薦</small></div>
    <div class="layout">
      <div>
        ${tasksHTML()}
        <div class="section-head">
          <h2>📚 六大類訓練任務庫（共 ${allForChild.length} 項適用）</h2>
          <a href="#parent" class="text-link">家長管理／新增任務 ↗</a>
        </div>
        ${categories.map((cat, idx) => {
          const items = allForChild.filter(t => t.category === cat);
          const meta = CATEGORY_META[cat];
          return `<details class="category-fold" ${idx === 0 ? 'open' : ''}>
            <summary>
              <span><span class="cat-badge ${meta.cls}">${meta.code}. ${esc(cat)}</span></span>
              <small class="subtext">${items.length} 項任務 ▾</small>
            </summary>
            <div style="padding-top:8px">
              ${items.map(t => renderTaskCard(t)).join('')}
            </div>
          </details>`;
        }).join('')}
      </div>
      <div>
        ${walletCardHTML()}
        ${rewardsShopHTML()}
      </div>
    </div>`;
}

function recordPage() {
  return `<h1 class="page-title">把今天，輕輕記下來。</h1>
    <p class="subtext">${profiles[child].name}的日常觀察。未知可以留白，不需要補猜數字。</p>
    <div class="layout">
      <form id="logForm" class="card">
        <div class="form-grid">
          <label>紀錄日期<input name="date" type="date" value="${today()}" max="${today()}" required></label>
          <label>觀察情境
            <select name="context">
              <option value="">尚未填寫</option>
              <option>寫作業</option>
              <option>閱讀</option>
              <option>學校回饋</option>
              <option>家庭活動</option>
              <option>練習活動</option>
            </select>
          </label>
          <label>情緒
            <select name="mood">
              <option value="">尚未觀察</option>
              <option>平穩</option>
              <option>開心</option>
              <option>煩躁</option>
              <option>生氣</option>
              <option>難過</option>
            </select>
          </label>
          <label>精神狀態
            <select name="energy">
              <option value="">尚未觀察</option>
              <option>精神不錯</option>
              <option>有點累</option>
              <option>很想睡</option>
            </select>
          </label>
          <label>分心次數<input name="distractions" type="number" min="0" max="999" placeholder="未知請留白"></label>
          <label>家長提醒次數<input name="reminders" type="number" min="0" max="999" placeholder="未知請留白"></label>
          <label>作業投入時間（分鐘）<input name="homework" type="number" min="0" max="600" placeholder="未知請留白"></label>
          <label>恢復平靜時間（分鐘）<input name="calmMinutes" type="number" min="0" max="600" placeholder="未知請留白"></label>
          <label class="wide">發生了什麼？什麼方式有幫助？
            <textarea name="note" maxlength="2000" placeholder="例如：國字書寫卡住後生氣；先休息喝水，再用計時器分段提示第一步。"></textarea>
          </label>
        </div>
        <details ${child === 'girl' ? 'open' : ''}>
          <summary style="margin:20px 0;color:#66755f">☾ 睡眠與白天精神觀察</summary>
          <div class="form-grid">
            <label>昨晚上床時間<input type="time" name="bed"></label>
            <label>昨晚估計入睡時間<input type="time" name="asleep"></label>
            <label>今天起床時間<input type="time" name="wake"></label>
            <label>估計睡眠時數<input name="sleepHours" type="number" min="0" max="24" step="0.1" placeholder="不清楚可留白"></label>
            <label>打呼／鼻塞
              <select name="snore">
                <option value="">未知／未觀察</option>
                <option>無觀察到</option>
                <option>打呼</option>
                <option>鼻塞</option>
                <option>打呼與鼻塞</option>
              </select>
            </label>
            <label>白天想睡的情境
              <select name="sleepy">
                <option value="">未知／未觀察</option>
                <option>沒有觀察到</option>
                <option>坐著看書</option>
                <option>上課或考試</option>
                <option>其他活動</option>
              </select>
            </label>
          </div>
        </details>
        <button class="primary full">儲存今天的觀察</button>
      </form>
      <div>
        <div class="card tip" style="margin:0">
          <h3>記錄事實，保留空白</h3>
          <p>記下看見的行為、時間與協助方式。分心次數會隨活動長度不同而改變，不用拿兩個孩子互相比較。</p>
          <p>每一筆儲存後若要「編輯」或「刪除」，會需要輸入家長操作密碼。</p>
        </div>
      </div>
    </div>
    <div class="section-head"><h2>最近的日常紀錄</h2></div>
    <div class="card">${logsHTML()}</div>`;
}

function deleteBtnHTML(type, id) {
  const k = `${type}:${id}`;
  if (confirmDeleteKey === k) {
    return `<button class="danger-btn btn-sm" data-confirm-del="${esc(k)}" type="button">確定刪除</button>
            <button class="ghost-btn btn-sm" data-cancel-del type="button">取消</button>`;
  }
  return `<button class="danger-btn btn-sm" data-ask-del="${esc(k)}" type="button">刪除</button>`;
}

function logsHTML() {
  const list = [...data().logs].sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created);
  if (!list.length) return '<div class="empty">這裡還沒有紀錄。<br>從今天的一個小觀察開始，不必填滿每一格。</div>';
  return list.map(l => `<article class="record">
    <div class="record-head">
      <b>${esc(l.date)} · ${esc(l.context || '未填情境')}</b>
      <div class="record-actions">
        <button class="secondary btn-sm" data-edit-log="${esc(l.id)}" type="button">編輯</button>
        ${deleteBtnHTML('log', l.id)}
      </div>
    </div>
    <p>${[l.mood, l.energy, l.distractions !== '' ? '分心 ' + l.distractions + ' 次' : '', l.reminders !== '' ? '提醒 ' + l.reminders + ' 次' : '', l.homework !== '' ? '作業 ' + l.homework + ' 分鐘' : '', l.calmMinutes !== '' ? '平復 ' + l.calmMinutes + ' 分鐘' : ''].filter(Boolean).map(esc).join(' ／ ') || '尚未填寫狀態'}</p>
    ${(l.bed || l.asleep || l.wake || l.sleepHours || l.snore || l.sleepy) ? `<p>睡眠觀察：${esc([l.bed ? '上床 ' + l.bed : '', l.asleep ? '入睡 ' + l.asleep : '', l.wake ? '起床 ' + l.wake : '', l.sleepHours ? '睡眠 ' + l.sleepHours + ' 小時' : '', l.snore, l.sleepy].filter(Boolean).join(' ／ '))}</p>` : ''}
    ${l.note ? `<p style="white-space:pre-wrap">${esc(l.note)}</p>` : ''}
  </article>`).join('');
}

function average(logs, k) {
  const values = logs.filter(l => l[k] !== '' && l[k] != null).map(l => Number(l[k])).filter(Number.isFinite);
  return values.length ? { v: values.reduce((a, b) => a + b, 0) / values.length, n: values.length } : null;
}

function trend(k, label) {
  const a = average(data().logs.filter(l => week().includes(l.date)), k);
  const b = average(data().logs.filter(l => week(-1).includes(l.date)), k);
  return `<p>${label}：${a ? `本週平均 ${a.v.toFixed(1)}（${a.n} 筆）` : '本週尚無資料'}${b ? `；上週平均 ${b.v.toFixed(1)}（${b.n} 筆）` : '；上週尚無資料'}。${a && b ? '變化 ' + (a.v - b.v >= 0 ? '+' : '') + (a.v - b.v).toFixed(1) + '；僅供觀察。' : ''}</p>`;
}

function generateObservationSummary(daysCount) {
  const p = profiles[child];
  const dates = recentDays(daysCount);
  const logs = data().logs.filter(l => dates.includes(l.date)).sort((a, b) => a.date.localeCompare(b.date));
  const ss = sessionsIn(dates);
  const activeDays = new Set(ss.map(s => s.date)).size;
  const w = walletStats(child);

  const avgSleep = average(logs, 'sleepHours');
  const avgDist = average(logs, 'distractions');
  const avgRem = average(logs, 'reminders');
  const avgCalm = average(logs, 'calmMinutes');

  const snoreCounts = {};
  const sleepyCounts = {};
  const moodCounts = {};
  logs.forEach(l => {
    if (l.snore && l.snore !== '無觀察到') snoreCounts[l.snore] = (snoreCounts[l.snore] || 0) + 1;
    if (l.sleepy && l.sleepy !== '沒有觀察到') sleepyCounts[l.sleepy] = (sleepyCounts[l.sleepy] || 0) + 1;
    if (l.mood) moodCounts[l.mood] = (moodCounts[l.mood] || 0) + 1;
  });

  const formatMap = m => Object.entries(m).length ? Object.entries(m).map(([k, v]) => `${k} ${v} 次`).join('、') : '無特別記錄';
  const notes = logs.filter(l => l.note && l.note.trim()).map(l => `- [${l.date}${l.context ? ' ' + l.context : ''}] ${l.note.trim()}`);

  return `【小步日常｜家庭觀察摘要（近 ${daysCount} 天）】
孩子姓名：${p.full}（${p.age}，${p.grade}）
統計區間：${dates[dates.length - 1]} ～ ${dates[0]}
（註：本摘要為日常家庭陪伴與行為觀察紀錄，非醫療診斷報告）

一、練習參與與集點概況
- 練習天數：${activeDays} / ${daysCount} 天（完成 ${ss.length} 次練習）
- 小花錢包：目前可用 ${w.available} 朵（歷史累積獲得 ${w.totalEarned} 朵，已兌換使用 ${w.totalSpent} 朵）

二、專注與情緒趨勢
- 分心次數平均：${avgDist ? `${avgDist.v.toFixed(1)} 次（共 ${avgDist.n} 筆）` : '尚無紀錄'}
- 家長提醒平均：${avgRem ? `${avgRem.v.toFixed(1)} 次（共 ${avgRem.n} 筆）` : '尚無紀錄'}
- 恢復平靜平均：${avgCalm ? `${avgCalm.v.toFixed(1)} 分鐘（共 ${avgCalm.n} 筆）` : '尚無紀錄'}
- 情緒分布：${formatMap(moodCounts)}

三、睡眠與白天精神觀察
- 估計睡眠平均：${avgSleep ? `${avgSleep.v.toFixed(1)} 小時（共 ${avgSleep.n} 筆）` : '尚無紀錄'}
- 打呼／鼻塞紀錄：${formatMap(snoreCounts)}
- 白天想睡情境：${formatMap(sleepyCounts)}

四、家長文字觀察筆記（共 ${notes.length} 筆）
${notes.length ? notes.join('\n') : '（此區間尚無文字筆記）'}`;
}

function filteredCatalogTasks() {
  return (db.taskCatalog || []).filter(t => {
    if (!t) return false;
    if (filterTaskCat !== 'all' && t.category !== filterTaskCat) return false;
    if (filterTaskTarget !== 'all' && t.target !== filterTaskTarget && !(filterTaskTarget !== 'both' && t.target === 'both')) return false;
    if (filterTaskDiff !== 'all' && t.difficulty !== filterTaskDiff) return false;
    if (filterTaskSearch.trim()) {
      const q = filterTaskSearch.trim().toLowerCase();
      const hay = `${t.title} ${t.desc} ${t.category} ${t.promptText || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function parentPage() {
  if (!isParentUnlocked()) {
    return `<div class="parent-locked-box">
      <span class="eyebrow">PARENTS ONLY</span>
      <h2>🔒 家長檢視已鎖定</h2>
      <p>為了避免孩子誤改觀察紀錄、任務與獎勵設定，進入家長檢視前請先驗證家長操作密碼。</p>
      <button id="unlockParentPageBtn" class="primary" type="button">輸入家長密碼解鎖 →</button>
    </div>`;
  }

  const p = profiles[child];
  const ss = sessionsIn(week());
  const days = new Set(ss.map(s => s.date)).size;
  const logs = data().logs.filter(l => week().includes(l.date));
  const map = allTasksMap();
  const w = walletStats(child);
  const redemptions = data().redemptions || [];
  const tasksFiltered = filteredCatalogTasks();
  const rewardsAll = [...(db.rewardCatalog || [])].sort((a, b) => (Number(a.cost) || 0) - (Number(b.cost) || 0));

  return `<h1 class="page-title">陪伴的足跡與系統管理。</h1>
    <p class="subtext">${p.full}的個別檔案、小花錢包、任務與獎勵管理 · ${week()[0]} — ${week()[6]}</p>
    ${walletCardHTML()}
    <div class="stats">
      <div class="card stat"><span>本週練習日</span><strong>${days}<small style="font-size:14px"> / 7 天</small></strong><span>有打卡的不同日期</span></div>
      <div class="card stat"><span>本週完成練習</span><strong>${ss.length}<small style="font-size:14px"> 次</small></strong><span>本週獲得 +${w.weekEarned} 🌸</span></div>
      <div class="card stat"><span>本週日常觀察</span><strong>${logs.length}<small style="font-size:14px"> 筆</small></strong><span>保留每次真實觀察</span></div>
    </div>

    <div class="layout">
      <div>
        <!-- 兌換申請審核與歷史紀錄 -->
        <div class="section-head"><h2>🎫 獎勵兌換申請審核與紀錄（${p.name}）</h2><small>核准時扣點 · 取消時自動退點且不重複退扣</small></div>
        <div class="card">
          ${redemptions.length ? redemptions.map(rd => {
            const stLabel = { pending: '待確認（尚未扣點）', approved: '已核准待履行（已扣點）', completed: '已完成履行', cancelled: '已取消／已退回' }[rd.status] || rd.status;
            return `<div class="record">
              <div class="record-head">
                <div>
                  <b>${esc(rd.date)} · ${esc(rd.title)}（${rd.cost} 🌸）</b>
                  <span class="status-badge status-${rd.status}" style="margin-left:6px">${stLabel}</span>
                </div>
                <div class="record-actions">
                  ${rd.status === 'pending' ? `<button class="primary btn-sm" data-rd-action="approve:${esc(rd.id)}" type="button">核准扣點</button>` : ''}
                  ${rd.status === 'pending' || rd.status === 'approved' ? `<button class="secondary btn-sm" data-rd-action="complete:${esc(rd.id)}" type="button">標記已完成</button>` : ''}
                  ${rd.status !== 'cancelled' ? `<button class="danger-btn btn-sm" data-rd-action="cancel:${esc(rd.id)}" type="button">取消／退點</button>` : ''}
                </div>
              </div>
            </div>`;
          }).join('') : '<p class="subtext">目前尚無獎勵兌換紀錄。</p>'}
        </div>

        <!-- 任務資料庫管理 -->
        <div class="section-head">
          <h2>📋 任務資料庫管理（共 ${db.taskCatalog.length} 項）</h2>
          <button id="openNewTaskBtn" class="primary btn-sm" type="button">＋ 新增自訂任務</button>
        </div>
        <div class="card">
          <div class="filter-bar">
            <input id="fSearch" type="search" placeholder="🔍 搜尋任務名稱或說明..." value="${esc(filterTaskSearch)}">
            <select id="fCat">
              <option value="all" ${filterTaskCat === 'all' ? 'selected' : ''}>所有分類（A～F）</option>
              ${Object.keys(CATEGORY_META).map(c => `<option value="${esc(c)}" ${filterTaskCat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
            </select>
            <select id="fTarget">
              <option value="all" ${filterTaskTarget === 'all' ? 'selected' : ''}>所有適用對象</option>
              <option value="girl" ${filterTaskTarget === 'girl' ? 'selected' : ''}>彗瑄適用</option>
              <option value="boy" ${filterTaskTarget === 'boy' ? 'selected' : ''}>邦盛適用</option>
              <option value="both" ${filterTaskTarget === 'both' ? 'selected' : ''}>兩人皆適用</option>
            </select>
            <select id="fDiff">
              <option value="all" ${filterTaskDiff === 'all' ? 'selected' : ''}>所有難度</option>
              <option value="easy" ${filterTaskDiff === 'easy' ? 'selected' : ''}>簡單</option>
              <option value="normal" ${filterTaskDiff === 'normal' ? 'selected' : ''}>一般</option>
              <option value="challenge" ${filterTaskDiff === 'challenge' ? 'selected' : ''}>進階</option>
            </select>
          </div>
          <details open>
            <summary style="cursor:pointer;font-weight:700;margin-bottom:10px">顯示篩選結果（${tasksFiltered.length} 項）▾</summary>
            ${tasksFiltered.map(t => {
              const meta = CATEGORY_META[t.category] || { cls: 'cat-focus' };
              const targetLabel = { both: '兩人', girl: '彗瑄', boy: '邦盛' }[t.target] || '兩人';
              const diffLabel = { easy: '簡單', normal: '一般', challenge: '進階' }[t.difficulty] || '簡單';
              return `<div class="record" style="${t.active === false ? 'opacity:.55' : ''}">
                <div class="record-head">
                  <div>
                    <b>${esc(t.title)}</b>
                    <span class="cat-badge ${meta.cls}" style="margin-left:6px">${esc(t.category)}</span>
                    <span class="chip">適用：${targetLabel}</span>
                    <span class="chip">${diffLabel} · ${t.minutes || 5}分</span>
                    <span class="flower-badge">🌸 ${t.flowers || 2}</span>
                    ${t.active === false ? '<span class="status-badge status-cancelled">已停用</span>' : ''}
                  </div>
                  <div class="record-actions">
                    <button class="secondary btn-sm" data-edit-task="${esc(t.id)}" type="button">編輯</button>
                    <button class="ghost-btn btn-sm" data-toggle-task="${esc(t.id)}" type="button">${t.active === false ? '啟用' : '停用'}</button>
                    ${deleteBtnHTML('task', t.id)}
                  </div>
                </div>
                <p>${esc(t.desc)} ｜ 引導語：${esc(t.promptText || '')}</p>
              </div>`;
            }).join('')}
          </details>
        </div>

        <!-- 集點商店獎勵管理 -->
        <div class="section-head">
          <h2>🎁 集點獎勵資料庫管理（共 ${rewardsAll.length} 項）</h2>
          <button id="openNewRewardBtn" class="primary btn-sm" type="button">＋ 新增獎勵項目</button>
        </div>
        <div class="card">
          <div class="form-grid" style="align-items:end;margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--line)">
            <label>實體獎勵單項預算上限（元，避免超出合理花費）
              <input id="physicalBudgetInput" type="number" min="0" max="10000" value="${db.physicalBudgetMax || 500}">
            </label>
            <div><button id="saveBudgetBtn" class="secondary" type="button">儲存實體預算上限</button></div>
          </div>
          <details>
            <summary style="cursor:pointer;font-weight:700;margin-bottom:10px">展開管理全部獎勵項目（${rewardsAll.length} 項，依小花排序）▾</summary>
            ${rewardsAll.map(r => {
              const targetLabel = { both: '兩人', girl: '彗瑄', boy: '邦盛' }[r.target] || '兩人';
              return `<div class="record" style="${r.active === false ? 'opacity:.55' : ''}">
                <div class="record-head">
                  <div>
                    <b>${esc(r.title)}</b>
                    <span class="flower-badge" style="margin-left:6px">🌸 ${r.cost} 朵</span>
                    <span class="chip">${esc(r.category || '日常小確幸')}</span>
                    <span class="chip">適用：${targetLabel}</span>
                    ${r.limit > 0 ? `<span class="chip">上限 ${r.limit} 次</span>` : ''}
                    ${r.budget ? `<span class="chip">預算 $${r.budget}</span>` : ''}
                    ${r.active === false ? '<span class="status-badge status-cancelled">已停用</span>' : ''}
                  </div>
                  <div class="record-actions">
                    <button class="secondary btn-sm" data-edit-reward="${esc(r.id)}" type="button">編輯</button>
                    <button class="ghost-btn btn-sm" data-toggle-reward="${esc(r.id)}" type="button">${r.active === false ? '啟用' : '停用'}</button>
                    ${deleteBtnHTML('reward', r.id)}
                  </div>
                </div>
                ${r.note ? `<p>備註：${esc(r.note)}</p>` : ''}
              </div>`;
            }).join('')}
          </details>
        </div>

        <div class="card">
          <h3 style="margin-top:0">這週的小步趨勢</h3>
          ${weekChart()}
          <div class="subtext">
            ${trend('distractions', '分心次數')}
            ${trend('reminders', '提醒次數')}
            ${trend('sleepHours', '估計睡眠時數')}
            <p>情緒紀錄：${['平穩', '開心', '煩躁', '生氣', '難過'].map(m => `${m} ${logs.filter(l => l.mood === m).length} 筆`).join(' · ')}。未填情緒 ${logs.filter(l => !l.mood).length} 筆。</p>
          </div>
        </div>

        <div class="section-head"><h2>匯出近期觀察摘要</h2><small>方便與老師或專業人員溝通</small></div>
        <div class="card print-only-area">
          <div class="form-grid" style="align-items:end">
            <label>選擇統計區間
              <select id="summaryRange">
                <option value="7" ${summaryDays === 7 ? 'selected' : ''}>近 7 天（週報）</option>
                <option value="30" ${summaryDays === 30 ? 'selected' : ''}>近 30 天（月報）</option>
              </select>
            </label>
            <div class="toolbar">
              <button id="copySummary" class="secondary" type="button">📋 複製純文字摘要</button>
              <button id="printSummary" class="primary" type="button">🖨 列印／存成 PDF</button>
            </div>
          </div>
          <div id="summaryPreview" class="summary-box">${esc(generateObservationSummary(summaryDays))}</div>
        </div>

        <div class="section-head"><h2>孩子的個別檔案</h2></div>
        <form class="card" id="profileForm">
          <b>${p.full} · ${p.age} · ${p.grade}</b>
          <p class="subtext">生日 ${p.birth} · 年齡與年級以 2026/11 家長資訊為基準</p>
          <ul class="profile-points">${p.traits.map(t => `<li>${t}</li>`).join('')}</ul>
          <p class="subtext"><b>喜愛與回饋：</b>${p.favorites}<br><b>安撫與提醒：</b>${p.calming}</p>
          <p class="subtext">${p.unknown}</p>
          <label>補充或更新觀察
            <textarea id="extra" maxlength="4000" placeholder="可補充最新作息、老師回饋或有效方式。">${esc(data().extra)}</textarea>
          </label>
          <button class="secondary full">儲存補充內容</button>
        </form>

        <div class="section-head"><h2>☁ 雲端自動同步（Google 試算表）</h2></div>
        <div class="card">
          <form id="cloudConfigForm" class="form-grid">
            <label class="wide">Apps Script 網頁應用程式網址（/exec 結尾）
              <input name="url" type="url" value="${esc(getCloudConfig().url)}" placeholder="https://script.google.com/macros/s/.../exec">
            </label>
            <label class="wide">自訂同步密鑰（需與 Code.gs 的 SECRET_TOKEN 一致）
              <input name="token" type="text" value="${esc(getCloudConfig().token)}" placeholder="例如：darren0937701291">
            </label>
            <div class="toolbar wide">
              <button class="primary" type="submit">儲存設定並立即同步</button>
              <button id="manualPullBtn" class="secondary" type="button">↓ 從雲端拉取合併</button>
            </div>
          </form>
        </div>

        <div class="section-head"><h2>🔐 密碼與安全設定</h2></div>
        <div class="card">
          <form id="familyPinForm" class="form-grid" style="align-items:end;padding-bottom:16px;border-bottom:1px solid var(--line)">
            <label>全家登入密碼 <small class="subtext">（目前：${db.auth.isDefaultFamily ? '預設' : '已自訂'}）</small>
              <input name="newFamilyPin" type="text" minlength="4" required placeholder="輸入新的全家登入密碼（至少 4 碼）">
            </label>
            <div><button class="secondary full" style="margin-top:0" type="submit">更新全家登入密碼</button></div>
          </form>
          <form id="parentPinChangeForm" class="form-grid" style="align-items:end;margin-top:16px">
            <label>家長操作密碼 <small class="subtext">（目前：${db.auth.isDefaultParent ? '預設' : '已自訂'}）</small>
              <input name="newParentPin" type="text" minlength="4" required placeholder="輸入新的家長操作密碼（至少 4 碼）">
            </label>
            <div><button class="secondary full" style="margin-top:0" type="submit">更新家長操作密碼</button></div>
          </form>
        </div>
      </div>

      <div>
        <div class="card tip" style="margin:0">
          <h3>☁ 雲端與本機雙重保護</h3>
          <p>所有日常觀察、40 項任務、18 項獎勵、小花錢包與密碼設定均儲存於瀏覽器 localStorage 並自動同步至 Google 試算表。</p>
          <button id="sidePullBtn" class="secondary full" type="button">↻ 立即同步雲端最新資料</button>
          <button id="exportBackupBtn" class="ghost-btn full" type="button">↓ 下載 JSON 安全備份檔</button>
        </div>
        <div class="card tip">
          <h3>陪伴，不是評分</h3>
          <p>本工具不診斷 ADHD 或其他疾病，也不以紀錄推論疾病。練習以日常習慣與親子陪伴為目的。</p>
          <p>兩個孩子各自獨立累積小花，不做排名、犯錯不扣點。生氣或失敗不等於沒進步，願意嘗試與重新開始最值得肯定。</p>
        </div>
      </div>
    </div>

    <div class="section-head"><h2>練習打卡紀錄</h2></div>
    <div class="card">
      ${data().sessions.length ? [...data().sessions].sort((a, b) => b.created - a.created).slice(0, 30).map(s => `<div class="record">
        <div class="record-head">
          <b>${esc(s.date)} · ${esc(map[s.task]?.title || s.taskTitle || s.task)} <span class="flower-badge">🌸 +${s.earned || 1}</span></b>
          <div class="record-actions">
            <button class="secondary btn-sm" data-edit-session="${esc(s.id)}" type="button">編輯</button>
            ${deleteBtnHTML('session', s.id)}
          </div>
        </div>
        <p>${esc(s.level)} · 安排 ${s.planned} 分鐘 · 實際計時 ${Math.floor(s.elapsed / 60)} 分 ${s.elapsed % 60} 秒 · 分心 ${s.distractions} 次${s.elapsed < s.planned * 60 ? ' · 提早結束' : ''}</p>
      </div>`).join('') : '<div class="empty">完成一個練習後，足跡就會出現在這裡。</div>'}
    </div>`;
}

function render() {
  if (!isLoggedIn()) return;
  page = location.hash.slice(1) || 'home';
  if (!['home', 'tasks', 'records', 'parent'].includes(page)) page = 'home';
  document.querySelectorAll('nav a').forEach(a => a.classList.toggle('active', a.hash === '#' + page));
  document.querySelectorAll('[data-child]').forEach(b => b.classList.toggle('selected', b.dataset.child === child));

  renderBackupBanner();
  $('#app').innerHTML = ({ home, tasks: taskPage, records: recordPage, parent: parentPage }[page])();
  if (celebrateHero) setTimeout(() => { celebrateHero = false; }, 1600);

  if ($('#unlockParentPageBtn')) {
    $('#unlockParentPageBtn').onclick = () => requireParentAuth('請輸入家長密碼以進入家長檢視。', () => render());
  }

  if ($('#level')) {
    $('#level').value = data().level;
    $('#level').onchange = e => { data().level = e.target.value; save(); render(); };
  }
  if ($('#focusCategory')) {
    $('#focusCategory').onchange = e => { data().focusCategory = e.target.value; save(); render(); };
  }

  document.querySelectorAll('[data-mood]').forEach(b => b.onclick = () => {
    data().checks[today()] = b.dataset.mood;
    save();
    render();
  });

  document.querySelectorAll('[data-start]').forEach(b => b.onclick = () => start(b.dataset.start));

  // 孩子提出兌換申請（若家長已解鎖可直接核准扣點；否則建立「待確認」申請，由家長確認後才扣點）
  document.querySelectorAll('[data-request-redeem]').forEach(b => b.onclick = () => {
    const r = (db.rewardCatalog || []).find(x => x.id === b.dataset.requestRedeem);
    if (!r) return;
    const w = walletStats(child);
    if (w.available < r.cost) {
      toast(`還差 ${r.cost - w.available} 朵小花才能兌換喔！`);
      return;
    }
    if (isParentUnlocked()) {
      data().redemptions.unshift({
        id: crypto.randomUUID(),
        rewardId: r.id,
        title: r.title,
        cost: Number(r.cost),
        status: 'approved',
        pointsDeducted: true,
        date: today(),
        created: Date.now(),
        updatedAt: Date.now()
      });
      save();
      render();
      toast(`家長已核准兌換「${r.title}」（扣除 ${r.cost} 🌸）🎉`);
    } else {
      data().redemptions.unshift({
        id: crypto.randomUUID(),
        rewardId: r.id,
        title: r.title,
        cost: Number(r.cost),
        status: 'pending',
        pointsDeducted: false,
        date: today(),
        created: Date.now(),
        updatedAt: Date.now()
      });
      save();
      render();
      toast(`已送出「${r.title}」兌換申請！請爸爸媽媽到家長檢視確認核准。`);
    }
  });

  // 家長審核兌換狀態（確保不重複扣點或重複退點）
  document.querySelectorAll('[data-rd-action]').forEach(b => b.onclick = () => {
    const [act, id] = b.dataset.rdAction.split(':');
    const rd = data().redemptions.find(x => x.id === id);
    if (!rd) return;
    const w = walletStats(child);
    if (act === 'approve') {
      if (!rd.pointsDeducted) {
        if (w.available < rd.cost) {
          toast(`目前可用小花（${w.available} 🌸）不足以扣除 ${rd.cost} 🌸。`);
          return;
        }
        rd.pointsDeducted = true;
      }
      rd.status = 'approved';
      rd.updatedAt = Date.now();
      save();
      render();
      toast(`已核准「${rd.title}」並扣除 ${rd.cost} 🌸。`);
    } else if (act === 'complete') {
      if (!rd.pointsDeducted) {
        if (w.available < rd.cost) {
          toast(`目前可用小花（${w.available} 🌸）不足以扣除 ${rd.cost} 🌸。`);
          return;
        }
        rd.pointsDeducted = true;
      }
      rd.status = 'completed';
      rd.updatedAt = Date.now();
      save();
      render();
      toast(`已將「${rd.title}」標記為已完成履行！`);
    } else if (act === 'cancel') {
      if (rd.status === 'cancelled') return;
      rd.status = 'cancelled';
      rd.pointsDeducted = false;
      rd.updatedAt = Date.now();
      save();
      render();
      toast(`已取消「${rd.title}」兌換，小花點數已自動退回。`);
    }
  });

  // 任務篩選器綁定
  if ($('#fSearch')) {
    $('#fSearch').oninput = e => {
      filterTaskSearch = e.target.value;
      render();
      const input = $('#fSearch');
      if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
    };
  }
  if ($('#fCat')) $('#fCat').onchange = e => { filterTaskCat = e.target.value; render(); };
  if ($('#fTarget')) $('#fTarget').onchange = e => { filterTaskTarget = e.target.value; render(); };
  if ($('#fDiff')) $('#fDiff').onchange = e => { filterTaskDiff = e.target.value; render(); };

  if ($('#openNewTaskBtn')) $('#openNewTaskBtn').onclick = () => openTaskModal(null);
  document.querySelectorAll('[data-edit-task]').forEach(b => b.onclick = () => openTaskModal(b.dataset.editTask));
  document.querySelectorAll('[data-toggle-task]').forEach(b => b.onclick = () => {
    const t = db.taskCatalog.find(x => x.id === b.dataset.toggleTask);
    if (!t) return;
    t.active = t.active === false ? true : false;
    t.updatedAt = Date.now();
    save();
    render();
    toast(`已${t.active ? '啟用' : '停用'}任務「${t.title}」。`);
  });

  if ($('#openNewRewardBtn')) $('#openNewRewardBtn').onclick = () => openRewardModal(null);
  document.querySelectorAll('[data-edit-reward]').forEach(b => b.onclick = () => openRewardModal(b.dataset.editReward));
  document.querySelectorAll('[data-toggle-reward]').forEach(b => b.onclick = () => {
    const r = db.rewardCatalog.find(x => x.id === b.dataset.toggleReward);
    if (!r) return;
    r.active = r.active === false ? true : false;
    r.updatedAt = Date.now();
    save();
    render();
    toast(`已${r.active ? '啟用' : '停用'}獎勵「${r.title}」。`);
  });

  if ($('#saveBudgetBtn')) {
    $('#saveBudgetBtn').onclick = () => {
      db.physicalBudgetMax = Math.max(0, Number($('#physicalBudgetInput').value) || 500);
      save();
      toast(`實體獎勵預算上限已設定為 $${db.physicalBudgetMax} 元。`);
    };
  }

  document.querySelectorAll('[data-ask-del]').forEach(b => b.onclick = () => {
    const keyDel = b.dataset.askDel;
    requireParentAuth('刪除項目需先驗證家長密碼。', () => {
      confirmDeleteKey = keyDel;
      render();
    });
  });
  document.querySelectorAll('[data-cancel-del]').forEach(b => b.onclick = () => {
    confirmDeleteKey = null;
    render();
  });
  document.querySelectorAll('[data-confirm-del]').forEach(b => b.onclick = () => {
    const [type, id] = b.dataset.confirmDel.split(':');
    db.deletedIds = [...(db.deletedIds || []), id].slice(-300);
    if (type === 'log') data().logs = data().logs.filter(x => x.id !== id);
    if (type === 'session') data().sessions = data().sessions.filter(x => x.id !== id);
    if (type === 'task') db.taskCatalog = (db.taskCatalog || []).filter(x => x.id !== id);
    if (type === 'reward') db.rewardCatalog = (db.rewardCatalog || []).filter(x => x.id !== id);
    confirmDeleteKey = null;
    save();
    render();
    toast('已刪除該項目（歷史兌換與打卡紀錄仍安全保留）。');
  });

  document.querySelectorAll('[data-edit-log]').forEach(b => b.onclick = () => {
    const id = b.dataset.editLog;
    requireParentAuth('編輯已儲存的觀察紀錄需先驗證家長密碼。', () => openEditLog(id));
  });
  document.querySelectorAll('[data-edit-session]').forEach(b => b.onclick = () => {
    const id = b.dataset.editSession;
    requireParentAuth('編輯練習打卡紀錄需先驗證家長密碼。', () => openEditSession(id));
  });

  if ($('#logForm')) {
    $('#logForm').onsubmit = e => {
      e.preventDefault();
      const l = Object.fromEntries(new FormData(e.target));
      l.id = crypto.randomUUID();
      l.created = Date.now();
      data().logs.push(l);
      save();
      render();
      toast('今天的觀察已儲存。');
    };
  }

  if ($('#profileForm')) {
    $('#profileForm').onsubmit = e => {
      e.preventDefault();
      data().extra = $('#extra').value;
      save();
      toast('補充內容已儲存。');
    };
  }

  if ($('#cloudConfigForm')) {
    $('#cloudConfigForm').onsubmit = e => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      localStorage.setItem(cloudConfigKey, JSON.stringify({
        url: (fd.url || '').toString().trim(),
        token: (fd.token || '').toString().trim()
      }));
      pullFromCloud(false);
    };
  }
  if ($('#manualPullBtn')) $('#manualPullBtn').onclick = () => pullFromCloud(false);
  if ($('#sidePullBtn')) $('#sidePullBtn').onclick = () => pullFromCloud(false);
  if ($('#exportBackupBtn')) $('#exportBackupBtn').onclick = exportData;

  if ($('#familyPinForm')) {
    $('#familyPinForm').onsubmit = async e => {
      e.preventDefault();
      const pin = new FormData(e.target).get('newFamilyPin')?.toString().trim();
      if (!pin || pin.length < 4) { toast('全家登入密碼請至少輸入 4 碼。'); return; }
      db.auth.familyHash = hashPin(pin);
      db.auth.isDefaultFamily = false;
      db.auth.updatedAt = Date.now();
      save(true);
      await pushToCloud();
      render();
      toast('全家登入密碼已更新並同步至雲端！');
    };
  }

  if ($('#parentPinChangeForm')) {
    $('#parentPinChangeForm').onsubmit = async e => {
      e.preventDefault();
      const pin = new FormData(e.target).get('newParentPin')?.toString().trim();
      if (!pin || pin.length < 4) { toast('家長操作密碼請至少輸入 4 碼。'); return; }
      db.auth.parentHash = hashPin(pin);
      db.auth.isDefaultParent = false;
      db.auth.updatedAt = Date.now();
      save(true);
      await pushToCloud();
      render();
      toast('家長操作密碼已更新並同步至雲端！');
    };
  }

  if ($('#summaryRange')) {
    $('#summaryRange').onchange = e => {
      summaryDays = Number(e.target.value);
      $('#summaryPreview').textContent = generateObservationSummary(summaryDays);
    };
  }
  if ($('#copySummary')) {
    $('#copySummary').onclick = async () => {
      const text = generateObservationSummary(summaryDays);
      try {
        await navigator.clipboard.writeText(text);
        toast('已複製觀察摘要到剪貼簿！');
      } catch {
        toast('瀏覽器限制剪貼簿權限，請手動選取文字複製。');
      }
    };
  }
  if ($('#printSummary')) $('#printSummary').onclick = () => window.print();
}

function openTaskModal(id) {
  const form = $('#editTaskForm');
  form.reset();
  if (id) {
    const t = db.taskCatalog.find(x => x.id === id);
    if (!t) return;
    $('#editTaskModalTitle').textContent = '編輯任務設定';
    form.elements.id.value = t.id;
    form.elements.title.value = t.title;
    form.elements.icon.value = t.icon || '🌱';
    form.elements.category.value = t.category || '專注力訓練';
    form.elements.target.value = t.target || 'both';
    form.elements.difficulty.value = t.difficulty || 'easy';
    form.elements.minutes.value = t.minutes || 5;
    form.elements.flowers.value = t.flowers || 2;
    form.elements.maxDaily.value = t.maxDaily || 1;
    form.elements.recommend.value = t.recommend === false ? 'false' : 'true';
    form.elements.active.value = t.active === false ? 'false' : 'true';
    form.elements.desc.value = t.desc || '';
    form.elements.promptText.value = t.promptText || '';
  } else {
    $('#editTaskModalTitle').textContent = '新增自訂任務';
    form.elements.id.value = '';
    form.elements.target.value = child;
  }
  $('#editTaskModal').showModal();
}

$('#editTaskForm').onsubmit = e => {
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(e.target));
  const titleClean = stripEmojiTitle(fd.title);
  const dup = db.taskCatalog.find(t => stripEmojiTitle(t.title) === titleClean && t.id !== fd.id);
  if (dup) {
    toast(`已有相同名稱的任務「${dup.title}」，請勿重複新增。`);
    return;
  }
  const item = {
    id: fd.id || ('custom-' + crypto.randomUUID().slice(0, 8)),
    icon: (fd.icon || '🌱').trim(),
    title: fd.title.trim(),
    category: fd.category,
    target: fd.target,
    difficulty: fd.difficulty,
    minutes: Math.min(15, Math.max(1, Number(fd.minutes) || 5)),
    flowers: Math.min(10, Math.max(1, Number(fd.flowers) || 2)),
    maxDaily: Math.min(10, Math.max(1, Number(fd.maxDaily) || 1)),
    recommend: fd.recommend === 'true',
    active: fd.active === 'true',
    desc: fd.desc.trim(),
    promptText: fd.promptText.trim(),
    updatedAt: Date.now()
  };
  if (fd.id) {
    const idx = db.taskCatalog.findIndex(x => x.id === fd.id);
    if (idx !== -1) db.taskCatalog[idx] = item;
  } else {
    db.taskCatalog.unshift(item);
  }
  save();
  $('#editTaskModal').close();
  render();
  toast('任務設定已儲存！');
};

function openRewardModal(id) {
  const form = $('#editRewardForm');
  form.reset();
  if (id) {
    const r = db.rewardCatalog.find(x => x.id === id);
    if (!r) return;
    $('#editRewardModalTitle').textContent = '編輯獎勵項目';
    form.elements.id.value = r.id;
    form.elements.title.value = r.title;
    form.elements.icon.value = r.icon || '🎁';
    form.elements.category.value = r.category || '日常小確幸';
    form.elements.cost.value = r.cost || 3;
    form.elements.target.value = r.target || 'both';
    form.elements.limit.value = r.limit || 0;
    form.elements.budget.value = r.budget ?? '';
    form.elements.active.value = r.active === false ? 'false' : 'true';
    form.elements.note.value = r.note || '';
  } else {
    $('#editRewardModalTitle').textContent = '新增獎勵項目';
    form.elements.id.value = '';
    form.elements.target.value = 'both';
  }
  $('#editRewardModal').showModal();
}

$('#editRewardForm').onsubmit = e => {
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(e.target));
  const titleClean = stripEmojiTitle(fd.title);
  const dup = db.rewardCatalog.find(r => stripEmojiTitle(r.title) === titleClean && r.id !== fd.id);
  if (dup) {
    toast(`已有相同內容的獎勵「${dup.title}」，請勿重複新增。`);
    return;
  }
  const budgetVal = fd.budget !== '' ? Number(fd.budget) : '';
  if (fd.category === '實體獎勵' && budgetVal !== '' && budgetVal > (db.physicalBudgetMax || 500)) {
    toast(`提醒：此實體獎勵金額 ($${budgetVal}) 超出目前設定的預算上限 ($${db.physicalBudgetMax})。`);
  }
  const item = {
    id: fd.id || ('rew-' + crypto.randomUUID().slice(0, 8)),
    icon: (fd.icon || '🎁').trim(),
    title: fd.title.trim(),
    category: fd.category,
    cost: Math.max(1, Number(fd.cost) || 3),
    target: fd.target,
    limit: Math.max(0, Number(fd.limit) || 0),
    budget: budgetVal,
    active: fd.active === 'true',
    note: (fd.note || '').trim(),
    updatedAt: Date.now()
  };
  if (fd.id) {
    const idx = db.rewardCatalog.findIndex(x => x.id === fd.id);
    if (idx !== -1) db.rewardCatalog[idx] = item;
  } else {
    db.rewardCatalog.push(item);
  }
  db.rewardCatalog.sort((a, b) => (Number(a.cost) || 0) - (Number(b.cost) || 0));
  save();
  $('#editRewardModal').close();
  render();
  toast('獎勵項目已儲存！');
};

function openEditLog(id) {
  const l = data().logs.find(x => x.id === id);
  if (!l) return;
  const form = $('#editLogForm');
  for (const el of form.elements) {
    if (el.name && el.name in l) el.value = l[el.name] ?? '';
  }
  $('#editLogModal').showModal();
}

$('#editLogForm').onsubmit = e => {
  e.preventDefault();
  const updated = Object.fromEntries(new FormData(e.target));
  const idx = data().logs.findIndex(x => x.id === updated.id);
  if (idx !== -1) {
    data().logs[idx] = { ...data().logs[idx], ...updated, updatedAt: Date.now() };
    save();
    $('#editLogModal').close();
    render();
    toast('觀察紀錄已更新。');
  }
};

function openEditSession(id) {
  const s = data().sessions.find(x => x.id === id);
  if (!s) return;
  const form = $('#editSessionForm');
  form.elements.id.value = s.id;
  form.elements.date.value = s.date;
  form.elements.level.value = s.level;
  form.elements.planned.value = s.planned;
  form.elements.elapsed.value = s.elapsed;
  form.elements.distractions.value = s.distractions;
  form.elements.earned.value = s.earned || 1;
  $('#editSessionModal').showModal();
}

$('#editSessionForm').onsubmit = e => {
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(e.target));
  const idx = data().sessions.findIndex(x => x.id === fd.id);
  if (idx !== -1) {
    data().sessions[idx] = {
      ...data().sessions[idx],
      date: fd.date,
      level: fd.level,
      planned: Math.max(1, Number(fd.planned)),
      elapsed: Math.max(0, Number(fd.elapsed)),
      distractions: Math.max(0, Number(fd.distractions)),
      earned: Math.max(1, Number(fd.earned) || 1),
      updatedAt: Date.now()
    };
    save();
    $('#editSessionModal').close();
    render();
    toast('練習紀錄與小花數量已更新。');
  }
};

function start(id) {
  clearInterval(interval);
  interval = null;
  const map = allTasksMap();
  const t = map[id];
  if (!t) return;
  if (completed(id)) {
    toast('這項任務今天已經達到完成上限囉，不重複計點！');
    return;
  }
  const planned = Number(t.minutes) || 5;
  currentTask = {
    id,
    title: t.title,
    child,
    level: t.difficulty || data().level || 'easy',
    planned,
    flowers: Number(t.flowers) || 2,
    date: today()
  };
  total = currentTask.planned * 60;
  remaining = total;
  $('#exerciseTitle').textContent = t.title;
  $('#exerciseInstructions').textContent = t.desc;
  $('#exercisePrompt').textContent = '家長引導語｜' + (t.promptText || '「我們先完成這一小段就好。」');
  $('#sessionDistraction').value = 0;
  $('#sessionEarned').innerHTML = `
    <option value="${currentTask.flowers}">完成本任務預設獎勵（+${currentTask.flowers} 🌸）</option>
    <option value="1">願意嘗試並開始執行（+1 🌸）</option>
    <option value="2">完成簡單任務（+2 🌸）</option>
    <option value="3">完成需要持續努力的任務（+3 🌸）</option>
    <option value="4">完成較高難度或延長任務（+4 🌸）</option>
  `;
  $('#sessionEarned').value = String(currentTask.flowers);
  $('#finishTask').textContent = `✓ 完成練習並領取小花（+${currentTask.flowers} 🌸）`;
  $('#sessionEarned').onchange = e => {
    $('#finishTask').textContent = `✓ 完成練習並領取小花（+${e.target.value} 🌸）`;
  };
  $('#toggleTimer').textContent = '開始計時';
  updateClock();
  $('#exercise').showModal();
}

function updateClock() {
  $('#clock').textContent = String(Math.floor(remaining / 60)).padStart(2, '0') + ':' + String(remaining % 60).padStart(2, '0');
  $('#timer').style.setProperty('--progress', (total - remaining) / total * 100 + '%');
}

function tick() {
  remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
  updateClock();
  if (remaining === 0) {
    clearInterval(interval);
    interval = null;
    $('#toggleTimer').textContent = '計時完成';
    toast('時間到了！可以休息一下，按下方按鈕領取小花。');
  }
}

$('#toggleTimer').onclick = () => {
  if (!remaining) return;
  if (interval) {
    tick();
    clearInterval(interval);
    interval = null;
    $('#toggleTimer').textContent = '繼續計時';
  } else {
    endTime = Date.now() + remaining * 1000;
    interval = setInterval(tick, 250);
    $('#toggleTimer').textContent = '暫停';
  }
};

$('#resetTimer').onclick = () => {
  clearInterval(interval);
  interval = null;
  remaining = total;
  updateClock();
  $('#toggleTimer').textContent = '開始計時';
};

const CHEER_MESSAGES = [
  '太棒了！願意開始和堅持的你超級棒！',
  '分心後還能回到任務，這就是最棒的練習！',
  '一步一步慢慢來，花園因為你的努力更漂亮了！',
  '謝謝你願意嘗試，每一朵小花都是你的努力印記！'
];

$('#finishTask').onclick = () => {
  if (!currentTask) return;
  if (completed(currentTask.id)) {
    $('#exercise').close();
    toast('今日此任務已達完成次數上限，不重複計點喔！');
    return;
  }
  const n = Number($('#sessionDistraction').value);
  if (!Number.isInteger(n) || n < 0 || n > 999) {
    toast('請輸入 0–999 的分心次數。');
    return;
  }
  const earned = Math.max(1, Number($('#sessionEarned').value) || currentTask.flowers || 2);
  if (interval) tick();
  clearInterval(interval);
  interval = null;
  const d = db.children[currentTask.child];
  d.sessions.push({
    id: crypto.randomUUID(),
    date: currentTask.date,
    task: currentTask.id,
    taskTitle: currentTask.title,
    planned: currentTask.planned,
    elapsed: total - remaining,
    level: { easy: '輕鬆起步', normal: '穩穩練習', challenge: '小小挑戰' }[currentTask.level] || '輕鬆起步',
    distractions: n,
    earned,
    created: Date.now(),
    updatedAt: Date.now()
  });
  celebrateHero = true;
  save();
  $('#exercise').close();
  render();
  const cheer = CHEER_MESSAGES[Math.floor(Math.random() * CHEER_MESSAGES.length)];
  toast(`🌸 獲得 +${earned} 朵小花！${cheer}`);
};

$('#exercise').addEventListener('close', () => {
  clearInterval(interval);
  interval = null;
});

function exportData() {
  db.lastBackupAt = Date.now();
  save(true);
  const url = URL.createObjectURL(new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = '小步日常_家庭紀錄_' + today() + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('已下載安全備份檔。');
}

window.addEventListener('hashchange', () => {
  confirmDeleteKey = null;
  render();
  window.scrollTo(0, 0);
});

document.querySelectorAll('[data-child]').forEach(b => b.onclick = () => {
  child = b.dataset.child;
  confirmDeleteKey = null;
  render();
});

$('#date').textContent = new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'long'
}).format(new Date());

if ($('#syncStatusBtn')) {
  $('#syncStatusBtn').onclick = () => {
    const cfg = getCloudConfig();
    if (!cfg.url) {
      toast('請先於「家長檢視 → 雲端自動同步」確認 Apps Script 網址。');
      return;
    }
    pullFromCloud(false);
  };
}

updateAuthUI();
if (isLoggedIn()) {
  render();
}
pullFromCloud(true);
