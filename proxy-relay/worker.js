/**
 * IP 代理中转 Worker
 * 部署到不同的 Cloudflare 账号，实现不同出口 IP
 * 
 * 使用方法：
 *   1. 在另一个 CF 账号部署此 Worker
 *   2. 将 Worker URL 添加到主 Worker 的 PROXY_URLS 环境变量
 *
 * 请求格式 (POST JSON):
 *   { url, method, headers, body }
 * 
 * 返回格式:
 *   { status, headers, body }
 */

export default {
  async fetch(request) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'POST only' }), { status: 405 });
    }

    try {
      const { url, method, headers, body } = await request.json();
      if (!url) {
        return new Response(JSON.stringify({ error: 'missing url' }), { status: 400 });
      }

      // 转发请求
      const resp = await fetch(url, {
        method: method || 'GET',
        headers: headers || {},
        body: body || undefined,
      });

      const respBody = await resp.text();
      const respHeaders = {};
      resp.headers.forEach((v, k) => { respHeaders[k.toLowerCase()] = v; });

      return new Response(JSON.stringify({
        status: resp.status,
        headers: respHeaders,
        body: respBody,
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (e) {
      return new Response(JSON.stringify({
        status: 500,
        headers: {},
        body: `relay error: ${e.message}`,
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
};
