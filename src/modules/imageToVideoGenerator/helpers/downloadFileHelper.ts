import axios, { isAxiosError } from 'axios'

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB - максимальный размер для Telegram

export async function downloadFileHelper(url: string): Promise<Buffer> {
  // Renamed function slightly
  try {
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
    console.error('Error downloading file (isolated helper): ', error) // Added context to log
    if (isAxiosError(error)) {
      console.error('Axios error details (isolated helper): ', {
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
    // Re-throw a more generic error, let the main function handle logging details if needed
    throw new Error(
      `Failed to download file: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    )
  }
}
