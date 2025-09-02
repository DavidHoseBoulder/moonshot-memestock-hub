import TriggeredCandidatesDashboard from "@/components/TriggeredCandidatesDashboard";
import SentimentDashboard from "@/components/SentimentDashboard";
import RedditSentimentDashboard from "@/components/RedditSentimentDashboard";
import SentimentHistoryViewer from "@/components/SentimentHistoryViewer";
import SentimentVelocityTracker from "@/components/SentimentVelocityTracker";
import SentimentCoverageMonitor from "@/components/SentimentCoverageMonitor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquare, History, Zap, Activity, Settings, BarChart3 } from "lucide-react";
import { SentimentOrchestrationDashboard } from "@/components/SentimentOrchestrationDashboard";

const SentimentDashboardPage = () => {
  // Focus on Reddit-only for MVP - sample data for future multi-source features
  const sampleDataSources = [
    {
      name: "Reddit",
      status: "active" as const,
      coverage: 100,
      lastUpdate: new Date(),
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
          <h1 className="text-3xl font-bold text-foreground">Reddit Sentiment Dashboard</h1>
          <p className="text-muted-foreground">
            Reddit-focused sentiment analysis and trading signals (MVP)
          </p>
        </div>
      </div>

      <Tabs defaultValue="triggered-candidates" className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="triggered-candidates" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Triggered Candidates
          </TabsTrigger>
          <TabsTrigger value="reddit-sentiment" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Reddit Sentiment
          </TabsTrigger>
          <TabsTrigger value="dashboard" className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Trading Dashboard
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
            Data Coverage
          </TabsTrigger>
        </TabsList>

        <TabsContent value="triggered-candidates" className="space-y-6">
          <TriggeredCandidatesDashboard />
        </TabsContent>

        <TabsContent value="reddit-sentiment" className="space-y-6">
          <RedditSentimentDashboard />
        </TabsContent>

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
          <SentimentCoverageMonitor />
        </TabsContent>

      </Tabs>
    </div>
  );
};

export default SentimentDashboardPage;