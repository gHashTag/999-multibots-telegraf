import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { streamModel } from './chat'
import {
  RESERVE_MAX_TOKENS_DEFAULT,
  diagnose,
  reserveMaxTokens,
} from './provider'
import { forgetProviderChoiceForTests } from './provider-choice'

/**
 * THE RESERVE ANSWER IS BOUNDED. Spec: t27 specs/automation/agent-provider-chain.t27
 * (RESERVE_SENDS_MAX_TOKENS, RESERVE_ENV_MAX_TOKENS, RESERVE_MAX_TOKENS_DEFAULT,
 * PAYMENT_REQUIRED_IS_DIAGNOSED).
 *
 * 2026-09-15, vibee-render a587fee, probe 3 of the reserve route through
 * OpenRouter: no max_tokens in the request, so the vendor priced the model
 * ceiling (16000) against the prepaid balance (2506 affordable) and answered
 * 402 before reading a word. The skip line quoted the raw body because
 * diagnose() knew "insufficient balance" but not "requires more credits".
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

const bodies = async () => {
  const seen: Array<{ url: string; body: Record<string, unknown> }> = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      seen.push({
        url: String(url),
        body: JSON.parse(String(init?.body ?? '{}')),
      })
      return sse('Да') // cyrillic-ok: quoted model answer
    })
  )
  for await (const _ of streamModel([{ role: 'user', content: 'hi' }])) {
    // drain
  }
  return seen
}

beforeEach(() => {
  vi.stubEnv('GLM_API_KEY', 'g')
  vi.stubEnv('RESERVE_BASE_URL', 'https://vendor.example/v1')
  vi.stubEnv('RESERVE_API_KEY', 'r')
  vi.stubEnv('RESERVE_MODEL', 'some/model')
  vi.stubEnv('AGENT_PROVIDER', 'reserve')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  forgetProviderChoiceForTests()
})

describe('the reserve answer is bounded', () => {
  it('the reserve request carries max_tokens = the default when the owner did not say', async () => {
    const seen = await bodies()
    expect(seen[0].url).toBe('https://vendor.example/v1/chat/completions')
    expect(seen[0].body.max_tokens).toBe(RESERVE_MAX_TOKENS_DEFAULT)
    expect(RESERVE_MAX_TOKENS_DEFAULT).toBe(1024)
  })

  it('RESERVE_MAX_TOKENS overrides the default', async () => {
    vi.stubEnv('RESERVE_MAX_TOKENS', '700')
    const seen = await bodies()
    expect(seen[0].body.max_tokens).toBe(700)
  })

  it('a non-positive or unreadable RESERVE_MAX_TOKENS falls back to the default', () => {
    for (const raw of ['0', '-5', 'abc', '', undefined]) {
      expect(reserveMaxTokens(raw)).toBe(RESERVE_MAX_TOKENS_DEFAULT)
    }
    expect(reserveMaxTokens(' 2048 ')).toBe(2048)
  })

  it('the other providers do not carry a ceiling', async () => {
    vi.stubEnv('AGENT_PROVIDER', 'zai')
    const seen = await bodies()
    expect(seen[0].url).not.toContain('vendor.example')
    expect(seen[0].body.max_tokens).toBeUndefined()
  })

  it('402 is named as no funds whatever the body says', () => {
    const openrouter =
      '{"error":{"message":"This request requires more credits, or fewer max_tokens. You requested up to 16000 tokens, but can only afford 2506."}}'
    expect(diagnose('reserve', 402, openrouter)).toContain('на ключе нет средств') // cyrillic-ok: quoted diagnose() text
    expect(diagnose('reserve', 402, '')).toContain('на ключе нет средств') // cyrillic-ok: quoted diagnose() text
    expect(diagnose('reserve', 400, 'requires more credits')).toContain('на ключе нет средств') // cyrillic-ok: quoted diagnose() text
    expect(diagnose('reserve', 401, '')).toContain('ключ недействителен') // cyrillic-ok: quoted diagnose() text
  })
})
