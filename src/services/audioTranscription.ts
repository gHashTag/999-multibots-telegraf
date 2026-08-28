import axios from 'axios'
import FormData from 'form-data'
import fs from 'fs'
import path from 'path'
import { logger } from '@/utils/logger'
import { openai } from '@/core/openai'

interface AudioTranscriptionResult {
  success: boolean
  text?: string
  error?: string
  language?: string
  duration?: number
}

/**
 * Transcribe audio file to text using OpenAI Whisper API
 */
export async function transcribeAudioFile(
  audioFilePath: string
): Promise<AudioTranscriptionResult> {
  try {
    // Check if file exists
    if (!fs.existsSync(audioFilePath)) {
      logger.error('[AudioTranscription] Audio file not found', {
        audioFilePath,
      })
      return {
        success: false,
        error: 'Audio file not found',
      }
    }

    // OpenAI client is initialized lazily via @/core/openai

    // Create form data with audio file
    const formData = new FormData()
    formData.append('file', fs.createReadStream(audioFilePath))
    formData.append('model', 'whisper-1')
    formData.append('language', 'ru') // Support Russian by default
    formData.append('response_format', 'json')

    logger.info('[AudioTranscription] Sending audio to OpenAI Whisper', {
      filePath: audioFilePath,
      fileSize: fs.statSync(audioFilePath).size,
    })

    // Use OpenAI client for transcription
    const response = (await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioFilePath) as any,
      model: 'whisper-1',
      language: 'ru',
      response_format: 'json',
    })) as any

    if (response.data && response.data.text) {
      logger.info('[AudioTranscription] Transcription successful', {
        textLength: response.data.text.length,
        language: response.data.language,
      })

      return {
        success: true,
        text: response.data.text,
        language: response.data.language,
        duration: response.data.duration,
      }
    } else {
      logger.error('[AudioTranscription] Unexpected response format', {
        response: response.data,
      })
      return {
        success: false,
        error: 'Unexpected response format from transcription service',
      }
    }
  } catch (error: any) {
    logger.error('[AudioTranscription] Error transcribing audio', {
      error: error.message,
      response: error.response?.data,
    })

    // Handle specific error cases
    if (error.response?.status === 401) {
      return {
        success: false,
        error: 'Invalid API credentials',
      }
    } else if (error.response?.status === 413) {
      return {
        success: false,
        error: 'Audio file too large (max 25MB)',
      }
    } else if (error.response?.status === 429) {
      return {
        success: false,
        error: 'Too many requests, please try again later',
      }
    }

    return {
      success: false,
      error: error.message || 'Failed to transcribe audio',
    }
  }
}

/**
 * Download and transcribe audio from URL (e.g., Telegram file URL)
 */
export async function transcribeAudioFromUrl(
  audioUrl: string
): Promise<AudioTranscriptionResult> {
  const tempFilePath = path.join(
    process.cwd(),
    'temp',
    `audio_${Date.now()}.ogg`
  )

  try {
    // Ensure temp directory exists
    const tempDir = path.dirname(tempFilePath)
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }

    logger.info('[AudioTranscription] Downloading audio from URL', { audioUrl })

    // Download audio file
    const response = await axios.get(audioUrl, {
      responseType: 'stream',
      timeout: 30000,
    })

    // Save to temporary file
    const writer = fs.createWriteStream(tempFilePath)
    response.data.pipe(writer)

    await new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(undefined))
      writer.on('error', reject)
    })

    logger.info(
      '[AudioTranscription] Audio downloaded, starting transcription',
      {
        tempFilePath,
        fileSize: fs.statSync(tempFilePath).size,
      }
    )

    // Transcribe the downloaded file
    const result = await transcribeAudioFile(tempFilePath)

    // Clean up temporary file
    try {
      fs.unlinkSync(tempFilePath)
    } catch (cleanupError) {
      logger.warn('[AudioTranscription] Failed to cleanup temp file', {
        error: cleanupError,
      })
    }

    return result
  } catch (error: any) {
    // Clean up temporary file on error
    try {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath)
      }
    } catch (cleanupError) {
      logger.warn('[AudioTranscription] Failed to cleanup temp file on error', {
        error: cleanupError,
      })
    }

    logger.error('[AudioTranscription] Error downloading/transcribing audio', {
      error: error.message,
      audioUrl,
    })

    return {
      success: false,
      error: error.message || 'Failed to download and transcribe audio',
    }
  }
}
