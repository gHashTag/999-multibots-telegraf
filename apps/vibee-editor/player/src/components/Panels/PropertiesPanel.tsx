import { useState, useRef, useMemo } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useToast } from '@/hooks/useToast'
import {
  updateItemAtom,
  projectAtom,
  getSelectedItemsAtom,
  templatePropsAtom,
  updateTemplatePropAtom,
  currentFrameAtom,
  setAllVideoItemsLayoutAtom,
  tracksAtom,
  // Effects & Avatar atoms
  vignetteStrengthAtom,
  colorCorrectionAtom,
  avatarSettingsTabAtom,
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
  // Full settings objects for reset
  splitAvatarSettingsAtom,
  fullscreenAvatarSettingsAtom,
  faceOffsetXAtom,
  faceOffsetYAtom,
  lipSyncVideoAtom,
  avatarAnimationAtom,
  // Border effect
  avatarBorderEffectAtom,
  avatarBorderColorAtom,
  avatarBorderColor2Atom,
  avatarBorderWidthAtom,
  avatarBorderIntensityAtom,
  // Captions & Playback
  showCaptionsAtom,
  playbackRateAtom,
  // Template
  selectedTemplateAtom,
} from '@/atoms'
import type { TemplateSettings } from '@/atoms/templates'
import { useLanguage } from '@/hooks/useLanguage'
import {
  DEFAULT_AVATAR_CONFIG,
  DEFAULT_SPLIT_AVATAR,
  DEFAULT_FULLSCREEN_AVATAR,
  BRAND_COLORS,
  DEFAULT_WIDTH,
  DEFAULT_HEIGHT,
  type TrackItem,
  type TextItemProps,
  type CaptionItem,
  type CaptionStyle,
  type VideoLayout,
  type AvatarAnimation,
  type AvatarBorderEffect,
} from '@vibee/atoms'
import {
  Type,
  Sliders,
  Plus,
  Upload,
  Trash2,
  Search,
  ChevronDown,
  Palette,
  ScanFace,
  Circle,
  Layers,
  Maximize,
  RotateCcw,
  Sparkles,
  Play,
  Clock,
  LayoutGrid,
  Volume2,
} from 'lucide-react'
import { analyzeFace } from '@/lib/faceApi'
import { POPULAR_FONTS, UNIQUE_FONTS, type CyrillicFont } from '@/shared/fonts'
import './PropertiesPanel.css'
import './PlayerPanel.css'

// Parse SRT timestamp to milliseconds
function parseSrtTime(time: string): number {
  const [hours, minutes, rest] = time.split(':')
  const [seconds, ms] = rest.replace(',', '.').split('.')
  return (
    parseInt(hours) * 3600000 +
    parseInt(minutes) * 60000 +
    parseInt(seconds) * 1000 +
    parseInt(ms || '0')
  )
}

// Parse SRT file content
function parseSrt(content: string): CaptionItem[] {
  const captions: CaptionItem[] = []
  const blocks = content.trim().split(/\n\s*\n/)
  for (const block of blocks) {
    const lines = block.trim().split('\n')
    if (lines.length < 3) continue
    const timeLine = lines[1]
    const timeMatch = timeLine.match(
      /(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})/
    )
    if (!timeMatch) continue
    const startMs = parseSrtTime(timeMatch[1])
    const endMs = parseSrtTime(timeMatch[2])
    const text = lines
      .slice(2)
      .join(' ')
      .replace(/<[^>]*>/g, '')
      .trim()
    if (text) {
      captions.push({
        text,
        startMs,
        endMs,
        timestampMs: startMs,
        confidence: null,
      })
    }
  }
  return captions
}

// Split layout options (B-roll positioning)
const SPLIT_LAYOUTS: { value: VideoLayout; label: string }[] = [
  { value: 'top-half', label: '1:1' },
  { value: 'top-2-3', label: '2:3' },
  { value: 'top-3-4', label: '3:4' },
  { value: 'bottom-half', label: 'B 1:1' },
  { value: 'bottom-2-3', label: 'B 2:3' },
  { value: 'side-left', label: 'Left' },
  { value: 'side-right', label: 'Right' },
  { value: 'fullscreen', label: 'Full' },
]

// PiP layout options (Avatar position - 6 variants)
const PIP_LAYOUTS: { value: VideoLayout; label: string }[] = [
  { value: 'pip-top-left', label: 'TL' },
  { value: 'pip-top-right', label: 'TR' },
  { value: 'pip-center-left', label: 'L' },
  { value: 'pip-center-right', label: 'R' },
  { value: 'pip-bottom-left', label: 'BL' },
  { value: 'pip-bottom-right', label: 'BR' },
]

// Convert any color format (rgba, hex, hex8) to #rrggbb for HTML color picker
function toHexColor(color: string | undefined, fallback: string): string {
  if (!color) return fallback
  // Already hex format (#rgb, #rrggbb, #rrggbbaa)
  if (color.startsWith('#')) {
    if (color.length === 9) return color.slice(0, 7)
    if (color.length === 7) return color
    if (color.length === 4) {
      return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
    }
    return fallback
  }
  // rgba(r, g, b, a) or rgb(r, g, b) format
  const rgbaMatch = color.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1]).toString(16).padStart(2, '0')
    const g = parseInt(rgbaMatch[2]).toString(16).padStart(2, '0')
    const b = parseInt(rgbaMatch[3]).toString(16).padStart(2, '0')
    return `#${r}${g}${b}`
  }
  return fallback
}

// SVG icon component for layout visualization
function LayoutIcon({ type }: { type: VideoLayout }) {
  const broll = BRAND_COLORS.amber // amber - B-roll zone
  const avatar = '#666' // gray - Avatar zone

  switch (type) {
    case 'top-half':
      return (
        <svg viewBox="0 0 20 20">
          <rect x="1" y="1" width="18" height="9" fill={broll} rx="2" />
          <rect x="1" y="11" width="18" height="8" fill={avatar} rx="2" />
        </svg>
      )
    case 'top-2-3':
      return (
        <svg viewBox="0 0 20 20">
          <rect x="1" y="1" width="18" height="12" fill={broll} rx="2" />
          <rect x="1" y="14" width="18" height="5" fill={avatar} rx="2" />
        </svg>
      )
    case 'top-3-4':
      return (
        <svg viewBox="0 0 20 20">
          <rect x="1" y="1" width="18" height="14" fill={broll} rx="2" />
          <rect x="1" y="16" width="18" height="3" fill={avatar} rx="2" />
        </svg>
      )
    case 'bottom-half':
      return (
        <svg viewBox="0 0 20 20">
          <rect x="1" y="1" width="18" height="8" fill={avatar} rx="2" />
          <rect x="1" y="10" width="18" height="9" fill={broll} rx="2" />
        </svg>
      )
    case 'bottom-2-3':
      return (
        <svg viewBox="0 0 20 20">
          <rect x="1" y="1" width="18" height="5" fill={avatar} rx="2" />
          <rect x="1" y="7" width="18" height="12" fill={broll} rx="2" />
        </svg>
      )
    case 'side-left':
      return (
        <svg viewBox="0 0 20 20">
          <rect x="1" y="1" width="9" height="18" fill={broll} rx="2" />
          <rect x="11" y="1" width="8" height="18" fill={avatar} rx="2" />
        </svg>
      )
    case 'side-right':
      return (
        <svg viewBox="0 0 20 20">
          <rect x="1" y="1" width="8" height="18" fill={avatar} rx="2" />
          <rect x="10" y="1" width="9" height="18" fill={broll} rx="2" />
        </svg>
      )
    case 'fullscreen':
      return (
        <svg viewBox="0 0 20 20">
          <rect x="1" y="1" width="18" height="18" fill={broll} rx="2" />
        </svg>
      )
    case 'pip-top-left':
      return (
        <svg viewBox="0 0 20 20">
          <rect x="1" y="1" width="18" height="18" fill={broll} rx="2" />
          <circle cx="5" cy="5" r="3" fill={avatar} />
        </svg>
      )
    case 'pip-top-right':
      return (
        <svg viewBox="0 0 20 20">
          <rect x="1" y="1" width="18" height="18" fill={broll} rx="2" />
          <circle cx="15" cy="5" r="3" fill={avatar} />
        </svg>
      )
    case 'pip-center-left':
      return (
        <svg viewBox="0 0 20 20">
          <rect x="1" y="1" width="18" height="18" fill={broll} rx="2" />
          <circle cx="5" cy="10" r="3" fill={avatar} />
        </svg>
      )
    case 'pip-center-right':
      return (
        <svg viewBox="0 0 20 20">
          <rect x="1" y="1" width="18" height="18" fill={broll} rx="2" />
          <circle cx="15" cy="10" r="3" fill={avatar} />
        </svg>
      )
    case 'pip-bottom-left':
      return (
        <svg viewBox="0 0 20 20">
          <rect x="1" y="1" width="18" height="18" fill={broll} rx="2" />
          <circle cx="5" cy="15" r="3" fill={avatar} />
        </svg>
      )
    case 'pip-bottom-right':
      return (
        <svg viewBox="0 0 20 20">
          <rect x="1" y="1" width="18" height="18" fill={broll} rx="2" />
          <circle cx="15" cy="15" r="3" fill={avatar} />
        </svg>
      )
    default:
      return null
  }
}

export function PropertiesPanel() {
  const { t } = useLanguage()
  const toast = useToast()
  const selectedItems = useAtomValue(getSelectedItemsAtom)
  const updateItem = useSetAtom(updateItemAtom)
  const setAllVideoItemsLayout = useSetAtom(setAllVideoItemsLayoutAtom)
  const tracks = useAtomValue(tracksAtom)
  const project = useAtomValue(projectAtom)
  const selectedTemplate = useAtomValue(selectedTemplateAtom)

  // Get current layout from first video item (all items share same layout)
  const currentVideoLayout = useMemo(() => {
    const videoTrack = tracks.find(t => t.type === 'video')
    const firstVideoItem = videoTrack?.items[0]
    return (firstVideoItem as any)?.layout || 'top-half'
  }, [tracks])
  const selectedTextItem = selectedItems.find(
    (item): item is TrackItem & TextItemProps => item.type === 'text'
  )

  // Tab state - 5 emoji tabs like left sidebar
  const [activeTab, setActiveTab] = useState<
    'avatar' | 'layout' | 'effects' | 'audio' | 'captions'
  >('avatar')
  const templateProps = useAtomValue(templatePropsAtom)
  const updateTemplateProp = useSetAtom(updateTemplatePropAtom)
  const currentFrame = useAtomValue(currentFrameAtom)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Caption style state
  const [fontSearch, setFontSearch] = useState('')
  const [showFontDropdown, setShowFontDropdown] = useState(false)
  const fontDropdownRef = useRef<HTMLDivElement>(null)

  // Effects & Avatar state
  const [isDetecting, setIsDetecting] = useState(false)
  const [vignetteStrength, setVignetteStrength] = useAtom(vignetteStrengthAtom)
  const [colorCorrection, setColorCorrection] = useAtom(colorCorrectionAtom)
  const [avatarTab, setAvatarTab] = useAtom(avatarSettingsTabAtom)
  const [, setFaceOffsetX] = useAtom(faceOffsetXAtom)
  const [, setFaceOffsetY] = useAtom(faceOffsetYAtom)
  const lipSyncVideo = useAtomValue(lipSyncVideoAtom)
  const [avatarAnimation, setAvatarAnimation] = useAtom(avatarAnimationAtom)

  // Captions & Playback
  const [showCaptions, setShowCaptions] = useAtom(showCaptionsAtom)
  const [playbackRate, setPlaybackRate] = useAtom(playbackRateAtom)

  // Border effect atoms
  const [borderEffect, setBorderEffect] = useAtom(avatarBorderEffectAtom)
  const [borderColor, setBorderColor] = useAtom(avatarBorderColorAtom)
  const [borderColor2, setBorderColor2] = useAtom(avatarBorderColor2Atom)
  const [borderWidth, setBorderWidth] = useAtom(avatarBorderWidthAtom)
  const [borderIntensity, setBorderIntensity] = useAtom(
    avatarBorderIntensityAtom
  )

  // Split mode atoms
  const [splitSize, setSplitSize] = useAtom(splitCircleSizeAtom)
  const [splitPosX, setSplitPosX] = useAtom(splitPositionXAtom)
  const [splitPosY, setSplitPosY] = useAtom(splitPositionYAtom)
  const [splitScale, setSplitScale] = useAtom(splitFaceScaleAtom)
  const [splitIsCircle, setSplitIsCircle] = useAtom(splitIsCircleAtom)
  const [splitRadius, setSplitRadius] = useAtom(splitBorderRadiusAtom)

  // Fullscreen mode atoms
  const [fullSize, setFullSize] = useAtom(fullscreenCircleSizeAtom)
  const [fullPosX, setFullPosX] = useAtom(fullscreenPositionXAtom)
  const [fullPosY, setFullPosY] = useAtom(fullscreenPositionYAtom)
  const [fullScale, setFullScale] = useAtom(fullscreenFaceScaleAtom)
  const [fullIsCircle, setFullIsCircle] = useAtom(fullscreenIsCircleAtom)
  const [fullRadius, setFullRadius] = useAtom(fullscreenBorderRadiusAtom)

  // Full settings objects for direct reset (bypass derived atoms)
  const setSplitSettings = useSetAtom(splitAvatarSettingsAtom)
  const setFullscreenSettings = useSetAtom(fullscreenAvatarSettingsAtom)

  // Current mode values based on active tab
  const isSplitMode = avatarTab === 'split'
  const size = isSplitMode ? splitSize : fullSize
  const setSize = isSplitMode ? setSplitSize : setFullSize
  const posX = isSplitMode ? splitPosX : fullPosX
  const setPosX = isSplitMode ? setSplitPosX : setFullPosX
  const posY = isSplitMode ? splitPosY : fullPosY
  const setPosY = isSplitMode ? setSplitPosY : setFullPosY
  const scale = isSplitMode ? splitScale : fullScale
  const setScale = isSplitMode ? setSplitScale : setFullScale
  const isCircle = isSplitMode ? splitIsCircle : fullIsCircle
  const setIsCircle = isSplitMode ? setSplitIsCircle : setFullIsCircle
  const radius = isSplitMode ? splitRadius : fullRadius
  const setRadius = isSplitMode ? setSplitRadius : setFullRadius

  const captions = templateProps.captions || []
  const captionStyle = templateProps.captionStyle || {}
  const currentTimeMs = (currentFrame / project.fps) * 1000

  // Font filtering
  const filteredFonts = useMemo(() => {
    if (!fontSearch) return UNIQUE_FONTS
    const query = fontSearch.toLowerCase()
    return UNIQUE_FONTS.filter(
      (f: CyrillicFont) =>
        f.name.toLowerCase().includes(query) ||
        f.id.toLowerCase().includes(query)
    )
  }, [fontSearch])

  const currentFontId = captionStyle.fontFamily || 'Montserrat'
  const currentFont =
    UNIQUE_FONTS.find((f: CyrillicFont) => f.id === currentFontId) ||
    POPULAR_FONTS[0]

  // Auto detect face center
  const handleAutoDetect = async () => {
    if (!lipSyncVideo || isDetecting) return
    setIsDetecting(true)
    try {
      const result = await analyzeFace(lipSyncVideo)
      if (result.success && result.faceDetected && result.cropSettings) {
        setFaceOffsetX(result.cropSettings.offsetX)
        setFaceOffsetY(result.cropSettings.offsetY)
        setScale(result.cropSettings.scale)
      }
    } catch (error) {
      console.error('[PropertiesPanel] Face detection failed:', error)
    } finally {
      setIsDetecting(false)
    }
  }

  // Reset avatar settings to template defaults (or fallback to hardcoded defaults)
  const handleResetAvatar = () => {
    console.log('[Reset] Starting reset to template defaults...')

    // Get template defaults from selected template
    const templateDefaults = selectedTemplate?.defaultProps as
      | TemplateSettings
      | undefined

    if (templateDefaults && Object.keys(templateDefaults).length > 0) {
      console.log('[Reset] Using template defaults:', selectedTemplate?.name)

      // Apply template settings
      if (templateDefaults.splitAvatarSettings) {
        setSplitSettings(templateDefaults.splitAvatarSettings)
      }
      if (templateDefaults.fullscreenAvatarSettings) {
        setFullscreenSettings(templateDefaults.fullscreenAvatarSettings)
      }
      if (templateDefaults.vignetteStrength !== undefined) {
        setVignetteStrength(templateDefaults.vignetteStrength)
      }
      if (templateDefaults.colorCorrection !== undefined) {
        setColorCorrection(templateDefaults.colorCorrection)
      }
      if (templateDefaults.faceOffsetX !== undefined) {
        setFaceOffsetX(templateDefaults.faceOffsetX)
      }
      if (templateDefaults.faceOffsetY !== undefined) {
        setFaceOffsetY(templateDefaults.faceOffsetY)
      }
      if (templateDefaults.avatarAnimation) {
        setAvatarAnimation(templateDefaults.avatarAnimation)
      }
      if (templateDefaults.avatarBorderEffect) {
        setBorderEffect(templateDefaults.avatarBorderEffect)
      }
      if (templateDefaults.avatarBorderColor) {
        setBorderColor(templateDefaults.avatarBorderColor)
      }
      if (templateDefaults.avatarBorderColor2) {
        setBorderColor2(templateDefaults.avatarBorderColor2)
      }
      if (templateDefaults.avatarBorderWidth !== undefined) {
        setBorderWidth(templateDefaults.avatarBorderWidth)
      }
      if (templateDefaults.avatarBorderIntensity !== undefined) {
        setBorderIntensity(templateDefaults.avatarBorderIntensity)
      }

      console.log('[Reset] Applied template defaults')
    } else {
      console.log('[Reset] No template defaults, using hardcoded defaults')

      // Fallback to canonical defaults from @vibee/atoms
      setSplitSettings(DEFAULT_SPLIT_AVATAR)
      setFullscreenSettings(DEFAULT_FULLSCREEN_AVATAR)
      setVignetteStrength(0.7)
      setColorCorrection(1.2)
      setFaceOffsetX(0)
      setFaceOffsetY(0)
      setAvatarAnimation('pop')
      setBorderEffect('none')
      setBorderColor(DEFAULT_AVATAR_CONFIG.borderColor)
      setBorderColor2(DEFAULT_AVATAR_CONFIG.borderColor2)
      setBorderWidth(4)
      setBorderIntensity(1.0)

      console.log('[Reset] Applied hardcoded defaults')
    }
  }

  // Caption style handlers
  const handleStyleChange = (key: keyof CaptionStyle, value: any) => {
    updateTemplateProp({
      key: 'captionStyle',
      value: { ...captionStyle, [key]: value },
    })
  }

  const handleFontSelect = (fontId: string) => {
    handleStyleChange('fontFamily', fontId)
    setShowFontDropdown(false)
    setFontSearch('')
  }

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const secs = seconds % 60
    const millis = Math.floor((ms % 1000) / 10)
    return `${minutes}:${secs.toString().padStart(2, '0')}.${millis.toString().padStart(2, '0')}`
  }

  const parseTime = (timeStr: string): number => {
    const parts = timeStr.split(':')
    if (parts.length === 2) {
      const [minSec, millis] = parts[1].split('.')
      const minutes = parseInt(parts[0]) || 0
      const seconds = parseInt(minSec) || 0
      const ms = parseInt(millis) * 10 || 0
      return minutes * 60000 + seconds * 1000 + ms
    }
    return 0
  }

  const handleAddCaption = () => {
    const newCaption: CaptionItem = {
      text: 'New caption',
      startMs: currentTimeMs,
      endMs: currentTimeMs + 2000,
      timestampMs: currentTimeMs,
      confidence: null,
    }
    updateTemplateProp({ key: 'captions', value: [...captions, newCaption] })
  }

  const handleUpdateCaption = (
    index: number,
    updates: Partial<CaptionItem>
  ) => {
    const newCaptions = [...captions]
    newCaptions[index] = { ...newCaptions[index], ...updates }
    updateTemplateProp({ key: 'captions', value: newCaptions })
  }

  const handleDeleteCaption = (index: number) => {
    const newCaptions = captions.filter((_, i) => i !== index)
    updateTemplateProp({ key: 'captions', value: newCaptions })
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = event => {
      const content = event.target?.result as string
      if (!content) return
      const parsedCaptions = parseSrt(content)
      if (parsedCaptions.length > 0) {
        updateTemplateProp({ key: 'captions', value: parsedCaptions })
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  // Batch operations for multiple selected items
  const adjustDuration = (deltaFrames: number) => {
    selectedItems.forEach(item => {
      const newDuration = Math.max(1, item.durationInFrames + deltaFrames)
      updateItem({
        itemId: item.id,
        updates: { durationInFrames: newDuration },
      })
    })
  }

  const setUniformDuration = () => {
    if (selectedItems.length === 0) return
    // Use shortest item as baseline
    const minDuration = Math.min(...selectedItems.map(i => i.durationInFrames))
    selectedItems.forEach(item => {
      updateItem({
        itemId: item.id,
        updates: { durationInFrames: minDuration },
      })
    })
  }

  const handleTextChange = (key: string, value: any) => {
    if (selectedTextItem) {
      updateItem({ itemId: selectedTextItem.id, updates: { [key]: value } })
    }
  }

  // Nothing selected - return null (Layout is now in CanvasControls)
  if (selectedItems.length === 0) {
    return null
  }

  // Show batch operations for multiple selected items
  if (selectedItems.length > 1) {
    const fps = project.fps
    return (
      <div className="properties-panel">
        <div className="properties-section">
          <h3 className="properties-section-title">
            📦 {t('props.batchEdit')} ({selectedItems.length} {t('props.items')}
            )
          </h3>

          <div className="batch-duration">
            <label className="property-label">
              {t('props.adjustDuration')}
            </label>
            <div className="batch-buttons">
              <button
                onClick={() => adjustDuration(-fps)}
                title={t('props.minus1s')}
              >
                -1s
              </button>
              <button
                onClick={() => adjustDuration(Math.round(-fps / 2))}
                title={t('props.minus05s')}
              >
                -0.5s
              </button>
              <button
                onClick={() => adjustDuration(Math.round(fps / 2))}
                title={t('props.plus05s')}
              >
                +0.5s
              </button>
              <button
                onClick={() => adjustDuration(fps)}
                title={t('props.plus1s')}
              >
                +1s
              </button>
            </div>
          </div>

          <div className="batch-uniform">
            <button className="batch-uniform-btn" onClick={setUniformDuration}>
              {t('props.makeSameDuration')}
            </button>
            <span className="batch-hint">
              {t('props.setsAllToShortest')}:{' '}
              {Math.min(...selectedItems.map(i => i.durationInFrames))}f
            </span>
          </div>
        </div>

        <div className="properties-section">
          <h3 className="properties-section-title">
            📊 {t('props.selectionInfo')}
          </h3>
          <div className="selection-info">
            {['video', 'audio', 'avatar', 'text', 'image'].map(type => {
              const count = selectedItems.filter(i => i.type === type).length
              if (count === 0) return null
              return (
                <div key={type} className="selection-info-item">
                  <span className="selection-type">{type}</span>
                  <span className="selection-count">{count}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // TEXT item - tabs: Text, Style, Position, Timing
  if (selectedTextItem) {
    return (
      <div className="properties-panel">
        <div className="properties-tabs">
          <button
            className={`properties-tab ${activeTab === 'avatar' ? 'active' : ''}`}
            onClick={() => setActiveTab('avatar')}
          >
            <span className="tab-emoji">✏️</span>
            <span className="tab-label">{t('section.text')}</span>
          </button>
          <button
            className={`properties-tab ${activeTab === 'effects' ? 'active' : ''}`}
            onClick={() => setActiveTab('effects')}
          >
            <span className="tab-emoji">🎨</span>
            <span className="tab-label">{t('section.style')}</span>
          </button>
          <button
            className={`properties-tab ${activeTab === 'layout' ? 'active' : ''}`}
            onClick={() => setActiveTab('layout')}
          >
            <span className="tab-emoji">📍</span>
            <span className="tab-label">{t('section.position')}</span>
          </button>
          <button
            className={`properties-tab ${activeTab === 'audio' ? 'active' : ''}`}
            onClick={() => setActiveTab('audio')}
          >
            <span className="tab-emoji">⏱️</span>
            <span className="tab-label">{t('section.timing')}</span>
          </button>
        </div>

        {/* ✏️ TEXT Tab */}
        {activeTab === 'avatar' && (
          <div className="properties-section">
            <PropertyTextArea
              label={t('props.content')}
              value={(selectedTextItem as any).text || ''}
              onChange={v => handleTextChange('text', v)}
              placeholder={t('props.enterText')}
            />
          </div>
        )}

        {/* 🎨 STYLE Tab */}
        {activeTab === 'effects' && (
          <div className="properties-section">
            <PropertyInput
              label={t('props.fontSize')}
              value={(selectedTextItem as any).fontSize || 48}
              onChange={v => handleTextChange('fontSize', v)}
              min={12}
              max={200}
              step={1}
              suffix="px"
            />
            <PropertyColor
              label={t('props.color')}
              value={(selectedTextItem as any).color || '#ffffff'}
              onChange={v => handleTextChange('color', v)}
            />
            <PropertySelect
              label={t('props.weight')}
              value={String((selectedTextItem as any).fontWeight || 400)}
              onChange={v => handleTextChange('fontWeight', Number(v))}
              options={[
                { value: '300', label: t('font.light') },
                { value: '400', label: t('font.regular') },
                { value: '500', label: t('font.medium') },
                { value: '600', label: t('font.semibold') },
                { value: '700', label: t('font.bold') },
                { value: '800', label: t('font.extrabold') },
              ]}
            />
            <PropertySelect
              label={t('props.align')}
              value={(selectedTextItem as any).textAlign || 'center'}
              onChange={v => handleTextChange('textAlign', v)}
              options={[
                { value: 'left', label: t('props.left') },
                { value: 'center', label: t('props.center') },
                { value: 'right', label: t('props.right') },
              ]}
            />
          </div>
        )}

        {/* 📍 POSITION Tab */}
        {activeTab === 'layout' && (
          <div className="properties-section">
            <div className="properties-grid">
              <PropertyInput
                label="X"
                value={selectedTextItem.x}
                onChange={v => handleTextChange('x', v)}
                min={0}
                max={DEFAULT_WIDTH}
                step={1}
                suffix="px"
              />
              <PropertyInput
                label="Y"
                value={selectedTextItem.y}
                onChange={v => handleTextChange('y', v)}
                min={0}
                max={DEFAULT_HEIGHT}
                step={1}
                suffix="px"
              />
            </div>
            <PropertySlider
              label={t('props.rotation')}
              value={selectedTextItem.rotation}
              onChange={v => handleTextChange('rotation', v)}
              min={0}
              max={360}
              step={1}
            />
            <PropertySlider
              label={t('props.opacity')}
              value={selectedTextItem.opacity}
              onChange={v => handleTextChange('opacity', v)}
              min={0}
              max={1}
              step={0.05}
            />
          </div>
        )}

        {/* ⏱️ TIMING Tab */}
        {activeTab === 'audio' && (
          <div className="properties-section">
            <div className="properties-grid">
              <PropertyInput
                label={t('props.start')}
                value={selectedTextItem.startFrame}
                onChange={v => handleTextChange('startFrame', v)}
                min={0}
                step={1}
                suffix="f"
              />
              <PropertyInput
                label={t('props.duration')}
                value={selectedTextItem.durationInFrames}
                onChange={v => handleTextChange('durationInFrames', v)}
                min={1}
                step={1}
                suffix="f"
              />
            </div>
          </div>
        )}
      </div>
    )
  }

  // Single non-text item selected (video, audio, avatar, image)
  const selectedItem = selectedItems[0]
  const handleItemChange = (key: string, value: any) => {
    updateItem({ itemId: selectedItem.id, updates: { [key]: value } })
  }

  const typeIcons: Record<string, string> = {
    video: '🎬',
    audio: '🎵',
    avatar: '👤',
    image: '🖼️',
  }

  // Avatar item - show tabs for Properties / Captions
  if (selectedItem.type === 'avatar') {
    return (
      <div className="properties-panel">
        {/* Пять вкладок-эмодзи. Раньше повторяли боковую панель
            VerticalTabs — та удалена как мёртвая, эти живут сами. */}
        <div className="properties-tabs">
          <button
            className={`properties-tab ${activeTab === 'avatar' ? 'active' : ''}`}
            onClick={() => setActiveTab('avatar')}
          >
            <span className="tab-emoji">👤</span>
            <span className="tab-label">{t('player.avatar')}</span>
          </button>
          <button
            className={`properties-tab ${activeTab === 'layout' ? 'active' : ''}`}
            onClick={() => setActiveTab('layout')}
          >
            <span className="tab-emoji">📐</span>
            <span className="tab-label">{t('section.layout')}</span>
          </button>
          <button
            className={`properties-tab ${activeTab === 'effects' ? 'active' : ''}`}
            onClick={() => setActiveTab('effects')}
          >
            <span className="tab-emoji">🎨</span>
            <span className="tab-label">{t('player.effects')}</span>
          </button>
          <button
            className={`properties-tab ${activeTab === 'audio' ? 'active' : ''}`}
            onClick={() => setActiveTab('audio')}
          >
            <span className="tab-emoji">🔊</span>
            <span className="tab-label">{t('section.audio')}</span>
          </button>
          <button
            className={`properties-tab ${activeTab === 'captions' ? 'active' : ''}`}
            onClick={() => setActiveTab('captions')}
          >
            <span className="tab-emoji">💬</span>
            <span className="tab-label">{t('player.captions')}</span>
          </button>
        </div>

        {/* 👤 AVATAR Tab */}
        {activeTab === 'avatar' && (
          <div className="properties-section">
            {/* Mode Tabs */}
            <div className="player-tabs-row">
              <div className="player-tabs">
                <button
                  className={`player-tab ${avatarTab === 'fullscreen' ? 'active' : ''}`}
                  onClick={() => setAvatarTab('fullscreen')}
                >
                  <Maximize size={12} />
                  {t('player.fullscreen')}
                </button>
                <button
                  className={`player-tab ${avatarTab === 'split' ? 'active' : ''}`}
                  onClick={() => setAvatarTab('split')}
                >
                  <Layers size={12} />
                  {t('player.split')}
                </button>
              </div>
              <button
                className="player-reset-btn"
                onClick={handleResetAvatar}
                title={t('player.reset')}
              >
                <RotateCcw size={14} />
              </button>
            </div>

            {/* Face Detection */}
            <div className="player-control">
              <label>{t('player.autoDetect')}</label>
              <button
                className={`player-action-btn ${isDetecting ? 'loading' : ''}`}
                onClick={handleAutoDetect}
                disabled={isDetecting || !lipSyncVideo}
              >
                <ScanFace size={14} />
                {isDetecting ? t('player.detecting') : t('player.detect')}
              </button>
            </div>

            {/* Circle Toggle */}
            <div className="player-control">
              <label>{t('player.circle')}</label>
              <button
                className={`player-toggle ${isCircle ? 'active' : ''}`}
                onClick={() => setIsCircle(!isCircle)}
              >
                <Circle size={14} />
                {isCircle ? 'ON' : 'OFF'}
              </button>
            </div>

            {/* Border Radius */}
            {isCircle && (
              <PropertySlider
                label={t('player.borderRadius')}
                value={radius}
                onChange={setRadius}
                min={0}
                max={100}
                step={1}
              />
            )}

            {/* Size/Position controls */}
            <PropertySlider
              label={t('player.avatarSize')}
              value={size}
              onChange={setSize}
              min={10}
              max={100}
              step={1}
            />
            <PropertySlider
              label={t('player.positionX')}
              value={posX}
              onChange={setPosX}
              min={-100}
              max={100}
              step={1}
            />
            <PropertySlider
              label={t('player.positionY')}
              value={posY}
              onChange={setPosY}
              min={-100}
              max={100}
              step={1}
            />
            <PropertySlider
              label={t('player.faceScale')}
              value={scale}
              onChange={setScale}
              min={0.5}
              max={2}
              step={0.1}
              suffix="x"
            />

            {/* Animation */}
            <div className="player-control">
              <label>{t('player.avatarEffect')}</label>
              <select
                className="player-select"
                value={avatarAnimation}
                onChange={e =>
                  setAvatarAnimation(e.target.value as AvatarAnimation)
                }
              >
                <option value="pop">Pop</option>
                <option value="fade">Fade</option>
                <option value="scale">Scale</option>
                <option value="slide">Slide</option>
                <option value="bounce">Bounce</option>
                <option value="none">{t('player.none')}</option>
              </select>
            </div>

            {/* Border Effect */}
            <div className="player-control">
              <label>{t('player.borderEffect')}</label>
              <select
                className="player-select"
                value={borderEffect}
                onChange={e =>
                  setBorderEffect(e.target.value as AvatarBorderEffect)
                }
              >
                <option value="none">{t('player.none')}</option>
                <option value="solid">{t('player.solid')}</option>
                <option value="neon">{t('player.neon')}</option>
                <option value="rainbow">{t('player.rainbow')}</option>
                <option value="gradient">{t('player.gradient')}</option>
                <option value="pulse">{t('player.pulse')}</option>
                <option value="glow">{t('player.glow')}</option>
              </select>
            </div>

            {/* Border Color */}
            {!['none', 'rainbow'].includes(borderEffect) && (
              <div className="player-control">
                <label>{t('player.borderColor')}</label>
                <input
                  type="color"
                  className="player-color-input"
                  value={borderColor}
                  onChange={e => setBorderColor(e.target.value)}
                />
              </div>
            )}
          </div>
        )}

        {/* 📐 LAYOUT Tab */}
        {activeTab === 'layout' && (
          <div className="properties-section">
            <div className="layout-grid">
              {SPLIT_LAYOUTS.map(opt => (
                <button
                  key={opt.value}
                  className={`layout-btn ${currentVideoLayout === opt.value ? 'active' : ''}`}
                  onClick={() => setAllVideoItemsLayout(opt.value)}
                  title={opt.label}
                >
                  <LayoutIcon type={opt.value} />
                  <span className="layout-label">{opt.label}</span>
                </button>
              ))}
            </div>
            <div className="layout-grid pip-grid" style={{ marginTop: 8 }}>
              {PIP_LAYOUTS.map(opt => (
                <button
                  key={opt.value}
                  className={`layout-btn ${currentVideoLayout === opt.value ? 'active' : ''}`}
                  onClick={() => setAllVideoItemsLayout(opt.value)}
                  title={opt.label}
                >
                  <LayoutIcon type={opt.value} />
                  <span className="layout-label">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 🎨 EFFECTS Tab */}
        {activeTab === 'effects' && (
          <div className="properties-section">
            {/* Timing */}
            <div className="properties-grid">
              <PropertyInput
                label={t('props.start')}
                value={selectedItem.startFrame}
                onChange={v => handleItemChange('startFrame', v)}
                min={0}
                step={1}
                suffix="f"
              />
              <PropertyInput
                label={t('props.duration')}
                value={selectedItem.durationInFrames}
                onChange={v => handleItemChange('durationInFrames', v)}
                min={1}
                step={1}
                suffix="f"
              />
            </div>
            {/* Visual Effects */}
            <PropertySlider
              label={t('player.vignette')}
              value={vignetteStrength}
              onChange={setVignetteStrength}
              min={0}
              max={1}
              step={0.05}
            />
            <PropertySlider
              label={t('player.colorCorrection')}
              value={colorCorrection}
              onChange={setColorCorrection}
              min={0.5}
              max={2}
              step={0.1}
              suffix="x"
            />
          </div>
        )}

        {/* 🔊 AUDIO Tab */}
        {activeTab === 'audio' && (
          <div className="properties-section">
            <PropertySlider
              label={t('props.volume')}
              value={(selectedItem as any).volume ?? 1}
              onChange={v => handleItemChange('volume', v)}
              min={0}
              max={1}
              step={0.05}
            />
            <div className="player-control">
              <label>{t('player.playbackSpeed')}</label>
              <div className="player-speed-buttons">
                {[0.5, 1, 1.5, 2].map(speed => (
                  <button
                    key={speed}
                    className={`player-speed-btn ${playbackRate === speed ? 'active' : ''}`}
                    onClick={() => setPlaybackRate(speed)}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 💬 CAPTIONS Tab */}
        {activeTab === 'captions' && (
          <div className="properties-captions">
            {/* Caption Style Section - TOP */}
            <div className="caption-style-section">
              <h4 className="style-section-header">
                <Palette size={12} />
                {t('captions.style')}
              </h4>

              {/* Font selector */}
              <div className="style-row-mini">
                <label>{t('captions.font')}</label>
                <div className="font-selector-mini" ref={fontDropdownRef}>
                  <button
                    className="font-selector-btn-mini"
                    onClick={() => setShowFontDropdown(!showFontDropdown)}
                  >
                    <span>{currentFont.name}</span>
                    <ChevronDown size={12} />
                  </button>
                  {showFontDropdown && (
                    <div className="font-dropdown-mini">
                      <div className="font-search-mini">
                        <Search size={12} />
                        <input
                          placeholder={t('captions.searchFonts')}
                          value={fontSearch}
                          onChange={e => setFontSearch(e.target.value)}
                          autoFocus
                        />
                      </div>
                      <div className="font-list-mini">
                        {filteredFonts.map((font: CyrillicFont) => (
                          <button
                            key={font.id}
                            className={
                              currentFontId === font.id ? 'selected' : ''
                            }
                            onClick={() => handleFontSelect(font.id)}
                          >
                            <span style={{ fontFamily: font.name }}>
                              {font.name}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Font size */}
              <div className="style-row-mini">
                <label>{t('captions.fontSize')}</label>
                <input
                  type="number"
                  value={captionStyle.fontSize || 48}
                  onChange={e =>
                    handleStyleChange('fontSize', Number(e.target.value))
                  }
                  min={24}
                  max={120}
                />
              </div>

              {/* Colors */}
              <div className="style-row-mini">
                <label>{t('captions.textColor')}</label>
                <input
                  type="color"
                  value={toHexColor(captionStyle.textColor, '#ffffff')}
                  onChange={e => handleStyleChange('textColor', e.target.value)}
                />
              </div>
              <div className="style-row-mini">
                <label>{t('captions.highlight')}</label>
                <input
                  type="color"
                  value={toHexColor(
                    captionStyle.highlightColor,
                    BRAND_COLORS.amber
                  )}
                  onChange={e =>
                    handleStyleChange('highlightColor', e.target.value)
                  }
                />
              </div>
            </div>

            {/* Divider */}
            <div className="caption-divider" />

            {/* Show/Hide toggle */}
            <div className="player-control" style={{ marginBottom: 12 }}>
              <label>{t('player.showCaptions')}</label>
              <button
                className={`player-toggle ${showCaptions ? 'active' : ''}`}
                onClick={() => setShowCaptions(!showCaptions)}
              >
                {showCaptions ? 'ON' : 'OFF'}
              </button>
            </div>

            {/* Action buttons */}
            <div className="caption-actions-mini">
              <button
                className="caption-action-btn add"
                onClick={handleAddCaption}
              >
                <Plus size={14} />
                {t('captions.add')}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".srt,.vtt"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
              <button
                className="caption-action-btn"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={14} />
              </button>
            </div>

            {/* Captions list - BOTTOM */}
            <div className="captions-list-mini">
              {captions.length === 0 ? (
                <div className="captions-empty-mini">
                  <Type size={24} />
                  <span>{t('captions.empty')}</span>
                </div>
              ) : (
                captions
                  .slice()
                  .sort((a, b) => a.startMs - b.startMs)
                  .map((caption, index) => {
                    const isCurrent =
                      currentTimeMs >= caption.startMs &&
                      currentTimeMs < caption.endMs
                    return (
                      <div
                        key={index}
                        className={`caption-item-mini ${isCurrent ? 'current' : ''}`}
                      >
                        <div className="caption-timing-mini">
                          <input
                            type="text"
                            value={formatTime(caption.startMs)}
                            onChange={e => {
                              const ms = parseTime(e.target.value)
                              handleUpdateCaption(index, {
                                startMs: ms,
                                timestampMs: ms,
                              })
                            }}
                            className="time-input-mini"
                          />
                          <span>→</span>
                          <input
                            type="text"
                            value={formatTime(caption.endMs)}
                            onChange={e =>
                              handleUpdateCaption(index, {
                                endMs: parseTime(e.target.value),
                              })
                            }
                            className="time-input-mini"
                          />
                          <button
                            className="caption-delete-mini"
                            onClick={() => handleDeleteCaption(index)}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                        <textarea
                          value={caption.text}
                          onChange={e =>
                            handleUpdateCaption(index, { text: e.target.value })
                          }
                          className="caption-text-mini"
                          rows={2}
                        />
                      </div>
                    )
                  })
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  // VIDEO item - tabs: Layout, Transform, Effects, Audio
  if (selectedItem.type === 'video') {
    return (
      <div className="properties-panel">
        <div className="properties-tabs">
          <button
            className={`properties-tab ${activeTab === 'layout' ? 'active' : ''}`}
            onClick={() => setActiveTab('layout')}
          >
            <span className="tab-emoji">📐</span>
            <span className="tab-label">{t('section.layout')}</span>
          </button>
          <button
            className={`properties-tab ${activeTab === 'avatar' ? 'active' : ''}`}
            onClick={() => setActiveTab('avatar')}
          >
            <span className="tab-emoji">🔄</span>
            <span className="tab-label">Transform</span>
          </button>
          <button
            className={`properties-tab ${activeTab === 'effects' ? 'active' : ''}`}
            onClick={() => setActiveTab('effects')}
          >
            <span className="tab-emoji">🎨</span>
            <span className="tab-label">{t('player.effects')}</span>
          </button>
          <button
            className={`properties-tab ${activeTab === 'audio' ? 'active' : ''}`}
            onClick={() => setActiveTab('audio')}
          >
            <span className="tab-emoji">🔊</span>
            <span className="tab-label">{t('section.audio')}</span>
          </button>
        </div>

        {/* 📐 LAYOUT Tab */}
        {activeTab === 'layout' && (
          <div className="properties-section">
            <div className="layout-grid">
              {SPLIT_LAYOUTS.map(opt => (
                <button
                  key={opt.value}
                  className={`layout-btn ${currentVideoLayout === opt.value ? 'active' : ''}`}
                  onClick={() => setAllVideoItemsLayout(opt.value)}
                  title={opt.label}
                >
                  <LayoutIcon type={opt.value} />
                  <span className="layout-label">{opt.label}</span>
                </button>
              ))}
            </div>
            <div className="layout-grid pip-grid" style={{ marginTop: 8 }}>
              {PIP_LAYOUTS.map(opt => (
                <button
                  key={opt.value}
                  className={`layout-btn ${currentVideoLayout === opt.value ? 'active' : ''}`}
                  onClick={() => setAllVideoItemsLayout(opt.value)}
                  title={opt.label}
                >
                  <LayoutIcon type={opt.value} />
                  <span className="layout-label">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 🔄 TRANSFORM Tab */}
        {activeTab === 'avatar' && (
          <div className="properties-section">
            <PropertySlider
              label="X"
              value={selectedItem.x}
              onChange={v => handleItemChange('x', v)}
              min={-DEFAULT_WIDTH}
              max={DEFAULT_WIDTH}
              step={1}
              suffix="px"
            />
            <PropertySlider
              label="Y"
              value={selectedItem.y}
              onChange={v => handleItemChange('y', v)}
              min={-DEFAULT_HEIGHT}
              max={DEFAULT_HEIGHT}
              step={1}
              suffix="px"
            />
            <PropertySlider
              label="Width"
              value={selectedItem.width}
              onChange={v => handleItemChange('width', v)}
              min={10}
              max={DEFAULT_WIDTH * 2}
              step={1}
              suffix="px"
            />
            <PropertySlider
              label="Height"
              value={selectedItem.height}
              onChange={v => handleItemChange('height', v)}
              min={10}
              max={DEFAULT_HEIGHT * 2}
              step={1}
              suffix="px"
            />
            <PropertySlider
              label="Rotation"
              value={selectedItem.rotation}
              onChange={v => handleItemChange('rotation', v)}
              min={0}
              max={360}
              step={1}
            />
            <PropertySlider
              label={t('props.opacity')}
              value={selectedItem.opacity}
              onChange={v => handleItemChange('opacity', v)}
              min={0}
              max={1}
              step={0.05}
            />
            <>
              <PropertySlider
                label="Crop X"
                value={(selectedItem as any).cropX ?? 50}
                onChange={v => handleItemChange('cropX', v)}
                min={0}
                max={100}
                step={1}
                suffix="%"
              />
              <PropertySlider
                label="Crop Y"
                value={(selectedItem as any).cropY ?? 50}
                onChange={v => handleItemChange('cropY', v)}
                min={0}
                max={100}
                step={1}
                suffix="%"
              />
            </>
          </div>
        )}

        {/* 🎨 EFFECTS Tab */}
        {activeTab === 'effects' && (
          <div className="properties-section">
            <div className="properties-grid">
              <PropertyInput
                label={t('props.start')}
                value={selectedItem.startFrame}
                onChange={v => handleItemChange('startFrame', v)}
                min={0}
                step={1}
                suffix="f"
              />
              <PropertyInput
                label={t('props.duration')}
                value={selectedItem.durationInFrames}
                onChange={v => handleItemChange('durationInFrames', v)}
                min={1}
                step={1}
                suffix="f"
              />
            </div>
            <PropertySlider
              label={t('player.vignette')}
              value={vignetteStrength}
              onChange={setVignetteStrength}
              min={0}
              max={1}
              step={0.05}
            />
            <PropertySlider
              label={t('player.colorCorrection')}
              value={colorCorrection}
              onChange={setColorCorrection}
              min={0.5}
              max={2}
              step={0.1}
              suffix="x"
            />
          </div>
        )}

        {/* 🔊 AUDIO Tab */}
        {activeTab === 'audio' && (
          <div className="properties-section">
            <PropertySlider
              label={t('props.volume')}
              value={(selectedItem as any).volume ?? 1}
              onChange={v => handleItemChange('volume', v)}
              min={0}
              max={1}
              step={0.05}
            />
            <div className="player-control">
              <label>{t('player.playbackSpeed')}</label>
              <div className="player-speed-buttons">
                {[0.5, 1, 1.5, 2].map(speed => (
                  <button
                    key={speed}
                    className={`player-speed-btn ${playbackRate === speed ? 'active' : ''}`}
                    onClick={() => setPlaybackRate(speed)}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // AUDIO item - tabs: Effects, Audio
  if (selectedItem.type === 'audio') {
    return (
      <div className="properties-panel">
        <div className="properties-tabs">
          <button
            className={`properties-tab ${activeTab === 'effects' ? 'active' : ''}`}
            onClick={() => setActiveTab('effects')}
          >
            <span className="tab-emoji">🎨</span>
            <span className="tab-label">{t('player.effects')}</span>
          </button>
          <button
            className={`properties-tab ${activeTab === 'audio' ? 'active' : ''}`}
            onClick={() => setActiveTab('audio')}
          >
            <span className="tab-emoji">🔊</span>
            <span className="tab-label">{t('section.audio')}</span>
          </button>
        </div>

        {/* 🎨 EFFECTS Tab */}
        {activeTab === 'effects' && (
          <div className="properties-section">
            <div className="properties-grid">
              <PropertyInput
                label={t('props.start')}
                value={selectedItem.startFrame}
                onChange={v => handleItemChange('startFrame', v)}
                min={0}
                step={1}
                suffix="f"
              />
              <PropertyInput
                label={t('props.duration')}
                value={selectedItem.durationInFrames}
                onChange={v => handleItemChange('durationInFrames', v)}
                min={1}
                step={1}
                suffix="f"
              />
            </div>
          </div>
        )}

        {/* 🔊 AUDIO Tab */}
        {activeTab === 'audio' && (
          <div className="properties-section">
            <PropertySlider
              label={t('props.volume')}
              value={(selectedItem as any).volume ?? 1}
              onChange={v => handleItemChange('volume', v)}
              min={0}
              max={1}
              step={0.05}
            />
            <div className="player-control">
              <label>{t('player.playbackSpeed')}</label>
              <div className="player-speed-buttons">
                {[0.5, 1, 1.5, 2].map(speed => (
                  <button
                    key={speed}
                    className={`player-speed-btn ${playbackRate === speed ? 'active' : ''}`}
                    onClick={() => setPlaybackRate(speed)}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // IMAGE item - tabs: Layout, Transform, Effects
  if (selectedItem.type === 'image') {
    return (
      <div className="properties-panel">
        <div className="properties-tabs">
          <button
            className={`properties-tab ${activeTab === 'layout' ? 'active' : ''}`}
            onClick={() => setActiveTab('layout')}
          >
            <span className="tab-emoji">📐</span>
            <span className="tab-label">{t('section.layout')}</span>
          </button>
          <button
            className={`properties-tab ${activeTab === 'avatar' ? 'active' : ''}`}
            onClick={() => setActiveTab('avatar')}
          >
            <span className="tab-emoji">🔄</span>
            <span className="tab-label">Transform</span>
          </button>
          <button
            className={`properties-tab ${activeTab === 'effects' ? 'active' : ''}`}
            onClick={() => setActiveTab('effects')}
          >
            <span className="tab-emoji">🎨</span>
            <span className="tab-label">{t('player.effects')}</span>
          </button>
        </div>

        {/* 📐 LAYOUT Tab */}
        {activeTab === 'layout' && (
          <div className="properties-section">
            <div className="layout-grid">
              {SPLIT_LAYOUTS.map(opt => (
                <button
                  key={opt.value}
                  className={`layout-btn ${currentVideoLayout === opt.value ? 'active' : ''}`}
                  onClick={() => setAllVideoItemsLayout(opt.value)}
                  title={opt.label}
                >
                  <LayoutIcon type={opt.value} />
                  <span className="layout-label">{opt.label}</span>
                </button>
              ))}
            </div>
            <div className="layout-grid pip-grid" style={{ marginTop: 8 }}>
              {PIP_LAYOUTS.map(opt => (
                <button
                  key={opt.value}
                  className={`layout-btn ${currentVideoLayout === opt.value ? 'active' : ''}`}
                  onClick={() => setAllVideoItemsLayout(opt.value)}
                  title={opt.label}
                >
                  <LayoutIcon type={opt.value} />
                  <span className="layout-label">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 🔄 TRANSFORM Tab */}
        {activeTab === 'avatar' && (
          <div className="properties-section">
            <PropertySlider
              label="X"
              value={selectedItem.x}
              onChange={v => handleItemChange('x', v)}
              min={-DEFAULT_WIDTH}
              max={DEFAULT_WIDTH}
              step={1}
              suffix="px"
            />
            <PropertySlider
              label="Y"
              value={selectedItem.y}
              onChange={v => handleItemChange('y', v)}
              min={-DEFAULT_HEIGHT}
              max={DEFAULT_HEIGHT}
              step={1}
              suffix="px"
            />
            <PropertySlider
              label="Width"
              value={selectedItem.width}
              onChange={v => handleItemChange('width', v)}
              min={10}
              max={DEFAULT_WIDTH * 2}
              step={1}
              suffix="px"
            />
            <PropertySlider
              label="Height"
              value={selectedItem.height}
              onChange={v => handleItemChange('height', v)}
              min={10}
              max={DEFAULT_HEIGHT * 2}
              step={1}
              suffix="px"
            />
            <PropertySlider
              label="Rotation"
              value={selectedItem.rotation}
              onChange={v => handleItemChange('rotation', v)}
              min={0}
              max={360}
              step={1}
            />
            <PropertySlider
              label={t('props.opacity')}
              value={selectedItem.opacity}
              onChange={v => handleItemChange('opacity', v)}
              min={0}
              max={1}
              step={0.05}
            />
            <>
              <PropertySlider
                label="Crop X"
                value={(selectedItem as any).cropX ?? 50}
                onChange={v => handleItemChange('cropX', v)}
                min={0}
                max={100}
                step={1}
                suffix="%"
              />
              <PropertySlider
                label="Crop Y"
                value={(selectedItem as any).cropY ?? 50}
                onChange={v => handleItemChange('cropY', v)}
                min={0}
                max={100}
                step={1}
                suffix="%"
              />
            </>
          </div>
        )}

        {/* 🎨 EFFECTS Tab */}
        {activeTab === 'effects' && (
          <div className="properties-section">
            <div className="properties-grid">
              <PropertyInput
                label={t('props.start')}
                value={selectedItem.startFrame}
                onChange={v => handleItemChange('startFrame', v)}
                min={0}
                step={1}
                suffix="f"
              />
              <PropertyInput
                label={t('props.duration')}
                value={selectedItem.durationInFrames}
                onChange={v => handleItemChange('durationInFrames', v)}
                min={1}
                step={1}
                suffix="f"
              />
            </div>
          </div>
        )}
      </div>
    )
  }

  // Fallback for unknown types
  return (
    <div className="properties-panel">
      <div className="properties-section">
        <h3 className="properties-section-title">
          {typeIcons[selectedItem.type] || '📦'}{' '}
          {selectedItem.type.toUpperCase()}
        </h3>
        <div className="properties-grid">
          <PropertyInput
            label={t('props.start')}
            value={selectedItem.startFrame}
            onChange={v => handleItemChange('startFrame', v)}
            min={0}
            step={1}
            suffix="f"
          />
          <PropertyInput
            label={t('props.duration')}
            value={selectedItem.durationInFrames}
            onChange={v => handleItemChange('durationInFrames', v)}
            min={1}
            step={1}
            suffix="f"
          />
        </div>
      </div>
    </div>
  )
}

// ===============================
// Sub-components
// ===============================

interface PropertyInputProps {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  suffix?: string
}

function PropertyInput({
  label,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
}: PropertyInputProps) {
  return (
    <div className="property-input">
      <label className="property-label">{label}</label>
      <div className="property-input-wrapper">
        <input
          type="number"
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          min={min}
          max={max}
          step={step}
        />
        {suffix && <span className="property-suffix">{suffix}</span>}
      </div>
    </div>
  )
}

interface PropertySliderProps {
  label: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step: number
  suffix?: string
  disabled?: boolean
}

function PropertySlider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
  disabled,
}: PropertySliderProps) {
  const formatValue = (v: number) => {
    if (suffix === 'x') return v.toFixed(1) + 'x'
    if (Number.isInteger(v)) return Math.round(v) + (suffix || '')
    return v.toFixed(2) + (suffix || '')
  }

  return (
    <div className={`property-slider ${disabled ? 'disabled' : ''}`}>
      <div className="property-slider-header">
        <label className="property-label">{label}</label>
        <span className="property-value">{formatValue(value)}</span>
      </div>
      <input
        type="range"
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
      />
    </div>
  )
}

interface PropertyFileInputProps {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

function PropertyFileInput({
  label,
  value,
  onChange,
  placeholder,
}: PropertyFileInputProps) {
  const fileName = value.split('/').pop() || 'None'

  return (
    <div className="property-file">
      <label className="property-label">{label}</label>
      <div className="property-file-wrapper">
        <span className="property-file-name" title={value}>
          {fileName}
        </span>
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="property-file-input"
        />
      </div>
    </div>
  )
}

interface PropertyTextAreaProps {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

function PropertyTextArea({
  label,
  value,
  onChange,
  placeholder,
}: PropertyTextAreaProps) {
  return (
    <div className="property-textarea">
      <label className="property-label">{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={3}
        placeholder={placeholder}
      />
    </div>
  )
}

interface PropertyColorProps {
  label: string
  value: string
  onChange: (value: string) => void
}

function PropertyColor({ label, value, onChange }: PropertyColorProps) {
  return (
    <div className="property-color">
      <label className="property-label">{label}</label>
      <div className="property-color-wrapper">
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
        />
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="#ffffff"
          className="property-color-hex"
        />
      </div>
    </div>
  )
}

interface PropertySelectProps {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}

function PropertySelect({
  label,
  value,
  onChange,
  options,
}: PropertySelectProps) {
  return (
    <div className="property-select">
      <label className="property-label">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}>
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}
