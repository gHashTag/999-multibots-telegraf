/**
 * useQoEMetrics - Quality of Experience Metrics Tracking
 *
 * Generated from: specs/video-qoe-metrics.vibee
 * Based on: ITU-T P.1203 Quality of Experience model
 * Scientific source: Pensieve (MIT SIGCOMM 2017)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { MonitoringService } from '@/lib/monitoring';

// ============================================================================
// Types (from spec)
// ============================================================================

export interface QoESession {
  id: string;
  videoId: string;
  videoUrl: string;
  startTime: number;
  endTime: number | null;
  state: 'active' | 'paused' | 'ended';
}

export interface QoEMetrics {
  sessionId: string;
  videoId: string;
  startupTime: number;
  totalBufferingTime: number;
  bufferingEvents: number;
  rebufferRatio: number;
  avgBitrate: number;
  bitrateVariance: number;
  qualitySwitches: number;
  droppedFrames: number;
  playbackDuration: number;
  qoeScore: number;
  timestamp: number;
}

export interface BufferingEvent {
  startTime: number;
  endTime: number;
  duration: number;
  bufferLevel: number;
  networkType: string;
}

export interface BitrateSwitch {
  timestamp: number;
  fromBitrate: number;
  toBitrate: number;
  reason: 'buffer_low' | 'buffer_high' | 'user_request' | 'network_change';
}

export interface QoEConfig {
  trackStartup: boolean;
  trackBuffering: boolean;
  trackBitrate: boolean;
  exportInterval: number;
  minSessionDuration: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: QoEConfig = {
  trackStartup: true,
  trackBuffering: true,
  trackBitrate: true,
  exportInterval: 30000, // Export every 30 seconds
  minSessionDuration: 5000, // Minimum 5 seconds to count as valid session
};

// ============================================================================
// Session Storage
// ============================================================================

const activeSessions = new Map<string, QoESession>();
const sessionMetrics = new Map<string, Partial<QoEMetrics>>();
const bufferingEvents = new Map<string, BufferingEvent[]>();
const bitrateSwitches = new Map<string, BitrateSwitch[]>();

// ============================================================================
// Core Functions (from spec)
// ============================================================================

/**
 * Generate unique session ID
 */
function generateSessionId(): string {
  return `qoe-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Get network type from Navigator API
 */
function getNetworkType(): string {
  if (typeof navigator !== 'undefined' && 'connection' in navigator) {
    const conn = (navigator as any).connection;
    return conn?.effectiveType || 'unknown';
  }
  return 'unknown';
}

/**
 * Start a new QoE tracking session
 */
export function startSession(
  videoId: string,
  videoUrl: string,
  config: Partial<QoEConfig> = {}
): QoESession {
  const sessionId = generateSessionId();
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  const session: QoESession = {
    id: sessionId,
    videoId,
    videoUrl,
    startTime: performance.now(),
    endTime: null,
    state: 'active',
  };

  activeSessions.set(sessionId, session);
  sessionMetrics.set(sessionId, {
    sessionId,
    videoId,
    startupTime: 0,
    totalBufferingTime: 0,
    bufferingEvents: 0,
    rebufferRatio: 0,
    avgBitrate: 0,
    bitrateVariance: 0,
    qualitySwitches: 0,
    droppedFrames: 0,
    playbackDuration: 0,
    qoeScore: 0,
    timestamp: Date.now(),
  });
  bufferingEvents.set(sessionId, []);
  bitrateSwitches.set(sessionId, []);

  console.log('[QoE] Session started:', sessionId, videoId);
  return session;
}

/**
 * Record startup time (time to first frame)
 */
export function recordStartupTime(sessionId: string, startupTime: number): void {
  const metrics = sessionMetrics.get(sessionId);
  if (metrics) {
    metrics.startupTime = startupTime;
    console.log('[QoE] Startup time recorded:', startupTime, 'ms');
  }
}

/**
 * Record a buffering event
 */
export function recordBuffering(sessionId: string, event: BufferingEvent): void {
  const events = bufferingEvents.get(sessionId);
  const metrics = sessionMetrics.get(sessionId);

  if (events && metrics) {
    events.push(event);
    metrics.bufferingEvents = events.length;
    metrics.totalBufferingTime = events.reduce((sum, e) => sum + e.duration, 0);

    console.log('[QoE] Buffering event:', event.duration, 'ms');
  }
}

/**
 * Record a bitrate switch
 */
export function recordBitrateSwitch(sessionId: string, switchEvent: BitrateSwitch): void {
  const switches = bitrateSwitches.get(sessionId);
  const metrics = sessionMetrics.get(sessionId);

  if (switches && metrics) {
    switches.push(switchEvent);
    metrics.qualitySwitches = switches.length;

    // Calculate average bitrate
    const allBitrates = switches.map((s) => s.toBitrate);
    if (allBitrates.length > 0) {
      metrics.avgBitrate = allBitrates.reduce((a, b) => a + b, 0) / allBitrates.length;

      // Calculate variance
      const mean = metrics.avgBitrate;
      const squaredDiffs = allBitrates.map((b) => Math.pow(b - mean, 2));
      metrics.bitrateVariance = Math.sqrt(
        squaredDiffs.reduce((a, b) => a + b, 0) / allBitrates.length
      );
    }

    console.log('[QoE] Bitrate switch:', switchEvent.fromBitrate, '->', switchEvent.toBitrate);
  }
}

/**
 * Update playback duration
 */
export function updatePlaybackDuration(sessionId: string, duration: number): void {
  const metrics = sessionMetrics.get(sessionId);
  if (metrics) {
    metrics.playbackDuration = duration;

    // Calculate rebuffer ratio
    if (duration > 0 && metrics.totalBufferingTime !== undefined) {
      metrics.rebufferRatio = metrics.totalBufferingTime / duration;
    }
  }
}

/**
 * Record dropped frames
 */
export function recordDroppedFrames(sessionId: string, count: number): void {
  const metrics = sessionMetrics.get(sessionId);
  if (metrics) {
    metrics.droppedFrames = count;
  }
}

/**
 * Calculate ITU-T P.1203 QoE Score (1-5 scale)
 *
 * Factors:
 * - Startup time penalty: Max 0.5 points for >2s startup
 * - Rebuffer penalty: Max 2 points for high rebuffer ratio
 * - Quality switch penalty: Max 0.5 points for frequent switches
 * - Bitrate factor: Bonus for high bitrate
 */
export function calculateQoEScore(metrics: Partial<QoEMetrics>): number {
  const startupTime = metrics.startupTime || 0;
  const rebufferRatio = metrics.rebufferRatio || 0;
  const qualitySwitches = metrics.qualitySwitches || 0;
  const avgBitrate = metrics.avgBitrate || 2000; // Default 2 Mbps

  // Startup penalty: 0-0.5 points (2s = 0, 4s+ = 0.5)
  const startupPenalty = Math.min((startupTime / 1000 - 2) * 0.25, 0.5);

  // Rebuffer penalty: 0-2 points (0% = 0, 10%+ = 2)
  const bufferPenalty = Math.min(rebufferRatio * 20, 2);

  // Quality switch penalty: 0-0.5 points (0 = 0, 10+ = 0.5)
  const switchPenalty = Math.min(qualitySwitches / 20, 0.5);

  // Bitrate bonus: 0-0.5 points (1Mbps = 0, 5Mbps+ = 0.5)
  const bitrateFactor = Math.min((avgBitrate / 1000 - 1) * 0.125, 0.5);

  // Base score: 5
  const score = 5 - startupPenalty - bufferPenalty - switchPenalty + bitrateFactor;

  // Clamp to 1-5 range
  return Math.max(1, Math.min(5, score));
}

/**
 * End session and get final metrics
 */
export function endSession(sessionId: string): QoEMetrics | null {
  const session = activeSessions.get(sessionId);
  const metrics = sessionMetrics.get(sessionId);

  if (!session || !metrics) {
    console.warn('[QoE] Session not found:', sessionId);
    return null;
  }

  // Finalize session
  session.endTime = performance.now();
  session.state = 'ended';

  // Calculate final QoE score
  metrics.qoeScore = calculateQoEScore(metrics);
  metrics.timestamp = Date.now();

  // Export to monitoring
  exportToMonitoring(metrics as QoEMetrics);

  // Cleanup
  activeSessions.delete(sessionId);
  bufferingEvents.delete(sessionId);
  bitrateSwitches.delete(sessionId);

  console.log('[QoE] Session ended:', sessionId, 'Score:', metrics.qoeScore.toFixed(2));

  return metrics as QoEMetrics;
}

/**
 * Get active session for a video
 */
export function getActiveSession(videoId: string): QoESession | null {
  for (const session of activeSessions.values()) {
    if (session.videoId === videoId && session.state === 'active') {
      return session;
    }
  }
  return null;
}

/**
 * Export metrics to Sentry/monitoring
 */
export async function exportToMonitoring(metrics: QoEMetrics): Promise<void> {
  try {
    // Fixed API signature: trackAction expects { action, category, label?, value? }
    MonitoringService.trackAction({
      action: 'video_qoe',
      category: 'video',
      label: metrics.videoId,
      value: Math.round(metrics.qoeScore * 100), // Scale to integer
    });

    // Also expose globally for E2E tests
    if (typeof window !== 'undefined') {
      (window as any).__QOE_METRICS__ = metrics;
    }

    console.log('[QoE] Metrics exported:', {
      qoeScore: metrics.qoeScore.toFixed(2),
      startupTime: metrics.startupTime,
      rebufferRatio: (metrics.rebufferRatio * 100).toFixed(1) + '%',
    });
  } catch (error) {
    console.error('[QoE] Failed to export metrics:', error);
  }
}

// ============================================================================
// React Hook
// ============================================================================

interface UseQoEMetricsOptions {
  videoId: string;
  videoUrl: string;
  videoRef: React.RefObject<HTMLVideoElement>;
  config?: Partial<QoEConfig>;
}

interface UseQoEMetricsResult {
  session: QoESession | null;
  metrics: Partial<QoEMetrics>;
  qoeScore: number;
  isTracking: boolean;
}

export function useQoEMetrics({
  videoId,
  videoUrl,
  videoRef,
  config,
}: UseQoEMetricsOptions): UseQoEMetricsResult {
  const [session, setSession] = useState<QoESession | null>(null);
  const [metrics, setMetrics] = useState<Partial<QoEMetrics>>({});
  const [isTracking, setIsTracking] = useState(false);

  const loadStartTime = useRef<number>(0);
  const bufferingStartTime = useRef<number | null>(null);
  const lastBitrate = useRef<number>(0);

  // Start session
  useEffect(() => {
    if (!videoId || !videoUrl) return;

    const newSession = startSession(videoId, videoUrl, config);
    setSession(newSession);
    setIsTracking(true);

    return () => {
      if (newSession) {
        const finalMetrics = endSession(newSession.id);
        if (finalMetrics) {
          setMetrics(finalMetrics);
        }
      }
      setIsTracking(false);
    };
  }, [videoId, videoUrl]);

  // Attach video event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !session) return;

    const handleLoadStart = () => {
      loadStartTime.current = performance.now();
    };

    const handleCanPlay = () => {
      if (loadStartTime.current > 0) {
        const startupTime = performance.now() - loadStartTime.current;
        recordStartupTime(session.id, startupTime);
        setMetrics((prev) => ({ ...prev, startupTime }));
      }
    };

    const handleWaiting = () => {
      bufferingStartTime.current = performance.now();
    };

    const handlePlaying = () => {
      if (bufferingStartTime.current !== null) {
        const duration = performance.now() - bufferingStartTime.current;
        const event: BufferingEvent = {
          startTime: bufferingStartTime.current,
          endTime: performance.now(),
          duration,
          bufferLevel: video.buffered.length > 0 ? video.buffered.end(0) - video.currentTime : 0,
          networkType: getNetworkType(),
        };
        recordBuffering(session.id, event);
        bufferingStartTime.current = null;

        setMetrics((prev) => ({
          ...prev,
          totalBufferingTime: (prev.totalBufferingTime || 0) + duration,
          bufferingEvents: (prev.bufferingEvents || 0) + 1,
        }));
      }
    };

    const handleTimeUpdate = () => {
      updatePlaybackDuration(session.id, video.currentTime * 1000);

      // Check for dropped frames
      if ('getVideoPlaybackQuality' in video) {
        const quality = (video as any).getVideoPlaybackQuality();
        recordDroppedFrames(session.id, quality.droppedVideoFrames);
      }
    };

    video.addEventListener('loadstart', handleLoadStart);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      video.removeEventListener('loadstart', handleLoadStart);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [session, videoRef]);

  // Record HLS bitrate changes
  const recordBitrateChange = useCallback(
    (newBitrate: number, reason: BitrateSwitch['reason'] = 'buffer_low') => {
      if (!session) return;

      if (lastBitrate.current !== 0 && lastBitrate.current !== newBitrate) {
        recordBitrateSwitch(session.id, {
          timestamp: performance.now(),
          fromBitrate: lastBitrate.current,
          toBitrate: newBitrate,
          reason,
        });
      }
      lastBitrate.current = newBitrate;
    },
    [session]
  );

  return {
    session,
    metrics,
    qoeScore: calculateQoEScore(metrics),
    isTracking,
  };
}

export default useQoEMetrics;
