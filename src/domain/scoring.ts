// 規格 2.3(a) 點數公式 —— 零外部依賴純函式
import type { Child, Redemption } from './types.ts';

export function isDeducted(r: Redemption): boolean {
  return (r.status === 'approved' || r.status === 'completed') && r.pointsDeducted === true;
}

export function computePoints(child: Pick<Child, 'initialPointsBonus' | 'sessions' | 'redemptions'>): number {
  const bonus = Number.isFinite(child.initialPointsBonus) ? child.initialPointsBonus : 0;
  const earned = (child.sessions || []).reduce((acc, s) => acc + (Number(s.earned) ?? 1), 0);
  const spent = (child.redemptions || [])
    .filter(isDeducted)
    .reduce((acc, r) => acc + (Number(r.cost) || 0), 0);
  return Math.max(0, bonus + earned - spent);
}
