import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, CheckCircle, XCircle, AlertTriangle, Clock } from "lucide-react";

interface SourceStatus {
  name: string;
  status: 'available' | 'unavailable' | 'partial' | 'checking';
  lastCheck: string;
  mockData: boolean;
  responseTime?: number;
  errorMessage?: string;
  dataCount?: number;
}

const DataSourceStatus = () => {
  const [sources, setSources] = useState<SourceStatus[]>([
    { name: 'Reddit', status: 'checking', lastCheck: '', mockData: false },
    { name: 'Financial News', status: 'checking', lastCheck: '', mockData: false },
    { name: 'StockTwits', status: 'checking', lastCheck: '', mockData: false },
    { name: 'Market Data (Yahoo)', status: 'checking', lastCheck: '', mockData: false },
  ]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();

  const checkSourceStatus = async (sourceName: string, functionName: string, testPayload: any) => {
    const startTime = Date.now();
    
    try {
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: testPayload
      });

      const responseTime = Date.now() - startTime;

      if (error) {
        return {
          status: 'unavailable' as const,
          responseTime,
          errorMessage: error.message,
          mockData: false
        };
      }

      // Check if response indicates mock data
      const isMockData = data?.isMockData || 
                        data?.mock || 
                        (data?.posts && data.posts.length === 1 && data.posts[0]?.title?.includes('Sample')) ||
                        (data?.articles && data.articles.length === 0) ||
                        (data?.messages && data.messages.length === 0);

      // Determine status based on response
      let status: 'available' | 'partial' | 'unavailable' = 'available';
      if (isMockData) {
        status = 'partial'; // Partial means working but returning mock data
      } else if (!data || (Array.isArray(data) && data.length === 0)) {
        status = 'unavailable';
      }

      return {
        status,
        responseTime,
        mockData: isMockData,
        dataCount: data?.posts?.length || data?.articles?.length || data?.messages?.length || 0
      };

    } catch (error) {
      return {
        status: 'unavailable' as const,
        responseTime: Date.now() - startTime,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        mockData: false
      };
    }
  };

  const checkAllSources = async () => {
    setIsRefreshing(true);
    const timestamp = new Date().toLocaleString();

    // Test payloads for each source
    const tests = [
      {
        name: 'Reddit',
        function: 'reddit-auth',
        payload: { subreddit: 'stocks', action: 'hot', limit: 5 }
      },
      {
        name: 'Financial News',
        function: 'financial-news', 
        payload: { symbols: ['AAPL'], days: 1 }
      },
      {
        name: 'StockTwits',
        function: 'stocktwits-data',
        payload: { symbols: ['AAPL'], limit: 5 }
      },
      {
        name: 'Market Data (Yahoo)',
        function: 'enhanced-market-data',
        payload: { symbols: ['AAPL'], days: 1 }
      }
    ];

    // Check all sources in parallel
    const results = await Promise.allSettled(
      tests.map(async (test) => {
        const result = await checkSourceStatus(test.name, test.function, test.payload);
        return {
          name: test.name,
          ...result,
          lastCheck: timestamp
        };
      })
    );

    // Update sources state
    const updatedSources = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          name: tests[index].name,
          status: 'unavailable' as const,
          lastCheck: timestamp,
          mockData: false,
          errorMessage: 'Connection failed'
        };
      }
    });

    setSources(updatedSources);
    setIsRefreshing(false);

    // Show toast summary
    const availableCount = updatedSources.filter(s => s.status === 'available').length;
    const mockCount = updatedSources.filter(s => s.mockData).length;
    
    if (mockCount > 0) {
      toast({
        title: "Data Source Status",
        description: `${availableCount}/4 sources available, ${mockCount} using mock data`,
        variant: "default",
      });
    }
  };

  useEffect(() => {
    checkAllSources();
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'available':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'partial':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'unavailable':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'checking':
        return <Clock className="w-5 h-5 text-blue-500 animate-pulse" />;
      default:
        return <Clock className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusBadge = (source: SourceStatus) => {
    if (source.mockData) {
      return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Mock Data</Badge>;
    }
    
    switch (source.status) {
      case 'available':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Available</Badge>;
      case 'partial':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Partial</Badge>;
      case 'unavailable':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Unavailable</Badge>;
      case 'checking':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Checking...</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Data Source Status
              {sources.some(s => s.mockData) && (
                <AlertTriangle className="w-5 h-5 text-yellow-500" />
              )}
            </CardTitle>
            <CardDescription>
              Real-time status of trading data sources
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={checkAllSources}
            disabled={isRefreshing}
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {sources.map((source) => (
            <div key={source.name} className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                {getStatusIcon(source.status)}
                <div>
                  <div className="font-medium">{source.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {source.lastCheck && `Last checked: ${source.lastCheck}`}
                    {source.responseTime && ` (${source.responseTime}ms)`}
                  </div>
                  {source.errorMessage && (
                    <div className="text-xs text-red-500 mt-1">
                      {source.errorMessage}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {source.dataCount !== undefined && (
                  <span className="text-sm text-muted-foreground">
                    {source.dataCount} items
                  </span>
                )}
                {getStatusBadge(source)}
              </div>
            </div>
          ))}
        </div>
        
        {sources.some(s => s.mockData) && (
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-center gap-2 text-yellow-800">
              <AlertTriangle className="w-4 h-4" />
              <span className="font-medium text-sm">Mock Data Warning</span>
            </div>
            <p className="text-xs text-yellow-700 mt-1">
              Some sources are returning mock/sample data. Trading signals may be limited.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DataSourceStatus;