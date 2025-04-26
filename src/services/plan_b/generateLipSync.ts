import { WEBHOOK_URL } from '@/config'
import { saveVideoUrlToSupabase } from '@/core/supabase'
import axios, { type AxiosResponse } from 'axios'
import { PaymentStatus } from '@/interfaces/payments.interface'
import FormData from 'form-data'
import { API_URL, SECRET_API_KEY } from '@/config'

export type LipSyncStatus =
  | 'uploading'
  | 'processing'
  | 'completed'
  | PaymentStatus.COMPLETED
  | PaymentStatus.FAILED
  | PaymentStatus.PENDING
  | 'error'

export interface LipSyncResponse {
  id: string
  createdAt: string
  status: LipSyncStatus
  model: string
  input: Array<{
    url: string
    type: string
  }>
  webhookUrl: string
  options: {
    output_format: string
  }
  outputUrl: string | null
  outputDuration: number | null
  error: string | null
}

interface LipSyncError {
  message: string
}

type LipSyncResult = LipSyncResponse | LipSyncError

export async function generateLipSync(
  telegram_id: string,
  video: string,
  audio: string,
  is_ru: boolean
): Promise<LipSyncResult> {
  const url = 'https://api.sync.so/v2/generate'
  const body = {
    model: 'lipsync-1.9.0-beta',
    input: [
      {
        type: 'video',
        url: video,
      },
      {
        type: 'audio',
        url: audio,
      },
    ],
    options: {
      output_format: 'mp4',
    },
    webhookUrl: WEBHOOK_URL,
  }

  console.log(body, 'body')

  try {
    const response: AxiosResponse<LipSyncResponse> = await axios.post(
      url,
      body,
      {
        headers: {
          'x-api-key': process.env.SYNC_LABS_API_KEY as string,
          'Content-Type': 'application/json',
        },
      }
    )

    if (response.data?.id) {
      const videoId = response.data.id
      await saveVideoUrlToSupabase(telegram_id, videoId, '', 'lipsync')

      if (response.status === 200) {
        return response.data
      } else {
        console.error(`Error: ${response.status} ${response.statusText}`)
        return { message: 'Error generating lip sync' }
      }
    } else {
      console.error('No video ID found in response')
      return { message: 'No video ID found in response' }
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('API Error:', error.response?.data || error.message)
    } else {
      console.error('Unexpected error:', error)
    }
    return { message: 'Error occurred while generating lip sync' }
  }
}
