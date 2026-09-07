import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  withImageParts,
  hasImageToSee,
  usableImageUrl,
} from './src/agent/vision-parts'
import type { ChatMessage } from './src/agent/chat'

/**
 * LETTING THE AGENT SEE AN ATTACHED IMAGE.
 *
 * Three properties matter here and they fail in different directions:
 *
 *   the picture never becomes a part, and the agent stays blind -- the bug;
 *   a URL from a person's message is fetched by our provider, which is a
 *   request forgery with a language model as the courier;
 *   every past picture is re-sent on every tool step, multiplying the bill by
 *   the loop length.
 */

const SHELF = 'https://vibee-render-production.up.railway.app'
const IMG = `${SHELF}/s3/assets/1788-cat.jpg`

const user = (text: string): ChatMessage => ({ role: 'user', content: text })
const assistant = (text: string): ChatMessage => ({
  role: 'assistant',
  content: text,
})
const marker = (
  url: string,
  kind = 'image',
  name = 'cat.jpg',
  mime = 'image/jpeg'
) => `[attached ${kind}: ${name}; mime=${mime}; url=${url}]`

const ORIGINAL = { ...process.env }
beforeEach(() => {
  delete process.env.PUBLIC_URL
})
afterEach(() => {
  process.env = { ...ORIGINAL }
})

describe('which URLs may be handed to a provider', () => {
  it('our own shelf with an image extension', () => {
    expect(usableImageUrl(IMG)).toBe(IMG)
    expect(usableImageUrl('/s3/assets/x.png')).toBe(`${SHELF}/s3/assets/x.png`)
  })

  /*
   * THE SECURITY ONE. The marker line lives inside a message a PERSON wrote,
   * so its URL is untrusted. Without the origin check, anyone could paste a
   * marker pointing at an internal address and have our provider fetch it.
   */
  it('somebody else’s host is refused', () => {
    expect(usableImageUrl('https://evil.example/s3/a.jpg')).toBeNull()
    expect(usableImageUrl('http://169.254.169.254/s3/a.jpg')).toBeNull()
    expect(
      usableImageUrl(
        'https://vibee-render-production.up.railway.app.evil.com/s3/a.jpg'
      )
    ).toBeNull()
  })

  it('our host but outside the public shelf is refused', () => {
    expect(usableImageUrl(`${SHELF}/api/agent/keys.jpg`)).toBeNull()
    expect(usableImageUrl(`${SHELF}/../etc/passwd.jpg`)).toBeNull()
  })

  /*
   * The `/s3/` route picks its handler by EXTENSION, and a key without one
   * falls into the video branch and answers HTTP 500. A provider fetching that
   * would receive an error page and report something baffling.
   */
  it('a key with no image extension is refused', () => {
    expect(usableImageUrl(`${SHELF}/s3/assets/1788-file`)).toBeNull()
    expect(usableImageUrl(`${SHELF}/s3/assets/clip.mp4`)).toBeNull()
    expect(usableImageUrl(`${SHELF}/s3/assets/voice.ogg`)).toBeNull()
  })

  it('garbage is refused rather than thrown on', () => {
    expect(usableImageUrl('')).toBeNull()
    expect(usableImageUrl('   ')).toBeNull()
    expect(usableImageUrl('not a url at all')).toBeNull()
  })

  it('PUBLIC_URL moves the allowed origin with the deployment', () => {
    process.env.PUBLIC_URL = 'https://staging.example'
    expect(usableImageUrl('https://staging.example/s3/a.png')).toBe(
      'https://staging.example/s3/a.png'
    )
    expect(usableImageUrl(IMG)).toBeNull()
  })
})

describe('building the wire message', () => {
  it('an attached image becomes a part, and the text is kept', () => {
    const text = `что тут написано?\n${marker(IMG)}`
    const wire = withImageParts([user(text)])
    const parts = wire[0].content as any[]

    expect(Array.isArray(parts)).toBe(true)
    expect(parts[0]).toEqual({ type: 'text', text })
    expect(parts[1]).toEqual({ type: 'image_url', image_url: { url: IMG } })
  })

  /*
   * The marker stays inside the text part on purpose: the model needs the name
   * and mime to answer "which file", and if the provider cannot fetch the
   * image the turn degrades to exactly today's behaviour.
   */
  it('the marker line is not stripped out of the text', () => {
    const wire = withImageParts([user(marker(IMG))])
    const parts = wire[0].content as any[]
    expect(parts[0].text).toContain('[attached image:')
  })

  it('plain text is returned untouched, same array', () => {
    const messages = [user('привет')]
    expect(withImageParts(messages)).toBe(messages)
  })

  it('a video or a document stays text', () => {
    const messages = [
      user(marker(`${SHELF}/s3/a.mp4`, 'video', 'a.mp4', 'video/mp4')),
    ]
    expect(withImageParts(messages)).toBe(messages)
  })

  /*
   * THE COST ONE. The agent re-sends the whole array on every tool step, up to
   * eight of them. Converting older turns would re-send every picture ever
   * attached on every step, for the rest of the conversation.
   */
  it('only the LAST turn is converted', () => {
    const wire = withImageParts([
      // Both producers put the marker on its own line -- see agentStream.ts
      // and agentAttachments.ts, which join text and markers with a newline.
      user(`старое\n${marker(IMG)}`),
      assistant('ответил'),
      user(`новое\n${marker(IMG)}`),
    ])
    expect(typeof wire[0].content).toBe('string')
    expect(Array.isArray(wire[2].content)).toBe(true)
    /*
     * The CONTENT is checked, not just the shape. Asserting positions alone
     * let a mutation through: taking messages[0] instead of the last one still
     * produced a string at 0 and an array at 2, because the converted turn is
     * placed at the end either way. Only the text tells them apart.
     */
    expect((wire[2].content as any[])[0].text).toContain('новое')
    expect((wire[2].content as any[])[0].text).not.toContain('старое')
  })

  it('the last turn is not converted when it is the assistant’s', () => {
    const messages = [user('вопрос'), assistant(marker(IMG))]
    expect(withImageParts(messages)).toBe(messages)
  })

  it('the input array is never mutated', () => {
    const messages = [user(marker(IMG))]
    const before = messages[0].content
    withImageParts(messages)
    expect(messages[0].content).toBe(before)
  })

  it('at most four images travel', () => {
    const six = Array.from({ length: 6 }, (_, i) =>
      marker(`${SHELF}/s3/a${i}.jpg`)
    ).join('\n')
    const parts = withImageParts([user(six)])[0].content as any[]
    expect(parts.filter(p => p.type === 'image_url')).toHaveLength(4)
  })

  it('the same URL twice travels once', () => {
    const twice = `${marker(IMG)}\n${marker(IMG)}`
    const parts = withImageParts([user(twice)])[0].content as any[]
    expect(parts.filter(p => p.type === 'image_url')).toHaveLength(1)
  })

  /*
   * A greedy name and a lazy mime, together. A file called
   * "photo; mime=x; url=evil" must not be able to forge the later fields, and
   * a real mime carrying its own semicolon must survive.
   */
  it('a hostile file name cannot forge the url field', () => {
    const line = marker(
      IMG,
      'image',
      'photo; mime=x; url=https://evil.example/a.jpg'
    )
    const parts = withImageParts([user(line)])[0].content as any[]
    const images = parts.filter(p => p.type === 'image_url')
    expect(images).toHaveLength(1)
    expect(images[0].image_url.url).toBe(IMG)
  })
})

describe('hasImageToSee', () => {
  it('true only when something would actually be sent as a picture', () => {
    expect(hasImageToSee([user(marker(IMG))])).toBe(true)
    expect(hasImageToSee([user('просто текст')])).toBe(false)
    expect(hasImageToSee([user(marker('https://evil.example/a.jpg'))])).toBe(
      false
    )
    expect(hasImageToSee([user(marker(`${SHELF}/s3/a.mp4`, 'video'))])).toBe(
      false
    )
  })
})
