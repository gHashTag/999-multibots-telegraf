import { useCallback, useState, useRef, useEffect } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { assetsAtom, addAssetAtom, removeAssetAtom, addItemAtom } from '@/atoms'
import { useLanguage } from '@/hooks/useLanguage'
import {
  Music,
  Trash2,
  Upload,
  Loader2,
  Play,
  Maximize,
  Minimize2,
  Film,
} from 'lucide-react'
import type { Asset, AssetType } from '@vibee/atoms'
import { DEFAULT_WIDTH, DEFAULT_HEIGHT } from '@vibee/atoms'
import { broadcastAssetAdded, broadcastAssetRemoved } from '@/lib/websocket'
import { toAbsoluteUrl } from '@/lib/mediaUrl'
// The one signed door to /upload (X-Telegram-Init-Data); a bare fetch here was
// refused by the server in enforce mode: "no X-Api-Key and no Telegram initData".
import { uploadToS3 } from '@/lib/s3Upload'
import './AssetsPanel.css'

// Render server URL (for S3 uploads)

interface UploadProgress {
  fileName: string
  progress: number
  status: 'uploading' | 'done' | 'error'
  error?: string
}

// Generate thumbnail from video (preserves aspect ratio)
function generateVideoThumbnail(videoUrl: string): Promise<string> {
  return new Promise(resolve => {
    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'
    video.muted = true
    video.preload = 'metadata'

    video.onloadeddata = () => {
      video.currentTime = 0.1 // Seek to 0.1s for thumbnail
    }

    video.onseeked = () => {
      const canvas = document.createElement('canvas')
      // Preserve original aspect ratio, max 300px on longest side for sharp thumbnails
      const maxSize = 300
      const vw = video.videoWidth
      const vh = video.videoHeight

      if (vw > vh) {
        // Landscape
        canvas.width = maxSize
        canvas.height = Math.round((vh / vw) * maxSize)
      } else {
        // Portrait or square
        canvas.height = maxSize
        canvas.width = Math.round((vw / vh) * maxSize)
      }

      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      } else {
        resolve('')
      }
    }

    video.onerror = () => resolve('')
    video.src = videoUrl
  })
}

// Get video duration
function getVideoDuration(videoUrl: string): Promise<number> {
  return new Promise(resolve => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => resolve(video.duration)
    video.onerror = () => resolve(0)
    video.src = videoUrl
  })
}

// Format duration as mm:ss
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// Format file size
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface AssetsPanelProps {
  // Templates, Avatar(lipsync), Video, Photo(image), Voice, Music
  filterType?: 'video' | 'image' | 'audio' | 'lipsync' | 'voice' | 'music'
}

export function AssetsPanel({ filterType }: AssetsPanelProps) {
  const { t } = useLanguage()
  const assets = useAtomValue(assetsAtom)
  const addAsset = useSetAtom(addAssetAtom)
  const removeAsset = useSetAtom(removeAssetAtom)
  const addItem = useSetAtom(addItemAtom)
  const [uploads, setUploads] = useState<UploadProgress[]>([])
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({})
  const [durations, setDurations] = useState<Record<string, number>>({})
  const [viewMode, setViewMode] = useState<'fill' | 'fit'>('fill')

  // Generate thumbnails for video assets
  useEffect(() => {
    assets.forEach(async asset => {
      if (asset.type === 'video' && !thumbnails[asset.id]) {
        const absoluteUrl = toAbsoluteUrl(asset.url)
        const thumb = await generateVideoThumbnail(absoluteUrl)
        if (thumb) {
          setThumbnails(prev => ({ ...prev, [asset.id]: thumb }))
        }
        const duration = await getVideoDuration(absoluteUrl)
        if (duration) {
          setDurations(prev => ({ ...prev, [asset.id]: duration }))
        }
      }
      // Generate thumbnails for images too
      if (asset.type === 'image' && !thumbnails[asset.id]) {
        const absoluteUrl = toAbsoluteUrl(asset.url)
        setThumbnails(prev => ({ ...prev, [asset.id]: absoluteUrl }))
      }
    })
  }, [assets, thumbnails])

  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files) return

    for (const file of Array.from(files)) {
      let type: AssetType

      if (file.type.startsWith('video/')) {
        type = 'video'
      } else if (file.type.startsWith('image/')) {
        type = 'image'
      } else if (file.type.startsWith('audio/')) {
        // Use filterType to determine if it's music or voice
        type =
          filterType === 'music'
            ? 'music'
            : filterType === 'voice'
              ? 'voice'
              : 'audio'
      } else {
        continue
      }

      setUploads(prev => [
        ...prev,
        { fileName: file.name, progress: 0, status: 'uploading' },
      ])

      let url = await uploadToS3(file, file.name).catch(error => {
        console.error('S3 upload error:', error)
        return null
      })

      if (!url) {
        url = URL.createObjectURL(file)
        console.warn(`S3 upload failed for ${file.name}, using local blob`)
      }

      setUploads(prev =>
        prev.map(u =>
          u.fileName === file.name ? { ...u, progress: 100, status: 'done' } : u
        )
      )

      const newAsset: Asset = {
        id: `asset-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        type,
        name: file.name,
        url,
        fileSize: file.size,
      }

      addAsset(newAsset)
      broadcastAssetAdded(newAsset)

      setTimeout(() => {
        setUploads(prev => prev.filter(u => u.fileName !== file.name))
      }, 2000)
    }
  }, [])

  const handleRemoveAsset = useCallback(
    (id: string) => {
      const asset = assets.find(a => a.id === id)
      if (asset?.url.startsWith('blob:')) {
        URL.revokeObjectURL(asset.url)
      }
      removeAsset(id)
      broadcastAssetRemoved(id)
      // Clean up thumbnail
      setThumbnails(prev => {
        const { [id]: _, ...rest } = prev
        return rest
      })
    },
    [assets, removeAsset]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      handleFileUpload(e.dataTransfer.files)
    },
    [handleFileUpload]
  )

  const handleDragStart = (e: React.DragEvent, asset: Asset) => {
    e.dataTransfer.setData('application/json', JSON.stringify(asset))
    e.dataTransfer.effectAllowed = 'copy'
  }

  const handleAddToTimeline = (asset: Asset) => {
    // Map asset type to track ID
    const trackId =
      asset.type === 'video'
        ? 'track-video'
        : asset.type === 'image'
          ? 'track-image'
          : asset.type === 'audio' ||
              asset.type === 'music' ||
              asset.type === 'voice'
            ? 'track-audio'
            : 'track-video'

    // For track items, music/voice become 'audio' type (TrackItem limitation)
    const itemType =
      asset.type === 'music' || asset.type === 'voice' ? 'audio' : asset.type

    addItem({
      trackId,
      itemData: {
        type: itemType as any,
        assetId: asset.id,
        startFrame: 0,
        durationInFrames: asset.duration || 150,
        x: 0,
        y: 0,
        width: DEFAULT_WIDTH,
        height: DEFAULT_HEIGHT,
        rotation: 0,
        opacity: 1,
        ...(asset.type === 'video' && { volume: 1, playbackRate: 1 }),
        ...((asset.type === 'audio' ||
          asset.type === 'music' ||
          asset.type === 'voice') && { volume: 1 }),
      },
    })
  }

  const videoAssets = assets.filter(a => a.type === 'video')
  const imageAssets = assets.filter(a => a.type === 'image')
  const audioAssets = assets.filter(a => a.type === 'audio') // Legacy audio
  const voiceAssets = assets.filter(a => a.type === 'voice')
  const musicAssets = assets.filter(
    a => a.type === 'music' || a.type === 'audio'
  ) // Music includes legacy audio

  // Get accept type for file input based on filter
  const getAcceptType = () => {
    if (filterType === 'video' || filterType === 'lipsync') return 'video/*'
    if (filterType === 'image') return 'image/*'
    if (
      filterType === 'audio' ||
      filterType === 'voice' ||
      filterType === 'music'
    )
      return 'audio/*'
    return 'video/*,image/*,audio/*'
  }

  return (
    <div className="assets-panel">
      {/* Header with upload button and view mode */}
      <div className="panel-header">
        <div className="panel-header-actions">
          {/* Compact Upload Button */}
          <input
            type="file"
            id="file-upload"
            multiple
            accept={getAcceptType()}
            onChange={e => handleFileUpload(e.target.files)}
            style={{ display: 'none' }}
          />
          <label
            htmlFor="file-upload"
            className="upload-btn"
            title={t('assets.dropOrClick')}
          >
            <Upload size={14} />
          </label>
          {/* View Mode Toggle */}
          <button
            className={`view-mode-btn ${viewMode === 'fill' ? 'active' : ''}`}
            onClick={() => setViewMode('fill')}
            title="Fill"
          >
            <Maximize size={14} />
          </button>
          <button
            className={`view-mode-btn ${viewMode === 'fit' ? 'active' : ''}`}
            onClick={() => setViewMode('fit')}
            title="Fit"
          >
            <Minimize2 size={14} />
          </button>
        </div>
      </div>

      {/* Drop zone (compact) */}
      <div
        className="upload-zone-compact"
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
      >
        <Upload size={14} />
        <span>{t('assets.dropOrClick')}</span>
      </div>

      {/* Upload Progress */}
      {uploads.length > 0 && (
        <div className="upload-progress-list">
          {uploads.map(upload => (
            <div
              key={upload.fileName}
              className={`upload-progress-item ${upload.status}`}
            >
              <Loader2
                size={14}
                className={upload.status === 'uploading' ? 'spin' : ''}
              />
              <span className="upload-filename">{upload.fileName}</span>
              <span className="upload-status">
                {upload.status === 'uploading'
                  ? t('assets.uploading')
                  : upload.status === 'done'
                    ? t('assets.done')
                    : t('assets.error')}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Videos - Grid View (includes lipsync filter) */}
      {(!filterType || filterType === 'video' || filterType === 'lipsync') &&
        videoAssets.length > 0 && (
          <div className="asset-group">
            {!filterType && (
              <h3 className="asset-group-title">
                {t('assets.videos')}
                <span className="asset-count">{videoAssets.length}</span>
              </h3>
            )}
            <div className={`asset-grid ${viewMode}-mode`}>
              {videoAssets.map(asset => (
                <VideoAssetCard
                  key={asset.id}
                  asset={asset}
                  thumbnail={thumbnails[asset.id]}
                  duration={durations[asset.id]}
                  viewMode={viewMode}
                  onDragStart={handleDragStart}
                  onAddToTimeline={handleAddToTimeline}
                  onRemove={handleRemoveAsset}
                  t={t}
                />
              ))}
            </div>
          </div>
        )}

      {/* Images - Grid View */}
      {(!filterType || filterType === 'image') && imageAssets.length > 0 && (
        <div className="asset-group">
          {!filterType && (
            <h3 className="asset-group-title">
              {t('assets.images')}
              <span className="asset-count">{imageAssets.length}</span>
            </h3>
          )}
          <div className={`asset-grid ${viewMode}-mode`}>
            {imageAssets.map(asset => (
              <ImageAssetCard
                key={asset.id}
                asset={asset}
                thumbnail={thumbnails[asset.id]}
                viewMode={viewMode}
                onDragStart={handleDragStart}
                onAddToTimeline={handleAddToTimeline}
                onRemove={handleRemoveAsset}
                t={t}
              />
            ))}
          </div>
        </div>
      )}

      {/* Voice - Grid View (from generation only, not uploads) */}
      {filterType === 'voice' && voiceAssets.length > 0 && (
        <div className="asset-group">
          <div className={`asset-grid ${viewMode}-mode`}>
            {voiceAssets.map(asset => (
              <AudioAssetCard
                key={asset.id}
                asset={asset}
                onDragStart={handleDragStart}
                onAddToTimeline={handleAddToTimeline}
                onRemove={handleRemoveAsset}
                t={t}
              />
            ))}
          </div>
        </div>
      )}

      {/* Music - Grid View */}
      {(!filterType || filterType === 'audio' || filterType === 'music') &&
        musicAssets.length > 0 && (
          <div className="asset-group">
            {!filterType && (
              <h3 className="asset-group-title">
                {t('generate.music')}
                <span className="asset-count">{musicAssets.length}</span>
              </h3>
            )}
            <div className={`asset-grid ${viewMode}-mode`}>
              {musicAssets.map(asset => (
                <AudioAssetCard
                  key={asset.id}
                  asset={asset}
                  onDragStart={handleDragStart}
                  onAddToTimeline={handleAddToTimeline}
                  onRemove={handleRemoveAsset}
                  t={t}
                />
              ))}
            </div>
          </div>
        )}

      {/* Empty state for filtered view */}
      {(filterType === 'video' || filterType === 'lipsync') &&
        videoAssets.length === 0 && (
          <div className="assets-empty">{t('assets.noVideos')}</div>
        )}
      {filterType === 'image' && imageAssets.length === 0 && (
        <div className="assets-empty">{t('assets.noImages')}</div>
      )}
      {filterType === 'voice' && voiceAssets.length === 0 && (
        <div className="assets-empty">{t('assets.noVoice')}</div>
      )}
      {filterType === 'music' && musicAssets.length === 0 && (
        <div className="assets-empty">{t('assets.noMusic')}</div>
      )}
    </div>
  )
}

// Video Card with thumbnail and hover preview
interface VideoAssetCardProps {
  asset: Asset
  thumbnail?: string
  duration?: number
  viewMode: 'fill' | 'fit'
  onDragStart: (e: React.DragEvent, asset: Asset) => void
  onAddToTimeline: (asset: Asset) => void
  onRemove: (id: string) => void
  t: (key: string) => string
}

function VideoAssetCard({
  asset,
  thumbnail,
  duration,
  viewMode,
  onDragStart,
  onAddToTimeline,
  onRemove,
  t,
}: VideoAssetCardProps) {
  const [isHovering, setIsHovering] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const isBlobUrl = asset.url.startsWith('blob:')
  const videoUrl = toAbsoluteUrl(asset.url)

  useEffect(() => {
    if (videoRef.current) {
      if (isHovering) {
        videoRef.current.play().catch(() => {})
      } else {
        videoRef.current.pause()
        videoRef.current.currentTime = 0
      }
    }
  }, [isHovering])

  return (
    <div
      className={`asset-card ${isBlobUrl ? 'blob-warning' : ''}`}
      draggable
      onDragStart={e => onDragStart(e, asset)}
      onDoubleClick={() => onAddToTimeline(asset)}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      title={asset.name}
    >
      <div className="asset-card-thumbnail">
        {isHovering ? (
          <video
            ref={videoRef}
            src={videoUrl}
            muted
            loop
            playsInline
            className="asset-card-video"
          />
        ) : thumbnail ? (
          <img src={thumbnail} alt={asset.name} className="asset-card-img" />
        ) : (
          <div className="asset-card-placeholder">
            <Play size={16} />
          </div>
        )}
        {duration && (
          <span className="asset-card-duration">
            {formatDuration(duration)}
          </span>
        )}
        {/* Overlay info */}
        <div className="asset-card-overlay">
          <span className="asset-card-name">{asset.name}</span>
          {asset.fileSize && (
            <span className="asset-card-size">
              {formatFileSize(asset.fileSize)}
            </span>
          )}
        </div>
        {isBlobUrl && <span className="asset-card-warning">⚠️</span>}
      </div>
      <button
        className="asset-card-remove"
        onClick={e => {
          e.stopPropagation()
          onRemove(asset.id)
        }}
      >
        <Trash2 size={10} />
      </button>
    </div>
  )
}

// Image Card
interface ImageAssetCardProps {
  asset: Asset
  thumbnail?: string
  viewMode: 'fill' | 'fit'
  onDragStart: (e: React.DragEvent, asset: Asset) => void
  onAddToTimeline: (asset: Asset) => void
  onRemove: (id: string) => void
  t: (key: string) => string
}

function ImageAssetCard({
  asset,
  thumbnail,
  viewMode,
  onDragStart,
  onAddToTimeline,
  onRemove,
  t,
}: ImageAssetCardProps) {
  const isBlobUrl = asset.url.startsWith('blob:')
  const imageUrl = thumbnail || toAbsoluteUrl(asset.url)

  return (
    <div
      className={`asset-card ${isBlobUrl ? 'blob-warning' : ''}`}
      draggable
      onDragStart={e => onDragStart(e, asset)}
      onDoubleClick={() => onAddToTimeline(asset)}
      title={asset.name}
    >
      <div className="asset-card-thumbnail">
        <img src={imageUrl} alt={asset.name} className="asset-card-img" />
        {/* Overlay info like video cards */}
        <div className="asset-card-overlay">
          <span className="asset-card-name">{asset.name}</span>
          {asset.fileSize && (
            <span className="asset-card-size">
              {formatFileSize(asset.fileSize)}
            </span>
          )}
        </div>
        {isBlobUrl && <span className="asset-card-warning">⚠️</span>}
      </div>
      <button
        className="asset-card-remove"
        onClick={e => {
          e.stopPropagation()
          onRemove(asset.id)
        }}
      >
        <Trash2 size={10} />
      </button>
    </div>
  )
}

// Audio Card (grid view - same style as video/image)
interface AudioAssetCardProps {
  asset: Asset
  onDragStart: (e: React.DragEvent, asset: Asset) => void
  onAddToTimeline: (asset: Asset) => void
  onRemove: (id: string) => void
  t: (key: string) => string
}

function AudioAssetCard({
  asset,
  onDragStart,
  onAddToTimeline,
  onRemove,
  t,
}: AudioAssetCardProps) {
  const isBlobUrl = asset.url.startsWith('blob:')

  return (
    <div
      className={`asset-card ${isBlobUrl ? 'blob-warning' : ''}`}
      draggable
      onDragStart={e => onDragStart(e, asset)}
      onDoubleClick={() => onAddToTimeline(asset)}
      title={asset.name}
    >
      <div className="asset-card-thumbnail vinyl-thumbnail">
        <div className="vinyl-record">
          <div className="vinyl-grooves"></div>
          <div className="vinyl-label">
            <Music size={12} />
          </div>
        </div>
      </div>
      <div className="asset-card-info">
        <span className="asset-card-name">{asset.name}</span>
        {asset.fileSize && (
          <span className="asset-card-size">
            {formatFileSize(asset.fileSize)}
          </span>
        )}
      </div>
      {isBlobUrl && <span className="asset-card-warning">⚠️</span>}
      <button
        className="asset-card-remove"
        onClick={e => {
          e.stopPropagation()
          onRemove(asset.id)
        }}
      >
        <Trash2 size={10} />
      </button>
    </div>
  )
}
