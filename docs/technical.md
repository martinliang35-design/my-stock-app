# Stock-Cloud 技术设计文档

## 1. 技术栈

| 类别 | 技术 | 说明 |
|------|------|------|
| 框架 | Next.js 16 (App Router) | 前端 + 服务端 API 路由，React 19。 |
| 语言 | TypeScript | 全项目 TS。 |
| 样式 | Tailwind CSS 4 | 原子类 + 全局主题（如 `globals.css` 中的变量）。 |
| 数据库 | Supabase (PostgreSQL) | 持仓表存储、RLS 策略。 |
| 图表 | Chart.js + react-chartjs-2 | 饼图、柱状图。 |
| K 线 | ECharts | K 线弹窗。 |
| 客户端 | @supabase/supabase-js | 浏览器直连 Supabase（需配置 anon key）；含 Auth 会话管理。 |

---

## 2. 项目结构（与维护相关）

```
stock-cloud/
├── app/
│   ├── layout.tsx
│   ├── page.tsx             # 首页 /，由 AuthGuard 控制：未登录显示登录/注册，已登录显示看板
│   ├── globals.css
│   └── api/
│       ├── price/route.ts   # GET 行情现价（A/港/美）
│       ├── rates/route.ts   # GET 汇率（USD/HKD → CNY）
│       └── kline/route.ts   # GET K 线数据（A/港）
├── components/
│   ├── AuthGuard.tsx
│   ├── AuthForm.tsx
│   ├── HoldingsDashboard.tsx
│   ├── HoldingsTable.tsx
│   ├── ChartsSection.tsx
│   └── KlineModal.tsx
├── lib/
│   ├── supabase.ts
│   ├── holdings.ts
│   ├── format.ts
│   └── metrics.ts
├── supabase/migrations/
│   ├── 001_create_stocks.sql
│   ├── 002_create_holdings.sql
│   └── 003_holdings_user_id_rls.sql
├── docs/
│   ├── README.md
│   ├── requirements.md
│   └── technical.md
├── .env.local
├── package.json
├── tsconfig.json
└── next.config.ts
```

---

## 3. 数据流概览

1. **页面加载**：`app/page.tsx` 渲染 `AuthGuard` → 若未登录显示 `AuthForm`，若已登录显示 `HoldingsDashboard` → 调用 `fetchHoldings()`（Supabase 带 JWT，RLS 仅返回当前 user_id 的行）→ 展示表格与汇总。
2. **刷新股价**：看板对每条持仓请求 `GET /api/price` → 服务端请求第三方行情 → 返回 `{ price }` → 看板用 `updateHolding(id, { current_price })` 写回 Supabase → 再拉一次列表刷新 UI。
3. **汇率**：看板请求 `GET /api/rates` 得到 `{ usdToCny, hkdToCny }`，并写入 localStorage；汇总时用本地 `rates` 折算港/美市值。
4. **K 线**：点击行 → 打开 `KlineModal` → 请求 `GET /api/kline` → 渲染 ECharts。

---

## 4. 接口说明（API Routes）

### 4.1 GET /api/price

获取单只股票当前价。请求参数：`code`（必填）、`market`（可选，A | HK | US）。成功：`200`，`{ "price": number }`。数据源：A/港优先东方财富、新浪；美股优先新浪，失败时尝试 Yahoo。

### 4.2 GET /api/rates

获取汇率。无参数。成功：`200`，`{ "usdToCny": number, "hkdToCny": number }`。数据源：Frankfurter API。

### 4.3 GET /api/kline

获取 K 线数据。请求参数：`code`（必填）、`market`（可选，A | HK）。成功：`200`，`{ "dates", "klineData", "volumeData" }`。美股暂不支持。

---

## 5. 数据库设计

### 5.1 表：holdings

字段：id, user_id, code, name, market, quantity, cost_price, current_price, sort_order, created_at, updated_at。RLS：SELECT/UPDATE/DELETE 仅当 user_id = auth.uid()；INSERT 由触发器自动填 user_id。

### 5.2 表：stocks

见 `001_create_stocks.sql`，预留，当前前端未使用。

---

## 6. 环境与部署

环境变量：`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`。首次克隆可将 `.env.example` 复制为 `.env.local` 并填入上述变量。多用户迁移：在 Supabase 控制台执行 `003_holdings_user_id_rls.sql`，并确保 Email Auth 已启用。本地开发：`npm run dev`。构建与生产：`npm run build`、`npm run start`。

---

## 7. 变更记录

| 日期 | 变更内容 |
|------|----------|
| 初稿 | 基于当前代码整理技术栈、结构、接口、数据库与维护说明。 |
| v0.2 | 增加 AuthGuard、AuthForm；holdings 表增加 user_id、触发器与 RLS。 |
