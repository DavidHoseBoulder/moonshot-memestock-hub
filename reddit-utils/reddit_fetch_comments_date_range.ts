// reddit_fetch_comments_date_range.ts
// Fetch Reddit comments for posts we already loaded into DB, over a date range.
// Env needed:
//   PGURI=postgres://...           (Supabase PG connection string)
//   SUBREDDITS=comma,list          (e.g. wallstreetbets,StockMarket,...)
//   START_DATE=YYYY-MM-DD
//   END_DATE=YYYY-MM-DD            (exclusive)
//   REDDIT_CLIENT_ID=...
//   REDDIT_CLIENT_SECRET=...
//   REDDIT_REFRESH_TOKEN=...
//
// Output:
//   out_comments/<sub>/<YYYY-MM-DD>.ndjson
//
// Notes:
// - Uses oauth.reddit.com (Bearer) for comments.
// - Only fetches top-level tree with limit=500, depth=1 (tweak as needed).

// ------------------------- Utilities -------------------------

function mustEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v || v.trim() === "") {
    throw new Error(`Missing required env: ${name}`);
  }
  return v;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function ymd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function addDays(d: Date, n: number): Date {
  const z = new Date(d.getTime());
  z.setUTCDate(z.getUTCDate() + n);
  return z;
}

async function ensureDir(path: string) {
  await Deno.mkdir(path, { recursive: true }).catch(() => {});
}

// ------------------------- OAuth (refresh-token) -------------------------

type TokenResponse = {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
  scope: string;
};

let cachedToken: { token: string; exp: number } | null = null;

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.exp - nowSec() > 60) {
    return cachedToken.token;
  }

  const clientId = mustEnv("REDDIT_CLIENT_ID");
  const clientSecret = mustEnv("REDDIT_CLIENT_SECRET");
  const refreshToken = mustEnv("REDDIT_REFRESH_TOKEN");

  const body = new URLSearchParams();
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", refreshToken);

  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      "Authorization": "Basic " + btoa(`${clientId}:${clientSecret}`),
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "comment-fetcher by u/Either-Ad-7141",
    },
    body,
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Token refresh failed ${res.status}: ${txt}`);
  }
  const json = (await res.json()) as TokenResponse;
  cachedToken = { token: json.access_token, exp: nowSec() + json.expires_in };
  return cachedToken.token;
}

async function redditFetch(url: string): Promise<Response> {
  const doFetch = async () => {
    const token = await getAccessToken();
    return fetch(url, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "User-Agent": "comment-fetcher by u/Either-Ad-7141",
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

// ------------------------- Postgres -------------------------

// Deno Postgres via dynamic import to avoid external tooling.
// Using a lightweight SQL approach (no migrations etc.)
import { Client } from "https://deno.land/x/postgres@v0.19.3/mod.ts";

const host = Deno.env.get("PGHOST")!;
const port = Number(Deno.env.get("PGPORT") ?? "5432");
const user = Deno.env.get("PGUSER")!;
const password = Deno.env.get("PGPASSWORD")!;
const database = Deno.env.get("PGDATABASE")!;

// TLS: prefer env-provided CA path (PGSSLROOTCERT or PGSSLCA), else rely on system trust store.
function readOptional(path: string | undefined | null): string | null {
  if (!path) return null;
  try { return Deno.readTextFileSync(path); } catch { return null; }
}

const caPath = Deno.env.get("PGSSLROOTCERT") ?? Deno.env.get("PGSSLCA") ?? "./supabase_pooler_ca_chain.pem";
const caText = readOptional(caPath);

const tlsConfig: { enabled: boolean; enforce: boolean; hostname: string; caCertificates?: string[] } = {
  enabled: true,
  enforce: true,
  hostname: host,
};
if (caText) tlsConfig.caCertificates = [caText];

const client = new Client({
  hostname: host,
  port,
  user,
  password,
  database,
  tls: tlsConfig,
});

// Normalize a row (id/permalink) into a base36 post id (lowercased)
function normalizePostId(id: string | null | undefined, permalink: string | null | undefined): string | null {
  const raw = (id ?? "").trim();
  if (raw) return raw.toLowerCase();

  const pl = (permalink ?? "").trim();
  if (!pl) return null;

  // Try standard permalink: ".../comments/<base36>/<slug>..."
  const m1 = pl.match(/\/comments\/([0-9A-Za-z]+)\b/);
  if (m1) return m1[1].toLowerCase();

  // Fallback: take last non-empty segment
  const segs = pl.split("/").filter(Boolean);
  if (segs.length > 0) return segs[segs.length - 1].toLowerCase();

  return null;
}

// Fetch post ids for a day by subreddit, computing post_id client-side
async function getPostIdsForDay(client: Client, subreddit: string, dayYmd: string): Promise<string[]> {
  const start = new Date(`${dayYmd}T00:00:00.000Z`);
  const end   = new Date(start.getTime() + 24 * 3600 * 1000);

  // Pull only the minimal columns we need, with a tight WHERE
  const { rows } = await client.queryObject<{
    id: string | null;
    permalink: string | null;
  }>`
    SELECT id, permalink
    FROM public.reddit_posts
    WHERE lower(subreddit) = ${subreddit.toLowerCase()}
      AND created_utc >= ${start.toISOString()}
      AND created_utc <  ${end.toISOString()}
      AND (id IS NOT NULL OR permalink IS NOT NULL)
  `;

  const postIds = rows
    .map(r => normalizePostId(r.id, r.permalink))
    .filter((x): x is string => !!x);

  // De-dupe
  const uniq = Array.from(new Set(postIds));

  // Optional visibility for debugging
//  console.log(
//    "getPostIdsForDay args:",
//    JSON.stringify(
//      {
//        subreddit,
//        dayYmd,
//        startIso: start.toISOString(),
//        endIso: end.toISOString(),
//        n_db_rows: rows.length,
//        n_ids: uniq.length,
//      },
//      null,
//      2
//    )
//  );

  return uniq;
}

// ------------------------- Reddit comments fetch -------------------------

type FlatComment = {
  post_id: string;
  id: string;
  parent_id: string | null;
  author: string | null;
  body: string | null;
  score: number | null;
  created_utc: number | null;
  created_utc_iso: string | null;
  permalink: string | null;
  subreddit: string | null;
};

function flattenListingJson(postId: string, json: unknown): FlatComment[] {
  // Reddit returns an array: [post, comments]
  // We want to walk the second element (comments listing)
  const out: FlatComment[] = [];
  try {
    const arr = json as any[];
    if (!Array.isArray(arr) || arr.length < 2) return out;
    const commentsListing = arr[1];
    const data = commentsListing?.data?.children ?? [];
    for (const child of data) {
      collectCommentsRecursive(postId, child, out);
    }
  } catch (_) {
    // ignore malformed
  }
  return out;
}

function collectCommentsRecursive(postId: string, node: any, out: FlatComment[]) {
  if (!node || node.kind !== "t1" || !node.data) return;
  const d = node.data;
  const createdUtc = typeof d.created_utc === "number" ? d.created_utc : null;
  out.push({
    post_id: postId,
    id: String(d.id ?? ""),
    parent_id: d.parent_id ?? null,
    author: d.author ?? null,
    body: typeof d.body === "string" ? d.body : null,
    score: typeof d.score === "number" ? d.score : null,
    created_utc: createdUtc,
    created_utc_iso: createdUtc ? new Date(createdUtc * 1000).toISOString() : null,
    permalink: d.permalink ?? null,
    subreddit: d.subreddit ?? null,
  });

  const replies = d.replies;
  if (replies && typeof replies === "object" && replies.data?.children) {
    for (const ch of replies.data.children) {
      collectCommentsRecursive(postId, ch, out);
    }
  }
}

// ------------------------- Main -------------------------

const RAW_PGURI = mustEnv("PGURI");
const PGURI = RAW_PGURI.replace(/^postgres:\/\//, "postgresql://");
const START_DATE = mustEnv("START_DATE"); // YYYY-MM-DD
const END_DATE = mustEnv("END_DATE");     // YYYY-MM-DD (exclusive)
// Build SUBREDDITS array from env
const SUBREDDITS: string[] = (Deno.env.get("SUBREDDITS") ?? "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

// Optional: log once so we know it's correct
console.log("SUBREDDITS:", SUBREDDITS.join(", "));
const OUTPUT_DIR = Deno.env.get("COMMENTS_OUT_DIR") || "out_comments";

// Optional gate: only fetch comments for these subs (comma list). If unset, all SUBREDDITS.
const COMMENTS_ENABLED = (Deno.env.get("COMMENTS_ENABLED_SUBS") || "")
  .split(",").map(s => s.trim()).filter(Boolean);
// ----- Which subreddits should we fetch comments for? -----
// Configure via env: COMMENTS_SUBS="economy,finance,StockMarket,stocks,investing,wallstreetbets,Superstonk,daytrading,options"
function envList(name: string, fallback: string[]): Set<string> {
  const raw = (Deno.env.get(name) || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  const list = raw.length ? raw : fallback;
  // normalize to lowercase for matching
  return new Set(list.map(s => s.toLowerCase()));
}

// Default “core finance + trading” set if env is not provided
const COMMENTS_FILTER = envList("COMMENTS_SUBS", [
  "stocks",
  "investing",
  "stockmarket",
  "wallstreetbets",
  "superstonk",
  "daytrading",
  "options",
  "personalfinance",
  "economy",
  "finance",
]);

// Helper for normalized membership test
function commentsEnabledFor(sub: string) {
  return COMMENTS_FILTER.has(sub.toLowerCase());
}

const start = new Date(`${START_DATE}T00:00:00.000Z`);
const end = new Date(`${END_DATE}T00:00:00.000Z`);

await client.connect();

try {
  for (const sub of SUBREDDITS) {
    for (let d = new Date(start); d < end; d = addDays(d, 1)) {
      const day = ymd(d);
      const posts = await getPostIdsForDay(client, sub, day);
      if (!commentsEnabledFor(sub)) {
		console.log(`${new Date().toISOString()} ${sub} ${day}: comments disabled (posts=${posts.length})`);
        continue;
      }

      console.log(`${new Date().toISOString()} ${sub} ${day}: posts=${posts.length}`);
      const outDir = `${OUTPUT_DIR}/${sub}`;
      await ensureDir(outDir);
      const outFile = `${outDir}/${day}.ndjson`;

      let kept = 0;
      const file = await Deno.open(outFile, { write: true, create: true, truncate: true });
      const encoder = new TextEncoder();

// posts: Array<{ id: string; fullname: string }>
for (const postId of posts) {
  if (!postId) continue; // belt & suspenders

  // gentle pacing to avoid rate limits
  await sleep(500);

  const url = `https://oauth.reddit.com/comments/${postId}.json?limit=500&depth=1&sort=best`;
  let res: Response;
  try {
    res = await redditFetch(url);
  } catch (e) {
    console.warn(`WARN ${postId}: fetch error`, e && (e as Error).message);
    continue;
  }

  if (res.status === 429) {
    await sleep(2000);
    res = await redditFetch(url);
  }

  if (res.status === 403) { console.warn(`WARN ${postId}: 403 Forbidden`); continue; }
  if (res.status === 404) { console.warn(`WARN ${postId}: 404 Not Found`); continue; }
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    console.warn(`WARN ${postId}: ${res.status} ${txt || "(no body)"}`);
    continue;
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    console.warn(`WARN ${postId}: bad JSON`);
    continue;
  }
  if (!json) continue;

  const flat = flattenListingJson(postId, json);
  for (const row of flat) {
    kept++;
    await file.write(encoder.encode(JSON.stringify(row) + "\n"));
  }
}
   file.close();
      console.log(`${new Date().toISOString()} ${sub} ${day}: comments kept ${kept} -> ${outFile}`);
    }
  }
  console.log(`${new Date().toISOString()} Done.`);
} finally {
  await client.end();
}
