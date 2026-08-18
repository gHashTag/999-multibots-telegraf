/**
 * useWebCodecsHW - Hardware-Accelerated Video Decoding
 *
 * Generated from: specs/video-webcodecs-hw.vibee
 * Based on: W3C WebCodecs API Specification
 * Scientific target: 20% decode speed improvement for high-resolution content
 *
 * TIER 3: Advanced Optimization
 * Status: Available for integration when WebCodecs is widely supported
 */

import { useCallback, useEffect, useRef, useState } from 'react';

// ============================================================================
// Types (from spec)
// ============================================================================

export interface WebCodecsConfig {
  enableHardwareAcceleration: boolean;
  fallbackToSoftware: boolean;
  preferredCodecs: string[];
  maxResolution: string;
  lowLatencyMode: boolean;
}

export interface Resolution {
  width: number;
  height: number;
}

export interface CodecSupport {
  codec: string;
  profile: string;
  hardwareAccelerated: boolean;
  maxBitrate: number;
  maxResolution: Resolution;
}

export interface DecoderCapabilities {
  webcodecs: boolean;
  hardwareAcceleration: boolean;
  supportedCodecs: CodecSupport[];
  maxResolution: Resolution;
  estimatedSpeedup: number;
}

export interface DecodePerformance {
  framesDecoded: number;
  framesDropped: number;
  avgDecodeTime: number;
  maxDecodeTime: number;
  memoryUsed: number;
  hwAccelerationActive: boolean;
}

export interface DecoderState {
  status: 'unconfigured' | 'configured' | 'decoding' | 'error' | 'closed';
  currentCodec: string | null;
  hwAcceleration: boolean;
  lastError: string | null;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: WebCodecsConfig = {
  enableHardwareAcceleration: true,
  fallbackToSoftware: true,
  preferredCodecs: ['h264', 'vp9', 'av1'],
  maxResolution: '4k',
  lowLatencyMode: false,
};

// Codec configuration strings
const CODEC_CONFIGS: Record<string, string> = {
  h264: 'avc1.64001f', // H.264 High Profile Level 3.1
  vp9: 'vp09.00.31.08', // VP9 Profile 0 Level 3.1
  av1: 'av01.0.08M.08', // AV1 Main Profile Level 4.0
  hevc: 'hvc1.1.6.L93.B0', // HEVC Main Profile Level 3.1
};

// ============================================================================
// Core Functions (from spec)
// ============================================================================

/**
 * Check if WebCodecs API is available
 */
function isWebCodecsSupported(): boolean {
  return (
    typeof VideoDecoder !== 'undefined' &&
    typeof VideoEncoder !== 'undefined' &&
    typeof EncodedVideoChunk !== 'undefined' &&
    typeof VideoFrame !== 'undefined'
  );
}

/**
 * Detect WebCodecs and hardware acceleration capabilities
 */
export async function detectCapabilities(): Promise<DecoderCapabilities> {
  const capabilities: DecoderCapabilities = {
    webcodecs: false,
    hardwareAcceleration: false,
    supportedCodecs: [],
    maxResolution: { width: 0, height: 0 },
    estimatedSpeedup: 1.0,
  };

  if (!isWebCodecsSupported()) {
    console.log('[WebCodecs] API not supported in this browser');
    return capabilities;
  }

  capabilities.webcodecs = true;

  // Test each codec for hardware acceleration
  const codecTests = [
    { name: 'h264', config: CODEC_CONFIGS.h264, profile: 'high' },
    { name: 'vp9', config: CODEC_CONFIGS.vp9, profile: 'profile-0' },
    { name: 'av1', config: CODEC_CONFIGS.av1, profile: 'main' },
  ];

  for (const test of codecTests) {
    try {
      const result = await VideoDecoder.isConfigSupported({
        codec: test.config,
        hardwareAcceleration: 'prefer-hardware',
      });

      if (result.supported) {
        const hwResult = await VideoDecoder.isConfigSupported({
          codec: test.config,
          hardwareAcceleration: 'require-hardware',
        });

        capabilities.supportedCodecs.push({
          codec: test.name,
          profile: test.profile,
          hardwareAccelerated: hwResult.supported || false,
          maxBitrate: 50_000_000, // 50 Mbps default
          maxResolution: { width: 3840, height: 2160 }, // 4K default
        });

        if (hwResult.supported) {
          capabilities.hardwareAcceleration = true;
        }
      }
    } catch (error) {
      console.log(`[WebCodecs] Codec ${test.name} not supported:`, error);
    }
  }

  // Estimate speedup based on hardware availability
  if (capabilities.hardwareAcceleration) {
    capabilities.estimatedSpeedup = 1.2; // 20% faster with HW
  }

  // Determine max resolution
  if (capabilities.supportedCodecs.length > 0) {
    capabilities.maxResolution = capabilities.supportedCodecs.reduce(
      (max, codec) => {
        if (codec.maxResolution.width > max.width) {
          return codec.maxResolution;
        }
        return max;
      },
      { width: 0, height: 0 }
    );
  }

  console.log('[WebCodecs] Capabilities detected:', capabilities);
  return capabilities;
}

/**
 * Create a hardware-accelerated VideoDecoder
 */
export async function createHWDecoder(
  codec: string,
  config: Partial<WebCodecsConfig> = {},
  onFrame: (frame: VideoFrame) => void,
  onError: (error: Error) => void
): Promise<VideoDecoder | null> {
  if (!isWebCodecsSupported()) {
    console.warn('[WebCodecs] API not supported');
    return null;
  }

  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const codecString = CODEC_CONFIGS[codec] || codec;

  try {
    // Check if codec is supported
    const support = await VideoDecoder.isConfigSupported({
      codec: codecString,
      hardwareAcceleration: mergedConfig.enableHardwareAcceleration
        ? 'prefer-hardware'
        : 'prefer-software',
    });

    if (!support.supported) {
      console.warn(`[WebCodecs] Codec ${codec} not supported`);
      return null;
    }

    // Create decoder
    const decoder = new VideoDecoder({
      output: (frame) => {
        onFrame(frame);
      },
      error: (error) => {
        console.error('[WebCodecs] Decoder error:', error);
        onError(new Error(error.message));
      },
    });

    // Configure decoder
    decoder.configure({
      codec: codecString,
      hardwareAcceleration: mergedConfig.enableHardwareAcceleration
        ? 'prefer-hardware'
        : 'prefer-software',
      optimizeForLatency: mergedConfig.lowLatencyMode,
    });

    console.log(`[WebCodecs] Decoder created for ${codec}`);
    return decoder;
  } catch (error) {
    console.error('[WebCodecs] Failed to create decoder:', error);
    return null;
  }
}

/**
 * Get decode performance statistics
 */
export function getPerformanceStats(decoder: VideoDecoder): DecodePerformance {
  // Note: WebCodecs doesn't expose detailed stats directly
  // This would need to be tracked externally
  return {
    framesDecoded: decoder.decodeQueueSize,
    framesDropped: 0, // Would need external tracking
    avgDecodeTime: 0, // Would need external tracking
    maxDecodeTime: 0, // Would need external tracking
    memoryUsed: 0, // Would need external tracking
    hwAccelerationActive: true, // Assumed if created with prefer-hardware
  };
}

// ============================================================================
// React Hook
// ============================================================================

interface UseWebCodecsHWOptions {
  enabled?: boolean;
  preferredCodec?: string;
  onCapabilitiesDetected?: (capabilities: DecoderCapabilities) => void;
}

interface UseWebCodecsHWResult {
  capabilities: DecoderCapabilities | null;
  isSupported: boolean;
  isHWAccelerated: boolean;
  isLoading: boolean;
  error: string | null;
  createDecoder: (
    codec: string,
    onFrame: (frame: VideoFrame) => void,
    onError: (error: Error) => void
  ) => Promise<VideoDecoder | null>;
  getRecommendedCodec: () => string;
}

/**
 * React hook for WebCodecs hardware acceleration
 *
 * @example
 * const { capabilities, isHWAccelerated, createDecoder } = useWebCodecsHW();
 *
 * useEffect(() => {
 *   if (isHWAccelerated) {
 *     console.log('Hardware acceleration available!');
 *   }
 * }, [isHWAccelerated]);
 */
export function useWebCodecsHW(
  options: UseWebCodecsHWOptions = {}
): UseWebCodecsHWResult {
  const { enabled = true, preferredCodec = 'h264', onCapabilitiesDetected } = options;

  const [capabilities, setCapabilities] = useState<DecoderCapabilities | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const decoderRef = useRef<VideoDecoder | null>(null);

  // Detect capabilities on mount
  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    let mounted = true;

    async function detect() {
      try {
        const caps = await detectCapabilities();

        if (mounted) {
          setCapabilities(caps);
          setIsLoading(false);
          onCapabilitiesDetected?.(caps);

          // Expose to window for E2E tests
          if (typeof window !== 'undefined') {
            (window as any).__WEBCODECS_CAPABILITIES__ = caps;
          }
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Detection failed');
          setIsLoading(false);
        }
      }
    }

    detect();

    return () => {
      mounted = false;
      if (decoderRef.current) {
        decoderRef.current.close();
      }
    };
  }, [enabled, onCapabilitiesDetected]);

  // Create decoder function
  const createDecoder = useCallback(
    async (
      codec: string,
      onFrame: (frame: VideoFrame) => void,
      onError: (error: Error) => void
    ): Promise<VideoDecoder | null> => {
      // Close existing decoder
      if (decoderRef.current) {
        decoderRef.current.close();
      }

      const decoder = await createHWDecoder(codec, {}, onFrame, onError);
      decoderRef.current = decoder;
      return decoder;
    },
    []
  );

  // Get recommended codec based on capabilities
  const getRecommendedCodec = useCallback((): string => {
    if (!capabilities || capabilities.supportedCodecs.length === 0) {
      return preferredCodec;
    }

    // Prefer hardware-accelerated codecs
    const hwCodecs = capabilities.supportedCodecs.filter((c) => c.hardwareAccelerated);
    if (hwCodecs.length > 0) {
      // Prefer H.264 for compatibility, then VP9, then AV1
      const priority = ['h264', 'vp9', 'av1'];
      for (const codec of priority) {
        const found = hwCodecs.find((c) => c.codec === codec);
        if (found) {
          return found.codec;
        }
      }
      return hwCodecs[0].codec;
    }

    // Fall back to any supported codec
    return capabilities.supportedCodecs[0]?.codec || preferredCodec;
  }, [capabilities, preferredCodec]);

  return {
    capabilities,
    isSupported: capabilities?.webcodecs || false,
    isHWAccelerated: capabilities?.hardwareAcceleration || false,
    isLoading,
    error,
    createDecoder,
    getRecommendedCodec,
  };
}

export default useWebCodecsHW;
