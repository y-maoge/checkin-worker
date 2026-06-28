// 生成独立随机设备标识 — 每个注册账号用不同设备指纹

const MODELS = [
  'iPhone14,5', 'iPhone14,2', 'iPhone14,3', 'iPhone14,4',
  'iPhone15,2', 'iPhone15,3', 'iPhone15,4', 'iPhone15,5',
  'iPhone16,1', 'iPhone16,2', 'iPhone17,1', 'iPhone17,2',
  'iPhone13,2', 'iPhone13,3', 'iPhone13,4',
  'iPhone12,1', 'iPhone12,3', 'iPhone12,5',
];

const IOS_VERSIONS = [
  '16.0', '16.1', '16.2', '16.3', '16.4', '16.5', '16.6',
  '17.0', '17.1', '17.2', '17.3', '17.4', '17.5',
  '18.0', '18.1', '18.2', '18.3', '18.4',
];

const APP_VERSIONS = [
  '30.5.0', '30.5.1', '30.6.0',
];

/**
 * 生成随机 UUID (v4)
 */
export function randomUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  }).toUpperCase();
}

/**
 * 从数组中随机选一个
 */
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * 生成 UTC 格式的日期字符串 (installTime)
 */
function utcDateStr() {
  const n = new Date();
  const p = v => String(v).padStart(2, '0');
  return `${n.getUTCFullYear()}-${p(n.getUTCMonth() + 1)}-${p(n.getUTCDate())} ${p(n.getUTCHours())}:${p(n.getUTCMinutes())}:${p(n.getUTCSeconds())}`;
}

/**
 * 生成完整的独立设备身份
 * @returns {{ deviceUID: string, model: string, osVersion: string, appVersion: string, platform: string, installTime: string }}
 */
export function generateDeviceIdentity() {
  return {
    deviceUID: randomUUID(),
    model: pick(MODELS),
    osVersion: pick(IOS_VERSIONS),
    appVersion: pick(APP_VERSIONS),
    platform: 'ios',
    installTime: utcDateStr(),
  };
}
