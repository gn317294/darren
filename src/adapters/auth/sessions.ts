import { webcrypto } from 'node:crypto';
const _crypto = globalThis.crypto || webcrypto;
// 規格 2.2 INV-2 & 2.6：HMAC-SHA256 簽章之 httpOnly、SameSite=Lax session cookie 管理
import type { SessionPayload } from '../../app/ports.ts';

const COOKIE_NAME = 'fhg_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 天

function base64UrlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(b64url: string): string {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const binary = atob(b64 + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function hmacSign(data: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await _crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await _crypto.subtle.sign('HMAC', key, enc.encode(data));
  const arr = new Uint8Array(sig);
  return Array.from(arr)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export class SessionManager {
  private readonly secret: string;
  constructor(secret: string) {
    this.secret = secret;
  }

  async createToken(payload: SessionPayload): Promise<string> {
    const body = base64UrlEncode(JSON.stringify(payload));
    const sig = await hmacSign(body, this.secret);
    return `${body}.${sig}`;
  }

  async verifyToken(token: string | undefined): Promise<SessionPayload | null> {
    if (!token || !token.includes('.')) return null;
    const [body, sig] = token.split('.');
    if (!body || !sig) return null;
    const expected = await hmacSign(body, this.secret);
    if (sig.length !== expected.length) return null;
    let diff = 0;
    for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
    if (diff !== 0) return null;
    try {
      const parsed = JSON.parse(base64UrlDecode(body)) as SessionPayload;
      if (!parsed || parsed.authenticated !== true) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  readTokenFromHeader(cookieHeader: string | undefined): string | undefined {
    if (!cookieHeader) return undefined;
    for (const part of cookieHeader.split(';')) {
      const [k, ...v] = part.trim().split('=');
      if (k === COOKIE_NAME) return v.join('=');
    }
    return undefined;
  }

  formatSetCookie(token: string, isSecure = false): string {
    const secureFlag = isSecure ? '; Secure' : '';
    return `${COOKIE_NAME}=${token}; HttpOnly; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax${secureFlag}`;
  }

  formatClearCookie(): string {
    return `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`;
  }
}
