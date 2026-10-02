import { describe, expect, it, vi } from 'vitest'
import {
  makeVoiceCloneSpeakTool,
  type VoiceCloneEnv,
  type VoiceCloneSpeakDeps,
} from './voice-clone-speak'

const OWNER = '111'
const STRANGER = '222'
const SAMPLE = Buffer.from('RIFF-sample-bytes')
const WAV = Buffer.from('RIFF-wav-out')

function deps(
  over: Partial<VoiceCloneSpeakDeps> = {},
  env?: Partial<VoiceCloneEnv>
) {
  const d = {
    env: () => ({
      url: 'http://voice-clone.test:8080',
      key: 'test-key',
      ownerRef: 'https://shelf.test/owner-voice.ogg',
      ...env,
    }),
    sample: vi.fn(async () => ({ ok: true as const, bytes: SAMPLE })),
    put: vi.fn(async () => 'https://shelf.test/voice-clone-1.wav'),
    mayUseOwnerVoice: (who: string) => who === OWNER,
    fetch: vi.fn(
      async () =>
        new Response(new Uint8Array(WAV), {
          status: 200,
          headers: { 'Content-Type': 'audio/wav', 'X-Seconds': '3.25' },
        })
    ),
    ...over,
  }
  return d
}

const ctx = (telegramId: string) => ({ telegramId }) as any

describe('voice_clone_speak', () => {
  it('refuses with a clear reason when VOICE_CLONE_KEY is missing', async () => {
    const d = deps({}, { key: '' })
    const r: any = await makeVoiceCloneSpeakTool(d).handler(
      { text: 'hello' },
      ctx(OWNER)
    )
    expect(r.done).toBe(false)
    expect(r.reason).toMatch(/VOICE_CLONE_KEY/)
    expect(d.fetch).not.toHaveBeenCalled()
    expect(d.sample).not.toHaveBeenCalled()
  })

  it("refuses a non-owner without ref_url, and refuses the owner's sample passed by hand", async () => {
    const d = deps()
    const tool = makeVoiceCloneSpeakTool(d)
    const bare: any = await tool.handler({ text: 'hello' }, ctx(STRANGER))
    expect(bare.done).toBe(false)
    expect(bare.reason).toMatch(/ref_url is required/)
    const borrowed: any = await tool.handler(
      { text: 'hello', ref_url: 'https://shelf.test/owner-voice.ogg' },
      ctx(STRANGER)
    )
    expect(borrowed.done).toBe(false)
    expect(d.sample).not.toHaveBeenCalled()
    expect(d.fetch).not.toHaveBeenCalled()
  })

  it('speaks in the owner voice: Bearer key, body shape, upload, {url, seconds}', async () => {
    const d = deps()
    const r: any = await makeVoiceCloneSpeakTool(d).handler(
      { text: '  Привет, это Тринити.  ' }, // cyrillic-ok: test speech
      ctx(OWNER)
    )
    expect(r).toEqual({
      done: true,
      url: 'https://shelf.test/voice-clone-1.wav',
      seconds: 3.25,
    })
    expect(d.sample).toHaveBeenCalledWith(
      'https://shelf.test/owner-voice.ogg',
      8 * 1024 * 1024
    )
    expect(d.fetch).toHaveBeenCalledTimes(1)
    const [url, init] = (d.fetch as any).mock.calls[0]
    expect(url).toBe('http://voice-clone.test:8080/speak')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer test-key')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual({
      input: 'Привет, это Тринити.', // cyrillic-ok: test speech
      lang: 'ru',
      ref_b64: SAMPLE.toString('base64'),
    })
    expect(d.put).toHaveBeenCalledTimes(1)
    const [bytes, mime, name] = (d.put as any).mock.calls[0]
    expect(Buffer.compare(bytes, WAV)).toBe(0)
    expect(mime).toBe('audio/wav')
    expect(name).toMatch(/^voice-clone-\d+\.wav$/)
  })

  it('says busy on 429/503 and stores nothing', async () => {
    const d = deps({
      fetch: vi.fn(async () => new Response('busy', { status: 429 })),
    })
    const r: any = await makeVoiceCloneSpeakTool(d).handler(
      { text: 'hello', ref_url: 'https://example.com/me.ogg', lang: 'en' },
      ctx(STRANGER)
    )
    expect(r).toMatchObject({ done: false, busy: true })
    expect(r.reason).toMatch(/busy/)
    expect(d.put).not.toHaveBeenCalled()
  })
})
