-- Initialize staging and summary tables for TA scenario sweeps
\set ON_ERROR_STOP on

-- Staging table for CSV loads (overwrite each run)
DROP TABLE IF EXISTS ta_scenario_staging;
CREATE TABLE ta_scenario_staging (
  model_version text,
  start_date date,
  end_date date,
  symbol text,
  horizon text,
  side text,
  min_mentions int,
  pos_thresh numeric,
  band text,
  trades int,
  avg_ret numeric,
  median_ret numeric,
  win_rate numeric,
  stdev_ret numeric,
  sharpe numeric,
  train_trades int,
  valid_trades int,
  train_sharpe numeric,
  valid_sharpe numeric,
  r_train_rank int,
  r_valid_rank int,
  lb numeric
);

-- Summary table accumulates one row per scenario
CREATE TABLE IF NOT EXISTS ta_scenario_summary (
  id bigserial PRIMARY KEY,
  scenario text,
  run_ts timestamptz DEFAULT now(),
  start_date date,
  end_date date,
  volume_ratio_pctl numeric,
  volume_share_pctl numeric,
  min_volume_ratio numeric,
  min_volume_share numeric,
  min_volume_z numeric,
  rsi_long_max numeric,
  rsi_short_min numeric,
  require_lb_positive int,
  trades int,
  avg_ret numeric,
  median_ret numeric,
  win_rate numeric,
  sharpe numeric,
  lb_avg numeric
);

ALTER TABLE ta_scenario_summary
  ADD COLUMN IF NOT EXISTS id bigserial;

ALTER TABLE ta_scenario_summary
  DROP CONSTRAINT IF EXISTS ta_scenario_summary_pkey;

ALTER TABLE ta_scenario_summary
  ADD PRIMARY KEY (id);

ALTER TABLE ta_scenario_summary
  ADD COLUMN IF NOT EXISTS rsi_long_max numeric;

ALTER TABLE ta_scenario_summary
  ADD COLUMN IF NOT EXISTS rsi_short_min numeric;
