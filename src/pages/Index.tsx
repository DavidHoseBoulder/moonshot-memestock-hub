
import { NavigationSidebar } from "@/components/Navigation";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import PortfolioOverview from "@/components/PortfolioOverview";
import TrendingSection from "@/components/TrendingSection";
import SentimentDashboard from "@/components/SentimentDashboard";
import BacktestingDashboard from "@/components/BacktestingDashboard";

const Index = () => {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <NavigationSidebar />
        <SidebarInset className="flex-1">
          <header className="h-12 flex items-center border-b px-4 bg-background">
            <SidebarTrigger />
          </header>
          <main className="max-w-7xl mx-auto p-6">
            <div className="mb-8">
              <h1 className="text-3xl font-bold mb-2 bg-gradient-primary bg-clip-text text-transparent">
                Welcome back, Diamond Hands! 💎🙌
              </h1>
              <p className="text-muted-foreground">
                Your meme portfolio is looking fire today. To the moon! 🚀
              </p>
            </div>
            
            <PortfolioOverview />
            <SentimentDashboard />
            <BacktestingDashboard />
            <TrendingSection />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default Index;
