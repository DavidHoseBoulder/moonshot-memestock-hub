import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.223.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

interface BuildMentionsPayload {
  start_date?: string;
  end_date?: string;
  chunk_hours?: number;
  debug?: boolean;
  max_attempts?: number;
}

interface WindowResult {
  start: string;
  end: string;
  cashtag_rows: number;
  keyword_rows: number;
  total_rows: number;
  status: "ok" | "error";
  error?: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[reddit-build-mentions] Supabase credentials missing");
}

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

const DEFAULT_CHUNK_HOURS = Number(
  Deno.env.get("REDDIT_MENTIONS_CHUNK_HOURS") ?? "6",
);
const MIN_CHUNK_MINUTES = Number(
  Deno.env.get("REDDIT_MENTIONS_MIN_MINUTES") ?? "15",
);
const MAX_ATTEMPTS = Number(
  Deno.env.get("REDDIT_MENTIONS_MAX_ATTEMPTS") ?? "3",
);

function normalizeDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toISOString().slice(0, 10);
}

function formatIso(date: Date): string {
  return date.toISOString();
}

interface MentionStats {
  cashtag_rows: number;
  keyword_rows: number;
  total_rows: number;
}

async function runWindow(
  d0: string,
  d3: string,
  debug: boolean,
): Promise<MentionStats> {
  if (debug) console.log("[reddit-build-mentions] window", { d0, d3 });
  const { data, error } = await supabase!.rpc("reddit_refresh_mentions", {
    d0,
    d3,
  });
  if (error) throw error;
  const payload = (data ?? {}) as Record<string, unknown>;
  return {
    cashtag_rows: Number(payload.cashtag_rows ?? 0),
    keyword_rows: Number(payload.keyword_rows ?? 0),
    total_rows: Number(payload.total_rows ?? 0),
  };
}

async function runWindowWithSplit(
  windowStart: Date,
  windowEnd: Date,
  minChunkMinutes: number,
  debug: boolean,
): Promise<{ stats: MentionStats; windows: WindowResult[] }> {
  const diffMs = windowEnd.getTime() - windowStart.getTime();
  const minMs = minChunkMinutes * 60 * 1000;
  if (diffMs <= 0) {
    return {
      stats: { cashtag_rows: 0, keyword_rows: 0, total_rows: 0 },
      windows: [],
    };
  }

  const d0 = formatIso(windowStart);
  const d3 = formatIso(windowEnd);

  try {
    const stats = await runWindow(d0, d3, debug);
    return {
      stats,
      windows: [{
        start: d0,
        end: d3,
        cashtag_rows: stats.cashtag_rows,
        keyword_rows: stats.keyword_rows,
        total_rows: stats.total_rows,
        status: "ok",
      }],
    };
  } catch (error) {
    const err = error as { code?: string; message?: string };
    if (err?.code === "57014" && diffMs > minMs) {
      const mid = new Date(windowStart.getTime() + diffMs / 2);
      if (debug) {
        console.warn(
          "[reddit-build-mentions] splitting window",
          { d0, d3 },
        );
      }
      const left = await runWindowWithSplit(windowStart, mid, minChunkMinutes, debug);
      const right = await runWindowWithSplit(mid, windowEnd, minChunkMinutes, debug);
      return {
        stats: {
          cashtag_rows: left.stats.cashtag_rows + right.stats.cashtag_rows,
          keyword_rows: left.stats.keyword_rows + right.stats.keyword_rows,
          total_rows: left.stats.total_rows + right.stats.total_rows,
        },
        windows: [...left.windows, ...right.windows],
      };
    }
    throw error;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!supabase) {
    return new Response("Supabase client not configured", {
      status: 500,
      headers: corsHeaders,
    });
  }

  let payload: BuildMentionsPayload = {};
  try {
    payload = await req.json() as BuildMentionsPayload;
  } catch (_) {
    // allow empty payload
  }

  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const defaultStart = new Date(today.getTime() - 24 * 60 * 60 * 1000);

  const startDate = payload.start_date
    ? normalizeDate(payload.start_date)
    : defaultStart.toISOString().slice(0, 10);
  const endDate = payload.end_date
    ? normalizeDate(payload.end_date)
    : today.toISOString().slice(0, 10);
  const chunkHours = Math.max(1, payload.chunk_hours ?? DEFAULT_CHUNK_HOURS);
  const debug = payload.debug ?? false;
  const maxAttempts = Math.max(1, payload.max_attempts ?? MAX_ATTEMPTS);

  const results: WindowResult[] = [];

  const startDateTime = new Date(`${startDate}T00:00:00Z`);
  const endDateTime = new Date(`${endDate}T00:00:00Z`);
  const stepMs = chunkHours * 60 * 60 * 1000;
  if (stepMs <= 0 || endDateTime <= startDateTime) {
    return new Response(
      JSON.stringify({
        status: "error",
        message: "Invalid window parameters",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  let cashtagTotal = 0;
  let keywordTotal = 0;
  let overallTotal = 0;

  const queue: Array<{ start: Date; end: Date; attempt: number }> = [];
  for (let ts = startDateTime.getTime(); ts < endDateTime.getTime(); ts += stepMs) {
    const windowStart = new Date(ts);
    const windowEnd = new Date(Math.min(ts + stepMs, endDateTime.getTime()));
    if (windowEnd <= windowStart) continue;
    queue.push({ start: windowStart, end: windowEnd, attempt: 1 });
  }

  const deferredFailures: Array<{ start: Date; end: Date; attempt: number; error: string }> = [];

  while (queue.length > 0) {
    const { start, end, attempt } = queue.shift()!;
    const d0 = formatIso(start);
    const d3 = formatIso(end);
    try {
      const { stats, windows: subWindows } = await runWindowWithSplit(
        start,
        end,
        Math.max(1, MIN_CHUNK_MINUTES),
        debug,
      );
      cashtagTotal += stats.cashtag_rows;
      keywordTotal += stats.keyword_rows;
      overallTotal += stats.total_rows;
      results.push(...subWindows);
    } catch (error) {
      const err = (error as Error).message ?? String(error);
      console.error("[reddit-build-mentions] window failed", { d0, d3, attempt, err });
      if (attempt < maxAttempts) {
        deferredFailures.push({ start, end, attempt: attempt + 1, error: err });
      } else {
        results.push({
          start: d0,
          end: d3,
          cashtag_rows: 0,
          keyword_rows: 0,
          total_rows: 0,
          status: "error",
          error: err,
        });
      }
    }
  }

  if (deferredFailures.length > 0) {
    if (debug) {
      console.warn(
        "[reddit-build-mentions] requeueing failed windows",
        deferredFailures.map(({ start, end, attempt }) => ({
          d0: formatIso(start),
          d3: formatIso(end),
          attempt,
        })),
      );
    }
    for (const failure of deferredFailures) {
      queue.push(failure);
    }
    while (queue.length > 0) {
      const { start, end, attempt } = queue.shift()!;
      const d0 = formatIso(start);
      const d3 = formatIso(end);
      try {
        const { stats, windows: subWindows } = await runWindowWithSplit(
          start,
          end,
          Math.max(1, MIN_CHUNK_MINUTES),
          debug,
        );
        cashtagTotal += stats.cashtag_rows;
        keywordTotal += stats.keyword_rows;
        overallTotal += stats.total_rows;
        results.push(...subWindows);
      } catch (error) {
        const err = (error as Error).message ?? String(error);
        console.error(
          "[reddit-build-mentions] window failed on final retry",
          { d0, d3, attempt, err },
        );
        results.push({
          start: d0,
          end: d3,
          cashtag_rows: 0,
          keyword_rows: 0,
          total_rows: 0,
          status: "error",
          error: err,
        });
      }
    }
  }

  return new Response(
    JSON.stringify({
      status: "ok",
      startDate,
      endDate,
      chunkHours,
      minChunkMinutes: Math.max(1, MIN_CHUNK_MINUTES),
      maxAttempts,
      totals: {
        cashtag_rows: cashtagTotal,
        keyword_rows: keywordTotal,
        total_rows: overallTotal,
      },
      windows: results,
    }),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
