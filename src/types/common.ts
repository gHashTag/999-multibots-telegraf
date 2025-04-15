// Базовые типы
export type TelegramId = string // ID пользователя в Telegram
export type UUID = string // Уникальный идентификатор
export type ISODate = string // Дата в формате ISO

// Утилиты для типов
export type Nullable<T> = T | null
export type Optional<T> = T | undefined
export type Result<T, E = Error> = {
  success: boolean
  data?: T
  error?: E
}

// Общие интерфейсы
export interface Timestamps {
  created_at: Date
  updated_at: Date
}

export interface Pagination {
  limit?: number
  offset?: number
}

export interface WithId {
  id: UUID
}

// Утилиты для работы с типами
export type WithTimestamps<T> = T & Timestamps
export type WithPagination<T> = T & Pagination
export type Entity<T> = T & WithId & Timestamps

// Общие типы для ответов API
export interface ApiResponse<T> {
  data: T
  error: null | {
    message: string
    code: string
  }
  successful: boolean
}

// Общие типы для фильтров
export interface DateRange {
  from_date?: Date
  to_date?: Date
}

// Общие типы для сортировки
export type SortDirection = 'asc' | 'desc'
export interface SortOptions {
  field: string
  direction: SortDirection
}

// Общие типы для поиска
export interface SearchOptions {
  query: string
  fields: string[]
}

// Общие типы для статистики
export interface TimeSeriesData<T> {
  timestamp: Date
  value: T
}

// Общие типы для метаданных
export interface Metadata {
  [key: string]: any
}

// Общие типы для конфигурации
export interface Config {
  [key: string]: string | number | boolean | null
}

// Общие типы для логов
export interface Log {
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  timestamp: Date
  metadata?: Metadata
}

// Общие типы для событий
export interface Event<T = any> {
  type: string
  payload: T
  timestamp: Date
  metadata?: Metadata
}

// Общие типы для кэширования
export interface CacheOptions {
  ttl?: number // Time to live in seconds
  tags?: string[]
}

// Общие типы для валидации
export interface ValidationError {
  field: string
  message: string
  code: string
}

export interface ValidationResult {
  valid: boolean
  errors?: ValidationError[]
}

export interface CustomError extends Error {
  message: string
  stack?: string
  response?: {
    status?: number
    data?: any
    error_code?: number
    description?: string
  }
}

export interface ErrorResponse {
  error: string
  stack?: string
  status?: number
  responseData?: any
}

export interface SuccessResponse<T> {
  success: true
  data: T
}

export interface ErrorResult {
  success: false
  error: string
  details?: any
}

export type Result<T> = SuccessResponse<T> | ErrorResult
