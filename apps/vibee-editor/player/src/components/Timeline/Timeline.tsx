import { useRef, useCallback, useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAtomValue, useSetAtom, useAtom } from 'jotai'
import { useLanguage } from '@/hooks/useLanguage'
import { useToast } from '@/hooks/useToast'
import { authHeaders, explainApiError, apiFetch } from '@/lib/apiFetch'
import {
  projectAtom,
  tracksAtom,
  currentFrameAtom,
  isPlayingAtom,
  playbackRateAtom,
  timelineZoomAtom,
  snapSettingsAtom,
  inPointAtom,
  outPointAtom,
  markersAtom,
  isMutedAtom,
  volumeAtom,
  playerRefAtom,
  playAtom,
  pauseAtom,
  setSnapEnabledAtom,
  updateTrackAtom,
  canvasZoomAtom,
  // Export atoms
  assetsAtom,
  addAssetAtom,
  avatarSettingsTabAtom,
  // Browser atoms
  filteredAssetsAtom,
  browserCategoryAtom,
  browserSearchAtom,
  browserUploadingAtom,
  browserUploadProgressAtom,
  categoryCounts,
  CATEGORY_CONFIG,
  type AssetCategory,
  isExportingAtom,
  exportProgressAtom,
  setExportingAtom,
  templatePropsAtom,
  userAtom,
  showPaywallAtom,
  showLoginModalAtom,
  canRenderAtom,
  logRenderAtom,
  // Undo/Redo atoms
  undoAtom,
  redoAtom,
  canUndoAtom,
  canRedoAtom,
  // Reset atoms
  resetTracksAtom,
  updateTemplatePropAtom,
  // Template props atoms for reset
  musicVolumeAtom,
  vignetteStrengthAtom,
  colorCorrectionAtom,
  faceOffsetXAtom,
  faceOffsetYAtom,
  showCaptionsAtom,
  splitCircleSizeAtom,
  splitPositionXAtom,
  splitPositionYAtom,
  splitFaceScaleAtom,
  splitIsCircleAtom,
  splitBorderRadiusAtom,
  fullscreenCircleSizeAtom,
  fullscreenPositionXAtom,
  fullscreenPositionYAtom,
  fullscreenFaceScaleAtom,
  fullscreenIsCircleAtom,
  fullscreenBorderRadiusAtom,
  // Templates
  addTemplateAtom,
  removeTemplateAtom,
  selectedTemplateIdAtom,
  templatesAtom,
  // Selection
  selectItemsAtom,
  // Track reorder
  reorderTracksAtom,
} from '@/atoms'
import {
  scrollToFrameAtom,
  clearScrollRequestAtom,
  activeSnapFrameAtom,
  isDraggingItemAtom,
} from '@/atoms/timeline'
import { publishModalOpenAtom, publishModalVideoUrlAtom } from '@/atoms/ui'
import { editorStore } from '@/atoms/Provider'
import { TimeRuler } from './TimeRuler'
import { Track } from './Track'
import { Playhead } from './Playhead'
import { VolumePopup } from './VolumePopup'
import { DragSnapLine } from './SnapIndicators'
import { TimelineMinimap } from './TimelineMinimap'
import { CloudProjectControls } from './CloudProjectControls'
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ZoomIn,
  ZoomOut,
  ChevronDown,
  ChevronUp,
  Magnet,
  Lock,
  Unlock,
  Maximize2,
  Maximize,
  Minimize,
  Volume2,
  VolumeX,
  Download,
  Loader2,
  AlertTriangle,
  X,
  Undo2,
  Redo2,
  Save,
  Upload,
  RotateCcw,
  Trash2,
  GripVertical,
  Plus,
  Search,
} from 'lucide-react'
import { AssetCard } from '@/components/Assets/AssetCard'
import {
  botAssetsAtom,
  botAssetsLoadingAtom,
  botAssetsErrorAtom,
  loadBotAssetsAtom,
} from '@/atoms'
import type { Asset } from '@vibee/atoms'
import { RENDER_SERVER_URL, toAbsoluteUrl } from '@/lib/mediaUrl'
import {
  convertToSplitTalkingHeadProps,
  getAudioTrackOverride,
} from '@/lib/buildCompositionProps'
import { DEFAULT_COMPOSITION_ID } from '@/shared/compositions'
import { logExport } from '@/lib/logger'
import {
  STORAGE_KEYS,
  DEFAULT_MUSIC_VOLUME,
  DEFAULT_VIGNETTE_STRENGTH,
  DEFAULT_COLOR_CORRECTION,
  DEFAULT_FPS,
  STATUS_COLORS,
} from '@vibee/atoms'
import { PublishModal } from '@/components/Modals/PublishModal'
import './Timeline.css'

// Render session type for localStorage persistence
interface RenderSession {
  renderId: string
  projectName: string
  startedAt: number
}
// Download file using fetch + blob to bypass CORS download restriction
async function downloadFile(url: string, filename: string): Promise<boolean> {
  try {
    console.log('[Download] Fetching file:', url)
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const blob = await response.blob()
    const blobUrl = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = blobUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    // Cleanup blob URL after short delay
    setTimeout(() => URL.revokeObjectURL(blobUrl), 100)

    console.log('[Download] Success!')
    return true
  } catch (error) {
    console.error('[Download] Failed:', error)
    // Fallback: open in new tab
    window.open(url, '_blank')
    return false
  }
}

interface TimelineProps {
  orientation?: 'horizontal' | 'vertical'
  hideBrowser?: boolean
}

export function Timeline({
  orientation = 'horizontal',
  hideBrowser = true,
}: TimelineProps) {
  const { t } = useLanguage()
  const toast = useToast()
  const timelineRef = useRef<HTMLDivElement>(null)
  const projectImportRef = useRef<HTMLInputElement>(null)

  // Jotai atoms - прямое использование
  /**
   * Публикуем РЕАЛЬНУЮ высоту таймлайна в CSS-переменную.
   *
   * .canvas-area резервировала место снизу формулой из констант
   * (--timeline-height + --nav-height), и на 390x844 это давало 284px при
   * фактических 218 — между превью и таймлайном зияли 57 мёртвых пикселей, а
   * видео недополучало высоту. Константа не может знать ни фактическую высоту
   * с транспортом, ни то, что человек растянул таймлайн руками.
   */
  const timelineRootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = timelineRootRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const publish = () => {
      document.documentElement.style.setProperty(
        '--timeline-actual-h',
        `${Math.round(el.getBoundingClientRect().height)}px`
      )
    }
    publish()
    const ro = new ResizeObserver(publish)
    ro.observe(el)
    return () => {
      ro.disconnect()
      document.documentElement.style.removeProperty('--timeline-actual-h')
    }
  }, [])

  const project = useAtomValue(projectAtom)
  // Вкладка «ассеты бота» читала botAssets/botLoading/botError, которых в
  // файле не было объявлено вообще: атомы импортировались, но ни один
  // useAtomValue их не разворачивал. Вкладка падала на первом же рендере.
  const botAssets = useAtomValue(botAssetsAtom)
  const botLoading = useAtomValue(botAssetsLoadingAtom)
  const botError = useAtomValue(botAssetsErrorAtom)
  const loadBotAssets = useSetAtom(loadBotAssetsAtom)

  const tracks = useAtomValue(tracksAtom)
  const currentFrame = useAtomValue(currentFrameAtom)
  const isPlaying = useAtomValue(isPlayingAtom)
  const playbackRate = useAtomValue(playbackRateAtom)
  const timelineZoom = useAtomValue(timelineZoomAtom)
  const snapSettings = useAtomValue(snapSettingsAtom)
  const activeSnapFrame = useAtomValue(activeSnapFrameAtom)
  const isDraggingItem = useAtomValue(isDraggingItemAtom)
  const inPoint = useAtomValue(inPointAtom)
  const outPoint = useAtomValue(outPointAtom)
  const markers = useAtomValue(markersAtom)
  const isMuted = useAtomValue(isMutedAtom)
  const volume = useAtomValue(volumeAtom)
  const playerRef = useAtomValue(playerRefAtom)

  // Export atoms
  const assets = useAtomValue(assetsAtom)
  const isExporting = useAtomValue(isExportingAtom)
  const exportProgress = useAtomValue(exportProgressAtom)
  const templateProps = useAtomValue(templatePropsAtom)
  const avatarSettingsTab = useAtomValue(avatarSettingsTabAtom)
  const user = useAtomValue(userAtom)
  const canRender = useAtomValue(canRenderAtom)

  // Browser atoms
  const filteredAssets = useAtomValue(filteredAssetsAtom)
  const [category, setCategory] = useAtom(browserCategoryAtom)

  // История генераций бота подтягивается при переходе на вкладку, а не при
  // монтировании: запрос защищённый и незачем дёргать его тем, кто вкладку
  // не открывал.
  useEffect(() => {
    if (category === 'bot') void loadBotAssets()
  }, [category, loadBotAssets])
  const [browserSearch, setBrowserSearch] = useAtom(browserSearchAtom)
  const [isUploading, setIsUploading] = useAtom(browserUploadingAtom)
  const [uploadProgress, setUploadProgress] = useAtom(browserUploadProgressAtom)
  const counts = useAtomValue(categoryCounts)
  const addAsset = useSetAtom(addAssetAtom)
  const [showBrowserSearch, setShowBrowserSearch] = useState(false)
  const [isDragOverBrowser, setIsDragOverBrowser] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const browserScrollRef = useRef<HTMLDivElement>(null)

  // Undo/Redo atoms
  const canUndoValue = useAtomValue(canUndoAtom)
  const canRedoValue = useAtomValue(canRedoAtom)
  const undo = useSetAtom(undoAtom)
  const redo = useSetAtom(redoAtom)

  const setCurrentFrame = useSetAtom(currentFrameAtom)
  const playDirect = useSetAtom(playAtom)
  const pauseDirect = useSetAtom(pauseAtom)
  const setPlaybackRate = useSetAtom(playbackRateAtom)
  const setTimelineZoom = useSetAtom(timelineZoomAtom)
  const setSnapEnabled = useSetAtom(setSnapEnabledAtom)
  const updateTrack = useSetAtom(updateTrackAtom)
  const setIsMuted = useSetAtom(isMutedAtom)
  const setVolume = useSetAtom(volumeAtom)
  const canvasZoom = useAtomValue(canvasZoomAtom)
  const setCanvasZoom = useSetAtom(canvasZoomAtom)
  const setProject = useSetAtom(projectAtom)
  const selectItems = useSetAtom(selectItemsAtom)
  const reorderTracks = useSetAtom(reorderTracksAtom)

  // Export actions
  const setExportingAction = useSetAtom(setExportingAtom)
  const setShowPaywall = useSetAtom(showPaywallAtom)
  const setShowLoginModal = useSetAtom(showLoginModalAtom)
  const logRender = useSetAtom(logRenderAtom)

  // Reset atoms
  const resetTracks = useSetAtom(resetTracksAtom)
  const updateTemplateProp = useSetAtom(updateTemplatePropAtom)
  const setMusicVolume = useSetAtom(musicVolumeAtom)
  const setVignetteStrength = useSetAtom(vignetteStrengthAtom)
  const setColorCorrection = useSetAtom(colorCorrectionAtom)
  const setFaceOffsetX = useSetAtom(faceOffsetXAtom)
  const setFaceOffsetY = useSetAtom(faceOffsetYAtom)
  const setShowCaptions = useSetAtom(showCaptionsAtom)
  const setSplitSize = useSetAtom(splitCircleSizeAtom)
  const setSplitPosX = useSetAtom(splitPositionXAtom)
  const setSplitPosY = useSetAtom(splitPositionYAtom)
  const setSplitScale = useSetAtom(splitFaceScaleAtom)
  const setSplitIsCircle = useSetAtom(splitIsCircleAtom)
  const setSplitRadius = useSetAtom(splitBorderRadiusAtom)
  const setFullSize = useSetAtom(fullscreenCircleSizeAtom)
  const setFullPosX = useSetAtom(fullscreenPositionXAtom)
  const setFullPosY = useSetAtom(fullscreenPositionYAtom)
  const setFullScale = useSetAtom(fullscreenFaceScaleAtom)
  const setFullIsCircle = useSetAtom(fullscreenIsCircleAtom)
  const setFullRadius = useSetAtom(fullscreenBorderRadiusAtom)

  // Templates
  const addTemplate = useSetAtom(addTemplateAtom)
  const removeTemplate = useSetAtom(removeTemplateAtom)
  const selectedTemplateId = useAtomValue(selectedTemplateIdAtom)
  const templates = useAtomValue(templatesAtom)
  const navigate = useNavigate()

  // Local state for blob warnings
  const [showBlobWarning, setShowBlobWarning] = useState(false)
  const [showCriticalBlobError, setShowCriticalBlobError] = useState(false)
  const [blobAssets, setBlobAssets] = useState<{
    critical: string[]
    optional: string[]
  }>({ critical: [], optional: [] })

  // Local state for dialogs
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [showSaveTemplateDialog, setShowSaveTemplateDialog] = useState(false)
  const [templateName, setTemplateName] = useState('')

  // Publish modal state - using global atoms for cross-component control
  const [showPublishModal, setShowPublishModal] = useAtom(publishModalOpenAtom)
  const [pendingVideoUrl, setPendingVideoUrl] = useAtom(
    publishModalVideoUrlAtom
  )

  // Lasso selection state
  const [isLassoActive, setIsLassoActive] = useState(false)
  const [lassoStart, setLassoStart] = useState<{ x: number; y: number } | null>(
    null
  )
  const [lassoEnd, setLassoEnd] = useState<{ x: number; y: number } | null>(
    null
  )

  // Track reorder state
  const [draggedTrackIndex, setDraggedTrackIndex] = useState<number | null>(
    null
  )
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null)

  // Minimap state - track visible area
  const [scrollLeft, setScrollLeft] = useState(0)
  const [viewportWidth, setViewportWidth] = useState(0)

  // Helper: Clear render session from localStorage
  const clearRenderSession = useCallback(() => {
    localStorage.removeItem(STORAGE_KEYS.renderSession)
  }, [])

  // Helper: monitor render progress through authenticated polling.
  /**
   * Запасной канал прогресса: обычный опрос статуса с подписью в заголовке.
   *
   * Нужен, когда поток SSE оборвался — на мобильной сети это обычное дело, а
   * сворачивание приложения Telegram рвёт соединение почти всегда. Без опроса
   * человек терял готовый файл: рендер завершался, но узнать об этом было
   * неоткуда.
   */
  const pollRenderProgress = useCallback(
    (renderId: string, projectName: string) => {
      let stopped = false
      const tick = async () => {
        if (stopped) return
        try {
          const data = await apiFetch<any>(
            `${RENDER_SERVER_URL}/render/${renderId}`
          )
          setExportingAction({ exporting: true, progress: data?.progress || 0 })

          if (data?.status === 'completed' && data?.outputUrl) {
            stopped = true
            clearRenderSession()
            logRender()
            const downloadUrl = data.outputUrl.startsWith('http')
              ? data.outputUrl
              : `${RENDER_SERVER_URL}${data.outputUrl}`
            const currentUser = editorStore.get(userAtom)
            if (currentUser) {
              setPendingVideoUrl(downloadUrl)
              setShowPublishModal(true)
            }
            await downloadFile(downloadUrl, `${projectName}.mp4`)
            setExportingAction({ exporting: false, progress: 0 })
            return
          }
          if (data?.status === 'failed') {
            stopped = true
            clearRenderSession()
            toast.error(
              `${t('editor.exportFailed')}: ${data.error || t('editor.unknownError')}`
            )
            setExportingAction({ exporting: false, progress: 0 })
            return
          }
        } catch (e) {
          // Причина называется вслух: тихий сброс — это и есть та самая
          // «кнопка сама отжимается».
          stopped = true
          clearRenderSession()
          toast.error(`${t('editor.exportFailed')}: ${explainApiError(e)}`)
          setExportingAction({ exporting: false, progress: 0 })
          return
        }
        setTimeout(tick, 3000)
      }
      void tick()
    },
    [setExportingAction, clearRenderSession, logRender, t]
  )

  // EventSource cannot attach Authorization headers. Sending Telegram initData
  // in its query string exposed a replayable signature to URL logs. Authenticated
  // polling uses the same progress contract without placing credentials in URLs.
  const subscribeToRenderProgress = useCallback(
    (renderId: string, projectName: string) => {
      pollRenderProgress(renderId, projectName)
    },
    [pollRenderProgress]
  )

  // Check for active render session on mount and reconnect
  useEffect(() => {
    const sessionStr = localStorage.getItem(STORAGE_KEYS.renderSession)
    if (!sessionStr) return

    try {
      const session: RenderSession = JSON.parse(sessionStr)
      const oneHourAgo = Date.now() - 60 * 60 * 1000

      // Skip if session is too old (server cleans up after 1 hour)
      if (session.startedAt < oneHourAgo) {
        console.log('[Export] Render session expired, clearing')
        clearRenderSession()
        return
      }

      console.log(
        '[Export] Found active render session, reconnecting...',
        session
      )

      // Check if render is still active on server
      apiFetch<any>(`${RENDER_SERVER_URL}/render/${session.renderId}`)
        .then(data => {
          if (data.status === 'rendering' || data.status === 'pending') {
            // Reconnect to SSE
            subscribeToRenderProgress(session.renderId, session.projectName)
          } else if (data.status === 'completed' && data.outputUrl) {
            // Render finished while away - trigger download
            console.log('[Export] Render completed while away, downloading...')
            setExportingAction({ exporting: true, progress: 100 })
            const downloadUrl = data.outputUrl.startsWith('http')
              ? data.outputUrl
              : `${RENDER_SERVER_URL}${data.outputUrl}`
            downloadFile(downloadUrl, `${session.projectName}.mp4`).then(() => {
              setExportingAction({ exporting: false, progress: 0 })
              clearRenderSession()
            })
          } else {
            // Render failed or unknown status
            clearRenderSession()
          }
        })
        .catch(err => {
          console.error('[Export] Failed to check render status:', err)
          clearRenderSession()
        })
    } catch (e) {
      console.error('[Export] Invalid render session:', e)
      clearRenderSession()
    }
  }, [subscribeToRenderProgress, clearRenderSession, setExportingAction])

  // Helper functions
  const canUndo = () => canUndoValue
  const canRedo = () => canRedoValue

  const resetToDefaults = () => {
    resetTracks({ fps: DEFAULT_FPS, durationInFrames: 825 })
    setMusicVolume(DEFAULT_MUSIC_VOLUME)
    setVignetteStrength(DEFAULT_VIGNETTE_STRENGTH)
    setColorCorrection(DEFAULT_COLOR_CORRECTION)
    setFaceOffsetX(0)
    setFaceOffsetY(0)
    setShowCaptions(true)
    setSplitSize(100)
    setSplitPosX(0)
    setSplitPosY(0)
    setSplitScale(1.0)
    setSplitIsCircle(false)
    setSplitRadius(50)
    setFullSize(100)
    setFullPosX(0)
    setFullPosY(0)
    setFullScale(1.0)
    setFullIsCircle(false)
    setFullRadius(50)
  }

  // Save as template
  const handleSaveClick = () => {
    setTemplateName(project.name)
    setShowSaveTemplateDialog(true)
  }

  const handleSaveTemplate = () => {
    if (!templateName.trim()) return
    addTemplate({
      name: templateName.trim(),
      description: `Created from ${project.name}`,
      compositionId: 'SplitTalkingHead',
      defaultProps: { ...templateProps },
      assets: [...assets],
      tracks: JSON.parse(JSON.stringify(tracks)),
    })
    setShowSaveTemplateDialog(false)
    setTemplateName('')
    navigate('/templates')
  }

  const handleDeleteTemplate = () => {
    if (!selectedTemplateId) return
    const current = templates.find(t => t.id === selectedTemplateId)
    if (!current?.isUserCreated) return
    if (confirm(t('templates.confirmDelete'))) {
      removeTemplate(selectedTemplateId)
    }
  }

  // Project Import
  const handleProjectImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = event => {
      try {
        const content = event.target?.result as string
        const data = JSON.parse(content)
        if (!data.project || !data.tracks) {
          toast.error(t('editor.invalidFormat'))
          return
        }
        if (data.project) editorStore.set(projectAtom, data.project)
        if (data.templateProps) {
          Object.entries(data.templateProps).forEach(([key, value]) => {
            editorStore.set(updateTemplatePropAtom, {
              key: key as any,
              value: value as any,
            })
          })
        }
        toast.success(t('editor.importSuccess'))
      } catch (err) {
        console.error('[Project] Import failed:', err)
        toast.error(t('editor.importFailed'))
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  // Helper for setExporting
  const setExporting = (exporting: boolean, progress?: number) =>
    setExportingAction({ exporting, progress })

  // Handle mute toggle - uses both store state and player API
  const handleMuteToggle = useCallback(() => {
    const newMuted = !isMuted
    setIsMuted(newMuted)

    // Also control the Remotion Player's mute state
    if (playerRef?.current) {
      if (newMuted) {
        playerRef.current.mute?.()
      } else {
        playerRef.current.unmute?.()
        playerRef.current.setVolume?.(volume)
      }
    }
  }, [isMuted, setIsMuted, playerRef, volume])

  // Handle volume change
  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newVolume = parseFloat(e.target.value)
      setVolume(newVolume)

      // Apply to Remotion Player
      if (playerRef?.current) {
        if (newVolume === 0) {
          playerRef.current.mute?.()
          setIsMuted(true)
        } else {
          playerRef.current.unmute?.()
          playerRef.current.setVolume?.(newVolume)
          if (isMuted) setIsMuted(false)
        }
      }
    },
    [setVolume, playerRef, isMuted, setIsMuted]
  )

  // Audio warmup - required for browser autoplay policy
  const warmupAudio = useCallback(() => {
    try {
      const AudioContext =
        window.AudioContext || (window as any).webkitAudioContext
      if (AudioContext) {
        const audioContext = new AudioContext()
        if (audioContext.state === 'suspended') {
          audioContext.resume()
        }
      }
    } catch (e) {
      console.warn('[Timeline] Audio warmup failed:', e)
    }
  }, [])

  // Handle play with audio warmup - uses playDirect for user gesture context
  // CRITICAL: Must pass event to playDirect for browser autoplay policy!
  // See: https://www.remotion.dev/docs/player/autoplay
  const handlePlay = useCallback(
    (e: React.MouseEvent) => {
      warmupAudio()

      // Ensure player is unmuted on first play with correct volume
      if (playerRef?.current && !isMuted) {
        playerRef.current.unmute?.()
        playerRef.current.setVolume?.(volume)
      }

      if (isPlaying) {
        pauseDirect()
      } else {
        playDirect(e) // Pass event for audio to work!
      }
    },
    [
      isPlaying,
      isMuted,
      volume,
      playDirect,
      pauseDirect,
      warmupAudio,
      playerRef,
    ]
  )

  // ===============================
  // BROWSER HANDLERS
  // ===============================

  // Category chips for browser
  // 'bot' — история генераций из Telegram-бота. Отдельная категория, а не
  // слияние с остальными: те — ассеты ТЕКУЩЕГО проекта на таймлайне, а эта —
  // всё, что человек когда-либо сгенерировал в боте.
  const CATEGORIES: AssetCategory[] = [
    'all',
    'video',
    'audio',
    'image',
    'avatar',
    'bot',
  ]

  // File upload handler
  const uploadFile = useCallback(async (file: File): Promise<Asset | null> => {
    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch(`${RENDER_SERVER_URL}/upload`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`)
      }

      const data = await response.json()
      const type = file.type.startsWith('video/')
        ? 'video'
        : file.type.startsWith('audio/')
          ? 'audio'
          : 'image'

      return {
        id: crypto.randomUUID(),
        type,
        name: file.name.replace(/\.[^.]+$/, ''),
        url: data.url || data.path,
        thumbnail: data.thumbnail,
        duration: type === 'video' ? 150 : undefined,
        fileSize: file.size,
      }
    } catch (error) {
      console.error('Upload error:', error)
      const type = file.type.startsWith('video/')
        ? 'video'
        : file.type.startsWith('audio/')
          ? 'audio'
          : 'image'

      return {
        id: crypto.randomUUID(),
        type,
        name: file.name.replace(/\.[^.]+$/, ''),
        url: URL.createObjectURL(file),
        fileSize: file.size,
      }
    }
  }, [])

  const handleBrowserFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files)
      if (fileArray.length === 0) return

      setIsUploading(true)
      setUploadProgress(0)

      let uploaded = 0
      for (const file of fileArray) {
        const asset = await uploadFile(file)
        if (asset) {
          addAsset(asset)
        }
        uploaded++
        setUploadProgress((uploaded / fileArray.length) * 100)
      }

      setIsUploading(false)
      setUploadProgress(0)
      toast.success(`${uploaded} ${uploaded === 1 ? 'file' : 'files'} uploaded`)
    },
    [uploadFile, addAsset, setIsUploading, setUploadProgress, toast, t]
  )

  const handleBrowserFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        handleBrowserFiles(e.target.files)
      }
      e.target.value = ''
    },
    [handleBrowserFiles]
  )

  const handleBrowserDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOverBrowser(true)
  }, [])

  const handleBrowserDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOverBrowser(false)
  }, [])

  const handleBrowserDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOverBrowser(false)

      const files = e.dataTransfer.files
      if (files.length > 0) {
        handleBrowserFiles(files)
      }
    },
    [handleBrowserFiles]
  )

  const handleBrowserWheel = useCallback((e: React.WheelEvent) => {
    if (browserScrollRef.current) {
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault()
        browserScrollRef.current.scrollLeft += e.deltaY || e.deltaX
      } else if (Math.abs(e.deltaY) > 0) {
        e.preventDefault()
        browserScrollRef.current.scrollLeft += e.deltaY
      }
    }
  }, [])

  const handleAssetDragStart = useCallback(
    (e: React.DragEvent, asset: Asset) => {
      e.dataTransfer.setData('application/json', JSON.stringify(asset))
      e.dataTransfer.effectAllowed = 'copy'
    },
    []
  )

  const fps = project.fps
  const duration = project.durationInFrames

  // Pixels per frame (base = 2px, scaled by zoom)
  const pxPerFrame = 2 * timelineZoom

  // Auto-scroll to follow playhead during playback
  useEffect(() => {
    if (!isPlaying || !timelineRef.current) return

    const wrapper = timelineRef.current
    const playheadX = currentFrame * pxPerFrame
    const wrapperWidth = wrapper.clientWidth
    const scrollLeft = wrapper.scrollLeft
    const scrollRight = scrollLeft + wrapperWidth

    // Add some padding so playhead stays visible
    const padding = wrapperWidth * 0.2 // 20% padding

    // If playhead is near the right edge, scroll to keep it visible
    if (playheadX > scrollRight - padding) {
      wrapper.scrollTo({
        left: playheadX - wrapperWidth * 0.3, // Keep playhead at ~30% from left
        behavior: 'smooth',
      })
    }
    // If playhead is near the left edge (e.g., after seeking), scroll back
    else if (playheadX < scrollLeft + padding) {
      wrapper.scrollTo({
        left: Math.max(0, playheadX - padding),
        behavior: 'smooth',
      })
    }
  }, [currentFrame, pxPerFrame, isPlaying])

  // Scroll to frame on request (from add-to-timeline button)
  const scrollToFrame = useAtomValue(scrollToFrameAtom)
  const clearScrollRequest = useSetAtom(clearScrollRequestAtom)

  useEffect(() => {
    if (scrollToFrame !== null && timelineRef.current) {
      const pxPosition = scrollToFrame * pxPerFrame
      const wrapperWidth = timelineRef.current.clientWidth

      timelineRef.current.scrollTo({
        left: Math.max(0, pxPosition - wrapperWidth * 0.3),
        behavior: 'smooth',
      })

      clearScrollRequest()
    }
  }, [scrollToFrame, pxPerFrame, clearScrollRequest])

  // Pinch-to-zoom on timeline (touch devices)
  useEffect(() => {
    const element = timelineRef.current
    if (!element) return

    let lastDistance: number | null = null

    const getDistance = (touches: TouchList): number => {
      if (touches.length < 2) return 0
      const dx = touches[0].clientX - touches[1].clientX
      const dy = touches[0].clientY - touches[1].clientY
      return Math.sqrt(dx * dx + dy * dy)
    }

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault()
        lastDistance = getDistance(e.touches)
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && lastDistance !== null) {
        e.preventDefault()
        const currentDistance = getDistance(e.touches)
        const delta = (currentDistance - lastDistance) / 100

        // Apply zoom change
        const newZoom = Math.max(0.25, Math.min(5, timelineZoom + delta))
        setTimelineZoom(newZoom)

        lastDistance = currentDistance
      }
    }

    const handleTouchEnd = () => {
      lastDistance = null
    }

    element.addEventListener('touchstart', handleTouchStart, { passive: false })
    element.addEventListener('touchmove', handleTouchMove, { passive: false })
    element.addEventListener('touchend', handleTouchEnd)

    return () => {
      element.removeEventListener('touchstart', handleTouchStart)
      element.removeEventListener('touchmove', handleTouchMove)
      element.removeEventListener('touchend', handleTouchEnd)
    }
  }, [timelineZoom, setTimelineZoom])

  // Track scroll position for minimap
  useEffect(() => {
    const element = timelineRef.current
    if (!element) return

    const handleScroll = () => {
      setScrollLeft(element.scrollLeft)
    }

    const handleResize = () => {
      setViewportWidth(element.clientWidth)
    }

    // Initial values
    handleResize()
    handleScroll()

    element.addEventListener('scroll', handleScroll)
    window.addEventListener('resize', handleResize)

    return () => {
      element.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  // Minimap navigation handler
  const handleMinimapNavigate = useCallback(
    (frame: number) => {
      if (!timelineRef.current) return
      // Calculate scroll position to center the frame
      const viewWidth = timelineRef.current.clientWidth
      const framePosition = frame * pxPerFrame
      const newScrollLeft = Math.max(0, framePosition - viewWidth / 2)
      timelineRef.current.scrollTo({ left: newScrollLeft, behavior: 'smooth' })
      setCurrentFrame(frame)
    },
    [pxPerFrame, setCurrentFrame]
  )

  // Visible frame range for minimap
  const visibleStartFrame = useMemo(() => {
    return Math.floor(scrollLeft / pxPerFrame)
  }, [scrollLeft, pxPerFrame])

  const visibleEndFrame = useMemo(() => {
    return Math.ceil((scrollLeft + viewportWidth) / pxPerFrame)
  }, [scrollLeft, viewportWidth, pxPerFrame])

  // Format frame as timecode
  const formatTime = useCallback(
    (frame: number) => {
      const totalSeconds = frame / fps
      const minutes = Math.floor(totalSeconds / 60)
      const seconds = Math.floor(totalSeconds % 60)
      const frames = Math.floor(frame % fps)
      return `${minutes.toString().padStart(2, '0')}:${seconds
        .toString()
        .padStart(2, '0')}:${frames.toString().padStart(2, '0')}`
    },
    [fps]
  )

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const frame = Math.round(x / pxPerFrame)
    setCurrentFrame(Math.max(0, Math.min(frame, duration - 1)))
  }

  const handleSkipBack = () => {
    setCurrentFrame(0)
  }

  const handleSkipForward = () => {
    setCurrentFrame(duration - 1)
  }

  const handleZoomIn = () => {
    setTimelineZoom(Math.min(timelineZoom + 0.5, 5))
  }

  const handleZoomOut = () => {
    setTimelineZoom(Math.max(timelineZoom - 0.5, 0.25))
  }

  const handleFitToView = () => {
    if (!timelineRef.current) return
    const viewportWidth = timelineRef.current.clientWidth - 20 // Account for padding
    const optimalZoom = viewportWidth / (duration * 2) // 2px per frame base
    setTimelineZoom(Math.max(0.25, Math.min(optimalZoom, 5)))
  }

  // Scroll-wheel zoom centered on cursor position
  const handleWheelZoom = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      // Only zoom with Ctrl/Meta key held
      if (!e.ctrlKey && !e.metaKey) return

      e.preventDefault()

      const wrapper = timelineRef.current
      if (!wrapper) return

      // Get cursor position relative to timeline content
      const rect = wrapper.getBoundingClientRect()
      const cursorX = e.clientX - rect.left
      const scrollLeft = wrapper.scrollLeft

      // Calculate which frame the cursor is over
      const cursorFrame = (cursorX + scrollLeft) / pxPerFrame

      // Calculate zoom delta (negative deltaY = zoom in)
      const zoomDelta = e.deltaY < 0 ? 0.25 : -0.25
      const newZoom = Math.max(0.25, Math.min(5, timelineZoom + zoomDelta))

      if (newZoom === timelineZoom) return

      // Calculate new pxPerFrame
      const newPxPerFrame = newZoom * 2

      // Calculate new scroll position to keep cursor on same frame
      const newCursorPosition = cursorFrame * newPxPerFrame
      const newScrollLeft = newCursorPosition - cursorX

      // Apply zoom
      setTimelineZoom(newZoom)

      // Adjust scroll position after zoom
      requestAnimationFrame(() => {
        if (wrapper) {
          wrapper.scrollLeft = Math.max(0, newScrollLeft)
        }
      })
    },
    [timelineZoom, pxPerFrame, setTimelineZoom]
  )

  // Lasso selection handlers
  const handleLassoStart = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Alt+click to start lasso
      if (!e.altKey) return
      e.preventDefault()

      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - rect.left + (timelineRef.current?.scrollLeft || 0)
      const y = e.clientY - rect.top

      setIsLassoActive(true)
      setLassoStart({ x, y })
      setLassoEnd({ x, y })
    },
    []
  )

  const handleLassoMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isLassoActive || !lassoStart) return

      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - rect.left + (timelineRef.current?.scrollLeft || 0)
      const y = e.clientY - rect.top

      setLassoEnd({ x, y })
    },
    [isLassoActive, lassoStart]
  )

  const handleLassoEnd = useCallback(() => {
    if (!isLassoActive || !lassoStart || !lassoEnd) {
      setIsLassoActive(false)
      setLassoStart(null)
      setLassoEnd(null)
      return
    }

    // Calculate lasso bounds
    const left = Math.min(lassoStart.x, lassoEnd.x)
    const right = Math.max(lassoStart.x, lassoEnd.x)
    const top = Math.min(lassoStart.y, lassoEnd.y)
    const bottom = Math.max(lassoStart.y, lassoEnd.y)

    // Find items within bounds
    const selectedIds: string[] = []
    const trackHeight = 36 // Match CSS track-row height
    const rulerHeight = 24 // Time ruler offset

    tracks.forEach((track, trackIndex) => {
      const trackTop = rulerHeight + trackIndex * trackHeight
      const trackBottom = trackTop + trackHeight

      // Check if lasso intersects this track vertically
      if (bottom > trackTop && top < trackBottom) {
        track.items.forEach(item => {
          const itemLeft = item.startFrame * pxPerFrame
          const itemRight =
            (item.startFrame + item.durationInFrames) * pxPerFrame

          // Check if lasso intersects this item horizontally
          if (right > itemLeft && left < itemRight) {
            selectedIds.push(item.id)
          }
        })
      }
    })

    if (selectedIds.length > 0) {
      selectItems({ itemIds: selectedIds, addToSelection: false })
    }

    setIsLassoActive(false)
    setLassoStart(null)
    setLassoEnd(null)
  }, [isLassoActive, lassoStart, lassoEnd, tracks, pxPerFrame, selectItems])

  // Global mouse up for lasso (in case mouse leaves timeline)
  useEffect(() => {
    if (isLassoActive) {
      const handleGlobalMouseUp = () => handleLassoEnd()
      window.addEventListener('mouseup', handleGlobalMouseUp)
      return () => window.removeEventListener('mouseup', handleGlobalMouseUp)
    }
  }, [isLassoActive, handleLassoEnd])

  // Track reorder handlers
  const handleTrackDragStart = useCallback((index: number) => {
    setDraggedTrackIndex(index)
  }, [])

  const handleTrackDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault()
      if (draggedTrackIndex !== null && draggedTrackIndex !== index) {
        setDropTargetIndex(index)
      }
    },
    [draggedTrackIndex]
  )

  const handleTrackDragLeave = useCallback(() => {
    setDropTargetIndex(null)
  }, [])

  const handleTrackDrop = useCallback(
    (targetIndex: number) => {
      if (draggedTrackIndex !== null && draggedTrackIndex !== targetIndex) {
        reorderTracks({ fromIndex: draggedTrackIndex, toIndex: targetIndex })
      }
      setDraggedTrackIndex(null)
      setDropTargetIndex(null)
    },
    [draggedTrackIndex, reorderTracks]
  )

  const handleTrackDragEnd = useCallback(() => {
    setDraggedTrackIndex(null)
    setDropTargetIndex(null)
  }, [])

  // Playback rate presets
  const speedPresets = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2]
  const currentSpeedIndex = speedPresets.indexOf(playbackRate)

  const handleSpeedUp = () => {
    const nextIndex = Math.min(currentSpeedIndex + 1, speedPresets.length - 1)
    setPlaybackRate(speedPresets[nextIndex])
  }

  const handleSpeedDown = () => {
    const prevIndex = Math.max(currentSpeedIndex - 1, 0)
    setPlaybackRate(speedPresets[prevIndex])
  }

  // Canvas zoom handlers
  const effectiveCanvasZoom = canvasZoom || 0.3 // Default zoom
  const handleCanvasZoomIn = () =>
    setCanvasZoom(Math.min(effectiveCanvasZoom + 0.05, 1))
  const handleCanvasZoomOut = () =>
    setCanvasZoom(Math.max(effectiveCanvasZoom - 0.05, 0.1))

  // ===============================
  // EXPORT HANDLERS
  // ===============================

  // Check for blob URLs in assets
  const checkForBlobUrls = (): { critical: string[]; optional: string[] } => {
    const critical: string[] = []
    const optional: string[] = []

    // Check lipSyncVideo - CRITICAL (required for render with audio)
    if (templateProps.lipSyncVideo.startsWith('blob:')) {
      critical.push('Lipsync video')
    }

    // Check backgroundVideos - optional (will be skipped)
    templateProps.backgroundVideos.forEach(url => {
      if (url.startsWith('blob:')) {
        const asset = assets.find(a => a.url === url)
        optional.push(asset?.name || 'Unknown video')
      }
    })

    // Check coverImage - optional
    if (templateProps.coverImage.startsWith('blob:')) {
      optional.push('Cover image')
    }

    // Check backgroundMusic - optional
    if (templateProps.backgroundMusic?.startsWith('blob:')) {
      optional.push('Background music')
    }

    return { critical, optional }
  }

  const handleExportClick = () => {
    // Check if user is logged in
    if (!user) {
      setShowLoginModal(true)
      return
    }

    // Check if user has quota
    if (!canRender) {
      setShowPaywall(true)
      return
    }

    const blobs = checkForBlobUrls()
    setBlobAssets(blobs)

    // Critical blob URLs (lipSyncVideo) - block export completely
    if (blobs.critical.length > 0) {
      setShowCriticalBlobError(true)
      return
    }

    // Optional blob URLs - show warning but allow export
    if (blobs.optional.length > 0) {
      setShowBlobWarning(true)
    } else {
      handleExport()
    }
  }

  const handleExport = async () => {
    setShowBlobWarning(false)
    console.log('[Export] Starting export...')

    if (isExporting) {
      console.log('[Export] Already exporting, skipping')
      return
    }

    console.log('[Export] Setting exporting state to true')
    setExporting(true, 0)

    try {
      // Check render server health
      console.log(
        '[Export] Checking render server health at:',
        `${RENDER_SERVER_URL}/health`
      )
      const healthRes = await fetch(`${RENDER_SERVER_URL}/health`)
      console.log('[Export] Health response status:', healthRes.status)

      if (!healthRes.ok) {
        throw new Error('Render server not available')
      }

      const healthData = await healthRes.json()
      console.log('[Export] Health data:', healthData)

      // Build composition props using THE SAME function as preview (single source of truth)
      const videoTrackItems = tracks.find(t => t.type === 'video')?.items || []
      const imageTrackItems = tracks.find(t => t.type === 'image')?.items || []

      const compositionProps = convertToSplitTalkingHeadProps(
        templateProps,
        project.durationInFrames,
        project.fps,
        videoTrackItems,
        imageTrackItems,
        assets,
        avatarSettingsTab
      )

      logExport('Composition props from shared function', {
        segmentsCount: compositionProps.segments.length,
        segments: compositionProps.segments,
      })

      // Audio track override (same as preview, but no mute for render)
      const { audioTrackUrl, audioTrackVolume } = getAudioTrackOverride(
        tracks,
        assets
      )

      // Convert URLs to absolute for render server + filter blob URLs
      const validSegments = compositionProps.segments
        .filter(
          (seg: any) =>
            !(seg.type === 'split' && seg.bRollUrl?.startsWith('blob:'))
        )
        .map((seg: any) => ({
          ...seg,
          bRollUrl:
            seg.bRollUrl && !seg.bRollUrl.startsWith('blob:')
              ? toAbsoluteUrl(seg.bRollUrl)
              : seg.bRollUrl,
        }))

      const filteredBackgroundVideos = templateProps.backgroundVideos
        .filter(url => !url.startsWith('blob:'))
        .map(toAbsoluteUrl)

      const renderProps = {
        ...compositionProps,
        lipSyncVideo: toAbsoluteUrl(compositionProps.lipSyncVideo),
        coverImage: toAbsoluteUrl(templateProps.coverImage),
        backgroundMusic: toAbsoluteUrl(
          audioTrackUrl || compositionProps.backgroundMusic || ''
        ),
        musicVolume: audioTrackVolume,
        backgroundVideos: filteredBackgroundVideos,
        segments: validSegments,
        videoVolume: 1,
        imageOverlays: (compositionProps.imageOverlays || [])
          .filter((o: any) => o.url && !o.url.startsWith('blob:'))
          .map((o: any) => ({
            ...o,
            url: toAbsoluteUrl(o.url),
          })),
      }

      logExport('Render props prepared', {
        segmentsCount: validSegments.length,
        hasMusic: !!renderProps.backgroundMusic,
        lipSyncVideo: renderProps.lipSyncVideo,
      })
      console.log('[Export] Render props:', renderProps)

      // Notify about render start
      if (user) {
        fetch(`${RENDER_SERVER_URL}/api/notify/render-start`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            telegram_id: user.id,
            username: user.username,
            first_name: user.first_name,
            project_name: project.name,
          }),
        }).catch(() => {}) // Don't block on notification failure
      }

      // Start render with converted template props
      console.log(
        '[Export] Sending render request to:',
        `${RENDER_SERVER_URL}/render`
      )
      const renderRes = await fetch(`${RENDER_SERVER_URL}/render`, {
        method: 'POST',
        // Без подписи сервер в режиме enforce отвечает 401, и рендер не
        // стартует вообще — именно это выглядело как «кнопка не работает».
        headers: authHeaders(),
        body: JSON.stringify({
          type: 'video',
          compositionId: DEFAULT_COMPOSITION_ID,
          codec: 'h264',
          inputProps: renderProps,
          // User info for Telegram notification on completion
          userInfo: user
            ? {
                telegram_id: user.id,
                username: user.username,
                first_name: user.first_name,
                project_name: project.name,
              }
            : undefined,
          // Assets and tracks for feed remix
          assets: assets,
          tracks: tracks,
        }),
      })

      console.log('[Export] Render response status:', renderRes.status)
      if (!renderRes.ok) {
        // Раньше статус не проверялся: тело 401 {error, detail, hint}
        // проваливалось в ветку неуспеха, и человек видел общий текст вместо
        // настоящей причины.
        let detail = ''
        try {
          const body = await renderRes.json()
          detail = body?.detail || body?.error || ''
        } catch {
          detail = ''
        }
        const err: any = new Error(detail || `HTTP ${renderRes.status}`)
        err.status = renderRes.status
        err.detail = detail
        throw err
      }
      const result = await renderRes.json()
      console.log('[Export] Render result:', result)

      if (result.success && result.renderId) {
        console.log(
          '[Export] Render started, saving session and subscribing to SSE...'
        )

        // Save render session to localStorage for reconnection
        const session: RenderSession = {
          renderId: result.renderId,
          projectName: project.name,
          startedAt: Date.now(),
        }
        localStorage.setItem(
          STORAGE_KEYS.renderSession,
          JSON.stringify(session)
        )

        // Subscribe to SSE for real-time progress
        subscribeToRenderProgress(result.renderId, project.name)
      } else if (result.success && result.outputUrl) {
        // Legacy: immediate response with outputUrl (fallback)
        console.log('[Export] Legacy render response with immediate outputUrl')
        const downloadUrl = result.outputUrl.startsWith('http')
          ? result.outputUrl
          : `${RENDER_SERVER_URL}${result.outputUrl}`

        console.log('[Export] Downloading from:', downloadUrl)
        await downloadFile(downloadUrl, `${project.name}.mp4`)
        setExporting(false, 0)
      } else {
        console.error('[Export] Render failed:', result)
        throw new Error(result.error || 'Export failed')
      }
    } catch (error) {
      console.error('[Export] Error:', error)
      clearRenderSession()
      toast.error(
        `${t('editor.exportFailed')}: ${error instanceof Error ? error.message : t('editor.unknownError')}`
      )
      setExporting(false, 0)
    }
  }

  return (
    <div
      className="timeline"
      ref={timelineRootRef}
      role="region"
      aria-label={t('timeline.title')}
    >
      {/* Transport Controls - 3-column layout: LEFT | CENTER | RIGHT */}
      <div
        className="timeline-transport"
        role="toolbar"
        aria-label={t('timeline.controls')}
      >
        {/* LEFT: Project name + Volume + Speed */}
        <div className="transport-left">
          {/* Project Name */}
          <input
            type="text"
            className="project-name-input"
            value={project.name}
            onChange={e => setProject({ ...project, name: e.target.value })}
            placeholder="Project name"
            aria-label={t('editor.projectName')}
          />

          <div className="transport-divider" />

          {/* Volume control */}
          <div
            className="volume-control"
            role="group"
            aria-label={t('timeline.volume')}
          >
            <button
              className={`transport-btn ${isMuted ? '' : 'active'}`}
              onClick={handleMuteToggle}
              title={isMuted ? t('timeline.unmute') : t('timeline.mute')}
              aria-label={isMuted ? t('timeline.unmute') : t('timeline.mute')}
              aria-pressed={!isMuted}
            >
              {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            <input
              type="range"
              className="volume-slider"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              aria-label={t('timeline.volume')}
              aria-valuetext={`${Math.round(volume * 100)}%`}
            />
          </div>

          {/* Speed control */}
          <div
            className="transport-speed"
            role="group"
            aria-label={t('timeline.speed')}
          >
            <button
              className="speed-btn"
              onClick={handleSpeedDown}
              disabled={currentSpeedIndex <= 0}
              title={t('timeline.slower')}
              aria-label={t('timeline.slower')}
            >
              <ChevronDown size={12} />
            </button>
            <span
              className={`speed-value ${playbackRate !== 1 ? 'modified' : ''}`}
              aria-live="polite"
            >
              {playbackRate}x
            </span>
            <button
              className="speed-btn"
              onClick={handleSpeedUp}
              disabled={currentSpeedIndex >= speedPresets.length - 1}
              title={t('timeline.faster')}
              aria-label={t('timeline.faster')}
            >
              <ChevronUp size={12} />
            </button>
          </div>
        </div>

        {/* CENTER: Zoom + Snap + Playback controls */}
        <div className="transport-center">
          {/* Zoom controls */}
          <div
            className="transport-zoom"
            role="group"
            aria-label={t('timeline.zoom')}
          >
            <button
              className="transport-btn"
              onClick={handleZoomOut}
              title={`${t('timeline.zoomOut')} (-)`}
              aria-label={t('timeline.zoomOut')}
            >
              <ZoomOut size={14} />
            </button>
            <span className="zoom-label" aria-live="polite">
              {Math.round(timelineZoom * 100)}%
            </span>
            <button
              className="transport-btn"
              onClick={handleZoomIn}
              title={`${t('timeline.zoomIn')} (+)`}
              aria-label={t('timeline.zoomIn')}
            >
              <ZoomIn size={14} />
            </button>
          </div>

          <button
            className={`transport-btn snap-btn ${snapSettings.enabled ? 'active' : ''}`}
            onClick={() => setSnapEnabled(!snapSettings.enabled)}
            title={`${t('timeline.snapToGrid')} (${snapSettings.enabled ? t('timeline.on') : t('timeline.off')})`}
            aria-label={t('timeline.snapToGrid')}
            aria-pressed={snapSettings.enabled}
          >
            <Magnet size={14} />
          </button>

          <CloudProjectControls />

          <div className="transport-divider" />

          <button
            className="transport-btn"
            onClick={handleSkipBack}
            title={t('timeline.skipToStart')}
            aria-label={t('timeline.skipToStart')}
          >
            <SkipBack size={16} />
          </button>
          <button
            className="transport-btn play-btn"
            onClickCapture={handlePlay}
            title={
              isPlaying
                ? `${t('timeline.pause')} (Space)`
                : `${t('timeline.play')} (Space)`
            }
            aria-label={isPlaying ? t('timeline.pause') : t('timeline.play')}
          >
            {isPlaying ? <Pause size={24} /> : <Play size={24} />}
          </button>
          <button
            className="transport-btn"
            onClick={handleSkipForward}
            title={t('timeline.skipToEnd')}
            aria-label={t('timeline.skipToEnd')}
          >
            <SkipForward size={16} />
          </button>
        </div>

        {/* RIGHT: Editing tools + Time, Volume, Speed, File ops, Export */}
        <div className="transport-right">
          {/* Undo/Redo buttons */}
          <div
            className="transport-undo-redo"
            role="group"
            aria-label={t('editor.history')}
          >
            <button
              className="transport-btn"
              onClick={undo}
              disabled={!canUndo()}
              title={`${t('editor.undo')} (Cmd+Z)`}
              aria-label={t('editor.undo')}
            >
              <Undo2 size={16} />
            </button>
            <button
              className="transport-btn"
              onClick={redo}
              disabled={!canRedo()}
              title={`${t('editor.redo')} (Cmd+Shift+Z)`}
              aria-label={t('editor.redo')}
            >
              <Redo2 size={16} />
            </button>
          </div>

          <div className="transport-divider" />

          <div
            className="transport-time"
            role="timer"
            aria-label={t('timeline.currentTime')}
            aria-live="off"
          >
            <span className="time-current">{formatTime(currentFrame)}</span>
            <span className="time-separator">/</span>
            <span className="time-duration">{formatTime(duration)}</span>
          </div>

          <div className="transport-divider" />

          {/* Save/Load/Reset buttons */}
          <div
            className="transport-file-ops"
            role="group"
            aria-label={t('editor.fileOps')}
          >
            <button
              className="transport-btn"
              onClick={handleSaveClick}
              title={t('editor.saveTemplate')}
              aria-label={t('editor.saveTemplate')}
            >
              <Save size={16} />
            </button>
            <input
              ref={projectImportRef}
              type="file"
              accept=".json,.vibee.json"
              onChange={handleProjectImport}
              style={{ display: 'none' }}
              aria-hidden="true"
            />
            <button
              className="transport-btn"
              onClick={() => projectImportRef.current?.click()}
              title={t('editor.load')}
              aria-label={t('editor.load')}
            >
              <Upload size={16} />
            </button>
            <button
              className="transport-btn"
              onClick={() => setShowResetConfirm(true)}
              title={t('editor.reset')}
              aria-label={t('editor.reset')}
            >
              <RotateCcw size={16} />
            </button>
            <button
              className="transport-btn"
              onClick={handleDeleteTemplate}
              disabled={
                !selectedTemplateId ||
                !templates.find(t => t.id === selectedTemplateId)?.isUserCreated
              }
              title={t('templates.delete')}
              aria-label={t('templates.delete')}
            >
              <Trash2 size={16} />
            </button>
          </div>

          {/* Export Button */}
          <button
            className={`export-btn-large ${isExporting ? 'exporting' : ''}`}
            onClick={handleExportClick}
            disabled={isExporting}
            title={
              isExporting
                ? `${t('editor.exporting')} ${exportProgress}%`
                : t('editor.export')
            }
          >
            {isExporting ? (
              <>
                <Loader2 size={18} className="spin" />
                <span>
                  {exportProgress > 0
                    ? `${exportProgress}%`
                    : t('editor.exporting')}
                </span>
              </>
            ) : (
              <>
                <Download size={18} />
                <span>{t('editor.export')}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Обозреватель файлов под кнопкой воспроизведения. Отдельный
          компонент AssetBrowser был мёртвым дублем этого блока и удалён. */}
      {!hideBrowser && (
        <div
          className={`timeline-browser ${isDragOverBrowser ? 'drag-over' : ''}`}
          onDragOver={handleBrowserDragOver}
          onDragLeave={handleBrowserDragLeave}
          onDrop={handleBrowserDrop}
        >
          <div className="timeline-browser-header">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="video/*,audio/*,image/*"
              onChange={handleBrowserFileChange}
              style={{ display: 'none' }}
            />
            <button
              className="browser-upload-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              title={t('assets.upload')}
            >
              {isUploading ? (
                <Loader2 size={16} className="spin" />
              ) : (
                <Plus size={16} />
              )}
            </button>
            <button
              className={`browser-search-btn ${showBrowserSearch ? 'active' : ''}`}
              onClick={() => setShowBrowserSearch(!showBrowserSearch)}
              title={t('assets.search')}
            >
              <Search size={16} />
            </button>
            {showBrowserSearch && (
              <input
                type="text"
                className="browser-search-input"
                placeholder={t('assets.searchPlaceholder')}
                value={browserSearch}
                onChange={e => setBrowserSearch(e.target.value)}
                autoFocus
              />
            )}
            <div className="browser-categories">
              {CATEGORIES.map(cat => {
                const config = CATEGORY_CONFIG[cat]
                const count = counts[cat]
                const isActive = category === cat
                return (
                  <button
                    key={cat}
                    className={`browser-category-chip ${isActive ? 'active' : ''}`}
                    onClick={() => setCategory(cat)}
                    style={
                      { '--chip-color': config.color } as React.CSSProperties
                    }
                  >
                    <span className="chip-icon">{config.icon}</span>
                    <span className="chip-label">{config.label}</span>
                    <span className="chip-count">{count}</span>
                  </button>
                )
              })}
            </div>
            {isUploading && (
              <div className="browser-upload-progress">
                <div
                  className="upload-progress-bar"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            )}
          </div>
          <div
            ref={browserScrollRef}
            className="timeline-browser-assets"
            onWheel={handleBrowserWheel}
          >
            {category === 'bot' ? (
              botLoading ? (
                <div className="browser-empty">
                  <span>{t('common.loading')}</span>
                </div>
              ) : botError ? (
                <div className="browser-empty">
                  <span>{botError}</span>
                </div>
              ) : botAssets.length === 0 ? (
                <div className="browser-empty">
                  <span>{t('assets.empty')}</span>
                </div>
              ) : (
                botAssets.map(a => (
                  <div
                    key={`bot-${a.id}`}
                    className="browser-asset-wrapper"
                    draggable
                    onDragStart={e => {
                      e.dataTransfer.setData(
                        'application/json',
                        JSON.stringify({
                          type: 'asset',
                          url: a.url,
                          name: a.type,
                        })
                      )
                      e.dataTransfer.effectAllowed = 'copy'
                    }}
                    title={a.prompt || a.type}
                  >
                    <AssetCard
                      asset={
                        {
                          id: `bot-${a.id}`,
                          // The type column stores a model name (veo3_fast,
                          // fal_hummingbird), not a media kind, so infer it from the URL.
                          type: /\.(mp3|wav|ogg|m4a)$/i.test(a.url)
                            ? 'audio'
                            : /\.(png|jpe?g|webp|gif)$/i.test(a.url)
                              ? 'image'
                              : 'video',
                          name: a.prompt?.slice(0, 40) || a.type,
                          url: a.url,
                        } as never
                      }
                      size="compact"
                    />
                  </div>
                ))
              )
            ) : filteredAssets.length === 0 ? (
              <div className="browser-empty">
                <span>{t('assets.empty')}</span>
              </div>
            ) : (
              filteredAssets.map(asset => (
                <div
                  key={asset.id}
                  className="browser-asset-wrapper"
                  draggable
                  onDragStart={e => handleAssetDragStart(e, asset)}
                >
                  <AssetCard asset={asset} size="compact" />
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Timeline Content */}
      <div className="timeline-content">
        {/* Track Labels */}
        <div className="timeline-labels">
          {tracks.map((track, index) => {
            // Check if any track has solo enabled
            const hasSoloTrack = tracks.some(t => t.solo)
            // Track is effectively muted if it's muted OR another track has solo and this one doesn't
            const isEffectivelyMuted =
              track.muted || (hasSoloTrack && !track.solo)
            const isDragging = draggedTrackIndex === index
            const isDropTarget = dropTargetIndex === index

            return (
              <div
                key={track.id}
                className={`track-label ${track.locked ? 'locked' : ''} ${isEffectivelyMuted ? 'muted' : ''} ${isDragging ? 'dragging' : ''} ${isDropTarget ? 'drop-target' : ''}`}
                draggable
                onDragStart={() => handleTrackDragStart(index)}
                onDragOver={e => handleTrackDragOver(e, index)}
                onDragLeave={handleTrackDragLeave}
                onDrop={() => handleTrackDrop(index)}
                onDragEnd={handleTrackDragEnd}
              >
                <div
                  className="track-drag-handle"
                  title={t('timeline.reorderTrack')}
                >
                  <GripVertical size={12} />
                </div>
                <span className="track-name">{track.name}</span>
                <div className="track-controls">
                  {/* Mute button - only for audio/video/avatar tracks */}
                  {(track.type === 'audio' ||
                    track.type === 'video' ||
                    track.type === 'avatar') && (
                    <button
                      className={`track-mute-btn ${track.muted ? 'active' : ''}`}
                      onClick={() =>
                        updateTrack({
                          trackId: track.id,
                          updates: { muted: !track.muted },
                        })
                      }
                      title={
                        track.muted ? t('timeline.unmute') : t('timeline.mute')
                      }
                    >
                      {track.muted ? (
                        <VolumeX size={12} />
                      ) : (
                        <Volume2 size={12} />
                      )}
                    </button>
                  )}
                  {/* Solo button - only for audio/video/avatar tracks */}
                  {(track.type === 'audio' ||
                    track.type === 'video' ||
                    track.type === 'avatar') && (
                    <button
                      className={`track-solo-btn ${track.solo ? 'active' : ''}`}
                      onClick={() =>
                        updateTrack({
                          trackId: track.id,
                          updates: { solo: !track.solo },
                        })
                      }
                      title={
                        track.solo ? t('timeline.unsolo') : t('timeline.solo')
                      }
                    >
                      S
                    </button>
                  )}
                  {/* Lock button */}
                  <button
                    className={`track-lock-btn ${track.locked ? 'active' : ''}`}
                    onClick={() =>
                      updateTrack({
                        trackId: track.id,
                        updates: { locked: !track.locked },
                      })
                    }
                    title={
                      track.locked
                        ? t('layers.unlockTrack')
                        : t('layers.lockTrack')
                    }
                  >
                    {track.locked ? <Lock size={12} /> : <Unlock size={12} />}
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Timeline Minimap */}
        <TimelineMinimap
          totalFrames={duration}
          visibleStartFrame={visibleStartFrame}
          visibleEndFrame={visibleEndFrame}
          onNavigate={handleMinimapNavigate}
        />

        {/* Timeline Tracks */}
        <div
          className="timeline-tracks-wrapper"
          ref={timelineRef}
          onWheel={handleWheelZoom}
        >
          <div
            className={`timeline-tracks ${isLassoActive ? 'lasso-active' : ''}`}
            style={{ width: duration * pxPerFrame }}
            onClick={handleTimelineClick}
            onMouseDown={handleLassoStart}
            onMouseMove={handleLassoMove}
            onMouseUp={handleLassoEnd}
          >
            {/* Time Ruler */}
            <TimeRuler duration={duration} fps={fps} pxPerFrame={pxPerFrame} />

            {/* Tracks */}
            {tracks.map(track => (
              <Track key={track.id} track={track} pxPerFrame={pxPerFrame} />
            ))}

            {/* In/Out Zone */}
            {(inPoint !== null || outPoint !== null) && (
              <div className="in-out-zone">
                {inPoint !== null && (
                  <div
                    className="in-out-marker in-marker"
                    style={{ left: inPoint * pxPerFrame }}
                    title={`In: ${inPoint}`}
                  />
                )}
                {outPoint !== null && (
                  <div
                    className="in-out-marker out-marker"
                    style={{ left: outPoint * pxPerFrame }}
                    title={`Out: ${outPoint}`}
                  />
                )}
                {inPoint !== null &&
                  outPoint !== null &&
                  inPoint < outPoint && (
                    <div
                      className="in-out-range"
                      style={{
                        left: inPoint * pxPerFrame,
                        width: (outPoint - inPoint) * pxPerFrame,
                      }}
                    />
                  )}
              </div>
            )}

            {/* Timeline Markers */}
            {markers.map(marker => (
              <div
                key={marker.id}
                className={`timeline-marker marker-${marker.color}`}
                style={{ left: marker.frame * pxPerFrame }}
                title={`${marker.name} (${marker.frame})`}
              >
                <div className="marker-flag" />
              </div>
            ))}

            {/* Playhead */}
            <Playhead frame={currentFrame} pxPerFrame={pxPerFrame} />

            {/* Snap Line (shown during drag when snapping) */}
            {snapSettings.enabled &&
              isDraggingItem &&
              activeSnapFrame !== null && (
                <DragSnapLine
                  frame={activeSnapFrame}
                  framesPerPixel={1 / pxPerFrame}
                  scrollLeft={timelineRef.current?.scrollLeft || 0}
                  height={tracks.length * 50 + 30}
                />
              )}

            {/* Lasso Selection Rectangle */}
            {isLassoActive && lassoStart && lassoEnd && (
              <div
                className="lasso-rectangle"
                style={{
                  left: Math.min(lassoStart.x, lassoEnd.x),
                  top: Math.min(lassoStart.y, lassoEnd.y),
                  width: Math.abs(lassoEnd.x - lassoStart.x),
                  height: Math.abs(lassoEnd.y - lassoStart.y),
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Volume Popup - Rendered here to bypass TrackItem memo */}
      <VolumePopup />

      {/* Critical Blob URL Error Dialog - blocks export */}
      {showCriticalBlobError && (
        <div
          className="blob-warning-overlay"
          onClick={() => setShowCriticalBlobError(false)}
        >
          <div
            className="blob-warning-dialog"
            onClick={e => e.stopPropagation()}
          >
            <div className="blob-warning-header">
              <X
                size={24}
                className="warning-icon"
                style={{ color: STATUS_COLORS.error }}
              />
              <h3>{t('blob.criticalTitle')}</h3>
            </div>
            <p className="blob-warning-text">{t('blob.criticalText')}</p>
            <ul className="blob-warning-list">
              {blobAssets.critical.map((name, i) => (
                <li key={i} style={{ color: STATUS_COLORS.error }}>
                  {name}
                </li>
              ))}
            </ul>
            <p className="blob-warning-hint">{t('blob.criticalHint')}</p>
            <div className="blob-warning-actions">
              <button
                className="blob-warning-btn primary"
                onClick={() => setShowCriticalBlobError(false)}
              >
                {t('dialog.ok')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Blob URL Warning Dialog - optional assets */}
      {showBlobWarning && (
        <div
          className="blob-warning-overlay"
          onClick={() => setShowBlobWarning(false)}
        >
          <div
            className="blob-warning-dialog"
            onClick={e => e.stopPropagation()}
          >
            <div className="blob-warning-header">
              <AlertTriangle size={24} className="warning-icon" />
              <h3>{t('blob.title')}</h3>
            </div>
            <p className="blob-warning-text">{t('blob.text')}</p>
            <ul className="blob-warning-list">
              {blobAssets.optional.map((name, i) => (
                <li key={i}>{name}</li>
              ))}
            </ul>
            <p className="blob-warning-hint">{t('blob.hint')}</p>
            <div className="blob-warning-actions">
              <button
                className="blob-warning-btn secondary"
                onClick={() => setShowBlobWarning(false)}
              >
                {t('dialog.cancel')}
              </button>
              <button
                className="blob-warning-btn primary"
                onClick={handleExport}
              >
                {t('dialog.exportAnyway')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Confirmation Dialog */}
      {showResetConfirm && (
        <div
          className="reset-overlay"
          onClick={() => setShowResetConfirm(false)}
        >
          <div className="reset-dialog" onClick={e => e.stopPropagation()}>
            <div className="reset-header">
              <RotateCcw size={24} className="reset-icon" />
              <h3>{t('dialog.reset.title')}</h3>
            </div>
            <p className="reset-text">{t('dialog.reset.text')}</p>
            <p className="reset-warning">{t('dialog.reset.warning')}</p>
            <div className="reset-actions">
              <button
                className="reset-btn-secondary"
                onClick={() => setShowResetConfirm(false)}
              >
                {t('dialog.cancel')}
              </button>
              <button
                className="reset-btn-danger"
                onClick={() => {
                  resetToDefaults()
                  setShowResetConfirm(false)
                }}
              >
                {t('dialog.reset')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save Template Dialog */}
      {showSaveTemplateDialog && (
        <div
          className="save-template-overlay"
          onClick={() => setShowSaveTemplateDialog(false)}
        >
          <div
            className="save-template-dialog"
            onClick={e => e.stopPropagation()}
          >
            <div className="save-template-header">
              <Save size={24} />
              <h3>{t('templates.saveTitle')}</h3>
            </div>
            <p className="save-template-text">
              {t('templates.saveDescription')}
            </p>
            <input
              type="text"
              className="save-template-input"
              value={templateName}
              onChange={e => setTemplateName(e.target.value)}
              placeholder={t('templates.namePlaceholder')}
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter') handleSaveTemplate()
                if (e.key === 'Escape') setShowSaveTemplateDialog(false)
              }}
            />
            <div className="save-template-actions">
              <button
                className="save-template-btn secondary"
                onClick={() => setShowSaveTemplateDialog(false)}
              >
                {t('dialog.cancel')}
              </button>
              <button
                className="save-template-btn primary"
                onClick={handleSaveTemplate}
                disabled={!templateName.trim()}
              >
                {t('templates.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Publish Modal - shown after render completes */}
      <PublishModal
        isOpen={showPublishModal}
        onClose={() => {
          setShowPublishModal(false)
          setPendingVideoUrl(undefined)
        }}
        videoUrl={pendingVideoUrl}
      />
    </div>
  )
}
