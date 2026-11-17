import { createApiHandler } from './routes.js';

export function createServer(registrar, serveStatic) {
  const handler = createApiHandler(registrar);
  return {
    fetch(req) {
      return handler(req, serveStatic);
    }
  };
}
