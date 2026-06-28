// 通用 HTTP 工具

export function parseBody(text) {
  try { return JSON.parse(text || '{}'); } catch { return {}; }
}

export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export function maskAccount(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (s.includes('@')) {
    const [left, ...rest] = s.split('@');
    const right = rest.join('@');
    if (left.length <= 2) return `${left[0] || '*'}***@${right}`;
    if (left.length <= 4) return `${left.slice(0, 2)}**${left.slice(-1)}@${right}`;
    // 保留首2+尾1,避免同前缀账号 mask 后撞名(如 9912253 / 9912254)
    return `${left.slice(0, 2)}***${left.slice(-1)}@${right}`;
  }
  if (s.length <= 4) return s[0] + '***';
  return s.slice(0, 2) + '***' + s.slice(-2);
}
