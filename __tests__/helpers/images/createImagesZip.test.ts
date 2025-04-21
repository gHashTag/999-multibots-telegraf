import * as fs from 'fs/promises'
import * as path from 'path'
import { createImagesZip } from '@/helpers/images/createImagesZip'

describe('createImagesZip', () => {
  const tmpDir = path.join(process.cwd(), 'tmp')

  afterAll(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true })
    } catch {}
  })

  test('creates zip with images', async () => {
    const images = [
      { filename: 'a.txt', buffer: Buffer.from('A') },
      { filename: 'b.txt', buffer: Buffer.from('B') },
    ]
    const zipPath = await createImagesZip(images)
    expect(zipPath.endsWith('.zip')).toBe(true)
    const stat = await fs.stat(zipPath)
    expect(stat.isFile()).toBe(true)
    expect(stat.size).toBeGreaterThan(0)
  })
})
