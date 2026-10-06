import fs from 'fs'
import path from 'path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { actionForTool, keepTyping } from '@/helpers/telegramLongAnswer'

/**
 * A LONG TOOL SHOWS WHAT IT IS DOING (#3665).
 *
 * A 70 s image_edit used to look exactly like a slow text answer: the bot
 * kept "typing…" alive and dropped every tool event of the stream. Now the
 * stream's tool start and result reach the bot, and the chat action follows
 * the tool: "sending a photo…", "sending a video…", back to "typing…".
 *
 * The stream half is driven through the REAL ask function with fetch
 * stubbed, like proposalSurvivesTheStream.test.ts: a copy of the parser here
 * would pass while the real one broke.
 */

describe('actionForTool: the chat action a tool shows', () => {
  it('pictures, clips, speech, and everything else', () => {
    expect(actionForTool('image_generate')).toBe('upload_photo')
    expect(actionForTool('image_edit')).toBe('upload_photo')
    expect(actionForTool('video_generate')).toBe('upload_video')
    expect(actionForTool('lipsync_generate')).toBe('upload_video')
    expect(actionForTool('story_reel')).toBe('upload_video')
    expect(actionForTool('split_reel')).toBe('upload_video')
    expect(actionForTool('audio_generate')).toBe('upload_voice')
    expect(actionForTool('voice_clone_speak')).toBe('upload_voice')
    expect(actionForTool('crm_history')).toBe('typing')
    expect(actionForTool('browser_open')).toBe('typing')
    expect(actionForTool(null)).toBe('typing')
  })
})

describe('keepTyping: the action can change while it runs', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('switches at once, keeps the new action on every beat, stops for good', () => {
    const sent: string[] = []
    const ctx = { sendChatAction: async (a: string) => void sent.push(a) }
    const stop = keepTyping(ctx as any, 4000)
    expect(sent).toEqual(['typing'])

    stop.setAction('upload_photo')
    // sent at once: Telegram shows an action for ~5 s, a beat can be 4 s away
    expect(sent).toEqual(['typing', 'upload_photo'])
    vi.advanceTimersByTime(8000)
    expect(sent.slice(2)).toEqual(['upload_photo', 'upload_photo'])

    // the same action again is not a second request
    stop.setAction('upload_photo')
    expect(sent).toHaveLength(4)

    stop.setAction('typing')
    expect(sent.at(-1)).toBe('typing')

    stop()
    stop.setAction('upload_video')
    vi.advanceTimersByTime(12_000)
    expect(sent.at(-1)).toBe('typing')
    expect(sent).toHaveLength(5)
  })
})

const event = (o: Record<string, unknown>) => JSON.stringify(o)
const TOOL = event({ ['тип']: 'инструмент', ['имя']: 'image_edit' }) // cyrillic-ok: the event envelope
const WAIT = event({ ['тип']: 'ждём' }) // cyrillic-ok: the event envelope
const RESULT = event({
  ['тип']: 'результат', // cyrillic-ok: the event envelope
  ['имя']: 'image_edit', // cyrillic-ok: the event envelope
  ['значение']: {}, // cyrillic-ok: the event envelope
  ['мс']: 70_000, // cyrillic-ok: the event envelope
})
const TEXT = event({ ['тип']: 'текст', ['текст']: 'Готово.' }) // cyrillic-ok: the event envelope

function serve(lines: string[]) {
  const enc = new TextEncoder()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      let i = 0
      return {
        ok: true,
        status: 200,
        body: {
          getReader: () => ({
            read: async () =>
              i < lines.length
                ? { done: false, value: enc.encode(lines[i++] + '\n') }
                : { done: true, value: undefined },
          }),
        },
      }
    })
  )
}

describe('the stream tells the bot which tool runs', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.RENDER_API_KEY = 'test-key'
  })
  afterEach(() => vi.unstubAllGlobals())

  it('onTool hears the name on start and null on the result', async () => {
    serve([TOOL, WAIT, RESULT, TEXT])
    const { спроситьАгента: askAgent } = await import('@/services/trinityAgent') // cyrillic-ok: pre-existing export
    const heard: Array<string | null> = []
    const answer = await askAgent('1', 'отредактируй фото', {
      onTool: name => heard.push(name),
    })
    expect(heard).toEqual(['image_edit', null])
    expect(answer.текст).toContain('Готово') // cyrillic-ok: pre-existing field
  })

  it('a throwing onTool does not fail the turn', async () => {
    serve([TOOL, RESULT, TEXT])
    const { спроситьАгента: askAgent } = await import('@/services/trinityAgent') // cyrillic-ok: pre-existing export
    const answer = await askAgent('1', 'отредактируй фото', {
      onTool: () => {
        throw new Error('indicator broke')
      },
    })
    expect(answer.текст).toContain('Готово') // cyrillic-ok: pre-existing field
  })
})

describe('the DM handler wires the tool into the chat action', () => {
  it('registerCommands passes onTool to setAction(actionForTool(...))', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', '..', 'navigation', 'registerCommands.ts'),
      'utf8'
    )
    expect(src).toMatch(
      /onTool: name => \S+\.setAction\(actionForTool\(name\)\)/
    )
  })
})
