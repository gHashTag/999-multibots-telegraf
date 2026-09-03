// ===============================
// S3 Upload Utility
// ===============================

import { authHeaders } from './apiFetch'
import { RENDER_URL } from '../config'

// Render server URL
const RENDER_SERVER_URL = import.meta.env.VITE_RENDER_SERVER_URL || RENDER_URL

/**
 * Upload a file or blob to S3 via the render server
 * @param file - File or Blob to upload
 * @param filename - Target filename
 * @param serverUrl - Optional custom server URL
 * @returns URL of uploaded file, or null on error
 */
export async function uploadToS3(
  file: File | Blob,
  filename: string,
  serverUrl = RENDER_SERVER_URL,
  signal?: AbortSignal
): Promise<string | null> {
  try {
    // Filenames become S3 object keys and an HTTP header. Keep the extension
    // but strip separators/control/non-ASCII characters before either use.
    const safeFilename =
      filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'asset'
    const response = await fetch(`${serverUrl}/upload`, {
      method: 'POST',
      headers: authHeaders({
        'Content-Type': file instanceof File ? file.type : 'audio/webm',
        'X-Filename': safeFilename,
      }),
      body: file,
      signal,
    })

    const result = await response.json()
    if (response.ok && result.success && result.url) {
      return new URL(result.url, `${serverUrl.replace(/\/+$/, '')}/`).toString()
    }
    throw new Error(result.error || 'Upload failed')
  } catch (error) {
    if (signal?.aborted) throw error
    console.error('[S3 Upload] Error:', error)
    return null
  }
}

/**
 * Upload with progress tracking (for future use)
 */
export async function uploadToS3WithProgress(
  file: File | Blob,
  filename: string,
  onProgress?: (percent: number) => void,
  serverUrl = RENDER_SERVER_URL
): Promise<string | null> {
  // For now, just delegate to the simple upload
  // XHR with progress can be added later if needed
  return uploadToS3(file, filename, serverUrl)
}
