import { describe, it, expect } from '@jest/globals'
import * as imagesHelpers from '@/helpers/images'
import { createImagesZip } from '@/helpers/images/createImagesZip'
import { isValidImage } from '@/helpers/images/isValidImage'

describe('helpers/images index exports', () => {
  it('exports createImagesZip and isValidImage', () => {
    expect(imagesHelpers.createImagesZip).toBe(createImagesZip)
    expect(imagesHelpers.isValidImage).toBe(isValidImage)
  })
})