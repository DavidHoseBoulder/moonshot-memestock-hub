import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertTriangle, XCircle, Clock } from "lucide-react";

interface DataSourceIndicatorProps {
  source: string;
  status: 'live' | 'cached' | 'unavailable' | 'fallback';
  lastUpdate?: Date;
  className?: string;
}

const DataSourceIndicator = ({ source, status, lastUpdate, className = "" }: DataSourceIndicatorProps) => {
  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'live':
        return {
          icon: CheckCircle,
          variant: 'default' as const,
          color: 'text-green-500',
          label: 'Live'
        };
      case 'cached':
        return {
          icon: Clock,
          variant: 'secondary' as const,
          color: 'text-yellow-500',
          label: 'Cached'
        };
      case 'unavailable':
        return {
          icon: XCircle,
          variant: 'destructive' as const,
          color: 'text-red-500',
          label: 'Unavailable'
        };
      case 'fallback':
        return {
          icon: AlertTriangle,
          variant: 'outline' as const,
          color: 'text-orange-500',
          label: 'Fallback'
        };
      default:
        return {
          icon: XCircle,
          variant: 'outline' as const,
          color: 'text-gray-500',
          label: 'Unknown'
        };
    }
  };

  const config = getStatusConfig(status);
  const Icon = config.icon;

  const formatLastUpdate = (date?: Date) => {
    if (!date) return '';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="text-sm font-medium">{source}</span>
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className={`w-3 h-3 ${config.color}`} />
        {config.label}
      </Badge>
      {lastUpdate && status !== 'unavailable' && (
        <span className="text-xs text-muted-foreground">
          {formatLastUpdate(lastUpdate)}
        </span>
      )}
    </div>
  );
};

export default DataSourceIndicator;