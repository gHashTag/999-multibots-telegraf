export interface ImageToVideoResponse {
  success: boolean
  videoUrl?: string
  message?: string
  prompt_id?: number
}

export interface GenerationResult {
  image: string | Buffer
  prompt_id: number
}

export type ModelUrl = `${string}/${string}:${string}`

export interface UserModel {
  model_name: string
  trigger_word: string
  model_url: ModelUrl
  model_key?: ModelUrl
  finetune_id?: string
}

export type VideoModel = 'minimax' | 'haiper' | 'ray' | 'i2vgen-xl'
