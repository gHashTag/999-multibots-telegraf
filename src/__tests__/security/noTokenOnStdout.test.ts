/**
 * A BOT TOKEN MUST NOT REACH STDOUT, AND console.* BYPASSES THE REDACTOR.
 *
 * Found by a security sweep on 2026-09-20. `videoTranscription.ts` built
 * `https://api.telegram.org/file/bot<TOKEN>/<path>` and printed
 * `substring(0, 100)` of it -- the prefix is 33 characters and a token is
 * 44-46, so the whole credential went to stdout on every transcription any
 * customer of any bot in the farm started. A third site handed the whole
 * AxiosError to console.error, whose `config.url` is the same URL.
 *
 * The systemic redaction in logger.ts sits in winston's printf; `console.*`
 * never passes through it. So the rule has to be checked where the calls are.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { redactBotToken } from '@/utils/redactBotToken'

const ROOT = path.resolve(__dirname, '../../..')

/** A token-shaped value, invented here. */
const FAKE = 'bot1234567890:' + 'A'.repeat(35) // secret-guard-ok: invented

describe('the token never reaches stdout', () => {
  /*
   * The control. A redactor that matched nothing would make every check below
   * pass while every token still shipped.
   */
  it('the redactor recognises the shape inside a URL', () => {
    const url = `https://api.telegram.org/file/${FAKE}/videos/file_1.mp4`
    expect(redactBotToken(url)).not.toContain('A'.repeat(35))
    expect(redactBotToken(url)).toContain('<redacted>')
  })

  /*
   * THE TRAP THE SWEEP FOUND: slicing a URL is not redacting it. Cutting at
   * 100 characters keeps the entire token, because the token starts at 33.
   */
  it('slicing a token-bearing URL keeps the token, redacting it does not', () => {
    const url = `https://api.telegram.org/file/${FAKE}/videos/file_1.mp4`
    expect(url.slice(0, 100)).toContain('A'.repeat(35))
    expect(redactBotToken(url).slice(0, 100)).not.toContain('A'.repeat(35))
  })

  /*
   * And the file itself: every console.* that mentions a URL or an error in
   * this service must pass through the redactor. Read as text rather than
   * executed, because the alternative is standing up a Telegram download.
   */
  it('videoTranscription prints no unredacted url or error', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'src/services/videoTranscription.ts'),
      'utf8'
    )
    const bad: string[] = []
    for (const [i, line] of src.split('\n').entries()) {
      if (!/console\.(log|error|warn|info)/.test(line)) continue
      const mentionsUrl = /videoUrl|\burl\b/i.test(line)
      const mentionsRawError = /,\s*error\s*\)/.test(line)
      if (
        (mentionsUrl || mentionsRawError) &&
        !line.includes('redactBotToken')
      ) {
        bad.push(`${i + 1}: ${line.trim().slice(0, 80)}`)
      }
    }
    expect(bad, 'a console.* here can publish a bot token').toEqual([])
  })
})
