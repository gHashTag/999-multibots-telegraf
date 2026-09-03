import { useCallback, useState, useRef, useEffect, useReducer } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import {
  likeTemplateAtom,
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
  canRetryMedia,
  classifyVideoElementError,
  createFeedMediaState,
  feedMediaReasonLabel,
  feedMediaReducer,
  isFeedVideoUrl,
} from '@/lib/feedMedia'
import { feedAuthorProfilePath } from '@/lib/feedAuthor'
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
  const useTemplate = useSetAtom(useTemplateAtom)
  const deleteTemplate = useSetAtom(deleteTemplateAtom)
  const trackView = useSetAtom(trackViewAtom)
  const [isUsing, setIsUsing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isHovering, setIsHovering] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [avatarFailed, setAvatarFailed] = useState(false)
  const [mediaState, dispatchMedia] = useReducer(
    feedMediaReducer,
    undefined,
    () => createFeedMediaState(template.videoUrl, template.thumbnailUrl)
  )
  const [shouldLoadVideo, setShouldLoadVideo] = useState(false)
  const [globalMuted, setGlobalMuted] = useAtom(feedMutedAtom) // Global muted state
  const [currentlyPlayingId, setCurrentlyPlayingId] = useAtom(
    currentlyPlayingFeedIdAtom
  ) // Only ONE video plays sound
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showRemixInfo, setShowRemixInfo] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const hasUsableVideoUrl = isFeedVideoUrl(template.videoUrl)
  const isVideoLoaded = mediaState.status === 'ready'
  const videoError =
    mediaState.status === 'error'
      ? feedMediaReasonLabel(mediaState.reason)
      : null
  const authorProfilePath = feedAuthorProfilePath(
    template.creatorUsername,
    template.telegramId
  )

  // Cards may be reused when an audited record receives a corrected source.
  // Reset the bounded lifecycle instead of preserving the old decoder error.
  useEffect(() => {
    videoRef.current?.pause()
    setIsPlaying(false)
    dispatchMedia({
      type: 'source_changed',
      videoUrl: template.videoUrl,
      thumbnailUrl: template.thumbnailUrl,
    })
  }, [template.videoUrl, template.thumbnailUrl])

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
          setShouldLoadVideo(true)
          observer.disconnect() // Only need to trigger once
        }
      },
      { rootMargin: '200px' } // Start loading 200px before visible
    )

    observer.observe(card)
    return () => observer.disconnect()
  }, [template.id])

  // A media element may remain forever in "loading" without firing error
  // (stalled range response, CORS policy, broken container). Surface that as
  // a timeout instead of leaving a normal-looking black card indefinitely.
  useEffect(() => {
    if (!shouldLoadVideo || mediaState.status !== 'idle') return
    dispatchMedia({ type: 'load_started' })
  }, [shouldLoadVideo, mediaState.status])

  useEffect(() => {
    if (mediaState.status !== 'loading') return
    const timeout = window.setTimeout(() => {
      const video = videoRef.current
      if (video) {
        video.pause()
        video.removeAttribute('src')
        video.load()
      }
      setIsPlaying(false)
      dispatchMedia({ type: 'timeout' })
    }, 12_000)
    return () => window.clearTimeout(timeout)
  }, [mediaState.status, mediaState.attempts])

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
        // SAFE BETA preserves remix-as-draft in the local editor.
        navigate('/editor')
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
    if (!dateStr || Number.isNaN(date.getTime())) return 'дата неизвестна'
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
    if (!canRetryMedia(mediaState)) return
    dispatchMedia({ type: 'retry' })
    window.setTimeout(() => {
      const video = videoRef.current
      if (!video || !template.videoUrl || !isFeedVideoUrl(template.videoUrl)) {
        return
      }
      video.src = template.videoUrl
      video.load()
    }, 0)
  }, [mediaState, template.videoUrl])

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
            {shouldLoadVideo && hasUsableVideoUrl ? (
              <>
                <video
                  ref={videoRef}
                  src={template.videoUrl}
                  poster={template.thumbnailUrl || undefined}
                  muted={effectiveMuted}
                  loop
                  playsInline
                  preload="metadata"
                  className="feed-card-video"
                  onLoadedData={() => dispatchMedia({ type: 'video_ready' })}
                  onCanPlay={() => {
                    // Auto-play when can play
                    const video = videoRef.current
                    if (video) {
                      video.play().catch(() => {})
                    }
                  }}
                  onError={e => {
                    const video = e.currentTarget
                    dispatchMedia({
                      type: 'video_error',
                      reason: classifyVideoElementError(video.error?.code),
                    })
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
                    <small>{videoError}</small>
                    {canRetryMedia(mediaState) ? (
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
                    ) : (
                      <small>Нужно исправить файл или перерендерить</small>
                    )}
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
                {mediaState.posterStatus === 'ready' ? (
                  <img
                    src={template.thumbnailUrl}
                    alt={template.name}
                    onError={() => dispatchMedia({ type: 'poster_error' })}
                  />
                ) : (
                  <div className="feed-card-placeholder">
                    <AlertCircle size={24} />
                    <span>{feedMediaReasonLabel(mediaState.reason)}</span>
                  </div>
                )}
                {!shouldLoadVideo && (
                  <div className="feed-card-loading">
                    <Loader2 size={32} className="spinning" />
                  </div>
                )}
              </div>
            ) : (
              <div className="feed-card-placeholder">
                <AlertCircle size={24} />
                <span>{feedMediaReasonLabel(mediaState.reason)}</span>
              </div>
            )}

            {/* Missing/invalid URLs never create a video element, so render
                the same honest failure surface outside the video branch. */}
            {videoError && !hasUsableVideoUrl && (
              <div className="feed-card-error">
                <AlertCircle size={32} />
                <span>{videoError}</span>
              </div>
            )}

            {/* Play overlay - visible when paused */}
            {!isPlaying &&
              shouldLoadVideo &&
              hasUsableVideoUrl &&
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
            <Link
              to={authorProfilePath}
              className="feed-card-creator-link"
              onClick={e => e.stopPropagation()}
            >
              {template.creatorAvatar && !avatarFailed ? (
                <img
                  src={template.creatorAvatar}
                  alt={template.creatorName}
                  className="feed-card-avatar"
                  onError={() => setAvatarFailed(true)}
                />
              ) : (
                <span className="feed-card-avatar feed-card-avatar--placeholder">
                  {(template.creatorName || '?').slice(0, 1).toUpperCase()}
                </span>
              )}
              <div className="feed-card-meta">
                <span className="feed-card-author-name">
                  {template.creatorName}
                </span>
                <span className="feed-card-creator">
                  {template.creatorUsername
                    ? `@${template.creatorUsername}`
                    : 'Профиль Telegram'}{' '}
                  · {formatDate(template.createdAt)}
                </span>
              </div>
            </Link>
          </div>

          <div className="feed-card-name">{template.name}</div>

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
