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

const defaultRewards = {
  girl: [
    { id: 'r-girl-1', icon: '🎲', title: '親子桌遊或故事時間 20 分鐘', cost: 3 },
    { id: 'r-girl-2', icon: '🎨', title: '畫畫手作材料小獎勵', cost: 5 },
    { id: 'r-girl-3', icon: '🌿', title: '週末戶外散步／運動點心時光', cost: 6 }
  ],
  boy: [
    { id: 'r-boy-1', icon: '🌟', title: '口頭肯定＋擊掌＋小貼紙／小點心', cost: 2 },
    { id: 'r-boy-2', icon: '📖', title: '選一本繪本或桌遊陪玩', cost: 4 },
    { id: 'r-boy-3', icon: '🛝', title: '週末去公園或特別活動', cost: 6 },
    { id: 'r-boy-4', icon: '🎁', title: '集點換小禮物／心願券', cost: 10 }
  ]
};

const defaultCustomTasks = {
  girl: [
    {
      id: 'custom-girl-bag',
      icon: '🎒',
      title: '睡前書包小隊',
      area: '生活自理',
      desc: '睡前對照課表與聯絡簿，減少隔天漏帶東西。',
      steps: {
        easy: '看聯絡簿最後兩行，把明天要交的本子放進書包。',
        normal: '對照課表與聯絡簿，自己檢查課本、鉛筆盒與水壺。',
        challenge: '自己整理完書包並說出明天要注意的 1 件事，家長只做最後確認。'
      },
      prompt: '「我們睡前花 3 分鐘一起檢查書包，明天出門就會很輕鬆喔！」',
      active: true
    }
  ],
  boy: [
    {
      id: 'custom-boy-writing',
      icon: '✍',
      title: '國字小方格分段練',
      area: '書寫專注',
      desc: '用計時器分段寫國字，寫完一小段就休息擊掌。',
      steps: {
        easy: '設定倒數 5 分鐘，只先寫完一行國字，寫好就打勾休息。',
        normal: '在小白板寫「第一行 → 喝水 → 第二行」，搭配計時器完成。',
        challenge: '自己決定先寫難字還是簡單字，寫完 2 行後自己挑一個最滿意的字。'
      },
      prompt: '「媽媽知道國字寫起來很累，我們用計時器先寫這一行，寫完馬上擊掌！」',
      active: true
    }
  ]
};

function makeDefaultChild(c) {
  return {
    level: 'easy',
    minutes: 10,
    checks: {},
    logs: [],
    sessions: [],
    extra: '',
    points: 0,
    rewards: structuredClone(defaultRewards[c]),
    redemptions: [],
    customTasks: structuredClone(defaultCustomTasks[c])
  };
}

function normalizeDB(raw) {
  const base = {
    version: 1,
    updatedAt: 0,
    deletedIds: [],
    lastBackupAt: null,
    auth: {
      familyHash: hashPin(DEFAULT_FAMILY_PIN),
      parentHash: hashPin(DEFAULT_PARENT_PIN),
      isDefaultFamily: true,
      isDefaultParent: true
    },
    children: {
      girl: makeDefaultChild('girl'),
      boy: makeDefaultChild('boy')
    }
  };
  if (!raw || raw.version !== 1 || !raw.children) return base;
  base.updatedAt = typeof raw.updatedAt === 'number' ? raw.updatedAt : 0;
  base.deletedIds = Array.isArray(raw.deletedIds) ? raw.deletedIds.slice(-200) : [];
  base.lastBackupAt = typeof raw.lastBackupAt === 'number' ? raw.lastBackupAt : null;
  if (raw.auth && typeof raw.auth === 'object') {
    if (typeof raw.auth.familyHash === 'string') {
      base.auth.familyHash = raw.auth.familyHash;
      base.auth.isDefaultFamily = Boolean(raw.auth.isDefaultFamily);
    }
    if (typeof raw.auth.parentHash === 'string') {
      base.auth.parentHash = raw.auth.parentHash;
      base.auth.isDefaultParent = Boolean(raw.auth.isDefaultParent);
    }
  }
  for (const c of ['girl', 'boy']) {
    const src = raw.children[c];
    if (!src) continue;
    const dst = base.children[c];
    dst.level = ['easy', 'normal', 'challenge'].includes(src.level) ? src.level : 'easy';
    dst.minutes = Number.isFinite(src.minutes) ? Math.min(15, Math.max(5, src.minutes)) : 10;
    dst.checks = (src.checks && typeof src.checks === 'object') ? src.checks : {};
    dst.logs = Array.isArray(src.logs) ? src.logs : [];
    dst.sessions = Array.isArray(src.sessions) ? src.sessions : [];
    dst.extra = typeof src.extra === 'string' ? src.extra : '';
    dst.redemptions = Array.isArray(src.redemptions) ? src.redemptions : [];
    dst.points = Number.isFinite(src.points) ? Math.max(0, src.points) : dst.sessions.length;
    dst.rewards = Array.isArray(src.rewards) && src.rewards.length ? src.rewards : structuredClone(defaultRewards[c]);
    dst.customTasks = Array.isArray(src.customTasks) ? src.customTasks : structuredClone(defaultCustomTasks[c]);
  }
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

$('#loginForm').onsubmit = e => {
  e.preventDefault();
  const pin = $('#loginPassword').value.trim();
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

$('#parentPinForm').onsubmit = e => {
  e.preventDefault();
  const pin = $('#parentPinInput').value.trim();
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
    requireParentAuth('解鎖後即可檢視完整統計、管理獎勵與修改紀錄。', () => render());
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
      '坐著看書或上課時容易想睡，有時覺得上課無聊會發呆、分心；提醒後有時能撐住。',
      '滿常漏帶東西，與同學互動還可以，但不會到很大方。',
      '偶爾白天疲倦、偶爾鼻塞打呼；平日約 19:00 多洗澡、21:30 上床，約 22:00–22:30 睡著，早上 06:00 起床（假日作息相近，會要求午睡）。',
      '遇到挫折容易安靜不說話／發呆、想放棄或哭泣；需要大人先抱抱／拍拍，休息喝水後再試。'
    ],
    favorites: '畫畫手作、閱讀故事書、桌遊、親子遊戲、戶外散步或運動',
    calming: '先給予抱抱／拍拍安撫，休息喝水後再陪著試一次',
    unknown: '已完成基本觀察建檔，可持續補充睡前放鬆儀式與書包檢查成效。'
  },
  boy: {
    name: '邦盛',
    full: '徐邦盛',
    birth: '2020-03-11',
    age: '6 歲',
    grade: '小學一年級',
    traits: [
      'ESL 已先完成作業，回家後媽媽會陪著核對約 1 小時；一次能坐約半小時後開始分心，目前最卡關國字書寫。',
      '上課坐不住、講話與插嘴頻率偏高；但對喜歡的課程非常投入。',
      '覺得不合理時情緒容易急躁，曾發生摔書的情形；練習先停一下、說出需要。',
      '有效提醒方式：倒數計時器（視覺化時間）、口頭只講一個短指令、輕拍肩膀／眼神對視後再說、先寫在小白板／便利貼打勾。'
    ],
    favorites: '集點換東西、選一本繪本或桌遊陪玩、貼紙／小點心、週末去公園或特別活動、口頭肯定＋擊掌',
    calming: '倒數計時器視覺提示、輕拍肩膀與眼神對視、一次一個短指令、小白板打勾',
    unknown: '已完成基本觀察建檔，可持續記錄國字書寫分段練習與情緒降溫成效。'
  }
};

const baseTasks = {
  focus: {
    title: '小小專注探險',
    icon: '⌕',
    area: '專注力',
    desc: '一次只做一小步，分心了就溫柔地回來。',
    steps: {
      easy: '準備一小段作業或一張圖。先說出「我現在要做什麼」，完成一題或找出 3 個指定物件。',
      normal: '準備一小段作業，先自己選 2 題（或寫在小白板打勾）。每完成一題畫一個小點再繼續。',
      challenge: '先說出接下來的 3 個小步驟，搭配倒數計時器依序完成；發現分心時，自己指回目前的步驟。'
    },
    prompt: {
      girl: '「我們先做這一小步，我在旁邊陪你；完成後可以去畫畫或玩一小局桌遊喔。」',
      boy: '「小白板上這 2 個勾完成後，就能集 1 朵小花換桌遊或公園時間喔！」'
    }
  },
  stop: {
    title: '紅綠燈小隊長',
    icon: '◉',
    area: '自我控制',
    desc: '綠燈走、紅燈停，練習先看訊號再行動。',
    steps: {
      easy: '家長說「綠燈」時原地踏步，說「紅燈」時停下。慢慢切換，每輪之間休息。',
      normal: '加入「黃燈」慢慢走；輕拍肩膀或對視給訊號後再動作，家長與孩子輪流當隊長。',
      challenge: '由孩子先複述紅、黃、綠燈規則，再練習不規則切換；錯了就一起笑一笑重來。'
    },
    prompt: {
      girl: '「你剛才有先看清楚再動，很棒喔！累了我們就喝口水休息。」',
      boy: '「你剛才有等一下再動，這就是練習！來擊掌一下，我們再試一輪。」'
    }
  },
  calm: {
    title: '生氣小雲朵',
    icon: '☁',
    area: '情緒調節',
    desc: '先停一下、說感受，再選一個可以做的動作。',
    steps: {
      easy: '先抱抱或拍拍肩膀，用手畫一朵雲，說「我現在覺得……」。慢慢喝一口水或休息一下。',
      normal: '用輕微的小挫折情境，練習「停一下 → 說感受 → 說需要」，例如「我不會，我想請你提示第一步」。',
      challenge: '輪流扮演遇到覺得不合理或不會寫的情境；孩子先放下手邊物品說出感受，再選休息或請求協助。'
    },
    prompt: {
      girl: '「遇到卡住不想寫沒關係，我們先抱抱、喝口水休息一下，準備好再看第一步。」',
      boy: '「覺得不合理或卡住時，先把手放下來、對看三秒；你要先喝水休息，還是我提示第一步？」'
    }
  },
  homework: {
    title: '作業起步儀式',
    icon: '✎',
    area: '作業習慣',
    desc: '清出桌面、用小白板與計時器，讓開始變得簡單。',
    steps: {
      easy: '桌上只留現在需要的物品，設定倒數計時器 5 分鐘。孩子自己選第一題，家長只給一個簡短指令。',
      normal: '在小白板寫「準備 → 做一題 → 檢查」，每做完一步就打勾，計時器響了就伸展一下。',
      challenge: '孩子自己排 3 個作業小步驟並開始；分心後看小白板找回下一步，最後自己檢查。'
    },
    prompt: {
      girl: '「我們先清出桌面，完成這一段就能去挑今天想玩的桌遊或畫畫喔。」',
      boy: '「用計時器先做這一小段，完成就在小白板打勾，集滿小花可以換貼紙或陪玩！」'
    }
  },
  move: {
    title: '醒醒身體小伸展',
    icon: '☀',
    area: '精神觀察',
    desc: '先看看精神，再決定今天適合的練習量。',
    steps: {
      easy: '站起來，慢慢伸手、踏步，喝一口水。問孩子「現在比較清醒，還是仍想休息？」',
      normal: '輪流帶 3 個輕鬆伸展動作（也可搭配室內小散步），再觀察精神。仍想睡就停止練習。',
      challenge: '孩子自己選 3 個舒適動作，輪流帶領。結束後描述精神變化，不用勉強撐住。'
    },
    prompt: {
      girl: '「坐久了容易想睡，我們先站起來動一動、喝口水；還是累的話就先抱抱休息。」',
      boy: '「先動一動把精力放出來，等一下寫作業會更順喔！」'
    }
  }
};

function allTasksMap() {
  const map = { ...baseTasks };
  for (const ct of data().customTasks || []) {
    if (ct && ct.id) map[ct.id] = ct;
  }
  return map;
}

function getTaskPrompt(t) {
  if (!t || !t.prompt) return '';
  if (typeof t.prompt === 'string') return t.prompt;
  return t.prompt[child] || t.prompt.girl || '';
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
  merged.deletedIds = Array.from(delSet).slice(-200);

  if ((incoming.updatedAt || 0) > (localData.updatedAt || 0) && incoming.auth && typeof incoming.auth.familyHash === 'string') {
    merged.auth = incoming.auth;
  }

  for (const c of ['girl', 'boy']) {
    const from = incoming.children && incoming.children[c];
    const to = merged.children[c];
    if (!from) continue;

    for (const k of ['logs', 'sessions', 'redemptions', 'customTasks', 'rewards']) {
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
      if (Number.isFinite(from.points)) to.points = from.points;
      if (['easy', 'normal', 'challenge'].includes(from.level)) to.level = from.level;
      if (Number.isFinite(from.minutes)) to.minutes = from.minutes;
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

function save(skipPush = false) {
  try {
    db.updatedAt = Date.now();
    localStorage.setItem(key, JSON.stringify(db));
    if (!skipPush) schedulePush();
    return true;
  } catch {
    toast('瀏覽器無法儲存，請先匯出備份。');
    return false;
  }
}

function toast(t) {
  $('#toast').textContent = t;
  $('#toast').style.display = 'block';
  clearTimeout(window.toastTimeout);
  window.toastTimeout = setTimeout(() => ($('#toast').style.display = 'none'), 3400);
}

function data() { return db.children[child]; }
function check() { return data().checks[today()] || 'unknown'; }

function plan() {
  let ids = child === 'boy' ? ['homework', 'focus', 'calm'] : ['move', 'focus', 'stop'];
  const c = check();
  if (c === 'angry') ids = ['calm', 'stop', 'homework'];
  if (c === 'distracted') ids = ['stop', 'focus', 'homework'];
  if (c === 'tired') ids = ['move', 'calm'];
  return ids;
}

function nextTask() { return plan().find(id => !completed(id)) || null; }
function completed(id) { return data().sessions.some(s => s.date === today() && s.task === id); }
function durations() {
  const ids = plan();
  const m = data().minutes;
  return ids.map((_, i) => Math.floor(m / ids.length) + (i < m % ids.length ? 1 : 0));
}

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

function tasksHTML() {
  const ids = plan();
  const ds = durations();
  const map = allTasksMap();
  return ids.map((id, i) => {
    const t = map[id];
    if (!t) return '';
    return `<article class="card task">
      <div class="task-icon">${esc(t.icon)}</div>
      <div class="task-body">
        <h3>${esc(t.title)}</h3>
        <p>${esc(t.desc)}</p>
        <div class="chips">
          <span class="chip">${esc(t.area)}</span>
          <span class="chip">◷ ${ds[i]} 分鐘</span>
          <span class="chip">${{ easy: '輕鬆起步', normal: '穩穩練習', challenge: '小小挑戰' }[data().level]}</span>
        </div>
      </div>
      <div class="task-actions">${completed(id) ? '<span class="done">✓ 已打卡</span>' : `<button class="secondary" data-start="${esc(id)}">開始 →</button>`}</div>
    </article>`;
  }).join('');
}

function recommendation() {
  return {
    unknown: '先選擇今天的狀態，再依狀況調整練習。',
    ready: '精神不錯，從一個小步驟開始，照自己的節奏完成。',
    distracted: '先做紅綠燈活動或打開倒數計時器，一次只給一個短指令並留時間回應。',
    angry: '先抱抱或對看三秒平復情緒、喝口水，再決定是否繼續練習。',
    tired: '今天先輕鬆動一動、觀察精神。持續想睡就先休息，不必完成全部任務。'
  }[check()];
}

function rewardsWidgetHTML() {
  const d = data();
  const list = d.rewards || [];
  return `<div class="card tip">
    <h3>🎁 集點獎勵兌換區</h3>
    <p>目前擁有 <b>🌸 ${d.points} 朵小花</b>（兌換需由家長輸入密碼確認）。</p>
    ${list.length ? list.map(r => `
      <div class="reward-item">
        <div class="reward-info">
          <b>${esc(r.icon || '🎁')} ${esc(r.title)}</b>
          <small>需要 ${r.cost} 朵小花</small>
        </div>
        <button class="secondary btn-sm" data-redeem="${esc(r.id)}" ${d.points < r.cost ? 'disabled style="opacity:.45;cursor:not-allowed"' : ''}>兌換 🔒</button>
      </div>`).join('') : '<p class="subtext">尚未設定獎勵，可於家長檢視頁新增。</p>'}
  </div>`;
}

function renderBackupBanner() {
  const banner = $('#backupBanner');
  const hasData = db.children.girl.logs.length + db.children.girl.sessions.length + db.children.boy.logs.length + db.children.boy.sessions.length > 0;
  const daysSince = db.lastBackupAt ? Math.floor((Date.now() - db.lastBackupAt) / 86400000) : null;
  const needBackup = (page === 'home' || (page === 'parent' && isParentUnlocked())) && ((daysSince === null && hasData) || (daysSince !== null && daysSince >= 7));
  if (!needBackup) {
    banner.hidden = true;
    banner.innerHTML = '';
    return;
  }
  banner.hidden = false;
  banner.innerHTML = `
    <span>☁ ${daysSince === null ? '目前尚未匯出過備份檔案' : `距離上次 JSON 備份已過 ${daysSince} 天`}，建議匯出檔案方便爸爸與媽媽跨裝置同步。</span>
    <div class="banner-actions">
      <button id="bannerExportBtn" class="secondary btn-sm" type="button">↓ 立即匯出備份</button>
    </div>`;
  $('#bannerExportBtn').onclick = exportData;
}

function home() {
  const p = profiles[child];
  const ids = plan();
  const done = ids.filter(completed).length;
  const weekSessions = sessionsIn(week());
  const stage = gardenStage(weekSessions.length);
  const map = allTasksMap();
  const nextId = nextTask();
  return `
    <section class="hero ${celebrateHero ? 'celebrating' : ''}">
      <span class="tag">SMALL STEPS, EVERY DAY</span>
      <h1>${p.name}，今天也一起長大吧。</h1>
      <p>每天 ${data().minutes} 分鐘，練習一點點專注，也多認識一點自己。<br>不用做到完美，願意開始就是很棒的一步。</p>
      <div class="garden-status">🌱 本週花園：<b>${stage.label}</b>（已完成 ${weekSessions.length} 次 · ${stage.next}）</div>
      ${gardenSVG(weekSessions.length, celebrateHero)}
    </section>
    <div class="section-head"><h2>今天，感覺怎麼樣？ <small>先認識狀態，再開始練習</small></h2></div>
    <div class="layout">
      <div>
        <section class="card checkin">
          <h3>陪${p.name}選一個現在的感覺</h3>
          <div class="mood-row">
            ${[['ready', '😊', '精神不錯'], ['distracted', '🌀', '有點分心'], ['angry', '🌧', '心情不太好'], ['tired', '😴', '有點想睡']].map(([v, e, t]) => `<button class="mood ${check() === v ? 'selected' : ''}" data-mood="${v}" aria-pressed="${check() === v}"><span>${e}</span>${t}</button>`).join('')}
          </div>
          <div class="check-bottom"><span>狀態沒有對錯，每天都可以不一樣。</span><span>選擇即儲存 ✓</span></div>
        </section>
        <div class="section-head"><h2>今天的小任務 <small>依當下狀態安排</small></h2><a href="#tasks" class="text-link">調整練習 ↗</a></div>
        ${tasksHTML()}
      </div>
      <div>
        <div class="card progress-card">
          <h3>今天的小小累積 <span style="float:right">🌱</span></h3>
          <div class="big">${done} <small>/ ${ids.length} 個任務</small></div>
          <div class="progress-track"><div style="width:${done / ids.length * 100}%"></div></div>
          <div class="points-pill">🌸 目前點數：<b>${data().points} 朵小花</b></div>
          <p>${done ? '謝謝你願意練習，每一步都留下了足跡。' : '花園準備好了，從一個小任務開始吧。'}</p>
          ${weekChart()}
        </div>
        <div class="card tip">
          <h3>✧ 給陪伴的你</h3>
          <p>${recommendation()}</p>
          <blockquote>${esc(getTaskPrompt(map[nextId || ids[0]]))}</blockquote>
          ${nextId ? `<button class="secondary full" data-start="${esc(nextId)}">下一個練習：${esc(map[nextId].title)} →</button>` : '<p>今天的任務都完成了，休息一下吧。</p>'}
        </div>
        ${rewardsWidgetHTML()}
      </div>
    </div>
    <p class="notice">✳ 這是日常陪伴與觀察工具，不提供診斷。資料僅儲存在此瀏覽器；換裝置前請於家長檢視匯出備份。</p>`;
}

function settings() {
  return `<div class="card">
    <div class="form-grid">
      <label>每日練習總長度
        <div class="range-line">
          <input id="minutes" type="range" min="5" max="15" value="${data().minutes}">
          <span id="minutesValue">${data().minutes} 分鐘</span>
        </div>
      </label>
      <label>練習難度
        <select id="level">
          <option value="easy">輕鬆起步 · 一個步驟</option>
          <option value="normal">穩穩練習 · 兩個步驟</option>
          <option value="challenge">小小挑戰 · 自己安排</option>
        </select>
      </label>
    </div>
    <p class="subtext">時間是安排參考，可提早休息。難度只改變步驟與自主程度，不以速度評分。</p>
  </div>`;
}

function taskPage() {
  const custom = (data().customTasks || []).filter(t => t.active !== false);
  return `<h1 class="page-title">今天，練習一小步。</h1>
    <p class="subtext">為${profiles[child].name}選一個舒服的節奏。${recommendation()}</p>
    ${settings()}
    <div class="section-head"><h2>今日練習清單</h2><small>約 ${data().minutes} 分鐘</small></div>
    <div class="layout">
      <div>
        ${tasksHTML()}
        ${custom.length ? `<div class="section-head"><h2>${profiles[child].name}的專屬自訂練習</h2><a href="#parent" class="text-link">管理自訂任務 ↗</a></div>
        ${custom.map(t => `<article class="card task">
          <div class="task-icon">${esc(t.icon || '🌱')}</div>
          <div class="task-body"><h3>${esc(t.title)}</h3><p>${esc(t.desc)}</p><div class="chips"><span class="chip">${esc(t.area || '自訂')}</span><span class="chip">完成 +1 🌸</span></div></div>
          <div class="task-actions">${completed(t.id) ? '<span class="done">✓ 已打卡</span>' : `<button class="secondary" data-start="${esc(t.id)}">開始 →</button>`}</div>
        </article>`).join('')}` : ''}
        <div class="section-head"><h2>也可以選擇其他系統練習</h2></div>
        ${Object.entries(baseTasks).filter(([id]) => !plan().includes(id)).map(([id, t]) => `<article class="card task">
          <div class="task-icon">${t.icon}</div>
          <div class="task-body"><h3>${t.title}</h3><p>${t.desc}</p></div>
          <button class="secondary" data-start="${id}">試試看</button>
        </article>`).join('')}
      </div>
      <div>
        <div class="card tip" style="margin:0">
          <h3>家長陪伴小提醒</h3>
          <p>一次給一個具體短指令，輕拍肩膀或眼神對視後再說。<br>指出孩子做到的動作，善用倒數計時器與小白板打勾。<br>情緒升高或想睡時，先抱抱、喝水休息。</p>
          <blockquote>「你剛才分心後又回來了，我有看到你的努力。」</blockquote>
        </div>
        ${rewardsWidgetHTML()}
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

一、練習參與概況
- 練習天數：${activeDays} / ${daysCount} 天
- 完成練習：${ss.length} 次

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

function parentPage() {
  if (!isParentUnlocked()) {
    return `<div class="parent-locked-box">
      <span class="eyebrow">PARENTS ONLY</span>
      <h2>🔒 家長檢視已鎖定</h2>
      <p>為了避免孩子誤改觀察紀錄、獎勵設定或備份資料，進入家長檢視前請先驗證家長操作密碼。</p>
      <button id="unlockParentPageBtn" class="primary" type="button">輸入家長密碼解鎖 →</button>
    </div>`;
  }

  const p = profiles[child];
  const ss = sessionsIn(week());
  const days = new Set(ss.map(s => s.date)).size;
  const logs = data().logs.filter(l => week().includes(l.date));
  const map = allTasksMap();
  const custom = data().customTasks || [];
  const rewards = data().rewards || [];
  const redemptions = data().redemptions || [];

  return `<h1 class="page-title">陪伴的足跡。</h1>
    <p class="subtext">${p.full}的個別檔案與每週觀察 · ${week()[0]} — ${week()[6]}</p>
    <div class="stats">
      <div class="card stat"><span>本週練習日</span><strong>${days}<small style="font-size:14px"> / 7 天</small></strong><span>有打卡的不同日期</span></div>
      <div class="card stat"><span>本週完成練習</span><strong>${ss.length}<small style="font-size:14px"> 次</small></strong><span>包含自訂與系統練習</span></div>
      <div class="card stat"><span>累積小花點數</span><strong>${data().points}<small style="font-size:14px"> 🌸</small></strong><span>已兌換獎勵 ${redemptions.length} 次</span></div>
    </div>
    <div class="layout">
      <div>
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

        <div class="section-head"><h2>自訂小任務管理</h2></div>
        <div class="card">
          <form id="customTaskForm" class="form-grid">
            <label>任務名稱<input name="title" required placeholder="例如：英文閱讀 10 分鐘、收拾積木"></label>
            <label>圖示／領域<input name="area" placeholder="例如：學習習慣、生活自理" value="生活自理"></label>
            <label class="wide">任務說明<input name="desc" required placeholder="簡短描述這個練習要做什麼"></label>
            <label class="wide">執行步驟（家長引導語）<input name="step" required placeholder="例如：設定計時器 5 分鐘，先收好桌上的積木再擊掌"></label>
            <div class="wide"><button class="secondary full" type="submit">＋ 新增自訂小任務</button></div>
          </form>
          <div style="margin-top:16px">
            ${custom.length ? custom.map(t => `<div class="record">
              <div class="record-head">
                <b>${esc(t.icon || '🌱')} ${esc(t.title)}（${esc(t.area)}）</b>
                <div class="record-actions">${deleteBtnHTML('customTask', t.id)}</div>
              </div>
              <p>${esc(t.desc)}</p>
            </div>`).join('') : '<p class="subtext">目前尚無自訂任務。</p>'}
          </div>
        </div>

        <div class="section-head"><h2>集點獎勵清單管理</h2></div>
        <div class="card">
          <form id="rewardForm" class="form-grid">
            <label>獎勵內容<input name="title" required placeholder="例如：週末去公園玩、選一本繪本"></label>
            <label>所需小花（🌸）<input name="cost" type="number" min="1" max="100" value="3" required></label>
            <div class="wide"><button class="secondary full" type="submit">＋ 新增獎勵項目</button></div>
          </form>
          <div style="margin-top:16px">
            ${rewards.length ? rewards.map(r => `<div class="record">
              <div class="record-head">
                <b>${esc(r.icon || '🎁')} ${esc(r.title)} · 需要 ${r.cost} 朵小花</b>
                <div class="record-actions">${deleteBtnHTML('reward', r.id)}</div>
              </div>
            </div>`).join('') : '<p class="subtext">尚未設定獎勵。</p>'}
          </div>
          ${redemptions.length ? `<div style="margin-top:14px"><b style="font-size:14px">近期兌換紀錄</b>${redemptions.slice(0, 8).map(rd => `<p class="subtext" style="margin:4px 0">✓ ${esc(rd.date)} 兌換「${esc(rd.title)}」（-${rd.cost} 🌸）</p>`).join('')}</div>` : ''}
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
              <input name="url" type="url" value="\${esc(getCloudConfig().url)}" placeholder="https://script.google.com/macros/s/.../exec">
            </label>
            <label class="wide">自訂同步密鑰（需與 Code.gs 的 SECRET_TOKEN 一致）
              <input name="token" type="text" value="\${esc(getCloudConfig().token)}" placeholder="例如：xu2026sync">
            </label>
            <div class="toolbar wide">
              <button class="primary" type="submit">儲存設定並立即同步</button>
              <button id="manualPullBtn" class="secondary" type="button">↓ 從雲端拉取合併</button>
            </div>
          </form>
          <p class="subtext" style="margin-top:10px">設定完成後，每次新增、打卡、編輯或兌換獎勵都會自動同步到你們的 Google 試算表，爸爸與媽媽的手機電腦即可共用最新紀錄。</p>
        </div>

        <div class="section-head"><h2>🔐 密碼與安全設定</h2></div>
        <div class="card">
          <form id="familyPinForm" class="form-grid" style="align-items:end;padding-bottom:16px;border-bottom:1px solid var(--line)">
            <label>全家登入密碼 <small class="subtext">（目前：${db.auth.isDefaultFamily ? '預設 2026' : '已自訂'}）</small>
              <input name="newFamilyPin" type="text" minlength="4" required placeholder="輸入新的全家登入密碼（至少 4 碼）">
            </label>
            <div>
              <button class="secondary full" style="margin-top:0" type="submit">更新全家登入密碼</button>
            </div>
          </form>
          <form id="parentPinChangeForm" class="form-grid" style="align-items:end;margin-top:16px">
            <label>家長操作密碼 <small class="subtext">（目前：${db.auth.isDefaultParent ? '預設 9999' : '已自訂'}）</small>
              <input name="newParentPin" type="text" minlength="4" required placeholder="輸入新的家長操作密碼（至少 4 碼）">
            </label>
            <div>
              <button class="secondary full" style="margin-top:0" type="submit">更新家長操作密碼</button>
            </div>
          </form>
          <p class="subtext" style="margin-top:12px">兩組密碼可分開獨立修改，修改後會即時儲存於瀏覽器並寫入 JSON 備份。交給孩子使用前，可點右上方「🔓 家長已解鎖」一鍵鎖回。</p>
        </div>
      </div>

      <div>
        <div class="card tip" style="margin:0">
          <h3>資料與備份</h3>
          <p>資料只存在目前瀏覽器，不會跨裝置同步。定期匯出 JSON，方便爸爸與媽媽在手機或電腦間同步。</p>
          <p><b>上次備份：</b>${db.lastBackupAt ? new Date(db.lastBackupAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }) : '尚未記錄'}</p>
          <button id="export" class="secondary full" type="button">↓ 匯出兩位孩子的紀錄</button>
          <label class="secondary full" style="display:block;text-align:center;cursor:pointer">↑ 匯入備份
            <input id="import" type="file" accept="application/json,.json" style="display:none">
          </label>
          <p>匯入會合併紀錄並略過重複項目；原有資料會保留。</p>
        </div>
        <div class="card tip">
          <h3>陪伴，不是評分</h3>
          <p>本工具不診斷 ADHD 或其他疾病，也不以紀錄推論疾病。練習以日常習慣與親子陪伴為目的。</p>
          <p>兩個孩子各自累積，不做排名。沒有資料的日期保留空白，不算失敗。</p>
        </div>
      </div>
    </div>

    <div class="section-head"><h2>練習打卡紀錄</h2></div>
    <div class="card">
      ${data().sessions.length ? [...data().sessions].sort((a, b) => b.created - a.created).slice(0, 30).map(s => `<div class="record">
        <div class="record-head">
          <b>${esc(s.date)} · ${esc(map[s.task]?.title || s.taskTitle || s.task)}</b>
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
    $('#minutes').oninput = e => ($('#minutesValue').textContent = e.target.value + ' 分鐘');
    $('#minutes').onchange = e => { data().minutes = Number(e.target.value); save(); render(); };
  }

  document.querySelectorAll('[data-mood]').forEach(b => b.onclick = () => {
    data().checks[today()] = b.dataset.mood;
    save();
    render();
  });

  document.querySelectorAll('[data-start]').forEach(b => b.onclick = () => start(b.dataset.start));

  document.querySelectorAll('[data-redeem]').forEach(b => b.onclick = () => {
    const r = (data().rewards || []).find(x => x.id === b.dataset.redeem);
    if (!r || data().points < r.cost) return;
    requireParentAuth(`兌換獎勵「${r.title}」（需要 ${r.cost} 朵小花）需由家長確認。`, () => {
      data().points -= r.cost;
      data().redemptions.unshift({ id: crypto.randomUUID(), rewardId: r.id, title: r.title, cost: r.cost, date: today(), created: Date.now() });
      save();
      render();
      toast(`太棒了！已兌換「${r.title}」🎉`);
    });
  });

  document.querySelectorAll('[data-ask-del]').forEach(b => b.onclick = () => {
    const keyDel = b.dataset.askDel;
    requireParentAuth('刪除紀錄前需先驗證家長密碼。', () => {
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
    db.deletedIds = [...(db.deletedIds || []), id].slice(-200);
    if (type === 'log') data().logs = data().logs.filter(x => x.id !== id);
    if (type === 'session') data().sessions = data().sessions.filter(x => x.id !== id);
    if (type === 'customTask') data().customTasks = (data().customTasks || []).filter(x => x.id !== id);
    if (type === 'reward') data().rewards = (data().rewards || []).filter(x => x.id !== id);
    confirmDeleteKey = null;
    save();
    render();
    toast('已刪除該筆紀錄。');
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
  if ($('#manualPullBtn')) {
    $('#manualPullBtn').onclick = () => pullFromCloud(false);
  }

  if ($('#familyPinForm')) {
    $('#familyPinForm').onsubmit = e => {
      e.preventDefault();
      const pin = new FormData(e.target).get('newFamilyPin')?.toString().trim();
      if (!pin || pin.length < 4) { toast('全家登入密碼請至少輸入 4 碼。'); return; }
      db.auth.familyHash = hashPin(pin);
      db.auth.isDefaultFamily = false;
      save();
      render();
      toast('全家登入密碼已更新！下次登入請使用新密碼。');
    };
  }

  if ($('#parentPinChangeForm')) {
    $('#parentPinChangeForm').onsubmit = e => {
      e.preventDefault();
      const pin = new FormData(e.target).get('newParentPin')?.toString().trim();
      if (!pin || pin.length < 4) { toast('家長操作密碼請至少輸入 4 碼。'); return; }
      db.auth.parentHash = hashPin(pin);
      db.auth.isDefaultParent = false;
      save();
      render();
      toast('家長操作密碼已更新！');
    };
  }

  if ($('#customTaskForm')) {
    $('#customTaskForm').onsubmit = e => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      data().customTasks.push({
        id: 'custom-' + crypto.randomUUID().slice(0, 8),
        icon: '🌱',
        title: fd.title.trim(),
        area: fd.area.trim() || '自訂',
        desc: fd.desc.trim(),
        steps: { easy: fd.step.trim(), normal: fd.step.trim(), challenge: fd.step.trim() },
        prompt: `「我們一起完成『${fd.title.trim()}』，做完就集 1 朵小花喔！」`,
        active: true
      });
      save();
      render();
      toast('已新增自訂小任務！');
    };
  }

  if ($('#rewardForm')) {
    $('#rewardForm').onsubmit = e => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      data().rewards.push({
        id: 'rew-' + crypto.randomUUID().slice(0, 8),
        icon: '🎁',
        title: fd.title.trim(),
        cost: Math.max(1, Number(fd.cost) || 3)
      });
      save();
      render();
      toast('已新增集點獎勵！');
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
  if ($('#printSummary')) {
    $('#printSummary').onclick = () => window.print();
  }

  if ($('#export')) {
    $('#export').onclick = exportData;
    $('#import').onchange = importData;
  }
}

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
      updatedAt: Date.now()
    };
    save();
    $('#editSessionModal').close();
    render();
    toast('練習紀錄已更新。');
  }
};

function start(id) {
  clearInterval(interval);
  interval = null;
  const map = allTasksMap();
  const t = map[id];
  if (!t) return;
  const idx = plan().indexOf(id);
  const planned = idx !== -1 ? durations()[idx] : Math.max(2, Math.round(data().minutes / 3));
  currentTask = { id, title: t.title, child, level: data().level, planned, date: today() };
  total = currentTask.planned * 60;
  remaining = total;
  $('#exerciseTitle').textContent = t.title;
  $('#exerciseInstructions').textContent = t.steps[currentTask.level] || t.steps.easy;
  $('#exercisePrompt').textContent = '家長提示語｜' + getTaskPrompt(t);
  $('#sessionDistraction').value = 0;
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
    toast('時間到了，可以休息，再決定是否打卡。');
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

$('#finishTask').onclick = () => {
  const n = Number($('#sessionDistraction').value);
  if (!Number.isInteger(n) || n < 0 || n > 999) {
    toast('請輸入 0–999 的分心次數。');
    return;
  }
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
    level: { easy: '輕鬆起步', normal: '穩穩練習', challenge: '小小挑戰' }[currentTask.level],
    distractions: n,
    created: Date.now()
  });
  d.points = (d.points || 0) + 1;
  celebrateHero = true;
  save();
  $('#exercise').close();
  render();
  toast('打卡完成！獲得 1 朵小花 🌸');
};

$('#exercise').addEventListener('close', () => {
  clearInterval(interval);
  interval = null;
});

function exportData() {
  db.lastBackupAt = Date.now();
  save();
  const url = URL.createObjectURL(new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = '小步日常_家庭紀錄_' + today() + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  render();
  toast('已匯出兩位孩子的備份，並更新備份時間。');
}

async function importData(e) {
  const f = e.target.files[0];
  if (!f) return;
  try {
    if (f.size > 5000000) throw Error();
    const incoming = JSON.parse(await f.text());
    if (incoming.version !== 1 || !incoming.children) throw Error();
    for (const c of ['girl', 'boy']) {
      const d = incoming.children[c];
      if (!d || !Array.isArray(d.logs) || !Array.isArray(d.sessions) || typeof d.checks !== 'object' || d.checks === null) throw Error();
    }
    const merged = structuredClone(db);
    if (incoming.auth && typeof incoming.auth.familyHash === 'string') {
      merged.auth = incoming.auth;
    }
    for (const c of ['girl', 'boy']) {
      const from = incoming.children[c];
      const to = merged.children[c];
      for (const k of ['logs', 'sessions', 'redemptions', 'customTasks', 'rewards']) {
        if (!Array.isArray(from[k])) continue;
        const ids = new Set(to[k].map(x => x.id));
        to[k].push(...from[k].filter(x => x && x.id && !ids.has(x.id)));
      }
      for (const [date, state] of Object.entries(from.checks)) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(date) && ['ready', 'distracted', 'angry', 'tired'].includes(state) && !to.checks[date]) {
          to.checks[date] = state;
        }
      }
      if (!to.extra && typeof from.extra === 'string') to.extra = from.extra;
      if (Number.isFinite(from.points)) to.points = Math.max(to.points, from.points);
    }
    merged.lastBackupAt = Date.now();
    db = merged;
    save();
    render();
    toast('備份已合併，原有紀錄已保留。');
  } catch {
    toast('無法匯入，請選擇由本工具匯出的有效 JSON 備份。');
  }
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
      toast('請先於「家長檢視 → 雲端自動同步」填入 Apps Script 網址。');
      return;
    }
    pullFromCloud(false);
  };
}
updateAuthUI();
if (isLoggedIn()) {
  render();
  pullFromCloud(true);
}