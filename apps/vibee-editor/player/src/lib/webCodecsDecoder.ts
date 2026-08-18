/**
 * WebCodecs Video Decoder - Hardware-accelerated video decoding
 *
 * Based on WebCodecs API research (2025):
 * - Direct GPU access bypasses <video> element overhead
 * - Hardware acceleration for H.264/H.265 decoding
 * - Faster first-frame display for short clips
 *
 * Browser Support (2025):
 * - Chrome/Edge: Full support
 * - Safari: VideoDecoder only (no AudioDecoder)
 * - Firefox: Behind flag
 */

export interface DecoderConfig {
  codec: string;
  width?: number;
  height?: number;
  hardwareAcceleration?: 'prefer-hardware' | 'prefer-software' | 'no-preference';
  optimizeForLatency?: boolean;
}

export interface DecodedFrame {
  frame: VideoFrame;
  timestamp: number;
  duration: number;
}

export type FrameCallback = (frame: DecodedFrame) => void;
export type ErrorCallback = (error: Error) => void;

// Common H.264 codec strings
export const H264_CODECS = {
  BASELINE: 'avc1.42E01E', // Baseline Profile
  MAIN: 'avc1.4D401E',     // Main Profile
  HIGH: 'avc1.64001f',     // High Profile (most common)
  HIGH_10: 'avc1.6E001F',  // High 10 Profile
} as const;

/**
 * Check if WebCodecs is supported in current browser
 */
export function isWebCodecsSupported(): boolean {
  return 'VideoDecoder' in window && 'VideoEncoder' in window;
}

/**
 * Check if a specific codec configuration is supported
 */
export async function isCodecSupported(config: DecoderConfig): Promise<boolean> {
  if (!isWebCodecsSupported()) return false;

  try {
    const support = await VideoDecoder.isConfigSupported({
      codec: config.codec,
      codedWidth: config.width || 1920,
      codedHeight: config.height || 1080,
      hardwareAcceleration: config.hardwareAcceleration || 'prefer-hardware',
      optimizeForLatency: config.optimizeForLatency ?? true,
    });
    return support.supported || false;
  } catch {
    return false;
  }
}

/**
 * Create hardware-accelerated video decoder
 */
export async function createHardwareDecoder(
  onFrame: FrameCallback,
  onError: ErrorCallback,
  config: Partial<DecoderConfig> = {}
): Promise<VideoDecoder | null> {
  if (!isWebCodecsSupported()) {
    console.warn('[WebCodecs] Not supported in this browser');
    return null;
  }

  const decoderConfig: VideoDecoderConfig = {
    codec: config.codec || H264_CODECS.HIGH,
    codedWidth: config.width || 1920,
    codedHeight: config.height || 1080,
    hardwareAcceleration: config.hardwareAcceleration || 'prefer-hardware',
    optimizeForLatency: config.optimizeForLatency ?? true,
  };

  // Check if configuration is supported
  const support = await VideoDecoder.isConfigSupported(decoderConfig);
  if (!support.supported) {
    console.warn('[WebCodecs] Codec not supported:', decoderConfig.codec);
    // Try software fallback
    decoderConfig.hardwareAcceleration = 'prefer-software';
    const softwareSupport = await VideoDecoder.isConfigSupported(decoderConfig);
    if (!softwareSupport.supported) {
      return null;
    }
  }

  const decoder = new VideoDecoder({
    output: (frame) => {
      onFrame({
        frame,
        timestamp: frame.timestamp || 0,
        duration: frame.duration || 0,
      });
    },
    error: (error) => {
      console.error('[WebCodecs] Decoder error:', error);
      onError(error);
    },
  });

  decoder.configure(decoderConfig);

  return decoder;
}

/**
 * WebCodecs-based video player class
 * Handles demuxing, decoding, and frame rendering
 */
export class WebCodecsPlayer {
  private decoder: VideoDecoder | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private isPlaying = false;
  private currentFrame: VideoFrame | null = null;
  private animationId: number | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  /**
   * Initialize decoder for a video
   */
  async init(codecString: string = H264_CODECS.HIGH): Promise<boolean> {
    try {
      this.decoder = await createHardwareDecoder(
        (decoded) => this.handleFrame(decoded),
        (error) => console.error('[WebCodecsPlayer] Error:', error),
        { codec: codecString }
      );
      return this.decoder !== null;
    } catch {
      return false;
    }
  }

  /**
   * Handle decoded frame
   */
  private handleFrame(decoded: DecodedFrame): void {
    // Close previous frame to free memory
    if (this.currentFrame) {
      this.currentFrame.close();
    }
    this.currentFrame = decoded.frame;

    // Render to canvas
    if (this.ctx && this.canvas) {
      this.ctx.drawImage(
        decoded.frame,
        0, 0,
        this.canvas.width,
        this.canvas.height
      );
    }
  }

  /**
   * Feed encoded chunk to decoder
   */
  decode(chunk: EncodedVideoChunk): void {
    if (this.decoder && this.decoder.state === 'configured') {
      this.decoder.decode(chunk);
    }
  }

  /**
   * Flush decoder (wait for all frames to be decoded)
   */
  async flush(): Promise<void> {
    if (this.decoder) {
      await this.decoder.flush();
    }
  }

  /**
   * Close and cleanup
   */
  close(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    if (this.currentFrame) {
      this.currentFrame.close();
    }
    if (this.decoder) {
      this.decoder.close();
    }
    this.decoder = null;
    this.currentFrame = null;
  }

  /**
   * Get decoder state
   */
  get state(): string {
    return this.decoder?.state || 'unconfigured';
  }

  /**
   * Get decode queue size
   */
  get queueSize(): number {
    return this.decoder?.decodeQueueSize || 0;
  }
}

/**
 * Utility: Extract codec string from MP4 metadata
 * Note: Requires demuxer like mp4box.js for full implementation
 */
export function extractCodecFromMp4(buffer: ArrayBuffer): string | null {
  // Simplified check for avc1 box
  const view = new DataView(buffer);
  const textDecoder = new TextDecoder();

  // Search for 'avc1' box in first 1KB
  for (let i = 0; i < Math.min(buffer.byteLength - 4, 1024); i++) {
    const boxType = textDecoder.decode(new Uint8Array(buffer, i, 4));
    if (boxType === 'avc1' || boxType === 'avcC') {
      // Found H.264 indicator
      return H264_CODECS.HIGH; // Default to High Profile
    }
    if (boxType === 'hev1' || boxType === 'hvc1') {
      // H.265/HEVC
      return 'hev1.1.6.L93.B0';
    }
  }

  return null;
}

export default {
  isWebCodecsSupported,
  isCodecSupported,
  createHardwareDecoder,
  WebCodecsPlayer,
  H264_CODECS,
};
