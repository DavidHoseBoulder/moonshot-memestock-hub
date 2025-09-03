import { useSearchParams } from 'react-router-dom';
import { NavigationSidebar } from "@/components/Navigation";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import SentimentDashboard from "@/components/SentimentDashboard";
import RedditSentimentDashboard from "@/components/RedditSentimentDashboard";
import RedditSentimentAnalysis from "@/components/RedditSentimentAnalysis";
import GradeConfigAdmin from "@/components/GradeConfigAdmin";
import SentimentHistoryViewer from "@/components/SentimentHistoryViewer";
import SentimentVelocityTracker from "@/components/SentimentVelocityTracker";
import SentimentCoverageMonitor from "@/components/SentimentCoverageMonitor";
import RedditVelocitySpikes from "@/components/RedditVelocitySpikes";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquare, History, Zap, Activity, Settings, TrendingUp } from "lucide-react";
import { SentimentOrchestrationDashboard } from "@/components/SentimentOrchestrationDashboard";

const SentimentDashboardPage = () => {
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get('tab') || 'analysis';
  
  // Sample symbols for velocity tracker  
  const sampleSymbols = ['TSLA', 'AAPL', 'NVDA', 'AMD', 'GME'];

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <NavigationSidebar />
        <SidebarInset className="flex-1">
          <header className="h-12 flex items-center border-b px-4 bg-background">
            <SidebarTrigger />
          </header>
          <div className="flex-1">
            <Tabs defaultValue={defaultTab} className="space-y-6">
              <div className="container mx-auto px-6 pt-6">
                <TabsList className="grid w-full grid-cols-6">
                  <TabsTrigger value="analysis" className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    Analysis
                  </TabsTrigger>
                  <TabsTrigger value="reddit-sentiment" className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" />
                    Reddit Sentiment
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

              <TabsContent value="reddit-sentiment" className="space-y-6">
                <div className="container mx-auto p-6">
                  <RedditSentimentDashboard />
                </div>
              </TabsContent>


        <TabsContent value="history" className="space-y-6">
          <div className="container mx-auto p-6">
            <SentimentHistoryViewer />
          </div>
        </TabsContent>

        <TabsContent value="velocity" className="space-y-6">
          <div className="container mx-auto p-6 space-y-6">
            <RedditVelocitySpikes 
              limit={10}
              onSymbolClick={(symbol) => console.log('Clicked symbol:', symbol)}
            />
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
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default SentimentDashboardPage;