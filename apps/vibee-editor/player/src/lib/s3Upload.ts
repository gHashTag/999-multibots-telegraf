// ===============================
// S3 Upload Utility
// ===============================

// Render server URL
const RENDER_SERVER_URL = import.meta.env.VITE_RENDER_SERVER_URL || 'http://localhost:3333';

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
  serverUrl = RENDER_SERVER_URL
): Promise<string | null> {
  try {
    const response = await fetch(`${serverUrl}/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': file instanceof File ? file.type : 'audio/webm',
        'X-Filename': filename,
      },
      body: file,
    });

    const result = await response.json();
    if (result.success && result.url) {
      return result.url;
    }
    throw new Error(result.error || 'Upload failed');
  } catch (error) {
    console.error('[S3 Upload] Error:', error);
    return null;
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
  return uploadToS3(file, filename, serverUrl);
}
