// Shared API engine for WeTalk/PingMe (same backend, different hosts)
import { md5 } from './crypto.js';
import { parseBody, sleep } from './http.js';
import { fetchViaProxy } from './proxy.js';
import { tcpFetch } from './tcphttp.js';

// TCP socket 对 CF-proxied targets (wetalk/pingme) 无效，默认关闭
let useTcpSocket = false;
export function setUseTcpSocket(v) { useTcpSocket = v; }

const SECRET = '0fOiukQq7jXZV2GRi9LGlO';

// ---------- App suffixes ----------
const APP_SUFFIX = {
  'api.wetalkapp.com': 'WeTalkIOS',
  'api.pingmeapp.net': 'PingMeIOS',
};

function getSuffix(host) {
  return APP_SUFFIX[host] || 'WeTalkIOS';
}

// ---------- Sign ----------

function getUTCSignDate() {
  const n = new Date();
  const p = v => String(v).padStart(2, '0');
  return `${n.getUTCFullYear()}-${p(n.getUTCMonth() + 1)}-${p(n.getUTCDate())} ${p(n.getUTCHours())}:${p(n.getUTCMinutes())}:${p(n.getUTCSeconds())}`;
}

function buildSign(params) {
  const p = { ...params };
  delete p.sign;
  delete p.signDate;
  p.signDate = getUTCSignDate();
  const base = Object.keys(p).sort().map(k => `${k}=${p[k]}`).join('&');
  p.sign = md5(base + SECRET);
  return p;
}

// ---------- Host-specific config ----------
const HOST_CONFIG = {
  'api.wetalkapp.com': {
    appVersion: '30.6.0',
    bundleId: 'com.innovationworks.wetalk',
    appName: 'WeTalk',
    nextApi: '/app/requestToVerifyEmail',
    validateHost: 'api.wetalkapp.com',
  },
  'api.pingmeapp.net': {
    appVersion: '1.9.3',
    bundleId: 'tel.pingme',
    appName: 'PingMe',
    nextApi: '/app/requestToVerifyEmail',
    validateHost: 'api.genvoice.cn',
  },
};

function getHostConfig(host) {
  return HOST_CONFIG[host] || HOST_CONFIG['api.wetalkapp.com'];
}

// ---------- Device Params ----------

function deviceParams(device, host) {
  const suffix = getSuffix(host);
  const cfg = getHostConfig(host);
  const uid = device.deviceUID || '';
  return {
    appversion: device.appVersion || cfg.appVersion,
    clientName: 'iPhone',
    clienttag: suffix,
    countrycode: 'CN',
    installTime: device.installTime || getUTCSignDate(),
    isJail: '0',
    languagecode: 'zh_cn',
    model: 'iPhone-iPhone',
    platform: device.model || 'iPhone17,2',
    systemname: 'iOS',
    systemversion: device.osVersion || '27.0',
    uniquedeviceid: uid + suffix,
  };
}

// ---------- Build UA ----------

function buildUA(device, host) {
  const cfg = getHostConfig(host);
  const ver = device.osVersion || '27.0';
  return `${cfg.appName}/${cfg.appVersion} (${cfg.bundleId}; build:28; iOS ${ver}) Alamofire/5.4.3`;
}

// ---------- API Call (POST form-encoded) ----------

async function callApi(host, path, params, device, proxyUrl) {
  const signed = buildSign(params);
  const body = Object.keys(signed)
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(signed[k])}`)
    .join('&');
  const url = `https://${host}/app/${path}`;
  const headers = {
    'Host': host,
    'Accept': 'application/json',
    'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
    'User-Agent': buildUA(device || {}, host),
  };
  let resp;
  if (proxyUrl) {
    resp = await fetchViaProxy(proxyUrl, { url, method: 'POST', headers, body });
  } else if (useTcpSocket) {
    try {
      resp = await tcpFetch(url, { method: 'POST', headers, body });
      console.log('[tcpFetch] POST OK:', path);
    } catch (e) {
      console.log('[tcpFetch] POST fallback to fetch:', path, e.message || e);
      resp = await fetch(url, { method: 'POST', headers, body });
    }
  } else {
    resp = await fetch(url, { method: 'POST', headers, body });
  }
  return parseBody(await resp.text());
}

// GET for genCaptcha
async function callApiGet(host, path, params, device, proxyUrl) {
  const signed = buildSign(params);
  const qs = Object.keys(signed)
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(signed[k])}`)
    .join('&');
  const url = `https://${host}/app/${path}?${qs}`;
  const headers = {
    'Host': host,
    'Accept': '*/*',
    'User-Agent': buildUA(device || {}, host),
  };
  if (proxyUrl) {
    return fetchViaProxy(proxyUrl, { url, method: 'GET', headers });
  }
  if (useTcpSocket) {
    try {
      const r = await tcpFetch(url, { method: 'GET', headers });
      console.log('[tcpFetch] GET OK:', path);
      return r;
    } catch (e) {
      console.log('[tcpFetch] GET fallback to fetch:', path, e.message || e);
      return fetch(url, { method: 'GET', headers });
    }
  }
  return fetch(url, { method: 'GET', headers });
}

// ---------- Captcha ----------

/**
 * Generate captcha SVG image
 */
export async function genCaptcha(host, device, proxyUrl) {
  const suffix = getSuffix(host);
  const captchaId = (device.deviceUID || '') + suffix;
  const params = { captchaId };
  const resp = await callApiGet(host, 'genCaptcha', params, device, proxyUrl);
  const ct = resp.headers.get('content-type') || '';
  if (ct.includes('image') || ct.includes('svg')) {
    const svgText = await resp.text();
    return { ok: true, svgText, captchaId };
  }
  const data = parseBody(await resp.text());
  return { ok: false, error: data.retmsg || 'captcha failed' };
}

/**
 * Confirm captcha answer (separate step before sending email code)
 * Real flow: genCaptcha -> confirmCaptcha -> requestToVerifyEmail
 */
export async function confirmCaptcha(host, device, captchaId, inputCaptcha, proxyUrl) {
  const cfg = getHostConfig(host);
  const params = {
    ...deviceParams(device, host),
    captchaId,
    inputCaptcha,
    nextApi: cfg.nextApi,
    email: '',
    phone: '',
    callpin: '',
    gps: '',
  };
  return callApi(host, 'confirmCaptcha', params, device, proxyUrl);
}

// ---------- Registration API ----------

/**
 * Create anonymous/rover account (called after captcha confirmation)
 */
export async function createRoverAccount(host, device, proxyUrl) {
  const params = {
    ...deviceParams(device, host),
    email: '',
    phone: '',
    callpin: '',
    gps: '',
    originalCallPin: '',
    originalUniqueDeviceId: '',
  };
  return callApi(host, 'createRoverAccount', params, device, proxyUrl);
}

/**
 * Send email verification code (POST, after captcha confirmed)
 */
export async function sendEmailCode(host, email, device, proxyUrl) {
  const params = {
    ...deviceParams(device, host),
    email,
    codelength: '6',
    callpin: '',
    phone: '',
    gps: '',
  };
  return callApi(host, 'requestToVerifyEmail', params, device, proxyUrl);
}

/**
 * Validate email verification code
 * Uses activationcode (not code) and verifyid from sendEmailCode response
 */
export async function validateEmailCode(host, device, activationcode, verifyid, proxyUrl) {
  const cfg = getHostConfig(host);
  const vHost = cfg.validateHost || host;
  const params = {
    ...deviceParams(device, host),
    activationcode,
    verifyid,
    email: '',
    phone: '',
    callpin: '',
  };
  return callApi(vHost, 'validateCodeForEmail', params, device, proxyUrl);
}

/**
 * Create account by email (final step)
 */
export async function createAccountByEmail(host, email, device, proxyUrl) {
  const cfg = getHostConfig(host);
  const vHost = cfg.validateHost || host;
  const params = {
    ...deviceParams(device, host),
    email,
    phone: '',
    callpin: '',
  };
  return callApi(vHost, 'createAccountByEmail', params, device, proxyUrl);
}

/**
 * Full registration flow:
 *   confirmCaptcha -> createRoverAccount -> sendEmailCode -> (wait for code) -> validateEmailCode -> createAccountByEmail
 * This function handles steps after captcha is confirmed and email code is received.
 */
export async function registerByEmail(host, email, code, device, verifyid, proxyUrl) {
  // 1) Validate email code
  const val = await validateEmailCode(host, device, code, verifyid, proxyUrl);
  if (!val || val.retcode !== 0) {
    return { ok: false, error: val?.retmsg || 'validate code failed', retcode: val?.retcode };
  }

  // 2) Create account by email
  const acc = await createAccountByEmail(host, email, device, proxyUrl);
  if (!acc || acc.retcode !== 0) {
    return { ok: false, error: acc?.retmsg || 'create account failed', retcode: acc?.retcode };
  }

  return { ok: true, data: acc.result };
}

// ---------- Check-in API using captured params (matching reference scripts) ----------

/**
 * Build signed params from captured paramsRaw (raw URL-encoded values).
 * Exactly matches the reference script's buildSignedParamsRaw:
 * 1. Take all original raw params (exclude sign/signDate)
 * 2. Add fresh signDate
 * 3. Sort alphabetically, join as k=v&..., append SECRET, MD5
 */
function buildSignedParamsRaw(paramsRaw) {
  const params = {};
  Object.keys(paramsRaw || {}).forEach(k => {
    if (k !== 'sign' && k !== 'signDate') params[k] = paramsRaw[k];
  });
  params.signDate = getUTCSignDate();
  const signBase = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&');
  params.sign = md5(signBase + SECRET);
  return params;
}

/**
 * Build request headers from captured headers (matching reference script's buildHeaders).
 * Removes pseudo-headers, sets Host, removes User-Agent/Connection and replaces them.
 */
function buildCheckinHeaders(capturedHeaders, host) {
  const headers = {};
  Object.keys(capturedHeaders || {}).forEach(k => { headers[k] = capturedHeaders[k]; });
  // Remove HTTP/2 pseudo-headers
  delete headers[':authority']; delete headers[':method']; delete headers[':path']; delete headers[':scheme'];
  delete headers['Content-Length']; delete headers['content-length'];
  // Remove and replace User-Agent & Connection (like reference)
  Object.keys(headers).forEach(k => {
    const lk = k.toLowerCase();
    if (lk === 'user-agent' || lk === 'connection' || lk === 'proxy-connection' || lk === 'keep-alive') delete headers[k];
  });
  headers['Host'] = host;
  headers['Accept'] = headers['Accept'] || 'application/json';
  headers['Connection'] = 'close';
  // Keep original User-Agent from capture if present
  let ua = '';
  Object.keys(capturedHeaders || {}).forEach(k => { if (k.toLowerCase() === 'user-agent') ua = capturedHeaders[k]; });
  if (ua) headers['User-Agent'] = ua;
  else headers['User-Agent'] = buildUA({}, host);
  return headers;
}

/**
 * GET-based API call using captured params (for checkIn/queryBalance/videoBonus).
 * accountData must have .capture = { paramsRaw, headers }
 * Falls back to legacy format if .capture is missing (old data).
 */
async function callCheckinApi(host, path, accountData, proxyUrl) {
  let paramsRaw, capturedHeaders;

  if (accountData.capture && accountData.capture.paramsRaw) {
    // New format: capture = { paramsRaw (raw encoded), headers }
    paramsRaw = accountData.capture.paramsRaw;
    capturedHeaders = accountData.capture.headers || {};
  } else {
    // Legacy format: params spread on accountData (decoded values)
    const exclude = new Set(['device', 'raw', 'paramsRaw', 'headers', 'capture']);
    paramsRaw = {};
    for (const [k, v] of Object.entries(accountData)) {
      if (!exclude.has(k) && typeof v === 'string') paramsRaw[k] = v;
    }
    capturedHeaders = {};
  }

  const params = buildSignedParamsRaw(paramsRaw);
  const qs = Object.keys(params).map(k => `${k}=${encodeURIComponent(params[k])}`).join('&');
  const url = `https://${host}/app/${path}?${qs}`;
  const headers = buildCheckinHeaders(capturedHeaders, host);

  let resp;
  if (proxyUrl) {
    resp = await fetchViaProxy(proxyUrl, { url, method: 'GET', headers });
  } else if (useTcpSocket) {
    try {
      resp = await tcpFetch(url, { method: 'GET', headers });
    } catch (e) {
      resp = await fetch(url, { method: 'GET', headers });
    }
  } else {
    resp = await fetch(url, { method: 'GET', headers });
  }

  const text = await resp.text();
  try {
    return JSON.parse(text || '{}');
  } catch {
    console.log(`[callCheckinApi] ${path} non-JSON response:`, text.slice(0, 200));
    return { retcode: -1, retmsg: 'non-JSON: ' + text.slice(0, 100) };
  }
}

// ---------- Detect egress IP ----------

export async function detectEgressIP() {
  // 1.1.1.1 仅 IPv4 路径，优先显示 v4 出口
  try {
    const resp = await fetch('https://1.1.1.1/cdn-cgi/trace');
    const text = await resp.text();
    const m = text.match(/ip=(.+)/);
    const ip = m ? m[1].trim() : '';
    if (ip && !ip.includes(':')) return ip;
    // 走了 v6，再用仅 IPv4 DNS 的服务查一次
    for (const u of ['https://api4.ipify.org', 'https://ipv4.icanhazip.com']) {
      try {
        const r4 = await fetch(u);
        const v4 = (await r4.text()).trim();
        if (v4 && !v4.includes(':')) return ip ? `${v4} / ${ip}` : v4;
      } catch {}
    }
    return ip || 'unknown';
  } catch {
    return 'unknown';
  }
}

// ---------- Query Balance ----------

export async function queryBalance(host, accountData, proxyUrl) {
  return callCheckinApi(host, 'queryBalanceAndBonus', accountData, proxyUrl);
}

// ---------- Check-in Engine ----------

const MAX_VIDEO = 5;
const VIDEO_DELAY_MS = 8000;

export async function runCheckin(host, accountData, tag, log, proxyUrl) {
  log(`${tag} start${proxyUrl ? ' [proxy]' : ''}`);

  // 1) Query balance
  let d = await callCheckinApi(host, 'queryBalanceAndBonus', accountData, proxyUrl).catch(e => ({ _err: e }));
  if (d._err) {
    log(`${tag} query error: ${d._err.message || d._err}`, 'error');
    return { ok: false, status: 'query error' };
  }
  if (d.retcode === 0) {
    log(`${tag} balance: ${d.result?.balance}`);
  } else {
    log(`${tag} query: retcode=${d.retcode} ${d.retmsg || JSON.stringify(d).slice(0, 80)}`, 'warn');
  }

  // 2) Check-in
  d = await callCheckinApi(host, 'checkIn', accountData, proxyUrl).catch(e => ({ _err: e }));
  if (d._err) {
    log(`${tag} checkin error: ${d._err.message || d._err}`, 'error');
    return { ok: false, status: 'checkin error' };
  }
  if (d.retcode === 0) {
    log(`${tag} checkin: ${(d.result?.bonusHint || d.retmsg || '').replace(/\n/g, ' ')}`);
  } else {
    log(`${tag} checkin: retcode=${d.retcode} ${d.retmsg || ''}`, 'warn');
  }

  // 3) Video rewards
  let videoOk = 0;
  for (let i = 1; i <= MAX_VIDEO; i++) {
    await sleep(i === 1 ? 1500 : VIDEO_DELAY_MS);
    const r = await callCheckinApi(host, 'videoBonus', accountData, proxyUrl).catch(e => ({ _err: e }));
    if (r._err) {
      log(`${tag} video ${i}: ${r._err.message || r._err}`, 'warn');
      break;
    }
    if (r.retcode === 0) {
      videoOk++;
      log(`${tag} video ${i}: +${r.result?.bonus || '?'}`);
    } else if (r.retcode === 200006) {
      log(`${tag} video limit (${i - 1} ok)`);
      break;
    } else if (r.retcode === 100010) {
      log(`${tag} captcha required, stop video`, 'warn');
      break;
    } else {
      log(`${tag} video ${i}: ${r.retmsg || 'retcode=' + r.retcode}`, 'warn');
      break;
    }
  }

  // 4) Final balance
  const fin = await callCheckinApi(host, 'queryBalanceAndBonus', accountData, proxyUrl).catch(() => null);
  if (fin && fin.retcode === 0) {
    log(`${tag} final balance: ${fin.result?.balance}`);
  }

  return { ok: true, status: `video ${videoOk}/${MAX_VIDEO}`, balance: fin?.result?.balance };
}
