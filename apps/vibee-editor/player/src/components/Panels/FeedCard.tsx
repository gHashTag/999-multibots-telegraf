import { useCallback, useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import {
  likeTemplateAtom,
  starTemplateAtom,
  useTemplateAtom,
  deleteTemplateAtom,
  trackViewAtom,
  userAtom,
  feedMutedAtom,
  currentlyPlayingFeedIdAtom,
  type FeedTemplate,
} from '@/atoms'
import { useLanguage } from '@/hooks/useLanguage'
import { haptic } from '@/lib/telegram'
import { LikeAnimation } from '@/components/LikeAnimation'
import {
  Heart,
  Eye,
  Users,
  Play,
  Loader2,
  Sparkles,
  Trash2,
  AlertCircle,
  RefreshCw,
  Volume2,
  VolumeX,
  Info,
  Star,
} from 'lucide-react'
import './FeedPanel.css'

interface FeedCardProps {
  template: FeedTemplate
}

export function FeedCard({ template }: FeedCardProps) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const user = useAtomValue(userAtom)
  const likeTemplate = useSetAtom(likeTemplateAtom)
  const starTemplate = useSetAtom(starTemplateAtom)
  const [isStarring, setIsStarring] = useState(false)
  const useTemplate = useSetAtom(useTemplateAtom)
  const deleteTemplate = useSetAtom(deleteTemplateAtom)
  const trackView = useSetAtom(trackViewAtom)
  const [isUsing, setIsUsing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isHovering, setIsHovering] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [videoError, setVideoError] = useState<string | null>(null)
  const [isVideoLoaded, setIsVideoLoaded] = useState(false)
  const [shouldLoadVideo, setShouldLoadVideo] = useState(false)
  const [globalMuted, setGlobalMuted] = useAtom(feedMutedAtom) // Global muted state
  const [currentlyPlayingId, setCurrentlyPlayingId] = useAtom(
    currentlyPlayingFeedIdAtom
  ) // Only ONE video plays sound
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showRemixInfo, setShowRemixInfo] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  // Video is muted if: global muted OR not the currently playing video
  const isThisVideoActive = currentlyPlayingId === template.id
  const effectiveMuted = globalMuted || !isThisVideoActive

  // Check if current user is admin or author
  const isAdmin = user?.is_admin === true
  const isAuthor = user && template.telegramId === user.id
  const canDelete = isAdmin || isAuthor

  // Lazy load video when card is near viewport (200px before visible)
  useEffect(() => {
    const card = cardRef.current
    if (!card) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          console.log(
            '[FeedCard] Card in viewport, loading video:',
            template.id
          )
          setShouldLoadVideo(true)
          observer.disconnect() // Only need to trigger once
        }
      },
      { rootMargin: '200px' } // Start loading 200px before visible
    )

    observer.observe(card)
    return () => observer.disconnect()
  }, [template.id])

  // Click to play/pause video (TikTok-style)
  const handleCardClick = useCallback(() => {
    const video = videoRef.current
    if (!video || !shouldLoadVideo) return

    if (isPlaying) {
      video.pause()
      setIsPlaying(false)
    } else {
      video.play().catch(() => {})
      setIsPlaying(true)
    }
  }, [isPlaying, shouldLoadVideo])

  // Auto-play when card scrolls into view (IntersectionObserver)
  // Sets this video as the "active" one for sound
  useEffect(() => {
    const video = videoRef.current
    if (!video || !shouldLoadVideo) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio > 0.7) {
          video.play().catch(() => {}) // Ignore autoplay errors
          setIsPlaying(true)
          // This video is now the active one (gets sound)
          setCurrentlyPlayingId(template.id)
        } else {
          video.pause()
          setIsPlaying(false)
        }
      },
      { threshold: 0.7 }
    )

    observer.observe(video)
    return () => observer.disconnect()
  }, [template.videoUrl, shouldLoadVideo, template.id, setCurrentlyPlayingId])

  // Sync video muted state: muted if global muted OR not the active video
  useEffect(() => {
    const video = videoRef.current
    if (video) {
      video.muted = effectiveMuted
    }
  }, [effectiveMuted])

  const handleLike = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      likeTemplate(template.id)
    },
    [likeTemplate, template.id]
  )

  // ⭐ Звезда = платный лайк: 1 Telegram Star падает автору на баланс.
  // Двойной тап звезду НЕ шлёт (случайная оплата), только кнопка.
  const handleStar = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation()
      if (isStarring) return
      setIsStarring(true)
      try {
        const status = await starTemplate(template.id)
        if (status === 'paid') haptic.notification('success')
        else if (status === 'cancelled') haptic.selection()
        else haptic.notification('error')
      } catch {
        haptic.notification('error')
      } finally {
        setIsStarring(false)
      }
    },
    [isStarring, starTemplate, template.id]
  )

  // Sound toggle (toggles global muted state for the active video)
  const handleSoundToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      // If clicking sound on a non-active video, make it active first
      if (!isThisVideoActive) {
        setCurrentlyPlayingId(template.id)
      }
      setGlobalMuted(prev => !prev)
    },
    [setGlobalMuted, isThisVideoActive, setCurrentlyPlayingId, template.id]
  )

  // Double-tap like handler
  const handleDoubleTapLike = useCallback(() => {
    if (!template.isLiked) {
      likeTemplate(template.id)
    }
  }, [likeTemplate, template.id, template.isLiked])

  const handleUse = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation()
      setIsUsing(true)
      try {
        await useTemplate(template.id)
        // Navigate to avatar generation page to record cameo
        navigate('/generate/avatar')
      } finally {
        setIsUsing(false)
      }
    },
    [useTemplate, template.id, navigate]
  )

  const handleDeleteClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setShowDeleteConfirm(true)
  }, [])

  const handleDeleteConfirm = useCallback(async () => {
    setShowDeleteConfirm(false)
    setIsDeleting(true)
    try {
      await deleteTemplate(template.id)
    } catch (error) {
      console.error('Failed to delete:', error)
    } finally {
      setIsDeleting(false)
    }
  }, [deleteTemplate, template.id])

  const formatCount = (count: number | undefined | null): string => {
    if (count === undefined || count === null || isNaN(count)) return '0'
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`
    return count.toString()
  }

  // Format relative time with better granularity
  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffSec = Math.floor(diffMs / 1000)
    const diffMin = Math.floor(diffSec / 60)
    const diffHour = Math.floor(diffMin / 60)
    const diffDay = Math.floor(diffHour / 24)

    if (diffMin < 1) return t('feed.justNow') || 'now'
    if (diffMin < 60) return `${diffMin}m`
    if (diffHour < 24) return `${diffHour}h`
    if (diffDay < 7) return `${diffDay}d`
    if (diffDay < 30) return `${Math.floor(diffDay / 7)}w`
    return `${Math.floor(diffDay / 30)}mo`
  }

  // Retry loading video after error
  const handleRetry = useCallback(() => {
    setVideoError(null)
    setIsVideoLoaded(false)
    videoRef.current?.load()
  }, [])

  return (
    <div
      ref={cardRef}
      className="feed-card"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {/* Inner wrapper for max-width centering */}
      <div className="feed-card-inner">
        <LikeAnimation onDoubleTap={handleDoubleTapLike}>
          <div
            className={`feed-card-thumbnail ${isPlaying ? 'playing' : ''}`}
            onClick={handleCardClick}
          >
            {/* Lazy load video - only render when near viewport */}
            {shouldLoadVideo && template.videoUrl ? (
              <>
                <video
                  ref={videoRef}
                  src={template.videoUrl}
                  poster={template.thumbnailUrl || undefined}
                  muted={effectiveMuted}
                  loop
                  playsInline
                  crossOrigin="anonymous"
                  preload="metadata"
                  className="feed-card-video"
                  onLoadedData={() => {
                    console.log('[FeedCard] Video loaded:', template.videoUrl)
                    setIsVideoLoaded(true)
                  }}
                  onCanPlay={() => {
                    // Auto-play when can play
                    const video = videoRef.current
                    if (video) {
                      video.play().catch(() => {})
                    }
                  }}
                  onError={e => {
                    const video = e.currentTarget
                    console.error(
                      '[FeedCard] Video error:',
                      template.videoUrl,
                      video.error
                    )
                    setVideoError(
                      video.error?.message || 'Failed to load video'
                    )
                  }}
                  onPlay={() => {
                    setIsPlaying(true)
                    // Track view when video starts playing
                    trackView(template.id)
                  }}
                  onPause={() => setIsPlaying(false)}
                />
                {/* Error indicator with retry button */}
                {videoError && (
                  <div className="feed-card-error">
                    <AlertCircle size={32} />
                    <span>{t('feed.videoError') || 'Video error'}</span>
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        handleRetry()
                      }}
                      className="retry-btn"
                    >
                      <RefreshCw size={16} />
                      {t('feed.retry') || 'Retry'}
                    </button>
                  </div>
                )}
                {/* Loading indicator - show while video is loading */}
                {!isVideoLoaded && !videoError && (
                  <div className="feed-card-loading">
                    <Loader2 size={32} className="spinning" />
                  </div>
                )}
              </>
            ) : template.thumbnailUrl ? (
              // Show poster/thumbnail before video loads
              <div className="feed-card-poster">
                <img src={template.thumbnailUrl} alt={template.name} />
                {!shouldLoadVideo && (
                  <div className="feed-card-loading">
                    <Loader2 size={32} className="spinning" />
                  </div>
                )}
              </div>
            ) : (
              <div className="feed-card-placeholder">
                <Play size={24} />
              </div>
            )}

            {/* Play overlay - visible when paused */}
            {!isPlaying &&
              shouldLoadVideo &&
              template.videoUrl &&
              isVideoLoaded && (
                <div className="play-overlay">
                  <Play size={64} fill="white" />
                </div>
              )}

            {template.isFeatured && (
              <div className="feed-card-featured">Featured</div>
            )}

            {/* Remix attribution badge */}
            {template.parentTemplateId && (
              <div
                className="feed-card-remix"
                onClick={() => setShowRemixInfo(true)}
                title="Based on another template"
              >
                <Sparkles size={12} />
                <span>Remix</span>
              </div>
            )}
          </div>
        </LikeAnimation>

        {/* TikTok-style right action bar */}
        <div className="feed-card-actions">
          {/* Sound toggle - shows effective state for this video */}
          <button
            className={`action-btn sound-btn ${!effectiveMuted ? 'unmuted' : ''}`}
            onClick={handleSoundToggle}
            title={effectiveMuted ? 'Unmute' : 'Mute'}
          >
            {effectiveMuted ? <VolumeX size={32} /> : <Volume2 size={32} />}
          </button>

          {/* ⭐ Звезда вместо бесплатного лайка: 1 Telegram Star автору на баланс.
              Контурная, пока ЭТОТ юзер ещё не подарил звезду; закрашивается
              золотом после первой оплаченной звезды. */}
          <button
            className={`action-btn star-btn ${template.isStarred ? 'starred' : ''} ${isStarring ? 'starring' : ''}`}
            onClick={handleStar}
            disabled={isStarring}
            title={t('feed.star')}
          >
            {isStarring ? (
              <Loader2 size={32} className="spin" />
            ) : (
              <Star
                size={32}
                fill={template.isStarred ? 'currentColor' : 'none'}
              />
            )}
            <span>{formatCount(template.starsCount)}</span>
          </button>

          <div className="action-btn views-btn">
            <Eye size={32} />
            <span>{formatCount(template.viewsCount)}</span>
          </div>

          <div className="action-btn uses-btn">
            <Users size={32} />
            <span>{formatCount(template.usesCount)}</span>
          </div>

          <button
            className="action-btn remix-btn"
            onClick={handleUse}
            disabled={isUsing}
            title="Remix"
          >
            {isUsing ? (
              <Loader2 size={32} className="spinning" />
            ) : (
              <Sparkles size={32} />
            )}
            <span>Remix</span>
          </button>

          {canDelete && (
            <button
              className="action-btn delete-btn"
              onClick={handleDeleteClick}
              disabled={isDeleting}
              title="Delete"
            >
              {isDeleting ? (
                <Loader2 size={24} className="spinning" />
              ) : (
                <Trash2 size={24} />
              )}
            </button>
          )}
        </div>

        {/* Info overlay at bottom */}
        <div className="feed-card-info">
          <div className="feed-card-header">
            {template.creatorUsername ? (
              <Link
                to={`/${template.creatorUsername}`}
                className="feed-card-creator-link"
                onClick={e => e.stopPropagation()}
              >
                {template.creatorAvatar && (
                  <img
                    src={template.creatorAvatar}
                    alt={template.creatorName}
                    className="feed-card-avatar"
                  />
                )}
                <div className="feed-card-meta">
                  <span className="feed-card-name">{template.name}</span>
                  <span className="feed-card-creator">
                    @{template.creatorUsername} ·{' '}
                    {formatDate(template.createdAt)}
                  </span>
                </div>
              </Link>
            ) : (
              <>
                {template.creatorAvatar && (
                  <img
                    src={template.creatorAvatar}
                    alt={template.creatorName}
                    className="feed-card-avatar"
                  />
                )}
                <div className="feed-card-meta">
                  <span className="feed-card-name">{template.name}</span>
                  <span className="feed-card-creator">
                    {template.creatorName} · {formatDate(template.createdAt)}
                  </span>
                </div>
              </>
            )}
          </div>

          {template.description && (
            <p className="feed-card-description">{template.description}</p>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div
          className="delete-confirm-overlay"
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            className="delete-confirm-modal"
            onClick={e => e.stopPropagation()}
          >
            <Trash2 size={32} className="delete-confirm-icon" />
            <p>{t('feed.deleteConfirm') || 'Delete this video?'}</p>
            <div className="delete-confirm-buttons">
              <button
                className="cancel-btn"
                onClick={() => setShowDeleteConfirm(false)}
              >
                {t('common.cancel') || 'Cancel'}
              </button>
              <button className="confirm-btn" onClick={handleDeleteConfirm}>
                {t('common.delete') || 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remix Info Modal */}
      {showRemixInfo && template.parentTemplateId && (
        <div
          className="remix-info-overlay"
          onClick={() => setShowRemixInfo(false)}
        >
          <div className="remix-info-modal" onClick={e => e.stopPropagation()}>
            <div className="remix-info-header">
              <Sparkles size={24} className="remix-icon" />
              <h3>{t('feed.remixInfo') || 'Remix Info'}</h3>
            </div>
            <div className="remix-info-content">
              <p className="remix-info-text">
                {t('feed.basedOn') || 'Based on a template by'}{' '}
                {template.originalCreatorName ||
                  t('feed.unknownCreator') ||
                  'Unknown Creator'}
              </p>
              {template.originalCreatorAvatar && (
                <img
                  src={template.originalCreatorAvatar}
                  alt={template.originalCreatorName || 'Original Creator'}
                  className="remix-creator-avatar"
                />
              )}
            </div>
            <div className="remix-info-actions">
              <button
                className="remix-close-btn"
                onClick={() => setShowRemixInfo(false)}
              >
                {t('common.close') || 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
