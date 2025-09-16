// fetch_reddit_range.ts
//
// Pull recent Reddit posts via /r/{sub}/new, filter by UTC day window,
// and write NDJSON lines to out/<sub>/<YYYY-MM-DD>.ndjson.
//
// Deno only; no external deps.

type RedListingItem = {
  id: string;
  subreddit: string;
  title: string;
  selftext?: string;
  created_utc: number; // epoch seconds
  permalink?: string;
  author?: string;
  url?: string;
  is_self?: boolean;
  over_18?: boolean;
  num_comments?: number;
  score?: number;
  link_flair_text?: string | null;
};

const env = (k: string, d?: string) => Deno.env.get(k) ?? d ?? "";
const must = (k: string) => {
  const v = env(k);
  if (!v) throw new Error(`Missing required env: ${k}`);
  return v;
};

const SUBREDDITS = must("SUBREDDITS").split(",").map(s => s.trim()).filter(Boolean);
const START_DATE = must("START_DATE"); // e.g. 2025-08-22
const END_DATE   = must("END_DATE");   // e.g. 2025-08-25 (non-inclusive)
const SLEEP_MS   = Number(env("SLEEP_MS", "300"));
const UA         = env("UA", "reddit-loader/1.0 by dhose");
const REDDIT_CLIENT_ID     = must("REDDIT_CLIENT_ID");
const REDDIT_CLIENT_SECRET = must("REDDIT_CLIENT_SECRET");

// --- helpers
const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

function* days(startISO: string, endISO: string): Generator<string> {
  const start = new Date(`${startISO}T00:00:00Z`);
  const end   = new Date(`${endISO}T00:00:00Z`);
  for (let d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
    yield d.toISOString().slice(0, 10);
  }
}

function epochStart(isoDay: string): number {
  return Math.floor(Date.parse(`${isoDay}T00:00:00Z`) / 1000);
}

// Minimal logger
function log(...args: unknown[]) {
  console.log(new Date().toISOString(), ...args);
}

// OAuth: client_credentials
async function getToken(): Promise<string> {
  const body = new URLSearchParams();
  body.set("grant_type", "client_credentials");

  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      "Authorization": "Basic " + btoa(`${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`),
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
      "User-Agent": UA,
    },
    body,
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Token fetch failed: ${res.status} ${res.statusText} ${t}`);
  }
  const json = await res.json() as { access_token?: string };
  const token = json.access_token;
  if (!token) throw new Error("No access_token in response");
  return token;
}

async function fetchDayFromNew(sub: string, dayISO: string, token: string): Promise<RedListingItem[]> {
  const start = epochStart(dayISO);
  const end   = start + 86400;

  const kept: RedListingItem[] = [];
  let after: string | null = null;

  // Safety cap (100 pages * 100 posts = 10k per day per sub)
  for (let page = 0; page < 100; page++) {
    const url = new URL(`https://oauth.reddit.com/r/${sub}/new`);
    url.searchParams.set("limit", "100");
    if (after) url.searchParams.set("after", after);

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Authorization": `bearer ${token}`,
        "User-Agent": UA,
        "Accept": "application/json",
      },
    });

    if (res.status === 429) {
      // Basic backoff on rate-limits
      log(`429 for ${sub} ${dayISO}, backing off…`);
      await sleep(1500);
      page--; // retry this page
      continue;
    }

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      log(`WARN ${sub} ${dayISO}: HTTP ${res.status} ${res.statusText} ${t}`);
      break;
    }

    const json = await res.json().catch(() => ({} as any));
    const children = json?.data?.children ?? [];
    if (!Array.isArray(children) || children.length === 0) break;

    // Map & keep only items in our window
    const items: RedListingItem[] = children.map((c: any) => c?.data ?? {})
      .filter((d: any) => typeof d?.created_utc === "number");

    for (const it of items) {
      const t = it.created_utc;
      if (t >= start && t < end) kept.push({
        id: it.id,
        subreddit: it.subreddit,
        title: it.title ?? "",
        selftext: it.selftext ?? "",
        created_utc: it.created_utc,
        permalink: it.permalink,
        author: it.author,
        url: it.url,
        is_self: it.is_self,
        over_18: it.over_18,
        num_comments: it.num_comments,
        score: it.score,
        link_flair_text: it.link_flair_text ?? null,
      });
    }

    // If the oldest item on this page is older than our start, we can stop paging.
    const oldest = items[items.length - 1]?.created_utc ?? Number.MAX_SAFE_INTEGER;
    if (oldest < start) break;

    after = json?.data?.after ?? null;
    if (!after) break;

    await sleep(SLEEP_MS);
  }

  // Sort ascending by time (not necessary, but nice)
  kept.sort((a, b) => a.created_utc - b.created_utc);
  return kept;
}

async function ensureDir(path: string) {
  await Deno.mkdir(path, { recursive: true }).catch(() => {});
}

async function writeNdjson(path: string, rows: RedListingItem[]) {
  const lines = rows.map(r => {
    // Keep both epoch and ISO for downstream loaders
    const created_utc_iso = new Date(r.created_utc * 1000).toISOString();
    const post = {
      // "normalized" fields your loader likely expects:
      post_id: r.id,
      subreddit: r.subreddit,
      title: r.title,
      selftext: r.selftext,
      created_utc: r.created_utc,        // epoch seconds
      created_utc_iso,                   // helpful
      permalink: r.permalink ?? null,
      // some extras for debugging/optionally loading:
      author: r.author,
      url: r.url,
      is_self: r.is_self,
      over_18: r.over_18,
      num_comments: r.num_comments,
      score: r.score,
      flair: r.link_flair_text,
    };
    return JSON.stringify(post);
  });
  await Deno.writeTextFile(path, lines.join("\n") + (lines.length ? "\n" : ""));
}

async function main() {
  log(`Backfill window: ${START_DATE} .. ${END_DATE} (UTC)`);

  const token = await getToken();
  for (const sub of SUBREDDITS) {
    log(`== Subreddit: r/${sub} ==`);
    for (const d of days(START_DATE, END_DATE)) {
      const outDir = `out/${sub}`;
      const outFile = `${outDir}/${d}.ndjson`;
      await ensureDir(outDir);

      // Fetch
      const rows = await fetchDayFromNew(sub, d, token).catch(err => {
        log(`ERROR fetch ${sub} ${d}:`, err.message ?? String(err));
        return [] as RedListingItem[];
      });

      // Write file (even if empty, so downstream scripts can see we attempted)
      await writeNdjson(outFile, rows);
      log(`${d}: kept ${rows.length} → ${outFile}`);
    }
  }

  log("Done.");
}

if (import.meta.main) {
  main().catch(err => {
    console.error("FATAL:", err);
    Deno.exit(1);
  });
}
