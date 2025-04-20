import { promises as fsPromises, existsSync } from 'fs'
import path from 'path'
import { createImagesZip } from '../../src/helpers/images/createImagesZip'

describe('createImagesZip helper', () => {
  const tmpDir = path.join(process.cwd(), 'tmp')
  beforeEach(async () => {
    // Clean tmp directory
    await fsPromises.rm(tmpDir, { recursive: true, force: true })
  })
  afterAll(async () => {
    // Cleanup
    await fsPromises.rm(tmpDir, { recursive: true, force: true })
  })

  it('creates a zip file containing provided images', async () => {
    const images = [
      { filename: 'test1.txt', buffer: Buffer.from('first') },
      { filename: 'test2.txt', buffer: Buffer.from('second') },
    ]
    const zipPath = await createImagesZip(images as any)
    expect(typeof zipPath).toBe('string')
    expect(existsSync(zipPath)).toBe(true)
    const stat = await fsPromises.stat(zipPath)
    expect(stat.isFile()).toBe(true)
    expect(stat.size).toBeGreaterThan(0)
  })
})