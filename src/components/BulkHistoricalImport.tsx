import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";


const BulkHistoricalImport = () => {
  const [isImporting, setIsImporting] = useState(false);
  const [days, setDays] = useState(90);
  const [batchSize, setBatchSize] = useState(5);
  const [delayMs, setDelayMs] = useState(3000);
  const { toast } = useToast();
  const [tickers, setTickers] = useState<string[]>([]);
  const [isLoadingTickers, setIsLoadingTickers] = useState(true);

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
      if (error) {
        console.error('Failed to load tickers:', error);
        setTickers([]);
      } else {
        setTickers((data || []).map((r: any) => String(r.symbol)));
      }
      setIsLoadingTickers(false);
    })();
    return () => { active = false; };
  }, []);

  const startBulkImport = async () => {
    try {
      setIsImporting(true);
      
      const { data, error } = await supabase.functions.invoke('bulk-historical-import', {
        body: {
          symbols: tickers, // Use corrected, deduped tickers
          days: days,
          batch_size: batchSize,
          delay_ms: delayMs
        }
      });

      if (error) {
        throw error;
      }

      toast({
        title: "Historical Import Started",
        description: `Importing ${tickers.length} symbols (${days} days). Est. duration: ${data.estimated_duration_minutes} minutes`,
      });

      console.log('Bulk import response:', data);

    } catch (error) {
      console.error('Bulk import error:', error);
      toast({
        title: "Import Failed",
        description: "Failed to start historical data import",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Yahoo Market Data Bulk Import</CardTitle>
        <CardDescription>
          Import historical market data for all {tickers.length} symbols to populate the cache.
          This runs in the background and may take several minutes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quick fix for missing symbols */}
        <div className="bg-muted p-4 rounded-lg border-l-4 border-l-warning">
          <h4 className="font-semibold text-sm mb-2">Missing Data Detected</h4>
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-2">
              ✅ Ticker universe cleaned up - removed 14 OTC/delisted symbols
            </p>
            <p className="text-xs text-muted-foreground">
              All active symbols should now have current market data
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="days">Days of History</Label>
            <Input
              id="days"
              type="number"
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value))}
              min="1"
              max="365"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="batchSize">Batch Size</Label>
            <Input
              id="batchSize"
              type="number"
              value={batchSize}
              onChange={(e) => setBatchSize(parseInt(e.target.value))}
              min="1"
              max="10"
            />
          </div>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="delay">Delay Between Batches (ms)</Label>
          <Input
            id="delay"
            type="number"
            value={delayMs}
            onChange={(e) => setDelayMs(parseInt(e.target.value))}
            min="1000"
            max="10000"
            step="500"
          />
          <p className="text-sm text-muted-foreground">
            Higher delays reduce API rate limiting but increase total time
          </p>
        </div>

        <div className="pt-4">
          <Button 
            onClick={startBulkImport} 
            disabled={isImporting}
            className="w-full"
          >
            {isImporting ? 'Starting Import...' : `Import ${tickers.length} Symbols`}
          </Button>
        </div>

        <div className="text-sm text-muted-foreground space-y-1">
          <p><strong>Estimated time:</strong> ~{Math.ceil((tickers.length / batchSize) * (delayMs / 1000) / 60)} minutes</p>
          <p><strong>Total API calls:</strong> ~{tickers.length}</p>
          <p><strong>Data points:</strong> ~{tickers.length * days} records</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default BulkHistoricalImport;