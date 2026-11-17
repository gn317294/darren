import { webcrypto } from 'node:crypto';
const _crypto = globalThis.crypto || webcrypto;
// 規格 2.5：使用標準 Web Crypto API PBKDF2-HMAC-SHA256 密碼學雜湊（Node 18+ 與 Cloudflare Workers 原生支援）
import type { Hasher } from '../../app/ports.ts';

const ITERATIONS = 100_000;
const KEY_LEN_BYTES = 32;

function toHex(buf: ArrayBuffer | Uint8Array): string {
  const arr = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(arr)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export class Pbkdf2Hasher implements Hasher {
  async hash(plain: string): Promise<string> {
    const salt = new Uint8Array(16);
    _crypto.getRandomValues(salt);
    const derived = await this.derive(plain, salt, ITERATIONS);
    return `pbkdf2$${ITERATIONS}$${toHex(salt)}$${toHex(derived)}`;
  }

  async verify(plain: string, storedHash: string): Promise<boolean> {
    if (!storedHash || !storedHash.startsWith('pbkdf2$')) return false;
    const parts = storedHash.split('$');
    if (parts.length !== 4) return false;
    const iterations = Number(parts[1]);
    const salt = fromHex(parts[2]);
    const expectedHex = parts[3];
    if (!Number.isFinite(iterations) || iterations < 1000) return false;
    const derived = await this.derive(plain, salt, iterations);
    return timingSafeEqualHex(toHex(derived), expectedHex);
  }

  private async derive(plain: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
    const enc = new TextEncoder();
    const baseKey = await _crypto.subtle.importKey(
      'raw',
      enc.encode(plain),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );
    return _crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt,
        iterations,
        hash: 'SHA-256'
      },
      baseKey,
      KEY_LEN_BYTES * 8
    );
  }
}
