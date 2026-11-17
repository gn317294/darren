// 去識別化前端 Client（嚴守 INV-1 & INV-2：零內嵌憑證、零真實個資、僅以 child1/child2 序位運作）
// 支援「Hono 後端 /api/* (httpOnly session cookie)」並具備「本機快取 / 單檔預覽 Fallback」雙模式

const $ = s => document.querySelector(s);
const LOCAL_CACHE_KEY = 'family-habit-garden-deid-cache-v1';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayStr = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei' }).format(new Date());

const CATEGORY_META = {
  '專注力訓練': { code: 'A', cls: 'cat-focus', icon: '🎯' },
  '作業習慣': { code: 'B', cls: 'cat-homework', icon: '✏️' },
  '情緒管理': { code: 'C', cls: 'cat-emotion', icon: '💛' },
  '自我控制': { code: 'D', cls: 'cat-control', icon: '🚦' },
  '生活自理': { code: 'E', cls: 'cat-life', icon: '🎒' },
  '親子互動': { code: 'F', cls: 'cat-family', icon: '📚' }
};

// 規格 2.3(a) 點數公式（與 src/domain/scoring.ts 100% 等價）
function computePoints(child) {
  const bonus = Number.isFinite(child?.initialPointsBonus) ? child.initialPointsBonus : 0;
  const earned = (child?.sessions || []).reduce((acc, s) => acc + (Number(s.earned) ?? 1), 0);
  const spent = (child?.redemptions || [])
    .filter(r => (r.status === 'approved' || r.status === 'completed') && r.pointsDeducted === true)
    .reduce((acc, r) => acc + (Number(r.cost) || 0), 0);
  return Math.max(0, bonus + earned - spent);
}

// 規格 2.3(b) 每日次數上限（與 src/domain/caps.ts 100% 等價）
function countTodaySessions(child, taskId, dStr = todayStr()) {
  return (child?.sessions || []).filter(s => s.date === dStr && s.task === taskId).length;
}
function canCheckIn(child, task, dStr = todayStr()) {
  if (!task || task.active === false) return false;
  const maxD = Number.isFinite(Number(task.maxDaily)) && Number(task.maxDaily) > 0 ? Number(task.maxDaily) : 1;
  return countTodaySessions(child, task.id, dStr) < maxD;
}

// 規格 2.3(c) 智慧推薦演算法（與 src/domain/recommend.ts 100% 等價）
const DEFAULT_CHILD_CONFIGS = {
  child1: {
    dailyCount: { ready: 2, distracted: 2, tired: 2, angry: 2 },
    moodPlan: {
      tired: [
        { preferredIds: ['t-life-relax', 't-life-stretch'], fallbackCategory: '生活自理' },
        { preferredIds: ['t-emo-temp', 't-emo-happy'], fallbackCategory: '情緒管理' }
      ],
      angry: [
        { preferredIds: ['t-emo-pause', 't-emo-temp'], fallbackCategory: '情緒管理' },
        { preferredIds: ['t-life-relax', 't-hw-prep'], fallbackCategory: '生活自理' }
      ],
      distracted: [
        { preferredIds: ['t-focus-5m', 't-focus-read'], fallbackCategory: '專注力訓練' },
        { preferredIds: ['t-hw-check', 't-life-bag'], fallbackCategory: '作業習慣' }
      ],
      ready: [
        { preferredIds: ['t-focus-read', 't-focus-10m'], fallbackCategory: '專注力訓練' },
        { preferredIds: ['t-hw-check', 't-life-bag'], fallbackCategory: '$focus' }
      ]
    }
  },
  child2: {
    dailyCount: { ready: 3, distracted: 3, tired: 2, angry: 2 },
    moodPlan: {
      tired: [
        { preferredIds: ['t-life-stretch', 't-focus-5m'], fallbackCategory: '專注力訓練' },
        { preferredIds: ['t-emo-temp', 't-emo-pause'], fallbackCategory: '情緒管理' }
      ],
      angry: [
        { preferredIds: ['t-emo-pause', 't-emo-speak'], fallbackCategory: '情緒管理' },
        { preferredIds: ['t-focus-return', 't-ctrl-light'], fallbackCategory: '自我控制' }
      ],
      distracted: [
        { preferredIds: ['t-focus-return', 't-focus-5m'], fallbackCategory: '專注力訓練' },
        { preferredIds: ['t-focus-2steps', 't-ctrl-light'], fallbackCategory: '自我控制' },
        { preferredIds: ['t-hw-chunk', 't-hw-contact'], fallbackCategory: '作業習慣' }
      ],
      ready: [
        { preferredIds: ['t-focus-5m', 't-focus-return'], fallbackCategory: '專注力訓練' },
        { preferredIds: ['t-hw-chunk', 't-hw-contact'], fallbackCategory: '作業習慣' },
        { preferredIds: ['t-emo-speak', 't-ctrl-wait'], fallbackCategory: '$focus' }
      ]
    }
  }
};

function recommendForChild(cid, state) {
  if (state.recommendations && Array.isArray(state.recommendations[cid])) {
    return state.recommendations[cid];
  }
  const cObj = state.children[cid];
  if (!cObj) return [];
  const dStr = todayStr();
  const yDate = new Date(dStr + 'T12:00:00+08:00');
  yDate.setUTCDate(yDate.getUTCDate() - 1);
  const yStr = yDate.toISOString().slice(0, 10);
  const recent7 = new Set(recentDates(7));

  const mood = cObj.checks?.[dStr] || 'ready';
  const yesterdayTasks = new Set((cObj.sessions || []).filter(s => s.date === yStr).map(s => s.task));
  const recentHighDistract = new Set((cObj.sessions || []).filter(s => recent7.has(s.date) && Number(s.distractions) >= 3).map(s => s.task));
  const focusCategory = cObj.focusCategory || 'auto';

  const pool = (state.tasks || []).filter(t => t && t.active !== false && t.recommend !== false && (t.target === 'both' || t.target === cid));
  const poolMap = new Map(pool.map(t => [t.id, t]));
  const weight = t => (focusCategory !== 'auto' && t.category === focusCategory ? -2 : 0) + (recentHighDistract.has(t.id) ? -1 : 0) + (yesterdayTasks.has(t.id) ? 1 : 0);

  const pickFrom = (prefIds, fbCat) => {
    const cands = prefIds.map(id => poolMap.get(id)).filter(Boolean);
    const catPool = pool.filter(t => !fbCat || t.category === fbCat);
    const merged = [...new Set([...cands, ...catPool, ...pool])];
    return merged.sort((a, b) => weight(a) - weight(b));
  };

  const cfg = cObj.config || DEFAULT_CHILD_CONFIGS[cid] || DEFAULT_CHILD_CONFIGS.child1;
  const slots = cfg.moodPlan[mood] || cfg.moodPlan.ready || [];
  const dailyN = cfg.dailyCount[mood] ?? 2;
  const chosen = [];
  const addUnique = list => {
    for (const t of list) {
      if (t && !chosen.includes(t.id)) { chosen.push(t.id); return; }
    }
  };
  for (const s of slots) {
    const fb = s.fallbackCategory === '$focus' ? (focusCategory !== 'auto' ? focusCategory : '情緒管理') : s.fallbackCategory;
    addUnique(pickFrom(s.preferredIds, fb));
  }
  return chosen.slice(0, dailyN);
}

// 預設去識別化種子（供離線快取初始化，不含任何真實姓名或機密值）
function makeOfflineSeed() {
  return {
    version: 1,
    updatedAt: Date.now(),
    tasks: [
      { id: 't-focus-5m', icon: '🎯', title: '🎯 專心完成 5 分鐘任務', category: '專注力訓練', target: 'both', difficulty: 'easy', minutes: 5, flowers: 2, maxDaily: 1, recommend: true, active: true, desc: '設定 5 分鐘計時器，專注完成一項小活動。', promptText: '「先選一件事情，計時結束再休息；分心了也沒關係，溫柔指回來就好。」' },
      { id: 't-focus-10m', icon: '⏳', title: '⏳ 專心完成 10 分鐘任務', category: '專注力訓練', target: 'both', difficulty: 'normal', minutes: 10, flowers: 3, maxDaily: 1, recommend: true, active: true, desc: '閱讀、寫字或練習 10 分鐘。', promptText: '「我們穩定專心 10 分鐘，完成後一起打勾休息。」' },
      { id: 't-focus-read', icon: '📖', title: '📖 閱讀小偵探', category: '專注力訓練', target: 'child1', difficulty: 'normal', minutes: 10, flowers: 3, maxDaily: 1, recommend: true, active: true, desc: '閱讀 10 分鐘並分享一個故事重點。', promptText: '「選一本喜歡的書，讀完跟家人分享一個你印象最深的地方。」' },
      { id: 't-focus-2steps', icon: '👂', title: '👂 聽指令做兩件事', category: '專注力訓練', target: 'child2', difficulty: 'easy', minutes: 5, flowers: 2, maxDaily: 1, recommend: true, active: true, desc: '聽完兩項簡短指令後，依順序完成。', promptText: '「你可以先告訴我，等一下要依序完成哪兩件事嗎？」' },
      { id: 't-focus-return', icon: '🌟', title: '🌟 分心回來小高手', category: '專注力訓練', target: 'child2', difficulty: 'easy', minutes: 5, flowers: 2, maxDaily: 1, recommend: true, active: true, desc: '分心時接受提醒並重新回到原本任務。', promptText: '「分心沒關係，發現後願意再回來就是最棒的練習！」' },
      { id: 't-hw-prep', icon: '✏️', title: '✏️ 自己準備作業用品', category: '作業習慣', target: 'both', difficulty: 'easy', minutes: 3, flowers: 2, maxDaily: 1, recommend: true, active: true, desc: '開始前準備好鉛筆、橡皮擦與課本，桌面保持清爽。', promptText: '「桌上只留現在要用的文具，讓開始變得簡單。」' },
      { id: 't-hw-chunk', icon: '📝', title: '📝 完成一小段作業', category: '作業習慣', target: 'both', difficulty: 'normal', minutes: 10, flowers: 3, maxDaily: 1, recommend: true, active: true, desc: '把作業拆成小段，完成約定的段落。', promptText: '「我們先完成這一小段就好，寫完就休息伸展。」' },
      { id: 't-hw-check', icon: '🔎', title: '🔎 作業完成自主檢查', category: '作業習慣', target: 'both', difficulty: 'normal', minutes: 5, flowers: 2, maxDaily: 1, recommend: true, active: true, desc: '自己檢查漏寫、題號及訂正項目。', promptText: '「不用寫最快，自己檢查清楚最重要。」' },
      { id: 't-hw-contact', icon: '📒', title: '📒 聯絡簿整理小達人', category: '作業習慣', target: 'child2', difficulty: 'normal', minutes: 8, flowers: 3, maxDaily: 1, recommend: true, active: true, desc: '確認聯絡簿內容完整、逐項核對打勾。', promptText: '「我們對照聯絡簿一項一項打勾，完成後心裡更踏實。」' },
      { id: 't-emo-temp', icon: '💛', title: '💛 今天的心情溫度計', category: '情緒管理', target: 'both', difficulty: 'easy', minutes: 3, flowers: 2, maxDaily: 1, recommend: true, active: true, desc: '說出今天的情緒感覺及原因。', promptText: '「不管開心、累或煩躁都可以說出來，每個感覺都被接納。」' },
      { id: 't-emo-pause', icon: '🌬️', title: '🌬️ 生氣先暫停', category: '情緒管理', target: 'both', difficulty: 'normal', minutes: 5, flowers: 3, maxDaily: 1, recommend: true, active: true, desc: '不高興時先暫停動作，進行三次慢呼吸或喝口水。', promptText: '「可以生氣，但我們先讓身體慢下來，喝口水再說。」' },
      { id: 't-emo-speak', icon: '🗣️', title: '🗣️ 用說的表達需求', category: '情緒管理', target: 'child2', difficulty: 'normal', minutes: 5, flowers: 3, maxDaily: 1, recommend: true, active: true, desc: '遇到困難時用語言說出需要，不丟物品或大喊。', promptText: '「你可以直接告訴我需要什麼幫忙，例如『請提示我第一步』。」' },
      { id: 't-emo-happy', icon: '😊', title: '😊 今天一件開心事', category: '情緒管理', target: 'both', difficulty: 'easy', minutes: 3, flowers: 1, maxDaily: 1, recommend: true, active: true, desc: '分享今天一件值得開心或感謝的小事。', promptText: '「今天有哪一件小事讓你覺得溫暖或開心呢？」' },
      { id: 't-ctrl-light', icon: '🚦', title: '🚦 紅綠燈停看聽', category: '自我控制', target: 'child2', difficulty: 'easy', minutes: 5, flowers: 2, maxDaily: 1, recommend: true, active: true, desc: '透過紅燈停、黃燈想、綠燈動練習先看訊號再行動。', promptText: '「紅燈先停住，想好了再行動，錯了我們一起笑一笑重來。」' },
      { id: 't-ctrl-wait', icon: '🎲', title: '🎲 輪流等待小高手', category: '自我控制', target: 'both', difficulty: 'easy', minutes: 8, flowers: 2, maxDaily: 1, recommend: true, active: true, desc: '互動或遊戲時練習輪流與等待別人說完。', promptText: '「還沒輪到自己時先觀察，你有等別人說完真的很棒。」' },
      { id: 't-life-bag', icon: '🎒', title: '🎒 睡前書包小隊長', category: '生活自理', target: 'both', difficulty: 'easy', minutes: 5, flowers: 2, maxDaily: 1, recommend: true, active: true, desc: '睡前依照隔日課表檢查書包與學用品。', promptText: '「明天需要帶什麼？我們花 3 分鐘一起確認。」' },
      { id: 't-life-relax', icon: '🌙', title: '🌙 睡前放鬆小儀式', category: '生活自理', target: 'child1', difficulty: 'easy', minutes: 8, flowers: 2, maxDaily: 1, recommend: true, active: true, desc: '完成盥洗及 5～10 分鐘溫和安靜活動，準時就寢。', promptText: '「我們安靜聽首歌或伸展，讓身體舒服準備睡覺。」' },
      { id: 't-life-stretch', icon: '☀', title: '☀ 醒醒身體小伸展', category: '生活自理', target: 'both', difficulty: 'easy', minutes: 5, flowers: 2, maxDaily: 1, recommend: true, active: true, desc: '輕鬆伸展與喝水，觀察精神再決定今日練習量。', promptText: '「先站起來動一動、喝口水；如果還是很累就先休息。」' },
      { id: 't-fam-read', icon: '📚', title: '📚 親子共讀 10 分鐘', category: '親子互動', target: 'both', difficulty: 'easy', minutes: 10, flowers: 3, maxDaily: 1, recommend: true, active: true, desc: '和家長一起閱讀、輕鬆聊聊故事內容。', promptText: '「我們一起讀這段故事，享受舒服的共讀時光。」' },
      { id: 't-fam-game', icon: '🧩', title: '🧩 合作完成小任務', category: '親子互動', target: 'both', difficulty: 'normal', minutes: 10, flowers: 3, maxDaily: 1, recommend: true, active: true, desc: '一起拼圖、桌遊或合作整理一個小角落。', promptText: '「我們分工合作，一起把這件事完成吧！」' }
    ],
    rewards: [
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
    ],
    children: {
      child1: { profile: { nickname: '彗瑄' }, points: 0, initialPointsBonus: 0, focusCategory: 'auto', sessions: [], redemptions: [], logs: [], checks: {}, extra: '' },
      child2: { profile: { nickname: '邦盛' }, points: 0, initialPointsBonus: 0, focusCategory: 'auto', sessions: [], redemptions: [], logs: [], checks: {}, extra: '' }
    }
  };
}

let state = (() => {
  try {
    const cached = JSON.parse(localStorage.getItem(LOCAL_CACHE_KEY));
    if (cached && cached.version === 1 && cached.children) return cached;
  } catch {}
  return makeOfflineSeed();
})();

let sessionState = { authenticated: false, parent: false };
let backendAvailable = true;
let child = 'child1';
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

let filterTaskSearch = '';
let filterTaskCat = 'all';
let filterTaskTarget = 'all';
let filterTaskDiff = 'all';

function saveLocalCache() {
  for (const cid of ['child1', 'child2']) {
    if (state.children[cid]) state.children[cid].points = computePoints(state.children[cid]);
  }
  state.updatedAt = Date.now();
  try {
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(state));
  } catch {}
}

async function apiCall(path, method = 'GET', body) {
  try {
    const res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      backendAvailable = false;
      return { offline: true };
    }
    backendAvailable = true;
    const data = await res.json();
    return { status: res.status, ok: res.ok && data.ok !== false, data };
  } catch {
    backendAvailable = false;
    return { offline: true };
  }
}

function updateAuthUI() {
  const logged = sessionState.authenticated;
  $('#loginGate').hidden = logged;
  $('#appAside').hidden = !logged;
  $('#appMain').hidden = !logged;
  if (!logged) return;
  $('#parentLockBadge').textContent = sessionState.parent ? '🔓' : '🔒';
  $('#parentAuthBtn').textContent = sessionState.parent ? '🔓 家長已解鎖（點擊鎖定）' : '🔒 家長模式';
  $('#labelChild1').textContent = state.children.child1?.profile?.nickname || '彗瑄';
  $('#labelChild2').textContent = state.children.child2?.profile?.nickname || '邦盛';
  $('#syncStatusBtn').textContent = backendAvailable ? '☁ 伺服器已連線' : '💾 本機快取模式';
}

function requireParentAuth(desc, onSuccess) {
  if (sessionState.parent) {
    onSuccess();
    return;
  }
  pendingParentAction = onSuccess;
  $('#parentPinDesc').textContent = desc || '此操作需由家長輸入密碼確認。';
  $('#parentPinInput').value = '';
  $('#parentPinError').hidden = true;
  $('#parentPinModal').showModal();
}

$('#loginForm').onsubmit = async e => {
  e.preventDefault();
  const password = $('#loginPassword').value.trim();
  const r = await apiCall('/api/auth/login', 'POST', { password });
  if (r.offline) {
    // 單檔本機預覽模式 Fallback
    if (password.length >= 4) {
      sessionState = { authenticated: true, parent: false };
      $('#loginPassword').value = '';
      $('#loginError').hidden = true;
      updateAuthUI();
      render();
      return;
    }
  }
  if (r.ok) {
    sessionState = r.data.session || { authenticated: true, parent: false };
    $('#loginPassword').value = '';
    $('#loginError').hidden = true;
    await fetchStateFromServer();
    updateAuthUI();
    render();
  } else {
    $('#loginError').hidden = false;
  }
};

$('#parentPinForm').onsubmit = async e => {
  e.preventDefault();
  const password = $('#parentPinInput').value.trim();
  const r = await apiCall('/api/auth/parent', 'POST', { password });
  if (r.offline && password.length >= 4) {
    sessionState.parent = true;
    $('#parentPinModal').close();
    updateAuthUI();
    const act = pendingParentAction;
    pendingParentAction = null;
    if (act) act();
    toast('已解鎖家長操作模式。');
    return;
  }
  if (r.ok) {
    sessionState = r.data.session || { authenticated: true, parent: true };
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

$('#parentAuthBtn').onclick = async () => {
  if (sessionState.parent) {
    await apiCall('/api/auth/parent', 'POST', { lock: true });
    sessionState.parent = false;
    updateAuthUI();
    render();
    toast('已鎖定家長模式，可安心交給孩子操作。');
  } else {
    requireParentAuth('解鎖後即可檢視完整統計、管理任務與獎勵、核准兌換。', () => render());
  }
};

$('#logoutBtn').onclick = async () => {
  await apiCall('/api/auth/logout', 'POST');
  sessionState = { authenticated: false, parent: false };
  confirmDeleteKey = null;
  updateAuthUI();
};

async function fetchStateFromServer() {
  const r = await apiCall('/api/state', 'GET');
  if (r.ok && r.data?.state) {
    state = r.data.state;
    if (r.data.session) sessionState = r.data.session;
    saveLocalCache();
  }
}

function toast(t) {
  $('#toast').textContent = t;
  $('#toast').style.display = 'block';
  clearTimeout(window.toastTimeout);
  window.toastTimeout = setTimeout(() => ($('#toast').style.display = 'none'), 3500);
}

function data() { return state.children[child]; }
function childName(cid = child) {
  return state.children[cid]?.profile?.nickname || (cid === 'child1' ? '彗瑄' : '邦盛');
}
function check() { return data().checks?.[todayStr()] || 'ready'; }

function recentDates(n) {
  const now = new Date(todayStr() + 'T12:00:00+08:00');
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    return d.toISOString().slice(0, 10);
  });
}

function weekDates(offset = 0) {
  const now = new Date(todayStr() + 'T12:00:00+08:00');
  const day = now.getUTCDay();
  now.setUTCDate(now.getUTCDate() - ((day + 6) % 7) + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

function walletStats(c = child) {
  const d = state.children[c];
  const available = computePoints(d);
  const tStr = todayStr();
  const wDates = weekDates();
  const todayEarned = (d.sessions || []).filter(s => s.date === tStr).reduce((a, s) => a + (Number(s.earned) ?? 1), 0);
  const weekEarned = (d.sessions || []).filter(s => wDates.includes(s.date)).reduce((a, s) => a + (Number(s.earned) ?? 1), 0);
  const totalEarned = (Number(d.initialPointsBonus) || 0) + (d.sessions || []).reduce((a, s) => a + (Number(s.earned) ?? 1), 0);
  const totalSpent = (d.redemptions || []).filter(r => (r.status === 'approved' || r.status === 'completed') && r.pointsDeducted).reduce((a, r) => a + (Number(r.cost) || 0), 0);
  return { available, todayEarned, weekEarned, totalEarned, totalSpent };
}

function gardenStage(pointsOrSessions) {
  const count = pointsOrSessions;
  if (count === 0) return { idx: 0, label: '種子期', next: '完成 1 次練習就能發芽' };
  if (count <= 2) return { idx: 1, label: '發芽期', next: `再 ${3 - count} 次長出小葉子` };
  if (count <= 5) return { idx: 2, label: '長葉期', next: `再 ${6 - count} 次冒出花苞` };
  if (count <= 8) return { idx: 3, label: '含苞期', next: `再 ${9 - count} 次就會開花` };
  return { idx: 4, label: '開花期', next: '花園已經盛開了，繼續保持節奏！' };
}

function gardenSVG(count, celebrating) {
  const st = gardenStage(count).idx;
  const pot = `<ellipse cx="135" cy="184" rx="105" ry="12" fill="#d8e2c9"/><path d="M103 151H168L156 186H116Z" fill="#d6a98a"/><path d="M98 150h75v10h-75z" fill="#e4b99b"/><ellipse cx="135" cy="150" rx="34" ry="5" fill="#9d7b5e"/>`;
  let plant = '';
  if (st === 0) plant = `<ellipse cx="135" cy="147" rx="9" ry="6" fill="#7c5d41"/><circle cx="135" cy="145" r="2.5" fill="#b7966e"/>`;
  else if (st === 1) plant = `<path d="M135 150V122" stroke="#69835a" stroke-width="4" stroke-linecap="round"/><path d="M135 130c-16-4-17-16-12-16 8 0 12 7 12 16" fill="#9ab57f"/><path d="M135 127c16-4 17-16 12-16-8 0-12 7-12 16" fill="#b0c792"/>`;
  else if (st === 2) plant = `<path d="M135 150V104" stroke="#69835a" stroke-width="4.5" stroke-linecap="round"/><path d="M135 134C102 129 102 103 110 103C128 103 136 116 135 134" fill="#8fa978"/><path d="M136 119C168 121 174 96 165 95C147 95 136 105 136 119" fill="#a6ba86"/><circle cx="135" cy="100" r="6" fill="#9fb984"/>`;
  else if (st === 3) plant = `<path d="M135 150V92" stroke="#69835a" stroke-width="4.5" stroke-linecap="round"/><path d="M135 134C96 129 96 99 105 99C126 99 136 114 135 134" fill="#8fa978"/><path d="M136 117C172 119 182 92 173 91C152 91 136 102 136 117" fill="#a6ba86"/><path d="M135 72c10 0 15 12 12 22h-24c-3-10 2-22 12-22z" fill="#e9c276"/>`;
  else plant = `<path d="M135 150V82" stroke="#69835a" stroke-width="4.5" stroke-linecap="round"/><path d="M135 134C96 129 96 97 105 97C128 97 136 112 135 134" fill="#8fa978"/><path d="M136 115C174 117 186 89 177 88C153 88 136 100 136 115" fill="#a6ba86"/><circle cx="135" cy="66" r="26" fill="#e9c276"/><circle cx="135" cy="67" r="10" fill="#ac8755"/>`;
  const sparkles = celebrating ? `<g class="petal-burst"><circle cx="88" cy="62" r="5" fill="#e9c276"/><circle cx="185" cy="54" r="4" fill="#e49b7e"/><circle cx="165" cy="36" r="5" fill="#9fb984"/></g>` : '';
  return `<svg class="garden" viewBox="0 0 260 200" aria-hidden="true">${pot}${plant}${sparkles}</svg>`;
}

function weekChart() {
  const dates = weekDates();
  const max = Math.max(3, ...dates.map(d => (data().sessions || []).filter(s => s.date === d).length));
  return '<div class="miniweek">' + dates.map((d, i) => {
    const n = (data().sessions || []).filter(s => s.date === d).length;
    return `<div class="day ${d === todayStr() ? 'today' : ''}" title="${d}：${n} 次"><div class="bar"><i style="height:${Math.max(4, n / max * 64)}px"></i></div>${['一', '二', '三', '四', '五', '六', '日'][i]}<br>${n ? n + '次' : '—'}</div>`;
  }).join('') + '</div>';
}

function renderTaskCard(t) {
  if (!t) return '';
  const meta = CATEGORY_META[t.category] || { cls: 'cat-focus', icon: '🌱' };
  const diffLabel = { easy: '簡單', normal: '一般', challenge: '進階' }[t.difficulty || 'easy'] || '簡單';
  const doneCount = countTodaySessions(data(), t.id);
  const maxD = Number(t.maxDaily) || 1;
  const isDone = !canCheckIn(data(), t);
  return `<article class="card task">
    <div class="task-icon">${esc(t.icon || meta.icon)}</div>
    <div class="task-body">
      <h3>${esc(t.title)}</h3>
      <p>${esc(t.desc)}</p>
      <div class="chips">
        <span class="cat-badge ${meta.cls}">${esc(t.category)}</span>
        <span class="chip">◷ ${t.minutes || 5} 分鐘</span>
        <span class="chip">難度：${diffLabel}</span>
        <span class="flower-badge">🌸 預設 +${t.flowers || 2}</span>
        ${maxD > 1 ? `<span class="chip">今日 ${doneCount}/${maxD} 次</span>` : ''}
      </div>
      <details class="task-prompt-details">
        <summary>💬 查看溫和引導語</summary>
        <p>${esc(t.promptText)}</p>
      </details>
    </div>
    <div class="task-actions">
      ${isDone ? '<span class="done">✓ 今日已達上限</span>' : `<button class="primary" data-start="${esc(t.id)}" type="button">開始練習 →</button>`}
    </div>
  </article>`;
}

function walletCardHTML() {
  const w = walletStats(child);
  return `<div class="card">
    <h3 style="margin:0">🌸 ${esc(childName())}的點數錢包</h3>
    <div class="wallet-grid">
      <div class="wallet-item"><span>目前可用</span><strong>${w.available} 🌸</strong></div>
      <div class="wallet-item"><span>今日獲得</span><strong>+${w.todayEarned}</strong></div>
      <div class="wallet-item"><span>本週累積</span><strong>+${w.weekEarned}</strong></div>
      <div class="wallet-item"><span>歷史總獲</span><strong>${w.totalEarned}</strong></div>
      <div class="wallet-item"><span>已核准兌換</span><strong>${w.totalSpent}</strong></div>
    </div>
    <p class="subtext" style="margin:0">💡 點數由公式重算（起始加成 + 打卡得點 − 已核准兌換）；願意嘗試與失敗重來都算練習！</p>
  </div>`;
}

function rewardsShopHTML() {
  const w = walletStats(child);
  const list = (state.rewards || []).filter(r => r && r.active !== false && (r.target === 'both' || r.target === child)).sort((a, b) => a.cost - b.cost);
  const redemptions = data().redemptions || [];
  const pendingList = redemptions.filter(r => r.status === 'pending' || r.status === 'approved');

  return `<div class="card tip">
    <h3>🎁 集點獎勵商店（可用：🌸 ${w.available} 點）</h3>
    <p>送出兌換申請後，經家長核准才會正式扣除點數。</p>
    ${pendingList.length ? `<div style="background:#f9faf4;border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:12px">
      <b style="font-size:13px">📌 進行中的兌換申請（${pendingList.length} 筆）</b>
      ${pendingList.map(rd => `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;font-size:13px">
        <span>${esc(rd.title || rd.rewardId)}（${rd.cost} 🌸）</span>
        <span class="status-badge status-${rd.status}">${rd.status === 'pending' ? '待家長核准' : '已核准待履行'}</span>
      </div>`).join('')}
    </div>` : ''}
    ${list.map(r => {
      const used = redemptions.filter(x => x.rewardId === r.id && x.status !== 'cancelled').length;
      const limitReached = Number(r.limit) > 0 && used >= Number(r.limit);
      const diff = r.cost - w.available;
      return `<div class="reward-item">
        <div class="reward-info">
          <b>${esc(r.title)}</b>
          <small>需要 🌸 ${r.cost} 點 · ${esc(r.category)} ${diff > 0 ? `（還差 ${diff} 點）` : '（點數足夠）'}</small>
          ${r.note ? `<small style="display:block;color:#8a6d3b">※ ${esc(r.note)}</small>` : ''}
        </div>
        ${limitReached ? '<span class="chip">已達上限</span>' : diff > 0
          ? `<button class="ghost-btn btn-sm" disabled style="opacity:.55">差 ${diff} 🌸</button>`
          : `<button class="secondary btn-sm" data-request-redeem="${esc(r.id)}" type="button">申請兌換</button>`}
      </div>`;
    }).join('')}
  </div>`;
}

function homePage() {
  const recIds = recommendForChild(child, state);
  const taskMap = new Map((state.tasks || []).map(t => [t.id, t]));
  const doneCount = recIds.filter(id => !canCheckIn(data(), taskMap.get(id))).length;
  const weekSessions = (data().sessions || []).filter(s => weekDates().includes(s.date));
  const stage = gardenStage(weekSessions.length);
  const w = walletStats(child);

  return `
    <section class="hero ${celebrateHero ? 'celebrating' : ''}">
      <span class="tag">SMALL STEPS, EVERY DAY</span>
      <h1>${esc(childName())}，今天也一起長大吧。</h1>
      <p>陪你一小步，失敗也算練習。按照自己的節奏完成今日推薦任務吧！</p>
      <div class="garden-status">🌱 成就花園：<b>${stage.label}</b>（本週完成 ${weekSessions.length} 次 · ${stage.next}）</div>
      ${gardenSVG(weekSessions.length, celebrateHero)}
    </section>
    <div class="section-head"><h2>今天，感覺怎麼樣？ <small>依心情與近期表現規則式推薦（非 AI）</small></h2></div>
    <div class="layout">
      <div>
        <section class="card checkin">
          <h3>選擇現在的心情狀態</h3>
          <div class="mood-row">
            ${[['ready', '😊', '平穩準備好'], ['distracted', '🌀', '有點分心'], ['angry', '🌧', '生氣煩躁'], ['tired', '😴', '疲倦想睡']].map(([v, e, t]) => `<button class="mood ${check() === v ? 'selected' : ''}" data-mood="${v}" type="button"><span>${e}</span>${t}</button>`).join('')}
          </div>
          <div class="check-bottom"><span>疲倦或生氣時會自動調降推薦任務數與強度。</span><span>選擇即儲存 ✓</span></div>
        </section>
        <div class="section-head">
          <h2>🌟 今日智慧推薦任務（${recIds.length} 項）</h2>
          <a href="#tasks" class="text-link">查看完整任務庫 ↗</a>
        </div>
        ${recIds.map(id => renderTaskCard(taskMap.get(id))).join('')}
        <div style="margin-top:18px">${walletCardHTML()}</div>
      </div>
      <div>
        <div class="card progress-card">
          <h3>本週概況與累積 <span style="float:right">🌱</span></h3>
          <div class="big">${doneCount} <small>/ ${recIds.length} 項推薦</small></div>
          <div class="progress-track"><div style="width:${recIds.length ? (doneCount / recIds.length * 100) : 0}%"></div></div>
          <div class="points-pill">🌸 可用點數：<b>${w.available} 點</b>（今日 +${w.todayEarned}）</div>
          ${weekChart()}
        </div>
        ${rewardsShopHTML()}
      </div>
    </div>
    <p class="notice">✳ 免責聲明：本工具僅供單一家庭日常陪伴與行為觀察回顧，非醫療診斷或評估用途。</p>`;
}

function taskPage() {
  const recIds = recommendForChild(child, state);
  const taskMap = new Map((state.tasks || []).map(t => [t.id, t]));
  const allForChild = (state.tasks || []).filter(t => t && t.active !== false && (t.target === 'both' || t.target === child));
  const focusCat = data().focusCategory || 'auto';

  return `<h1 class="page-title">今日任務與練習庫。</h1>
    <p class="subtext">為 ${esc(childName())} 挑選合適的短時練習（1–15 分鐘）。</p>
    <div class="card">
      <label>重點練習大類（focusCategory，優先權重 -2）
        <select id="focusCategorySelect">
          <option value="auto" ${focusCat === 'auto' ? 'selected' : ''}>自動平衡 (auto)</option>
          ${Object.keys(CATEGORY_META).map(c => `<option value="${esc(c)}" ${focusCat === c ? 'selected' : ''}>優先推薦：${esc(c)}</option>`).join('')}
        </select>
      </label>
    </div>
    <div class="section-head"><h2>🌟 今日智慧推薦（${recIds.length} 項）</h2></div>
    <div class="layout">
      <div>
        ${recIds.map(id => renderTaskCard(taskMap.get(id))).join('')}
        <div class="section-head"><h2>📚 分類任務庫（共 ${allForChild.length} 項）</h2></div>
        ${Object.keys(CATEGORY_META).map((cat, idx) => {
          const items = allForChild.filter(t => t.category === cat);
          const meta = CATEGORY_META[cat];
          return `<details class="category-fold" ${idx === 0 ? 'open' : ''}>
            <summary><span class="cat-badge ${meta.cls}">${meta.code}. ${esc(cat)}</span><small class="subtext">${items.length} 項 ▾</small></summary>
            <div style="padding-top:8px">${items.map(renderTaskCard).join('')}</div>
          </details>`;
        }).join('')}
      </div>
      <div>
        ${walletCardHTML()}
        ${rewardsShopHTML()}
      </div>
    </div>`;
}

function deleteBtnHTML(type, id) {
  const k = `${type}:${id}`;
  if (confirmDeleteKey === k) {
    return `<button class="danger-btn btn-sm" data-confirm-del="${esc(k)}" type="button">確定刪除</button>
            <button class="ghost-btn btn-sm" data-cancel-del type="button">取消</button>`;
  }
  return `<button class="danger-btn btn-sm" data-ask-del="${esc(k)}" type="button">刪除</button>`;
}

function recordPage() {
  const logs = [...(data().logs || [])].sort((a, b) => b.date.localeCompare(a.date) || (b.created || 0) - (a.created || 0));
  return `<h1 class="page-title">日常觀察紀錄。</h1>
    <p class="subtext">記錄 ${esc(childName())} 的每日觀察（與打卡分開；未知欄位可留白，非醫療用途）。</p>
    <div class="layout">
      <form id="logForm" class="card">
        <div class="form-grid">
          <label>紀錄日期<input name="date" type="date" value="${todayStr()}" required></label>
          <label>觀察情境
            <select name="context"><option value="">尚未填寫</option><option>寫作業</option><option>閱讀</option><option>學校回饋</option><option>家庭活動</option><option>練習活動</option></select>
          </label>
          <label>情緒
            <select name="mood"><option value="">尚未觀察</option><option>平穩</option><option>開心</option><option>煩躁</option><option>生氣</option><option>難過</option></select>
          </label>
          <label>精神狀態
            <select name="energy"><option value="">尚未觀察</option><option>精神不錯</option><option>有點累</option><option>很想睡</option></select>
          </label>
          <label>分心次數<input name="distractions" type="number" min="0" max="999" placeholder="未知留白"></label>
          <label>提醒次數<input name="reminders" type="number" min="0" max="999" placeholder="未知留白"></label>
          <label>作業投入（分）<input name="homework" type="number" min="0" max="600" placeholder="未知留白"></label>
          <label>恢復平靜（分）<input name="calmMinutes" type="number" min="0" max="600" placeholder="未知留白"></label>
          <label class="wide">觀察筆記（note）
            <textarea name="note" maxlength="2000" placeholder="記錄事實與有幫助的應對方式"></textarea>
          </label>
        </div>
        <details open>
          <summary style="margin:18px 0;color:#66755f">☾ 睡眠與精神觀察組</summary>
          <div class="form-grid">
            <label>昨晚上床（bed）<input type="time" name="bed"></label>
            <label>估計入睡（asleep）<input type="time" name="asleep"></label>
            <label>今天起床（wake）<input type="time" name="wake"></label>
            <label>睡眠時數（sleepHours）<input name="sleepHours" type="number" min="0" max="24" step="0.1"></label>
            <label>打呼／鼻塞（snore）
              <select name="snore"><option value="">未知／未觀察</option><option>無觀察到</option><option>打呼</option><option>鼻塞</option><option>打呼與鼻塞</option></select>
            </label>
            <label>白天想睡情境（sleepy）
              <select name="sleepy"><option value="">未知／未觀察</option><option>沒有觀察到</option><option>坐著看書</option><option>上課或考試</option><option>其他活動</option></select>
            </label>
          </div>
        </details>
        <button class="primary full" type="submit">儲存日常觀察</button>
      </form>
      <div>
        <div class="card tip" style="margin:0">
          <h3>觀察原則（非醫療）</h3>
          <p>僅記錄客觀行為、時間與有效陪伴方式；編修或刪除既有紀錄需驗證家長密碼。</p>
        </div>
      </div>
    </div>
    <div class="section-head"><h2>最近觀察紀錄列表</h2></div>
    <div class="card">
      ${logs.length ? logs.map(l => `<article class="record">
        <div class="record-head">
          <b>${esc(l.date)} · ${esc(l.context || '未填情境')}</b>
          <div class="record-actions">
            <button class="secondary btn-sm" data-edit-log="${esc(l.id)}" type="button">編輯 🔒</button>
            ${deleteBtnHTML('log', l.id)}
          </div>
        </div>
        <p>${[l.mood, l.energy, l.distractions !== '' && l.distractions != null ? '分心 ' + l.distractions + ' 次' : '', l.reminders !== '' && l.reminders != null ? '提醒 ' + l.reminders + ' 次' : '', l.homework !== '' && l.homework != null ? '作業 ' + l.homework + ' 分' : '', l.calmMinutes !== '' && l.calmMinutes != null ? '平復 ' + l.calmMinutes + ' 分' : ''].filter(Boolean).map(esc).join(' ／ ') || '無量化指標'}</p>
        ${(l.bed || l.asleep || l.wake || l.sleepHours || l.snore || l.sleepy) ? `<p>睡眠組：${esc([l.bed ? '上床 ' + l.bed : '', l.asleep ? '入睡 ' + l.asleep : '', l.wake ? '起床 ' + l.wake : '', l.sleepHours ? '時數 ' + l.sleepHours + 'h' : '', l.snore, l.sleepy].filter(Boolean).join(' ／ '))}</p>` : ''}
        ${l.note ? `<p style="white-space:pre-wrap">${esc(l.note)}</p>` : ''}
      </article>`).join('') : '<div class="empty">尚無觀察紀錄。</div>'}
    </div>`;
}

function buildLocalSummaryText(daysCount) {
  const dates = recentDates(daysCount);
  const logs = (data().logs || []).filter(l => dates.includes(l.date));
  const sessions = (data().sessions || []).filter(s => dates.includes(s.date));
  const activeDays = new Set(sessions.map(s => s.date)).size;
  const avg = k => {
    const vals = logs.map(l => l[k]).filter(v => v !== '' && v != null).map(Number).filter(Number.isFinite);
    return vals.length ? `${(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)}（${vals.length} 筆）` : '尚無紀錄';
  };
  const notes = logs.filter(l => l.note && l.note.trim()).map(l => `- [${l.date}] ${l.note.trim()}`);
  return `【家庭習慣練習｜日常觀察摘要（近 ${daysCount} 天）】
對象代號：${childName()}（小學生）
統計區間：${dates[dates.length - 1]} ～ ${dates[0]}
免責聲明：本摘要僅供家庭陪伴與行為觀察回顧，非醫療診斷或評估報告。

一、練習參與與點數
- 參與天數：${activeDays} / ${daysCount} 天（完成 ${sessions.length} 次練習）
- 目前可用點數：${computePoints(data())} 點

二、專注與情緒觀察
- 分心次數平均：${avg('distractions')}
- 家長提醒平均：${avg('reminders')}
- 情緒平復時間（分）：${avg('calmMinutes')}

三、睡眠與精神觀察
- 估計睡眠時數（時）：${avg('sleepHours')}

四、家長觀察筆記（共 ${notes.length} 筆）
${notes.length ? notes.join('\n') : '（此區間尚無文字筆記）'}`;
}

function parentPage() {
  if (!sessionState.parent) {
    return `<div class="parent-locked-box">
      <span class="eyebrow">PARENTS ONLY (INV-2)</span>
      <h2>🔒 家長檢視已鎖定</h2>
      <p>進入家長檢視、核准兌換、管理任務與獎勵或修改密碼前，請先驗證家長操作密碼。</p>
      <button id="unlockParentPageBtn" class="primary" type="button">輸入家長密碼解鎖 →</button>
    </div>`;
  }

  const redemptions = data().redemptions || [];
  const tasksFiltered = (state.tasks || []).filter(t => {
    if (!t) return false;
    if (filterTaskCat !== 'all' && t.category !== filterTaskCat) return false;
    if (filterTaskTarget !== 'all' && t.target !== filterTaskTarget) return false;
    if (filterTaskDiff !== 'all' && t.difficulty !== filterTaskDiff) return false;
    if (filterTaskSearch.trim()) {
      const q = filterTaskSearch.trim().toLowerCase();
      if (!`${t.title} ${t.desc} ${t.category}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return `<h1 class="page-title">家長檢視與系統管理。</h1>
    <p class="subtext">當前檢視序位：<b>${esc(childName())} (${child})</b> · 資料最小化去識別架構</p>
    ${walletCardHTML()}

    <div class="layout" style="margin-top:20px">
      <div>
        <!-- 兌換審核 -->
        <div class="section-head"><h2>🎫 兌換審核與紀錄（${esc(childName())}）</h2><small>核准才扣點 · 取消自動退點</small></div>
        <div class="card">
          ${redemptions.length ? redemptions.map(rd => `<div class="record">
            <div class="record-head">
              <div>
                <b>${esc(rd.date)} · ${esc(rd.title || rd.rewardId)}（${rd.cost} 🌸）</b>
                <span class="status-badge status-${rd.status}">${rd.status}</span>
              </div>
              <div class="record-actions">
                ${rd.status === 'pending' ? `<button class="primary btn-sm" data-rd-approve="${esc(rd.id)}" type="button">核准扣點</button>` : ''}
                ${rd.status !== 'cancelled' ? `<button class="danger-btn btn-sm" data-rd-cancel="${esc(rd.id)}" type="button">取消／退點</button>` : ''}
              </div>
            </div>
          </div>`).join('') : '<p class="subtext">尚無兌換紀錄。</p>'}
        </div>

        <!-- 任務 CRUD -->
        <div class="section-head">
          <h2>📋 任務管理 CRUD（共 ${(state.tasks || []).length} 項）</h2>
          <button id="openNewTaskBtn" class="primary btn-sm" type="button">＋ 新增任務</button>
        </div>
        <div class="card">
          <div class="filter-bar">
            <input id="fSearch" type="search" placeholder="🔍 搜尋任務..." value="${esc(filterTaskSearch)}">
            <select id="fCat">
              <option value="all">所有大類</option>
              ${Object.keys(CATEGORY_META).map(c => `<option value="${esc(c)}" ${filterTaskCat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
            </select>
            <select id="fTarget">
              <option value="all">所有對象</option>
              <option value="both" ${filterTaskTarget === 'both' ? 'selected' : ''}>兩人 (both)</option>
              <option value="child1" ${filterTaskTarget === 'child1' ? 'selected' : ''}>彗瑄 (child1)</option>
              <option value="child2" ${filterTaskTarget === 'child2' ? 'selected' : ''}>邦盛 (child2)</option>
            </select>
            <select id="fDiff">
              <option value="all">所有難度</option>
              <option value="easy" ${filterTaskDiff === 'easy' ? 'selected' : ''}>簡單</option>
              <option value="normal" ${filterTaskDiff === 'normal' ? 'selected' : ''}>一般</option>
              <option value="challenge" ${filterTaskDiff === 'challenge' ? 'selected' : ''}>進階</option>
            </select>
          </div>
          <details open>
            <summary style="cursor:pointer;font-weight:700;margin-bottom:10px">任務列表（${tasksFiltered.length} 項）▾</summary>
            ${tasksFiltered.map(t => `<div class="record" style="${t.active === false ? 'opacity:.5' : ''}">
              <div class="record-head">
                <div>
                  <b>${esc(t.title)}</b>
                  <span class="chip">${esc(t.category)}</span>
                  <span class="chip">對象：${esc(t.target)}</span>
                  <span class="chip">${esc(t.difficulty)} · ${t.minutes}分 · 上限${t.maxDaily}次</span>
                  <span class="flower-badge">🌸 +${t.flowers}</span>
                </div>
                <div class="record-actions">
                  <button class="secondary btn-sm" data-edit-task="${esc(t.id)}" type="button">編輯</button>
                  ${deleteBtnHTML('task', t.id)}
                </div>
              </div>
              <p>${esc(t.desc)} ｜ ${esc(t.promptText)}</p>
            </div>`).join('')}
          </details>
        </div>

        <!-- 獎勵 CRUD -->
        <div class="section-head">
          <h2>🎁 獎勵管理 CRUD（共 ${(state.rewards || []).length} 項）</h2>
          <button id="openNewRewardBtn" class="primary btn-sm" type="button">＋ 新增獎勵</button>
        </div>
        <div class="card">
          <details open>
            <summary style="cursor:pointer;font-weight:700;margin-bottom:10px">展開獎勵列表 ▾</summary>
            ${(state.rewards || []).map(r => `<div class="record" style="${r.active === false ? 'opacity:.5' : ''}">
              <div class="record-head">
                <div>
                  <b>${esc(r.title)}</b>
                  <span class="flower-badge">🌸 ${r.cost} 點</span>
                  <span class="chip">${esc(r.category)}</span>
                  <span class="chip">對象：${esc(r.target)}</span>
                </div>
                <div class="record-actions">
                  <button class="secondary btn-sm" data-edit-reward="${esc(r.id)}" type="button">編輯</button>
                  ${deleteBtnHTML('reward', r.id)}
                </div>
              </div>
            </div>`).join('')}
          </details>
        </div>

        <!-- 非醫療觀察摘要匯出 -->
        <div class="section-head"><h2>📄 匯出非醫療觀察摘要</h2></div>
        <div class="card print-only-area">
          <div class="form-grid" style="align-items:end">
            <label>統計天數
              <select id="summaryRange">
                <option value="7" ${summaryDays === 7 ? 'selected' : ''}>近 7 天</option>
                <option value="30" ${summaryDays === 30 ? 'selected' : ''}>近 30 天</option>
              </select>
            </label>
            <div class="toolbar">
              <button id="copySummaryBtn" class="secondary" type="button">📋 複製純文字</button>
              <button id="printSummaryBtn" class="primary" type="button">🖨 列印摘要</button>
            </div>
          </div>
          <div id="summaryPreview" class="summary-box">${esc(buildLocalSummaryText(summaryDays))}</div>
        </div>
      </div>

      <div>
        <!-- 孩子個別檔案（去識別化：至多一個暱稱，無年齡/年級/性別/生日） -->
        <div class="card">
          <h3 style="margin-top:0">👤 孩子序位設定（${child}）</h3>
          <form id="profileForm">
            <label>顯示暱稱（選填，預設為序位彗瑄/邦盛）
              <input id="nicknameInput" maxlength="20" value="${esc(data().profile?.nickname || '')}" placeholder="例如：彗瑄 / 邦盛">
            </label>
            <label style="margin-top:10px">家長備忘筆記（僅存於執行期 DB）
              <textarea id="extraInput" maxlength="4000">${esc(data().extra || '')}</textarea>
            </label>
            <button class="secondary full" type="submit">儲存設定</button>
          </form>
        </div>

        <!-- 密碼修改（伺服器端 PBKDF2 雜湊） -->
        <div class="card tip">
          <h3>🔐 雙層密碼設定</h3>
          <form id="passwordForm">
            <label>新家庭登入密碼（至少 4 碼）
              <input name="newFamilyPassword" type="password" minlength="4" placeholder="留空則不修改">
            </label>
            <label style="margin-top:8px">新家長操作密碼（至少 4 碼）
              <input name="newParentPassword" type="password" minlength="4" placeholder="留空則不修改">
            </label>
            <button class="secondary full" type="submit">更新伺服器密碼</button>
          </form>
        </div>

        <!-- 同步設定 -->
        <div class="card tip">
          <h3>🔄 伺服器與本機同步</h3>
          <p>本系統遵守 INV-1 / INV-2：前端不含任何資料庫憑證或外部網址，所有讀寫經由伺服器端 Session 驗證。</p>
          <button id="manualSyncBtn" class="secondary full" type="button">↻ 與伺服器欄位級合併同步</button>
        </div>
      </div>
    </div>

    <div class="section-head"><h2>練習打卡紀錄檢視與編修</h2></div>
    <div class="card">
      ${(data().sessions || []).length ? [...data().sessions].reverse().slice(0, 30).map(s => `<div class="record">
        <div class="record-head">
          <b>${esc(s.date)} · ${esc(s.taskTitle || s.task)} <span class="flower-badge">🌸 +${s.earned ?? 1}</span></b>
          <div class="record-actions">
            <button class="secondary btn-sm" data-edit-session="${esc(s.id)}" type="button">編輯</button>
            ${deleteBtnHTML('session', s.id)}
          </div>
        </div>
        <p>難度：${esc(s.level)} · 預估 ${s.planned} 分 · 實際 ${Math.floor((s.elapsed || 0) / 60)}分${(s.elapsed || 0) % 60}秒 · 分心 ${s.distractions} 次</p>
      </div>`).join('') : '<div class="empty">尚無打卡紀錄。</div>'}
    </div>`;
}

function render() {
  if (!sessionState.authenticated) return;
  page = location.hash.slice(1) || 'home';
  if (!['home', 'tasks', 'records', 'parent'].includes(page)) page = 'home';
  document.querySelectorAll('nav a').forEach(a => a.classList.toggle('active', a.hash === '#' + page));
  document.querySelectorAll('[data-child]').forEach(b => b.classList.toggle('selected', b.dataset.child === child));

  updateAuthUI();
  $('#app').innerHTML = ({ home: homePage, tasks: taskPage, records: recordPage, parent: parentPage }[page])();
  if (celebrateHero) setTimeout(() => { celebrateHero = false; }, 1500);

  if ($('#unlockParentPageBtn')) {
    $('#unlockParentPageBtn').onclick = () => requireParentAuth('請輸入家長密碼以解鎖家長檢視。', () => render());
  }

  document.querySelectorAll('[data-mood]').forEach(b => b.onclick = async () => {
    const mood = b.dataset.mood;
    data().checks[todayStr()] = mood;
    saveLocalCache();
    const r = await apiCall(`/api/children/${child}/preferences`, 'POST', { mood });
    if (r.ok && r.data?.state) state = r.data.state;
    render();
  });

  if ($('#focusCategorySelect')) {
    $('#focusCategorySelect').onchange = async e => {
      const focusCategory = e.target.value;
      data().focusCategory = focusCategory;
      saveLocalCache();
      const r = await apiCall(`/api/children/${child}/preferences`, 'POST', { focusCategory });
      if (r.ok && r.data?.state) state = r.data.state;
      render();
    };
  }

  document.querySelectorAll('[data-start]').forEach(b => b.onclick = () => startExercise(b.dataset.start));

  document.querySelectorAll('[data-request-redeem]').forEach(b => b.onclick = async () => {
    const rewardId = b.dataset.requestRedeem;
    const reward = (state.rewards || []).find(r => r.id === rewardId);
    if (!reward) return;
    const r = await apiCall(`/api/children/${child}/redemptions`, 'POST', { rewardId });
    if (r.offline) {
      data().redemptions.unshift({
        id: crypto.randomUUID(),
        date: todayStr(),
        rewardId: reward.id,
        title: reward.title,
        cost: reward.cost,
        status: 'pending',
        pointsDeducted: false,
        created: Date.now()
      });
      saveLocalCache();
      render();
      toast('已送出兌換申請（待家長核准後扣點）！');
      return;
    }
    if (r.ok) {
      state = r.data.state;
      saveLocalCache();
      render();
      toast('已送出兌換申請（待家長核准後扣點）！');
    } else {
      toast(r.data?.message || '無法申請兌換');
    }
  });

  document.querySelectorAll('[data-rd-approve]').forEach(b => b.onclick = async () => {
    const id = b.dataset.rdApprove;
    const r = await apiCall(`/api/children/${child}/redemptions/${id}/approve`, 'POST');
    if (r.offline) {
      const rd = data().redemptions.find(x => x.id === id);
      if (rd && computePoints(data()) >= rd.cost) {
        rd.status = 'approved';
        rd.pointsDeducted = true;
        saveLocalCache();
        render();
        toast('已核准並扣除點數！');
      }
      return;
    }
    if (r.ok) { state = r.data.state; saveLocalCache(); render(); toast('已核准並扣除點數！'); }
    else toast(r.data?.message || '核准失敗');
  });

  document.querySelectorAll('[data-rd-cancel]').forEach(b => b.onclick = async () => {
    const id = b.dataset.rdCancel;
    const r = await apiCall(`/api/children/${child}/redemptions/${id}/cancel`, 'POST');
    if (r.offline) {
      const rd = data().redemptions.find(x => x.id === id);
      if (rd) { rd.status = 'cancelled'; rd.pointsDeducted = false; saveLocalCache(); render(); toast('已取消並退回點數！'); }
      return;
    }
    if (r.ok) { state = r.data.state; saveLocalCache(); render(); toast('已取消並退回點數！'); }
  });

  if ($('#logForm')) {
    $('#logForm').onsubmit = async e => {
      e.preventDefault();
      const payload = Object.fromEntries(new FormData(e.target));
      const r = await apiCall(`/api/children/${child}/logs`, 'POST', payload);
      if (r.offline) {
        data().logs.push({ ...payload, id: crypto.randomUUID(), created: Date.now() });
        saveLocalCache();
        render();
        toast('日常觀察已儲存。');
        return;
      }
      if (r.ok) { state = r.data.state; saveLocalCache(); render(); toast('日常觀察已儲存。'); }
    };
  }

  document.querySelectorAll('[data-edit-log]').forEach(b => b.onclick = () => {
    const id = b.dataset.editLog;
    requireParentAuth('編輯日常觀察需家長權限。', () => {
      const l = (data().logs || []).find(x => x.id === id);
      if (!l) return;
      const f = $('#editLogForm');
      for (const el of f.elements) { if (el.name && el.name in l) el.value = l[el.name] ?? ''; }
      $('#editLogModal').showModal();
    });
  });

  document.querySelectorAll('[data-edit-session]').forEach(b => b.onclick = () => {
    const id = b.dataset.editSession;
    requireParentAuth('編輯打卡紀錄需家長權限。', () => {
      const s = (data().sessions || []).find(x => x.id === id);
      if (!s) return;
      const f = $('#editSessionForm');
      f.elements.id.value = s.id;
      f.elements.date.value = s.date;
      f.elements.level.value = s.level || 'easy';
      f.elements.planned.value = s.planned || 5;
      f.elements.elapsed.value = s.elapsed || 0;
      f.elements.distractions.value = s.distractions || 0;
      f.elements.earned.value = s.earned ?? 1;
      $('#editSessionModal').showModal();
    });
  });

  if ($('#fSearch')) $('#fSearch').oninput = e => { filterTaskSearch = e.target.value; render(); $('#fSearch').focus(); };
  if ($('#fCat')) $('#fCat').onchange = e => { filterTaskCat = e.target.value; render(); };
  if ($('#fTarget')) $('#fTarget').onchange = e => { filterTaskTarget = e.target.value; render(); };
  if ($('#fDiff')) $('#fDiff').onchange = e => { filterTaskDiff = e.target.value; render(); };

  if ($('#openNewTaskBtn')) $('#openNewTaskBtn').onclick = () => openTaskModal(null);
  document.querySelectorAll('[data-edit-task]').forEach(b => b.onclick = () => openTaskModal(b.dataset.editTask));
  if ($('#openNewRewardBtn')) $('#openNewRewardBtn').onclick = () => openRewardModal(null);
  document.querySelectorAll('[data-edit-reward]').forEach(b => b.onclick = () => openRewardModal(b.dataset.editReward));

  document.querySelectorAll('[data-ask-del]').forEach(b => b.onclick = () => {
    const k = b.dataset.askDel;
    requireParentAuth('刪除項目需家長權限。', () => { confirmDeleteKey = k; render(); });
  });
  document.querySelectorAll('[data-cancel-del]').forEach(b => b.onclick = () => { confirmDeleteKey = null; render(); });
  document.querySelectorAll('[data-confirm-del]').forEach(b => b.onclick = async () => {
    const [type, id] = b.dataset.confirmDel.split(':');
    confirmDeleteKey = null;
    let endpoint = '';
    if (type === 'log') endpoint = `/api/children/${child}/logs/${id}`;
    if (type === 'session') endpoint = `/api/children/${child}/sessions/${id}`;
    if (type === 'task') endpoint = `/api/tasks/${id}`;
    if (type === 'reward') endpoint = `/api/rewards/${id}`;
    const r = await apiCall(endpoint, 'DELETE');
    if (r.offline) {
      if (type === 'log') data().logs = data().logs.filter(x => x.id !== id);
      if (type === 'session') data().sessions = data().sessions.filter(x => x.id !== id);
      if (type === 'task') state.tasks = state.tasks.filter(x => x.id !== id);
      if (type === 'reward') state.rewards = state.rewards.filter(x => x.id !== id);
      saveLocalCache();
      render();
      toast('已刪除。');
      return;
    }
    if (r.ok) { state = r.data.state; saveLocalCache(); render(); toast('已刪除。'); }
  });

  if ($('#profileForm')) {
    $('#profileForm').onsubmit = async e => {
      e.preventDefault();
      const nickname = $('#nicknameInput').value.trim() || (child === 'child1' ? '彗瑄' : '邦盛');
      const extra = $('#extraInput').value;
      data().profile = { nickname };
      data().extra = extra;
      saveLocalCache();
      const r = await apiCall(`/api/children/${child}/preferences`, 'POST', { nickname, extra });
      if (r.ok && r.data?.state) state = r.data.state;
      render();
      toast('孩子序位設定已更新。');
    };
  }

  if ($('#passwordForm')) {
    $('#passwordForm').onsubmit = async e => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      const r = await apiCall('/api/auth/password', 'POST', fd);
      if (r.ok || r.offline) {
        e.target.reset();
        toast('密碼已更新！');
      } else {
        toast(r.data?.message || '密碼更新失敗');
      }
    };
  }

  if ($('#manualSyncBtn')) {
    $('#manualSyncBtn').onclick = async () => {
      const r = await apiCall('/api/sync', 'POST', { state });
      if (r.ok && r.data?.state) {
        state = r.data.state;
        saveLocalCache();
        render();
        toast('已與伺服器完成欄位級合併同步！');
      } else {
        toast('目前已儲存於本機快取。');
      }
    };
  }

  if ($('#summaryRange')) {
    $('#summaryRange').onchange = async e => {
      summaryDays = Number(e.target.value);
      const r = await apiCall(`/api/children/${child}/summary?days=${summaryDays}`, 'GET');
      $('#summaryPreview').textContent = (r.ok && r.data?.summary) ? r.data.summary : buildLocalSummaryText(summaryDays);
    };
  }
  if ($('#copySummaryBtn')) {
    $('#copySummaryBtn').onclick = async () => {
      try {
        await navigator.clipboard.writeText($('#summaryPreview').textContent);
        toast('已複製非醫療觀察摘要！');
      } catch {
        toast('請手動選取複製。');
      }
    };
  }
  if ($('#printSummaryBtn')) $('#printSummaryBtn').onclick = () => window.print();
}

function openTaskModal(id) {
  const f = $('#editTaskForm');
  f.reset();
  if (id) {
    const t = (state.tasks || []).find(x => x.id === id);
    if (!t) return;
    $('#editTaskModalTitle').textContent = '編輯任務';
    for (const k of ['id', 'title', 'icon', 'category', 'target', 'difficulty', 'minutes', 'flowers', 'maxDaily', 'desc', 'promptText']) {
      if (f.elements[k]) f.elements[k].value = t[k] ?? '';
    }
    f.elements.recommend.value = t.recommend === false ? 'false' : 'true';
    f.elements.active.value = t.active === false ? 'false' : 'true';
  } else {
    $('#editTaskModalTitle').textContent = '新增任務';
    f.elements.id.value = '';
  }
  $('#editTaskModal').showModal();
}

$('#editTaskForm').onsubmit = async e => {
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(e.target));
  const payload = {
    ...fd,
    minutes: Number(fd.minutes),
    flowers: Number(fd.flowers),
    maxDaily: Number(fd.maxDaily),
    recommend: fd.recommend === 'true',
    active: fd.active === 'true'
  };
  const r = await apiCall(fd.id ? `/api/tasks/${fd.id}` : '/api/tasks', fd.id ? 'PUT' : 'POST', payload);
  if (r.offline) {
    if (fd.id) {
      const idx = state.tasks.findIndex(x => x.id === fd.id);
      if (idx !== -1) state.tasks[idx] = { ...state.tasks[idx], ...payload };
    } else {
      state.tasks.unshift({ ...payload, id: 'task-' + crypto.randomUUID().slice(0, 8) });
    }
    saveLocalCache();
  } else if (r.ok) {
    state = r.data.state;
    saveLocalCache();
  }
  $('#editTaskModal').close();
  render();
  toast('任務已儲存！');
};

function openRewardModal(id) {
  const f = $('#editRewardForm');
  f.reset();
  if (id) {
    const r = (state.rewards || []).find(x => x.id === id);
    if (!r) return;
    $('#editRewardModalTitle').textContent = '編輯獎勵';
    for (const k of ['id', 'title', 'icon', 'category', 'cost', 'target', 'limit', 'budget', 'note']) {
      if (f.elements[k]) f.elements[k].value = r[k] ?? '';
    }
    f.elements.active.value = r.active === false ? 'false' : 'true';
  } else {
    $('#editRewardModalTitle').textContent = '新增獎勵';
    f.elements.id.value = '';
  }
  $('#editRewardModal').showModal();
}

$('#editRewardForm').onsubmit = async e => {
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(e.target));
  const payload = {
    ...fd,
    cost: Number(fd.cost),
    limit: Number(fd.limit || 0),
    budget: fd.budget === '' ? '' : Number(fd.budget),
    active: fd.active === 'true'
  };
  const r = await apiCall(fd.id ? `/api/rewards/${fd.id}` : '/api/rewards', fd.id ? 'PUT' : 'POST', payload);
  if (r.offline) {
    if (fd.id) {
      const idx = state.rewards.findIndex(x => x.id === fd.id);
      if (idx !== -1) state.rewards[idx] = { ...state.rewards[idx], ...payload };
    } else {
      state.rewards.push({ ...payload, id: 'rew-' + crypto.randomUUID().slice(0, 8) });
    }
    saveLocalCache();
  } else if (r.ok) {
    state = r.data.state;
    saveLocalCache();
  }
  $('#editRewardModal').close();
  render();
  toast('獎勵已儲存！');
};

$('#editLogForm').onsubmit = async e => {
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(e.target));
  const r = await apiCall(`/api/children/${child}/logs/${fd.id}`, 'PUT', fd);
  if (r.offline) {
    const idx = data().logs.findIndex(x => x.id === fd.id);
    if (idx !== -1) data().logs[idx] = { ...data().logs[idx], ...fd };
    saveLocalCache();
  } else if (r.ok) {
    state = r.data.state;
    saveLocalCache();
  }
  $('#editLogModal').close();
  render();
  toast('觀察紀錄已更新。');
};

$('#editSessionForm').onsubmit = async e => {
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(e.target));
  const payload = {
    date: fd.date,
    level: fd.level,
    planned: Number(fd.planned),
    elapsed: Number(fd.elapsed),
    distractions: Number(fd.distractions),
    earned: Number(fd.earned)
  };
  const r = await apiCall(`/api/children/${child}/sessions/${fd.id}`, 'PUT', payload);
  if (r.offline) {
    const idx = data().sessions.findIndex(x => x.id === fd.id);
    if (idx !== -1) data().sessions[idx] = { ...data().sessions[idx], ...payload };
    saveLocalCache();
  } else if (r.ok) {
    state = r.data.state;
    saveLocalCache();
  }
  $('#editSessionModal').close();
  render();
  toast('打卡紀錄已更新。');
};

function startExercise(taskId) {
  clearInterval(interval);
  interval = null;
  const t = (state.tasks || []).find(x => x.id === taskId);
  if (!t) return;
  if (!canCheckIn(data(), t)) {
    toast('今日此任務已達完成次數上限（maxDaily）！');
    return;
  }
  currentTask = t;
  total = (Number(t.minutes) || 5) * 60;
  remaining = total;
  $('#exerciseTitle').textContent = t.title;
  $('#exerciseInstructions').textContent = t.desc;
  $('#exercisePrompt').textContent = '溫和引導語｜' + t.promptText;
  $('#sessionDistraction').value = 0;
  $('#sessionEarned').value = 'default';
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

$('#finishTask').onclick = async () => {
  if (!currentTask) return;
  if (interval) tick();
  clearInterval(interval);
  interval = null;

  const distractions = Math.max(0, Number($('#sessionDistraction').value) || 0);
  const earnedChoice = $('#sessionEarned').value;
  const payload = {
    task: currentTask.id,
    level: currentTask.difficulty || 'easy',
    planned: Number(currentTask.minutes) || 5,
    elapsed: total - remaining,
    distractions,
    earnedChoice
  };

  const r = await apiCall(`/api/children/${child}/sessions`, 'POST', payload);
  if (r.offline) {
    const mapChoice = { '1': 1, '2': 2, '3': 3, '4': 4 };
    const earned = mapChoice[earnedChoice] || Number(currentTask.flowers) || 2;
    data().sessions.push({
      id: crypto.randomUUID(),
      date: todayStr(),
      task: currentTask.id,
      taskTitle: currentTask.title,
      level: payload.level,
      planned: payload.planned,
      elapsed: payload.elapsed,
      distractions,
      earned,
      created: Date.now()
    });
    saveLocalCache();
  } else if (r.ok) {
    state = r.data.state;
    saveLocalCache();
  } else {
    toast(r.data?.message || '打卡失敗');
    return;
  }

  celebrateHero = true;
  $('#exercise').close();
  render();
  toast('🌸 完成練習！每一小步都算數！');
};

window.addEventListener('hashchange', () => { confirmDeleteKey = null; render(); window.scrollTo(0, 0); });
document.querySelectorAll('[data-child]').forEach(b => b.onclick = () => { child = b.dataset.child; confirmDeleteKey = null; render(); });
$('#syncStatusBtn').onclick = () => fetchStateFromServer().then(() => render());
$('#date').textContent = new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());

// 啟動時檢查伺服器端 httpOnly Session 狀態
(async () => {
  const r = await apiCall('/api/state', 'GET');
  if (r.ok && r.data?.state) {
    state = r.data.state;
    sessionState = r.data.session || { authenticated: true, parent: false };
    saveLocalCache();
  }
  updateAuthUI();
  if (sessionState.authenticated) render();
})();
