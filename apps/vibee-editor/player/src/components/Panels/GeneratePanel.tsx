import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useLanguage } from '@/hooks/useLanguage'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'
import {
  Sparkles,
  Loader2,
  Image,
  Video,
  Music,
  Mic,
  AlertCircle,
  Upload,
  Square,
  Trash2,
  RefreshCw,
  GripVertical,
  Plus,
  Share,
} from 'lucide-react'
import {
  generateImage,
  generateImageViaReplicate,
  generateVideo,
  generateAudio,
  generateLipsync,
} from '@/lib/generateApi'
import { uploadToS3 } from '@/lib/s3Upload'
import { addAssetAtom } from '@/atoms/assets'
import type { Asset } from '@vibee/atoms'
import { DEFAULT_WIDTH, DEFAULT_HEIGHT } from '@vibee/atoms'
import { toAbsoluteUrl } from '@/lib/mediaUrl'
import {
  userAtom,
  canRenderAtom,
  showPaywallAtom,
  showLoginModalAtom,
  logRenderAtom,
} from '@/atoms/user'
import { PublishModal } from '../Modals/PublishModal'
import {
  voicesAtom,
  voicesLoadingAtom,
  voicesErrorAtom,
  selectedVoiceAtom,
  fetchVoicesAtom,
  type Voice,
} from '@/atoms/voices'
import {
  generatedResultsAtom,
  addGeneratedResultAtom,
  removeGeneratedResultAtom,
  type GeneratedResult,
  type GenerateTab,
} from '@/atoms/generateResults'
import {
  imagePrefilledPromptAtom,
  avatarPrefilledTextAtom,
  videoPrefilledPromptsAtom,
} from '@/atoms/script'
import {
  avatarPhotosAtom,
  avatarPhotosLoadingAtom,
  avatarPhotosErrorAtom,
  loadAvatarPhotosAtom,
  saveAvatarPhotoAtom,
  deleteAvatarPhotoAtom,
} from '@/atoms/avatarPhotos'
import { useEditorStore } from '@/store/editorStore'
import './GeneratePanel.css'

// Re-export GenerateTab type for use in Editor.tsx
export type { GenerateTab }

interface ImageModel {
  id: string
  name: string
  description: string
}

interface VideoModel {
  id: string
  name: string
  description: string
}

const IMAGE_MODELS: ImageModel[] = [
  // FAL.AI models (require balance)
  {
    id: 'fal-ai/flux-pro/v1.1-ultra',
    name: 'FLUX Ultra',
    description: 'Лучшее качество, 2K',
  },
  {
    id: 'fal-ai/flux/dev',
    name: 'FLUX Dev',
    description: 'Быстро, хорошее качество',
  },
  {
    id: 'fal-ai/nano-banana-pro',
    name: 'Nano Banana Pro',
    description: 'Быстро и экономно',
  },
  {
    id: 'fal-ai/reve/text-to-image',
    name: 'Reve',
    description: 'Художественный стиль',
  },
  // Replicate models (direct API with version hashes)
  // Note: Version hashes retrieved from Replicate API on 2026-02-20
  {
    id: 'replicate:stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc',
    name: 'SDXL',
    description: 'Replicate • обычное',
  },
  {
    id: 'replicate:bytedance/sdxl-lightning-4step:6f7a773af6fc3e8de9d5a3c00be77c17308914bf67772726aff83496ba1e3bbe',
    name: 'SDXL Lightning',
    description: 'Replicate • быстро, 4 шага',
  },
  {
    id: 'replicate:fofr/sdxl-emoji:dee76b5afde21b0f01ed7925f0665b7e879c50ee718c5f78a9d38e04d523cc5e',
    name: 'SDXL Emoji',
    description: 'Replicate • как стикер',
  },
]

const VIDEO_MODELS: VideoModel[] = [
  { id: 'veo3-fast', name: 'Veo3 Fast', description: 'Быстрая генерация' },
  { id: 'veo3-quality', name: 'Veo3 Quality', description: 'Лучшее качество' },
]

const ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3']
const DURATIONS = ['5s', '10s']
const RESOLUTIONS = ['480p', '720p', '1080p']

interface GeneratePanelProps {
  activeTab?: GenerateTab // External control from unified tabs
}

export function GeneratePanel({ activeTab: externalTab }: GeneratePanelProps) {
  const { t } = useLanguage()
  const [internalTab, setInternalTab] = useState<GenerateTab>('image')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Publish modal state
  const [showPublishModal, setShowPublishModal] = useState(false)
  const [publishVideoUrl, setPublishVideoUrl] = useState<string | undefined>()
  const [publishThumbnailUrl, setPublishThumbnailUrl] = useState<
    string | undefined
  >()

  // Use external tab if provided, otherwise use internal state
  const activeTab = externalTab ?? internalTab
  const isControlledExternally = externalTab !== undefined

  // Generated results from Jotai (persisted to localStorage)
  const generatedResults = useAtomValue(generatedResultsAtom)
  const addResult = useSetAtom(addGeneratedResultAtom)
  const removeResult = useSetAtom(removeGeneratedResultAtom)

  // Editor store for adding to timeline
  const addItem = useEditorStore(s => s.addItem)

  // User & balance state
  const user = useAtomValue(userAtom)
  const canRender = useAtomValue(canRenderAtom)
  const setShowPaywall = useSetAtom(showPaywallAtom)
  const setShowLoginModal = useSetAtom(showLoginModalAtom)
  const logRender = useSetAtom(logRenderAtom)
  const addAsset = useSetAtom(addAssetAtom)

  // Image state
  const [imagePrompt, setImagePrompt] = useState('')
  const [imageModel, setImageModel] = useState('fal-ai/nano-banana-pro')
  const [imageAspect, setImageAspect] = useState('16:9')

  // Video state
  const [videoPrompt, setVideoPrompt] = useState('')
  const [videoModel, setVideoModel] = useState('veo3-fast')
  const [videoAspect, setVideoAspect] = useState('9:16')
  const [videoDuration, setVideoDuration] = useState('5s')

  // Audio state
  const [audioText, setAudioText] = useState('')
  const [audioSpeed, setAudioSpeed] = useState(1.0)

  // Voices from Jotai (persisted to localStorage)
  const voices = useAtomValue(voicesAtom)
  const isLoadingVoices = useAtomValue(voicesLoadingAtom)
  const voicesError = useAtomValue(voicesErrorAtom)
  const [audioVoice, setAudioVoice] = useAtom(selectedVoiceAtom)
  const fetchVoices = useSetAtom(fetchVoicesAtom)

  // Load voices from ElevenLabs on mount
  useEffect(() => {
    fetchVoices()
  }, [fetchVoices])

  // Prefill from Script page
  const [imagePrefilledPrompt, setImagePrefilledPrompt] = useAtom(
    imagePrefilledPromptAtom
  )
  const [avatarPrefilledText, setAvatarPrefilledText] = useAtom(
    avatarPrefilledTextAtom
  )

  // Apply prefilled image prompt from Script page
  useEffect(() => {
    if (imagePrefilledPrompt) {
      setImagePrompt(imagePrefilledPrompt)
      setImagePrefilledPrompt(null) // Clear after applying
    }
  }, [imagePrefilledPrompt, setImagePrefilledPrompt])

  // Apply prefilled voiceover text from Script page (for audio generation)
  useEffect(() => {
    if (avatarPrefilledText) {
      setAudioText(avatarPrefilledText)
      setAvatarPrefilledText(null) // Clear after applying
    }
  }, [avatarPrefilledText, setAvatarPrefilledText])

  // Prefilled video prompts from Script page (B-Roll)
  const [videoPrefilledPrompts, setVideoPrefilledPrompts] = useAtom(
    videoPrefilledPromptsAtom
  )

  // Apply prefilled video prompt from Script page (first B-Roll prompt)
  useEffect(() => {
    if (videoPrefilledPrompts && videoPrefilledPrompts.length > 0) {
      setVideoPrompt(videoPrefilledPrompts[0]) // Use first prompt
      setVideoPrefilledPrompts(null) // Clear after applying
    }
  }, [videoPrefilledPrompts, setVideoPrefilledPrompts])

  // Lipsync state
  const [lipsyncAudioUrl, setLipsyncAudioUrl] = useState('')
  const [lipsyncImageUrl, setLipsyncImageUrl] = useState('')
  const [lipsyncResolution, setLipsyncResolution] = useState('720p')
  const [lipsyncAspect, setLipsyncAspect] = useState('9:16')
  const [isUploadingAudio, setIsUploadingAudio] = useState(false)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  // Профиль аватара: сохранённые фото человека. Загружаются один раз при
  // входе на вкладку липсинка — ровно тогда, когда человеку нужно лицо.
  const avatarPhotos = useAtomValue(avatarPhotosAtom)
  const avatarPhotosLoading = useAtomValue(avatarPhotosLoadingAtom)
  const avatarPhotosError = useAtomValue(avatarPhotosErrorAtom)
  const loadAvatarPhotos = useSetAtom(loadAvatarPhotosAtom)
  const saveAvatarPhoto = useSetAtom(saveAvatarPhotoAtom)
  const deleteAvatarPhoto = useSetAtom(deleteAvatarPhotoAtom)
  const [isSavingAvatarPhoto, setIsSavingAvatarPhoto] = useState(false)
  const [avatarPhotoSaved, setAvatarPhotoSaved] = useState(false)
  useEffect(() => {
    if (activeTab === 'lipsync') void loadAvatarPhotos()
  }, [activeTab, loadAvatarPhotos])

  const handleSaveAvatarPhoto = useCallback(async () => {
    if (!lipsyncImageUrl) return
    setIsSavingAvatarPhoto(true)
    setAvatarPhotoSaved(false)
    const ok = await saveAvatarPhoto(lipsyncImageUrl)
    if (ok) setAvatarPhotoSaved(true)
    setIsSavingAvatarPhoto(false)
  }, [lipsyncImageUrl, saveAvatarPhoto])

  // Audio recorder
  const {
    isRecording,
    audioBlob,
    duration: recordingDuration,
    error: recordingError,
    startRecording,
    stopRecording,
    clearRecording,
  } = useAudioRecorder()

  // Blob URL for recording preview (with cleanup to prevent memory leaks)
  const [recordingBlobUrl, setRecordingBlobUrl] = useState<string | null>(null)

  // Auto-save recording when audioBlob is set
  useEffect(() => {
    if (audioBlob) {
      // Create preview URL
      const url = URL.createObjectURL(audioBlob)
      setRecordingBlobUrl(url)

      // Auto-upload to S3
      ;(async () => {
        setIsUploadingAudio(true)
        try {
          const filename = `recording-${Date.now()}.webm`
          const uploadedUrl = await uploadToS3(audioBlob, filename)

          if (uploadedUrl) {
            addAsset({
              type: 'audio',
              name: filename,
              url: uploadedUrl,
            })
            setLipsyncAudioUrl(uploadedUrl)
            clearRecording()
          } else {
            // Fallback to blob URL
            setLipsyncAudioUrl(url)
            clearRecording()
          }
        } catch (err) {
          console.error('[GeneratePanel] Auto-upload error:', err)
          // Fallback to blob URL on error
          setLipsyncAudioUrl(url)
          clearRecording()
        } finally {
          setIsUploadingAudio(false)
        }
      })()

      return () => {
        URL.revokeObjectURL(url)
        setRecordingBlobUrl(null)
      }
    }
    setRecordingBlobUrl(null)
    return undefined
  }, [audioBlob, addAsset, clearRecording])

  // Handle audio file upload
  const handleAudioUpload = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return

      const file = files[0]
      if (!file.type.startsWith('audio/')) {
        setError(t('generate.error'))
        return
      }

      setIsUploadingAudio(true)
      setError(null)

      try {
        const url = await uploadToS3(file, file.name)
        if (url) {
          // Add to assets library
          addAsset({
            type: 'audio',
            name: file.name,
            url,
            fileSize: file.size,
          })
          setLipsyncAudioUrl(url)
        } else {
          // Fallback to blob URL
          const blobUrl = URL.createObjectURL(file)
          setLipsyncAudioUrl(blobUrl)
          console.warn('S3 upload failed, using local blob')
        }
      } catch (err) {
        console.error('[GeneratePanel] Audio upload error:', err)
        setError(t('generate.error'))
      } finally {
        setIsUploadingAudio(false)
      }
    },
    [addAsset, t]
  )

  // Handle image file upload
  const handleImageUpload = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return

      const file = files[0]
      if (!file.type.startsWith('image/')) {
        setError(t('generate.error'))
        return
      }

      setIsUploadingImage(true)
      setError(null)

      try {
        const url = await uploadToS3(file, file.name)
        if (url) {
          addAsset({
            type: 'image',
            name: file.name,
            url,
            fileSize: file.size,
          })
          setLipsyncImageUrl(url)
        } else {
          const blobUrl = URL.createObjectURL(file)
          setLipsyncImageUrl(blobUrl)
          console.warn('S3 upload failed, using local blob')
        }
      } catch (err) {
        console.error('[GeneratePanel] Image upload error:', err)
        setError(t('generate.error'))
      } finally {
        setIsUploadingImage(false)
      }
    },
    [addAsset, t]
  )

  // Check balance before generation
  const checkBalanceAndProceed = (): boolean => {
    // If not logged in, show login modal
    if (!user) {
      setShowLoginModal(true)
      return false
    }
    // If no quota, show paywall
    if (!canRender) {
      setShowPaywall(true)
      return false
    }
    return true
  }

  // Handle drag start for generated results
  const handleDragStart = (e: React.DragEvent, result: GeneratedResult) => {
    const asset: Asset = {
      id: result.id,
      type: result.type,
      name: result.name,
      url: result.url,
    }
    e.dataTransfer.setData('application/json', JSON.stringify(asset))
    e.dataTransfer.effectAllowed = 'copy'
  }

  // Add generated result to timeline
  const handleAddToTimeline = (result: GeneratedResult) => {
    const trackId = result.type === 'audio' ? 'track-audio' : 'track-video'

    addItem(trackId, {
      type: result.type as 'video' | 'image' | 'audio',
      assetId: result.id,
      startFrame: 0,
      durationInFrames: result.type === 'audio' ? 150 : 90,
      x: 0,
      y: 0,
      width: DEFAULT_WIDTH,
      height: result.type === 'video' ? DEFAULT_HEIGHT : DEFAULT_WIDTH,
      rotation: 0,
      opacity: 1,
      ...(result.type === 'video' && { volume: 1, playbackRate: 1 }),
      ...(result.type === 'audio' && { volume: 1 }),
    })
  }

  // Remove generated result from history
  const handleRemoveResult = (tab: GenerateTab, resultId: string) => {
    removeResult({ tab, resultId })
  }

  // Publish result to feed
  const handlePublish = (result: GeneratedResult) => {
    setPublishVideoUrl(result.url)
    setPublishThumbnailUrl(undefined) // TODO: generate thumbnail
    setShowPublishModal(true)
  }

  // Handle Image Generation
  const handleGenerateImage = async () => {
    if (!checkBalanceAndProceed()) return

    setIsGenerating(true)
    setError(null)

    try {
      // Use Replicate API for replicate:* models, vibee-mcp for others
      const isReplicateModel = imageModel.startsWith('replicate:')
      const result = isReplicateModel
        ? await generateImageViaReplicate({
            model: imageModel.replace('replicate:', ''),
            prompt: imagePrompt,
            aspectRatio: imageAspect,
          })
        : await generateImage({
            model: imageModel,
            prompt: imagePrompt,
            aspectRatio: imageAspect,
          })

      if (result.success && result.url) {
        const resultName = `AI ${imageModel} ${Date.now()}`
        const url = result.url

        // Add to assets and get the generated ID
        const resultId = addAsset({
          type: 'image',
          name: resultName,
          url,
        })

        // Add to generated results (persisted in Jotai)
        addResult({
          tab: 'image',
          result: {
            id: resultId,
            type: 'image',
            url,
            name: resultName,
            timestamp: Date.now(),
          },
        })

        // Deduct from quota
        await logRender()
        // Clear form
        setImagePrompt('')
      } else {
        setError(result.error || t('generate.error'))
      }
    } catch (err) {
      console.error('[GeneratePanel] Image error:', err)
      setError(err instanceof Error ? err.message : t('generate.error'))
    } finally {
      setIsGenerating(false)
    }
  }

  // Handle Video Generation
  const handleGenerateVideo = async () => {
    if (!checkBalanceAndProceed()) return

    setIsGenerating(true)
    setError(null)

    try {
      const result = await generateVideo({
        model: videoModel,
        prompt: videoPrompt,
        duration: videoDuration,
        aspectRatio: videoAspect,
      })

      if (result.success && result.url) {
        const resultName = `AI ${videoModel} ${Date.now()}`
        const url = result.url

        const resultId = addAsset({
          type: 'video',
          name: resultName,
          url,
        })

        // Add to generated results (persisted in Jotai)
        addResult({
          tab: 'video',
          result: {
            id: resultId,
            type: 'video',
            url,
            name: resultName,
            timestamp: Date.now(),
          },
        })

        await logRender()
        setVideoPrompt('')
      } else {
        setError(result.error || t('generate.error'))
      }
    } catch (err) {
      console.error('[GeneratePanel] Video error:', err)
      setError(err instanceof Error ? err.message : t('generate.error'))
    } finally {
      setIsGenerating(false)
    }
  }

  // Handle Audio Generation
  const handleGenerateAudio = async () => {
    if (!checkBalanceAndProceed()) return

    setIsGenerating(true)
    setError(null)

    try {
      const result = await generateAudio({
        text: audioText,
        voiceId: audioVoice,
        speed: audioSpeed,
      })

      if (result.success && result.url) {
        const voiceName =
          voices.find(v => v.id === audioVoice)?.name || audioVoice
        const resultName = `TTS ${voiceName}`
        const url = result.url

        const resultId = addAsset({
          type: 'audio',
          name: resultName,
          url,
        })

        // Add to generated results (persisted in Jotai)
        addResult({
          tab: 'audio',
          result: {
            id: resultId,
            type: 'audio',
            url,
            name: resultName,
            timestamp: Date.now(),
          },
        })

        await logRender()
        setAudioText('')
      } else {
        setError(result.error || t('generate.error'))
      }
    } catch (err) {
      console.error('[GeneratePanel] Audio error:', err)
      setError(err instanceof Error ? err.message : t('generate.error'))
    } finally {
      setIsGenerating(false)
    }
  }

  // Handle Lipsync Generation
  const handleGenerateLipsync = async () => {
    if (!checkBalanceAndProceed()) return

    setIsGenerating(true)
    setError(null)

    try {
      const result = await generateLipsync({
        audioUrl: lipsyncAudioUrl,
        imageUrl: lipsyncImageUrl,
        resolution: lipsyncResolution,
        aspectRatio: lipsyncAspect,
      })

      if (result.success && result.url) {
        const resultName = `Lipsync ${Date.now()}`
        const url = result.url

        const resultId = addAsset({
          type: 'video',
          name: resultName,
          url,
        })

        // Add to generated results (persisted in Jotai)
        addResult({
          tab: 'lipsync',
          result: {
            id: resultId,
            type: 'video',
            url,
            name: resultName,
            timestamp: Date.now(),
          },
        })

        await logRender()
        setLipsyncAudioUrl('')
        setLipsyncImageUrl('')
      } else {
        setError(result.error || t('generate.error'))
      }
    } catch (err) {
      console.error('[GeneratePanel] Lipsync error:', err)
      setError(err instanceof Error ? err.message : t('generate.error'))
    } finally {
      setIsGenerating(false)
    }
  }

  const tabs = useMemo(
    () => [
      { id: 'image' as const, emoji: '🖼️', label: t('generate.image') },
      { id: 'video' as const, emoji: '🎬', label: t('generate.video') },
      { id: 'audio' as const, emoji: '🎤', label: t('generate.audio') },
      { id: 'lipsync' as const, emoji: '👄', label: t('generate.lipsync') },
    ],
    [t]
  )

  return (
    <div className="generate-panel">
      {/* Header - only show when NOT controlled externally */}
      {!isControlledExternally && (
        <div className="panel-header">
          <Sparkles size={14} />
          <span>{t('generate.title')}</span>
        </div>
      )}

      {/* Sub-tabs - only show when NOT controlled externally */}
      {!isControlledExternally && (
        <div className="generate-tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`generate-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => {
                setInternalTab(tab.id)
                setError(null)
              }}
            >
              <span className="tab-emoji">{tab.emoji}</span>
              <span className="tab-label">{tab.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="generate-content">
        {/* Image Tab */}
        {activeTab === 'image' && (
          <div className="generate-form">
            <div className="form-group">
              <label>{t('generate.model')}</label>
              <div className="model-buttons">
                {IMAGE_MODELS.map(model => (
                  <button
                    key={model.id}
                    className={`model-btn model-btn-image ${imageModel === model.id ? 'active' : ''}`}
                    onClick={() => setImageModel(model.id)}
                  >
                    <span className="model-name">{model.name}</span>
                    <span className="model-desc">{model.description}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>{t('generate.prompt')}</label>
              <textarea
                value={imagePrompt}
                onChange={e => setImagePrompt(e.target.value)}
                placeholder={t('generate.promptPlaceholder')}
                className="form-textarea"
                rows={4}
              />
            </div>

            <div className="form-group">
              <label>{t('generate.aspectRatio')}</label>
              <div className="form-chips">
                {ASPECT_RATIOS.map(ratio => (
                  <button
                    key={ratio}
                    className={`form-chip ${imageAspect === ratio ? 'active' : ''}`}
                    onClick={() => setImageAspect(ratio)}
                  >
                    {ratio}
                  </button>
                ))}
              </div>
            </div>

            <button
              className="generate-btn"
              onClick={handleGenerateImage}
              disabled={isGenerating || !imagePrompt.trim()}
            >
              {isGenerating ? (
                <>
                  <Loader2 size={16} className="spin" />
                  {t('generate.generating')}
                </>
              ) : (
                <>
                  <Image size={16} />
                  {t('generate.generateImage')}
                </>
              )}
            </button>

            {error && activeTab === 'image' && (
              <div className="generate-error">
                <AlertCircle size={14} />
                <span>{error}</span>
              </div>
            )}

            {/* Generated Results */}
            {generatedResults.image.length > 0 && (
              <div className="generated-results">
                <div className="results-header">
                  <span>{t('generate.results')}</span>
                  <span className="results-hint">{t('generate.dragHint')}</span>
                </div>
                <div className="results-grid results-grid-images">
                  {generatedResults.image.map(result => (
                    <div
                      key={result.id}
                      className="result-item result-item-image"
                      draggable
                      onDragStart={e => handleDragStart(e, result)}
                    >
                      <div className="result-drag-handle">
                        <GripVertical size={12} />
                      </div>
                      <img
                        src={toAbsoluteUrl(result.url)}
                        alt={result.name}
                        className="result-preview-image"
                      />
                      <div className="result-actions">
                        <button
                          className="result-add-btn"
                          onClick={() => handleAddToTimeline(result)}
                          title={t('generate.addToTimeline')}
                        >
                          <Plus size={14} />
                        </button>
                        <button
                          className="result-remove-btn"
                          onClick={() => handleRemoveResult('image', result.id)}
                          title={t('generate.remove')}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Video Tab */}
        {activeTab === 'video' && (
          <div className="generate-form">
            <div className="form-group">
              <label>{t('generate.model')}</label>
              <div className="model-buttons">
                {VIDEO_MODELS.map(model => (
                  <button
                    key={model.id}
                    className={`model-btn model-btn-video ${videoModel === model.id ? 'active' : ''}`}
                    onClick={() => setVideoModel(model.id)}
                  >
                    <span className="model-name">{model.name}</span>
                    <span className="model-desc">{model.description}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>{t('generate.prompt')}</label>
              <textarea
                value={videoPrompt}
                onChange={e => setVideoPrompt(e.target.value)}
                placeholder={t('generate.videoPromptPlaceholder')}
                className="form-textarea"
                rows={4}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>{t('generate.duration')}</label>
                <div className="form-chips">
                  {DURATIONS.map(dur => (
                    <button
                      key={dur}
                      className={`form-chip ${videoDuration === dur ? 'active' : ''}`}
                      onClick={() => setVideoDuration(dur)}
                    >
                      {dur}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>{t('generate.aspectRatio')}</label>
                <div className="form-chips">
                  {ASPECT_RATIOS.slice(0, 3).map(ratio => (
                    <button
                      key={ratio}
                      className={`form-chip ${videoAspect === ratio ? 'active' : ''}`}
                      onClick={() => setVideoAspect(ratio)}
                    >
                      {ratio}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              className="generate-btn"
              onClick={handleGenerateVideo}
              disabled={isGenerating || !videoPrompt.trim()}
            >
              {isGenerating ? (
                <>
                  <Loader2 size={16} className="spin" />
                  {t('generate.generating')}
                </>
              ) : (
                <>
                  <Video size={16} />
                  {t('generate.generateVideo')}
                </>
              )}
            </button>

            {error && activeTab === 'video' && (
              <div className="generate-error">
                <AlertCircle size={14} />
                <span>{error}</span>
              </div>
            )}

            {/* Generated Results */}
            {generatedResults.video.length > 0 && (
              <div className="generated-results">
                <div className="results-header">
                  <span>{t('generate.results')}</span>
                  <span className="results-hint">{t('generate.dragHint')}</span>
                </div>
                <div className="results-grid results-grid-videos">
                  {generatedResults.video.map(result => (
                    <div
                      key={result.id}
                      className="result-item result-item-video"
                      draggable
                      onDragStart={e => handleDragStart(e, result)}
                    >
                      <div className="result-drag-handle">
                        <GripVertical size={12} />
                      </div>
                      <video
                        src={toAbsoluteUrl(result.url)}
                        className="result-preview-video"
                        muted
                      />
                      <div className="result-actions">
                        <button
                          className="result-add-btn"
                          onClick={() => handleAddToTimeline(result)}
                          title={t('generate.addToTimeline')}
                        >
                          <Plus size={14} />
                        </button>
                        <button
                          className="result-publish-btn"
                          onClick={() => handlePublish(result)}
                          title="Publish to Feed"
                        >
                          <Share size={14} />
                        </button>
                        <button
                          className="result-remove-btn"
                          onClick={() => handleRemoveResult('video', result.id)}
                          title={t('generate.remove')}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Audio Tab */}
        {activeTab === 'audio' && (
          <div className="generate-form">
            <div className="form-group">
              <label className="voice-label">
                {t('generate.voice')}
                {isLoadingVoices && (
                  <Loader2 size={12} className="spin voice-loading" />
                )}
              </label>
              {voicesError && (
                <div className="voices-error">
                  <AlertCircle size={12} />
                  <span>{voicesError}</span>
                </div>
              )}
              <div className="model-buttons voices-grid">
                {voices.map(voice => (
                  <button
                    key={voice.id}
                    className={`model-btn model-btn-audio ${audioVoice === voice.id ? 'active' : ''}`}
                    onClick={() => setAudioVoice(voice.id)}
                    title={
                      voice.category === 'cloned'
                        ? 'Custom cloned voice'
                        : 'ElevenLabs voice'
                    }
                  >
                    <span className="model-name">
                      {voice.name}
                      {voice.category === 'cloned' && (
                        <span className="voice-badge">✨</span>
                      )}
                    </span>
                    <span className="model-desc">
                      {voice.labels?.accent ||
                        voice.labels?.gender ||
                        voice.category}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>{t('generate.text')}</label>
              <textarea
                value={audioText}
                onChange={e => setAudioText(e.target.value)}
                placeholder={t('generate.textPlaceholder')}
                className="form-textarea"
                rows={4}
              />
            </div>

            <div className="form-group">
              <label>
                {t('generate.speed')}: {audioSpeed.toFixed(1)}x
              </label>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={audioSpeed}
                onChange={e => setAudioSpeed(parseFloat(e.target.value))}
                className="form-range"
              />
            </div>

            <button
              className="generate-btn"
              onClick={handleGenerateAudio}
              disabled={isGenerating || !audioText.trim()}
            >
              {isGenerating ? (
                <>
                  <Loader2 size={16} className="spin" />
                  {t('generate.generating')}
                </>
              ) : (
                <>
                  <Music size={16} />
                  {t('generate.generateAudio')}
                </>
              )}
            </button>

            {error && activeTab === 'audio' && (
              <div className="generate-error">
                <AlertCircle size={14} />
                <span>{error}</span>
              </div>
            )}

            {/* Generated Results */}
            {generatedResults.audio.length > 0 && (
              <div className="generated-results">
                <div className="results-header">
                  <span>{t('generate.results')}</span>
                  <span className="results-hint">{t('generate.dragHint')}</span>
                </div>
                <div className="results-list">
                  {generatedResults.audio.map(result => (
                    <div
                      key={result.id}
                      className="result-item result-item-audio"
                      draggable
                      onDragStart={e => handleDragStart(e, result)}
                    >
                      <div className="result-drag-handle">
                        <GripVertical size={12} />
                      </div>
                      <div className="result-audio-info">
                        <Music size={14} />
                        <span className="result-name">{result.name}</span>
                      </div>
                      <audio
                        src={toAbsoluteUrl(result.url)}
                        controls
                        className="result-audio-player"
                      />
                      <div className="result-actions">
                        <button
                          className="result-add-btn"
                          onClick={() => handleAddToTimeline(result)}
                          title={t('generate.addToTimeline')}
                        >
                          <Plus size={14} />
                        </button>
                        <button
                          className="result-remove-btn"
                          onClick={() => handleRemoveResult('audio', result.id)}
                          title={t('generate.remove')}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Lipsync Tab */}
        {activeTab === 'lipsync' && (
          <div className="generate-form">
            {/* Audio Source Section */}
            <div className="form-group">
              <label>{t('generate.audioSource')}</label>

              {/* Hidden file input */}
              <input
                ref={audioInputRef}
                type="file"
                accept="audio/*"
                onChange={e => handleAudioUpload(e.target.files)}
                style={{ display: 'none' }}
              />

              {/* Upload and Record buttons */}
              <div className="audio-source-buttons">
                <button
                  className="audio-source-btn"
                  onClick={() => audioInputRef.current?.click()}
                  disabled={isUploadingAudio || isRecording}
                >
                  {isUploadingAudio ? (
                    <Loader2 size={14} className="spin" />
                  ) : (
                    <Upload size={14} />
                  )}
                  <span>{t('generate.uploadAudio')}</span>
                </button>

                <button
                  className={`audio-source-btn ${isRecording ? 'recording' : ''}`}
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={isUploadingAudio}
                >
                  {isRecording ? <Square size={14} /> : <Mic size={14} />}
                  <span>
                    {isRecording
                      ? `${Math.floor(recordingDuration)}s`
                      : t('generate.recordAudio')}
                  </span>
                </button>
              </div>

              {/* Recording upload progress */}
              {isUploadingAudio && (
                <div className="recording-preview">
                  <div className="upload-progress">
                    <Loader2 size={18} className="spin" />
                    <span>{t('generate.uploading') || 'Uploading...'}</span>
                  </div>
                </div>
              )}

              {/* Recording error */}
              {recordingError && (
                <div className="generate-error">
                  <AlertCircle size={14} />
                  <span>{recordingError}</span>
                </div>
              )}

              {/* Current audio URL preview */}
              {lipsyncAudioUrl && (
                <div className="current-audio">
                  <audio
                    src={toAbsoluteUrl(lipsyncAudioUrl)}
                    controls
                    className="audio-preview"
                  />
                  <button
                    className="clear-audio-btn"
                    onClick={() => setLipsyncAudioUrl('')}
                    title="Clear"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
            </div>

            <div className="form-group">
              <label>{t('generate.imageSource')}</label>

              {/* Hidden file input */}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                onChange={e => handleImageUpload(e.target.files)}
                style={{ display: 'none' }}
              />

              {/* Upload button */}
              <button
                className="audio-source-btn"
                onClick={() => imageInputRef.current?.click()}
                disabled={isUploadingImage}
                style={{ marginBottom: '8px' }}
              >
                {isUploadingImage ? (
                  <Loader2 size={14} className="spin" />
                ) : (
                  <Upload size={14} />
                )}
                <span>{t('generate.uploadImage')}</span>
              </button>

              {/* Image preview */}
              {lipsyncImageUrl && (
                <div className="current-image">
                  <img
                    src={toAbsoluteUrl(lipsyncImageUrl)}
                    alt="Avatar"
                    className="image-preview"
                  />
                  <button
                    className="clear-audio-btn"
                    onClick={() => {
                      setLipsyncImageUrl('')
                      setAvatarPhotoSaved(false)
                    }}
                    title="Clear"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )}

              {/* Сохранить текущее фото в профиль аватара */}
              {lipsyncImageUrl && (
                <button
                  className="audio-source-btn"
                  onClick={handleSaveAvatarPhoto}
                  disabled={isSavingAvatarPhoto}
                  style={{ marginBottom: '8px' }}
                >
                  {isSavingAvatarPhoto ? (
                    <Loader2 size={14} className="spin" />
                  ) : (
                    <Plus size={14} />
                  )}
                  <span>
                    {avatarPhotoSaved
                      ? t('generate.savedToAvatar')
                      : t('generate.saveToAvatar')}
                  </span>
                </button>
              )}
            </div>

            {/* Профиль аватара: сохранённые фото. Лицо — не разовая загрузка:
                сохранил один раз, дальше весь контент берёт его отсюда. */}
            <div className="form-group">
              <label>{t('generate.myPhotos')}</label>

              {avatarPhotosError && (
                <div className="generate-error">
                  <AlertCircle size={14} />
                  <span>{avatarPhotosError}</span>
                </div>
              )}

              {avatarPhotosLoading ? (
                <div className="avatar-photos-grid">
                  <div className="avatar-photo-tile avatar-photo-tile--loading">
                    <Loader2 size={16} className="spin" />
                  </div>
                </div>
              ) : avatarPhotos.length === 0 ? (
                <p className="avatar-photos-empty">
                  {t('generate.myPhotosEmpty')}
                </p>
              ) : (
                <div className="avatar-photos-grid">
                  {avatarPhotos.map(p => (
                    <div
                      key={p.id}
                      className={`avatar-photo-tile ${lipsyncImageUrl === p.url ? 'active' : ''}`}
                    >
                      <button
                        type="button"
                        className="avatar-photo-select"
                        onClick={() => {
                          setLipsyncImageUrl(p.url)
                          setAvatarPhotoSaved(true)
                        }}
                        title={p.createdAt}
                      >
                        <img src={toAbsoluteUrl(p.url)} alt="" loading="lazy" />
                      </button>
                      <button
                        type="button"
                        className="avatar-photo-remove"
                        onClick={() => void deleteAvatarPhoto(p.id)}
                        title={t('generate.remove')}
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>{t('generate.resolution')}</label>
                <div className="form-chips">
                  {RESOLUTIONS.slice(0, 2).map(res => (
                    <button
                      key={res}
                      className={`form-chip ${lipsyncResolution === res ? 'active' : ''}`}
                      onClick={() => setLipsyncResolution(res)}
                    >
                      {res}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>{t('generate.aspectRatio')}</label>
                <div className="form-chips">
                  {ASPECT_RATIOS.slice(0, 3).map(ratio => (
                    <button
                      key={ratio}
                      className={`form-chip ${lipsyncAspect === ratio ? 'active' : ''}`}
                      onClick={() => setLipsyncAspect(ratio)}
                    >
                      {ratio}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              className="generate-btn"
              onClick={handleGenerateLipsync}
              disabled={
                isGenerating ||
                !lipsyncAudioUrl.trim() ||
                !lipsyncImageUrl.trim()
              }
            >
              {isGenerating ? (
                <>
                  <Loader2 size={16} className="spin" />
                  {t('generate.generating')}
                </>
              ) : (
                <>
                  <Mic size={16} />
                  {t('generate.generateLipsync')}
                </>
              )}
            </button>

            {error && activeTab === 'lipsync' && (
              <div className="generate-error">
                <AlertCircle size={14} />
                <span>{error}</span>
              </div>
            )}

            {/* Generated Results */}
            {generatedResults.lipsync.length > 0 && (
              <div className="generated-results">
                <div className="results-header">
                  <span>{t('generate.results')}</span>
                  <span className="results-hint">{t('generate.dragHint')}</span>
                </div>
                <div className="results-grid results-grid-videos">
                  {generatedResults.lipsync.map(result => (
                    <div
                      key={result.id}
                      className="result-item result-item-video"
                      draggable
                      onDragStart={e => handleDragStart(e, result)}
                    >
                      <div className="result-drag-handle">
                        <GripVertical size={12} />
                      </div>
                      <video
                        src={toAbsoluteUrl(result.url)}
                        className="result-preview-video"
                        muted
                      />
                      <div className="result-actions">
                        <button
                          className="result-add-btn"
                          onClick={() => handleAddToTimeline(result)}
                          title={t('generate.addToTimeline')}
                        >
                          <Plus size={14} />
                        </button>
                        <button
                          className="result-publish-btn"
                          onClick={() => handlePublish(result)}
                          title="Publish to Feed"
                        >
                          <Share size={14} />
                        </button>
                        <button
                          className="result-remove-btn"
                          onClick={() =>
                            handleRemoveResult('lipsync', result.id)
                          }
                          title={t('generate.remove')}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Publish Modal */}
      {showPublishModal && (
        <PublishModal
          isOpen={showPublishModal}
          onClose={() => setShowPublishModal(false)}
          videoUrl={publishVideoUrl}
          thumbnailUrl={publishThumbnailUrl}
        />
      )}
    </div>
  )
}
