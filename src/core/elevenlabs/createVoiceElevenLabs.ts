import { v4 as uuidv4 } from 'uuid'
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import os from 'os'
import FormData from 'form-data'
import logger from '@/utils/logger'

export class ElevenLabsVoiceLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ElevenLabsVoiceLimitError'
  }
}

async function downloadVoiceMessage(fileUrl: string, downloadPath: string) {
  logger.info('[downloadVoiceMessage] Starting download', {
    fileUrl,
    downloadPath,
  })
  const writer = fs.createWriteStream(downloadPath)
  logger.info('[downloadVoiceMessage] Writer created. Attempting axios GET', {
    fileUrl,
  })
  const response = await axios({
    url: fileUrl,
    method: 'GET',
    responseType: 'stream',
  })
  logger.info(
    '[downloadVoiceMessage] Axios GET successful. Piping stream to writer.',
    { fileUrl }
  )

  response.data.pipe(writer)

  return new Promise((resolve, reject) => {
    logger.info(
      '[downloadVoiceMessage] Waiting for writer finish/error events.',
      { fileUrl }
    )
    writer.on('error', err => {
      logger.error('[downloadVoiceMessage] Writer error event.', {
        fileUrl,
        error: err,
      })
      reject(err)
    })
    writer.on('finish', () => {
      logger.info('[downloadVoiceMessage] Writer finish event.', { fileUrl })
      resolve(undefined)
    })
  })
}

export async function createVoiceElevenLabs({
  fileUrl,
  username,
}: {
  fileUrl: string
  username: string
}): Promise<string | null> {
  const uniqueFileName = `${uuidv4()}.oga`
  const downloadPath = path.join(os.tmpdir(), uniqueFileName)
  logger.info('[createVoiceElevenLabs] Starting process', {
    username,
    fileUrl,
    downloadPath,
  })

  try {
    logger.info(
      '[createVoiceElevenLabs] Attempting to download voice message.',
      { fileUrl }
    )
    await downloadVoiceMessage(fileUrl, downloadPath)
    logger.info(
      '[createVoiceElevenLabs] Voice message download finished. Preparing FormData.',
      { downloadPath }
    )

    const form = new FormData()
    form.append('name', username)
    form.append('description', 'Voice created from Telegram voice message')

    const fileStream = fs.createReadStream(downloadPath)
    form.append('files', fileStream)

    form.append('labels', JSON.stringify({ accent: 'neutral' }))

    const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY
    if (!elevenLabsApiKey) {
      logger.error('[createVoiceElevenLabs] ELEVENLABS_API_KEY is not set.')
      console.error('ELEVENLABS_API_KEY is not set.')
      console.warn(
        '[MOCK_MODE] ELEVENLABS_API_KEY not set, would return mock/error here in production'
      )
      return null
    }
    logger.info(
      '[createVoiceElevenLabs] API Key found. Preparing to POST to ElevenLabs.',
      { username }
    )

    const url = 'https://api.elevenlabs.io/v1/voices/add'

    logger.info(
      '[createVoiceElevenLabs] Attempting axios POST to ElevenLabs API.',
      { url, username }
    )
    const response = await axios.post(url, form, {
      headers: {
        ...form.getHeaders(),
        'xi-api-key': elevenLabsApiKey,
      },
    })
    logger.info('[createVoiceElevenLabs] Axios POST to ElevenLabs finished.', {
      username,
      status: response.status,
    })

    if (response.status === 200 || response.status === 201) {
      const result = response.data as { voice_id: string }
      logger.info('[createVoiceElevenLabs] Voice created successfully.', {
        username,
        voiceId: result.voice_id,
      })
      return result.voice_id
    } else {
      logger.error(
        `[createVoiceElevenLabs] Error adding voice, status: ${response.status}`,
        { username, statusText: response.statusText, data: response.data }
      )
      throw new Error(`ElevenLabs API returned status ${response.status}`)
    }
  } catch (error: any) {
    if (
      axios.isAxiosError(error) &&
      error.response?.data?.detail?.status === 'voice_limit_reached'
    ) {
      logger.warn('[createVoiceElevenLabs] ElevenLabs voice limit reached.', {
        username,
        data: error.response.data.detail,
      })
      throw new ElevenLabsVoiceLimitError(error.response.data.detail.message)
    } else if (axios.isAxiosError(error)) {
      logger.error('[createVoiceElevenLabs] Axios error.', {
        username,
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
      })
      throw new Error(`ElevenLabs API request failed: ${error.message}`)
    } else {
      logger.error('[createVoiceElevenLabs] Generic error.', {
        username,
        error,
      })
      throw new Error(
        `An unexpected error occurred while creating voice: ${error.message}`
      )
    }
  } finally {
    if (fs.existsSync(downloadPath)) {
      try {
        fs.unlinkSync(downloadPath)
      } catch (unlinkError) {
        console.error('Error deleting temporary voice file:', unlinkError)
      }
    }
  }
}
