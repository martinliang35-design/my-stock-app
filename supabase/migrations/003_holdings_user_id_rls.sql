-- 多用户数据隔离：为 holdings 增加 user_id，并按 auth.uid() 做 RLS
-- 执行前请确保 Supabase 项目已启用 Email Auth（Authentication -> Providers）

ALTER TABLE public.holdings
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.holdings.user_id IS '所属用户，RLS 按此列隔离；插入时由触发器自动填充 auth.uid()';

CREATE OR REPLACE FUNCTION public.set_holding_user_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS holdings_set_user_id ON public.holdings;
CREATE TRIGGER holdings_set_user_id
  BEFORE INSERT ON public.holdings
  FOR EACH ROW EXECUTE FUNCTION public.set_holding_user_id();

DROP POLICY IF EXISTS "允许所有人读取 holdings" ON public.holdings;
DROP POLICY IF EXISTS "允许所有人插入 holdings" ON public.holdings;
DROP POLICY IF EXISTS "允许所有人更新 holdings" ON public.holdings;
DROP POLICY IF EXISTS "允许所有人删除 holdings" ON public.holdings;

CREATE POLICY "用户仅可读本人持仓"
  ON public.holdings FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "用户仅可插入本人持仓"
  ON public.holdings FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "用户仅可更新本人持仓"
  ON public.holdings FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "用户仅可删除本人持仓"
  ON public.holdings FOR DELETE TO authenticated USING (user_id = auth.uid());
