-- Narrow delete scope in reddit_refresh_mentions to window range

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
  perform set_config('statement_timeout', '120000', true);

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
      coalesce(c.author,'')::text as author,
      null::numeric as author_karma,
      ''::text as title,
      coalesce(c.body,'')::text as body_text,
      c.created_utc::timestamptz as created_utc,
      char_length(coalesce(c.body,'')) as content_len
    from public.reddit_comments c
    where c.created_utc >= d0 and c.created_utc < d3
      and c.comment_id is not null
  ) s;

  analyze tmp_base_docs;

  create temporary table tmp_mentions
  (doc_type text, doc_id text, post_id text, symbol text, created_utc timestamptz,
   match_source text, disambig_rule text, content_len integer,
   subreddit text, author text, author_karma numeric)
  on commit drop;

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
         lateral regexp_matches(nullif(d.title,''), '\\$([A-Za-z]{1,5})(?![A-Za-z])', 'g') m
  ),
  ctags_body as (
    select d.doc_type, d.doc_id, d.post_id, d.subreddit, d.author, d.author_karma,
           d.created_utc, d.content_len,
           upper(m[1]) as sym, 'body'::text as src
    from filtered_body d,
         lateral regexp_matches(nullif(d.body_text,''), '\\$([A-Za-z]{1,5})(?![A-Za-z])', 'g') m
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
      row_number() over (
        partition by r.doc_type, r.doc_id, u.symbol
        order by case when r.src = 'title' then 0 else 1 end,
                 case when r.author is null or r.author = '' then 1 else 0 end
      ) as rn
    from cashtag_candidates r
    join public.ticker_universe u
      on upper(r.sym) = upper(u.symbol)
    where coalesce(u.active, true)
      and r.doc_id is not null
  )
  insert into tmp_mentions
  select doc_type, doc_id, post_id, symbol, created_utc, match_source,
         disambig_rule, content_len, subreddit, author, author_karma
  from ranked
  where rn = 1;

  get diagnostics cashtag_rows = row_count;

  with allow_short(sym) as (
    values ('SPY'),('QQQ'),('VTI'),('IWM'),('DIA'),('VOO'),('BTC'),('ETH')
  ),
  docs_kw as (
    select * from tmp_base_docs
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
      upper(m[1]) as token,
      row_number() over (
        partition by d.doc_type, d.doc_id, d.post_id, upper(m[1])
        order by case when d.author is null or d.author = '' then 1 else 0 end
      ) as rn
    from docs_kw d,
         lateral regexp_matches(d.title || ' ' || d.body_text, '(?<![A-Za-z0-9])([A-Za-z]{2,5})(?![A-Za-z0-9])', 'g') m
  ),
  tokens_distinct as (
    select
      doc_type, doc_id, post_id, subreddit, author, author_karma, created_utc, content_len, token
    from tokens
    where rn = 1
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
      nullif(h.author,'')::text as author,
      h.author_karma,
      row_number() over (
        partition by h.doc_type, h.doc_id, h.symbol
        order by case when h.author is null or h.author = '' then 1 else 0 end
      ) as rn
    from kw_hits h
  )
  insert into tmp_mentions
  select doc_type, doc_id, post_id, symbol, created_utc, match_source,
         disambig_rule, content_len, subreddit, author, author_karma
  from keyword_candidates
  where rn = 1
  on conflict do nothing;

  get diagnostics keyword_rows = row_count;

  delete from public.reddit_mentions rm
  using tmp_mentions t
  where rm.doc_type = t.doc_type
    and rm.doc_id = t.doc_id
    and rm.symbol = t.symbol
    and rm.created_utc >= d0
    and rm.created_utc < d3;

  insert into public.reddit_mentions
    (doc_type, doc_id, post_id, symbol, created_utc, match_source, disambig_rule,
     content_len, subreddit, author, author_karma)
  select doc_type, doc_id, post_id, symbol, created_utc, match_source,
         disambig_rule, content_len, subreddit, author, author_karma
  from tmp_mentions;

  return jsonb_build_object(
    'cashtag_rows', coalesce(cashtag_rows, 0),
    'keyword_rows', coalesce(keyword_rows, 0),
    'total_rows', coalesce(cashtag_rows, 0) + coalesce(keyword_rows, 0)
  );
end;
$$;
