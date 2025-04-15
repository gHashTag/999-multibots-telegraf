// Типы для конфигурации базы данных
export interface DatabaseConfig {
  host: string
  port: number
  database: string
  user: string
  password: string
  ssl?: boolean
  max_connections?: number
  idle_timeout?: number
}

// Типы для конфигурации Redis
export interface RedisConfig {
  host: string
  port: number
  password?: string
  db?: number
  tls?: boolean
}

// Типы для конфигурации Telegram
export interface TelegramConfig {
  token: string
  webhook_url?: string
  admin_ids: string[]
  allowed_updates?: string[]
  drop_pending_updates?: boolean
}

// Типы для конфигурации платежной системы
export interface PaymentConfig {
  merchant_id: string
  secret_key: string
  webhook_secret: string
  test_mode: boolean
  success_url: string
  cancel_url: string
  currency: string
  commission_rate: number
}

// Типы для конфигурации логирования
export interface LogConfig {
  level: 'debug' | 'info' | 'warn' | 'error'
  format: 'json' | 'text'
  output: 'console' | 'file'
  file_path?: string
  max_size?: number
  max_files?: number
  compress?: boolean
}

// Типы для конфигурации кэширования
export interface CacheConfig {
  ttl: number
  check_period: number
  max_size: number
}

// Типы для конфигурации безопасности
export interface SecurityConfig {
  jwt_secret: string
  jwt_expires_in: string
  bcrypt_rounds: number
  rate_limit: {
    window_ms: number
    max_requests: number
  }
}

// Типы для конфигурации API
export interface ApiConfig {
  port: number
  host: string
  cors: {
    origin: string | string[]
    credentials: boolean
  }
  rate_limit: {
    window_ms: number
    max_requests: number
  }
}

// Типы для конфигурации мониторинга
export interface MonitoringConfig {
  enabled: boolean
  port: number
  path: string
  collect_default_metrics: boolean
  push_gateway?: {
    url: string
    job_name: string
    interval: number
  }
}

// Объединенная конфигурация
export interface AppConfig {
  env: 'development' | 'production' | 'test'
  debug: boolean
  database: DatabaseConfig
  redis: RedisConfig
  telegram: TelegramConfig
  payment: PaymentConfig
  logging: LogConfig
  cache: CacheConfig
  security: SecurityConfig
  api: ApiConfig
  monitoring: MonitoringConfig

  // Дополнительные настройки
  temp_dir: string
  upload_dir: string
  max_upload_size: number
  maintenance_mode: boolean
  version: string
}
