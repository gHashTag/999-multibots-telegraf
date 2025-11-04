/**
 * HeyGen Service
 * Заглушка для сервиса HeyGen
 */

export interface HeyGenAvatar {
  id: string
  status: string
  video_url?: string
}

export class HeyGenService {
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async createAvatarVideo(avatarId: string, text: string): Promise<string> {
    // Заглушка для создания видео с аватаром
    console.log(`Creating HeyGen avatar video: ${avatarId}`)
    return `heygen-video-${Date.now()}`
  }

  async getVideoStatus(videoId: string): Promise<HeyGenAvatar> {
    // Заглушка для получения статуса видео
    console.log(`Checking HeyGen video status: ${videoId}`)
    return {
      id: videoId,
      status: 'completed',
      video_url: 'https://example.com/video.mp4',
    }
  }

  async waitForCompletion(videoId: string, maxWaitTime: number = 300000): Promise<HeyGenAvatar> {
    // Заглушка для ожидания завершения
    console.log(`Waiting for HeyGen video completion: ${videoId}`)
    return {
      id: videoId,
      status: 'completed',
      video_url: 'https://example.com/video.mp4',
    }
  }
}

export default HeyGenService
