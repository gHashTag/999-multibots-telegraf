/**
 * The kie.ai status route that does not exist.
 *
 * Three pollers in this repository -- WAN 2.5 video, Sora 2, the Veed Fabric
 * lip-sync fallback -- requested
 *
 *     GET https://api.kie.ai/api/v1/jobs/taskStatus
 *
 * Measured against the live API on 2026-09-15 with the production key, that
 * path answers HTTP 404 on GET and on POST, with Spring's own
 * {"timestamp","status":404,"path"} body rather than the API's
 * {"code","msg","data"} envelope: the route is absent, so no task id and no
 * parameter spelling could ever have made it answer. The working route is
 * /api/v1/jobs/recordInfo.
 *
 * A sibling test (kieVeedFabricStatusFields.test.ts) had already pinned how
 * that answer is PARSED, and the parsing was right. Nobody had asked whether
 * the request arrived. That is what this file asks.
 *
 * It scans source rather than making a network call: a test that hits kie.ai
 * would need a paid key and would go red when the network does.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import {
  KIE_JOBS,
  KIE_DEAD_STATUS_PATH,
  readKieJobRecord,
} from '../../config/kie-jobs'

const SRC = path.resolve(__dirname, '../..')

// Exactly one file may name the dead route: the one that documents it. This
// test imports the constant from there rather than spelling it again, so it
// needs no exemption of its own.
const ALLOWED = [path.join(SRC, 'config', 'kie-jobs.ts')]

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue
      walk(full, out)
    } else if (/\.(ts|tsx|js|cjs|mjs)$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

const stripComments = (s: string): string =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/.*$/gm,
      (m, p1) => p1 + ' '.repeat(m.length - p1.length)
    )

const scan = (allowed: string[]): string[] =>
  walk(SRC)
    .filter(f => !allowed.includes(f))
    .filter(f =>
      stripComments(fs.readFileSync(f, 'utf8')).includes(KIE_DEAD_STATUS_PATH)
    )
    .map(f => path.relative(SRC, f))

describe('kie.ai job status endpoint', () => {
  it('is not requested at the 404 path anywhere in src/', () => {
    expect(scan(ALLOWED)).toEqual([])
  })

  it('self-check: the scan reads a real corpus and can still see the path', () => {
    // A guard that passes because it looked at nothing is worse than none.
    // Un-exempt the documenting file and the same scan must find it -- which
    // proves both the file walk and the match still work.
    expect(walk(SRC).length).toBeGreaterThan(500)
    expect(scan([])).toEqual([path.join('config', 'kie-jobs.ts')])
  })

  it('points at recordInfo', () => {
    expect(KIE_JOBS.RECORD_INFO).toBe('/api/v1/jobs/recordInfo')
    expect(KIE_JOBS.CREATE_TASK).toBe('/api/v1/jobs/createTask')
  })
})

describe('readKieJobRecord', () => {
  it('reads the recordInfo shape: state plus a resultJson STRING', () => {
    const record = readKieJobRecord({
      state: 'success',
      resultJson:
        '{"resultUrls":["https://tempfile.aiquickdraw.com/images/a.png"]}',
      successFlag: 1,
    })
    expect(record.state).toBe('success')
    expect(record.urls).toEqual([
      'https://tempfile.aiquickdraw.com/images/a.png',
    ])
  })

  it('reads the webhook shape too: successFlag plus a resultUrls ARRAY', () => {
    const record = readKieJobRecord({
      successFlag: 1,
      resultUrls: ['https://tempfile.aiquickdraw.com/videos/b.mp4'],
    })
    expect(record.state).toBe('success')
    expect(record.urls[0]).toContain('b.mp4')
  })

  it('reports every running state as pending, not as failure', () => {
    for (const state of ['waiting', 'queuing', 'generating']) {
      const record = readKieJobRecord({ state, resultJson: null })
      expect(record.state).toBe('pending')
    }
  })

  it('reports fail with the provider reason', () => {
    const record = readKieJobRecord({
      state: 'fail',
      failMsg: 'content policy',
      resultJson: null,
    })
    expect(record.state).toBe('fail')
    expect(record.failMsg).toBe('content policy')
  })

  it('treats flagged-success-with-no-URL as still pending', () => {
    // This is the case that used to refund a job kie.ai had actually produced:
    // the flag flips a moment before the URL is attached.
    const record = readKieJobRecord({ state: 'success', resultJson: '{}' })
    expect(record.state).toBe('pending')
  })

  it('survives a resultJson that is not JSON', () => {
    const record = readKieJobRecord({ state: 'success', resultJson: 'oops' })
    expect(record.state).toBe('pending')
    expect(record.urls).toEqual([])
  })

  it('treats a policy rejection (successFlag 3) as failure', () => {
    const record = readKieJobRecord({ successFlag: 3, failMsg: 'rejected' })
    expect(record.state).toBe('fail')
  })

  it('does not throw on an empty or absent payload', () => {
    expect(readKieJobRecord(undefined).state).toBe('pending')
    expect(readKieJobRecord({}).state).toBe('pending')
  })
})
