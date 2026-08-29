/**
 * Download a Telegram file URL into a Buffer, rejecting a non-OK response.
 *
 * A bare `fetch(url)` followed by `response.arrayBuffer()` silently turns a
 * 404/500 error body — an expired file_path, a bad bot token — into "image"
 * bytes. aiPhotoshop pushed that straight into the morphing collection, so a
 * failed download became a corrupt photo that the user was later charged to
 * process. The timeout also stops a hung download from wedging a scene whose
 * in-flight guard only releases in a finally.
 */
export async function downloadTelegramFileBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) })
  if (!response.ok) {
    throw new Error(
      `Telegram file download failed: HTTP ${response.status} ${response.statusText}`
    )
  }
  return Buffer.from(await response.arrayBuffer())
}
