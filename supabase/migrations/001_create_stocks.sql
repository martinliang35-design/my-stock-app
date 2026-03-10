CREATE TABLE IF NOT EXISTS public.stocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  name text NOT NULL,
  current_price numeric,
  change_percent numeric,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.stocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "允许所有人读取 stocks"
  ON public.stocks
  FOR SELECT
  TO anon, authenticated
  USING (true);
