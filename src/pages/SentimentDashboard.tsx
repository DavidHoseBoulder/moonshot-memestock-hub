import SentimentDashboard from "@/components/SentimentDashboard";
import SentimentHistoryViewer from "@/components/SentimentHistoryViewer";
import SentimentVelocityTracker from "@/components/SentimentVelocityTracker";
import SentimentCoverageMonitor from "@/components/SentimentCoverageMonitor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquare, History, Zap, Activity, Settings } from "lucide-react";
import { SentimentOrchestrationDashboard } from "@/components/SentimentOrchestrationDashboard";

const SentimentDashboardPage = () => {
  // Sample data for coverage monitor
  const sampleDataSources = [
    {
      name: "Reddit",
      status: "active" as const,
      coverage: 75,
      lastUpdate: new Date("2024-01-07T14:30:00"),
    },
    {
      name: "StockTwits",
      status: "degraded" as const,
      coverage: 45,
      lastUpdate: new Date("2024-01-07T14:25:00"),
      errorMessage: "Rate limit exceeded"
    },
    {
      name: "Financial News",
      status: "active" as const,
      coverage: 90,
      lastUpdate: new Date("2024-01-07T14:32:00"),
    },
    {
      name: "Google Trends",
      status: "active" as const,
      coverage: 85,
      lastUpdate: new Date("2024-01-07T14:35:00"),
    },
    {
      name: "Twitter",
      status: "active" as const,
      coverage: 65,
      lastUpdate: new Date("2024-01-07T14:33:00"),
    },
    {
      name: "YouTube Sentiment",
      status: "active" as const,
      coverage: 25,
      lastUpdate: new Date("2024-01-07T14:20:00"),
    }
  ];

  const tickerCoverage = {
    total: 50,
    withSentiment: 32,
    withTechnical: 45,
    zeroSentiment: 18
  };

  // Sample symbols for velocity tracker
  const sampleSymbols = ['TSLA', 'AAPL', 'NVDA', 'AMD', 'GME'];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Sentiment Dashboard</h1>
          <p className="text-muted-foreground">
            Multi-source sentiment analysis and monitoring
          </p>
        </div>
      </div>

      <Tabs defaultValue="dashboard" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="dashboard" className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Live Dashboard
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="w-4 h-4" />
            Sentiment History
          </TabsTrigger>
          <TabsTrigger value="velocity" className="flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Velocity Tracker
          </TabsTrigger>
          <TabsTrigger value="coverage" className="flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Coverage Monitor
          </TabsTrigger>
          <TabsTrigger value="orchestration" className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Orchestration V2
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-6">
          <SentimentDashboard />
        </TabsContent>

        <TabsContent value="history" className="space-y-6">
          <SentimentHistoryViewer />
        </TabsContent>

        <TabsContent value="velocity" className="space-y-6">
          <SentimentVelocityTracker symbols={sampleSymbols} />
        </TabsContent>

        <TabsContent value="coverage" className="space-y-6">
          <SentimentCoverageMonitor 
            dataSourcesStatus={sampleDataSources}
            tickerCoverage={tickerCoverage}
          />
        </TabsContent>

        <TabsContent value="orchestration" className="space-y-6">
          <SentimentOrchestrationDashboard />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SentimentDashboardPage;