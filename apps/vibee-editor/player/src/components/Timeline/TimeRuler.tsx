import { useMemo } from 'react';
import './TimeRuler.css';

interface TimeRulerProps {
  duration: number;
  fps: number;
  pxPerFrame: number;
}

export function TimeRuler({ duration, fps, pxPerFrame }: TimeRulerProps) {
  const markers = useMemo(() => {
    const result: Array<{ frame: number; label: string; isMajor: boolean }> = [];

    // Determine marker interval based on zoom level
    let frameInterval: number;
    if (pxPerFrame >= 4) {
      frameInterval = fps; // Every second
    } else if (pxPerFrame >= 2) {
      frameInterval = fps * 5; // Every 5 seconds
    } else if (pxPerFrame >= 1) {
      frameInterval = fps * 10; // Every 10 seconds
    } else {
      frameInterval = fps * 30; // Every 30 seconds
    }

    for (let frame = 0; frame <= duration; frame += frameInterval) {
      const seconds = frame / fps;
      const minutes = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      const label = `${minutes}:${secs.toString().padStart(2, '0')}`;

      result.push({
        frame,
        label,
        isMajor: (frame / fps) % 10 === 0,
      });
    }

    return result;
  }, [duration, fps, pxPerFrame]);

  return (
    <div className="time-ruler">
      {markers.map((marker) => (
        <div
          key={marker.frame}
          className={`time-marker ${marker.isMajor ? 'major' : ''}`}
          style={{ left: marker.frame * pxPerFrame }}
        >
          <span className="time-marker-label">{marker.label}</span>
          <div className="time-marker-line" />
        </div>
      ))}
    </div>
  );
}
