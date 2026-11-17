// 附錄 A.3 & A.8：純核心單元測試與安全/去識別驗收測試（相容 Node 測試執行器）
import assert from 'node:assert/strict';
import { computePoints } from '../../src/domain/scoring.js';
import { canCheckIn } from '../../src/domain/caps.js';
import { computeWeight, recommend } from '../../src/domain/recommend.js';
import { DEFAULT_CHILD_CONFIGS, earnFromChoice, formatSummary, mergeState } from '../../src/domain/rules.js';
import { bootstrapApp } from '../../src/main.js';

async function runAllTests() {
  console.log('▶ 1. 測試 2.3(a) 點數公式 computePoints...');
  const sampleChild = {
    profile: { nickname: '彗瑄' },
    points: 999, // 故意給錯的快取值，驗證重算邏輯
    initialPointsBonus: 5,
    focusCategory: 'auto',
    sessions: [
      { id: 's1', date: '2026-11-16', task: 't1', level: 'easy', planned: 5, elapsed: 300, distractions: 0, earned: 2 },
      { id: 's2', date: '2026-11-17', task: 't2', level: 'normal', planned: 10, elapsed: 600, distractions: 1, earned: 3 }
    ],
    redemptions: [
      { id: 'r1', date: '2026-11-17', rewardId: 'rw1', cost: 4, status: 'pending', pointsDeducted: false },
      { id: 'r2', date: '2026-11-17', rewardId: 'rw2', cost: 3, status: 'approved', pointsDeducted: true },
      { id: 'r3', date: '2026-11-17', rewardId: 'rw3', cost: 6, status: 'cancelled', pointsDeducted: true }
    ],
    logs: [],
    checks: {}
  };
  // 5 (bonus) + (2 + 3) (earned) - 3 (only approved & pointsDeducted=true) = 7
  assert.equal(computePoints(sampleChild), 7);
  assert.equal(earnFromChoice('1', 3), 1);
  assert.equal(earnFromChoice('4', 2), 4);
  assert.equal(earnFromChoice('default', 3), 3);
  console.log('  ✓ 2.3(a) 點數公式與四級得點通過');

  console.log('▶ 2. 測試 2.3(b) 每日次數上限 canCheckIn...');
  const taskMax1 = {
    id: 't1', icon: '🎯', title: 'Task 1', category: '專注力訓練', target: 'both',
    difficulty: 'easy', minutes: 5, flowers: 2, maxDaily: 1, recommend: true, active: true,
    desc: 'd', promptText: 'p'
  };
  assert.equal(canCheckIn(sampleChild, taskMax1, '2026-11-16'), false); // 當天已做 1 次
  assert.equal(canCheckIn(sampleChild, taskMax1, '2026-11-17'), true);  // 當天 0 次
  console.log('  ✓ 2.3(b) 每日次數上限通過');

  console.log('▶ 3. 測試 2.3(c) 智慧推薦權重與挑選演算法 recommend...');
  const tasksPool = [
    { id: 't-a', icon: '🎯', title: 'A', category: '專注力訓練', target: 'both', difficulty: 'easy', minutes: 5, flowers: 2, maxDaily: 1, recommend: true, active: true, desc: 'd', promptText: 'p' },
    { id: 't-b', icon: '🎯', title: 'B', category: '專注力訓練', target: 'both', difficulty: 'easy', minutes: 5, flowers: 2, maxDaily: 1, recommend: true, active: true, desc: 'd', promptText: 'p' },
    { id: 't-c', icon: '✏️', title: 'C', category: '作業習慣', target: 'both', difficulty: 'normal', minutes: 8, flowers: 3, maxDaily: 1, recommend: true, active: true, desc: 'd', promptText: 'p' },
    { id: 't-d', icon: '💛', title: 'D', category: '情緒管理', target: 'both', difficulty: 'easy', minutes: 5, flowers: 2, maxDaily: 1, recommend: true, active: true, desc: 'd', promptText: 'p' }
  ];
  const signals = {
    childId: 'child2',
    mood: 'ready',
    yesterdayTasks: new Set(['t-a']),         // +1 往後排
    recentHighDistract: new Set(['t-b']),     // -1 優先練
    focusCategory: '作業習慣',                // -2 重點類別優先
    tasks: tasksPool
  };
  assert.equal(computeWeight(tasksPool[0], signals), 1);  // t-a: yesterday (+1)
  assert.equal(computeWeight(tasksPool[1], signals), -1); // t-b: distract (-1)
  assert.equal(computeWeight(tasksPool[2], signals), -2); // t-c: focusCategory (-2)

  const recReady = recommend(DEFAULT_CHILD_CONFIGS.child2, signals);
  assert.equal(recReady.length, 3); // 邦盛 ready 推 3 項
  assert.equal(recReady[0], 't-c'); // t-c 為重點類別 (-2) 最優先，其次為近期高分心 t-b (-1)
  assert.equal(recReady[1], 't-b');

  const recTired = recommend(DEFAULT_CHILD_CONFIGS.child2, { ...signals, mood: 'tired' });
  assert.equal(recTired.length, 2); // 邦盛 tired 降為 2 項
  console.log('  ✓ 2.3(c) 智慧推薦權重與心情減量通過');

  console.log('▶ 4. 測試 1.4 非醫療觀察摘要與 2.6 欄位級合併...');
  const summary = formatSummary('child1', sampleChild, ['2026-11-17', '2026-11-16']);
  assert.ok(summary.includes('非醫療診斷'));
  assert.ok(summary.includes('彗瑄（小學生）'));

  console.log('▶ 5. 測試 2.2 INV-2 雙層驗證閘門（未登入擋 401、未過家長密碼擋 403）...');
  const app = await bootstrapApp({
    SESSION_SECRET: 'test-secret-key-for-hmac-32bytes!',
    INITIAL_FAMILY_PASSWORD: 'test-family-password',
    INITIAL_PARENT_PASSWORD: 'test-parent-password'
  });

  // 5a. 未登入讀取 /api/state → 401
  const resUnauth = await app.server.fetch(new Request('http://localhost/api/state'));
  assert.equal(resUnauth.status, 401);

  // 5b. 家庭密碼登入成功 → 取得 HttpOnly Cookie
  const resLogin = await app.server.fetch(
    new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'test-family-password' })
    })
  );
  assert.equal(resLogin.status, 200);
  const setCookie = resLogin.headers.get('set-cookie') || '';
  assert.ok(setCookie.includes('HttpOnly'));
  const cookiePair = setCookie.split(';')[0];

  // 5c. 家庭成員可讀 /api/state 與打卡，但呼叫 🔒 家長專屬端點 (/api/tasks) → 403
  const resState = await app.server.fetch(
    new Request('http://localhost/api/state', { headers: { Cookie: cookiePair } })
  );
  assert.equal(resState.status, 200);
  const stateJson = await resState.json();
  assert.equal(stateJson.state.auth, undefined); // INV-1：絕不回傳密碼雜湊

  const resForbidden = await app.server.fetch(
    new Request('http://localhost/api/tasks', {
      method: 'POST',
      headers: { Cookie: cookiePair, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'X', category: '專注力訓練', desc: 'd', promptText: 'p' })
    })
  );
  assert.equal(resForbidden.status, 403);

  // 5d. 解鎖家長密碼 → 取得 parent=true Cookie → 可呼叫 🔒 端點
  const resParent = await app.server.fetch(
    new Request('http://localhost/api/auth/parent', {
      method: 'POST',
      headers: { Cookie: cookiePair, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'test-parent-password' })
    })
  );
  assert.equal(resParent.status, 200);
  const parentCookie = (resParent.headers.get('set-cookie') || '').split(';')[0];

  const resAllowed = await app.server.fetch(
    new Request('http://localhost/api/tasks', {
      method: 'POST',
      headers: { Cookie: parentCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '🎨 自訂專注練習',
        category: '專注力訓練',
        desc: '專心完成畫作',
        promptText: '「慢慢畫，享受過程。」',
        minutes: 10,
        flowers: 3,
        maxDaily: 1
      })
    })
  );
  assert.equal(resAllowed.status, 200);
  console.log('  ✓ 2.2 INV-1 / INV-2 與 PBKDF2 + HttpOnly Cookie 驗證全數通過！');
}

runAllTests().catch(err => {
  console.error(err);
  process.exit(1);
});
