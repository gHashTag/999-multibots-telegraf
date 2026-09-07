import { describe, it, expect, afterEach } from 'vitest'
import {
  telegramApiRoot,
  telegramApiIsLocal,
  telegramDownloadLimit,
  CLOUD_API_ROOT,
} from '@/services/telegramApi'

/**
 * ONE PLACE THAT KNOWS WHERE THE BOT API LIVES.
 *
 * This exists because of a property of Telegram's own design: a bot that has
 * called `logOut` on the cloud API works ONLY through a local Bot API server
 * from that moment. There is no fallback and no mixed mode. So every single
 * call site has to move at once -- one `https://api.telegram.org` left hard-coded
 * anywhere is a bot that answers "Unauthorized" forever after the migration.
 *
 * The 20 MB ceiling on `getFile` is the reason anybody would want that
 * migration, so the ceiling is derived from the same switch rather than being
 * a separate constant somebody has to remember to change.
 *
 * The dangerous failure here is a SILENT one: a misconfigured root that quietly
 * falls back to the cloud looks fine in every log and kills every bot after
 * `logOut`. So a bad value is loud.
 */

const KEY = 'TELEGRAM_API_ROOT'
const original = process.env[KEY]

/** The words the failure must contain to be actionable. */
const HINT = /TELEGRAM_API_ROOT/

afterEach(() => {
  if (original === undefined) delete process.env[KEY]
  else process.env[KEY] = original
})

describe('with nothing configured, nothing changes', () => {
  it('the root is the cloud one', () => {
    delete process.env[KEY]
    expect(telegramApiRoot()).toBe('https://api.telegram.org')
    expect(telegramApiRoot()).toBe(CLOUD_API_ROOT)
    expect(telegramApiIsLocal()).toBe(false)
  })

  it('the ceiling is the cloud ceiling: 20 MB', () => {
    delete process.env[KEY]
    expect(telegramDownloadLimit()).toBe(20 * 1024 * 1024)
  })

  /*
   * An empty variable is how "unset" actually arrives from a shell or from a
   * dashboard where somebody cleared the field. Treating it as a configured
   * root would produce `https:///bot123/getMe`.
   */
  it('an empty or blank value counts as unset, not as a broken root', () => {
    process.env[KEY] = ''
    expect(telegramApiRoot()).toBe(CLOUD_API_ROOT)
    process.env[KEY] = '   '
    expect(telegramApiRoot()).toBe(CLOUD_API_ROOT)
    expect(telegramApiIsLocal()).toBe(false)
  })
})

describe('with a local server configured', () => {
  it('the root is the configured one and the ceiling rises', () => {
    process.env[KEY] = 'http://bot-api.railway.internal:8081'
    expect(telegramApiRoot()).toBe('http://bot-api.railway.internal:8081')
    expect(telegramApiIsLocal()).toBe(true)
    // 2000 MB is what a local Bot API server serves.
    expect(telegramDownloadLimit()).toBe(2000 * 1024 * 1024)
  })

  /*
   * Every call site builds `${root}/bot${token}/method`. A trailing slash would
   * make that `//bot…`, which some proxies answer with a redirect and others
   * with a 404 -- a failure that would look like a bad token.
   */
  it('a trailing slash is removed so no call site builds a double slash', () => {
    process.env[KEY] = 'http://bot-api.internal:8081/'
    expect(telegramApiRoot()).toBe('http://bot-api.internal:8081')
    process.env[KEY] = 'http://bot-api.internal:8081///'
    expect(telegramApiRoot()).toBe('http://bot-api.internal:8081')
  })

  it('surrounding whitespace does not become part of the URL', () => {
    process.env[KEY] = '  http://bot-api.internal:8081  '
    expect(telegramApiRoot()).toBe('http://bot-api.internal:8081')
  })

  /*
   * The cloud address written out in full is not "local", whatever it is set
   * to -- otherwise the ceiling would rise to 2000 MB while `getFile` still
   * refused at 20, and the refusal would name a limit that is not the one being
   * enforced.
   */
  it('pointing the variable back at the cloud is not a local server', () => {
    process.env[KEY] = 'https://api.telegram.org'
    expect(telegramApiIsLocal()).toBe(false)
    expect(telegramDownloadLimit()).toBe(20 * 1024 * 1024)
  })
})

describe('a broken root is loud, never a silent fallback', () => {
  /*
   * THE FAILURE THIS WHOLE FILE IS ABOUT. After `logOut`, falling back to the
   * cloud does not degrade the service -- it stops it, with "Unauthorized" on
   * every call and nothing in the logs pointing at a typo in one variable.
   */
  it('a value that is not a URL throws instead of falling back', () => {
    process.env[KEY] = 'bot-api.internal:8081'
    expect(() => telegramApiRoot()).toThrow(HINT)
  })

  it('a non-http scheme throws', () => {
    process.env[KEY] = 'ftp://bot-api.internal'
    expect(() => telegramApiRoot()).toThrow(HINT)
  })

  it('the error names the variable, so the fix is obvious', () => {
    process.env[KEY] = 'nonsense'
    expect(() => telegramApiRoot()).toThrow(KEY)
  })

  /*
   * And it must not be possible to get a rising ceiling out of a broken root:
   * the limit is derived from the same check, so it fails the same way rather
   * than quietly answering 20 MB.
   */
  it('the ceiling does not quietly answer while the root is broken', () => {
    process.env[KEY] = 'nonsense'
    expect(() => telegramDownloadLimit()).toThrow(HINT)
    expect(() => telegramApiIsLocal()).toThrow(HINT)
  })
})
