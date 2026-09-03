import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * downloadFileHelper must cap the download DURING transfer, not only after.
 *
 * The helper pulls a remote file with axios responseType 'arraybuffer' and then
 * rejects it if buffer.length exceeds MAX_FILE_SIZE (50MB). That check only runs
 * AFTER the whole body is already buffered into RAM, so a hostile or oversized
 * URL could OOM the shared bot process before the size guard ever fires.
 *
 * The axios.get config now carries maxContentLength / maxBodyLength bound to
 * MAX_FILE_SIZE, so axios aborts the transfer once the limit is crossed. This
 * reads the source and fails if either cap disappears — the post-download
 * buffer.length check alone is not a memory bound.
 */

const SRC = path.join(
  'src',
  'modules',
  'videoGenerator',
  'helpers',
  'downloadFileHelper.ts'
)

describe('downloadFileHelper caps the download during transfer', () => {
  const src = fs.readFileSync(SRC, 'utf8')

  it('finds the source — otherwise the check is empty', () => {
    expect(src.length).toBeGreaterThan(0)
    expect(src).toContain('axios.get(')
  })

  it('passes maxContentLength to axios so the transfer is bounded', () => {
    expect(src).toMatch(/maxContentLength:\s*MAX_FILE_SIZE/)
  })

  it('passes maxBodyLength to axios so redirects/bodies are bounded too', () => {
    expect(src).toMatch(/maxBodyLength:\s*MAX_FILE_SIZE/)
  })
})
