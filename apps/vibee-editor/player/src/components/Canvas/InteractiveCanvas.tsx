import { useRef, useEffect, useCallback, useState, useMemo } from 'react'
import { Player } from '@remotion/player'
import type { PlayerRef } from '@remotion/player'
import { prefetch } from 'remotion'
import { preloadVideo, preloadAudio } from '@remotion/preload'
import { useAtomValue, useSetAtom } from 'jotai'
import { useLanguage } from '@/hooks/useLanguage'
import { useBRollCache } from '@/hooks/useBRollCache'
import { prefetchVideosParallel } from '@/lib/parallelPrefetcher'
import { useViewportPreload } from '@/hooks/useViewportPreload'
import {
  projectAtom,
  currentFrameAtom,
  isPlayingAtom,
  isMutedAtom,
  playbackRateAtom,
  canvasZoomAtom,
  tracksAtom,
  assetsAtom,
  playerRefAtom,
  clearSelectionAtom,
  templatePropsAtom,
  captionsLoadingAtom,
  avatarSettingsTabAtom,
  currentRemixSourceAtom,
  addItemAtom,
  lipSyncVideoAtom,
  backgroundMusicAtom,
} from '@/atoms'
import { useIsTablet, useMediaQuery } from '@/hooks/useMediaQuery'
import {
  SplitTalkingHead,
  type SplitTalkingHeadProps,
  type Segment,
} from '@compositions/SplitTalkingHead'
import { Loader2, Upload } from 'lucide-react'
import { convertPropsToAbsoluteUrls, toAbsoluteUrl } from '@/lib/mediaUrl'
import {
  convertToSplitTalkingHeadProps,
  getAudioTrackOverride,
} from '@/lib/buildCompositionProps'
import type { LipSyncMainProps, TrackItem, Asset } from '@vibee/atoms'
import {
  DEFAULT_MUSIC_VOLUME,
  BRAND_COLORS,
  DEFAULT_WIDTH,
  DEFAULT_HEIGHT,
} from '@vibee/atoms'
import { TabletPlaybackControls } from './TabletPlaybackControls'
import { CanvasOverlays, CanvasControls } from './CanvasOverlays'
import { SelectionOverlay } from './SelectionOverlay'
import './InteractiveCanvas.css'

export function InteractiveCanvas() {
  const playerRef = useRef<PlayerRef>(null)

  /**
   * Встроенные кнопки плеера на телефоне выключены.
   *
   * Player рисуется в размере композиции (1080x1920) и масштабируется CSS до
   * ~25%, поэтому его собственные кнопки уменьшаются вместе с видео: замерено
   * 6x9, 6x6 и 4x9 пикселей — попасть пальцем невозможно. Своя панель
   * управления с целями 44px уже есть, а clickToPlay оставляет тап по кадру.
   */
  const isNarrow = !useMediaQuery('(min-width: 768px)')
  const containerRef = useRef<HTMLDivElement>(null)
  const [autoZoom, setAutoZoom] = useState(0.3)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [fullscreenZoom, setFullscreenZoom] = useState(1)
  const [isDragOver, setIsDragOver] = useState(false)
  const [showGrid, setShowGrid] = useState(false)
  const [showSafeZone, setShowSafeZone] = useState(false)
  const [safeZoneType, setSafeZoneType] = useState<
    '9:16' | '1:1' | '4:5' | '16:9'
  >('9:16')
  const isTablet = useIsTablet()

  // Jotai atoms - прямое использование
  const project = useAtomValue(projectAtom)
  const currentFrame = useAtomValue(currentFrameAtom)
  const isPlaying = useAtomValue(isPlayingAtom)
  const isMuted = useAtomValue(isMutedAtom)
  const playbackRate = useAtomValue(playbackRateAtom)
  const canvasZoom = useAtomValue(canvasZoomAtom)
  const tracks = useAtomValue(tracksAtom)
  const assets = useAtomValue(assetsAtom)
  const captionsLoading = useAtomValue(captionsLoadingAtom)
  const avatarSettingsTab = useAtomValue(avatarSettingsTabAtom)
  const remixSource = useAtomValue(currentRemixSourceAtom)

  const { t } = useLanguage()

  // B-Roll IndexedDB caching - stores video blobs for instant repeat playback
  const brollCache = useBRollCache()

  const setCurrentFrame = useSetAtom(currentFrameAtom)
  const setIsPlaying = useSetAtom(isPlayingAtom)
  const setCanvasZoom = useSetAtom(canvasZoomAtom)
  const clearSelection = useSetAtom(clearSelectionAtom)
  const addItem = useSetAtom(addItemAtom)
  const setLipSyncVideo = useSetAtom(lipSyncVideoAtom)
  const setBackgroundMusic = useSetAtom(backgroundMusicAtom)
  const setPlayerRefAtom = useSetAtom(playerRefAtom)

  // Store player ref for direct control (needed for autoplay policy)
  useEffect(() => {
    setPlayerRefAtom(playerRef)
  }, [setPlayerRefAtom])

  // Get video track items for timeline position sync
  const videoTrackItems = useMemo(() => {
    const videoTrack = tracks.find(t => t.type === 'video')
    return videoTrack?.items || []
  }, [tracks])

  const imageTrackItems = useMemo(() => {
    const imageTrack = tracks.find(t => t.type === 'image')
    return imageTrack?.items || []
  }, [tracks])

  // Get audio track volume and URL from track items (shared with export)
  const { audioTrackVolume, audioTrackUrl } = useMemo(
    () => getAudioTrackOverride(tracks, assets),
    [tracks, assets]
  )

  // Get avatar track volume from track item
  const avatarTrackVolume = useMemo(() => {
    const avatarTrack = tracks.find(t => t.type === 'avatar')
    const avatarItem = avatarTrack?.items[0]
    return (avatarItem as any)?.volume ?? 1
  }, [tracks])

  // Get computed props for LipSyncMain (base props from store)
  const lipSyncPropsRaw = useAtomValue(templatePropsAtom)

  // Don't convert default media to render server URLs — they're served
  // by nginx on the same origin (vibee-player-app.fly.dev).
  // Only the export flow (Timeline.tsx) needs render-server-absolute URLs.
  // User-generated assets are converted in convertToSplitTalkingHeadProps.
  const lipSyncPropsWithUrls = lipSyncPropsRaw

  // Convert to SplitTalkingHead props - using actual timeline positions
  const splitTalkingHeadPropsRaw = useMemo(
    () =>
      convertToSplitTalkingHeadProps(
        lipSyncPropsWithUrls,
        project.durationInFrames,
        project.fps,
        videoTrackItems,
        imageTrackItems,
        assets,
        avatarSettingsTab
      ),
    [
      lipSyncPropsWithUrls,
      project.durationInFrames,
      project.fps,
      videoTrackItems,
      imageTrackItems,
      assets,
      avatarSettingsTab,
    ]
  )

  // Apply IndexedDB cached blob URLs for instant B-roll playback (Phase 2 optimization)
  const splitTalkingHeadPropsBase = useMemo(() => {
    if (brollCache.cachedCount === 0) return splitTalkingHeadPropsRaw

    return {
      ...splitTalkingHeadPropsRaw,
      segments: splitTalkingHeadPropsRaw.segments.map((segment: Segment) => {
        if (segment.type !== 'split' || !segment.bRollUrl) return segment

        // Use cached blob URL if available (instant playback from IndexedDB)
        const cachedUrl = brollCache.getBlobUrl(segment.bRollUrl)
        if (cachedUrl) {
          return { ...segment, bRollUrl: cachedUrl }
        }
        return segment
      }),
    }
  }, [splitTalkingHeadPropsRaw, brollCache.cachedCount, brollCache.getBlobUrl])

  // Apply mute/volume state to music and video
  // Use track item volumes (controlled by VolumePopup)
  // Override backgroundMusic if audio was added via timeline
  const splitTalkingHeadProps = useMemo(() => {
    const props = {
      ...splitTalkingHeadPropsBase,
      // Background music - use audio from track if available, otherwise use default
      // NOTE: Do NOT use toAbsoluteUrl - use raw URLs for preview (same origin)
      backgroundMusic:
        audioTrackUrl || splitTalkingHeadPropsBase.backgroundMusic,
      // Background music volume - use audio track item volume
      musicVolume: isMuted ? 0 : audioTrackVolume,
      // LipSync video (avatar) volume - use avatar track item volume
      videoVolume: isMuted ? 0 : avatarTrackVolume,
    }
    return props
  }, [
    splitTalkingHeadPropsBase,
    isMuted,
    audioTrackVolume,
    avatarTrackVolume,
    audioTrackUrl,
  ])

  // 🎬 Optimized video preloading based on scientific research (DeLoad 2025, GRU Bandwidth 2024)
  // Strategy: Range request first 1MB (metadata + keyframes) → IndexedDB cache → full prefetch → preload hints

  // Collect all B-roll URLs from segments
  const brollUrls = useMemo(() => {
    return (
      splitTalkingHeadPropsBase.segments
        ?.filter(s => s.type === 'split' && Boolean(s.bRollUrl))
        .map(s => s.bRollUrl!) || []
    )
  }, [splitTalkingHeadPropsBase.segments])

  // Cache B-roll videos in IndexedDB for instant repeat playback
  useEffect(() => {
    if (brollUrls.length > 0 && !brollCache.isLoading) {
      brollCache.cacheVideos(brollUrls)
    }
  }, [brollUrls, brollCache.isLoading, brollCache.cacheVideos])

  // 🚀 Phase 9: Parallel Prefetch Pipeline (replaces sequential phases)
  // Based on research: Parallel execution reduces startup time by 15-25%
  useEffect(() => {
    // Collect all video URLs to prefetch
    const allVideoUrls: string[] = []

    if (
      lipSyncPropsRaw.lipSyncVideo &&
      !lipSyncPropsRaw.lipSyncVideo.startsWith('blob:')
    ) {
      allVideoUrls.push(lipSyncPropsRaw.lipSyncVideo)
    }

    // Add B-roll URLs (skip if already cached)
    brollUrls.forEach((url: string) => {
      if (url && !url.startsWith('blob:') && !brollCache.isCached(url)) {
        allVideoUrls.push(url)
      }
    })

    if (allVideoUrls.length === 0) return

    // Prefetch all videos in parallel with first-frame JPEG support
    prefetchVideosParallel(allVideoUrls, {
      preloadFirstFrame: true,
      skipIfCached: true,
      maxConcurrent: 3,
    }).then(results => {
      const cached = results.filter(r => r.cached).length
      const prefetched = results.filter(r => r.prefetched).length
      const avgDuration =
        results.reduce((sum, r) => sum + r.durationMs, 0) / results.length
      console.log(
        `[Prefetch] ${results.length} videos: ${cached} cached, ${prefetched} prefetched, avg ${avgDuration.toFixed(0)}ms`
      )
    })

    // Also preload audio separately
    if (
      lipSyncPropsRaw.backgroundMusic &&
      !lipSyncPropsRaw.backgroundMusic.startsWith('blob:')
    ) {
      preloadAudio(lipSyncPropsRaw.backgroundMusic)
    }
  }, [
    lipSyncPropsRaw.lipSyncVideo,
    lipSyncPropsRaw.backgroundMusic,
    brollUrls,
    brollCache.isCached,
  ])

  // 🎯 Phase 11: Viewport-based preloading (TikTok-style)
  // Prioritizes videos closest to current playback position
  const viewportPreload = useViewportPreload(
    splitTalkingHeadPropsBase.segments || [],
    currentFrame,
    { fps: project.fps, lookaheadSeconds: 5, maxPreload: 2 }
  )

  // Calculate zoom to fit height (allow scaling up for vertical videos)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateZoom = () => {
      const containerHeight = container.clientHeight - 40 // small padding
      const containerWidth = container.clientWidth - 40
      const videoHeight = project.height
      const videoWidth = project.width

      // Calculate zoom to fit both dimensions
      const fitHeightZoom = containerHeight / videoHeight
      const fitWidthZoom = containerWidth / videoWidth

      // Use the smaller zoom to ensure video fits in both dimensions
      const fitZoom = Math.min(fitHeightZoom, fitWidthZoom)
      setAutoZoom(fitZoom) // Allow scaling up for small/vertical videos
    }

    updateZoom()
    const observer = new ResizeObserver(updateZoom)
    observer.observe(container)

    return () => observer.disconnect()
  }, [project.height, project.width])

  // Sync player with store - frame updates (use ref to prevent seekTo→frameupdate loop)
  const lastFrameFromPlayer = useRef<number>(-1)
  useEffect(() => {
    const player = playerRef.current
    if (!player) return

    const handleFrameUpdate = (e: { detail: { frame: number } }) => {
      const frame = e.detail.frame
      if (frame !== lastFrameFromPlayer.current) {
        lastFrameFromPlayer.current = frame
        setCurrentFrame(frame)
      }
    }

    player.addEventListener('frameupdate', handleFrameUpdate)
    return () => {
      player.removeEventListener('frameupdate', handleFrameUpdate)
    }
  }, [setCurrentFrame])

  // Control playback
  useEffect(() => {
    const player = playerRef.current
    if (!player) return

    if (isPlaying) {
      player.play()
    } else {
      player.pause()
    }
  }, [isPlaying])

  // Sync player playback state
  useEffect(() => {
    const player = playerRef.current
    if (!player) return

    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)

    player.addEventListener('play', handlePlay)
    player.addEventListener('pause', handlePause)

    return () => {
      player.removeEventListener('play', handlePlay)
      player.removeEventListener('pause', handlePause)
    }
  }, [setIsPlaying])

  // Seek to frame when currentFrame changes externally
  useEffect(() => {
    const player = playerRef.current
    if (!player || isPlaying) return

    player.seekTo(currentFrame)
  }, [currentFrame, isPlaying])

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      // Click on empty canvas = clear selection
      if (e.target === e.currentTarget) {
        clearSelection()
      }
    },
    [clearSelection]
  )

  // Drag & Drop handlers for Canvas (tablet only)
  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!isTablet) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setIsDragOver(true)
    },
    [isTablet]
  )

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      if (!isTablet) return
      // Only trigger if leaving the container itself
      if (e.currentTarget === e.target) {
        setIsDragOver(false)
      }
    },
    [isTablet]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (!isTablet) return
      e.preventDefault()
      setIsDragOver(false)

      try {
        const data = e.dataTransfer.getData('application/json')
        if (!data) return

        const asset: Asset = JSON.parse(data)

        // Map asset type to track ID and handle special cases
        if (asset.type === 'video') {
          // Video goes to video track
          addItem({
            trackId: 'track-video',
            itemData: {
              type: 'video',
              assetId: asset.id,
              startFrame: 0,
              durationInFrames: asset.duration || 150,
              x: 0,
              y: 0,
              width: asset.width || DEFAULT_WIDTH,
              height: asset.height || DEFAULT_HEIGHT,
              rotation: 0,
              opacity: 1,
            } as any,
          })
        } else if (asset.type === 'audio') {
          // Audio goes to audio track and updates backgroundMusic
          addItem({
            trackId: 'track-audio',
            itemData: {
              type: 'audio',
              assetId: asset.id,
              startFrame: 0,
              durationInFrames: asset.duration || 300,
              x: 0,
              y: 0,
              width: 0,
              height: 0,
              rotation: 0,
              opacity: 1,
            } as any,
          })
          if (asset.url) {
            setBackgroundMusic(asset.url)
          }
        } else if (asset.type === 'image') {
          // Image goes to image track
          addItem({
            trackId: 'track-image',
            itemData: {
              type: 'image',
              assetId: asset.id,
              startFrame: 0,
              durationInFrames: 150,
              x: 0,
              y: 0,
              width: asset.width || DEFAULT_WIDTH,
              height: asset.height || DEFAULT_HEIGHT,
              rotation: 0,
              opacity: 1,
            },
          })
        }

        console.log(`[Canvas] Dropped ${asset.name} (${asset.type})`)
      } catch (error) {
        console.error('[Canvas] Drop error:', error)
      }
    },
    [isTablet, addItem, setBackgroundMusic]
  )

  // Use autoZoom if canvasZoom hasn't been manually set
  const effectiveZoom = canvasZoom || autoZoom

  // Listen for fullscreen changes and calculate zoom
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFs = !!document.fullscreenElement
      setIsFullscreen(isFs)

      if (isFs) {
        // Calculate zoom to fit video height to screen height
        const screenHeight = window.innerHeight
        const videoHeight = project.height
        const zoom = (screenHeight - 40) / videoHeight // 40px padding
        setFullscreenZoom(Math.min(zoom, 1)) // Don't zoom more than 100%
      }
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () =>
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [project.height])

  return (
    <div
      className={`canvas-container ${isDragOver ? 'drag-over' : ''}`}
      onClick={handleCanvasClick}
      ref={containerRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drop Zone Overlay (tablet only) */}
      {isDragOver && isTablet && (
        <div className="canvas-drop-zone">
          <div className="canvas-drop-zone-content">
            <Upload size={48} />
            <span>{t('canvas.dropToAdd')}</span>
          </div>
        </div>
      )}

      {/* Transcribing/Loading Overlay */}
      {captionsLoading && (
        <div className="canvas-transcribing-overlay">
          <div className="transcribing-indicator">
            <Loader2 size={20} className="transcribing-spinner" />
            <span>{t('canvas.loadingCaptions')}</span>
          </div>
        </div>
      )}

      {/* Player Wrapper */}
      <div
        className="canvas-player-wrapper"
        style={{
          transform: isFullscreen
            ? `translate(-50%, -50%) scale(${fullscreenZoom})`
            : `scale(${effectiveZoom})`,
        }}
      >
        <Player
          ref={playerRef}
          component={
            SplitTalkingHead as unknown as React.ComponentType<
              Record<string, unknown>
            >
          }
          inputProps={
            splitTalkingHeadProps as unknown as Record<string, unknown>
          }
          durationInFrames={project.durationInFrames}
          fps={project.fps}
          compositionWidth={project.width}
          compositionHeight={project.height}
          style={{
            width: project.width,
            height: project.height,
          }}
          controls={!isNarrow}
          showVolumeControls={!isNarrow}
          loop
          clickToPlay={true}
          playbackRate={playbackRate}
          numberOfSharedAudioTags={4}
        />

        {/* Selection handles overlay */}
        <SelectionOverlay />

        {/* Canvas Overlays (Grid, Safe Zone) */}
        <CanvasOverlays
          showGrid={showGrid}
          showSafeZone={showSafeZone}
          safeZoneType={safeZoneType}
          zoom={effectiveZoom}
          onToggleGrid={() => setShowGrid(!showGrid)}
          onToggleSafeZone={() => setShowSafeZone(!showSafeZone)}
          onChangeSafeZone={setSafeZoneType}
          onZoomChange={setCanvasZoom}
          canvasWidth={project.width}
          canvasHeight={project.height}
        />
      </div>

      {/* Canvas Controls (Grid, Safe Zone, Zoom) */}
      <div className="canvas-controls-wrapper">
        <CanvasControls
          showGrid={showGrid}
          showSafeZone={showSafeZone}
          safeZoneType={safeZoneType}
          zoom={effectiveZoom}
          onToggleGrid={() => setShowGrid(!showGrid)}
          onToggleSafeZone={() => setShowSafeZone(!showSafeZone)}
          onChangeSafeZone={setSafeZoneType}
          onZoomChange={setCanvasZoom}
        />
      </div>

      {/* Template/Reel Name Overlay */}
      {remixSource && (
        <div className="canvas-template-info">
          <span className="template-name">{remixSource.templateName}</span>
          <span className="template-creator">by {remixSource.creatorName}</span>
        </div>
      )}

      {/* Tablet Playback Controls */}
      <TabletPlaybackControls />
    </div>
  )
}
