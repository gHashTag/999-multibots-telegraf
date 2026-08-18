/**
 * useCodecDetection - Browser Codec Capability Detection
 *
 * Generated from: specs/video-codec.vibee
 * Detects browser codec support for optimal video streaming
 * Includes WebCodecs API support detection
 */

import { useEffect, useState } from 'react';

// ============================================================================
// Types (from spec)
// ============================================================================

export interface CodecCapabilities {
  h264: boolean;
  h265: boolean;  // HEVC
  vp8: boolean;
  vp9: boolean;
  av1: boolean;
}

export interface HardwareAcceleration {
  h264Hw: boolean;
  h265Hw: boolean;
  vp9Hw: boolean;
  av1Hw: boolean;
}

export interface WebCodecsSupport {
  supported: boolean;
  videoDecoder: boolean;
  videoEncoder: boolean;
  audioDecoder: boolean;
  audioEncoder: boolean;
  imageDecoder: boolean;
}

export interface MediaCapabilitiesInfo {
  supported: boolean;
  smooth: boolean;         // Can play without dropped frames
  powerEfficient: boolean; // Uses hardware acceleration
}

export interface CodecRecommendation {
  primary: string;
  fallback: string[];
  reason: string;
}

export interface CodecConfig {
  codec: string;
  width: number;
  height: number;
  bitrate: number;
  framerate: number;
}

export interface ContainerSupport {
  mp4: boolean;
  webm: boolean;
  mkv: boolean;
  hls: boolean;
  dash: boolean;
}

export interface BrowserInfo {
  name: string;
  version: string;
  engine: string;
  platform: string;
}

export interface FullCodecInfo {
  capabilities: CodecCapabilities;
  hardware: HardwareAcceleration;
  webcodecs: WebCodecsSupport;
  containers: ContainerSupport;
  browser: BrowserInfo;
  recommendation: CodecRecommendation;
}

// ============================================================================
// Codec Detection Functions (from spec)
// ============================================================================

/**
 * Get browser information
 */
export function getBrowserInfo(): BrowserInfo {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';

  let name = 'Unknown';
  let version = '';
  let engine = 'Unknown';

  if (ua.includes('Chrome') && !ua.includes('Edg')) {
    name = 'Chrome';
    const match = ua.match(/Chrome\/([\d.]+)/);
    version = match?.[1] || '';
    engine = 'Blink';
  } else if (ua.includes('Safari') && !ua.includes('Chrome')) {
    name = 'Safari';
    const match = ua.match(/Version\/([\d.]+)/);
    version = match?.[1] || '';
    engine = 'WebKit';
  } else if (ua.includes('Firefox')) {
    name = 'Firefox';
    const match = ua.match(/Firefox\/([\d.]+)/);
    version = match?.[1] || '';
    engine = 'Gecko';
  } else if (ua.includes('Edg')) {
    name = 'Edge';
    const match = ua.match(/Edg\/([\d.]+)/);
    version = match?.[1] || '';
    engine = 'Blink';
  }

  return {
    name,
    version,
    engine,
    platform: typeof navigator !== 'undefined' ? navigator.platform : 'Unknown',
  };
}

/**
 * Check if browser can play a specific MIME type
 */
export function canPlayType(mimeType: string): 'probably' | 'maybe' | '' {
  if (typeof document === 'undefined') return '';

  const video = document.createElement('video');
  return video.canPlayType(mimeType) as 'probably' | 'maybe' | '';
}

/**
 * Detect basic codec capabilities using canPlayType
 */
export async function detectCapabilities(): Promise<CodecCapabilities> {
  return {
    h264: canPlayType('video/mp4; codecs="avc1.42E01E"') !== '',
    h265: canPlayType('video/mp4; codecs="hvc1.1.6.L93.B0"') !== '' ||
          canPlayType('video/mp4; codecs="hev1.1.6.L93.B0"') !== '',
    vp8: canPlayType('video/webm; codecs="vp8"') !== '',
    vp9: canPlayType('video/webm; codecs="vp9"') !== '' ||
         canPlayType('video/mp4; codecs="vp09.00.10.08"') !== '',
    av1: canPlayType('video/mp4; codecs="av01.0.08M.08"') !== '' ||
         canPlayType('video/webm; codecs="av01.0.08M.08"') !== '',
  };
}

/**
 * Check hardware acceleration for a specific codec/resolution
 * Uses MediaCapabilities API
 */
export async function checkHardwareAcceleration(
  codec: string,
  config: CodecConfig
): Promise<MediaCapabilitiesInfo> {
  if (typeof navigator === 'undefined' || !('mediaCapabilities' in navigator)) {
    return { supported: false, smooth: false, powerEfficient: false };
  }

  try {
    const result = await navigator.mediaCapabilities.decodingInfo({
      type: 'file',
      video: {
        contentType: `video/mp4; codecs="${codec}"`,
        width: config.width,
        height: config.height,
        bitrate: config.bitrate,
        framerate: config.framerate,
      },
    });

    return {
      supported: result.supported,
      smooth: result.smooth,
      powerEfficient: result.powerEfficient,
    };
  } catch (error) {
    console.warn('[Codec] Hardware acceleration check failed:', error);
    return { supported: false, smooth: false, powerEfficient: false };
  }
}

/**
 * Detect WebCodecs API availability
 */
export function detectWebCodecs(): WebCodecsSupport {
  if (typeof window === 'undefined') {
    return {
      supported: false,
      videoDecoder: false,
      videoEncoder: false,
      audioDecoder: false,
      audioEncoder: false,
      imageDecoder: false,
    };
  }

  return {
    supported: 'VideoDecoder' in window || 'AudioDecoder' in window,
    videoDecoder: 'VideoDecoder' in window,
    videoEncoder: 'VideoEncoder' in window,
    audioDecoder: 'AudioDecoder' in window,
    audioEncoder: 'AudioEncoder' in window,
    imageDecoder: 'ImageDecoder' in window,
  };
}

/**
 * Detect container format support
 */
export function detectContainerSupport(): ContainerSupport {
  return {
    mp4: canPlayType('video/mp4') !== '',
    webm: canPlayType('video/webm') !== '',
    mkv: canPlayType('video/x-matroska') !== '',
    hls: canPlayType('application/vnd.apple.mpegurl') !== '' ||
         canPlayType('application/x-mpegURL') !== '',
    dash: 'MediaSource' in (typeof window !== 'undefined' ? window : {}),
  };
}

/**
 * Get optimal codec recommendation based on capabilities
 */
export function getRecommendation(
  capabilities: CodecCapabilities,
  contentType: 'standard' | 'hdr' | '4k' = 'standard'
): CodecRecommendation {
  const fallback: string[] = [];

  // Build fallback chain
  if (capabilities.h264) fallback.push('h264');
  if (capabilities.vp9) fallback.push('vp9');
  if (capabilities.av1) fallback.push('av1');
  if (capabilities.h265) fallback.push('h265');

  // HDR content: prefer AV1 or HEVC
  if (contentType === 'hdr') {
    if (capabilities.av1) {
      return {
        primary: 'av1',
        fallback: fallback.filter((c) => c !== 'av1'),
        reason: 'best_hdr_support',
      };
    }
    if (capabilities.h265) {
      return {
        primary: 'h265',
        fallback: fallback.filter((c) => c !== 'h265'),
        reason: 'hevc_hdr_support',
      };
    }
  }

  // 4K content: prefer AV1 or VP9 for better compression
  if (contentType === '4k') {
    if (capabilities.av1) {
      return {
        primary: 'av1',
        fallback: fallback.filter((c) => c !== 'av1'),
        reason: 'best_4k_compression',
      };
    }
    if (capabilities.vp9) {
      return {
        primary: 'vp9',
        fallback: fallback.filter((c) => c !== 'vp9'),
        reason: 'good_4k_compression',
      };
    }
  }

  // Standard content: prefer VP9 for better compression, fallback to H.264
  if (capabilities.vp9) {
    return {
      primary: 'vp9',
      fallback: fallback.filter((c) => c !== 'vp9'),
      reason: 'better_compression',
    };
  }

  if (capabilities.h264) {
    return {
      primary: 'h264',
      fallback: fallback.filter((c) => c !== 'h264'),
      reason: 'universal_support',
    };
  }

  return {
    primary: fallback[0] || 'h264',
    fallback: fallback.slice(1),
    reason: 'only_supported',
  };
}

/**
 * Check if specific codec string is supported (e.g., "avc1.42E01E")
 */
export async function isCodecStringSupported(codecString: string): Promise<boolean> {
  // Try MP4 container first
  if (canPlayType(`video/mp4; codecs="${codecString}"`) !== '') {
    return true;
  }

  // Try WebM container
  if (canPlayType(`video/webm; codecs="${codecString}"`) !== '') {
    return true;
  }

  // Use MediaCapabilities API for more accurate check
  if (typeof navigator !== 'undefined' && 'mediaCapabilities' in navigator) {
    try {
      const result = await navigator.mediaCapabilities.decodingInfo({
        type: 'file',
        video: {
          contentType: `video/mp4; codecs="${codecString}"`,
          width: 1920,
          height: 1080,
          bitrate: 5000000,
          framerate: 30,
        },
      });
      return result.supported;
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Get complete codec information
 */
export async function getFullCodecInfo(): Promise<FullCodecInfo> {
  const capabilities = await detectCapabilities();
  const browser = getBrowserInfo();
  const webcodecs = detectWebCodecs();
  const containers = detectContainerSupport();

  // Check hardware acceleration for common codecs
  const h264Info = await checkHardwareAcceleration('avc1.42E01E', {
    codec: 'avc1.42E01E',
    width: 1920,
    height: 1080,
    bitrate: 5000000,
    framerate: 30,
  });

  const vp9Info = await checkHardwareAcceleration('vp09.00.10.08', {
    codec: 'vp09.00.10.08',
    width: 1920,
    height: 1080,
    bitrate: 5000000,
    framerate: 30,
  });

  const av1Info = capabilities.av1
    ? await checkHardwareAcceleration('av01.0.08M.08', {
        codec: 'av01.0.08M.08',
        width: 1920,
        height: 1080,
        bitrate: 5000000,
        framerate: 30,
      })
    : { powerEfficient: false };

  const h265Info = capabilities.h265
    ? await checkHardwareAcceleration('hvc1.1.6.L93.B0', {
        codec: 'hvc1.1.6.L93.B0',
        width: 1920,
        height: 1080,
        bitrate: 5000000,
        framerate: 30,
      })
    : { powerEfficient: false };

  const hardware: HardwareAcceleration = {
    h264Hw: h264Info.powerEfficient,
    h265Hw: h265Info.powerEfficient,
    vp9Hw: vp9Info.powerEfficient,
    av1Hw: av1Info.powerEfficient,
  };

  const recommendation = getRecommendation(capabilities, 'standard');

  return {
    capabilities,
    hardware,
    webcodecs,
    containers,
    browser,
    recommendation,
  };
}

// ============================================================================
// React Hook
// ============================================================================

interface UseCodecDetectionResult {
  info: FullCodecInfo | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useCodecDetection(): UseCodecDetectionResult {
  const [info, setInfo] = useState<FullCodecInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const detect = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const fullInfo = await getFullCodecInfo();
      setInfo(fullInfo);

      // Expose for E2E tests
      if (typeof window !== 'undefined') {
        (window as any).__CODEC_INFO__ = fullInfo;
      }

      console.log('[Codec] Detection complete:', fullInfo.recommendation);
    } catch (err) {
      console.error('[Codec] Detection failed:', err);
      setError(err instanceof Error ? err : new Error('Codec detection failed'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    detect();
  }, []);

  return {
    info,
    isLoading,
    error,
    refresh: detect,
  };
}

export default useCodecDetection;
