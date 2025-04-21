import { isValidImage } from '../../src/helpers/images/isValidImage'

describe('isValidImage', () => {
  it('returns true for JPEG header', async () => {
    // JPEG signature: [0xFF, 0xD8, 0xFF, ...]
    const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00])
    await expect(isValidImage(buffer)).resolves.toBe(true)
  })

  it('returns true for PNG header', async () => {
    // PNG signature: [0x89, 0x50, 0x4E, 0x47]
    const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0a])
    await expect(isValidImage(buffer)).resolves.toBe(true)
  })

  it('returns false for other header', async () => {
    const buffer = Buffer.from([0x00, 0x01, 0x02, 0x03])
    await expect(isValidImage(buffer)).resolves.toBe(false)
  })

  it('returns false on error', async () => {
    // @ts-ignore pass invalid type to force error
    await expect(isValidImage(null)).resolves.toBe(false)
  })
})
