import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/hooks/useLanguage';
import { useAtomValue, useSetAtom } from 'jotai';
import { feedTemplatesAtom, loadFeedAtom, type FeedTemplate } from '@/atoms';
import './FeedPreview.css';

function FeedPreviewCard({ template, index }: { template: FeedTemplate; index: number }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const formatCount = (count: number): string => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  const handleMouseEnter = () => {
    if (videoRef.current) {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const handleMouseLeave = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
      setIsPlaying(false);
    }
  };

  return (
    <Link
      to="/feed"
      className="feed-item"
      style={{ animationDelay: `${index * 0.1}s` }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="feed-item-thumbnail">
        {template.videoUrl ? (
          <video
            ref={videoRef}
            src={template.videoUrl}
            poster={template.thumbnailUrl || undefined}
            muted
            loop
            playsInline
            preload="metadata"
            className="feed-item-video"
          />
        ) : (
          <div className="feed-item-placeholder" />
        )}
        <div className="feed-item-overlay">
          <div className="feed-item-stats">
            <span className="feed-stat">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
              {formatCount(template.likesCount)}
            </span>
            <span className="feed-stat">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
              </svg>
              {formatCount(template.viewsCount)}
            </span>
          </div>
          <span className="feed-item-author">
            @{template.creatorUsername || template.creatorName}
          </span>
        </div>
        {!isPlaying && (
          <div className="feed-item-play">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
        )}
      </div>
    </Link>
  );
}

export function FeedPreview() {
  const { t } = useLanguage();
  const feedTemplates = useAtomValue(feedTemplatesAtom);
  const loadFeed = useSetAtom(loadFeedAtom);

  // Load feed if not already loaded
  useEffect(() => {
    if (feedTemplates.length === 0) {
      loadFeed();
    }
  }, [feedTemplates.length, loadFeed]);

  // Show first 6 templates
  const previewTemplates = feedTemplates.slice(0, 6);

  return (
    <section className="feed-preview">
      <div className="feed-preview-container">
        <div className="feed-preview-header">
          <span className="feed-preview-badge">{t('feedPreview.badge')}</span>
          <h2 className="feed-preview-title">{t('feedPreview.title')}</h2>
          <p className="feed-preview-subtitle">{t('feedPreview.subtitle')}</p>
        </div>

        <div className="feed-preview-grid">
          {previewTemplates.length > 0 ? (
            previewTemplates.map((template, index) => (
              <FeedPreviewCard key={template.id} template={template} index={index} />
            ))
          ) : (
            // Loading placeholders
            Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="feed-item" style={{ animationDelay: `${index * 0.1}s` }}>
                <div className="feed-item-thumbnail">
                  <div className="feed-item-placeholder loading" />
                </div>
              </div>
            ))
          )}
        </div>

        <div className="feed-preview-cta">
          <Link to="/feed" className="btn-secondary">
            {t('feedPreview.cta')}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}
