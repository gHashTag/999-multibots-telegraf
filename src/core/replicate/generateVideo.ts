import { replicate } from '.'
import { supabase } from '@/core/supabase'
import axios, { isAxiosError } from 'axios'

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB - максимальный размер для Telegram

export const retry = async <T>(
  fn: () => Promise<T>,
  attempts = 3,
  delay = 1000
): Promise<T> => {
  try {
    return await fn()
  } catch (error) {
    if (attempts <= 1) throw error
    await new Promise(resolve => setTimeout(resolve, delay))
    return retry(fn, attempts - 1, delay * 2)
  }
}

export async function downloadFile(url: string): Promise<Buffer> {
  try {
    console.log('Downloading from URL:', url)

    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
      throw new Error(`Invalid URL received: ${url}`)
    }

    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 60000,
      maxRedirects: 5,
      validateStatus: status => status === 200,
    })

    if (!response.data) {
      throw new Error('Empty response data')
    }

    const buffer = Buffer.from(response.data)

    if (buffer.length > MAX_FILE_SIZE) {
      throw new Error(
        `File size (${buffer.length} bytes) exceeds Telegram limit of ${MAX_FILE_SIZE} bytes`
      )
    }

    return buffer
  } catch (error) {
    console.error('Error downloading file:', error)
    if (isAxiosError(error)) {
      console.error('Axios error details:', {
        response: error.response?.data,
        status: error.response?.status,
        headers: error.response?.headers,
        config: {
          url: error.config?.url,
          method: error.config?.method,
          headers: error.config?.headers,
        },
      })
    }
    throw new Error(
      `Failed to download file: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    )
  }
}

export const generateVideo = async (
  prompt: string,
  model: string,
  userId: string
): Promise<{ video: Buffer }> => {
  try {
    console.log('Starting video generation with model:', model)
    console.log('Prompt:', prompt)

    let output: unknown

    if (model === 'haiper') {
      const input = {
        prompt,
        duration: 6,
        aspect_ratio: '16:9',
        use_prompt_enhancer: true,
      }
      console.log('Haiper model input:', input)
      output = await replicate.run('haiper-ai/haiper-video-2', { input })
    } else {
      const input = {
        prompt,
        prompt_optimizer: true,
      }
      console.log('Minimax model input:', input)
      output = await replicate.run('minimax/video-01', { input })
    }

    console.log('Raw API output:', output)
    console.log('Output type:', typeof output)
    if (Array.isArray(output)) {
      console.log('Output is array of length:', output.length)
    }

    if (!output) {
      throw new Error('No video generated')
    }

    let videoUrl: string
    if (Array.isArray(output)) {
      if (!output[0]) {
        throw new Error('Empty array or first element is undefined')
      }
      videoUrl = output[0]
    } else if (typeof output === 'string') {
      videoUrl = output
    } else {
      console.error(
        'Unexpected output format:',
        JSON.stringify(output, null, 2)
      )
      throw new Error(`Unexpected output format from API: ${typeof output}`)
    }

    console.log('Final video URL:', videoUrl)

    const video = await downloadFile(videoUrl)
    console.log('Video downloaded successfully, size:', video.length, 'bytes')

    // Сохраняем в таблицу assets
    const { data, error } = await supabase.from('assets').insert({
      type: 'video',
      trigger_word: 'video',
      project_id: userId,
      storage_path: `videos/${model}/${new Date().toISOString()}`,
      public_url: videoUrl,
      text: prompt,
    })

    if (error) {
      console.error('Supabase error:', error)
    } else {
      console.log('Video metadata saved to database:', data)
    }

    return { video }
  } catch (error) {
    console.error('Error generating video:', error)
    if (error instanceof Error) {
      console.error('Error name:', error.name)
      console.error('Error message:', error.message)
      console.error('Error stack:', error.stack)
    }
    throw error
  }
}
