import React, { useRef, useCallback, useState, useMemo, memo, useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { tracksAtom, currentFrameAtom } from '@/atoms';
import { TRACK_COLORS } from '@vibee/atoms';
import './TimelineMinimap.css';

interface TimelineMinimapProps {
  totalFrames: number;
  visibleStartFrame: number;
  visibleEndFrame: number;
  onNavigate: (frame: number) => void;
}

// TRACK_COLORS imported from @vibee/atoms

export const TimelineMinimap = memo(function TimelineMinimap({
  totalFrames,
  visibleStartFrame,
  visibleEndFrame,
  onNavigate,
}: TimelineMinimapProps) {
  const tracks = useAtomValue(tracksAtom);
  const currentFrame = useAtomValue(currentFrameAtom);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Calculate visible area as percentage
  const visibleWidth = useMemo(() => {
    if (totalFrames <= 0) return 100;
    return Math.min(100, ((visibleEndFrame - visibleStartFrame) / totalFrames) * 100);
  }, [totalFrames, visibleStartFrame, visibleEndFrame]);

  const visibleLeft = useMemo(() => {
    if (totalFrames <= 0) return 0;
    return (visibleStartFrame / totalFrames) * 100;
  }, [totalFrames, visibleStartFrame]);

  // Playhead position as percentage
  const playheadPosition = useMemo(() => {
    if (totalFrames <= 0) return 0;
    return (currentFrame / totalFrames) * 100;
  }, [totalFrames, currentFrame]);

  // Handle click to navigate
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const percentage = clickX / rect.width;
      const targetFrame = Math.round(percentage * totalFrames);

      onNavigate(Math.max(0, Math.min(totalFrames, targetFrame)));
    },
    [totalFrames, onNavigate]
  );

  // Handle viewport drag
  const handleViewportMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const percentage = mouseX / rect.width;
      const viewportCenter = percentage * totalFrames;
      const viewportWidth = visibleEndFrame - visibleStartFrame;
      const targetFrame = Math.round(viewportCenter - viewportWidth / 2);

      onNavigate(Math.max(0, Math.min(totalFrames - viewportWidth, targetFrame)));
    },
    [isDragging, totalFrames, visibleStartFrame, visibleEndFrame, onNavigate]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Add global mouse listeners for drag
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Render track items as colored rectangles
  const trackItems = useMemo(() => {
    const items: React.ReactNode[] = [];
    const trackHeight = 100 / Math.max(1, tracks.length);

    tracks.forEach((track, trackIndex) => {
      track.items.forEach((item) => {
        const left = totalFrames > 0 ? (item.startFrame / totalFrames) * 100 : 0;
        const width = totalFrames > 0 ? (item.durationInFrames / totalFrames) * 100 : 0;
        const top = trackIndex * trackHeight;
        const color = TRACK_COLORS[track.type] || '#666';

        items.push(
          <div
            key={item.id}
            className="minimap-item"
            style={{
              left: `${left}%`,
              width: `${Math.max(0.5, width)}%`,
              top: `${top}%`,
              height: `${trackHeight}%`,
              backgroundColor: color,
            }}
          />
        );
      });
    });

    return items;
  }, [tracks, totalFrames]);

  return (
    <div
      ref={containerRef}
      className="timeline-minimap"
      onClick={handleClick}
    >
      {/* Track items */}
      <div className="minimap-tracks">
        {trackItems}
      </div>

      {/* Playhead */}
      <div
        className="minimap-playhead"
        style={{ left: `${playheadPosition}%` }}
      />

      {/* Viewport indicator */}
      <div
        className={`minimap-viewport ${isDragging ? 'dragging' : ''}`}
        style={{
          left: `${visibleLeft}%`,
          width: `${Math.max(2, visibleWidth)}%`,
        }}
        onMouseDown={handleViewportMouseDown}
      />
    </div>
  );
});
