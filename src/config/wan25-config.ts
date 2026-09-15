/**
 * Конфигурация для WAN 2.5 Image-to-Video API от Alibaba
 * Используется для создания кинематографичных AI видео
 */
import { KIE_JOBS } from '@/config/kie-jobs'

export enum WAN25ModelType {
  IMAGE_TO_VIDEO = 'wan25_i2v',
  TEXT_TO_VIDEO = 'wan25_t2v',
}

export interface WAN25Config {
  id: string
  name: string
  description: string
  provider: 'kie'
  modelId: string
  costPerSecond720p: number // в долларах для 720p
  costPerSecond1080p: number // в долларах для 1080p
  costPerSecondStars720p: number // цена в звездах для 720p
  costPerSecondStars1080p: number // цена в звездах для 1080p
  maxDuration: number // максимальная длительность в секундах
  supportedDurations: number[] // поддерживаемые длительности в секундах
  quality: 'standard' | 'high' | 'premium'
  isAvailable: boolean
  features: string[]
  supportedResolutions: ('720p' | '1080p')[]
  supportedAspectRatios: ('16:9' | '9:16' | '1:1')[]
}

// Конвертер: 1 доллар = ~60 звезд (базовый курс)
const USD_TO_STARS_RATE = 60

export const WAN25_MODELS: Record<WAN25ModelType, WAN25Config> = {
  [WAN25ModelType.IMAGE_TO_VIDEO]: {
    id: 'wan25_i2v',
    name: '🎬 WAN 2.5 Image-to-Video',
    description:
      'Кинематографичная AI модель от Alibaba для генерации видео из изображений. Поддерживает синхронизацию с диалогами, окружающими звуками и фоновой музыкой. Высокое качество для соцсетей и рекламы.',
    provider: 'kie',
    modelId: 'wan/2-5-image-to-video',
    costPerSecond720p: 0.06, // $0.06/сек = 12 кредитов
    costPerSecond1080p: 0.1, // $0.10/сек = 20 кредитов
    costPerSecondStars720p: 3.6, // ~$0.06 × 60 = 3.6⭐/сек
    costPerSecondStars1080p: 6.0, // ~$0.10 × 60 = 6.0⭐/сек
    maxDuration: 10, // максимум 10 секунд
    supportedDurations: [5, 10], // 5 или 10 секунд
    quality: 'high',
    isAvailable: true,
    features: [
      'Кинематографичное качество',
      'Синхронизация с диалогами',
      'Окружающие звуки и музыка',
      'Поддержка 720p и 1080p',
      'Соотношения сторон: 16:9, 9:16, 1:1',
      'Длительность: 5-10 секунд',
      'Расширение промпта с помощью LLM',
      'Настройка seed для воспроизводимости',
    ],
    supportedResolutions: ['720p', '1080p'],
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
  },
  [WAN25ModelType.TEXT_TO_VIDEO]: {
    id: 'wan25_t2v',
    name: '📝 WAN 2.5 Text-to-Video',
    description:
      'Генерация видео из текстового описания с помощью WAN 2.5. Создает кинематографичные видео на основе текстовых промптов.',
    provider: 'kie',
    modelId: 'wan/2-5-text-to-video',
    costPerSecond720p: 0.06, // $0.06/сек = 12 кредитов
    costPerSecond1080p: 0.1, // $0.10/сек = 20 кредитов
    costPerSecondStars720p: 3.6, // ~$0.06 × 60 = 3.6⭐/сек
    costPerSecondStars1080p: 6.0, // ~$0.10 × 60 = 6.0⭐/сек
    maxDuration: 10,
    supportedDurations: [5, 10],
    quality: 'high',
    isAvailable: true, // можно включить позже
    features: [
      'Генерация из текста',
      'Кинематографичное качество',
      'Поддержка 720p и 1080p',
      'Соотношения сторон: 16:9, 9:16, 1:1',
      'Длительность: 5-10 секунд',
      'Расширение промпта с помощью LLM',
    ],
    supportedResolutions: ['720p', '1080p'],
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
  },
}

/**
 * Получить доступные модели WAN 2.5
 */
export function getAvailableWAN25Models(): WAN25Config[] {
  return Object.values(WAN25_MODELS).filter(model => model.isAvailable)
}

/**
 * Получить модель WAN 2.5 по ID
 */
export function getWAN25ModelById(id: string): WAN25Config | undefined {
  return Object.values(WAN25_MODELS).find(model => model.id === id)
}

/**
 * Расчет стоимости WAN 2.5 в долларах
 */
export function calculateWAN25CostUSD(
  modelId: string,
  durationSeconds: number,
  resolution: '720p' | '1080p' = '720p'
): number {
  const model = getWAN25ModelById(modelId)
  if (!model) {
    throw new Error(`WAN 2.5 model not found: ${modelId}`)
  }

  const costPerSecond =
    resolution === '1080p' ? model.costPerSecond1080p : model.costPerSecond720p

  return durationSeconds * costPerSecond
}

/**
 * Расчет стоимости WAN 2.5 в звездах
 */
export function calculateWAN25CostStars(
  modelId: string,
  durationSeconds: number,
  resolution: '720p' | '1080p' = '720p'
): number {
  const model = getWAN25ModelById(modelId)
  if (!model) {
    throw new Error(`WAN 2.5 model not found: ${modelId}`)
  }

  const costPerSecond =
    resolution === '1080p'
      ? model.costPerSecondStars1080p
      : model.costPerSecondStars720p

  return Math.ceil(durationSeconds * costPerSecond)
}

/**
 * Валидация параметров WAN 2.5
 */
export function validateWAN25Parameters(
  modelId: string,
  duration: number,
  resolution: '720p' | '1080p',
  aspectRatio?: '16:9' | '9:16' | '1:1'
): { isValid: boolean; error?: string } {
  const model = getWAN25ModelById(modelId)

  if (!model) {
    return { isValid: false, error: `Model not found: ${modelId}` }
  }

  if (!model.isAvailable) {
    return { isValid: false, error: `Model is not available: ${modelId}` }
  }

  if (!model.supportedDurations.includes(duration)) {
    return {
      isValid: false,
      error: `Duration ${duration}s not supported. Supported: ${model.supportedDurations.join(', ')}s`,
    }
  }

  if (!model.supportedResolutions.includes(resolution)) {
    return {
      isValid: false,
      error: `Resolution ${resolution} not supported. Supported: ${model.supportedResolutions.join(', ')}`,
    }
  }

  if (aspectRatio && !model.supportedAspectRatios.includes(aspectRatio)) {
    return {
      isValid: false,
      error: `Aspect ratio ${aspectRatio} not supported. Supported: ${model.supportedAspectRatios.join(', ')}`,
    }
  }

  if (duration > model.maxDuration) {
    return {
      isValid: false,
      error: `Duration ${duration}s exceeds maximum ${model.maxDuration}s`,
    }
  }

  return { isValid: true }
}

/**
 * Интерфейс для запроса к WAN 2.5 API
 */
export interface WAN25CreateTaskRequest {
  model: string
  callBackUrl?: string
  input: {
    prompt: string
    image_url?: string // для image-to-video
    duration?: '5' | '10'
    resolution?: '720p' | '1080p'
    negative_prompt?: string
    enable_prompt_expansion?: boolean
    seed?: number
  }
}

/**
 * Интерфейс для ответа WAN 2.5 API
 */
export interface WAN25TaskResponse {
  code: number
  message: string
  data: {
    taskId: string
  }
}

/**
 * Интерфейс для статуса задачи WAN 2.5
 */
export interface WAN25StatusResponse {
  code: number
  data: {
    state: 'success' | 'fail' | 'processing'
    resultJson?: string
    failMsg?: string
    completeTime?: number
    consumeCredits?: number
    costTime?: number
  }
  msg: string
}

/**
 * Конфигурация API endpoints
 */
export const WAN25_API_CONFIG = {
  BASE_URL: KIE_JOBS.BASE_URL,
  ENDPOINTS: {
    CREATE_TASK: KIE_JOBS.CREATE_TASK,
    // Renamed along with the value it holds: this key said TASK_STATUS because
    // it pointed at /api/v1/jobs/taskStatus, and that route answers 404 to
    // every request (see src/config/kie-jobs.ts for the measurement). The
    // poller below it parses the answer correctly and always has -- it simply
    // never received one. Renaming rather than re-pointing makes the compiler
    // name every other place that believed in the old route.
    RECORD_INFO: KIE_JOBS.RECORD_INFO,
  },
  TIMEOUT: {
    CREATE_TASK: 30000, // 30 секунд
    STATUS_CHECK: 10000, // 10 секунд
    MAX_WAIT_TIME: 600000, // 10 минут максимальное ожидание (WAN 2.5 медленная)
    POLL_INTERVAL: 30000, // проверяем статус каждые 30 секунд
  },
  HEADERS: {
    'Content-Type': 'application/json',
    'User-Agent': 'AI-Reels-Bot/1.0',
  },
}

/**
 * Типы ошибок WAN 2.5
 */
export enum WAN25ErrorType {
  API_ERROR = 'api_error',
  TIMEOUT = 'timeout',
  INVALID_PARAMETERS = 'invalid_parameters',
  TASK_FAILED = 'task_failed',
  NETWORK_ERROR = 'network_error',
}

export interface WAN25Error {
  type: WAN25ErrorType
  message: string
  details?: any
}

/**
 * Дефолтные промпты для WAN 2.5
 */
export const WAN25_DEFAULT_PROMPTS = {
  CINEMATIC: {
    ru: 'Персонаж с изображения выполняет выразительные движения, жестикулирует руками, меняет позу и выражение лица. Создайте динамичное видео с плавными переходами, где персонаж демонстрирует эмоции и живую мимику. Высокое качество, кинематографичная картинка, естественное освещение.',
    en: 'The character from the image performs expressive movements, gesticulates with hands, changes pose and facial expression. Create a dynamic video with smooth transitions where the character demonstrates emotions and lively facial expressions. High quality, cinematic picture, natural lighting.',
  },
  PORTRAIT: {
    ru: 'Портретное видео персонажа с естественными микро-движениями лица, моргание, легкие повороты головы, дыхание. Студийное освещение, профессиональное качество.',
    en: 'Portrait video of the character with natural facial micro-movements, blinking, slight head turns, breathing. Studio lighting, professional quality.',
  },
  DYNAMIC: {
    ru: 'Энергичное видео с активными движениями персонажа, эмоциональная мимика, жесты руками, изменение позы. Драматическое освещение, высокая детализация.',
    en: 'Energetic video with active character movements, emotional facial expressions, hand gestures, pose changes. Dramatic lighting, high detail.',
  },
}

console.log('🎬 [WAN 2.5 CONFIG] Configuration loaded')
console.log(
  `🎬 [WAN 2.5 CONFIG] Available models: ${getAvailableWAN25Models().length}`
)
console.log(`🎬 [WAN 2.5 CONFIG] API Base URL: ${WAN25_API_CONFIG.BASE_URL}`)
