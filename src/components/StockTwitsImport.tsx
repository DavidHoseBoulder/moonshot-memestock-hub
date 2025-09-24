import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const StockTwitsImport = () => {
  const [isImporting, setIsImporting] = useState(false);
  const [limitPerDay, setLimitPerDay] = useState(25);
  const [days, setDays] = useState(7);
  const [results, setResults] = useState<any>(null);
  const { toast } = useToast();

  const fetchStockTwitsData = async () => {
    try {
      setIsImporting(true);
      setResults(null);

      const { data, error } = await supabase.functions.invoke('stocktwits-data', {
        body: { limitPerDay, days }
      });

      if (error) {
        throw error;
      }

      setResults(data);

      toast({
        title: "StockTwits Data Fetched",
        description: `Retrieved ${data?.totalResults || 0} messages from ${data?.fromAPI || 0} symbols (${data?.fromDatabase || 0} cached)`,
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
            <p><strong>Results:</strong></p>
            <p>• Total messages: {results.totalResults}</p>
            <p>• Fresh from API: {results.fromAPI} symbols</p>
            <p>• Cached data used: {results.fromDatabase} symbols</p>
            {results.ticker_counts && Object.keys(results.ticker_counts).length > 0 && (
              <p>• Top mentions: {Object.entries(results.ticker_counts)
                .sort(([,a]: any, [,b]: any) => b - a)
                .slice(0, 5)
                .map(([symbol, count]) => `${symbol}(${count})`)
                .join(', ')}</p>
            )}
          </div>
        )}

        <div className="text-sm text-muted-foreground space-y-1">
          <p><strong>Data source:</strong> StockTwits API</p>
          <p><strong>Coverage:</strong> Up to 15 symbols per run (rate limited)</p>
          <p><strong>Storage:</strong> Cached in sentiment_history for future use</p>
          <p><strong>Symbols:</strong> Loaded from symbol_disambig table</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default StockTwitsImport;