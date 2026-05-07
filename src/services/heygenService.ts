/**
 * HeyGen Service Stub (Alternative)
 * Заглушка для функциональности HeyGen - альтернативный импорт
 */

export interface HeyGenVideoInput {
  character: {
    type: string
    avatar_id: string
    avatar_style?: string
    scale?: number
  }
  voice: {
    type: string
    voice_id: string
    input_text: string
    speed?: number
  }
}

export interface HeyGenCreateVideoParams {
  video_inputs: HeyGenVideoInput[]
  dimension: {
    width: number
    height: number
  }
  title?: string
  caption?: boolean
}

export class HeyGenService {
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
    console.log('[HEYGEN SERVICE STUB] Service initialized (stub mode)')
  }

  async createVideo(params: HeyGenCreateVideoParams): Promise<string> {
    console.log('[HEYGEN SERVICE STUB] Creating video', {
      video_inputs: params.video_inputs?.length,
      dimension: params.dimension,
      title: params.title
    })

    return `heygen_service_${Date.now()}_${Math.random().toString(36).substring(7)}`
  }

  async waitForCompletion(
    videoId: string,
    maxWaitMs: number = 600000,
    pollIntervalMs: number = 10000
  ): Promise<any> {
    console.log(`[HEYGEN SERVICE STUB] Waiting for completion: ${videoId}`)

    // Stub: return success immediately
    return {
      status: 'completed',
      data: {
        video_url: `https://stub.heygenservice.com/videos/${videoId}.mp4`,
        duration: 30
      }
    }
  }

  async getVideoStatus(videoId: string): Promise<any> {
    console.log(`[HEYGEN SERVICE STUB] Getting video status: ${videoId}`)

    return {
      video_id: videoId,
      status: 'completed',
      data: {
        video_url: `https://stub.heygenservice.com/videos/${videoId}.mp4`,
        duration: 30
      }
    }
  }
}
