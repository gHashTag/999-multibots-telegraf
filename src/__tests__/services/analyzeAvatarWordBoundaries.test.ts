/**
 * 'yes' IS INSIDE 'eyes', AND 'person' IS INSIDE 'no person'.
 *
 * analyzeAvatar asks the vision model for `FACE:yes/no GENDER:male/female/unclear`
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
 * These tests DRIVE the service with Kie's chat endpoint replaced (fetch), so
 * what is pinned is the answer, not the shape of the source.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * The model's reply, as the vision call sees it. `mockResolvedValue(text)`
 * answers a Kie chat completion carrying `text`; `mockRejectedValue(e)` is a
 * transport failure.
 */
const run = vi.fn()
const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => {
  const text = await run()
  return new Response(
    JSON.stringify({ choices: [{ message: { content: text } }] }),
    { status: 200 }
  )
})

import { logger } from '@/utils/logger'
import { analyzeAvatar, quickFaceCheck } from '@/services/analyzeAvatar'

const URL = 'https://example.invalid/avatar.jpg'

let error: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  run.mockReset()
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('KIE_AI_API_KEY', 'test-kie-key')
  // The real logger object -- the same instance the Telegram transport is
  // attached to, so "which method" is a real question here.
  error = vi.spyOn(logger, 'error').mockImplementation(() => logger as any)
  vi.spyOn(logger, 'info').mockImplementation(() => logger as any)
  vi.spyOn(logger, 'warn').mockImplementation(() => logger as any)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
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

  it('asks Kie, not Replicate, with the picture attached', async () => {
    run.mockResolvedValue('FACE:yes GENDER:female')

    await analyzeAvatar(URL)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.kie.ai/v1/chat/completions')
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer test-kie-key'
    )
    const body = JSON.parse(String(init.body))
    expect(body.model).toBe('gpt-5-2')
    expect(body.messages[0].content[1]).toEqual({
      type: 'image_url',
      image_url: { url: URL },
    })
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
    vi.stubEnv('KIE_AI_API_KEY', '')

    const result = await analyzeAvatar(URL)

    expect(result.hasFace).toBe(false)
    expect(result.error).toContain('KIE_AI_API_KEY')
    expect(
      error.mock.calls.map(c => String(c[0])),
      'a credential we failed to load is an incident, not a customer'
    ).toContain('[AnalyzeAvatar] Analysis failed')
  })
})

describe('Kie refusals are failures, not empty verdicts', () => {
  it('reports a 200 that carries an error code instead of an answer', async () => {
    fetchMock.mockImplementationOnce(
      async () =>
        new Response(
          JSON.stringify({ code: 422, msg: 'The channel is not supported' }),
          { status: 200 }
        )
    )

    const result = await analyzeAvatar(URL)

    expect(result.hasFace).toBe(false)
    expect(result.error).toContain('The channel is not supported')
  })

  it('reports an HTTP error with its message', async () => {
    fetchMock.mockImplementationOnce(
      async () =>
        new Response(JSON.stringify({ msg: 'Insufficient credits' }), {
          status: 402,
        })
    )

    const result = await analyzeAvatar(URL)

    expect(result.error).toContain('402')
    expect(result.error).toContain('Insufficient credits')
  })
})
