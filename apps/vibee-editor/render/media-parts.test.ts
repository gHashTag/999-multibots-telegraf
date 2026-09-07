import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  withMediaParts,
  mediaKindsPresent,
  usableMediaUrl,
} from './src/agent/media-parts'
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
const VOICE = `${SHELF}/s3/assets/1788-voice.ogg`
const VOICE_LINE = `[attached audio: voice.ogg; mime=audio/ogg; url=${VOICE}]`

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
    expect(usableMediaUrl(IMG, 'image')).toBe(IMG)
    expect(usableMediaUrl('/s3/assets/x.png', 'image')).toBe(
      `${SHELF}/s3/assets/x.png`
    )
  })

  /*
   * THE SECURITY ONE. The marker line lives inside a message a PERSON wrote,
   * so its URL is untrusted. Without the origin check, anyone could paste a
   * marker pointing at an internal address and have our provider fetch it.
   */
  it('somebody else’s host is refused', () => {
    expect(usableMediaUrl('https://evil.example/s3/a.jpg', 'image')).toBeNull()
    expect(
      usableMediaUrl('http://169.254.169.254/s3/a.jpg', 'image')
    ).toBeNull()
    expect(
      usableMediaUrl(
        'https://vibee-render-production.up.railway.app.evil.com/s3/a.jpg',
        'image'
      )
    ).toBeNull()
  })

  it('our host but outside the public shelf is refused', () => {
    expect(usableMediaUrl(`${SHELF}/api/agent/keys.jpg`, 'image')).toBeNull()
    expect(usableMediaUrl(`${SHELF}/../etc/passwd.jpg`, 'image')).toBeNull()
  })

  /*
   * The `/s3/` route picks its handler by EXTENSION, and a key without one
   * falls into the video branch and answers HTTP 500. A provider fetching that
   * would receive an error page and report something baffling.
   */
  it('a key with no image extension is refused', () => {
    expect(usableMediaUrl(`${SHELF}/s3/assets/1788-file`, 'image')).toBeNull()
    expect(usableMediaUrl(`${SHELF}/s3/assets/clip.mp4`, 'image')).toBeNull()
    expect(usableMediaUrl(`${SHELF}/s3/assets/voice.ogg`, 'image')).toBeNull()
  })

  it('garbage is refused rather than thrown on', () => {
    expect(usableMediaUrl('', 'image')).toBeNull()
    expect(usableMediaUrl('   ', 'image')).toBeNull()
    expect(usableMediaUrl('not a url at all', 'image')).toBeNull()
  })

  it('PUBLIC_URL moves the allowed origin with the deployment', () => {
    process.env.PUBLIC_URL = 'https://staging.example'
    expect(usableMediaUrl('https://staging.example/s3/a.png', 'image')).toBe(
      'https://staging.example/s3/a.png'
    )
    expect(usableMediaUrl(IMG, 'image')).toBeNull()
  })
})

describe('building the wire message', () => {
  it('an attached image becomes a part, and the text is kept', () => {
    const text = `что тут написано?\n${marker(IMG)}`
    const wire = withMediaParts([user(text)])
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
    const wire = withMediaParts([user(marker(IMG))])
    const parts = wire[0].content as any[]
    expect(parts[0].text).toContain('[attached image:')
  })

  it('plain text is returned untouched, same array', () => {
    const messages = [user('привет')]
    expect(withMediaParts(messages)).toBe(messages)
  })

  it('a video or a document stays text', () => {
    const messages = [
      user(marker(`${SHELF}/s3/a.mp4`, 'video', 'a.mp4', 'video/mp4')),
    ]
    expect(withMediaParts(messages)).toBe(messages)
  })

  /*
   * THE COST ONE. The agent re-sends the whole array on every tool step, up to
   * eight of them. Converting older turns would re-send every picture ever
   * attached on every step, for the rest of the conversation.
   */
  it('only the LAST turn is converted', () => {
    const wire = withMediaParts([
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
    expect(withMediaParts(messages)).toBe(messages)
  })

  it('the input array is never mutated', () => {
    const messages = [user(marker(IMG))]
    const before = messages[0].content
    withMediaParts(messages)
    expect(messages[0].content).toBe(before)
  })

  it('at most four images travel', () => {
    const six = Array.from({ length: 6 }, (_, i) =>
      marker(`${SHELF}/s3/a${i}.jpg`)
    ).join('\n')
    const parts = withMediaParts([user(six)])[0].content as any[]
    expect(parts.filter(p => p.type === 'image_url')).toHaveLength(4)
  })

  it('the same URL twice travels once', () => {
    const twice = `${marker(IMG)}\n${marker(IMG)}`
    const parts = withMediaParts([user(twice)])[0].content as any[]
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
    const parts = withMediaParts([user(line)])[0].content as any[]
    const images = parts.filter(p => p.type === 'image_url')
    expect(images).toHaveLength(1)
    expect(images[0].image_url.url).toBe(IMG)
  })
})

describe('which kinds of media a turn would send', () => {
  it('an image is reported, and only when it would really travel', () => {
    expect([...mediaKindsPresent([user(marker(IMG))])]).toEqual(['image'])
    expect(mediaKindsPresent([user('просто текст')]).size).toBe(0)
    expect(
      mediaKindsPresent([user(marker('https://evil.example/a.jpg'))]).size
    ).toBe(0)
    expect(
      mediaKindsPresent([user(marker(`${SHELF}/s3/a.mp4`, 'video'))]).size
    ).toBe(0)
  })

  it('a voice message is reported as audio', () => {
    expect([...mediaKindsPresent([user(VOICE_LINE)])]).toEqual(['audio'])
  })

  /*
   * A turn can carry both, and then it needs a provider that does BOTH. Asking
   * only for sight would send the recording to a model that cannot listen.
   */
  it('a photo and a recording together report both kinds', () => {
    const both = `${marker(IMG)}\n${VOICE_LINE}`
    expect([...mediaKindsPresent([user(both)])].sort()).toEqual([
      'audio',
      'image',
    ])
  })
})

/**
 * VOICE.
 *
 * Telegram sends a voice message as ogg/opus, which is exactly what was proved
 * to transcribe end to end through our own shelf. The field name is
 * `audio_url`, NOT the OpenAI `input_audio`: that one answers 200 and ignores
 * the sound, so a wrong choice here would ship a feature that silently does
 * nothing.
 */
describe('hearing an attached recording', () => {
  it('a voice message becomes an audio part', () => {
    const parts = withMediaParts([user(VOICE_LINE)])[0].content as any[]
    expect(parts[0].type).toBe('text')
    expect(parts[1]).toEqual({ type: 'audio_url', audio_url: { url: VOICE } })
  })

  it('the tested audio formats are accepted', () => {
    for (const ext of ['.ogg', '.mp3', '.wav', '.m4a']) {
      expect(usableMediaUrl(`${SHELF}/s3/v${ext}`, 'audio')).not.toBeNull()
    }
  })

  /*
   * The shelf also serves .aac and .webm, but neither was tested against the
   * provider. An untested format would surface as a confusing provider error
   * instead of a clean refusal, so it stays out until somebody measures it.
   */
  it('an untested audio format is refused rather than hoped for', () => {
    expect(usableMediaUrl(`${SHELF}/s3/v.aac`, 'audio')).toBeNull()
    expect(usableMediaUrl(`${SHELF}/s3/v.webm`, 'audio')).toBeNull()
  })

  it('the kinds do not borrow each other’s extensions', () => {
    expect(usableMediaUrl(`${SHELF}/s3/a.jpg`, 'audio')).toBeNull()
    expect(usableMediaUrl(VOICE, 'image')).toBeNull()
  })

  it('somebody else’s host is refused for audio too', () => {
    expect(usableMediaUrl('https://evil.example/s3/a.ogg', 'audio')).toBeNull()
  })

  it('an image and a recording travel as their own part types', () => {
    const both = `${marker(IMG)}\n${VOICE_LINE}`
    const parts = withMediaParts([user(both)])[0].content as any[]
    expect(parts.map(p => p.type)).toEqual(['text', 'image_url', 'audio_url'])
  })
})
