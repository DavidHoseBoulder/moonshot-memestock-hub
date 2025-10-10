import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const PolygonRealTimeImport = () => {
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState<{ processed: number; total: number }>({ processed: 0, total: 0 });
  const { toast } = useToast();

  const fetchTodaysData = async () => {
    try {
      setIsImporting(true);

      // Get all active symbols from ticker_universe
      const { data: tickersData, error: tickersError } = await supabase
        .from('ticker_universe')
        .select('symbol')
        .eq('active', true)
        .order('symbol');

      if (tickersError) throw tickersError;

      const symbols = tickersData?.map((t) => t.symbol) || [];
      setProgress({ processed: 0, total: symbols.length });

      let success = 0;
      let failed = 0;

      // Process one symbol per request to avoid long-running server calls/timeouts
      for (let i = 0; i < symbols.length; i++) {
        const symbol = symbols[i];
        try {
          const { data, error } = await supabase.functions.invoke('polygon-market-data', {
            body: { symbols: [symbol], days: 1 },
          });
          if (error) throw error;
          // Log per-symbol result length if available
          console.log('Polygon API response for', symbol, data);
          success++;
        } catch (e) {
          console.error('Polygon fetch error for', symbol, e);
          failed++;
        } finally {
          setProgress({ processed: i + 1, total: symbols.length });
          // Gentle client-side pacing to reduce 429s
          await new Promise((r) => setTimeout(r, 1200));
        }
      }

      toast({
        title: "Today's Market Data Fetched",
        description: `Processed ${success}/${symbols.length} symbols (${failed} failed)`,
      });
    } catch (error) {
      console.error('Polygon fetch error:', error);
      toast({
        title: 'Fetch Failed',
        description: "Couldn't start the Polygon import run",
        variant: 'destructive',
      });
    } finally {
      setIsImporting(false);
      setProgress({ processed: 0, total: 0 });
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Today's Market Data (Polygon API)</CardTitle>
        <CardDescription>
          Fetch current/recent market data using the Polygon API for real-time insights
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="pt-4">
          <Button 
            onClick={fetchTodaysData} 
            disabled={isImporting}
            className="w-full"
            variant="secondary"
          >
            {isImporting ? `Fetching ${progress.processed}/${progress.total}...` : 'Fetch Today\'s Market Data'}
          </Button>
        </div>

        <div className="text-sm text-muted-foreground space-y-1">
          <p><strong>Data source:</strong> Polygon.io API</p>
          <p><strong>Coverage:</strong> Real-time and recent market data</p>
          <p><strong>Symbols:</strong> Processes all active symbols from ticker_universe with 1.2s throttling between requests</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default PolygonRealTimeImport;