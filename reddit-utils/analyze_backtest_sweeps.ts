import { parse as parseEnv } from "jsr:@std/dotenv/parse";
import { parseArgs } from "jsr:@std/cli/parse-args";
import pg from "npm:pg@8.11.3";

// Load .env if present so local runs can reuse pipeline credentials.
try {
  const raw = await Deno.readTextFile(".env");
  const conf = parseEnv(raw);
  for (const [key, value] of Object.entries(conf)) {
    if (Deno.env.get(key) === undefined) Deno.env.set(key, value);
  }
} catch (_) {
  // ignore missing .env
}

const args = parseArgs(Deno.args, {
  string: [
    "model",
    "symbol",
    "symbols",
    "horizon",
    "side",
    "start",
    "end",
    "order",
    "min-trades",
    "min-sharpe",
    "min-win-rate",
    "min-windows",
    "limit",
    "format",
  ],
  boolean: ["help", "json"],
  alias: {
    m: "model",
    s: "symbols",
    h: "horizon",
    S: "side",
    o: "order",
    l: "limit",
    j: "json",
  },
});

function usage() {
  console.log(
    `\nUsage: deno run --allow-env --allow-net analyze_backtest_sweeps.ts [options]\n\nOptions:\n  --model <tag>           Filter by backtest model_version (e.g. gpt-sent-v1)\n  --symbols <CSV>         Limit to one or more symbols (comma separated)\n  --horizon <1d|3d|5d>    Restrict to a horizon\n  --side <LONG|SHORT>     Restrict to side\n  --start <YYYY-MM-DD>    Earliest start_date to include\n  --end <YYYY-MM-DD>      Latest end_date to include\n  --min-trades <N>        Drop pockets with trades below N\n  --min-sharpe <x>        Drop pockets with sharpe below x\n  --min-win-rate <x>      Drop pockets with win_rate below x (0-1)\n  --min-windows <N>       Require at least N distinct windows per pocket (default 3)\n  --order <metric>        Sort cohorts by metric (avg_sharpe|robust_sharpe|avg_win_rate|avg_return)\n  --limit <N>             Number of cohorts to display (default 20)\n  --json                  Emit raw JSON instead of tables\n  --format <pretty|wide>  pretty = default condensed table, wide = include extra columns\n  --help                  Show this message\n\nEnvironment: PGURI must point at Supabase/Postgres with backtest_sweep_grid.\n`,
  );
}

if (args.help) {
  usage();
  Deno.exit(0);
}

const PGURI = Deno.env.get("PGURI") ?? "";
if (!PGURI) {
  console.error("❌ PGURI is required (set env or .env PGURI).");
  Deno.exit(1);
}

const order = String(args.order ?? "avg_sharpe");
const orderMap = new Map<string, string>([
  ["avg_sharpe", "avg_sharpe DESC"],
  ["robust_sharpe", "robust_sharpe DESC"],
  ["avg_win_rate", "avg_win_rate DESC"],
  ["avg_return", "avg_return DESC"],
]);
const orderSql = orderMap.get(order) ?? orderMap.get("avg_sharpe")!;
const limit = Number.isFinite(Number(args.limit)) ? Math.max(1, Number(args.limit)) : 20;
const minWindowsDefault = 3;
const minWindows = Number.isFinite(Number(args["min-windows"]))
  ? Math.max(1, Number(args["min-windows"]))
  : minWindowsDefault;
const minTrades = Number.isFinite(Number(args["min-trades"]))
  ? Number(args["min-trades"])
  : undefined;
const minSharpe = Number.isFinite(Number(args["min-sharpe"]))
  ? Number(args["min-sharpe"])
  : undefined;
const minWinRate = Number.isFinite(Number(args["min-win-rate"]))
  ? Number(args["min-win-rate"])
  : undefined;
const format = args.format === "wide" ? "wide" : "pretty";

const symbolsCsv = String(args.symbols ?? args.symbol ?? "");
const symbolList = symbolsCsv
  .split(",")
  .map((s: string) => s.trim().toUpperCase())
  .filter(Boolean);
const hasSymbolFilter = symbolList.length > 0;

const uri = new URL(PGURI);
const { Pool } = pg as any;
const pool = new Pool({
  host: uri.hostname,
  port: Number(uri.port || 5432),
  user: decodeURIComponent(uri.username),
  password: decodeURIComponent(uri.password),
  database: uri.pathname.slice(1),
  ssl: { rejectUnauthorized: false },
});

function formatNumber(value: unknown, digits = 3) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return null;
  return Number(value).toFixed(digits);
}

function formatPct(value: unknown, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return null;
  return (Number(value) * 100).toFixed(digits) + "%";
}

const whereClauses: string[] = [];
const whereParams: unknown[] = [];
let paramIndex = 1;

if (args.model) {
  whereClauses.push(`model_version = $${paramIndex++}`);
  whereParams.push(String(args.model));
}
if (hasSymbolFilter) {
  whereClauses.push(`symbol = ANY($${paramIndex++})`);
  whereParams.push(symbolList);
}
if (args.horizon) {
  whereClauses.push(`horizon = $${paramIndex++}`);
  whereParams.push(String(args.horizon));
}
if (args.side) {
  whereClauses.push(`side = $${paramIndex++}`);
  whereParams.push(String(args.side));
}
if (args.start) {
  whereClauses.push(`start_date >= $${paramIndex++}`);
  whereParams.push(String(args.start));
}
if (args.end) {
  whereClauses.push(`end_date <= $${paramIndex++}`);
  whereParams.push(String(args.end));
}
if (minTrades !== undefined) {
  whereClauses.push(`trades >= $${paramIndex++}`);
  whereParams.push(minTrades);
}
if (minSharpe !== undefined) {
  whereClauses.push(`sharpe >= $${paramIndex++}`);
  whereParams.push(minSharpe);
}
if (minWinRate !== undefined) {
  whereClauses.push(`win_rate >= $${paramIndex++}`);
  whereParams.push(minWinRate);
}

const havingClauses: string[] = [];
const havingParams: unknown[] = [];
let havingIndex = paramIndex;

if (minWindows !== undefined) {
  havingClauses.push(`COUNT(DISTINCT (start_date, end_date)) >= $${havingIndex++}`);
  havingParams.push(minWindows);
}

const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";
const havingSql = havingClauses.length ? `HAVING ${havingClauses.join(" AND ")}` : "";

const limitPlaceholder = havingIndex;
const cohortParams = [...whereParams, ...havingParams, limit];
const symbolParams = [...whereParams];
const windowParams = [...whereParams];
const cohortSql = `
  SELECT
    symbol,
    horizon,
    side,
    min_mentions,
    pos_thresh,
    COUNT(*) AS runs,
    COUNT(DISTINCT (start_date, end_date)) AS windows,
    AVG(sharpe) AS avg_sharpe,
    STDDEV_POP(sharpe) AS stddev_sharpe,
    AVG(sharpe) - COALESCE(STDDEV_POP(sharpe), 0) AS robust_sharpe,
    AVG(win_rate) AS avg_win_rate,
    STDDEV_POP(win_rate) AS stddev_win_rate,
    AVG(avg_ret) AS avg_return,
    STDDEV_POP(avg_ret) AS stddev_return,
    AVG(trades) AS avg_trades,
    SUM(trades) AS total_trades,
    AVG(uplift) AS avg_uplift,
    STDDEV_POP(uplift) AS stddev_uplift
  FROM backtest_sweep_grid
  ${whereSql}
  GROUP BY 1,2,3,4,5
  ${havingSql}
  ORDER BY ${orderSql}
  LIMIT $${limitPlaceholder};
`;

const symbolSql = `
  SELECT
    symbol,
    horizon,
    side,
    COUNT(DISTINCT (start_date, end_date)) AS windows,
    AVG(sharpe) AS avg_sharpe,
    STDDEV_POP(sharpe) AS stddev_sharpe,
    AVG(win_rate) AS avg_win_rate,
    AVG(avg_ret) AS avg_return,
    SUM(trades) AS total_trades
  FROM backtest_sweep_grid
  ${whereSql}
  GROUP BY 1,2,3
  ORDER BY avg_sharpe DESC
  LIMIT 50;
`;

const windowSql = `
  SELECT
    start_date,
    end_date,
    COUNT(*) AS pockets,
    AVG(sharpe) AS avg_sharpe,
    STDDEV_POP(sharpe) AS stddev_sharpe,
    AVG(win_rate) AS avg_win_rate,
    AVG(avg_ret) AS avg_return
  FROM backtest_sweep_grid
  ${whereSql}
  GROUP BY 1,2
  ORDER BY start_date DESC, end_date DESC
  LIMIT 30;
`;

const client = await pool.connect();
try {
  const [cohorts, symbols, windows] = await Promise.all([
    client.query(cohortSql, cohortParams),
    client.query(symbolSql, symbolParams),
    client.query(windowSql, windowParams),
  ]);

  if (args.json) {
    console.log(
      JSON.stringify(
        { cohorts: cohorts.rows, symbols: symbols.rows, windows: windows.rows },
        null,
        2,
      ),
    );
  } else {
    const fmt = format === "wide";

    console.log("\n=== Cohort stability across windows ===");
    if (!cohorts.rowCount) {
      console.log("(no cohorts matched filters)");
    } else {
      const header = fmt
        ? [
          "symbol",
          "horizon",
          "side",
          "min_mentions",
          "pos_thresh",
          "windows",
          "avg_sharpe",
          "std_sharpe",
          "robust_sharpe",
          "avg_win_rate",
          "std_win",
          "avg_return",
          "std_return",
          "avg_trades",
          "total_trades",
          "avg_uplift",
        ]
        : [
          "symbol",
          "hor",
          "side",
          "mm",
          "pos",
          "win",
          "avg_sharpe",
          "robust",
          "avg_win",
          "avg_ret",
        ];
      const rows = cohorts.rows.map((r: any) =>
        fmt
          ? [
            r.symbol,
            r.horizon,
            r.side,
            r.min_mentions,
            Number(r.pos_thresh).toFixed(2),
            r.windows,
            formatNumber(r.avg_sharpe),
            formatNumber(r.stddev_sharpe),
            formatNumber(r.robust_sharpe),
            formatPct(r.avg_win_rate),
            formatNumber(r.stddev_win_rate),
            formatNumber(r.avg_return, 4),
            formatNumber(r.stddev_return, 4),
            formatNumber(r.avg_trades, 1),
            r.total_trades,
            formatNumber(r.avg_uplift, 4),
          ]
          : [
            r.symbol,
            r.horizon,
            r.side,
            r.min_mentions,
            Number(r.pos_thresh).toFixed(2),
            r.windows,
            formatNumber(r.avg_sharpe),
            formatNumber(r.robust_sharpe),
            formatPct(r.avg_win_rate),
            formatNumber(r.avg_return, 4),
          ]
      );
      printTable(header, rows);
    }

    console.log("\n=== Symbol/horizon summary ===");
    if (!symbols.rowCount) {
      console.log("(no symbol aggregates)");
    } else {
      const header = [
        "symbol",
        "hor",
        "side",
        "win",
        "avg_sharpe",
        "std_sharpe",
        "avg_win",
        "avg_ret",
        "trades",
      ];
      const rows = symbols.rows.map((r: any) => [
        r.symbol,
        r.horizon,
        r.side,
        r.windows,
        formatNumber(r.avg_sharpe),
        formatNumber(r.stddev_sharpe),
        formatPct(r.avg_win_rate),
        formatNumber(r.avg_return, 4),
        r.total_trades,
      ]);
      printTable(header, rows);
    }

    console.log("\n=== Recent sweep windows ===");
    if (!windows.rowCount) {
      console.log("(no windows)");
    } else {
      const header = ["start", "end", "pockets", "avg_sharpe", "std_sharpe", "avg_win", "avg_ret"];
      const rows = windows.rows.map((r: any) => [
        r.start_date,
        r.end_date,
        r.pockets,
        formatNumber(r.avg_sharpe),
        formatNumber(r.stddev_sharpe),
        formatPct(r.avg_win_rate),
        formatNumber(r.avg_return, 4),
      ]);
      printTable(header, rows);
    }
  }
} finally {
  client.release();
  await pool.end();
}

function printTable(headers: (string | null)[], rows: (unknown[])[]) {
  const widths = headers.map((h, idx) =>
    Math.max(h?.length ?? 0, ...rows.map((row) => String(row[idx] ?? "").length))
  );
  const line = widths.map((w) => "-".repeat(w)).join("-+-");
  const headerLine = headers.map((h, idx) => pad(String(h ?? ""), widths[idx])).join(" | ");
  console.log(headerLine);
  console.log(line);
  for (const row of rows) {
    console.log(row.map((cell, idx) => pad(String(cell ?? ""), widths[idx])).join(" | "));
  }
}

function pad(value: string, width: number) {
  const diff = width - value.length;
  if (diff <= 0) return value;
  return value + " ".repeat(diff);
}
