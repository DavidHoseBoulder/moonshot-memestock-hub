// reddit_score_mentions.ts — fixed
// PARAMS you pass from the wrapper:
//   :model_tag   text         e.g. 'gpt-sent-v1'
//   :start_date    timestamptz  e.g. '2025-09-08'
//   :end_date      timestamptz  e.g. '2025-09-10'
//   :symbols     text[] or NULL  e.g. ARRAY['NVDA','AMD'] or NULL

import { parse } from "jsr:@std/dotenv/parse";
try {
  const raw = await Deno.readTextFile(".env");
  const conf = parse(raw);
  for (const [k, v] of Object.entries(conf)) {
    if (Deno.env.get(k) === undefined) Deno.env.set(k, v);
  }
} catch {}

const PGURI          = Deno.env.get("PGURI") ?? "";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const START_DATE     = Deno.env.get("START_DATE")  ?? "1970-01-01T00:00:00Z";
const END_DATE       = Deno.env.get("END_DATE")    ?? "2100-01-01T00:00:00Z";
const MODEL_TAG      = Deno.env.get("MODEL_TAG") ?? "gpt-sent-v1";
const BATCH_SIZE     = Number(Deno.env.get("BATCH_SIZE") ?? 25);
const MAX_BATCHES    = Number(Deno.env.get("MAX_BATCHES") ?? 3);
const SLEEP_MS       = Number(Deno.env.get("SLEEP_MS") ?? 300);
const OPENAI_MODEL   = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini";

// comma-separated symbols or empty => null
const rawSymbols = (Deno.env.get("SYMBOLS") ?? "").trim();
const SYMBOLS = /^(?:null|none|\[\])$/i.test(rawSymbols) ? "" : rawSymbols;
// SYMBOLS_ARR: null if empty; else uppercase array
const SYMBOLS_ARR = SYMBOLS
  ? SYMBOLS.split(",").map(s => s.trim()).filter(Boolean).map(s => s.toUpperCase())
  : null;
const MICRO_BATCH = Number(Deno.env.get("MICRO_BATCH") ?? 12); // how many mentions per API call
const PAUSE_ON_429_MS = Number(Deno.env.get("PAUSE_ON_429_MS") ?? 120000); // 2m

if (!PGURI) { console.error("❌ PGURI is required."); Deno.exit(1); }
if (!OPENAI_API_KEY || !OPENAI_API_KEY.startsWith("sk-")) {
  console.error("❌ OPENAI_API_KEY missing or invalid."); Deno.exit(1);
}
console.log("Using MODEL_TAG =", MODEL_TAG, "START_DATE =", START_DATE, "END_DATE =", END_DATE, "BATCH_SIZE =", BATCH_SIZE, "MAX_BATCHES =", MAX_BATCHES, "SYMBOLS =",SYMBOLS, "SYMBOLS_ARR =", SYMBOLS_ARR);

import pg from "npm:pg@8.11.3";
const { Pool } = pg;

// Parse PGURI and drop the query (?sslmode=...)
const u = new URL(Deno.env.get("PGURI")!);
const pool = new Pool({
  host: u.hostname,
  port: Number(u.port || 5432),
  user: decodeURIComponent(u.username),
  password: decodeURIComponent(u.password),
  database: u.pathname.slice(1),
  // Force a permissive TLS client so we ignore the odd cert chain from the pooler
  ssl: { rejectUnauthorized: false },
});

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function clean(s) {
  return (s ?? "").toString()
    .replace(/[\\u0000-\\u001F\\u007F]/g, "") /* strip control chars */
    .replace(/[ \\t\\f\\v]+/g, " ")            /* collapse whitespace */
    .trim();
}

// --- helper: strip code fences the model might add ---
function stripFences(s: string): string {
  let t = s?.trim() ?? "";
  if (t.startsWith("```")) {
    // remove ```json ... ``` or ``` ...
    t = t.replace(/^```json\s*/i, "").replace(/^```\s*/i, "");
    if (t.endsWith("```")) t = t.slice(0, -3);
    t = t.trim();
  }
  return t;
}



// Single input to model
async function scoreSentiment(input: {
  subreddit: string; symbol: string; title: string; body_text: string;
}) {
  const { subreddit, symbol, title } = input;
  const body = (input.body_text ?? "").slice(0, 2000);

  const prompt = `
You analyze retail-investor sentiment about a specific stock symbol in a Reddit post or comment.
Return JSON with fields:
- overall_score: float in [-1, 1]
- label: "neg" | "neu" | "pos"
- confidence: float in [0, 1]
- rationale: brief phrase (<= 20 words)

Subreddit: ${subreddit}
Symbol to evaluate: ${symbol}

Title:
${title ?? ""}

Body:
${body}

Rules:
- Judge sentiment about ${symbol} specifically (not the market/sector).
- If unclear or informational, return "neu" (score near 0).
- One label only. Return ONLY JSON.
`.trim();

  // 🔹 DEBUG: log the prompt once per run
  if (!(globalThis as any).__PROMPT_LOGGED__) {
    console.log("DEBUG_PROMPT_SAMPLE:\n", prompt);
    (globalThis as any).__PROMPT_LOGGED__ = true;
  }

  const maxRetries = 6;
  const baseDelay = 400;
  const timeoutMs = 45000; // 45s hard cap per request

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
    model: OPENAI_MODEL,        // keep your env model
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are a strict JSON API. Respond ONLY with a single JSON object that matches the requested fields. No prose, no code fences."
      },
      { role: "user", content: prompt }   // <-- use 'prompt' here
    ],
  }),
      });
      clearTimeout(to);

      // 🔹 DEBUG: log non-200 responses
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        console.error(`DEBUG_API_ERROR: status=${response.status} body=${text.slice(0, 300)}`);
        throw new Error(`OpenAI ${response.status}: ${text.slice(0, 200)}`);
      }

      const j = await response.json();
      const txt = j?.choices?.[0]?.message?.content ?? "{}";

      (globalThis as any).__LOGS__ ??= 0;
      if ((globalThis as any).__LOGS__ < 3) {
        console.log("RAW_MODEL_JSON:", txt);
        (globalThis as any).__LOGS__++;
      }

      let parsed: any;
      try { parsed = JSON.parse(txt); }
      catch { throw new Error("Model did not return valid JSON. See RAW_MODEL_JSON above."); }

      return {
        overall_score: Number(parsed.overall_score ?? 0),
        label: String(parsed.label ?? "neu"),
        confidence: Number(parsed.confidence ?? 0.5),
        rationale: String(parsed.rationale ?? "n/a").slice(0, 300),
      };
    } catch (err) {
      clearTimeout(to);
      if (attempt < maxRetries) {
        const waitMs = Math.round((baseDelay * Math.pow(2, attempt)) + Math.random() * 300);
        await new Promise(res => setTimeout(res, waitMs));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Exhausted retries without a response.");
}

function sleep(ms: number) { return new Promise(res => setTimeout(res, ms)); }
// Upsert into reddit_sentiment; write overall_score and mirror it into legacy score
const UPSERT_SQL = `
INSERT INTO reddit_sentiment
  (mention_id, model_version, overall_score, label, confidence, rationale)
VALUES ($1::bigint, $2, $3, $4, $5, $6)
ON CONFLICT (model_version, mention_id) DO UPDATE
SET overall_score = EXCLUDED.overall_score,
    score         = EXCLUDED.overall_score,  -- keep legacy "score" in sync
    label         = EXCLUDED.label,
    confidence    = EXCLUDED.confidence,
    rationale     = EXCLUDED.rationale;
`;

// 5) SQL helpers (fetch - optionally by symbol - & upsert)

const FETCH_SQL = `
WITH params AS (
  SELECT
    $1::text         AS model_tag,
    $2::timestamptz  AS start_ts,
    $3::timestamptz  AS end_ts,
    NULLIF($4::text, '') AS symbol_filter
),
unscored AS (
  SELECT m.*
  FROM reddit_mentions m, params
  WHERE m.created_utc >= params.start_ts
    AND m.created_utc <  params.end_ts
    AND (params.symbol_filter IS NULL OR UPPER(m.symbol) = UPPER(params.symbol_filter))
    AND NOT EXISTS (
      SELECT 1
      FROM reddit_sentiment s
      WHERE s.mention_id = m.mention_id
        AND s.model_version = params.model_tag
    )
),
joined AS (
  SELECT
    u.mention_id ::text AS mention_id,
    u.doc_type,
    u.doc_id,
    u.post_id,
    u.symbol,
    u.created_utc,
    CASE WHEN u.doc_type = 'post'    THEN p.subreddit
         WHEN u.doc_type = 'comment' THEN c.subreddit
         ELSE NULL END AS subreddit,
    COALESCE(p.title, '') AS title,
    CASE WHEN u.doc_type = 'post'    THEN COALESCE(p.selftext, '')
         WHEN u.doc_type = 'comment' THEN COALESCE(c.body, '')
         ELSE '' END AS body_text
  FROM unscored u
  LEFT JOIN reddit_finance_keep_norm p
    ON u.doc_type = 'post' AND u.doc_id = p.post_id::text
  LEFT JOIN reddit_comments c
    ON u.doc_type = 'comment' AND u.doc_id = c.comment_id::text
)
SELECT * FROM joined
ORDER BY created_utc ASC
LIMIT $5;
`;

// 4) Model call (BATCHED, hardened: strict schema + gap recovery)
async function scoreBatch(items: Array<{
  mention_id: string;
  subreddit: string | null;
  symbol: string;
  title: string | null;
  body_text: string | null;
}>): Promise<Map<string, {
  overall_score: number; label: string; confidence: number; rationale: string;
}>> {

  // Compact & clamp per-item text to reduce truncation risk
  const toExample = (it: typeof items[number]) => {
    const t = (it.title ?? "").slice(0, 240);
    const b = (it.body_text ?? "").slice(0, 1600);
    let text = "";
    if (t) text += t;
    if (b) text += (text ? "\n\n" : "") + b;
    // final clamp to keep ultra-small
    return {
      mention_id: it.mention_id,
      symbol: it.symbol,
      subreddit: String(it.subreddit ?? ""),
      text: text.slice(0, 1800),
    };
  };

  // JSON Schema to force exactly what we want
  const RESULT_ITEM_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["mention_id", "overall_score", "label", "confidence", "rationale"],
    properties: {
      mention_id: { type: "string" },
      overall_score: { type: "number" },
      label: { type: "string", enum: ["neg", "neu", "pos"] },
      confidence: { type: "number" },
      rationale: { type: "string" }
    }
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
          minItems: 1
        }
      }
    }
  };

  function cleanResult(o: any) {
  const mid = String(o?.mention_id ?? "").trim();
  const lbl = String(o?.label ?? o?.sentiment ?? "neu").toLowerCase();
  return {
    mention_id: mid,
    overall_score: Number(o?.overall_score ?? 0),
    label: lbl === "positive" ? "pos" : lbl === "negative" ? "neg" : (lbl === "pos" || lbl === "neg" || lbl === "neu" ? lbl : "neu"),
    confidence: Math.max(0, Math.min(1, Number(o?.confidence ?? 0.5))),
    rationale: String(o?.rationale ?? "").slice(0, 300),
  };
}


  // shared caller to OpenAI for a given slice of items
  const callOnce = async (slice: typeof items) => {
    const examples = slice.map(toExample);

const instructions =
`You analyze retail-investor sentiment for specific stock symbols in Reddit content.

For EACH input item, return ONE result object with EXACTLY these fields:
- mention_id: string (echo exactly as provided)
- overall_score: number in [-1, 1]
- label: "neg" | "neu" | "pos"
- confidence: number in [0, 1]
- rationale: brief string (<= 20 words)

Scoring rules:
- Judge sentiment about the specific "symbol" only (not market/sector).
- If unclear/purely informational, use "neu" and score near 0.

Respond as a single JSON object with this shape:
{ "results": [ { ...for item 1... }, { ...for item 2... }, ... ] }
No prose. No code fences. No extra keys.`;


    const maxRetries = 6;
    const baseDelay = 400;
    const timeoutMs = 45000;

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
            model: OPENAI_MODEL,
            temperature: 0,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: "You are a strict JSON API. Return ONLY valid JSON. No prose, no code fences." },
              { role: "user", content: instructions },
              { role: "user", content: JSON.stringify({ items: examples }) },
            ],
}),
        });
        clearTimeout(to);

        // 429 RPD short-circuit (keep your behavior)
        if (response.status === 429) {
          const body = await response.text().catch(() => "");
          if (body.includes("requests per day (RPD)")) {
            console.error("DEBUG_API_ERROR: RPD exhausted. Exiting run.");
            throw new Error("RPD_EXHAUSTED");
          }
          const ra = Number(response.headers.get("retry-after") ?? "0");
          const waitMs = (isFinite(ra) && ra > 0 ? ra * 1000 : baseDelay) + Math.floor(Math.random() * 250);
          await new Promise(res => setTimeout(res, waitMs));
          continue;
        }
        if (response.status >= 500) {
          const text = await response.text().catch(() => "");
          console.error("DEBUG_API_ERROR:", response.status, text.slice(0, 400));
          if (attempt < maxRetries) {
            const waitMs = Math.round((baseDelay * Math.pow(2, attempt)) + Math.random() * 300);
            await new Promise(res => setTimeout(res, waitMs));
            continue;
          }
          throw new Error(`OpenAI ${response.status}: ${text.slice(0, 500)}`);
        }
        if (!response.ok) throw new Error(`OpenAI ${response.status}: ${await response.text()}`);

        const j = await response.json();
        let raw = j?.choices?.[0]?.message?.content ?? "{}";
        raw = stripFences(raw);

        let parsed: any;
        try { parsed = JSON.parse(raw); } catch { throw new Error("Model returned non-JSON."); }

        // Prefer {"results":[...]} but tolerate a couple of variants
        let arr = parsed?.results;
        if (!arr && Array.isArray(parsed)) arr = parsed;                // bare array
        if (!arr && Array.isArray(parsed?.result)) arr = parsed.result; // "result" key

        if (!Array.isArray(arr)) throw new Error("Model JSON not an array of results.");

        // Map results by mention_id (ignore any strays)
        const out = new Map<string, { overall_score: number; label: string; confidence: number; rationale: string }>();
        for (const o0 of arr) {
          const o = cleanResult(o0);
          if (!o.mention_id) continue;
          out.set(o.mention_id, {
            overall_score: o.overall_score,
            label: o.label,
            confidence: o.confidence,
            rationale: o.rationale,
          });
        }
        return out;
      } catch (err: any) {
        clearTimeout(to);
        if (String(err?.message ?? "").includes("RPD_EXHAUSTED")) throw err;
        if (attempt < maxRetries) {
          const waitMs = Math.round((baseDelay * Math.pow(2, attempt)) + Math.random() * 300);
          await new Promise(res => setTimeout(res, waitMs));
          continue;
        }
        throw err;
      }
    }
    throw new Error("Exhausted retries (batch call).");
  };

  // 1) First pass for the whole batch
  const first = await callOnce(items);
  if (!(globalThis as any).__FIRST_KEYS_LOG__) {
   console.log("DEBUG_FIRST_KEYS(sample):", Array.from(first.keys()).slice(0, 8).join(","));
   (globalThis as any).__FIRST_KEYS_LOG__ = true;
  }
  const missing = items.filter(it => !first.has(String(it.mention_id)));
  if (missing.length === 0) return first;

  console.warn(`Batch JSON missing ${missing.length}/${items.length} mention_ids. Retrying the gaps once...`);
  // 2) One retry wave for just the missing
  let recovered = new Map<string, { overall_score: number; label: string; confidence: number; rationale: string }>();
  if (missing.length > 0) {
    try {
      recovered = await callOnce(missing);
    } catch (e) {
      // tolerate a hard failure here; we’ll fall back to singles
      console.error("DEBUG_GAP_RETRY_FAILED:", (e as any)?.message ?? e);
    }
  }

  // Merge results we have so far
  for (const [k, v] of recovered) first.set(k, v);

  // 3) If any gaps remain, fall back to single-item scoring for those few
  const stillMissing = items.filter(it => !first.has(it.mention_id));
  if (stillMissing.length) {
    console.warn(`DEBUG_BATCH_FINAL_GAPS: ${stillMissing.length}/${items.length} still missing after recovery`);
    for (const it of stillMissing) {
      try {
        const one = await scoreSentiment({
          subreddit: String(it.subreddit ?? ""),
          symbol: it.symbol,
          title: String(it.title ?? ""),
          body_text: String(it.body_text ?? ""),
        });
        first.set(it.mention_id, one);
      } catch (e) {
        console.error(`mention_id=${it.mention_id} final single scoring failed:`, (e as any)?.message ?? e);
      }
    }
  }

  return first;
}

// Corrected logic for runBatch
async function runBatch(limit = BATCH_SIZE, symbol: string | null = null): Promise<{ fetched: number; processed: number }> {
  const client = await pool.connect();
  try {
    const r = await client.query(FETCH_SQL, [
      MODEL_TAG,
      START_DATE,
      END_DATE,
      symbol ?? "",
      limit
    ]);
    const rows = r.rows as Array<{
  mention_id: string;
  doc_type: "post" | "comment";
  doc_id: string;
  post_id: string | null;
  symbol: string;
  created_utc: string;
  subreddit: string | null;
  title: string | null;
  body_text: string | null;
}>;
   const fetched = rows.length;
if (!fetched) return { fetched, processed: 0 };

let processed = 0;

// Break the DB rows into micro-batches and score each chunk in one API call
for (const grp of chunk(rows, MICRO_BATCH)) {
  if (!(globalThis as any).__SEEN_SEND_IDS__) {
        console.log("DEBUG_SEND_IDS(sample):", grp.slice(0, 8).map(r => String(r.mention_id)).join(","));
   (globalThis as any).__SEEN_SEND_IDS__ = true;
  }
  try {
    // scoreBatch accepts the same shape as rows (mention_id, subreddit, symbol, title, body_text)
    const results = await scoreBatch(
      grp.map(r => ({
        mention_id: String(r.mention_id),
        subreddit: r.subreddit ?? "",
        symbol: r.symbol,
        title: r.title ?? "",
        body_text: r.body_text ?? "",
      }))
    );
    if (!(globalThis as any).__SEEN_RECV_IDS__) {
     console.log("DEBUG_RECV_IDS(sample):", Array.from(results.keys()).slice(0, 8).join(","));
     (globalThis as any).__SEEN_RECV_IDS__ = true;
   }

    // Upsert each result returned by the model
    for (const r of grp) {
      const scored = results.get(String(r.mention_id));
      if (!scored) {
        console.error(`mention_id=${r.mention_id} missing in model response; skipping.`);
        continue;
      }
      await client.query(UPSERT_SQL, [
        String(r.mention_id),
        MODEL_TAG,
        scored.overall_score,
        scored.label,
        scored.confidence,
        scored.rationale,
      ]);
      processed++;
    }

    // Gentle pacing between API calls
    await sleep(SLEEP_MS);
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg.includes("RPD_EXHAUSTED")) {
      console.error("Hit daily RPD limit. Stopping this run cleanly.");
      return { fetched, processed };
    }
    console.error("Batch-scoring error:", msg);
    // small backoff then continue with next group
    await sleep(1000);
  }
}

    return { fetched, processed };
  } finally {
    client.release();
  }
}

// 7) Main
let total = 0;
if (SYMBOLS_ARR?.length) {
for (const sym of SYMBOLS_ARR) {
    console.log(`\n=== Draining symbol ${sym} ===`);
    for (let i = 0; i < MAX_BATCHES; i++) {
	  const { fetched, processed } = await runBatch(BATCH_SIZE, sym);
	  if (!fetched) break;
	  total += processed;
          console.log(`Batch ${i+1}/${MAX_BATCHES} [${sym}]: fetched ${fetched}, processed ${processed} (total ${total})`);
	  // The line ']);' was here and has been removed.
	  if (processed === 0) break;
          await sleep(1000);
    }
  }
}
else {
// no symbol filter
  for (let i = 0; i < MAX_BATCHES; i++) {
    const { fetched, processed } = await runBatch(BATCH_SIZE, null);
    if (!fetched) { console.log("No more unscored mentions for this model."); break; }
    console.log(`Batch ${i+1}/${MAX_BATCHES}: fetched ${fetched}, processed ${processed} (total ${total + processed})`);
    total += processed;
    if (processed === 0) break;
    await sleep(1000);
  }
}

console.log(`Done. Total processed: ${total}`);
await pool.end();
function replace(arg0: RegExp, arg1: string) {
  throw new Error("Function not implemented.");
}
