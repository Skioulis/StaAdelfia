import crypto from 'node:crypto';
import { SESSION_TTL_MS, touchSession } from '../db/sessions.js';
import { verifyPassword } from './password.js';

export const COOKIE_NAME = 'gsa_admin';

export function cookieOptions(config) {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    // Secure in production (served over HTTPS behind nginx). In development the app
    // runs on plain http, often opened from a phone by LAN IP, where a Secure cookie would be dropped.
    secure: config.production,
    maxAge: SESSION_TTL_MS / 1000,
  };
}

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest();

/** Checks username and password. Always runs scrypt, so timing doesn't reveal a wrong username. */
export async function checkCredentials(config, username, password) {
  if (!config.adminPasswordHash) return false; // login disabled until a hash is configured
  const userOk = crypto.timingSafeEqual(sha256(username), sha256(config.adminUsername));
  const passOk = await verifyPassword(password, config.adminPasswordHash);
  return userOk && passOk;
}

/**
 * onRequest hook for /api/admin/*: 401 unless the cookie holds a live session.
 * A valid session is extended by 12 h, and the cookie is re-sent with the new lifetime.
 */
export function requireAdmin(app) {
  return async function (request, reply) {
    const id = request.cookies[COOKIE_NAME];
    if (!touchSession(app.db, id)) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    reply.setCookie(COOKIE_NAME, id, cookieOptions(app.config));
  };
}
