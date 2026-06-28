// D1-backed session (替代原内存 Map,Worker 多实例间共享)

const TTL_MS = 86400_000; // 24h

export async function createSession(db) {
  const token = crypto.randomUUID();
  const expires = Date.now() + TTL_MS;
  await db.prepare(`INSERT INTO sessions (token, expires_at) VALUES (?, ?)`)
    .bind(token, expires).run();
  return token;
}

export async function isValidSession(db, token) {
  if (!token) return false;
  const r = await db.prepare(`SELECT expires_at FROM sessions WHERE token = ?`).bind(token).first();
  if (!r) return false;
  if (r.expires_at < Date.now()) {
    await db.prepare(`DELETE FROM sessions WHERE token = ?`).bind(token).run();
    return false;
  }
  return true;
}

export function readCookieToken(req) {
  const cookie = req.header('Cookie') || req.header('cookie') || '';
  const m = cookie.match(/(?:^|;\s*)session=([^;]+)/);
  return m ? m[1] : null;
}

export async function pruneExpiredSessions(db) {
  await db.prepare(`DELETE FROM sessions WHERE expires_at < ?`).bind(Date.now()).run();
}
