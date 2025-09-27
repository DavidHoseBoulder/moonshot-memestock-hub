-- Deactivate symbols that consistently return 404 errors (likely OTC/delisted)
UPDATE ticker_universe 
SET active = false, 
    updated_at = now()
WHERE symbol IN (
  'ATER', 'BBIG', 'CTRM', 'CYTO', 'FRCB', 'HYMC', 'ILAG', 
  'MCOM', 'MEGL', 'MULN', 'TTOO', 'DWAC', 'NKLA', 'SQ'
);