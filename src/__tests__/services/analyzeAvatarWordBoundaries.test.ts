/**
 * 'yes' IS INSIDE 'eyes', AND 'person' IS INSIDE 'no person'.
 *
 * analyzeAvatar asks Moondream for `FACE:yes/no GENDER:male/female/unclear`
 * and used to read the reply with bare `String.includes`. A vision model given
 * a photograph of a cat answers something like
 *
 *     FACE:no. The cat's eyes are visible, there is no person in the image.
 *
 * and that sentence satisfied TWO of the four face tests at once -- 'yes'
 * inside 'eyes', 'person' inside 'no person' -- so the reader returned the
 * opposite of what the model said. Downstream (scenes/createUserScene.ts:181)
 * that hands the new-user welcome portrait a photo with no face in it, and
 * writes a gender guessed from it into the database.
 *
 * These tests DRIVE the service with the replicate client replaced, so what is
 * pinned is the answer, not the shape of the source.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { run } = vi.hoisted(() => ({ run: vi.fn() }))

vi.mock('@/core/replicate', () => ({ replicate: { run } }))

import { logger } from '@/utils/logger'
import { analyzeAvatar, quickFaceCheck } from '@/services/analyzeAvatar'

const URL = 'https://example.invalid/avatar.jpg'

let error: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  run.mockReset()
  // The real logger object -- the same instance the Telegram transport is
  // attached to, so "which method" is a real question here.
  error = vi.spyOn(logger, 'error').mockImplementation(() => logger as any)
  vi.spyOn(logger, 'info').mockImplementation(() => logger as any)
  vi.spyOn(logger, 'warn').mockImplementation(() => logger as any)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('analyzeAvatar believes the answer it asked for', () => {
  it('does not find a face in a photograph of a cat', async () => {
    run.mockResolvedValue(
      "FACE:no GENDER:unclear. The cat's eyes are visible, but there is no person in this image."
    )

    const result = await analyzeAvatar(URL)

    expect(
      result.hasFace,
      "'yes' inside 'eyes' and 'person' inside 'no person' outvoted FACE:no"
    ).toBe(false)
    expect(result.gender).toBe('unknown')
    expect(result.confidence).toBe(0)
  })

  it('still finds the face when there is one', async () => {
    run.mockResolvedValue('FACE:yes GENDER:female')

    const result = await analyzeAvatar(URL)

    expect(result.hasFace).toBe(true)
    expect(result.gender).toBe('female')
    expect(result.confidence).toBe(80)
  })

  it('reads a male verdict without tripping over "female"', async () => {
    run.mockResolvedValue('FACE:yes GENDER:male')

    const result = await analyzeAvatar(URL)

    expect(result.hasFace).toBe(true)
    expect(result.gender).toBe('male')
  })

  it('handles the array replicate sometimes returns', async () => {
    run.mockResolvedValue(['FACE:yes ', 'GENDER:female'])

    const result = await analyzeAvatar(URL)

    expect(result.hasFace).toBe(true)
    expect(result.gender).toBe('female')
  })
})

describe('analyzeAvatar falls back to prose when the format is ignored', () => {
  it('accepts an affirmative sentence', async () => {
    run.mockResolvedValue(
      'Yes, there is a human face here. The person appears to be a man.'
    )

    const result = await analyzeAvatar(URL)

    expect(result.hasFace).toBe(true)
    expect(result.gender).toBe('male')
  })

  it('does not read a denial as an affirmation', async () => {
    run.mockResolvedValue(
      'There is no face in this image, only the eyes of a bird.'
    )

    const result = await analyzeAvatar(URL)

    expect(result.hasFace).toBe(false)
  })

  it('does not turn "no people" into a person', async () => {
    run.mockResolvedValue('A landscape at sunset. There are no people here.')

    const result = await analyzeAvatar(URL)

    expect(result.hasFace).toBe(false)
  })
})

describe('quickFaceCheck', () => {
  it('answers no to a cat with visible eyes', async () => {
    run.mockResolvedValue('No. Only the eyes of a cat are visible.')
    expect(await quickFaceCheck(URL)).toBe(false)
  })

  it('answers yes to a face', async () => {
    run.mockResolvedValue('Yes')
    expect(await quickFaceCheck(URL)).toBe(true)
  })
})

describe('a broken vision model is still ours', () => {
  it('pages the owner when the analysis itself fails', async () => {
    run.mockRejectedValue(new Error('REPLICATE_API_TOKEN not found'))

    const result = await analyzeAvatar(URL)

    expect(result.hasFace).toBe(false)
    expect(result.error).toContain('REPLICATE_API_TOKEN')
    expect(
      error.mock.calls.map(c => String(c[0])),
      'a credential we failed to load is an incident, not a customer'
    ).toContain('[AnalyzeAvatar] Analysis failed')
  })
})

/*
 * Log 2026-10-01: Replicate answered 402 "Insufficient credit" and every new
 * user paged the owner. The project's own vision model is asked first.
 */
describe('our own eyes first, Replicate only after them', () => {
  const photo = () =>
    new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
      headers: { 'content-type': 'image/jpeg' },
    })
  const answer = (text: string) =>
    new Response(JSON.stringify({ choices: [{ message: { content: text } }] }))

  beforeEach(() => {
    vi.stubEnv('VISION_API_KEY', 'test-vision-key')
    vi.stubEnv('VISION_BASE_URL', 'http://vision.test/v1')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('asks our vision model and never pays Replicate when it answers', async () => {
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push(String(url))
        if (String(url).startsWith('http://vision.test')) {
          const body = JSON.parse(String(init?.body))
          expect(body.messages[0].content[1].image_url.url).toMatch(
            /^data:image\/jpeg;base64,/
          )
          return answer('FACE:yes GENDER:female')
        }
        return photo()
      })
    )

    const result = await analyzeAvatar(URL)

    expect(result.hasFace).toBe(true)
    expect(result.gender).toBe('female')
    expect(run).not.toHaveBeenCalled()
    expect(calls).toEqual([URL, 'http://vision.test/v1/chat/completions'])
  })

  it('falls back to Replicate when our model is down', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url).startsWith('http://vision.test')
          ? new Response('down', { status: 503 })
          : photo()
      )
    )
    run.mockResolvedValue('FACE:yes GENDER:male')

    const result = await analyzeAvatar(URL)

    expect(result.gender).toBe('male')
    expect(run).toHaveBeenCalledOnce()
  })

  it('names both failures when both are down', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url).startsWith('http://vision.test')
          ? new Response('down', { status: 503 })
          : photo()
      )
    )
    run.mockRejectedValue(new Error('402 Payment Required'))

    const result = await analyzeAvatar(URL)

    expect(result.hasFace).toBe(false)
    expect(result.error).toContain('own vision answered 503')
    expect(result.error).toContain('402 Payment Required')
  })

  it('without a key keeps the old path: Replicate alone', async () => {
    vi.stubEnv('VISION_API_KEY', '')
    run.mockResolvedValue('Yes')
    expect(await quickFaceCheck(URL)).toBe(true)
    expect(run).toHaveBeenCalledOnce()
  })
})
