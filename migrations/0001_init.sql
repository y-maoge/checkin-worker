-- 通用账号表(provider 多态),data 列存 JSON
CREATE TABLE IF NOT EXISTS accounts (
  id          TEXT PRIMARY KEY,           -- '<provider>:<localId>',localId 由 provider 决定
  provider    TEXT NOT NULL,              -- 'iios' | 'wetalk' | ...
  alias       TEXT,                       -- 显示名,用户可改
  enabled     INTEGER NOT NULL DEFAULT 1, -- 0/1
  data        TEXT NOT NULL,              -- JSON 串(provider 自描述,签到所需的全部输入)
  data_hash   TEXT NOT NULL,              -- SHA-256(data),上报去重用
  last_run_at TEXT,
  last_status TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_accounts_provider ON accounts (provider, enabled);

-- 签到日志(全 provider 共用,按 provider 过滤)
CREATE TABLE IF NOT EXISTS logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  provider   TEXT NOT NULL,
  level      TEXT NOT NULL DEFAULT 'info', -- info | warn | error
  message    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_logs_provider_time ON logs (provider, created_at DESC);

-- 登录会话(替代原内存 Map,Worker 多实例间共享)
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_exp ON sessions (expires_at);
