import { Hono } from 'hono';
import { providers, getProvider } from './providers/index.js';
import { createSession, isValidSession, readCookieToken, pruneExpiredSessions } from './lib/session.js';
import { listAccounts, getAccount, upsertAccount, deleteAccount, setAccountEnabled, updateRunStatus, appendLogs, listLogs, clearLogs, nowCN } from './lib/db.js';
import { generateDeviceIdentity } from './lib/device.js';
import { createTempEmail, waitForCode } from './lib/evapmail.js';
import { randomMailPrefix, handleIncomingEmail, waitForCodeFromDB, pruneEmailCodes } from './lib/cfmail.js';
import { sha256Hex } from './lib/crypto.js';
import { sleep } from './lib/http.js';
import { initProxies, getProxyForAccount } from './lib/proxy.js';
import { setUseTcpSocket, runCheckin, detectEgressIP } from './lib/engine.js';
import { loginPage, providerPage, logsPage } from './ui/pages.js';

const app = new Hono();

// ---------- Auto-migration: 首次启动自动建表 ----------
const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, provider TEXT NOT NULL, alias TEXT DEFAULT '', data TEXT DEFAULT '{}', data_hash TEXT DEFAULT '', enabled INTEGER DEFAULT 1, last_status TEXT DEFAULT '', last_run_at TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, provider TEXT NOT NULL, level TEXT DEFAULT 'info', message TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS email_codes (address TEXT PRIMARY KEY, code TEXT NOT NULL, subject TEXT DEFAULT '', created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
];

async function ensureTables(db) {
  try {
    await db.prepare(`SELECT 1 FROM accounts LIMIT 1`).first();
  } catch (_) {
    // 表不存在，执行迁移
    for (const sql of MIGRATIONS) {
      await db.prepare(sql).run().catch(() => {});
    }
  }
}

// Helper: get admin password from D1 or env
async function getAdminPassword(env) {
  let pwd = env.ADMIN_PASSWORD || 'baby';
  try {
    const row = await env.DB.prepare(`SELECT value FROM app_settings WHERE key = 'admin_password'`).first();
    if (row && row.value) pwd = row.value;
  } catch (_) {}
  return pwd;
}

// ---------- Script & Config Generators ----------

function generateCaptureScript(baseUrl, env) {
  return `/*
 * WeTalk/PingMe 账号抓取脚本
 * 兼容: Surge, Loon, Quantumult X, Shadowrocket, Stash
 * @author @Yu9191
 */
const WORKER_URL = "${baseUrl}";

// --- 环境兼容层 (函数式检测，避免 TDZ 报错) ---
function isQX() { return typeof $task !== "undefined"; }

function kRead(key) {
  if (isQX()) return $prefs.valueForKey(key) || "";
  if (typeof $persistentStore !== "undefined") return $persistentStore.read(key) || "";
  return "";
}
function kWrite(key, val) {
  if (isQX()) return $prefs.setValueForKey(val, key);
  if (typeof $persistentStore !== "undefined") return $persistentStore.write(val, key);
}

// --- 单一键名 weping，JSON 存储所有缓存 ---
const STORE_KEY = "weping";
function loadStore() {
  try { return JSON.parse(kRead(STORE_KEY) || "{}"); } catch (e) { return {}; }
}
function saveStore(obj) {
  return kWrite(STORE_KEY, JSON.stringify(obj));
}

const TOKEN = loadStore().token || "${env.ADMIN_PASSWORD || 'baby'}";

function notify(title, subtitle, body) {
  if (isQX()) { $notify(title, subtitle, body); }
  else if (typeof $notification !== "undefined") { $notification.post(title, subtitle, body); }
  else { console.log(title, subtitle, body); }
}

function post(url, body, cb) {
  const opts = { url, headers: { "Content-Type": "application/json", "X-Token": TOKEN }, body: JSON.stringify(body) };
  if (isQX()) {
    $task.fetch({ method: "POST", ...opts }).then(r => cb(null, r, r.body), e => cb(e));
  } else if (typeof $httpClient !== "undefined") {
    $httpClient.post(opts, cb);
  }
}

// 解析 URL 原始参数 (不做 decode，保留编码)
function parseRawQuery(url) {
  const query = (url.split("?")[1] || "").split("#")[0];
  const map = {};
  query.split("&").forEach(pair => {
    if (!pair) return;
    const idx = pair.indexOf("=");
    if (idx < 0) return;
    map[pair.slice(0, idx)] = pair.slice(idx + 1);
  });
  return map;
}

function safeDecode(v) {
  if (!v) return "";
  try { return decodeURIComponent(String(v)); } catch(e) { return String(v); }
}

function getProvider(url) {
  if (url.includes("wetalk") || url.includes("WeTalk")) return "wetalk";
  if (url.includes("pingme") || url.includes("PingMe") || url.includes("genvoice")) return "pingme";
  return "wetalk";
}

function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = ((h << 5) - h + str.charCodeAt(i)) | 0; }
  return h.toString(36);
}

// --- 主逻辑 ---
(function main() {
  const url = ($request && $request.url) || "";
  const headers = ($request && $request.headers) || {};
  const paramsRaw = parseRawQuery(url);
  const provider = getProvider(url);
  const email = safeDecode(paramsRaw.email || "");
  const callpin = safeDecode(paramsRaw.callpin || "");

  if (!callpin && !email) { return isQX() ? $done({}) : $done(); }

  // 本地去重 (weping 键 JSON 内按账号存指纹)
  const accountKey = provider + "_" + (callpin || email);
  const fingerprint = simpleHash(JSON.stringify(paramsRaw));
  const store = loadStore();
  store.cache = store.cache || {};
  if (store.cache[accountKey] === fingerprint) {
    return isQX() ? $done({}) : $done();
  }

  const payload = {
    provider,
    callpin,
    email,
    capture: { paramsRaw, headers }
  };

  post(WORKER_URL + "/api/accounts/import?token=" + encodeURIComponent(TOKEN), payload, (err, resp, body) => {
    if (err) {
      notify("上传失败", provider, String(err));
    } else {
      try {
        const r = JSON.parse(typeof body === "string" ? body : (resp && resp.body) || "{}");
        store.cache[accountKey] = fingerprint;
        saveStore(store);
        if (r.created) {
          notify("新账号已添加", provider + " | " + (email || callpin), r.message || "");
        } else if (r.changed) {
          notify("账号已更新", provider + " | " + (email || callpin), r.message || "");
        }
      } catch (e) {
        notify("解析失败", provider, String(body || (resp && resp.body) || ""));
      }
    }
    isQX() ? $done({}) : $done();
  });
})();
`;
}

function generateSurgeModule(baseUrl, env) {
  const scriptUrl = baseUrl + '/sub/script.js';
  return [
    '#!name=WeTalk/PingMe 账号抓取',
    '#!desc=自动抓取 WeTalk/PingMe 账号数据并同步到 Worker',
    '#!category=Tool',
    '#!author=@Yu9191',
    '',
    '[Script]',
    'wetalk-capture = type=http-request,pattern=https?://api\\.wetalkapp\\.com/app/queryBalanceAndBonus,requires-body=0,max-size=0,script-path=' + scriptUrl + ',script-update-interval=0',
    'pingme-capture = type=http-request,pattern=https?://api\\.(pingmeapp\\.net|genvoice\\.cn)/app/queryBalanceAndBonus,requires-body=0,max-size=0,script-path=' + scriptUrl + ',script-update-interval=0',
    '',
    '[MITM]',
    'hostname = %APPEND% api.wetalkapp.com, api.pingmeapp.net, api.genvoice.cn',
  ].join('\n');
}

function generateLoonConfig(baseUrl, env) {
  const scriptUrl = baseUrl + '/sub/script.js';
  return [
    '#!name=WeTalk/PingMe 账号抓取',
    '#!desc=自动抓取 WeTalk/PingMe 账号数据并同步到 Worker',
    '#!author=@Yu9191',
    '',
    '[Script]',
    'http-request ' + scriptUrl + ' tag=wetalk-capture, pattern=https?://api\\.wetalkapp\\.com/app/queryBalanceAndBonus, requires-body=false, enabled=true',
    'http-request ' + scriptUrl + ' tag=pingme-capture, pattern=https?://api\\.(pingmeapp\\.net|genvoice\\.cn)/app/queryBalanceAndBonus, requires-body=false, enabled=true',
    '',
    '[MITM]',
    'hostname = api.wetalkapp.com, api.pingmeapp.net, api.genvoice.cn',
  ].join('\n');
}

function generateQXConfig(baseUrl, env) {
  const scriptUrl = baseUrl + '/sub/script.js';
  return [
    '[rewrite_local]',
    'https?://api\\.wetalkapp\\.com/app/queryBalanceAndBonus url script-request-header ' + scriptUrl,
    'https?://api\\.(pingmeapp\\.net|genvoice\\.cn)/app/queryBalanceAndBonus url script-request-header ' + scriptUrl,
    '',
    '[mitm]',
    'hostname = api.wetalkapp.com, api.pingmeapp.net, api.genvoice.cn',
  ].join('\n');
}

// 初始化中间件: 代理 + TCP socket + 自动建表
app.use('*', async (c, next) => {
  initProxies(c.env.PROXY_URLS);
  setUseTcpSocket(c.env.USE_TCP_FETCH !== 'false');
  await ensureTables(c.env.DB);
  return next();
});

app.onError((err, c) => {
  console.error('Unhandled:', err);
  return c.json({ ok: false, message: err.message || '服务器内部错误' }, 500);
});

// ---------- Middleware ----------

function auth(c, next) {
  const token = readCookieToken(c.req);
  return isValidSession(c.env.DB, token).then(ok => {
    if (!ok) return c.redirect('/login');
    return next();
  });
}

// ---------- Login ----------

app.get('/login', (c) => c.html(loginPage()));

app.post('/login', async (c) => {
  const body = await c.req.parseBody();
  // 优先使用 D1 中存储的自定义密码
  let pwd = c.env.ADMIN_PASSWORD;
  try {
    const row = await c.env.DB.prepare(`SELECT value FROM app_settings WHERE key = 'admin_password'`).first();
    if (row && row.value) pwd = row.value;
  } catch (_) {}
  if (body.password !== pwd) {
    return c.html(loginPage('密码错误'));
  }
  const token = await createSession(c.env.DB);
  c.header('Set-Cookie', `session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`);
  return c.redirect('/');
});

app.get('/logout', (c) => {
  c.header('Set-Cookie', `session=; Path=/; HttpOnly; Max-Age=0`);
  return c.redirect('/login');
});

// ---------- Pages ----------

app.get('/', (c) => auth(c, () => c.redirect(`/p/${providers[0].id}`)));

app.get('/p/:pid', (c) => auth(c, async () => {
  const provider = getProvider(c.req.param('pid'));
  if (!provider) return c.redirect('/');
  const accounts = await listAccounts(c.env.DB, provider.id);
  const logs = await listLogs(c.env.DB, provider.id, 100);
  return c.html(providerPage({ providers, provider, accounts, logs }));
}));

app.get('/logs', (c) => auth(c, async () => {
  const logs = await listLogs(c.env.DB, null, 200);
  return c.html(logsPage({ providers, logs }));
}));

// ---------- Account CRUD ----------

app.post('/api/accounts/:id/toggle', (c) => auth(c, async () => {
  const id = c.req.param('id');
  const a = await getAccount(c.env.DB, id);
  if (!a) return c.json({ ok: false, message: '未找到' }, 404);
  await setAccountEnabled(c.env.DB, id, !a.enabled);
  return c.json({ ok: true });
}));

app.delete('/api/accounts/:id', (c) => auth(c, async () => {
  await deleteAccount(c.env.DB, c.req.param('id'));
  return c.json({ ok: true });
}));

// ---------- Account Import (from proxy scripts) ----------

app.post('/api/accounts/import', async (c) => {
  // Auth: accept admin password (token param or header) OR valid session cookie
  const pwd = await getAdminPassword(c.env);
  const token = c.req.query('token') || c.req.header('X-Token') || '';
  const sessionToken = readCookieToken(c.req);
  const hasValidSession = sessionToken ? await isValidSession(c.env.DB, sessionToken) : false;
  if (token !== pwd && !hasValidSession) {
    return c.json({ ok: false, message: 'invalid token' }, 401);
  }
  await ensureTables(c.env.DB);

  const body = await c.req.json();
  const { provider, callpin, email, phone, device, capture, raw } = body;
  if (!provider || (!callpin && !email)) {
    return c.json({ ok: false, message: 'missing provider or callpin/email' }, 400);
  }

  // 以 callpin 为主键去重（callpin 是 API 唯一账户标识），无 callpin 时用 email
  const accountId = callpin || email;
  const id = `${provider}:${accountId}`;

  // 合并同一账号的旧记录（callpin 或 email 匹配但 id 不同的）
  try {
    const existing = await listAccounts(c.env.DB, provider);
    for (const a of existing) {
      if (a.id === id) continue;
      const aCallpin = a.data?.callpin || '';
      const aEmail = a.data?.email || '';
      if ((callpin && aCallpin === callpin) || (email && aEmail === email)) {
        await deleteAccount(c.env.DB, a.id);
      }
    }
  } catch (_) {}

  // New format: capture = { paramsRaw, headers } from proxy script
  // Old format: raw = decoded params, device = device obj
  const data = capture
    ? { email: email || '', callpin: callpin || '', capture }
    : { email: email || '', phone: phone || '', callpin: callpin || '', device: device || {}, ...(raw || {}) };

  const result = await upsertAccount(c.env.DB, { id, provider, alias: email || callpin || '', data });

  return c.json({
    ok: true,
    message: result.created ? '新账号已添加' : (result.changed ? '账号已更新' : '账号无变化(去重)'),
    id,
    created: result.created,
    changed: result.changed,
  });
});

// ---------- Proxy script & module serving ----------

// Surge / Egern (.sgmodule)
app.get('/sub/checkin.sgmodule', (c) => {
  const baseUrl = new URL(c.req.url).origin;
  return c.text(generateSurgeModule(baseUrl, c.env), 200, { 'Content-Type': 'text/plain; charset=utf-8' });
});

// Loon (.lpx / .plugin)
app.get('/sub/checkin.lpx', (c) => {
  const baseUrl = new URL(c.req.url).origin;
  return c.text(generateLoonConfig(baseUrl, c.env), 200, { 'Content-Type': 'text/plain; charset=utf-8' });
});
app.get('/sub/checkin.plugin', (c) => {
  const baseUrl = new URL(c.req.url).origin;
  return c.text(generateLoonConfig(baseUrl, c.env), 200, { 'Content-Type': 'text/plain; charset=utf-8' });
});

// Quantumult X (.conf)
app.get('/sub/checkin.conf', (c) => {
  const baseUrl = new URL(c.req.url).origin;
  return c.text(generateQXConfig(baseUrl, c.env), 200, { 'Content-Type': 'text/plain; charset=utf-8' });
});

// Script file
app.get('/sub/script.js', (c) => {
  const baseUrl = new URL(c.req.url).origin;
  return c.text(generateCaptureScript(baseUrl, c.env), 200, { 'Content-Type': 'application/javascript; charset=utf-8' });
});

// ---------- Step 1: Get captcha SVG ----------

app.post('/api/providers/:pid/captcha', (c) => auth(c, async () => {
  const provider = getProvider(c.req.param('pid'));
  if (!provider) return c.json({ ok: false, message: '未知 provider' }, 400);
  const { device: existingDevice, forceNew } = await c.req.json().catch(() => ({}));
  // forceNew=true 时强制生成新设备（避免被频率限制）
  const device = (!forceNew && existingDevice) ? existingDevice : generateDeviceIdentity();
  const result = await provider.genCaptcha(device);
  if (!result.ok) {
    return c.json({ ok: false, message: result.error || '获取验证码失败' });
  }
  return c.json({ ok: true, svg: result.svgText, captchaId: result.captchaId, device });
}));

// ---------- Step 2: Confirm captcha + send email code (single call) ----------

app.post('/api/providers/:pid/email/send-code', (c) => auth(c, async () => {
  const provider = getProvider(c.req.param('pid'));
  if (!provider) return c.json({ ok: false, message: '未知 provider' }, 400);
  const { email, device, captchaId, inputCaptcha } = await c.req.json();
  if (!email) return c.json({ ok: false, message: '请输入邮箱' }, 400);
  if (!inputCaptcha) return c.json({ ok: false, message: '请输入图形验证码' }, 400);

  // 1) Confirm captcha (with nextApi to lock captcha for requestToVerifyEmail)
  console.log('[send-code] step1 confirmCaptcha, captchaId:', captchaId, 'input:', inputCaptcha);
  const cap = await provider.confirmCaptcha(device, captchaId, inputCaptcha);
  console.log('[send-code] confirmCaptcha =>', JSON.stringify({ retcode: cap?.retcode, retmsg: cap?.retmsg }));
  if (!cap || cap.retcode !== 0) {
    return c.json({ ok: false, message: cap?.retmsg || '验证码错误', retcode: cap?.retcode });
  }

  // 2) Send email code immediately (no createRoverAccount in between - it can cause captcha state loss)
  console.log('[send-code] step2 sendEmailCode to', email);
  const result = await provider.sendEmailCode(email, device);
  console.log('[send-code] sendEmailCode =>', JSON.stringify({ retcode: result?.retcode, retmsg: result?.retmsg, verifyid: result?.result?.verifyid }));
  if (!result || result.retcode !== 0) {
    return c.json({ ok: false, message: result?.retmsg || '发送失败', retcode: result?.retcode });
  }

  // 3) Create rover account in background (non-blocking, for later use)
  provider.createRoverAccount(device).catch(() => null);

  return c.json({ ok: true, verifyid: result.result?.verifyid || '', email, device });
}));

// ---------- Step 4: Verify code & register ----------

app.post('/api/providers/:pid/email/verify', (c) => auth(c, async () => {
  const provider = getProvider(c.req.param('pid'));
  if (!provider) return c.json({ ok: false, message: '未知 provider' }, 400);
  const { email, code, device, verifyid } = await c.req.json();
  if (!email || !code) return c.json({ ok: false, message: '邮箱和验证码必填' }, 400);
  const result = await provider.registerByEmail(email, code, device, verifyid);
  if (!result.ok) {
    return c.json({ ok: false, message: result.error || '注册失败' });
  }
  // Save: callpin is the auth token
  const data = { email, device, callpin: result.data?.callpin || '', ...result.data };
  const id = `${provider.id}:${data.callpin || email}`;
  const hash = await sha256Hex(JSON.stringify(data));
  await upsertAccount(c.env.DB, { id, provider: provider.id, alias: email, data, dataHash: hash });
  // Query balance
  let balance = null;
  try {
    const bal = await provider.queryBalance(data);
    if (bal && bal.retcode === 0) balance = bal.result?.balance;
  } catch (_) {}
  return c.json({ ok: true, message: '注册成功', email, balance });
}));

// ---------- Query balance for an account ----------

app.post('/api/accounts/:id/balance', (c) => auth(c, async () => {
  const id = c.req.param('id');
  const a = await getAccount(c.env.DB, id);
  if (!a) return c.json({ ok: false, message: '未找到' }, 404);
  const provider = getProvider(a.provider);
  if (!provider) return c.json({ ok: false, message: '未知 provider' }, 400);
  try {
    const bal = await provider.queryBalance(a.data);
    if (bal && bal.retcode === 0) {
      return c.json({ ok: true, balance: bal.result?.balance, data: bal.result });
    }
    return c.json({ ok: false, message: bal?.retmsg || '查询失败', retcode: bal?.retcode });
  } catch (e) {
    return c.json({ ok: false, message: e.message || '查询失败' });
  }
}));

// ---------- Settings: change password ----------

app.post('/api/settings/password', (c) => auth(c, async () => {
  const { oldPassword, newPassword } = await c.req.json();
  if (!newPassword || newPassword.length < 3) return c.json({ ok: false, message: '新密码至少3位' });
  // 获取当前有效密码（D1 覆盖 > 环境变量）
  let currentPwd = c.env.ADMIN_PASSWORD;
  try {
    const row = await c.env.DB.prepare(`SELECT value FROM app_settings WHERE key = 'admin_password'`).first();
    if (row && row.value) currentPwd = row.value;
  } catch (_) {}
  if (oldPassword !== currentPwd) return c.json({ ok: false, message: '原密码错误' });
  await c.env.DB.prepare(
    `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('admin_password', ?)`
  ).bind(newPassword).run();
  return c.json({ ok: true, message: '密码已修改，下次登录生效' });
}));

// ---------- Auto-register: random email ----------

app.post('/api/providers/:pid/email/auto-register', (c) => auth(c, async () => {
  const provider = getProvider(c.req.param('pid'));
  if (!provider) return c.json({ ok: false, message: '未知 provider' }, 400);
  const device = generateDeviceIdentity();

  // 优先使用 CF Email (如果配置了域名)
  const cfDomain = c.env.CF_EMAIL_DOMAIN;
  let emailInfo;
  if (cfDomain) {
    const prefix = randomMailPrefix();
    const email = `${prefix}@${cfDomain}`;
    emailInfo = { email, token: '__cf__', type: 'cf' };
  } else {
    const tempMail = await createTempEmail();
    if (!tempMail) return c.json({ ok: false, message: '临时邮箱创建失败' });
    emailInfo = { email: tempMail.email, token: tempMail.token, type: 'evapmail' };
  }

  const captchaResult = await provider.genCaptcha(device);
  if (!captchaResult.ok) {
    return c.json({ ok: false, message: captchaResult.error || '获取验证码失败' });
  }

  return c.json({
    ok: true,
    step: 'captcha',
    svg: captchaResult.svgText,
    captchaId: captchaResult.captchaId,
    email: emailInfo.email,
    emailToken: emailInfo.token,
    emailType: emailInfo.type,
    device,
  });
}));

// Auto-register: after captcha confirmed, send code + wait + register
app.post('/api/providers/:pid/email/auto-continue', (c) => auth(c, async () => {
  const provider = getProvider(c.req.param('pid'));
  if (!provider) return c.json({ ok: false, message: '未知 provider' }, 400);
  const { email, emailToken, emailType, device, captchaId, inputCaptcha } = await c.req.json();
  if (!email || !inputCaptcha) return c.json({ ok: false, message: '参数不完整' }, 400);

  // 1) Confirm captcha (with nextApi to lock for requestToVerifyEmail)
  console.log('[auto] step1 confirmCaptcha...');
  const cap = await provider.confirmCaptcha(device, captchaId, inputCaptcha);
  console.log('[auto] confirmCaptcha result:', JSON.stringify({ retcode: cap?.retcode, retmsg: cap?.retmsg }));
  if (!cap || cap.retcode !== 0) {
    return c.json({ ok: false, message: cap?.retmsg || '验证码错误', retcode: cap?.retcode });
  }

  // 2) Send email code immediately (no createRoverAccount in between)
  console.log('[auto] step2 sendEmailCode to', email);
  const send = await provider.sendEmailCode(email, device);
  console.log('[auto] sendEmailCode result:', JSON.stringify({ retcode: send?.retcode, retmsg: send?.retmsg, verifyid: send?.result?.verifyid }));

  // Create rover account in background
  provider.createRoverAccount(device).catch(() => null);
  if (!send || send.retcode !== 0) {
    return c.json({ ok: false, message: send?.retmsg || '发送验证码失败', retcode: send?.retcode });
  }
  const verifyid = send.result?.verifyid || '';

  // 5) Wait for code: CF Email 或 evapmail
  console.log('[auto] step5 waitForCode, type:', emailType, 'email:', email);
  let code;
  if (emailType === 'cf') {
    code = await waitForCodeFromDB(c.env.DB, email, 12, 5000);
  } else {
    code = await waitForCode(emailToken, 12, 5000);
  }
  console.log('[auto] waitForCode result:', code ? 'got code' : 'TIMEOUT');
  if (!code) {
    return c.json({ ok: false, message: '等待邮件验证码超时' });
  }

  // 6) Register
  console.log('[auto] step6 registerByEmail...');
  const result = await provider.registerByEmail(email, code, device, verifyid);
  if (!result.ok) {
    return c.json({ ok: false, message: result.error || '注册失败' });
  }

  const data = { email, device, callpin: result.data?.callpin || '', ...result.data };
  const id = `${provider.id}:${data.callpin || email}`;
  const hash = await sha256Hex(JSON.stringify(data));
  await upsertAccount(c.env.DB, { id, provider: provider.id, alias: email, data, dataHash: hash });
  let balance = null;
  try {
    const bal = await provider.queryBalance(data);
    if (bal && bal.retcode === 0) balance = bal.result?.balance;
  } catch (_) {}
  return c.json({ ok: true, message: '注册成功', email, balance });
}));

// ---------- Manual Run (SSE streaming) ----------

app.get('/api/providers/:pid/run-stream', async (c) => {
  const token = readCookieToken(c.req);
  const ok = await isValidSession(c.env.DB, token);
  if (!ok) return c.json({ ok: false, message: 'unauthorized' }, 401);

  const pid = c.req.param('pid');
  const provider = getProvider(pid);
  if (!provider) return c.json({ ok: false, message: '未知 provider' }, 400);

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const send = (event, data) => {
    writer.write(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
  };

  // Run checkin in background, streaming logs
  const runTask = (async () => {
    try {
      const db = c.env.DB;
      initProxies(c.env.PROXY_URLS);

      // Detect and log egress IP
      const ip = await detectEgressIP();
      send('log', { time: nowCN(), level: 'info', message: `egress IP: ${ip}` });

      const accounts = await listAccounts(db, pid, { onlyEnabled: true });

      if (!accounts.length) {
        send('log', { time: nowCN(), level: 'warn', message: 'no enabled accounts' });
        send('done', { ok: false, summary: 'no accounts' });
        return;
      }

      send('log', { time: nowCN(), level: 'info', message: `run start (${accounts.length} accounts)` });
      let okN = 0, failN = 0;

      for (let i = 0; i < accounts.length; i++) {
        const a = accounts[i];
        const tag = `[${a.alias || a.id}]`;
        const proxy = getProxyForAccount(a.id);
        const log = (m, level = 'info') => send('log', { time: nowCN(), level, message: m });
        try {
          const r = await runCheckin(provider.host, a.data, tag, log, proxy);
          await updateRunStatus(db, a.id, r.status);
          r.ok ? okN++ : failN++;
        } catch (e) {
          failN++;
          send('log', { time: nowCN(), level: 'error', message: `${tag} error: ${e.message || e}` });
          await updateRunStatus(db, a.id, 'error');
        }
        if (i < accounts.length - 1) await sleep(3500);
      }

      const summary = `${okN} ok / ${failN} failed`;
      send('log', { time: nowCN(), level: 'info', message: `done: ${summary}` });
      send('done', { ok: failN === 0, summary });
      await appendLogs(db, pid, [{ message: summary, level: 'info', createdAt: nowCN() }]);
    } catch (e) {
      send('log', { time: nowCN(), level: 'error', message: `fatal: ${e.message || e}` });
      send('done', { ok: false, summary: 'error' });
    } finally {
      writer.close();
    }
  })();

  // Don't await runTask - let it stream
  c.executionCtx.waitUntil(runTask);

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
});

// Legacy non-streaming fallback
app.post('/api/providers/:pid/run', (c) => auth(c, async () => {
  const provider = getProvider(c.req.param('pid'));
  if (!provider) return c.json({ ok: false, message: '未知 provider' }, 400);
  const r = await provider.run(c.env, { skipDb: true });
  const logs = (r.logs || []).map(l => ({
    time: l.createdAt || '',
    level: l.level || 'info',
    message: l.message || '',
  }));
  return c.json({ ok: r.ok, summary: r.summary, logs });
}));

// ---------- Logs ----------

app.delete('/api/providers/:pid/logs', (c) => auth(c, async () => {
  await clearLogs(c.env.DB, c.req.param('pid'));
  return c.json({ ok: true });
}));

// ---------- Cron ----------

app.all('/__cron', async (c) => {
  for (const p of providers) {
    await p.run(c.env);
  }
  await pruneExpiredSessions(c.env.DB);
  return c.text('ok');
});

// ---------- Scheduled ----------

export default {
  fetch: app.fetch,
  async scheduled(event, env, ctx) {
    for (const p of providers) {
      ctx.waitUntil(p.run(env));
    }
    ctx.waitUntil(pruneExpiredSessions(env.DB));
    ctx.waitUntil(pruneEmailCodes(env.DB).catch(() => {}));
  },
  async email(message, env, ctx) {
    ctx.waitUntil(handleIncomingEmail(message, env.DB));
  },
};
