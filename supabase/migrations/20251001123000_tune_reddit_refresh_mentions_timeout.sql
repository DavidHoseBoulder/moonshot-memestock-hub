-- Increase statement timeout for reddit_refresh_mentions execution window

create or replace function public.reddit_refresh_mentions(d0 timestamptz, d3 timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cashtag_rows integer := 0;
  keyword_rows integer := 0;
begin
  perform set_config('statement_timeout', '120000', true); -- 120s per invocation

  drop table if exists tmp_base_docs;
  create temporary table tmp_base_docs on commit drop as
  select * from (
    (
      select distinct on (p.post_id)
        'post'::text as doc_type,
        p.post_id::text as doc_id,
        p.post_id::text as post_id,
        p.subreddit::text as subreddit,
        coalesce(pf.author,'')::text as author,
        null::numeric as author_karma,
        coalesce(p.title,'')::text as title,
        coalesce(p.selftext,'')::text as body_text,
        p.created_utc::timestamptz as created_utc,
        char_length(coalesce(p.title,'') || ' ' || coalesce(p.selftext,'')) as content_len
      from public.v_scoring_posts_union_src p
      left join public.reddit_finance_keep_norm pf
        on pf.id::text = p.post_id::text
      where p.created_utc >= d0 and p.created_utc < d3
      order by p.post_id, p.created_utc desc
    )
    union all
    select
      'comment'::text as doc_type,
      c.comment_id::text as doc_id,
      c.post_id::text as post_id,
      c.subreddit::text as subreddit,
      coalesce(rc.author,'')::text as author,
      null::numeric as author_karma,
      ''::text as title,
      coalesce(c.body,'')::text as body_text,
      c.created_utc::timestamptz as created_utc,
      char_length(coalesce(c.body,'')) as content_len
    from public.reddit_comments_clean c
    left join public.reddit_comments rc
      on rc.comment_id::text = c.comment_id::text
    where c.created_utc >= d0 and c.created_utc < d3
      and c.comment_id is not null
  ) s;

  analyze tmp_base_docs;

  with base_docs as (
    select * from tmp_base_docs
  ),
  filtered_title as (
    select * from base_docs where doc_type = 'post' and title like '%$%'
  ),
  filtered_body as (
    select * from base_docs where body_text like '%$%'
  ),
  ctags_title as (
    select d.doc_type, d.doc_id, d.post_id, d.subreddit, d.author, d.author_karma,
           d.created_utc, d.content_len,
           upper(m[1]) as sym, 'title'::text as src
    from filtered_title d,
         lateral regexp_matches(nullif(d.title,''), '\$([A-Za-z]{1,5})(?![A-Za-z])', 'g') m
  ),
  ctags_body as (
    select d.doc_type, d.doc_id, d.post_id, d.subreddit, d.author, d.author_karma,
           d.created_utc, d.content_len,
           upper(m[1]) as sym, 'body'::text as src
    from filtered_body d,
         lateral regexp_matches(nullif(d.body_text,''), '\$([A-Za-z]{1,5})(?![A-Za-z])', 'g') m
  ),
  cashtag_candidates as (
    select * from ctags_title
    union all
    select * from ctags_body
  ),
  ranked as (
    select
      r.doc_type,
      r.doc_id,
      r.post_id,
      u.symbol,
      r.created_utc,
      r.src as match_source,
      'cashtag'::text as disambig_rule,
      r.content_len,
      r.subreddit,
      nullif(r.author,'')::text as author,
      r.author_karma,
      case when r.src = 'title' then 0 else 1 end as src_rank,
      case when r.author is null or r.author = '' then 1 else 0 end as anon_rank
    from cashtag_candidates r
    join public.ticker_universe u
      on upper(r.sym) = upper(u.symbol)
    where coalesce(u.active, true)
      and r.doc_id is not null
  )
  insert into public.reddit_mentions
    (doc_type, doc_id, post_id, symbol, created_utc, match_source, disambig_rule, content_len, subreddit, author, author_karma)
  select distinct on (doc_type, doc_id, symbol)
    doc_type,
    doc_id,
    post_id,
    symbol,
    created_utc,
    match_source,
    disambig_rule,
    content_len,
    subreddit,
    author,
    author_karma
  from ranked
  order by doc_type, doc_id, symbol, src_rank, anon_rank
  on conflict (doc_type, doc_id, symbol) do update
    set subreddit      = excluded.subreddit,
        author         = excluded.author,
        author_karma   = excluded.author_karma,
        created_utc    = excluded.created_utc,
        match_source   = excluded.match_source,
        disambig_rule  = excluded.disambig_rule,
        content_len    = excluded.content_len;

  get diagnostics cashtag_rows = row_count;

  with allow_short(sym) as (
    values ('SPY'),('QQQ'),('VTI'),('IWM'),('DIA'),('VOO'),('BTC'),('ETH')
  ),
  docs_kw as (
    select
      d.doc_type, d.doc_id, d.post_id, d.subreddit, d.author, d.author_karma,
      d.created_utc, d.content_len,
      (coalesce(nullif(d.title,''),'') || ' ' || coalesce(nullif(d.body_text,''),'')) as text_all
    from tmp_base_docs d
  ),
  tokens as (
    select
      d.doc_type,
      d.doc_id,
      d.post_id,
      d.subreddit,
      d.author,
      d.author_karma,
      d.created_utc,
      d.content_len,
      upper(m[1]) as token
    from docs_kw d,
         lateral regexp_matches(d.text_all, '(?<![A-Za-z0-9])([A-Za-z]{2,5})(?![A-Za-z0-9])', 'g') m
  ),
  tokens_distinct as (
    select distinct
      doc_type, doc_id, post_id, subreddit, author, author_karma, created_utc, content_len, token
    from tokens
  ),
  kw_hits as (
    select
      td.doc_type,
      td.doc_id,
      td.post_id,
      td.subreddit,
      td.author,
      td.author_karma,
      td.created_utc,
      td.content_len,
      u.symbol
    from tokens_distinct td
    join public.ticker_universe u
      on u.symbol = td.token
     and coalesce(u.active, true)
     and (
           length(u.symbol) >= 3
        or u.symbol in (select sym from allow_short)
         )
  ),
  keyword_candidates as (
    select
      h.doc_type,
      h.doc_id,
      h.post_id,
      h.symbol,
      h.created_utc,
      case when h.doc_type='post' then 'title_body' else 'body' end as match_source,
      'keywords'::text as disambig_rule,
      h.content_len,
      h.subreddit,
      h.author,
      h.author_karma
    from kw_hits h
  ),
  ranked_kw as (
    select
      r.doc_type,
      r.doc_id,
      r.post_id,
      r.symbol,
      r.created_utc,
      r.match_source,
      r.disambig_rule,
      r.content_len,
      r.subreddit,
      r.author,
      r.author_karma,
      case when r.author is null or r.author = '' then 1 else 0 end as anon_rank
    from keyword_candidates r
  )
  insert into public.reddit_mentions
    (doc_type, doc_id, post_id, symbol, created_utc, match_source, disambig_rule, content_len, subreddit, author, author_karma)
  select distinct on (doc_type, doc_id, symbol)
    doc_type,
    doc_id,
    post_id,
    symbol,
    created_utc,
    match_source,
    disambig_rule,
    content_len,
    subreddit,
    author,
    author_karma
  from ranked_kw
  order by doc_type, doc_id, symbol, anon_rank
  on conflict (doc_type, doc_id, symbol) do update
    set subreddit      = excluded.subreddit,
        author         = excluded.author,
        author_karma   = excluded.author_karma,
        created_utc    = excluded.created_utc,
        match_source   = excluded.match_source,
        disambig_rule  = excluded.disambig_rule,
        content_len    = excluded.content_len;

  get diagnostics keyword_rows = row_count;

  return jsonb_build_object(
    'cashtag_rows', coalesce(cashtag_rows, 0),
    'keyword_rows', coalesce(keyword_rows, 0),
    'total_rows', coalesce(cashtag_rows, 0) + coalesce(keyword_rows, 0)
  );
end;
$$;
