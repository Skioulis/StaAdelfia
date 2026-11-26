// Server-side admin sessions. The id is the only thing in the cookie.

import crypto from 'node:crypto';

export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 h, extended on use

export function createSession(db, now = Date.now()) {
  const id = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO session (id, expires_at) VALUES (?, ?)').run(id, now + SESSION_TTL_MS);
  return id;
}

/** Returns true and extends the expiry if the session exists and has not expired. */
export function touchSession(db, id, now = Date.now()) {
  if (!id) return false;
  const res = db.prepare('UPDATE session SET expires_at = ? WHERE id = ? AND expires_at > ?')
    .run(now + SESSION_TTL_MS, id, now);
  return res.changes === 1;
}

export function deleteSession(db, id) {
  if (id) db.prepare('DELETE FROM session WHERE id = ?').run(id);
}

/** Deletes expired sessions; returns how many were removed. */
export function deleteExpiredSessions(db, now = Date.now()) {
  return db.prepare('DELETE FROM session WHERE expires_at <= ?').run(now).changes;
}
