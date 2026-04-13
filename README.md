# Stock-Cloud

多市场个人股票持仓看板（Next.js + Supabase），支持 A 股、港股、美股，数据云端存储，登录后按用户隔离。

## 快速开始

```bash
npm install
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。未登录会显示登录/注册页；登录后进入持仓看板。

## 环境变量

首次克隆后，复制 `.env.example` 为 `.env.local` 并填入真实值，可减少漏配导致的启动或 500 问题：

```bash
cp .env.example .env.local
```

在 `.env.local` 中配置：

- `NEXT_PUBLIC_SUPABASE_URL`：Supabase 项目 URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`：Supabase 匿名公钥
- `NEXT_PUBLIC_SITE_URL`：站点访问地址（用于忘记密码邮件回跳），例如 `https://mystockdashboard.top`（本地可用 `http://localhost:3000`）

## 数据库

在 Supabase 控制台 SQL Editor 中依次执行：

- `supabase/migrations/002_create_holdings.sql`（创建持仓表）
- `supabase/migrations/003_holdings_user_id_rls.sql`（多用户隔离：user_id + RLS）

Email 登录默认已开启。若启用“忘记密码”，请在 Supabase 控制台 `Authentication -> URL Configuration` 中配置：

- `Site URL`：`https://mystockdashboard.top`
- `Redirect URLs` 至少包含：
  - `https://mystockdashboard.top/reset-password`
  - `http://localhost:3000/reset-password`

## 项目文档

- [文档索引](docs/README.md)
- [需求说明](docs/requirements.md)
- [技术设计](docs/technical.md)

## 美股行情

使用新浪财经接口，国内可直接访问；若不可用会尝试 Yahoo（境外可能可用）。
