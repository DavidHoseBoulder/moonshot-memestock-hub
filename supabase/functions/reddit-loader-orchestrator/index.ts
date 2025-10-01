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

function enumerateHourlyWindows(
  start: string,
  end: string,
  stepHours = 1,
): { label: string; startIso: string; endIso: string }[] {
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  const windows: { label: string; startIso: string; endIso: string }[] = [];

  const stepMs = stepHours * 60 * 60 * 1000;
  for (let cursor = startDate.getTime(); cursor < endDate.getTime(); cursor += stepMs) {
    const startIso = new Date(cursor).toISOString();
    const endIso = new Date(Math.min(cursor + stepMs, endDate.getTime())).toISOString();
    const label = `${startIso.slice(0, 13)}:00`; // e.g. 2025-09-29T08
    windows.push({ label, startIso, endIso });
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
        const windows = enumerateHourlyWindows(startDate, endDate);
        const combinedMentions: Record<string, unknown> = {};
        for (const window of windows) {
          if (payload.debug) {
            console.log(
              `[reddit-loader] mentions refresh start ${window.label}`,
            );
          }
          const { data, error } = await supabase.rpc("reddit_refresh_mentions", {
            d0: window.startIso,
            d3: window.endIso,
          });
          if (error) {
            if ((error as { code?: string }).code === "57014") {
              console.warn(
                `[reddit-loader-orchestrator] mentions refresh timeout ${window.label}`,
                error,
              );
              continue;
            }
            throw error;
          }
          if (data && typeof data === "object") {
            const day = window.startIso.slice(0, 10);
            const bucket = combinedMentions[day] as
              | { windowStart: string; windowEnd: string; data: Record<string, unknown> }[]
              | undefined;
            const payload = {
              windowStart: window.startIso,
              windowEnd: window.endIso,
              data: data as Record<string, unknown>,
            };
            if (!bucket) {
              combinedMentions[day] = [payload];
            } else {
              bucket.push(payload);
            }
          }
          if (payload.debug) {
            console.log(
              `[reddit-loader] mentions refresh complete ${window.label}`,
            );
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
