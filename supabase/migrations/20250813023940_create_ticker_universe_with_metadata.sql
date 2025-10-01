-- Create ticker_universe table for active tickers used by pipeline
CREATE TABLE IF NOT EXISTS public.ticker_universe (
  symbol text PRIMARY KEY,
  name text,
  sector text,
  active boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ticker_universe ENABLE ROW LEVEL SECURITY;

-- Policies: public read, public insert/update (match existing pattern)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ticker_universe' AND policyname = 'Public read access for ticker_universe'
  ) THEN
    CREATE POLICY "Public read access for ticker_universe"
      ON public.ticker_universe
      FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ticker_universe' AND policyname = 'Public insert access for ticker_universe'
  ) THEN
    CREATE POLICY "Public insert access for ticker_universe"
      ON public.ticker_universe
      FOR INSERT
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ticker_universe' AND policyname = 'Public update access for ticker_universe'
  ) THEN
    CREATE POLICY "Public update access for ticker_universe"
      ON public.ticker_universe
      FOR UPDATE
      USING (true);
  END IF;
END $$;

-- Update trigger for updated_at
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_ticker_universe_updated_at'
  ) THEN
    CREATE TRIGGER update_ticker_universe_updated_at
    BEFORE UPDATE ON public.ticker_universe
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- Seed core tickers if not present
INSERT INTO public.ticker_universe (symbol, name, sector, active, priority)
VALUES
  ('AAPL','Apple Inc','Technology', true, 1),
  ('TSLA','Tesla Inc','Consumer Discretionary', true, 2),
  ('NVDA','NVIDIA Corp','Technology', true, 3),
  ('GME','GameStop Corp','Consumer Discretionary', true, 10),
  ('SPY','SPDR S&P 500 ETF Trust','ETF', true, 20)
ON CONFLICT (symbol) DO NOTHING;