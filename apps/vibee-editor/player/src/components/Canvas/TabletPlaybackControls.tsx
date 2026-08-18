import { useCallback, useRef, useState } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  currentFrameAtom,
  isPlayingAtom,
  projectAtom,
  togglePlayAtom,
  seekToAtom,
} from '@/atoms';
import { Play, Pause, SkipBack, SkipForward, ZoomIn } from 'lucide-react';
import { useIsTablet } from '@/hooks/useMediaQuery';
import './TabletPlaybackControls.css';

// Format frame to time string (MM:SS)
function formatTime(frame: number, fps: number): string {
  const totalSeconds = Math.floor(frame / fps);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function TabletPlaybackControls() {
  const isTablet = useIsTablet();
  const scrubberRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const currentFrame = useAtomValue(currentFrameAtom);
  const isPlaying = useAtomValue(isPlayingAtom);
  const project = useAtomValue(projectAtom);
  const togglePlay = useSetAtom(togglePlayAtom);
  const seekTo = useSetAtom(seekToAtom);

  const progress = (currentFrame / project.durationInFrames) * 100;

  // Skip 5 seconds (150 frames at 30fps)
  const skipFrames = Math.round(project.fps * 5);

  const handleSkipBack = useCallback(() => {
    const newFrame = Math.max(0, currentFrame - skipFrames);
    seekTo(newFrame);
  }, [currentFrame, skipFrames, seekTo]);

  const handleSkipForward = useCallback(() => {
    const newFrame = Math.min(project.durationInFrames - 1, currentFrame + skipFrames);
    seekTo(newFrame);
  }, [currentFrame, project.durationInFrames, skipFrames, seekTo]);

  // Scrubber interaction
  const handleScrubberClick = useCallback((e: React.MouseEvent) => {
    if (!scrubberRef.current) return;
    const rect = scrubberRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    const newFrame = Math.round(percent * project.durationInFrames);
    seekTo(newFrame);
  }, [project.durationInFrames, seekTo]);

  const handleScrubberDrag = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!scrubberRef.current) return;
    const rect = scrubberRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const x = clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    const newFrame = Math.round(percent * project.durationInFrames);
    seekTo(newFrame);
  }, [project.durationInFrames, seekTo]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    handleScrubberClick(e);
  }, [handleScrubberClick]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      handleScrubberDrag(e);
    }
  }, [isDragging, handleScrubberDrag]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setIsDragging(true);
    handleScrubberDrag(e);
  }, [handleScrubberDrag]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (isDragging) {
      handleScrubberDrag(e);
    }
  }, [isDragging, handleScrubberDrag]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Only show on tablet
  if (!isTablet) return null;

  return (
    <div className="tablet-playback-controls">
      {/* Transport buttons */}
      <div className="tablet-transport">
        <button
          className="tablet-transport-btn"
          onClick={handleSkipBack}
          aria-label="Skip back 5 seconds"
        >
          <SkipBack size={20} />
        </button>

        <button
          className="tablet-play-btn"
          onClick={() => togglePlay()}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause size={24} /> : <Play size={24} />}
        </button>

        <button
          className="tablet-transport-btn"
          onClick={handleSkipForward}
          aria-label="Skip forward 5 seconds"
        >
          <SkipForward size={20} />
        </button>
      </div>

      {/* Scrubber */}
      <div className="tablet-scrubber-container">
        <span className="tablet-time">{formatTime(currentFrame, project.fps)}</span>

        <div
          ref={scrubberRef}
          className="tablet-scrubber"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="tablet-scrubber-track">
            <div
              className="tablet-scrubber-progress"
              style={{ width: `${progress}%` }}
            />
            <div
              className="tablet-scrubber-thumb"
              style={{ left: `${progress}%` }}
            />
          </div>
        </div>

        <span className="tablet-time">{formatTime(project.durationInFrames, project.fps)}</span>

        <button className="tablet-zoom-btn" aria-label="Zoom">
          <ZoomIn size={18} />
        </button>
      </div>
    </div>
  );
}
