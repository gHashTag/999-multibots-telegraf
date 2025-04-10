export interface TextToVideoResult {
  success: boolean
  videoUrl?: string
  error?: string
}

export interface TextToVideoEvent {
  data: {
    prompt: string
    videoModel: string
    telegram_id: number
    username: string
    is_ru: boolean
    bot_name: string
  }
} 