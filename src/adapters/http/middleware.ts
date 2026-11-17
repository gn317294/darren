// 附錄 A.5 INV-2：未經驗證不得碰資料（requireSession / requireParent 閘門）
import type { SessionManager } from '../auth/sessions.ts';
import type { SessionPayload } from '../../app/ports.ts';

export interface HttpContextLike {
  req: {
    header(name: string): string | undefined;
    method: string;
    path: string;
  };
  set(key: string, val: any): void;
  get(key: string): any;
  json(data: any, status?: number): Response;
}

export function createAuthMiddleware(sessions: SessionManager) {
  const requireSession = async (c: HttpContextLike, next: () => Promise<void>) => {
    const cookieHeader = c.req.header('cookie') || c.req.header('Cookie');
    const token = sessions.readTokenFromHeader(cookieHeader);
    const payload = await sessions.verifyToken(token);
    if (!payload) {
      return c.json({ ok: false, error: 'UNAUTHORIZED', message: '請先輸入家庭密碼登入' }, 401);
    }
    c.set('session', payload);
    await next();
  };

  const requireParent = async (c: HttpContextLike, next: () => Promise<void>) => {
    const session = c.get('session') as SessionPayload | undefined;
    if (!session || !session.parent) {
      return c.json({ ok: false, error: 'FORBIDDEN_PARENT_ONLY', message: '此操作需先解鎖家長操作密碼' }, 403);
    }
    await next();
  };

  return { requireSession, requireParent };
}
