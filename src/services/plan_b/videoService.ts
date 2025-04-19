import { downloadFile } from '@/helpers'
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
      console.log(videoLocalPath, 'videoLocalPath')
      await mkdir(path.dirname(videoLocalPath), { recursive: true })

      const videoBuffer = await downloadFile(videoUrl)
      await writeFile(videoLocalPath, videoBuffer)

      return videoLocalPath
    } catch (error) {
      console.error('Error processing video:', error)
      throw error
    }
  }
}
