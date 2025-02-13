import axios from 'axios'
import { isDev } from '@/config'
interface UploadVideoRequest {
  videoUrl: string
  telegram_id: string
  fileName: string
}

export async function uploadVideoToServer(
  requestData: UploadVideoRequest
): Promise<void> {
  try {
    console.log('CASE 1: uploadVideoToServer')
    const url = `${
      isDev ? 'http://localhost:3000' : process.env.ELESTIO_URL
    }/video/upload`
    const response = await axios.post(url, requestData, {
      headers: {
        'Content-Type': 'application/json',
      },
    })

    console.log('Video upload response:', response.data)
  } catch (error) {
    console.error('Error uploading video:', error)
    throw error
  }
}
