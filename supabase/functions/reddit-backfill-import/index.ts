import "https://deno.land/x/xhr@0.1.0/mod.ts";
// import { serve } from "https://deno.land/std@0.168.0/http/server.ts"; // switched to Deno.serve
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

// Types for incoming posts (normalized)
interface RedditPost {
  id?: string; // Reddit post id when available
  title: string;
  selftext?: string;
  score?: number;
  num_comments?: number;
  created_utc: number; // epoch seconds
  permalink?: string;
  subreddit: string;
  author?: string;
}

interface BackfillRequest {
  mode?: "posts" | "jsonl_url";
  posts?: RedditPost[];
  jsonl_url?: string;
  subreddits?: string[]; // filter list
  symbols?: string[]; // filter list
  batch_size?: number; // 20-50 recommended
  run_id?: string; // optional client-provided run identifier
  max_items?: number; // safety cap; 0 or negative = no limit
  concurrency?: number; // number of batches to process in parallel (1-5)
  _continue_from_line?: number; // internal parameter for chunked processing
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Create a service client (needed for efficient inserts)
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

// Run tracking helpers
async function upsertRun(runId: string, patch: Record<string, any>) {
  await supabase.from('import_runs').upsert({ run_id: runId, ...patch }, { onConflict: 'run_id' });
}
async function updateRun(runId: string, patch: Record<string, any>) {
  await supabase.from('import_runs').update({ ...patch }).eq('run_id', runId);
}

// Check if a run has been requested to cancel
async function isRunCancelling(runId: string): Promise<boolean> {
  const { data } = await supabase
    .from('import_runs')
    .select('status')
    .eq('run_id', runId)
    .maybeSingle();
  return (data?.status === 'cancelling' || data?.status === 'cancelled');
}

// Helper: chunk an array
function chunk<T>(arr: T[], size: number): T[][] {
  const res: T[][] = [];
  for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
  return res;
}

// Canonical tickers and company names derived from Supabase ticker_universe (cold start)
const SUPA_URL_T = Deno.env.get('SUPABASE_URL')!
const SUPA_KEY_T = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supaTickers = createClient(SUPA_URL_T, SUPA_KEY_T)
let TICKER_LIST: { symbol: string; name?: string | null }[] = []
try {
  const { data, error } = await supaTickers
    .from('ticker_universe')
    .select('symbol,name')
    .eq('active', true)
    .order('priority', { ascending: true })
    .order('symbol', { ascending: true })
  if (!error && data) TICKER_LIST = (data as any[]).map(r => ({ symbol: String(r.symbol).toUpperCase(), name: r.name ?? null }))
} catch (e: any) {
  console.warn('reddit-backfill-import: failed to load ticker_universe', e?.message || e)
}

const SHORT_TICKERS = TICKER_LIST.map(t => t.symbol).filter(t => t.length <= 3)
const LONG_TICKERS = TICKER_LIST.map(t => t.symbol).filter(t => t.length > 3)
const SHORT_RE = SHORT_TICKERS.length ? new RegExp(`(^|\\W)\\$(${SHORT_TICKERS.join('|')})(?=\\W|$)`, 'gi') : /a^/i
const LONG_RE = LONG_TICKERS.length ? new RegExp(`(^|\\W)(${LONG_TICKERS.join('|')})(?=\\W|$)`, 'gi') : /a^/i

// Compile company name regexes for case-insensitive exact phrase matches
function escapeRegExp(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
const NAME_REGEXES: { re: RegExp; symbol: string }[] = TICKER_LIST
  .filter(t => (t.name && String(t.name).length >= 3))
  .map(t => ({
    symbol: t.symbol,
    re: new RegExp(`\\b${escapeRegExp(String(t.name)).replace(/\\\s\+/g, '\\s+').replace(/\s+/g, '\\s+')}\\b`, 'i')
  }))

// NSFW subreddit exclusion patterns (subset aligned with reddit_stream_filter.sh intent)
const NSFW_SUB_PATTERNS: RegExp[] = [
  /nsfw/i, /gonewild/i, /porn/i, /sex\w*/i, /xxx/i, /nude\w*/i
]

function extractTickers(text: string): string[] {
  if (!text) return []
  const hits = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = SHORT_RE.exec(text)) !== null) hits.add(m[2].toUpperCase())
  while ((m = LONG_RE.exec(text)) !== null) hits.add(m[2].toUpperCase())
  SHORT_RE.lastIndex = 0; LONG_RE.lastIndex = 0
  // Company names -> map to symbols
  for (const { re, symbol } of NAME_REGEXES) {
    if (re.test(text)) hits.add(symbol.toUpperCase())
  }
  return [...hits]
}

function passesFilters(post: RedditPost, subreddits?: string[], symbolsFilter?: string[]): boolean {
  const sr = String(post.subreddit || '')
  // Subreddit gating: allow all unless caller provided an allowlist; always exclude NSFW patterns
  if (!sr || NSFW_SUB_PATTERNS.some((re) => re.test(sr))) return false;
  const subredditOk = !subreddits?.length || subreddits.map((s) => s.toLowerCase()).includes(sr.toLowerCase());
  if (!subredditOk) return false;

  const content = `${post.title ?? ''} ${post.selftext ?? ''}`;
  const matches = extractTickers(content);
  if (matches.length === 0) return false;

  if (!symbolsFilter?.length) return true;
  const filterSet = new Set(symbolsFilter.map(s => s.toUpperCase()));
  const symbolOk = matches.some(m => filterSet.has(m));
  return symbolOk;
}

// Process NDJSON in very small chunks to prevent CPU timeout
async function processFileChunk(
  url: string, 
  startLine: number = 0, 
  maxLines: number = 1000, // Process max 1000 lines per chunk
  runId?: string,
  subreddits?: string[],
  symbolsFilter?: string[]
): Promise<{ linesProcessed: number, validPosts: number, nextStartLine: number, hasMore: boolean }> {
  
  console.log(`[reddit-backfill-import] *** CHUNK START *** line=${startLine}, maxLines=${maxLines}, filters: subreddits=${subreddits?.join(',') || 'none'}, symbols=${symbolsFilter?.join(',') || 'none'}`);
  
  const resp = await fetch(url);
  if (!resp.ok || !resp.body) throw new Error(`Failed to fetch ${url}: ${resp.status}`);

  console.log(`[reddit-backfill-import] processing chunk starting at line ${startLine}, maxLines=${maxLines}`);

  // Decide whether to gunzip
  const enc = (resp.headers.get("content-encoding") || "").toLowerCase();
  const ctype = (resp.headers.get("content-type") || "").toLowerCase();
  const looksGzip = url.endsWith(".gz") || ctype.includes("application/gzip");

  let byteStream: ReadableStream<Uint8Array> = resp.body as ReadableStream<Uint8Array>;
  if (looksGzip && !enc.includes("gzip")) {
    try {
      // @ts-ignore - DecompressionStream available in Supabase Edge Runtime
      byteStream = byteStream.pipeThrough(new DecompressionStream("gzip"));
      console.log('[reddit-backfill-import] using gzip decompression');
    } catch (e) {
      console.error('[reddit-backfill-import] gzip not supported in runtime:', e);
      throw new Error('gzip decompression not supported by runtime');
    }
  }

  const reader = byteStream.getReader();
  const decoder = new TextDecoder();
  let carry = "";
  let linesSeen = 0;
  let linesProcessed = 0;
  let validPosts: RedditPost[] = [];

  try {
    while (linesProcessed < maxLines) {
      const { value, done } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      carry += chunk;
      
      // Process complete lines
      let lines = carry.split('\n');
      carry = lines.pop() || ""; // Keep the last incomplete line
      
      for (const line of lines) {
        linesSeen++;
        
        // Skip to start position
        if (linesSeen <= startLine) continue;
        
        linesProcessed++;
        if (linesProcessed > maxLines) break;
        
        const trimmed = line.trim();
        if (!trimmed) continue;
        
        try {
          // Clean common issues
          const cleaned = trimmed
            .replace(/,\s*$/, '') // trailing comma
            .replace(/\r/g, '')   // carriage returns
            .replace(/\u0000/g, ''); // null chars
          
          if (!cleaned.startsWith('{') || !cleaned.endsWith('}')) {
            continue; // Skip silently to save CPU
          }
          
          const obj = JSON.parse(cleaned);
          const post = normalizeToRedditPost(obj);
          
          // Debug: log first few posts to see what we're getting
          if (linesProcessed <= 10) {
            console.log(`[reddit-backfill-import] RAW POST ${linesProcessed}:`, {
              rawKeys: Object.keys(obj).slice(0, 10),
              subreddit: obj.subreddit,
              title: obj.title?.slice(0, 100),
              selftext: obj.selftext?.slice(0, 100),
              body: obj.body?.slice(0, 100),
              created_utc: obj.created_utc,
              author: obj.author
            });
            
            if (post) {
              console.log(`[reddit-backfill-import] NORMALIZED POST ${linesProcessed}:`, {
                subreddit: post.subreddit,
                title: post.title?.slice(0, 100),
                selftext: post.selftext?.slice(0, 100),
                hasContent: Boolean(post.title || post.selftext),
                created_utc: post.created_utc
              });
            } else {
              console.log(`[reddit-backfill-import] POST ${linesProcessed} FAILED NORMALIZATION`);
            }
          }
          
          if (post) {
            // Less strict filtering for debugging
            const content = `${post.title ?? ''} ${post.selftext ?? ''}`;
            const tickers = extractTickers(content);
            const hasTickerMentions = tickers.length > 0;
            const isAllowedSubreddit = !subreddits?.length || subreddits.map(s => s.toLowerCase()).includes(post.subreddit.toLowerCase());
            const notNSFW = !NSFW_SUB_PATTERNS.some(re => re.test(post.subreddit));
            
            // Debug logging for first few posts
            if (linesProcessed <= 10) {
              console.log(`[reddit-backfill-import] POST ${linesProcessed} FILTER ANALYSIS:`, {
                subreddit: post.subreddit,
                hasTickerMentions,
                tickersFound: tickers,
                isAllowedSubreddit, 
                notNSFW,
                contentLength: content.length,
                contentPreview: content.slice(0, 150),
                subredditFilters: subreddits,
                symbolFilters: symbolsFilter
              });
            }
            
            // For now, let's be less strict - just require non-NSFW and some content
            if (notNSFW && content.trim()) {
              validPosts.push(post);
              if (validPosts.length <= 5) {
                console.log(`[reddit-backfill-import] ADDED VALID POST ${validPosts.length} from r/${post.subreddit}: "${post.title?.slice(0, 80)}"`);
              }
            } else {
              if (linesProcessed <= 10) {
                console.log(`[reddit-backfill-import] POST ${linesProcessed} REJECTED: nsfw=${!notNSFW}, noContent=${!content.trim()}`);
              }
            }
          }
          
        } catch (err) {
          // Skip silently to save CPU
          continue;
        }
        
        // Yield control very frequently to prevent timeout
        if (linesProcessed % 100 === 0) {
          await new Promise(resolve => setTimeout(resolve, 1));
        }
      }
      
      // Yield control after each chunk read
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  } finally {
    reader.releaseLock();
  }

  // Process the collected posts if any
  if (validPosts.length > 0) {
    console.log(`[reddit-backfill-import] processing ${validPosts.length} valid posts from ${linesProcessed} lines`);
    await processPipeline(validPosts, Math.min(10, validPosts.length), runId, 1);
  }

  const hasMore = linesProcessed >= maxLines; // If we processed our max lines, there's likely more
  console.log(`[reddit-backfill-import] chunk complete: linesProcessed=${linesProcessed}, validPosts=${validPosts.length}, nextLine=${linesSeen}, hasMore=${hasMore}`);

  return {
    linesProcessed,
    validPosts: validPosts.length,
    nextStartLine: linesSeen,
    hasMore
  };
}

// Normalize raw pushshift objects to RedditPost shape
function normalizeToRedditPost(raw: any): RedditPost | null {
  const created_utc = raw?.created_utc ?? raw?.created ?? 0;
  const subreddit = raw?.subreddit;
  const title = raw?.title ?? "";
  const selftext = raw?.selftext ?? raw?.body ?? "";
  if (!created_utc || !subreddit || (!title && !selftext)) return null;
  return {
    id: raw?.id ? String(raw.id) : undefined,
    title,
    selftext,
    score: raw?.score ?? 0,
    num_comments: raw?.num_comments ?? raw?.replies ?? 0,
    created_utc: Number(created_utc),
    permalink: raw?.permalink ?? "",
    subreddit,
    author: raw?.author ?? "",
  };
}

// Call existing sentiment scorer edge function (OpenAI-based) with retries and Claude fallback
async function scoreBatch(posts: RedditPost[]): Promise<any[]> {
  const normalize = (resp: any): any[] => {
    if (!resp) return [];
    const body = resp;
    // Try a few common shapes
    return (body.analyzed_posts ?? body.posts ?? body.results ?? body) as any[];
  };

  const invoke = async (fn: string) => {
    const { data, error } = await supabase.functions.invoke(fn, { body: { posts } });
    if (error) throw error;
    return normalize(data);
  };

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // Try OpenAI-backed scorer first, with exponential backoff
  let lastErr: any = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const analyzed = await invoke("ai-sentiment-analysis");
      return analyzed;
    } catch (err: any) {
      lastErr = err;
      const status = err?.context?.status ?? err?.status ?? 0;
      const retriable = status === 0 || status === 429 || (status >= 500 && status < 600);
      console.warn(`[reddit-backfill-import] ai-sentiment-analysis failed (attempt ${attempt + 1}) status=${status}`, err?.message || err);
      if (!retriable) break;
      const backoff = 500 * Math.pow(2, attempt) + Math.floor(Math.random() * 200);
      await sleep(backoff);
    }
  }

  // Fallback to Claude-backed scorer
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const analyzed = await invoke("ai-sentiment-claude");
      console.log('[reddit-backfill-import] used Claude fallback successfully');
      return analyzed;
    } catch (err: any) {
      lastErr = err;
      const status = err?.context?.status ?? err?.status ?? 0;
      const retriable = status === 0 || status === 429 || (status >= 500 && status < 600);
      console.warn(`[reddit-backfill-import] ai-sentiment-claude failed (attempt ${attempt + 1}) status=${status}`, err?.message || err);
      if (!retriable) break;
      const backoff = 800 * (attempt + 1) + Math.floor(Math.random() * 200);
      await sleep(backoff);
    }
  }

  console.error('[reddit-backfill-import] All analyzers failed; continuing without sentiment');
  return [];
}

// Map analyzed items to sentiment_history rows
function toSentimentHistoryRows(analyzed: any[], originalMap: Map<string, RedditPost>, runId?: string) {
  return analyzed.map((item) => {
    const symbols = (item.symbols_mentioned ?? item.symbols ?? []) as string[];
    const symbol = symbols?.[0] ?? null;

    const key = item.post_id || item.permalink || item.id || null;
    const fallbackOriginal = key ? originalMap.get(String(key)) : undefined;

    const postTime = item.post_created_at
      ? new Date(item.post_created_at)
      : fallbackOriginal?.created_utc
      ? new Date(fallbackOriginal.created_utc * 1000)
      : new Date();

    const title = item.title ?? fallbackOriginal?.title ?? "";
    const selftext = item.content ?? item.selftext ?? fallbackOriginal?.selftext ?? "";

    const scoreNumber = Number(item.overall_sentiment ?? item.sentiment ?? 0);
    const confidence = Number(item.confidence_score ?? item.confidence ?? 0.5);

    const engagement = Number(item.score ?? fallbackOriginal?.score ?? 0) +
      Number(item.num_comments ?? fallbackOriginal?.num_comments ?? 0);

    // Ensure a deterministic, non-null source_id for idempotency
    const rawCandidate = (item.post_id ?? item.id ?? fallbackOriginal?.id ?? fallbackOriginal?.permalink ?? null);
    let source_id: string | null = rawCandidate ? String(rawCandidate) : null;
    if (!source_id) {
      const base = JSON.stringify({
        subreddit: item.subreddit ?? fallbackOriginal?.subreddit ?? '',
        author: item.author ?? fallbackOriginal?.author ?? '',
        t: item.post_created_at ?? fallbackOriginal?.created_utc ?? 0,
        title: (item.title ?? fallbackOriginal?.title ?? '').slice(0, 120),
        body: (item.content ?? item.selftext ?? fallbackOriginal?.selftext ?? '').slice(0, 120),
      });
      let h = 5381;
      for (let i = 0; i < base.length; i++) h = ((h << 5) + h) ^ base.charCodeAt(i);
      source_id = `r_${Math.abs(h)}`;
    }

    return {
      symbol: symbol ?? "UNKNOWN",
      source: "reddit",
      source_id,
      sentiment_score: scoreNumber,
      raw_sentiment: item.overall_sentiment ?? item.sentiment ?? null,
      confidence_score: confidence,
      data_timestamp: postTime.toISOString(),
      content_snippet: (title + " " + selftext).slice(0, 250),
      metadata: {
        subreddit: item.subreddit ?? fallbackOriginal?.subreddit ?? null,
        author: item.author ?? fallbackOriginal?.author ?? null,
        permalink: item.permalink ?? fallbackOriginal?.permalink ?? null,
        post_id: item.post_id ?? null,
        themes: item.key_themes ?? item.themes ?? null,
        signals: item.investment_signals ?? item.signals ?? null,
        import_run_id: runId ?? null,
      },
      engagement_score: engagement,
      volume_indicator: 1,
    };
  });
}

// Insert in chunks to reduce payload size
async function insertSentimentHistory(rows: any[]) {
  const chunks = chunk(rows, 500);
  let inserted = 0;
  for (const part of chunks) {
    const { error } = await supabase
      .from("sentiment_history")
      .upsert(part, { onConflict: 'source,source_id', ignoreDuplicates: true, returning: "minimal" });
    if (error) throw error;
    inserted += part.length;
  }
  return inserted;
}

// Background processor with concurrency and cancel checks
async function processPipeline(posts: RedditPost[], batchSize: number, runId?: string, concurrency: number = 1) {
  console.log(`[reddit-backfill-import] Starting processing of ${posts.length} posts with batchSize ${batchSize} concurrency ${concurrency}`);
  const batches = chunk(posts, batchSize);
  let totalAnalyzed = 0;
  let totalInserted = 0;
  const tickerCounts = new Map<string, number>();

  const inc = (sym: string, n: number = 1) => {
    const k = sym.toUpperCase();
    tickerCounts.set(k, (tickerCounts.get(k) || 0) + n);
  };

  // Worker to process a single batch index
  const processOne = async (i: number) => {
    const batch = batches[i];

    // Filter out already-inserted posts by source_id (reddit id or permalink)
    const candidateIds = batch
      .map((p) => p.id || p.permalink)
      .filter((v): v is string => Boolean(v));
    let newBatch = batch;
    if (candidateIds.length > 0) {
      const { data: existing, error: existErr } = await supabase
        .from('sentiment_history')
        .select('source_id')
        .eq('source', 'reddit')
        .in('source_id', candidateIds);
      if (!existErr && existing) {
        const existingSet = new Set((existing as any[]).map((r: any) => r.source_id));
        newBatch = batch.filter((p) => {
          const key = p.id || p.permalink;
          return key ? !existingSet.has(key) : true;
        });
      }
    }

    // Correlate analyzed outputs back to originals
    const originalMap = new Map<string, RedditPost>();
    for (const p of newBatch) {
      const key = p.permalink || p.id || `${p.subreddit}-${p.author}-${p.created_utc}`;
      originalMap.set(key, p);
    }

    if (newBatch.length === 0) {
      console.log(`[reddit-backfill-import] Batch ${i + 1}/${batches.length} skipped (all duplicates)`);
      return;
    }

    // Count tickers for velocity/coverage from raw content
    for (const p of newBatch) {
      const text = `${p.title ?? ''} ${p.selftext ?? ''}`
      const matches = extractTickers(text)
      for (const sym of matches) inc(sym, 1)
    }

    const analyzed = await scoreBatch(newBatch);
    const rows = toSentimentHistoryRows(analyzed, originalMap, runId);
    const inserted = await insertSentimentHistory(rows);

    // Update counters (single-threaded JS ensures atomic increments)
    totalAnalyzed += analyzed.length;
    totalInserted += inserted;

    console.log(`[reddit-backfill-import] Batch ${i + 1}/${batches.length} analyzed=${analyzed.length} inserted=${inserted} skipped=${batch.length - newBatch.length}`);
    if (runId) {
      await updateRun(runId, { analyzed_total: totalAnalyzed, inserted_total: totalInserted });
    }
  };

  // Simple concurrency limiter
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, batches.length) }, async () => {
    while (nextIndex < batches.length) {
      const i = nextIndex++;
      // Cancel check before each batch
      if (runId && await isRunCancelling(runId)) {
        console.warn('[reddit-backfill-import] Cancelling run on request');
        return; // exit worker loop
      }
      try {
        await processOne(i);
      } catch (err) {
        console.error(`[reddit-backfill-import] Error in batch ${i + 1}:`, err);
        // continue
      }
      // Gentle pacing
      await new Promise((r) => setTimeout(r, 200));
    }
  });

  await Promise.all(workers);

  const cancelled = runId ? await isRunCancelling(runId) : false;
  console.log(`[reddit-backfill-import] Done. analyzed=${totalAnalyzed}, inserted=${totalInserted}, cancelled=${cancelled}`);
  const ticker_counts = Object.fromEntries(tickerCounts.entries());
  return { analyzed: totalAnalyzed, inserted: totalInserted, cancelled, ticker_counts };
}

// Main chunked ingestion function with continuation support
async function ingestFromJSONLURLChunked(
  url: string,
  subreddits?: string[],
  symbolsFilter?: string[],
  maxLines = 1000, // Process max 1000 lines per chunk
  runId?: string,
  startLine = 0 // Where to resume from
) {
  console.log(`[reddit-backfill-import] chunked processing start url=${url} maxLines=${maxLines} startLine=${startLine}`);

  try {
    // Initialize or update run status
    await upsertRun(runId || 'unknown', {
      status: 'processing',
      file: url,
      started_at: startLine === 0 ? new Date().toISOString() : undefined,
    });

    // Process one chunk
    const result = await processFileChunk(url, startLine, maxLines, runId, subreddits, symbolsFilter);
    
    if (runId) {
      const currentRun = await supabase
        .from('import_runs')
        .select('scanned_total, queued_total, analyzed_total, inserted_total')
        .eq('run_id', runId)
        .maybeSingle();
      
      const current = currentRun.data || { scanned_total: 0, queued_total: 0, analyzed_total: 0, inserted_total: 0 };
      
      await updateRun(runId, {
        scanned_total: result.nextStartLine,
        queued_total: current.queued_total + result.validPosts,
        status: result.hasMore ? 'processing' : 'completed',
        completed_at: result.hasMore ? undefined : new Date().toISOString(),
      });
    }

    // If there's more to process, schedule next chunk
    if (result.hasMore && runId) {
      console.log(`[reddit-backfill-import] scheduling next chunk from line ${result.nextStartLine}`);
      
      // Trigger next chunk processing in background
      EdgeRuntime.waitUntil(
        (async () => {
          // Small delay to ensure this invocation completes
          await new Promise(resolve => setTimeout(resolve, 200));
          
          try {
            await supabase.functions.invoke('reddit-backfill-import', {
              body: {
                mode: 'jsonl_url',
                jsonl_url: url,
                subreddits,
                symbols: symbolsFilter,
                run_id: runId,
                max_items: maxLines, // Now this is max lines
                _continue_from_line: result.nextStartLine
              }
            });
          } catch (err) {
            console.error('[reddit-backfill-import] failed to schedule next chunk:', err);
            if (runId) {
              await updateRun(runId, { 
                status: 'failed', 
                error: `Failed to continue processing: ${err}` 
              });
            }
          }
        })()
      );
    }

    console.log(`[reddit-backfill-import] chunk completed: linesProcessed=${result.linesProcessed}, validPosts=${result.validPosts}, hasMore=${result.hasMore}`);
    
  } catch (error: any) {
    console.error('[reddit-backfill-import] chunk processing error:', error);
    if (runId) {
      await updateRun(runId, {
        status: 'failed',
        error: error?.message || String(error),
      });
    }
    throw error;
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: BackfillRequest = await req.json();

    // Generate run ID if not provided
    const runId = body.run_id ?? crypto.randomUUID();

    if (body.mode === "posts" && body.posts?.length) {
      console.log('[reddit-backfill-import] direct posts mode');
      const result = await processPipeline(body.posts, body.batch_size ?? 25, runId, body.concurrency ?? 1);
      return new Response(JSON.stringify(result), { headers: corsHeaders });
    }

    if (body.mode === "jsonl_url" && body.jsonl_url) {
      console.log('[reddit-backfill-import] chunked JSONL processing mode');
      
      const startLine = body._continue_from_line ?? 0;
      const maxLines = body.max_items && body.max_items > 0 ? Math.min(body.max_items, 1000) : 1000;
      
      // If this is the initial request (startLine === 0), process first chunk synchronously
      if (startLine === 0) {
        try {
          await ingestFromJSONLURLChunked(
            body.jsonl_url,
            body.subreddits,
            body.symbols,
            maxLines,
            runId,
            startLine
          );
          
          return new Response(
            JSON.stringify({
              runId,
              status: "processing",
              message: `Initial chunk processed, continuing in background`,
              maxLines
            }),
            {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            }
          );
        } catch (error: any) {
          return new Response(
            JSON.stringify({ error: error?.message || "Processing failed" }),
            { status: 500, headers: corsHeaders }
          );
        }
      } else {
        // For continuation chunks, use background processing
        EdgeRuntime.waitUntil(
          ingestFromJSONLURLChunked(
            body.jsonl_url,
            body.subreddits,
            body.symbols,
            maxLines,
            runId,
            startLine
          )
        );

        return new Response(
          JSON.stringify({
            runId,
            status: "processing",
            message: `Continuation chunk from line ${startLine}`,
            maxLines
          }),
          {
            status: 202,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          }
        );
      }
    }

    return new Response(
      JSON.stringify({ error: "Invalid mode or missing required fields" }),
      { status: 400, headers: corsHeaders }
    );

  } catch (error: any) {
    console.error('[reddit-backfill-import] Request error:', error);
    return new Response(
      JSON.stringify({ error: error?.message || "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});