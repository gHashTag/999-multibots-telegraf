export interface AudioToTextResponse {
  text: string
  confidence: number
  language: string
  duration: number
}

export interface VoiceToTextConfig {
  maxFileSize?: number
  supportedFormats?: string[]
  language?: string
}
