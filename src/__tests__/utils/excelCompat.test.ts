import { describe, it, expect } from 'vitest'
import * as XLSX from '@/utils/excelCompat'

describe('excelCompat (xlsx -> exceljs shim)', () => {
  it('round-trips aoa + json sheets through a real xlsx buffer', async () => {
    const wb = XLSX.utils.book_new()
    const aoa = XLSX.utils.aoa_to_sheet([
      ['Name', 'Stars', 'Paid', 'When'],
      ['alice', 10, true, new Date('2026-01-02T00:00:00Z')],
      ['bob', 0.5, false, null],
    ])
    aoa['!cols'] = [{ wch: 20 }, { wch: 8 }]
    XLSX.utils.book_append_sheet(wb, aoa, '📊 Общая сводка')

    const json = XLSX.utils.json_to_sheet([
      { a: 1, b: 'x' },
      { b: 'y', c: 3 },
    ])
    XLSX.utils.book_append_sheet(wb, json, 'json')

    const buf = await XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    expect(Buffer.isBuffer(buf)).toBe(true)
    // xlsx is a zip: PK\x03\x04
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK')

    const back = await XLSX.read(buf)
    expect(back.SheetNames).toEqual(['📊 Общая сводка', 'json'])
    const rows = back.Sheets['📊 Общая сводка'].rows
    expect(rows[0]).toEqual(['Name', 'Stars', 'Paid', 'When'])
    expect(rows[1].slice(0, 3)).toEqual(['alice', 10, true])
    expect(rows[1][3]).toBeInstanceOf(Date)
    expect(rows[2].slice(0, 3)).toEqual(['bob', 0.5, false])

    // json_to_sheet: header = keys in first-seen order, missing -> empty
    const j = XLSX.utils.sheet_to_json(back.Sheets['json'])
    expect(j).toEqual([
      { a: 1, b: 'x', c: null },
      { a: null, b: 'y', c: 3 },
    ])
  })

  it('sanitises illegal / long / duplicate sheet names instead of throwing', () => {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([[1]])
    XLSX.utils.book_append_sheet(wb, ws, 'a/b:c?d*e[f]')
    XLSX.utils.book_append_sheet(wb, ws, 'a/b:c?d*e[f]')
    XLSX.utils.book_append_sheet(wb, ws, 'x'.repeat(40))
    XLSX.utils.book_append_sheet(wb, ws, '')
    expect(wb.SheetNames).toEqual([
      'a b c d e f',
      'a b c d e f (2)',
      'x'.repeat(31),
      'Sheet',
    ])
  })
})
