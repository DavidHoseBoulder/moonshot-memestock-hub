import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Calendar, Newspaper, TrendingUp, ExternalLink, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

interface CatalystEvent {
  event_type: 'NEWS' | 'EARNINGS';
  event_date: string;
  headline?: string;
  publisher?: string;
  url?: string;
  fiscal_quarter?: number;
  fiscal_year?: number;
  report_time?: string;
  days_away: number;
}

interface CatalystIndicatorProps {
  symbol: string;
  referenceDate?: string; // ISO date string, defaults to today
  variant?: 'badge' | 'icon' | 'full';
  showNewsOnly?: boolean;
  showEarningsOnly?: boolean;
}

export const CatalystIndicator = ({ 
  symbol, 
  referenceDate,
  variant = 'badge',
  showNewsOnly = false,
  showEarningsOnly = false
}: CatalystIndicatorProps) => {
  const [events, setEvents] = useState<CatalystEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchNearbyEvents = async () => {
      setIsLoading(true);
      try {
        const refDate = referenceDate || format(new Date(), 'yyyy-MM-dd');
        
        let query = supabase
          .from('catalyst_events' as any)
          .select('event_type, event_date, headline, publisher, url, fiscal_quarter, fiscal_year, report_time')
          .eq('symbol', symbol)
          .gte('event_date', format(new Date(new Date(refDate).getTime() - 3 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'))
          .lte('event_date', format(new Date(new Date(refDate).getTime() + 3 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'))
          .order('event_date', { ascending: true });

        if (showNewsOnly) {
          query = query.eq('event_type', 'NEWS');
        } else if (showEarningsOnly) {
          query = query.eq('event_type', 'EARNINGS');
        }

        const { data, error } = await query;

        if (error) throw error;

        if (data) {
          const processedEvents: CatalystEvent[] = data.map((event: any) => {
            const eventDate = new Date(event.event_date + 'T12:00:00');
            const refDateTime = new Date(refDate + 'T12:00:00');
            const daysAway = Math.round((eventDate.getTime() - refDateTime.getTime()) / (1000 * 60 * 60 * 24));
            
            return {
              ...event,
              days_away: daysAway
            };
          });
          setEvents(processedEvents);
        }
      } catch (error) {
        console.error('Error fetching catalyst events:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchNearbyEvents();
  }, [symbol, referenceDate, showNewsOnly, showEarningsOnly]);

  if (isLoading) {
    return null;
  }

  if (events.length === 0) {
    return null;
  }

  const newsEvents = events.filter(e => e.event_type === 'NEWS');
  const earningsEvents = events.filter(e => e.event_type === 'EARNINGS');

  const renderEventDetails = (event: CatalystEvent) => {
    const isToday = event.days_away === 0;
    const isPast = event.days_away < 0;
    const dayText = isToday ? 'Today' : isPast ? `${Math.abs(event.days_away)}d ago` : `In ${event.days_away}d`;

    if (event.event_type === 'NEWS') {
      return (
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <Newspaper className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-500" />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">{event.headline}</div>
              {event.publisher && (
                <div className="text-xs text-muted-foreground mt-1">{event.publisher}</div>
              )}
              <div className="text-xs text-muted-foreground mt-1">
                {format(new Date(event.event_date + 'T12:00:00'), 'MMM d, yyyy')} • {dayText}
              </div>
              {event.url && (
                <a 
                  href={event.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline flex items-center gap-1 mt-1"
                >
                  Read article <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        </div>
      );
    } else {
      return (
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <TrendingUp className="w-4 h-4 mt-0.5 flex-shrink-0 text-emerald-500" />
            <div className="flex-1">
              <div className="font-medium text-sm">Q{event.fiscal_quarter} {event.fiscal_year} Earnings</div>
              {event.report_time && (
                <div className="text-xs text-muted-foreground mt-1">
                  Report: {event.report_time.toUpperCase()}
                </div>
              )}
              <div className="text-xs text-muted-foreground mt-1">
                {format(new Date(event.event_date + 'T12:00:00'), 'MMM d, yyyy')} • {dayText}
              </div>
            </div>
          </div>
        </div>
      );
    }
  };

  if (variant === 'icon') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1">
              {newsEvents.length > 0 && (
                <Badge variant="outline" className="gap-1 px-1.5 py-0.5">
                  <Newspaper className="w-3 h-3" />
                  <span className="text-xs">{newsEvents.length}</span>
                </Badge>
              )}
              {earningsEvents.length > 0 && (
                <Badge variant="outline" className="gap-1 px-1.5 py-0.5">
                  <TrendingUp className="w-3 h-3" />
                </Badge>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-sm">
            <div className="space-y-2">
              {events.map((event, idx) => (
                <div key={idx}>{renderEventDetails(event)}</div>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (variant === 'full') {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <span>Nearby Catalysts (±3 days)</span>
        </div>
        <div className="space-y-2 pl-6">
          {events.map((event, idx) => (
            <div key={idx}>{renderEventDetails(event)}</div>
          ))}
        </div>
      </div>
    );
  }

  // Default: badge variant with hover card
  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <Badge 
          variant="outline" 
          className="cursor-pointer gap-1.5 hover:bg-accent"
        >
          <Calendar className="w-3 h-3" />
          <span className="text-xs">
            {newsEvents.length > 0 && `${newsEvents.length} News`}
            {newsEvents.length > 0 && earningsEvents.length > 0 && ' • '}
            {earningsEvents.length > 0 && 'Earnings'}
          </span>
        </Badge>
      </HoverCardTrigger>
      <HoverCardContent className="w-96" side="right">
        <div className="space-y-3">
          <div className="flex items-center gap-2 border-b pb-2">
            <Calendar className="w-4 h-4" />
            <span className="font-semibold text-sm">Catalyst Events for {symbol}</span>
          </div>
          {events.map((event, idx) => (
            <div key={idx}>{renderEventDetails(event)}</div>
          ))}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};

export default CatalystIndicator;
