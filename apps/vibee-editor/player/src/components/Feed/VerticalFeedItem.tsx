// ===============================
// Vertical Feed Item - Single video card
// ===============================

import { useRef, useState, useCallback, useEffect } from 'react'
import { useSetAtom, useAtomValue, useAtom } from 'jotai'
import {
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  Music2,
  Play,
  Volume2,
  VolumeX,
} from 'lucide-react'
import {
  likeTemplateAtom,
  feedMutedAtom,
  type FeedTemplate,
} from '@/atoms/feed'
import { toggleBookmarkAtom, isBookmarkedAtom } from '@/atoms/bookmarks'
import { useVideoAutoplay } from '@/hooks/useVideoAutoplay'
import { useShare } from '@/hooks/useShare'
import { BRAND_COLORS } from '@vibee/atoms'
import './VerticalFeedItem.css'

interface VerticalFeedItemProps {
  template: FeedTemplate
  isActive: boolean
  isPreloaded?: boolean
  onClick?: () => void
}

/**
 * The description WITHOUT the title it starts with.
 *
 * The agent builds a post's description starting with the post's own title, so
 * this card rendered "Title · Title …" and the two-line clamp was spent before
 * the claim began -- on the surface where most views actually happen. The
 * channel caption had the same fault from the other end (captionFor in
 * render/src/channel-delivery.ts).
 */
function bodyAfterTitle(name?: string, description?: string): string {
  const title = String(name || '').trim()
  const lines = String(description || '').split('\n')
  let i = 0
  while (i < lines.length && !lines[i].trim()) i += 1
  if (i < lines.length && lines[i].trim() === title) i += 1
  return lines.slice(i).join(' ').replace(/\s+/g, ' ').trim()
}

export function VerticalFeedItem({
  template,
  isActive,
  isPreloaded,
  onClick,
}: VerticalFeedItemProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [showLikeAnimation, setShowLikeAnimation] = useState(false)
  const [isMuted, setIsMuted] = useAtom(feedMutedAtom) // Global muted state
  const [isPaused, setIsPaused] = useState(false)
  const [showPlayIcon, setShowPlayIcon] = useState(false)
  const lastTapRef = useRef<number>(0)

  const likeTemplate = useSetAtom(likeTemplateAtom)
  const toggleBookmark = useSetAtom(toggleBookmarkAtom)
  const isBookmarkedFn = useAtomValue(isBookmarkedAtom)
  const isBookmarked = isBookmarkedFn(template.id)
  const { shareVideo } = useShare()

  // Auto-play when active
  useVideoAutoplay(videoRef, { threshold: 0.7 })

  // Play/pause based on active state
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (isActive && !isPaused) {
      video.play().catch(() => {})
    } else {
      video.pause()
    }
  }, [isActive, isPaused])

  // Sync video muted state with global atom
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted
    }
  }, [isMuted])

  // Handle tap/click
  const handleTap = useCallback(() => {
    const now = Date.now()
    const timeSinceLastTap = now - lastTapRef.current
    lastTapRef.current = now

    // Double tap - like
    if (timeSinceLastTap < 300) {
      if (!template.isLiked) {
        likeTemplate(template.id)
        setShowLikeAnimation(true)
        setTimeout(() => setShowLikeAnimation(false), 1000)
      }
      return
    }

    // Single tap - pause/play
    setTimeout(() => {
      if (Date.now() - lastTapRef.current >= 300) {
        setIsPaused(prev => !prev)
        setShowPlayIcon(true)
        setTimeout(() => setShowPlayIcon(false), 500)
      }
    }, 300)
  }, [template.id, template.isLiked, likeTemplate])

  // Handle like button
  const handleLike = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      likeTemplate(template.id)
      if (!template.isLiked) {
        setShowLikeAnimation(true)
        setTimeout(() => setShowLikeAnimation(false), 1000)
      }
    },
    [template.id, template.isLiked, likeTemplate]
  )

  // Handle bookmark
  const handleBookmark = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      toggleBookmark(template.id)
    },
    [template.id, toggleBookmark]
  )

  // Handle share
  const handleShare = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      shareVideo(template.videoUrl, template.name, template.creatorName)
    },
    [template, shareVideo]
  )

  // Toggle mute
  const handleMuteToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      setIsMuted(prev => !prev)
      if (videoRef.current) {
        videoRef.current.muted = !isMuted
      }
    },
    [isMuted]
  )

  // Format count
  const formatCount = (count: number): string => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`
    return count.toString()
  }

  return (
    <div className="vertical-feed-item" onClick={handleTap}>
      {/* Video */}
      <video
        ref={videoRef}
        src={template.videoUrl}
        poster={template.thumbnailUrl}
        loop
        muted={isMuted}
        playsInline
        preload={isPreloaded ? 'auto' : 'metadata'}
        className="vertical-feed-item__video"
      />

      {/* Play/Pause icon */}
      {showPlayIcon && (
        <div className="vertical-feed-item__play-icon">
          <Play size={64} fill="white" />
        </div>
      )}

      {/* Like animation (heart burst) */}
      {showLikeAnimation && (
        <div className="vertical-feed-item__like-animation">
          <Heart size={100} fill="red" color="red" />
        </div>
      )}

      {/* Gradient overlay */}
      <div className="vertical-feed-item__gradient" />

      {/* Right sidebar actions */}
      <div className="vertical-feed-item__actions">
        {/* Creator avatar */}
        <button className="vertical-feed-item__avatar-btn">
          {template.creatorAvatar ? (
            <img
              src={template.creatorAvatar}
              alt={template.creatorName}
              className="vertical-feed-item__avatar"
            />
          ) : (
            <div className="vertical-feed-item__avatar vertical-feed-item__avatar--placeholder">
              {template.creatorName[0].toUpperCase()}
            </div>
          )}
          <span className="vertical-feed-item__follow">+</span>
        </button>

        {/* Like */}
        <button
          className={`vertical-feed-item__action ${template.isLiked ? 'vertical-feed-item__action--liked' : ''}`}
          onClick={handleLike}
        >
          <Heart size={28} fill={template.isLiked ? '#ff2d55' : 'none'} />
          <span>{formatCount(template.likesCount)}</span>
        </button>

        {/* Comments */}
        <button className="vertical-feed-item__action" onClick={onClick}>
          <MessageCircle size={28} />
          <span>0</span>
        </button>

        {/* Bookmark */}
        <button
          className={`vertical-feed-item__action ${isBookmarked ? 'vertical-feed-item__action--bookmarked' : ''}`}
          onClick={handleBookmark}
        >
          <Bookmark
            size={28}
            fill={isBookmarked ? BRAND_COLORS.amber : 'none'}
          />
        </button>

        {/* Share */}
        <button className="vertical-feed-item__action" onClick={handleShare}>
          <Share2 size={28} />
        </button>

        {/* Sound disc */}
        <div className="vertical-feed-item__sound-disc">
          <Music2 size={16} />
        </div>
      </div>

      {/* Bottom info */}
      <div className="vertical-feed-item__info">
        <div className="vertical-feed-item__user">
          <span className="vertical-feed-item__username">
            @{template.creatorUsername || template.creatorName}
          </span>
        </div>
        <p className="vertical-feed-item__description">
          {template.name}
          {bodyAfterTitle(template.name, template.description) && (
            <span>
              {' '}
              · {bodyAfterTitle(template.name, template.description)}
            </span>
          )}
        </p>
        <div className="vertical-feed-item__sound">
          <Music2 size={14} />
          <span className="vertical-feed-item__sound-name">Original Sound</span>
        </div>
      </div>

      {/* Mute toggle */}
      <button className="vertical-feed-item__mute" onClick={handleMuteToggle}>
        {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
      </button>
    </div>
  )
}
