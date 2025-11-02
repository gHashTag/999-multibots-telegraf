/**
 * Common Types for Inngest Functions
 * Centralized type definitions shared across all functions
 */

// ===== BASE TYPES =====

/**
 * Base event data shared by all Inngest functions
 */
export interface BaseEventData {
  telegramId: string
  timestamp?: string
  userId?: string
  username?: string
  firstName?: string
}

/**
 * Base function result
 */
export interface BaseResult {
  success: boolean
  timestamp: string
  processingTime?: number
}

/**
 * Base success result
 */
export interface SuccessResult<T = any> extends BaseResult {
  success: true
  data: T
}

/**
 * Base error result
 */
export interface ErrorResult extends BaseResult {
  success: false
  error: string
  errorCode?: string
  context?: any
}

/**
 * Union type for function results
 */
export type FunctionResult<T = any> = SuccessResult<T> | ErrorResult

// ===== CONTENT TYPES =====

/**
 * Content generation event
 */
export interface ContentGenerationEvent extends BaseEventData {
  prompt: string
  style?: string
  language?: string
  length?: 'short' | 'medium' | 'long'
  projectId?: number
}

/**
 * Content generation result
 */
export interface ContentGenerationResult extends SuccessResult<{
  scripts: {
    script_v1: string
    script_v2: string
    script_v3: string
  }
  metadata: {
    language: string
    length: string
    style?: string
  }
}> {}

// ===== INSTAGRAM TYPES =====

/**
 * Instagram event
 */
export interface InstagramEvent extends BaseEventData {
  reelId: string
  reelUrl: string
  projectId: number
  action: 'analyze' | 'extract' | 'scrape'
}

/**
 * Instagram scraping result
 */
export interface InstagramScrapingResult extends SuccessResult<{
  reelData: {
    id: string
    reel_id: string
    caption: string | null
    audio_url: string | null
    thumbnail_url: string | null
    video_url: string | null
    duration: number
    like_count: number
    comment_count: number
    view_count: number
    username: string
    created_at: string
  }
  transcript?: string
  analysis?: {
    category: string
    engagement_score: number
    hashtags: string[]
    mentions: string[]
  }
}> {}

// ===== RENDER TYPES =====

/**
 * Render event
 */
export interface RenderEvent extends BaseEventData {
  jobId: string
  templateUrl: string
  jobJsonUrl: string
  compositionName: string
  renderType: 'create' | 'update'
  serverUrl: string
  serverPort: number
  serverUser: string
  callbackUrl?: string
}

/**
 * Render result
 */
export interface RenderResult extends SuccessResult<{
  jobId: string
  downloadUrl: string
  fileSize: number
  renderTime: number
  serverInfo: {
    serverUrl: string
    serverPort: number
    serverUser: string
  }
}> {}

// ===== PAYMENT TYPES =====

/**
 * Payment event
 */
export interface PaymentEvent extends BaseEventData {
  paymentId: string
  amount: number
  currency: string
  paymentMethod: 'card' | 'sbp' | 'bank'
  metadata?: Record<string, any>
}

/**
 * Payment processing result
 */
export interface PaymentProcessingResult extends SuccessResult<{
  paymentId: string
  transactionId: string
  amount: number
  currency: string
  status: 'completed' | 'pending' | 'failed'
  paymentMethod: string
  metadata?: Record<string, any>
}> {}

// ===== TRAINING TYPES =====

/**
 * Model training event
 */
export interface TrainingEvent extends BaseEventData {
  modelId: string
  trainingType: 'image' | 'video' | 'text'
  epochs: number
  learningRate: number
  trainingData?: {
    imageUrls?: string[]
    videoUrls?: string[]
    textData?: string[]
  }
}

/**
 * Model training result
 */
export interface ModelTrainingResult extends SuccessResult<{
  modelId: string
  status: 'started' | 'running' | 'completed' | 'failed'
  epochs: number
  currentEpoch?: number
  metrics?: {
    loss?: number
    accuracy?: number
    val_loss?: number
    val_accuracy?: number
  }
  modelUrl?: string
  trainingTime?: number
}> {}

// ===== MONITORING TYPES =====

/**
 * Monitoring event
 */
export interface MonitoringEvent extends BaseEventData {
  type: 'error' | 'warning' | 'info' | 'performance'
  error?: string
  stack?: string
  endpoint?: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  context?: Record<string, any>
  userId?: string
}

/**
 * Monitoring analysis result
 */
export interface MonitoringAnalysisResult extends SuccessResult<{
  analysis: string
  solution: string
  urgency: 'immediate' | 'high' | 'normal'
  tags: string[]
  notificationSent: boolean
  alertLevel: 'red' | 'yellow' | 'green'
}> {}

// ===== BROADCAST TYPES =====

/**
 * Broadcast message event
 */
export interface BroadcastMessageEvent extends BaseEventData {
  message: string
  recipients: {
    type: 'all' | 'admins' | 'users' | 'list'
    userIds?: string[]
    filter?: {
      subscription?: 'active' | 'inactive'
      lastActivity?: number
    }
  }
  format: {
    parseMode: 'HTML' | 'Markdown'
    disableWebPagePreview: boolean
  }
  scheduleTime?: string
}

/**
 * Broadcast result
 */
export interface BroadcastResult extends SuccessResult<{
  broadcastId: string
  messageLength: number
  recipientsCount: number
  sentCount: number
  failedCount: number
  scheduleTime?: string
  recipients: Array<{
    userId: string
    username?: string
    status: 'sent' | 'failed'
    error?: string
  }>
}> {}

// ===== GENERATION TYPES =====

/**
 * Neuro image generation event
 */
export interface NeuroImageGenerationEvent extends BaseEventData {
  prompt: string
  negativePrompt?: string
  model: string
  width?: number
  height?: number
  steps?: number
  guidance?: number
  seed?: number
}

/**
 * Neuro image generation result
 */
export interface NeuroImageGenerationResult extends SuccessResult<{
  imageUrl: string
  seed?: number
  metadata: {
    model: string
    width: number
    height: number
    steps: number
    guidance: number
    prompt: string
    negativePrompt?: string
  }
}> {}

// ===== EXISTING FUNCTIONS TYPES =====

/**
 * AI Reels generation event
 */
export interface AIReelsGenerationEvent extends BaseEventData {
  imageUrl: string
  text?: string
  audioUrl?: string
  resolution?: '480p' | '720p' | '1080p'
  botName?: string
  webhookUrl?: string
}

/**
 * AI Reels generation result
 */
export interface AIReelsGenerationResult extends SuccessResult<{
  firstVideoUrl?: string
  secondVideoUrl?: string
  finalVideoUrl?: string
  processingTime: number
  metadata: {
    resolution: string
    botName?: string
    hasText: boolean
    hasAudio: boolean
  }
}> {}

// ===== STEP TYPES =====

/**
 * Step execution result
 */
export interface StepResult<T = any> {
  success: boolean
  data: T
  timestamp: string
  processingTime?: number
  metadata?: Record<string, any>
}

/**
 * Step error
 */
export interface StepError {
  success: false
  error: string
  stepName: string
  timestamp: string
  context?: any
}

// ===== CONFIGURATION TYPES =====

/**
 * Function configuration
 */
export interface FunctionConfig {
  id: string
  name: string
  retries?: {
    attempts: number
    delay?: string
  }
  rateLimit?: {
    limit: number
    period: string
    key?: string
  }
  concurrency?: number
  timeout?: string
}

/**
 * Event configuration
 */
export interface EventConfig {
  name: string
  schema?: any
  description?: string
}

// ===== UTILITY TYPES =====

/**
 * Pagination parameters
 */
export interface PaginationParams {
  limit?: number
  offset?: number
  orderBy?: string
  ascending?: boolean
}

/**
 * Filter parameters
 */
export interface FilterParams {
  [key: string]: string | number | boolean | null | undefined
}

/**
 * Search parameters
 */
export interface SearchParams {
  query?: string
  filters?: FilterParams
  pagination?: PaginationParams
}

// ===== ERROR TYPES =====

/**
 * Error categories
 */
export type ErrorCategory =
  | 'validation'
  | 'database'
  | 'external_api'
  | 'file_operation'
  | 'rendering'
  | 'training'
  | 'payment'
  | 'network'
  | 'authentication'
  | 'authorization'
  | 'rate_limit'
  | 'timeout'
  | 'unknown'

/**
 * Standardized error
 */
export interface StandardizedError {
  category: ErrorCategory
  code: string
  message: string
  details?: Record<string, any>
  timestamp: string
  telegramId?: string
  functionName?: string
  stepName?: string
  context?: Record<string, any>
  originalError?: any
}

// ===== METADATA TYPES =====

/**
 * Event metadata
 */
export interface EventMetadata {
  source: 'telegram' | 'api' | 'webhook' | 'cron' | 'manual'
  requestId?: string
  correlationId?: string
  userAgent?: string
  ipAddress?: string
  region?: string
  environment?: string
}

/**
 * Function metadata
 */
export interface FunctionMetadata {
  functionName: string
  version: string
  environment: string
  startTime: string
  endTime?: string
  processingTime?: number
  memoryUsage?: number
  cpuUsage?: number
  stepsCount?: number
  errorsCount?: number
  warningsCount?: number
}
