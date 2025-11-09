import { z } from 'zod'

// Enum для шагов wizard'a
export const TextToVideoStepEnum = z.enum(['model_selection', 'prompt_input', 'processing'])
export type TextToVideoStep = z.infer<typeof TextToVideoStepEnum>

// Enum для соотношения сторон
export const AspectRatioEnum = z.enum(['9:16', '16:9'])
export type AspectRatio = z.infer<typeof AspectRatioEnum>

// Схема для модели видео
export const VideoModelSchema = z.object({
  modelId: z.string().min(1, 'Model ID не может быть пустым'),
  aspectRatio: AspectRatioEnum,
  duration: z.number().min(1).max(30).optional(),
  cost: z.number().min(0),
})

export type VideoModel = z.infer<typeof VideoModelSchema>

// Схема для сессии textToVideo wizard'a
export const TextToVideoSessionSchema = z.object({
  step: TextToVideoStepEnum.default('model_selection'),
  selectedModel: z.string().optional(),
  aspect_ratio: AspectRatioEnum.optional(),
  selectedVideoCost: z.number().min(0).optional(),
  prompt: z.string().optional(),
  startTime: z.number().optional(),
  wizardCursor: z.number().min(0).max(2).optional(),
})

export type TextToVideoSession = z.infer<typeof TextToVideoSessionSchema>

// Схема для запроса генерации видео
export const TextToVideoRequestSchema = z.object({
  prompt: z.string().min(3, 'Промпт должен содержать минимум 3 символа').max(1000, 'Промпт не должен превышать 1000 символов'),
  modelId: z.string().min(1, 'Model ID обязателен'),
  aspectRatio: AspectRatioEnum,
  duration: z.number().min(1).max(30).optional(),
  user_id: z.string().min(1, 'User ID обязателен'),
})

export type TextToVideoRequest = z.infer<typeof TextToVideoRequestSchema>

// Валидаторы-хелперы
export const validateTextToVideoSession = (session: any): TextToVideoSession => {
  return TextToVideoSessionSchema.parse(session)
}

export const validateVideoModel = (model: any): VideoModel => {
  return VideoModelSchema.parse(model)
}

export const validateTextToVideoRequest = (request: any): TextToVideoRequest => {
  return TextToVideoRequestSchema.parse(request)
}

// Константы для валидации
<<<<<<< HEAD
=======
// ✅ SUPPORTED_MODELS удален - используйте getUnifiedVideoModels() из unified-video-models.config.ts
>>>>>>> origin/production
export const TEXT_TO_VIDEO_CONSTANTS = {
  MIN_PROMPT_LENGTH: 3,
  MAX_PROMPT_LENGTH: 10000, // Увеличен лимит для поддержки длинных промптов
  DEFAULT_ASPECT_RATIO: '9:16' as const,
  DEFAULT_MODEL: 'veo3_fast' as const,
<<<<<<< HEAD
  SUPPORTED_MODELS: [
    'veo3_fast',
    'veo3',
    'runway-aleph',
    'minimax',
    'hunyuan-video-fast',
    'wan-text-to-video',
    'wan-2.2-t2v-fast',
    'sora-2',
    'sora-2-pro',
  ] as const,
=======
>>>>>>> origin/production
} as const