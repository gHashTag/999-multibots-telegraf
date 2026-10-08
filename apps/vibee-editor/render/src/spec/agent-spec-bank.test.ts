/**
 * Spec agent-spec-bank.t27 (gHashTag/t27#7855), every test block run against
 * agent/spec-bank-tools.ts, then the behaviour of t27_specs with GitHub
 * faked: one listing kept ten minutes, the search, the read and its bound,
 * a path outside the bank refused, and the render's own specs when GitHub
 * cannot be reached.
 */
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as SPEC from './agent-spec-bank.gen'
import {
  fallsBack,
  found,
  indexFresh,
  pathReadable,
  readChars,
  readablePath,
  resetSpecIndex,
  searchPaths,
  shown,
  specBank,
} from '../agent/spec-bank-tools'
import { TOOLS } from '../agent/tools'

describe('spec agent-spec-bank.t27', () => {
  it('every member reads the bank, and reading costs nothing', () => {
    expect(SPEC.SPEC_BANK_FOR_EVERY_MEMBER).toBe(true)
    expect(SPEC.SPEC_BANK_PRICE_TOKENS).toBe(0)
    // In the one registry every member is shown (bot-agent-team.t27).
    expect(TOOLS.some(t => t.name === 't27_specs')).toBe(true)
  })

  it('the listing is kept ten minutes, not one moment longer', () => {
    expect(indexFresh(0)).toBe(true)
    expect(indexFresh(SPEC.SPEC_INDEX_TTL_MS - 1)).toBe(true)
    expect(indexFresh(SPEC.SPEC_INDEX_TTL_MS)).toBe(false)
  })

  it('a path is found when every word of the query is in it; no words find nothing', () => {
    expect(found(2, 2)).toBe(true)
    expect(found(2, 1)).toBe(false)
    expect(found(0, 0)).toBe(false)
    expect(found(1, 1)).toBe(true)
  })

  it('at most twenty paths come back', () => {
    expect(shown(3)).toBe(3)
    expect(shown(SPEC.SPEC_SEARCH_MAX)).toBe(SPEC.SPEC_SEARCH_MAX)
    expect(shown(SPEC.SPEC_SEARCH_MAX + 1)).toBe(SPEC.SPEC_SEARCH_MAX)
  })

  it('only a spec inside the bank is read', () => {
    expect(pathReadable(true, true, false)).toBe(true)
    expect(pathReadable(false, true, false)).toBe(false)
    expect(pathReadable(true, false, false)).toBe(false)
    expect(pathReadable(true, true, true)).toBe(false)
    expect(readablePath('specs/automation/bot-topic-tabs.t27')).toBe(true)
    expect(readablePath('README.md')).toBe(false)
    expect(readablePath('specs/automation/x.md')).toBe(false)
    expect(readablePath('specs/../secrets.t27')).toBe(false)
    expect(readablePath('docs/specs/x.t27')).toBe(false)
  })

  it('a long spec is cut at the bound', () => {
    expect(readChars(100)).toBe(100)
    expect(readChars(SPEC.SPEC_READ_MAX_CHARS)).toBe(SPEC.SPEC_READ_MAX_CHARS)
    expect(readChars(SPEC.SPEC_READ_MAX_CHARS + 1)).toBe(
      SPEC.SPEC_READ_MAX_CHARS
    )
  })

  it("without the bank, the host's own specs; without both, a refusal", () => {
    expect(fallsBack(false, true)).toBe(true)
    expect(fallsBack(true, true)).toBe(false)
    expect(fallsBack(false, false)).toBe(false)
    expect(fallsBack(true, false)).toBe(false)
  })

  it("VERSION says what the header's last note says", () => {
    expect(SPEC.VERSION).toBe(1)
  })
})

/** GitHub as the tool sees it: the contents listing, the tree, raw files. */
function github(files: Record<string, string>, opts: { down?: boolean } = {}) {
  const calls: string[] = []
  const f = vi.fn(async (url: string) => {
    calls.push(String(url))
    if (opts.down) throw new Error('getaddrinfo ENOTFOUND')
    if (url.includes('/contents/'))
      return new Response(
        JSON.stringify([
          { name: 'docs', type: 'dir', sha: 'd0' },
          { name: 'specs', type: 'dir', sha: 's1' },
        ])
      )
    if (url.includes('/git/trees/s1'))
      return new Response(
        JSON.stringify({
          tree: [
            ...Object.keys(files).map(p => ({
              path: p.replace(/^specs\//, ''),
              type: 'blob',
            })),
            { path: 'automation/notes.md', type: 'blob' },
            { path: 'automation', type: 'tree' },
          ],
        })
      )
    const raw = url.split('/master/')[1]
    if (raw && raw in files) return new Response(files[raw])
    return new Response('404', { status: 404 })
  })
  return { f: f as unknown as typeof fetch, calls }
}

describe('t27_specs', () => {
  beforeEach(() => resetSpecIndex())

  const bank = {
    'specs/automation/bot-topic-tabs.t27': '// tabs\nmodule a {}',
    'specs/automation/bot-agent-team.t27': '// team\nmodule b {}',
    'specs/fpga/uart.t27': '// uart',
  }

  it('finds the specs whose path holds every word, and none for no words', async () => {
    const { f } = github(bank)
    const r: any = await specBank(
      { action: 'search', query: 'bot TABS' },
      { fetch: f }
    )
    expect(r.paths).toEqual(['specs/automation/bot-topic-tabs.t27'])
    expect(r.found).toBe(1)
    expect(r.source).toBe('gHashTag/t27')
    const none: any = await specBank(
      { action: 'search', query: '  ' },
      { fetch: f }
    )
    expect(none.error).toBeTruthy()
  })

  it('lists the bank once in ten minutes', async () => {
    const { f, calls } = github(bank)
    await specBank({ query: 'bot' }, { fetch: f, now: 1_000 })
    await specBank(
      { query: 'uart' },
      { fetch: f, now: 1_000 + SPEC.SPEC_INDEX_TTL_MS - 1 }
    )
    expect(calls.filter(c => c.includes('/git/trees/'))).toHaveLength(1)
    await specBank(
      { query: 'uart' },
      { fetch: f, now: 1_000 + SPEC.SPEC_INDEX_TTL_MS }
    )
    expect(calls.filter(c => c.includes('/git/trees/'))).toHaveLength(2)
  })

  it('says how many more when the search finds more than it shows', () => {
    const paths = Array.from({ length: 25 }, (_, i) => `specs/a/x${i}.t27`)
    const r = searchPaths(paths, 'x')
    expect(r.paths).toHaveLength(SPEC.SPEC_SEARCH_MAX)
    expect(r.total).toBe(25)
  })

  it('reads one spec, cut at the bound, and refuses a path outside the bank', async () => {
    const long = 'x'.repeat(SPEC.SPEC_READ_MAX_CHARS + 5)
    const { f } = github({ ...bank, 'specs/a/long.t27': long })
    const r: any = await specBank(
      { action: 'read', path: 'specs/automation/bot-agent-team.t27' },
      { fetch: f }
    )
    expect(r.text).toContain('module b')
    const cut: any = await specBank(
      { action: 'read', path: 'specs/a/long.t27' },
      { fetch: f }
    )
    expect(cut.text).toHaveLength(SPEC.SPEC_READ_MAX_CHARS)
    expect(cut.cut).toBe(true)
    expect(cut.chars).toBe(long.length)
    const out: any = await specBank(
      { action: 'read', path: '.github/x.t27' },
      { fetch: f }
    )
    expect(out.error).toBeTruthy()
    const missing: any = await specBank(
      { action: 'read', path: 'specs/a/none.t27' },
      { fetch: f }
    )
    expect(missing.error).toBeTruthy()
  })

  it("without GitHub, the render's own specs are searched and read, and it says so", async () => {
    const dir = await mkdtemp(join(tmpdir(), 'spec-bank-'))
    await writeFile(join(dir, 'bot-topic-tabs.t27'), '// host copy')
    const { f } = github(bank, { down: true })
    const r: any = await specBank({ query: 'tabs' }, { fetch: f, hostDir: dir })
    expect(r.source).toBe('host')
    expect(r.paths).toEqual(['specs/host/bot-topic-tabs.t27'])
    const read: any = await specBank(
      { action: 'read', path: 'specs/automation/bot-topic-tabs.t27' },
      { fetch: f, hostDir: dir }
    )
    expect(read.source).toBe('host')
    expect(read.text).toBe('// host copy')
    const empty = await mkdtemp(join(tmpdir(), 'spec-bank-none-'))
    const no: any = await specBank(
      { query: 'tabs' },
      { fetch: f, hostDir: empty }
    )
    expect(no.error).toBeTruthy()
  })
})
