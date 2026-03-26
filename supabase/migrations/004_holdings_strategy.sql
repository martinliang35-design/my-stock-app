-- 投资策略（每条持仓一份文本）
ALTER TABLE public.holdings
  ADD COLUMN IF NOT EXISTS strategy text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.holdings.strategy IS '投资策略（每条持仓的备注/策略文本）';

