/**
 * excelCompat — thin replacement for the subset of the `xlsx` (SheetJS) API
 * that this codebase used, implemented on top of `exceljs`.
 *
 * Why: `xlsx@0.18.5` carries two unpatched high-severity advisories
 * (Prototype Pollution GHSA-4r6h-8v6p-xvw6, ReDoS GHSA-5pgg-2g8v-p4x9) and the
 * npm line is no longer maintained. `exceljs` was already a dependency.
 *
 * Supported surface (everything the repo called):
 *   utils.book_new()                    -> WorkBook
 *   utils.aoa_to_sheet(rows)            -> WorkSheet
 *   utils.json_to_sheet(objects)        -> WorkSheet (header = keys in first-seen order)
 *   utils.book_append_sheet(wb, ws, nm) -> void   (name sanitised to Excel rules)
 *   utils.sheet_to_json(ws)             -> object[]
 *   write(wb, { type: 'buffer' })       -> Promise<Buffer>   (xlsx was sync)
 *   writeFile(wb, path)                 -> Promise<void>     (xlsx was sync)
 *   read(buffer)                        -> Promise<WorkBook> (xlsx was sync)
 *   ws['!cols'] = [{ wch }]             -> column widths
 *
 * Behavioural differences vs xlsx, on purpose:
 *   - write/writeFile/read are async (exceljs streams); callers must await.
 *   - Illegal sheet names are sanitised instead of throwing; duplicates get a
 *     numeric suffix. Excel forbids `\\ / ? * [ ] :` and names > 31 chars.
 */

import ExcelJS from 'exceljs'

export type CellValue = string | number | boolean | Date | null | undefined

export interface ColInfo {
  /** width in characters (xlsx naming) */
  wch?: number
  /** width in characters (exceljs naming) */
  width?: number
}

export interface WorkSheet {
  rows: CellValue[][]
  '!cols'?: ColInfo[]
}

export interface WorkBook {
  SheetNames: string[]
  Sheets: Record<string, WorkSheet>
}

const ILLEGAL_SHEET_CHARS = /[\\/?*[\]:]/g
const MAX_SHEET_NAME = 31

export function sanitizeSheetName(name: string, taken: string[] = []): string {
  let base = String(name ?? '')
    .replace(ILLEGAL_SHEET_CHARS, ' ')
    .trim()
  if (base.length === 0) base = 'Sheet'
  base = Array.from(base).slice(0, MAX_SHEET_NAME).join('')
  if (!taken.includes(base)) return base
  for (let i = 2; ; i++) {
    const suffix = ` (${i})`
    const candidate =
      Array.from(base)
        .slice(0, MAX_SHEET_NAME - suffix.length)
        .join('') + suffix
    if (!taken.includes(candidate)) return candidate
  }
}

function book_new(): WorkBook {
  return { SheetNames: [], Sheets: {} }
}

function aoa_to_sheet(rows: CellValue[][]): WorkSheet {
  return { rows: rows.map(r => [...r]) }
}

function json_to_sheet<T extends Record<string, CellValue>>(
  objects: T[]
): WorkSheet {
  const header: string[] = []
  for (const obj of objects) {
    for (const key of Object.keys(obj)) {
      if (!header.includes(key)) header.push(key)
    }
  }
  const rows: CellValue[][] = [header]
  for (const obj of objects) {
    rows.push(header.map(k => obj[k]))
  }
  return { rows }
}

function book_append_sheet(wb: WorkBook, ws: WorkSheet, name?: string): void {
  const finalName = sanitizeSheetName(
    name ?? `Sheet${wb.SheetNames.length + 1}`,
    wb.SheetNames
  )
  wb.SheetNames.push(finalName)
  wb.Sheets[finalName] = ws
}

function sheet_to_json<T = Record<string, CellValue>>(ws: WorkSheet): T[] {
  const [header, ...body] = ws.rows
  if (!header) return []
  return body.map(row => {
    const obj: Record<string, CellValue> = {}
    header.forEach((h, i) => {
      obj[String(h)] = row[i]
    })
    return obj as T
  })
}

export const utils = {
  book_new,
  aoa_to_sheet,
  json_to_sheet,
  book_append_sheet,
  sheet_to_json,
}

function toExcelJs(wb: WorkBook): ExcelJS.Workbook {
  const out = new ExcelJS.Workbook()
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]
    const sheet = out.addWorksheet(name)
    for (const row of ws.rows) {
      sheet.addRow(row.map(v => (v === undefined ? null : v)))
    }
    const cols = ws['!cols']
    if (cols) {
      cols.forEach((c, i) => {
        const width = c.wch ?? c.width
        if (width !== undefined) sheet.getColumn(i + 1).width = width
      })
    }
  }
  return out
}

export interface WriteOptions {
  type?: 'buffer'
  bookType?: 'xlsx'
}

export async function write(
  wb: WorkBook,
  _opts: WriteOptions = { type: 'buffer', bookType: 'xlsx' }
): Promise<Buffer> {
  const data = await toExcelJs(wb).xlsx.writeBuffer()
  return Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer)
}

export async function writeFile(wb: WorkBook, filePath: string): Promise<void> {
  await toExcelJs(wb).xlsx.writeFile(filePath)
}

function fromExcelJsCell(v: ExcelJS.CellValue): CellValue {
  if (v === null || v === undefined) return null
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
    return v
  if (v instanceof Date) return v
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map(r => r.text).join('')
    if ('text' in v) return String(v.text)
    if ('result' in v) return fromExcelJsCell(v.result as ExcelJS.CellValue)
    if ('error' in v) return String(v.error)
  }
  return String(v)
}

export async function read(data: Buffer | ArrayBuffer): Promise<WorkBook> {
  const src = new ExcelJS.Workbook()
  // exceljs typings expect its own Buffer alias; runtime accepts Node Buffer / ArrayBuffer
  await src.xlsx.load(data as unknown as Parameters<typeof src.xlsx.load>[0])
  const wb = book_new()
  src.eachSheet(sheet => {
    const rows: CellValue[][] = []
    sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const values = row.values as ExcelJS.CellValue[]
      // exceljs row.values is 1-based and sparse; pad to the sheet width
      rows[rowNumber - 1] = Array.from({ length: sheet.columnCount }, (_, i) =>
        fromExcelJsCell(values[i + 1])
      )
    })
    for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = []
    wb.SheetNames.push(sheet.name)
    wb.Sheets[sheet.name] = { rows }
  })
  return wb
}

export default { utils, write, writeFile, read, sanitizeSheetName }
