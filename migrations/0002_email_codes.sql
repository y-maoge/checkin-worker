-- 邮件验证码临时存储 (CF Email Workers 收到的验证码)
CREATE TABLE IF NOT EXISTS email_codes (
  address   TEXT PRIMARY KEY,       -- 收件地址 (如 abc123@your-domain.com)
  code      TEXT NOT NULL,          -- 提取到的验证码
  subject   TEXT DEFAULT '',        -- 邮件主题
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_email_codes_time ON email_codes (created_at);
