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
  remaining_subreddits?: string[];
  current_batch?: string[];
  phase?: "posts" | "comments";
  batch_id?: string;
  active_tickers?: string[];
  posts_map?: Record<string, Record<string, string[]>>;
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
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: {
      fetch,
    },
  })
  : null;

const MAX_SUBREDDITS_PER_BATCH = Number(
  Deno.env.get("REDDIT_BATCH_SIZE") ?? "8",
);
const BATCH_CHAIN_DELAY_MS = Number(
  Deno.env.get("REDDIT_BATCH_CHAIN_DELAY_MS") ?? "5000",
);

async function loadActiveSubreddits(client: ReturnType<typeof createClient>): Promise<string[]> {
  const { data, error } = await client
    .from("subreddit_universe")
    .select("name")
    .eq("active", true)
    .order("priority", { ascending: true })
    .limit(500);

  if (error) {
    throw new Error(`Failed to load subreddit universe: ${error.message}`);
  }

  return (data ?? [])
    .map((row: { name?: string | null }) => row.name?.trim())
    .filter((name): name is string => !!name);
}

function normalizeSubreddits(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const trimmed = (item ?? "").trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(trimmed);
  }
  return out;
}

async function triggerNextInvocation(payload: LoaderPayload) {
  if (!supabase) {
    console.error(
      "[reddit-loader-orchestrator] cannot chain invocation (client missing)",
    );
    return;
  }

  try {
    if (BATCH_CHAIN_DELAY_MS > 0) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_CHAIN_DELAY_MS));
    }

    console.log(
      "[reddit-loader-orchestrator] triggering chained invocation",
      {
        phase: payload.phase ?? "posts",
        batchSize: payload.current_batch?.length ?? payload.remaining_subreddits?.length ?? 0,
        batchId: payload.batch_id,
      },
    );

    const { error, data } = await supabase.functions.invoke(
      "reddit-loader-orchestrator",
      { body: payload },
    );

    if (error) {
      console.error(
        "[reddit-loader-orchestrator] chained invocation failed",
        {
          message: error.message,
          status: (error as { status?: number }).status,
          context: (error as { context?: unknown }).context,
        },
      );
    } else {
      console.log(
        "[reddit-loader-orchestrator] chained invocation response",
        {
          phase: payload.phase ?? "posts",
          batchId: payload.batch_id,
          hasData: data !== null && data !== undefined,
        },
      );
    }
  } catch (err) {
    console.error(
      "[reddit-loader-orchestrator] error triggering chained invocation",
      err,
    );
  }
}

async function triggerMentionsBuild(
  startDate: string,
  endDate: string,
  debug: boolean,
) {
  if (!supabase) {
    console.error(
      "[reddit-loader-orchestrator] cannot trigger mentions build (client missing)",
    );
    return;
  }

  const invoke = async () => {
    try {
      const { data, error } = await supabase.functions.invoke(
        "reddit-build-mentions",
        {
          body: {
            start_date: startDate,
            end_date: endDate,
            debug,
          },
        },
      );
      if (error) {
        console.error(
          "[reddit-loader-orchestrator] mentions build failed",
          error.message ?? error,
        );
      } else {
        console.log(
          "[reddit-loader-orchestrator] mentions build triggered",
          data,
        );
      }
    } catch (err) {
      console.error(
        "[reddit-loader-orchestrator] error invoking mentions build",
        err,
      );
    }
  };

  try {
    // @ts-ignore Edge runtime types not available locally
    if (typeof globalThis.EdgeRuntime !== "undefined" && globalThis.EdgeRuntime.waitUntil) {
      // @ts-ignore
      globalThis.EdgeRuntime.waitUntil(invoke());
    } else {
      invoke();
    }
  } catch (_) {
    invoke();
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
    const phase: "posts" | "comments" = payload.phase ?? "posts";
    const batchId = payload.batch_id ?? crypto.randomUUID();

    let remainingSubreddits = normalizeSubreddits(
      payload.remaining_subreddits ?? [],
    );
    let currentBatch = normalizeSubreddits(payload.current_batch ?? []);

    if (phase === "posts" && remainingSubreddits.length === 0) {
      const baseList = payload.subreddit_filter
        ?? await loadActiveSubreddits(supabase);
      remainingSubreddits = normalizeSubreddits(baseList);
    }

    if (phase === "posts" && currentBatch.length === 0) {
      currentBatch = remainingSubreddits.slice(0, MAX_SUBREDDITS_PER_BATCH);
      remainingSubreddits = remainingSubreddits.slice(currentBatch.length);
    }

    if (phase === "comments" && currentBatch.length === 0) {
      console.warn(
        "[reddit-loader-orchestrator] comments phase invoked without batch",
        { batchId },
      );
      return new Response(
        JSON.stringify({
          status: "ok",
          startDate,
          endDate,
          phase,
          processedSubreddits: [],
          remainingSubreddits: remainingSubreddits.length,
          batchId,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (currentBatch.length === 0 && remainingSubreddits.length === 0) {
      return new Response(
        JSON.stringify({
          status: "ok",
          startDate,
          endDate,
          phase,
          processedSubreddits: [],
          remainingSubreddits: 0,
          batchId,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let postResult: Awaited<ReturnType<typeof fetchPostsForWindow>> | null = null;
    let commentResult: Awaited<ReturnType<typeof fetchCommentsForWindow>> = [];

    if (phase === "posts") {
      postResult = await fetchPostsForWindow({
        startDate,
        endDate,
        subreddits: currentBatch,
        supabaseClient: supabase,
        persistRaw: payload.persist_raw ?? false,
        debug: payload.debug ?? false,
      });

      console.log(
        "[reddit-loader-orchestrator] posts phase complete",
        {
          batchId,
          startDate,
          endDate,
          subreddits: currentBatch,
          batches: postResult.batches.length,
          postsTotal: postResult.batches.reduce((sum, item) => sum + item.count, 0),
        },
      );

      if (!payload.skip_comments) {
        const chainPayload: LoaderPayload = {
          start_date: startDate,
          end_date: endDate,
          persist_raw: payload.persist_raw ?? false,
          skip_comments: payload.skip_comments ?? false,
          debug: payload.debug ?? false,
          phase: "comments",
          current_batch: currentBatch,
          remaining_subreddits: remainingSubreddits,
          batch_id: batchId,
          active_tickers: postResult.activeTickers,
        };

        const postMapKeys = Object.keys(postResult.postsBySubreddit ?? {});
        if (postMapKeys.length > 0) {
          const serializedLength = JSON.stringify(postResult.postsBySubreddit).length;
          if (serializedLength < 750_000) {
            chainPayload.posts_map = postResult.postsBySubreddit;
          } else {
            console.warn(
              "[reddit-loader-orchestrator] posts_map omitted from chain payload (size)",
              { batchId, bytes: serializedLength, subreddits: postMapKeys.length },
            );
          }
        }

        try {
          // @ts-ignore Edge runtime types not available locally
          if (typeof globalThis.EdgeRuntime !== "undefined" && globalThis.EdgeRuntime.waitUntil) {
            // @ts-ignore
            globalThis.EdgeRuntime.waitUntil(triggerNextInvocation(chainPayload));
          } else {
            triggerNextInvocation(chainPayload);
          }
        } catch (_) {
          triggerNextInvocation(chainPayload);
        }
      } else if (remainingSubreddits.length > 0) {
        const nextPayload: LoaderPayload = {
          start_date: startDate,
          end_date: endDate,
          persist_raw: payload.persist_raw ?? false,
          skip_comments: payload.skip_comments ?? false,
          debug: payload.debug ?? false,
          phase: "posts",
          remaining_subreddits: remainingSubreddits,
          batch_id: batchId,
        };

        try {
          // @ts-ignore
          if (typeof globalThis.EdgeRuntime !== "undefined" && globalThis.EdgeRuntime.waitUntil) {
            // @ts-ignore
            globalThis.EdgeRuntime.waitUntil(triggerNextInvocation(nextPayload));
          } else {
            triggerNextInvocation(nextPayload);
          }
        } catch (_) {
          triggerNextInvocation(nextPayload);
        }
      } else {
        console.log(
          "[reddit-loader-orchestrator] batch chain complete",
          { batchId },
        );
        if (payload.skip_comments ?? false) {
          triggerMentionsBuild(startDate, endDate, payload.debug ?? false);
        }
      }
    } else {
      commentResult = await fetchCommentsForWindow({
        startDate,
        endDate,
        subreddits: currentBatch,
        supabaseClient: supabase,
        persistRaw: payload.persist_raw ?? false,
        postsBySubreddit: payload.posts_map ?? {},
        activeTickers: payload.active_tickers ?? [],
        debug: payload.debug ?? false,
      });

      console.log(
        "[reddit-loader-orchestrator] comments phase complete",
        {
          batchId,
          startDate,
          endDate,
          subreddits: currentBatch,
          batches: commentResult.length,
          commentsTotal: commentResult.reduce((sum, item) => sum + item.commentCount, 0),
        },
      );

      if (remainingSubreddits.length > 0) {
        const nextPayload: LoaderPayload = {
          start_date: startDate,
          end_date: endDate,
          persist_raw: payload.persist_raw ?? false,
          skip_comments: payload.skip_comments ?? false,
          debug: payload.debug ?? false,
          phase: "posts",
          remaining_subreddits: remainingSubreddits,
          batch_id: batchId,
        };

        try {
          // @ts-ignore
          if (typeof globalThis.EdgeRuntime !== "undefined" && globalThis.EdgeRuntime.waitUntil) {
            // @ts-ignore
            globalThis.EdgeRuntime.waitUntil(triggerNextInvocation(nextPayload));
          } else {
            triggerNextInvocation(nextPayload);
          }
        } catch (_) {
          triggerNextInvocation(nextPayload);
        }
      } else {
        console.log(
          "[reddit-loader-orchestrator] batch chain complete",
          { batchId },
        );
        triggerMentionsBuild(startDate, endDate, payload.debug ?? false);
      }
    }

    return new Response(
      JSON.stringify({
        status: "ok",
        startDate,
        endDate,
        phase,
        postBatches: postResult?.batches ?? [],
        commentBatches: commentResult,
        activeTickers: postResult?.activeTickers ?? payload.active_tickers ?? [],
        processedSubreddits: currentBatch,
        remainingSubreddits: remainingSubreddits.length,
        batchId,
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
