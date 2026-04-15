-- 扩展 market 字段的 CHECK 约束，添加 FUND 类型
ALTER TABLE public.holdings
DROP CONSTRAINT IF EXISTS holdings_market_check;

ALTER TABLE public.holdings
ADD CONSTRAINT holdings_market_check CHECK (market IN ('A', 'HK', 'US', 'FUND'));

COMMENT ON COLUMN public.holdings.market IS '市场: A=A股, HK=港股, US=美股, FUND=基金';
