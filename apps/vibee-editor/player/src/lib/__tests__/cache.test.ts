import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CacheService } from '../cache';

describe('CacheService', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('set and get', () => {
    it('should store and retrieve data', () => {
      const key = 'test-key';
      const data = { foo: 'bar', num: 42 };

      CacheService.set(key, data);
      const result = CacheService.get(key);

      expect(result).toEqual(data);
    });

    it('should return null for non-existent key', () => {
      const result = CacheService.get('non-existent');
      expect(result).toBeNull();
    });

    it('should return null for expired data', () => {
      const key = 'expired-key';
      const data = { test: 'data' };

      // Mock Date.now to simulate time passing
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValueOnce(now);
      
      CacheService.set(key, data);

      // Simulate 25 hours passing (TTL is 24 hours)
      vi.spyOn(Date, 'now').mockReturnValueOnce(now + 25 * 60 * 60 * 1000);

      const result = CacheService.get(key);
      expect(result).toBeNull();
    });

    it('should not return expired data within TTL', () => {
      const key = 'valid-key';
      const data = { test: 'data' };

      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValueOnce(now);
      
      CacheService.set(key, data);

      // Simulate 23 hours passing (within 24h TTL)
      vi.spyOn(Date, 'now').mockReturnValueOnce(now + 23 * 60 * 60 * 1000);

      const result = CacheService.get(key);
      expect(result).toEqual(data);
    });
  });

  describe('delete', () => {
    it('should delete cached data', () => {
      const key = 'delete-key';
      const data = { test: 'data' };

      CacheService.set(key, data);
      expect(CacheService.get(key)).toEqual(data);

      CacheService.delete(key);
      expect(CacheService.get(key)).toBeNull();
    });
  });

  describe('clear', () => {
    it('should clear all cached data with prefix', () => {
      CacheService.set('key1', { a: 1 });
      CacheService.set('key2', { b: 2 });
      localStorage.setItem('other-key', 'should-remain');

      CacheService.clear();

      expect(CacheService.get('key1')).toBeNull();
      expect(CacheService.get('key2')).toBeNull();
      expect(localStorage.getItem('other-key')).toBe('should-remain');
    });
  });

  describe('generateKey', () => {
    it('should generate consistent keys for same params', () => {
      const params = {
        topic: 'AI',
        duration: 60,
        language: 'ru' as const,
        niche: 'tech',
        style: 'educational' as const,
      };

      const key1 = CacheService.generateKey(params);
      const key2 = CacheService.generateKey(params);

      expect(key1).toBe(key2);
    });

    it('should generate different keys for different params', () => {
      const params1 = {
        topic: 'AI',
        duration: 60,
        language: 'ru' as const,
        niche: 'tech',
        style: 'educational' as const,
      };

      const params2 = {
        ...params1,
        topic: 'ML',
      };

      const key1 = CacheService.generateKey(params1);
      const key2 = CacheService.generateKey(params2);

      expect(key1).not.toBe(key2);
    });
  });

  describe('has', () => {
    it('should return true for existing key', () => {
      const key = 'exists';
      CacheService.set(key, { data: 'test' });

      expect(CacheService.has(key)).toBe(true);
    });

    it('should return false for non-existent key', () => {
      expect(CacheService.has('non-existent')).toBe(false);
    });

    it('should return false for expired key', () => {
      const key = 'expired';
      const now = Date.now();
      
      vi.spyOn(Date, 'now').mockReturnValueOnce(now);
      CacheService.set(key, { data: 'test' });

      vi.spyOn(Date, 'now').mockReturnValueOnce(now + 25 * 60 * 60 * 1000);

      expect(CacheService.has(key)).toBe(false);
    });
  });
});
