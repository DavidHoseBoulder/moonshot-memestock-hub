import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

import type { PostsBySubreddit } from "./fetch_posts.ts";

export interface FetchCommentsParams {
  startDate: string;
  endDate: string;
  subreddits?: string[];
  supabaseClient: SupabaseClient;
  persistRaw: boolean;
  postsBySubreddit: PostsBySubreddit;
  activeTickers: string[];
}

export interface CommentBatchSummary {
  subreddit: string;
  day: string;
  postCount: number;
  commentCount: number;
  upserted: number;
  activeTickerMentions: number;
}

interface RedditCommentDoc {
  comment_id: string;
  post_id: string | null;
  subreddit: string | null;
  author: string | null;
  body: string;
  created_utc: number | null;
  created_utc_iso: string | null;
  score: number | null;
  parent_id: string | null;
  depth: number | null;
  is_submitter: boolean | null;
  permalink: string | null;
}

interface TokenCache {
  token: string;
  expiresAt: number;
}

const DEFAULT_USER_AGENT = Deno.env.get("REDDIT_USER_AGENT") ??
  "moonshot-reddit-loader/1.0";
const RAW_BUCKET = Deno.env.get("REDDIT_RAW_BUCKET") ?? null;
const STORAGE_PREFIX = Deno.env.get("REDDIT_RAW_PREFIX") ?? "reddit";

const COMMENTS_FILTER = new Set(
  (Deno.env.get("COMMENTS_SUBS") ||
    "stocks,investing,stockmarket,wallstreetbets,superstonk,daytrading,options,personalfinance,economy,finance")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);

let cachedToken: TokenCache | null = null;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function daysBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  for (
    let cursor = new Date(startDate);
    cursor < endDate;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    out.push(cursor.toISOString().slice(0, 10));
  }
  return out;
}

async function resolveSubredditsFallback(
  provided: string[] | undefined,
  client: SupabaseClient,
): Promise<string[]> {
  if (provided && provided.length > 0) return provided;

  const { data, error } = await client
    .from("subreddit_universe")
    .select("name")
    .eq("active", true)
    .order("priority", { ascending: true })
    .limit(200);

  if (error) {
    throw new Error(`Failed to load subreddit universe: ${error.message}`);
  }

  return (data ?? [])
    .map((row: { name?: string | null }) => row.name?.trim())
    .filter((name): name is string => !!name);
}

async function fallbackPostsFromDatabase(
  client: SupabaseClient,
  subreddits: string[],
  startDate: string,
  endDate: string,
): Promise<PostsBySubreddit> {
  if (subreddits.length === 0) return {};

  const { data, error } = await client
    .from("reddit_finance_keep_norm")
    .select("post_id, subreddit, created_utc")
    .in("subreddit", subreddits)
    .gte("created_utc", `${startDate}T00:00:00Z`)
    .lt("created_utc", `${endDate}T00:00:00Z`)
    .limit(5000);

  if (error) {
    console.warn(
      "[reddit-loader] fallback query for posts failed",
      error.message,
    );
    return {};
  }

  const map: PostsBySubreddit = {};
  for (const row of data ?? []) {
    const subreddit = String(row.subreddit ?? "");
    const postId = String(row.post_id ?? "").toLowerCase();
    if (!subreddit || !postId) continue;
    const createdUtc = row.created_utc as string | null;
    const day = createdUtc ? createdUtc.slice(0, 10) : startDate;
    if (!map[subreddit]) map[subreddit] = {};
    const set = new Set(map[subreddit][day] ?? []);
    set.add(postId);
    map[subreddit][day] = Array.from(set);
  }
  return map;
}

async function getAccessToken(): Promise<string> {
  const clientId = Deno.env.get("REDDIT_CLIENT_ID");
  const clientSecret = Deno.env.get("REDDIT_CLIENT_SECRET");
  const refreshToken = Deno.env.get("REDDIT_REFRESH_TOKEN");

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Missing Reddit OAuth credentials. Set REDDIT_CLIENT_ID/SECRET/REFRESH_TOKEN",
    );
  }

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - now > 60_000) {
    return cachedToken.token;
  }

  const body = new URLSearchParams();
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", refreshToken);

  const response = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": DEFAULT_USER_AGENT,
    },
    body,
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(
      `Reddit refresh token failed: ${response.status} ${response.statusText} ${details}`,
    );
  }

  const json = await response.json() as {
    access_token?: string;
    expires_in?: number;
  };
  const token = json.access_token;
  const expiresIn = json.expires_in ?? 3600;
  if (!token) {
    throw new Error("Reddit refresh response missing access_token");
  }

  cachedToken = { token, expiresAt: now + expiresIn * 1000 };
  return token;
}

async function redditFetch(url: string): Promise<Response> {
  const doFetch = async () => {
    const token = await getAccessToken();
    return fetch(url, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "User-Agent": DEFAULT_USER_AGENT,
      },
    });
  };

  let res = await doFetch();
  if (res.status === 401) {
    cachedToken = null;
    res = await doFetch();
  }
  return res;
}

function flattenComments(
  postId: string,
  node: any,
  depth = 0,
  out: RedditCommentDoc[] = [],
): RedditCommentDoc[] {
  if (!node || node.kind !== "t1" || typeof node.data !== "object") {
    return out;
  }

  const data = node.data;
  const createdUtc = typeof data.created_utc === "number"
    ? data.created_utc
    : null;
  const createdIso = createdUtc
    ? new Date(createdUtc * 1000).toISOString()
    : null;

  out.push({
    comment_id: String(data.id ?? ""),
    post_id: postId,
    subreddit: typeof data.subreddit === "string" ? data.subreddit : null,
    author: typeof data.author === "string" ? data.author : null,
    body: typeof data.body === "string" ? data.body : "",
    created_utc: createdUtc,
    created_utc_iso: createdIso,
    score: typeof data.score === "number" ? data.score : null,
    parent_id: typeof data.parent_id === "string" ? data.parent_id : null,
    depth,
    is_submitter: typeof data.is_submitter === "boolean"
      ? data.is_submitter
      : null,
    permalink: typeof data.permalink === "string"
      ? `https://www.reddit.com${data.permalink}`
      : null,
  });

  const replies = data.replies;
  if (
    replies && typeof replies === "object" &&
    Array.isArray(replies.data?.children)
  ) {
    for (const child of replies.data.children) {
      flattenComments(postId, child, depth + 1, out);
    }
  }

  return out;
}

async function fetchCommentsForPost(
  postId: string,
): Promise<RedditCommentDoc[]> {
  const url =
    `https://oauth.reddit.com/comments/${postId}.json?limit=500&depth=2&sort=best`;
  let res: Response;
  try {
    res = await redditFetch(url);
  } catch (err) {
    console.warn(`[reddit-loader] comments fetch failed ${postId}`, err);
    return [];
  }

  if (res.status === 429) {
    await sleep(2000);
    res = await redditFetch(url);
  }

  if (res.status === 404) {
    console.warn(`[reddit-loader] comments 404 for ${postId}`);
    return [];
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.warn(`[reddit-loader] comments HTTP ${res.status} ${body}`);
    return [];
  }

  const json = await res.json().catch(() => null);
  if (!Array.isArray(json) || json.length < 2) {
    return [];
  }

  const out: RedditCommentDoc[] = [];
  const listing = json[1]?.data?.children ?? [];
  if (Array.isArray(listing)) {
    for (const child of listing) {
      flattenComments(postId, child, 0, out);
    }
  }

  return out;
}

async function persistRaw(
  client: SupabaseClient,
  subreddit: string,
  day: string,
  records: RedditCommentDoc[],
): Promise<void> {
  if (!RAW_BUCKET || records.length === 0) return;
  try {
    const ndjson = records.map((row) => JSON.stringify(row)).join("\n");
    const path = `${STORAGE_PREFIX}/comments/${subreddit}/${day}.ndjson`;
    const { error } = await client.storage
      .from(RAW_BUCKET)
      .upload(path, new Blob([ndjson], { type: "application/x-ndjson" }), {
        cacheControl: "3600",
        upsert: true,
      });
    if (error) {
      console.warn(
        `[reddit-loader] storage upload failed for ${path}: ${error.message}`,
      );
    }
  } catch (err) {
    console.warn(
      `[reddit-loader] storage upload threw for comments ${subreddit} ${day}`,
      err,
    );
  }
}

async function ingestComments(
  client: SupabaseClient,
  rows: RedditCommentDoc[],
): Promise<number> {
  if (rows.length === 0) return 0;

  const chunkSize = 500;
  let upserted = 0;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { data, error } = await client.rpc("reddit_ingest_comments", {
      rows: chunk,
    });

    if (error) {
      throw new Error(`reddit_ingest_comments failed: ${error.message}`);
    }

    if (data && typeof data === "object" && "upserted" in data) {
      const value = Number((data as Record<string, unknown>).upserted);
      if (!Number.isNaN(value)) {
        upserted += value;
      }
    }
  }

  return upserted;
}

function commentsAllowed(subreddit: string): boolean {
  if (COMMENTS_FILTER.size === 0) return true;
  return COMMENTS_FILTER.has(subreddit.toLowerCase());
}

export async function fetchCommentsForWindow(
  params: FetchCommentsParams,
): Promise<CommentBatchSummary[]> {
  const {
    startDate,
    endDate,
    supabaseClient,
    persistRaw: persistRawEnabled,
    postsBySubreddit,
    subreddits: provided,
    activeTickers,
  } = params;

  const dates = daysBetween(startDate, endDate);
  const summary: CommentBatchSummary[] = [];

  const activeTickerSet = new Set(
    activeTickers.map((sym) => sym.toUpperCase()),
  );
  const cashtagRegex = /\$([A-Za-z]{1,5})(?![A-Za-z])/g;

  let effectiveMap: PostsBySubreddit = postsBySubreddit;

  if (Object.keys(postsBySubreddit).length === 0) {
    const fallbackSubs = await resolveSubredditsFallback(
      provided,
      supabaseClient,
    );
    effectiveMap = await fallbackPostsFromDatabase(
      supabaseClient,
      fallbackSubs,
      startDate,
      endDate,
    );
  }

  const subs = Object.entries(effectiveMap);
  if (subs.length === 0) {
    return summary;
  }

  for (const [subreddit, dayMap] of subs) {
    if (!commentsAllowed(subreddit)) {
      console.log(`[reddit-loader] comments disabled for ${subreddit}`);
      continue;
    }

    for (const day of dates) {
      const postIds = dayMap?.[day] ?? [];
      if (!postIds.length) continue;

      const collected: RedditCommentDoc[] = [];
      for (const postId of postIds) {
        if (!postId) continue;
        const docs = await fetchCommentsForPost(postId);
        collected.push(...docs);
        await sleep(400);
      }

      if (collected.length === 0) continue;

      try {
        const upserted = await ingestComments(supabaseClient, collected);
        if (persistRawEnabled) {
          await persistRaw(supabaseClient, subreddit, day, collected);
        }
        let activeTickerMentions = 0;
        if (activeTickerSet.size > 0) {
          for (const doc of collected) {
            const body = doc.body ?? "";
            cashtagRegex.lastIndex = 0;
            let match: RegExpExecArray | null;
            while ((match = cashtagRegex.exec(body)) !== null) {
              if (activeTickerSet.has(match[1].toUpperCase())) {
                activeTickerMentions++;
              }
            }
          }
        }

        summary.push({
          subreddit,
          day,
          postCount: postIds.length,
          commentCount: collected.length,
          upserted,
          activeTickerMentions,
        });
      } catch (err) {
        console.warn(
          `[reddit-loader] comment ingestion failed for ${subreddit} ${day}`,
          err,
        );
      }
    }
  }

  return summary;
}
