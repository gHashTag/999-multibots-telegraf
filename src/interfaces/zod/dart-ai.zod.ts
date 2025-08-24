import { z } from 'zod'

// Enum для статуса задач
export const DartAITaskStatusEnum = z.enum([
  'todo',
  'in_progress',
  'done',
  'cancelled',
])
export type DartAITaskStatus = z.infer<typeof DartAITaskStatusEnum>

// Enum для приоритета задач
export const DartAITaskPriorityEnum = z.enum([
  'low',
  'medium',
  'high',
  'critical',
])
export type DartAITaskPriority = z.infer<typeof DartAITaskPriorityEnum>

// Enum для типа задач
export const DartAITaskTypeEnum = z.enum([
  'task',
  'bug',
  'feature',
  'improvement',
  'epic',
])
export type DartAITaskType = z.infer<typeof DartAITaskTypeEnum>

// Схема для пользователя Dart AI
export const DartAIUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  avatar: z.string().url().nullable(),
})
export type DartAIUser = z.infer<typeof DartAIUserSchema>

// Схема для метаданных задачи
export const DartAITaskMetadataSchema = z.record(z.any()).default({})
export type DartAITaskMetadata = z.infer<typeof DartAITaskMetadataSchema>

// Схема для пространства (space)
export const DartAISpaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  color: z.string().nullable(),
  is_archived: z.boolean().default(false),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  owner: DartAIUserSchema.optional(),
  members_count: z.number().default(0),
})
export type DartAISpace = z.infer<typeof DartAISpaceSchema>

// Основная схема для задачи Dart AI
export const DartAITaskSchema = z.object({
  id: z.string(),
  title: z.string().min(1, 'Title is required'),
  description: z.string().default(''),
  status: DartAITaskStatusEnum.default('todo'),
  priority: DartAITaskPriorityEnum.default('medium'),
  type: DartAITaskTypeEnum.default('task'),
  tags: z.array(z.string()).default([]),

  // Временные поля
  due_date: z.string().datetime().nullable(),
  start_date: z.string().datetime().nullable(),
  completed_at: z.string().datetime().nullable(),

  // Назначение
  assignee: DartAIUserSchema.nullable(),
  assignees: z.array(DartAIUserSchema).default([]),
  reporter: DartAIUserSchema.nullable(),

  // Иерархия
  parent_id: z.string().nullable(),
  subtasks: z.array(z.string()).default([]), // ID подзадач

  // Связи
  dependencies: z.array(z.string()).default([]), // ID задач, от которых зависит
  blocks: z.array(z.string()).default([]), // ID задач, которые блокирует

  // Оценка времени
  estimate_minutes: z.number().min(0).nullable(),
  time_spent_minutes: z.number().min(0).default(0),

  // Метаданные
  metadata: DartAITaskMetadataSchema,

  // Системные поля
  space_id: z.string(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  created_by: DartAIUserSchema.nullable(),
  updated_by: DartAIUserSchema.nullable(),

  // Поля для интеграции
  external_id: z.string().nullable(), // ID из внешней системы (например, GitHub Issue)
  external_url: z.string().url().nullable(), // Ссылка на внешнюю систему
})
export type DartAITask = z.infer<typeof DartAITaskSchema>

// Схема для создания новой задачи
export const CreateDartAITaskSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255, 'Title too long'),
  description: z.string().max(10000, 'Description too long').default(''),
  status: DartAITaskStatusEnum.default('todo'),
  priority: DartAITaskPriorityEnum.default('medium'),
  type: DartAITaskTypeEnum.default('task'),
  tags: z.array(z.string()).max(20, 'Too many tags').default([]),

  // Временные поля
  due_date: z.string().datetime().nullable().optional(),
  start_date: z.string().datetime().nullable().optional(),

  // Назначение
  assignee_id: z.string().nullable().optional(),
  assignee_ids: z.array(z.string()).max(10, 'Too many assignees').default([]),

  // Иерархия
  parent_id: z.string().nullable().optional(),

  // Связи
  dependency_ids: z
    .array(z.string())
    .max(50, 'Too many dependencies')
    .default([]),
  blocks_ids: z.array(z.string()).max(50, 'Too many blocks').default([]),

  // Оценка времени
  estimate_minutes: z
    .number()
    .min(0)
    .max(999999, 'Estimate too large')
    .nullable()
    .optional(),

  // Метаданные
  metadata: DartAITaskMetadataSchema.optional(),

  // Поля для интеграции
  external_id: z.string().nullable().optional(),
  external_url: z.string().url().nullable().optional(),
})
export type CreateDartAITaskRequest = z.infer<typeof CreateDartAITaskSchema>

// Схема для обновления задачи
export const UpdateDartAITaskSchema = CreateDartAITaskSchema.partial()
export type UpdateDartAITaskRequest = z.infer<typeof UpdateDartAITaskSchema>

// Схема для фильтрации задач
export const DartAITaskFilterSchema = z.object({
  status: z.array(DartAITaskStatusEnum).optional(),
  priority: z.array(DartAITaskPriorityEnum).optional(),
  type: z.array(DartAITaskTypeEnum).optional(),
  assignee_id: z.string().optional(),
  reporter_id: z.string().optional(),
  created_by_id: z.string().optional(),
  tags: z.array(z.string()).optional(),
  has_due_date: z.boolean().optional(),
  overdue: z.boolean().optional(),
  parent_id: z.string().nullable().optional(),
  search: z.string().max(255, 'Search query too long').optional(),
  created_after: z.string().datetime().optional(),
  created_before: z.string().datetime().optional(),
  updated_after: z.string().datetime().optional(),
  updated_before: z.string().datetime().optional(),
  limit: z.number().min(1).max(1000).default(50),
  offset: z.number().min(0).default(0),
})
export type DartAITaskFilter = z.infer<typeof DartAITaskFilterSchema>

// Схема для сортировки задач
export const DartAITaskSortSchema = z.object({
  field: z
    .enum(['created_at', 'updated_at', 'due_date', 'priority', 'title'])
    .default('created_at'),
  direction: z.enum(['asc', 'desc']).default('desc'),
})
export type DartAITaskSort = z.infer<typeof DartAITaskSortSchema>

// Схема для списка задач
export const DartAITaskListSchema = z.object({
  tasks: z.array(DartAITaskSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
  has_more: z.boolean(),
})
export type DartAITaskList = z.infer<typeof DartAITaskListSchema>

// Схема для списка пространств
export const DartAISpaceListSchema = z.object({
  spaces: z.array(DartAISpaceSchema),
  total: z.number(),
})
export type DartAISpaceList = z.infer<typeof DartAISpaceListSchema>

// Схема для ответа API
export const DartAIApiResponseSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: z.string().optional(),
  message: z.string().optional(),
  timestamp: z.string().datetime().optional(),
})
export type DartAIApiResponse<T = any> = {
  success: boolean
  data: T
  error?: string
  message?: string
  timestamp?: string
}

// Схема для синхронизации
export const DartAISyncResultSchema = z.object({
  created: z.number().min(0),
  updated: z.number().min(0),
  deleted: z.number().min(0),
  errors: z.array(
    z.object({
      task_id: z.string().optional(),
      error: z.string(),
      details: z.any().optional(),
    })
  ),
  total_processed: z.number().min(0),
  duration_ms: z.number().min(0),
})
export type DartAISyncResult = z.infer<typeof DartAISyncResultSchema>

// Схема для статистики задач
export const DartAITaskStatsSchema = z.object({
  total_tasks: z.number().min(0),
  by_status: z.record(DartAITaskStatusEnum, z.number()).default({}),
  by_priority: z.record(DartAITaskPriorityEnum, z.number()).default({}),
  by_type: z.record(DartAITaskTypeEnum, z.number()).default({}),
  overdue_count: z.number().min(0),
  completed_today: z.number().min(0),
  completed_this_week: z.number().min(0),
  avg_completion_time_hours: z.number().min(0),
})
export type DartAITaskStats = z.infer<typeof DartAITaskStatsSchema>

// Схема для комментария к задаче
export const DartAITaskCommentSchema = z.object({
  id: z.string(),
  task_id: z.string(),
  content: z.string(),
  author: DartAIUserSchema,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})
export type DartAITaskComment = z.infer<typeof DartAITaskCommentSchema>

// Схема для создания комментария
export const CreateDartAITaskCommentSchema = z.object({
  content: z
    .string()
    .min(1, 'Comment cannot be empty')
    .max(10000, 'Comment too long'),
})
export type CreateDartAITaskCommentRequest = z.infer<
  typeof CreateDartAITaskCommentSchema
>

// Валидационные хелперы
export const validateDartAITask = (data: unknown) =>
  DartAITaskSchema.parse(data)
export const validateCreateDartAITask = (data: unknown) =>
  CreateDartAITaskSchema.parse(data)
export const validateUpdateDartAITask = (data: unknown) =>
  UpdateDartAITaskSchema.parse(data)
export const validateDartAITaskFilter = (data: unknown) =>
  DartAITaskFilterSchema.parse(data)
export const validateDartAISyncResult = (data: unknown) =>
  DartAISyncResultSchema.parse(data)

// Схема для конфигурации интеграции
export const DartAIIntegrationConfigSchema = z.object({
  api_key: z.string().min(1, 'API key is required'),
  default_space_id: z.string().default('default'),
  auto_sync_enabled: z.boolean().default(false),
  sync_interval_minutes: z.number().min(5).max(1440).default(60), // от 5 минут до 24 часов
  webhook_secret: z.string().optional(),
  default_assignee_id: z.string().optional(),
  tag_prefix: z.string().max(20).default('telegram-bot'),
})
export type DartAIIntegrationConfig = z.infer<
  typeof DartAIIntegrationConfigSchema
>
