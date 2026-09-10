/**
 * THE PERSON BEHIND THE BOT.
 *
 * Owner, 2026-09-09: "позвать человека -- имя исправь на t27_dev, это я". // cyrillic-ok: owner quote
 * One constant, so the handle a person is sent to is the same under the
 * "talk to a person" button, in tech support, and in payment fallbacks. A
 * bot whose avatar names its own `support` handle still overrides this; the
 * constant is the default for everyone else.
 */
export const SUPPORT_HANDLE = 't27_dev'

/** `@handle`, whatever form the stored value had. */
export function supportMention(handle: string = SUPPORT_HANDLE): string {
  const clean = handle.replace(/^@/, '')
  return `@${clean}`
}
