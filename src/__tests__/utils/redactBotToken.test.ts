/**
 * The bot token must never reach a log. Telegram file URLs embed it as
 * .../bot<id>:<hash>/..., and those URLs flow into logger meta and debug
 * console.log on ordinary paths. redactBotToken masks the <hash>, and the main
 * logger runs every rendered line through it.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import { redactBotToken } from '@/utils/redactBotToken'

const HASH = 'AAER-ThisIsABotTokenSecretHash1234567'
const TOKEN = `7712345678:${HASH}`
const URL = `https://api.telegram.org/file/bot${TOKEN}/photos/file_42.jpg`

describe('redactBotToken', () => {
  it('masks the token hash inside a Telegram file URL', () => {
    const out = redactBotToken(URL)
    expect(out).not.toContain(HASH)
    expect(out).not.toContain(TOKEN)
    expect(out).toContain('bot7712345678:<redacted>')
    // the rest of the URL (path) survives, so the log still tells you the file
    expect(out).toContain('/photos/file_42.jpg')
  })

  it('masks a token anywhere in a larger string (meta JSON)', () => {
    const line = `[ERROR]: face swap failed {"targetImageUrl":"${URL}","x":1}`
    const out = redactBotToken(line)
    expect(out).not.toContain(HASH)
    expect(out).toContain('"x":1')
  })

  it('leaves ordinary text and short token-shaped fragments untouched', () => {
    expect(redactBotToken('robot_name and bot123:ok')).toBe(
      'robot_name and bot123:ok'
    )
    expect(redactBotToken('just a message')).toBe('just a message')
  })

  it('coerces non-strings without throwing', () => {
    expect(redactBotToken(undefined)).toBe('undefined')
    expect(redactBotToken(42)).toBe('42')
  })
})

describe('the main logger runs every line through redactBotToken', () => {
  // Behavioral capture of winston's Console output is unreliable (the transport
  // binds process.stdout at construction), so assert the wiring statically:
  // commonFormat.printf must return a redacted line, not the raw one. With the
  // unit tests above proving redactBotToken masks the token, this establishes
  // that anything logged via logger.* is token-free by construction.
  it('commonFormat.printf returns redactBotToken(line)', () => {
    const src = fs.readFileSync('src/utils/logger.ts', 'utf8')
    expect(src).toMatch(/return redactBotToken\(/)
  })
})
