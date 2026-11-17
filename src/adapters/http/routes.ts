// 規格 2.7 & 附錄 A.5：所有 API 路由與權限掛載（嚴格遵守 INV-1 與 INV-2）
import type { AppDeps } from '../../app/ports.ts';
import { RuleError } from '../../app/ports.ts';
import * as UC from '../../app/usecases.ts';
import type { SessionManager } from '../auth/sessions.ts';
import { Schemas } from './schemas.ts';

export interface RouteRegistrar {
  deps: AppDeps;
  sessions: SessionManager;
  allowedOrigin?: string;
}

// 通用 Fetch Request 路由器（同時相容 Hono app.fetch、Cloudflare Workers 與 Node 18+ 原生 HTTP）
export function createApiHandler({ deps, sessions, allowedOrigin }: RouteRegistrar) {
  return async function handleRequest(
    req: Request,
    serveStatic?: (pathname: string) => Promise<Response | null>
  ): Promise<Response> {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const method = req.method.toUpperCase();

    // 嚴格 CORS：帶 Cookie 時絕不開放 '*'（符合 2.8 安全硬條件）
    const origin = req.headers.get('origin') || '';
    const corsHeaders: Record<string, string> = {};
    if (allowedOrigin && origin === allowedOrigin) {
      corsHeaders['Access-Control-Allow-Origin'] = allowedOrigin;
      corsHeaders['Access-Control-Allow-Credentials'] = 'true';
      corsHeaders['Access-Control-Allow-Methods'] = 'GET,POST,PUT,DELETE,OPTIONS';
      corsHeaders['Access-Control-Allow-Headers'] = 'Content-Type';
    }
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const json = (data: any, status = 200, extraHeaders: Record<string, string> = {}) =>
      new Response(JSON.stringify(data), {
        status,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          ...corsHeaders,
          ...extraHeaders
        }
      });

    // 非 API 路徑交給靜態資源服務
    if (!pathname.startsWith('/api/')) {
      if (serveStatic) {
        const res = await serveStatic(pathname);
        if (res) return res;
      }
      return json({ ok: false, error: 'NOT_FOUND' }, 404);
    }

    try {
      // 1. 公開路由：POST /api/auth/login
      if (method === 'POST' && pathname === '/api/auth/login') {
        const body = Schemas.login(await req.json().catch(() => ({})));
        const valid = await UC.verifyFamilyLogin(deps, body.password);
        if (!valid) {
          return json({ ok: false, error: 'INVALID_PASSWORD', message: '家庭登入密碼不正確' }, 401);
        }
        const token = await sessions.createToken({
          authenticated: true,
          parent: false,
          iat: deps.clock.now()
        });
        const isSecure = url.protocol === 'https:';
        return json(
          { ok: true, session: { authenticated: true, parent: false } },
          200,
          { 'Set-Cookie': sessions.formatSetCookie(token, isSecure) }
        );
      }

      // 2. 全站 /api/* 強制驗證 Session（INV-2 第一道關卡）
      const cookieHeader = req.headers.get('cookie') || undefined;
      const rawToken = sessions.readTokenFromHeader(cookieHeader);
      const session = await sessions.verifyToken(rawToken);
      if (!session) {
        return json({ ok: false, error: 'UNAUTHORIZED', message: '請先輸入家庭密碼登入' }, 401);
      }

      // Session 狀態查詢
      if (method === 'GET' && pathname === '/api/auth/me') {
        return json({ ok: true, session });
      }

      // POST /api/auth/logout
      if (method === 'POST' && pathname === '/api/auth/logout') {
        return json(
          { ok: true },
          200,
          { 'Set-Cookie': sessions.formatClearCookie() }
        );
      }

      // POST /api/auth/parent（家長密碼解鎖或鎖回）
      if (method === 'POST' && pathname === '/api/auth/parent') {
        const raw = await req.json().catch(() => ({}));
        if (raw?.lock === true) {
          const token = await sessions.createToken({
            authenticated: true,
            parent: false,
            iat: deps.clock.now()
          });
          return json(
            { ok: true, session: { authenticated: true, parent: false } },
            200,
            { 'Set-Cookie': sessions.formatSetCookie(token, url.protocol === 'https:') }
          );
        }
        const body = Schemas.login(raw);
        const valid = await UC.verifyParentUnlock(deps, body.password);
        if (!valid) {
          return json({ ok: false, error: 'INVALID_PARENT_PASSWORD', message: '家長操作密碼不正確' }, 403);
        }
        const token = await sessions.createToken({
          authenticated: true,
          parent: true,
          iat: deps.clock.now()
        });
        return json(
          { ok: true, session: { authenticated: true, parent: true } },
          200,
          { 'Set-Cookie': sessions.formatSetCookie(token, url.protocol === 'https:') }
        );
      }

      // GET /api/state（取得全站狀態與今日推薦）
      if (method === 'GET' && pathname === '/api/state') {
        const state = await UC.getState(deps);
        return json({ ok: true, state, session });
      }

      // POST /api/sync（本機離線快取與伺服器欄位級合併）
      if (method === 'POST' && pathname === '/api/sync') {
        const raw = await req.json().catch(() => ({}));
        const state = await UC.syncClientState(deps, raw?.state || {});
        return json({ ok: true, state, session });
      }

      // 孩子一般互動路由（需 session，不需 parent）：心情切換、新增打卡、送出兌換申請、新增日常觀察
      const prefMatch = pathname.match(/^\/api\/children\/([a-zA-Z0-9_-]+)\/preferences$/);
      if (prefMatch && method === 'POST') {
        const raw = await req.json().catch(() => ({}));
        // 若修改 nickname 或 extra 需家長權限；單純切換今日心情或檢視分類則家庭成員可用
        if ((raw?.nickname !== undefined || raw?.extra !== undefined) && !session.parent) {
          return json({ ok: false, error: 'FORBIDDEN_PARENT_ONLY', message: '修改孩子檔案需家長權限' }, 403);
        }
        const input = Schemas.preference(raw);
        const state = await UC.setMoodAndPreference(deps, prefMatch[1], input);
        return json({ ok: true, state });
      }

      const sessionColMatch = pathname.match(/^\/api\/children\/([a-zA-Z0-9_-]+)\/sessions$/);
      if (sessionColMatch && method === 'POST') {
        const input = Schemas.sessionCreate(await req.json().catch(() => ({})));
        const state = await UC.addSession(deps, sessionColMatch[1], input);
        return json({ ok: true, state });
      }

      const redeemColMatch = pathname.match(/^\/api\/children\/([a-zA-Z0-9_-]+)\/redemptions$/);
      if (redeemColMatch && method === 'POST') {
        const input = Schemas.redemptionCreate(await req.json().catch(() => ({})));
        const state = await UC.requestRedemption(deps, redeemColMatch[1], input.rewardId);
        return json({ ok: true, state });
      }

      const logColMatch = pathname.match(/^\/api\/children\/([a-zA-Z0-9_-]+)\/logs$/);
      if (logColMatch && method === 'POST') {
        const input = Schemas.logUpsert(await req.json().catch(() => ({})));
        if (input.id && !session.parent) {
          return json({ ok: false, error: 'FORBIDDEN_PARENT_ONLY', message: '編輯既有紀錄需家長權限' }, 403);
        }
        const state = await UC.upsertLog(deps, logColMatch[1], input);
        return json({ ok: true, state });
      }

      // 3. 以下所有路由均為 🔒 家長專屬路由（INV-2 第二道關卡：requireParent）
      if (!session.parent) {
        return json(
          { ok: false, error: 'FORBIDDEN_PARENT_ONLY', message: '此操作需先解鎖家長操作密碼' },
          403
        );
      }

      // 🔒 編修/刪除打卡紀錄
      const sessionItemMatch = pathname.match(/^\/api\/children\/([a-zA-Z0-9_-]+)\/sessions\/([a-zA-Z0-9_-]+)$/);
      if (sessionItemMatch && method === 'PUT') {
        const input = Schemas.sessionUpdate(await req.json().catch(() => ({})));
        const state = await UC.updateSession(deps, sessionItemMatch[1], sessionItemMatch[2], input);
        return json({ ok: true, state });
      }
      if (sessionItemMatch && method === 'DELETE') {
        const state = await UC.deleteSession(deps, sessionItemMatch[1], sessionItemMatch[2]);
        return json({ ok: true, state });
      }

      // 🔒 核准或取消兌換申請
      const approveMatch = pathname.match(/^\/api\/children\/([a-zA-Z0-9_-]+)\/redemptions\/([a-zA-Z0-9_-]+)\/approve$/);
      if (approveMatch && method === 'POST') {
        const state = await UC.approveRedemption(deps, approveMatch[1], approveMatch[2]);
        return json({ ok: true, state });
      }

      const cancelMatch = pathname.match(/^\/api\/children\/([a-zA-Z0-9_-]+)\/redemptions\/([a-zA-Z0-9_-]+)\/cancel$/);
      if (cancelMatch && method === 'POST') {
        const state = await UC.cancelRedemption(deps, cancelMatch[1], cancelMatch[2]);
        return json({ ok: true, state });
      }

      // 🔒 編修/刪除日常觀察紀錄
      const logItemMatch = pathname.match(/^\/api\/children\/([a-zA-Z0-9_-]+)\/logs\/([a-zA-Z0-9_-]+)$/);
      if (logItemMatch && method === 'PUT') {
        const raw = await req.json().catch(() => ({}));
        const input = Schemas.logUpsert({ ...raw, id: logItemMatch[2] });
        const state = await UC.upsertLog(deps, logItemMatch[1], input);
        return json({ ok: true, state });
      }
      if (logItemMatch && method === 'DELETE') {
        const state = await UC.deleteLog(deps, logItemMatch[1], logItemMatch[2]);
        return json({ ok: true, state });
      }

      // 🔒 任務 CRUD
      if (pathname === '/api/tasks' && method === 'POST') {
        const input = Schemas.taskUpsert(await req.json().catch(() => ({})));
        const state = await UC.upsertTask(deps, input);
        return json({ ok: true, state });
      }
      const taskItemMatch = pathname.match(/^\/api\/tasks\/([a-zA-Z0-9_-]+)$/);
      if (taskItemMatch && method === 'PUT') {
        const raw = await req.json().catch(() => ({}));
        const input = Schemas.taskUpsert({ ...raw, id: taskItemMatch[1] });
        const state = await UC.upsertTask(deps, input);
        return json({ ok: true, state });
      }
      if (taskItemMatch && method === 'DELETE') {
        const state = await UC.deleteTask(deps, taskItemMatch[1]);
        return json({ ok: true, state });
      }

      // 🔒 獎勵 CRUD
      if (pathname === '/api/rewards' && method === 'POST') {
        const input = Schemas.rewardUpsert(await req.json().catch(() => ({})));
        const state = await UC.upsertReward(deps, input);
        return json({ ok: true, state });
      }
      const rewardItemMatch = pathname.match(/^\/api\/rewards\/([a-zA-Z0-9_-]+)$/);
      if (rewardItemMatch && method === 'PUT') {
        const raw = await req.json().catch(() => ({}));
        const input = Schemas.rewardUpsert({ ...raw, id: rewardItemMatch[1] });
        const state = await UC.upsertReward(deps, input);
        return json({ ok: true, state });
      }
      if (rewardItemMatch && method === 'DELETE') {
        const state = await UC.deleteReward(deps, rewardItemMatch[1]);
        return json({ ok: true, state });
      }

      // 🔒 匯出非醫療觀察摘要：GET /api/children/:c/summary?days=N
      const summaryMatch = pathname.match(/^\/api\/children\/([a-zA-Z0-9_-]+)\/summary$/);
      if (summaryMatch && method === 'GET') {
        const days = Number(url.searchParams.get('days') || 7);
        const text = await UC.getChildSummary(deps, summaryMatch[1], days);
        return json({ ok: true, summary: text });
      }

      // 🔒 修改家庭登入密碼與家長操作密碼：POST /api/auth/password
      if (pathname === '/api/auth/password' && method === 'POST') {
        const input = Schemas.passwords(await req.json().catch(() => ({})));
        await UC.updatePasswords(deps, input);
        return json({ ok: true, message: '密碼已安全雜湊並儲存於伺服器' });
      }

      return json({ ok: false, error: 'NOT_FOUND' }, 404);
    } catch (err: any) {
      if (err instanceof RuleError) {
        return json({ ok: false, error: 'RULE_ERROR', message: err.message }, err.status);
      }
      return json({ ok: false, error: 'INTERNAL_ERROR', message: err?.message || '伺服器發生錯誤' }, 500);
    }
  };
}
