import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * File downloads in the lipsync render wizards must carry a timeout.
 *
 * These scenes fetch the user's uploaded photo/cover from Telegram's file CDN
 * with a bare `await fetch(fileLink.href)` — no timeout. The bots run with
 * handlerTimeout: Infinity, so a stalled download hangs that wizard step
 * forever and the user's render is stuck with no recovery. The codebase's own
 * downloadFile helpers already time out at 60s; these raw fetches skipped it.
 *
 * Every such download now passes signal: AbortSignal.timeout(...). This reads
 * the sources and fails if a bare, un-timed fetch(fileLink.href) reappears.
 */

const DIR = path.join('src', 'scenes', 'lipSyncWizard')

function tsFiles(dir: string): string[] {
  const out: string[] = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...tsFiles(p))
    else if (p.endsWith('.ts')) out.push(p)
  }
  return out
}

describe('lipsync file downloads time out', () => {
  const files = tsFiles(DIR)

  it('finds the wizard sources — otherwise the check is empty', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('no bare fetch(fileLink.href) without a timeout signal', () => {
    const offenders: string[] = []
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8')
      // A download call whose argument list closes right after .href — i.e.
      // no second argument (no options, no signal).
      for (const m of src.matchAll(/fetch\(\s*fileLink\.href\s*\)/g)) {
        const line = src.slice(0, m.index).split('\n').length
        offenders.push(`${f}:${line}`)
      }
    }
    expect(offenders, `un-timed downloads: ${offenders.join(', ')}`).toEqual([])
  })

  it('the downloads that exist use AbortSignal.timeout', () => {
    let withTimeout = 0
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8')
      for (const _ of src.matchAll(
        /fetch\(\s*fileLink\.href\s*,\s*\{\s*signal:\s*AbortSignal\.timeout\(/g
      ))
        withTimeout++
    }
    expect(withTimeout).toBeGreaterThan(0)
  })
})
