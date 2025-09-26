-- Grant SELECT permission to public and authenticated roles
GRANT SELECT ON public.trades TO public;
GRANT SELECT ON public.trades TO authenticated;
GRANT SELECT ON public.trades TO anon;

-- Check if sequence exists and grant if it does
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_sequences WHERE sequencename = 'trades_trade_id_seq' AND schemaname = 'public') THEN
        GRANT USAGE ON SEQUENCE public.trades_trade_id_seq TO public;
        GRANT USAGE ON SEQUENCE public.trades_trade_id_seq TO authenticated;
        GRANT USAGE ON SEQUENCE public.trades_trade_id_seq TO anon;
    END IF;
END $$;