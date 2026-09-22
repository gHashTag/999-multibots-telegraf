/**
 * Owner, 2026-09-22: the links to watch the agent opened in a browser where
 * they were not signed in; "write a plain report of every action, and a
 * video after the agent has worked". These pin the report, the film and the
 * rule that a turn which never touched the browser says nothing.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import {
  workReport,
  reportBrowserWork,
  stepInWords,
  taskText,
  filmCaption,
  REPORT_MAX_CHARS,
} from './src/browser/report'
import {
  addFrame,
  takeFilm,
  filmArgs,
  filmToMp4,
  resetFilmsForTests,
  FILM_MAX_FRAMES,
  FILM_TTL_MS,
} from './src/browser/film'
import type { JournalRow } from './src/browser/journal'

const T0 = Date.parse('2026-09-22T09:00:00Z')
const row = (
  sec: number,
  tool: string,
  detail: Record<string, unknown> = {},
  ok = true
): JournalRow => ({
  at: new Date(T0 + sec * 1000).toISOString(),
  tool,
  ok,
  ms: 10,
  detail,
})

describe('the lab-notebook report', () => {
  const steps = [
    row(0, 'browser_open', { url: 'https://t27.ai/' }),
    row(3, 'browser_screenshot', { seen: 'The t27 home page' }),
    row(5, 'browser_screenshot', { seen: 'The t27 home page' }),
    row(9, 'browser_type', { chars: 12 }),
    row(
      12,
      'browser_click',
      { x: 10, y: 20, error: 'the page did not answer' },
      false
    ),
  ]
  const text = workReport({
    steps,
    task: 'Check the site',
    answer: 'The site opens.',
    frames: 4,
  })

  it('names the task, every step in order, what was seen and the conclusion', () => {
    expect(text).toContain('Check the site')
    expect(text).toContain('The site opens.')
    expect(text).toContain('t27.ai')
    expect(text).toContain('The t27 home page')
    const open = text.indexOf('t27.ai')
    const click = text.indexOf('(10, 20)')
    expect(open).toBeGreaterThan(-1)
    expect(click).toBeGreaterThan(open)
  })

  it('folds the same step in a row into one counted line', () => {
    expect(text).toMatch(/×2/)
  })

  it('shows a failure, with why', () => {
    expect(text).toContain('the page did not answer')
    expect(text).toMatch(/ошибок 1/) // cyrillic-ok: asserting report text
  })

  it('never says what was typed, only how long it was', () => {
    expect(stepInWords(row(0, 'browser_type', { chars: 12 }))).toContain('12')
  })

  it('times steps from the first one, not by a server clock', () => {
    expect(text).toContain('+0:00')
    expect(text).toContain('+0:12')
  })

  it('stays within a Telegram message', () => {
    const many = Array.from({ length: 200 }, (_, i) =>
      row(i, 'browser_open', {
        url: `https://site${i}.example/${'x'.repeat(60)}`,
      })
    )
    const long = workReport({
      steps: many,
      task: 'x'.repeat(2000),
      answer: 'y'.repeat(5000),
      frames: 0,
    })
    expect(long.length).toBeLessThanOrEqual(REPORT_MAX_CHARS)
  })

  it('takes the words out of a multimodal message', () => {
    expect(taskText('hi')).toBe('hi')
    expect(
      taskText([
        { type: 'text', text: 'open' },
        { type: 'image_url' },
        { type: 'text', text: 'site' },
      ])
    ).toBe('open site')
    expect(taskText(undefined)).toBe('')
  })

  it('captions the film within the caption limit', () => {
    expect(filmCaption(7)).toContain('7')
    expect(filmCaption(7).length).toBeLessThanOrEqual(1000)
  })
})

describe('after a turn', () => {
  const sent: Array<{ kind: string; text?: string; markup?: unknown }> = []
  const deps = (rows: JournalRow[], mp4: Buffer | null = null) => ({
    readSteps: async () => [...rows].reverse(), // the journal is newest first
    sendText: async (text: string, markup?: unknown) => {
      sent.push({ kind: 'text', text, markup })
    },
    sendVideo: async (_: Buffer, caption: string) => {
      sent.push({ kind: 'video', text: caption })
    },
    film: async () => ({ mp4, frames: mp4 ? 3 : 0 }),
    settle: async () => {},
  })
  beforeEach(() => {
    sent.length = 0
  })

  it('says NOTHING when the turn never touched the browser', async () => {
    const older = [row(-100, 'browser_open', { url: 'https://t27.ai/' })]
    const r = await reportBrowserWork(deps(older), {
      since: T0,
      task: 'hi',
      answer: 'hello',
    })
    expect(r).toBe('silent')
    expect(sent).toEqual([])
  })

  it('reports only this turn, then sends the film', async () => {
    const rows = [
      row(-100, 'browser_open', { url: 'https://old.example/' }),
      row(1, 'browser_open', { url: 'https://t27.ai/' }),
    ]
    const r = await reportBrowserWork(deps(rows, Buffer.from('mp4')), {
      since: T0,
      task: 'go',
      answer: 'done',
    })
    expect(r).toBe('sent')
    expect(sent.map(s => s.kind)).toEqual(['text', 'video'])
    expect(sent[0].text).toContain('t27.ai')
    expect(sent[0].text).not.toContain('old.example')
  })

  it('opens the browser INSIDE Telegram: a web_app button, never a url one', async () => {
    await reportBrowserWork(deps([row(1, 'browser_status', { pages: 1 })]), {
      since: T0,
      task: '',
      answer: '',
    })
    const button = (
      sent[0].markup as {
        inline_keyboard: Array<Array<Record<string, unknown>>>
      }
    ).inline_keyboard[0][0]
    expect(button.url).toBeUndefined()
    expect((button.web_app as { url: string }).url).toContain('/browser')
  })

  it('a failed send is a result, not an error in the conversation', async () => {
    const d = {
      ...deps([row(1, 'browser_status')]),
      sendText: async () => {
        throw new Error('403')
      },
    }
    await expect(
      reportBrowserWork(d, { since: T0, task: '', answer: '' })
    ).resolves.toBe('failed')
  })
})

describe('the film', () => {
  beforeEach(() => resetFilmsForTests())

  it('keeps the newest frames past the cap and drops stale ones', () => {
    for (let i = 0; i < FILM_MAX_FRAMES + 5; i++)
      addFrame(
        '9000000011',
        { at: T0 + i, tool: 'browser_open', jpeg: String(i) },
        T0 + i
      )
    const all = takeFilm('9000000011', 0)
    expect(all).toHaveLength(FILM_MAX_FRAMES)
    expect(all[0].jpeg).toBe('5')

    addFrame('9000000011', { at: T0, tool: 'browser_open', jpeg: 'old' }, T0)
    addFrame(
      '9000000011',
      { at: T0 + FILM_TTL_MS + 1, tool: 'browser_open', jpeg: 'new' },
      T0 + FILM_TTL_MS + 1
    )
    expect(takeFilm('9000000011', 0).map(f => f.jpeg)).toEqual(['new'])
  })

  it('is sent once, and only this turn', () => {
    addFrame(
      '9000000012',
      { at: T0 - 10, tool: 'browser_open', jpeg: 'before' },
      T0
    )
    addFrame(
      '9000000012',
      { at: T0 + 10, tool: 'browser_open', jpeg: 'during' },
      T0
    )
    expect(takeFilm('9000000012', T0).map(f => f.jpeg)).toEqual(['during'])
    expect(takeFilm('9000000012', T0)).toEqual([])
  })

  it('encodes something a phone plays: even box, yuv420p, faststart', () => {
    const a = filmArgs('/d', '/d/out.mp4').join(' ')
    expect(a).toContain('format=yuv420p')
    expect(a).toContain('+faststart')
    expect(a).toContain('pad=1280:720')
  })

  it('one picture is not a film: ffmpeg is never started', async () => {
    const calls: string[] = []
    const r = await filmToMp4(
      [{ at: 0, tool: 'x', jpeg: '' }],
      async bin => {
        calls.push(bin)
      },
      { mkdtemp, writeFile, readFile: async () => Buffer.from('mp4'), rm },
      tmpdir()
    )
    expect(calls).toEqual([])
    expect(r).toBeNull()
  })

  it('a failing ffmpeg gives no film, not an error', async () => {
    const r = await filmToMp4(
      [
        { at: 0, tool: 'x', jpeg: '' },
        { at: 1, tool: 'x', jpeg: '' },
      ],
      async () => {
        throw new Error('ffmpeg died')
      },
      { mkdtemp, writeFile, readFile, rm },
      tmpdir()
    )
    expect(r).toBeNull()
  })

  it('makes a real MP4 from frames of different sizes (when ffmpeg is here)', async () => {
    const run = promisify(execFile)
    try {
      await run('ffmpeg', ['-version'])
    } catch {
      return // no ffmpeg on this machine: the render image has it
    }
    const dir = await mkdtemp(`${tmpdir()}/film-src-`)
    const frames = []
    for (const [i, size] of ['640x360', '800x1200', '1920x1080'].entries()) {
      const f = `${dir}/${i}.jpg`
      await run('ffmpeg', [
        '-y',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        `color=c=blue:s=${size}`,
        '-frames:v',
        '1',
        f,
      ])
      frames.push({
        at: i,
        tool: 'browser_open',
        jpeg: (await readFile(f)).toString('base64'),
      })
    }
    const mp4 = await filmToMp4(
      frames,
      (b, a) => run(b, a),
      { mkdtemp, writeFile, readFile, rm },
      tmpdir()
    )
    await rm(dir, { recursive: true, force: true })
    expect(mp4).not.toBeNull()
    expect(mp4!.subarray(4, 8).toString()).toBe('ftyp')
  }, 60_000)
})
