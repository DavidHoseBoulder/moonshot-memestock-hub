import Navigation from "@/components/Navigation";
import PortfolioOverview from "@/components/PortfolioOverview";
import TrendingSection from "@/components/TrendingSection";
import SentimentDashboard from "@/components/SentimentDashboard";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
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
        <TrendingSection />
      </main>
    </div>
  );
};

export default Index;
