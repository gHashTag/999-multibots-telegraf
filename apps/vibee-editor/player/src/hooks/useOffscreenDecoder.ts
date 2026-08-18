/**
 * useOffscreenDecoder - Hook for using video decoder in Web Worker
 *
 * Offloads video decoding to a separate thread using:
 * - OffscreenCanvas for rendering
 * - WebCodecs VideoDecoder for decoding
 * - Web Worker for thread isolation
 *
 * @see https://web.dev/articles/offscreen-canvas
 */

import { useEffect, useRef, useState, useCallback, RefObject } from 'react';

interface DecoderConfig {
  codec: string;
  width: number;
  height: number;
  hardwareAcceleration?: 'prefer-hardware' | 'prefer-software' | 'no-preference';
}

interface DecoderState {
  isSupported: boolean;
  isInitialized: boolean;
  isDecoding: boolean;
  error: string | null;
  frameCount: number;
  lastFrameTime: number;
}

interface UseOffscreenDecoderReturn {
  state: DecoderState;
  decode: (chunk: {
    data: ArrayBuffer;
    timestamp: number;
    type: 'key' | 'delta';
    duration?: number;
  }) => void;
  getFrame: () => Promise<ImageBitmap | null>;
  close: () => void;
}

/**
 * Check if OffscreenCanvas and WebCodecs are supported
 */
export function isOffscreenDecoderSupported(): boolean {
  return (
    typeof OffscreenCanvas !== 'undefined' &&
    'VideoDecoder' in window &&
    typeof Worker !== 'undefined'
  );
}

/**
 * Hook for using video decoder in Web Worker
 */
export function useOffscreenDecoder(
  canvasRef: RefObject<HTMLCanvasElement>,
  config: DecoderConfig
): UseOffscreenDecoderReturn {
  const workerRef = useRef<Worker | null>(null);
  const pendingFrameResolveRef = useRef<((bitmap: ImageBitmap | null) => void) | null>(null);

  const [state, setState] = useState<DecoderState>({
    isSupported: isOffscreenDecoderSupported(),
    isInitialized: false,
    isDecoding: false,
    error: null,
    frameCount: 0,
    lastFrameTime: 0,
  });

  // Initialize worker and transfer canvas
  useEffect(() => {
    if (!canvasRef.current || !state.isSupported) {
      return;
    }

    try {
      // Create worker
      const worker = new Worker(
        new URL('../workers/videoDecoder.worker.ts', import.meta.url),
        { type: 'module' }
      );

      // Handle messages from worker
      worker.onmessage = (event) => {
        const { type, data, error } = event.data;

        switch (type) {
          case 'initialized':
            setState((s) => ({ ...s, isInitialized: true, error: null }));
            console.log('[OffscreenDecoder] Initialized:', data.config);
            break;

          case 'frame':
            setState((s) => ({
              ...s,
              frameCount: s.frameCount + 1,
              lastFrameTime: data.timestamp,
            }));
            break;

          case 'bitmap':
            if (pendingFrameResolveRef.current) {
              pendingFrameResolveRef.current(data);
              pendingFrameResolveRef.current = null;
            }
            break;

          case 'error':
            setState((s) => ({ ...s, error }));
            console.error('[OffscreenDecoder] Error:', error);
            if (pendingFrameResolveRef.current) {
              pendingFrameResolveRef.current(null);
              pendingFrameResolveRef.current = null;
            }
            break;

          case 'closed':
            setState((s) => ({ ...s, isInitialized: false }));
            break;
        }
      };

      worker.onerror = (error) => {
        setState((s) => ({ ...s, error: error.message }));
        console.error('[OffscreenDecoder] Worker error:', error);
      };

      // Transfer canvas to worker
      const offscreen = canvasRef.current.transferControlToOffscreen();

      worker.postMessage(
        {
          type: 'init',
          data: {
            canvas: offscreen,
            config,
          },
        },
        [offscreen]
      );

      workerRef.current = worker;

      return () => {
        worker.postMessage({ type: 'close' });
        worker.terminate();
        workerRef.current = null;
      };
    } catch (error) {
      setState((s) => ({
        ...s,
        error: error instanceof Error ? error.message : 'Failed to create worker',
      }));
    }
  }, [canvasRef, config, state.isSupported]);

  // Decode a video chunk
  const decode = useCallback(
    (chunk: {
      data: ArrayBuffer;
      timestamp: number;
      type: 'key' | 'delta';
      duration?: number;
    }) => {
      if (!workerRef.current || !state.isInitialized) {
        console.warn('[OffscreenDecoder] Not initialized');
        return;
      }

      workerRef.current.postMessage(
        {
          type: 'decode',
          data: chunk,
        },
        [chunk.data] // Transfer ArrayBuffer
      );
    },
    [state.isInitialized]
  );

  // Get current frame as ImageBitmap
  const getFrame = useCallback((): Promise<ImageBitmap | null> => {
    return new Promise((resolve) => {
      if (!workerRef.current || !state.isInitialized) {
        resolve(null);
        return;
      }

      pendingFrameResolveRef.current = resolve;
      workerRef.current.postMessage({ type: 'getFrame' });

      // Timeout after 100ms
      setTimeout(() => {
        if (pendingFrameResolveRef.current) {
          pendingFrameResolveRef.current(null);
          pendingFrameResolveRef.current = null;
        }
      }, 100);
    });
  }, [state.isInitialized]);

  // Close decoder
  const close = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'close' });
    }
  }, []);

  return {
    state,
    decode,
    getFrame,
    close,
  };
}

export default useOffscreenDecoder;
