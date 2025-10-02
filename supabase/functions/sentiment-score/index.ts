import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.223.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini";
const DEFAULT_MODEL_TAG = Deno.env.get("MODEL_TAG") ?? "gpt-sent-v1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("sentiment-score: missing Supabase credentials");
}
if (!OPENAI_API_KEY) {
  console.error("sentiment-score: missing OPENAI_API_KEY (required for scoring)");
}

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

type SentimentSource = "reddit" | "stocktwits";

interface Payload {
  start_date?: string;
  end_date?: string;
  sources?: SentimentSource[];
  symbols?: string[];
  model_tag?: string;
  batch_size?: number;
  max_batches?: number;
  micro_batch?: number;
  pause_on_429_ms?: number;
  overwrite?: boolean;
}

interface RedditMentionRow {
  mention_id: string;
  symbol: string;
  created_utc: string;
  subreddit: string | null;
  title: string | null;
  body_text: string | null;
}

interface ScoreResult {
  overall_score: number;
  label: "neg" | "neu" | "pos";
  confidence: number;
  rationale: string;
}

function parseDateISO(input: string | undefined): string | null {
  if (!input) return null;
  const parsed = new Date(`${input}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function defaultWindow(): { start: string; end: string } {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function clampNumber(val: unknown, min: number, max: number, fallback: number) {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function clean(text: string | null | undefined): string {
  return (text ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/[ \t\f\v]+/g, " ")
    .trim();
}

function stripFences(s: string): string {
  let t = s?.trim() ?? "";
  if (t.startsWith("```")) {
    t = t.replace(/^```json\s*/i, "").replace(/^```\s*/i, "");
    if (t.endsWith("```")) t = t.slice(0, -3);
    t = t.trim();
  }
  return t;
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchRedditMentions(opts: {
  modelTag: string;
  d0: string;
  d3: string;
  symbol?: string | null;
  batchSize: number;
}): Promise<RedditMentionRow[]> {
  const limit = Math.max(opts.batchSize * 4, opts.batchSize);

  const { data, error } = await supabase!.rpc("fetch_mentions_batch", {
    p_model: opts.modelTag,
    p_limit: limit,
  });

  if (error) throw error;

  const rows = (data ?? []) as Array<{
    mention_id: number;
    symbol: string;
    subreddit: string | null;
    title: string | null;
    selftext: string | null;
    created_utc: string;
  }>;

  const startTs = Date.parse(opts.d0);
  const endTs = Date.parse(opts.d3);

  const filtered = rows.filter((row) => {
    const created = Date.parse(row.created_utc);
    if (!Number.isFinite(created)) return false;
    if (created < startTs || created >= endTs) return false;
    if (opts.symbol && row.symbol.toUpperCase() !== opts.symbol.toUpperCase()) return false;
    return true;
  }).slice(0, opts.batchSize);

  return filtered.map((row) => ({
    mention_id: String(row.mention_id),
    symbol: row.symbol,
    created_utc: row.created_utc,
    subreddit: row.subreddit,
    title: row.title,
    body_text: row.selftext ?? "",
  }));
}

async function scoreBatch(
  items: Array<{ mention_id: string; subreddit: string | null; symbol: string; title: string | null; body_text: string | null; }>,
  openaiModel: string,
  pauseOn429Ms: number,
): Promise<Map<string, ScoreResult>> {
  const examples = items.map(item => {
    const title = clean(item.title ?? "").slice(0, 240);
    const body = clean(item.body_text ?? "").slice(0, 1600);
    let combined = title;
    if (body) combined += (combined ? "\n\n" : "") + body;
    return {
      mention_id: item.mention_id,
      symbol: item.symbol,
      subreddit: String(item.subreddit ?? ""),
      text: combined.slice(0, 1800),
    };
  });

  const instructions = `You analyze retail-investor sentiment for specific stock symbols in Reddit content.
For EACH input item, return ONE result object with exactly these fields: mention_id, overall_score, label, confidence, rationale.
Rules:
- Sentiment must be about the provided symbol only.
- If unclear/purely informational, use "neu" and score near 0.
Respond as { "results": [ ... ] } with no prose, no code fences, no extra keys.`;

  const RESULT_ITEM_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["mention_id", "overall_score", "label", "confidence", "rationale"],
    properties: {
      mention_id: { type: "string" },
      overall_score: { type: "number" },
      label: { type: "string", enum: ["neg", "neu", "pos"] },
      confidence: { type: "number" },
      rationale: { type: "string" },
    },
  } as const;

  const RESPONSE_SCHEMA = {
    name: "sentiment_batch",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["results"],
      properties: {
        results: {
          type: "array",
          items: RESULT_ITEM_SCHEMA,
          minItems: 1,
        },
      },
    },
  } as const;

  const maxRetries = 6;
  const baseDelay = 400;
  const timeoutMs = 45_000;

  const cleanResult = (o: any): ScoreResult & { mention_id: string } => {
    const mid = String(o?.mention_id ?? "").trim();
    const lblRaw = String(o?.label ?? o?.sentiment ?? "neu").toLowerCase();
    const lbl = lblRaw === "positive" ? "pos"
      : lblRaw === "negative" ? "neg"
      : (lblRaw === "pos" || lblRaw === "neg" || lblRaw === "neu") ? lblRaw
      : "neu";
    return {
      mention_id: mid,
      overall_score: clampNumber(o?.overall_score, -1, 1, 0),
      label: lbl,
      confidence: clampNumber(o?.confidence, 0, 1, 0.5),
      rationale: String(o?.rationale ?? "").slice(0, 300),
    };
  };

  const callOnce = async () => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const to = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: openaiModel,
            temperature: 0,
            response_format: RESPONSE_SCHEMA,
            messages: [
              { role: "system", content: "You are a strict JSON API. Return ONLY valid JSON." },
              { role: "user", content: instructions },
              { role: "user", content: JSON.stringify({ items: examples }) },
            ],
          }),
          signal: controller.signal,
        });
        clearTimeout(to);

        if (response.status === 429) {
          const body = await response.text().catch(() => "");
          if (body.includes("requests per day")) {
            throw new Error("RPD_EXHAUSTED");
          }
          const retryAfter = Number(response.headers.get("retry-after") ?? "0");
          const waitMs = (isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : pauseOn429Ms);
          await sleep(waitMs);
          continue;
        }

        if (response.status >= 500) {
          const text = await response.text().catch(() => "");
          console.error("sentiment-score: OpenAI 5xx", response.status, text.slice(0, 200));
          const waitMs = (baseDelay * Math.pow(2, attempt)) + Math.floor(Math.random() * 300);
          await sleep(waitMs);
          continue;
        }

        if (!response.ok) {
          const text = await response.text().catch(() => "");
          throw new Error(`OpenAI ${response.status}: ${text.slice(0, 200)}`);
        }

        const json = await response.json();
        const raw = stripFences(json?.choices?.[0]?.message?.content ?? "{}");
        let parsed: any;
        try {
          parsed = JSON.parse(raw);
        } catch (err) {
          console.error("sentiment-score: JSON parse error", err, raw.slice(0, 200));
          throw err;
        }
        const arr = Array.isArray(parsed?.results) ? parsed.results : [];
        const resultsMap = new Map<string, ScoreResult>();
        for (const item of arr) {
          const res = cleanResult(item);
          if (!res.mention_id) continue;
          resultsMap.set(res.mention_id, {
            overall_score: res.overall_score,
            label: res.label,
            confidence: res.confidence,
            rationale: res.rationale,
          });
        }
        return resultsMap;
      } catch (err) {
        clearTimeout(to);
        if (err instanceof Error && err.message === "RPD_EXHAUSTED") {
          throw err;
        }
        if (attempt < maxRetries) {
          const waitMs = (baseDelay * Math.pow(2, attempt)) + Math.floor(Math.random() * 300);
          await sleep(waitMs);
          continue;
        }
        throw err;
      }
    }
    throw new Error("Exhausted retries");
  };

  const results = await callOnce();
  await sleep(200);
  return results;
}

async function processReddit(options: {
  start:string;
  end:string;
  modelTag:string;
  batchSize:number;
  maxBatches:number;
  microBatch:number;
  pauseOn429Ms:number;
  overwrite:boolean;
  symbols:string[];
}) {
  if (!supabase) throw new Error("Supabase client not configured");
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");

  const d0 = `${options.start}T00:00:00Z`;
  const d3 = `${options.end}T00:00:00Z`;

  const summary = {
    window: { start: options.start, end: options.end },
    model_tag: options.modelTag,
    batches_run: 0,
    mentions_scored: 0,
    mentions_skipped: 0,
    rpd_exhausted: false,
    failures: [] as Array<{ mention_id: string; error: string }>,
  };

  const symbolList = options.symbols.length > 0 ? options.symbols : [null];

  for (const symbolFilter of symbolList) {
    let batches = 0;
    while (batches < options.maxBatches) {
      const mentions = await fetchRedditMentions({
        modelTag: options.modelTag,
        d0,
        d3,
        symbol: symbolFilter,
        batchSize: options.batchSize,
      });

      if (mentions.length === 0) break;

      batches += 1;
      summary.batches_run += 1;

      const chunks = chunk(mentions, options.microBatch);
      for (const group of chunks) {
        let predictions: Map<string, ScoreResult>;
        try {
          predictions = await scoreBatch(group, OPENAI_MODEL, options.pauseOn429Ms);
        } catch (err) {
          if (err instanceof Error && err.message === "RPD_EXHAUSTED") {
            summary.rpd_exhausted = true;
            return summary;
          }
          console.error("sentiment-score: call to OpenAI failed", err);
          for (const mention of group) {
            summary.failures.push({ mention_id: mention.mention_id, error: (err as Error).message });
          }
          continue;
        }

        for (const mention of group) {
          const result = predictions.get(mention.mention_id);
          if (!result) {
            summary.mentions_skipped += 1;
            continue;
          }

          const upsertPayload = {
            mention_id: mention.mention_id,
            model_version: options.modelTag,
            overall_score: result.overall_score,
            score: result.overall_score,
            label: result.label,
            confidence: result.confidence,
            rationale: result.rationale,
          };

          const { error: upsertError } = await supabase
            .from("reddit_sentiment")
            .upsert(upsertPayload, {
              onConflict: "model_version,mention_id",
            });

          if (upsertError) {
            summary.failures.push({ mention_id: mention.mention_id, error: upsertError.message });
          } else {
            summary.mentions_scored += 1;
          }
        }

        await sleep(200);
      }

      if (mentions.length < options.batchSize) break;
      await sleep(1000);
    }
  }

  return summary;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Supabase client not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let payload: Payload = {};
  try {
    payload = await req.json() as Payload;
  } catch (_) {
    // empty payload => defaults
  }

  const window = defaultWindow();
  const start = parseDateISO(payload.start_date) ?? window.start;
  const end = parseDateISO(payload.end_date) ?? window.end;
  const sources = payload.sources?.length ? payload.sources : ["reddit"];
  const modelTag = payload.model_tag ?? DEFAULT_MODEL_TAG;
  const batchSize = Math.max(1, Number(payload.batch_size ?? 25));
  const maxBatches = Math.max(1, Number(payload.max_batches ?? 3));
  const microBatch = Math.max(1, Number(payload.micro_batch ?? 12));
  const pauseOn429Ms = Math.max(1000, Number(payload.pause_on_429_ms ?? 120000));
  const overwrite = payload.overwrite ?? true;
  const symbols = Array.isArray(payload.symbols) ? payload.symbols.map(s => s.trim()).filter(Boolean) : [];

  const processed: Record<string, unknown> = {};

  if (sources.includes("reddit")) {
    try {
      const summary = await processReddit({
        start,
        end,
        modelTag,
        batchSize,
        maxBatches,
        microBatch,
        pauseOn429Ms,
        overwrite,
        symbols,
      });
      summary.failures = summary.failures.slice(0, 20);
      processed.reddit = summary;
    } catch (error) {
      console.error("sentiment-score reddit processing failed", error);
      return new Response(JSON.stringify({ error: (error as Error).message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  if (sources.includes("stocktwits")) {
    processed.stocktwits = {
      status: "not-implemented",
    };
  }

  return new Response(JSON.stringify({ processed }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
