import { useState, useRef, useCallback, useEffect } from 'react';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';
import './Stories.css';

export interface Story {
  id: string;
  userId: number;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  createdAt: string;
  isViewed: boolean;
  duration?: number;
}

export interface StoryGroup {
  userId: number;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  stories: Story[];
  hasUnviewed: boolean;
}

interface StoriesProps {
  storyGroups: StoryGroup[];
  onStoryClick: (group: StoryGroup, storyIndex: number) => void;
  onAddStory?: () => void;
  currentUserAvatar?: string;
}

export function Stories({
  storyGroups,
  onStoryClick,
  onAddStory,
  currentUserAvatar,
}: StoriesProps) {
  const { t } = useLanguage();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;

    setCanScrollLeft(container.scrollLeft > 0);
    setCanScrollRight(
      container.scrollLeft < container.scrollWidth - container.clientWidth - 10
    );
  }, []);

  useEffect(() => {
    checkScroll();
    const container = scrollRef.current;
    if (container) {
      container.addEventListener('scroll', checkScroll);
      return () => container.removeEventListener('scroll', checkScroll);
    }
  }, [checkScroll, storyGroups]);

  const scroll = useCallback((direction: 'left' | 'right') => {
    const container = scrollRef.current;
    if (!container) return;

    const scrollAmount = 200;
    container.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  }, []);

  return (
    <div className="stories">
      {canScrollLeft && (
        <button
          className="stories__arrow stories__arrow--left"
          onClick={() => scroll('left')}
        >
          <ChevronLeft size={20} />
        </button>
      )}

      <div className="stories__scroll" ref={scrollRef}>
        {/* Add Story Button */}
        {onAddStory && (
          <button className="story-item story-item--add" onClick={onAddStory}>
            <div className="story-item__avatar-wrapper">
              {currentUserAvatar ? (
                <img
                  src={currentUserAvatar}
                  alt="Your story"
                  className="story-item__avatar"
                />
              ) : (
                <div className="story-item__avatar story-item__avatar--placeholder" />
              )}
              <div className="story-item__add-icon">
                <Plus size={14} />
              </div>
            </div>
            <span className="story-item__name">{t('stories.your_story')}</span>
          </button>
        )}

        {/* Story Groups */}
        {storyGroups.map((group) => (
          <button
            key={group.userId}
            className={`story-item ${group.hasUnviewed ? 'story-item--unviewed' : ''}`}
            onClick={() => onStoryClick(group, 0)}
          >
            <div className="story-item__avatar-wrapper">
              {group.avatarUrl ? (
                <img
                  src={group.avatarUrl}
                  alt={group.username}
                  className="story-item__avatar"
                />
              ) : (
                <div className="story-item__avatar story-item__avatar--placeholder">
                  {(group.displayName || group.username)[0].toUpperCase()}
                </div>
              )}
            </div>
            <span className="story-item__name">
              {group.displayName || group.username}
            </span>
          </button>
        ))}
      </div>

      {canScrollRight && (
        <button
          className="stories__arrow stories__arrow--right"
          onClick={() => scroll('right')}
        >
          <ChevronRight size={20} />
        </button>
      )}
    </div>
  );
}

// Story Viewer Modal
interface StoryViewerProps {
  group: StoryGroup;
  initialIndex?: number;
  onClose: () => void;
  onNext?: () => void;
  onPrev?: () => void;
}

export function StoryViewer({
  group,
  initialIndex = 0,
  onClose,
  onNext,
  onPrev,
}: StoryViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<number | undefined>(undefined);

  const currentStory = group.stories[currentIndex];
  const storyDuration = currentStory?.duration || 5000;

  const goToNext = useCallback(() => {
    if (currentIndex < group.stories.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setProgress(0);
    } else {
      onNext?.() || onClose();
    }
  }, [currentIndex, group.stories.length, onNext, onClose]);

  const goToPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setProgress(0);
    } else {
      onPrev?.();
    }
  }, [currentIndex, onPrev]);

  // Auto-advance timer
  useEffect(() => {
    if (isPaused) return;

    const interval = 50;
    const step = (interval / storyDuration) * 100;

    timerRef.current = window.setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          goToNext();
          return 0;
        }
        return prev + step;
      });
    }, interval);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentIndex, isPaused, storyDuration, goToNext]);

  // Handle tap to pause/navigate
  const handleTap = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const clientX = 'touches' in e ? e.changedTouches[0].clientX : e.clientX;
    const relativeX = (clientX - rect.left) / rect.width;

    if (relativeX < 0.3) {
      goToPrev();
    } else if (relativeX > 0.7) {
      goToNext();
    }
  }, [goToPrev, goToNext]);

  const handleHoldStart = useCallback(() => setIsPaused(true), []);
  const handleHoldEnd = useCallback(() => setIsPaused(false), []);

  if (!currentStory) return null;

  return (
    <div className="story-viewer">
      <div className="story-viewer__header">
        <div className="story-viewer__progress-bars">
          {group.stories.map((_, index) => (
            <div key={index} className="story-viewer__progress-bar">
              <div
                className="story-viewer__progress-fill"
                style={{
                  width: index < currentIndex ? '100%' :
                         index === currentIndex ? `${progress}%` : '0%'
                }}
              />
            </div>
          ))}
        </div>

        <div className="story-viewer__user">
          {group.avatarUrl && (
            <img src={group.avatarUrl} alt="" className="story-viewer__avatar" />
          )}
          <span className="story-viewer__username">{group.username}</span>
        </div>

        <button className="story-viewer__close" onClick={onClose}>
          ×
        </button>
      </div>

      <div
        className="story-viewer__content"
        onClick={handleTap}
        onMouseDown={handleHoldStart}
        onMouseUp={handleHoldEnd}
        onTouchStart={handleHoldStart}
        onTouchEnd={handleHoldEnd}
      >
        {currentStory.mediaType === 'video' ? (
          <video
            ref={videoRef}
            src={currentStory.mediaUrl}
            autoPlay
            muted
            playsInline
            className="story-viewer__media"
          />
        ) : (
          <img
            src={currentStory.mediaUrl}
            alt=""
            className="story-viewer__media"
          />
        )}
      </div>
    </div>
  );
}
