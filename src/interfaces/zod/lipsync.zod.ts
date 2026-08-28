import { z } from 'zod'
import { sanitizeUrl } from '@/utils/sanitize'

// URL схема с валидацией
/**
 * URL, который СЕРВЕР ПОТОМ СКАЧАЕТ.
 *
 * Сюда приходит `ctx.message.text` из lipSyncWizard (index.ts:133 и :250), а
 * дальше адрес уходит в axios (file-helpers.ts). Прежняя проверка состояла
 * ровно в том, что `new URL(value)` не бросил, — то есть пропускала любую
 * схему и любой хост, включая `http://127.0.0.1:9000/...`.
 *
 * Настоящая проверка в проекте БЫЛА написана — `sanitizeUrl` в
 * src/utils/sanitize.ts:54: она режет всё кроме http(s) и в production
 * отклоняет localhost, 127.*, 10.*, 172.16-31.*, 192.168.*, 0.0.0.0.
 * Импортов у неё было НОЛЬ. Подключаем.
 */
export const URLSchema = z
  .string()
  .min(1, 'URL не может быть пустым')
  .superRefine((value, ctx) => {
    try {
      sanitizeUrl(value, ['http', 'https'])
    } catch (e) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        // Текст оставлен прежним — на него опирается
        // lipsyncZodValidation.test.ts, и он же уходит пользователю.
        // Причина отказа от sanitizeUrl добавляется хвостом, чтобы в логах
        // было видно, что именно не так.
        message:
          e instanceof Error && !/invalid url/i.test(e.message)
            ? `Неверный формат URL: ${e.message}`
            : 'Неверный формат URL',
      })
    }
  })

// Схема для файлов Telegram
export const TelegramFileSchema = z.object({
  file_id: z.string().min(1, 'file_id не может быть пустым'),
  file_path: z.string().optional(),
  file_size: z
    .number()
    .max(50 * 1024 * 1024, 'Максимальный размер файла: 50MB')
    .optional(),
})

// Enum для типов медиа
export const MediaTypeEnum = z.enum(['video', 'audio', 'voice'])
export type MediaType = z.infer<typeof MediaTypeEnum>

// Схема для медиа-входа (URL или Telegram файл)
export const MediaInputSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('url'),
    url: URLSchema,
  }),
  z.object({
    type: z.literal('telegram_file'),
    file: TelegramFileSchema,
    bot_token: z.string().min(1, 'Bot token обязателен для Telegram файлов'),
  }),
])

export type MediaInput = z.infer<typeof MediaInputSchema>

// Enum для статуса обработки
export const LipsyncStatusEnum = z.enum([
  'pending',
  'processing',
  'completed',
  'failed',
])
export type LipsyncStatus = z.infer<typeof LipsyncStatusEnum>

// Enum для моделей лип-синка
export const LipsyncModelEnum = z.enum([
  'kling-lipsync',
  'sync-v2',
  'ai-server',
])
export type LipsyncModel = z.infer<typeof LipsyncModelEnum>

// Схема для конфигурации лип-синка
export const LipsyncConfigSchema = z.object({
  model: LipsyncModelEnum.default('kling-lipsync'),
  quality: z.enum(['low', 'medium', 'high']).default('medium'),
  preserve_audio: z.boolean().default(true),
  enhance_quality: z.boolean().default(false),
})

export type LipsyncConfig = z.infer<typeof LipsyncConfigSchema>

// Основная схема для запроса лип-синка
export const LipsyncRequestSchema = z.object({
  video_input: MediaInputSchema,
  audio_input: MediaInputSchema,
  config: LipsyncConfigSchema.optional().default({}),
  user_id: z.string().min(1, 'User ID обязателен'),
  bot_name: z.string().min(1, 'Bot name обязателен'),
  webhook_url: URLSchema.optional(),
  metadata: z.record(z.any()).optional().default({}),
})

export type LipsyncRequest = z.infer<typeof LipsyncRequestSchema>

// Схема для ответа лип-синка
export const LipsyncResponseSchema = z.object({
  id: z.string().min(1),
  status: LipsyncStatusEnum,
  result_url: URLSchema.optional(),
  progress: z.number().min(0).max(100).optional(),
  error_message: z.string().optional(),
  processing_time_ms: z.number().min(0).optional(),
  model_used: LipsyncModelEnum.optional(),
  cost_charged: z.number().min(0).optional(),
  created_at: z.string().datetime(),
  completed_at: z.string().datetime().optional(),
})

export type LipsyncResponse = z.infer<typeof LipsyncResponseSchema>

// Схема для валидации сессии лип-синка
export const LipsyncSessionSchema = z.object({
  videoUrl: URLSchema.optional(),
  audioUrl: URLSchema.optional(),
  step: z.enum(['video', 'audio', 'processing']).default('video'),
  startTime: z.number().optional(),
  requestId: z.string().optional(),
})

export type LipsyncSession = z.infer<typeof LipsyncSessionSchema>

// Схема для валидации контекста Telegram
export const TelegramContextSchema = z.object({
  user_id: z.string().min(1),
  chat_id: z.string().min(1),
  message_id: z.number().min(1).optional(),
  bot_username: z.string().min(1),
  language: z.enum(['ru', 'en']).default('ru'),
  is_admin: z.boolean().default(false),
})

export type TelegramContext = z.infer<typeof TelegramContextSchema>

// Схема для валидации медиа-файла
export const MediaFileValidationSchema = z.object({
  type: MediaTypeEnum,
  size: z.number().max(50 * 1024 * 1024, 'Максимальный размер файла: 50MB'),
  duration: z
    .number()
    .max(300, 'Максимальная длительность: 5 минут')
    .optional(),
  format: z.string().optional(),
  url: URLSchema,
})

export type MediaFileValidation = z.infer<typeof MediaFileValidationSchema>

// Схема для ошибки лип-синка
export const LipsyncErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.record(z.any()).optional(),
  timestamp: z.string().datetime(),
  request_id: z.string().optional(),
})

export type LipsyncError = z.infer<typeof LipsyncErrorSchema>

// Схема для валидации админа
export const AdminValidationSchema = z.object({
  telegram_id: z.string().min(1),
  admin_ids: z.array(z.string()).min(1, 'Список админов не может быть пустым'),
})

export type AdminValidation = z.infer<typeof AdminValidationSchema>

// Схема для пейлоада события лип-синка
export const LipsyncEventPayloadSchema = z.object({
  event_type: z.enum(['started', 'progress', 'completed', 'failed']),
  request_id: z.string().min(1),
  user_id: z.string().min(1),
  timestamp: z.string().datetime(),
  data: z.record(z.any()).optional(),
})

export type LipsyncEventPayload = z.infer<typeof LipsyncEventPayloadSchema>

// Валидаторы-хелперы
export const validateVideoInput = (input: any): MediaInput => {
  return MediaInputSchema.parse(input)
}

export const validateAudioInput = (input: any): MediaInput => {
  return MediaInputSchema.parse(input)
}

export const validateLipsyncRequest = (request: any): LipsyncRequest => {
  return LipsyncRequestSchema.parse(request)
}

export const validateTelegramFile = (file: any) => {
  return TelegramFileSchema.parse(file)
}

export const validateMediaFile = (file: any): MediaFileValidation => {
  return MediaFileValidationSchema.parse(file)
}

export const validateSession = (session: any): LipsyncSession => {
  return LipsyncSessionSchema.parse(session)
}

export const isValidAdmin = (
  telegramId: string,
  adminIds: string[]
): boolean => {
  try {
    const validation = AdminValidationSchema.parse({
      telegram_id: telegramId,
      admin_ids: adminIds,
    })
    return validation.admin_ids.includes(validation.telegram_id)
  } catch {
    return false
  }
}

// Константы для валидации
export const LIPSYNC_CONSTANTS = {
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
  MAX_DURATION: 300, // 5 минут
  SUPPORTED_VIDEO_FORMATS: ['mp4', 'avi', 'mov', 'webm'],
  SUPPORTED_AUDIO_FORMATS: ['mp3', 'wav', 'ogg', 'm4a', 'aac'],
  DEFAULT_MODEL: 'kling-lipsync' as const,
  DEFAULT_QUALITY: 'medium' as const,
} as const
