import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { docxOf, pdfOf, zipOf } from './test-support/files'

/**
 * WHAT THE AGENT CANNOT PERCEIVE, IT MUST READ -- OR SAY IT DID NOT.
 *
 * Reported by the owner, 17.09.2026: a voice message came back as "thank you
 * for the audio, but I cannot listen to it", and yet the same reply went on to
 * discuss competitors and clip length -- topics that were IN the recording.
 * The model had guessed from the surrounding chat and been right, which is the
 * worst possible outcome: a correct-looking answer built on nothing, from a
 * turn that also declared it heard nothing.
 *
 * The cause is in chat.ts: parts are built only when a configured provider
 * declares the matching sense, and the ONLY provider that declares `audio` is
 * nemotron -- the very one that was answering `ResourceExhausted 16/16`. With
 * it gone the turn silently degrades to the marker line, which names the file
 * and says nothing about its contents.
 *
 * Attachments of kind `file` never had a path at all. `describeMedia` has a
 * text-document branch, but it fetches over HTTP -- and the `/s3/` route
 * serves images, audio and `.json` directly while sending EVERY other
 * extension into its ffmpeg video branch. A `.txt` on our own shelf has
 * therefore never been readable in production.
 *
 * So: before the provider chain is picked, whatever the chain will not be able
 * to perceive is read here and appended as text. Text is the one thing every
 * provider takes.
 */

const SHELF = 'https://vibee-render-production.up.railway.app'
const DOC = `${SHELF}/s3/assets/1788-plan.txt`
const PDF = `${SHELF}/s3/assets/1788-report.pdf`
const DOCX = `${SHELF}/s3/assets/1788-deck.docx`
const VOICE = `${SHELF}/s3/assets/1788-voice.ogg`
const IMG = `${SHELF}/s3/assets/1788-cat.jpg`

/** Keys the fake bucket answers with. */
const FILES = new Map<string, Buffer>()
/** Every GetObjectCommand input the code built, in order. */
let sent: Array<Record<string, unknown>> = []

const PROVIDER_ENV = [
  'ZAI_API_KEY',
  'GLM_API_KEY',
  'NVIDIA_API_KEY',
  'OPENAI_API_KEY',
  'WHISPER_API_KEY',
  'VISION_API_KEY',
  'VISION_BASE_URL',
  'RESERVE_BASE_URL',
  'RESERVE_API_KEY',
  'RESERVE_MODEL',
  'RESERVE_VISION',
  'OLLAMA_BASE_URL',
  'AGENT_PROVIDER',
  'PUBLIC_URL',
]

/** Every subprocess the readers started: [command, args]. */
let tools: Array<[string, string[]]> = []
/** The deadline each of them was started with, in the same order. */
let toolTimeouts: Array<number | undefined> = []
/** `hang`: the binary never answers -- a PDF that takes forever. */
type ToolAnswer = {
  stdout?: string
  stderr?: string
  missing?: boolean
  hang?: boolean
}
type ToolDouble = (args: string[]) => ToolAnswer

/**
 * The module is loaded fresh per case because both the provider chain and the
 * S3 client are decided at module scope from the environment.
 *
 * `answers` doubles the readers' binaries at the process boundary. A binary
 * the case did not name is REFUSED as not installed, never answered with an
 * empty success -- a double that says "fine, no text" to anything is how a
 * reader that never ran can look like one that found nothing.
 */
const load = async (answers: Record<string, ToolDouble> = {}) => {
  vi.resetModules()
  vi.doMock('node:child_process', () => ({
    execFile: (
      cmd: string,
      args: string[],
      o: { timeout?: number } | undefined,
      cb: Function
    ) => {
      tools.push([cmd, args])
      toolTimeouts.push(o?.timeout)
      const a = answers[cmd]?.(args) ?? { missing: true }
      if (a.hang) return
      if (a.missing) {
        cb(
          Object.assign(new Error(`spawn ${cmd} ENOENT`), { code: 'ENOENT' }),
          '',
          ''
        )
        return
      }
      cb(a.stderr ? new Error('exit 1') : null, a.stdout ?? '', a.stderr ?? '')
    },
  }))
  vi.doMock('@aws-sdk/client-s3', () => {
    class GetObjectCommand {
      constructor(public input: Record<string, unknown>) {}
    }
    class PutObjectCommand {
      constructor(public input: Record<string, unknown>) {}
    }
    class S3Client {
      async send(cmd: { input: Record<string, unknown> }) {
        sent.push(cmd.input)
        const body = FILES.get(String(cmd.input.Key))
        if (body === undefined) {
          const e = new Error('NoSuchKey')
          e.name = 'NoSuchKey'
          throw e
        }
        return {
          Body: (async function* () {
            yield body
          })(),
        }
      }
    }
    return { S3Client, GetObjectCommand, PutObjectCommand }
  })
  return await import('./src/agent/media-inline')
}

const marker = (
  kind: string,
  name: string,
  mime: string,
  url: string
): string => `[attached ${kind}: ${name}; mime=${mime}; url=${url}]`

const turn = (text: string) => [
  { role: 'system' as const, content: 'ты агент' },
  { role: 'user' as const, content: text },
]

const tail = (messages: Array<{ content: unknown }>): string =>
  String(messages[messages.length - 1]?.content ?? '')

let fetchSpy: ReturnType<typeof vi.fn>
const kept: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const key of PROVIDER_ENV) {
    kept[key] = process.env[key]
    delete process.env[key]
  }
  FILES.clear()
  sent = []
  tools = []
  toolTimeouts = []
  fetchSpy = vi.fn(async () => new Response('', { status: 500 }))
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  for (const key of PROVIDER_ENV) {
    if (kept[key] === undefined) delete process.env[key]
    else process.env[key] = kept[key] as string
  }
  vi.unstubAllGlobals()
  vi.doUnmock('@aws-sdk/client-s3')
  vi.doUnmock('node:child_process')
})

describe('documents reach the model as text', () => {
  it('reads a .txt from our own shelf into the turn', async () => {
    FILES.set(
      'assets/1788-plan.txt',
      Buffer.from('Три ролика в неделю, вертикально, до 40 секунд.', 'utf8')
    )
    const { inlineUnperceivedMedia } = await load()

    const messages = turn(
      'что в файле?\n' + marker('file', 'plan.txt', 'text/plain', DOC)
    )
    const out = await inlineUnperceivedMedia(messages, {})

    expect(tail(out)).toContain('Три ролика в неделю')
    // The marker line survives: the model still needs the file's name.
    expect(tail(out)).toContain('plan.txt')
    expect(sent[0]?.Key).toBe('assets/1788-plan.txt')
  })

  it('caps the read on the wire, not after it', async () => {
    FILES.set('assets/1788-plan.txt', Buffer.from('короткий файл', 'utf8'))
    const { inlineUnperceivedMedia } = await load()

    await inlineUnperceivedMedia(
      turn(marker('file', 'plan.txt', 'text/plain', DOC)),
      {}
    )

    // 200 KB, expressed as a byte range so a 2 GB object is never pulled in
    // full before something trims it.
    expect(sent[0]?.Range).toBe(`bytes=0-${200 * 1024 - 1}`)
  })

  /*
   * A PDF IS READ (2026-09-22). It used to be refused by name -- "the .pdf
   * format cannot be opened here" -- which is the complaint this change
   * answers: "I asked for support for reading ALL files". Read out of the
   * bucket by key and through pdftotext, whose command line is asserted at
   * the process boundary so this runs on a machine without poppler too.
   */
  it('reads a .pdf from our own shelf into the turn', async () => {
    FILES.set('assets/1788-report.pdf', pdfOf('ignored: the tool is doubled'))
    const { inlineUnperceivedMedia } = await load({
      pdftotext: () => ({ stdout: 'Счёт 4217, оплатить до пятницы\f' }),
    })

    const out = await inlineUnperceivedMedia(
      turn(marker('file', 'report.pdf', 'application/pdf', PDF)),
      {}
    )

    expect(tail(out)).toContain('[read: report.pdf]')
    expect(tail(out)).toContain('Счёт 4217, оплатить до пятницы')
    expect(tail(out)).not.toContain('not read')
    // Straight out of the bucket, whole: one byte past the cap is asked for,
    // so "larger than allowed" is known without a second request.
    expect(sent[0]).toMatchObject({
      Key: 'assets/1788-report.pdf',
      Range: `bytes=0-${20 * 1024 * 1024}`,
    })
    expect(tools[0]?.[0]).toBe('pdftotext')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('says a scanned PDF has no text layer instead of inventing one', async () => {
    FILES.set('assets/1788-report.pdf', pdfOf(null))
    const { inlineUnperceivedMedia } = await load({
      pdftotext: () => ({ stdout: '\f\n\f' }),
    })

    const out = await inlineUnperceivedMedia(
      turn(marker('file', 'report.pdf', 'application/pdf', PDF)),
      {}
    )

    expect(tail(out)).toContain('not read: report.pdf')
    expect(tail(out)).toContain('no text layer')
    expect(tail(out)).toContain('do NOT guess')
  })

  it('reads a .docx from its own XML', async () => {
    FILES.set(
      'assets/1788-deck.docx',
      docxOf(['Бриф: три ролика', 'Бюджет 90 000'])
    )
    const { inlineUnperceivedMedia } = await load()

    const out = await inlineUnperceivedMedia(
      turn(marker('file', 'deck.docx', 'application/vnd.openxml', DOCX)),
      {}
    )

    expect(tail(out)).toContain('[read: deck.docx]')
    expect(tail(out)).toContain('Бриф: три ролика\nБюджет 90 000')
  })

  /*
   * OFF THE SERVER'S OWN LOOP. The parser the MAIN thread would load is
   * replaced by one that refuses to run; the file must still be read, which
   * it only can be in the worker thread, where the real parser lives.
   */
  it('reads a .docx in a worker thread, never on the event loop', async () => {
    FILES.set('assets/1788-deck.docx', docxOf(['Смета на три ролика']))
    vi.doMock('./src/agent/office-text', async importOriginal => ({
      ...(await importOriginal<typeof import('./src/agent/office-text')>()),
      officeText: () => {
        throw new Error('an office file was parsed on the event loop')
      },
    }))
    try {
      const { inlineUnperceivedMedia } = await load()
      const out = await inlineUnperceivedMedia(
        turn(marker('file', 'deck.docx', 'application/vnd.openxml', DOCX)),
        {}
      )
      expect(tail(out)).toContain('[read: deck.docx]')
      expect(tail(out)).toContain('Смета на три ролика')
    } finally {
      vi.doUnmock('./src/agent/office-text')
    }
  })

  it('says a long document was read only from its beginning, not how long it is', async () => {
    FILES.set(
      'assets/1788-deck.docx',
      docxOf(Array.from({ length: 400 }, (_, i) => `Пункт ${i}: условия`))
    )
    const { inlineUnperceivedMedia } = await load()

    const out = await inlineUnperceivedMedia(
      turn(marker('file', 'deck.docx', 'application/vnd.openxml', DOCX)),
      {}
    )

    expect(tail(out)).toContain(
      '[read: deck.docx — a long document, only its beginning was read and is shown]'
    )
    expect(tail(out)).not.toMatch(/\d+ characters/)
  })

  it('lists an archive and says it was not unpacked', async () => {
    FILES.set(
      'assets/1788-pack.zip',
      zipOf({ 'plan.docx': 'x'.repeat(4096), 'photo.jpg': 'j' })
    )
    const { inlineUnperceivedMedia } = await load()

    const out = await inlineUnperceivedMedia(
      turn(
        marker(
          'file',
          'pack.zip',
          'application/zip',
          `${SHELF}/s3/assets/1788-pack.zip`
        )
      ),
      {}
    )

    expect(tail(out)).toContain('listed, not unpacked: pack.zip')
    expect(tail(out)).toContain('plan.docx — 4.0 KB')
    expect(tail(out)).toContain('photo.jpg')
    // Nothing inside was read: the member's bytes never reach the turn.
    expect(tail(out)).not.toContain('xxxx')
  })

  /**
   * ORDER MATTERS. A legacy `.doc` sitting on our own shelf is refused for
   * its FORMAT. Checking the origin first would tell the person their file "is
   * not on our shelf" -- a false statement about a file they just uploaded,
   * and one that sends them to re-upload it forever.
   */
  it('refuses a legacy .doc for its format, not for where it lives', async () => {
    const { inlineUnperceivedMedia } = await load()

    const out = await inlineUnperceivedMedia(
      turn(
        marker(
          'file',
          'old.doc',
          'application/msword',
          `${SHELF}/s3/assets/1788-old.doc`
        )
      ),
      {}
    )

    expect(tail(out)).toContain('not read')
    expect(tail(out)).toContain('the .doc format')
    expect(tail(out)).not.toMatch(/shelf|storage/i)
    // The hint names formats that DO open, and a PDF is one of them now.
    expect(tail(out)).toContain('.pdf')
    expect(sent).toHaveLength(0)
  })

  it('refuses a document hosted anywhere else, and fetches nothing', async () => {
    const { inlineUnperceivedMedia } = await load()

    const out = await inlineUnperceivedMedia(
      turn(
        marker('file', 'notes.txt', 'text/plain', 'https://evil.example/n.txt')
      ),
      {}
    )

    expect(tail(out)).toContain('not read')
    expect(sent).toHaveLength(0)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

/*
 * A DOCUMENT HAS THE SAME LIVE-TURN CONTRACT AS SOUND AND SIGHT (2026-09-22).
 *
 * Audio, photos and video each race a short deadline and are capped per turn;
 * documents were awaited in sequence with only the reader's own minute each,
 * so six slow PDFs were six minutes of somebody watching. Now: at most two
 * opened per message, each on the turn's clock, and the reader stopped with
 * it -- and anything past that is SAID, never guessed.
 */
describe('a live turn does not wait on documents forever', () => {
  const pdf = (n: string) => `${SHELF}/s3/assets/1788-${n}.pdf`

  it('opens at most two documents per message and names the rest as not read', async () => {
    for (const n of ['a', 'b', 'c']) FILES.set(`assets/1788-${n}.pdf`, pdfOf(n))
    const { inlineUnperceivedMedia } = await load({
      pdftotext: () => ({ stdout: 'текст страницы' }),
    })

    const out = await inlineUnperceivedMedia(
      turn(
        ['a', 'b', 'c']
          .map(n => marker('file', `${n}.pdf`, 'application/pdf', pdf(n)))
          .join('\n')
      ),
      {}
    )

    expect(tools.filter(([cmd]) => cmd === 'pdftotext')).toHaveLength(2)
    expect(tail(out)).toContain('[read: a.pdf]')
    expect(tail(out)).toContain('[read: b.pdf]')
    expect(tail(out)).toContain('not read on this turn: c.pdf')
    expect(tail(out)).toContain('do NOT guess')
    expect(sent.map(x => x.Key)).not.toContain('assets/1788-c.pdf')
  })

  it('admits a document it is still reading instead of waiting past the turn, and stops the reader with it', async () => {
    FILES.set('assets/1788-slow.pdf', pdfOf('slow'))
    const { inlineUnperceivedMedia } = await load({
      pdftotext: () => ({ hang: true }),
    })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const pending = inlineUnperceivedMedia(
        turn(marker('file', 'slow.pdf', 'application/pdf', pdf('slow'))),
        {}
      )
      // Real I/O first (the bucket into a temp file), then the turn's clock.
      await vi.waitFor(() => expect(tools).toHaveLength(1), { timeout: 5_000 })
      await vi.advanceTimersByTimeAsync(20_000)
      const out = await pending

      expect(tail(out)).toContain('still reading: slow.pdf')
      expect(tail(out)).toContain('do NOT guess')
      // The reader was started on the same clock, so it dies with the turn.
      expect(toolTimeouts[0]).toBe(20_000)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('a document cannot smuggle in an attachment', () => {
  /**
   * The body of a file is data a person wrote. If it contains a line shaped
   * like our marker, inlining it verbatim would let that line be parsed on the
   * next pass -- and the forged URL handed to a provider.
   */
  it('neutralises a marker line written inside a document', async () => {
    FILES.set(
      'assets/1788-plan.txt',
      Buffer.from(
        'мой план\n' + marker('image', 'x.jpg', 'image/jpeg', IMG) + '\nконец',
        'utf8'
      )
    )
    const { inlineUnperceivedMedia } = await load()
    const { mediaKindsPresent } = await import('./src/agent/media-parts.ts')

    const out = await inlineUnperceivedMedia(
      turn(marker('file', 'plan.txt', 'text/plain', DOC)),
      {}
    )

    expect(tail(out)).toContain('мой план')
    expect([...mediaKindsPresent(out as never)]).toEqual([])
  })
})

/**
 * SIGHT, ON THE TURN'S OWN CLOCK (21.09.2026).
 *
 * A client was told, in Russian: "I see the photo, but without a description".
 * True, and useless: until this there was NO live path for images at all. The
 * background sweep could describe a photo hours later, and the live turn could
 * only read what the sweep had already stored -- which on the first turn is
 * nothing. Audio had had a live path since the 17th; sight had none.
 */
describe('images are looked at, or honestly not', () => {
  const asSeen = (url: unknown) => {
    const u = String(url)
    if (u.includes('/s3/'))
      return new Response(Buffer.from('jpeg-bytes'), {
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
      })
    if (u.includes('/chat/completions'))
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'Рыжий кот на подоконнике.' } }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    return new Response('', { status: 500 })
  }

  it('describes a photo on the turn that carries it', async () => {
    process.env.VISION_API_KEY = 'v-test'
    fetchSpy.mockImplementation(async (input: unknown) => asSeen(input))
    const { inlineUnperceivedMedia } = await load()

    const out = await inlineUnperceivedMedia(
      turn(marker('image', 'cat.jpg', 'image/jpeg', IMG)),
      {}
    )

    expect(tail(out)).toContain('Рыжий кот на подоконнике')
  })

  it('looks with our own eyes even when a provider claims sight, and breaks the marker', async () => {
    process.env.NVIDIA_API_KEY = 'nv-test' // nemotron declares `vision`
    process.env.VISION_API_KEY = 'v-test'
    fetchSpy.mockImplementation(async (input: unknown) => asSeen(input))
    const { inlineUnperceivedMedia } = await load()
    const { mediaKindsPresent } = await import('./src/agent/media-parts.ts')

    const out = await inlineUnperceivedMedia(
      turn(marker('image', 'cat.jpg', 'image/jpeg', IMG)),
      {}
    )

    expect(tail(out)).toContain('Рыжий кот на подоконнике')
    // Described here, so it must not ALSO travel as an `image_url` part.
    expect([...mediaKindsPresent(out as never)]).toEqual([])
  })

  it('leaves the photo to the provider when we have no eyes of our own', async () => {
    process.env.NVIDIA_API_KEY = 'nv-test'
    const { inlineUnperceivedMedia } = await load()

    const messages = turn(marker('image', 'cat.jpg', 'image/jpeg', IMG))
    expect(await inlineUnperceivedMedia(messages, {})).toBe(messages)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('says it did not look rather than describing from the conversation', async () => {
    process.env.VISION_API_KEY = 'v-test'
    // The vision service answers 500: one attempt, then the honest line.
    const { inlineUnperceivedMedia } = await load()

    const out = await inlineUnperceivedMedia(
      turn(marker('image', 'cat.jpg', 'image/jpeg', IMG)),
      {}
    )

    expect(tail(out)).toContain('[not seen: cat.jpg')
    expect(tail(out)).toContain('do NOT describe it')
  })
})

describe('audio the chain cannot hear is transcribed', () => {
  it('transcribes a voice message when no provider declares hearing', async () => {
    process.env.WHISPER_API_KEY = 'gsk_test'
    fetchSpy.mockImplementation(async (input: unknown) => {
      const url = String(input)
      if (url.includes('/s3/')) {
        return new Response(Buffer.from('ogg-bytes'), {
          status: 200,
          headers: { 'content-type': 'audio/ogg' },
        })
      }
      if (url.includes('/audio/transcriptions'))
        // A STREAM, as the production transcriber answers: it always enters
        // its streaming responder, so a plain body here would exercise the
        // fallback and not the path that actually runs.
        return new Response(
          'data: {"text":"нужен контент-план на месяц"}\ndata: [DONE]\n',
          { status: 200 }
        )
      return new Response('', { status: 500 })
    })
    const { inlineUnperceivedMedia } = await load()

    const out = await inlineUnperceivedMedia(
      turn(marker('audio', 'voice.ogg', 'audio/ogg', VOICE)),
      {}
    )

    expect(tail(out)).toContain('нужен контент-план на месяц')
  })

  it('leaves audio alone when a configured provider can hear it and we cannot', async () => {
    // nemotron is the one provider that declares `audio`.
    process.env.NVIDIA_API_KEY = 'nv-test'
    const { inlineUnperceivedMedia } = await load()

    const messages = turn(marker('audio', 'voice.ogg', 'audio/ogg', VOICE))
    const out = await inlineUnperceivedMedia(messages, {})

    // Nothing was read, nothing was spent, and the array is the same one:
    // the native audio part will carry the sound.
    expect(out).toBe(messages)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  /*
   * OUR OWN EARS COME FIRST (21.09.2026).
   *
   * This case used to assert the opposite -- with both configured, the file
   * was handed to nemotron and nothing was read here. Exactly one provider
   * has ever declared a sense, and on the day of the complaint it was the one
   * answering `ResourceExhausted 16/16`; meanwhile our own transcriber sat
   * idle on the private network. Deferring to a single third-party model for
   * a sense we own is how a client gets a filename back.
   */
  it('transcribes here even when a provider says it can hear, and breaks the marker so the sound is not sent twice', async () => {
    process.env.NVIDIA_API_KEY = 'nv-test'
    process.env.WHISPER_API_KEY = 'gsk_test'
    fetchSpy.mockImplementation(async (input: unknown) => {
      const url = String(input)
      if (url.includes('/s3/'))
        return new Response(Buffer.from('ogg-bytes'), {
          status: 200,
          headers: { 'content-type': 'audio/ogg' },
        })
      if (url.includes('/audio/transcriptions'))
        return new Response('data: {"text":"я на связи"}\ndata: [DONE]\n', {
          status: 200,
        })
      return new Response('', { status: 500 })
    })
    const { inlineUnperceivedMedia } = await load()

    const out = await inlineUnperceivedMedia(
      turn(marker('audio', 'voice.ogg', 'audio/ogg', VOICE)),
      {}
    )

    expect(tail(out)).toContain('я на связи')
    // The marker is broken, so `withMediaParts` cannot ALSO send the bytes:
    // a file is inlined as text or sent as a part, never both.
    expect(tail(out)).not.toContain('[attached audio:')
    expect(tail(out)).toContain('[ attached audio:')
  })

  it('says it did not hear rather than letting the model guess', async () => {
    const { inlineUnperceivedMedia } = await load()

    const out = await inlineUnperceivedMedia(
      turn(marker('audio', 'voice.ogg', 'audio/ogg', VOICE)),
      {}
    )

    expect(tail(out)).toContain('not heard')
    expect(tail(out)).toContain('voice.ogg')
  })

  it('spends one transcription for a URL repeated with a query string', async () => {
    process.env.WHISPER_API_KEY = 'gsk_test'
    let transcriptions = 0
    fetchSpy.mockImplementation(async (input: unknown) => {
      const url = String(input)
      if (url.includes('/s3/'))
        return new Response(Buffer.from('ogg-bytes'), {
          status: 200,
          headers: { 'content-type': 'audio/ogg' },
        })
      if (url.includes('/audio/transcriptions')) {
        transcriptions += 1
        // A stream, for the same reason as above -- and here it also keeps
        // the count honest: one transcription is one call only when the
        // first attempt answers.
        return new Response('data: {"text":"одно и то же"}\ndata: [DONE]\n', {
          status: 200,
        })
      }
      return new Response('', { status: 500 })
    })
    const { inlineUnperceivedMedia } = await load()

    await inlineUnperceivedMedia(
      turn(
        marker('audio', 'a.ogg', 'audio/ogg', VOICE) +
          '\n' +
          marker('audio', 'a.ogg', 'audio/ogg', VOICE + '?v=2') +
          '\n' +
          marker('audio', 'a.ogg', 'audio/ogg', VOICE + '#x')
      ),
      {}
    )

    expect(transcriptions).toBe(1)
  })
})

describe('what a stored transcript is for', () => {
  /*
   * `transcript`, BECAUSE THAT IS THE COLUMN THE TABLE HAS.
   *
   * This double used to hold `description` and answer it back, and the query
   * under test asked for `description` too -- so the pair agreed with each
   * other while disagreeing with USER_MEDIA_TABLE_SQL, which declares
   * `transcript text` and no `description` at all. Every real call threw, the
   * caller's catch swallowed it, and the media memory was empty for its whole
   * life while this test stayed green.
   *
   * The double now answers the SCHEMA's column, and refuses a query that asks
   * for one the table does not have -- a fake that agrees with its caller is
   * how a column nobody has can look like a feature that works.
   */
  const rows: Array<{ url: string; transcript: string }> = []
  const COLUMNS = new Set(['url', 'transcript', 'kind', 'name', 'mime'])
  const pool = {
    async query(sql: string, params?: unknown[]) {
      if (/^\s*(CREATE|INSERT|UPDATE)/i.test(sql)) return { rows: [] }
      if (/FROM user_media/i.test(sql)) {
        const asked = /SELECT\s+([^]*?)\s+FROM user_media/i.exec(sql)?.[1] ?? ''
        for (const col of asked.split(',').map(c => c.trim())) {
          if (col && !COLUMNS.has(col)) {
            throw new Error(`user_media has no column ${col}`)
          }
        }
        const wanted = new Set((params?.[1] as string[]) ?? [])
        return { rows: rows.filter(r => wanted.has(r.url)) }
      }
      throw new Error(`the fake pool was not taught: ${sql.slice(0, 60)}`)
    },
  }

  it('uses a document the background pass already read, and opens nothing', async () => {
    rows.length = 0
    rows.push({ url: PDF, transcript: 'Счёт 4217, прочитан в фоне' })
    const { inlineUnperceivedMedia } = await load({
      pdftotext: () => ({ stdout: 'must not be asked' }),
    })

    const out = await inlineUnperceivedMedia(
      turn(marker('file', 'report.pdf', 'application/pdf', PDF)),
      { pool: pool as never, owner: '144022504' }
    )

    expect(tail(out)).toContain('[read earlier: report.pdf]')
    expect(tail(out)).toContain('Счёт 4217, прочитан в фоне')
    expect(tools).toHaveLength(0)
    expect(sent).toHaveLength(0)
  })

  it('uses a transcript already on record and asks Whisper for nothing', async () => {
    rows.length = 0
    rows.push({ url: VOICE, transcript: 'записанное ранее' })
    process.env.WHISPER_API_KEY = 'gsk_test'
    const { inlineUnperceivedMedia } = await load()

    const out = await inlineUnperceivedMedia(
      turn(marker('audio', 'voice.ogg', 'audio/ogg', VOICE)),
      { pool: pool as never, owner: '144022504' }
    )

    expect(tail(out)).toContain('записанное ранее')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('the ordinary turn pays nothing', () => {
  it('returns the very same array when there is no attachment', async () => {
    const { inlineUnperceivedMedia } = await load()
    const messages = turn('просто вопрос без файлов')

    expect(await inlineUnperceivedMedia(messages, {})).toBe(messages)
    expect(sent).toHaveLength(0)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('never mutates the turn it was given', async () => {
    FILES.set('assets/1788-plan.txt', Buffer.from('тело файла', 'utf8'))
    const { inlineUnperceivedMedia } = await load()

    const messages = turn(marker('file', 'plan.txt', 'text/plain', DOC))
    const before = JSON.stringify(messages)
    await inlineUnperceivedMedia(messages, {})

    expect(JSON.stringify(messages)).toBe(before)
  })

  it('bounds what one turn can append no matter how many files are named', async () => {
    for (let i = 0; i < 9; i += 1) {
      FILES.set(`assets/1788-${i}.txt`, Buffer.from('ы'.repeat(50_000), 'utf8'))
    }
    const { inlineUnperceivedMedia } = await load()

    const lines = Array.from({ length: 9 }, (_, i) =>
      marker(
        'file',
        `${i}.txt`,
        'text/plain',
        `${SHELF}/s3/assets/1788-${i}.txt`
      )
    ).join('\n')
    const messages = turn(lines)
    const out = await inlineUnperceivedMedia(messages, {})

    const added = tail(out).length - tail(messages).length
    expect(added).toBeGreaterThan(0)
    expect(added).toBeLessThan(12_000)
  })
})

/**
 * ONE QUESTION, ONE GATE.
 *
 * "Can this file be transcribed" was asked in two places with two different
 * answers: the background sweep used the transcriber's rule (every container
 * ffmpeg opens) and the LIVE turn used the chat provider's (four extensions).
 * So a person sending a `.mp4` or a `.oga` heard "nothing here could listen to
 * this recording" while the sweep would have read the very same file an hour
 * later. Measured 2026-09-20 against production.
 */
describe('the live turn hears what the sweep hears', () => {
  it('actually transcribes a container the chat providers do not take', async () => {
    process.env.WHISPER_API_KEY = 'k-for-tests' // secret-guard-ok: invented here
    delete process.env.WHISPER_BASE_URL
    const posted: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = String(url)
        if (u.includes('/s3/')) {
          return new Response(Buffer.from('bytes'), {
            status: 200,
            headers: { 'content-type': 'audio/mp4' },
          })
        }
        posted.push(u)
        return new Response(
          'data: {"text":"услышанные слова"}\ndata: [DONE]\n',
          { status: 200 }
        )
      })
    )
    const { transcribeShelfAudioNow, resetWhisperForTests } = await import(
      './src/agent/media-library'
    )
    resetWhisperForTests()
    /*
     * A `.mp4` on our own shelf: the sweep reads it and the live turn used to
     * refuse it, which is the whole defect. Driving the real function rather
     * than the gate alone -- a test that only calls `transcribableUrl` passes
     * happily while this function still asks the other gate, and one did.
     */
    const heard = await transcribeShelfAudioNow(
      'https://vibee-render-production.up.railway.app/s3/assets/r.mp4',
      'r.mp4',
      20_000
    )
    expect(heard).toBe('услышанные слова')
    expect(posted.some(u => u.includes('/audio/transcriptions'))).toBe(true)
    vi.unstubAllGlobals()
  })
})

/*
 * SPEECH INSIDE A VIDEO (2026-09-22, from #2414 commit 12f09b597).
 *
 * A video note is somebody talking. Until this change the live turn only ever
 * said "[not watched]" about it, and the sweep described its frames minutes
 * later -- the words were never heard by anyone. The soundtrack now goes to
 * the same transcriber a voice note does.
 */
describe('speech inside a video is heard on the turn', () => {
  const NOTE = `${SHELF}/s3/assets/1788-video-note-1.mp4`
  const heardBy = (posted: FormData[]) =>
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/audio/transcriptions')) {
        posted.push(init?.body as FormData)
        return new Response(
          'data: {"text":"пришлите смету до вечера"}\ndata: [DONE]\n',
          { status: 200 }
        )
      }
      return new Response('', { status: 500 })
    })

  it("transcribes a video note's soundtrack out of the bucket, not through the /s3/ route", async () => {
    process.env.WHISPER_API_KEY = 'gsk_test'
    FILES.set('assets/1788-video-note-1.mp4', Buffer.from('small mp4 bytes'))
    const posted: FormData[] = []
    fetchSpy = heardBy(posted)
    vi.stubGlobal('fetch', fetchSpy)
    const { inlineUnperceivedMedia } = await load()

    const out = await inlineUnperceivedMedia(
      turn(marker('video', 'video-note-1.mp4', 'video/mp4', NOTE)),
      {}
    )

    expect(tail(out)).toContain('[heard in the video: video-note-1.mp4')
    expect(tail(out)).toContain('пришлите смету до вечера')
    // Honest about what it did NOT do.
    expect(tail(out)).toContain('do NOT describe what is on screen')
    // The `/s3/` route would transcode the whole video first; the bucket
    // hands over the bytes as they are.
    expect(
      fetchSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('/s3/'))
    ).toBe(false)
    expect(sent[0]?.Key).toBe('assets/1788-video-note-1.mp4')
    const file = posted[0]?.get('file') as File
    expect(file.name).toBe('video-note-1.mp4')
    expect(file.type).toBe('video/mp4')
    // Small enough for the transcriber: no ffmpeg at all.
    expect(tools).toEqual([])
  })

  it('takes the soundtrack out with ffmpeg only when the video is too big for the transcriber', async () => {
    process.env.WHISPER_API_KEY = 'gsk_test'
    FILES.set('assets/1788-video-note-1.mp4', Buffer.alloc(26 * 1024 * 1024))
    const posted: FormData[] = []
    fetchSpy = heardBy(posted)
    vi.stubGlobal('fetch', fetchSpy)
    const { writeFileSync } = await import('node:fs')
    const { inlineUnperceivedMedia } = await load({
      ffmpeg: args => {
        writeFileSync(args[args.length - 1], Buffer.from('m4a sound'))
        return { stdout: '' }
      },
    })

    const out = await inlineUnperceivedMedia(
      turn(marker('video', 'video-note-1.mp4', 'video/mp4', NOTE)),
      {}
    )

    expect(tools.map(t => t[0])).toEqual(['ffmpeg'])
    const file = posted[0]?.get('file') as File
    expect(file.name).toBe('soundtrack.m4a')
    expect(file.size).toBe('m4a sound'.length)
    expect(tail(out)).toContain('пришлите смету до вечера')
  })

  it('says it neither watched nor heard when nothing here can listen, and reads nothing', async () => {
    FILES.set('assets/1788-video-note-1.mp4', Buffer.from('small mp4 bytes'))
    const { inlineUnperceivedMedia } = await load()

    const out = await inlineUnperceivedMedia(
      turn(marker('video', 'video-note-1.mp4', 'video/mp4', NOTE)),
      {}
    )

    expect(tail(out)).toContain('[not watched: video-note-1.mp4')
    expect(tail(out)).toContain('hear speech')
    expect(sent).toHaveLength(0)
  })

  it('spends the one live transcription of the turn: a second recording waits', async () => {
    process.env.WHISPER_API_KEY = 'gsk_test'
    FILES.set('assets/1788-video-note-1.mp4', Buffer.from('small mp4 bytes'))
    const posted: FormData[] = []
    fetchSpy = heardBy(posted)
    vi.stubGlobal('fetch', fetchSpy)
    const { inlineUnperceivedMedia } = await load()

    const out = await inlineUnperceivedMedia(
      turn(
        marker('video', 'video-note-1.mp4', 'video/mp4', NOTE) +
          '\n' +
          marker('audio', 'voice.ogg', 'audio/ogg', VOICE)
      ),
      {}
    )

    expect(posted).toHaveLength(1)
    expect(tail(out)).toContain('[not heard: voice.ogg')
  })
})
