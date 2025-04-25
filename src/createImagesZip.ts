import AdmZip from 'adm-zip'
import { Buffer } from 'buffer'
import type { BufferType } from '@/interfaces/telegram-bot.interface'

/**
 * Creates a ZIP archive from an array of image buffers
 * @param {BufferType} images - Array of objects with image buffers and filenames
 * @returns {Buffer} - Buffer containing the ZIP archive
 */
export const createImagesZip = (images: BufferType): Buffer => {
  const zip = new AdmZip()
  
  // Add each image to the ZIP archive with its filename
  images.forEach((image, index) => {
    const filename = image.filename || `image_${index}.jpg`
    zip.addFile(filename, image.buffer)
  })
  
  // Return the ZIP archive as a buffer
  return zip.toBuffer()
} 