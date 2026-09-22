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

/*
 * THE WHOLE DOCUMENT HAS ONE BUDGET, AND THE SERVER'S THREAD IS NOT SPENT ON IT.
 *
 * Review of 2026-09-22, measured on the first version: every member was
 * capped at 16 MB and nothing else, on the render server's one event loop. A
 * workbook naming one sheet many times inflated it every time (17 KB of file,
 * 20 s blocked; 45 KB, hours); a deck built every slide to keep 4000
 * characters; and a lazy `[\s\S]*?` hunting for a closing tag that is not
 * there rescanned the rest of the file from every opening tag -- 74 s for a
 * 1 KB workbook. Each case below took seconds to hours before; the deadline
 * is the vitest timeout, and the assertions say what was read and what not.
 */
describe('an office file is read on a budget', () => {
  const MB = 1024 * 1024

  it('stops reading a sheet once there is more text than will be shown', async () => {
    const { officeText } = await import('./src/agent/media-extract')
    const row = '<row r="1"><c r="A1" t="inlineStr"><is><t>x</t></is></c></row>'
    const sheet = `<worksheet><sheetData>${row.repeat(Math.floor((4 * MB) / row.length))}</sheetData></worksheet>`
    const names = Array.from(
      { length: 300 },
      (_, i) => `<sheet name="S${i}" sheetId="${i + 1}" r:id="rId1"/>`
    ).join('')
    const book = zipOf({
      'xl/workbook.xml': `<workbook><sheets>${names}</sheets></workbook>`,
      'xl/_rels/workbook.xml.rels':
        '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
      'xl/worksheets/sheet1.xml': sheet,
    })
    expect(book.length).toBeLessThan(64 * 1024)
    const started = Date.now()
    const got = officeText(book, 'xlsx')
    expect(Date.now() - started).toBeLessThan(3_000)
    expect(got).toMatchObject({ ok: true, more: true })
    if (!got.ok) return
    expect(got.text).toContain('— S0 —')
    expect(got.text).not.toContain('— S1 —')
  })

  it('reads a sheet the workbook names three hundred times once, and gets past it', async () => {
    const { officeText } = await import('./src/agent/media-extract')
    // Empty rows: no text to stop at, so only visiting it once keeps this fast.
    const blank = `<worksheet><sheetData>${'<row r="1"/>'.repeat(Math.floor((4 * MB) / 12))}</sheetData></worksheet>`
    const names =
      Array.from(
        { length: 300 },
        (_, i) => `<sheet name="S${i}" sheetId="${i + 1}" r:id="rId1"/>`
      ).join('') + '<sheet name="Итоги" sheetId="301" r:id="rId2"/>'
    const book = zipOf({
      'xl/workbook.xml': `<workbook><sheets>${names}</sheets></workbook>`,
      'xl/_rels/workbook.xml.rels':
        '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>',
      'xl/worksheets/sheet1.xml': blank,
      'xl/worksheets/sheet2.xml':
        '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Итого 12</t></is></c></row></sheetData></worksheet>',
    })
    const started = Date.now()
    const got = officeText(book, 'xlsx')
    expect(Date.now() - started).toBeLessThan(2_000)
    expect(got).toMatchObject({ ok: true })
    if (!got.ok) return
    expect(got.text).toContain('— Итоги —\nИтого 12')
    expect(got.text.match(/— S\d+ —/g)).toEqual(['— S0 —'])
  })

  it('inflates a member once however many roles the file gives it', async () => {
    const { officeText } = await import('./src/agent/media-extract')
    // The shared strings, 16 MB, also named as a sheet: half the budget each
    // time it is inflated, so a second inflate would leave none for the rest.
    const book = zipOf({
      'xl/sharedStrings.xml': `<sst>${' '.repeat(16 * 1024 * 1024 - 11)}</sst>`,
      'xl/workbook.xml':
        '<workbook><sheets><sheet name="A" r:id="rId1"/><sheet name="B" r:id="rId2"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels':
        '<Relationships><Relationship Id="rId1" Target="sharedStrings.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>',
      'xl/worksheets/sheet2.xml':
        '<worksheet><sheetData><row r="1"><c r="A1"><v>42</v></c></row></sheetData></worksheet>',
    })
    const got = officeText(book, 'xlsx')
    expect(got).toMatchObject({ ok: true })
    if (!got.ok) return
    expect(got.text).toContain('— B —\n42')
  })

  it('refuses a document whose members together inflate past the budget', async () => {
    const { officeText } = await import('./src/agent/media-extract')
    // Three sheets of blank space: no text to stop at, 36 MB between them.
    const blank = `<worksheet>${' '.repeat(12 * MB)}</worksheet>`
    const book = zipOf({
      'xl/worksheets/sheet1.xml': blank,
      'xl/worksheets/sheet2.xml': blank,
      'xl/worksheets/sheet3.xml': blank,
    })
    expect(book.length).toBeLessThan(200 * 1024)
    expect(officeText(book, 'xlsx')).toEqual({ ok: false, reason: 'too-big' })
  })

  it('stops reading a deck once there is more text than will be shown', async () => {
    const { officeText, DOCUMENT_TEXT_CAP } = await import(
      './src/agent/media-extract'
    )
    const slide = 'слово '.repeat(Math.floor(MB / 6))
    const got = officeText(pptxOf(Array(20).fill(slide)), 'pptx')
    expect(got).toMatchObject({ ok: true, more: true })
    if (!got.ok) return
    expect(got.text.length).toBe(DOCUMENT_TEXT_CAP)
    // Read to the cap from the first slide; the other nineteen never inflated.
    expect(got.chars).toBeLessThan(2 * MB)
  })

  it('visits at most fifty slides, and says the rest were not read', async () => {
    const { officeText } = await import('./src/agent/media-extract')
    const got = officeText(
      pptxOf(Array.from({ length: 60 }, (_, i) => `s${i + 1}`)),
      'pptx'
    )
    expect(got).toMatchObject({ ok: true, more: true })
    if (!got.ok) return
    expect(got.text).toContain('— slide 50 —\ns50')
    expect(got.text).not.toContain('s51')
  })

  it('does not rescan the file for a closing tag that is not there', async () => {
    const { officeText } = await import('./src/agent/media-extract')
    const cases: Array<[string, Buffer, string]> = [
      [
        'shared strings',
        zipOf({
          // A cell that asks for a string makes the table be looked through.
          'xl/sharedStrings.xml': '<sst>' + '<si>'.repeat(120_000),
          'xl/worksheets/sheet1.xml':
            '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>7</v></c></row></sheetData></worksheet>',
        }),
        'xlsx',
      ],
      [
        'cells',
        zipOf({
          'xl/worksheets/sheet1.xml':
            '<worksheet><sheetData><row r="1">' +
            '<c r="A1">'.repeat(60_000) +
            '</row></sheetData></worksheet>',
        }),
        'xlsx',
      ],
      [
        'a Word run',
        zipOf({ 'word/document.xml': '<w:t '.repeat(100_000) }),
        'docx',
      ],
      [
        'an OpenDocument body with no end',
        zipOf({ 'content.xml': '<office:body>'.repeat(40_000) }),
        'odt',
      ],
      [
        'an OpenDocument tag with no end',
        zipOf({
          'content.xml': `<office:body>${'<a'.repeat(100_000)}</office:body>`,
        }),
        'odt',
      ],
    ]
    for (const [what, bytes, ext] of cases) {
      const started = Date.now()
      officeText(bytes, ext)
      expect(`${what}: ${Date.now() - started < 2_000 ? 'fast' : 'slow'}`).toBe(
        `${what}: fast`
      )
    }
  })

  it('reads a directory of non-UTF-8 names fast, and at most ZIP_MAX_ENTRIES of it', async () => {
    const { readZipDirectory } = await import('./src/agent/media-extract')
    const { ZIP_MAX_ENTRIES } = await import('./src/agent/office-text')
    // Central directory records only: 60 000 names that are not UTF-8 (a
    // fatal decoder throws on each one), one of them a DOS-codepage word.
    const dos = Buffer.from([0x8f, 0xe0, 0xa8, 0xa2, 0xa5, 0xe2]) // a greeting in CP866
    const parts: Buffer[] = []
    for (let i = 0; i < 60_000; i += 1) {
      const name = i === 0 ? dos : Buffer.from([0xff, 0xfe, i & 0xff])
      const rec = Buffer.alloc(46)
      rec.writeUInt32LE(0x02014b50, 0)
      rec.writeUInt16LE(8, 10)
      rec.writeUInt16LE(name.length, 28)
      parts.push(rec, name)
    }
    const dir = Buffer.concat(parts)
    const end = Buffer.alloc(22)
    end.writeUInt32LE(0x06054b50, 0)
    end.writeUInt16LE(60_000, 8)
    end.writeUInt16LE(60_000, 10)
    end.writeUInt32LE(dir.length, 12)
    const started = Date.now()
    const got = readZipDirectory(Buffer.concat([dir, end]))
    expect(Date.now() - started).toBeLessThan(1_500)
    expect(got?.entries).toHaveLength(ZIP_MAX_ENTRIES)
    expect(got?.truncated).toBe(true)
    expect(got?.entries[0].name).toBe('Привет')
  })

  it('lists a zip it did not read to the end as "more than", not as a total', async () => {
    const { archiveListingFromFile } = await import('./src/agent/media-extract')
    const { ZIP_MAX_ENTRIES } = await import('./src/agent/office-text')
    const files: Record<string, string> = {}
    for (let i = 0; i < ZIP_MAX_ENTRIES + 50; i += 1) files[`f${i}.txt`] = 'x'
    const f = tmpFile('many.zip', zipOf(files, { store: true }))
    try {
      const got = await archiveListingFromFile(f.path, 'zip', 'many.zip')
      expect(got).toMatchObject({ ok: true, listing: true, more: true })
      if (!got.ok) return
      expect(got.text).toMatch(
        new RegExp(`^more than ${ZIP_MAX_ENTRIES} file\\(s\\)`)
      )
      expect(got.text).toContain(`and more than ${ZIP_MAX_ENTRIES - 60} more`)
    } finally {
      f.done()
    }
  })
})

/*
 * AND IT IS READ OFF THE EVENT LOOP. `readShelfExtracted` hands the bytes to
 * a worker thread through `officeTextIsolated`; these run the real worker
 * script, so a broken bootstrap fails here and not in production.
 */
describe('an office file is parsed in a thread of its own', () => {
  it('reads a .docx through the worker', async () => {
    const { officeTextIsolated } = await import('./src/agent/media-extract')
    const got = await officeTextIsolated(
      docxOf(['Акт сверки', 'Итого 5 000']),
      'docx'
    )
    expect(got).toMatchObject({ ok: true, text: 'Акт сверки\nИтого 5 000' })
  })

  it('turns a parse that outruns its deadline into too-big', async () => {
    const { officeTextIsolated } = await import('./src/agent/media-extract')
    // A deadline shorter than the thread's own start: nothing can answer.
    const got = await officeTextIsolated(docxOf(['x']), 'docx', 1)
    expect(got).toEqual({ ok: false, reason: 'too-big' })
    // And the reader is not left broken for the next file.
    expect(await officeTextIsolated(docxOf(['дальше']), 'docx')).toMatchObject({
      ok: true,
      text: 'дальше',
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

  it('parses at most ZIP_MAX_ENTRIES lines of a huge listing, and says there were more', async () => {
    const { ZIP_MAX_ENTRIES } = await import('./src/agent/office-text')
    // Names bsdtar escaped to octal, up to its 32 MB output ceiling: parsed
    // whole, this held the event loop for 1.7 s to show sixty names.
    const line = `-rw-r--r--  0 0      0          10 Sep 22 00:00 ${'\\320\\241'.repeat(20)}\n`
    const out = line.repeat(Math.floor((32 * 1024 * 1024) / line.length))
    vi.doMock('node:child_process', () => ({
      execFile: (_c: string, _a: string[], _o: unknown, cb: Function) =>
        cb(null, out, ''),
    }))
    const { archiveListingFromFile, parseBsdtarListing } = await import(
      './src/agent/media-extract'
    )
    expect(parseBsdtarListing(line.repeat(12), 5)).toHaveLength(5)
    const started = Date.now()
    const got = await archiveListingFromFile('/tmp/x.rar', 'rar', 'x.rar')
    expect(Date.now() - started).toBeLessThan(800)
    expect(got).toMatchObject({ ok: true, listing: true, more: true })
    if (got.ok)
      expect(got.text).toMatch(new RegExp(`^more than ${ZIP_MAX_ENTRIES} file`))
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
