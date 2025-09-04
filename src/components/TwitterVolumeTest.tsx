import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Twitter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

interface VolumeResult {
  symbol: string;
  volume: number;
  timeframe_hours: number;
  avg_engagement?: number;
  total_engagement?: number;
  volume_per_hour?: number;
  estimated_daily_volume?: number;
  error?: string;
  sample_tweets?: Array<{
    id: string;
    text: string;
    created_at: string;
    engagement: number;
  }>;
  rate_limit?: RateLimitInfo;
}

type RateLimitInfo = {
  limit?: number;
  remaining?: number;
  reset?: number; // epoch seconds
  retry_after?: number; // seconds
};

export function TwitterVolumeTest() {
  const [symbols, setSymbols] = useState("TSLA,PLTR,AAPL");
  const [hours, setHours] = useState(24);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<VolumeResult[]>([]);
  const [error, setError] = useState<string>("");
  const [rateLimit, setRateLimit] = useState<RateLimitInfo | null>(null);
  const [perSymbolRateLimit, setPerSymbolRateLimit] = useState<Record<string, RateLimitInfo> | null>(null);

  const runTest = async () => {
    setLoading(true);
    setError("");
    setResults([]);

    try {
      const { data, error: functionError } = await supabase.functions.invoke('twitter-volume-test', {
        body: { 
          symbols: symbols.split(',').map(s => s.trim().toUpperCase()),
          hours 
        }
      });

      if (functionError) throw functionError;

      if (data?.results) {
        setResults(data.results);
        setRateLimit(data?.rate_limit?.last ?? null);
        setPerSymbolRateLimit(data?.rate_limit?.per_symbol ?? null);
      } else {
        throw new Error("No results returned");
      }
    } catch (err: any) {
      console.error('Twitter volume test error:', err);
      setError(err.message || 'Failed to fetch Twitter volumes');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Twitter className="h-5 w-5" />
            Twitter Volume Test
          </CardTitle>
          <CardDescription>
            Test Twitter mention volumes for specific symbols over a time period
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="symbols">Symbols (comma-separated)</Label>
              <Input
                id="symbols"
                value={symbols}
                onChange={(e) => setSymbols(e.target.value)}
                placeholder="TSLA,PLTR,AAPL"
              />
            </div>
            <div>
              <Label htmlFor="hours">Time Period (hours)</Label>
              <Input
                id="hours"
                type="number"
                value={hours}
                onChange={(e) => setHours(parseInt(e.target.value) || 24)}
                min="1"
                max="168"
              />
            </div>
          </div>
          
          <Button 
            onClick={runTest} 
            disabled={loading}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Testing Twitter Volumes...
              </>
            ) : (
              'Run Volume Test'
            )}
          </Button>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              {error}
            </div>
          )}
        </CardContent>
      </Card>
 
      {rateLimit && (
        <Card>
          <CardHeader>
            <CardTitle>Twitter rate limit</CardTitle>
            <CardDescription>
              {typeof rateLimit.remaining === 'number' && typeof rateLimit.limit === 'number' ? (
                <span>{rateLimit.remaining} remaining of {rateLimit.limit}</span>
              ) : (
                <span>Rate limit info available</span>
              )}
              {typeof rateLimit.reset === 'number' && (
                <span> • resets at {new Date(rateLimit.reset * 1000).toLocaleTimeString()}</span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {perSymbolRateLimit && (
              <div className="grid gap-2 text-sm">
                {Object.entries(perSymbolRateLimit).map(([sym, rl]) => (
                  <div key={sym} className="flex items-center justify-between">
                    <span>${""}{sym}</span>
                    <span className="text-muted-foreground">
                      {typeof rl.remaining === 'number' && typeof rl.limit === 'number'
                        ? `${rl.remaining}/${rl.limit} remaining`
                        : 'limit n/a'}
                      {typeof rl.retry_after === 'number'
                        ? ` • retry in ${Math.round(rl.retry_after)}s`
                        : (typeof rl.reset === 'number' ? ` • resets ${new Date(rl.reset * 1000).toLocaleTimeString()}` : '')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {results.length > 0 && (
        <div className="grid gap-4">
          {results.map((result, index) => (
            <Card key={index}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>${result.symbol}</span>
                  {result.error ? (
                    <Badge variant="destructive">Error</Badge>
                  ) : (
                    <Badge variant="default">
                      {result.volume} mentions
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {result.error ? (
                  <div className="text-destructive text-sm">{result.error}</div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <div className="text-muted-foreground">Volume ({result.timeframe_hours}h)</div>
                        <div className="font-semibold">{result.volume}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Per Hour</div>
                        <div className="font-semibold">{result.volume_per_hour}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Daily Estimate</div>
                        <div className="font-semibold">{result.estimated_daily_volume}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Avg Engagement</div>
                        <div className="font-semibold">{result.avg_engagement || 0}</div>
                      </div>
                    </div>

                    {result.sample_tweets && result.sample_tweets.length > 0 && (
                      <div>
                        <div className="text-sm font-medium mb-2">Sample Tweets:</div>
                        <div className="space-y-2">
                          {result.sample_tweets.map((tweet) => (
                            <div key={tweet.id} className="text-sm bg-muted/50 p-2 rounded">
                              <div className="text-muted-foreground mb-1">
                                {new Date(tweet.created_at).toLocaleString()} • {tweet.engagement} engagement
                              </div>
                              <div>{tweet.text}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}