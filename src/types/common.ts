export type TelegramId = string

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
