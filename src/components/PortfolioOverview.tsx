import { Card } from "@/components/ui/card";
import { TrendingUp, DollarSign, PieChart, Target } from "lucide-react";

const PortfolioOverview = () => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <Card className="p-4 bg-gradient-card border-border">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Total Value</p>
            <p className="text-2xl font-bold text-success">$69,420.69</p>
            <p className="text-xs text-success">+$4,206.90 (6.45%) today</p>
          </div>
          <div className="w-12 h-12 bg-success/20 rounded-lg flex items-center justify-center">
            <DollarSign className="w-6 h-6 text-success" />
          </div>
        </div>
      </Card>

      <Card className="p-4 bg-gradient-card border-border">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Day's Change</p>
            <p className="text-2xl font-bold text-success">+$1,337.42</p>
            <p className="text-xs text-success">+2.08% since yesterday</p>
          </div>
          <div className="w-12 h-12 bg-success/20 rounded-lg flex items-center justify-center">
            <TrendingUp className="w-6 h-6 text-success" />
          </div>
        </div>
      </Card>

      <Card className="p-4 bg-gradient-card border-border">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Holdings</p>
            <p className="text-2xl font-bold text-foreground">12 Assets</p>
            <p className="text-xs text-muted-foreground">8 stocks, 4 crypto</p>
          </div>
          <div className="w-12 h-12 bg-primary/20 rounded-lg flex items-center justify-center">
            <PieChart className="w-6 h-6 text-primary" />
          </div>
        </div>
      </Card>

      <Card className="p-4 bg-gradient-card border-border">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Best Performer</p>
            <p className="text-2xl font-bold text-success">DOGE</p>
            <p className="text-xs text-success">+420% this month</p>
          </div>
          <div className="w-12 h-12 bg-accent/20 rounded-lg flex items-center justify-center">
            <Target className="w-6 h-6 text-accent" />
          </div>
        </div>
      </Card>
    </div>
  );
};

export default PortfolioOverview;