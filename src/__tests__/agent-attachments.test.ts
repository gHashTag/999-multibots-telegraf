import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const putBytes = vi.fn()
vi.mock('@/services/contentFactory/storage', () => ({
  putBytes: (...args: unknown[]) => putBytes(...args),
}))

import {
  attachmentFromMessage,
  attachmentLine,
  attachmentToLine,
  attachmentRefused,
  buildAgentMessage,
  buildAgentTurn,
  TELEGRAM_DOWNLOAD_LIMIT,
} from '@/services/agentAttachments'

/**
 * ATTACHMENTS FROM TELEGRAM INTO THE AGENT CHAT.
 *
 * Two properties are worth a test here, and they fail in opposite directions:
 *
 *   a file the person sent is silently ignored -- the bug being fixed;
 *   the Telegram file link reaches the agent -- the bot token leaks into
 *   `agent_messages` and into a third-party model.
 */

beforeEach(() => {
  putBytes.mockReset()
  putBytes.mockResolvedValue({ url: 'https://shelf.example/s3/a.jpg' })
})

describe('recognising what was sent', () => {
  it('a photo takes the LARGEST size, not the thumbnail', () => {
    const a = attachmentFromMessage({
      photo: [
        { file_id: 'small', file_unique_id: 's', file_size: 900 },
        { file_id: 'big', file_unique_id: 'b', file_size: 90_000 },
      ],
    })
    expect(a?.fileId).toBe('big')
    expect(a?.kind).toBe('image')
  })

  /*
   * An animation ALSO arrives with a `document` field. Checked before it, or a
   * GIF would be filed as a nameless binary and the model would be told to
   * look at "application/octet-stream".
   */
  it('an animation is a video, not the document it also looks like', () => {
    const a = attachmentFromMessage({
      animation: {
        file_id: 'gif',
        file_unique_id: 'g',
        mime_type: 'video/mp4',
        file_name: 'cat.gif',
      },
      document: { file_id: 'same-gif', file_unique_id: 'g' },
    })
    expect(a?.kind).toBe('video')
    expect(a?.fileId).toBe('gif')
    expect(a?.name).toBe('cat.gif')
  })

  it('a video note carries no mime and no name, and still becomes a video', () => {
    const a = attachmentFromMessage({
      video_note: { file_id: 'vn', file_unique_id: 'u', file_size: 1000 },
    })
    expect(a?.kind).toBe('video')
    expect(a?.mimeType).toBe('video/mp4')
    expect(a?.name).toMatch(/^video-note-u\.mp4$/)
  })

  it('a voice message is audio', () => {
    const a = attachmentFromMessage({
      voice: { file_id: 'v', file_unique_id: 'u', mime_type: 'audio/ogg' },
    })
    expect(a?.kind).toBe('audio')
  })

  it('a track prefers its own title over a generated name', () => {
    const a = attachmentFromMessage({
      audio: {
        file_id: 'a',
        file_unique_id: 'u',
        mime_type: 'audio/mpeg',
        performer: 'Nirvana',
        title: 'Lithium',
      },
    })
    expect(a?.name).toBe('Nirvana - Lithium')
  })

  /*
   * The point of "any format": a file type nobody anticipated must still get
   * through as a file rather than being dropped.
   */
  it('an unknown format arrives as a file rather than being dropped', () => {
    const a = attachmentFromMessage({
      document: {
        file_id: 'd',
        file_unique_id: 'u',
        file_name: 'model.blend',
        mime_type: 'application/x-blender',
      },
    })
    expect(a?.kind).toBe('file')
    expect(a?.name).toBe('model.blend')
    expect(a?.mimeType).toBe('application/x-blender')
  })

  it('a document with no mime at all is still accepted', () => {
    const a = attachmentFromMessage({
      document: { file_id: 'd', file_unique_id: 'u', file_name: 'notes' },
    })
    expect(a?.kind).toBe('file')
    expect(a?.mimeType).toBe('application/octet-stream')
  })

  it('a static sticker is an image, an animated one is not', () => {
    expect(
      attachmentFromMessage({
        sticker: { file_id: 's', file_unique_id: 'u' },
      })?.kind
    ).toBe('image')
    expect(
      attachmentFromMessage({
        sticker: { file_id: 's', file_unique_id: 'u', is_animated: true },
      })?.kind
    ).toBe('file')
  })

  it('a message with no file at all yields nothing', () => {
    expect(attachmentFromMessage({ text: 'hello' })).toBeNull()
    expect(
      attachmentFromMessage({ location: { latitude: 1, longitude: 2 } })
    ).toBeNull()
    expect(attachmentFromMessage(null)).toBeNull()
  })
})

describe('the line handed to the agent', () => {
  /*
   * The exact shape is a contract with `messageContentForAgent` in
   * apps/vibee-editor/player/src/lib/agentStream.ts. Nothing parses it, so
   * nothing will go red on drift except this test.
   */
  it('matches the mini app byte for byte', () => {
    expect(
      attachmentLine({
        kind: 'image',
        name: 'portrait.jpg',
        mimeType: 'image/jpeg',
        url: 'https://media.example/portrait.jpg',
      })
    ).toBe(
      '[attached image: portrait.jpg; mime=image/jpeg; url=https://media.example/portrait.jpg]'
    )
  })

  it('a name with a bracket or a newline cannot break the marker', () => {
    const line = attachmentLine({
      kind: 'file',
      name: 're]port\nfinal.pdf',
      mimeType: 'application/pdf',
      url: '/s3/x.pdf',
    })
    expect(line.match(/\[/g)).toHaveLength(1)
    expect(line.match(/\]/g)).toHaveLength(1)
    expect(line).not.toContain('\n')
  })
})

describe('fetching the bytes', () => {
  const telegram = (link: string) => ({
    getFileLink: vi.fn(async () => link),
  })

  /*
   * THE TOKEN MUST NOT TRAVEL. `getFileLink` returns a URL with the bot token
   * inside the path; that URL is used to download and must never appear in the
   * line, which is written to `agent_messages` and sent to the model.
   */
  it('the Telegram link with the token never reaches the agent', async () => {
    const secret =
      'https://api.telegram.org/file/bot123456:AAH-SECRET-TOKEN/photos/x.jpg'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      }))
    )
    const out = await attachmentToLine(telegram(secret), {
      kind: 'image',
      name: 'x.jpg',
      mimeType: 'image/jpeg',
      fileId: 'f',
      bytes: 3,
    })
    expect(attachmentRefused(out)).toBe(false)
    if (attachmentRefused(out)) return
    expect(out.line).not.toContain('AAH-SECRET-TOKEN')
    expect(out.line).not.toContain('api.telegram.org')
    expect(out.line).toContain('https://shelf.example/s3/a.jpg')
  })

  it('over the Telegram ceiling: refused with a sentence, not silence', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const out = await attachmentToLine(telegram('irrelevant'), {
      kind: 'video',
      name: 'big.mp4',
      mimeType: 'video/mp4',
      fileId: 'f',
      bytes: TELEGRAM_DOWNLOAD_LIMIT + 1,
    })
    expect(attachmentRefused(out)).toBe(true)
    if (!attachmentRefused(out)) return
    expect(out.reason).toBe('too-big')
    expect(out.message).toContain('big.mp4')
    // Not even attempted: getFile would answer "file is too big" anyway.
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  /*
   * `file_size` is absent on video notes and on some documents. Without a
   * second check on what actually arrived, an undeclared oversized file would
   * sail past the ceiling.
   */
  it('an UNDECLARED oversized file is caught after download', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () =>
          new Uint8Array(TELEGRAM_DOWNLOAD_LIMIT + 10).buffer,
      }))
    )
    const out = await attachmentToLine(telegram('link'), {
      kind: 'video',
      name: 'note.mp4',
      mimeType: 'video/mp4',
      fileId: 'f',
      bytes: null,
    })
    expect(attachmentRefused(out)).toBe(true)
    if (!attachmentRefused(out)) return
    expect(out.reason).toBe('too-big')
    expect(putBytes).not.toHaveBeenCalled()
  })

  it('a failed download is a message, never a thrown error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 502 }))
    )
    const out = await attachmentToLine(telegram('link'), {
      kind: 'image',
      name: 'x.jpg',
      mimeType: 'image/jpeg',
      fileId: 'f',
      bytes: 10,
    })
    expect(attachmentRefused(out)).toBe(true)
    if (!attachmentRefused(out)) return
    expect(out.reason).toBe('download')
    expect(out.message).toContain('x.jpg')
  })

  it('an empty file is refused rather than stored', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(0),
      }))
    )
    const out = await attachmentToLine(telegram('link'), {
      kind: 'image',
      name: 'x.jpg',
      mimeType: 'image/jpeg',
      fileId: 'f',
      bytes: 0,
    })
    expect(attachmentRefused(out)).toBe(true)
    expect(putBytes).not.toHaveBeenCalled()
  })

  it('a failed upload is a message too', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new Uint8Array([1]).buffer,
      }))
    )
    putBytes.mockRejectedValue(new Error('shelf down'))
    const out = await attachmentToLine(telegram('link'), {
      kind: 'image',
      name: 'x.jpg',
      mimeType: 'image/jpeg',
      fileId: 'f',
      bytes: 1,
    })
    expect(attachmentRefused(out)).toBe(true)
    if (!attachmentRefused(out)) return
    expect(out.reason).toBe('upload')
  })
})

describe('what the agent actually receives', () => {
  const telegram = { getFileLink: vi.fn(async () => 'https://tg/secret/x.jpg') }

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      }))
    )
  })

  /*
   * THE CAPTION IS THE PERSON'S TEXT. "Make a reel out of this" arrives
   * attached to the photo, not as a separate message. Dropping it would leave
   * the agent with a bare file and no instruction -- which is what the model
   * would then have to guess.
   */
  it('the caption and the file arrive together', async () => {
    const plan = await buildAgentMessage(telegram, {
      caption: 'сделай из этого рилс',
      photo: [{ file_id: 'p', file_unique_id: 'u', file_size: 3 }],
    })
    expect(plan.refusal).toBeNull()
    expect(plan.text.split('\n')[0]).toBe('сделай из этого рилс')
    expect(plan.text).toContain('[attached image:')
  })

  it('a file with no caption still becomes a turn', async () => {
    const plan = await buildAgentMessage(telegram, {
      document: {
        file_id: 'd',
        file_unique_id: 'u',
        file_name: 'plan.pdf',
        mime_type: 'application/pdf',
      },
    })
    expect(plan.text).toMatch(/^\[attached file: plan\.pdf;/)
  })

  /*
   * A failed upload must not swallow the question. Refusing the whole turn
   * would throw away a caption the agent can answer perfectly well.
   */
  it('a failed file keeps the caption alive', async () => {
    const plan = await buildAgentMessage(telegram, {
      caption: 'а что тут написано?',
      video: {
        file_id: 'v',
        file_unique_id: 'u',
        file_size: TELEGRAM_DOWNLOAD_LIMIT + 1,
      },
    })
    expect(plan.refusal).toContain('Telegram')
    expect(plan.text).toBe('а что тут написано?')
  })

  it('a failed file with no caption leaves nothing to send', async () => {
    const plan = await buildAgentMessage(telegram, {
      video: {
        file_id: 'v',
        file_unique_id: 'u',
        file_size: TELEGRAM_DOWNLOAD_LIMIT + 1,
      },
    })
    expect(plan.refusal).not.toBeNull()
    expect(plan.text).toBe('')
  })

  it('plain text passes through untouched', async () => {
    const plan = await buildAgentMessage(telegram, { text: '  привет  ' })
    expect(plan).toEqual({ text: 'привет', refusal: null })
  })
})

/**
 * AN ALBUM BECOMES ONE TURN.
 *
 * Telegram delivers several photos as separate updates sharing a
 * `media_group_id`, with the caption on only one of them. Built one at a time,
 * five photos became five questions and four of them had no question at all.
 */
describe('one turn out of a whole album', () => {
  const telegram = { getFileLink: vi.fn(async () => 'https://tg/secret/x.jpg') }
  const part = (n: number, caption?: string) => ({
    caption,
    photo: [{ file_id: `p${n}`, file_unique_id: `u${n}`, file_size: 3 }],
  })

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      }))
    )
  })

  it('every photo gets a line, under ONE caption', async () => {
    const plan = await buildAgentTurn(telegram, [
      part(1),
      part(2, 'какая резче?'),
      part(3),
    ])
    const lines = plan.text.split('\n')
    expect(lines[0]).toBe('какая резче?')
    expect(lines.filter(l => l.startsWith('[attached image:'))).toHaveLength(3)
    expect(plan.refusal).toBeNull()
  })

  it('an album with no caption is still a turn', async () => {
    const plan = await buildAgentTurn(telegram, [part(1), part(2)])
    expect(plan.text.split('\n')).toHaveLength(2)
  })

  /*
   * ONE FAILED FILE DOES NOT SINK THE TURN: the others may be fine and the
   * caption is a question the agent can still answer.
   */
  it('a failed part does not lose the rest or the caption', async () => {
    const tooBig = {
      caption: 'посмотри',
      video: {
        file_id: 'v',
        file_unique_id: 'u',
        file_size: TELEGRAM_DOWNLOAD_LIMIT + 1,
      },
    }
    const plan = await buildAgentTurn(telegram, [part(1), tooBig, part(2)])
    expect(plan.text).toContain('посмотри')
    expect(
      plan.text.split('\n').filter(l => l.startsWith('[attached'))
    ).toHaveLength(2)
    expect(plan.refusal).not.toBeNull()
  })

  /*
   * Every refusal is named. "One of your photos failed" is not something
   * anybody can act on.
   */
  it('two failures are both reported, not just the first', async () => {
    const big = (name: string) => ({
      document: {
        file_id: name,
        file_unique_id: name,
        file_name: name,
        file_size: TELEGRAM_DOWNLOAD_LIMIT + 1,
      },
    })
    const plan = await buildAgentTurn(telegram, [big('a.pdf'), big('b.pdf')])
    expect(plan.refusal).toContain('a.pdf')
    expect(plan.refusal).toContain('b.pdf')
  })

  it('a single message is the same path with one part', async () => {
    const plan = await buildAgentTurn(telegram, [part(1, 'одно фото')])
    expect(plan.text.split('\n')[0]).toBe('одно фото')
    expect(plan.text.split('\n')).toHaveLength(2)
  })
})
