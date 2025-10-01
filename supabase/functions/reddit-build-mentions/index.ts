import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.223.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

interface BuildMentionsPayload {
  start_date?: string;
  end_date?: string;
  chunk_hours?: number;
  debug?: boolean;
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

function normalizeDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toISOString().slice(0, 10);
}

function enumerateWindows(
  start: string,
  end: string,
  chunkHours: number,
): Array<{ start: Date; end: Date }> {
  const windows: Array<{ start: Date; end: Date }> = [];
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  const stepMs = chunkHours * 60 * 60 * 1000;
  for (let ts = startDate.getTime(); ts < endDate.getTime(); ts += stepMs) {
    const windowStart = new Date(ts);
    const windowEnd = new Date(Math.min(ts + stepMs, endDate.getTime()));
    if (windowEnd <= windowStart) continue;
    windows.push({ start: windowStart, end: windowEnd });
  }
  return windows;
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

  const windows = enumerateWindows(startDate, endDate, chunkHours);
  if (windows.length === 0) {
    return new Response(
      JSON.stringify({
        status: "error",
        message: "No windows to process",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const results: WindowResult[] = [];

  for (const window of windows) {
    const d0 = window.start.toISOString();
    const d3 = window.end.toISOString();

    if (debug) {
      console.log("[reddit-build-mentions] window", { d0, d3 });
    }

    try {
      const { data, error } = await supabase.rpc("reddit_refresh_mentions", {
        d0,
        d3,
      });
      if (error) {
        throw error;
      }

      const payloadResult = (data ?? {}) as Record<string, unknown>;
      const cashtagRows = Number(payloadResult.cashtag_rows ?? 0);
      const keywordRows = Number(payloadResult.keyword_rows ?? 0);
      const totalRows = Number(payloadResult.total_rows ?? 0);

      results.push({
        start: d0,
        end: d3,
        cashtag_rows: cashtagRows,
        keyword_rows: keywordRows,
        total_rows: totalRows,
        status: "ok",
      });
    } catch (error) {
      console.error(
        "[reddit-build-mentions] window failed",
        { d0, d3, error },
      );
      results.push({
        start: d0,
        end: d3,
        cashtag_rows: 0,
        keyword_rows: 0,
        total_rows: 0,
        status: "error",
        error: (error as Error).message ?? String(error),
      });
      break;
    }
  }

  return new Response(
    JSON.stringify({
      status: "ok",
      startDate,
      endDate,
      chunkHours,
      windows: results,
    }),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
