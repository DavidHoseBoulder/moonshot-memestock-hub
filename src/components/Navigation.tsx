import { Home, TrendingUp, Wallet, Search, Star } from "lucide-react";
import { Button } from "@/components/ui/button";

const Navigation = () => {
  return (
    <nav className="flex items-center justify-between p-4 bg-card border-b border-border">
      <div className="flex items-center space-x-2">
        <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center shadow-glow">
          <TrendingUp className="w-5 h-5 text-primary-foreground" />
        </div>
        <h1 className="text-xl font-bold bg-gradient-primary bg-clip-text text-transparent">
          MemeTrader
        </h1>
      </div>
      
      <div className="flex items-center space-x-6">
        <Button variant="ghost" size="sm" className="text-foreground hover:text-primary">
          <Home className="w-4 h-4 mr-2" />
          Dashboard
        </Button>
        <Button variant="ghost" size="sm" className="text-foreground hover:text-primary">
          <Wallet className="w-4 h-4 mr-2" />
          Portfolio
        </Button>
        <Button variant="ghost" size="sm" className="text-foreground hover:text-primary">
          <Star className="w-4 h-4 mr-2" />
          Watchlist
        </Button>
        <Button variant="ghost" size="sm" className="text-foreground hover:text-primary">
          <Search className="w-4 h-4 mr-2" />
          Discover
        </Button>
      </div>

      <div className="flex items-center space-x-3">
        <div className="text-right">
          <div className="text-sm text-muted-foreground">Portfolio Value</div>
          <div className="font-semibold text-success">$69,420.69</div>
        </div>
        <div className="w-8 h-8 bg-gradient-primary rounded-full"></div>
      </div>
    </nav>
  );
};

export default Navigation;