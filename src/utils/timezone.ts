/**
 * Timezone utilities for consistent date handling across the app
 * All "today" dates use America/Denver timezone
 */

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

// Check if the US stock market is currently open
export const isMarketOpen = (): boolean => {
  const now = new Date();
  
  // Get current time in ET (market timezone)
  const etTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = etTime.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const hour = etTime.getHours();
  const minute = etTime.getMinutes();
  const timeInMinutes = hour * 60 + minute;
  
  // Market is closed on weekends
  if (day === 0 || day === 6) {
    return false;
  }
  
  // Market hours: 9:30 AM to 4:00 PM ET (570 minutes to 960 minutes from midnight)
  const marketOpen = 9 * 60 + 30; // 9:30 AM
  const marketClose = 16 * 60; // 4:00 PM
  
  return timeInMinutes >= marketOpen && timeInMinutes < marketClose;
};