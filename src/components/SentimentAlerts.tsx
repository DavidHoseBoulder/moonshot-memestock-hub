import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, X, TrendingUp, TrendingDown, Zap, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Alert {
  id: string;
  type: 'sentiment_spike' | 'viral_detected' | 'influencer_mention' | 'mood_shift';
  symbol: string;
  message: string;
  timestamp: Date;
  severity: 'high' | 'medium' | 'low';
  actionable: boolean;
}

// Remove mock alerts - will fetch real alerts from database

const SentimentAlerts = () => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [newAlert, setNewAlert] = useState<Alert | null>(null);

  // Simulate real-time alerts
  useEffect(() => {
    const interval = setInterval(() => {
      const symbols = ['DOGE', 'GME', 'AMC', 'SHIB', 'PEPE'];
      const messages = [
        'Sentiment momentum building - RSI oversold',
        'Whale activity detected - large buy orders',
        'Reddit mentions spiking +134%',
        'Discord community buzz increasing',
        'Twitter influencer retweeted by 50K+ followers'
      ];
      
      // Check for real alerts based on actual sentiment data
      // This would integrate with real sentiment monitoring system
      // For now, no random alerts are generated
    }, 15000); // Every 15 seconds

    return () => clearInterval(interval);
  }, []);

  // Clear new alert indicator after 3 seconds
  useEffect(() => {
    if (newAlert) {
      const timeout = setTimeout(() => setNewAlert(null), 3000);
      return () => clearTimeout(timeout);
    }
  }, [newAlert]);

  const removeAlert = (id: string) => {
    setAlerts(prev => prev.filter(alert => alert.id !== id));
  };

  const getAlertIcon = (type: Alert['type']) => {
    switch (type) {
      case 'sentiment_spike': return <TrendingUp className="w-4 h-4" />;
      case 'viral_detected': return <Zap className="w-4 h-4" />;
      case 'influencer_mention': return <MessageCircle className="w-4 h-4" />;
      case 'mood_shift': return <TrendingDown className="w-4 h-4" />;
    }
  };

  const getSeverityColor = (severity: Alert['severity']) => {
    switch (severity) {
      case 'high': return 'bg-destructive/10 border-destructive/30 text-destructive';
      case 'medium': return 'bg-accent/10 border-accent/30 text-accent';
      case 'low': return 'bg-muted/10 border-border text-muted-foreground';
    }
  };

  const formatTimeAgo = (timestamp: Date) => {
    const minutes = Math.floor((Date.now() - timestamp.getTime()) / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes === 1) return '1m ago';
    return `${minutes}m ago`;
  };

  return (
    <Card className="p-4 bg-gradient-card border-border">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-lg flex items-center">
          <Bell className="w-5 h-5 mr-2 text-primary" />
          Sentiment Alerts
          {newAlert && (
            <span className="ml-2 w-2 h-2 bg-success rounded-full animate-pulse"></span>
          )}
        </h3>
        <Badge variant="outline" className="text-xs">
          {alerts.length} Active
        </Badge>
      </div>

      <div className="space-y-3 max-h-96 overflow-y-auto">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className={`p-3 rounded-lg border transition-all duration-300 ${getSeverityColor(alert.severity)} ${
              alert.id === newAlert?.id ? 'animate-pulse' : ''
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 mt-0.5">
                  {getAlertIcon(alert.type)}
                </div>
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <Badge variant="outline" className="text-xs">
                      {alert.symbol}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatTimeAgo(alert.timestamp)}
                    </span>
                  </div>
                  <p className="text-sm font-medium">{alert.message}</p>
                  {alert.actionable && (
                    <div className="flex space-x-2 mt-2">
                      <Button size="sm" className="text-xs h-6 bg-gradient-success">
                        Buy Signal
                      </Button>
                      <Button size="sm" variant="outline" className="text-xs h-6">
                        View Details
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => removeAlert(alert.id)}
                className="p-1 h-6 w-6"
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {alerts.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No active alerts</p>
          <p className="text-xs">AI is monitoring social sentiment...</p>
        </div>
      )}
    </Card>
  );
};

export default SentimentAlerts;