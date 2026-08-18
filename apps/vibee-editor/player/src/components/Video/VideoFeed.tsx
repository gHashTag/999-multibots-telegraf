import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { LazyVideo } from './LazyVideo';
import { BRAND_COLORS } from '@vibee/atoms';

interface VideoItem {
  id: string;
  src: string;
  hlsSrc?: string;
  poster?: string;
  duration?: number;
}

interface VideoFeedProps {
  videos: VideoItem[];
  className?: string;
  onVideoChange?: (index: number, video: VideoItem) => void;
  onVideoEnd?: (index: number, video: VideoItem) => void;
  preloadAhead?: number;  // Videos to preload ahead (default: 5)
  preloadBehind?: number; // Videos to preload behind (default: 1)
  autoPlay?: boolean;
}

interface ScrollState {
  currentIndex: number;
  scrollDirection: 'up' | 'down' | 'idle';
  scrollVelocity: number;
}

/**
 * VideoFeed - TikTok/Reels style vertical video feed with optimizations
 *
 * Optimizations implemented:
 * 1. Directional prefetching (5 ahead, 1 behind)
 * 2. Scroll-aware video pausing/playing
 * 3. Memory management via source nulling
 * 4. Snap scrolling for full-screen videos
 * 5. Network-aware quality selection
 *
 * @see https://www.mux.com/blog/slop-social
 * @see https://www.fastpix.io/blog/strategies-to-optimize-performance-of-short-video-apps
 */
export const VideoFeed: React.FC<VideoFeedProps> = ({
  videos,
  className = '',
  onVideoChange,
  onVideoEnd,
  preloadAhead = 5,
  preloadBehind = 1,
  autoPlay = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const lastScrollY = useRef(0);
  const scrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [scrollState, setScrollState] = useState<ScrollState>({
    currentIndex: 0,
    scrollDirection: 'idle',
    scrollVelocity: 0,
  });

  const [networkQuality, setNetworkQuality] = useState<'slow' | 'medium' | 'fast'>('fast');

  // Detect network quality for adaptive preloading
  useEffect(() => {
    const connection = (navigator as any).connection;
    if (connection) {
      const updateNetwork = () => {
        const effectiveType = connection.effectiveType;
        if (effectiveType === '4g') {
          setNetworkQuality('fast');
        } else if (effectiveType === '3g') {
          setNetworkQuality('medium');
        } else {
          setNetworkQuality('slow');
        }
      };
      updateNetwork();
      connection.addEventListener('change', updateNetwork);
      return () => connection.removeEventListener('change', updateNetwork);
    }
  }, []);

  // Calculate which videos should be preloaded based on scroll direction
  const preloadWindow = useMemo(() => {
    const { currentIndex, scrollDirection } = scrollState;
    const ahead = scrollDirection === 'up' ? preloadBehind : preloadAhead;
    const behind = scrollDirection === 'up' ? preloadAhead : preloadBehind;

    // Reduce preload on slow networks
    const networkMultiplier = networkQuality === 'slow' ? 0.5 : networkQuality === 'medium' ? 0.75 : 1;
    const adjustedAhead = Math.ceil(ahead * networkMultiplier);
    const adjustedBehind = Math.ceil(behind * networkMultiplier);

    const start = Math.max(0, currentIndex - adjustedBehind);
    const end = Math.min(videos.length - 1, currentIndex + adjustedAhead);

    return { start, end, currentIndex };
  }, [scrollState, preloadAhead, preloadBehind, videos.length, networkQuality]);

  // Check if a video should be loaded
  const shouldLoadVideo = useCallback((index: number): boolean => {
    const { start, end } = preloadWindow;
    return index >= start && index <= end;
  }, [preloadWindow]);

  // Check if a video should play
  const shouldPlayVideo = useCallback((index: number): boolean => {
    return index === preloadWindow.currentIndex && autoPlay;
  }, [preloadWindow.currentIndex, autoPlay]);

  // Handle scroll events with velocity detection
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const scrollY = container.scrollTop;
    const itemHeight = container.clientHeight;
    const newIndex = Math.round(scrollY / itemHeight);

    // Calculate scroll direction and velocity
    const delta = scrollY - lastScrollY.current;
    const direction = delta > 0 ? 'down' : delta < 0 ? 'up' : 'idle';
    const velocity = Math.abs(delta);

    lastScrollY.current = scrollY;

    setScrollState((prev) => {
      if (prev.currentIndex !== newIndex || prev.scrollDirection !== direction) {
        return {
          currentIndex: newIndex,
          scrollDirection: direction as 'up' | 'down' | 'idle',
          scrollVelocity: velocity,
        };
      }
      return prev;
    });

    // Debounce direction reset
    if (scrollTimeout.current) {
      clearTimeout(scrollTimeout.current);
    }
    scrollTimeout.current = setTimeout(() => {
      setScrollState((prev) => ({ ...prev, scrollDirection: 'idle' }));
    }, 150);
  }, []);

  // Notify parent when video changes
  useEffect(() => {
    const { currentIndex } = scrollState;
    if (onVideoChange && videos[currentIndex]) {
      onVideoChange(currentIndex, videos[currentIndex]);
    }
  }, [scrollState.currentIndex, onVideoChange, videos]);

  // Pause all videos except current
  useEffect(() => {
    const { currentIndex } = scrollState;

    videoRefs.current.forEach((video, id) => {
      const index = videos.findIndex((v) => v.id === id);
      if (index === currentIndex) {
        video.play().catch(() => {});
        video.muted = false;
      } else {
        video.pause();
        video.muted = true;
      }
    });
  }, [scrollState.currentIndex, videos]);

  // Register video ref
  const registerVideoRef = useCallback((id: string, ref: HTMLVideoElement | null) => {
    if (ref) {
      videoRefs.current.set(id, ref);
    } else {
      videoRefs.current.delete(id);
    }
  }, []);

  // Handle video end
  const handleVideoEnd = useCallback((index: number) => {
    if (onVideoEnd && videos[index]) {
      onVideoEnd(index, videos[index]);
    }

    // Auto-advance to next video
    const container = containerRef.current;
    if (container && index < videos.length - 1) {
      container.scrollTo({
        top: (index + 1) * container.clientHeight,
        behavior: 'smooth',
      });
    }
  }, [onVideoEnd, videos]);

  return (
    <div
      ref={containerRef}
      className={`video-feed ${className}`}
      onScroll={handleScroll}
      style={{
        height: '100vh',
        width: '100%',
        overflowY: 'scroll',
        scrollSnapType: 'y mandatory',
        scrollBehavior: 'smooth',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {videos.map((video, index) => (
        <div
          key={video.id}
          className="video-feed-item"
          style={{
            height: '100vh',
            width: '100%',
            scrollSnapAlign: 'start',
            scrollSnapStop: 'always',
            position: 'relative',
          }}
        >
          {shouldLoadVideo(index) ? (
            <VideoFeedItem
              video={video}
              index={index}
              isActive={shouldPlayVideo(index)}
              networkQuality={networkQuality}
              onVideoRef={(ref) => registerVideoRef(video.id, ref)}
              onVideoEnd={() => handleVideoEnd(index)}
            />
          ) : (
            // Placeholder for unloaded videos (memory optimization)
            <div
              style={{
                width: '100%',
                height: '100%',
                backgroundColor: '#000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {video.poster && (
                <img
                  src={video.poster}
                  alt=""
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    opacity: 0.5,
                  }}
                  loading="lazy"
                />
              )}
            </div>
          )}
        </div>
      ))}

      {/* Scroll indicator */}
      <div
        style={{
          position: 'fixed',
          right: 10,
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {videos.map((_, index) => (
          <div
            key={index}
            style={{
              width: 4,
              height: 20,
              borderRadius: 2,
              backgroundColor:
                index === scrollState.currentIndex
                  ? BRAND_COLORS.amber
                  : 'rgba(255,255,255,0.3)',
              transition: 'background-color 0.2s',
            }}
          />
        ))}
      </div>
    </div>
  );
};

// Individual video item component with ref forwarding
interface VideoFeedItemProps {
  video: VideoItem;
  index: number;
  isActive: boolean;
  networkQuality: 'slow' | 'medium' | 'fast';
  onVideoRef: (ref: HTMLVideoElement | null) => void;
  onVideoEnd: () => void;
}

const VideoFeedItem: React.FC<VideoFeedItemProps> = ({
  video,
  isActive,
  networkQuality,
  onVideoRef,
  onVideoEnd,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Register ref with parent
  useEffect(() => {
    onVideoRef(videoRef.current);
    return () => onVideoRef(null);
  }, [onVideoRef]);

  // Determine quality based on network
  const quality = useMemo(() => {
    switch (networkQuality) {
      case 'slow':
        return '360p';
      case 'medium':
        return '480p';
      default:
        return 'auto';
    }
  }, [networkQuality]);

  return (
    <LazyVideo
      src={video.src}
      hlsSrc={video.hlsSrc}
      poster={video.poster}
      autoPlay={isActive}
      muted={!isActive}
      loop
      controls={false}
      preload="metadata"
      quality={quality}
      threshold={0}
      rootMargin="200px"
      onLoad={() => {
        if (isActive && videoRef.current) {
          videoRef.current.play().catch(() => {});
        }
      }}
      className="video-feed-video"
    />
  );
};

export default VideoFeed;
