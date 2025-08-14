import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

import { supabase } from "@/integrations/supabase/client";

const DEFAULT_SUBS = "";

const RedditBackfillImport = () => {
  const { toast } = useToast();
  const [urlsText, setUrlsText] = useState("");
  const [subs, setSubs] = useState(DEFAULT_SUBS);
  const [batchSize, setBatchSize] = useState(25);
  const [maxItems, setMaxItems] = useState<number>(25000);
  const [concurrency, setConcurrency] = useState<number>(3);
  const [isRunning, setIsRunning] = useState(false);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [insertedCount, setInsertedCount] = useState<number | null>(null);
  const [runInfo, setRunInfo] = useState<{ status: string; scanned: number; queued: number; analyzed: number; inserted: number; finished_at: string | null } | null>(null);
  const [recentRuns, setRecentRuns] = useState<any[]>([]);
  const [trackedSymbols, setTrackedSymbols] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await (supabase as any)
        .from('ticker_universe')
        .select('symbol')
        .eq('active', true)
        .order('priority', { ascending: true })
        .order('symbol', { ascending: true });
      if (!active) return;
      if (!error) setTrackedSymbols((data || []).map((r: any) => String(r.symbol)));
    })();
    return () => { active = false; };
  }, []);

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
      const symbols: string[] = [];
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
            max_items: maxItems,
            concurrency,
          }
        });
        
        console.log('Reddit backfill invoke response:', { data, error });
        
        if (error) {
          console.error('Reddit backfill error details:', error);
          throw new Error(`Edge function error: ${error.message || JSON.stringify(error)}`);
        }
        totalQueued += data?.queued ?? 0;
        totalEstimatedBatches += data?.estimated_batches ?? 0;
        totalInvoked++;
      }

      toast({
        title: "Reddit Backfill Started",
        description: `Started ${totalInvoked} file(s) in background. Run: ${runId}`,
      });
      console.log('reddit-backfill-import multi response', { totalQueued, totalEstimatedBatches, totalInvoked, urls, runId });
      console.log('reddit-backfill-import multi response', { totalQueued, totalEstimatedBatches, totalInvoked, urls });
    } catch (e: any) {
      console.error(e);
      toast({ title: "Backfill Error", description: e?.message ?? 'Failed to start backfill', variant: "destructive" });
    } finally {
      setIsRunning(false);
    }
  };

  const cancelRun = async () => {
    if (!currentRunId) return;
    const { error } = await supabase
      .from('import_runs')
      .update({ status: 'cancelling' })
      .eq('run_id', currentRunId);
    if (error) {
      toast({ title: 'Cancel failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Cancelling…', description: 'The run will stop at the next batch boundary.' });
    }
  };

  const resumeRun = async (run: any) => {
    if (!run?.file || !String(run.file).startsWith('http')) {
      toast({ title: 'Resume not available', description: 'This run lacks the original URL. Paste the URL to re-run.', variant: 'destructive' });
      return;
    }
    setUrlsText(String(run.file));
    if (run.batch_size) setBatchSize(run.batch_size);
    setTimeout(() => startBackfill(), 0);
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

  useEffect(() => {
    if (!currentRunId) return;
    let active = true;
    const interval = setInterval(async () => {
      const { data, error } = await supabase
        .from('import_runs')
        .select('status, scanned_total, queued_total, analyzed_total, inserted_total, finished_at')
        .eq('run_id', currentRunId)
        .maybeSingle();
      if (!active) return;
      if (!error && data) {
        setRunInfo({
          status: data.status,
          scanned: data.scanned_total ?? 0,
          queued: data.queued_total ?? 0,
          analyzed: data.analyzed_total ?? 0,
          inserted: data.inserted_total ?? 0,
          finished_at: data.finished_at ?? null,
        });
      }
    }, 3000);
    return () => { active = false; clearInterval(interval); };
  }, [currentRunId]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data } = await supabase
        .from('import_runs')
        .select('run_id, status, file, batch_size, scanned_total, queued_total, analyzed_total, inserted_total, started_at, finished_at')
        .order('started_at', { ascending: false })
        .limit(20);
      if (!active) return;
      setRecentRuns(data ?? []);
    };
    load();
    const id = setInterval(load, 5000);
    return () => { active = false; clearInterval(id); };
  }, []);

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Reddit Backfill (JSONL)</CardTitle>
        <CardDescription>
          Stream .jsonl/.jsonl.gz. Leave Subreddits blank for all (NSFW excluded). All symbols auto-detected; $ required for short tickers (&lt;=3).
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
                const syms = trackedSymbols.join('|');
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
                const symsArray = trackedSymbols;
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
          <p className="text-sm text-muted-foreground">Leave blank to include all subreddits (NSFW excluded by default).</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label htmlFor="batch">Batch size</Label>
            <Input id="batch" type="number" min={5} max={100} value={batchSize} onChange={(e) => setBatchSize(parseInt(e.target.value || '25'))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="max-items">Max items (0 = unlimited)</Label>
            <Input id="max-items" type="number" min={0} value={maxItems} onChange={(e) => setMaxItems(parseInt(e.target.value || '0'))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="concurrency">Concurrency</Label>
            <Input id="concurrency" type="number" min={1} max={5} value={concurrency} onChange={(e) => setConcurrency(parseInt(e.target.value || '3'))} />
          </div>
          <div className="space-y-2">
            <Label>Symbol detection</Label>
            <p className="text-sm text-muted-foreground">All symbols auto-detected; $ required for short tickers (&lt;=3).</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <Button className="w-full" onClick={startBackfill} disabled={isRunning}>
            {isRunning ? 'Starting…' : 'Start Reddit Backfill'}
          </Button>
          {currentRunId && (runInfo?.status === 'running' || runInfo?.status === 'queued') && (
            <Button type="button" variant="destructive" className="w-full" onClick={cancelRun}>
              Cancel Run
            </Button>
          )}
        </div>
        {currentRunId && (
          <div className="text-sm text-muted-foreground space-y-2">
            <div className="flex items-center gap-2">
              <span>Run ID:</span>
              <code className="font-mono">{currentRunId}</code>
              {runInfo && (
                <Badge variant={runInfo.status === 'succeeded' ? 'default' : runInfo.status === 'failed' ? 'destructive' : 'secondary'}>
                  {runInfo.status}
                </Badge>
              )}
            </div>
            <p>Rows inserted: {insertedCount ?? 0} (auto-updating)</p>
            {runInfo && (
              <p>Scanned: {runInfo.scanned?.toLocaleString?.() ?? runInfo.scanned} · Queued: {runInfo.queued?.toLocaleString?.() ?? runInfo.queued} · Analyzed: {runInfo.analyzed?.toLocaleString?.() ?? runInfo.analyzed} · Inserted: {runInfo.inserted?.toLocaleString?.() ?? runInfo.inserted}{runInfo.finished_at ? ` · Finished: ${new Date(runInfo.finished_at).toLocaleTimeString()}` : ''}</p>
            )}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Note: .zst (Zstandard) archives are not supported in-edge. Please pre-decompress to .jsonl/.jsonl.gz.
        </p>

        {recentRuns.length > 0 && (
          <div className="space-y-2">
            <Label>Recent runs</Label>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead className="text-right">Scanned</TableHead>
                  <TableHead className="text-right">Queued</TableHead>
                  <TableHead className="text-right">Analyzed</TableHead>
                  <TableHead className="text-right">Inserted</TableHead>
                  <TableHead className="text-right">Batch</TableHead>
                  <TableHead className="text-right">Started</TableHead>
                  <TableHead className="text-right">Finished</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentRuns.map((r) => (
                  <TableRow key={r.run_id}>
                    <TableCell>
                      <Badge variant={r.status === 'succeeded' ? 'default' : r.status === 'failed' ? 'destructive' : 'secondary'}>
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="truncate max-w-[240px]" title={r.file}>{r.file?.split('/').pop?.() ?? r.file}</TableCell>
                    <TableCell className="text-right">{r.scanned_total ?? 0}</TableCell>
                    <TableCell className="text-right">{r.queued_total ?? 0}</TableCell>
                    <TableCell className="text-right">{r.analyzed_total ?? 0}</TableCell>
                    <TableCell className="text-right">{r.inserted_total ?? 0}</TableCell>
                    <TableCell className="text-right">{r.batch_size ?? '-'}</TableCell>
                    <TableCell className="text-right">{r.started_at ? new Date(r.started_at).toLocaleTimeString() : '-'}</TableCell>
                    <TableCell className="text-right">{r.finished_at ? new Date(r.finished_at).toLocaleTimeString() : '-'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => resumeRun(r)}>Resume</Button>
                        {r.status === 'processing' && (
                          <Button 
                            size="sm" 
                            variant="destructive" 
                            onClick={async () => {
                              const { error } = await supabase
                                .from('import_runs')
                                .update({ status: 'cancelled' })
                                .eq('run_id', r.run_id);
                              if (error) {
                                toast({ title: 'Cancel failed', description: error.message, variant: 'destructive' });
                              } else {
                                toast({ title: 'Run cancelled', description: `Run ${r.run_id.slice(0,8)}... cancelled` });
                              }
                            }}
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RedditBackfillImport;
