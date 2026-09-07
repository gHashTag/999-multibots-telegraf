import { readFileSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import { reviewedKieModel } from './src/agent/kie-web-provider'
import { тысячиЗнаковКОплате } from './src/agent/billing-shared' // cyrillic-ok: existing billing API
import { имяДляElevenLabs, скоростьРечи } from './src/agent/minimax-voices' // cyrillic-ok: existing provider API

const PRIMARY = 'kie/elevenlabs/text-to-speech-multilingual-v2'
const source = readFileSync(
  new URL('./render-server.ts', import.meta.url),
  'utf8'
)
const start = source.indexOf("  if (req.url === '/api/generate/audio'")
const end = source.indexOf('  // GET /api/voices', start)
if (start < 0 || end <= start)
  throw new Error('Audio route boundaries not found')
// Execute the real handler, without starting the server or loading credentials.
const route = ts.transpileModule(source.slice(start, end), {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.None,
  },
}).outputText

async function request(
  body: Record<string, unknown>,
  failedProvider?: 'kie' | 'direct'
) {
  const req = Object.assign(new EventEmitter(), {
    url: '/api/generate/audio',
    method: 'POST',
  })
  let status = 0
  let response: Record<string, unknown> = {}
  const res = {
    writeHead: vi.fn((code: number) => {
      status = code
    }),
    end: vi.fn((data: string) => {
      response = JSON.parse(data)
    }),
  }
  const charge = vi.fn(async () => ({
    ok: true,
    tid: '123',
    receipt: { charged: 48, balance: 100 },
  }))
  const refund = vi.fn(async () => undefined)
  const kie = vi.fn(async () => {
    if (failedProvider === 'kie') throw new Error('Kie unavailable')
    return { url: 'https://fixture.invalid/kie.mp3', taskId: 'kie-task' }
  })
  const directKey = vi.fn(() => {
    if (failedProvider === 'direct') throw new Error('ElevenLabs key invalid')
    return 'fixture-not-a-real-key'
  })
  const direct = vi.fn(
    async () => new Response(JSON.stringify({ audio_base64: 'YXVkaW8=' }))
  )
  const replicate = vi.fn(async () => 'https://fixture.invalid/replicate.mp3')
  const dependencies = {
    req,
    res,
    Buffer,
    console: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
    chargeMiniAppUser: charge,
    refundMiniAppUser: refund,
    generationOwnerId: () => undefined,
    тысячиЗнаковКОплате, // cyrillic-ok: actual handler dependency
    reviewedKieModel,
    имяДляElevenLabs, // cyrillic-ok: actual handler dependency
    скоростьРечи, // cyrillic-ok: actual handler dependency
    runExplicitKieJob: kie,
    elevenLabsKey: directKey,
    fetch: direct,
    generateAudioViaReplicate: replicate,
    uploadToS3: vi.fn(async () => ({
      success: true,
      url: 'https://fixture.invalid/direct.mp3',
    })),
    captionsFromCharacterAlignment: () => [{ text: 'hello', start: 0, end: 1 }],
  }
  const run = new Function(
    ...Object.keys(dependencies),
    `return (async () => { ${route} })()`
  )
  await run(...Object.values(dependencies))
  req.emit('data', JSON.stringify(body))
  const [finish] = req.listeners('end')
  await finish()
  return { status, response, charge, refund, kie, directKey, direct, replicate }
}

describe('audio provider policy at the HTTP boundary', () => {
  it('defaults omitted model to Kie with the same effective model for billing', async () => {
    const result = await request({ text: 'x'.repeat(1001) })
    expect(result.status).toBe(200)
    expect(result.kie).toHaveBeenCalledOnce()
    expect(result.kie).toHaveBeenCalledWith(
      PRIMARY.slice(4),
      expect.objectContaining({ voice: 'Rachel' })
    )
    expect(result.charge).toHaveBeenCalledWith(
      expect.anything(),
      'audio_generate',
      2,
      PRIMARY
    )
    expect(result.response).toMatchObject({ provider: PRIMARY, charged: 48 })
    expect(result.response).not.toHaveProperty('timed_captions')
    expect(result.directKey).not.toHaveBeenCalled()
    expect(result.replicate).not.toHaveBeenCalled()
  })

  it('returns Kie failure and refunds the chosen model without trying other paid providers', async () => {
    const result = await request(
      { text: 'x'.repeat(1001), model: PRIMARY },
      'kie'
    )
    expect(result.status).toBe(500)
    expect(result.response).toMatchObject({
      success: false,
      error: 'Kie unavailable',
    })
    expect(result.refund).toHaveBeenCalledWith(
      '123',
      'audio_generate',
      2,
      PRIMARY
    )
    expect(result.directKey).not.toHaveBeenCalled()
    expect(result.replicate).not.toHaveBeenCalled()
  })

  it('keeps explicit Direct ElevenLabs and its genuine timed captions available', async () => {
    const result = await request({
      text: 'hello',
      model: 'direct/elevenlabs',
      voice_id: 'explicit-voice',
    })
    expect(result.status).toBe(200)
    expect(result.direct).toHaveBeenCalledWith(
      'https://api.elevenlabs.io/v1/text-to-speech/explicit-voice/with-timestamps',
      expect.anything()
    )
    expect(result.response).toMatchObject({
      provider: 'elevenlabs',
      timed_captions: [{ text: 'hello', start: 0, end: 1 }],
    })
    expect(result.kie).not.toHaveBeenCalled()
    expect(result.replicate).not.toHaveBeenCalled()
  })

  it('does not replace a failed explicit Direct selection with Replicate', async () => {
    const result = await request(
      { text: 'hello', model: 'direct/elevenlabs', voice_id: 'explicit-voice' },
      'direct'
    )
    expect(result.status).toBe(500)
    expect(result.response.error).toBe('ElevenLabs key invalid')
    expect(result.refund).toHaveBeenCalledWith(
      '123',
      'audio_generate',
      1,
      'direct/elevenlabs'
    )
    expect(result.replicate).not.toHaveBeenCalled()
  })

  it('rejects unsupported models before billing or generation', async () => {
    const result = await request({ text: 'hello', model: 'unknown/provider' })
    expect(result.status).toBe(400)
    expect(result.charge).not.toHaveBeenCalled()
    expect(result.kie).not.toHaveBeenCalled()
    expect(result.directKey).not.toHaveBeenCalled()
  })
})
