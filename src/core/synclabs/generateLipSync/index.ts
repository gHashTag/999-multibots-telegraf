import { isDev } from '@config'
import { supabase } from '../../supabase'
import axios from 'axios'

if (!process.env.SYNC_LABS_API_KEY) {
  throw new Error('SYNC_LABS_API_KEY is not set')
}

if (!process.env.LOCAL_SERVER_URL) {
  throw new Error('LOCAL_SERVER_URL is not set')
}

export async function generateLipSync(
  videoUrl: string,
  audioUrl: string,
  userId: string
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  // Добавляем API ключ только если он определен
  if (process.env.SYNC_LABS_API_KEY) {
    headers['x-api-key'] = process.env.SYNC_LABS_API_KEY
  }

  const webhookUrl = isDev
    ? `${process.env.LOCAL_SERVER_URL}/api/synclabs-webhook`
    : `${process.env.ORIGIN}/api/synclabs-webhook`
  console.log(webhookUrl, 'webhookUrl')

  try {
    const response = await axios.post(
      'https://api.sync.so/v2/generate',
      {
        model: 'lipsync-1.8.0-beta',
        input: [
          {
            type: 'video',
            url: videoUrl,
          },
          {
            type: 'audio',
            url: audioUrl,
          },
        ],
        options: { output_format: 'mp4' },
        webhookUrl,
      },
      { headers }
    )

    const data = response.data

    console.log(response.data, 'response.data')

    await supabase.from('synclabs_videos').insert({
      user_id: userId,
      video_id: data.id,
      status: 'processing',
    })

    return data
  } catch (error) {
    console.error('Ошибка при генерации видео:', error)
    throw error
  }
}

export async function getVideoStatus(videoId: string) {
  const { data, error } = await supabase
    .from('synclabs_videos')
    .select('*')
    .eq('video_id', videoId)
    .single()

  if (error) {
    throw error
  }

  return data
}
