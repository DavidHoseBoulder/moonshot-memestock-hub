import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

export interface FetchPostsParams {
  startDate: string;
  endDate: string;
  subreddits?: string[];
  supabaseClient: SupabaseClient;
  persistRaw: boolean;
}

export interface PostBatchSummary {
  subreddit: string;
  day: string;
  count: number;
  upserted: number;
}

export type PostsBySubreddit = Record<string, Record<string, string[]>>;

export interface FetchPostsResult {
  batches: PostBatchSummary[];
  postsBySubreddit: PostsBySubreddit;
  activeTickers: string[];
}

interface RedditPostDoc {
  id: string;
  post_id: string;
  subreddit: string;
  author: string | null;
  title: string;
  selftext: string;
  created_utc: number | null;
  created_utc_iso: string | null;
  permalink: string | null;
  score: number | null;
  num_comments: number | null;
}

interface TokenCache {
  token: string;
  expiresAt: number;
}

const DEFAULT_USER_AGENT = Deno.env.get("REDDIT_USER_AGENT") ??
  "moonshot-reddit-loader/1.0";
const RAW_BUCKET = Deno.env.get("REDDIT_RAW_BUCKET") ?? null;
const STORAGE_PREFIX = Deno.env.get("REDDIT_RAW_PREFIX") ?? "reddit";

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

async function resolveSubreddits(
  provided: string[] | undefined,
  client: SupabaseClient,
): Promise<string[]> {
  if (provided && provided.length > 0) {
    return provided;
  }

  const { data, error } = await client
    .from("subreddit_universe")
    .select("name")
    .eq("active", true)
    .order("priority", { ascending: true })
    .limit(200);

  if (error) {
    throw new Error(`Failed to load subreddit universe: ${error.message}`);
  }

  const names = (data ?? [])
    .map((row: { name?: string | null }) => row.name?.trim())
    .filter((name): name is string => !!name);

  if (names.length === 0) {
    throw new Error("No subreddits available (subreddit_universe empty)");
  }

  return names;
}

async function resolveActiveTickers(client: SupabaseClient): Promise<string[]> {
  const { data, error } = await client
    .from("ticker_universe")
    .select("symbol, priority")
    .eq("active", true)
    .order("priority", { ascending: true })
    .limit(1000);

  if (error) {
    throw new Error(`Failed to load active tickers: ${error.message}`);
  }

  const symbols = (data ?? [])
    .map((row: { symbol?: string | null }) => row.symbol?.trim())
    .filter((symbol): symbol is string => !!symbol)
    .map((symbol) => symbol.toUpperCase());

  if (symbols.length === 0) {
    console.warn("[reddit-loader] No active tickers found in ticker_universe");
  }

  return Array.from(new Set(symbols));
}

async function getAccessToken(): Promise<string> {
  const clientId = Deno.env.get("REDDIT_CLIENT_ID");
  const clientSecret = Deno.env.get("REDDIT_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing Reddit API credentials. Set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET",
    );
  }

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - now > 60_000) {
    return cachedToken.token;
  }

  const body = new URLSearchParams();
  body.set("grant_type", "client_credentials");

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
      `Reddit token request failed: ${response.status} ${response.statusText} ${details}`,
    );
  }

  const json = await response.json() as {
    access_token?: string;
    expires_in?: number;
  };
  const token = json.access_token;
  const expiresIn = json.expires_in ?? 3600;
  if (!token) {
    throw new Error("Reddit token response missing access_token");
  }

  cachedToken = { token, expiresAt: now + expiresIn * 1000 };
  return token;
}

async function fetchPostsForDay(
  subreddit: string,
  day: string,
  token: string,
): Promise<RedditPostDoc[]> {
  const startEpoch = Math.floor(Date.parse(`${day}T00:00:00Z`) / 1000);
  const endEpoch = startEpoch + 86400;

  const collected: RedditPostDoc[] = [];
  let after: string | null = null;

  for (let page = 0; page < 100; page++) {
    const url = new URL(`https://oauth.reddit.com/r/${subreddit}/new`);
    url.searchParams.set("limit", "100");
    if (after) url.searchParams.set("after", after);

    const res = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "User-Agent": DEFAULT_USER_AGENT,
        "Accept": "application/json",
      },
    }).catch((err) => {
      console.warn(`[reddit-loader] ${subreddit} ${day} fetch error`, err);
      return null;
    });

    if (!res) break;

    if (res.status === 429) {
      console.warn(
        `[reddit-loader] ${subreddit} ${day} rate limited; backing off`,
      );
      await sleep(1500);
      continue;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(
        `[reddit-loader] ${subreddit} ${day} HTTP ${res.status} ${body}`,
      );
      break;
    }

    const json = await res.json().catch(() => null) as {
      data?: { children?: any[]; after?: string | null };
    } | null;
    const children = json?.data?.children ?? [];
    if (!Array.isArray(children) || children.length === 0) {
      break;
    }

    for (const child of children) {
      const data = child?.data;
      if (!data || typeof data.created_utc !== "number") continue;
      if (data.created_utc < startEpoch || data.created_utc >= endEpoch) {
        continue;
      }

      const createdUtcIso = new Date(data.created_utc * 1000).toISOString();
      const permalink = typeof data.permalink === "string"
        ? `https://www.reddit.com${data.permalink}`
        : null;
      const score = typeof data.score === "number" ? data.score : null;
      const numComments = typeof data.num_comments === "number"
        ? data.num_comments
        : null;
      const author = typeof data.author === "string" ? data.author : null;

      collected.push({
        id: String(data.id ?? data.post_id ?? ""),
        post_id: String(data.id ?? data.post_id ?? ""),
        subreddit: String(data.subreddit ?? subreddit),
        author,
        title: typeof data.title === "string" ? data.title : "",
        selftext: typeof data.selftext === "string" ? data.selftext : "",
        created_utc: data.created_utc,
        created_utc_iso: createdUtcIso,
        permalink,
        score,
        num_comments: numComments,
      });
    }

    const oldest = collected.length > 0
      ? collected[collected.length - 1].created_utc ?? Number.MAX_SAFE_INTEGER
      : Number.MAX_SAFE_INTEGER;
    if (oldest < startEpoch) {
      break;
    }

    after = json?.data?.after ?? null;
    if (!after) break;
    await sleep(300);
  }

  return collected;
}

async function ingestPosts(
  client: SupabaseClient,
  rows: RedditPostDoc[],
): Promise<number> {
  if (rows.length === 0) return 0;

  const chunkSize = 500;
  let upserted = 0;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { data, error } = await client.rpc("reddit_ingest_posts", {
      rows: chunk,
    });

    if (error) {
      throw new Error(`reddit_ingest_posts failed: ${error.message}`);
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

async function persistRaw(
  client: SupabaseClient,
  type: "posts" | "comments",
  subreddit: string,
  day: string,
  records: unknown[],
): Promise<void> {
  if (!RAW_BUCKET || records.length === 0) return;
  try {
    const ndjson = records.map((row) => JSON.stringify(row)).join("\n");
    const path = `${STORAGE_PREFIX}/${type}/${subreddit}/${day}.ndjson`;
    const { error } = await client.storage.from(RAW_BUCKET).upload(
      path,
      new Blob([ndjson], { type: "application/x-ndjson" }),
      {
        cacheControl: "3600",
        upsert: true,
      },
    );
    if (error) {
      console.warn(
        `[reddit-loader] storage upload failed for ${path}: ${error.message}`,
      );
    }
  } catch (err) {
    console.warn(
      `[reddit-loader] storage upload threw for ${subreddit} ${day}`,
      err,
    );
  }
}

export async function fetchPostsForWindow(
  params: FetchPostsParams,
): Promise<FetchPostsResult> {
  const {
    startDate,
    endDate,
    supabaseClient,
    persistRaw: persistRawEnabled,
    subreddits: provided,
  } = params;

  const [subreddits, activeTickers] = await Promise.all([
    resolveSubreddits(provided, supabaseClient),
    resolveActiveTickers(supabaseClient),
  ]);
  const dates = daysBetween(startDate, endDate);
  const token = await getAccessToken();

  const postsBySubreddit: PostsBySubreddit = {};
  const batches: PostBatchSummary[] = [];

  for (const subreddit of subreddits) {
    const normalized = subreddit.trim();
    if (!normalized) continue;
    for (const day of dates) {
      try {
        const docs = await fetchPostsForDay(normalized, day, token);
        if (docs.length === 0) continue;

        const upserted = await ingestPosts(supabaseClient, docs);
        if (persistRawEnabled) {
          await persistRaw(supabaseClient, "posts", normalized, day, docs);
        }

        const postIds = docs
          .map((doc) => doc.post_id.toLowerCase())
          .filter((id) => id.length > 0);

        if (!postsBySubreddit[normalized]) {
          postsBySubreddit[normalized] = {};
        }
        const daySet = new Set(postsBySubreddit[normalized][day] ?? []);
        for (const id of postIds) {
          daySet.add(id);
        }
        postsBySubreddit[normalized][day] = Array.from(daySet);

        batches.push({
          subreddit: normalized,
          day,
          count: docs.length,
          upserted,
        });
      } catch (err) {
        console.warn(
          `[reddit-loader] post ingestion failed for ${normalized} ${day}`,
          err,
        );
      }
    }
  }

  return { batches, postsBySubreddit, activeTickers };
}
