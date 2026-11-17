import { computePoints } from '../domain/scoring.js';
import { canCheckIn } from '../domain/caps.js';
import { recommend } from '../domain/recommend.js';
import { DEFAULT_CHILD_CONFIGS, earnFromChoice, formatSummary, mergeState } from '../domain/rules.js';
import { RuleError } from './ports.js';

function recalculateAll(db) {
  for (const cid of Object.keys(db.children || {})) {
    const c = db.children[cid];
    if (c) c.points = computePoints(c);
  }
}

export function buildPublicState(db, clock) {
  recalculateAll(db);
  const today = clock.today();
  const yesterday = clock.yesterday();
  const recent7 = new Set(clock.recentDates(7));

  const recommendations = {};
  for (const [cid, child] of Object.entries(db.children)) {
    const mood = child.checks?.[today] || 'ready';
    const yesterdayTasks = new Set((child.sessions || []).filter(s => s.date === yesterday).map(s => s.task));
    const recentHighDistract = new Set(
      (child.sessions || []).filter(s => recent7.has(s.date) && Number(s.distractions) >= 3).map(s => s.task)
    );
    const signals = {
      childId: cid,
      mood,
      yesterdayTasks,
      recentHighDistract,
      focusCategory: child.focusCategory || 'auto',
      tasks: db.tasks || []
    };
    const cfg = child.config || DEFAULT_CHILD_CONFIGS[cid] || DEFAULT_CHILD_CONFIGS.child1;
    recommendations[cid] = recommend(cfg, signals);
  }

  return {
    version: db.version,
    updatedAt: db.updatedAt,
    today,
    tasks: db.tasks,
    rewards: db.rewards,
    children: db.children,
    recommendations
  };
}

export async function getState(deps) {
  const db = await deps.repo.load();
  return buildPublicState(db, deps.clock);
}

export async function verifyFamilyLogin(deps, password) {
  const db = await deps.repo.load();
  return deps.hasher.verify(password, db.auth.familyHash);
}

export async function verifyParentUnlock(deps, password) {
  const db = await deps.repo.load();
  return deps.hasher.verify(password, db.auth.parentHash);
}

export async function updatePasswords(deps, input) {
  const db = await deps.repo.load();
  let changed = false;
  if (input.newFamilyPassword && input.newFamilyPassword.trim().length >= 4) {
    db.auth.familyHash = await deps.hasher.hash(input.newFamilyPassword.trim());
    changed = true;
  }
  if (input.newParentPassword && input.newParentPassword.trim().length >= 4) {
    db.auth.parentHash = await deps.hasher.hash(input.newParentPassword.trim());
    changed = true;
  }
  if (!changed) throw new RuleError('請提供至少 4 碼的新密碼');
  const now = deps.clock.now();
  db.auth.updatedAt = now;
  db.updatedAt = now;
  await deps.repo.save(db);
}

export async function setMoodAndPreference(deps, childId, input) {
  const db = await deps.repo.load();
  const child = db.children[childId];
  if (!child) throw new RuleError('找不到指定序位代號', 404);
  if (input.mood) child.checks[deps.clock.today()] = input.mood;
  if (typeof input.focusCategory === 'string') child.focusCategory = input.focusCategory;
  if (typeof input.nickname === 'string' && input.nickname.trim()) {
    child.profile = { nickname: input.nickname.trim().slice(0, 20) };
  }
  if (typeof input.extra === 'string') child.extra = input.extra.slice(0, 4000);
  db.updatedAt = deps.clock.now();
  await deps.repo.save(db);
  return buildPublicState(db, deps.clock);
}

export async function addSession(deps, childId, input) {
  const db = await deps.repo.load();
  const child = db.children[childId];
  if (!child) throw new RuleError('找不到指定序位代號', 404);
  const taskObj = db.tasks.find(t => t.id === input.task);
  if (!taskObj) throw new RuleError('找不到指定任務', 404);

  const date = input.date || deps.clock.today();
  if (!canCheckIn(child, taskObj, date)) {
    throw new RuleError('此任務今日已達完成次數上限（maxDaily）', 409);
  }

  const earned = earnFromChoice(input.earnedChoice ?? 'default', taskObj.flowers);
  const now = deps.clock.now();
  child.sessions.push({
    id: deps.newId(),
    date,
    task: taskObj.id,
    taskTitle: taskObj.title,
    level: input.level || taskObj.difficulty || 'easy',
    planned: input.planned,
    elapsed: input.elapsed,
    distractions: input.distractions,
    earned,
    created: now,
    updatedAt: now
  });

  child.points = computePoints(child);
  db.updatedAt = now;
  await deps.repo.save(db);
  return buildPublicState(db, deps.clock);
}

export async function updateSession(deps, childId, sessionId, input) {
  const db = await deps.repo.load();
  const child = db.children[childId];
  if (!child) throw new RuleError('找不到指定序位代號', 404);
  const s = child.sessions.find(x => x.id === sessionId);
  if (!s) throw new RuleError('找不到打卡紀錄', 404);

  if (input.date) s.date = input.date;
  if (input.level) s.level = input.level;
  if (typeof input.planned === 'number') s.planned = input.planned;
  if (typeof input.elapsed === 'number') s.elapsed = input.elapsed;
  if (typeof input.distractions === 'number') s.distractions = input.distractions;
  if (typeof input.earned === 'number') s.earned = input.earned;
  s.updatedAt = deps.clock.now();

  child.points = computePoints(child);
  db.updatedAt = s.updatedAt;
  await deps.repo.save(db);
  return buildPublicState(db, deps.clock);
}

export async function deleteSession(deps, childId, sessionId) {
  const db = await deps.repo.load();
  const child = db.children[childId];
  if (!child) throw new RuleError('找不到指定序位代號', 404);
  child.sessions = child.sessions.filter(x => x.id !== sessionId);
  db.deletedIds = [...(db.deletedIds || []), sessionId].slice(-300);
  child.points = computePoints(child);
  db.updatedAt = deps.clock.now();
  await deps.repo.save(db);
  return buildPublicState(db, deps.clock);
}

export async function requestRedemption(deps, childId, rewardId) {
  const db = await deps.repo.load();
  const child = db.children[childId];
  if (!child) throw new RuleError('找不到指定序位代號', 404);
  const reward = db.rewards.find(r => r.id === rewardId && r.active !== false);
  if (!reward) throw new RuleError('找不到此獎勵項目', 404);

  const currentPoints = computePoints(child);
  if (currentPoints < reward.cost) {
    throw new RuleError(`可用點數不足（還差 ${reward.cost - currentPoints} 點）`, 400);
  }
  if (reward.limit > 0) {
    const used = child.redemptions.filter(r => r.rewardId === reward.id && r.status !== 'cancelled').length;
    if (used >= reward.limit) throw new RuleError('此獎勵已達兌換次數上限', 409);
  }

  const now = deps.clock.now();
  child.redemptions.unshift({
    id: deps.newId(),
    date: deps.clock.today(),
    rewardId: reward.id,
    title: reward.title,
    cost: reward.cost,
    status: 'pending',
    pointsDeducted: false,
    created: now,
    updatedAt: now
  });
  child.points = computePoints(child);
  db.updatedAt = now;
  await deps.repo.save(db);
  return buildPublicState(db, deps.clock);
}

export async function approveRedemption(deps, childId, redemptionId) {
  const db = await deps.repo.load();
  const child = db.children[childId];
  if (!child) throw new RuleError('找不到指定序位代號', 404);
  const rd = child.redemptions.find(r => r.id === redemptionId);
  if (!rd) throw new RuleError('找不到兌換紀錄', 404);
  if (rd.status === 'cancelled') throw new RuleError('已取消的兌換無法核准', 400);

  if (!rd.pointsDeducted) {
    const currentPoints = computePoints(child);
    if (currentPoints < rd.cost) {
      throw new RuleError(`孩子目前可用點數（${currentPoints}）不足以扣除 ${rd.cost} 點`, 400);
    }
    rd.pointsDeducted = true;
  }
  rd.status = 'approved';
  rd.updatedAt = deps.clock.now();
  child.points = computePoints(child);
  db.updatedAt = rd.updatedAt;
  await deps.repo.save(db);
  return buildPublicState(db, deps.clock);
}

export async function cancelRedemption(deps, childId, redemptionId) {
  const db = await deps.repo.load();
  const child = db.children[childId];
  if (!child) throw new RuleError('找不到指定序位代號', 404);
  const rd = child.redemptions.find(r => r.id === redemptionId);
  if (!rd) throw new RuleError('找不到兌換紀錄', 404);

  rd.status = 'cancelled';
  rd.pointsDeducted = false;
  rd.updatedAt = deps.clock.now();
  child.points = computePoints(child);
  db.updatedAt = rd.updatedAt;
  await deps.repo.save(db);
  return buildPublicState(db, deps.clock);
}

export async function upsertLog(deps, childId, logInput) {
  const db = await deps.repo.load();
  const child = db.children[childId];
  if (!child) throw new RuleError('找不到指定序位代號', 404);
  const now = deps.clock.now();
  if (logInput.id) {
    const idx = child.logs.findIndex(l => l.id === logInput.id);
    if (idx === -1) throw new RuleError('找不到日常觀察紀錄', 404);
    child.logs[idx] = { ...child.logs[idx], ...logInput, id: logInput.id, updatedAt: now };
  } else {
    child.logs.push({ ...logInput, id: deps.newId(), created: now, updatedAt: now });
  }
  db.updatedAt = now;
  await deps.repo.save(db);
  return buildPublicState(db, deps.clock);
}

export async function deleteLog(deps, childId, logId) {
  const db = await deps.repo.load();
  const child = db.children[childId];
  if (!child) throw new RuleError('找不到指定序位代號', 404);
  child.logs = child.logs.filter(l => l.id !== logId);
  db.deletedIds = [...(db.deletedIds || []), logId].slice(-300);
  db.updatedAt = deps.clock.now();
  await deps.repo.save(db);
  return buildPublicState(db, deps.clock);
}

export async function upsertTask(deps, input) {
  const db = await deps.repo.load();
  const now = deps.clock.now();
  if (input.id) {
    const idx = db.tasks.findIndex(t => t.id === input.id);
    if (idx === -1) throw new RuleError('找不到任務', 404);
    db.tasks[idx] = { ...db.tasks[idx], ...input, id: input.id, updatedAt: now };
  } else {
    db.tasks.unshift({ ...input, id: 'task-' + deps.newId(), updatedAt: now });
  }
  db.updatedAt = now;
  await deps.repo.save(db);
  return buildPublicState(db, deps.clock);
}

export async function deleteTask(deps, taskId) {
  const db = await deps.repo.load();
  db.tasks = db.tasks.filter(t => t.id !== taskId);
  db.deletedIds = [...(db.deletedIds || []), taskId].slice(-300);
  db.updatedAt = deps.clock.now();
  await deps.repo.save(db);
  return buildPublicState(db, deps.clock);
}

export async function upsertReward(deps, input) {
  const db = await deps.repo.load();
  const now = deps.clock.now();
  if (input.id) {
    const idx = db.rewards.findIndex(r => r.id === input.id);
    if (idx === -1) throw new RuleError('找不到獎勵', 404);
    db.rewards[idx] = { ...db.rewards[idx], ...input, id: input.id, updatedAt: now };
  } else {
    db.rewards.push({ ...input, id: 'rew-' + deps.newId(), updatedAt: now });
  }
  db.rewards.sort((a, b) => a.cost - b.cost);
  db.updatedAt = now;
  await deps.repo.save(db);
  return buildPublicState(db, deps.clock);
}

export async function deleteReward(deps, rewardId) {
  const db = await deps.repo.load();
  db.rewards = db.rewards.filter(r => r.id !== rewardId);
  db.deletedIds = [...(db.deletedIds || []), rewardId].slice(-300);
  db.updatedAt = deps.clock.now();
  await deps.repo.save(db);
  return buildPublicState(db, deps.clock);
}

export async function getChildSummary(deps, childId, days) {
  const db = await deps.repo.load();
  const child = db.children[childId];
  if (!child) throw new RuleError('找不到指定序位代號', 404);
  const safeDays = Math.min(90, Math.max(1, Number(days) || 7));
  const dates = deps.clock.recentDates(safeDays);
  return formatSummary(childId, child, dates);
}

export async function syncClientState(deps, clientState) {
  const db = await deps.repo.load();
  const merged = mergeState(db, {
    ...db,
    ...clientState,
    auth: db.auth
  });
  merged.updatedAt = deps.clock.now();
  await deps.repo.save(merged);
  return buildPublicState(merged, deps.clock);
}
