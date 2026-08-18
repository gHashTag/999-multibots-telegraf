/**
 * ThumbnailPreview - Sprite sheet based video thumbnails
 *
 * Research (2025):
 * - Single sprite image = -90% HTTP requests vs individual thumbnails
 * - WebVTT format for standardized thumbnail metadata
 *
 * @see https://www.fastpix.io/blog/create-video-previews-with-sprite-sheets-for-streaming
 */

import { useState, useEffect, useMemo, memo, CSSProperties } from 'react';

interface VTTCue {
  startTime: number;
  endTime: number;
  spriteUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ThumbnailPreviewProps {
  /** URL to sprite sheet image */
  spriteUrl: string;
  /** URL to WebVTT file with thumbnail coordinates */
  vttUrl: string;
  /** Current playback time in seconds */
  currentTime: number;
  /** Additional CSS class */
  className?: string;
  /** Additional inline styles */
  style?: CSSProperties;
  /** Called when thumbnail changes */
  onThumbnailChange?: (cue: VTTCue | null) => void;
}

/**
 * Parse WebVTT file content into cues
 */
function parseVTT(vttContent: string): VTTCue[] {
  const cues: VTTCue[] = [];
  const lines = vttContent.trim().split('\n');

  let i = 0;

  // Skip WEBVTT header
  while (i < lines.length && !lines[i].includes('-->')) {
    i++;
  }

  while (i < lines.length) {
    const line = lines[i].trim();

    // Parse timestamp line
    if (line.includes('-->')) {
      const [startStr, endStr] = line.split('-->').map((s) => s.trim());
      const startTime = parseTimestamp(startStr);
      const endTime = parseTimestamp(endStr);

      // Next line should be the sprite URL with coordinates
      i++;
      if (i < lines.length) {
        const urlLine = lines[i].trim();
        const match = urlLine.match(/(.+)#xywh=(\d+),(\d+),(\d+),(\d+)/);

        if (match) {
          cues.push({
            startTime,
            endTime,
            spriteUrl: match[1],
            x: parseInt(match[2], 10),
            y: parseInt(match[3], 10),
            width: parseInt(match[4], 10),
            height: parseInt(match[5], 10),
          });
        }
      }
    }

    i++;
  }

  return cues;
}

/**
 * Parse VTT timestamp (HH:MM:SS.mmm) to seconds
 */
function parseTimestamp(timestamp: string): number {
  const parts = timestamp.split(':');
  let seconds = 0;

  if (parts.length === 3) {
    // HH:MM:SS.mmm
    seconds += parseInt(parts[0], 10) * 3600;
    seconds += parseInt(parts[1], 10) * 60;
    seconds += parseFloat(parts[2]);
  } else if (parts.length === 2) {
    // MM:SS.mmm
    seconds += parseInt(parts[0], 10) * 60;
    seconds += parseFloat(parts[1]);
  }

  return seconds;
}

/**
 * ThumbnailPreview Component
 */
export const ThumbnailPreview = memo(function ThumbnailPreview({
  spriteUrl,
  vttUrl,
  currentTime,
  className = '',
  style = {},
  onThumbnailChange,
}: ThumbnailPreviewProps) {
  const [cues, setCues] = useState<VTTCue[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load and parse VTT file
  useEffect(() => {
    let isCancelled = false;

    async function loadVTT() {
      try {
        const response = await fetch(vttUrl);
        if (!response.ok) {
          throw new Error(`Failed to load VTT: ${response.status}`);
        }
        const text = await response.text();

        if (!isCancelled) {
          const parsedCues = parseVTT(text);
          setCues(parsedCues);
          setIsLoaded(true);
          setError(null);
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load thumbnails');
          setIsLoaded(false);
        }
      }
    }

    loadVTT();

    return () => {
      isCancelled = true;
    };
  }, [vttUrl]);

  // Find current cue based on time
  const currentCue = useMemo(() => {
    if (!isLoaded || cues.length === 0) return null;

    return cues.find((cue) => currentTime >= cue.startTime && currentTime < cue.endTime) || null;
  }, [cues, currentTime, isLoaded]);

  // Notify parent of thumbnail change
  useEffect(() => {
    onThumbnailChange?.(currentCue);
  }, [currentCue, onThumbnailChange]);

  if (error || !isLoaded || !currentCue) {
    return null;
  }

  // Build full sprite URL (relative to VTT location)
  const fullSpriteUrl = spriteUrl.startsWith('http')
    ? spriteUrl
    : new URL(currentCue.spriteUrl, new URL(vttUrl, window.location.href)).href;

  return (
    <div
      className={`thumbnail-preview ${className}`}
      style={{
        width: `${currentCue.width}px`,
        height: `${currentCue.height}px`,
        backgroundImage: `url(${fullSpriteUrl})`,
        backgroundPosition: `-${currentCue.x}px -${currentCue.y}px`,
        backgroundRepeat: 'no-repeat',
        borderRadius: '4px',
        overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
        ...style,
      }}
      role="img"
      aria-label={`Video preview at ${Math.floor(currentTime)} seconds`}
    />
  );
});

/**
 * Hook for thumbnail preview functionality
 */
export function useThumbnailPreview(vttUrl: string) {
  const [cues, setCues] = useState<VTTCue[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    fetch(vttUrl)
      .then((r) => r.text())
      .then((text) => {
        if (!isCancelled) {
          setCues(parseVTT(text));
          setIsLoaded(true);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setIsLoaded(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [vttUrl]);

  const getThumbnail = (time: number): VTTCue | null => {
    if (!isLoaded) return null;
    return cues.find((cue) => time >= cue.startTime && time < cue.endTime) || null;
  };

  return {
    isLoaded,
    cues,
    getThumbnail,
  };
}

export default ThumbnailPreview;
