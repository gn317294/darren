// 規格 2.3(b) 每日次數上限 —— 零外部依賴純函式 (import 數 = 0)
export function countTaskSessionsOnDate(child, taskId, date) {
  return (child?.sessions || []).filter(s => s.date === date && s.task === taskId).length;
}

export function canCheckIn(child, task, date) {
  if (!task || task.active === false) return false;
  const maxDaily = Number.isFinite(task.maxDaily) && task.maxDaily > 0 ? task.maxDaily : 1;
  return countTaskSessionsOnDate(child, task.id, date) < maxDaily;
}
