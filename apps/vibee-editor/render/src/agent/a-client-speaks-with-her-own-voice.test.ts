/**
 * A CLIENT SPEAKS WITH HER OWN VOICE (owner, 2026-09-26).
 *
 * "Make her reel about her business, so she can post it to Instagram, with
 * her photo, and use her voice from the chat." The second gift is voiced
 * with a clone made from the voice notes SHE sent the owner. What must hold:
 *
 *   1. only her notes -- the owner's own notes in the same chat are a
 *      different voice, and a clone of a mixture is nobody's;
 *   2. a clone already paid for is never paid for again;
 *   3. no notes, too little voice, a stranger named in a client's turn: a
 *      refusal that charged nothing;
 *   4. a clone the provider refused is refunded to the token;
 *   5. the clone reaches the route only in `clone_voice`, chosen by the
 *      service -- never as a `voice_id` the model wrote.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  makeLeadVoiceTool,
  herNotes,
  personOf,
  noteSeconds,
} from './crm-voice-clone-tool'
import {
  cloneInput,
  voiceIdOf,
  joinArgs,
  VOICE_CLONE_TTS_MODEL,
  LEAD_VOICE_MAX_SECONDS,
} from './lead-voice'
import { TOKEN_PRICES, OPERATION_COST_USD } from './billing-shared'

type Row = Record<string, unknown>

/** A pool that knows lead_voices and answers everything else with nothing. */
function poolWith(saved: Row[] = []) {
  const inserts: unknown[][] = []
  return {
    inserts,
    async query(sql: string, params: unknown[] = []) {
      if (/SELECT lead_id, voice_id/.test(sql)) {
        const [owner, key] = params as string[]
        return {
          rows: saved.filter(
            r =>
              r.owner_id === owner && (r.lead_id === key || r.username === key)
          ),
        }
      }
      if (/INSERT INTO lead_voices/.test(sql)) inserts.push(params)
      return { rows: [] }
    },
  }
}

const voiceNote = (id: number, out: boolean, seconds: number) => ({
  id,
  out,
  peerId: { className: 'PeerUser', userId: { toString: () => '900000077' } },
  media: {
    document: {
      attributes: [{ className: 'DocumentAttributeAudio', duration: seconds }],
    },
  },
})

function depsFor(o: Partial<Record<string, any>> = {}) {
  const calls = {
    notes: 0,
    charge: 0,
    refund: [] as number[],
    clone: [] as string[],
  }
  const deps = {
    notes:
      o.notes ??
      (async () => {
        calls.notes++
        return { lead: '900000077', files: [Buffer.from('ogg')], seconds: 20 }
      }),
    charge: async () => {
      calls.charge++
      return o.charge ?? { ok: true as const, spent: 1200 }
    },
    refund: async (_c: unknown, _w: string, spent: number) => {
      calls.refund.push(spent)
    },
    put: async () => ({ url: 'https://ours/s3/assets/lead-voice.mp3' }),
    join:
      o.join ??
      (async (_inputs: string[], out: string) => {
        fs.writeFileSync(out, 'mp3')
        return 20
      }),
    clone:
      o.clone ??
      (async (url: string) => {
        calls.clone.push(url)
        return 'lead_900000077_v1'
      }),
    price: 1200,
  }
  return { deps, calls }
}

const ctx = (pool: unknown, extra: Row = {}) =>
  ({ telegramId: '900000001', pool, ...extra }) as never

describe('her notes, not the owner’s', () => {
  it('drops the owner’s own voice notes from the chat', () => {
    const list = [
      voiceNote(3, true, 9),
      voiceNote(2, false, 7),
      voiceNote(1, false, 12),
    ]
    expect(herNotes(list).map(m => m.id)).toEqual([2, 1])
  })

  it('knows the person of a private chat, and refuses a group', () => {
    expect(personOf([voiceNote(1, false, 5)], '@example_client')).toBe(
      '900000077'
    )
    expect(
      personOf(
        [{ id: 1, peerId: { className: 'PeerChannel' } }],
        '@ourcommunity'
      )
    ).toBeNull()
  })

  it('reads how long a note is from Telegram’s own attribute', () => {
    expect(noteSeconds(voiceNote(1, false, 11))).toBe(11)
    expect(noteSeconds({ id: 1 })).toBe(0)
  })
})

describe('crm_voice_clone', () => {
  it('a clone already made is returned, not paid for and not fetched again', async () => {
    const pool = poolWith([
      {
        owner_id: '900000001',
        lead_id: '900000077',
        username: 'example_client',
        voice_id: 'lead_v0',
        seconds: 30,
      },
    ])
    const { deps, calls } = depsFor()
    const r: any = await makeLeadVoiceTool(deps).handler(
      { chat: '@example_client' },
      ctx(pool)
    )
    expect(r.сделано).toBe(true) // cyrillic-ok: the tools’ answer fields
    expect(r.уже_был).toBe(true) // cyrillic-ok: the tools’ answer fields
    expect(r.for_lead).toBe('900000077')
    expect(calls.charge).toBe(0)
    expect(calls.notes).toBe(0)
  })

  it('another owner’s clone of the same person is not this owner’s', async () => {
    const pool = poolWith([
      { owner_id: '900000002', lead_id: '900000077', voice_id: 'theirs' },
    ])
    const { deps, calls } = depsFor()
    const r: any = await makeLeadVoiceTool(deps).handler(
      { chat: '900000077' },
      ctx(pool)
    )
    expect(r.уже_был).toBeUndefined() // cyrillic-ok: the tools’ answer fields
    expect(calls.charge).toBe(1)
  })

  it('no voice notes from her: asks for one, charges nothing', async () => {
    const { deps, calls } = depsFor({
      notes: async () => ({ lead: '900000077', files: [], seconds: 0 }),
    })
    const r: any = await makeLeadVoiceTool(deps).handler(
      { chat: '@example_client' },
      ctx(poolWith())
    )
    expect(r.сделано).toBe(false) // cyrillic-ok: the tools’ answer fields
    expect(r.причина).toMatch(/голосов/) // cyrillic-ok: the tools’ answer fields
    expect(calls.charge).toBe(0)
  })

  it('too little of her voice: refuses before charging', async () => {
    const { deps, calls } = depsFor({ join: async () => 3.2 })
    const r: any = await makeLeadVoiceTool(deps).handler(
      { chat: '@example_client' },
      ctx(poolWith())
    )
    expect(r.сделано).toBe(false) // cyrillic-ok: the tools’ answer fields
    expect(r.причина).toMatch(/3\.2 с/) // cyrillic-ok: the tools’ answer fields
    expect(calls.charge).toBe(0)
  })

  it('not a private chat: refused', async () => {
    const { deps, calls } = depsFor({
      notes: async () => ({ lead: null, files: [], seconds: 0 }),
    })
    const r: any = await makeLeadVoiceTool(deps).handler(
      { chat: '@ourcommunity' },
      ctx(poolWith())
    )
    expect(r.сделано).toBe(false) // cyrillic-ok: the tools’ answer fields
    expect(calls.charge).toBe(0)
  })

  it('in a client’s own turn, naming somebody else is refused before any fetch', async () => {
    const { deps, calls } = depsFor()
    const r: any = await makeLeadVoiceTool(deps).handler(
      { chat: '900000099' },
      ctx(poolWith(), { faceOf: '900000077' })
    )
    expect(r.сделано).toBe(false) // cyrillic-ok: the tools’ answer fields
    expect(calls.notes).toBe(0)
    expect(calls.charge).toBe(0)
  })

  it('clones once, from our shelf copy, and keeps it against (owner, lead)', async () => {
    const pool = poolWith()
    const { deps, calls } = depsFor()
    const r: any = await makeLeadVoiceTool(deps).handler(
      { chat: '@example_client' },
      ctx(pool)
    )
    expect(r.сделано).toBe(true) // cyrillic-ok: the tools’ answer fields
    expect(r.for_lead).toBe('900000077')
    expect(r.дальше).toContain('for_lead: "900000077"') // cyrillic-ok: the tools’ answer fields
    expect(calls.charge).toBe(1)
    expect(calls.clone).toEqual(['https://ours/s3/assets/lead-voice.mp3'])
    expect(pool.inserts).toHaveLength(1)
    const [owner, lead, username, voiceId] = pool.inserts[0] as string[]
    expect([owner, lead, username, voiceId]).toEqual([
      '900000001',
      '900000077',
      'example_client',
      'lead_900000077_v1',
    ])
  })

  it('a refused clone is refunded exactly what was charged', async () => {
    const pool = poolWith()
    const { deps, calls } = depsFor({
      clone: async () => {
        throw new Error('voice cloning failed: bad audio')
      },
    })
    const r: any = await makeLeadVoiceTool(deps).handler(
      { chat: '@example_client' },
      ctx(pool)
    )
    expect(r.сделано).toBe(false) // cyrillic-ok: the tools’ answer fields
    expect(r.причина).toMatch(/bad audio/) // cyrillic-ok: the tools’ answer fields
    expect(calls.refund).toEqual([1200])
    expect(pool.inserts).toHaveLength(0)
  })

  it("Replicate out of credit is remembered as the voice's health; a clone that came back clears it", async () => {
    // Its account check answers 200 with no credit: the next turn learns the
    // truth only from here (image-health.ts, crm-story-reel.t27 v3).
    const health = await import('./image-health')
    health.forgetImageHealthForTests()
    const broke = depsFor({
      clone: async () => {
        throw new Error('Replicate HTTP 402: Insufficient credit')
      },
    })
    await makeLeadVoiceTool(broke.deps).handler(
      { chat: '@example_client' },
      ctx(poolWith())
    )
    expect(health.voiceLooksDown()?.why).toMatch(/402/)
    const ok = depsFor()
    await makeLeadVoiceTool(ok.deps).handler(
      { chat: '@example_client' },
      ctx(poolWith())
    )
    expect(health.voiceLooksDown()).toBeNull()
  })
})

describe('the provider call', () => {
  it('clones for the very model our TTS leg speaks with', () => {
    const server = fs.readFileSync(
      path.join(__dirname, '..', '..', 'render-server.ts'),
      'utf8'
    )
    expect(server).toContain(`minimax/${VOICE_CLONE_TTS_MODEL}/predictions`)
    expect(cloneInput('https://ours/v.mp3')).toMatchObject({
      voice_file: 'https://ours/v.mp3',
      model: VOICE_CLONE_TTS_MODEL,
      need_noise_reduction: true,
    })
  })

  it('reads the voice id from the output, and nothing that is not an id', () => {
    expect(voiceIdOf({ voice_id: 'R8_abc123' })).toBe('R8_abc123')
    expect(voiceIdOf('R8_abc123')).toBe('R8_abc123')
    expect(voiceIdOf({ voice_id: 'not an id' })).toBeNull()
    expect(voiceIdOf(null)).toBeNull()
  })

  it('joins every note into one mono MP3, capped in length', () => {
    const args = joinArgs(['a.ogg', 'b.ogg', 'c.ogg'], 'v.mp3')
    expect(args.filter(a => a === '-i')).toHaveLength(3)
    expect(args.join(' ')).toContain('concat=n=3:v=0:a=1')
    expect(args).toContain('libmp3lame')
    expect(args[args.indexOf('-t') + 1]).toBe(String(LEAD_VOICE_MAX_SECONDS))
    expect(args[args.length - 1]).toBe('v.mp3')
  })

  it('costs what the provider page says, with the markup: $3 -> 1200 tokens', () => {
    expect(OPERATION_COST_USD.voice_clone).toBe(3)
    expect(TOKEN_PRICES.voice_clone).toBe(1200)
  })
})

describe('the clone reaches the provider only by the service’s choice', () => {
  const tools = fs.readFileSync(path.join(__dirname, 'tools.ts'), 'utf8')
  const server = fs.readFileSync(
    path.join(__dirname, '..', '..', 'render-server.ts'),
    'utf8'
  )

  it('audio_generate speaks for_lead with the clone THIS owner made', () => {
    expect(tools).toMatch(
      /leadVoiceOf\(\s*ctx\.pool,\s*String\(ctx\.telegramId\)/
    )
    expect(tools).toMatch(/clone_voice: cloneVoice/)
  })

  it('the route takes a clone only from its api-key caller, and skips ElevenLabs for it', () => {
    expect(server).toMatch(
      /authenticate\(req\)\.via === 'api-key' && isCloneVoiceId\(clone_voice\)/
    )
    expect(server).toMatch(/if \(cloneVoice\) throw new Error/)
  })

  it('the tool is in the registry', async () => {
    const { TOOLS_BY_NAME } = await import('./tools')
    expect(TOOLS_BY_NAME.get('crm_voice_clone')).toBeTruthy()
  })
})
