// HTTP/1.1 client over TCP socket (connect API)
// 使用 Workers TCP socket 发送 HTTPS 请求，出口 IP 与 fetch() 不同
import { connect } from 'cloudflare:sockets';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * 通过 TCP socket + TLS 发送 HTTP 请求
 * @param {string} url - 完整 URL (https://host/path)
 * @param {object} opts - { method, headers, body }
 * @returns {{ status: number, headers: object, text: () => Promise<string>, ok: boolean }}
 */
export async function tcpFetch(url, opts = {}) {
  const parsed = new URL(url);
  const host = parsed.hostname;
  const port = parseInt(parsed.port) || 443;
  const path = parsed.pathname + parsed.search;
  const method = opts.method || 'GET';
  const reqHeaders = opts.headers || {};
  const reqBody = opts.body || '';

  const socket = connect({ hostname: host, port }, { secureTransport: 'on' });
  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();

  try {
    // 构建 HTTP/1.1 请求
    const bodyBytes = reqBody ? encoder.encode(reqBody) : null;
    let req = `${method} ${path} HTTP/1.1\r\n`;
    req += `Host: ${host}\r\n`;
    for (const [k, v] of Object.entries(reqHeaders)) {
      if (k.toLowerCase() === 'host') continue;
      req += `${k}: ${v}\r\n`;
    }
    if (bodyBytes && bodyBytes.length > 0) {
      req += `Content-Length: ${bodyBytes.length}\r\n`;
    }
    req += `Connection: close\r\n`;
    req += `\r\n`;

    await writer.write(encoder.encode(req));
    if (bodyBytes && bodyBytes.length > 0) {
      await writer.write(bodyBytes);
    }

    // 读取完整响应
    const chunks = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    // 合并所有 chunks
    const totalLen = chunks.reduce((s, c) => s + c.length, 0);
    const raw = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of chunks) {
      raw.set(chunk, offset);
      offset += chunk.length;
    }

    // 解析 HTTP 响应
    const rawStr = decoder.decode(raw);
    const headerEnd = rawStr.indexOf('\r\n\r\n');
    if (headerEnd === -1) {
      return { status: 0, headers: {}, ok: false, text: async () => rawStr };
    }

    const headerBlock = rawStr.substring(0, headerEnd);
    const bodyStr = rawStr.substring(headerEnd + 4);
    const headerLines = headerBlock.split('\r\n');
    const statusLine = headerLines[0] || '';
    const statusMatch = statusLine.match(/HTTP\/\d\.\d (\d+)/);
    const status = statusMatch ? parseInt(statusMatch[1]) : 0;

    const respHeaders = {};
    for (let i = 1; i < headerLines.length; i++) {
      const idx = headerLines[i].indexOf(':');
      if (idx > 0) {
        respHeaders[headerLines[i].substring(0, idx).trim().toLowerCase()] =
          headerLines[i].substring(idx + 1).trim();
      }
    }

    // 处理 chunked transfer encoding
    let finalBody = bodyStr;
    if ((respHeaders['transfer-encoding'] || '').includes('chunked')) {
      finalBody = decodeChunked(bodyStr);
    }

    return {
      status,
      ok: status >= 200 && status < 300,
      headers: { get(k) { return respHeaders[k.toLowerCase()] || null; } },
      text: async () => finalBody,
    };
  } finally {
    reader.releaseLock();
    writer.releaseLock();
    socket.close().catch(() => {});
  }
}

function decodeChunked(raw) {
  const parts = [];
  let pos = 0;
  while (pos < raw.length) {
    const lineEnd = raw.indexOf('\r\n', pos);
    if (lineEnd === -1) break;
    const sizeStr = raw.substring(pos, lineEnd).trim();
    const size = parseInt(sizeStr, 16);
    if (isNaN(size) || size === 0) break;
    const dataStart = lineEnd + 2;
    parts.push(raw.substring(dataStart, dataStart + size));
    pos = dataStart + size + 2;
  }
  return parts.join('');
}
