import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  sweepOnce,
  namedToolInsteadOfCalling,
  resetProactiveForTests,
  type SweepDeps,
} from '@/services/crmProactive'
import { спроситьАгента } from '@/services/trinityAgent' // cyrillic-ok: pre-existing identifier

/**
 * THE SWEEP NAMES ITS MODEL.
 *
 * Production 2026-09-08, -09, -10: `[[Подпись|can]]`, `[[Подпись|no_one_available]]`,
 * `[[Подпись|crm_leads]]`, `[[Подпись|tg_send]]` -- the tool's name inside the
 * button-marker template, zero tool calls, and no line anywhere saying which
 * of four fallback providers wrote it. Three prompt repairs went in blind.
 * Now the answer carries `провайдер`, the failure text names it, and the
 * sweep asks the render for a model that calls tools (tools_only).
 */
const OWNER = '144022504'

function deps(answer: unknown, leads?: Array<Record<string, unknown>>) {
  const d: SweepDeps = {
    ask: async () => answer as never,
    ingest: async () => {},
    push: async () => {},
    record: async () => 'recorded',
    leads: leads ? async () => leads : undefined,
    now: () => 1_000_000,
  }
  return d
}

beforeEach(() => resetProactiveForTests())

describe('recognising the marker-instead-of-call answer', () => {
  it('reads the tool name out of the marker, and nothing else', () => {
    expect(namedToolInsteadOfCalling('[[Подпись|tg_send]]')).toBe('tg_send')
    expect(namedToolInsteadOfCalling(' [[Подпись|crm_leads]] ')).toBe('crm_leads')
    expect(namedToolInsteadOfCalling('[[Ответить|act:can]]')).toBe('act:can')
    expect(namedToolInsteadOfCalling('тихо')).toBeNull()
    expect(namedToolInsteadOfCalling('Подготовил ответ Тиму [[Ответить|act:can]]')).toBeNull()
    expect(namedToolInsteadOfCalling('')).toBeNull()
  })
})

describe('the failure text', () => {
  it('says who is waiting, that the model named the tool, and which model', async () => {
    const r = await sweepOnce(
      OWNER,
      deps(
        { текст: '[[Подпись|tg_send]]', инструменты: [], provider: 'ollama/qwen3:1.7b' }, // cyrillic-ok: pre-existing identifiers
        [{ lead: '555', display: 'Tim (@Best_WoodyWeed)', next: 'reply' }]
      )
    )
    expect(r.did).toBe('failed')
    expect(r.why).toContain('ждёт Tim (@Best_WoodyWeed) (next=reply)')
    expect(r.why).toContain('написала имя инструмента tg_send вместо вызова')
    expect(r.why).toContain('[модель ollama/qwen3:1.7b]')
  })

  it('without a provider on the answer the text still stands, just unnamed', async () => {
    const r = await sweepOnce(
      OWNER,
      deps({ текст: 'ничего не буду делать', инструменты: [] }) // cyrillic-ok: pre-existing identifiers
    )
    expect(r.did).toBe('failed')
    expect(r.why).toContain('не вызвав ни одного инструмента')
    expect(r.why).not.toContain('[модель')
  })
})

describe('the answer carries its provider and the sweep asks for tools', () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
    vi.unstubAllEnvs()
  })

  it('reads the провайдер event and sends tools_only when asked', async () => {
    vi.stubEnv('RENDER_API_KEY', 'k')
    let sentBody: any = null
    const ndjson = [
      JSON.stringify({ тип: 'провайдер', id: 'zai', model: 'glm-5.3' }), // cyrillic-ok: pre-existing identifiers
      JSON.stringify({ тип: 'инструмент', имя: 'crm_leads', аргументы: '{}' }), // cyrillic-ok: pre-existing identifiers
      JSON.stringify({ тип: 'текст', текст: 'тихо' }), // cyrillic-ok: pre-existing identifiers
      JSON.stringify({ тип: 'готово', витков: 2 }), // cyrillic-ok: pre-existing identifiers
    ].join('\n')
    globalThis.fetch = (async (url: string, init: any) => {
      if (String(url).includes('/api/agent/chat')) {
        sentBody = JSON.parse(init.body)
        return new Response(ndjson, { status: 200 })
      }
      // The conversation read before the turn: empty history.
      return new Response(JSON.stringify({ turns: [] }), { status: 200 })
    }) as never
    const a = await спроситьАгента(OWNER, 'бриф', { toolsOnly: true }) // cyrillic-ok: pre-existing identifiers
    expect(a.provider).toBe('zai/glm-5.3')
    expect(a.инструменты).toEqual(['crm_leads']) // cyrillic-ok: pre-existing identifiers
    expect(a.текст).toBe('тихо') // cyrillic-ok: pre-existing identifiers
    expect(sentBody.tools_only).toBe(true)

    sentBody = null
    const b = await спроситьАгента(OWNER, 'вопрос') // cyrillic-ok: pre-existing identifiers
    expect(b.provider).toBe('zai/glm-5.3')
    expect(sentBody.tools_only).toBeUndefined()
  })
})
