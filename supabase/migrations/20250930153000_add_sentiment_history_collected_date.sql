-- Adds collected_date helper column and trigger to keep it in sync for daily lookups

ALTER TABLE public.sentiment_history
    ADD COLUMN IF NOT EXISTS collected_date date;

UPDATE public.sentiment_history
SET collected_date = (collected_at AT TIME ZONE 'UTC')::date
WHERE collected_date IS NULL;

CREATE OR REPLACE FUNCTION public.set_sentiment_collected_date()
RETURNS trigger AS $$
BEGIN
  NEW.collected_date := (NEW.collected_at AT TIME ZONE 'UTC')::date;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sentiment_collected_date ON public.sentiment_history;

CREATE TRIGGER trg_sentiment_collected_date
BEFORE INSERT OR UPDATE ON public.sentiment_history
FOR EACH ROW
EXECUTE FUNCTION public.set_sentiment_collected_date();

CREATE INDEX IF NOT EXISTS idx_sentiment_history_stocktwits_collected_date
    ON public.sentiment_history (collected_date, symbol)
    WHERE source = 'stocktwits';
