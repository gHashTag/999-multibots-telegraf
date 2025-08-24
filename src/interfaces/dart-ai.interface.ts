// Экспортируем все типы из ZOD схем
export * from './zod/dart-ai.zod'

// Дополнительные интерфейсы для удобства работы

/**
 * Опции для создания задачи из различных источников
 */
export interface TaskCreationOptions {
  spaceId?: string
  assigneeId?: string
  tags?: string[]
  priority?: 'low' | 'medium' | 'high' | 'critical'
  dueDate?: string
  metadata?: Record<string, any>
}

/**
 * Результат операции с задачей
 */
export interface TaskOperationResult {
  success: boolean
  taskId?: string
  error?: string
  data?: any
}

/**
 * Опции для синхронизации
 */
export interface SyncOptions {
  spaceId?: string
  batchSize?: number
  dryRun?: boolean
  forceUpdate?: boolean
  deleteNotFound?: boolean
}

/**
 * Webhook событие от Dart AI
 */
export interface DartAIWebhookEvent {
  event: 'task.created' | 'task.updated' | 'task.deleted' | 'task.completed'
  timestamp: string
  data: {
    task: any // DartAITask
    previous?: any // Предыдущее состояние для updated событий
    space_id: string
    user_id: string
  }
  signature?: string
}

/**
 * Конфигурация для интеграции с внешними системами
 */
export interface ExternalIntegrationConfig {
  github?: {
    enabled: boolean
    token: string
    repositories: string[]
    labelMapping: Record<string, string>
    defaultAssignee?: string
  }
  telegram?: {
    enabled: boolean
    adminIds: number[]
    notificationChannelId?: string
  }
  slack?: {
    enabled: boolean
    webhookUrl: string
    channel: string
  }
}

/**
 * Расширенные опции фильтрации для админских команд
 */
export interface AdminTaskFilter {
  userId?: string
  spaceId?: string
  dateRange?: {
    from: string
    to: string
  }
  includeCompleted?: boolean
  includeArchived?: boolean
  tag?: string
  assignee?: string
}

/**
 * Статистика для админского интерфейса
 */
export interface DartAIAdminStats {
  totalTasks: number
  tasksByStatus: Record<string, number>
  tasksByPriority: Record<string, number>
  overdueTasks: number
  recentActivity: Array<{
    type: 'created' | 'updated' | 'completed'
    taskId: string
    taskTitle: string
    timestamp: string
    user: string
  }>
  topSpaces: Array<{
    spaceId: string
    spaceName: string
    taskCount: number
  }>
  productivity: {
    completedToday: number
    completedThisWeek: number
    avgCompletionTime: number
  }
}

/**
 * Команды для админского интерфейса
 */
export type AdminCommand =
  | 'list_spaces'
  | 'list_tasks'
  | 'create_task'
  | 'update_task'
  | 'delete_task'
  | 'get_stats'
  | 'sync_github'
  | 'export_tasks'
  | 'import_tasks'

/**
 * Параметры админской команды
 */
export interface AdminCommandParams {
  command: AdminCommand
  args: Record<string, any>
  userId: number
  username?: string
}

/**
 * Результат выполнения админской команды
 */
export interface AdminCommandResult {
  success: boolean
  message: string
  data?: any
  error?: string
}

/**
 * Шаблоны задач для быстрого создания
 */
export interface TaskTemplate {
  id: string
  name: string
  description: string
  template: {
    title: string
    description: string
    type: 'task' | 'bug' | 'feature' | 'improvement' | 'epic'
    priority: 'low' | 'medium' | 'high' | 'critical'
    tags: string[]
    estimateMinutes?: number
    metadata?: Record<string, any>
  }
}

/**
 * Настройки уведомлений
 */
export interface NotificationSettings {
  taskCreated: boolean
  taskUpdated: boolean
  taskCompleted: boolean
  taskOverdue: boolean
  assignedToMe: boolean
  mentionedInComment: boolean
  channels: {
    telegram: boolean
    email: boolean
    slack: boolean
  }
}

/**
 * Bulk операции
 */
export interface BulkTaskOperation {
  operation: 'update' | 'delete' | 'move' | 'assign'
  taskIds: string[]
  params: Record<string, any>
}

/**
 * Результат bulk операции
 */
export interface BulkOperationResult {
  success: number
  failed: number
  errors: Array<{
    taskId: string
    error: string
  }>
  details: any[]
}

/**
 * Отчет по задачам
 */
export interface TaskReport {
  id: string
  title: string
  format: 'csv' | 'xlsx' | 'json' | 'pdf'
  filters: AdminTaskFilter
  generatedAt: string
  downloadUrl: string
  expiresAt: string
}

/**
 * Пагинация для админского интерфейса
 */
export interface AdminPagination {
  page: number
  limit: number
  total: number
  totalPages: number
  hasNext: boolean
  hasPrev: boolean
}

/**
 * Ответ с пагинацией
 */
export interface PaginatedResponse<T> {
  data: T[]
  pagination: AdminPagination
}

/**
 * Лог активности
 */
export interface ActivityLog {
  id: string
  timestamp: string
  userId: string
  username: string
  action: string
  target: string
  details: Record<string, any>
  ipAddress?: string
  userAgent?: string
}

/**
 * Настройки интеграции для конкретного бота
 */
export interface BotIntegrationSettings {
  botId: string
  botName: string
  enabled: boolean
  spaceId: string
  defaultAssigneeId?: string
  tagPrefix: string
  notifications: NotificationSettings
  permissions: {
    canCreateTasks: boolean
    canUpdateTasks: boolean
    canDeleteTasks: boolean
    canViewAllTasks: boolean
  }
}

/**
 * Метрики использования
 */
export interface UsageMetrics {
  period: {
    start: string
    end: string
  }
  tasksCreated: number
  tasksCompleted: number
  apiCalls: number
  activeUsers: number
  popularCommands: Array<{
    command: string
    count: number
  }>
  errorRate: number
  avgResponseTime: number
}
