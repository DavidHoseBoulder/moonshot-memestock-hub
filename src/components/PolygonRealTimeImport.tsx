import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const PolygonRealTimeImport = () => {
  const [isImporting, setIsImporting] = useState(false);
  const { toast } = useToast();

  const fetchTodaysData = async () => {
    try {
      setIsImporting(true);
      
      // Get all active symbols
      const { data: tickersData, error: tickersError } = await supabase
        .from('ticker_universe')
        .select('symbol')
        .eq('active', true)
        .order('priority', { ascending: true });

      if (tickersError) {
        throw tickersError;
      }

      const symbols = tickersData?.map(t => t.symbol) || [];

      const { data, error } = await supabase.functions.invoke('polygon-market-data', {
        body: {
          symbols: symbols.slice(0, 20), // Limit to first 20 symbols to avoid rate limits
          days: 1
        }
      });

      if (error) {
        throw error;
      }

      toast({
        title: "Today's Market Data Fetched",
        description: `Retrieved current market data for ${data.length || 0} symbols using Polygon API`,
      });

      console.log('Polygon API response:', data);

    } catch (error) {
      console.error('Polygon fetch error:', error);
      toast({
        title: "Fetch Failed",
        description: "Failed to fetch today's market data from Polygon API",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
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
            {isImporting ? 'Fetching Current Data...' : 'Fetch Today\'s Market Data'}
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