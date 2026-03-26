-- 为全局投资策略提供云端持久化
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS investment_strategy text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.profiles.investment_strategy IS '全局投资策略（用户级，云端持久化）';
