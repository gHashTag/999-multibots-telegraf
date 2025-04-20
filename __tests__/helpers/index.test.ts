import * as helpers from '@/helpers'

describe('helpers index', () => {
  it('exports isDev flag and helper functions', () => {
    expect(helpers).toHaveProperty('isDev')
    expect(typeof helpers.isDev).toBe('boolean')
    expect(helpers).toHaveProperty('delay')
    expect(typeof helpers.delay).toBe('function')
    expect(helpers).toHaveProperty('deleteFile')
    expect(typeof helpers.deleteFile).toBe('function')
    expect(helpers).toHaveProperty('ensureDirectoryExistence')
    expect(typeof helpers.ensureDirectoryExistence).toBe('function')
    expect(helpers).toHaveProperty('pulse')
    expect(typeof helpers.pulse).toBe('function')
    expect(helpers).toHaveProperty('language')
    expect(typeof helpers.language).toBe('function')
    // images helpers
    expect(helpers).toHaveProperty('createImagesZip')
    expect(typeof helpers.createImagesZip).toBe('function')
    expect(helpers).toHaveProperty('isValidImage')
    expect(typeof helpers.isValidImage).toBe('function')
  })
})