/**
 * VideoSkeleton - Shimmer placeholder for loading videos
 *
 * Research (2025):
 * - Skeleton screens reduce perceived load time by 30-40%
 * - Users prefer skeleton over spinners (NN/g study)
 * - Shimmer animation signals "system is working"
 *
 * @see https://blog.logrocket.com/ux-design/skeleton-loading-screen-design/
 */

import { memo } from 'react';
import type { CSSProperties } from 'react';

interface VideoSkeletonProps {
  width?: number | string;
  height?: number | string;
  aspectRatio?: string;
  className?: string;
  style?: CSSProperties;
  showPlayButton?: boolean;
}

export const VideoSkeleton = memo(function VideoSkeleton({
  width = '100%',
  height,
  aspectRatio = '16/9',
  className = '',
  style = {},
  showPlayButton = true,
}: VideoSkeletonProps) {
  return (
    <div
      className={`video-skeleton ${className}`}
      style={{
        width,
        height: height || 'auto',
        aspectRatio: height ? undefined : aspectRatio,
        position: 'relative',
        background: 'linear-gradient(90deg, #1a1a1a 0%, #2a2a2a 50%, #1a1a1a 100%)',
        backgroundSize: '200% 100%',
        animation: 'video-skeleton-shimmer 1.5s ease-in-out infinite',
        borderRadius: '8px',
        overflow: 'hidden',
        ...style,
      }}
    >
      {/* Play button placeholder */}
      {showPlayButton && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '60px',
            height: '60px',
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Triangle play icon */}
          <div
            style={{
              width: 0,
              height: 0,
              borderLeft: '16px solid rgba(255, 255, 255, 0.3)',
              borderTop: '10px solid transparent',
              borderBottom: '10px solid transparent',
              marginLeft: '4px',
            }}
          />
        </div>
      )}

      {/* Duration placeholder */}
      <div
        style={{
          position: 'absolute',
          bottom: '12px',
          right: '12px',
          width: '40px',
          height: '16px',
          background: 'rgba(255, 255, 255, 0.1)',
          borderRadius: '4px',
        }}
      />

      {/* Inline styles for animation */}
      <style>{`
        @keyframes video-skeleton-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        @media (prefers-reduced-motion: reduce) {
          .video-skeleton {
            animation: none !important;
            background: #2a2a2a !important;
          }
        }
      `}</style>
    </div>
  );
});

export default VideoSkeleton;
