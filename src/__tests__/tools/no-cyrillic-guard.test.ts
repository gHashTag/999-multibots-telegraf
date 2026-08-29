/**
 * The no-cyrillic guard rejects Cyrillic in code comments and identifiers, but
 * allows it inside string literals (bilingual UI text).
 *
 * The hole this pins down: the guard used to strip ALL quoted spans from a line
 * before looking for Cyrillic, including quotes that live inside a comment. So a
 * comment whose Cyrillic was wrapped in quotes — `// see 'вход'` — had its
 * Cyrillic erased as if it were a UI string, and the Russian comment slipped
 * through. The comment is now separated from the code (string-aware) before
 * strings are stripped, so quoted Cyrillic in a comment is still caught.
 */
import { describe, it, expect } from 'vitest'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const guard = require('../../../scripts/no-cyrillic-guard.cjs')
const flags = (line: string): boolean => guard.cyrillicOutsideStrings(line)

describe('no-cyrillic guard: cyrillicOutsideStrings', () => {
  it('flags a Russian // comment', () => {
    expect(flags('const x = 1 // это комментарий')).toBe(true)
  })

  it('flags a Russian comment even when the Cyrillic is wrapped in quotes (the hole)', () => {
    // The old ruler stripped the quoted Russian word as a string and passed it.
    expect(flags("// see 'вход'")).toBe(true)
    expect(flags('foo() // печатает "вывод"')).toBe(true)
  })

  it('flags a Cyrillic identifier in code', () => {
    expect(flags('const переменная = 5')).toBe(true)
  })

  it('allows Cyrillic inside a string literal (UI text)', () => {
    expect(flags("const s = isRu ? 'привет' : 'hello'")).toBe(false)
    expect(flags('const s = `Привет, мир`')).toBe(false)
  })

  it('does not treat // inside a string as a comment', () => {
    // The Cyrillic here is a punycode-free RU domain inside a real string.
    expect(flags('const u = "https://пример.рф/path"')).toBe(false)
  })

  it('allows a pure-ASCII comment', () => {
    expect(flags('const x = 1 // plain english comment')).toBe(false)
  })
})
