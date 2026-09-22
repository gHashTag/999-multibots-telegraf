/**
 * THE BOARD'S LOOK IS WORN IN THE BOARD'S FRAME, AND NOWHERE ELSE.
 *
 * lib/shell.ts picks the look at boot; styles/board-shell.css holds it. The
 * owner asked for the profile "in the site's style" inside the board
 * (2026-09-22). The same app runs in a browser tab and in Telegram, where its
 * own look must not change -- so every rule of the stylesheet is scoped, and
 * this file proves it by reading the stylesheet, not by trusting a comment.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BOARD_SHELL, applyShell, shellOf } from '../shell'

describe('which look a document wears', () => {
  it("the board's, inside the board's frame", () => {
    expect(shellOf(true, '', false)).toBe(BOARD_SHELL)
  })

  it('its own everywhere else, whatever the address asks in production', () => {
    expect(shellOf(false, '', false)).toBeNull()
    expect(shellOf(false, '?shell=board', false)).toBeNull()
  })

  it("a development build shows the board's look on request, to check it", () => {
    expect(shellOf(false, '?shell=board', true)).toBe(BOARD_SHELL)
    expect(shellOf(false, '?shell=other', true)).toBeNull()
  })

  it('is written on <html>, where the stylesheet looks, and taken back', () => {
    const root = document.createElement('html')
    applyShell(root, BOARD_SHELL)
    expect(root.getAttribute('data-shell')).toBe('board')
    applyShell(root, null)
    expect(root.hasAttribute('data-shell')).toBe(false)
  })
})

describe('the stylesheet reaches only the framed app', () => {
  const css = readFileSync(
    join(__dirname, '..', '..', 'styles', 'board-shell.css'),
    'utf8'
  )

  /** Every selector of every rule, comments removed, at-rules unwrapped. */
  function selectorsOf(text: string): string[] {
    const clean = text.replace(/\/\*[\s\S]*?\*\//g, '')
    const out: string[] = []
    const rule = /([^{}]+)\{/g
    for (const m of clean.matchAll(rule)) {
      const head = m[1].trim()
      if (!head || head.startsWith('@')) continue
      // Custom-property values such as polygon(...) never contain '{', so
      // every head here is a selector list.
      for (const part of head.split(/,(?![^(]*\))/)) out.push(part.trim())
    }
    return out
  }

  it('finds the rules at all (the reader itself can rot)', () => {
    expect(selectorsOf(css).length).toBeGreaterThan(40)
  })

  it("every rule is scoped under html[data-shell='board']", () => {
    const loose = selectorsOf(css).filter(
      s => !s.startsWith("html[data-shell='board']")
    )
    expect(loose).toEqual([])
  })

  it('the check catches a loose rule (negative control)', () => {
    const planted = `${css}\n.profile-header { color: red; }\n`
    expect(
      selectorsOf(planted).filter(
        s => !s.startsWith("html[data-shell='board']")
      )
    ).toEqual(['.profile-header'])
  })

  it('carries the board tokens it was measured against', () => {
    for (const token of [
      '#00ff88',
      'rgba(0, 255, 136, 0.22)',
      'rgba(2, 8, 6, 0.88)',
      'JetBrains Mono',
    ]) {
      expect(css, token).toContain(token)
    }
  })
})
