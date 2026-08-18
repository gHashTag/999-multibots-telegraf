import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RateLimiter } from '../rateLimiter';

describe('RateLimiter', () => {
  beforeEach(() => {
    RateLimiter.clear();
    vi.clearAllMocks();
  });

  describe('checkLimit', () => {
    it('should allow requests within limit', () => {
      const key = 'test-key';
      const maxRequests = 5;
      const windowMs = 60000; // 1 minute

      for (let i = 0; i < maxRequests; i++) {
        const allowed = RateLimiter.checkLimit(key, maxRequests, windowMs);
        expect(allowed).toBe(true);
      }
    });

    it('should block requests exceeding limit', () => {
      const key = 'test-key';
      const maxRequests = 3;
      const windowMs = 60000;

      // Make 3 allowed requests
      for (let i = 0; i < maxRequests; i++) {
        expect(RateLimiter.checkLimit(key, maxRequests, windowMs)).toBe(true);
      }

      // 4th request should be blocked
      expect(RateLimiter.checkLimit(key, maxRequests, windowMs)).toBe(false);
    });

    it('should allow requests after window expires', () => {
      const key = 'test-key';
      const maxRequests = 2;
      const windowMs = 1000; // 1 second

      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);

      // Make 2 requests
      expect(RateLimiter.checkLimit(key, maxRequests, windowMs)).toBe(true);
      expect(RateLimiter.checkLimit(key, maxRequests, windowMs)).toBe(true);

      // 3rd request blocked
      expect(RateLimiter.checkLimit(key, maxRequests, windowMs)).toBe(false);

      // Advance time past window
      vi.spyOn(Date, 'now').mockReturnValue(now + windowMs + 100);

      // Should allow new requests
      expect(RateLimiter.checkLimit(key, maxRequests, windowMs)).toBe(true);
    });

    it('should track different keys independently', () => {
      const maxRequests = 2;
      const windowMs = 60000;

      // Key 1: make 2 requests
      expect(RateLimiter.checkLimit('key1', maxRequests, windowMs)).toBe(true);
      expect(RateLimiter.checkLimit('key1', maxRequests, windowMs)).toBe(true);
      expect(RateLimiter.checkLimit('key1', maxRequests, windowMs)).toBe(false);

      // Key 2: should still allow requests
      expect(RateLimiter.checkLimit('key2', maxRequests, windowMs)).toBe(true);
      expect(RateLimiter.checkLimit('key2', maxRequests, windowMs)).toBe(true);
      expect(RateLimiter.checkLimit('key2', maxRequests, windowMs)).toBe(false);
    });

    it('should handle sliding window correctly', () => {
      const key = 'test-key';
      const maxRequests = 3;
      const windowMs = 5000; // 5 seconds

      let now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);

      // t=0: 3 requests
      expect(RateLimiter.checkLimit(key, maxRequests, windowMs)).toBe(true);
      expect(RateLimiter.checkLimit(key, maxRequests, windowMs)).toBe(true);
      expect(RateLimiter.checkLimit(key, maxRequests, windowMs)).toBe(true);
      expect(RateLimiter.checkLimit(key, maxRequests, windowMs)).toBe(false);

      // t=3s: still blocked (3 requests in last 5s)
      now += 3000;
      vi.spyOn(Date, 'now').mockReturnValue(now);
      expect(RateLimiter.checkLimit(key, maxRequests, windowMs)).toBe(false);

      // t=6s: first request expired, should allow 1 more
      now += 3000;
      vi.spyOn(Date, 'now').mockReturnValue(now);
      expect(RateLimiter.checkLimit(key, maxRequests, windowMs)).toBe(true);
    });
  });

  describe('getRemainingRequests', () => {
    it('should return correct remaining count', () => {
      const key = 'test-key';
      const maxRequests = 5;
      const windowMs = 60000;

      expect(RateLimiter.getRemainingRequests(key, maxRequests, windowMs)).toBe(5);

      RateLimiter.checkLimit(key, maxRequests, windowMs);
      expect(RateLimiter.getRemainingRequests(key, maxRequests, windowMs)).toBe(4);

      RateLimiter.checkLimit(key, maxRequests, windowMs);
      expect(RateLimiter.getRemainingRequests(key, maxRequests, windowMs)).toBe(3);
    });

    it('should return 0 when limit exceeded', () => {
      const key = 'test-key';
      const maxRequests = 2;
      const windowMs = 60000;

      RateLimiter.checkLimit(key, maxRequests, windowMs);
      RateLimiter.checkLimit(key, maxRequests, windowMs);

      expect(RateLimiter.getRemainingRequests(key, maxRequests, windowMs)).toBe(0);
    });
  });

  describe('clear', () => {
    it('should clear all rate limit data', () => {
      const maxRequests = 2;
      const windowMs = 60000;

      RateLimiter.checkLimit('key1', maxRequests, windowMs);
      RateLimiter.checkLimit('key2', maxRequests, windowMs);

      RateLimiter.clear();

      // Should allow requests again
      expect(RateLimiter.checkLimit('key1', maxRequests, windowMs)).toBe(true);
      expect(RateLimiter.checkLimit('key2', maxRequests, windowMs)).toBe(true);
    });
  });

  describe('clearKey', () => {
    it('should clear specific key only', () => {
      const maxRequests = 2;
      const windowMs = 60000;

      RateLimiter.checkLimit('key1', maxRequests, windowMs);
      RateLimiter.checkLimit('key1', maxRequests, windowMs);
      RateLimiter.checkLimit('key2', maxRequests, windowMs);

      RateLimiter.clearKey('key1');

      // key1 should be reset
      expect(RateLimiter.getRemainingRequests('key1', maxRequests, windowMs)).toBe(2);
      
      // key2 should still have 1 request used
      expect(RateLimiter.getRemainingRequests('key2', maxRequests, windowMs)).toBe(1);
    });
  });
});
