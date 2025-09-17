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

-- after filling pg_temp.stage_json …
INSERT INTO public.reddit_finance_keep_norm (id, subreddit, author, created_utc, title, selftext)
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
  COALESCE(doc->>'selftext','')                                   AS selftext
FROM pg_temp.stage_json
WHERE jsonb_typeof(doc) = 'object'
ORDER BY id
ON CONFLICT (id) DO UPDATE
  SET subreddit   = EXCLUDED.subreddit,
      author      = EXCLUDED.author,
      created_utc = EXCLUDED.created_utc,
      title       = EXCLUDED.title,
      selftext    = EXCLUDED.selftext;

COMMIT;
