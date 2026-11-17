// 規格 2.3(b) 每日次數上限 —— 零外部依賴純函式
import type { Child, Task, TaskId } from './types.ts';

export function countTaskSessionsOnDate(
  child: Pick<Child, 'sessions'>,
  taskId: TaskId,
  date: string
): number {
  return (child.sessions || []).filter(s => s.date === date && s.task === taskId).length;
}

export function canCheckIn(
  child: Pick<Child, 'sessions'>,
  task: Pick<Task, 'id' | 'maxDaily' | 'active'> | undefined,
  date: string
): boolean {
  if (!task || task.active === false) return false;
  const maxDaily = Number.isFinite(task.maxDaily) && task.maxDaily > 0 ? task.maxDaily : 1;
  return countTaskSessionsOnDate(child, task.id, date) < maxDaily;
}
