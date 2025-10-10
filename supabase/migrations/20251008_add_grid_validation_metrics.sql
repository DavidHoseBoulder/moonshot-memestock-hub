-- Add train/valid metrics to backtest_sweep_grid so we can promote using validation folds

ALTER TABLE public.backtest_sweep_grid
  ADD COLUMN IF NOT EXISTS train_trades integer,
  ADD COLUMN IF NOT EXISTS train_sharpe numeric,
  ADD COLUMN IF NOT EXISTS train_win_rate numeric,
  ADD COLUMN IF NOT EXISTS train_avg_ret numeric,
  ADD COLUMN IF NOT EXISTS valid_trades integer,
  ADD COLUMN IF NOT EXISTS valid_sharpe numeric,
  ADD COLUMN IF NOT EXISTS valid_win_rate numeric,
  ADD COLUMN IF NOT EXISTS valid_avg_ret numeric;

ALTER TABLE public.backtest_sweep_results
  ADD COLUMN IF NOT EXISTS train_trades integer,
  ADD COLUMN IF NOT EXISTS train_sharpe numeric,
  ADD COLUMN IF NOT EXISTS train_win_rate numeric,
  ADD COLUMN IF NOT EXISTS train_avg_ret numeric,
  ADD COLUMN IF NOT EXISTS valid_trades integer,
  ADD COLUMN IF NOT EXISTS valid_sharpe numeric,
  ADD COLUMN IF NOT EXISTS valid_win_rate numeric,
  ADD COLUMN IF NOT EXISTS valid_avg_ret numeric;

COMMENT ON TABLE public.backtest_sweep_grid IS
  'Grid backtest results including train/validation metrics for each (symbol,horizon,side,min_mentions,pos_thresh).';

COMMENT ON TABLE public.backtest_sweep_results IS
  'Best grid configuration per (symbol,horizon,side) including train/validation metrics.';
