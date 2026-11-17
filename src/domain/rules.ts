// 規格 2.3 & 2.6 純規則函式（四級得點、欄位級合併、非醫療觀察摘要）—— 零外部依賴
import type { Child, ChildConfig, DB } from './types.ts';
import { computePoints } from './scoring.ts';

export type EarnChoice = '1' | '2' | '3' | '4' | 'default';

export function earnFromChoice(choice: EarnChoice | number, taskDefaultFlowers: number): number {
  if (typeof choice === 'number' && Number.isFinite(choice)) {
    return Math.max(1, Math.min(10, Math.round(choice)));
  }
  if (choice === '1') return 1; // 願意嘗試並開始執行
  if (choice === '2') return 2; // 完成簡單任務
  if (choice === '3') return 3; // 完成需要持續努力的任務
  if (choice === '4') return 4; // 完成較高難度或延長任務
  return Math.max(1, Number(taskDefaultFlowers) || 1);
}

export const DEFAULT_CHILD_CONFIGS: Record<string, ChildConfig> = {
  // 彗瑄：每日 2 項；疲倦/生氣日維持溫和放鬆，不影響睡眠
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
  // 邦盛：平常 3 項，疲倦/生氣日降為 2 項
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

function mergeById<T extends { id: string; updatedAt?: number; created?: number }>(
  a: T[],
  b: T[],
  delSet: Set<string>
): T[] {
  const map = new Map<string, T>();
  for (const item of a || []) {
    if (item && item.id && !delSet.has(item.id)) map.set(item.id, item);
  }
  for (const item of b || []) {
    if (!item || !item.id || delSet.has(item.id)) continue;
    const prev = map.get(item.id);
    const tNew = item.updatedAt ?? item.created ?? 0;
    const tOld = prev ? (prev.updatedAt ?? prev.created ?? 0) : -1;
    if (!prev || tNew >= tOld) map.set(item.id, item);
  }
  return Array.from(map.values());
}

// 規格 2.6 欄位級合併（陣列依 id 聯集，純量依 updatedAt 取較新，並重算雙孩點數）
export function mergeState(local: DB, incoming: DB): DB {
  const delSet = new Set<string>([
    ...(local.deletedIds || []),
    ...(incoming.deletedIds || [])
  ]);
  const incomingNewer = (incoming.updatedAt || 0) >= (local.updatedAt || 0);
  const authNewer = (incoming.auth?.updatedAt || 0) > (local.auth?.updatedAt || 0);

  const mergedChildren: Record<string, Child> = {};
  const childIds = new Set([
    ...Object.keys(local.children || {}),
    ...Object.keys(incoming.children || {})
  ]);

  for (const cid of childIds) {
    const cLocal = local.children?.[cid];
    const cInc = incoming.children?.[cid];
    if (!cLocal && cInc) {
      const copy = structuredClone(cInc);
      copy.points = computePoints(copy);
      mergedChildren[cid] = copy;
      continue;
    }
    if (cLocal && !cInc) {
      const copy = structuredClone(cLocal);
      copy.points = computePoints(copy);
      mergedChildren[cid] = copy;
      continue;
    }
    const base = structuredClone(incomingNewer ? cInc! : cLocal!);
    base.sessions = mergeById(cLocal!.sessions, cInc!.sessions, delSet);
    base.redemptions = mergeById(cLocal!.redemptions, cInc!.redemptions, delSet);
    base.logs = mergeById(cLocal!.logs, cInc!.logs, delSet);
    base.checks = { ...(cLocal!.checks || {}), ...(cInc!.checks || {}) };
    base.points = computePoints(base);
    mergedChildren[cid] = base;
  }

  return {
    version: 1,
    updatedAt: Math.max(local.updatedAt || 0, incoming.updatedAt || 0),
    deletedIds: Array.from(delSet).slice(-300),
    auth: authNewer ? { ...incoming.auth } : { ...local.auth },
    tasks: mergeById(local.tasks, incoming.tasks, delSet),
    rewards: mergeById(local.rewards, incoming.rewards, delSet),
    children: mergedChildren
  };
}

// 規格 1.4 & 2.7 非醫療觀察摘要生成（純文字，不依賴年齡/年級/性別）
export function formatSummary(
  childId: string,
  child: Child,
  dates: string[]
): string {
  const nickname = child.profile?.nickname || (childId === 'child1' ? '彗瑄' : '邦盛');
  const logs = (child.logs || [])
    .filter(l => dates.includes(l.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  const sessions = (child.sessions || []).filter(s => dates.includes(s.date));
  const activeDays = new Set(sessions.map(s => s.date)).size;
  const points = computePoints(child);

  const avg = (key: 'sleepHours' | 'distractions' | 'reminders' | 'calmMinutes') => {
    const vals = logs
      .map(l => l[key])
      .filter(v => v !== '' && v !== undefined && v !== null)
      .map(Number)
      .filter(Number.isFinite);
    if (!vals.length) return '尚無紀錄';
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    return `${mean.toFixed(1)}（共 ${vals.length} 筆）`;
  };

  const notes = logs
    .filter(l => l.note && l.note.trim())
    .map(l => `- [${l.date}${l.context ? ' ' + l.context : ''}] ${l.note!.trim()}`);

  const startDate = dates[dates.length - 1] || '';
  const endDate = dates[0] || '';

  return [
    `【家庭習慣練習｜日常觀察摘要（近 ${dates.length} 天）】`,
    `對象代號：${nickname}（小學生）`,
    `統計區間：${startDate} ～ ${endDate}`,
    `免責聲明：本摘要僅供家庭陪伴與行為觀察回顧，非醫療診斷或評估報告。`,
    ``,
    `一、練習參與與點數`,
    `- 參與天數：${activeDays} / ${dates.length} 天（共完成 ${sessions.length} 次練習）`,
    `- 目前可用點數：${points} 點`,
    ``,
    `二、專注與情緒觀察`,
    `- 分心次數平均：${avg('distractions')}`,
    `- 家長提醒平均：${avg('reminders')}`,
    `- 情緒平復時間（分）：${avg('calmMinutes')}`,
    ``,
    `三、睡眠與精神觀察`,
    `- 估計睡眠時數（時）：${avg('sleepHours')}`,
    ``,
    `四、家長觀察筆記（共 ${notes.length} 筆）`,
    notes.length ? notes.join('\n') : '（此區間尚無文字筆記）'
  ].join('\n');
}
