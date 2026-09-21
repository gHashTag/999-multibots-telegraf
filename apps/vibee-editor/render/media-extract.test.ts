import { describe, it, expect, vi, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  docxOf,
  odtOf,
  pdfOf,
  pptxOf,
  xlsxOf,
  zipOf,
} from './test-support/files'

/**
 * THE READERS, ON REAL BYTES.
 *
 * Owner, 2026-09-22: "I asked for support for reading ALL files." Every format
 * below used to be refused by name. Each case here builds the real format --
 * a zip with its central directory, the XML Word and Excel write, a PDF with
 * an xref table -- because a reader tested on an object shaped like the test's
 * idea of a file proves nothing about the file a person sends.
 *
 * Where a binary is needed (pdftotext, ffmpeg), the case runs it for real when
 * it is installed and is SKIPPED BY NAME when it is not; a second case stands
 * at the process boundary and reads the command line, so the contract with
 * the binary is checked on every machine.
 */

const has = (cmd: string, arg = '-v') => {
  try {
    execFileSync(cmd, [arg], { stdio: 'ignore' })
    return true
  } catch (e) {
    // pdftotext -v exits 0 on new poppler and 99 on old; only ENOENT is absent.
    return (e as NodeJS.ErrnoException).code !== 'ENOENT'
  }
}
const HAS_PDFTOTEXT = has('pdftotext')
const HAS_FFMPEG = has('ffmpeg', '-version')
const HAS_BSDTAR = has('bsdtar', '--version')

const tmpFile = (name: string, bytes: Buffer) => {
  const dir = mkdtempSync(join(tmpdir(), 'extract-test-'))
  const path = join(dir, name)
  writeFileSync(path, bytes)
  return { path, done: () => rmSync(dir, { recursive: true, force: true }) }
}

afterEach(() => {
  vi.doUnmock('node:child_process')
  vi.resetModules()
})

describe('office documents are read from their own XML', () => {
  it('reads a .docx paragraph by paragraph', async () => {
    const { officeText } = await import('./src/agent/media-extract')
    const got = officeText(
      docxOf(['Договор поставки № 7', 'Сумма: 120 000 & НДС']),
      'docx'
    )
    expect(got).toMatchObject({ ok: true, listing: false })
    if (!got.ok) return
    expect(got.text).toBe('Договор поставки № 7\nСумма: 120 000 & НДС')
  })

  it('reads a .xlsx sheet by name, row by row, shared strings resolved', async () => {
    const { officeText } = await import('./src/agent/media-extract')
    const got = officeText(
      xlsxOf('Смета', [
        ['Позиция', 'Цена'],
        ['Ролик', 4500],
      ]),
      'xlsx'
    )
    expect(got.ok).toBe(true)
    if (!got.ok) return
    expect(got.text).toContain('— Смета —')
    expect(got.text).toContain('Позиция\tЦена')
    expect(got.text).toContain('Ролик\t4500')
  })

  it('reads a .pptx slide by slide, in slide order', async () => {
    const { officeText } = await import('./src/agent/media-extract')
    const got = officeText(pptxOf(['Первый', 'Второй']), 'pptx')
    expect(got.ok).toBe(true)
    if (!got.ok) return
    expect(got.text.indexOf('Первый')).toBeLessThan(got.text.indexOf('Второй'))
    expect(got.text).toContain('slide 2')
  })

  it('reads an OpenDocument text', async () => {
    const { officeText } = await import('./src/agent/media-extract')
    const got = officeText(odtOf(['Строка один', 'Строка два']), 'odt')
    expect(got).toMatchObject({ ok: true, text: 'Строка один\nСтрока два' })
  })

  it('reads a Russian RTF in its own codepage, not as mojibake', async () => {
    const { officeText } = await import('./src/agent/media-extract')
    // A Russian greeting in windows-1251, as Word writes it with \ansicpg1251.
    const rtf = Buffer.from(
      "{\\rtf1\\ansi\\ansicpg1251{\\fonttbl{\\f0 Arial;}}\\f0 \\'cf\\'f0\\'e8\\'e2\\'e5\\'f2\\par world}",
      'latin1'
    )
    const got = officeText(rtf, 'rtf')
    expect(got).toMatchObject({ ok: true, text: 'Привет\nworld' })
  })

  it('caps the text and says how long the whole was', async () => {
    const { officeText, DOCUMENT_TEXT_CAP } = await import(
      './src/agent/media-extract'
    )
    const got = officeText(docxOf(['я'.repeat(DOCUMENT_TEXT_CAP * 3)]), 'docx')
    expect(got.ok).toBe(true)
    if (!got.ok) return
    expect(got.text.length).toBe(DOCUMENT_TEXT_CAP)
    expect(got.chars).toBe(DOCUMENT_TEXT_CAP * 3)
  })

  /*
   * A ZIP BOMB IS A REFUSAL, NOT AN OUTAGE. 17 MB of zeros deflates to a few
   * kilobytes; inflated without a ceiling it would be read whole.
   */
  it('refuses an entry that inflates past the ceiling', async () => {
    const { readZip } = await import('./src/agent/media-extract')
    const bomb = zipOf({ 'word/document.xml': Buffer.alloc(17 * 1024 * 1024) })
    expect(bomb.length).toBeLessThan(100_000)
    const [entry] = readZip(bomb) ?? []
    // Compared as a length: a 17 MB buffer in a failure diff is its own OOM.
    const out = entry.read()
    expect(out === null ? 'refused' : `${out.length} bytes inflated`).toBe(
      'refused'
    )
  })

  it('says a file that is not a zip is damaged, not empty', async () => {
    const { officeText } = await import('./src/agent/media-extract')
    expect(officeText(Buffer.from('not a zip at all'), 'docx')).toEqual({
      ok: false,
      reason: 'damaged',
    })
  })
})

describe('archives are listed, never unpacked', () => {
  it('lists a zip by name and size', async () => {
    const { archiveListingFromFile } = await import('./src/agent/media-extract')
    const f = tmpFile(
      'a.zip',
      zipOf({
        'brief.txt': 'x'.repeat(2048),
        'photos/': '',
        'photos/1.jpg': 'j',
      })
    )
    try {
      const got = await archiveListingFromFile(f.path, 'zip', 'a.zip')
      expect(got).toMatchObject({ ok: true, listing: true })
      if (!got.ok) return
      expect(got.text).toContain('2 file(s)')
      expect(got.text).toContain('brief.txt — 2.0 KB')
      expect(got.text).toContain('photos/1.jpg')
      // A directory is not a file.
      expect(got.text).not.toMatch(/^photos\/ /m)
    } finally {
      f.done()
    }
  })

  it('lists a rar through `bsdtar -tvf` and nothing else', async () => {
    const calls: Array<[string, string[]]> = []
    vi.doMock('node:child_process', () => ({
      execFile: (cmd: string, args: string[], _o: unknown, cb: Function) => {
        calls.push([cmd, args])
        cb(
          null,
          '-rw-r--r--  0 0      0        1536 Sep 22 00:00 plan.docx\n' +
            'drwxr-xr-x  0 0      0           0 Sep 22 00:00 photos\n',
          ''
        )
      },
    }))
    const { archiveListingFromFile } = await import('./src/agent/media-extract')
    const got = await archiveListingFromFile('/tmp/x.rar', 'rar', 'x.rar')
    expect(calls).toEqual([['bsdtar', ['-tvf', '/tmp/x.rar']]])
    expect(got).toMatchObject({ ok: true, listing: true })
    if (got.ok) expect(got.text).toContain('plan.docx — 1.5 KB')
  })

  /*
   * The listing is parsed out of `bsdtar -tv`'s `ls -l` lines, which is text
   * meant for eyes. So the parser is held to the binary's real output, not to
   * a line typed into a test.
   */
  it.skipIf(!HAS_BSDTAR)(
    'lists a real .tar.gz by the lines bsdtar actually prints [needs bsdtar]',
    async () => {
      const dir = mkdtempSync(join(tmpdir(), 'tar-test-'))
      try {
        writeFileSync(join(dir, 'notes.txt'), 'y'.repeat(3000))
        writeFileSync(join(dir, 'Смета 2026.csv'), 'a,b\n')
        const tgz = join(dir, 'pack.tar.gz')
        execFileSync('bsdtar', [
          '-czf',
          tgz,
          '-C',
          dir,
          'notes.txt',
          'Смета 2026.csv',
        ])
        const { archiveListingFromFile } = await import(
          './src/agent/media-extract'
        )
        const got = await archiveListingFromFile(tgz, 'tgz', 'pack.tar.gz')
        expect(got).toMatchObject({ ok: true, listing: true })
        if (!got.ok) return
        expect(got.text).toContain('2 file(s)')
        expect(got.text).toContain('notes.txt — 2.9 KB')
        expect(got.text).toContain('Смета 2026.csv — 4 B')
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }
  )

  it('says the lister is not installed rather than that the archive is empty', async () => {
    vi.doMock('node:child_process', () => ({
      execFile: (_c: string, _a: string[], _o: unknown, cb: Function) => {
        const e = Object.assign(new Error('spawn bsdtar ENOENT'), {
          code: 'ENOENT',
        })
        cb(e, '', '')
      },
    }))
    const { archiveListingFromFile } = await import('./src/agent/media-extract')
    expect(await archiveListingFromFile('/tmp/x.7z', '7z', 'x.7z')).toEqual({
      ok: false,
      reason: 'tool-missing',
    })
  })
})

describe('a PDF is read through pdftotext', () => {
  it.skipIf(!HAS_PDFTOTEXT)(
    'reads the text layer of a real PDF [needs pdftotext]',
    async () => {
      const { pdfTextFromFile } = await import('./src/agent/media-extract')
      const f = tmpFile('in.pdf', pdfOf('Invoice 4217 due Friday'))
      try {
        const got = await pdfTextFromFile(f.path)
        expect(got.ok).toBe(true)
        if (got.ok) expect(got.text).toContain('Invoice 4217 due Friday')
      } finally {
        f.done()
      }
    }
  )

  it.skipIf(!HAS_PDFTOTEXT)(
    'says a scan has no text layer instead of reading nothing [needs pdftotext]',
    async () => {
      const { pdfTextFromFile } = await import('./src/agent/media-extract')
      const f = tmpFile('scan.pdf', pdfOf(null))
      try {
        expect(await pdfTextFromFile(f.path)).toEqual({
          ok: false,
          reason: 'no-text',
        })
      } finally {
        f.done()
      }
    }
  )

  /* The contract with the binary, checked on every machine. */
  it('asks pdftotext for UTF-8 layout text of the first pages, to stdout', async () => {
    const calls: Array<[string, string[]]> = []
    vi.doMock('node:child_process', () => ({
      execFile: (cmd: string, args: string[], _o: unknown, cb: Function) => {
        calls.push([cmd, args])
        cb(null, 'Page one text\f', '')
      },
    }))
    const { pdfTextFromFile } = await import('./src/agent/media-extract')
    const got = await pdfTextFromFile('/tmp/in.pdf')
    expect(calls).toEqual([
      [
        'pdftotext',
        ['-layout', '-enc', 'UTF-8', '-l', '30', '/tmp/in.pdf', '-'],
      ],
    ])
    expect(got).toMatchObject({ ok: true, text: 'Page one text' })
  })

  it('tells a locked PDF from a damaged one', async () => {
    vi.doMock('node:child_process', () => ({
      execFile: (_c: string, _a: string[], _o: unknown, cb: Function) =>
        cb(
          Object.assign(new Error('exit 1'), { code: 1 }),
          '',
          'Command Line Error: Incorrect password\n'
        ),
    }))
    const { pdfTextFromFile } = await import('./src/agent/media-extract')
    expect(await pdfTextFromFile('/tmp/locked.pdf')).toEqual({
      ok: false,
      reason: 'encrypted',
    })
  })
})

describe('the soundtrack of a video too big for the transcriber', () => {
  it.skipIf(!HAS_FFMPEG)(
    'is taken out of a real mp4, and a silent one has none [needs ffmpeg]',
    async () => {
      const dir = mkdtempSync(join(tmpdir(), 'sound-test-'))
      try {
        const talking = join(dir, 'talking.mp4')
        const silent = join(dir, 'silent.mp4')
        const lavfi = ['-f', 'lavfi', '-i', 'color=c=black:s=64x64:d=1']
        execFileSync(
          'ffmpeg',
          [
            '-y',
            ...lavfi,
            '-f',
            'lavfi',
            '-i',
            'sine=frequency=440:duration=1',
            '-shortest',
            talking,
          ],
          { stdio: 'ignore' }
        )
        execFileSync('ffmpeg', ['-y', ...lavfi, silent], { stdio: 'ignore' })
        const { soundtrackFromFile } = await import('./src/agent/media-extract')
        const sound = await soundtrackFromFile(talking)
        expect(sound?.length ?? 0).toBeGreaterThan(0)
        expect(await soundtrackFromFile(silent)).toBeNull()
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }
  )

  it('asks ffmpeg for mono 16 kHz sound only, with a ceiling in seconds', async () => {
    const calls: Array<[string, string[]]> = []
    vi.doMock('node:child_process', () => ({
      execFile: (cmd: string, args: string[], _o: unknown, cb: Function) => {
        calls.push([cmd, args])
        writeFileSync(args[args.length - 1], Buffer.from('m4a'))
        cb(null, '', '')
      },
    }))
    const { soundtrackFromFile } = await import('./src/agent/media-extract')
    expect(String(await soundtrackFromFile('/tmp/big.mp4'))).toBe('m4a')
    const [cmd, args] = calls[0]
    expect(cmd).toBe('ffmpeg')
    expect(args.slice(0, 13)).toEqual([
      '-nostdin',
      '-y',
      '-i',
      '/tmp/big.mp4',
      '-vn',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-t',
      '600',
      '-c:a',
      'aac',
    ])
  })
})

describe('which reader a file goes to', () => {
  it('routes by extension, and by mime for a PDF with no name', async () => {
    const { documentFormat } = await import('./src/agent/media-extract')
    expect(documentFormat(null, 'Contract.PDF')).toBe('pdf')
    expect(documentFormat('application/pdf', 'file')).toBe('pdf')
    expect(documentFormat(null, 'deck.pptx')).toBe('office')
    expect(documentFormat(null, 'backup.tar.gz')).toBe('archive')
    expect(documentFormat(null, 'old.doc')).toBeNull()
    expect(documentFormat(null, 'noise.bin')).toBeNull()
  })

  it('never inflates a stored entry past the ceiling either', async () => {
    const { readZip } = await import('./src/agent/media-extract')
    const big = zipOf(
      { 'a.txt': Buffer.alloc(17 * 1024 * 1024) },
      { store: true }
    )
    const out = readZip(big)?.[0].read()
    expect(out === null ? 'refused' : `${out?.length} bytes`).toBe('refused')
    const small = zipOf({ 'a.txt': 'hello' }, { store: true })
    expect(String(readZip(small)?.[0].read())).toBe('hello')
  })
})
