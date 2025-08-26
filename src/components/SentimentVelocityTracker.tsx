import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, TrendingUp } from "lucide-react";

interface SentimentVelocityProps {
  symbols?: string[];
  refreshInterval?: number;
}

export const SentimentVelocityTracker: React.FC<SentimentVelocityProps> = () => {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Sentiment Velocity Tracker</h1>
          <p className="text-muted-foreground">
            Coming soon — requires intraday Reddit pipeline
          </p>
        </div>
        <Badge className="bg-gradient-primary text-primary-foreground">
          Reddit-only MVP
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Intraday Sentiment Tracking
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-12">
          <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-8 max-w-md mx-auto">
            <TrendingUp className="w-16 h-16 text-blue-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-blue-900 dark:text-blue-100 mb-3">
              Coming Soon
            </h3>
            <p className="text-blue-700 dark:text-blue-300 mb-4">
              This page will show 1h/6h/24h sentiment deltas once intraday ingestion is enabled.
            </p>
            <p className="text-blue-600 dark:text-blue-400 text-sm">
              Currently our Reddit pipeline runs daily, so velocity tracking will be available 
              when we implement intraday data collection.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SentimentVelocityTracker;