import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useLanguage } from '@/hooks/useLanguage'
import {
  загрузитьБаланс,
  ценаНажатия,
  мераЦены,
  тысячиЗнаковКОплате,
  type Баланс,
} from '@/lib/balance'
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
  isMockMode,
} from '@/lib/generateApi'
import { uploadToS3 } from '@/lib/s3Upload'
import { addAssetAtom } from '@/atoms/assets'
import type { Asset } from '@vibee/atoms'
import { DEFAULT_WIDTH, DEFAULT_HEIGHT } from '@vibee/atoms'
import { toAbsoluteUrl } from '@/lib/mediaUrl'
import { optionalTimedCaptions } from '@/lib/timedCaptions'
import { KIE_WEB_MODELS } from '@/lib/kieProvider'
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
import {
  buildBrollPromptQueue,
  nextBrollPromptIndex,
} from '@/lib/brollPromptQueue'
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
  // The three replicate:* models (SDXL, SDXL Lightning, SDXL Emoji) were
  // REMOVED because they could not work in production: they route through
  // generateImageViaReplicate, which posts to the RELATIVE path
  // /api/replicate/predictions. That path exists only as Vite dev-server
  // middleware (player/vite.config.ts). The deployed player is static files
  // behind nginx (nginx/default.conf.template) with no /api location and no
  // proxy_pass at all, so the request fell into the SPA fallback and every
  // selection failed. The mock server implements /api/replicate/* which is why
  // the mock suite stayed green while production was broken.
  //
  // To bring them back, the render server needs a real route. That is a new
  // capability, not a bug fix: running an arbitrary Replicate version on our
  // token is an abuse surface that needs its own auth/cost decision.
  ...KIE_WEB_MODELS.image,
]

const VIDEO_MODELS: VideoModel[] = [
  { id: 'veo3-fast', name: 'Veo3 Fast', description: 'Быстрая генерация' },
  { id: 'veo3-quality', name: 'Veo3 Quality', description: 'Лучшее качество' },
  ...KIE_WEB_MODELS.video,
]

const ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3']
const DURATIONS = ['5s', '10s']
const KIE_VIDEO_DURATIONS = ['6s', '10s']
const RESOLUTIONS = ['480p', '720p', '1080p']

interface GeneratePanelProps {
  activeTab?: GenerateTab // External control from unified tabs
}

export function GeneratePanel({ activeTab: externalTab }: GeneratePanelProps) {
  const { t, lang } = useLanguage()
  const [internalTab, setInternalTab] = useState<GenerateTab>('image')
  /*
   * ЦЕНА ДО НАЖАТИЯ. Мини-приложение не спрашивало баланс ни разу: человек
   * жал «Сгенерировать» и платил, не увидев суммы. Ту же дыру в мобильном
   * приложении закрывали всю ночь.
   */
  const [баланс, setБаланс] = useState<Баланс | null>(null)
  useEffect(() => {
    let живо = true
    void загрузитьБаланс().then(б => {
      if (живо) setБаланс(б)
    })
    return () => {
      живо = false
    }
  }, [])

  /**
   * ПОЧЕМУ КНОПКА ПОГАШЕНА — СЛОВАМИ.
   *
   * Веб гасил её молча: пустое описание, идущая генерация и нехватка токенов
   * выглядели одинаково — серой кнопкой без объяснения. Я сам три итерации
   * принимал это за проблему со входом, пока не прочитал условие в коде.
   * Мобильное приложение говорит причину с самого начала.
   */
  const почемуНельзя = (
    операция: string,
    модель: string | undefined,
    промптПуст: boolean,
    чегоНеХватает: string,
    количество = 1
  ) => {
    if (isGenerating) return null
    if (промптПуст) return чегоНеХватает
    return неХватает(операция, модель, количество)
  }

  /**
   * Хватает ли на нажатие. `null` — не мешаем: неизвестность это не «нельзя».
   *
   * Освобождённый кошелёк (владелец) пропускаем: с него сервер не списывает
   * вовсе, и запрет там означал бы единственный счёт без права работать.
   */
  const неХватает = (
    операция: string,
    модель: string | undefined,
    /**
     * СКОЛЬКО ЕДИНИЦ ОПЛАТЯТ. По умолчанию одна — так вели себя все кнопки.
     *
     * Сравнение остатка с ценой ЕДИНИЦЫ пропускало вперёд того, кому хватало
     * на секунду и не хватало на ролик, — тот самый отказ после нажатия, ради
     * устранения которого проверка и заведена. На мобильном это чинили
     * отдельно, здесь оставалось целиком: сервер множит (`quantity` в
     * `chargeMiniAppUser`), экран не множил нигде.
     */
    количество = 1
  ) => {
    if (!баланс || баланс.exempt) return null
    const ц = ценаНажатия(баланс, операция, модель)
    if (ц == null) return null
    const всего = ц * количество
    if (баланс.balance >= всего) return null
    const мера = мераЦены(баланс, модель, операция)
    // Точную сумму называем, когда знаем количество. Когда не знаем (липсинк:
    // длину задаст будущая озвучка) — честно называем цену меры, а не
    // выдуманное число.
    //
    // В ПРЕДЛОЖЕНИИ — слова, а не подпись кнопки. Мера «с» годится на кнопке
    // («· 6/с»), но во фразе давала «не хватит: 6 за с» — по-русски это не
    // читается. Мобильное приложение говорит «за секунду звука» с самого
    // начала, и до липсинка эта ветка в вебе просто не встречалась.
    const словами = мера === 'с' ? 'секунду звука' : мера === '1000 зн.' ? '1000 знаков' : мера
    return словами && количество === 1
      ? `не хватит: ${ц} за ${словами}, есть ${баланс.balance}`
      : `не хватит токенов: нужно ${всего}, есть ${баланс.balance}`
  }

  /*
   * ЧЕК ПОСЛЕ ГЕНЕРАЦИИ. Сервер возвращает списанное и остаток в каждом
   * успешном ответе, а веб их выбрасывал: сумму человек не видел ни до, ни
   * после — только в отказе «не хватает».
   */
  const [чек, setЧек] = useState<string | null>(null)
  const запомнитьЧек = (о: unknown) => {
    const r = о as { charged?: number; balance?: number } | null
    if (!r || typeof r.charged !== 'number') return
    setЧек(
      typeof r.balance === 'number'
        ? `списано ${r.charged} · осталось ${r.balance}`
        : `списано ${r.charged}`
    )
    void загрузитьБаланс().then(б => б && setБаланс(б))
  }
  /**
   * ЧЕК ЖИВЁТ РОВНО ОДНУ ГЕНЕРАЦИЮ.
   *
   * Строка была одна на всю панель и не стиралась НИКОГДА: `запомнитьЧек`
   * выходит молча, если в ответе нет `charged`, — а так отвечают и неудача, и
   * подпись агентским ключом, и мок. Панель между вкладками не пересобирается
   * (один `<Route>`), поэтому «списано 2 · осталось 98» от картинки повисало
   * над словами «генерация не удалась» на видео — счёт за работу, которой не
   * было. После липсинка та же строка уносила на другую вкладку число до 60.
   */
  const забытьЧек = () => setЧек(null)

  /** Подпись цены на кнопке: «· 40» или «· 36/с», либо ничего, если не знаем. */
  const подписьЦены = (
    операция: string,
    модель: string | undefined,
    количество = 1
  ) => {
    const ц = ценаНажатия(баланс, операция, модель)
    if (ц == null) return null
    // Знаем количество — называем СУММУ: это и есть то, что спишут.
    if (количество > 1) return ` · ${ц * количество}`
    const мера = мераЦены(баланс, модель, операция)
    return мера ? ` · ${ц}/${мера}` : ` · ${ц}`
  }
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
  const [audioModel, setAudioModel] = useState('direct/elevenlabs')
  /**
   * ЗА СКОЛЬКО ТЫСЯЧ ЗНАКОВ ВОЗЬМУТ. Считается всегда, при любой модели.
   *
   * Маршрут озвучки умножает счёт на длину текста БЕЗУСЛОВНО, и предела длины
   * у поля нет. Модель по умолчанию (`direct/elevenlabs`) в серверном списке
   * познаковых не значится, поэтому подпись не показывала даже единицы
   * измерения: остаток 12, текст на 2500 знаков, кнопка «· 12» — и отказ
   * «нужно 36» ПОСЛЕ нажатия. Ставить множитель в зависимость от списка
   * значило бы оставить эту, самую частую, дыру открытой.
   */
  const тысячиОзвучки = тысячиЗнаковКОплате(audioText)

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
  const videoPrefilledPrompts = useAtomValue(videoPrefilledPromptsAtom)
  const brollPromptQueue = useMemo(
    () => buildBrollPromptQueue(videoPrefilledPrompts ?? []),
    [videoPrefilledPrompts]
  )
  const [activeBrollPromptIndex, setActiveBrollPromptIndex] = useState(0)
  const [completedBrollPrompts, setCompletedBrollPrompts] = useState<
    Set<number>
  >(() => new Set())

  // Keep every storyboard shot available for review. Selecting a shot only
  // fills the form; it never starts a paid generation request.
  useEffect(() => {
    if (brollPromptQueue.length > 0) {
      setActiveBrollPromptIndex(0)
      setCompletedBrollPrompts(new Set())
      setVideoPrompt(brollPromptQueue[0].prompt)
    }
  }, [brollPromptQueue])

  const selectBrollPrompt = useCallback(
    (index: number) => {
      const shot = brollPromptQueue[index]
      if (!shot) return
      setActiveBrollPromptIndex(index)
      setVideoPrompt(shot.prompt)
    },
    [brollPromptQueue]
  )

  // Lipsync state
  const [lipsyncAudioUrl, setLipsyncAudioUrl] = useState('')
  const [lipsyncImageUrl, setLipsyncImageUrl] = useState('')
  const [lipsyncResolution, setLipsyncResolution] = useState('720p')
  const [lipsyncAspect, setLipsyncAspect] = useState('9:16')
  const [lipsyncModel, setLipsyncModel] = useState(KIE_WEB_MODELS.lipsync[0].id)
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
  const [, setRecordingBlobUrl] = useState<string | null>(null)

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
    // The documented browser mock is a no-network preview and spends nothing.
    // Requiring a production identity here made ?mock=1 look enabled while
    // every Generate button still opened the login modal.
    if (isMockMode()) return true
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
    const trackId =
      result.type === 'audio'
        ? 'track-audio'
        : result.type === 'image'
          ? 'track-image'
          : 'track-video'

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
    забытьЧек()

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
        // Чек из ответа — тот же, что у видео: сервер кладёт его в каждый
        // успешный ответ, а веб выбрасывал.
        запомнитьЧек(result)
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
    забытьЧек()

    try {
      const result = await generateVideo({
        model: videoModel,
        prompt: videoPrompt,
        duration: videoDuration,
        aspectRatio: videoAspect,
      })

      if (result.success && result.url) {
        // Чек из ответа: сервер кладёт списанное и остаток в КАЖДЫЙ успешный
        // ответ, а веб их выбрасывал — сумму человек не видел ни до, ни после.
        // Вызов ОДИН: второй, оставшийся от правки-близнеца, тянул за собой и
        // второй запрос баланса на каждую генерацию.
        запомнитьЧек(result)
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

        if (brollPromptQueue.length > 0) {
          setCompletedBrollPrompts(previous => {
            const next = new Set(previous)
            next.add(activeBrollPromptIndex)
            return next
          })
          const nextIndex = nextBrollPromptIndex(
            activeBrollPromptIndex,
            brollPromptQueue.length
          )
          if (nextIndex > activeBrollPromptIndex) {
            setActiveBrollPromptIndex(nextIndex)
            setVideoPrompt(brollPromptQueue[nextIndex].prompt)
          } else {
            setVideoPrompt('')
          }
        } else {
          setVideoPrompt('')
        }
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
    забытьЧек()

    try {
      const result = await generateAudio({
        model: audioModel,
        text: audioText,
        voiceId: audioVoice,
        voiceName: voices.find(v => v.id === audioVoice)?.name,
        speed: audioSpeed,
      })

      if (result.success && result.url) {
        // Чек из ответа — тот же, что у видео: сервер кладёт его в каждый
        // успешный ответ, а веб выбрасывал.
        запомнитьЧек(result)
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
            timedCaptions: optionalTimedCaptions(result.timed_captions),
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
    забытьЧек()

    try {
      const result = await generateLipsync({
        model: lipsyncModel,
        audioUrl: lipsyncAudioUrl,
        imageUrl: lipsyncImageUrl,
        resolution: lipsyncResolution,
        aspectRatio: lipsyncAspect,
      })

      if (result.success && result.url) {
        // Чек из ответа — тот же, что у видео: сервер кладёт его в каждый
        // успешный ответ, а веб выбрасывал.
        запомнитьЧек(result)
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
              disabled={
                isGenerating ||
                !imagePrompt.trim() ||
                неХватает('image_generate', imageModel) != null
              }
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
                  {подписьЦены('image_generate', imageModel)}
                </>
              )}
            </button>

            {/* Причина ТЕКСТОМ: `title` на телефоне не видно. */}
            {почемуНельзя('image_generate', imageModel, !imagePrompt.trim(), 'Опишите картинку — без описания генерировать нечего') && (
              <div className="generate-hint">
                {почемуНельзя('image_generate', imageModel, !imagePrompt.trim(), 'Опишите картинку — без описания генерировать нечего')}
              </div>
            )}
            {чек && activeTab === 'image' && (
              <div className="generate-hint">{чек}</div>
            )}

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
                    onClick={() => {
                      setVideoModel(model.id)
                      if (
                        model.id.startsWith('kie/') &&
                        videoDuration === '5s'
                      ) {
                        setVideoDuration('6s')
                      } else if (
                        !model.id.startsWith('kie/') &&
                        videoDuration === '6s'
                      ) {
                        setVideoDuration('5s')
                      }
                    }}
                  >
                    <span className="model-name">{model.name}</span>
                    <span className="model-desc">{model.description}</span>
                  </button>
                ))}
              </div>
            </div>

            {brollPromptQueue.length > 0 && (
              <section
                className="broll-prompt-queue"
                aria-label="Кадры сценария"
              >
                <div className="broll-prompt-queue__header">
                  <span>
                    {lang === 'ru' ? 'Кадры сценария' : 'Script shots'}
                  </span>
                  <span>{brollPromptQueue.length}</span>
                </div>
                <div className="broll-prompt-queue__items">
                  {brollPromptQueue.map((shot, index) => (
                    <button
                      key={`${shot.index}:${shot.prompt}`}
                      type="button"
                      className={`broll-prompt-queue__item${index === activeBrollPromptIndex ? ' is-active' : ''}${completedBrollPrompts.has(index) ? ' is-complete' : ''}`}
                      onClick={() => selectBrollPrompt(index)}
                      title={shot.prompt}
                      aria-pressed={index === activeBrollPromptIndex}
                    >
                      <span>{shot.label}</span>
                      {completedBrollPrompts.has(index) && (
                        <span aria-label="Готово">✓</span>
                      )}
                    </button>
                  ))}
                </div>
                <p className="broll-prompt-queue__hint">
                  {lang === 'ru'
                    ? 'Выберите кадр, проверьте промпт и запускайте каждый отдельно. Следующий кадр подставится сам, но генерация не начнётся без нажатия.'
                    : 'Choose a shot, review its prompt, and run each one separately. The next shot is prefilled, but generation never starts without a click.'}
                </p>
              </section>
            )}

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
                  {(videoModel.startsWith('kie/')
                    ? KIE_VIDEO_DURATIONS
                    : DURATIONS
                  ).map(dur => (
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
              disabled={
                isGenerating ||
                !videoPrompt.trim() ||
                неХватает('video_generate', videoModel) != null
              }
              title={неХватает('video_generate', videoModel) ?? undefined}
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
                  {подписьЦены('video_generate', videoModel)}
                </>
              )}
            </button>

            {/* Причина ТЕКСТОМ, а не подсказкой: `title` на телефоне не
                показывается вовсе, и кнопка выглядела бы сломанной. */}
            {почемуНельзя('video_generate', videoModel, !videoPrompt.trim(), 'Опишите видео — без описания генерировать нечего') && (
              <div className="generate-hint">
                {почемуНельзя('video_generate', videoModel, !videoPrompt.trim(), 'Опишите видео — без описания генерировать нечего')}
              </div>
            )}
            {чек && activeTab === 'video' && (
              <div className="generate-hint">{чек}</div>
            )}

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
              <label>{t('generate.model')}</label>
              <div className="model-buttons">
                <button
                  className={`model-btn model-btn-audio ${audioModel === 'direct/elevenlabs' ? 'active' : ''}`}
                  onClick={() => setAudioModel('direct/elevenlabs')}
                  type="button"
                >
                  <span className="model-name">ElevenLabs · Direct</span>
                  <span className="model-desc">
                    {'Точный тайминг титров из той же озвучки'}
                  </span>
                </button>
                {KIE_WEB_MODELS.audio.map(model => (
                  <button
                    key={model.id}
                    className={`model-btn model-btn-audio ${audioModel === model.id ? 'active' : ''}`}
                    onClick={() => setAudioModel(model.id)}
                    type="button"
                  >
                    <span className="model-name">{model.name}</span>
                    <span className="model-desc">{model.description}</span>
                  </button>
                ))}
              </div>
            </div>

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
              disabled={
                isGenerating ||
                !audioText.trim() ||
                неХватает('audio_generate', audioModel, тысячиОзвучки) != null
              }
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
                  {подписьЦены('audio_generate', audioModel, тысячиОзвучки)}
                </>
              )}
            </button>

            {/* Причина ТЕКСТОМ: `title` на телефоне не видно. */}
            {почемуНельзя('audio_generate', audioModel, !audioText.trim(), 'Введите текст, который надо произнести', тысячиОзвучки) && (
              <div className="generate-hint">
                {почемуНельзя('audio_generate', audioModel, !audioText.trim(), 'Введите текст, который надо произнести', тысячиОзвучки)}
              </div>
            )}
            {чек && activeTab === 'audio' && (
              <div className="generate-hint">{чек}</div>
            )}

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
                <label>{t('generate.model')}</label>
                <div className="model-buttons">
                  {KIE_WEB_MODELS.lipsync.map(model => (
                    <button
                      key={model.id}
                      type="button"
                      className={`model-btn ${lipsyncModel === model.id ? 'active' : ''}`}
                      onClick={() => setLipsyncModel(model.id)}
                    >
                      <span className="model-name">{model.name}</span>
                      <span className="model-desc">{model.description}</span>
                    </button>
                  ))}
                </div>
              </div>

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
                !lipsyncImageUrl.trim() ||
                неХватает('lipsync_generate', lipsyncModel) != null
              }
              title={неХватает('lipsync_generate', lipsyncModel) ?? undefined}
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
                  {подписьЦены('lipsync_generate', lipsyncModel)}
                </>
              )}
            </button>

            {/*
              ВОРОТА, ПРИЧИНА И ЧЕК — как у остальных трёх кнопок.

              Здесь стояла одна подпись цены, и это была самая дорогая кнопка
              панели: счёт за липсинк посекундный, до 60 токенов за десять
              секунд звука. То есть единственная кнопка, способная отказать
              после нажатия, была единственной без проверки до нажатия.
              «Пока только для трёх из четырёх» — это незаконченная работа, а
              не этап.
            */}
            {почемуНельзя(
              'lipsync_generate',
              lipsyncModel,
              !lipsyncAudioUrl.trim() || !lipsyncImageUrl.trim(),
              'Нужны фото и звук — без них озвучивать нечего'
            ) && (
              <div className="generate-hint">
                {почемуНельзя(
                  'lipsync_generate',
                  lipsyncModel,
                  !lipsyncAudioUrl.trim() || !lipsyncImageUrl.trim(),
                  'Нужны фото и звук — без них озвучивать нечего'
                )}
              </div>
            )}
            {чек && activeTab === 'lipsync' && (
              <div className="generate-hint">{чек}</div>
            )}

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
