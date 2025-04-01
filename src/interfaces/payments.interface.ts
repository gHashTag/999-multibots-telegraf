export interface BalanceOperationResult {
  newBalance: number
  success: boolean
  modePrice: number
  error?: string
}

export type PaymentService =
  | 'NeuroPhoto'
  | 'Text to speech'
  | 'Image to video'
  | 'Text to image'
  | 'Training'
  | 'Refund'
  | 'System'
  | 'Telegram'
  | 'Robokassa'
  | 'Unknown'
