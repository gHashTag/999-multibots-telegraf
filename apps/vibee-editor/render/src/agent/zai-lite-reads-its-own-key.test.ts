import { afterEach, describe, expect, it, vi } from 'vitest'
import { SKIP_LOG_PREFIX, streamModel } from './chat'
import {
  allProviders,
  diagnose,
  isKeyWideLimit,
  keyFrom,
  vendorCode,
} from './provider'
import { forgetBreakersForTests } from './provider-breaker'
import { forgetProviderChoiceForTests } from './provider-choice'

/**
 * ZAI-LITE READS ITS OWN KEY, WHEN THERE IS ONE.
 *
 * vibee-render production, 2026-10-06 05:00-11:32 UTC: zai answered 429 33
 * times, zai-lite 6 times, 15 of 45 turns ended in error. Both routes read
 * GLM_API_KEY and z.ai limits per key, so on a key-wide limit the fallback is
 * the same wall. ZAI_LITE_API_KEY gives zai-lite a key of its own; unset or
 * blank, it reads GLM_API_KEY exactly as before.
 */
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  forgetProviderChoiceForTests()
  forgetBreakersForTests()
})

const keyOf = (id: string) => allProviders().find(p => p.id === id)?.key

describe('zai-lite key', () => {
  it('falls back to GLM_API_KEY when ZAI_LITE_API_KEY is unset', () => {
    vi.stubEnv('GLM_API_KEY', 'glm-shared')
    vi.stubEnv('ZAI_LITE_API_KEY', '')
    expect(allProviders().map(p => p.id)).toEqual(['zai', 'zai-lite'])
    expect(keyOf('zai')).toBe('glm-shared')
    expect(keyOf('zai-lite')).toBe('glm-shared')
  })

  it('falls back when ZAI_LITE_API_KEY is only whitespace', () => {
    vi.stubEnv('GLM_API_KEY', 'glm-shared')
    vi.stubEnv('ZAI_LITE_API_KEY', '   ')
    expect(keyOf('zai-lite')).toBe('glm-shared')
  })

  it('uses ZAI_LITE_API_KEY when set; zai keeps GLM_API_KEY', () => {
    vi.stubEnv('GLM_API_KEY', 'glm-shared')
    vi.stubEnv('ZAI_LITE_API_KEY', 'lite-own')
    expect(keyOf('zai')).toBe('glm-shared')
    expect(keyOf('zai-lite')).toBe('lite-own')
  })

  it('ZAI_LITE_API_KEY alone configures zai-lite and not zai', () => {
    vi.stubEnv('GLM_API_KEY', '')
    vi.stubEnv('ZAI_LITE_API_KEY', 'lite-own')
    expect(allProviders().map(p => p.id)).toEqual(['zai-lite'])
    expect(keyOf('zai-lite')).toBe('lite-own')
  })

  it('keyFrom takes the first set variable, in order', () => {
    vi.stubEnv('A_KEY_FOR_TEST', '')
    vi.stubEnv('B_KEY_FOR_TEST', 'b')
    expect(keyFrom(['A_KEY_FOR_TEST', 'B_KEY_FOR_TEST'])).toBe('b')
    vi.stubEnv('A_KEY_FOR_TEST', 'a')
    expect(keyFrom(['A_KEY_FOR_TEST', 'B_KEY_FOR_TEST'])).toBe('a')
    expect(keyFrom([])).toBeUndefined()
  })
})

describe('a 429 names the vendor code', () => {
  it('carries the z.ai code so a key limit and an overload can be told apart', () => {
    const overload = '{"error":{"code":"1305","message":"overloaded"}}'
    const rate = '{"error":{"code":1302,"message":"High concurrency"}}'
    expect(vendorCode(overload)).toBe('1305')
    expect(vendorCode(rate)).toBe('1302')
    expect(diagnose('zai', 429, overload)).toBe(
      'zai: превышен лимит запросов (code 1305)'
    )
    expect(diagnose('zai-lite', 429, rate)).toBe(
      'zai-lite: превышен лимит запросов (code 1302)'
    )
  })

  it('a body with no code keeps the old line exactly', () => {
    expect(vendorCode('busy')).toBeNull()
    expect(diagnose('zai', 429, 'busy')).toBe('zai: превышен лимит запросов')
    expect(diagnose('zai', 429, '')).toBe('zai: превышен лимит запросов')
  })
})

/*
 * SKIP ON A KEY-WIDE LIMIT. Measured 2026-10-06 on the coding endpoint: the
 * production key answered 1302 (per-key rate limit) 3 of 3 times even on
 * glm-4.5-flash; glm-4.7-flash answered 1305 (model overloaded, any key) on
 * 3 of 4 accounts. 1302 on a shared key skips the sharer for the turn; 1305
 * does not, because the other model is the way round it.
 */
const sse = (text: string) =>
  new Response(
    [
      `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}`,
      'data: [DONE]',
      '',
    ].join('\n'),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
  )

const RATE_1302 = '{"error":{"code":"1302","message":"High concurrency"}}'
const OVERLOAD_1305 = '{"error":{"code":"1305","message":"overloaded"}}'

/** zai refuses with `zaiBody`; zai-lite refuses the same way; nemotron answers. */
async function turn(zaiBody: string, liteKey = '') {
  for (const v of ['AGENT_PROVIDER', 'AGENT_MODEL', 'RESERVE_API_KEY'])
    vi.stubEnv(v, '')
  vi.stubEnv('GLM_API_KEY', 'glm-shared')
  vi.stubEnv('ZAI_LITE_API_KEY', liteKey)
  vi.stubEnv('NVIDIA_API_KEY', 'n')
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const asked: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: { body: string }) => {
      const model = JSON.parse(init.body).model as string
      asked.push(model)
      if (model.startsWith('glm-'))
        return new Response(zaiBody, { status: 429 })
      return sse('ok')
    })
  )
  const events: Array<{ kind: string; id?: string }> = []
  for await (const ev of streamModel([{ role: 'user', content: 'hi' }])) {
    events.push(ev as { kind: string; id?: string })
  }
  const skips = warn.mock.calls
    .map(c => String(c[0]))
    .filter(l => l.startsWith(SKIP_LOG_PREFIX))
  return { asked, events, skips }
}

describe('a key-wide limit skips the provider sharing the key', () => {
  it('labels zai and zai-lite as one key group only while they share a key', () => {
    vi.stubEnv('GLM_API_KEY', 'glm-shared')
    vi.stubEnv('ZAI_LITE_API_KEY', '')
    vi.stubEnv('NVIDIA_API_KEY', 'n')
    const group = (id: string) =>
      allProviders().find(p => p.id === id)?.keyGroup
    expect(group('zai')).toBe('zai')
    expect(group('zai-lite')).toBe('zai')
    expect(group('nemotron')).toBeUndefined()
    vi.stubEnv('ZAI_LITE_API_KEY', 'lite-own')
    expect(group('zai')).toBeUndefined()
    expect(group('zai-lite')).toBeUndefined()
  })

  it('only 1302 on a 429 counts as key-wide', () => {
    expect(isKeyWideLimit(429, RATE_1302)).toBe(true)
    expect(isKeyWideLimit(429, OVERLOAD_1305)).toBe(false)
    expect(isKeyWideLimit(429, 'busy')).toBe(false)
    expect(isKeyWideLimit(500, RATE_1302)).toBe(false)
  })

  it('1302 on zai: zai-lite is not asked, the log says why, nemotron answers', async () => {
    const { asked, events, skips } = await turn(RATE_1302)
    expect(asked).toEqual([
      'glm-4.7-flash',
      'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
    ])
    expect(events[0]).toMatchObject({ kind: 'provider', id: 'nemotron' })
    expect(skips).toEqual([
      `${SKIP_LOG_PREFIX} zai: превышен лимит запросов (code 1302)`,
      `${SKIP_LOG_PREFIX} zai-lite: shares zai's key, same limit -- not asked this turn`,
    ])
    // Never the key, not even a piece of it.
    expect(skips.join('\n')).not.toContain('glm-shared')
  })

  it('1305 on zai: zai-lite is still asked (another model, same key helps)', async () => {
    const { asked } = await turn(OVERLOAD_1305)
    expect(asked).toEqual([
      'glm-4.7-flash',
      'glm-4.5-flash',
      'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
    ])
  })

  it('1302 with ZAI_LITE_API_KEY set: zai-lite has its own key and is asked', async () => {
    const { asked } = await turn(RATE_1302, 'lite-own')
    expect(asked).toEqual([
      'glm-4.7-flash',
      'glm-4.5-flash',
      'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
    ])
  })
})
