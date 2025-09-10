/**
 * Timezone utilities for consistent date handling across the app
 * All "today" dates use America/Denver timezone
 */

import { supabase } from '@/integrations/supabase/client';

// Today's date in America/Denver (yyyy-MM-dd format)
export const todayInDenverDateString = (): string => {
  const now = new Date();
  const denverNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Denver' }));
  const y = denverNow.getFullYear();
  const m = String(denverNow.getMonth() + 1).padStart(2, '0');
  const d = String(denverNow.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// Format date for display using Denver timezone
export const formatDateInDenver = (dateString: string): string => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    timeZone: 'America/Denver',
    month: 'short', 
    day: 'numeric', 
    year: '2-digit' 
  });
};

// Format full date display using Denver timezone
export const formatFullDateInDenver = (dateString: string): string => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    timeZone: 'America/Denver',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

// Check if the US stock market is currently open using Supabase function
export const isMarketOpen = async (): Promise<boolean> => {
  try {
    const { data, error } = await supabase.rpc('is_market_open' as any, {
      ts: new Date().toISOString()
    });
    
    if (error) {
      console.error('Error checking market status:', error);
      return false;
    }
    
    return Boolean(data);
  } catch (error) {
    console.error('Error calling is_market_open:', error);
    return false;
  }
};