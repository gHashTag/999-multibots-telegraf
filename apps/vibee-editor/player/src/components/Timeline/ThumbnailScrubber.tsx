import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import './ThumbnailScrubber.css';

interface ThumbnailScrubberProps {
  videoUrl: string;
  duration: number; // in frames
  fps: number;
  width: number;
  height: number;
  currentFrame: number;
  onScrub?: (frame: number) => void;
  thumbnailCount?: number;
}

export function ThumbnailScrubber({
  videoUrl,
  duration,
  fps,
  width,
  height,
  currentFrame,
  onScrub,
  thumbnailCount = 10,
}: ThumbnailScrubberProps) {
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hoverPosition, setHoverPosition] = useState<number | null>(null);
  const [hoverFrame, setHoverFrame] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Generate thumbnails
  useEffect(() => {
    if (!videoUrl) return;

    const video = document.createElement('video');
    video.src = videoUrl;
    video.crossOrigin = 'anonymous';
    video.muted = true;
    videoRef.current = video;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const durationSeconds = duration / fps;
    const thumbWidth = Math.floor(width / thumbnailCount);
    const thumbHeight = height;

    canvas.width = thumbWidth;
    canvas.height = thumbHeight;

    const capturedThumbs: string[] = [];
    let currentIndex = 0;

    const captureFrame = () => {
      if (currentIndex >= thumbnailCount) {
        setThumbnails(capturedThumbs);
        setIsLoading(false);
        video.remove();
        return;
      }

      const time = (currentIndex / thumbnailCount) * durationSeconds;
      video.currentTime = time;
    };

    video.onseeked = () => {
      ctx.drawImage(video, 0, 0, thumbWidth, thumbHeight);
      capturedThumbs.push(canvas.toDataURL('image/jpeg', 0.6));
      currentIndex++;
      captureFrame();
    };

    video.onloadedmetadata = () => {
      captureFrame();
    };

    video.onerror = () => {
      setIsLoading(false);
    };

    return () => {
      video.remove();
    };
  }, [videoUrl, duration, fps, width, height, thumbnailCount]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const progress = Math.max(0, Math.min(1, x / width));
      const frame = Math.floor(progress * duration);

      setHoverPosition(x);
      setHoverFrame(frame);
    },
    [width, duration]
  );

  const handleMouseLeave = useCallback(() => {
    setHoverPosition(null);
    setHoverFrame(null);
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!onScrub || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const progress = Math.max(0, Math.min(1, x / width));
      const frame = Math.floor(progress * duration);

      onScrub(frame);
    },
    [onScrub, width, duration]
  );

  const formatTime = useCallback(
    (frame: number) => {
      const seconds = frame / fps;
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    },
    [fps]
  );

  const progressPercent = (currentFrame / duration) * 100;

  if (isLoading) {
    return (
      <div className="thumbnail-scrubber thumbnail-scrubber--loading" style={{ width, height }}>
        <div className="thumbnail-scrubber__skeleton">
          {Array.from({ length: thumbnailCount }).map((_, i) => (
            <div
              key={i}
              className="thumbnail-scrubber__skeleton-thumb"
              style={{ width: width / thumbnailCount }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="thumbnail-scrubber"
      style={{ width, height }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      {/* Thumbnail strip */}
      <div className="thumbnail-scrubber__strip">
        {thumbnails.map((thumb, i) => (
          <img
            key={i}
            src={thumb}
            alt=""
            className="thumbnail-scrubber__thumb"
            style={{ width: width / thumbnailCount }}
            draggable={false}
          />
        ))}
      </div>

      {/* Progress overlay */}
      <div
        className="thumbnail-scrubber__progress"
        style={{ width: `${progressPercent}%` }}
      />

      {/* Hover preview */}
      {hoverPosition !== null && hoverFrame !== null && (
        <div
          className="thumbnail-scrubber__hover"
          style={{ left: hoverPosition }}
        >
          <div className="thumbnail-scrubber__hover-line" />
          <div className="thumbnail-scrubber__hover-time">
            {formatTime(hoverFrame)}
          </div>
        </div>
      )}

      {/* Current position indicator */}
      <div
        className="thumbnail-scrubber__playhead"
        style={{ left: `${progressPercent}%` }}
      />
    </div>
  );
}

// Simplified thumbnail strip for track items
interface ThumbnailStripProps {
  videoUrl: string;
  width: number;
  height: number;
  startFrame?: number;
  endFrame?: number;
  fps?: number;
}

export function ThumbnailStrip({
  videoUrl,
  width,
  height,
  startFrame = 0,
  endFrame,
  fps = 30,
}: ThumbnailStripProps) {
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const thumbCount = useMemo(() => Math.max(3, Math.floor(width / 60)), [width]);

  useEffect(() => {
    if (!videoUrl) return;

    const video = document.createElement('video');
    video.src = videoUrl;
    video.crossOrigin = 'anonymous';
    video.muted = true;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 60;
    canvas.height = height;

    const thumbs: string[] = [];
    let index = 0;

    video.onloadedmetadata = () => {
      const totalDuration = endFrame ? (endFrame - startFrame) / fps : video.duration;
      const startTime = startFrame / fps;

      const captureNext = () => {
        if (index >= thumbCount) {
          setThumbnails(thumbs);
          video.remove();
          return;
        }

        video.currentTime = startTime + (index / thumbCount) * totalDuration;
      };

      video.onseeked = () => {
        ctx.drawImage(video, 0, 0, 60, height);
        thumbs.push(canvas.toDataURL('image/jpeg', 0.5));
        index++;
        captureNext();
      };

      captureNext();
    };

    return () => {
      video.remove();
    };
  }, [videoUrl, width, height, startFrame, endFrame, fps, thumbCount]);

  if (thumbnails.length === 0) {
    return (
      <div className="thumbnail-strip thumbnail-strip--loading" style={{ width, height }}>
        {Array.from({ length: thumbCount }).map((_, i) => (
          <div key={i} className="thumbnail-strip__placeholder" style={{ width: width / thumbCount }} />
        ))}
      </div>
    );
  }

  return (
    <div className="thumbnail-strip" style={{ width, height }}>
      {thumbnails.map((thumb, i) => (
        <img
          key={i}
          src={thumb}
          alt=""
          className="thumbnail-strip__thumb"
          style={{ width: width / thumbCount }}
          draggable={false}
        />
      ))}
    </div>
  );
}
