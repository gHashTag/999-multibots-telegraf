/**
 * useVideoFrameCallback - Frame-accurate video synchronization
 *
 * Research (2025):
 * - requestVideoFrameCallback syncs with actual video frame rate
 * - Better than requestAnimationFrame for video operations
 * - Provides metadata: presentedFrames, expectedDisplayTime, etc.
 *
 * @see https://web.dev/articles/requestvideoframecallback-rvfc
 */

import { useEffect, useRef, useCallback, RefObject } from 'react';

/**
 * Video frame metadata provided by requestVideoFrameCallback
 */
export interface VideoFrameMetadata {
  presentationTime: DOMHighResTimeStamp;
  expectedDisplayTime: DOMHighResTimeStamp;
  width: number;
  height: number;
  mediaTime: number;
  presentedFrames: number;
  processingDuration?: number;
  captureTime?: DOMHighResTimeStamp;
  receiveTime?: DOMHighResTimeStamp;
  rtpTimestamp?: number;
}

/**
 * Frame callback function type
 */
export type FrameCallback = (
  now: DOMHighResTimeStamp,
  metadata: VideoFrameMetadata
) => void;

/**
 * Check if requestVideoFrameCallback is supported
 */
export function isVideoFrameCallbackSupported(): boolean {
  return 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
}

/**
 * Hook for frame-accurate video operations
 *
 * Usage:
 * ```tsx
 * const videoRef = useRef<HTMLVideoElement>(null);
 *
 * useVideoFrameCallback(videoRef, (now, metadata) => {
 *   console.log('Frame:', metadata.presentedFrames);
 *   // Draw to canvas, analyze frame, etc.
 * });
 * ```
 */
export function useVideoFrameCallback(
  videoRef: RefObject<HTMLVideoElement>,
  callback: FrameCallback,
  options: {
    enabled?: boolean;
    onLateFrame?: (metadata: VideoFrameMetadata) => void;
  } = {}
): {
  isSupported: boolean;
  frameCount: number;
  droppedFrames: number;
} {
  const { enabled = true, onLateFrame } = options;

  const frameIdRef = useRef<number | null>(null);
  const frameCountRef = useRef(0);
  const droppedFramesRef = useRef(0);
  const lastPresentedFramesRef = useRef(0);

  const handleFrame = useCallback(
    (now: DOMHighResTimeStamp, metadata: VideoFrameMetadata) => {
      frameCountRef.current++;

      // Detect dropped frames
      if (lastPresentedFramesRef.current > 0) {
        const expectedFrames = lastPresentedFramesRef.current + 1;
        if (metadata.presentedFrames > expectedFrames) {
          const dropped = metadata.presentedFrames - expectedFrames;
          droppedFramesRef.current += dropped;
        }
      }
      lastPresentedFramesRef.current = metadata.presentedFrames;

      // Detect late frames (already rendered)
      // If expectedDisplayTime ≈ now, frame is late
      const isLate = Math.abs(metadata.expectedDisplayTime - now) < 0.01;
      if (isLate && onLateFrame) {
        onLateFrame(metadata);
      }

      // Call user callback
      callback(now, metadata);

      // Request next frame
      const video = videoRef.current;
      if (video && enabled) {
        frameIdRef.current = video.requestVideoFrameCallback(handleFrame);
      }
    },
    [callback, enabled, onLateFrame, videoRef]
  );

  useEffect(() => {
    const video = videoRef.current;

    if (!video || !enabled || !isVideoFrameCallbackSupported()) {
      return;
    }

    // Start frame callback loop
    frameIdRef.current = video.requestVideoFrameCallback(handleFrame);

    return () => {
      if (frameIdRef.current !== null && video) {
        video.cancelVideoFrameCallback(frameIdRef.current);
        frameIdRef.current = null;
      }
    };
  }, [videoRef, enabled, handleFrame]);

  return {
    isSupported: isVideoFrameCallbackSupported(),
    frameCount: frameCountRef.current,
    droppedFrames: droppedFramesRef.current,
  };
}

/**
 * Hook for drawing video frames to canvas with frame accuracy
 */
export function useVideoToCanvas(
  videoRef: RefObject<HTMLVideoElement>,
  canvasRef: RefObject<HTMLCanvasElement>,
  options: {
    enabled?: boolean;
    onDraw?: (ctx: CanvasRenderingContext2D, metadata: VideoFrameMetadata) => void;
  } = {}
): void {
  const { enabled = true, onDraw } = options;

  useVideoFrameCallback(
    videoRef,
    useCallback(
      (_now, metadata) => {
        const video = videoRef.current;
        const canvas = canvasRef.current;

        if (!video || !canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Resize canvas to match video
        if (canvas.width !== metadata.width || canvas.height !== metadata.height) {
          canvas.width = metadata.width;
          canvas.height = metadata.height;
        }

        // Draw video frame
        ctx.drawImage(video, 0, 0);

        // Optional post-draw callback
        onDraw?.(ctx, metadata);
      },
      [videoRef, canvasRef, onDraw]
    ),
    { enabled }
  );
}

/**
 * Hook for video frame metrics collection
 */
export function useVideoFrameMetrics(
  videoRef: RefObject<HTMLVideoElement>,
  options: { enabled?: boolean; sampleSize?: number } = {}
): {
  fps: number;
  avgProcessingTime: number;
  droppedFrameRate: number;
} {
  const { enabled = true, sampleSize = 30 } = options;

  const metricsRef = useRef({
    fps: 0,
    avgProcessingTime: 0,
    droppedFrameRate: 0,
  });

  const samplesRef = useRef<{ time: number; processing: number }[]>([]);
  const lastTimeRef = useRef(0);

  useVideoFrameCallback(
    videoRef,
    useCallback(
      (now, metadata) => {
        // Calculate FPS
        if (lastTimeRef.current > 0) {
          const delta = now - lastTimeRef.current;
          const instantFps = 1000 / delta;

          samplesRef.current.push({
            time: delta,
            processing: metadata.processingDuration || 0,
          });

          // Keep only last N samples
          if (samplesRef.current.length > sampleSize) {
            samplesRef.current.shift();
          }

          // Calculate averages
          const avgDelta =
            samplesRef.current.reduce((sum, s) => sum + s.time, 0) /
            samplesRef.current.length;
          const avgProcessing =
            samplesRef.current.reduce((sum, s) => sum + s.processing, 0) /
            samplesRef.current.length;

          metricsRef.current = {
            fps: 1000 / avgDelta,
            avgProcessingTime: avgProcessing,
            droppedFrameRate: 0, // TODO: calculate from presentedFrames gaps
          };
        }

        lastTimeRef.current = now;
      },
      [sampleSize]
    ),
    { enabled }
  );

  return metricsRef.current;
}

export default useVideoFrameCallback;
