/**
 * HeyGen Service Stub
 * Заглушка для функциональности HeyGen (генерация аватаров)
 */

export interface HeyGenVideoRequest {
  avatar_speech: string
  avatar_id: string
  voice_id: string
}

export interface HeyGenVideoResponse {
  video_id: string
  status: string
}

export interface HeyGenCompletionResponse {
  video_url?: string
  duration?: number
  status: string
}

export class HeyGenService {
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
    console.log('[HEYGEN STUB] Service initialized (stub mode)')
  }

  async generateAvatarVideo(
    request: HeyGenVideoRequest
  ): Promise<HeyGenVideoResponse> {
    console.log('[HEYGEN STUB] Generating avatar video', {
      avatar_id: request.avatar_id,
      voice_id: request.voice_id,
      speech_length: request.avatar_speech.length,
    })

    return {
      video_id: `heygen_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      status: 'processing',
    }
  }

  async waitForCompletion(
    videoId: string,
    maxWaitMs: number = 600000,
    pollIntervalMs: number = 10000
  ): Promise<HeyGenCompletionResponse> {
    console.log(`[HEYGEN STUB] Waiting for completion: ${videoId}`)

    // Stub: return success immediately
    return {
      video_url: `https://stub.heygen.com/videos/${videoId}.mp4`,
      duration: 30,
      status: 'completed',
    }
  }

  async createVideo(params: any): Promise<string> {
    console.log('[HEYGEN STUB] Creating video with params:', params)

    return `heygen_${Date.now()}_${Math.random().toString(36).substring(7)}`
  }

  async getVideoStatus(videoId: string): Promise<any> {
    console.log(`[HEYGEN STUB] Getting video status: ${videoId}`)

    return {
      video_id: videoId,
      status: 'completed',
      data: {
        video_url: `https://stub.heygen.com/videos/${videoId}.mp4`,
        duration: 30,
      },
    }
  }
}
