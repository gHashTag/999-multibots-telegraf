import { downloadFile } from '@/helpers'
import { logger } from '@/utils/enhancedLogger'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'

export class VideoService {
  public async processVideo(
    videoUrl: string,
    telegramId: number,
    fileName: string
  ): Promise<string> {
    try {
      const videoLocalPath = path.join(
        __dirname,
        '../uploads',
        telegramId.toString(),
        'videos',
        fileName
      )
      logger.debug(videoLocalPath, 'videoLocalPath')
      await mkdir(path.dirname(videoLocalPath), { recursive: true })

      const videoBuffer = await downloadFile(videoUrl)
      const u8 = new Uint8Array(videoBuffer)
      await writeFile(videoLocalPath, u8)

      return videoLocalPath
    } catch (error) {
      logger.error('Error processing video:', error)
      throw error
    }
  }
}
