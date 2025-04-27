import axios from 'axios'
import { isDev, API_SERVER_URL, LOCAL_SERVER_URL } from '@/config'
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
    const url = `${isDev ? LOCAL_SERVER_URL : API_SERVER_URL}/video/upload`
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
