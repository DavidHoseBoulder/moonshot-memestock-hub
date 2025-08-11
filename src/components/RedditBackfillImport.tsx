import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { getAllTickers, getAllCanonicalTickers } from "@/data/stockUniverse";
import { supabase } from "@/integrations/supabase/client";

const DEFAULT_SUBS = "stocks,investing,SecurityAnalysis,ValueInvesting,StockMarket,wallstreetbets,pennystocks";

const RedditBackfillImport = () => {
  const { toast } = useToast();
  const [urlsText, setUrlsText] = useState("");
  const [subs, setSubs] = useState(DEFAULT_SUBS);
  const [batchSize, setBatchSize] = useState(25);
  const [maxItems, setMaxItems] = useState<number>(25000);
  const [isRunning, setIsRunning] = useState(false);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [insertedCount, setInsertedCount] = useState<number | null>(null);
  const [runInfo, setRunInfo] = useState<{ status: string; scanned: number; queued: number; analyzed: number; inserted: number; finished_at: string | null } | null>(null);
  const startBackfill = async () => {
    const urls = urlsText
      .split(/\r?\n/)
      .map((u) => u.trim())
      .filter(Boolean);

    if (urls.length === 0) {
      toast({ title: "Missing URL(s)", description: "Provide one or more .jsonl or .jsonl.gz URLs (one per line)", variant: "destructive" });
      return;
    }
    if (urls.some((u) => u.endsWith(".zst"))) {
      toast({ title: ".zst not supported", description: "Please decompress to .jsonl or .jsonl.gz first", variant: "destructive" });
      return;
    }

    setIsRunning(true);
    try {
      const runId = (crypto as any)?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setCurrentRunId(runId);
      setInsertedCount(null);
      const symbols = (typeof getAllCanonicalTickers === 'function' ? getAllCanonicalTickers() : getAllTickers());
      const subreddits = subs.split(",").map((s) => s.trim()).filter(Boolean);
      let totalQueued = 0;
      let totalEstimatedBatches = 0;
      let totalInvoked = 0;

      for (const singleUrl of urls) {
        const { data, error } = await supabase.functions.invoke('reddit-backfill-import', {
          body: {
            mode: 'jsonl_url',
            jsonl_url: singleUrl,
            subreddits,
            symbols,
            batch_size: batchSize,
            run_id: runId,
          }
        });
        if (error) throw error;
        totalQueued += data?.queued ?? 0;
        totalEstimatedBatches += data?.estimated_batches ?? 0;
        totalInvoked++;
      }

      toast({
        title: "Reddit Backfill Started",
        description: `Queued ~${totalQueued} items across ~${totalEstimatedBatches} batches from ${totalInvoked} file(s). Run: ${runId}`,
      });
      console.log('reddit-backfill-import multi response', { totalQueued, totalEstimatedBatches, totalInvoked, urls });
    } catch (e: any) {
      console.error(e);
      toast({ title: "Backfill Error", description: e?.message ?? 'Failed to start backfill', variant: "destructive" });
    } finally {
      setIsRunning(false);
    }
  };

  useEffect(() => {
    if (!currentRunId) return;
    let active = true;
    const interval = setInterval(async () => {
      const { count, error } = await supabase
        .from('sentiment_history')
        .select('id', { count: 'exact', head: true })
        .filter('metadata->>import_run_id', 'eq', currentRunId);
      if (!active) return;
      if (!error) setInsertedCount(count ?? 0);
    }, 3000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [currentRunId]);

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Reddit Backfill (JSONL)</CardTitle>
        <CardDescription>
          Stream a .jsonl or .jsonl.gz file, filter, score, and load into sentiment history.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="jsonl-urls">JSONL/JSONL.GZ URL(s)</Label>
          <Textarea
            id="jsonl-urls"
            rows={3}
            placeholder="One URL per line (e.g., https://example.com/reddit_2025-06.part-00.jsonl.gz)"
            value={urlsText}
            onChange={(e) => setUrlsText(e.target.value)}
          />
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const syms = (typeof getAllCanonicalTickers === 'function' ? getAllCanonicalTickers() : getAllTickers()).join('|');
                const blob = new Blob([syms], { type: 'text/plain' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'symbols.txt';
                a.click();
                URL.revokeObjectURL(a.href);
                toast({ title: 'Downloaded symbols.txt', description: 'Pipe-separated tickers for jq regex filters' });
              }}
            >
              Download symbols.txt
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const symsArray = (typeof getAllCanonicalTickers === 'function' ? getAllCanonicalTickers() : getAllTickers());
                const syms = symsArray
                  .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
                  .join('|');

                const subsArray = subs
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean);
                const subsEscaped = subsArray.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
                const subsPattern = subsEscaped.join('|');

                const cmdSubm = `jq -c '(.[]? // .) | select(type=="object") | select(.subreddit|test("^(?:${subsPattern})$";"i")) | select((.title+" "+(.selftext//""))|test("(^|[^A-Z])(?:${syms})([^A-Z]|$)";"i"))' submissions-RC_2025-06.json | pigz -9 > submissions-2025-06.filtered.jsonl.gz`;
                const cmdComm = `jq -c '(.[]? // .) | select(type=="object") | select(.subreddit|test("^(?:${subsPattern})$";"i")) | select((.body//"")|test("(^|[^A-Z])(?:${syms})([^A-Z]|$)";"i"))' comments-RC_2025-06.json | pigz -9 > comments-2025-06.filtered.jsonl.gz`;
                const verify = `zcat submissions-2025-06.filtered.jsonl.gz | head -n 3\nzcat comments-2025-06.filtered.jsonl.gz | head -n 3`;
                const combined = `${cmdSubm}\n\n${cmdComm}\n\n# Verify\n${verify}`;
                navigator.clipboard.writeText(combined);
                toast({ title: 'Copied jq commands', description: 'Paste into your terminal to filter & gzip locally' });
              }}
            >
              Copy jq commands
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="subs">Subreddits (comma-separated)</Label>
          <Textarea id="subs" rows={2} value={subs} onChange={(e) => setSubs(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="batch">Batch size</Label>
            <Input id="batch" type="number" min={5} max={100} value={batchSize} onChange={(e) => setBatchSize(parseInt(e.target.value || '25'))} />
          </div>
          <div className="space-y-2">
            <Label>Symbols</Label>
            <p className="text-sm text-muted-foreground">Using {(typeof getAllCanonicalTickers === 'function' ? getAllCanonicalTickers() : getAllTickers()).length} tracked tickers</p>
          </div>
        </div>
        <Button className="w-full" onClick={startBackfill} disabled={isRunning}>
          {isRunning ? 'Starting…' : 'Start Reddit Backfill'}
        </Button>
        {currentRunId && (
          <div className="text-sm text-muted-foreground space-y-1">
            <p>Run ID: <code className="font-mono">{currentRunId}</code></p>
            <p>Rows inserted: {insertedCount ?? 0} (auto-updating)</p>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Note: .zst (Zstandard) archives are not supported in-edge. Please pre-decompress to .jsonl/.jsonl.gz.
        </p>
      </CardContent>
    </Card>
  );
};

export default RedditBackfillImport;
