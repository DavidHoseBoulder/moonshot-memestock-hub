\set ON_ERROR_STOP on

BEGIN;
SET client_min_messages = warning;
SET search_path = public;

-- 1) Load the already-cleaned file (always the fixed path)
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

-- Persist raw lines for downstream views that parse directly from text
INSERT INTO public.reddit_comments_raw (src_line)
SELECT line
FROM pg_temp.stage_lines;

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
  derived.post_id                                                     AS post_id,
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
CROSS JOIN LATERAL (
  SELECT COALESCE(
           doc->>'post_id',
           (regexp_match(coalesce(doc->>'permalink',''), '^/r/[^/]+/comments/([^/]+)'))[1],
           (regexp_match(coalesce(doc->>'link_id',''), '^(?:t3_)?([A-Za-z0-9_]+)$'))[1]
         ) AS post_id
) AS derived
WHERE jsonb_typeof(doc) = 'object'
  AND doc ? 'id'
  AND coalesce(doc->>'id','') <> ''
  AND (
        (doc ? 'created_utc' AND (doc->>'created_utc') ~ '^[0-9]+(\.[0-9]+)?$')
     OR (doc ? 'created_utc_iso')
      )
  AND coalesce(doc->>'body','') <> ''
ON CONFLICT (comment_id) DO UPDATE
  SET post_id      = COALESCE(EXCLUDED.post_id, reddit_comments.post_id),
      subreddit    = EXCLUDED.subreddit,
      author       = COALESCE(EXCLUDED.author, reddit_comments.author),
      body         = EXCLUDED.body,
      created_utc  = COALESCE(EXCLUDED.created_utc, reddit_comments.created_utc),
      score        = COALESCE(EXCLUDED.score, reddit_comments.score),
      parent_id    = COALESCE(EXCLUDED.parent_id, reddit_comments.parent_id),
      depth        = COALESCE(EXCLUDED.depth, reddit_comments.depth),
      is_submitter = COALESCE(EXCLUDED.is_submitter, reddit_comments.is_submitter),
      permalink    = COALESCE(EXCLUDED.permalink, reddit_comments.permalink);
-- ... continue with your INSERTs into final tables ...
COMMIT;
