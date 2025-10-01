-- Deploy reddit ingest helpers for Edge orchestrator

create or replace function public.reddit_ingest_posts(rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  processed_count integer := 0;
  upserted_count integer := 0;
begin
  if rows is null or jsonb_typeof(rows) <> 'array' then
    return jsonb_build_object('processed', 0, 'upserted', 0);
  end if;

  create temporary table if not exists tmp_reddit_posts(doc jsonb) on commit drop;
  truncate tmp_reddit_posts;

  insert into tmp_reddit_posts(doc)
  select value
  from jsonb_array_elements(rows)
  where jsonb_typeof(value) = 'object';

  get diagnostics processed_count = row_count;

  with upsert as (
    insert into public.reddit_finance_keep_norm (
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
    select distinct on (coalesce(doc->>'post_id', doc->>'id'))
      coalesce(doc->>'post_id', doc->>'id') as id,
      doc->>'subreddit' as subreddit,
      nullif(doc->>'author', '') as author,
      case
        when (doc->>'created_utc') ~ '^\d+$'
          then to_timestamp((doc->>'created_utc')::bigint) at time zone 'UTC'
        when doc ? 'created_utc_iso'
          then (doc->>'created_utc_iso')::timestamptz
        else null
      end as created_utc,
      coalesce(doc->>'title', '') as title,
      coalesce(doc->>'selftext', '') as selftext,
      nullif(doc->>'score', '')::integer as score,
      nullif(doc->>'num_comments', '')::integer as num_comments,
      nullif(doc->>'permalink', '') as permalink,
      coalesce(doc->>'post_id', doc->>'id') as post_id
    from tmp_reddit_posts
    where jsonb_typeof(doc) = 'object'
      and coalesce(doc->>'subreddit', '') <> ''
    order by coalesce(doc->>'post_id', doc->>'id'),
             (nullif(doc->>'author', '') is null),
             case
               when doc ? 'created_utc' and (doc->>'created_utc') ~ '^\\d+$'
                 then (doc->>'created_utc')::bigint
               else null
             end desc
    on conflict (id) do update
      set subreddit    = excluded.subreddit,
          author       = coalesce(excluded.author, reddit_finance_keep_norm.author),
          created_utc  = coalesce(excluded.created_utc, reddit_finance_keep_norm.created_utc),
          title        = excluded.title,
          selftext     = excluded.selftext,
          score        = coalesce(excluded.score, reddit_finance_keep_norm.score),
          num_comments = coalesce(excluded.num_comments, reddit_finance_keep_norm.num_comments),
          permalink    = coalesce(excluded.permalink, reddit_finance_keep_norm.permalink),
          post_id      = coalesce(excluded.post_id, reddit_finance_keep_norm.post_id)
    returning 1
  )
  select count(*) into upserted_count from upsert;

  return jsonb_build_object(
    'processed', processed_count,
    'upserted', upserted_count
  );
end;
$$;

create or replace function public.reddit_ingest_comments(rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  processed_count integer := 0;
  upserted_count integer := 0;
begin
  if rows is null or jsonb_typeof(rows) <> 'array' then
    return jsonb_build_object('processed', 0, 'upserted', 0);
  end if;

  create temporary table if not exists tmp_reddit_comments(doc jsonb) on commit drop;
  truncate tmp_reddit_comments;

  insert into tmp_reddit_comments(doc)
  select value
  from jsonb_array_elements(rows)
  where jsonb_typeof(value) = 'object';

  get diagnostics processed_count = row_count;

  insert into public.reddit_comments_raw (src_line)
  select doc::text
  from tmp_reddit_comments;

  with prepared as (
    select
      doc,
      doc->>'id' as comment_id,
      coalesce(
        doc->>'post_id',
        (regexp_match(coalesce(doc->>'permalink',''), '^/r/[^/]+/comments/([^/]+)'))[1],
        (regexp_match(coalesce(doc->>'link_id',''), '^(?:t3_)?([A-Za-z0-9_]+)$'))[1]
      ) as post_id
    from tmp_reddit_comments
    where doc ? 'id'
      and coalesce(doc->>'id','') <> ''
  ), upsert as (
    insert into public.reddit_comments (
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
    select
      p.comment_id,
      nullif(p.post_id, '') as post_id,
      coalesce(p.doc->>'subreddit', 'unknown'),
      nullif(p.doc->>'author', '') as author,
      coalesce(p.doc->>'body', '') as body,
      case
        when (p.doc->>'created_utc') ~ '^[0-9]+(\.[0-9]+)?$'
          then to_timestamp((p.doc->>'created_utc')::double precision)
        when p.doc ? 'created_utc_iso'
          then (p.doc->>'created_utc_iso')::timestamptz
        else null
      end as created_utc,
      nullif(p.doc->>'score', '')::int as score,
      nullif(p.doc->>'parent_id', '') as parent_id,
      nullif(p.doc->>'depth', '')::int as depth,
      case
        when lower(coalesce(p.doc->>'is_submitter','')) in ('true','t','1') then true
        when lower(coalesce(p.doc->>'is_submitter','')) in ('false','f','0') then false
        else null
      end as is_submitter,
      nullif(p.doc->>'permalink', '') as permalink
    from prepared p
    where coalesce(p.doc->>'body','') <> ''
      and (
            (p.doc ? 'created_utc' and (p.doc->>'created_utc') ~ '^[0-9]+(\.[0-9]+)?$')
         or (p.doc ? 'created_utc_iso')
          )
    on conflict (comment_id) do update
      set post_id      = coalesce(excluded.post_id, reddit_comments.post_id),
          subreddit   = excluded.subreddit,
          author      = coalesce(excluded.author, reddit_comments.author),
          body        = excluded.body,
          created_utc = coalesce(excluded.created_utc, reddit_comments.created_utc),
          score       = coalesce(excluded.score, reddit_comments.score),
          parent_id   = coalesce(excluded.parent_id, reddit_comments.parent_id),
          depth       = coalesce(excluded.depth, reddit_comments.depth),
          is_submitter= coalesce(excluded.is_submitter, reddit_comments.is_submitter),
          permalink   = coalesce(excluded.permalink, reddit_comments.permalink)
    returning 1
  )
  select count(*) into upserted_count from upsert;

  return jsonb_build_object(
    'processed', processed_count,
    'upserted', upserted_count
  );
end;
$$;
