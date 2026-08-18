import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/hooks/useLanguage';
import { useAtomValue, useSetAtom } from 'jotai';
import { feedTemplatesAtom, loadFeedAtom, feedStatsAtom, loadStatsAtom } from '@/atoms';
import './Hero.css';

// Fallback video if no feed videos available
// Из public/ этого приложения, а не с рендер-сервера — у того public/ нет.
const FALLBACK_VIDEO = '/lipsync/lipsync.mp4';

// Format large numbers with K/M suffix
function formatNumber(num: number | undefined | null): string {
  if (num === undefined || num === null || isNaN(num)) {
    return '0';
  }
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  return num.toString();
}

export function Hero() {
  const { t } = useLanguage();
  const feedTemplates = useAtomValue(feedTemplatesAtom);
  const loadFeed = useSetAtom(loadFeedAtom);
  const stats = useAtomValue(feedStatsAtom);
  const loadStats = useSetAtom(loadStatsAtom);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Load feed if not already loaded
  useEffect(() => {
    if (feedTemplates.length === 0) {
      loadFeed();
    }
  }, [feedTemplates.length, loadFeed]);

  // Load stats on mount and refresh every 30 seconds
  useEffect(() => {
    loadStats();
    const interval = setInterval(() => {
      loadStats();
    }, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [loadStats]);

  // Get video URL from first feed template or use fallback
  const videoUrl = feedTemplates.length > 0 && feedTemplates[0].videoUrl
    ? feedTemplates[0].videoUrl
    : (feedTemplates.length === 0 ? null : FALLBACK_VIDEO);

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
    }
  };

  return (
    <section className="hero">
      <div className="hero-bg">
        <div className="hero-gradient" />
        <div className="hero-grid" />
      </div>

      <div className="hero-container">
        {/* Video preview - shows first on mobile */}
        <div className="hero-video-wrapper">
          <div className="hero-video-frame">
            <div className="hero-video-glow" />
            {videoUrl ? (
              <video
                ref={videoRef}
                className="hero-video"
                autoPlay
                loop
                muted
                playsInline
                onLoadedData={() => setIsVideoLoaded(true)}
              >
                <source src={videoUrl} type="video/mp4" />
              </video>
            ) : (
              <div className="hero-video-skeleton" />
            )}
            {isVideoLoaded && (
              <div className="hero-video-overlay">
                <button className="hero-sound-btn" onClick={toggleMute} aria-label={isMuted ? 'Unmute' : 'Mute'}>
                  {isMuted ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                    </svg>
                  )}
                </button>
                <div className="hero-video-badge">
                  <span className="video-badge-dot" />
                  <span>{t('hero.video.createdWith')}</span>
                </div>
              </div>
            )}
          </div>

          {/* Floating elements - hidden on mobile */}
          <div className="hero-float hero-float-1">
            <span className="float-emoji">AI</span>
          </div>
          <div className="hero-float hero-float-2">
            <span className="float-emoji">2 min</span>
          </div>
          <div className="hero-float hero-float-3">
            <span className="float-emoji">4K</span>
          </div>
        </div>

        {/* Text content */}
        <div className="hero-content">
          <div className="hero-badge">
            <span className="hero-badge-icon">NEW</span>
            <span className="hero-badge-text">{t('hero.badge')}</span>
          </div>

          <h1 className="hero-title">
            {t('hero.title')}
          </h1>

          <p className="hero-subtitle">
            {t('hero.subtitle')}
          </p>

          <div className="hero-cta">
            <Link to="/editor" className="btn-primary btn-large">
              {t('cta.createReel')}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </Link>
          </div>

          <div className="hero-stats">
            <div className="stat">
              <span className="stat-value">{formatNumber(stats?.creatorsCount)}</span>
              <span className="stat-label">{t('hero.stat.creators')}</span>
            </div>
            <div className="stat-divider" />
            <div className="stat">
              <span className="stat-value">{formatNumber(stats?.reelsCount)}</span>
              <span className="stat-label">{t('hero.stat.reels')}</span>
            </div>
            <div className="stat-divider" />
            <div className="stat">
              <span className="stat-value">{formatNumber(stats?.totalViews)}</span>
              <span className="stat-label">{t('hero.stat.views')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Brands/Trust badges */}
      <div className="hero-trust">
        <span className="hero-trust-label">{t('hero.trust.label')}</span>
        <div className="hero-trust-logos">
          <span className="trust-logo">Instagram</span>
          <span className="trust-logo">TikTok</span>
          <span className="trust-logo">YouTube</span>
          <span className="trust-logo">Telegram</span>
        </div>
      </div>
    </section>
  );
}
