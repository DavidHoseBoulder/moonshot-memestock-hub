import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MessageSquare, TrendingUp, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SourceType = 'all' | 'reddit' | 'stocktwits';

interface SourceFilterProps {
  selected: SourceType;
  onChange: (source: SourceType) => void;
  className?: string;
}

const SourceFilter: React.FC<SourceFilterProps> = ({ selected, onChange, className }) => {
  const sources = [
    { id: 'all' as SourceType, label: 'All Sources', icon: Check },
    { id: 'reddit' as SourceType, label: 'Reddit', icon: MessageSquare, color: 'text-blue-500' },
    { id: 'stocktwits' as SourceType, label: 'StockTwits', icon: TrendingUp, color: 'text-green-500' }
  ];

  return (
    <div className={cn("flex gap-2 flex-wrap", className)}>
      {sources.map(source => {
        const Icon = source.icon;
        const isSelected = selected === source.id;
        
        return (
          <Button
            key={source.id}
            variant={isSelected ? "default" : "outline"}
            size="sm"
            onClick={() => onChange(source.id)}
            className={cn(
              "gap-2",
              !isSelected && source.color
            )}
          >
            <Icon className="w-4 h-4" />
            {source.label}
          </Button>
        );
      })}
    </div>
  );
};

export default SourceFilter;

export const getSourceIcon = (source: string) => {
  switch (source.toLowerCase()) {
    case 'reddit':
      return MessageSquare;
    case 'stocktwits':
      return TrendingUp;
    default:
      return Check;
  }
};

export const getSourceColor = (source: string) => {
  switch (source.toLowerCase()) {
    case 'reddit':
      return 'text-blue-500';
    case 'stocktwits':
      return 'text-green-500';
    default:
      return 'text-muted-foreground';
  }
};

export const getSourceBadgeColor = (source: string) => {
  switch (source.toLowerCase()) {
    case 'reddit':
      return 'bg-blue-500/10 text-blue-500 hover:bg-blue-500/20';
    case 'stocktwits':
      return 'bg-green-500/10 text-green-500 hover:bg-green-500/20';
    default:
      return '';
  }
};
