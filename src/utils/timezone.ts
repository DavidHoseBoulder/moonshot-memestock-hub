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