import { useSearchParams } from 'react-router-dom';
import TriggeredCandidatesDashboard from "@/components/TriggeredCandidatesDashboard";
import SentimentDashboard from "@/components/SentimentDashboard";
import RedditSentimentDashboard from "@/components/RedditSentimentDashboard";
import RedditSentimentHomescreen from "@/components/RedditSentimentHomescreen";
import RedditSentimentAnalysis from "@/components/RedditSentimentAnalysis";
import GradeConfigAdmin from "@/components/GradeConfigAdmin";
import SentimentHistoryViewer from "@/components/SentimentHistoryViewer";
import SentimentVelocityTracker from "@/components/SentimentVelocityTracker";
import SentimentCoverageMonitor from "@/components/SentimentCoverageMonitor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquare, History, Zap, Activity, Settings, BarChart3, Home, TrendingUp } from "lucide-react";
import { SentimentOrchestrationDashboard } from "@/components/SentimentOrchestrationDashboard";

const SentimentDashboardPage = () => {
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get('tab') || 'analysis';
  
  // Sample symbols for velocity tracker  
  const sampleSymbols = ['TSLA', 'AAPL', 'NVDA', 'AMD', 'GME'];

  return (
    <div className="min-h-screen">
      <Tabs defaultValue={defaultTab} className="space-y-6">
        <div className="container mx-auto px-6 pt-6">
          <TabsList className="grid w-full grid-cols-9">
            <TabsTrigger value="analysis" className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Analysis
            </TabsTrigger>
            <TabsTrigger value="homescreen" className="flex items-center gap-2">
              <Home className="w-4 h-4" />
              Home
            </TabsTrigger>
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
            <TabsTrigger value="grade-config" className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Grade Config
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="analysis" className="space-y-6">
          <RedditSentimentAnalysis />
        </TabsContent>

        <TabsContent value="homescreen" className="space-y-6">
          <RedditSentimentHomescreen />
        </TabsContent>

        <TabsContent value="triggered-candidates" className="space-y-6">
          <div className="container mx-auto p-6">
            <TriggeredCandidatesDashboard />
          </div>
        </TabsContent>

        <TabsContent value="reddit-sentiment" className="space-y-6">
          <div className="container mx-auto p-6">
            <RedditSentimentDashboard />
          </div>
        </TabsContent>

        <TabsContent value="dashboard" className="space-y-6">
          <div className="container mx-auto p-6">
            <SentimentDashboard />
          </div>
        </TabsContent>

        <TabsContent value="history" className="space-y-6">
          <div className="container mx-auto p-6">
            <SentimentHistoryViewer />
          </div>
        </TabsContent>

        <TabsContent value="velocity" className="space-y-6">
          <div className="container mx-auto p-6">
            <SentimentVelocityTracker symbols={sampleSymbols} />
          </div>
        </TabsContent>

        <TabsContent value="coverage" className="space-y-6">
          <div className="container mx-auto p-6">
            <SentimentCoverageMonitor />
          </div>
        </TabsContent>

        <TabsContent value="grade-config" className="space-y-6">
          <div className="container mx-auto p-6">
            <GradeConfigAdmin />
          </div>
        </TabsContent>

      </Tabs>
    </div>
  );
};

export default SentimentDashboardPage;