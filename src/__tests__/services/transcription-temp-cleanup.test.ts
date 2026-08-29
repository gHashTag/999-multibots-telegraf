/**
 * A failed transcription must not leave the downloaded video on disk.
 *
 * transcribeVideoFile downloads (via its caller) a temp video, and on SUCCESS
 * returns it as videoPath so the wizard can send it and then delete it. But a
 * FAILED result carries no videoPath, so the caller has nothing to clean — the
 * download used to be orphaned, and every failed transcription leaked a video
 * file until the disk filled. The failure paths now delete the temp file.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const { unlinkSync } = vi.hoisted(() => ({ unlinkSync: vi.fn() }))
vi.mock('fs', () => {
  const m = {
    // A zero-size file trips the "Downloaded file is empty" throw, which lands
    // in the catch where the cleanup lives.
    statSync: vi.fn(() => ({ size: 0 })),
    readFileSync: vi.fn(() =>
      Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70])
    ),
    existsSync: vi.fn(() => true),
    unlinkSync,
    renameSync: vi.fn(),
    createReadStream: vi.fn(() => ({})),
    createWriteStream: vi.fn(),
  }
  return { ...m, default: m, createReadStream: m.createReadStream }
})
vi.mock('@/core/openai', () => ({ openai: {} }))

import { videoTranscriptionService } from '@/services/videoTranscription'

describe('transcription cleans up the temp file on failure', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes the downloaded file when transcription fails', async () => {
    const path = '/tmp/fake-video.mp4'
    const result = await (
      videoTranscriptionService as unknown as {
        transcribeVideoFile: (p: string) => Promise<{ success: boolean }>
      }
    ).transcribeVideoFile(path)

    expect(result.success).toBe(false)
    expect(unlinkSync).toHaveBeenCalledWith(path)
  })
})
