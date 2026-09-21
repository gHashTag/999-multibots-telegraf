/**
 * REAL FILES, BUILT IN THE TEST.
 *
 * The readers in src/agent/media-extract.ts are only worth testing on real
 * bytes: a fixture that is "a zip-shaped object" proves the test's idea of a
 * zip, not Word's. So these build the actual formats -- a zip with its central
 * directory and CRCs, the XML parts Word, Excel, PowerPoint and LibreOffice
 * write, and a PDF with a real xref table -- small enough to read in a diff.
 */
import { crc32, deflateRawSync } from 'node:zlib'

export function zipOf(
  files: Record<string, string | Buffer>,
  opts: { store?: boolean } = {}
): Buffer {
  const locals: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.isBuffer(content)
      ? content
      : Buffer.from(content, 'utf8')
    const packed = opts.store ? data : deflateRawSync(data)
    const nameBytes = Buffer.from(name, 'utf8')
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x800, 6)
    local.writeUInt16LE(opts.store ? 0 : 8, 8)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(packed.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    locals.push(local, nameBytes, packed)
    const dir = Buffer.alloc(46)
    dir.writeUInt32LE(0x02014b50, 0)
    dir.writeUInt16LE(20, 4)
    dir.writeUInt16LE(20, 6)
    dir.writeUInt16LE(0x800, 8)
    dir.writeUInt16LE(opts.store ? 0 : 8, 10)
    dir.writeUInt32LE(crc, 16)
    dir.writeUInt32LE(packed.length, 20)
    dir.writeUInt32LE(data.length, 24)
    dir.writeUInt16LE(nameBytes.length, 28)
    dir.writeUInt32LE(offset, 42)
    central.push(dir, nameBytes)
    offset += 30 + nameBytes.length + packed.length
  }
  const dirBytes = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(Object.keys(files).length, 8)
  end.writeUInt16LE(Object.keys(files).length, 10)
  end.writeUInt32LE(dirBytes.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, dirBytes, end])
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function docxOf(paragraphs: string[]): Buffer {
  const body = paragraphs
    .map(p => `<w:p><w:r><w:t xml:space="preserve">${esc(p)}</w:t></w:r></w:p>`)
    .join('')
  return zipOf({
    '[Content_Types].xml': '<?xml version="1.0"?><Types/>',
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
  })
}

/** One sheet; strings go through the shared table, numbers stay inline. */
export function xlsxOf(
  sheetName: string,
  rows: Array<Array<string | number>>
): Buffer {
  const shared: string[] = []
  const cols = 'ABCDEFGHIJ'
  const rowXml = rows
    .map((row, r) => {
      const cells = row
        .map((v, c) => {
          const ref = `${cols[c]}${r + 1}`
          if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`
          shared.push(v)
          return `<c r="${ref}" t="s"><v>${shared.length - 1}</v></c>`
        })
        .join('')
      return `<row r="${r + 1}">${cells}</row>`
    })
    .join('')
  return zipOf({
    'xl/workbook.xml': `<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${esc(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels':
      '<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/sharedStrings.xml': `<sst>${shared.map(s => `<si><t>${esc(s)}</t></si>`).join('')}</sst>`,
    'xl/worksheets/sheet1.xml': `<worksheet><sheetData>${rowXml}</sheetData></worksheet>`,
  })
}

export function pptxOf(slides: string[]): Buffer {
  const files: Record<string, string> = {}
  slides.forEach((text, i) => {
    files[`ppt/slides/slide${i + 1}.xml`] =
      `<p:sld><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${esc(text)}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`
  })
  return zipOf(files)
}

export function odtOf(paragraphs: string[]): Buffer {
  const body = paragraphs.map(p => `<text:p>${esc(p)}</text:p>`).join('')
  return zipOf({
    mimetype: 'application/vnd.oasis.opendocument.text',
    'content.xml': `<office:document-content><office:body><office:text>${body}</office:text></office:body></office:document-content>`,
  })
}

/**
 * A one-page PDF with a real xref table. With `text` it carries a text layer
 * in Helvetica; with null it carries only a drawn line -- which is what a
 * scan looks like to a text extractor: a page with nothing to read.
 */
export function pdfOf(text: string | null): Buffer {
  const content =
    text === null
      ? '0 0 m 200 100 l S'
      : `BT /F1 18 Tf 20 100 Td (${text.replace(/[()\\]/g, '\\$&')}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}
