// MD5 (用于 WeTalk 等需要 MD5 签名的 provider) + SHA-256 (用于上报去重)

export async function sha256Hex(s) {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---- MD5 ----
function rotl(v, n) { return (v << n) | (v >>> (32 - n)); }
function add32(a, b) {
  const lsw = (a & 0xFFFF) + (b & 0xFFFF);
  const msw = (a >>> 16) + (b >>> 16) + (lsw >>> 16);
  return ((msw & 0xFFFF) << 16) | (lsw & 0xFFFF);
}
function F(x, y, z) { return (x & y) | (~x & z); }
function G(x, y, z) { return (x & z) | (y & ~z); }
function H(x, y, z) { return x ^ y ^ z; }
function I(x, y, z) { return y ^ (x | ~z); }
function step(fn, a, b, c, d, x, s, t) {
  return add32(rotl(add32(add32(a, fn(b, c, d)), add32(x, t)), s), b);
}

function toBytesUtf8(str) {
  return new TextEncoder().encode(str);
}

export function md5(str) {
  const bytes = toBytesUtf8(str);
  const len = bytes.length;
  const nBlocks = ((len + 8) >> 6) + 1;
  const x = new Array(nBlocks * 16).fill(0);
  for (let i = 0; i < len; i++) {
    x[i >> 2] |= bytes[i] << ((i & 3) * 8);
  }
  x[len >> 2] |= 0x80 << ((len & 3) * 8);
  x[nBlocks * 16 - 2] = len * 8;

  let a = 0x67452301, b = 0xEFCDAB89, c = 0x98BADCFE, d = 0x10325476;
  for (let k = 0; k < x.length; k += 16) {
    const AA = a, BB = b, CC = c, DD = d;
    a = step(F,a,b,c,d,x[k+0], 7,0xD76AA478); d = step(F,d,a,b,c,x[k+1],12,0xE8C7B756); c = step(F,c,d,a,b,x[k+2],17,0x242070DB); b = step(F,b,c,d,a,x[k+3],22,0xC1BDCEEE);
    a = step(F,a,b,c,d,x[k+4], 7,0xF57C0FAF); d = step(F,d,a,b,c,x[k+5],12,0x4787C62A); c = step(F,c,d,a,b,x[k+6],17,0xA8304613); b = step(F,b,c,d,a,x[k+7],22,0xFD469501);
    a = step(F,a,b,c,d,x[k+8], 7,0x698098D8); d = step(F,d,a,b,c,x[k+9],12,0x8B44F7AF); c = step(F,c,d,a,b,x[k+10],17,0xFFFF5BB1); b = step(F,b,c,d,a,x[k+11],22,0x895CD7BE);
    a = step(F,a,b,c,d,x[k+12],7,0x6B901122); d = step(F,d,a,b,c,x[k+13],12,0xFD987193); c = step(F,c,d,a,b,x[k+14],17,0xA679438E); b = step(F,b,c,d,a,x[k+15],22,0x49B40821);
    a = step(G,a,b,c,d,x[k+1], 5,0xF61E2562); d = step(G,d,a,b,c,x[k+6], 9,0xC040B340); c = step(G,c,d,a,b,x[k+11],14,0x265E5A51); b = step(G,b,c,d,a,x[k+0],20,0xE9B6C7AA);
    a = step(G,a,b,c,d,x[k+5], 5,0xD62F105D); d = step(G,d,a,b,c,x[k+10],9,0x02441453); c = step(G,c,d,a,b,x[k+15],14,0xD8A1E681); b = step(G,b,c,d,a,x[k+4],20,0xE7D3FBC8);
    a = step(G,a,b,c,d,x[k+9], 5,0x21E1CDE6); d = step(G,d,a,b,c,x[k+14],9,0xC33707D6); c = step(G,c,d,a,b,x[k+3],14,0xF4D50D87); b = step(G,b,c,d,a,x[k+8],20,0x455A14ED);
    a = step(G,a,b,c,d,x[k+13],5,0xA9E3E905); d = step(G,d,a,b,c,x[k+2], 9,0xFCEFA3F8); c = step(G,c,d,a,b,x[k+7],14,0x676F02D9); b = step(G,b,c,d,a,x[k+12],20,0x8D2A4C8A);
    a = step(H,a,b,c,d,x[k+5], 4,0xFFFA3942); d = step(H,d,a,b,c,x[k+8],11,0x8771F681); c = step(H,c,d,a,b,x[k+11],16,0x6D9D6122); b = step(H,b,c,d,a,x[k+14],23,0xFDE5380C);
    a = step(H,a,b,c,d,x[k+1], 4,0xA4BEEA44); d = step(H,d,a,b,c,x[k+4],11,0x4BDECFA9); c = step(H,c,d,a,b,x[k+7],16,0xF6BB4B60); b = step(H,b,c,d,a,x[k+10],23,0xBEBFBC70);
    a = step(H,a,b,c,d,x[k+13],4,0x289B7EC6); d = step(H,d,a,b,c,x[k+0],11,0xEAA127FA); c = step(H,c,d,a,b,x[k+3],16,0xD4EF3085); b = step(H,b,c,d,a,x[k+6],23,0x04881D05);
    a = step(H,a,b,c,d,x[k+9], 4,0xD9D4D039); d = step(H,d,a,b,c,x[k+12],11,0xE6DB99E5); c = step(H,c,d,a,b,x[k+15],16,0x1FA27CF8); b = step(H,b,c,d,a,x[k+2],23,0xC4AC5665);
    a = step(I,a,b,c,d,x[k+0], 6,0xF4292244); d = step(I,d,a,b,c,x[k+7],10,0x432AFF97); c = step(I,c,d,a,b,x[k+14],15,0xAB9423A7); b = step(I,b,c,d,a,x[k+5],21,0xFC93A039);
    a = step(I,a,b,c,d,x[k+12],6,0x655B59C3); d = step(I,d,a,b,c,x[k+3],10,0x8F0CCC92); c = step(I,c,d,a,b,x[k+10],15,0xFFEFF47D); b = step(I,b,c,d,a,x[k+1],21,0x85845DD1);
    a = step(I,a,b,c,d,x[k+8], 6,0x6FA87E4F); d = step(I,d,a,b,c,x[k+15],10,0xFE2CE6E0); c = step(I,c,d,a,b,x[k+6],15,0xA3014314); b = step(I,b,c,d,a,x[k+13],21,0x4E0811A1);
    a = step(I,a,b,c,d,x[k+4], 6,0xF7537E82); d = step(I,d,a,b,c,x[k+11],10,0xBD3AF235); c = step(I,c,d,a,b,x[k+2],15,0x2AD7D2BB); b = step(I,b,c,d,a,x[k+9],21,0xEB86D391);
    a = add32(a, AA); b = add32(b, BB); c = add32(c, CC); d = add32(d, DD);
  }
  const toHex = v => {
    let r = '';
    for (let i = 0; i < 4; i++) r += ((v >>> (i * 8)) & 0xFF).toString(16).padStart(2, '0');
    return r;
  };
  return (toHex(a) + toHex(b) + toHex(c) + toHex(d));
}

export function genId(len = 8) {
  return crypto.randomUUID().replace(/-/g, '').slice(0, len);
}

// ============ 通用编码 ============

export function bytesToHex(bytes) {
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex) {
  const s = hex.replace(/[^0-9a-fA-F]/g, '');
  if (s.length % 2) throw new Error('hex 长度必须为偶数');
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function utf8ToBytes(s) { return new TextEncoder().encode(s); }
export function bytesToUtf8(b) { return new TextDecoder().decode(b); }

// 标准 Base64
export function bytesToBase64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
export function base64ToBytes(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// URL-safe Base64 (RFC 4648 §5,常用于 JWT)
export function bytesToBase64Url(bytes) {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function base64UrlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return base64ToBytes(s);
}

// 直接对字符串做 Base64
export function b64encode(str) { return bytesToBase64(utf8ToBytes(str)); }
export function b64decode(str) { return bytesToUtf8(base64ToBytes(str)); }

// ============ 随机 ============

export function randomBytes(n) {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}
export function randomHex(n) { return bytesToHex(randomBytes(n)); }
export function randomToken(byteLen = 32) { return bytesToBase64Url(randomBytes(byteLen)); }

// ============ 哈希(WebCrypto) ============

async function digestHex(algo, input) {
  const data = typeof input === 'string' ? utf8ToBytes(input) : input;
  const buf = await crypto.subtle.digest(algo, data);
  return bytesToHex(new Uint8Array(buf));
}

export const sha1Hex   = (input) => digestHex('SHA-1',   input);
export const sha256Bin = async (input) => new Uint8Array(await crypto.subtle.digest('SHA-256', typeof input === 'string' ? utf8ToBytes(input) : input));
// sha256Hex 已在文件顶部导出,保持不变
export const sha384Hex = (input) => digestHex('SHA-384', input);
export const sha512Hex = (input) => digestHex('SHA-512', input);

// ============ HMAC ============

async function hmacImport(key, hash) {
  const raw = typeof key === 'string' ? utf8ToBytes(key) : key;
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash }, false, ['sign', 'verify']);
}

async function hmac(hash, key, msg) {
  const k = await hmacImport(key, hash);
  const data = typeof msg === 'string' ? utf8ToBytes(msg) : msg;
  const sig = await crypto.subtle.sign('HMAC', k, data);
  return new Uint8Array(sig);
}

export const hmacSha1    = (key, msg) => hmac('SHA-1',   key, msg);
export const hmacSha256  = (key, msg) => hmac('SHA-256', key, msg);
export const hmacSha512  = (key, msg) => hmac('SHA-512', key, msg);

export async function hmacSha256Hex(key, msg)    { return bytesToHex(await hmacSha256(key, msg)); }
export async function hmacSha256Base64(key, msg) { return bytesToBase64(await hmacSha256(key, msg)); }
export async function hmacSha1Hex(key, msg)      { return bytesToHex(await hmacSha1(key, msg)); }

// ============ AES-GCM (推荐,带 AEAD) ============

async function importAesKey(keyBytes, alg) {
  if (![16, 24, 32].includes(keyBytes.length)) throw new Error('AES key 必须 16/24/32 字节');
  return crypto.subtle.importKey('raw', keyBytes, { name: alg }, false, ['encrypt', 'decrypt']);
}

/** 输入 keyBytes(Uint8Array)、明文(string|Uint8Array),返回 { iv, ciphertext, tag合并 } */
export async function aesGcmEncrypt(keyBytes, plaintext, aad) {
  const iv = randomBytes(12);
  const k = await importAesKey(keyBytes, 'AES-GCM');
  const data = typeof plaintext === 'string' ? utf8ToBytes(plaintext) : plaintext;
  const params = { name: 'AES-GCM', iv };
  if (aad) params.additionalData = typeof aad === 'string' ? utf8ToBytes(aad) : aad;
  const buf = await crypto.subtle.encrypt(params, k, data);
  return { iv, ciphertext: new Uint8Array(buf) };
}

export async function aesGcmDecrypt(keyBytes, iv, ciphertext, aad) {
  const k = await importAesKey(keyBytes, 'AES-GCM');
  const params = { name: 'AES-GCM', iv };
  if (aad) params.additionalData = typeof aad === 'string' ? utf8ToBytes(aad) : aad;
  const buf = await crypto.subtle.decrypt(params, k, ciphertext);
  return new Uint8Array(buf);
}

/** 一体化:string → "base64url(iv).base64url(ct)" */
export async function aesGcmEncryptString(keyBytes, plaintext, aad) {
  const { iv, ciphertext } = await aesGcmEncrypt(keyBytes, plaintext, aad);
  return `${bytesToBase64Url(iv)}.${bytesToBase64Url(ciphertext)}`;
}
export async function aesGcmDecryptString(keyBytes, packed, aad) {
  const [ivB64, ctB64] = packed.split('.');
  if (!ivB64 || !ctB64) throw new Error('密文格式错误');
  const pt = await aesGcmDecrypt(keyBytes, base64UrlToBytes(ivB64), base64UrlToBytes(ctB64), aad);
  return bytesToUtf8(pt);
}

// ============ AES-CBC (兼容老协议) ============

export async function aesCbcEncrypt(keyBytes, plaintext, ivBytes) {
  const iv = ivBytes || randomBytes(16);
  const k = await importAesKey(keyBytes, 'AES-CBC');
  const data = typeof plaintext === 'string' ? utf8ToBytes(plaintext) : plaintext;
  const buf = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, k, data);
  return { iv, ciphertext: new Uint8Array(buf) };
}
export async function aesCbcDecrypt(keyBytes, iv, ciphertext) {
  const k = await importAesKey(keyBytes, 'AES-CBC');
  const buf = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, k, ciphertext);
  return new Uint8Array(buf);
}

// ============ PBKDF2(从密码派生 AES key) ============

export async function pbkdf2(password, salt, { iterations = 100_000, keyLen = 32, hash = 'SHA-256' } = {}) {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    typeof password === 'string' ? utf8ToBytes(password) : password,
    'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: typeof salt === 'string' ? utf8ToBytes(salt) : salt, iterations, hash },
    baseKey, keyLen * 8
  );
  return new Uint8Array(bits);
}

// ============ 常量时间字符串比较(防时序攻击) ============

export function timingSafeEqual(a, b) {
  if (typeof a === 'string') a = utf8ToBytes(a);
  if (typeof b === 'string') b = utf8ToBytes(b);
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i];
  return r === 0;
}

// ============ 简易 JWT (HS256) ============

export async function jwtSignHS256(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const head = bytesToBase64Url(utf8ToBytes(JSON.stringify(header)));
  const body = bytesToBase64Url(utf8ToBytes(JSON.stringify(payload)));
  const data = `${head}.${body}`;
  const sig = bytesToBase64Url(await hmacSha256(secret, data));
  return `${data}.${sig}`;
}

export async function jwtVerifyHS256(token, secret) {
  const [h, b, s] = token.split('.');
  if (!h || !b || !s) return null;
  const expected = bytesToBase64Url(await hmacSha256(secret, `${h}.${b}`));
  if (!timingSafeEqual(s, expected)) return null;
  try {
    const payload = JSON.parse(bytesToUtf8(base64UrlToBytes(b)));
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch { return null; }
}
