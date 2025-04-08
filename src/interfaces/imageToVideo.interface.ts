export interface ImageToVideoEvent {
  name: string
  data: {
    telegram_id: string
    image_url: string
    prompt?: string
    is_ru?: boolean
    bot_name: string
    model_id?: string
    _test?: {
      api_error?: boolean
      insufficient_balance?: boolean
    }
  }
}
