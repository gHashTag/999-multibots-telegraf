/**
 * THE WORDS INSIDE AN OFFICE FILE -- READ ON A BUDGET, IN A THREAD OF THEIR OWN.
 *
 * Word, Excel, PowerPoint and OpenDocument files are zipped XML, and RTF is
 * text with control words; everything here reads them with nothing but Node.
 * This module imports nothing else ON PURPOSE: it is the one module
 * `office-worker.mjs` loads, so the thread that parses a stranger's file
 * starts fast and holds nothing but that file.
 *
 * ── WHY A BUDGET (2026-09-22) ──────────────────────────────────────────────
 *
 * The first version capped each zip member at 16 MB and nothing else, and it
 * ran on the render server's one event loop. A review measured what that left
 * open: a 17 KB workbook naming one sheet two hundred times inflated that
 * sheet two hundred times and held the loop for 20 s (a 45 KB one, for
 * hours); a 0.8 MB deck of twenty slides built 39 million characters to keep
 * 4000 and held it for 46 s. And a 1 KB workbook whose shared strings never
 * close held it for 74 s, because a lazy `[\s\S]*?` hunting for a closing tag
 * that is not there rescans the rest of the file from every opening tag.
 * Every chat, upload and render waits while that happens.
 *
 * So four limits, one against each of those:
 *
 *   - a member is inflated ONCE, and the whole document draws on one budget
 *     (OFFICE_INFLATE_BUDGET); spending it is a refusal, `too-big`;
 *   - sheets and slides are visited once each, at most OFFICE_MAX_PARTS;
 *   - reading STOPS once there is more text than will ever be shown;
 *   - no pattern here can rescan: elements are found with `indexOf`, which
 *     gives up at the first missing closing tag, and every attribute scan
 *     stops at the next `<` as well as at `>`.
 *
 * And the parse itself runs in a worker thread with a deadline and a heap
 * ceiling (`officeTextIsolated` in media-extract.ts), so a bug left in THIS
 * file costs one thread, never the server.
 */

import { isUtf8 } from 'node:buffer'
import { inflateRawSync } from 'node:zlib'

/* ── results ────────────────────────────────────────────────────────────── */

export type ExtractFailure =
  /** A PDF with no text layer: a scan, or pictures of pages. */
  | 'no-text'
  | 'encrypted'
  /** Too big to open: over the byte ceiling, or too much packed inside. */
  | 'too-big'
  | 'damaged'
  /** The reader is not installed. Transient: the next deploy brings it. */
  | 'tool-missing'
  | 'missing'

export type Extracted =
  | {
      ok: true
      text: string
      /** How many characters were read, before the cap. */
      chars: number
      /** An archive: `text` is its table of contents, nothing was unpacked. */
      listing: boolean
      /**
       * Reading stopped before the end of the file, so `chars` counts what
       * was read, not what the file holds. Present only when true.
       */
      more?: true
    }
  | { ok: false; reason: ExtractFailure }

/** The same character cap every other document read here has. */
export const DOCUMENT_TEXT_CAP = 4000

/** Text in hand becomes a result; no text is `no-text`, not an empty read. */
export function extracted(
  full: string,
  listing = false,
  more = false
): Extracted {
  const text = full.trim()
  if (!text) return { ok: false, reason: listing ? 'damaged' : 'no-text' }
  return {
    ok: true,
    text: text.slice(0, DOCUMENT_TEXT_CAP),
    chars: text.length,
    listing,
    ...(more ? { more: true as const } : {}),
  }
}

/* ── the limits ─────────────────────────────────────────────────────────── */

/** One member is never inflated past this: the per-member zip-bomb ceiling. */
export const ZIP_ENTRY_MAX_BYTES = 16 * 1024 * 1024
/** Every member of ONE document together: the whole-document ceiling. */
export const OFFICE_INFLATE_BUDGET = 32 * 1024 * 1024
/**
 * A central directory is read this far and no further. A real deck of five
 * hundred slides, with its media and notes, has a few thousand members.
 */
export const ZIP_MAX_ENTRIES = 10_000
/** Sheets of a workbook, or slides of a deck, visited -- each once. */
export const OFFICE_MAX_PARTS = 50
/**
 * Reading stops past this many characters of layout (newlines and tabs that
 * `tidy` folds away), whatever the words count says: a file of nothing but
 * empty paragraphs must not be read to its end either.
 */
const GATHER_RAW_CAP = 256 * 1024
/** An OpenDocument body is read from its start up to this many characters. */
const ODF_BODY_MAX = 4 * 1024 * 1024
/** A spreadsheet row is read up to this column; past it, cells are dropped. */
const MAX_COLUMN = 50

/**
 * How much has been read, and whether it is enough. Words count toward what
 * will be shown; layout counts only toward the raw ceiling.
 */
class Enough {
  private words = 0
  private raw = 0
  /** Something was left unread. */
  more = false

  get done(): boolean {
    return this.words > DOCUMENT_TEXT_CAP || this.raw > GATHER_RAW_CAP
  }

  /** Count `piece` as read. False, and `more` set, once enough is read. */
  take(piece: string, words = true): boolean {
    if (words ? this.done : this.raw > GATHER_RAW_CAP) {
      this.more = true
      return false
    }
    this.raw += piece.length
    if (words) this.words += piece.length
    return true
  }
}

/* ── zip ────────────────────────────────────────────────────────────────── */

export interface ZipEntry {
  name: string
  size: number
  directory: boolean
  /** The member's bytes; null when encrypted, damaged or past the ceiling. */
  read(): Buffer | null
  /** The member's bytes under the caller's ceiling; `'over'` past it. */
  open(limit: number): Buffer | 'over' | null
}

export interface ZipDirectory {
  entries: ZipEntry[]
  /** The directory names more entries than `maxEntries`; the rest were not read. */
  truncated: boolean
}

const u16 = (b: Buffer, at: number) => b.readUInt16LE(at)
const u32 = (b: Buffer, at: number) => b.readUInt32LE(at)
const u64 = (b: Buffer, at: number) => Number(b.readBigUInt64LE(at))

const IBM866 = new TextDecoder('ibm866')

/**
 * A member's name. Checked, not attempted: a fatal decoder THROWS on every
 * name that is not UTF-8, and sixty-five thousand thrown errors took 2.5 s.
 */
function zipName(raw: Buffer, utf8Flag: boolean): string {
  if (utf8Flag || isUtf8(raw)) return raw.toString('utf8')
  /* Windows archivers write Cyrillic names in the DOS codepage. */
  return IBM866.decode(raw)
}

/**
 * The central directory of a zip, or null when the bytes are not one.
 *
 * Reads the directory at the END of the file, which is the authoritative list:
 * local headers can lie (streamed zips leave their sizes zero). ZIP64 is
 * followed for the sizes and offsets that overflow 32 bits. At most
 * `maxEntries` are read, and `truncated` says when there were more.
 */
export function readZipDirectory(
  bytes: Buffer,
  maxEntries = ZIP_MAX_ENTRIES
): ZipDirectory | null {
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
  let n = 0
  for (; n < count && n < maxEntries && at + 46 <= bytes.length; n += 1) {
    if (u32(bytes, at) !== 0x02014b50) {
      return entries.length ? { entries, truncated: false } : null
    }
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
    while (x + 4 <= xEnd && x + 4 <= bytes.length) {
      const id = u16(bytes, x)
      const len = u16(bytes, x + 2)
      if (id === 0x0001) {
        // Within the field AND within the file: a field may claim more.
        const fieldEnd = Math.min(x + 4 + len, bytes.length)
        let p = x + 4
        if (size === 0xffffffff && p + 8 <= fieldEnd)
          ((size = u64(bytes, p)), (p += 8))
        if (packed === 0xffffffff && p + 8 <= fieldEnd)
          ((packed = u64(bytes, p)), (p += 8))
        if (local === 0xffffffff && p + 8 <= fieldEnd) local = u64(bytes, p)
      }
      x += 4 + len
    }
    at = xEnd + commentLen
    const encrypted = (flags & 0x1) !== 0
    const open = (limit: number): Buffer | 'over' | null => {
      if (encrypted || local + 30 > bytes.length) return null
      if (u32(bytes, local) !== 0x04034b50) return null
      const start = local + 30 + u16(bytes, local + 26) + u16(bytes, local + 28)
      const data = bytes.subarray(start, start + packed)
      if (limit < 1) return 'over'
      // Stored: the bytes on disk ARE the member; judged by what is there,
      // not by the size the directory claims.
      if (method === 0) return data.length > limit ? 'over' : Buffer.from(data)
      if (method !== 8) return null
      try {
        return inflateRawSync(data, { maxOutputLength: limit })
      } catch (e) {
        return (e as NodeJS.ErrnoException).code === 'ERR_BUFFER_TOO_LARGE'
          ? 'over'
          : null
      }
    }
    entries.push({
      name,
      size,
      directory: name.endsWith('/'),
      open,
      read: () => {
        const got = open(ZIP_ENTRY_MAX_BYTES)
        return got === 'over' ? null : got
      },
    })
  }
  return { entries, truncated: n >= maxEntries && n < count }
}

/** The entries of a zip, or null when the bytes are not one. */
export function readZip(bytes: Buffer): ZipEntry[] | null {
  return readZipDirectory(bytes)?.entries ?? null
}

/** The whole-document budget ran out: the file is refused as `too-big`. */
class Spent extends Error {}

/**
 * The members of ONE document, each inflated at most once, all of them drawn
 * from one budget. A name repeated in the directory is the first of its name.
 */
class Members {
  private readonly byName = new Map<string, ZipEntry>()
  private readonly cache = new Map<string, string | null>()
  private left = OFFICE_INFLATE_BUDGET

  constructor(entries: ZipEntry[]) {
    for (const e of entries)
      if (!this.byName.has(e.name)) this.byName.set(e.name, e)
  }

  has(name: string): boolean {
    return this.byName.has(name)
  }

  names(): string[] {
    return [...this.byName.keys()]
  }

  /** The member as text, or null when there is none. Throws `Spent`. */
  text(name: string): string | null {
    if (this.cache.has(name)) return this.cache.get(name) ?? null
    const entry = this.byName.get(name)
    let out: string | null = null
    if (entry) {
      const got = entry.open(Math.min(ZIP_ENTRY_MAX_BYTES, this.left))
      if (got === 'over') throw new Spent()
      if (got) {
        this.left -= got.length
        out = got.toString('utf8')
      }
    }
    this.cache.set(name, out)
    return out
  }
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

/** What may follow a tag's name: `<c` is not `<cols`. */
const NAME_ENDS = new Set([0x20, 0x09, 0x0a, 0x0d, 0x2f, 0x3e])

/**
 * Every `<tag ...>inner</tag>` and `<tag .../>` in `xml`, in order.
 *
 * Found with `indexOf`, so each character is looked at a bounded number of
 * times, and the scan GIVES UP at the first opening tag with no closing one
 * after it -- where a lazy regex would retry from every later opening tag and
 * rescan the rest of the file each time. Same-name nesting is not followed;
 * no element read this way nests in itself.
 */
function* elements(
  xml: string,
  tag: string
): Generator<{ attrs: string; inner: string }> {
  const open = `<${tag}`
  const close = `</${tag}>`
  let at = 0
  for (;;) {
    const start = xml.indexOf(open, at)
    if (start < 0) return
    const nameEnd = start + open.length
    if (!NAME_ENDS.has(xml.charCodeAt(nameEnd))) {
      at = nameEnd
      continue
    }
    const gt = xml.indexOf('>', nameEnd)
    if (gt < 0) return
    if (xml.charCodeAt(gt - 1) === 0x2f) {
      yield { attrs: xml.slice(nameEnd, gt - 1), inner: '' }
      at = gt + 1
      continue
    }
    const end = xml.indexOf(close, gt + 1)
    if (end < 0) return
    yield { attrs: xml.slice(nameEnd, gt), inner: xml.slice(gt + 1, end) }
    at = end + close.length
  }
}

/** The text runs of a shared or inline string: `<t>` elements, concatenated. */
function runs(inner: string): string {
  let s = ''
  for (const t of inner.matchAll(/<t(?:\s[^<>]*)?>([^<]*)<\/t>/g)) s += t[1]
  return s
}

const byNumber = (a: string, b: string) =>
  Number(/(\d+)\.xml$/.exec(a)?.[1] ?? 0) -
  Number(/(\d+)\.xml$/.exec(b)?.[1] ?? 0)

/** Every attribute scan stops at `<` too, so a missing `>` cannot rescan. */
const DOCX_RUN =
  /<w:t(?:\s[^<>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\b[^<>]*\/>|<\/w:tc>|<\/w:p>/g

function docxText(z: Members, enough: Enough): string | null {
  const xml = z.text('word/document.xml')
  if (xml === null) return null
  let out = ''
  for (const m of xml.matchAll(DOCX_RUN)) {
    const words = m[1] !== undefined
    const piece = words
      ? xmlDecode(m[1])
      : m[0] === '<w:tab/>' || m[0] === '</w:tc>'
        ? '\t'
        : '\n'
    if (!enough.take(piece, words)) break
    out += piece
  }
  return tidy(out)
}

const PPTX_RUN = /<a:t>([^<]*)<\/a:t>|<a:br\/>|<\/a:p>/g

function pptxText(z: Members, enough: Enough): string | null {
  const slides = z
    .names()
    .filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort(byNumber)
  if (!slides.length) return null
  const parts: string[] = []
  for (const [i, name] of slides.entries()) {
    if (i >= OFFICE_MAX_PARTS || enough.done) {
      enough.more = true
      break
    }
    const xml = z.text(name) ?? ''
    let out = ''
    for (const m of xml.matchAll(PPTX_RUN)) {
      const words = m[1] !== undefined
      const piece = words ? xmlDecode(m[1]) : '\n'
      if (!enough.take(piece, words)) break
      out += piece
    }
    parts.push(`— slide ${i + 1} —\n${tidy(out)}`)
  }
  return parts.join('\n\n')
}

/** `C5` -> 2. Capped so one cell at XFD1 cannot spend the budget on tabs. */
function columnOf(ref: string): number {
  const letters = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? ''
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return Math.min(Math.max(0, n - 1), MAX_COLUMN)
}

function xlsxText(z: Members, enough: Enough): string | null {
  /*
   * Shared strings are parsed only as far as a cell asks for: a workbook's
   * table is in first-use order, so the first rows need its first entries.
   */
  const pending = elements(z.text('xl/sharedStrings.xml') ?? '', 'si')
  const shared: string[] = []
  const sharedAt = (i: number): string => {
    if (!Number.isInteger(i) || i < 0) return ''
    while (shared.length <= i) {
      const next = pending.next()
      if (next.done) return ''
      shared.push(xmlDecode(runs(next.value.inner)))
    }
    return shared[i]
  }
  // Sheets in the workbook's own order, with the names people gave them.
  const rels = new Map<string, string>()
  const relXml = z.text('xl/_rels/workbook.xml.rels') ?? ''
  for (const r of relXml.matchAll(/<Relationship\b[^<>]*>/g)) {
    const id = /\bId="([^"]+)"/.exec(r[0])?.[1]
    const target = /\bTarget="([^"]+)"/.exec(r[0])?.[1]
    if (id && target) rels.set(id, target.replace(/^\/?(xl\/)?/, 'xl/'))
  }
  const sheets: Array<{ name: string; path: string }> = []
  const paths = new Set<string>()
  const book = z.text('xl/workbook.xml') ?? ''
  for (const s of book.matchAll(/<sheet\b[^<>]*>/g)) {
    const name = /\bname="([^"]*)"/.exec(s[0])?.[1] ?? ''
    const rid = /\br:id="([^"]+)"/.exec(s[0])?.[1] ?? ''
    const path = rels.get(rid)
    // One sheet named twice is read once.
    if (!path || paths.has(path)) continue
    if (sheets.length >= OFFICE_MAX_PARTS) {
      enough.more = true
      break
    }
    paths.add(path)
    sheets.push({ name: xmlDecode(name), path })
  }
  if (!sheets.length) {
    const found = z
      .names()
      .filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
      .sort(byNumber)
    if (found.length > OFFICE_MAX_PARTS) enough.more = true
    found
      .slice(0, OFFICE_MAX_PARTS)
      .forEach((path, i) => sheets.push({ name: `Sheet${i + 1}`, path }))
  }
  if (!sheets.length) return null
  const parts: string[] = []
  for (const sheet of sheets) {
    if (enough.done) {
      enough.more = true
      break
    }
    const xml = z.text(sheet.path)
    if (xml === null) continue
    const rows: string[] = []
    for (const row of elements(xml, 'row')) {
      const cells: string[] = []
      for (const c of elements(row.inner, 'c')) {
        const attrs = c.attrs.slice(0, 512)
        const ref = /\br="([A-Z]+)\d+"/i.exec(attrs)?.[1] ?? ''
        const type = /\bt="([^"]+)"/.exec(attrs)?.[1] ?? ''
        const v = /<v>([^<]*)<\/v>/.exec(c.inner)?.[1]
        let value = ''
        if (type === 's' && v !== undefined) value = sharedAt(Number(v))
        else if (type === 'inlineStr') value = xmlDecode(runs(c.inner))
        else if (v !== undefined) value = xmlDecode(v)
        const col = ref ? columnOf(ref) : Math.min(cells.length, MAX_COLUMN)
        while (cells.length < col) cells.push('')
        cells[col] = value.replace(/[\t\n]+/g, ' ')
      }
      const line = cells.join('\t').replace(/\t+$/, '')
      if (!line.trim()) continue
      if (!enough.take(line)) break
      enough.take('\n', false)
      rows.push(line)
    }
    parts.push(`— ${sheet.name || 'sheet'} —\n${rows.join('\n')}`)
  }
  return parts.join('\n\n')
}

/** OpenDocument: one `content.xml` for text, spreadsheet and presentation. */
function odfText(z: Members, enough: Enough): string | null {
  const xml = z.text('content.xml')
  if (xml === null) return null
  // The first opening tag to the last closing one, found without a regex.
  const open = xml.indexOf('<office:body>')
  const close = xml.lastIndexOf('</office:body>')
  let body =
    open >= 0 && close > open
      ? xml.slice(open + '<office:body>'.length, close)
      : xml
  if (body.length > ODF_BODY_MAX) {
    body = body.slice(0, ODF_BODY_MAX)
    enough.more = true
  }
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
    .replace(/<draw:page\b[^<>]*>/g, '\n')
    .replace(/<[^<>]*>/g, '')
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

/** A control word and its argument, read in place (sticky): no slicing. */
const RTF_CONTROL = /([a-z]{1,32})(-?\d{1,10})? ?/iy

/**
 * The words of an RTF document. `\'hh` escapes are bytes in the document's
 * own codepage (`\ansicpg1251` for a Russian Word file), collected and
 * decoded together so a two-byte character is not split; `\uN` is Unicode
 * with a fallback that is skipped. Groups that are not text -- the font table,
 * pictures, anything marked `\*` -- are skipped whole. Reading stops once
 * there is more text than will be shown.
 */
export function rtfText(bytes: Buffer): string | null {
  return rtfWords(bytes, new Enough())
}

function rtfWords(bytes: Buffer, enough: Enough): string | null {
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
  let stop = false
  const flush = () => {
    if (!pending.length) return
    const piece = decoderFor(codepage).decode(Uint8Array.from(pending))
    pending = []
    if (!enough.take(piece)) {
      stop = true
      return
    }
    out += piece
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
    if (stop) return
    if (!enough.take(s, s !== '\n' && s !== '\t')) {
      stop = true
      return
    }
    out += s
  }
  while (i < src.length && !stop) {
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
      // A file of nothing but escapes must not pile up one array for all of it.
      if (pending.length >= 4096) flush()
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
    RTF_CONTROL.lastIndex = i + 1
    const m = RTF_CONTROL.exec(src)
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
  if (!stop) flush()
  return tidy(out)
}

/**
 * Text out of a Word, Excel, PowerPoint, OpenDocument or RTF file.
 *
 * Synchronous and bounded (see the header). The server does not call this on
 * its own event loop: it goes through `officeTextIsolated`, which runs it in
 * the worker thread.
 */
export function officeText(bytes: Buffer, ext: string): Extracted {
  const enough = new Enough()
  if (ext === 'rtf') {
    const text = rtfWords(bytes, enough)
    return text === null
      ? { ok: false, reason: 'damaged' }
      : extracted(text, false, enough.more)
  }
  const dir = readZipDirectory(bytes)
  if (!dir) return { ok: false, reason: 'damaged' }
  const z = new Members(dir.entries)
  if (z.has('EncryptedPackage')) return { ok: false, reason: 'encrypted' }
  try {
    const text =
      ext === 'docx'
        ? docxText(z, enough)
        : ext === 'xlsx'
          ? xlsxText(z, enough)
          : ext === 'pptx'
            ? pptxText(z, enough)
            : odfText(z, enough)
    return text === null
      ? { ok: false, reason: 'damaged' }
      : extracted(text, false, enough.more)
  } catch (e) {
    if (e instanceof Spent) return { ok: false, reason: 'too-big' }
    throw e
  }
}
