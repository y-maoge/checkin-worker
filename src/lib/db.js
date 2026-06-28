// D1 helpers — accounts/logs/sessions
import { sha256Hex } from './crypto.js';

export function nowMs() { return Date.now(); }
export function nowCN() {
  return new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
}

// ---------- accounts ----------

export async function listAccounts(db, provider, { onlyEnabled = false } = {}) {
  const where = onlyEnabled
    ? 'WHERE provider = ? AND enabled = 1'
    : 'WHERE provider = ?';
  const { results } = await db.prepare(
    `SELECT id, provider, alias, enabled, data, data_hash, last_run_at, last_status, created_at, updated_at
       FROM accounts ${where} ORDER BY created_at ASC`
  ).bind(provider).all();
  return results.map(r => ({ ...r, enabled: !!r.enabled, data: JSON.parse(r.data) }));
}

export async function getAccount(db, id) {
  const r = await db.prepare(`SELECT * FROM accounts WHERE id = ?`).bind(id).first();
  if (!r) return null;
  return { ...r, enabled: !!r.enabled, data: JSON.parse(r.data) };
}

/**
 * 写入或更新账号(基于 SHA-256(data) 去重 — 内容未变则跳过 UPDATE,只刷新 updated_at)
 * 返回 { changed: boolean, created: boolean }
 */
export async function upsertAccount(db, { id, provider, alias, data, enabled = true }) {
  const json = JSON.stringify(data);
  const hash = await sha256Hex(json);
  const now = nowMs();
  const existing = await db.prepare(`SELECT data_hash FROM accounts WHERE id = ?`).bind(id).first();

  if (!existing) {
    await db.prepare(
      `INSERT INTO accounts (id, provider, alias, enabled, data, data_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, provider, alias || null, enabled ? 1 : 0, json, hash, now, now).run();
    return { changed: true, created: true };
  }
  if (existing.data_hash === hash) {
    // 内容相同,不写
    return { changed: false, created: false };
  }
  await db.prepare(
    `UPDATE accounts SET data = ?, data_hash = ?, updated_at = ? WHERE id = ?`
  ).bind(json, hash, now, id).run();
  return { changed: true, created: false };
}

export async function setAccountEnabled(db, id, enabled) {
  await db.prepare(`UPDATE accounts SET enabled = ?, updated_at = ? WHERE id = ?`)
    .bind(enabled ? 1 : 0, nowMs(), id).run();
}

export async function setAccountAlias(db, id, alias) {
  await db.prepare(`UPDATE accounts SET alias = ?, updated_at = ? WHERE id = ?`)
    .bind(alias || null, nowMs(), id).run();
}

export async function deleteAccount(db, id) {
  await db.prepare(`DELETE FROM accounts WHERE id = ?`).bind(id).run();
}

export async function updateRunStatus(db, id, status) {
  await db.prepare(
    `UPDATE accounts SET last_run_at = ?, last_status = ?, updated_at = ? WHERE id = ?`
  ).bind(nowCN(), status, nowMs(), id).run();
}

// ---------- logs ----------

export async function appendLog(db, provider, message, level = 'info') {
  await db.prepare(
    `INSERT INTO logs (provider, level, message, created_at) VALUES (?, ?, ?, ?)`
  ).bind(provider, level, message, nowCN()).run();
}

export async function appendLogs(db, provider, items) {
  if (!items.length) return;
  const now = nowCN();
  const stmts = items.map(it => db.prepare(
    `INSERT INTO logs (provider, level, message, created_at) VALUES (?, ?, ?, ?)`
  ).bind(provider, it.level || 'info', it.message, it.createdAt || now));
  await db.batch(stmts);
}

export async function listLogs(db, provider, limit = 100) {
  const sql = provider
    ? `SELECT * FROM logs WHERE provider = ? ORDER BY created_at DESC LIMIT ?`
    : `SELECT * FROM logs ORDER BY created_at DESC LIMIT ?`;
  const stmt = provider
    ? db.prepare(sql).bind(provider, limit)
    : db.prepare(sql).bind(limit);
  const { results } = await stmt.all();
  return results;
}

export async function clearLogs(db, provider) {
  if (provider) {
    await db.prepare(`DELETE FROM logs WHERE provider = ?`).bind(provider).run();
  } else {
    await db.prepare(`DELETE FROM logs`).run();
  }
}

export async function pruneLogs(db, keepDays = 30) {
  const cutoff = nowMs() - keepDays * 86400_000;
  await db.prepare(`DELETE FROM logs WHERE created_at < ?`).bind(cutoff).run();
}
