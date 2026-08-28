/**
 * KieAI Service Stub
 * Заглушка для функциональности KieAI (генерация видео)
 */

export interface KieVideoRequest {
  prompt: string
  seeds: number
  jobId?: string
  apiKey?: string
  brollPromptId?: string
  model?: string
  aspectRatio?: string
}

export interface KieVideoResponse {
  taskId: string
  status: string
}

export interface KieVideoStatus {
  status: 'processing' | 'success' | 'failed'
  video_urls?: string[]
  error?: string
}

export class KieAIService {
  private apiKey: string
  private supabase?: any

  constructor(apiKey: string, supabase?: any) {
    this.apiKey = apiKey
    this.supabase = supabase
    console.log('[KIE AI STUB] Service initialized (stub mode)')
  }

  async createVideo(request: KieVideoRequest): Promise<KieVideoResponse> {
    console.log('[KIE AI STUB] Creating video', {
      prompt: request.prompt.substring(0, 50),
      seeds: request.seeds,
      model: request.model,
      aspectRatio: request.aspectRatio,
    })

    const taskId = `kie_${Date.now()}_${Math.random().toString(36).substring(7)}`

    // If supabase is provided, save to database
    if (this.supabase && request.jobId && request.brollPromptId) {
      await this.supabase
        .from('kie_veo3_videos')
        .insert({
          job_id: request.jobId,
          broll_prompt_id: request.brollPromptId,
          task_id: taskId,
          prompt: request.prompt,
          seeds: request.seeds,
          status: 'processing',
        })
        .catch((err: any) => {
          console.error('[KIE AI STUB] Failed to save to database:', err)
        })
    }

    return {
      taskId,
      status: 'processing',
    }
  }

  async checkStatus(taskId: string): Promise<KieVideoStatus> {
    console.log(`[KIE AI STUB] Checking status: ${taskId}`)

    return {
      status: 'success',
      video_urls: [`https://stub.kieai.com/videos/${taskId}.mp4`],
    }
  }

  async waitForCompletion(
    taskId: string,
    maxWaitMs: number = 300000,
    pollIntervalMs: number = 5000
  ): Promise<KieVideoStatus> {
    console.log(`[KIE AI STUB] Waiting for completion: ${taskId}`)

    // Stub: return success immediately
    return {
      status: 'success',
      video_urls: [`https://stub.kieai.com/videos/${taskId}.mp4`],
    }
  }

  async getVideo(taskId: string): Promise<any> {
    console.log(`[KIE AI STUB] Getting video: ${taskId}`)

    return {
      task_id: taskId,
      status: 'success',
      video_urls: [`https://stub.kieai.com/videos/${taskId}.mp4`],
    }
  }
}
