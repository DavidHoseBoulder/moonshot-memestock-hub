import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown } from "lucide-react";

interface StockCardProps {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: string;
  marketCap: string;
  trending?: boolean;
}

const StockCard = ({ 
  symbol, 
  name, 
  price, 
  change, 
  changePercent, 
  volume, 
  marketCap,
  trending = false 
}: StockCardProps) => {
  const isPositive = change >= 0;
  
  return (
    <Card className="p-4 bg-gradient-card border-border hover:border-primary/50 transition-all duration-300 hover:shadow-glow/20 relative overflow-hidden">
      {trending && (
        <div className="absolute top-2 right-2">
          <div className="bg-accent/20 text-accent text-xs px-2 py-1 rounded-full flex items-center">
            🚀 Trending
          </div>
        </div>
      )}
      
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-bold text-lg text-foreground">{symbol}</h3>
          <p className="text-sm text-muted-foreground truncate max-w-[150px]">{name}</p>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold text-foreground">${price.toFixed(2)}</div>
          <div className={`flex items-center text-sm ${isPositive ? 'text-success' : 'text-destructive'}`}>
            {isPositive ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
            {isPositive ? '+' : ''}${change.toFixed(2)} ({isPositive ? '+' : ''}{changePercent.toFixed(2)}%)
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground mb-3">
        <div>
          <span className="block">Volume</span>
          <span className="text-foreground font-medium">{volume}</span>
        </div>
        <div>
          <span className="block">Market Cap</span>
          <span className="text-foreground font-medium">{marketCap}</span>
        </div>
      </div>

      <div className="flex space-x-2">
        <Button 
          size="sm" 
          className="flex-1 bg-gradient-success hover:shadow-success/50 transition-all duration-300"
        >
          Buy
        </Button>
        <Button 
          size="sm" 
          variant="outline" 
          className="flex-1 border-destructive/50 text-destructive hover:bg-destructive/10"
        >
          Sell
        </Button>
      </div>
    </Card>
  );
};

export default StockCard;