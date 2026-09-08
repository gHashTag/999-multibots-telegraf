// Script Page - AI Script Generator (Scenario)
// Generates voiceover, cover prompt, b-roll JSON, and platform captions from a single topic

import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { Header } from '@/components/Header'
import { AiPipelineNav } from '@/components/AI/AiPipelineNav'
import { ScriptPreview } from '@/components/ScriptPreview'
import { ScriptProgress } from '@/components/ScriptProgress'
import { useLanguage } from '@/hooks/useLanguage'
import { RateLimiter } from '@/lib/rateLimiter'
import {
  Sparkles,
  Loader2,
  Copy,
  ChevronUp,
  ChevronDown,
  Check,
  ChevronRight,
  Mic,
  MicOff,
  Image,
  Film,
  MessageSquare,
  AlertCircle,
  History,
  Trash2,
  Lightbulb,
  X,
  Clock,
  Bookmark,
  Plus,
  Edit3,
  Save,
  RotateCcw,
  FileText,
} from 'lucide-react'
import {
  scriptInputAtom,
  scriptDataAtom,
  isGeneratingScriptAtom,
  scriptErrorAtom,
  scriptHistoryAtom,
  generateScriptAtom,
  useVoiceoverInAvatarAtom,
  useCoverInImageAtom,
  useBrollInVideoAtom,
  clearScriptAtom,
  loadScriptFromHistoryAtom,
  scriptTemplatesAtom,
  saveTemplateAtom,
  loadTemplateAtom,
  deleteScriptTemplateAtom,
  NICHE_OPTIONS,
  STYLE_OPTIONS,
  DURATION_OPTIONS,
  PLATFORM_LIMITS,
  type ScriptOutputTab,
  type ScriptNiche,
  type ScriptStyle,
  type ScriptDuration,
  type Platform,
} from '@/atoms'
import './Script.css'

// Rate limiter configuration
const RATE_LIMIT_KEY = 'script-generation'
const RATE_LIMIT_MAX_REQUESTS = 10
const RATE_LIMIT_WINDOW_MS = 60 * 1000 // 1 minute

// Output tab configuration
const OUTPUT_TABS: {
  id: ScriptOutputTab
  labelRu: string
  labelEn: string
  icon: typeof Mic
}[] = [
  { id: 'voiceover', labelRu: 'Озвучка', labelEn: 'Voiceover', icon: Mic },
  { id: 'cover', labelRu: 'Обложка', labelEn: 'Cover', icon: Image },
  { id: 'broll', labelRu: 'B-Roll', labelEn: 'B-Roll', icon: Film },
  {
    id: 'captions',
    labelRu: 'Посты',
    labelEn: 'Captions',
    icon: MessageSquare,
  },
]

// Platform configuration
const PLATFORM_CONFIG: { id: Platform; label: string; emoji: string }[] = [
  { id: 'instagram', label: 'Instagram', emoji: '📸' },
  { id: 'tiktok', label: 'TikTok', emoji: '🎵' },
  { id: 'youtube', label: 'YouTube', emoji: '📺' },
  { id: 'telegram', label: 'Telegram', emoji: '📨' },
]

function ScriptContent() {
  const { lang } = useLanguage()
  const navigate = useNavigate()

  // Atoms
  const [input, setInput] = useAtom(scriptInputAtom)
  const data = useAtomValue(scriptDataAtom)
  const isGenerating = useAtomValue(isGeneratingScriptAtom)
  const error = useAtomValue(scriptErrorAtom)
  const history = useAtomValue(scriptHistoryAtom)
  const generate = useSetAtom(generateScriptAtom)
  const prefillVoiceover = useSetAtom(useVoiceoverInAvatarAtom)
  const prefillCover = useSetAtom(useCoverInImageAtom)
  const prefillBrollQueue = useSetAtom(useBrollInVideoAtom)
  const clearScript = useSetAtom(clearScriptAtom)
  const loadFromHistory = useSetAtom(loadScriptFromHistoryAtom)
  const templates = useAtomValue(scriptTemplatesAtom)
  const saveTemplate = useSetAtom(saveTemplateAtom)
  const loadTemplate = useSetAtom(loadTemplateAtom)
  const deleteTemplate = useSetAtom(deleteScriptTemplateAtom)

  // Local state
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [selectedPlatform, setSelectedPlatform] =
    useState<Platform>('instagram')
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const [showTemplates, setShowTemplates] = useState(false)
  const [newTemplateName, setNewTemplateName] = useState('')
  const [isEditingVoiceover, setIsEditingVoiceover] = useState(false)
  const [editedVoiceover, setEditedVoiceover] = useState('')
  // Mobile bottom sheet with the input form. Open while there is nothing to
  // show yet (the form IS the invitation), closed once a script exists so the
  // result is what the person sees; desktop ignores the class.
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(
    () => !data?.output
  )
  useEffect(() => {
    if (data?.output) setIsSidebarExpanded(false)
  }, [data?.output])

  // Calculate estimated duration from word count (average 130 words per minute)
  const estimateDuration = useCallback(
    (wordCount: number) => {
      const minutes = wordCount / 130
      const seconds = Math.round(minutes * 60)
      if (seconds < 60) {
        return `~${seconds}${lang === 'ru' ? ' сек' : 's'}`
      }
      const mins = Math.floor(seconds / 60)
      const secs = seconds % 60
      return `~${mins}:${secs.toString().padStart(2, '0')}`
    },
    [lang]
  )

  // Copy to clipboard
  const copyToClipboard = useCallback(async (text: string, field: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }, [])

  // Handle generate
  const handleGenerate = useCallback(() => {
    if (!isGenerating && input.topic.trim()) {
      // Check rate limit using static method
      if (
        !RateLimiter.checkLimit(
          RATE_LIMIT_KEY,
          RATE_LIMIT_MAX_REQUESTS,
          RATE_LIMIT_WINDOW_MS
        )
      ) {
        const timeUntil = RateLimiter.getTimeUntilNextRequest(
          RATE_LIMIT_KEY,
          RATE_LIMIT_MAX_REQUESTS,
          RATE_LIMIT_WINDOW_MS
        )
        const seconds = Math.ceil(timeUntil / 1000)
        const message =
          lang === 'ru'
            ? `Слишком много запросов. Подождите ${seconds} секунд.`
            : `Too many requests. Please wait ${seconds} seconds.`
        alert(message)
        return
      }

      generate()
    }
  }, [generate, isGenerating, input.topic, lang])

  // Keyboard shortcut: Cmd/Ctrl + Enter to generate
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + Enter - Generate
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        handleGenerate()
      }

      // Ctrl/Cmd + 1-4 переключал вкладки вывода. Вкладок больше нет —
      // все четыре выхода видны сразу, и сочетание стало бы обещанием
      // действия, которого не происходит.
      // Ctrl/Cmd + K - Clear script
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        clearScript()
      }

      // Ctrl/Cmd + C - Copy current tab content (when focused on output)
      if ((e.metaKey || e.ctrlKey) && e.key === 'c' && data?.output) {
        // Let default copy work, but we could add custom behavior here
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleGenerate, clearScript, data])

  // Voice input using Web Speech API
  const toggleVoiceInput = useCallback(() => {
    if (
      !('webkitSpeechRecognition' in window) &&
      !('SpeechRecognition' in window)
    ) {
      alert(
        lang === 'ru'
          ? 'Голосовой ввод не поддерживается в этом браузере'
          : 'Voice input is not supported in this browser'
      )
      return
    }

    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      return
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SpeechRecognition()
    recognitionRef.current = recognition

    recognition.lang = input.language === 'ru' ? 'ru-RU' : 'en-US'
    recognition.continuous = false
    recognition.interimResults = true

    recognition.onstart = () => setIsListening(true)
    recognition.onend = () => setIsListening(false)
    recognition.onerror = () => setIsListening(false)

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = Array.from(event.results)
        .map(result => result[0].transcript)
        .join('')

      if (event.results[0].isFinal) {
        setInput(prev => ({
          ...prev,
          topic: prev.topic + (prev.topic ? ' ' : '') + transcript,
        }))
      }
    }

    recognition.start()
  }, [isListening, input.language, lang, setInput])

  // Save current settings as template
  const handleSaveTemplate = useCallback(() => {
    if (!newTemplateName.trim()) return
    saveTemplate(newTemplateName.trim())
    setNewTemplateName('')
    setShowTemplates(false)
  }, [newTemplateName, saveTemplate])

  // Navigate to Audio with voiceover text (first step for avatar workflow)
  const handleUseInAvatar = useCallback(() => {
    prefillVoiceover()
    navigate('/generate/audio')
  }, [prefillVoiceover, navigate])

  // Navigate to Image with cover prompt
  const handleUseInImage = useCallback(() => {
    prefillCover()
    navigate('/generate/image')
  }, [prefillCover, navigate])

  // Navigate to Video with the complete B-Roll prompt queue.
  const handleUseBrollInVideo = useCallback(() => {
    prefillBrollQueue()
    navigate('/generate/video')
  }, [prefillBrollQueue, navigate])

  // Start editing voiceover
  const handleStartEditVoiceover = useCallback(() => {
    if (data?.output?.voiceover) {
      setEditedVoiceover(data.output.voiceover)
      setIsEditingVoiceover(true)
    }
  }, [data])

  // Save edited voiceover (updates the local display only)
  const handleSaveVoiceover = useCallback(() => {
    setIsEditingVoiceover(false)
    // Note: editedVoiceover is kept in local state for copying/using
  }, [])

  // Cancel editing voiceover
  const handleCancelEditVoiceover = useCallback(() => {
    setIsEditingVoiceover(false)
    setEditedVoiceover('')
  }, [])

  // Get current voiceover text (edited or original)
  const getCurrentVoiceover = useCallback(() => {
    if (editedVoiceover && !isEditingVoiceover) {
      return editedVoiceover
    }
    return data?.output?.voiceover || ''
  }, [editedVoiceover, isEditingVoiceover, data])

  // Copy all sections
  const handleCopyAll = useCallback(async () => {
    if (!data?.output) return
    const output = data.output
    const caption = output.captions['instagram']

    const fullScript = `
📝 VOICEOVER
${getCurrentVoiceover()}

🖼️ COVER PROMPT
${output.coverPrompt}

🎬 B-ROLL
${output.broll.map((b, i) => `${i + 1}. [${b.startSec}s-${b.endSec}s] ${b.prompt}`).join('\n')}

📱 CAPTION (Instagram)
${caption?.text || ''}
${caption?.hashtags?.join(' ') || ''}
`.trim()

    await copyToClipboard(fullScript, 'all')
  }, [data, getCurrentVoiceover, copyToClipboard])

  // Get label based on language
  const getLabel = (item: { labelRu: string; labelEn: string }) =>
    lang === 'ru' ? item.labelRu : item.labelEn

  // Render output content based on tab
  const renderOutputContent = () => {
    // Show progress indicator during generation
    if (isGenerating) {
      return <ScriptProgress lang={lang} />
    }

    if (!data?.output) {
      return (
        <div className="script-output-empty">
          <Sparkles size={48} />
          <p>
            {lang === 'ru'
              ? 'Опишите тему видео — получите сценарий, озвучку, обложку и посты'
              : 'Describe the video topic to get a script, voiceover, cover and posts'}
          </p>
          <button
            type="button"
            className="script-output-cta"
            onClick={() => setIsSidebarExpanded(true)}
          >
            <Sparkles size={16} />
            {lang === 'ru' ? 'Написать тему' : 'Write a topic'}
          </button>
        </div>
      )
    }

    const { output } = data

    // Current voiceover text (may be edited)
    const voiceoverText = getCurrentVoiceover()
    const currentWordCount = voiceoverText.split(/\s+/).filter(Boolean).length

    /*
     * ЧЕТЫРЕ ВЫВОДА — ЧЕТЫРЕ СЕКЦИИ, А НЕ ЧЕТЫРЕ ВКЛАДКИ.
     *
     * Второй ряд вкладок прятал три четверти уже готового результата за
     * клики и притворялся навигацией того же ранга, что и виды генерации.
     * Ранг у него другой: озвучка, обложка, B-Roll и посты — это ВЫХОДЫ
     * одного нажатия, а не разделы.
     *
     * Тела кейсов оставлены нетронутыми намеренно: два из них заводят
     * собственные `const` (`brollSegments`, `caption`), и разрезание switch
     * на четыре куска столкнуло бы имена. Дешевле и безопаснее вызвать одну
     * функцию четырежды.
     */
    const одинВывод = (tab: ScriptOutputTab) => {
      switch (tab) {
        case 'voiceover':
          return (
            <div className="script-output-section">
              <div className="script-output-header">
                <h3>
                  {lang === 'ru' ? 'Текст для озвучки' : 'Voiceover Script'}
                </h3>
                <div className="script-header-badges">
                  <span className="script-word-count">
                    {currentWordCount} {lang === 'ru' ? 'слов' : 'words'}
                  </span>
                  <span className="script-duration-badge">
                    <Clock size={12} />
                    {estimateDuration(currentWordCount)}
                  </span>
                </div>
              </div>
              <div className="script-output-content">
                {isEditingVoiceover ? (
                  <textarea
                    className="script-voiceover-edit"
                    value={editedVoiceover}
                    onChange={e => setEditedVoiceover(e.target.value)}
                    autoFocus
                  />
                ) : (
                  <pre className="script-voiceover-text">{voiceoverText}</pre>
                )}
              </div>
              <div className="script-output-actions">
                {isEditingVoiceover ? (
                  <>
                    <button
                      className="script-action-btn"
                      onClick={handleCancelEditVoiceover}
                    >
                      <RotateCcw size={16} />
                      {lang === 'ru' ? 'Отмена' : 'Cancel'}
                    </button>
                    <button
                      className="script-action-btn primary"
                      onClick={handleSaveVoiceover}
                    >
                      <Save size={16} />
                      {lang === 'ru' ? 'Сохранить' : 'Save'}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="script-action-btn"
                      onClick={handleStartEditVoiceover}
                    >
                      <Edit3 size={16} />
                      {lang === 'ru' ? 'Редактировать' : 'Edit'}
                    </button>
                    <button
                      className="script-action-btn"
                      onClick={() =>
                        copyToClipboard(voiceoverText, 'voiceover')
                      }
                    >
                      {copiedField === 'voiceover' ? (
                        <Check size={16} />
                      ) : (
                        <Copy size={16} />
                      )}
                      {copiedField === 'voiceover'
                        ? lang === 'ru'
                          ? 'Скопировано'
                          : 'Copied'
                        : lang === 'ru'
                          ? 'Копировать'
                          : 'Copy'}
                    </button>
                    <button
                      className="script-action-btn primary"
                      onClick={handleUseInAvatar}
                    >
                      <ChevronRight size={16} />
                      {lang === 'ru' ? 'Озвучить' : 'Generate Audio'}
                    </button>
                  </>
                )}
              </div>
            </div>
          )

        case 'cover':
          return (
            <div className="script-output-section">
              <div className="script-output-header">
                <h3>{lang === 'ru' ? 'Промпт для обложки' : 'Cover Prompt'}</h3>
              </div>
              <div className="script-output-content">
                <pre className="script-cover-prompt">{output.coverPrompt}</pre>
              </div>
              <div className="script-output-actions">
                <button
                  className="script-action-btn"
                  onClick={() => copyToClipboard(output.coverPrompt, 'cover')}
                >
                  {copiedField === 'cover' ? (
                    <Check size={16} />
                  ) : (
                    <Copy size={16} />
                  )}
                  {copiedField === 'cover'
                    ? lang === 'ru'
                      ? 'Скопировано'
                      : 'Copied'
                    : lang === 'ru'
                      ? 'Копировать'
                      : 'Copy'}
                </button>
                <button
                  className="script-action-btn primary"
                  onClick={handleUseInImage}
                >
                  <ChevronRight size={16} />
                  {lang === 'ru' ? 'Сгенерировать' : 'Generate Image'}
                </button>
              </div>
            </div>
          )

        case 'broll': {
          // Safely get broll array
          const brollSegments = Array.isArray(output.broll) ? output.broll : []
          return (
            <div className="script-output-section">
              <div className="script-output-header">
                <h3>{lang === 'ru' ? 'B-Roll сегменты' : 'B-Roll Segments'}</h3>
                <span className="script-segment-count">
                  {brollSegments.length} {lang === 'ru' ? 'клипов' : 'clips'}
                </span>
              </div>
              {brollSegments.length === 0 ? (
                <div className="script-output-empty-section">
                  <Film size={32} />
                  <p>
                    {lang === 'ru'
                      ? 'B-Roll сегменты не сгенерированы'
                      : 'No B-Roll segments generated'}
                  </p>
                </div>
              ) : (
                <div className="script-broll-list">
                  {brollSegments.map((segment, index) => (
                    <div key={index} className="script-broll-item">
                      <div className="script-broll-timing">
                        {segment.startSec ?? 0}s - {segment.endSec ?? 5}s
                      </div>
                      <div className="script-broll-prompt">
                        {segment.prompt || ''}
                      </div>
                      <div className="script-broll-keywords">
                        {(segment.keywords || []).map((kw, i) => (
                          <span key={i} className="script-keyword">
                            {kw}
                          </span>
                        ))}
                      </div>
                      <button
                        className="script-broll-copy"
                        onClick={() =>
                          copyToClipboard(
                            segment.prompt || '',
                            `broll-${index}`
                          )
                        }
                      >
                        {copiedField === `broll-${index}` ? (
                          <Check size={14} />
                        ) : (
                          <Copy size={14} />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="script-output-actions">
                <button
                  className="script-action-btn"
                  onClick={() =>
                    copyToClipboard(
                      JSON.stringify(brollSegments, null, 2),
                      'broll-json'
                    )
                  }
                  disabled={brollSegments.length === 0}
                >
                  {copiedField === 'broll-json' ? (
                    <Check size={16} />
                  ) : (
                    <Copy size={16} />
                  )}
                  {lang === 'ru' ? 'Копировать JSON' : 'Copy JSON'}
                </button>
                <button
                  className="script-action-btn primary"
                  onClick={handleUseBrollInVideo}
                  disabled={brollSegments.length === 0}
                >
                  <ChevronRight size={16} />
                  {lang === 'ru' ? 'Сгенерировать видео' : 'Generate Video'}
                </button>
              </div>
            </div>
          )
        }

        case 'captions': {
          const caption = output.captions?.[selectedPlatform]
          const captionText = caption?.text || ''
          const captionHashtags = Array.isArray(caption?.hashtags)
            ? caption.hashtags
            : []
          const captionLimit =
            caption?.charLimit || PLATFORM_LIMITS[selectedPlatform]
          return (
            <div className="script-output-section">
              <div className="script-platform-tabs">
                {PLATFORM_CONFIG.map(platform => (
                  <button
                    key={platform.id}
                    className={`script-platform-tab ${selectedPlatform === platform.id ? 'active' : ''}`}
                    onClick={() => setSelectedPlatform(platform.id)}
                  >
                    <span>{platform.emoji}</span>
                    <span>{platform.label}</span>
                  </button>
                ))}
              </div>
              {captionText ? (
                <>
                  <div className="script-output-content">
                    <pre className="script-caption-text">{captionText}</pre>
                    {captionHashtags.length > 0 && (
                      <div className="script-hashtags">
                        {captionHashtags.map((tag, i) => (
                          <span key={i} className="script-hashtag">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="script-caption-meta">
                    <span
                      className={
                        captionText.length > captionLimit ? 'over-limit' : ''
                      }
                    >
                      {captionText.length}/{captionLimit}
                    </span>
                  </div>
                  <div className="script-output-actions">
                    <button
                      className="script-action-btn"
                      onClick={() =>
                        copyToClipboard(
                          captionHashtags.length > 0
                            ? `${captionText}\n\n${captionHashtags.join(' ')}`
                            : captionText,
                          `caption-${selectedPlatform}`
                        )
                      }
                    >
                      {copiedField === `caption-${selectedPlatform}` ? (
                        <Check size={16} />
                      ) : (
                        <Copy size={16} />
                      )}
                      {lang === 'ru'
                        ? 'Копировать с хештегами'
                        : 'Copy with hashtags'}
                    </button>
                  </div>
                </>
              ) : (
                <div className="script-output-empty-section">
                  <MessageSquare size={32} />
                  <p>
                    {lang === 'ru'
                      ? 'Пост не сгенерирован'
                      : 'Caption not generated'}
                  </p>
                </div>
              )}
            </div>
          )
        }

        default:
          return null
      }
    }

    return (
      <>
        {OUTPUT_TABS.map(t => (
          <section key={t.id} className="script-output-block">
            <h4 className="script-output-block-title">
              <t.icon size={15} />
              {lang === 'ru' ? t.labelRu : t.labelEn}
            </h4>
            {одинВывод(t.id)}
          </section>
        ))}
      </>
    )
  }

  return (
    <div className="script-page">
      <Header />
      <AiPipelineNav />

      <main className="script-main">
        {/* Left: Input Panel */}
        <aside
          className={`script-sidebar ${isSidebarExpanded ? 'expanded' : ''}`}
          onClick={() => {
            // A tap on the collapsed peek opens the sheet; taps inside the
            // open form (chips, fields) must never close it.
            if (!isSidebarExpanded) setIsSidebarExpanded(true)
          }}
        >
          <div className="script-panel">
            <button
              type="button"
              className="script-sheet-handle"
              aria-expanded={isSidebarExpanded}
              onClick={e => {
                e.stopPropagation()
                setIsSidebarExpanded(v => !v)
              }}
            >
              <span>
                {lang === 'ru' ? 'Создать сценарий' : 'Create a script'}
              </span>
              {isSidebarExpanded ? (
                <ChevronDown size={18} />
              ) : (
                <ChevronUp size={18} />
              )}
            </button>
            <h2 className="script-panel-title">
              {lang === 'ru' ? 'Сценарий' : 'Script'}
            </h2>
            <p className="script-panel-subtitle">
              {lang === 'ru'
                ? 'Текст — основа всех генераций'
                : 'Text is the foundation of all generations'}
            </p>

            {/* Topic */}
            <div className="script-field">
              <label>{lang === 'ru' ? 'Тема видео' : 'Video Topic'}</label>
              <div className="script-textarea-wrapper">
                <textarea
                  className="script-textarea"
                  value={input.topic}
                  onChange={e => setInput({ ...input, topic: e.target.value })}
                  placeholder={
                    lang === 'ru'
                      ? 'Например: 5 способов заработать на крипте в 2025'
                      : 'E.g.: 5 ways to earn with crypto in 2025'
                  }
                  rows={3}
                />
                <button
                  type="button"
                  className={`script-voice-btn ${isListening ? 'listening' : ''}`}
                  onClick={toggleVoiceInput}
                  title={lang === 'ru' ? 'Голосовой ввод' : 'Voice input'}
                >
                  {isListening ? <MicOff size={16} /> : <Mic size={16} />}
                </button>
              </div>
            </div>

            {/* Niche */}
            <div className="script-field">
              <label>{lang === 'ru' ? 'Ниша' : 'Niche'}</label>
              <select
                className="script-select"
                value={input.niche}
                onChange={e =>
                  setInput({ ...input, niche: e.target.value as ScriptNiche })
                }
              >
                {NICHE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.emoji} {getLabel(opt)}
                  </option>
                ))}
              </select>
            </div>

            {/* Style */}
            <div className="script-field">
              <label>{lang === 'ru' ? 'Стиль' : 'Style'}</label>
              <div className="script-chips">
                {STYLE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    className={`script-chip ${input.style === opt.value ? 'active' : ''}`}
                    onClick={() =>
                      setInput({ ...input, style: opt.value as ScriptStyle })
                    }
                  >
                    {opt.emoji} {getLabel(opt)}
                  </button>
                ))}
              </div>
            </div>

            {/* Duration */}
            <div className="script-field">
              <label>{lang === 'ru' ? 'Длительность' : 'Duration'}</label>
              <div className="script-chips">
                {DURATION_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    className={`script-chip ${input.duration === opt.value ? 'active' : ''}`}
                    onClick={() =>
                      setInput({
                        ...input,
                        duration: opt.value as ScriptDuration,
                      })
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Language */}
            <div className="script-field">
              <label>
                {lang === 'ru' ? 'Язык сценария' : 'Script Language'}
              </label>
              <div className="script-chips">
                <button
                  className={`script-chip ${input.language === 'ru' ? 'active' : ''}`}
                  onClick={() => setInput({ ...input, language: 'ru' })}
                >
                  🇷🇺 {lang === 'ru' ? 'Русский' : 'Russian'}
                </button>
                <button
                  className={`script-chip ${input.language === 'en' ? 'active' : ''}`}
                  onClick={() => setInput({ ...input, language: 'en' })}
                >
                  🇺🇸 {lang === 'ru' ? 'Английский' : 'English'}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="script-error">
                <AlertCircle size={16} />
                {error}
              </div>
            )}

            {/* Generate Button */}
            <button
              className="script-generate-btn"
              onClick={handleGenerate}
              disabled={isGenerating || !input.topic.trim()}
              title={lang === 'ru' ? '⌘/Ctrl + Enter' : '⌘/Ctrl + Enter'}
              aria-label={
                lang === 'ru' ? 'Сгенерировать скрипт' : 'Generate script'
              }
              aria-busy={isGenerating}
            >
              {isGenerating ? (
                <>
                  <Loader2 size={18} className="spinning" />
                  {lang === 'ru' ? 'Генерация...' : 'Generating...'}
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  {lang === 'ru' ? 'Генерировать' : 'Generate'}
                  <span className="script-shortcut">⌘↵</span>
                </>
              )}
            </button>

            {/* History Toggle */}
            {history.length > 0 && (
              <button
                className="script-history-toggle"
                onClick={() => setShowHistory(!showHistory)}
              >
                <History size={16} />
                {lang === 'ru'
                  ? `История (${history.length})`
                  : `History (${history.length})`}
              </button>
            )}

            {/* Preview */}
            {input.topic.trim() && !data && !isGenerating && (
              <ScriptPreview input={input} lang={lang} />
            )}

            {/* Keyboard Shortcuts Hint */}
            <div className="script-shortcuts-hint">
              <span className="script-shortcuts-title">
                {lang === 'ru' ? 'Горячие клавиши:' : 'Shortcuts:'}
              </span>
              <div className="script-shortcuts-list">
                <span>
                  <kbd>⌘</kbd>+<kbd>↵</kbd>{' '}
                  {lang === 'ru' ? 'Генерировать' : 'Generate'}
                </span>
                <span>
                  <kbd>⌘</kbd>+<kbd>1-4</kbd>{' '}
                  {lang === 'ru' ? 'Переключить вкладки' : 'Switch tabs'}
                </span>
                <span>
                  <kbd>⌘</kbd>+<kbd>K</kbd>{' '}
                  {lang === 'ru' ? 'Очистить' : 'Clear'}
                </span>
              </div>
            </div>

            {/* Clear Button */}
            {data && (
              <button className="script-clear-btn" onClick={clearScript}>
                <Trash2 size={16} />
                {lang === 'ru' ? 'Очистить' : 'Clear'}
              </button>
            )}

            {/* Prompt Tips */}
            <div className="script-tips">
              <div className="script-tips-header">
                <Lightbulb size={14} />
                <span>{lang === 'ru' ? 'Советы' : 'Tips'}</span>
              </div>
              <ul className="script-tips-list">
                <li>
                  {lang === 'ru'
                    ? 'Hook в первые 1-3 сек'
                    : 'Hook in first 1-3 sec'}
                </li>
                <li>
                  {lang === 'ru'
                    ? '3 ключевых пункта + CTA'
                    : '3 key points + CTA'}
                </li>
                <li>
                  {lang === 'ru'
                    ? '60-120 слов для 30 сек'
                    : '60-120 words for 30 sec'}
                </li>
                <li>
                  {lang === 'ru'
                    ? 'Смена кадра каждые 3-5 сек'
                    : 'Cut every 3-5 sec'}
                </li>
              </ul>
            </div>

            {/* Templates Toggle */}
            <button
              className="script-templates-toggle"
              onClick={() => setShowTemplates(!showTemplates)}
            >
              <Bookmark size={16} />
              {lang === 'ru'
                ? `Шаблоны (${templates.length})`
                : `Templates (${templates.length})`}
            </button>
          </div>

          {/* Templates Panel */}
          {showTemplates && (
            <div className="script-templates-panel">
              <div className="script-templates-header">
                <h3>{lang === 'ru' ? 'Мои шаблоны' : 'My Templates'}</h3>
                <button
                  className="script-templates-close"
                  onClick={() => setShowTemplates(false)}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Save new template */}
              <div className="script-template-save">
                <input
                  type="text"
                  className="script-template-input"
                  value={newTemplateName}
                  onChange={e => setNewTemplateName(e.target.value)}
                  placeholder={
                    lang === 'ru' ? 'Название шаблона...' : 'Template name...'
                  }
                  onKeyDown={e => e.key === 'Enter' && handleSaveTemplate()}
                />
                <button
                  className="script-template-save-btn"
                  onClick={handleSaveTemplate}
                  disabled={!newTemplateName.trim()}
                >
                  <Plus size={16} />
                </button>
              </div>

              {/* Template list */}
              <div className="script-templates-list">
                {templates.length === 0 ? (
                  <div className="script-templates-empty">
                    {lang === 'ru'
                      ? 'Нет сохранённых шаблонов'
                      : 'No saved templates'}
                  </div>
                ) : (
                  templates.map(template => (
                    <div key={template.id} className="script-template-item">
                      <button
                        className="script-template-load"
                        onClick={() => {
                          loadTemplate(template.id)
                          setShowTemplates(false)
                        }}
                      >
                        <span className="script-template-name">
                          {template.name}
                        </span>
                        <span className="script-template-meta">
                          {
                            NICHE_OPTIONS.find(n => n.value === template.niche)
                              ?.emoji
                          }{' '}
                          {
                            STYLE_OPTIONS.find(s => s.value === template.style)
                              ?.emoji
                          }{' '}
                          {template.duration}s
                        </span>
                      </button>
                      <button
                        className="script-template-delete"
                        onClick={() => deleteTemplate(template.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* History Panel */}
          {showHistory && history.length > 0 && (
            <div className="script-history-panel">
              <div className="script-history-header">
                <h3>
                  {lang === 'ru' ? 'История генераций' : 'Generation History'}
                </h3>
                <button
                  className="script-history-close"
                  onClick={() => setShowHistory(false)}
                >
                  <X size={16} />
                </button>
              </div>
              <div className="script-history-list">
                {history.map((item, index) => (
                  <button
                    key={index}
                    className="script-history-item"
                    onClick={() => {
                      loadFromHistory(index)
                      setShowHistory(false)
                    }}
                  >
                    <div className="script-history-topic">
                      {item.input.topic}
                    </div>
                    <div className="script-history-meta">
                      <Clock size={12} />
                      <span>
                        {item.output?.generatedAt
                          ? new Date(
                              item.output.generatedAt
                            ).toLocaleDateString(
                              lang === 'ru' ? 'ru-RU' : 'en-US',
                              {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              }
                            )
                          : '-'}
                      </span>
                      <span className="script-history-niche">
                        {
                          NICHE_OPTIONS.find(n => n.value === item.input.niche)
                            ?.emoji
                        }
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* Right: Output Panel */}
        <section className="script-content">
          {/* Заголовок вывода: ряда вкладок больше нет — четыре выхода
              идут секциями подряд, потому что это выходы одного
              нажатия, а не разделы. Кнопка «копировать всё» осталась. */}
          <div className="script-output-tools">
            {data?.output && (
              <button
                className="script-copy-all-btn"
                onClick={handleCopyAll}
                title={
                  lang === 'ru'
                    ? 'Копировать весь сценарий'
                    : 'Copy full script'
                }
              >
                {copiedField === 'all' ? (
                  <Check size={16} />
                ) : (
                  <FileText size={16} />
                )}
                {copiedField === 'all'
                  ? lang === 'ru'
                    ? 'Скопировано!'
                    : 'Copied!'
                  : lang === 'ru'
                    ? 'Копировать всё'
                    : 'Copy All'}
              </button>
            )}
          </div>

          {/* Output Content */}
          <div
            className="script-output-body"
            // Было role="tabpanel" с id и aria-labelledby на несуществующий
            // теперь таб. Панель, помеченная элементом, которого нет, хуже
            // отсутствующей разметки: скринридер обещает связь и не находит её.
            aria-label={lang === 'ru' ? 'Результат сценария' : 'Script output'}
          >
            {renderOutputContent()}
          </div>
        </section>
      </main>
    </div>
  )
}

export default function ScriptPage() {
  return <ScriptContent />
}
