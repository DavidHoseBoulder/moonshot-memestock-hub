import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.223.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

import { fetchPostsForWindow } from "./lib/fetch_posts.ts";
import { fetchCommentsForWindow } from "./lib/fetch_comments.ts";

interface LoaderPayload {
  start_date?: string;
  end_date?: string;
  subreddit_filter?: string[];
  persist_raw?: boolean;
  skip_comments?: boolean;
  debug?: boolean;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing Supabase credentials in Edge function environment.");
}

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

function enumerateDayBounds(
  start: string,
  end: string,
): { day: string; startMs: number; endMs: number }[] {
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  const out: { day: string; startMs: number; endMs: number }[] = [];
  for (const cursor = new Date(startDate); cursor < endDate;) {
    const day = cursor.toISOString().slice(0, 10);
    const dayStartMs = cursor.getTime();
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const dayEndMs = cursor.getTime();
    out.push({ day, startMs: dayStartMs, endMs: dayEndMs });
  }
  return out;
}

interface MentionWindowPayload {
  windowStart: string;
  windowEnd: string;
  data: Record<string, unknown>;
}

async function refreshMentionsWindow(
  supabase: ReturnType<typeof createClient>,
  startIso: string,
  endIso: string,
  debug: boolean,
  label: string,
): Promise<MentionWindowPayload | null> {
  if (debug) {
    console.log(`[reddit-loader] mentions refresh start ${label}`);
  }
  const { data, error } = await supabase.rpc("reddit_refresh_mentions", {
    d0: startIso,
    d3: endIso,
  });
  if (error) {
    throw error;
  }
  if (data && typeof data === "object") {
    if (debug) {
      console.log(`[reddit-loader] mentions refresh complete ${label}`);
    }
    return { windowStart: startIso, windowEnd: endIso, data: data as Record<string, unknown> };
  }
  return null;
}

async function refreshMentionsRecursively(
  supabase: ReturnType<typeof createClient>,
  startMs: number,
  endMs: number,
  debug: boolean,
  stepMs: number,
  minStepMs: number,
  depth = 0,
): Promise<MentionWindowPayload[]> {
  if (startMs >= endMs) return [];
  const startIso = new Date(startMs).toISOString();
  const endIso = new Date(endMs).toISOString();
  const label = `${startIso.slice(0, 13)}:${startIso.slice(14, 16)}`;

  try {
    const payload = await refreshMentionsWindow(supabase, startIso, endIso, debug, label);
    return payload ? [payload] : [];
  } catch (error) {
    if ((error as { code?: string }).code === "57014" && stepMs > minStepMs) {
      const mid = startMs + Math.floor((endMs - startMs) / 2);
      if (debug) {
        console.warn(
          `[reddit-loader-orchestrator] mentions timeout ${label}; splitting (depth=${depth})`,
        );
      }
      const left = await refreshMentionsRecursively(
        supabase,
        startMs,
        mid,
        debug,
        Math.floor(stepMs / 2),
        minStepMs,
        depth + 1,
      );
      const right = await refreshMentionsRecursively(
        supabase,
        mid,
        endMs,
        debug,
        Math.floor(stepMs / 2),
        minStepMs,
        depth + 1,
      );
      return [...left, ...right];
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

  let payload: LoaderPayload = {};
  try {
    payload = await req.json() as LoaderPayload;
  } catch (_) {
    // allow empty body
  }

  console.log("[reddit-loader-orchestrator] payload", payload);

  const now = new Date();
  const endDefault = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const startDefault = new Date(endDefault.getTime() - 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const startDate = payload.start_date ?? fmt(startDefault);
  const endDate = payload.end_date ?? fmt(endDefault);

  try {
    const postResult = await fetchPostsForWindow({
      startDate,
      endDate,
      subreddits: payload.subreddit_filter,
      supabaseClient: supabase,
      persistRaw: payload.persist_raw ?? false,
      debug: payload.debug ?? false,
    });

    let commentResult: Awaited<ReturnType<typeof fetchCommentsForWindow>> = [];
    let mentionsResult: Record<string, unknown> | null = null;

    if (!payload.skip_comments) {
      commentResult = await fetchCommentsForWindow({
        startDate,
        endDate,
        subreddits: payload.subreddit_filter,
        supabaseClient: supabase,
        persistRaw: payload.persist_raw ?? false,
        postsBySubreddit: postResult.postsBySubreddit,
        activeTickers: postResult.activeTickers,
        debug: payload.debug ?? false,
      });

      try {
        const combinedMentions: Record<string, MentionWindowPayload[]> = {};
        const dayBounds = enumerateDayBounds(startDate, endDate);
        const hourMs = 60 * 60 * 1000;
        const minStepMs = 15 * 60 * 1000;

        for (const { day, startMs, endMs } of dayBounds) {
          const results = await refreshMentionsRecursively(
            supabase,
            startMs,
            endMs,
            payload.debug ?? false,
            hourMs,
            minStepMs,
          );
          if (results.length > 0) {
            combinedMentions[day] = results;
          }
        }
        if (Object.keys(combinedMentions).length > 0) {
          mentionsResult = combinedMentions;
        }
        if (payload.debug) {
          console.log(
            "[reddit-loader-orchestrator] mentions refresh aggregation",
            mentionsResult,
          );
        }
      } catch (err) {
        console.warn(
          "[reddit-loader-orchestrator] mentions refresh failed",
          err,
        );
      }
    }

    return new Response(
      JSON.stringify({
        status: "ok",
        startDate,
        endDate,
        postBatches: postResult.batches,
        commentBatches: commentResult,
        activeTickers: postResult.activeTickers,
        mentions: mentionsResult,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("[reddit-loader-orchestrator] failure", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message ?? "unknown" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
