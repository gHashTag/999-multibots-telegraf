import { useState, useRef, useCallback, useEffect } from 'react';
import './VideoProgress.css';

interface VideoProgressProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  showOnHover?: boolean;
}

export function VideoProgress({ videoRef, showOnHover = true }: VideoProgressProps) {
  const [progress, setProgress] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isVisible, setIsVisible] = useState(!showOnHover);
  const progressRef = useRef<HTMLDivElement>(null);

  // Update progress
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      if (!isDragging && video.duration) {
        setProgress((video.currentTime / video.duration) * 100);
      }
    };

    const handleProgress = () => {
      if (video.buffered.length > 0 && video.duration) {
        const bufferedEnd = video.buffered.end(video.buffered.length - 1);
        setBuffered((bufferedEnd / video.duration) * 100);
      }
    };

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('progress', handleProgress);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('progress', handleProgress);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [videoRef, isDragging]);

  // Seek on click/drag
  const handleSeek = useCallback((clientX: number) => {
    const video = videoRef.current;
    const progressBar = progressRef.current;
    if (!video || !progressBar || !video.duration) return;

    const rect = progressBar.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const newTime = percent * video.duration;

    video.currentTime = newTime;
    setProgress(percent * 100);
  }, [videoRef]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    handleSeek(e.clientX);
  }, [handleSeek]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setIsDragging(true);
    handleSeek(e.touches[0].clientX);
  }, [handleSeek]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      handleSeek(clientX);
    };

    const handleEnd = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleMove);
    window.addEventListener('touchend', handleEnd);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [isDragging, handleSeek]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className={`video-progress ${isVisible || isDragging ? 'visible' : ''}`}
      onMouseEnter={() => showOnHover && setIsVisible(true)}
      onMouseLeave={() => showOnHover && !isDragging && setIsVisible(false)}
    >
      <div
        ref={progressRef}
        className="video-progress__bar"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        <div className="video-progress__buffered" style={{ width: `${buffered}%` }} />
        <div className="video-progress__played" style={{ width: `${progress}%` }}>
          <div className="video-progress__thumb" />
        </div>
      </div>

      {duration > 0 && (
        <div className="video-progress__time">
          <span>{formatTime((progress / 100) * duration)}</span>
          <span>/</span>
          <span>{formatTime(duration)}</span>
        </div>
      )}
    </div>
  );
}
