// ===============================
// Vertical Feed - TikTok-style swipe feed
// ===============================

import { useRef, useCallback, useEffect, useState } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  feedTemplatesAtom,
  followingFeedTemplatesAtom,
  feedTypeAtom,
  currentFeedIndexAtom,
  loadFeedAtom,
  feedLoadingAtom,
  feedHasMoreAtom,
  type FeedTemplate,
} from '@/atoms/feed';
import { useVideoPreload } from '@/hooks/useVideoPreload';
import { useVideoAutoplay } from '@/hooks/useVideoAutoplay';
import { FeedTabsCompact } from './FeedTabs';
import { VerticalFeedItem } from './VerticalFeedItem';
import './VerticalFeed.css';

interface VerticalFeedProps {
  onVideoClick?: (template: FeedTemplate) => void;
}

export function VerticalFeed({ onVideoClick }: VerticalFeedProps) {
  const feedType = useAtomValue(feedTypeAtom);
  const forYouTemplates = useAtomValue(feedTemplatesAtom);
  const followingTemplates = useAtomValue(followingFeedTemplatesAtom);
  const [currentIndex, setCurrentIndex] = useAtom(currentFeedIndexAtom);
  const loadFeed = useSetAtom(loadFeedAtom);
  const isLoading = useAtomValue(feedLoadingAtom);
  const hasMore = useAtomValue(feedHasMoreAtom);

  const templates = feedType === 'for_you' ? forYouTemplates : followingTemplates;
  const containerRef = useRef<HTMLDivElement>(null);
  const [isScrolling, setIsScrolling] = useState(false);

  // Video preloading
  const videoItems = templates.map(t => ({ id: t.id, videoUrl: t.videoUrl }));
  const { preloadNext, isPreloaded } = useVideoPreload(videoItems, currentIndex, {
    preloadCount: 2,
    maxConcurrent: 2,
  });

  // Load initial feed
  useEffect(() => {
    if (templates.length === 0) {
      loadFeed(true);
    }
  }, [feedType, templates.length, loadFeed]);

  // Handle scroll to detect current video
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container || isScrolling) return;

    const scrollTop = container.scrollTop;
    const itemHeight = container.clientHeight;
    const newIndex = Math.round(scrollTop / itemHeight);

    if (newIndex !== currentIndex && newIndex >= 0 && newIndex < templates.length) {
      setCurrentIndex(newIndex);

      // Preload next videos
      preloadNext();

      // Load more when near end
      if (newIndex >= templates.length - 3 && hasMore && !isLoading) {
        loadFeed();
      }
    }
  }, [currentIndex, templates.length, hasMore, isLoading, loadFeed, preloadNext, setCurrentIndex, isScrolling]);

  // Snap scroll to current video
  const scrollToIndex = useCallback((index: number) => {
    const container = containerRef.current;
    if (!container) return;

    setIsScrolling(true);
    container.scrollTo({
      top: index * container.clientHeight,
      behavior: 'smooth',
    });

    setTimeout(() => setIsScrolling(false), 500);
  }, []);

  // Handle swipe navigation
  const handleSwipe = useCallback((direction: 'up' | 'down') => {
    const newIndex = direction === 'up'
      ? Math.min(currentIndex + 1, templates.length - 1)
      : Math.max(currentIndex - 1, 0);

    if (newIndex !== currentIndex) {
      setCurrentIndex(newIndex);
      scrollToIndex(newIndex);
    }
  }, [currentIndex, templates.length, scrollToIndex, setCurrentIndex]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        handleSwipe('up');
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        handleSwipe('down');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSwipe]);

  return (
    <div className="vertical-feed">
      {/* Header with tabs */}
      <div className="vertical-feed__header">
        <FeedTabsCompact />
      </div>

      {/* Feed container */}
      <div
        ref={containerRef}
        className="vertical-feed__container"
        onScroll={handleScroll}
      >
        {templates.map((template, index) => (
          <VerticalFeedItem
            key={template.id}
            template={template}
            isActive={index === currentIndex}
            isPreloaded={isPreloaded(template.videoUrl)}
            onClick={() => onVideoClick?.(template)}
          />
        ))}

        {/* Loading indicator */}
        {isLoading && (
          <div className="vertical-feed__loading">
            <div className="vertical-feed__spinner" />
          </div>
        )}

        {/* Empty state */}
        {!isLoading && templates.length === 0 && (
          <div className="vertical-feed__empty">
            <span className="vertical-feed__empty-icon">📹</span>
            <p>No videos yet</p>
          </div>
        )}
      </div>

      {/* Progress dots */}
      <div className="vertical-feed__progress">
        {templates.slice(Math.max(0, currentIndex - 2), currentIndex + 3).map((t, i) => {
          const actualIndex = Math.max(0, currentIndex - 2) + i;
          return (
            <div
              key={t.id}
              className={`vertical-feed__dot ${actualIndex === currentIndex ? 'vertical-feed__dot--active' : ''}`}
              onClick={() => {
                setCurrentIndex(actualIndex);
                scrollToIndex(actualIndex);
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
