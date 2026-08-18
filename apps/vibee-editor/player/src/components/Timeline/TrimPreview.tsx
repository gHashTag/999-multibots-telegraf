import { memo, useEffect, useRef, useState } from 'react';
import './TrimPreview.css';

interface TrimPreviewProps {
  videoUrl: string;
  frameTime: number; // Time in seconds
  x: number; // Position from left
  y: number; // Position from top
  visible: boolean;
}

export const TrimPreview = memo(function TrimPreview({
  videoUrl,
  frameTime,
  x,
  y,
  visible,
}: TrimPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Generate thumbnail from video frame
  useEffect(() => {
    if (!visible || !videoUrl) {
      setThumbnail(null);
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    setIsLoading(true);

    const handleSeek = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Set canvas size
      canvas.width = 120;
      canvas.height = 68;

      // Draw video frame
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Get thumbnail data URL
      setThumbnail(canvas.toDataURL('image/jpeg', 0.7));
      setIsLoading(false);
    };

    video.src = videoUrl;
    video.currentTime = Math.max(0, frameTime);
    video.onseeked = handleSeek;
    video.onerror = () => {
      setIsLoading(false);
      setThumbnail(null);
    };

    return () => {
      video.onseeked = null;
      video.onerror = null;
    };
  }, [videoUrl, frameTime, visible]);

  if (!visible) return null;

  return (
    <>
      {/* Hidden video element for frame extraction */}
      <video
        ref={videoRef}
        style={{ display: 'none' }}
        crossOrigin="anonymous"
        muted
        playsInline
      />
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Preview popup */}
      <div
        className={`trim-preview ${isLoading ? 'loading' : ''}`}
        style={{
          left: x,
          top: y,
        }}
      >
        {thumbnail ? (
          <img src={thumbnail} alt="Trim preview" className="trim-preview-image" />
        ) : (
          <div className="trim-preview-placeholder">
            {isLoading ? '...' : ''}
          </div>
        )}
        <div className="trim-preview-time">
          {formatTime(frameTime)}
        </div>
      </div>
    </>
  );
});

// Format time as MM:SS.ms
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}
