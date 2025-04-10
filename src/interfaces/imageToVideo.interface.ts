import { BalanceOperationResult, BalanceOperationSuccessResult, BalanceOperationErrorResult } from './payments.interface'

export interface ImageToVideoSuccessResult extends BalanceOperationSuccessResult {
  videoUrl: string | string[]
}

export interface ImageToVideoErrorResult extends BalanceOperationErrorResult {
  videoUrl?: string | string[]
}

export type ImageToVideoResult = ImageToVideoSuccessResult | ImageToVideoErrorResult

export interface ImageToVideoResponse {
  success: boolean
  videoUrl?: string
  message?: string
  prompt_id?: number
} 