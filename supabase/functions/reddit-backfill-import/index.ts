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

// Helper: simple symbol match (case-sensitive tickers like TSLA, AAPL)
function containsAnySymbol(text: string, symbols: string[]): boolean {
  if (!symbols?.length) return true; // no filter
  const upper = text.toUpperCase();
  return symbols.some((s) => upper.includes(s.toUpperCase()));
}

// Helper: filter post by subreddit + symbols
function passesFilters(post: RedditPost, subreddits?: string[], symbols?: string[]): boolean {
  const subredditOk = !subreddits?.length || subreddits.map((s) => s.toLowerCase()).includes(post.subreddit?.toLowerCase());
  const content = `${post.title ?? ""} ${post.selftext ?? ""}`;
  const symbolOk = containsAnySymbol(content, symbols ?? []);
  return subredditOk && symbolOk;
}

// Sanitize potentially mis-encoded characters to valid JSON punctuation
function sanitizeChunk(s: string): string {
  return s
    .replaceAll('\u00A8', '{') // ¨ -> {
    .replaceAll('\u00BC', '}') // ¼ -> }
    .replaceAll('\u00FF', '[') // ÿ -> [
    .replaceAll('\u00A6', ']') // ¦ -> ]
    .replaceAll('\u00A3', '#') // £ -> #
    .replaceAll('\u00BDn', '\n'); // ½n -> newline
}

// Stream parse NDJSON lines (optionally gzip-compressed)
async function* streamNDJSON(url: string): AsyncGenerator<any> {
  const resp = await fetch(url);
  if (!resp.ok || !resp.body) throw new Error(`Failed to fetch ${url}: ${resp.status}`);

  console.log(`[reddit-backfill-import] fetch ok url=${url} len=${resp.headers.get("content-length") ?? "unknown"} ce=${resp.headers.get("content-encoding") ?? "none"} ct=${resp.headers.get("content-type") ?? "unknown"}`);

  let stream: ReadableStream<Uint8Array> = resp.body as ReadableStream<Uint8Array>;

  // Handle gzip if needed
  const urlPath = (() => { try { return new URL(url).pathname.toLowerCase(); } catch { return url.toLowerCase(); } })();
  const contentEncoding = (resp.headers.get("content-encoding") || "").toLowerCase();
  const contentType = (resp.headers.get("content-type") || "").toLowerCase();
  const isGzip = urlPath.endsWith(".gz") || urlPath.endsWith(".gzip") ||
    contentEncoding.includes("gzip") ||
    contentType.includes("gzip") ||
    contentType === "application/x-gzip" || contentType === "application/gzip";
  if (isGzip) {
    try {
      // @ts-ignore - DecompressionStream available in Supabase Edge Runtime
      const ds = new DecompressionStream("gzip");
      stream = stream.pipeThrough(ds);
      console.log('[reddit-backfill-import] using gzip decompression');
    } catch (e) {
      console.error('[reddit-backfill-import] gzip not supported in runtime:', e);
      throw new Error('gzip decompression not supported by runtime');
    }
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let carry = "";
  let linesSeen = 0;
  let yielded = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });

    // Accumulate into carry and split on newlines
    carry += chunk;
    let idx: number;
    while ((idx = carry.indexOf('\n')) !== -1) {
      const line = carry.slice(0, idx).trim();
      carry = carry.slice(idx + 1);
      if (!line) { linesSeen++; continue; }
      linesSeen++;
      try {
        const obj = JSON.parse(line);
        yielded++;
        if (yielded <= 1) {
          try { console.log('[reddit-backfill-import] first line preview:', line.slice(0, 200)); } catch {}
        }
        yield obj;
      } catch (err) {
        // Skip malformed line but keep streaming
        if ((linesSeen % 1000) === 0) console.warn('[reddit-backfill-import] skipped malformed line at', linesSeen);
      }
    }
  }

  // Flush remaining
  if (carry.trim()) {
    try {
      const obj = JSON.parse(carry.trim());
      yielded++;
      yield obj;
    } catch (_) {
      console.warn('[reddit-backfill-import] trailing chunk not valid JSON, discarded');
    }
  }

  console.log(`[reddit-backfill-import] stream complete linesSeen=${linesSeen} yielded=${yielded}`);
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

// Call existing sentiment scorer edge function (OpenAI-based)
async function scoreBatch(posts: RedditPost[]): Promise<any[]> {
  const { data, error } = await supabase.functions.invoke("ai-sentiment-analysis", {
    body: { posts },
  });
  if (error) throw error;
  // Expect data.analyzed_posts or similar; fall back to data
  const analyzed = (data?.analyzed_posts ?? data ?? []) as any[];
  return analyzed;
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
  return { totalAnalyzed, totalInserted, cancelled };
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as BackfillRequest;
    const {
      mode = "jsonl_url",
      posts = [],
      jsonl_url,
      subreddits = [
        "stocks",
        "investing",
        "SecurityAnalysis",
        "ValueInvesting",
        "StockMarket",
        "wallstreetbets",
        "pennystocks",
      ],
      symbols = [],
      batch_size = 25,
      max_items = 25000,
      concurrency = 3,
    } = body ?? {};
    const run_id = body?.run_id ?? (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const concurrency_safe = Math.min(5, Math.max(1, Number(concurrency ?? 3)));
    if (batch_size < 5 || batch_size > 100) {
      return new Response(
        JSON.stringify({ error: "batch_size must be between 5 and 100" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (mode === "posts") {
      const filtered = posts.filter((p) => passesFilters(p, subreddits, symbols));
      const result = await processPipeline(filtered, batch_size, run_id);
      return new Response(
        JSON.stringify({ mode, received: posts.length, filtered: filtered.length, ...result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (mode === "jsonl_url") {
      if (!jsonl_url) {
        return new Response(
          JSON.stringify({ error: "jsonl_url is required for mode=jsonl_url" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Note: .zst dumps are not supported here. Provide pre-decompressed .jsonl or .jsonl.gz
      if (jsonl_url.endsWith(".zst")) {
        return new Response(
          JSON.stringify({
            error: ".zst is not supported in-edge. Please pre-decompress to .jsonl or .jsonl.gz and retry",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

// Prepare run record and limits
const urlPath = (() => { try { return new URL(jsonl_url).pathname; } catch { return jsonl_url; } })();
const basename = urlPath.split('/').pop() ?? 'unknown';
const maxCap = (!max_items || max_items <= 0) ? Number.POSITIVE_INFINITY : max_items;
await upsertRun(run_id, { status: 'running', file: jsonl_url, batch_size });

// Kick off background processing immediately to avoid request-time compute limits
// @ts-ignore EdgeRuntime is available in Supabase Edge Functions
      EdgeRuntime.waitUntil((async () => {
        try {
          console.log(`[reddit-backfill-import] background start url=${jsonl_url} batch_size=${batch_size} concurrency=${concurrency_safe}`);
          const collected: RedditPost[] = [];
          let scanned = 0;
          for await (const raw of streamNDJSON(jsonl_url)) {
            scanned++;
            const norm = normalizeToRedditPost(raw);
            if (!norm) continue;
            if (passesFilters(norm, subreddits, symbols)) {
              collected.push(norm);
            }
            if (collected.length >= maxCap) break; // safety cap per invocation
          }
          console.log(`[reddit-backfill-import] background scanned=${scanned} queued=${collected.length}`);
          await updateRun(run_id, { scanned_total: scanned, queued_total: collected.length });
          const result = await processPipeline(collected, batch_size, run_id, concurrency_safe);
          await updateRun(run_id, {
            status: result.cancelled ? 'cancelled' : 'succeeded',
            finished_at: new Date().toISOString(),
            analyzed_total: result.totalAnalyzed,
            inserted_total: result.totalInserted,
          });
        } catch (err: any) {
          console.error('[reddit-backfill-import] background error:', err);
          await updateRun(run_id, { status: 'failed', error: String(err?.message ?? err), finished_at: new Date().toISOString() });
        }
      })());

// basename computed above
      return new Response(
        JSON.stringify({
          mode,
          accepted: true,
          note: 'Processing started in background',
          file: jsonl_url,
          batch_size,
          concurrency: concurrency_safe,
          run_id,
        }),
        { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Unsupported mode: ${mode}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[reddit-backfill-import] Error:", error);
    return new Response(
      JSON.stringify({ error: error?.message ?? "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
