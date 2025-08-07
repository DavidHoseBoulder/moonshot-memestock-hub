-- Fix the function security issue by setting search_path
CREATE OR REPLACE FUNCTION public.is_market_data_fresh(symbol_param TEXT, hours_threshold INTEGER DEFAULT 24)
RETURNS BOOLEAN 
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1 FROM public.enhanced_market_data 
    WHERE symbol = symbol_param 
    AND created_at > NOW() - INTERVAL '1 hour' * hours_threshold
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;