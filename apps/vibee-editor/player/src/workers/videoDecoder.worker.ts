/**
 * Video Decoder Web Worker - Offload decoding from main thread
 *
 * Research (2025):
 * - OffscreenCanvas allows canvas operations in workers
 * - WebCodecs provides direct video frame access
 * - Combined: zero UI jank during video decode
 *
 * @see https://web.dev/articles/offscreen-canvas
 * @see https://webrtchacks.com/real-time-video-processing-with-webcodecs-and-streams-processing-pipelines-part-1/
 */

/// <reference lib="webworker" />

interface WorkerMessage {
  type: 'init' | 'decode' | 'seek' | 'close' | 'getFrame';
  data?: any;
}

interface DecoderConfig {
  codec: string;
  width: number;
  height: number;
  hardwareAcceleration?: 'prefer-hardware' | 'prefer-software' | 'no-preference';
}

let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let decoder: VideoDecoder | null = null;
let pendingFrames: VideoFrame[] = [];
let isInitialized = false;

/**
 * Initialize decoder with OffscreenCanvas
 */
async function initDecoder(
  offscreenCanvas: OffscreenCanvas,
  config: DecoderConfig
): Promise<boolean> {
  try {
    canvas = offscreenCanvas;
    ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Failed to get 2D context from OffscreenCanvas');
    }

    // Check WebCodecs support
    if (!('VideoDecoder' in self)) {
      self.postMessage({
        type: 'error',
        error: 'WebCodecs VideoDecoder not supported in this worker',
      });
      return false;
    }

    // Check codec support
    const supported = await VideoDecoder.isConfigSupported({
      codec: config.codec,
      codedWidth: config.width,
      codedHeight: config.height,
      hardwareAcceleration: config.hardwareAcceleration || 'prefer-hardware',
    });

    if (!supported.supported) {
      self.postMessage({
        type: 'error',
        error: `Codec ${config.codec} not supported`,
      });
      return false;
    }

    // Create decoder
    decoder = new VideoDecoder({
      output: handleDecodedFrame,
      error: handleDecoderError,
    });

    decoder.configure({
      codec: config.codec,
      codedWidth: config.width,
      codedHeight: config.height,
      hardwareAcceleration: config.hardwareAcceleration || 'prefer-hardware',
      optimizeForLatency: true,
    });

    isInitialized = true;

    self.postMessage({ type: 'initialized', data: { config: supported.config } });
    return true;
  } catch (error) {
    self.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : 'Init failed',
    });
    return false;
  }
}

/**
 * Handle decoded video frame
 */
function handleDecodedFrame(frame: VideoFrame): void {
  if (!ctx || !canvas) {
    frame.close();
    return;
  }

  // Store frame for later use or render immediately
  pendingFrames.push(frame);

  // Keep only last 3 frames to avoid memory bloat
  while (pendingFrames.length > 3) {
    const oldFrame = pendingFrames.shift();
    oldFrame?.close();
  }

  // Render to canvas
  ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);

  // Notify main thread
  self.postMessage({
    type: 'frame',
    data: {
      timestamp: frame.timestamp,
      duration: frame.duration,
      width: frame.codedWidth,
      height: frame.codedHeight,
    },
  });
}

/**
 * Handle decoder error
 */
function handleDecoderError(error: DOMException): void {
  self.postMessage({
    type: 'error',
    error: error.message,
  });
}

/**
 * Decode an encoded video chunk
 */
function decodeChunk(chunkData: {
  data: ArrayBuffer;
  timestamp: number;
  type: 'key' | 'delta';
  duration?: number;
}): void {
  if (!decoder || decoder.state !== 'configured') {
    self.postMessage({
      type: 'error',
      error: 'Decoder not configured',
    });
    return;
  }

  try {
    const chunk = new EncodedVideoChunk({
      type: chunkData.type,
      timestamp: chunkData.timestamp,
      duration: chunkData.duration,
      data: chunkData.data,
    });

    decoder.decode(chunk);
  } catch (error) {
    self.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : 'Decode failed',
    });
  }
}

/**
 * Get current frame as ImageBitmap (transferable)
 */
async function getCurrentFrame(): Promise<void> {
  if (!canvas) {
    self.postMessage({ type: 'error', error: 'Canvas not initialized' });
    return;
  }

  try {
    const bitmap = await createImageBitmap(canvas);
    self.postMessage({ type: 'bitmap', data: bitmap }, [bitmap]);
  } catch (error) {
    self.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : 'Failed to create bitmap',
    });
  }
}

/**
 * Flush decoder and close
 */
async function closeDecoder(): Promise<void> {
  if (decoder) {
    await decoder.flush();
    decoder.close();
    decoder = null;
  }

  // Close all pending frames
  for (const frame of pendingFrames) {
    frame.close();
  }
  pendingFrames = [];

  canvas = null;
  ctx = null;
  isInitialized = false;

  self.postMessage({ type: 'closed' });
}

/**
 * Message handler
 */
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { type, data } = event.data;

  switch (type) {
    case 'init':
      await initDecoder(data.canvas, data.config);
      break;

    case 'decode':
      decodeChunk(data);
      break;

    case 'getFrame':
      await getCurrentFrame();
      break;

    case 'close':
      await closeDecoder();
      break;

    default:
      self.postMessage({
        type: 'error',
        error: `Unknown message type: ${type}`,
      });
  }
};

// Export for TypeScript
export {};
