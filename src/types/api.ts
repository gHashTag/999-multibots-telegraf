export interface NeurophotoWebhookBody {
  task_id: string
  status:
    | 'processing'
    | 'completed'
    | 'failed'
    | 'Content Moderated'
    | 'GENERATED CONTENT MODERATED'
  result?: {
    url?: string
    urls?: string[]
    error?: string
  }
}

export interface PaymentWebhookBody {
  [key: string]: unknown
}

export interface TaskData {
  telegram_id: string
  bot_name: string
  language_code?: string
  prompt?: string
  settings?: Record<string, unknown>
}

// Расширяем типы Express
declare module 'express' {
  interface Request {
    rawBody?: string
  }
}

// Для типизации multer
export interface MulterCallback {
  (error: Error | null, destination: string): void
}

export interface MulterFileCallback {
  (error: Error | null, filename: string): void
}
