import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { NavigationSidebar } from "@/components/Navigation";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import TodaysSentiment from "@/components/TodaysSentiment";
import SentimentHistoryPage from "@/components/SentimentHistoryPage";
import GradeConfigAdmin from "@/components/GradeConfigAdmin";
import SentimentVelocityTracker from "@/components/SentimentVelocityTracker";
import SentimentCoverageMonitor from "@/components/SentimentCoverageMonitor";
import RedditVelocitySpikes from "@/components/RedditVelocitySpikes";
import SymbolSentimentHistory from "@/components/SymbolSentimentHistory";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquare, History, Zap, Activity, Settings, TrendingUp } from "lucide-react";

const SentimentDashboardPage = () => {
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get('tab') || 'sentiment';
  
  // Sample symbols for velocity tracker  
  const sampleSymbols = ['TSLA', 'AAPL', 'NVDA', 'AMD', 'GME'];
  
  // State for selected symbol - starts with a default, gets updated by spikes
  const [selectedSymbol, setSelectedSymbol] = useState('TSLA');
  
  const handleSymbolClick = (symbol: string) => {
    setSelectedSymbol(symbol);
  };

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
                <TabsList className="grid w-full grid-cols-5">
                  <TabsTrigger value="sentiment" className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    Today's Sentiment
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

              <TabsContent value="sentiment" className="space-y-6">
                <TodaysSentiment />
              </TabsContent>

              <TabsContent value="history" className="space-y-6">
                <SentimentHistoryPage />
              </TabsContent>

        <TabsContent value="velocity" className="space-y-6">
          <div className="container mx-auto p-6 space-y-6">
            <RedditVelocitySpikes 
              limit={10}
              onSymbolClick={handleSymbolClick}
            />
            <SymbolSentimentHistory 
              symbol={selectedSymbol} 
              days={30} 
              withVelocity={true} 
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