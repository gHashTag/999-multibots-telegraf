import type { VideoService } from '@/modules/videoService'

// --- Interfaces for Dependencies ---

/**
 * Упрощенный интерфейс логгера для модуля.
 */
export interface MinimalLogger {
  info: (message: string, ...meta: any[]) => void
  error: (message: string, ...meta: any[]) => void
  warn: (message: string, ...meta: any[]) => void
}

// --- Request and Response Types --- //

export interface UploadVideoServiceRequest {
  videoUrl: string
  telegram_id: number | string // Allow string for flexibility
  fileName: string
}

export interface UploadVideoServiceResponse {
  localPath: string
}

// --- Dependency Injection Container --- //

/**
 * Зависимости, необходимые для модуля uploadVideoService.
 */
export interface UploadVideoServiceDependencies {
  logger: MinimalLogger
  videoService: Pick<VideoService, 'processVideo'> // Зависим только от метода processVideo
}
