// Utility functions for calculating technical indicators from price data

/**
 * Calculate RSI (Relative Strength Index) from price data
 * @param prices Array of closing prices (most recent last)
 * @param period Period for RSI calculation (default 14)
 * @returns RSI value (0-100)
 */
export function calculateRSI(prices: number[], period: number = 14): number | null {
  if (!prices || prices.length < period + 1) {
    return null;
  }

  const gains: number[] = [];
  const losses: number[] = [];

  // Calculate price changes
  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }

  if (gains.length < period) {
    return null;
  }

  // Calculate initial average gain and loss
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  // Apply smoothing for remaining periods
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
  }

  if (avgLoss === 0) {
    return 100; // No losses means RSI = 100
  }

  const rs = avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));

  return Math.round(rsi * 100) / 100; // Round to 2 decimal places
}

/**
 * Calculate Simple Moving Average
 * @param prices Array of prices
 * @param period Number of periods
 * @returns SMA value
 */
export function calculateSMA(prices: number[], period: number): number | null {
  if (!prices || prices.length < period) {
    return null;
  }

  const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
  return sum / period;
}

/**
 * Calculate momentum (price change over period)
 * @param prices Array of prices
 * @param period Period to look back
 * @returns Momentum as percentage change
 */
export function calculateMomentum(prices: number[], period: number = 10): number | null {
  if (!prices || prices.length < period + 1) {
    return null;
  }

  const currentPrice = prices[prices.length - 1];
  const pastPrice = prices[prices.length - 1 - period];
  
  if (pastPrice === 0) return null;
  
  return ((currentPrice - pastPrice) / pastPrice) * 100;
}

/**
 * Calculate volatility (standard deviation of returns)
 * @param prices Array of prices
 * @param period Period for calculation
 * @returns Volatility percentage
 */
export function calculateVolatility(prices: number[], period: number = 20): number | null {
  if (!prices || prices.length < period + 1) {
    return null;
  }

  const returns: number[] = [];
  for (let i = 1; i <= period; i++) {
    const currentPrice = prices[prices.length - i];
    const previousPrice = prices[prices.length - i - 1];
    
    if (previousPrice !== 0) {
      returns.push((currentPrice - previousPrice) / previousPrice);
    }
  }

  if (returns.length === 0) return null;

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
  
  return Math.sqrt(variance) * 100; // Convert to percentage
}

/**
 * Estimate RSI from momentum when price history is not available
 * @param momentum Current momentum value
 * @param volatility Current volatility
 * @returns Estimated RSI value
 */
export function estimateRSIFromMomentum(momentum: number, volatility: number = 2): number {
  // Normalize momentum to RSI scale
  // Positive momentum suggests RSI > 50, negative suggests RSI < 50
  
  let estimatedRSI = 50; // Start neutral
  
  // Add momentum impact (scaled by volatility)
  const momentumImpact = (momentum / volatility) * 10;
  estimatedRSI += momentumImpact;
  
  // Apply bounds and smoothing
  estimatedRSI = Math.max(10, Math.min(90, estimatedRSI));
  
  return Math.round(estimatedRSI * 100) / 100;
}