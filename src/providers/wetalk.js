// WeTalk provider
import { genCaptcha, confirmCaptcha, createRoverAccount, sendEmailCode, registerByEmail, runCheckin, queryBalance, detectEgressIP } from '../lib/engine.js';
import { listAccounts, updateRunStatus, appendLogs, nowCN } from '../lib/db.js';
import { sleep } from '../lib/http.js';
import { initProxies, getProxyForAccount, getNextProxy } from '../lib/proxy.js';

const PROVIDER = 'wetalk';
const HOST = 'api.wetalkapp.com';
const ACCOUNT_GAP_MS = 3500;

export const wetalk = {
  id: PROVIDER,
  name: 'WeTalk',
  host: HOST,

  describeAccount(a) {
    const email = a.data?.email || '';
    const subtitle = a.last_status
      ? `${a.last_run_at} - ${a.last_status}`
      : (email || 'pending');
    return { title: a.alias || a.id, subtitle };
  },

  async genCaptcha(device, proxyUrl) { return genCaptcha(HOST, device, proxyUrl || getNextProxy()); },
  async confirmCaptcha(device, captchaId, inputCaptcha, proxyUrl) { return confirmCaptcha(HOST, device, captchaId, inputCaptcha, proxyUrl || getNextProxy()); },
  async createRoverAccount(device, proxyUrl) { return createRoverAccount(HOST, device, proxyUrl || getNextProxy()); },
  async sendEmailCode(email, device, proxyUrl) { return sendEmailCode(HOST, email, device, proxyUrl || getNextProxy()); },
  async registerByEmail(email, code, device, verifyid, proxyUrl) { return registerByEmail(HOST, email, code, device, verifyid, proxyUrl || getNextProxy()); },
  async queryBalance(accountData, proxyUrl) { return queryBalance(HOST, accountData, proxyUrl); },

  async run(env, { skipDb = false } = {}) {
    const db = env.DB;
    initProxies(env.PROXY_URLS);
    const accounts = await listAccounts(db, PROVIDER, { onlyEnabled: true });
    const logs = [];
    const log = (m, level = 'info') => logs.push({ message: m, level, createdAt: nowCN() });

    if (!accounts.length) {
      log('no enabled accounts', 'warn');
      if (!skipDb) await appendLogs(db, PROVIDER, logs);
      return { ok: false, summary: 'no accounts', logs };
    }

    const ip = await detectEgressIP();
    log(`run start (${accounts.length} accounts) IP: ${ip}`);
    let okN = 0, failN = 0;

    for (let i = 0; i < accounts.length; i++) {
      const a = accounts[i];
      const tag = `[${a.alias || a.id}]`;
      const proxy = getProxyForAccount(a.id);
      try {
        const r = await runCheckin(HOST, a.data, tag, log, proxy);
        if (!skipDb) await updateRunStatus(db, a.id, r.status);
        r.ok ? okN++ : failN++;
      } catch (e) {
        failN++;
        log(`${tag} error: ${e.message || e}`, 'error');
        if (!skipDb) await updateRunStatus(db, a.id, 'error');
      }
      if (i < accounts.length - 1) await sleep(ACCOUNT_GAP_MS);
    }

    log(`done: ${okN} ok / ${failN} failed`);
    if (!skipDb) await appendLogs(db, PROVIDER, logs);
    return { ok: failN === 0, summary: `${okN} ok / ${failN} failed`, logs };
  },
};
