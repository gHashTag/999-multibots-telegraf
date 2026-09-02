import { useState, useRef, useMemo, useEffect } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { useLanguage } from '@/hooks/useLanguage'
import { useToast } from '@/hooks/useToast'
import {
  templatePropsAtom,
  updateTemplatePropAtom,
  currentFrameAtom,
  projectAtom,
} from '@/atoms'
import type { CaptionItem, CaptionStyle } from '@vibee/atoms'
import { BRAND_COLORS } from '@vibee/atoms'
import {
  Plus,
  Trash2,
  Type,
  Palette,
  Eye,
  EyeOff,
  Upload,
  FileText,
  Search,
  ChevronDown,
} from 'lucide-react'
import './CaptionsPanel.css'

// Import centralized font definitions
import { POPULAR_FONTS, UNIQUE_FONTS, type CyrillicFont } from '@/shared/fonts'

// Convert any color format (rgba, hex, hex8) to #rrggbb for HTML color picker
function toHexColor(color: string | undefined, fallback: string): string {
  if (!color) return fallback

  // Already hex format (#rgb, #rrggbb, #rrggbbaa)
  if (color.startsWith('#')) {
    // Remove alpha if present (8 char hex)
    if (color.length === 9) return color.slice(0, 7)
    if (color.length === 7) return color
    if (color.length === 4) {
      // Expand #rgb to #rrggbb
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

// Parse SRT timestamp to milliseconds (format: 00:00:00,000)
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

// Parse VTT timestamp to milliseconds (format: 00:00:00.000 or 00:00.000)
function parseVttTime(time: string): number {
  const parts = time.split(':')
  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts
    const [secs, ms] = seconds.split('.')
    return (
      parseInt(hours) * 3600000 +
      parseInt(minutes) * 60000 +
      parseInt(secs) * 1000 +
      parseInt(ms || '0')
    )
  } else {
    const [minutes, seconds] = parts
    const [secs, ms] = seconds.split('.')
    return (
      parseInt(minutes) * 60000 + parseInt(secs) * 1000 + parseInt(ms || '0')
    )
  }
}

// Parse SRT file content
function parseSrt(content: string): CaptionItem[] {
  const captions: CaptionItem[] = []
  const blocks = content.trim().split(/\n\s*\n/)

  for (const block of blocks) {
    const lines = block.trim().split('\n')
    if (lines.length < 3) continue

    // Line 0: sequence number (skip)
    // Line 1: timestamp
    // Lines 2+: text
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

// Parse VTT file content
function parseVtt(content: string): CaptionItem[] {
  const captions: CaptionItem[] = []
  // Remove WEBVTT header and metadata
  const lines = content
    .replace(/^WEBVTT.*$/m, '')
    .trim()
    .split(/\n\s*\n/)

  for (const block of lines) {
    const blockLines = block.trim().split('\n')

    // Find the timestamp line
    let timeLineIndex = 0
    for (let i = 0; i < blockLines.length; i++) {
      if (blockLines[i].includes('-->')) {
        timeLineIndex = i
        break
      }
    }

    const timeLine = blockLines[timeLineIndex]
    if (!timeLine || !timeLine.includes('-->')) continue

    const timeMatch = timeLine.match(
      /(\d{1,2}:?\d{2}:\d{2}[\.]\d{3})\s*-->\s*(\d{1,2}:?\d{2}:\d{2}[\.]\d{3})/
    )
    if (!timeMatch) continue

    const startMs = parseVttTime(timeMatch[1])
    const endMs = parseVttTime(timeMatch[2])
    const text = blockLines
      .slice(timeLineIndex + 1)
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

export function CaptionsPanel() {
  const { t, lang } = useLanguage()
  const toast = useToast()
  const templateProps = useAtomValue(templatePropsAtom)
  const updateTemplateProp = useSetAtom(updateTemplatePropAtom)
  const currentFrame = useAtomValue(currentFrameAtom)
  const project = useAtomValue(projectAtom)

  const [activeTab, setActiveTab] = useState<'captions' | 'style'>('captions')
  const [fontSearch, setFontSearch] = useState('')
  const [showFontDropdown, setShowFontDropdown] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fontDropdownRef = useRef<HTMLDivElement>(null)

  // Preload Google Fonts for dropdown preview
  useEffect(() => {
    if (!showFontDropdown) return

    // Check if fonts are already loaded
    const existingLink = document.querySelector('link[data-fonts-preview]')
    if (existingLink) return

    // Build Google Fonts URL for popular fonts
    const fontFamilies = POPULAR_FONTS.map(f => f.name.replace(/ /g, '+')).join(
      '&family='
    )
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = `https://fonts.googleapis.com/css2?family=${fontFamilies}&display=swap&subset=cyrillic`
    link.setAttribute('data-fonts-preview', 'true')
    document.head.appendChild(link)
  }, [showFontDropdown])

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = event => {
      const content = event.target?.result as string
      if (!content) return

      let parsedCaptions: CaptionItem[] = []

      if (file.name.endsWith('.srt')) {
        parsedCaptions = parseSrt(content)
      } else if (file.name.endsWith('.vtt')) {
        parsedCaptions = parseVtt(content)
      }

      if (parsedCaptions.length > 0) {
        updateTemplateProp({ key: 'captions', value: parsedCaptions })
        console.log(
          `[Captions] Loaded ${parsedCaptions.length} captions from ${file.name}`
        )
      } else {
        toast.error(t('captions.parseError'))
      }
    }

    reader.readAsText(file)
    // Reset input so the same file can be selected again
    e.target.value = ''
  }

  const captions = templateProps.captions || []
  const captionStyle = templateProps.captionStyle || {}
  const showCaptions = templateProps.showCaptions ?? true

  // Filter fonts based on search
  const filteredFonts = useMemo(() => {
    if (!fontSearch) return UNIQUE_FONTS
    const query = fontSearch.toLowerCase()
    return UNIQUE_FONTS.filter(
      (f: CyrillicFont) =>
        f.name.toLowerCase().includes(query) ||
        f.id.toLowerCase().includes(query)
    )
  }, [fontSearch])

  // Get current font name
  const currentFontId = captionStyle.fontFamily || 'Montserrat'
  const currentFont =
    UNIQUE_FONTS.find((f: CyrillicFont) => f.id === currentFontId) ||
    POPULAR_FONTS[0]

  // Handle font selection
  const handleFontSelect = (fontId: string) => {
    handleStyleChange('fontFamily', fontId)
    setShowFontDropdown(false)
    setFontSearch('')
  }

  const currentTimeMs = (currentFrame / project.fps) * 1000

  // Find current caption
  const currentCaption = captions.find(
    c => currentTimeMs >= c.startMs && currentTimeMs < c.endMs
  )

  const handleToggleCaptions = () => {
    updateTemplateProp({ key: 'showCaptions', value: !showCaptions })
  }

  const handleAddCaption = () => {
    const newCaption: CaptionItem = {
      text: 'New caption',
      startMs: currentTimeMs,
      endMs: currentTimeMs + 2000, // 2 seconds
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

  const handleStyleChange = (key: keyof CaptionStyle, value: any) => {
    updateTemplateProp({
      key: 'captionStyle',
      value: { ...captionStyle, [key]: value },
    })
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

  return (
    <div className="captions-panel">
      <div className="panel-header">
        <Type size={14} />
        <span>{t('tabs.captions')}</span>
      </div>

      {/* Header */}
      <div className="captions-header">
        <div className="captions-tabs">
          <button
            className={`caption-tab ${activeTab === 'captions' ? 'active' : ''}`}
            onClick={() => setActiveTab('captions')}
          >
            <Type size={14} />
            {t('captions.title')}
          </button>
          <button
            className={`caption-tab ${activeTab === 'style' ? 'active' : ''}`}
            onClick={() => setActiveTab('style')}
          >
            <Palette size={14} />
            {t('captions.style')}
          </button>
        </div>
        <button
          className={`caption-toggle ${showCaptions ? 'active' : ''}`}
          onClick={handleToggleCaptions}
          title={showCaptions ? t('captions.hide') : t('captions.show')}
        >
          {showCaptions ? <Eye size={16} /> : <EyeOff size={16} />}
        </button>
      </div>

      {/* Captions Tab */}
      {activeTab === 'captions' && (
        <div className="captions-content">
          {/* Action Buttons */}
          <div className="caption-actions">
            <button className="add-caption-btn" onClick={handleAddCaption}>
              <Plus size={16} />
              {t('captions.addAt')} {formatTime(currentTimeMs)}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".srt,.vtt"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
            <button
              className="upload-caption-btn"
              onClick={() => fileInputRef.current?.click()}
              title={t('captions.uploadHint')}
            >
              <Upload size={16} />
              {t('captions.import')}
            </button>
          </div>
          <p className="caption-alignment-note">
            {lang === 'ru'
              ? 'Точная синхронизация добавляется вместе с созданным голосом. Для другого файла импортируйте SRT или VTT.'
              : 'Exact timing arrives with generated voice. Import SRT or VTT for other media.'}
          </p>

          {/* Captions List */}
          <div className="captions-list">
            {captions.length === 0 ? (
              <div className="captions-empty">
                <FileText size={32} />
                <p>{t('captions.empty')}</p>
                <span>{t('captions.emptyHint')}</span>
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
                      className={`caption-item ${isCurrent ? 'current' : ''}`}
                    >
                      <div className="caption-timing">
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
                          className="time-input"
                        />
                        <span className="time-separator">→</span>
                        <input
                          type="text"
                          value={formatTime(caption.endMs)}
                          onChange={e => {
                            handleUpdateCaption(index, {
                              endMs: parseTime(e.target.value),
                            })
                          }}
                          className="time-input"
                        />
                      </div>
                      <textarea
                        value={caption.text}
                        onChange={e =>
                          handleUpdateCaption(index, { text: e.target.value })
                        }
                        className="caption-text"
                        rows={2}
                      />
                      <button
                        className="caption-delete"
                        onClick={() => handleDeleteCaption(index)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )
                })
            )}
          </div>
        </div>
      )}

      {/* Style Tab */}
      {activeTab === 'style' && (
        <div className="captions-style">
          <div className="style-section">
            <h4 className="style-section-title">{t('captions.text')}</h4>
            <div className="style-row">
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
            <div className="style-row">
              <label>{t('captions.fontWeight')}</label>
              <select
                value={captionStyle.fontWeight || 700}
                onChange={e =>
                  handleStyleChange('fontWeight', Number(e.target.value))
                }
              >
                <option value={400}>{t('font.regular')}</option>
                <option value={500}>{t('font.medium')}</option>
                <option value={600}>{t('font.semibold')}</option>
                <option value={700}>{t('font.bold')}</option>
                <option value={800}>{t('font.extrabold')}</option>
              </select>
            </div>
            <div className="style-row font-selector-row">
              <label>
                {t('captions.font')} ({UNIQUE_FONTS.length})
              </label>
              <div className="font-selector" ref={fontDropdownRef}>
                <button
                  className="font-selector-button"
                  onClick={() => setShowFontDropdown(!showFontDropdown)}
                >
                  <span className="font-name">{currentFont.name}</span>
                  <ChevronDown size={14} />
                </button>
                {showFontDropdown && (
                  <div className="font-dropdown">
                    <div className="font-search-wrapper">
                      <Search size={14} />
                      <input
                        type="text"
                        placeholder={t('captions.searchFonts')}
                        value={fontSearch}
                        onChange={e => setFontSearch(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <div className="font-dropdown-list">
                      {!fontSearch && (
                        <>
                          <div className="font-category">
                            {t('captions.popular')}
                          </div>
                          {POPULAR_FONTS.map((font: CyrillicFont) => (
                            <button
                              key={font.id}
                              className={`font-option ${currentFontId === font.id ? 'selected' : ''}`}
                              onClick={() => handleFontSelect(font.id)}
                            >
                              <span
                                className="font-option-name"
                                style={{ fontFamily: font.name }}
                              >
                                {font.name}
                              </span>
                              <span
                                className="font-option-preview"
                                style={{ fontFamily: font.name }}
                              >
                                {t('captions.previewText')}
                              </span>
                            </button>
                          ))}
                          <div className="font-category">
                            {t('captions.allFonts')}
                          </div>
                        </>
                      )}
                      {filteredFonts
                        .filter(
                          (f: CyrillicFont) =>
                            fontSearch ||
                            !POPULAR_FONTS.find(
                              (p: CyrillicFont) => p.id === f.id
                            )
                        )
                        .map((font: CyrillicFont) => (
                          <button
                            key={font.id}
                            className={`font-option ${currentFontId === font.id ? 'selected' : ''}`}
                            onClick={() => handleFontSelect(font.id)}
                          >
                            <span
                              className="font-option-name"
                              style={{ fontFamily: font.name }}
                            >
                              {font.name}
                            </span>
                            <span className="font-option-category">
                              {font.category}
                            </span>
                          </button>
                        ))}
                      {filteredFonts.length === 0 && (
                        <div className="font-no-results">
                          {t('captions.noFonts')}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="style-section">
            <h4 className="style-section-title">{t('captions.colors')}</h4>
            <div className="style-row">
              <label>{t('captions.textColor')}</label>
              <input
                type="color"
                value={toHexColor(captionStyle.textColor, '#ffffff')}
                onChange={e => handleStyleChange('textColor', e.target.value)}
              />
            </div>
            <div className="style-row">
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
            <div className="style-row">
              <label>{t('captions.background')}</label>
              <input
                type="color"
                value={toHexColor(captionStyle.backgroundColor, '#000000')}
                onChange={e =>
                  handleStyleChange('backgroundColor', e.target.value + '99')
                }
              />
            </div>
          </div>

          <div className="style-section">
            <h4 className="style-section-title">{t('captions.position')}</h4>
            <div className="style-row">
              <label>{t('captions.bottomPercent')}</label>
              <input
                type="number"
                value={captionStyle.bottomPercent || 20}
                onChange={e =>
                  handleStyleChange('bottomPercent', Number(e.target.value))
                }
                min={5}
                max={50}
              />
            </div>
            <div className="style-row">
              <label>{t('captions.maxWidth')}</label>
              <input
                type="number"
                value={captionStyle.maxWidthPercent || 85}
                onChange={e =>
                  handleStyleChange('maxWidthPercent', Number(e.target.value))
                }
                min={50}
                max={100}
              />
            </div>
          </div>

          <div className="style-section">
            <h4 className="style-section-title">{t('captions.effects')}</h4>
            <div className="style-row checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={captionStyle.showShadow ?? true}
                  onChange={e =>
                    handleStyleChange('showShadow', e.target.checked)
                  }
                />
                {t('captions.textShadow')}
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Current Caption Preview */}
      {currentCaption && showCaptions && (
        <div className="caption-preview">
          <span className="preview-label">{t('captions.current')}:</span>
          <span className="preview-text">{currentCaption.text}</span>
        </div>
      )}
    </div>
  )
}
