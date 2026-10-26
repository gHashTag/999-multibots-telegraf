/**
 * THE KEY POOL ROTATES BEFORE THE CHAIN MOVES ON.
 *
 * Production, 26.10.2026 16:09 UTC: a client's turn died with EVERY provider
 * at once -- zai 429 code 1305, nemotron "ResourceExhausted: Worker local
 * total request limit reached (16/16)", reserve and kie answered invalid-key,
 * zai-lite "на ключе нет средств" -- while the owner's vendor consoles held
 * more keys than the one variable each route read. provider.ts now collects a
 * pool per route (GLM_API_KEY="k1,k2", or GLM_API_KEYS, or GLM_API_KEY_2..9,
 * same for every provider), and chat.ts asks the route's NEXT key before the
 * chain asks the NEXT provider -- but only when the refusal is the KEY's wall
 * (isKeyFailure), never for 1305 or a timeout, which another key cannot cure.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { streamModel } from './chat'
import { forgetBreakersForTests } from './provider-breaker'
import {
  forgetKeyRotationForTests,
  isKeyFailure,
  keyChain,
  providerKeys,
  rememberKey,
} from './provider'
import { forgetProviderChoiceForTests } from './provider-choice'

const sse = (text: string) =>
  new Response(
    [
      `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}`,
      'data: [DONE]',
      '',
    ].join('\n'),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
  )

const status = (s: number, body: string) => new Response(body, { status: s })

const refused1302 = () =>
  status(429, '{"error":{"message":"limit exceeded","code":1302}}')

const nvidiaCeiling = () =>
  new Response(
    [
      `data: ${JSON.stringify({
        error: {
          message:
            'ResourceExhausted: Worker local total request limit reached (16/16)',
        },
      })}`,
      '',
    ].join('\n'),
    { status: 200 }
  )

const drain = async () => {
  const events: unknown[] = []
  for await (const ev of streamModel([{ role: 'user', content: 'hi' }]))
    events.push(ev)
  return events
}

beforeEach(() => {
  // The root vitest config sets KIE_AI_API_KEY for every test, which would
  // put the Kie leg (agent-provider-chain v3) into every chain below. These
  // chains are the ones without it; the kie rotation has its own test.
  vi.stubEnv('KIE_AI_API_KEY', '')
  forgetBreakersForTests()
  forgetKeyRotationForTests()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  forgetProviderChoiceForTests()
  forgetKeyRotationForTests()
})

describe('the pool behind one route', () => {
  it('reads the variable, its KEYS sister and numbered sisters, without duplicates', () => {
    vi.stubEnv('GLM_API_KEY', 'k0, k1')
    vi.stubEnv('GLM_API_KEYS', 'k1 , ,k2,k0')
    vi.stubEnv('GLM_API_KEY_3', 'k3')
    expect(providerKeys('zai')).toEqual(['k0', 'k1', 'k2', 'k3'])
  })

  it('one key only means the route behaves exactly as before', () => {
    vi.stubEnv('GLM_API_KEY', 'k0')
    vi.stubEnv('GLM_API_KEYS', '')
    expect(providerKeys('zai')).toEqual(['k0'])
    expect(keyChain('zai')).toEqual(['k0'])
  })

  it('every provider carries its own pool, reserve included', () => {
    vi.stubEnv('NVIDIA_API_KEY', 'n0')
    vi.stubEnv('NVIDIA_API_KEYS', 'n1')
    vi.stubEnv('RESERVE_API_KEY', 'r0,r1')
    expect(providerKeys('nemotron')).toEqual(['n0', 'n1'])
    expect(providerKeys('reserve')).toEqual(['r0', 'r1'])
    expect(providerKeys('ollama')).toEqual([])
  })

  it('zai-lite walks its own key first, then the shared pool', () => {
    vi.stubEnv('ZAI_LITE_API_KEY', 'kL')
    vi.stubEnv('GLM_API_KEY', 'k0')
    vi.stubEnv('GLM_API_KEYS', 'k1')
    expect(providerKeys('zai-lite')).toEqual(['kL', 'k0', 'k1'])
  })

  it('the cursor holds the key that answered and turns from the one that fell', () => {
    vi.stubEnv('GLM_API_KEY', 'k0,k1,k2')
    expect(keyChain('zai')).toEqual(['k0', 'k1', 'k2'])
    rememberKey('zai', 'k0', false)
    expect(keyChain('zai')).toEqual(['k1', 'k2', 'k0'])
    rememberKey('zai', 'k1', true)
    expect(keyChain('zai')).toEqual(['k1', 'k2', 'k0'])
    // A cursor left past the end (the key was removed on Railway) wraps.
    rememberKey('zai', 'k2', false)
    rememberKey('zai', 'k0', false)
    expect(keyChain('zai')).toEqual(['k1', 'k2', 'k0'])
    // A key that is no longer in the pool moves nothing.
    rememberKey('zai', 'gone', true)
    expect(keyChain('zai')).toEqual(['k1', 'k2', 'k0'])
  })
})

describe("what counts as the KEY's wall", () => {
  it('the measured key-class refusals rotate; 1305, a bare 429 and a timeout do not', () => {
    expect(isKeyFailure('zai: превышен лимит запросов (code 1302)')).toBe(true)
    expect(
      isKeyFailure(
        'kie: ключ недействителен — перевыпустите и обновите переменную'
      )
    ).toBe(true)
    expect(
      isKeyFailure(
        'reserve: на ключе нет средств — пополните баланс в кабинете провайдера'
      )
    ).toBe(true)
    expect(
      isKeyFailure(
        'nemotron прислал ошибку в потоке: {"message":"ResourceExhausted: Worker local total request limit reached (16/16)"}'
      )
    ).toBe(true)
    expect(isKeyFailure('zai: превышен лимит запросов (code 1305)')).toBe(false)
    expect(isKeyFailure('zai: превышен лимит запросов')).toBe(false)
    expect(isKeyFailure('zai: молчал 60с (таймаут)')).toBe(false)
    expect(isKeyFailure('zai: такой модели нет — проверьте AGENT_MODEL')).toBe(
      false
    )
  })
})

describe('the turn walks the pool', () => {
  it('a 1302 on the primary key is answered by the next key of the same route', async () => {
    vi.stubEnv('GLM_API_KEY', 'k0,k1')
    const seen: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        const auth = String(
          (init?.headers as Record<string, string>)?.Authorization ?? ''
        )
        seen.push(auth)
        return auth === 'Bearer k0' ? refused1302() : sse('Готово')
      })
    )
    const events = await drain()
    expect(seen).toEqual(['Bearer k0', 'Bearer k1'])
    expect(events).toContainEqual({ kind: 'content', text: 'Готово' })
    // The cursor holds k1: a fresh turn starts from the key that answered.
    expect(seen).toEqual(['Bearer k0', 'Bearer k1'])
    const second: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        second.push(
          String((init?.headers as Record<string, string>)?.Authorization ?? '')
        )
        return sse('Снова я')
      })
    )
    await drain()
    expect(second).toEqual(['Bearer k1'])
  })

  it('an exhausted pool is one route verdict, and a key-sharing route is spared', async () => {
    vi.stubEnv('GLM_API_KEY', 'k0,k1,k2')
    const seen: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        seen.push(
          String((init?.headers as Record<string, string>)?.Authorization ?? '')
        )
        return refused1302()
      })
    )
    await expect(drain()).rejects.toThrow('Ни один провайдер')
    // zai walks k0,k1,k2. zai-lite reads the SAME primary key and the same
    // base, so the key-group rule spares it three doomed calls it would
    // answer with the identical refusal.
    expect(seen).toEqual(['Bearer k0', 'Bearer k1', 'Bearer k2'])
  })

  it('a mid-stream account ceiling (nemotron 16/16) rotates to the next key', async () => {
    vi.stubEnv('NVIDIA_API_KEY', 'n0,n1')
    const seen: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        seen.push(
          String((init?.headers as Record<string, string>)?.Authorization ?? '')
        )
        return seen.length === 1 ? nvidiaCeiling() : sse('Вот ответ')
      })
    )
    const events = await drain()
    expect(seen).toEqual(['Bearer n0', 'Bearer n1'])
    expect(events).toContainEqual({ kind: 'content', text: 'Вот ответ' })
  })

  it('a 200 that is really a kie refusal rotates too', async () => {
    vi.stubEnv('KIE_AI_API_KEY', 'j0,j1')
    const seen: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        seen.push(
          String((init?.headers as Record<string, string>)?.Authorization ?? '')
        )
        return seen.length === 1
          ? status(200, '{"code":402,"msg":"insufficient balance"}')
          : sse('От ки')
      })
    )
    const events = await drain()
    expect(seen).toEqual(['Bearer j0', 'Bearer j1'])
    expect(events).toContainEqual({ kind: 'content', text: 'От ки' })
  })

  it('a 1302 zai took on the shared key stops zai-lite from burning a call on it', async () => {
    vi.stubEnv('GLM_API_KEY', 'glm-shared')
    vi.stubEnv('ZAI_LITE_API_KEY', 'lite-own')
    vi.stubEnv('NVIDIA_API_KEY', 'n')
    const seen: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        const auth = String(
          (init?.headers as Record<string, string>)?.Authorization ?? ''
        )
        seen.push(auth)
        return auth === 'Bearer n'
          ? sse('Немо отвечает')
          : status(
              429,
              '{"error":{"code":"1302","message":"High concurrency"}}'
            )
      })
    )
    // zai's 1302 on glm-shared is already known when zai-lite -- a DIFFERENT
    // route now, no key group -- walks its pool: its own key is asked (a
    // fresh wall may hold), but glm-shared is stepped over, not re-asked.
    // The turn survives on nemotron.
    const events = await drain()
    expect(seen).toEqual(['Bearer glm-shared', 'Bearer lite-own', 'Bearer n'])
    expect(events).toContainEqual({ kind: 'content', text: 'Немо отвечает' })
  })

  it('1305 is the model busy for everybody, so no key is burned on it', async () => {
    vi.stubEnv('GLM_API_KEY', 'k0,k1')
    const seen: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        seen.push(
          String((init?.headers as Record<string, string>)?.Authorization ?? '')
        )
        return status(429, '{"error":{"message":"overloaded","code":1305}}')
      })
    )
    await expect(drain()).rejects.toThrow('Ни один провайдер')
    // zai tried k0 and moved ON (not to k1); zai-lite runs the other flash
    // model for exactly this code and tried its own head, also without
    // walking the pool. Two calls, not four.
    expect(seen).toEqual(['Bearer k0', 'Bearer k0'])
  })
})
