// 規格 2.3(c) 智慧推薦演算法（規則式，完整版）—— 零外部依賴純函式
import type { ChildConfig, RecommendSignals, Task, TaskId } from './types.ts';

export function computeWeight(task: Task, signals: RecommendSignals): number {
  const focusWeight =
    signals.focusCategory !== 'auto' && task.category === signals.focusCategory ? -2 : 0;
  const distractWeight = signals.recentHighDistract.has(task.id) ? -1 : 0;
  const yesterdayWeight = signals.yesterdayTasks.has(task.id) ? 1 : 0;
  return focusWeight + distractWeight + yesterdayWeight;
}

export function recommend(config: ChildConfig, signals: RecommendSignals): TaskId[] {
  const pool = (signals.tasks || []).filter(
    t =>
      t &&
      t.active !== false &&
      t.recommend !== false &&
      (t.target === 'both' || t.target === signals.childId)
  );
  const poolById = new Map<TaskId, Task>(pool.map(t => [t.id, t]));

  const pickFrom = (preferredIds: TaskId[], fallbackCategory: string): Task[] => {
    const candidates = preferredIds
      .map(id => poolById.get(id))
      .filter((t): t is Task => Boolean(t));
    const categoryPool = pool.filter(
      t => !fallbackCategory || t.category === fallbackCategory
    );
    const seen = new Set<TaskId>();
    const merged: Task[] = [];
    for (const item of [...candidates, ...categoryPool, ...pool]) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        merged.push(item);
      }
    }
    return merged.sort((a, b) => computeWeight(a, signals) - computeWeight(b, signals));
  };

  const chosen: TaskId[] = [];
  const addUnique = (list: Task[]) => {
    for (const t of list) {
      if (t && !chosen.includes(t.id)) {
        chosen.push(t.id);
        return;
      }
    }
  };

  const mood = signals.mood || 'ready';
  const slots = config.moodPlan[mood] || config.moodPlan.ready || [];
  const dailyN = config.dailyCount[mood] ?? 2;

  for (const slot of slots) {
    const fallback =
      slot.fallbackCategory === '$focus'
        ? signals.focusCategory !== 'auto'
          ? signals.focusCategory
          : '情緒管理'
        : slot.fallbackCategory;
    addUnique(pickFrom(slot.preferredIds, fallback));
  }

  // 若槽位不足 N 項，從整個 pool 依權重補齊
  if (chosen.length < dailyN) {
    const rest = pickFrom([], '');
    while (chosen.length < dailyN) {
      const before = chosen.length;
      addUnique(rest);
      if (chosen.length === before) break;
    }
  }

  return chosen.slice(0, dailyN);
}
