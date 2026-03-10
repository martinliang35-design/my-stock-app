-- 持仓表：多市场个人股票持仓
CREATE TABLE IF NOT EXISTS public.holdings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL DEFAULT '',
  name text DEFAULT '',
  market text NOT NULL DEFAULT 'A' CHECK (market IN ('A', 'HK', 'US')),
  quantity numeric NOT NULL DEFAULT 0,
  cost_price numeric NOT NULL DEFAULT 0,
  current_price numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.holdings IS '多市场个人股票持仓';
COMMENT ON COLUMN public.holdings.code IS '股票代码';
COMMENT ON COLUMN public.holdings.name IS '股票名称';
COMMENT ON COLUMN public.holdings.market IS '市场: A=A股, HK=港股, US=美股';
COMMENT ON COLUMN public.holdings.quantity IS '持仓数量';
COMMENT ON COLUMN public.holdings.cost_price IS '成本价';
COMMENT ON COLUMN public.holdings.current_price IS '现价';
COMMENT ON COLUMN public.holdings.sort_order IS '拖拽排序序号';

ALTER TABLE public.holdings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "允许所有人读取 holdings" ON public.holdings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "允许所有人插入 holdings" ON public.holdings FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "允许所有人更新 holdings" ON public.holdings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "允许所有人删除 holdings" ON public.holdings FOR DELETE TO anon, authenticated USING (true);
