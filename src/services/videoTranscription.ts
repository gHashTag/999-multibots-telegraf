import fs, { createReadStream } from 'fs'
import path from 'path'
import https from 'https'
import { promisify } from 'util'
import { pipeline } from 'node:stream'
import axios from 'axios'
import FormData from 'form-data'
import {
  downloadInstagramVideoViaApify,
  downloadInstagramVideoViaApifyFallback,
} from './apifyInstagramDownloader'
import { openai } from '@/core/openai'

const pipelineAsync = promisify(pipeline)

interface TranscriptionResult {
  success: boolean
  text?: string
  error?: string
  videoPath?: string
  metadata?: {
    duration?: number
    language?: string
    confidence?: number
  }
}

interface VideoDownloadResult {
  success: boolean
  videoPath?: string
  error?: string
  videoUrl?: string
}

class VideoTranscriptionService {
  private tempDir: string

  constructor() {
    this.tempDir = path.join(process.cwd(), 'temp')
    this.ensureTempDirectory()
  }

  private ensureTempDirectory(): void {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true })
    }
  }

  /**
   * Check if file is a valid video/audio format by magic bytes
   */
  private isVideoFile(firstBytes: Buffer): boolean {
    const hex = Array.from(firstBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    // Common video/audio file signatures
    const videoSignatures = [
      '000000', // MP4 (starts with ftyp)
      '66747970', // MP4 ftyp
      '1a45dfa3', // WebM/MKV
      '4f676753', // OGG
      '494433', // MP3 with ID3
      'fffa',
      'fffb',
      'fffc',
      'fffd',
      'fffe',
      'ffff', // MP3 sync
      '664c6143', // FLAC
      '524946', // RIFF (WAV, AVI)
      '4d546864', // MIDI
      '000001', // MPEG
      '474946', // GIF (sometimes has audio)
    ]

    // Check for any of the known signatures
    return videoSignatures.some(sig =>
      hex.toLowerCase().startsWith(sig.toLowerCase())
    )
  }

  /**
   * Get MIME type based on file extension
   */
  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase()
    const mimeTypes: { [key: string]: string } = {
      '.mp4': 'video/mp4',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.webm': 'video/webm',
      '.m4a': 'audio/mp4',
      '.flac': 'audio/flac',
      '.ogg': 'audio/ogg',
      '.mpeg': 'video/mpeg',
      '.mpga': 'audio/mpeg',
      '.oga': 'audio/ogg',
    }

    return mimeTypes[ext] || 'video/mp4'
  }

  /**
   * Main method for transcribing Instagram Reels videos
   */
  async transcribeInstagramReel(url: string): Promise<TranscriptionResult> {
    console.log(`🎬 Starting Instagram Reel transcription for: ${url}`)

    try {
      // Step 1: Download video using Apify
      const downloadResult = await this.downloadInstagramVideo(url)

      if (!downloadResult.success) {
        console.error('❌ Video download failed:', downloadResult.error)
        return {
          success: false,
          error: `Video download failed: ${downloadResult.error}`,
        }
      }

      // Step 2: Transcribe the video
      let transcriptionResult: TranscriptionResult

      if (downloadResult.videoPath) {
        // If we have a local file path
        transcriptionResult = await this.transcribeVideoFile(
          downloadResult.videoPath
        )

        // Don't clean up the file here - it will be cleaned up by the wizard after sending
        // The wizard needs the file to send it to the user
      } else if (downloadResult.videoUrl) {
        // If we have a direct URL
        transcriptionResult = await this.transcribeVideoFromUrl(
          downloadResult.videoUrl
        )
      } else {
        return {
          success: false,
          error: 'No video path or URL available for transcription',
        }
      }

      return transcriptionResult
    } catch (error) {
      console.error('❌ Instagram Reel transcription failed:', error)
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown transcription error',
      }
    }
  }

  /**
   * Download Instagram video using only Apify services
   */
  private async downloadInstagramVideo(
    url: string
  ): Promise<VideoDownloadResult> {
    console.log(`📥 Downloading Instagram video: ${url}`)

    try {
      // Primary method: epctex/instagram-video-downloader
      console.log('🔧 Trying primary Apify downloader...')
      const primaryResult = await downloadInstagramVideoViaApify(url)

      if (primaryResult.success && primaryResult.videoUrl) {
        // Download the video file locally for transcription
        const videoPath = await this.downloadVideoFile(primaryResult.videoUrl)
        return {
          success: true,
          videoPath: videoPath,
          videoUrl: primaryResult.videoUrl,
        }
      }

      console.log('⚠️ Primary downloader failed, trying fallback...')

      // Fallback method: pocesar/download-instagram-video
      const fallbackResult = await downloadInstagramVideoViaApifyFallback(url)

      if (fallbackResult.success && fallbackResult.videoUrl) {
        // Download the video file locally for transcription
        const videoPath = await this.downloadVideoFile(fallbackResult.videoUrl)
        return {
          success: true,
          videoPath: videoPath,
          videoUrl: fallbackResult.videoUrl,
        }
      }

      return {
        success: false,
        error: 'All Apify download methods failed',
      }
    } catch (error) {
      console.error('❌ Error in downloadInstagramVideo:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Download failed',
      }
    }
  }

  /**
   * Download video file from URL to local storage
   */
  private async downloadVideoFile(videoUrl: string): Promise<string> {
    // Determine file extension from URL or default to mp4
    const urlPath = new URL(videoUrl).pathname
    const originalExt = path.extname(urlPath).toLowerCase()

    // Use original extension if it's supported by Whisper, otherwise use mp4
    const supportedFormats = [
      '.flac',
      '.m4a',
      '.mp3',
      '.mp4',
      '.mpeg',
      '.mpga',
      '.oga',
      '.ogg',
      '.wav',
      '.webm',
    ]
    const fileExt = supportedFormats.includes(originalExt)
      ? originalExt
      : '.mp4'

    const fileName = `instagram_video_${Date.now()}${fileExt}`
    const filePath = path.join(this.tempDir, fileName)

    console.log(`📁 Downloading video file to: ${filePath}`)
    console.log(`🔗 Video URL: ${videoUrl.substring(0, 100)}...`)

    try {
      const response = await axios({
        method: 'GET',
        url: videoUrl,
        responseType: 'stream',
        timeout: 120000, // 2 minutes timeout
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        httpsAgent: new https.Agent({
          rejectUnauthorized: false, // Игнорируем SSL ошибки для Instagram
        }),
      })

      console.log(`📋 Response headers:`, {
        contentType: response.headers['content-type'],
        contentLength: response.headers['content-length'],
        contentDisposition: response.headers['content-disposition'],
      })

      const writer = fs.createWriteStream(filePath)
      await pipelineAsync(response.data, writer)

      const stats = fs.statSync(filePath)
      console.log(
        `✅ Video downloaded successfully, size: ${(
          stats.size /
          1024 /
          1024
        ).toFixed(2)} MB`
      )

      // Log file info for debugging
      console.log(`📄 File info:`, {
        path: filePath,
        extension: path.extname(filePath),
        size: stats.size,
      })

      return filePath
    } catch (error) {
      console.error('❌ Error downloading video file:', error)
      throw new Error(
        `Failed to download video file: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      )
    }
  }

  /**
   * Transcribe video file using OpenAI Whisper API
   */
  private async transcribeVideoFile(
    videoPath: string
  ): Promise<TranscriptionResult> {
    console.log(`🎙️ Transcribing video file: ${videoPath}`)

    // OpenAI client is initialized lazily via @/core/openai

    // Tracked at method scope so every failure path below can delete the
    // downloaded (and possibly renamed) temp file. On success it is returned as
    // videoPath for the caller to send and then clean; a failed result carries
    // no path, so without this the download is orphaned on disk and each failed
    // transcription leaks a video file.
    let finalVideoPath = videoPath

    try {
      // Verify file exists and has content
      const stats = fs.statSync(videoPath)

      // Read first few bytes to check file format
      const fileBuffer = fs.readFileSync(videoPath)
      const firstBytes = fileBuffer.slice(0, 16)
      const firstBytesHex = Array.from(firstBytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ')

      console.log(`📊 File verification:`, {
        exists: fs.existsSync(videoPath),
        size: stats.size,
        extension: path.extname(videoPath),
        fileName: path.basename(videoPath),
        firstBytesHex: firstBytesHex,
        isVideoFile: this.isVideoFile(firstBytes),
      })

      if (stats.size === 0) {
        throw new Error('Downloaded file is empty')
      }

      // Check if file is actually a video by checking magic bytes
      if (!this.isVideoFile(firstBytes)) {
        throw new Error(
          `File is not a valid video format. First bytes: ${firstBytesHex}`
        )
      }

      // Ensure file has a proper extension for OpenAI
      finalVideoPath = videoPath
      const currentExt = path.extname(videoPath).toLowerCase()
      const supportedExts = [
        '.flac',
        '.m4a',
        '.mp3',
        '.mp4',
        '.mpeg',
        '.mpga',
        '.oga',
        '.ogg',
        '.wav',
        '.webm',
      ]

      if (!supportedExts.includes(currentExt)) {
        // Rename file to .mp4 if extension is not supported
        finalVideoPath = videoPath.replace(/\.[^.]*$/, '.mp4')
        fs.renameSync(videoPath, finalVideoPath)
        console.log(`🔄 Renamed file from ${videoPath} to ${finalVideoPath}`)
      }

      const formData = new FormData()
      formData.append('file', fs.createReadStream(finalVideoPath), {
        filename: path.basename(finalVideoPath),
        contentType: this.getMimeType(finalVideoPath),
      })
      formData.append('model', 'whisper-1')
      formData.append('language', 'ru') // Russian language
      formData.append('response_format', 'json')

      // Try Replicate first if available (no regional restrictions)
      if (process.env.REPLICATE_API_TOKEN) {
        try {
          console.log(`🔄 Trying Replicate Whisper API...`)

          // Convert file to base64 data URI for Replicate
          const audioBuffer = fs.readFileSync(finalVideoPath)
          const base64Audio = audioBuffer.toString('base64')
          const mimeType = this.getMimeType(finalVideoPath)
          const dataUri = `data:${mimeType};base64,${base64Audio}`

          const replicateResponse = await axios.post(
            'https://api.replicate.com/v1/predictions',
            {
              version:
                'b48b0e1d11dc0c0088a0e7a74a9630e90dab64476c9e85bd88475d47f43adb11', // whisper large-v3
              input: {
                audio: dataUri,
                model: 'large-v3',
                language: 'russian',
                translate: false,
                temperature: 0,
                transcription: 'plain_text',
                suppress_tokens: '-1',
                logprob_threshold: -1.0,
                no_speech_threshold: 0.6,
                condition_on_previous_text: true,
                compression_ratio_threshold: 2.4,
                temperature_increment_on_fallback: 0.2,
                initial_prompt: 'Транскрибация видео на русском языке.',
              },
            },
            {
              headers: {
                Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
                'Content-Type': 'application/json',
              },
              timeout: 30000,
            }
          )

          // Poll for result
          if (replicateResponse.data?.id) {
            const predictionId = replicateResponse.data.id
            let attempts = 0
            const maxAttempts = 60 // 5 minutes max wait

            while (attempts < maxAttempts) {
              await new Promise(resolve => setTimeout(resolve, 5000)) // Wait 5 seconds

              const statusResponse = await axios.get(
                `https://api.replicate.com/v1/predictions/${predictionId}`,
                {
                  headers: {
                    Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
                  },
                  // Without a timeout a single hung status request blocks the
                  // await forever, defeating the maxAttempts (5-min) bound and
                  // never reaching the OpenAI fallback below. Match the sibling
                  // POST (:382). On timeout axios throws -> caught by the
                  // Replicate catch -> falls through to OpenAI.
                  timeout: 30000,
                }
              )

              if (
                statusResponse.data?.status === 'succeeded' &&
                statusResponse.data?.output?.transcription
              ) {
                console.log(`✅ Transcription completed with Replicate`)
                return {
                  success: true,
                  text: statusResponse.data.output.transcription.trim(),
                  videoPath: finalVideoPath,
                  metadata: {
                    language: 'ru',
                  },
                }
              } else if (statusResponse.data?.status === 'failed') {
                throw new Error('Replicate prediction failed')
              }

              attempts++
            }
          }
        } catch (replicateError: any) {
          console.log(
            `⚠️ Replicate failed, trying next service:`,
            replicateError.message
          )
        }
      }

      // Use OpenAI client for transcription
      const response = (await openai.audio.transcriptions.create({
        file: createReadStream(videoPath) as any,
        model: 'whisper-1',
        language: 'ru',
        response_format: 'verbose_json',
      })) as any

      if (response.data && response.data.text) {
        console.log(`✅ Transcription completed successfully`)
        return {
          success: true,
          text: response.data.text.trim(),
          videoPath: finalVideoPath,
          metadata: {
            language: response.data.language || 'ru',
            duration: response.data.duration,
          },
        }
      } else {
        // Failure without a caller-visible videoPath — clean up the download.
        try {
          fs.unlinkSync(finalVideoPath)
        } catch {
          /* best effort */
        }
        return {
          success: false,
          error: 'No transcription text received from OpenAI',
        }
      }
    } catch (error) {
      console.error('❌ Transcription failed:', error)
      // The caller cleans up only files it receives via videoPath, and this
      // failed result carries none — remove the orphaned temp file here.
      try {
        fs.unlinkSync(finalVideoPath)
      } catch {
        /* best effort: it may not exist, or the caller may have taken it */
      }

      if (axios.isAxiosError(error)) {
        const errorMessage =
          error.response?.data?.error?.message || error.message
        return {
          success: false,
          error: `OpenAI API error: ${errorMessage}`,
        }
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Transcription failed',
      }
    }
  }

  /**
   * Transcribe video directly from URL (if supported by OpenAI in the future)
   */
  async transcribeVideoFromUrl(videoUrl: string): Promise<TranscriptionResult> {
    console.log(
      `🎙️ Transcribing video from URL: ${videoUrl.substring(0, 100)}...`
    )

    // For now, we'll download the file first, but this method is ready for future direct URL support
    try {
      const tempPath = await this.downloadVideoFile(videoUrl)
      const result = await this.transcribeVideoFile(tempPath)

      // Don't clean up here - the file path in result.videoPath needs to be available for sending
      // The wizard will clean up after sending the video to the user

      return result
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'URL transcription failed',
      }
    }
  }
}

// Export singleton instance
export const videoTranscriptionService = new VideoTranscriptionService()

/**
 * Main function to transcribe Instagram Reels
 */
export async function transcribeInstagramReel(
  url: string
): Promise<TranscriptionResult> {
  return videoTranscriptionService.transcribeInstagramReel(url)
}

/**
 * Function to transcribe video from direct URL (e.g., Telegram file)
 */
export async function transcribeVideoFromDirectUrl(
  videoUrl: string
): Promise<TranscriptionResult> {
  return videoTranscriptionService.transcribeVideoFromUrl(videoUrl)
}

export default videoTranscriptionService
