// 附錄 A.5 Hono 伺服器工廠（同時提供 Hono 路由掛載與標準 Web Fetch 介面）
import type { RouteRegistrar } from './routes.ts';
import { createApiHandler } from './routes.ts';

// 若部署於 Cloudflare Workers / Hono 環境，可直接將 Hono 實例與 createApiHandler 對接
export function createServer(
  registrar: RouteRegistrar,
  serveStatic?: (pathname: string) => Promise<Response | null>
) {
  const handler = createApiHandler(registrar);
  return {
    fetch(req: Request): Promise<Response> {
      return handler(req, serveStatic);
    }
  };
}
