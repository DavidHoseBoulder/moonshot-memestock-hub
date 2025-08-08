// Dashboard for monitoring the new 3-stage sentiment orchestration
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, CheckCircle, Clock, Zap, TrendingUp, Database } from 'lucide-react';
import { SentimentOrchestratorV2, DEFAULT_ORCHESTRATION_CONFIG, OrchestrationResult } from '@/utils/sentimentOrchestratorV2';
import { STOCK_UNIVERSE } from '@/data/stockUniverse';

export const SentimentOrchestrationDashboard: React.FC = () => {
  const [orchestrator] = useState(() => new SentimentOrchestratorV2(DEFAULT_ORCHESTRATION_CONFIG));
  const [result, setResult] = useState<OrchestrationResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_ORCHESTRATION_CONFIG);
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);

  // Initialize with a subset of stock universe
  useEffect(() => {
    const initialSymbols = Object.keys(STOCK_UNIVERSE).slice(0, 20);
    setSelectedSymbols(initialSymbols);
  }, []);

  const runOrchestration = async () => {
    setIsProcessing(true);
    try {
      orchestrator.updateConfig(config);
      const orchestrationResult = await orchestrator.orchestrateSentimentCollection(selectedSymbols);
      setResult(orchestrationResult);
    } catch (error) {
      console.error('Orchestration failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const updateConfig = (key: string, value: any) => {
    setConfig(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const updateQualityGate = (key: string, value: any) => {
    setConfig(prev => ({
      ...prev,
      qualityGate: {
        ...prev.qualityGate,
        [key]: value
      }
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Sentiment Orchestration V2</h2>
          <p className="text-muted-foreground">
            3-Stage strategy: Batch processing, redundancy, and multi-timescale smoothing
          </p>
        </div>
        <Button 
          onClick={runOrchestration} 
          disabled={isProcessing}
          className="gap-2"
        >
          {isProcessing ? (
            <>
              <Clock className="h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Zap className="h-4 w-4" />
              Run Orchestration
            </>
          )}
        </Button>
      </div>

      <Tabs defaultValue="config" className="space-y-4">
        <TabsList>
          <TabsTrigger value="config">Configuration</TabsTrigger>
          <TabsTrigger value="results">Results</TabsTrigger>
          <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Stage Controls */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Processing Stages
                </CardTitle>
                <CardDescription>
                  Enable or disable each stage of the orchestration
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="batch-processing">Stage 1: Batch Processing</Label>
                  <Switch
                    id="batch-processing"
                    checked={config.enableBatchProcessing}
                    onCheckedChange={(checked) => updateConfig('enableBatchProcessing', checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="redundancy">Stage 2: Redundancy</Label>
                  <Switch
                    id="redundancy"
                    checked={config.enableRedundancy}
                    onCheckedChange={(checked) => updateConfig('enableRedundancy', checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="multi-timescale">Stage 3: Multi-timescale</Label>
                  <Switch
                    id="multi-timescale"
                    checked={config.enableMultiTimescale}
                    onCheckedChange={(checked) => updateConfig('enableMultiTimescale', checked)}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Quality Gate */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5" />
                  Quality Gate
                </CardTitle>
                <CardDescription>
                  Set minimum thresholds for data quality
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="min-sources">Minimum Sources</Label>
                  <Input
                    id="min-sources"
                    type="number"
                    min="1"
                    max="6"
                    value={config.qualityGate.minSources}
                    onChange={(e) => updateQualityGate('minSources', parseInt(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="min-confidence">Minimum Confidence</Label>
                  <Input
                    id="min-confidence"
                    type="number"
                    min="0"
                    max="1"
                    step="0.1"
                    value={config.qualityGate.minConfidence}
                    onChange={(e) => updateQualityGate('minConfidence', parseFloat(e.target.value))}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="allow-synthetic">Allow Synthetic Data</Label>
                  <Switch
                    id="allow-synthetic"
                    checked={config.qualityGate.allowSynthetic}
                    onCheckedChange={(checked) => updateQualityGate('allowSynthetic', checked)}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Symbol Selection */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Symbol Selection</CardTitle>
                <CardDescription>
                  Currently processing {selectedSymbols.length} symbols
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {selectedSymbols.slice(0, 20).map(symbol => (
                    <Badge key={symbol} variant="secondary">
                      {symbol}
                    </Badge>
                  ))}
                  {selectedSymbols.length > 20 && (
                    <Badge variant="outline">
                      +{selectedSymbols.length - 20} more
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="results" className="space-y-4">
          {result ? (
            <div className="space-y-6">
              {/* Overview Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Coverage</p>
                        <p className="text-2xl font-bold">{(result.coverage * 100).toFixed(1)}%</p>
                      </div>
                      <TrendingUp className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <Progress value={result.coverage * 100} className="mt-2" />
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Processed</p>
                        <p className="text-2xl font-bold">
                          {result.processedSymbols} / {result.totalSymbols}
                        </p>
                      </div>
                      <Database className="h-8 w-8 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">High Quality</p>
                        <p className="text-2xl font-bold">{result.qualityMetrics.highConfidence}</p>
                      </div>
                      <CheckCircle className="h-8 w-8 text-green-600" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Processing Time</p>
                        <p className="text-2xl font-bold">{(result.processingTimeMs / 1000).toFixed(1)}s</p>
                      </div>
                      <Clock className="h-8 w-8 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Quality Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle>Quality Metrics</CardTitle>
                  <CardDescription>
                    Breakdown of sentiment data quality across all processed symbols
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">
                        {result.qualityMetrics.highConfidence}
                      </div>
                      <div className="text-sm text-muted-foreground">High Confidence</div>
                      <div className="text-xs text-muted-foreground">≥ 0.7 confidence</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-yellow-600">
                        {result.qualityMetrics.mediumConfidence}
                      </div>
                      <div className="text-sm text-muted-foreground">Medium Confidence</div>
                      <div className="text-xs text-muted-foreground">0.4 - 0.7 confidence</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-orange-600">
                        {result.qualityMetrics.lowConfidence}
                      </div>
                      <div className="text-sm text-muted-foreground">Low Confidence</div>
                      <div className="text-xs text-muted-foreground">&lt; 0.4 confidence</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">
                        {result.qualityMetrics.synthetic}
                      </div>
                      <div className="text-sm text-muted-foreground">Synthetic</div>
                      <div className="text-xs text-muted-foreground">Fallback/derived</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Batch Results */}
              {result.batchResults.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Batch Processing Results</CardTitle>
                    <CardDescription>
                      Performance of each batch in Stage 1 processing
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {result.batchResults.map((batch, index) => (
                        <div key={batch.batchId} className="flex items-center justify-between p-3 border rounded">
                          <div className="flex items-center gap-3">
                            <Badge variant="outline">Batch {index + 1}</Badge>
                            <div className="text-sm">
                              <span className="font-medium">{batch.processedSymbols.length}</span> processed,{' '}
                              <span className="text-red-600">{batch.failedSymbols.length}</span> failed
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge 
                              variant={batch.coverage > 0.8 ? "default" : batch.coverage > 0.5 ? "secondary" : "destructive"}
                            >
                              {(batch.coverage * 100).toFixed(0)}%
                            </Badge>
                            <div className="text-sm text-muted-foreground">
                              {batch.processingTimeMs}ms
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Sample Results */}
              <Card>
                <CardHeader>
                  <CardTitle>Sample Results</CardTitle>
                  <CardDescription>
                    First 10 processed symbols with their sentiment scores
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Array.from(result.sentimentResults.entries()).slice(0, 10).map(([symbol, sentiment]) => (
                      <div key={symbol} className="flex items-center justify-between p-3 border rounded">
                        <div className="flex items-center gap-3">
                          <Badge variant="outline">{symbol}</Badge>
                          <div className="text-sm">
                            {sentiment.sources.length} sources
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant={sentiment.overall > 0.1 ? "default" : sentiment.overall < -0.1 ? "destructive" : "secondary"}
                          >
                            {sentiment.overall > 0 ? '+' : ''}{sentiment.overall.toFixed(3)}
                          </Badge>
                          <Badge variant="outline">
                            {(sentiment.confidence * 100).toFixed(0)}% conf
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center text-muted-foreground">
                  <AlertCircle className="h-12 w-12 mx-auto mb-4" />
                  <p>Run orchestration to see results</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="monitoring" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Stage Performance</CardTitle>
              <CardDescription>
                Monitor the effectiveness of each orchestration stage
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium">Stage 1: Batch Processing</h4>
                    <Badge variant={config.enableBatchProcessing ? "default" : "secondary"}>
                      {config.enableBatchProcessing ? "Enabled" : "Disabled"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Reduces API bottlenecks through intelligent batching and staggered requests
                  </p>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="font-medium">Rate Limit Avoidance</div>
                      <div className="text-muted-foreground">2s stagger between batches</div>
                    </div>
                    <div>
                      <div className="font-medium">Batch Size</div>
                      <div className="text-muted-foreground">25 symbols per batch</div>
                    </div>
                    <div>
                      <div className="font-medium">Prioritization</div>
                      <div className="text-muted-foreground">High-value symbols first</div>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium">Stage 2: Redundancy</h4>
                    <Badge variant={config.enableRedundancy ? "default" : "secondary"}>
                      {config.enableRedundancy ? "Enabled" : "Disabled"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Fills gaps using fallback sources and derived sentiment
                  </p>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="font-medium">Source Fallbacks</div>
                      <div className="text-muted-foreground">Twitter → Reddit → News</div>
                    </div>
                    <div>
                      <div className="font-medium">Trends Derivation</div>
                      <div className="text-muted-foreground">Google Trends momentum</div>
                    </div>
                    <div>
                      <div className="font-medium">Peer Proxy</div>
                      <div className="text-muted-foreground">Sector-based estimation</div>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium">Stage 3: Multi-timescale</h4>
                    <Badge variant={config.enableMultiTimescale ? "default" : "secondary"}>
                      {config.enableMultiTimescale ? "Enabled" : "Disabled"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Smooths sentiment using exponential moving averages across timeframes
                  </p>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="font-medium">1H Weight</div>
                      <div className="text-muted-foreground">50% (recent)</div>
                    </div>
                    <div>
                      <div className="font-medium">6H Weight</div>
                      <div className="text-muted-foreground">30% (medium)</div>
                    </div>
                    <div>
                      <div className="font-medium">24H Weight</div>
                      <div className="text-muted-foreground">20% (historical)</div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};