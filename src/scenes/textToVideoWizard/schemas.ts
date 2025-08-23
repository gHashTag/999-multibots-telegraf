import { z } from 'zod'

// 🎯 Zod схемы для безопасной валидации данных в textToVideoWizard

// Схема для пользователя Telegram
export const TelegramUserSchema = z.object({
  id: z.number().positive('User ID must be positive'),
  is_bot: z.boolean().optional(),
  first_name: z.string().min(1, 'First name required').optional(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  language_code: z.string().optional(),
})

// Схема для чата Telegram
export const TelegramChatSchema = z.object({
  id: z.number(),
  type: z.enum(['private', 'group', 'supergroup', 'channel']),
  title: z.string().optional(),
  username: z.string().optional(),
})

// Схема для сообщения Telegram
export const TelegramMessageSchema = z.object({
  message_id: z.number().positive(),
  from: TelegramUserSchema.optional(),
  chat: TelegramChatSchema,
  date: z.number().positive(),
  text: z.string().optional(), // ⚠️ Может быть undefined для фото/стикеров
  caption: z.string().optional(),
  photo: z.array(z.any()).optional(),
  document: z.any().optional(),
  voice: z.any().optional(),
  video: z.any().optional(),
})

// Схема для контекста wizard'а
export const WizardContextSchema = z.object({
  cursor: z.number().int().min(0).optional(), // ⚠️ Может быть undefined!
  step: z.function().optional(),
  steps: z.array(z.function()),
  next: z.function(),
  back: z.function(),
  selectStep: z.function(),
})

// Схема для контекста сцены
export const SceneContextSchema = z.object({
  current: z.object({
    id: z.string()
  }).optional(), // ⚠️ Может быть null
  enter: z.function(),
  leave: z.function(),
  reenter: z.function().optional(),
})

// Схема для полного контекста MyContext
export const MyContextSchema = z.object({
  from: TelegramUserSchema.optional(),
  chat: TelegramChatSchema.optional(),
  message: TelegramMessageSchema.optional(), // ⚠️ Может быть undefined для callback_query
  wizard: WizardContextSchema,
  scene: SceneContextSchema,
  session: z.record(z.string(), z.any()), // Любые данные сессии
  reply: z.function(),
  botInfo: z.object({
    id: z.number(),
    is_bot: z.boolean(),
    first_name: z.string(),
    username: z.string().optional(),
  }).optional(),
})

// Схема для текстового сообщения (гарантирует наличие текста)
// Используем merge для корректной обработки optional полей - best practice
export const TextMessageContextSchema = MyContextSchema.merge(
  z.object({
    message: z.object({
      ...TelegramMessageSchema.shape,
      text: z.string().min(1, 'Text message required') // Переопределяем только text как обязательный
    })
  })
)

// Схема для конфигурации модели видео
export const VideoModelConfigSchema = z.object({
  title: z.string().min(1, 'Model title required'),
  basePrice: z.number().positive('Base price must be positive'),
  inputType: z.array(z.string()).nonempty('Input types required'),
  maxDuration: z.number().positive().optional(),
  aspectRatios: z.array(z.enum(['9:16', '16:9', '1:1'])).optional(),
  description: z.string().optional(),
})

// Схема для коллекции конфигураций моделей
export const VideoModelsConfigSchema = z.record(
  z.string(), 
  VideoModelConfigSchema
)

// Схема для выбранной модели пользователем
export const SelectedModelSchema = z.object({
  modelId: z.string().min(1, 'Model ID required'),
  aspectRatio: z.enum(['9:16', '16:9'], {
    message: 'Aspect ratio must be 9:16 or 16:9'
  }),
  duration: z.number().positive().optional(),
  cost: z.number().min(1, 'Cost must be positive'),
})

// Схема для сессии wizard'а
export const WizardSessionSchema = z.object({
  selectedModel: z.string().optional(),
  aspect_ratio: z.enum(['9:16', '16:9']).optional(),
  selectedVideoCost: z.number().min(1).optional(),
  mode: z.string().optional(),
  // Другие поля сессии...
}).passthrough() // Разрешаем дополнительные поля

// Схема для промпта пользователя
export const PromptSchema = z.string()
  .min(3, 'Prompt must be at least 3 characters')
  .max(2000, 'Prompt too long (max 2000 characters)')
  .refine(
    (prompt) => prompt.trim().length >= 3,
    'Prompt cannot be just whitespace'
  )

// Схема для кнопки выбора модели
export const ModelButtonTextSchema = z.string()
  .min(1, 'Button text required')
  .refine(
    (text) => text.includes('⭐') && (text.includes('📱') || text.includes('🖥️')),
    'Button text must contain stars and aspect ratio icon'
  )

// Схема для результата парсинга модели из кнопки
export const ParsedModelSelectionSchema = z.object({
  modelId: z.string().min(1, 'Model ID is required'),
  aspectRatio: z.enum(['9:16', '16:9'], {
    message: 'Aspect ratio must be 9:16 or 16:9'
  }),
  duration: z.number().positive().optional(),
  cost: z.number().min(1, 'Cost must be positive'),
})

// Схема для расчета стоимости в звездах
export const StarsCalculationInputSchema = z.object({
  modelId: z.string().min(1, 'Model ID is required'),
  duration: z.number().positive().optional(),
})

export const StarsCalculationOutputSchema = z.number().int().min(1, 'Stars must be positive integer')

// Схема для создания кнопки модели
export const ModelButtonInputSchema = z.object({
  modelId: z.string().min(1, 'Model ID is required'),
  aspectRatio: z.enum(['9:16', '16:9']),
  isRu: z.boolean(),
})

export const ModelButtonOutputSchema = z.string().min(1, 'Button text cannot be empty')

// Схема для данных пользователя из БД
export const UserDetailsSchema = z.object({
  telegram_id: z.string(),
  user_id: z.string().uuid().optional(),
  isExist: z.boolean(),
  stars: z.number().min(0),
  subscriptionType: z.string(),
  isSubscriptionActive: z.boolean(),
})

// Схема для параметров генерации видео
export const VideoGenerationParamsSchema = z.object({
  prompt: PromptSchema,
  modelId: z.string().min(1, 'Model ID required'),
  aspectRatio: z.enum(['9:16', '16:9']),
  duration: z.number().positive().optional(),
  cost: z.number().min(1, 'Cost must be positive'),
})

// Помощники для безопасного парсинга
export const safeParseContext = (ctx: any, schema = MyContextSchema) => {
  const result = schema.safeParse(ctx)
  if (!result.success) {
    console.error('🔍 [ZOD] Context validation failed:', result.error.issues)
    return { success: false, error: result.error, data: null }
  }
  return { success: true, error: null, data: result.data }
}

export const safeParseTextMessage = (ctx: any) => {
  console.log('🎉 [ZOD] USING NEW MERGE-BASED SCHEMA! Optional fields should work now! 🎉')
  const result = TextMessageContextSchema.safeParse(ctx)
  if (!result.success) {
    console.error('🔍 [ZOD] Text message validation failed:', result.error.issues)
    return { success: false, error: result.error, data: null }
  }
  console.log('✅ [ZOD] Text message validation PASSED! Fixed!')
  return { success: true, error: null, data: result.data }
}

export const safeParseModelConfig = (config: any) => {
  const result = VideoModelsConfigSchema.safeParse(config)
  if (!result.success) {
    console.error('🔍 [ZOD] Model config validation failed:', result.error.issues)
    return { success: false, error: result.error, data: null }
  }
  return { success: true, error: null, data: result.data }
}

// Типы TypeScript из Zod схем
export type TelegramUser = z.infer<typeof TelegramUserSchema>
export type TelegramMessage = z.infer<typeof TelegramMessageSchema>
export type TextMessageContext = z.infer<typeof TextMessageContextSchema>
export type SelectedModel = z.infer<typeof SelectedModelSchema>
export type WizardSession = z.infer<typeof WizardSessionSchema>
export type VideoGenerationParams = z.infer<typeof VideoGenerationParamsSchema>
export type UserDetails = z.infer<typeof UserDetailsSchema>
export type ParsedModelSelection = z.infer<typeof ParsedModelSelectionSchema>