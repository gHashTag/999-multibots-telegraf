/**
 * THE SELLER REACHES THE REEL TEMPLATE (crm-story-reel.t27 v3).
 *
 * Production, 2026-09-27, the owner's chat with the CRM agent about a client:
 * asked for "a reel in her voice", the agent called providers_status, read
 * "voice (ElevenLabs) broken", told the owner to fix the ElevenLabs key,
 * asked the client for a voice note while two of hers sat in the chat, and
 * assembled a talking clip by hand from lipsync_generate. Every step was
 * honest about what it was told -- and what it was told was wrong:
 *
 *   - a client's voice and clone are MiniMax on Replicate; ElevenLabs is
 *     only the library voices, and its key is not theirs;
 *   - Replicate's health check (GET /v1/account) answers 200 with no credit,
 *     so the real blocker, a 402 on the clone, showed nowhere;
 *   - the playbook never said that a talking reel in a client's voice IS the
 *     template, nor that the voice notes she sent are looked for first.
 *
 * What this pins: the words the agent reads route it to the template, and
 * the voice's health is the last real call.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import * as REEL from './src/spec/crm-story-reel.gen'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the words the seller reads route a talking reel to the template', () => {
  it('the second-gift point names the template first, her old voice notes, and Replicate', async () => {
    const { STORY_GIFT, salesPlaybook } = await import(
      './src/agent/crm-playbook'
    )
    expect(STORY_GIFT).toContain(`${REEL.SELLER_TOOL} {lead} без start`)
    expect(STORY_GIFT).toContain(
      `${REEL.CLONE_TOOL} {chat} сам найдёт голосовые`
    )
    expect(STORY_GIFT).toMatch(
      /руками из lipsync_generate и audio_generate не собирай/
    )
    expect(STORY_GIFT).toMatch(/НЕ ElevenLabs/)
    expect(STORY_GIFT).toMatch(/пополнить Replicate/)
    expect(STORY_GIFT).toContain(`~${REEL.PRICE_ESTIMATE_TOKENS} ток.`)
    expect(STORY_GIFT).toContain(`пауза ${REEL.PAUSE_SEC} с`)
    // Every seller's turn reads it.
    expect(salesPlaybook({ seller: true })).toContain(STORY_GIFT)
    expect(REEL.HAND_ASSEMBLY_IN_CHAT).toBe(false)
    expect(REEL.SENT_VOICE_NOTES_TRIED_FIRST).toBe(true)
  })

  it('the tools say where the voice comes from', async () => {
    const { TOOLS } = await import('./src/agent/tools')
    const say = (n: string) =>
      String(TOOLS.find(t => t.name === n)?.description ?? '')
    expect(say('crm_story_reel')).toMatch(/ЛЮБОЙ говорящий рилс/)
    expect(say('crm_story_reel')).toMatch(/ElevenLabs не нужен/)
    expect(say('audio_generate')).toMatch(
      /for_lead[^.]*Replicate, ключ ElevenLabs ему НЕ нужен/
    )
    expect(say('audio_generate')).not.toMatch(
      /^Озвучить текст голосом \(ElevenLabs\)/
    )
    expect(say('providers_status')).toMatch(/голос клиента \(Replicate\)/)
    expect(REEL.VOICE_NEEDS_ELEVENLABS).toBe(false)
  })
})

describe("the client's voice is as healthy as its last real call", () => {
  /** The health page as the handler reads it: Replicate's account check says 200. */
  function healthPage() {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              работает: 3,
              всего: 4,
              провайдеры: [
                {
                  провайдер: 'Replicate — видео и голос клиента',
                  ok: true,
                  детали: 'HTTP 200',
                },
                {
                  провайдер: 'ElevenLabs — библиотечные голоса',
                  ok: false,
                  детали: 'в переменной идентификатор ключа',
                },
              ],
            }),
            { status: 200 }
          )
      )
    )
  }

  it('a 402 on a real clone makes the voice line say so, and name Replicate, not ElevenLabs', async () => {
    const health = await import('./src/agent/image-health')
    health.forgetImageHealthForTests()
    health.noteVoiceFailed('Replicate HTTP 402: Insufficient credit')
    healthPage()
    const { TOOLS } = await import('./src/agent/tools')
    const r: any = await TOOLS.find(
      t => t.name === 'providers_status'
    )!.handler({}, {
      telegramId: '900000001',
      pool: { query: async () => ({ rows: [] }) },
    } as never)
    const line = String(r['голос_клиента']) // cyrillic-ok: the answer field under test
    expect(line).toMatch(/^НЕ работает/)
    expect(line).toMatch(/402/)
    expect(line).toMatch(/пополнить Replicate/)
    expect(line).toMatch(/не ключ ElevenLabs/)
    expect(REEL.VOICE_HEALTH_FROM_REAL_CALLS).toBe(true)
  })

  it('with no refusal seen, the voice is available whatever ElevenLabs says', async () => {
    const health = await import('./src/agent/image-health')
    health.forgetImageHealthForTests()
    healthPage()
    const { TOOLS } = await import('./src/agent/tools')
    const r: any = await TOOLS.find(
      t => t.name === 'providers_status'
    )!.handler({}, {
      telegramId: '900000001',
      pool: { query: async () => ({ rows: [] }) },
    } as never)
    expect(String(r['голос_клиента'])).toMatch(
      /ключ ElevenLabs для них не нужен/
    ) // cyrillic-ok: the answer field under test
  })

  it('a clone that came back clears the doubt; a refused prompt is not an outage', async () => {
    const h = await import('./src/agent/image-health')
    h.forgetImageHealthForTests()
    h.noteVoiceFailed('HTTP 402 insufficient credit')
    expect(h.voiceLooksDown()).not.toBeNull()
    h.noteVoiceWorked()
    expect(h.voiceLooksDown()).toBeNull()
    h.noteVoiceFailed('text contains a forbidden word')
    expect(h.voiceLooksDown()).toBeNull()
    // The images' memory is its own.
    h.noteVoiceFailed('HTTP 402')
    expect(h.imagesLookDown()).toBeNull()
  })
})

describe('the provider reference card says what the last real call said', () => {
  it('Replicate reads "needs payment" after a real 402, and "works" again after a clone', async () => {
    const h = await import('./src/agent/image-health')
    const { providerSetup } = await import('./src/agent/pricing')
    h.forgetImageHealthForTests()
    const ok: any = providerSetup('replicate')
    expect(ok['статус']).toBe('работает') // cyrillic-ok: the answer field under test
    h.noteVoiceFailed('Replicate HTTP 402: Insufficient credit')
    const broke: any = providerSetup('replicate')
    expect(broke['статус']).toBe('нужна оплата') // cyrillic-ok: the answer field under test
    expect(broke['заметка']).toMatch(/402/) // cyrillic-ok: the answer field under test
    const all: any = providerSetup()
    expect(all['совет']).toMatch(/пополни/) // cyrillic-ok: the answer field under test
    // ElevenLabs is not the client's voice, and the card says so.
    expect(all['провайдеры'].elevenlabs['даёт']).toMatch(/НЕ голос клиента/) // cyrillic-ok: the answer field under test
    h.noteVoiceWorked()
    expect((providerSetup('replicate') as any)['статус']).toBe('работает') // cyrillic-ok: the answer field under test
  })
})
