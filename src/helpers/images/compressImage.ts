/**
 * Image Compression Helper
 *
 * Compresses images to reduce ZIP file size for model training uploads
 * Fixes 413 Request Entity Too Large error
 */

import sharp from 'sharp'

export interface CompressionOptions {
  maxWidth?: number
  maxHeight?: number
  quality?: number // 1-100
  format?: 'jpeg' | 'png' | 'webp'
}

const DEFAULT_OPTIONS: CompressionOptions = {
  maxWidth: 1024,
  maxHeight: 1024,
  quality: 85,
  format: 'jpeg',
}

/**
 * Compress image buffer to reduce size
 * @param buffer Original image buffer
 * @param options Compression options
 * @returns Compressed image buffer
 */
export async function compressImage(
  buffer: Buffer,
  options: CompressionOptions = {}
): Promise<Buffer> {
  try {
    const opts = { ...DEFAULT_OPTIONS, ...options }

    console.log('🗜️ [compressImage] Starting compression', {
      originalSize: buffer.length,
      options: opts,
    })

    let image = sharp(buffer)

    // Get metadata to check current dimensions
    const metadata = await image.metadata()
    console.log('📐 [compressImage] Image metadata', {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      originalSize: buffer.length,
    })

    // Resize if image is larger than max dimensions
    if (
      metadata.width &&
      metadata.height &&
      (metadata.width > (opts.maxWidth || 1024) ||
        metadata.height > (opts.maxHeight || 1024))
    ) {
      image = image.resize(opts.maxWidth, opts.maxHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      console.log('🔽 [compressImage] Resizing image', {
        from: `${metadata.width}x${metadata.height}`,
        to: `${opts.maxWidth}x${opts.maxHeight}`,
      })
    }

    // Convert to specified format with compression
    let compressedBuffer: Buffer

    switch (opts.format) {
      case 'jpeg':
        compressedBuffer = await image
          .jpeg({ quality: opts.quality, progressive: true })
          .toBuffer()
        break
      case 'png':
        compressedBuffer = await image
          .png({ compressionLevel: 9, progressive: true })
          .toBuffer()
        break
      case 'webp':
        compressedBuffer = await image
          .webp({ quality: opts.quality })
          .toBuffer()
        break
      default:
        compressedBuffer = await image
          .jpeg({ quality: opts.quality, progressive: true })
          .toBuffer()
    }

    const compressionRatio = (
      ((buffer.length - compressedBuffer.length) / buffer.length) *
      100
    ).toFixed(2)

    console.log('✅ [compressImage] Compression complete', {
      originalSize: buffer.length,
      compressedSize: compressedBuffer.length,
      savedBytes: buffer.length - compressedBuffer.length,
      compressionRatio: `${compressionRatio}%`,
    })

    return compressedBuffer
  } catch (error) {
    console.error('❌ [compressImage] Compression failed', { error })
    // Return original buffer if compression fails
    return buffer
  }
}

/**
 * Compress multiple images
 * @param buffers Array of image buffers
 * @param options Compression options
 * @returns Array of compressed image buffers
 */
export async function compressImages(
  buffers: Buffer[],
  options: CompressionOptions = {}
): Promise<Buffer[]> {
  console.log('🗜️ [compressImages] Starting batch compression', {
    count: buffers.length,
  })

  const compressed = await Promise.all(
    buffers.map(buffer => compressImage(buffer, options))
  )

  const totalOriginal = buffers.reduce((sum, buf) => sum + buf.length, 0)
  const totalCompressed = compressed.reduce((sum, buf) => sum + buf.length, 0)
  const totalSaved = totalOriginal - totalCompressed
  const totalRatio = ((totalSaved / totalOriginal) * 100).toFixed(2)

  console.log('✅ [compressImages] Batch compression complete', {
    count: compressed.length,
    totalOriginalSize: totalOriginal,
    totalCompressedSize: totalCompressed,
    totalSaved,
    compressionRatio: `${totalRatio}%`,
  })

  return compressed
}
