-- Ensure StockTwits sentiment_history rows have the new stats fields without overwriting existing data

-- 1. Guarantee metadata and stats containers exist
UPDATE sentiment_history
SET metadata = COALESCE(metadata, '{}'::jsonb)
WHERE source = 'stocktwits' AND metadata IS NULL;

UPDATE sentiment_history
SET metadata = jsonb_set(metadata, '{stats}', '{}'::jsonb, true)
WHERE source = 'stocktwits' AND metadata->'stats' IS NULL;

-- 2. Backfill missing stats fields individually (skip rows that already have values)
UPDATE sentiment_history
SET metadata = jsonb_set(metadata, '{stats,sentiment_score}', to_jsonb(sentiment_score), true)
WHERE source = 'stocktwits'
  AND sentiment_score IS NOT NULL
  AND (metadata->'stats'->>'sentiment_score') IS NULL;

UPDATE sentiment_history
SET metadata = jsonb_set(metadata, '{stats,confidence_score}', to_jsonb(confidence_score), true)
WHERE source = 'stocktwits'
  AND confidence_score IS NOT NULL
  AND (metadata->'stats'->>'confidence_score') IS NULL;

UPDATE sentiment_history
SET metadata = jsonb_set(
      metadata,
      '{stats,message_count}',
      to_jsonb(
        COALESCE(
          NULLIF(metadata->'stats'->>'total_messages', '')::numeric,
          NULLIF(metadata->'stats'->>'message_count', '')::numeric,
          volume_indicator
        )
      ),
      true
    )
WHERE source = 'stocktwits'
  AND (metadata->'stats'->>'message_count') IS NULL
  AND (
    (metadata->'stats'->>'total_messages') IS NOT NULL OR
    (metadata->'stats'->>'message_count') IS NOT NULL OR
    volume_indicator IS NOT NULL
  );

UPDATE sentiment_history
SET metadata = jsonb_set(
      metadata,
      '{stats,total_messages}',
      to_jsonb(
        COALESCE(
          NULLIF(metadata->'stats'->>'total_messages', '')::numeric,
          NULLIF(metadata->'stats'->>'message_count', '')::numeric,
          volume_indicator
        )
      ),
      true
    )
WHERE source = 'stocktwits'
  AND (metadata->'stats'->>'total_messages') IS NULL
  AND (
    (metadata->'stats'->>'message_count') IS NOT NULL OR
    volume_indicator IS NOT NULL
  );

UPDATE sentiment_history
SET metadata = jsonb_set(
      metadata,
      '{stats,follower_sum}',
      to_jsonb(
        COALESCE(
          NULLIF(metadata->'stats'->>'follower_sum', '')::numeric,
          NULLIF(metadata->>'follower_sum', '')::numeric,
          engagement_score
        )
      ),
      true
    )
WHERE source = 'stocktwits'
  AND (metadata->'stats'->>'follower_sum') IS NULL
  AND (
    (metadata->>'follower_sum') IS NOT NULL OR
    engagement_score IS NOT NULL
  );

-- 3. Expose total_messages and follower_sum at the top level when absent
UPDATE sentiment_history
SET metadata = jsonb_set(
      metadata,
      '{total_messages}',
      to_jsonb(
        COALESCE(
          NULLIF(metadata->'stats'->>'total_messages', '')::numeric,
          NULLIF(metadata->'stats'->>'message_count', '')::numeric,
          volume_indicator
        )
      ),
      true
    )
WHERE source = 'stocktwits'
  AND (metadata->>'total_messages') IS NULL
  AND (
    (metadata->'stats'->>'total_messages') IS NOT NULL OR
    (metadata->'stats'->>'message_count') IS NOT NULL OR
    volume_indicator IS NOT NULL
  );

UPDATE sentiment_history
SET metadata = jsonb_set(
      metadata,
      '{follower_sum}',
      to_jsonb(
        COALESCE(
          NULLIF(metadata->'stats'->>'follower_sum', '')::numeric,
          engagement_score
        )
      ),
      true
    )
WHERE source = 'stocktwits'
  AND (metadata->>'follower_sum') IS NULL
  AND (
    (metadata->'stats'->>'follower_sum') IS NOT NULL OR
    engagement_score IS NOT NULL
  );
