// Rate Limiter for client-side request throttling

export class RateLimiter {
  private static requests = new Map<string, number[]>();

  /**
   * Check if request is within rate limit
   * @param key - Unique identifier for the rate limit bucket
   * @param maxRequests - Maximum number of requests allowed
   * @param windowMs - Time window in milliseconds
   * @returns true if request is allowed, false if rate limited
   */
  static checkLimit(key: string, maxRequests: number, windowMs: number): boolean {
    const now = Date.now();
    const timestamps = this.requests.get(key) || [];

    // Remove old timestamps outside the window
    const validTimestamps = timestamps.filter(t => now - t < windowMs);

    // Check if limit exceeded
    if (validTimestamps.length >= maxRequests) {
      this.requests.set(key, validTimestamps);
      return false;
    }

    // Add new timestamp
    validTimestamps.push(now);
    this.requests.set(key, validTimestamps);
    return true;
  }

  /**
   * Get remaining requests for a key
   */
  static getRemainingRequests(key: string, maxRequests: number, windowMs: number): number {
    const now = Date.now();
    const timestamps = this.requests.get(key) || [];
    const validTimestamps = timestamps.filter(t => now - t < windowMs);
    
    return Math.max(0, maxRequests - validTimestamps.length);
  }

  /**
   * Get time until next request is allowed (in ms)
   */
  static getTimeUntilNextRequest(key: string, maxRequests: number, windowMs: number): number {
    const now = Date.now();
    const timestamps = this.requests.get(key) || [];
    const validTimestamps = timestamps.filter(t => now - t < windowMs);

    if (validTimestamps.length < maxRequests) {
      return 0;
    }

    // Find oldest timestamp
    const oldestTimestamp = Math.min(...validTimestamps);
    const timeUntilExpiry = (oldestTimestamp + windowMs) - now;

    return Math.max(0, timeUntilExpiry);
  }

  /**
   * Clear all rate limit data
   */
  static clear(): void {
    this.requests.clear();
  }

  /**
   * Clear rate limit data for specific key
   */
  static clearKey(key: string): void {
    this.requests.delete(key);
  }
}

// Debounce function
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

// Throttle function
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;

  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}
