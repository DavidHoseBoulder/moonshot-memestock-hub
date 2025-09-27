import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const StockTwitsImport = () => {
  const [isImporting, setIsImporting] = useState(false);
  const [limitPerDay, setLimitPerDay] = useState(150);
  const [days, setDays] = useState(1);
  const [results, setResults] = useState<any>(null);
  const { toast } = useToast();

  const fetchStockTwitsData = async () => {
    try {
      setIsImporting(true);
      setResults(null);

      const { data, error } = await supabase.functions.invoke('stocktwits-data', {
        body: { 
          days: days, 
          limitPerDay: limitPerDay, 
          chunkSize: 15, 
          chunkDelayMs: 90000, 
          symbolDelayMs: 1800, 
          fetchRetries: 3 
        }
      });

      if (error) {
        throw error;
      }

      setResults(data);

      toast({
        title: "StockTwits Background Processing Started",
        description: data?.message || `Started processing ${data?.totalSymbols || 0} symbols in background. Monitor progress in sentiment_history table.`,
      });

    } catch (error: any) {
      console.error('StockTwits fetch error:', error);
      toast({
        title: 'StockTwits Fetch Failed',
        description: error?.message || "Couldn't fetch StockTwits data",
        variant: 'destructive',
      });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>StockTwits Data Import</CardTitle>
        <CardDescription>
          Fetch sentiment data from StockTwits for symbols in your database
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="limit-per-day">Messages per day per symbol</Label>
            <Input 
              id="limit-per-day"
              type="number" 
              min={1} 
              max={100} 
              value={limitPerDay} 
              onChange={(e) => setLimitPerDay(parseInt(e.target.value) || 25)} 
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="days">Lookback window (days)</Label>
            <Input 
              id="days"
              type="number" 
              min={1} 
              max={30} 
              value={days} 
              onChange={(e) => setDays(parseInt(e.target.value) || 7)} 
            />
          </div>
        </div>

        <Button 
          onClick={fetchStockTwitsData} 
          disabled={isImporting}
          className="w-full"
        >
          {isImporting ? 'Fetching StockTwits Data...' : 'Fetch StockTwits Data'}
        </Button>

        {results && (
          <div className="text-sm text-muted-foreground space-y-1 p-3 bg-muted rounded">
            <p><strong>Background Processing Status:</strong></p>
            <p>• Total symbols to process: {results.totalSymbols}</p>
            <p>• Status: {results.status}</p>
            <p>• Processing started for {results.totalSymbols} symbols</p>
            <p>• Monitor new records in sentiment_history table (~12+ minutes)</p>
            {results.message && <p>• {results.message}</p>}
          </div>
        )}

        <div className="text-sm text-muted-foreground space-y-1">
          <p><strong>Data source:</strong> StockTwits API</p>
          <p><strong>Coverage:</strong> All ~107 symbols from symbol_disambig (background processing)</p>
          <p><strong>Processing:</strong> 15 symbols/chunk, 90s delay between chunks</p>
          <p><strong>Storage:</strong> Results stored in sentiment_history table</p>
          <p><strong>Timeline:</strong> ~12+ minutes total processing time</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default StockTwitsImport;