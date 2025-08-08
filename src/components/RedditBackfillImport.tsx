import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getAllTickers } from "@/data/stockUniverse";
import { supabase } from "@/integrations/supabase/client";

const DEFAULT_SUBS = "stocks,investing,SecurityAnalysis,ValueInvesting,StockMarket,wallstreetbets,pennystocks";

const RedditBackfillImport = () => {
  const { toast } = useToast();
  const [url, setUrl] = useState("");
  const [subs, setSubs] = useState(DEFAULT_SUBS);
  const [batchSize, setBatchSize] = useState(25);
  const [isRunning, setIsRunning] = useState(false);

  const startBackfill = async () => {
    if (!url) {
      toast({ title: "Missing URL", description: "Provide a .jsonl or .jsonl.gz URL", variant: "destructive" });
      return;
    }
    if (url.endsWith(".zst")) {
      toast({ title: ".zst not supported", description: "Please decompress to .jsonl or .jsonl.gz first" , variant: "destructive"});
      return;
    }

    setIsRunning(true);
    try {
      const symbols = getAllTickers();
      const subreddits = subs.split(",").map(s => s.trim()).filter(Boolean);
      const { data, error } = await supabase.functions.invoke('reddit-backfill-import', {
        body: {
          mode: 'jsonl_url',
          jsonl_url: url,
          subreddits,
          symbols,
          batch_size: batchSize,
        }
      });
      if (error) throw error;
      toast({
        title: "Reddit Backfill Started",
        description: `Queued ${data?.queued ?? 0} posts across ~${data?.estimated_batches ?? 0} batches.`,
      });
      console.log('reddit-backfill-import response', data);
    } catch (e: any) {
      console.error(e);
      toast({ title: "Backfill Error", description: e?.message ?? 'Failed to start backfill', variant: "destructive" });
    } finally {
      setIsRunning(false);
    }
  };

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
          <Label htmlFor="jsonl-url">JSONL/JSONL.GZ URL</Label>
          <Input id="jsonl-url" placeholder="https://example.com/reddit_2025-07.jsonl.gz" value={url} onChange={(e) => setUrl(e.target.value)} />
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
            <p className="text-sm text-muted-foreground">Using {getAllTickers().length} tracked tickers</p>
          </div>
        </div>
        <Button className="w-full" onClick={startBackfill} disabled={isRunning}>
          {isRunning ? 'Starting…' : 'Start Reddit Backfill'}
        </Button>
        <p className="text-xs text-muted-foreground">
          Note: .zst (Zstandard) archives are not supported in-edge. Please pre-decompress to .jsonl/.jsonl.gz.
        </p>
      </CardContent>
    </Card>
  );
};

export default RedditBackfillImport;
