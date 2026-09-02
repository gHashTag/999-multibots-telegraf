const DEFAULT_MAX_BYTES = 50 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 30_000

export async function downloadBoundedMedia(
  url: URL,
  options: {
    fetchImpl?: typeof fetch
    maxBytes?: number
    timeoutMs?: number
  } = {}
): Promise<Buffer> {
  const fetchImpl = options.fetchImpl ?? fetch
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'error',
  })
  if (!response.ok)
    throw new Error(`media download failed: HTTP ${response.status}`)

  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel()
    throw new Error('media is too large to inspect')
  }
  if (!response.body) throw new Error('media body is unavailable')

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        throw new Error('media is too large to inspect')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  if (total === 0) throw new Error('media is empty')
  return Buffer.concat(
    chunks.map(chunk => Buffer.from(chunk)),
    total
  )
}
