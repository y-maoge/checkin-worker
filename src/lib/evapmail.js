// evapmail.com 临时邮箱 API 封装
// 用于 WeTalk 随机邮箱注册

const EVAPMAIL_BASE = 'https://api.evapmail.com/v1';
const EVAPMAIL_HEADERS = {
  'user-agent': 'Dart/3.7 (dart:io)',
  'accept-encoding': 'gzip',
  'em-subscriber-id': '$RCAnonymousID:c6c7b7d107034590bf95e0ad80a13b37',
  'host': 'api.evapmail.com',
  'em-client-id': 'c1dfa090-6c00-4661-bfe1-c51bc99ccbdb',
  'em-client-type': 'mobile',
  'content-type': 'application/json',
  'em-client-version': '1.3.2',
};

/**
 * 创建临时邮箱
 * @returns {{ email: string, token: string } | null}
 */
export async function createTempEmail() {
  const resp = await fetch(`${EVAPMAIL_BASE}/accounts/create`, {
    method: 'POST',
    headers: EVAPMAIL_HEADERS,
    body: JSON.stringify({ expirationMinutes: 60 }),
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  if (!data.email || !data.token) return null;
  return { email: data.email, token: data.token };
}

/**
 * 检查临时邮箱收件箱,提取 WeTalk 验证码
 * @param {string} sessionToken - evapmail 返回的 token
 * @returns {string|null} 验证码
 */
export async function fetchVerificationCode(sessionToken) {
  const headers = { ...EVAPMAIL_HEADERS };
  delete headers['content-type'];
  headers['authorization'] = `Bearer ${sessionToken}`;
  const resp = await fetch(`${EVAPMAIL_BASE}/messages/inbox`, {
    method: 'GET',
    headers,
  });
  if (!resp.ok) return null;
  const messages = await resp.json();
  if (!Array.isArray(messages)) return null;

  for (const msg of messages) {
    // WeTalk 验证码邮件
    const subject = (msg.subject || '').toLowerCase();
    if (subject.includes('verification') || subject.includes('code') || subject.includes('wetalk')) {
      // 尝试从 intro/snippet 提取验证码（通常是 4-6 位数字）
      const text = msg.intro || msg.snippet || msg.subject || '';
      const match = text.match(/(?:code\s*(?:is|:)\s*)(\d{4,6})/i)
        || text.match(/(\d{4,6})/);
      if (match) return match[1];
    }
  }
  return null;
}

/**
 * 等待验证码到达（轮询）
 * @param {string} sessionToken
 * @param {number} maxRetries
 * @param {number} intervalMs
 * @returns {string|null}
 */
export async function waitForCode(sessionToken, maxRetries = 8, intervalMs = 5000) {
  for (let i = 0; i < maxRetries; i++) {
    const code = await fetchVerificationCode(sessionToken);
    if (code) return code;
    if (i < maxRetries - 1) {
      await new Promise(r => setTimeout(r, intervalMs));
    }
  }
  return null;
}
