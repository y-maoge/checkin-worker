# WePing

基于 Cloudflare Workers 的 WeTalk / PingMe 自动签到 + 视频奖励系统。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Yu9191/weping)

## 功能

- 支持 WeTalk 和 PingMe 两个应用
- 代理工具自动抓取账号数据（Surge / Loon / QX / Shadowrocket / Stash）
- 自动签到 + 视频奖励（定时执行）
- 手动执行 + 实时日志
- 实时查询账号余额
- 账号数据自动去重（持久化缓存）
- 一键部署（零配置）

## 一键部署

点击上方 **Deploy to Cloudflare** 按钮：

1. 登录 Cloudflare 账号
2. 授权 GitHub 仓库 fork
3. 自动创建 D1 数据库并部署 Worker
4. 访问 Worker URL，默认密码 `baby`

> Worker 首次请求时自动建表，无需手动执行 SQL。

## 手动部署

```bash
npm install
npx wrangler login
npx wrangler d1 create checkin
# 将输出的 database_id 填入 wrangler.toml
npx wrangler deploy
```

## 使用方法

### 添加账号（代理工具抓取）

1. 在代理工具中添加模块/订阅：
   - **Surge / Egern**: 模块 → 安装新模块 → 粘贴 `.sgmodule` 地址
   - **Loon**: 配置 → 插件 → + → 粘贴 `.lpx` 地址
   - **Quantumult X**: 风车 → 重写 → 引用 → 粘贴 `.conf` 地址
   - **Shadowrocket**: 配置 → 模块 → + → 使用 Surge 地址

2. 打开 WeTalk / PingMe APP（触发 `queryBalanceAndBonus` 请求）
3. 脚本自动拦截并上传账号数据到 Worker
4. 数据无变化时静默跳过，不重复通知

### 签到执行

- **自动**: Cron `20 */3 * * *`（每3小时执行一次）
- **手动**: 后台点击「执行签到」按钮

### 账号管理

- 余额查询 / 停用 / 启用 / 删除
- 手动导入（填写 callpin）

## 可选：IP 轮询代理

部署多个中转 Worker（不同 CF 账号）实现多 IP：

```bash
cd proxy-relay
npx wrangler deploy
```

在主 Worker `wrangler.toml` 中配置：
```toml
PROXY_URLS = "https://relay1.xxx.workers.dev,https://relay2.yyy.workers.dev"
```

## 技术栈

- Cloudflare Workers + Hono
- D1 (SQLite)
- 定时触发器 (Cron Triggers)

## 注意事项

- WeTalk API: `api.wetalkapp.com`
- PingMe API: `api.pingmeapp.net`
- 默认密码 `baby`，部署后可在后台修改
- 视频奖励每天有上限
- 模块作者: @Yu9191
- 原作者: TG@ZenMoFiShi
