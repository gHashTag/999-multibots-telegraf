import { useMemo } from 'react';
import './SnapIndicators.css';

interface SnapPoint {
  frame: number;
  type: 'start' | 'end' | 'playhead';
  trackIndex?: number;
}

interface SnapIndicatorsProps {
  snapPoints: SnapPoint[];
  activeSnapFrame: number | null;
  framesPerPixel: number;
  scrollLeft: number;
  containerWidth: number;
  containerHeight: number;
  showLabels?: boolean;
}

export function SnapIndicators({
  snapPoints,
  activeSnapFrame,
  framesPerPixel,
  scrollLeft,
  containerWidth,
  containerHeight,
  showLabels = false,
}: SnapIndicatorsProps) {
  // Find visible snap points
  const visibleSnapPoints = useMemo(() => {
    const leftFrame = scrollLeft * framesPerPixel;
    const rightFrame = (scrollLeft + containerWidth) * framesPerPixel;

    return snapPoints.filter(
      (point) => point.frame >= leftFrame && point.frame <= rightFrame
    );
  }, [snapPoints, scrollLeft, containerWidth, framesPerPixel]);

  // Get active snap line position
  const activeSnapPosition = useMemo(() => {
    if (activeSnapFrame === null) return null;
    return (activeSnapFrame / framesPerPixel) - scrollLeft;
  }, [activeSnapFrame, framesPerPixel, scrollLeft]);

  if (visibleSnapPoints.length === 0 && activeSnapFrame === null) {
    return null;
  }

  return (
    <div className="snap-indicators">
      {/* Passive snap point guides (subtle) */}
      {visibleSnapPoints.map((point, index) => {
        const x = (point.frame / framesPerPixel) - scrollLeft;

        return (
          <div
            key={`${point.type}-${point.frame}-${index}`}
            className={`snap-indicator snap-indicator--${point.type}`}
            style={{
              left: x,
              height: containerHeight,
            }}
          >
            {showLabels && (
              <span className="snap-indicator__label">
                {point.type === 'playhead' ? '▶' : point.type === 'start' ? '↦' : '↤'}
              </span>
            )}
          </div>
        );
      })}

      {/* Active snap line (highlighted when snapping) */}
      {activeSnapPosition !== null && (
        <div
          className="snap-indicator snap-indicator--active"
          style={{
            left: activeSnapPosition,
            height: containerHeight,
          }}
        >
          <div className="snap-indicator__glow" />
          <div className="snap-indicator__pulse" />
        </div>
      )}
    </div>
  );
}

// Hook for calculating snap points from track items
interface TrackItem {
  startFrame: number;
  durationFrames: number;
}

interface Track {
  items: TrackItem[];
}

export function useSnapPoints(
  tracks: Track[],
  currentFrame: number,
  snapThreshold: number = 5
): {
  snapPoints: SnapPoint[];
  getSnapFrame: (targetFrame: number) => { frame: number; snapped: boolean };
} {
  const snapPoints = useMemo(() => {
    const points: SnapPoint[] = [];

    // Add playhead as snap point
    points.push({ frame: currentFrame, type: 'playhead' });

    // Add all track item start/end points
    tracks.forEach((track, trackIndex) => {
      track.items.forEach((item) => {
        points.push({ frame: item.startFrame, type: 'start', trackIndex });
        points.push({
          frame: item.startFrame + item.durationFrames,
          type: 'end',
          trackIndex,
        });
      });
    });

    // Remove duplicates
    const unique = points.filter(
      (point, index, arr) =>
        arr.findIndex((p) => p.frame === point.frame && p.type === point.type) === index
    );

    return unique.sort((a, b) => a.frame - b.frame);
  }, [tracks, currentFrame]);

  const getSnapFrame = useMemo(() => {
    return (targetFrame: number) => {
      let closestPoint: SnapPoint | null = null;
      let closestDistance = Infinity;

      for (const point of snapPoints) {
        const distance = Math.abs(point.frame - targetFrame);
        if (distance < closestDistance && distance <= snapThreshold) {
          closestDistance = distance;
          closestPoint = point;
        }
      }

      if (closestPoint) {
        return { frame: closestPoint.frame, snapped: true };
      }

      return { frame: targetFrame, snapped: false };
    };
  }, [snapPoints, snapThreshold]);

  return { snapPoints, getSnapFrame };
}

// Snap line overlay for drag operations
interface DragSnapLineProps {
  frame: number | null;
  framesPerPixel: number;
  scrollLeft: number;
  height: number;
}

export function DragSnapLine({
  frame,
  framesPerPixel,
  scrollLeft,
  height,
}: DragSnapLineProps) {
  if (frame === null) return null;

  const x = (frame / framesPerPixel) - scrollLeft;

  return (
    <div
      className="drag-snap-line"
      style={{
        left: x,
        height,
      }}
    >
      <div className="drag-snap-line__indicator" />
    </div>
  );
}
