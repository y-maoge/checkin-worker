// IP 轮询代理 - 通过多个中转 Worker 实现不同出口 IP
// 配置 PROXY_URLS 环境变量（逗号分隔的代理 Worker URL 列表）

let proxyList = [];
let proxyIndex = 0;

/**
 * 初始化代理列表
 * @param {string} proxyUrls - 逗号分隔的代理URL列表
 */
export function initProxies(proxyUrls) {
  if (!proxyUrls) { proxyList = []; return; }
  proxyList = proxyUrls.split(',').map(u => u.trim()).filter(Boolean);
}

/**
 * 获取代理数量
 */
export function getProxyCount() {
  return proxyList.length;
}

/**
 * 为特定账号获取固定代理（基于 accountId hash，保证同一账号总是用同一代理）
 * @param {string} accountId - 账号标识
 * @returns {string|null} 代理URL，无代理时返回 null
 */
export function getProxyForAccount(accountId) {
  if (proxyList.length === 0) return null;
  let hash = 0;
  for (let i = 0; i < accountId.length; i++) {
    hash = ((hash << 5) - hash + accountId.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % proxyList.length;
  return proxyList[idx];
}

/**
 * 获取下一个代理（轮询分配，用于注册等无固定账号的请求）
 * @returns {string|null}
 */
export function getNextProxy() {
  if (proxyList.length === 0) return null;
  const url = proxyList[proxyIndex % proxyList.length];
  proxyIndex++;
  return url;
}

/**
 * 通过代理 Worker 转发请求
 * @param {string} proxyUrl - 代理 Worker 的 URL
 * @param {object} req - { url, method, headers, body }
 * @returns {Response}
 */
export async function fetchViaProxy(proxyUrl, { url, method, headers, body }) {
  const resp = await fetch(proxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, method, headers, body }),
  });
  // 代理返回 { status, headers, body }
  const data = await resp.json();
  return {
    ok: data.status >= 200 && data.status < 300,
    status: data.status,
    headers: { get(k) { return data.headers?.[k.toLowerCase()] || null; } },
    text: async () => data.body || '',
  };
}
