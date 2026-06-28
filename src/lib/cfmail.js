// Cloudflare Email Workers - 接收验证码邮件
// 替代 evapmail，用户设置自己的域名 + CF Email Routing catch-all → Worker

/**
 * 生成随机收件地址前缀
 */
export function randomMailPrefix() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `ck${s}`;
}

/**
 * 处理收到的邮件，提取验证码并存入 D1
 * @param {EmailMessage} message - CF Email Workers message object
 * @param {D1Database} db
 */
export async function handleIncomingEmail(message, db) {
  const to = (message.to || '').toLowerCase();
  const subject = message.headers.get('subject') || '';
  const from = message.from || '';

  // 读取邮件正文
  let body = '';
  try {
    const reader = message.raw.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      body += decoder.decode(value, { stream: true });
    }
  } catch (_) {}

  // 提取验证码 (4-6位数字)
  const code = extractCode(subject, body);
  if (!code) return; // 非验证码邮件忽略

  // 存入 D1
  await db.prepare(
    `INSERT OR REPLACE INTO email_codes (address, code, subject, created_at) VALUES (?, ?, ?, ?)`
  ).bind(to, code, subject.slice(0, 200), Date.now()).run();
}

/**
 * 从邮件主题和正文中提取验证码
 */
function extractCode(subject, body) {
  const text = subject + ' ' + body;
  // 匹配常见验证码格式
  const patterns = [
    /(?:code|验证码|verification)\s*(?:is|:|\s)\s*(\d{4,6})/i,
    /(\d{6})\s*(?:is your|为您的|是您的)/i,
    /(?:^|\s)(\d{6})(?:\s|$|\.)/m,
    /(\d{4,6})/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[1];
  }
  return null;
}

/**
 * 从 D1 查询验证码（轮询）
 * @param {D1Database} db
 * @param {string} address - 收件地址
 * @param {number} maxRetries
 * @param {number} intervalMs
 * @returns {string|null}
 */
export async function waitForCodeFromDB(db, address, maxRetries = 12, intervalMs = 5000) {
  const addr = address.toLowerCase();
  for (let i = 0; i < maxRetries; i++) {
    const row = await db.prepare(
      `SELECT code FROM email_codes WHERE address = ? AND created_at > ?`
    ).bind(addr, Date.now() - 120000).first(); // 2分钟内的验证码
    if (row && row.code) {
      // 使用后删除
      await db.prepare(`DELETE FROM email_codes WHERE address = ?`).bind(addr).run();
      return row.code;
    }
    if (i < maxRetries - 1) {
      await new Promise(r => setTimeout(r, intervalMs));
    }
  }
  return null;
}

/**
 * 清理过期验证码 (5分钟前的)
 */
export async function pruneEmailCodes(db) {
  await db.prepare(`DELETE FROM email_codes WHERE created_at < ?`).bind(Date.now() - 300000).run();
}
