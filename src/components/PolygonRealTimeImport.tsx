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

      // Get symbols from the most recent available date from enhanced_market_data
      const { data: tickersData, error: tickersError } = await supabase
        .from('enhanced_market_data')
        .select('symbol')
        .order('data_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50);

      if (tickersError) throw tickersError;

      const symbols = tickersData?.map((t) => t.symbol) || [];
      const limitedSymbols = symbols.slice(0, 20); // keep UI-friendly cap
      setProgress({ processed: 0, total: limitedSymbols.length });

      let success = 0;
      let failed = 0;

      // Process one symbol per request to avoid long-running server calls/timeouts
      for (let i = 0; i < limitedSymbols.length; i++) {
        const symbol = limitedSymbols[i];
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
          setProgress({ processed: i + 1, total: limitedSymbols.length });
          // Gentle client-side pacing to reduce 429s
          await new Promise((r) => setTimeout(r, 1200));
        }
      }

      toast({
        title: "Today's Market Data Fetched",
        description: `Processed ${success}/${limitedSymbols.length} symbols (${failed} failed)`,
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
          <p><strong>Symbols:</strong> Top 20 priority symbols (to respect rate limits)</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default PolygonRealTimeImport;