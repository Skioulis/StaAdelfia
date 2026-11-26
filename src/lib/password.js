// Password hashing with Node's built-in scrypt.
// Stored format: scrypt$N$r$p$salt$hash (salt and hash in base64).

import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const KEYLEN = 64;
// OWASP recommendation for scrypt: N=2^17, r=8, p=1 (~0.4 s per hash on a laptop).
export const DEFAULT_PARAMS = { N: 2 ** 17, r: 8, p: 1 };

const maxmem = (N, r) => 128 * N * r * 2;

export async function hashPassword(password, { N, r, p } = DEFAULT_PARAMS) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(String(password).normalize('NFKC'), salt, KEYLEN, { N, r, p, maxmem: maxmem(N, r) });
  return ['scrypt', N, r, p, salt.toString('base64'), hash.toString('base64')].join('$');
}

/** Parses a stored hash; returns null if it is malformed. */
function parse(stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
  const [N, r, p] = parts.slice(1, 4).map(Number);
  if (![N, r, p].every(Number.isInteger) || N < 2 || (N & (N - 1)) !== 0 || N > 2 ** 20 || r < 1 || r > 32 || p < 1 || p > 16) {
    return null;
  }
  const salt = Buffer.from(parts[4], 'base64');
  const hash = Buffer.from(parts[5], 'base64');
  if (salt.length < 8 || hash.length < 16) return null;
  return { N, r, p, salt, hash };
}

export const isValidHash = (stored) => parse(stored) !== null;

/** Checks a password against a stored hash in constant time. False for a malformed hash. */
export async function verifyPassword(password, stored) {
  const h = parse(stored);
  if (!h) return false;
  const actual = await scrypt(String(password).normalize('NFKC'), h.salt, h.hash.length, {
    N: h.N, r: h.r, p: h.p, maxmem: maxmem(h.N, h.r),
  });
  return crypto.timingSafeEqual(actual, h.hash);
}
