// 規格 2.3(a) 點數公式 —— 零外部依賴純函式 (import 數 = 0)
export function isDeducted(r) {
  return (r.status === 'approved' || r.status === 'completed') && r.pointsDeducted === true;
}

export function computePoints(child) {
  const bonus = Number.isFinite(child?.initialPointsBonus) ? child.initialPointsBonus : 0;
  const earned = (child?.sessions || []).reduce((acc, s) => acc + (Number(s.earned) ?? 1), 0);
  const spent = (child?.redemptions || [])
    .filter(isDeducted)
    .reduce((acc, r) => acc + (Number(r.cost) || 0), 0);
  return Math.max(0, bonus + earned - spent);
}
