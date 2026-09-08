/**
 * Every upload from the mini app goes through the one signed door.
 *
 * The render server runs auth in enforce mode: a POST /upload without
 * X-Telegram-Init-Data (or a server key) is refused -- live log:
 * "[auth] REFUSED POST /upload -- no X-Api-Key and no Telegram initData"
 * (the server logs the verdict word in Russian).
 * Two components (AssetsPanel, Timeline) still called fetch() on /upload bare,
 * one of them with multipart FormData the server never read; to the owner this
 * was "photos, videos and files do not load in the mini app".
 *
 * lib/s3Upload.ts is the only place allowed to call /upload, and it must sign.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(process.cwd(), 'apps/vibee-editor/player/src')
const DOOR = 'lib/s3Upload.ts'

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return e.name.includes('test') ? [] : walk(p)
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : []
  })
}

describe('mini app uploads are signed', () => {
  const files = walk(ROOT)

  it('no file but the door calls fetch on /upload', () => {
    const offenders = files
      .filter(f => !f.endsWith(DOOR))
      .filter(f => {
        const src = fs.readFileSync(f, 'utf8')
        return /fetch\([^)]*\/upload/.test(src.replace(/\s+/g, ' '))
      })
      .map(f => path.relative(ROOT, f))
    expect(offenders).toEqual([])
  })

  it('the door signs every request', () => {
    const src = fs.readFileSync(path.join(ROOT, DOOR), 'utf8')
    const call = src.slice(src.indexOf('/upload`'), src.indexOf('body:'))
    expect(call).toContain('authHeaders(')
  })

  it('the two former offenders now import the door (a rename cannot dodge the first test)', () => {
    for (const f of [
      'components/Panels/AssetsPanel.tsx',
      'components/Timeline/Timeline.tsx',
    ]) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8')
      expect(src, f).toContain("from '@/lib/s3Upload'")
      expect(src, f).not.toContain('new FormData()')
    }
  })
})
