-- 简单 KV 表，用于存储设置（如自定义管理员密码）
CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
