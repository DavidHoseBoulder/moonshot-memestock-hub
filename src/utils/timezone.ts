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

// Check if today is a trading day (weekday + not holiday)
export const isTradingDay = async (): Promise<boolean> => {
  try {
    const { data, error } = await supabase.rpc('is_market_open' as any, {
      ts: new Date().toISOString()
    });
    
    if (error) {
      console.error('Error checking trading day:', error);
      return false;
    }
    
    return Boolean(data);
  } catch (error) {
    console.error('Error calling is_market_open:', error);
    return false;
  }
};

// Check if the US stock market is currently open (trading day + trading hours)
export const isMarketOpen = async (): Promise<boolean> => {
  try {
    // First check if it's a trading day (weekday + not holiday)
    const { data, error } = await supabase.rpc('is_market_open' as any, {
      ts: new Date().toISOString()
    });
    
    if (error) {
      console.error('Error checking market status:', error);
      return false;
    }
    
    // If it's not a trading day, market is closed
    if (!data) return false;
    
    // Check if we're within trading hours (9:30 AM - 4:00 PM ET)
    const now = new Date();
    const etTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const hour = etTime.getHours();
    const minute = etTime.getMinutes();
    const timeInMinutes = hour * 60 + minute;
    
    const marketOpenTime = 9 * 60 + 30; // 9:30 AM
    const marketCloseTime = 16 * 60; // 4:00 PM
    
    return timeInMinutes >= marketOpenTime && timeInMinutes < marketCloseTime;
  } catch (error) {
    console.error('Error calling is_market_open:', error);
    return false;
  }
};