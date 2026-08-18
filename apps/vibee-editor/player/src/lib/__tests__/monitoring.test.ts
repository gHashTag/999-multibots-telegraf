import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MonitoringService } from '../monitoring';

describe('MonitoringService', () => {
  beforeEach(() => {
    MonitoringService.reset();
    vi.clearAllMocks();
  });

  describe('trackGeneration', () => {
    it('should track successful generation', () => {
      MonitoringService.trackGeneration({
        success: true,
        duration: 5000,
        cached: false,
        niche: 'tech',
        style: 'educational',
        duration_seconds: 60,
      });

      const metrics = MonitoringService.getMetrics();
      expect(metrics.totalGenerations).toBe(1);
      expect(metrics.successfulGenerations).toBe(1);
      expect(metrics.failedGenerations).toBe(0);
    });

    it('should track failed generation', () => {
      MonitoringService.trackGeneration({
        success: false,
        duration: 3000,
        cached: false,
        niche: 'tech',
        style: 'educational',
        duration_seconds: 60,
      });

      const metrics = MonitoringService.getMetrics();
      expect(metrics.totalGenerations).toBe(1);
      expect(metrics.successfulGenerations).toBe(0);
      expect(metrics.failedGenerations).toBe(1);
    });

    it('should track cache hits', () => {
      MonitoringService.trackGeneration({
        success: true,
        duration: 100,
        cached: true,
        niche: 'tech',
        style: 'educational',
        duration_seconds: 60,
      });

      const metrics = MonitoringService.getMetrics();
      expect(metrics.cacheHits).toBe(1);
    });

    it('should calculate average duration correctly', () => {
      MonitoringService.trackGeneration({
        success: true,
        duration: 4000,
        cached: false,
        niche: 'tech',
        style: 'educational',
        duration_seconds: 60,
      });

      MonitoringService.trackGeneration({
        success: true,
        duration: 6000,
        cached: false,
        niche: 'tech',
        style: 'educational',
        duration_seconds: 60,
      });

      const metrics = MonitoringService.getMetrics();
      expect(metrics.averageDuration).toBe(5000);
    });

    it('should track multiple generations', () => {
      for (let i = 0; i < 10; i++) {
        MonitoringService.trackGeneration({
          success: i < 8, // 8 successes, 2 failures
          duration: 5000,
          cached: i < 3, // 3 cache hits
          niche: 'tech',
          style: 'educational',
          duration_seconds: 60,
        });
      }

      const metrics = MonitoringService.getMetrics();
      expect(metrics.totalGenerations).toBe(10);
      expect(metrics.successfulGenerations).toBe(8);
      expect(metrics.failedGenerations).toBe(2);
      expect(metrics.cacheHits).toBe(3);
    });
  });

  describe('getSuccessRate', () => {
    it('should return 0 for no generations', () => {
      expect(MonitoringService.getSuccessRate()).toBe(0);
    });

    it('should calculate success rate correctly', () => {
      // 7 successes out of 10
      for (let i = 0; i < 10; i++) {
        MonitoringService.trackGeneration({
          success: i < 7,
          duration: 5000,
          cached: false,
          niche: 'tech',
          style: 'educational',
          duration_seconds: 60,
        });
      }

      expect(MonitoringService.getSuccessRate()).toBe(0.7);
    });

    it('should return 1.0 for all successes', () => {
      for (let i = 0; i < 5; i++) {
        MonitoringService.trackGeneration({
          success: true,
          duration: 5000,
          cached: false,
          niche: 'tech',
          style: 'educational',
          duration_seconds: 60,
        });
      }

      expect(MonitoringService.getSuccessRate()).toBe(1.0);
    });
  });

  describe('getCacheHitRate', () => {
    it('should return 0 for no generations', () => {
      expect(MonitoringService.getCacheHitRate()).toBe(0);
    });

    it('should calculate cache hit rate correctly', () => {
      // 3 cache hits out of 10
      for (let i = 0; i < 10; i++) {
        MonitoringService.trackGeneration({
          success: true,
          duration: 5000,
          cached: i < 3,
          niche: 'tech',
          style: 'educational',
          duration_seconds: 60,
        });
      }

      expect(MonitoringService.getCacheHitRate()).toBe(0.3);
    });
  });

  describe('getMetrics', () => {
    it('should return all metrics', () => {
      MonitoringService.trackGeneration({
        success: true,
        duration: 5000,
        cached: false,
        niche: 'tech',
        style: 'educational',
        duration_seconds: 60,
      });

      const metrics = MonitoringService.getMetrics();
      
      expect(metrics).toHaveProperty('totalGenerations');
      expect(metrics).toHaveProperty('successfulGenerations');
      expect(metrics).toHaveProperty('failedGenerations');
      expect(metrics).toHaveProperty('cacheHits');
      expect(metrics).toHaveProperty('averageDuration');
      expect(metrics).toHaveProperty('successRate');
      expect(metrics).toHaveProperty('cacheHitRate');
    });

    it('should include calculated rates', () => {
      for (let i = 0; i < 10; i++) {
        MonitoringService.trackGeneration({
          success: i < 8,
          duration: 5000,
          cached: i < 4,
          niche: 'tech',
          style: 'educational',
          duration_seconds: 60,
        });
      }

      const metrics = MonitoringService.getMetrics();
      expect(metrics.successRate).toBe(0.8);
      expect(metrics.cacheHitRate).toBe(0.4);
    });
  });

  describe('reset', () => {
    it('should reset all metrics to zero', () => {
      for (let i = 0; i < 5; i++) {
        MonitoringService.trackGeneration({
          success: true,
          duration: 5000,
          cached: false,
          niche: 'tech',
          style: 'educational',
          duration_seconds: 60,
        });
      }

      MonitoringService.reset();

      const metrics = MonitoringService.getMetrics();
      expect(metrics.totalGenerations).toBe(0);
      expect(metrics.successfulGenerations).toBe(0);
      expect(metrics.failedGenerations).toBe(0);
      expect(metrics.cacheHits).toBe(0);
      expect(metrics.averageDuration).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle zero duration', () => {
      MonitoringService.trackGeneration({
        success: true,
        duration: 0,
        cached: true,
        niche: 'tech',
        style: 'educational',
        duration_seconds: 60,
      });

      const metrics = MonitoringService.getMetrics();
      expect(metrics.averageDuration).toBe(0);
    });

    it('should handle very large durations', () => {
      MonitoringService.trackGeneration({
        success: true,
        duration: 999999,
        cached: false,
        niche: 'tech',
        style: 'educational',
        duration_seconds: 60,
      });

      const metrics = MonitoringService.getMetrics();
      expect(metrics.averageDuration).toBe(999999);
    });

    it('should handle mixed success/failure patterns', () => {
      const pattern = [true, false, true, true, false, true];
      
      pattern.forEach(success => {
        MonitoringService.trackGeneration({
          success,
          duration: 5000,
          cached: false,
          niche: 'tech',
          style: 'educational',
          duration_seconds: 60,
        });
      });

      const metrics = MonitoringService.getMetrics();
      expect(metrics.totalGenerations).toBe(6);
      expect(metrics.successfulGenerations).toBe(4);
      expect(metrics.failedGenerations).toBe(2);
      expect(metrics.successRate).toBeCloseTo(0.667, 2);
    });
  });
});
