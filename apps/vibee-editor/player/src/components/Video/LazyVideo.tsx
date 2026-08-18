import React, { useState, useRef, useEffect, useCallback } from 'react';
import Hls from 'hls.js';
import { useIntersectionObserver } from '../../hooks/useIntersectionObserver';
import { integrateWithHLS, BBAController } from '../../lib/bufferBasedABR';
import { useQoEMetrics, recordBitrateSwitch, endSession } from '../../hooks/useQoEMetrics';
import { useCodecDetection } from '../../hooks/useCodecDetection';

interface LazyVideoProps {
  src: string;
  poster?: string;
  hlsSrc?: string; // HLS manifest URL (.m3u8)
  className?: string;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  controls?: boolean;
  preload?: 'none' | 'metadata' | 'auto';
  onLoad?: () => void;
  onError?: (error: Error) => void;
  onProgress?: (progress: number) => void;
  threshold?: number;
  rootMargin?: string;
  quality?: 'auto' | '360p' | '480p' | '720p' | '1080p';
}

interface VideoState {
  loaded: boolean;
  playing: boolean;
  error: string | null;
  currentQuality: string;
  buffered: number;
}

/**
 * LazyVideo component with HLS adaptive streaming support.
 *
 * Features:
 * - Lazy loading via Intersection Observer
 * - HLS.js adaptive bitrate streaming
 * - Poster image placeholder until video loads
 * - Quality level selection
 * - Preload strategy optimization
 *
 * @example
 * // Standard video
 * <LazyVideo src="/videos/demo.mp4" poster="/posters/demo.webp" />
 *
 * // HLS streaming with adaptive quality
 * <LazyVideo
 *   hlsSrc="/hls/video123/master.m3u8"
 *   poster="/posters/demo.webp"
 *   quality="auto"
 * />
 */
export const LazyVideo: React.FC<LazyVideoProps> = ({
  src,
  poster,
  hlsSrc,
  className = '',
  autoPlay = false,
  muted = true,
  loop = false,
  controls = true,
  preload = 'metadata',
  onLoad,
  onError,
  onProgress,
  threshold = 0.1,
  rootMargin = '100px',
  quality = 'auto',
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const bbaControllerRef = useRef<BBAController | null>(null);

  // Codec detection for optimal playback
  const codecInfo = useCodecDetection();

  // QoE Metrics tracking (ITU-T P.1203)
  const qoeMetrics = useQoEMetrics({
    videoId: hlsSrc || src,
    videoUrl: hlsSrc || src,
    videoRef,
  });

  const [state, setState] = useState<VideoState>({
    loaded: false,
    playing: false,
    error: null,
    currentQuality: quality,
    buffered: 0,
  });

  const { ref: containerRef, isVisible } = useIntersectionObserver({
    threshold,
    rootMargin,
    freezeOnceVisible: true,
  });

  // Initialize HLS.js for adaptive streaming
  const initHls = useCallback(() => {
    const video = videoRef.current;
    if (!video || !hlsSrc) return;

    // Cleanup previous instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
    }

    // Check for native HLS support (Safari)
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = hlsSrc;
      return;
    }

    // Use HLS.js for other browsers with LL-HLS optimizations
    // Based on scientific ABR research (GreenABR+, PLL-ABR, SODA)
    if (Hls.isSupported()) {
      const hls = new Hls({
        startLevel: quality === 'auto' ? -1 : getQualityLevel(quality),
        autoStartLoad: true,
        capLevelToPlayerSize: true, // Adaptive based on video element size

        // LL-HLS Configuration (Low-Latency HLS)
        // Enables faster segment delivery and reduced startup time
        lowLatencyMode: true,
        backBufferLength: 2,          // Keep only 2s of back buffer (memory optimization)
        maxBufferSize: 3 * 1000 * 1000, // 3MB max buffer size
        maxBufferLength: 4,           // 4 seconds of forward buffer
        maxMaxBufferLength: 6,        // Max 6 seconds buffer limit
        liveSyncDurationCount: 3,     // Sync to live edge within 3 segments

        // Progressive loading for faster starts
        progressive: true,
        enableWorker: true,           // Use Web Worker for parsing

        // ABR tuning for B-roll videos (short clips)
        abrEwmaDefaultEstimate: 5000000, // 5 Mbps initial estimate
        abrBandWidthFactor: 0.8,      // Conservative bandwidth factor
        abrBandWidthUpFactor: 0.7,    // Conservative upgrade factor
        abrMaxWithRealBitrate: true,  // Limit ABR by actual bitrate

        // Fast fragment loading
        fragLoadingTimeOut: 10000,    // 10s timeout
        fragLoadingMaxRetry: 3,       // 3 retries
        fragLoadingRetryDelay: 500,   // 500ms between retries
      });

      hls.loadSource(hlsSrc);
      hls.attachMedia(video);

      // BBA Algorithm Integration (Stanford SIGCOMM 2014)
      // Provides 10-20% rebuffer reduction over default ABR
      bbaControllerRef.current = integrateWithHLS(hls, {
        reservoir: 10,   // Min buffer threshold (seconds)
        cushion: 30,     // Max buffer threshold (seconds)
        maxBuffer: 60,   // Maximum buffer (seconds)
        enableOscillationGuard: true,
      });

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setState((prev) => ({ ...prev, loaded: true }));
        if (autoPlay) {
          video.play().catch(console.warn);
        }
        onLoad?.();
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        const level = hls.levels[data.level];
        if (level) {
          const prevQuality = state.currentQuality;
          const newQuality = `${level.height}p`;

          setState((prev) => ({
            ...prev,
            currentQuality: newQuality,
          }));

          // Track quality switch in QoE metrics
          if (qoeMetrics.session) {
            const prevBitrate = parseInt(prevQuality) || 0;
            recordBitrateSwitch(qoeMetrics.session.id, {
              timestamp: performance.now(),
              fromBitrate: prevBitrate * 1000, // kbps approximation
              toBitrate: level.bitrate / 1000, // Convert to kbps
              reason: 'buffer_low', // BBA algorithm decision
            });
            console.log('[LazyVideo] Quality switch tracked:', prevQuality, '->', newQuality);
          }
        }
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          const error = new Error(`HLS Error: ${data.type} - ${data.details}`);
          setState((prev) => ({ ...prev, error: error.message }));
          onError?.(error);

          // Try to recover
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          }
        }
      });

      hlsRef.current = hls;
    } else {
      // Fallback to direct source
      video.src = src;
    }
  }, [hlsSrc, src, quality, autoPlay, onLoad, onError]);

  // Quality level mapping
  const getQualityLevel = (q: string): number => {
    const levels: Record<string, number> = {
      '360p': 0,
      '480p': 1,
      '720p': 2,
      '1080p': 3,
    };
    return levels[q] ?? -1;
  };

  // Set quality level
  const setQuality = useCallback((newQuality: string) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = getQualityLevel(newQuality);
      setState((prev) => ({ ...prev, currentQuality: newQuality }));
    }
  }, []);

  // Handle video load
  const handleLoadedData = useCallback(() => {
    setState((prev) => ({ ...prev, loaded: true }));
    onLoad?.();
  }, [onLoad]);

  // Handle video error
  const handleError = useCallback(() => {
    const error = new Error('Video playback failed');
    setState((prev) => ({ ...prev, error: error.message }));
    onError?.(error);
  }, [onError]);

  // Handle buffer progress
  const handleProgress = useCallback(() => {
    const video = videoRef.current;
    if (video && video.buffered.length > 0) {
      const buffered = video.buffered.end(video.buffered.length - 1);
      const duration = video.duration || 1;
      const progress = (buffered / duration) * 100;
      setState((prev) => ({ ...prev, buffered: progress }));
      onProgress?.(progress);
    }
  }, [onProgress]);

  // Initialize video when visible
  useEffect(() => {
    if (!isVisible) return;

    if (hlsSrc) {
      initHls();
    } else if (videoRef.current && src) {
      videoRef.current.src = src;
    }

    return () => {
      // End QoE session and finalize metrics
      if (qoeMetrics.session) {
        endSession(qoeMetrics.session.id);
        console.log('[LazyVideo] QoE session ended');
      }
      // Cleanup BBA controller
      if (bbaControllerRef.current) {
        bbaControllerRef.current.destroy();
        bbaControllerRef.current = null;
      }
      // Cleanup HLS instance
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [isVisible, hlsSrc, src, initHls]);

  // Pause when not visible (for video lists)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (!isVisible && state.playing) {
      video.pause();
      setState((prev) => ({ ...prev, playing: false }));
    }
  }, [isVisible, state.playing]);

  // Expose stats to window for E2E testing
  useEffect(() => {
    if (qoeMetrics.metrics) {
      (window as any).__QOE_METRICS__ = {
        ...qoeMetrics.metrics,
        qoeScore: qoeMetrics.qoeScore,
      };
    }
    if (codecInfo) {
      (window as any).__CODEC_INFO__ = codecInfo;
    }
  }, [qoeMetrics, codecInfo]);

  return (
    <div
      ref={containerRef as React.RefObject<HTMLDivElement>}
      className={`lazy-video-container ${className}`}
      style={{ position: 'relative', width: '100%', height: '100%' }}
    >
      {/* Poster placeholder until loaded */}
      {!state.loaded && poster && (
        <img
          src={poster}
          alt="Video poster"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      )}

      {/* Loading indicator */}
      {isVisible && !state.loaded && !state.error && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: 'white',
            fontSize: '14px',
          }}
        >
          Loading...
        </div>
      )}

      {/* Error message */}
      {state.error && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: 'red',
            fontSize: '14px',
            textAlign: 'center',
            padding: '10px',
          }}
        >
          {state.error}
        </div>
      )}

      {/* Video element */}
      {isVisible && (
        <video
          ref={videoRef}
          poster={poster}
          autoPlay={autoPlay}
          muted={muted}
          loop={loop}
          controls={controls}
          preload={preload}
          playsInline
          onLoadedData={handleLoadedData}
          onError={handleError}
          onProgress={handleProgress}
          onPlay={() => setState((prev) => ({ ...prev, playing: true }))}
          onPause={() => setState((prev) => ({ ...prev, playing: false }))}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: state.loaded ? 1 : 0,
            transition: 'opacity 0.3s ease',
          }}
        />
      )}

      {/* Quality indicator (for debugging and E2E testing) */}
      {hlsSrc && state.loaded && (
        <div
          data-testid="video-quality-indicator"
          data-quality={state.currentQuality}
          style={{
            position: 'absolute',
            bottom: '40px',
            right: '10px',
            background: 'rgba(0, 0, 0, 0.7)',
            color: 'white',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '12px',
          }}
        >
          {state.currentQuality}
        </div>
      )}
    </div>
  );
};

export default LazyVideo;
