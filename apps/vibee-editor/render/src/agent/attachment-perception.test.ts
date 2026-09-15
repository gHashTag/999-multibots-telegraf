/**
 * THE TWO SENSES THAT WERE MISSING, TESTED ON REAL BYTES.
 *
 * Deliberately NOT a mock of pdftotext and ffmpeg. The defect being fixed was
 * that `video` and `file` markers were dropped on the floor, and a test that
 * stubs the extractors proves only that the plumbing calls a stub. These tests
 * build a real one-page PDF and a real mp4 with a tone, run the real binaries,
 * and assert on what comes back -- which is also how the CI image finds out it
 * is missing poppler-utils.
 *
 * When a binary is absent the case SKIPS with a named reason rather than
 * passing quietly: a green run that silently tested nothing is the exact trap
 * the blind-guards skill is about.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { fetchableShelfUrl, perceiveAttachments } from './attachment-perception'

const SHELF = 'https://vibee-render-production.up.railway.app'

function has(bin: string, flag: string): boolean {
  try {
    execFileSync(bin, [flag], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}
const HAS_PDFTOTEXT = has('pdftotext', '-v')
const HAS_FFMPEG = has('ffmpeg', '-version')

let dir = ''
let pdfBytes = Buffer.alloc(0)
let mp4Bytes = Buffer.alloc(0)

beforeAll(async () => {
  process.env.PUBLIC_URL = SHELF
  dir = await mkdtemp(join(tmpdir(), 'perceive-test-'))

  // A minimal but REAL PDF: pdftotext has to parse it, not recognise a fixture.
  const body = 'Dogovor na 42000 rubley, srok 14 dney.'
  const content = `BT /F1 14 Tf 40 700 Td (${body}) Tj ET`
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let pdf = '%PDF-1.4\n'
  const offs: number[] = []
  objs.forEach((o, i) => {
    offs.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
  for (const o of offs) pdf += `${String(o).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  pdfBytes = Buffer.from(pdf, 'latin1')

  if (HAS_FFMPEG) {
    const out = join(dir, 'in.mp4')
    execFileSync(
      'ffmpeg',
      [
        '-nostdin',
        '-y',
        '-f',
        'lavfi',
        '-i',
        'testsrc=size=160x120:rate=10:duration=2',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=2',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-shortest',
        out,
      ],
      { stdio: 'ignore' }
    )
    mp4Bytes = await readFile(out)
  }
})

afterAll(async () => {
  await rm(dir, { recursive: true, force: true }).catch(() => undefined)
})

/** The shelf, faked at the fetch boundary: these tests are about extraction. */
function serve(map: Record<string, Buffer | string>, uploaded: string[] = []) {
  return vi.fn(
    async (input: unknown, init?: { headers?: Record<string, string> }) => {
      const url = String(input)
      if (url.endsWith('/upload')) {
        uploaded.push(String(init?.headers?.['X-Filename'] ?? ''))
        return new Response(
          JSON.stringify({ url: `${SHELF}/s3/derived.m4a` }),
          { status: 200 }
        )
      }
      const key = Object.keys(map).find(k => url.endsWith(k))
      if (!key) return new Response('no', { status: 404 })
      const v = map[key]
      return new Response(typeof v === 'string' ? v : new Uint8Array(v), {
        status: 200,
      })
    }
  )
}

const turn = (text: string) => [{ role: 'user', content: text }] as never

describe('the shelf boundary', () => {
  it('accepts only our own /s3/ links, whatever the marker claims', () => {
    expect(fetchableShelfUrl(`${SHELF}/s3/a.pdf`)).toContain('/s3/a.pdf')
    expect(fetchableShelfUrl('/s3/a.pdf')).toContain('/s3/a.pdf')
    // A marker line is text a PERSON wrote: untrusted by construction.
    expect(fetchableShelfUrl('https://evil.test/s3/a.pdf')).toBeNull()
    expect(fetchableShelfUrl(`${SHELF}/etc/passwd`)).toBeNull()
    expect(fetchableShelfUrl('')).toBeNull()
  })
})

describe('a document is read, not named', () => {
  it.skipIf(!HAS_PDFTOTEXT)('puts the PDF text into the turn', async () => {
    vi.stubGlobal('fetch', serve({ '/s3/dogovor.pdf': pdfBytes }))
    const out = await perceiveAttachments(
      turn(
        `посмотри\n[attached file: dogovor.pdf; mime=application/pdf; url=${SHELF}/s3/dogovor.pdf]`
      )
    )
    const text = String(out.messages[0].content)
    expect(text).toContain('42000')
    expect(text).toContain('14')
    expect(text).toContain('содержимое файла')
    vi.unstubAllGlobals()
  })

  it('reads a plain-text file with no binary at all', async () => {
    vi.stubGlobal('fetch', serve({ '/s3/notes.md': '# План\nдва пункта' }))
    const out = await perceiveAttachments(
      turn(
        `[attached file: notes.md; mime=text/markdown; url=${SHELF}/s3/notes.md]`
      )
    )
    expect(String(out.messages[0].content)).toContain('два пункта')
    vi.unstubAllGlobals()
  })

  it('says out loud when a format cannot be read, instead of staying silent', async () => {
    vi.stubGlobal('fetch', serve({}))
    const out = await perceiveAttachments(
      turn(
        `[attached file: sheet.xlsx; mime=application/vnd.ms-excel; url=${SHELF}/s3/sheet.xlsx]`
      )
    )
    const text = String(out.messages[0].content)
    expect(text).toContain('прочитать нечем')
    // The model is told to pass it on rather than invent an answer.
    expect(text).toContain('скажи об этом человеку')
    vi.unstubAllGlobals()
  })

  it('refuses a marker pointing off our shelf, without fetching it', async () => {
    const fetchMock = serve({})
    vi.stubGlobal('fetch', fetchMock)
    const out = await perceiveAttachments(
      turn(
        '[attached file: x.pdf; mime=application/pdf; url=https://evil.test/s3/x.pdf]'
      )
    )
    expect(String(out.messages[0].content)).toContain('не на нашей полке')
    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

describe('a video is heard', () => {
  it.skipIf(!HAS_FFMPEG)(
    're-attaches the soundtrack as an audio marker',
    async () => {
      const uploaded: string[] = []
      vi.stubGlobal('fetch', serve({ '/s3/clip.mp4': mp4Bytes }, uploaded))
      const out = await perceiveAttachments(
        turn(
          `что там\n[attached video: clip.mp4; mime=video/mp4; url=${SHELF}/s3/clip.mp4]`
        )
      )
      const text = String(out.messages[0].content)
      // The EXISTING audio path keys off exactly this marker shape.
      expect(text).toMatch(
        /\[attached audio: clip-audio\.m4a; mime=audio\/mp4; url=.+\]/
      )
      expect(text).toContain('звуковая дорожка')
      expect(uploaded.length).toBe(1)
      vi.unstubAllGlobals()
    }
  )

  it.skipIf(!HAS_FFMPEG)(
    'says there is nothing to hear in a silent video',
    async () => {
      const silent = join(dir, 'silent.mp4')
      execFileSync(
        'ffmpeg',
        [
          '-nostdin',
          '-y',
          '-f',
          'lavfi',
          '-i',
          'testsrc=size=160x120:rate=10:duration=1',
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          silent,
        ],
        { stdio: 'ignore' }
      )
      vi.stubGlobal(
        'fetch',
        serve({ '/s3/silent.mp4': await readFile(silent) })
      )
      const out = await perceiveAttachments(
        turn(
          `[attached video: silent.mp4; mime=video/mp4; url=${SHELF}/s3/silent.mp4]`
        )
      )
      expect(String(out.messages[0].content)).toContain('нет звуковой дорожки')
      vi.unstubAllGlobals()
    }
  )
})

describe('what it refuses to touch', () => {
  it('leaves a turn with no video or file markers exactly as it was', async () => {
    const fetchMock = serve({})
    vi.stubGlobal('fetch', fetchMock)
    const input = turn(
      `[attached image: a.jpg; mime=image/jpeg; url=${SHELF}/s3/a.jpg]`
    )
    const out = await perceiveAttachments(input)
    expect(out.messages).toBe(input)
    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('ignores anything that is not the last turn, and anything not from the person', async () => {
    const fetchMock = serve({})
    vi.stubGlobal('fetch', fetchMock)
    const msgs = [
      {
        role: 'user',
        content: `[attached file: old.txt; mime=text/plain; url=${SHELF}/s3/old.txt]`,
      },
      { role: 'assistant', content: 'ответ' },
    ] as never
    const out = await perceiveAttachments(msgs)
    expect(out.messages).toBe(msgs)
    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
