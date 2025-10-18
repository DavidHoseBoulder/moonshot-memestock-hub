import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, Newspaper, TrendingUp, ExternalLink, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, addDays, startOfDay } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';

interface CatalystEvent {
  symbol: string;
  event_type: 'NEWS' | 'EARNINGS';
  event_date: string;
  headline?: string;
  publisher?: string;
  url?: string;
  fiscal_quarter?: number;
  fiscal_year?: number;
  report_time?: string;
}

interface CatalystCalendarProps {
  symbols?: string[]; // If provided, filters to these symbols only
  daysAhead?: number; // How many days ahead to show (default: 7)
}

export const CatalystCalendar = ({ symbols, daysAhead = 7 }: CatalystCalendarProps) => {
  const [events, setEvents] = useState<CatalystEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'news' | 'earnings'>('all');

  useEffect(() => {
    const fetchUpcomingEvents = async () => {
      setIsLoading(true);
      try {
        const today = format(startOfDay(new Date()), 'yyyy-MM-dd');
        const endDate = format(addDays(new Date(), daysAhead), 'yyyy-MM-dd');

        let query = supabase
          .from('catalyst_events' as any)
          .select('symbol, event_type, event_date, headline, publisher, url, fiscal_quarter, fiscal_year, report_time')
          .gte('event_date', today)
          .lte('event_date', endDate)
          .order('event_date', { ascending: true })
          .order('symbol', { ascending: true });

        if (symbols && symbols.length > 0) {
          query = query.in('symbol', symbols);
        }

        const { data, error } = await query.limit(100);

        if (error) throw error;

        setEvents((data as any as CatalystEvent[]) || []);
      } catch (error) {
        console.error('Error fetching catalyst calendar:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUpcomingEvents();
  }, [symbols, daysAhead]);

  const filteredEvents = events.filter(event => {
    if (activeTab === 'news') return event.event_type === 'NEWS';
    if (activeTab === 'earnings') return event.event_type === 'EARNINGS';
    return true;
  });

  const groupedByDate = filteredEvents.reduce((acc, event) => {
    const date = event.event_date;
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(event);
    return acc;
  }, {} as Record<string, CatalystEvent[]>);

  const sortedDates = Object.keys(groupedByDate).sort();

  const newsCount = events.filter(e => e.event_type === 'NEWS').length;
  const earningsCount = events.filter(e => e.event_type === 'EARNINGS').length;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Catalyst Calendar (Next {daysAhead} Days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (events.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Catalyst Calendar (Next {daysAhead} Days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No upcoming catalyst events found</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Catalyst Calendar (Next {daysAhead} Days)
          </div>
          <div className="flex items-center gap-2 text-sm font-normal">
            <Badge variant="outline" className="gap-1">
              <Newspaper className="w-3 h-3" />
              {newsCount}
            </Badge>
            <Badge variant="outline" className="gap-1">
              <TrendingUp className="w-3 h-3" />
              {earningsCount}
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="all">All ({events.length})</TabsTrigger>
            <TabsTrigger value="news">News ({newsCount})</TabsTrigger>
            <TabsTrigger value="earnings">Earnings ({earningsCount})</TabsTrigger>
          </TabsList>
          
          <TabsContent value={activeTab} className="space-y-4 mt-4">
            {sortedDates.map((date) => {
              const dateEvents = groupedByDate[date];
              const dateObj = new Date(date + 'T12:00:00');
              const isToday = format(startOfDay(new Date()), 'yyyy-MM-dd') === date;
              const daysDiff = Math.round((dateObj.getTime() - startOfDay(new Date()).getTime()) / (1000 * 60 * 60 * 24));
              
              return (
                <div key={date} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between border-b pb-2">
                    <div className="font-semibold">
                      {format(dateObj, 'EEEE, MMM d, yyyy')}
                    </div>
                    <Badge variant={isToday ? 'default' : 'secondary'}>
                      {isToday ? 'Today' : daysDiff === 1 ? 'Tomorrow' : `In ${daysDiff} days`}
                    </Badge>
                  </div>
                  
                  <div className="space-y-2">
                    {dateEvents.map((event, idx) => (
                      <div 
                        key={idx} 
                        className="flex items-start gap-3 p-2 rounded hover:bg-accent/50 transition-colors"
                      >
                        {event.event_type === 'NEWS' ? (
                          <Newspaper className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-500" />
                        ) : (
                          <TrendingUp className="w-4 h-4 mt-0.5 flex-shrink-0 text-emerald-500" />
                        )}
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="font-mono text-xs">
                              {event.symbol}
                            </Badge>
                            {event.event_type === 'EARNINGS' && event.report_time && (
                              <Badge variant="secondary" className="text-xs">
                                {event.report_time.toUpperCase()}
                              </Badge>
                            )}
                          </div>
                          
                          {event.event_type === 'NEWS' && event.headline && (
                            <div className="mt-1">
                              <div className="text-sm font-medium line-clamp-2">
                                {event.headline}
                              </div>
                              {event.publisher && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  {event.publisher}
                                </div>
                              )}
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
                          )}
                          
                          {event.event_type === 'EARNINGS' && (
                            <div className="text-sm mt-1">
                              Q{event.fiscal_quarter} {event.fiscal_year} Earnings Report
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default CatalystCalendar;
