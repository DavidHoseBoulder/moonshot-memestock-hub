\set ON_ERROR_STOP on

BEGIN;

DROP TABLE IF EXISTS pg_temp.stage_b64;
CREATE TEMP TABLE pg_temp.stage_b64(line text);

\copy pg_temp.stage_b64(line) FROM '/tmp/reddit_clean.b64' WITH (FORMAT text)

DROP TABLE IF EXISTS pg_temp.stage_json;
CREATE TEMP TABLE pg_temp.stage_json(doc jsonb);

INSERT INTO pg_temp.stage_json(doc)
SELECT convert_from(decode(line, 'base64'), 'UTF8')::jsonb
FROM pg_temp.stage_b64
WHERE line <> '';

-- After filling pg_temp.stage_json handle de-dupe on id so newer backfills win.
INSERT INTO public.reddit_finance_keep_norm (
  id,
  subreddit,
  author,
  created_utc,
  title,
  selftext,
  score,
  num_comments,
  permalink,
  post_id
)
SELECT DISTINCT ON (id)
  COALESCE(doc->>'post_id', doc->>'id')                           AS id,
  doc->>'subreddit'                                              AS subreddit,
  NULLIF(doc->>'author','')                                      AS author,
  CASE
    WHEN (doc->>'created_utc') ~ '^\d+$' THEN to_timestamp((doc->>'created_utc')::bigint) AT TIME ZONE 'UTC'
    WHEN doc ? 'created_utc_iso' THEN (doc->>'created_utc_iso')::timestamptz
    ELSE NULL
  END                                                             AS created_utc,
  COALESCE(doc->>'title','')                                      AS title,
  COALESCE(doc->>'selftext','')                                   AS selftext,
  NULLIF(doc->>'score','')::integer                               AS score,
  NULLIF(doc->>'num_comments','')::integer                        AS num_comments,
  NULLIF(doc->>'permalink','')                                    AS permalink,
  COALESCE(doc->>'post_id', doc->>'id')                           AS post_id
FROM pg_temp.stage_json
WHERE jsonb_typeof(doc) = 'object'
ORDER BY id
ON CONFLICT (id) DO UPDATE
  SET subreddit   = EXCLUDED.subreddit,
      author      = COALESCE(EXCLUDED.author, reddit_finance_keep_norm.author),
      created_utc = COALESCE(EXCLUDED.created_utc, reddit_finance_keep_norm.created_utc),
      title       = EXCLUDED.title,
      selftext    = EXCLUDED.selftext,
      score       = COALESCE(EXCLUDED.score, reddit_finance_keep_norm.score),
      num_comments= COALESCE(EXCLUDED.num_comments, reddit_finance_keep_norm.num_comments),
      permalink   = COALESCE(EXCLUDED.permalink, reddit_finance_keep_norm.permalink),
      post_id     = COALESCE(EXCLUDED.post_id, reddit_finance_keep_norm.post_id);

COMMIT;
