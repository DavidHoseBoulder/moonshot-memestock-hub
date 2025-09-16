BEGIN;
SET client_min_messages = warning;
SET search_path = public;

-- 1) Load the already-cleaned file (ALWAYS the fixed path)
DROP TABLE IF EXISTS pg_temp.stage_lines;
CREATE TEMP TABLE pg_temp.stage_lines(line text) ON COMMIT DROP;

\copy pg_temp.stage_lines(line) FROM '/tmp/reddit_clean.ndjson' WITH (FORMAT text)

-- 2) Number lines as BIGINT to match the helper signature
DROP TABLE IF EXISTS pg_temp.stage_numbered;
CREATE TEMP TABLE pg_temp.stage_numbered AS
SELECT row_number() OVER ()::bigint AS rn, line
FROM pg_temp.stage_lines;

-- 3) Helper that safely casts to JSONB (accepts BIGINT)
CREATE OR REPLACE FUNCTION pg_temp.try_jsonb(_rn bigint, t text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN t::jsonb;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'bad JSON at line %: %', _rn, SQLERRM;
  RETURN NULL;
END
$$;

-- 4) Parse each line with server-side JSON, keep only valid rows
DROP TABLE IF EXISTS pg_temp.stage_parsed;
CREATE TEMP TABLE pg_temp.stage_parsed AS
SELECT rn, pg_temp.try_jsonb(rn, line) AS doc
FROM pg_temp.stage_numbered;

DROP TABLE IF EXISTS pg_temp.stage_json;
CREATE TEMP TABLE pg_temp.stage_json(doc jsonb);

INSERT INTO pg_temp.stage_json(doc)
SELECT doc
FROM pg_temp.stage_parsed
WHERE doc IS NOT NULL;

-- FINAL INSERT: move parsed rows into the real table
INSERT INTO public.reddit_comments (
  comment_id,
  post_id,
  subreddit,
  author,
  body,
  created_utc,
  score,
  parent_id,
  depth,
  is_submitter,
  permalink
)
SELECT
  doc->>'id'                                                          AS comment_id,
  COALESCE(
    doc->>'post_id',
    (regexp_match(doc->>'permalink','^/r/[^/]+/comments/([^/]+)'))[1]
  )                                                                   AS post_id,
  COALESCE(doc->>'subreddit','unknown')                               AS subreddit,
  NULLIF(doc->>'author','')                                           AS author,
  COALESCE(doc->>'body','')                                           AS body,
  CASE
    WHEN (doc->>'created_utc') ~ '^[0-9]+(\.[0-9]+)?$'
      THEN to_timestamp((doc->>'created_utc')::double precision)
    WHEN doc ? 'created_utc_iso'
      THEN (doc->>'created_utc_iso')::timestamptz
    ELSE NULL
  END                                                                 AS created_utc,
  NULLIF(doc->>'score','')::int                                       AS score,
  NULLIF(doc->>'parent_id','')                                        AS parent_id,
  NULLIF(doc->>'depth','')::int                                       AS depth,
  CASE
    WHEN lower(coalesce(doc->>'is_submitter','')) IN ('true','t','1')  THEN true
    WHEN lower(coalesce(doc->>'is_submitter','')) IN ('false','f','0') THEN false
    ELSE NULL
  END                                                                 AS is_submitter,
  NULLIF(doc->>'permalink','')                                        AS permalink
FROM pg_temp.stage_json
WHERE jsonb_typeof(doc) = 'object'
  AND doc ? 'id'
  AND coalesce(doc->>'id','') <> ''
  AND (
        (doc ? 'created_utc' AND (doc->>'created_utc') ~ '^[0-9]+(\.[0-9]+)?$')
     OR (doc ? 'created_utc_iso')
      )
  AND coalesce(doc->>'body','') <> ''
ON CONFLICT (comment_id) DO NOTHING;
-- ... continue with your INSERTs into final tables ...
COMMIT;
