/**
 * FirstFramePlaceholder - Instant visual feedback while video loads
 *
 * Based on TTFF research (2025):
 * - Critical threshold: <400ms for first visual
 * - 87% abandonment rate at 2s delay
 * - JPEG placeholder provides instant visual feedback
 *
 * Strategy:
 * 1. Show first-frame JPEG immediately (from pre-extracted images)
 * 2. Load video in background
 * 3. Crossfade when video ready to play
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';

interface FirstFramePlaceholderProps {
  videoUrl: string;
  style?: React.CSSProperties;
  className?: string;
  muted?: boolean;
  loop?: boolean;
  startFrom?: number;
  pauseWhenBuffering?: boolean;
  onVideoReady?: () => void;
  onFirstFrameVisible?: () => void;
  volume?: number;
}

/**
 * Convert video URL to first-frame JPEG URL
 * Convention: /path/video.mp4 → /path/video_first.jpg
 */
function getFirstFrameUrl(videoUrl: string): string {
  if (!videoUrl || videoUrl.startsWith('blob:')) return '';

  // Normalize to base video name: strip quality/format/optimization suffixes
  // bg00_opt.mp4 → bg00.mp4, bg00_720p.mp4 → bg00.mp4, bg00.av1.mp4 → bg00.mp4
  const cleanUrl = videoUrl
    .replace(/_360p\.mp4$/, '.mp4')
    .replace(/_720p\.mp4$/, '.mp4')
    .replace(/_1080p\.mp4$/, '.mp4')
    .replace(/_opt\.mp4$/, '.mp4')
    .replace(/\.av1\.mp4$/, '.mp4')
    .replace(/\.webm$/, '.mp4');

  return cleanUrl.replace(/\.mp4$/, '_first.jpg');
}

export const FirstFramePlaceholder: React.FC<FirstFramePlaceholderProps> = ({
  videoUrl,
  style,
  className = '',
  muted = true,
  loop = false,
  startFrom = 0,
  pauseWhenBuffering = true,
  onVideoReady,
  onFirstFrameVisible,
  volume = 1,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [showVideo, setShowVideo] = useState(false);

  const firstFrameUrl = getFirstFrameUrl(videoUrl);

  // Handle image load
  const handleImageLoad = useCallback(() => {
    setImageLoaded(true);
    onFirstFrameVisible?.();
  }, [onFirstFrameVisible]);

  // Handle image error (fallback to video)
  const handleImageError = useCallback(() => {
    setImageError(true);
    setShowVideo(true); // Show video immediately if no first frame
  }, []);

  // Handle video ready to play
  const handleCanPlay = useCallback(() => {
    setVideoLoaded(true);
    onVideoReady?.();

    // Crossfade to video after short delay
    requestAnimationFrame(() => {
      setShowVideo(true);
    });
  }, [onVideoReady]);

  // Set video start position
  useEffect(() => {
    const video = videoRef.current;
    if (video && startFrom > 0) {
      video.currentTime = startFrom / 30; // Assuming 30fps
    }
  }, [startFrom]);

  // Set volume
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.volume = volume;
    }
  }, [volume]);

  const containerStyle: React.CSSProperties = {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    ...style,
  };

  const mediaStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  };

  return (
    <div className={`first-frame-placeholder ${className}`} style={containerStyle}>
      {/* First-frame JPEG placeholder */}
      {firstFrameUrl && !imageError && (
        <img
          src={firstFrameUrl}
          alt="Video first frame"
          onLoad={handleImageLoad}
          onError={handleImageError}
          style={{
            ...mediaStyle,
            opacity: showVideo ? 0 : 1,
            transition: 'opacity 0.15s ease-out',
            zIndex: 1,
          }}
        />
      )}

      {/* Video element (loads in background) */}
      <video
        ref={videoRef}
        src={videoUrl}
        muted={muted}
        loop={loop}
        playsInline
        autoPlay
        onCanPlay={handleCanPlay}
        style={{
          ...mediaStyle,
          opacity: showVideo ? 1 : 0,
          transition: 'opacity 0.15s ease-in',
          zIndex: 2,
        }}
      />

      {/* Loading indicator (only if neither image nor video loaded) */}
      {!imageLoaded && !videoLoaded && !imageError && (
        <div
          style={{
            ...mediaStyle,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#000',
            zIndex: 0,
          }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              border: '2px solid rgba(255,255,255,0.3)',
              borderTopColor: 'white',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
        </div>
      )}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default FirstFramePlaceholder;
