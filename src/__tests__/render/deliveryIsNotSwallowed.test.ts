import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Spec: t27 specs/functions/render-job-run.t27 and
 * specs/functions/morph-images-generate.t27 (NOTE, 2026-09-17).
 *
 * Two deliveries that reported success while nothing reached the client:
 *
 * 1. render-job-run `callback`: sendCallback caught the axios error and
 *    returned, so the step COMPLETED on a dead callback URL and the run
 *    reported a delivered render. It must throw, so Inngest retries the step
 *    and, after retries, onFailure tells the admin.
 *
 * 2. morph-images-generate `deliver-result`: video_url is a path on this
 *    server. Telegram was handed the bare string (read as file_id/URL), the
 *    call failed, and the fallback sent the user that same local path as a
 *    "download link" while returning delivered: true. The file must go as
 *    { source } and a failed delivery must throw, not pretend.
 */

const mocks = vi.hoisted(() => ({ post: vi.fn() }))

vi.mock('axios', () => ({
  default: { post: mocks.post },
}))
vi.mock('@/inngest_app/functions/render/helpers/ssh.service', () => ({
  SSHService: class {},
}))
vi.mock('@/inngest_app/functions/render/helpers/s3.service', () => ({
  S3Service: class {},
}))

import { sendCallback } from '@/inngest_app/functions/render/helpers/renderSteps'

const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() } as any
const ROOT = path.resolve(__dirname, '../../..')

describe('render-job-run: sendCallback', () => {
  // Braces matter: a hook that returns the mock hands vitest a "cleanup
  // function", which then calls axios.post after the test -- and rejects.
  beforeEach(() => {
    mocks.post.mockReset()
  })

  it('rejects when the callback URL does not answer', async () => {
    mocks.post.mockImplementation(() =>
      Promise.reject(new Error('ECONNREFUSED'))
    )
    let caught: unknown = null
    try {
      await sendCallback(
        'https://client.example/hook',
        'https://s3/x.mp4',
        logger
      )
    } catch (e) {
      caught = e
    }
    expect((caught as Error)?.message).toBe('ECONNREFUSED')
    expect(logger.error).toHaveBeenCalled()
  })

  it('resolves when the callback is accepted', async () => {
    mocks.post.mockResolvedValue({ status: 200 })
    await expect(
      sendCallback('https://client.example/hook', 'https://s3/x.mp4', logger)
    ).resolves.toBeUndefined()
    expect(mocks.post).toHaveBeenCalledWith(
      'https://client.example/hook',
      { download_url: 'https://s3/x.mp4' },
      { timeout: 30000 }
    )
  })

  it('render.ts no longer wraps the callback step in a try/catch', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'src/inngest_app/functions/render/render.ts'),
      'utf8'
    )
    const from = src.indexOf("step.run('callback'")
    expect(from).toBeGreaterThan(0)
    const around = src.slice(Math.max(0, from - 400), from + 400)
    expect(around).not.toMatch(/catch\s*\(callbackError\)/)
  })
})

describe('morph-images-generate: deliver-result', () => {
  const src = fs.readFileSync(
    path.join(ROOT, 'src/inngest_app/functions/training/morphImages.ts'),
    'utf8'
  )

  it('streams the local file to Telegram as { source }', () => {
    expect(src).toMatch(
      /const localVideo = \{ source: finalVideoResult\.video_url \}/
    )
    expect(src).toMatch(/sendVideo\(telegram_id, localVideo,/)
    expect(src).toMatch(/sendDocument\(telegram_id, localVideo,/)
    expect(src).not.toMatch(
      /sendVideo\(telegram_id, finalVideoResult\.video_url/
    )
  })

  it('does not hand the user a server path as a link, nor call it delivered', () => {
    expect(src).not.toMatch(/link_fallback/)
    expect(src).not.toMatch(
      /Скачать видео:\*\* \$\{finalVideoResult\.video_url\}/
    ) // cyrillic-ok
    expect(src).toMatch(/throw deliveryError/)
  })

  it('only reads the balance; nothing in the file deducts it', () => {
    expect(src).toMatch(/getUserBalance/)
    expect(src).not.toMatch(
      /processBalanceOperation|updateUserBalance|deductBalance/
    )
  })
})
