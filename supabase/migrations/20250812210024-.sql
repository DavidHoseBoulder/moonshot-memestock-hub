-- Create centralized ticker universe table (idempotent)
create table if not exists public.ticker_universe (
  symbol text primary key,
  category text not null,
  active boolean not null default true,
  priority integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS
alter table public.ticker_universe enable row level security;

-- Policies: public read, restrict writes to authenticated
create policy "Ticker universe is publicly readable"
  on public.ticker_universe for select
  using (true);

create policy "Authenticated users can insert tickers"
  on public.ticker_universe for insert to authenticated
  with check (true);

create policy "Authenticated users can update tickers"
  on public.ticker_universe for update to authenticated
  using (true);

-- Trigger to keep updated_at fresh
create trigger if not exists update_ticker_universe_updated_at
before update on public.ticker_universe
for each row execute function public.update_updated_at_column();

-- Seed data (upsert)
insert into public.ticker_universe (symbol, category, priority)
values
  ('GME','Meme & Retail',5),('AMC','Meme & Retail',5),('BB','Meme & Retail',5),('NOK','Meme & Retail',5),('KOSS','Meme & Retail',5),('CLOV','Meme & Retail',5),('SNDL','Meme & Retail',5),('DWAC','Meme & Retail',5),('VFS','Meme & Retail',5),('HKD','Meme & Retail',5),
  ('TSLA','Tech & Momentum',4),('AAPL','Tech & Momentum',4),('MSFT','Tech & Momentum',4),('NVDA','Tech & Momentum',4),('AMD','Tech & Momentum',4),('PLTR','Tech & Momentum',4),('META','Tech & Momentum',4),('AMZN','Tech & Momentum',4),('SNAP','Tech & Momentum',4),('INTC','Tech & Momentum',4),
  ('AI','AI & Data',3),('BBAI','AI & Data',3),('SOUN','AI & Data',3),('C3AI','AI & Data',3),('UPST','AI & Data',3),('SNOW','AI & Data',3),('NET','AI & Data',3),('DDOG','AI & Data',3),('CRWD','AI & Data',3),('PATH','AI & Data',3),
  ('COIN','Fintech & Crypto',4),('RIOT','Fintech & Crypto',4),('MARA','Fintech & Crypto',4),('HOOD','Fintech & Crypto',4),('SQ','Fintech & Crypto',4),('PYPL','Fintech & Crypto',4),('SOFI','Fintech & Crypto',4),('LCID','Fintech & Crypto',4),('RBLX','Fintech & Crypto',4),('MSTR','Fintech & Crypto',4),
  ('NIO','EV & Alt-Tech',3),('XPEV','EV & Alt-Tech',3),('LI','EV & Alt-Tech',3),('RIVN','EV & Alt-Tech',3),('CHPT','EV & Alt-Tech',3),('NKLA','EV & Alt-Tech',3),('ASTS','EV & Alt-Tech',3),('SPCE','EV & Alt-Tech',3),('QS','EV & Alt-Tech',3),('RUN','EV & Alt-Tech',3),
  ('NVAX','Biotech & Pharma',2),('SAVA','Biotech & Pharma',2),('MRNA','Biotech & Pharma',2),('BNTX','Biotech & Pharma',2),('CYTO','Biotech & Pharma',2),('MNMD','Biotech & Pharma',2),('IOVA','Biotech & Pharma',2),('VSTM','Biotech & Pharma',2),('PFE','Biotech & Pharma',2),('GILD','Biotech & Pharma',2),
  ('DIS','Media & Internet',2),('NFLX','Media & Internet',2),('WBD','Media & Internet',2),('TTD','Media & Internet',2),('ROKU','Media & Internet',2),('PARA','Media & Internet',2),('FUBO','Media & Internet',2),('PINS','Media & Internet',2),('BILI','Media & Internet',2),('GOOGL','Media & Internet',2),
  ('CVNA','Consumer Buzz',3),('CHWY','Consumer Buzz',3),('ETSY','Consumer Buzz',3),('PTON','Consumer Buzz',3),('BYND','Consumer Buzz',3),('WMT','Consumer Buzz',3),('TGT','Consumer Buzz',3),('COST','Consumer Buzz',3),('BURL','Consumer Buzz',3),('NKE','Consumer Buzz',3),
  ('PNC','Banking',1),('WAL','Banking',1),('BANC','Banking',1),('SCHW','Banking',1),('GS','Banking',1),('JPM','Banking',1),('BAC','Banking',1),('C','Banking',1),('HBAN','Banking',1),('USB','Banking',1),
  ('HYMC','SPAC & Penny',1),('MULN','SPAC & Penny',1),('MCOM','SPAC & Penny',1),('TTOO','SPAC & Penny',1),('FFIE','SPAC & Penny',1),('MEGL','SPAC & Penny',1),('ILAG','SPAC & Penny',1),('ATER','SPAC & Penny',1),('CTRM','SPAC & Penny',1),('BBIG','SPAC & Penny',1)
ON CONFLICT (symbol) DO UPDATE SET category = excluded.category, priority = excluded.priority, active = true, updated_at = now();