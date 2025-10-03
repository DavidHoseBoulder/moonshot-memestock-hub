-- Grant permissions to authenticated users on trades table
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trades TO authenticated;

-- Grant usage on the sequence if the table has a serial/bigserial column
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;