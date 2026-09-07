import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import {
  TOKEN_PRICES,
  priceForKieModel,
  тысячиЗнаковКОплате, // cyrillic-ok: existing billing API
} from './billing-shared'
import { reviewedKieModel } from './kie-web-provider'
import { pricingSummary, providerSetup } from './pricing'

const PRIMARY = 'kie/elevenlabs/text-to-speech-multilingual-v2'
const source = readFileSync(new URL('./tools.ts', import.meta.url), 'utf8')
const start = source.indexOf("  {\n    name: 'audio_generate',")
const end = source.indexOf("  {\n    name: 'video_generate',", start)
if (start < 0 || end <= start)
  throw new Error('Audio tool boundaries not found')
const definition = source.slice(start, end).trim().replace(/,$/, '')
const compiled = ts.transpileModule(`const tool = ${definition}; return tool`, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.None,
  },
}).outputText

async function invoke(
  args: Record<string, unknown>,
  failure: boolean | 'transport' = false
) {
  const fetch = vi.fn(async (url: string) => {
    if (url.endsWith('/api/voices')) {
      return new Response(
        JSON.stringify({
          voices: [{ id: 'clone-id', category: 'cloned' }],
          provider: 'elevenlabs',
        })
      )
    }
    if (url.endsWith('/api/generate/audio')) {
      if (failure === 'transport') throw new Error('Internal connection failed')
      if (failure)
        return new Response(JSON.stringify({ error: 'Kie failed' }), {
          status: 500,
        })
      return new Response(
        JSON.stringify({
          url: 'https://fixture.invalid/audio.mp3',
          provider: PRIMARY,
        })
      )
    }
    throw new Error(`Unexpected request: ${url}`)
  })
  const dependencies = {
    spendTokens: vi.fn(async () => ({ ok: true })),
    refundTokens: vi.fn(),
    selfBase: () => 'https://fixture.invalid',
    selfFetch: fetch,
    withTokens: async (_ctx: unknown, _tool: unknown, result: unknown) =>
      result,
    TOKEN_PRICES,
    priceForKieModel,
    тысячиЗнаковКОплате, // cyrillic-ok: actual tool dependency
    reviewedKieModel,
  }
  const tool = new Function(...Object.keys(dependencies), compiled)(
    ...Object.values(dependencies)
  )
  const query = vi.fn(async (sql: string, params: unknown[]) => {
    if (!sql.includes("VALUES ('voiceover', '', $1, '', $2, $3, 'agent')"))
      throw new Error('Unexpected SQL')
    expect(params[0]).toBe('fixture-owner')
    return { rows: [{ id: 'asset-id' }] }
  })
  const result = await tool.handler(args, {
    telegramId: 'fixture-owner',
    pool: { query },
  })
  return {
    result,
    fetch,
    tool,
    charge: dependencies.spendTokens,
    refund: dependencies.refundTokens,
  }
}

describe('agent TTS provider selection', () => {
  it('advertises the actual primary model tariff and no Replicate TTS replacement', () => {
    const audio = pricingSummary()['платно'].find(
      item => item['функция'] === 'audio_generate'
    )
    expect(audio).toMatchObject({
      токенов: 24, // cyrillic-ok: existing pricing protocol field
      unit: 'за 1000 знаков (округление вверх)',
    })
    expect(JSON.stringify(providerSetup('elevenlabs'))).not.toContain(
      'Replicate-озвучку'
    )
  })
  it('uses Kie without touching the Direct account voice catalog', async () => {
    const { result, fetch } = await invoke({ text: 'hello' })
    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith(
      'https://fixture.invalid/api/generate/audio',
      expect.objectContaining({
        body: JSON.stringify({
          text: 'hello',
          voice_id: '',
          voice_name: 'Rachel',
          model: PRIMARY,
        }),
      })
    )
    expect(result).toMatchObject({ сделано: true, provider: PRIMARY }) // cyrillic-ok: existing tool protocol field
    expect(result['голос']).not.toContain('клон владельца')
  })

  it('forwards an explicitly chosen Direct model and voice unchanged', async () => {
    const { fetch, tool } = await invoke({
      text: 'hello',
      model: 'direct/elevenlabs',
      voice_id: 'user-clone',
    })
    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith(
      'https://fixture.invalid/api/generate/audio',
      expect.objectContaining({
        body: JSON.stringify({
          text: 'hello',
          voice_id: 'user-clone',
          voice_name: 'Rachel',
          model: 'direct/elevenlabs',
        }),
      })
    )
    expect(tool.parameters.properties.model).toBeDefined()
  })

  it('charges the existing Kie character tariff and refunds the identical amount on failure', async () => {
    const { result, charge, refund } = await invoke(
      { text: 'x'.repeat(1001) },
      true
    )
    expect(charge).toHaveBeenCalledWith(expect.anything(), 'audio_generate', 48)
    expect(refund).toHaveBeenCalledWith(
      expect.anything(),
      'audio_generate',
      expect.any(String),
      48
    )
    expect(result).toMatchObject({ сделано: false }) // cyrillic-ok: existing tool protocol field
  })

  it('rejects invalid model selection before charging', async () => {
    const { result, charge, fetch } = await invoke({
      text: 'hello',
      model: 'unknown/provider',
    })
    expect(result).toMatchObject({ сделано: false }) // cyrillic-ok: existing tool protocol field
    expect(charge).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('refunds the selected amount when the generation connection fails', async () => {
    const { result, refund } = await invoke(
      { text: 'x'.repeat(1001) },
      'transport'
    )
    expect(result).toMatchObject({ сделано: false }) // cyrillic-ok: existing tool protocol field
    expect(refund).toHaveBeenCalledWith(
      expect.anything(),
      'audio_generate',
      expect.any(String),
      48
    )
  })
})

describe('wallet helpers honor an explicit model-priced amount', () => {
  it('debits, reports and refunds the same amount using actual wallet helpers', async () => {
    const helperStart = source.indexOf('async function spendTokens(')
    const helperEnd = source.indexOf('import { ценаТокенов', helperStart)
    if (helperStart < 0 || helperEnd <= helperStart)
      throw new Error('Wallet helper boundaries not found')
    const helpers = ts.transpileModule(source.slice(helperStart, helperEnd), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.None,
      },
    }).outputText
    let balance = 100
    const query = vi.fn(async (sql: string, values: unknown[]) => {
      const normalized = sql.replace(/\s+/g, ' ').trim()
      expect(values[0]).toBe('fixture-owner')
      const amount = Number(values[1])
      if (
        normalized ===
        'UPDATE user_tokens SET balance = balance - $2, updated_at = now() WHERE telegram_id = $1 AND balance >= $2 RETURNING balance'
      ) {
        if (balance < amount) return { rows: [] }
        balance -= amount
      } else if (
        normalized ===
        'UPDATE user_tokens SET balance = balance + $2, updated_at = now() WHERE telegram_id = $1'
      ) {
        balance += amount
      } else {
        throw new Error(`Unexpected wallet SQL: ${normalized}`)
      }
      return { rows: [{ balance }] }
    })
    const wallet = new Function(
      'TOKEN_PRICES',
      'HOUSE_TELEGRAM_IDS',
      'ensureTokenRow',
      'console',
      `${helpers}; return { spendTokens, refundTokens, withTokens }`
    )(TOKEN_PRICES, [], async () => balance, { log: vi.fn(), error: vi.fn() })
    const ctx = { telegramId: 'fixture-owner', pool: { query } }
    expect(await wallet.spendTokens(ctx, 'audio_generate', 48)).toMatchObject({
      ok: true,
      потрачено: 48, // cyrillic-ok: existing wallet protocol field
      осталось: 52, // cyrillic-ok: existing wallet protocol field
    })
    expect(
      await wallet.withTokens(ctx, 'audio_generate', { success: true }, 48)
    ).toMatchObject({ токены: { потрачено: 48, осталось: 52 } }) // cyrillic-ok: existing wallet protocol fields
    await wallet.refundTokens(ctx, 'audio_generate', 'provider failed', 48)
    expect(balance).toBe(100)
    expect(await wallet.spendTokens(ctx, 'audio_generate', 101)).toMatchObject({
      ok: false,
    })
    expect(balance).toBe(100)
  })
})
