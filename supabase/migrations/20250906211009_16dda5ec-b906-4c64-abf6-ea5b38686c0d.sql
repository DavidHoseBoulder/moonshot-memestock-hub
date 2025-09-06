-- Create function to get global rule defaults (median of enabled rules)
CREATE OR REPLACE FUNCTION get_global_rule_defaults(p_model_version text)
RETURNS TABLE (
  def_min_posts integer,
  def_min_score numeric,
  def_min_conf numeric
)
LANGUAGE sql
STABLE
AS $$
  WITH r AS (
    SELECT min_mentions, pos_thresh, min_conf
    FROM live_sentiment_entry_rules
    WHERE is_enabled = true
      AND model_version = p_model_version
  )
  SELECT
    percentile_disc(0.5) WITHIN GROUP (ORDER BY min_mentions)::int AS def_min_posts,
    percentile_disc(0.5) WITHIN GROUP (ORDER BY pos_thresh)        AS def_min_score,
    percentile_disc(0.5) WITHIN GROUP (ORDER BY min_conf)          AS def_min_conf
  FROM r;
$$;