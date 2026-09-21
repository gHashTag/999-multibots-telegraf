/**
 * THE FILES THAT ARE NOT PLAIN TEXT, OPENED -- OR NAMED AS NOT OPENED.
 *
 * Owner, 2026-09-22: "I asked for support for reading ALL files." Until this
 * module the agent read photos, voice notes and a list of plain-text formats,
 * and refused the rest by name: a PDF, a .docx, a spreadsheet, an archive all
 * came back as "this format cannot be opened here". A person who sends a
 * contract as a PDF -- the ordinary case -- got an agent that could not read
 * it.
 *
 * What is here, and how each is read:
 *
 *   PDF          `pdftotext` (poppler-utils), ported from #2414 commit
 *                12f09b597. A scan with no text layer yields nothing, and that
 *                is SAID -- it is not a document with no words in it.
 *   .docx .xlsx  the zip is opened here and its XML read directly: these
 *   .pptx .odt   formats are zipped XML, Node ships the inflater, and a
 *   .ods .odp    parser dependency for that would be megabytes to do forty
 *                lines of work.
 *   .rtf         a small control-word reader; the codepage is honoured, so a
 *                Russian RTF is Russian and not mojibake.
 *   archives     LISTED, NEVER UNPACKED: names and sizes. A zip is read here;
 *                rar, 7z and tar go through `bsdtar -t` (libarchive-tools),
 *                which lists without extracting anything.
 *   video sound  `ffmpeg` pulls the soundtrack out of a video too big for the
 *                transcriber (#2414's `videoAudio`, kept only as that
 *                fallback: the transcriber opens an mp4 itself).
 *
 * WHY SUBPROCESSES FOR PDF AND ARCHIVES. Two mature binaries, one apt line,
 * and a subprocess with a timeout is a sandbox a library call is not. Every
 * binary spawned here is named in `EXTERNAL_TOOLS` with its Debian package, and
 * a test holds the render Dockerfile to that list -- a reader whose binary is
 * missing from the image would refuse every file in production while passing
 * every test on a laptop that happens to have it.
 *
 * WHAT THIS NEVER DOES. It never fetches a URL: bytes come from OUR bucket by
 * key (`withShelfFile`), so a marker line pasted by a person cannot aim this
 * server anywhere. It never unpacks an archive. It never returns more than it
 * was asked for: every read is capped in bytes on the wire and in characters
 * on the way out, and every inflate is capped in output so a zip bomb is a
 * refusal, not an outage.
 */

import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inflateRawSync } from 'node:zlib'
import { shelfObject } from './media-parts'
import { s3GetToFile } from '../lib/s3-put'

/* ── the lists: one statement of what opens ─────────────────────────────── */

/** Read with `pdftotext`. */
export const PDF_EXTENSIONS: readonly string[] = ['pdf']
/** Zipped XML (Office Open XML, OpenDocument) and RTF, read here. */
export const OFFICE_EXTENSIONS: readonly string[] = [
  'docx',
  'xlsx',
  'pptx',
  'odt',
  'ods',
  'odp',
  'rtf',
]
/** Listed by name and size, never unpacked. */
export const ARCHIVE_EXTENSIONS: readonly string[] = [
  'zip',
  'rar',
  '7z',
  'tar',
  'tgz',
  'gz',
]
/**
 * Formats named often enough to deserve being named back, and still not read:
 * the legacy binary Office formats need a converter this image does not have,
 * Apple's are packages of their own, and an .epub is a book, not a message.
 */
export const UNREADABLE_EXTENSIONS: readonly string[] = [
  'doc',
  'xls',
  'ppt',
  'pages',
  'numbers',
  'key',
  'epub',
]

/**
 * Every binary this module spawns, with the Debian package that provides it.
 * `dockerfile-has-the-readers.test.ts` holds the render image to this list.
 */
export const EXTERNAL_TOOLS: Readonly<Record<string, string>> = {
  pdftotext: 'poppler-utils',
  bsdtar: 'libarchive-tools',
  ffmpeg: 'ffmpeg',
}

export type DocumentFormat = 'pdf' | 'office' | 'archive'

/** The lower-case extension of a name, `tar.gz` folded into `tgz`. */
export function extensionOf(name: string | null | undefined): string {
  const lower = String(name ?? '')
    .trim()
    .toLowerCase()
  if (lower.endsWith('.tar.gz')) return 'tgz'
  const dot = lower.lastIndexOf('.')
  return dot >= 0 ? lower.slice(dot + 1) : ''
}

/** Which reader opens this file, or null when none here does. */
export function documentFormat(
  mime: string | null | undefined,
  name: string | null | undefined
): DocumentFormat | null {
  const ext = extensionOf(name)
  if (PDF_EXTENSIONS.includes(ext) || /^application\/pdf$/i.test(String(mime)))
    return 'pdf'
  if (OFFICE_EXTENSIONS.includes(ext)) return 'office'
  if (ARCHIVE_EXTENSIONS.includes(ext)) return 'archive'
  return null
}

/* ── results ────────────────────────────────────────────────────────────── */

export type ExtractFailure =
  /** A PDF with no text layer: a scan, or pictures of pages. */
  | 'no-text'
  | 'encrypted'
  | 'too-big'
  | 'damaged'
  /** The binary is not installed. Transient: the next deploy brings it. */
  | 'tool-missing'
  | 'missing'

export type Extracted =
  | {
      ok: true
      text: string
      /** How many characters the whole document had, before the cap. */
      chars: number
      /** An archive: `text` is its table of contents, nothing was unpacked. */
      listing: boolean
    }
  | { ok: false; reason: ExtractFailure }

/**
 * Bytes a document may have before it is refused unread. The Bot API's own
 * download ceiling: nothing larger reaches us from Telegram, and the mini app's
 * 100 MB is for video, not for a spreadsheet.
 */
export const DOCUMENT_MAX_BYTES = 20 * 1024 * 1024
/** The same character cap every other document read here has. */
export const DOCUMENT_TEXT_CAP = 4000
/** A long PDF is read from its start; page 300 is not worth a minute of CPU. */
const PDF_MAX_PAGES = 30
/** Seconds a reader may take before it is killed. */
const TOOL_TIMEOUT_MS = 60_000
/** One member of a zip is never inflated past this: the zip-bomb ceiling. */
const ZIP_ENTRY_MAX_BYTES = 16 * 1024 * 1024
/** An archive listing names this many entries and counts the rest. */
const LISTING_MAX_ENTRIES = 60

const ok = (full: string, listing = false): Extracted => {
  const text = full.trim()
  if (!text) return { ok: false, reason: listing ? 'damaged' : 'no-text' }
  return {
    ok: true,
    text: text.slice(0, DOCUMENT_TEXT_CAP),
    chars: text.length,
    listing,
  }
}

/* ── the process boundary ───────────────────────────────────────────────── */

interface ToolError {
  missing: boolean
  stderr: string
}

/**
 * Run one binary. The single place this module crosses into a subprocess, so
 * a test can stand at exactly this boundary and read the command line.
 */
function runTool(
  cmd: string,
  args: string[],
  timeoutMs: number,
  encoding: 'utf8' | 'buffer' = 'utf8'
): Promise<{ stdout: string | Buffer }> {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      {
        timeout: timeoutMs,
        maxBuffer: 32 * 1024 * 1024,
        encoding: encoding === 'buffer' ? 'buffer' : 'utf8',
      },
      (error, stdout, stderr) => {
        if (error) {
          const code = (error as NodeJS.ErrnoException).code
          const e: ToolError = {
            missing: code === 'ENOENT',
            stderr: String(stderr ?? ''),
          }
          reject(e)
          return
        }
        resolve({ stdout })
      }
    )
  })
}

const failureOf = (e: unknown): ExtractFailure => {
  const t = e as Partial<ToolError> | undefined
  if (t?.missing) return 'tool-missing'
  if (/password|encrypt/i.test(String(t?.stderr ?? ''))) return 'encrypted'
  return 'damaged'
}

/* ── PDF ────────────────────────────────────────────────────────────────── */

/**
 * `pdftotext -layout` keeps columns and tables readable instead of
 * interleaving them (#2414). The long runs of spaces it pads a table with are
 * folded afterwards: they carry the alignment and spend the character budget
 * that should carry the words.
 */
export async function pdfTextFromFile(
  path: string,
  timeoutMs = TOOL_TIMEOUT_MS
): Promise<Extracted> {
  try {
    const { stdout } = await runTool(
      'pdftotext',
      ['-layout', '-enc', 'UTF-8', '-l', String(PDF_MAX_PAGES), path, '-'],
      timeoutMs
    )
    const text = String(stdout)
      .replace(/\f/g, '\n')
      .replace(/[ \t]{3,}/g, '  ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
    return ok(text)
  } catch (e) {
    return { ok: false, reason: failureOf(e) }
  }
}

/* ── zip, read here ─────────────────────────────────────────────────────── */

interface ZipEntry {
  name: string
  size: number
  directory: boolean
  read(): Buffer | null
}

const u16 = (b: Buffer, at: number) => b.readUInt16LE(at)
const u32 = (b: Buffer, at: number) => b.readUInt32LE(at)
const u64 = (b: Buffer, at: number) => Number(b.readBigUInt64LE(at))

function zipName(raw: Buffer, utf8Flag: boolean): string {
  if (utf8Flag) return raw.toString('utf8')
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(raw)
  } catch {
    /* Windows archivers write Cyrillic names in the DOS codepage. */
    return new TextDecoder('ibm866').decode(raw)
  }
}

/**
 * The central directory of a zip, or null when the bytes are not one.
 *
 * Reads the directory at the END of the file, which is the authoritative list:
 * local headers can lie (streamed zips leave their sizes zero). ZIP64 is
 * followed for the sizes and offsets that overflow 32 bits.
 */
export function readZip(bytes: Buffer): ZipEntry[] | null {
  const min = 22
  if (bytes.length < min) return null
  let eocd = -1
  for (
    let i = bytes.length - min;
    i >= Math.max(0, bytes.length - min - 0xffff);
    i -= 1
  ) {
    if (u32(bytes, i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) return null
  let count = u16(bytes, eocd + 10)
  let dirOffset = u32(bytes, eocd + 16)
  if (dirOffset === 0xffffffff || count === 0xffff) {
    const locator = eocd - 20
    if (locator < 0 || u32(bytes, locator) !== 0x07064b50) return null
    const z64 = u64(bytes, locator + 8)
    if (z64 + 56 > bytes.length || u32(bytes, z64) !== 0x06064b50) return null
    count = u64(bytes, z64 + 32)
    dirOffset = u64(bytes, z64 + 48)
  }
  const entries: ZipEntry[] = []
  let at = dirOffset
  for (let n = 0; n < count && at + 46 <= bytes.length; n += 1) {
    if (u32(bytes, at) !== 0x02014b50) return entries.length ? entries : null
    const flags = u16(bytes, at + 8)
    const method = u16(bytes, at + 10)
    let packed = u32(bytes, at + 20)
    let size = u32(bytes, at + 24)
    const nameLen = u16(bytes, at + 28)
    const extraLen = u16(bytes, at + 30)
    const commentLen = u16(bytes, at + 32)
    let local = u32(bytes, at + 42)
    const name = zipName(
      bytes.subarray(at + 46, at + 46 + nameLen),
      (flags & 0x800) !== 0
    )
    // The ZIP64 extra field carries whichever of the three overflowed, in order.
    let x = at + 46 + nameLen
    const xEnd = x + extraLen
    while (x + 4 <= xEnd) {
      const id = u16(bytes, x)
      const len = u16(bytes, x + 2)
      if (id === 0x0001) {
        let p = x + 4
        if (size === 0xffffffff && p + 8 <= x + 4 + len)
          ((size = u64(bytes, p)), (p += 8))
        if (packed === 0xffffffff && p + 8 <= x + 4 + len)
          ((packed = u64(bytes, p)), (p += 8))
        if (local === 0xffffffff && p + 8 <= x + 4 + len) local = u64(bytes, p)
      }
      x += 4 + len
    }
    at = xEnd + commentLen
    const encrypted = (flags & 0x1) !== 0
    entries.push({
      name,
      size,
      directory: name.endsWith('/'),
      read: () => {
        if (encrypted || local + 30 > bytes.length) return null
        if (u32(bytes, local) !== 0x04034b50) return null
        const start =
          local + 30 + u16(bytes, local + 26) + u16(bytes, local + 28)
        const data = bytes.subarray(start, start + packed)
        try {
          if (method === 0)
            return size > ZIP_ENTRY_MAX_BYTES ? null : Buffer.from(data)
          if (method === 8)
            return inflateRawSync(data, {
              maxOutputLength: ZIP_ENTRY_MAX_BYTES,
            })
        } catch {
          /* over the ceiling, or not deflate after all */
        }
        return null
      },
    })
  }
  return entries
}

/* ── the XML inside Office and OpenDocument files ───────────────────────── */

const ENTITIES: Record<string, string> = {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
}

export function xmlDecode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e: string) => {
    if (e[0] === '#') {
      const code =
        e[1] === 'x' || e[1] === 'X'
          ? parseInt(e.slice(2), 16)
          : parseInt(e.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : ''
    }
    return ENTITIES[e.toLowerCase()] ?? all
  })
}

/** Lines trimmed, blank runs folded: layout is noise, the words are the point. */
function tidy(text: string): string {
  return text
    .split('\n')
    .map(l => l.replace(/[\t ]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function entryText(entries: ZipEntry[], name: string): string | null {
  const e = entries.find(x => x.name === name)
  const b = e?.read()
  return b ? b.toString('utf8') : null
}

const byNumber = (a: string, b: string) =>
  Number(/(\d+)\.xml$/.exec(a)?.[1] ?? 0) -
  Number(/(\d+)\.xml$/.exec(b)?.[1] ?? 0)

function docxText(entries: ZipEntry[]): string | null {
  const xml = entryText(entries, 'word/document.xml')
  if (xml === null) return null
  let out = ''
  const re =
    /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\b[^>]*\/>|<\/w:tc>|<\/w:p>/g
  for (const m of xml.matchAll(re)) {
    if (m[1] !== undefined) out += xmlDecode(m[1])
    else if (m[0] === '<w:tab/>' || m[0] === '</w:tc>') out += '\t'
    else out += '\n'
  }
  return tidy(out)
}

function pptxText(entries: ZipEntry[]): string | null {
  const slides = entries
    .map(e => e.name)
    .filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort(byNumber)
  if (!slides.length) return null
  const parts: string[] = []
  slides.forEach((name, i) => {
    const xml = entryText(entries, name) ?? ''
    let out = ''
    for (const m of xml.matchAll(/<a:t>([^<]*)<\/a:t>|<a:br\/>|<\/a:p>/g)) {
      out += m[1] !== undefined ? xmlDecode(m[1]) : '\n'
    }
    parts.push(`— slide ${i + 1} —\n${tidy(out)}`)
  })
  return parts.join('\n\n')
}

/** `C5` -> 2. Capped so one cell at XFD1 cannot spend the budget on tabs. */
function columnOf(ref: string): number {
  const letters = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? ''
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return Math.min(Math.max(0, n - 1), 50)
}

function xlsxText(entries: ZipEntry[]): string | null {
  const shared: string[] = []
  const sst = entryText(entries, 'xl/sharedStrings.xml') ?? ''
  for (const si of sst.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    let s = ''
    for (const t of si[1].matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)) s += t[1]
    shared.push(xmlDecode(s))
  }
  // Sheets in the workbook's own order, with the names people gave them.
  const rels = new Map<string, string>()
  const relXml = entryText(entries, 'xl/_rels/workbook.xml.rels') ?? ''
  for (const r of relXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /\bId="([^"]+)"/.exec(r[0])?.[1]
    const target = /\bTarget="([^"]+)"/.exec(r[0])?.[1]
    if (id && target) rels.set(id, target.replace(/^\/?(xl\/)?/, 'xl/'))
  }
  const sheets: Array<{ name: string; path: string }> = []
  const book = entryText(entries, 'xl/workbook.xml') ?? ''
  for (const s of book.matchAll(/<sheet\b[^>]*>/g)) {
    const name = /\bname="([^"]*)"/.exec(s[0])?.[1] ?? ''
    const rid = /\br:id="([^"]+)"/.exec(s[0])?.[1] ?? ''
    const path = rels.get(rid)
    if (path) sheets.push({ name: xmlDecode(name), path })
  }
  if (!sheets.length) {
    entries
      .map(e => e.name)
      .filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
      .sort(byNumber)
      .forEach((path, i) => sheets.push({ name: `Sheet${i + 1}`, path }))
  }
  if (!sheets.length) return null
  const parts: string[] = []
  for (const sheet of sheets) {
    const xml = entryText(entries, sheet.path)
    if (xml === null) continue
    const rows: string[] = []
    for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: string[] = []
      for (const c of row[1].matchAll(
        /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g
      )) {
        const attrs = c[1]
        const inner = c[2] ?? ''
        const ref = /\br="([A-Z]+)\d+"/i.exec(attrs)?.[1] ?? ''
        const type = /\bt="([^"]+)"/.exec(attrs)?.[1] ?? ''
        const v = /<v>([^<]*)<\/v>/.exec(inner)?.[1]
        let value = ''
        if (type === 's' && v !== undefined) value = shared[Number(v)] ?? ''
        else if (type === 'inlineStr') {
          for (const t of inner.matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g))
            value += xmlDecode(t[1])
        } else if (v !== undefined) value = xmlDecode(v)
        const col = ref ? columnOf(ref) : cells.length
        while (cells.length < col) cells.push('')
        cells[col] = value.replace(/[\t\n]+/g, ' ')
      }
      const line = cells.join('\t').replace(/\t+$/, '')
      if (line.trim()) rows.push(line)
    }
    parts.push(`— ${sheet.name || 'sheet'} —\n${rows.join('\n')}`)
  }
  return parts.join('\n\n')
}

/** OpenDocument: one `content.xml` for text, spreadsheet and presentation. */
function odfText(entries: ZipEntry[]): string | null {
  const xml = entryText(entries, 'content.xml')
  if (xml === null) return null
  const body = /<office:body>([\s\S]*)<\/office:body>/.exec(xml)?.[1] ?? xml
  const text = body
    // A spreadsheet cell holds a paragraph; its end is the cell's, not a line's.
    .replace(/<\/text:p>\s*<\/table:table-cell>/g, '</table:table-cell>')
    .replace(/<text:s\s+text:c="(\d+)"\s*\/>/g, (_, n: string) =>
      ' '.repeat(Math.min(Number(n), 8))
    )
    .replace(/<text:s\s*\/>/g, ' ')
    .replace(/<text:tab\s*\/>/g, '\t')
    .replace(/<text:line-break\s*\/>/g, '\n')
    .replace(/<\/table:table-cell>/g, '\t')
    .replace(/<\/(text:p|text:h|table:table-row)>/g, '\n')
    .replace(/<draw:page\b[^>]*>/g, '\n')
    .replace(/<[^>]+>/g, '')
  return tidy(xmlDecode(text))
}

/* ── RTF ────────────────────────────────────────────────────────────────── */

const RTF_SKIP = new Set([
  'fonttbl',
  'colortbl',
  'stylesheet',
  'info',
  'pict',
  'object',
  'header',
  'footer',
  'headerl',
  'headerr',
  'footerl',
  'footerr',
  'listtable',
  'listoverridetable',
  'rsidtbl',
  'themedata',
  'colorschememapping',
  'datastore',
  'latentstyles',
  'generator',
  'xmlnstbl',
  'fldinst',
])

/**
 * The words of an RTF document. `\'hh` escapes are bytes in the document's
 * own codepage (`\ansicpg1251` for a Russian Word file), collected and
 * decoded together so a two-byte character is not split; `\uN` is Unicode
 * with a fallback that is skipped. Groups that are not text -- the font table,
 * pictures, anything marked `\*` -- are skipped whole.
 */
export function rtfText(bytes: Buffer): string | null {
  const src = bytes.toString('latin1')
  if (!src.startsWith('{\\rtf')) return null
  let codepage = 1252
  const decoderFor = (cp: number) => {
    try {
      return new TextDecoder(`windows-${cp}`)
    } catch {
      return new TextDecoder('latin1')
    }
  }
  let out = ''
  let pending: number[] = []
  const flush = () => {
    if (!pending.length) return
    out += decoderFor(codepage).decode(Uint8Array.from(pending))
    pending = []
  }
  const stack: Array<{ skip: boolean; uc: number }> = []
  let skip = false
  let uc = 1
  let toSkip = 0
  let i = 0
  const emit = (s: string) => {
    if (skip) return
    if (toSkip > 0) {
      toSkip -= 1
      return
    }
    flush()
    out += s
  }
  while (i < src.length) {
    const ch = src[i]
    if (ch === '{') {
      stack.push({ skip, uc })
      i += 1
      continue
    }
    if (ch === '}') {
      const top = stack.pop()
      if (top) ({ skip, uc } = top)
      i += 1
      continue
    }
    if (ch === '\r' || ch === '\n') {
      i += 1
      continue
    }
    if (ch !== '\\') {
      emit(ch)
      i += 1
      continue
    }
    const next = src[i + 1] ?? ''
    if (next === "'") {
      const hex = src.slice(i + 2, i + 4)
      i += 4
      if (skip) continue
      if (toSkip > 0) {
        toSkip -= 1
        continue
      }
      const b = parseInt(hex, 16)
      if (Number.isFinite(b)) pending.push(b)
      continue
    }
    if (next === '*') {
      skip = true
      i += 2
      continue
    }
    if (!/[a-z]/i.test(next)) {
      // A control symbol: an escaped brace or backslash, or a special space.
      if (next === '\\' || next === '{' || next === '}') emit(next)
      else if (next === '~') emit(' ')
      else if (next === '_') emit('-')
      else if (next === '\n' || next === '\r') emit('\n')
      i += 2
      continue
    }
    const m = /^([a-z]+)(-?\d+)? ?/i.exec(src.slice(i + 1, i + 40))
    const word = m?.[1] ?? ''
    const arg = m?.[2] !== undefined ? Number(m[2]) : null
    i += 1 + (m?.[0].length ?? 1)
    if (RTF_SKIP.has(word)) skip = true
    else if (word === 'ansicpg' && arg) codepage = arg
    else if (word === 'uc' && arg !== null) uc = arg
    else if (word === 'u' && arg !== null) {
      emit(String.fromCharCode(arg < 0 ? arg + 65536 : arg))
      toSkip = uc
    } else if (
      word === 'par' ||
      word === 'line' ||
      word === 'sect' ||
      word === 'page'
    )
      emit('\n')
    else if (word === 'tab' || word === 'cell') emit('\t')
    else if (word === 'row') emit('\n')
  }
  flush()
  return tidy(out)
}

/** Text out of a Word, Excel, PowerPoint, OpenDocument or RTF file. */
export function officeText(bytes: Buffer, ext: string): Extracted {
  if (ext === 'rtf') {
    const text = rtfText(bytes)
    return text === null ? { ok: false, reason: 'damaged' } : ok(text)
  }
  const entries = readZip(bytes)
  if (!entries) return { ok: false, reason: 'damaged' }
  if (entries.some(e => e.name === 'EncryptedPackage'))
    return { ok: false, reason: 'encrypted' }
  const text =
    ext === 'docx'
      ? docxText(entries)
      : ext === 'xlsx'
        ? xlsxText(entries)
        : ext === 'pptx'
          ? pptxText(entries)
          : odfText(entries)
  return text === null ? { ok: false, reason: 'damaged' } : ok(text)
}

/* ── archives: listed, never unpacked ───────────────────────────────────── */

export function humanBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '?'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`
}

function listing(files: Array<{ name: string; size: number }>): Extracted {
  if (!files.length) return { ok: false, reason: 'damaged' }
  const total = files.reduce(
    (n, f) => n + (Number.isFinite(f.size) ? f.size : 0),
    0
  )
  const shown = files.slice(0, LISTING_MAX_ENTRIES)
  const lines = [
    `${files.length} file(s), ${humanBytes(total)} unpacked:`,
    ...shown.map(f => `${f.name} — ${humanBytes(f.size)}`),
  ]
  if (files.length > shown.length)
    lines.push(`… and ${files.length - shown.length} more`)
  return ok(lines.join('\n'), true)
}

/** A lone `.gz`: the name in its header and the size in its trailer. */
function gzipListing(bytes: Buffer, fallbackName: string): Extracted {
  if (bytes.length < 18 || bytes[0] !== 0x1f || bytes[1] !== 0x8b)
    return { ok: false, reason: 'damaged' }
  const flags = bytes[3]
  let name = fallbackName.replace(/\.gz$/i, '')
  if (flags & 0x08) {
    let at = 10
    if (flags & 0x04) at += 2 + u16(bytes, 10)
    const end = bytes.indexOf(0, at)
    if (end > at) name = bytes.subarray(at, end).toString('latin1')
  }
  return listing([{ name, size: u32(bytes, bytes.length - 4) }])
}

/**
 * A name as bsdtar prints it outside a UTF-8 locale: every byte that is not
 * printable ASCII becomes `\ooo`. Found by the real-archive test -- a Russian
 * file name came back as `\320\241\320\274...` -- so the octal is turned back
 * into bytes and the bytes into UTF-8, whatever locale the server has.
 */
function unescapeOctal(name: string): string {
  if (!name.includes('\\')) return name
  const bytes: number[] = []
  for (let i = 0; i < name.length; i += 1) {
    const oct = /^\\([0-7]{3})/.exec(name.slice(i, i + 4))
    if (oct) {
      bytes.push(parseInt(oct[1], 8))
      i += 3
    } else if (name.startsWith('\\\\', i)) {
      bytes.push(0x5c)
      i += 1
    } else {
      const cp = name.codePointAt(i) ?? 0
      bytes.push(...Buffer.from(String.fromCodePoint(cp), 'utf8'))
      if (cp > 0xffff) i += 1
    }
  }
  return Buffer.from(bytes).toString('utf8')
}

/**
 * `bsdtar -tvf` prints an `ls -l` line per entry; the size is the fifth
 * column and the name is everything after the date.
 */
export function parseBsdtarListing(
  out: string
): Array<{ name: string; size: number }> {
  const files: Array<{ name: string; size: number }> = []
  for (const line of out.split('\n')) {
    const m =
      /^([dlrwxsStT-]{10})\s+\d+\s+\S+\s+\S+\s+(\d+)\s+\S+\s+\d+\s+[\d:]+\s+(.+)$/.exec(
        line.trim()
      )
    if (!m || m[1][0] === 'd') continue
    files.push({ name: unescapeOctal(m[3]), size: Number(m[2]) })
  }
  return files
}

export async function archiveListingFromFile(
  path: string,
  ext: string,
  name: string,
  timeoutMs = TOOL_TIMEOUT_MS
): Promise<Extracted> {
  if (ext === 'zip') {
    const entries = readZip(await readFile(path))
    if (!entries) return { ok: false, reason: 'damaged' }
    return listing(
      entries
        .filter(e => !e.directory)
        .map(e => ({ name: e.name, size: e.size }))
    )
  }
  // A lone `.gz` is one compressed file; `.tar.gz` arrives here as `tgz`.
  if (ext === 'gz') return gzipListing(await readFile(path), name)
  try {
    const { stdout } = await runTool('bsdtar', ['-tvf', path], timeoutMs)
    return listing(parseBsdtarListing(String(stdout)))
  } catch (e) {
    return { ok: false, reason: failureOf(e) }
  }
}

/* ── video: the soundtrack, for a file too big for the transcriber ───────── */

/**
 * The soundtrack as m4a, or null when the video has none (#2414 `videoAudio`).
 *
 * `-vn` drops the picture; mono at 16 kHz is what speech recognition wants and
 * a fraction of the bytes; `-t` is a ceiling in seconds, so a two-hour film
 * cannot become a two-hour transcription bill. ffmpeg exits non-zero on a
 * video with no audio stream, which is the honest answer: nothing to hear.
 */
export async function soundtrackFromFile(
  path: string,
  timeoutMs = TOOL_TIMEOUT_MS,
  maxSeconds = 600
): Promise<Buffer | null> {
  const dir = await mkdtemp(join(tmpdir(), 'sound-'))
  const out = join(dir, 'sound.m4a')
  try {
    await runTool(
      'ffmpeg',
      [
        '-nostdin',
        '-y',
        '-i',
        path,
        '-vn',
        '-ac',
        '1',
        '-ar',
        '16000',
        '-t',
        String(maxSeconds),
        '-c:a',
        'aac',
        '-b:a',
        '64k',
        out,
      ],
      timeoutMs
    )
    const audio = await readFile(out)
    return audio.length ? audio : null
  } catch {
    return null
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

/* ── from the shelf ─────────────────────────────────────────────────────── */

/**
 * Put one shelf object in a private temporary file, hand it to `use`, and
 * remove it -- whatever `use` does. Straight out of the bucket by key: the
 * `/s3/` route would run a video or a PDF through its ffmpeg transcode branch
 * (see `s3GetBytes`), and a URL would be a thing a pasted marker could aim.
 */
export async function withShelfFile<T>(
  url: string,
  maxBytes: number,
  use: (path: string, size: number) => Promise<T>
): Promise<T | 'missing' | 'too-big'> {
  const found = shelfObject(url)
  if (!found) return 'missing'
  const ext = extensionOf(found.key)
  const dir = await mkdtemp(join(tmpdir(), 'shelf-'))
  const path = join(dir, ext ? `file.${ext}` : 'file')
  try {
    const size = await s3GetToFile(found.key, path, maxBytes)
    if (size === null) return 'too-big'
    if (size === 0) return 'missing'
    return await use(path, size)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

/**
 * Read a PDF, an office document or an archive's table of contents from OUR
 * shelf. Never throws: every way it can fail is a reason the caller can say
 * out loud.
 */
export async function readShelfExtracted(
  url: string,
  name: string | null,
  mime: string | null
): Promise<Extracted> {
  const format = documentFormat(mime, name)
  if (!format) return { ok: false, reason: 'damaged' }
  const ext = format === 'pdf' ? 'pdf' : extensionOf(name)
  try {
    const got = await withShelfFile(url, DOCUMENT_MAX_BYTES, async path => {
      if (format === 'pdf') return pdfTextFromFile(path)
      if (format === 'archive')
        return archiveListingFromFile(path, ext, String(name ?? 'archive'))
      return officeText(await readFile(path), ext)
    })
    if (got === 'missing' || got === 'too-big')
      return { ok: false, reason: got }
    return got
  } catch (e) {
    console.warn(
      `[media-extract] could not open ${String(name ?? '').slice(-60)}: ${String(e).slice(0, 160)}`
    )
    return { ok: false, reason: 'missing' }
  }
}
